// Package uptime replays the outage log that is kept outside this host, and
// turns it back into the observations this host could not make about itself.
//
// Handbook chapter 8, and the reason POST /api/internal/probe exists at all: a
// host cannot report its own outage. While this one answers, a workflow that
// runs somewhere else reports every five minutes and internal/intake appends a
// row with origin='probe'. While it does not answer, the same workflow appends
// a line to uptime-log.txt on the ops-data branch — a place that does not die
// with the machine — and this package replays those lines once the machine is
// back.
//
// THE FILE HOLDS TRANSITIONS, NOT CHECKS. Two lines per outage, where the
// roll-up wants one row per five minutes. Expanding the interval here instead
// of committing 288 lines a day is ADR 0038's first decision, and it is the
// reason every row this package writes carries origin='backfill' and a
// source_ref: a derived row says that it is derived, and names the commit it
// was derived from.
//
// Nothing in this file reaches the network or Postgres. parse and observations
// are functions over bytes and time, so the grammar is provable without either.
package uptime

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
)

// The stamp layout, spelled with a literal Z rather than time.RFC3339.
//
// RFC3339 also accepts "+02:00" and fractional seconds, and both would parse
// into a correct instant — so this is not about reading a wrong time, it is
// about a second way to write the same one. Two spellings of one stamp make a
// diff that looks like a change, and a file two programs append to has enough
// ways to disagree already.
const stampLayout = "2006-01-02T15:04:05Z"

// What one read may hand to the parser.
//
// The same stance as maxBodyBytes in internal/intake, for the same reason: the
// document is small and known, so a bound costs nothing and its absence is an
// invitation. A file that breaks one of these is a fault, not a longer history
// — nothing is read out of it at all.
const (
	maxBytes     = 1 << 20 // ~20k lines of ~50 bytes, with room
	maxLines     = 20_000
	maxLineBytes = 4096
)

// The closed vocabulary of a `down` line. This is a PII decision, not tidiness.
//
// A curl error text carries the address it could not reach — "connect to
// 203.0.113.7 port 443 failed". uptime-log.txt is public, and the privacy page
// of this site promises that no raw address is kept. F1a found exactly this
// leak in mail/smtp.go, where an SMTP rejection quoted the recipient into a log
// line under a comment that already said not to.
//
// So the prober MAPS a curl exit code to one of these and never quotes one. The
// parser holds the same list, which is what turns the promise into something
// checkable from this side rather than trusted from the other: a line carrying
// anything else is rejected, and the whole file with it.
var reasons = map[string]struct{}{
	"dns failure":     {},
	"connect refused": {},
	"connect timeout": {},
	"tls failure":     {},
	"http 5xx":        {},
	"http 4xx":        {},
	"api unreachable": {},
}

// transition is one line: the instant the prober saw the state change, and what
// it changed to.
type transition struct {
	at     time.Time
	up     bool
	reason string // set when up is false, empty otherwise
}

