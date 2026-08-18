package contact

import (
	"strings"
	"time"
	"unicode/utf8"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/mail"
)

// verdict is what validation decides. Three outcomes, not two, because the
// build plan counts five answer paths and one of them is a refusal that must
// not look like one.
type verdict int

const (
	// accepted: store it and try to send it.
	accepted verdict = iota

	// rejected: 400 with one invalidParams entry per field.
	rejected

	// discarded: 202 with a receipt that leads nowhere. No row, no mail.
	//
	// The honeypot and the dwell floor both end here, and the contract uses the
	// same word for both: `company` "must be empty; anything else is discarded
	// silently", `dwellMs` "below 3000 is discarded". A 400 would tell a bot
	// which rule caught it, and it would be right once.
	discarded
)

// submission is a validated body: every field trimmed, every bound checked, and
// the two hashes' inputs settled. Nothing downstream re-checks it, so nothing
// downstream needs to know how a visitor spells things.
type submission struct {
	name     string
	email    string
	message  string
	dwellMs  int32
	clientTs time.Time
}

// validate applies every rule the contract states and two it does not.
//
// The first extra is the CRLF refusal. The contract bounds the length of an
// address and calls it `format: email`, neither of which stops a `\r\n` — and
// the address becomes a Reply-To header, where a line break is a second header
// written by a stranger. The name is checked for the same reason: it becomes
// the Subject. Appendix F of the build plan lists both.
//
// The second is that the address must survive net/mail's parser as a bare
// addr-spec. `format: email` is annotation, not validation; a generated client
// will happily send `"x" <y@z>` and every OpenAPI validator will pass it.
//
// The order of the returned params follows the order of the form, so the page
// can move focus to the first failing field without sorting anything.
func validate(body httpx.ContactRequest, now time.Time) (submission, verdict, []httpx.InvalidParam) {
	// The two silent refusals come first and short-circuit everything. There is
	// no point telling a bot that its message was also too short, and there is
	// no point spending a database round trip on it.
	if discardReason(body) != "" {
		return submission{}, discarded, nil
	}

	var invalid []httpx.InvalidParam
	fail := func(name, reason string) {
		invalid = append(invalid, httpx.InvalidParam{Name: name, Reason: reason})
	}

	name := strings.TrimSpace(body.Name)
	switch {
	case containsControl(name):
		// Never echoed back. The reason a visitor sees is about the shape of
		// what they sent, never a copy of it — a problem document that quotes
		// attacker input is a reflection vector looking for a renderer.
		fail("name", "must not contain line breaks or control characters")
	case utf8.RuneCountInString(name) < minName:
		fail("name", "at least 2 characters")
	case utf8.RuneCountInString(name) > maxName:
		fail("name", "at most 80 characters")
	}

	email := strings.TrimSpace(string(body.Email))
	switch {
	case email == "":
		fail("email", "required")
	case len(email) > maxEmail:
		// Counted in bytes, not runes: 254 is the octet limit of an address in
		// RFC 5321, and the database column agrees with it in octets.
		fail("email", "at most 254 characters")
	case !deliverable(email):
		// net/mail accepts `anna@example`, and it is right to: a domain without
		// a dot is a valid addr-spec and `root@localhost` is a real address on
		// somebody's machine. It is not a real address on the internet, and the
		// only thing this form does with one is put it in a Reply-To that
		// bounces. The contact page applies the same rule before it sends.
		//
		// One reason for every way an address can be wrong, and the reason never
		// quotes what was sent.
		fail("email", "not a plain mail address")
	}

	message := strings.TrimSpace(body.Message)
	switch {
	case utf8.RuneCountInString(message) < minMessage:
		fail("message", "at least 20 characters")
	case utf8.RuneCountInString(message) > maxMessage:
		fail("message", "at most 4000 characters")
	}

	// A timestamp far outside any plausible clock is not a double-click key, it
	// is something to keep out of a timestamptz column. See maxClockSkew for why
	// the window is loose rather than tight.
	if body.Ts.IsZero() || absDuration(now.Sub(body.Ts)) > maxClockSkew {
		fail("ts", "not a plausible timestamp")
	}

	// The column is `integer`. A body that overflows it would be refused by
	// Postgres with a message nobody can act on, three layers away from here.
	if body.DwellMs > maxInt32 {
		fail("dwellMs", "implausibly large")
	}

	if len(invalid) > 0 {
		return submission{}, rejected, invalid
	}

	return submission{
		name:     name,
		email:    email,
		message:  message,
		dwellMs:  int32(body.DwellMs),
		clientTs: body.Ts.UTC(),
	}, accepted, nil
}

// discardReason names the silent rule that caught a submission, or "" if none
// did. It is the rule itself and not a copy of it: the log line that says which
// trap fired asks this function, so the two cannot come to disagree about what
// a honeypot is.
//
// company is compared untrimmed. A field a human never sees should be exactly
// the empty string, and a browser that sends a space to a hidden input is doing
// something worth refusing.
func discardReason(body httpx.ContactRequest) string {
	switch {
	case body.Company != "":
		return "honeypot"
	case body.DwellMs < minDwell:
		return "dwell"
	default:
		return ""
	}
}

const maxInt32 = 1<<31 - 1

// deliverable holds an address to two rules: net/mail's, and the one net/mail
// has no opinion about.
//
// The first is mail.BareAddress — an addr-spec with no display name, no second
// recipient and no line break. It is the same function internal/config applies
// to SMTP_USERNAME and internal/mail applies again at send time, so there is one
// answer to "what is an address" rather than three.
//
// The second is that the domain has a dot and a last label that looks like a
// public suffix. That is not RFC 5322, deliberately: what this endpoint needs is
// an address a reply can reach, and the two are not the same question.
func deliverable(address string) bool {
	if _, err := mail.BareAddress(address); err != nil {
		return false
	}

	at := strings.LastIndex(address, "@")
	domain := address[at+1:]

	// A bracketed address literal — anna@[192.0.2.1] — parses and is
	// technically deliverable, and is also never what a visitor meant to type.
	dot := strings.LastIndex(domain, ".")
	if dot <= 0 || dot == len(domain)-1 {
		return false
	}

	tld := domain[dot+1:]
	if len(tld) < 2 {
		return false
	}
	for _, r := range tld {
		if !(r >= 'a' && r <= 'z') && !(r >= 'A' && r <= 'Z') {
			// Punycode, so an internationalised domain arrives here as xn--…
			// and passes; anything else is not a top-level domain.
			return false
		}
	}
	return true
}

// containsControl refuses anything that is not printable text.
//
// Wider than a CR/LF check, and cheaply so. What has to be kept out of a header
// is a line break, but U+2028, U+2029 and NUL are line breaks or terminators to
// some parser somewhere, and a name containing a bare escape character is not a
// name. mail.Build refuses these a second time; this is the layer that can say
// which field it was.
func containsControl(s string) bool {
	for _, r := range s {
		if r == '\u2028' || r == '\u2029' {
			return true
		}
		// C0 and C1, tab included: a tab in a Subject folds the header.
		if r < 0x20 || (r >= 0x7f && r <= 0x9f) {
			return true
		}
	}
	return false
}

func absDuration(d time.Duration) time.Duration {
	if d < 0 {
		return -d
	}
	return d
}