// parse reads the whole log and returns its transitions in file order.
//
// It is strict everywhere, and the reason is that the writer is a machine. A
// tolerant parser turns a corrupted file into a shorter one, and a shorter
// outage log is a claim that the site was up. Anything this function does not
// understand is therefore an error over the WHOLE file, never a skipped line.
//
// The rules, in the order a line meets them:
//
//   - `#` opens a comment; the file carries exactly one, its header
//   - fields are tab separated — two for `up`, three for `down`
//   - the stamp is UTC, whole seconds, literal Z, and strictly increasing
//   - states alternate, and the first one is `down`
//   - a reason belongs to `down` alone, out of the closed vocabulary above
//
// "The first one is down" is the initial state written as a rule. Before the
// first line there was no outage — the log opens empty and its first entry is
// the first real one (ADR 0038) — so a file that opens with `up` is either
// missing its beginning or announces a recovery from nothing.
func parse(r io.Reader) ([]transition, error) {
	// LimitedReader rather than a length check: the caller streams a response
	// body, and asking it how long it is would mean trusting Content-Length.
	limited := &io.LimitedReader{R: r, N: maxBytes + 1}

	sc := bufio.NewScanner(limited)
	sc.Buffer(make([]byte, 0, maxLineBytes), maxLineBytes)

	var (
		out  []transition
		last transition
		seen bool
		n    int
	)

	for sc.Scan() {
		n++
		if n > maxLines {
			return nil, fmt.Errorf("the log is longer than %d lines", maxLines)
		}

		line := sc.Text()
		if strings.HasPrefix(line, "#") {
			continue
		}

		next, err := parseLine(line)
		if err != nil {
			return nil, fmt.Errorf("line %d: %w", n, err)
		}

		switch {
		case !seen && next.up:
			return nil, fmt.Errorf(
				"line %d: the log opens with up, and the state before the first line is already up", n)

		case seen && next.up == last.up:
			return nil, fmt.Errorf("line %d: %s follows %s, and the states have to alternate",
				n, stateName(next.up), stateName(last.up))

		case seen && !next.at.After(last.at):
			return nil, fmt.Errorf("line %d: %s does not come after %s, and the stamps have to increase",
				n, next.at.Format(stampLayout), last.at.Format(stampLayout))
		}

		out = append(out, next)
		last, seen = next, true
	}

	switch err := sc.Err(); {
	case errors.Is(err, bufio.ErrTooLong):
		return nil, fmt.Errorf("line %d is longer than %d bytes", n+1, maxLineBytes)
	case err != nil:
		return nil, fmt.Errorf("reading the log: %w", err)
	}

	// N reaches zero only when the reader gave up its whole budget, which is one
	// byte more than the limit allows.
	if limited.N == 0 {
		return nil, fmt.Errorf("the log is larger than %d bytes", maxBytes)
	}

	return out, nil
}

// parseLine reads one line without looking at the ones around it. Order matters
// against a hostile file: the field count is settled before any field is read.
//
// Every value that reaches an error message goes through %q. The file is public
// and machine written, so a line could carry control characters, and %q escapes
// them — the same argument logx.StripControl makes for the values F1a routed
// through it, applied one layer earlier.
func parseLine(line string) (transition, error) {
	if line == "" {
		return transition{}, errors.New("the line is empty")
	}

	fields := strings.Split(line, "\t")
	if len(fields) < 2 || len(fields) > 3 {
		return transition{}, fmt.Errorf(
			"want 2 tab separated fields for up or 3 for down, got %d — %q", len(fields), line)
	}

	at, err := time.Parse(stampLayout, fields[0])
	if err != nil {
		return transition{}, fmt.Errorf("%q is not a stamp of the form %s", fields[0], stampLayout)
	}

	// The layout does not carry the rule on its own, and finding that out cost a
	// red test: time.Parse accepts a fractional second after the seconds field
	// EVEN WHEN the layout has none — it is documented, and it is the one place
	// Go is lenient here. "09:15:00.123Z" parsed cleanly and then formatted back
	// as "09:15:00Z", so the log would have held a spelling this parser claims to
	// reject and the round trip would have been silently lossy.
	//
	// Comparing the formatted stamp against the field is the whole rule in one
	// line: exactly one spelling survives, whatever else time.Parse is willing
	// to forgive.
	if at.Format(stampLayout) != fields[0] {
		return transition{}, fmt.Errorf("%q is not a stamp of the form %s", fields[0], stampLayout)
	}

	switch fields[1] {
	case "up":
		if len(fields) != 2 {
			return transition{}, fmt.Errorf(
				"an up line carries no reason, and this one carries %q — only an outage has one", fields[2])
		}
		return transition{at: at, up: true}, nil

	case "down":
		if len(fields) != 3 {
			return transition{}, errors.New("a down line has to name its reason")
		}
		if _, ok := reasons[fields[2]]; !ok {
			return transition{}, fmt.Errorf("%q is not one of the reasons the prober may write", fields[2])
		}
		return transition{at: at, up: false, reason: fields[2]}, nil

	default:
		return transition{}, fmt.Errorf("%q is neither up nor down", fields[1])
	}
}

// stateName exists so an error message reads in the same words as the file it
// is complaining about.
func stateName(up bool) string {
	if up {
		return "up"
	}
	return "down"
}
