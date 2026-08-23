package logx

import (
	"fmt"
	"log/slog"
	"net/netip"
	"strings"
)

// What a redacted value is replaced with. A marker rather than an empty string:
// "this line had an address and the address was removed" is a different fact
// from "this line had no address", and only the first one tells you the filter
// is working.
// The marker is built only from characters that may appear inside a domain, and
// it always contains a hyphen. That is not cosmetic, and the fuzzer is why it is
// written down: with brackets around it, redacting an address in the middle of a
// longer token ENDED the domain scan at the bracket and left the text before it
// looking like a valid domain — so a second pass redacted more than the first,
// and "what this function removes" depended on how often it had run. A marker
// the scanner reads straight through cannot move a boundary, and the hyphen
// keeps the result from ever being a well-formed suffix.
const (
	redactedEmail = "redacted-email"
	redactedIP    = "redacted-ip"
)

// Scrub removes control characters, email addresses and IP addresses from one
// string.
//
// Exported because the boundary is worth testing directly, and because F11 is
// told by the build plan to scrub frontend telemetry "wie F1" — when that
// arrives it should call this rather than write a second answer.
func Scrub(s string) string {
	return redactAddresses(StripControl(s))
}

// StripControl removes the bytes that let one log line pretend to be two.
//
// The JSON handler already escapes them, and that was measured rather than
// assumed: a newline in r.URL.Path comes out as an escape INSIDE the string and
// the line stays one line. So this is not what makes forging impossible today —
// it is what keeps it impossible when the writer changes. F2 sends these lines
// through Alloy into Loki and F11 adds a second producer, and "we are safe
// because of how the encoder at the bottom happens to behave" is a guarantee
// living in a different file from the values it protects.
//
// It also settles a recurring argument. CodeQL raises go/log-injection on every
// line that logs a value derived from a request — three of them on this
// service's own pre-existing code — and "the encoder escapes it" is an answer
// somebody has to derive again each time. Removing the characters is an answer
// that reads itself.
//
// A space, not a deletion: two tokens run together read as one value that was
// never there.
func StripControl(s string) string {
	if !hasControl(s) {
		return s
	}

	b := []byte(s)
	for i := range b {
		if isControl(b[i]) {
			b[i] = ' '
		}
	}
	return string(b)
}

func hasControl(s string) bool {
	for i := range len(s) {
		if isControl(s[i]) {
			return true
		}
	}
	return false
}

// isControl covers C0 and DEL. Multi-byte UTF-8 is left alone: every
// continuation byte is >= 0x80, so this cannot cut a rune in half.
func isControl(c byte) bool { return c < 0x20 || c == 0x7F }

// redactAddresses replaces every email and IP address in one left-to-right pass.
//
// ONE pass, and the fuzzer is why. Doing emails and then addresses as two
// separate sweeps was correct on every input anybody thought of and wrong on a
// shape nobody would: replacing an address could leave the marker sitting next
// to a domain, and that token then read as an address ITSELF on the next sweep.
// So the answer depended on how many times the function had run, and the first
// run had left part of an address standing. Two examples the fuzzer minimised
// down to, both real if contrived:
//
//	a@b.tld@c.tld   →  the second domain survived the first sweep
//	0@::0.XA        →  redacting the IPv6 built an email that was not there
//
// Walking once fixes the class rather than the two cases: what this writes is
// never read again, so no substitution can create a match.
//
// A match is only attempted at the START of a run. That keeps the scan linear
// and stops a suffix of a longer token from matching on its own.
func redactAddresses(s string) string {
	// The overwhelmingly common case is a line with none of this in it. One
	// pass to find out costs less than the walk below.
	if !strings.ContainsAny(s, "@.:") {
		return s
	}

	var b strings.Builder
	b.Grow(len(s))

	for i := 0; i < len(s); {
		if runStart(s, i, isLocalByte) {
			if end, ok := matchEmail(s, i); ok {
				b.WriteString(redactedEmail)
				i = end
				continue
			}
		}
		// No run-start guard on this one, and the fuzzer took it away: it
		// assumed that if the whole run fails to parse, no part of it can. That
		// is false. In "::0X%::0" the second run begins at '%', because '%' is
		// a legal zone separator — "%::0" does not parse, and the "::0" inside
		// it was never tried. An address survived in the output.
		//
		// The cost is a rescan from each position inside a run that failed, so
		// a run of n bytes is O(n²) in the worst case. The values reaching here
		// are bounded — a relay message is cut to 200 characters before it ever
		// becomes an error — and correctness is not the thing to trade for it.
		if end, ok := matchAddr(s, i); ok {
			b.WriteString(redactedIP)
			i = end
			continue
		}
		b.WriteByte(s[i])
		i++
	}

	return b.String()
}

// runStart reports whether i begins a run of bytes the predicate accepts.
//
// Safe for the email matcher and only for it: the local part is scanned
// greedily and the '@' after it sits at a fixed offset, so starting later can
// only shorten a match that would be found anyway. It is NOT safe for
// addresses — see redactAddresses.
func runStart(s string, i int, in func(byte) bool) bool {
	return in(s[i]) && (i == 0 || !in(s[i-1]))
}

// matchEmail reports how far an address starting at i reaches.
//
// Deliberately looser than RFC 5321. This is not validating an address somebody
// typed, it is finding one in a sentence somebody else's server wrote, and the
// cost of being wrong runs one way: a redacted token that was not an address is
// a small loss of detail, a missed address is a promise broken.
func matchEmail(s string, i int) (int, bool) {
	at := i
	for at < len(s) && isLocalByte(s[at]) {
		at++
	}
	// No local part, or no '@' after it.
	if at == i || at >= len(s) || s[at] != '@' {
		return 0, false
	}

	end := at + 1
	for end < len(s) && isDomainByte(s[end]) {
		end++
	}

	// An '@' right after the domain means the boundary was not clean —
	// "a@b.tld@c.tld". Swallow it and keep going rather than stop: consuming
	// one token too many costs a word, stopping early leaves half an address.
	for end < len(s) && s[end] == '@' {
		end++
		for end < len(s) && isDomainByte(s[end]) {
			end++
		}
	}

	// A trailing dot is punctuation, not domain: "…from a@b.tld." ends a
	// sentence.
	for end > at+1 && s[end-1] == '.' {
		end--
	}

	if !isDomainish(s[at+1 : end]) {
		return 0, false
	}
	return end, true
}

// matchAddr reports how far an IP address starting at i reaches.
//
// The candidate is cut out by shape and handed to net/netip rather than matched
// by a pattern. That is what keeps a timestamp out of it: "11:19:35" looks like
// an IPv6 address to a regular expression and does not parse as one.
//
// Longest first, then shorter — and that second half is not tidiness. The
// maximal run is often not an address while a prefix of it is: in "::0.::0" the
// whole run parses as nothing, and trying only the whole run left the leading
// "::0" in the output one byte at a time. The fuzzer found it; reading did not.
func matchAddr(s string, i int) (int, bool) {
	end := i
	for end < len(s) && isAddrByte(s[end]) {
		end++
	}
	if end == i {
		return 0, false
	}

	// An IPv4 needs a dot and an IPv6 needs a colon, so a run with neither
	// cannot contain either — and no prefix of it can. This is what keeps the
	// shrinking loop below off the values every line carries: a 32-character
	// request id is hex and nothing else, and it leaves here without a single
	// call into net/netip.
	if !strings.ContainsAny(s[i:end], ".:") {
		return 0, false
	}

	// The shrinking loop below is bounded, and the fuzzer is why it had to be.
	//
	// Without this, a run of n bytes costs n parses at each of n positions. A
	// 2700-character run of colons and digits took SEVEN SECONDS in the
	// logger — and r.URL.Path is not length-limited, so a stranger could have
	// spent this service's CPU by asking for a long enough path. The filter
	// that exists to protect the log would have been the way to stall it.
	//
	// Sixty-four is comfortably above the longest thing net/netip accepts that
	// this service can see: "[ffff:…:255.255.255.255]:65535" is 53 characters.
	// What it excludes is an IPv6 zone name longer than the address, and a
	// container talking to another container over TCP does not have one.
	if end > i+maxAddrLen {
		end = i + maxAddrLen
	}

	for ; end > i; end-- {
		if !worthParsing(s, i, end) {
			continue
		}

		token := s[i:end]
		if _, err := netip.ParseAddr(token); err == nil {
			return end, true
		}
		// "127.0.0.1:8080" and "[::1]:8080". The port goes with it: an address
		// is not less identifying for having one.
		if _, err := netip.ParseAddrPort(token); err == nil {
			return end, true
		}
	}

	return 0, false
}

// isDomainish rejects the half of the '@' cases that are not addresses: a
// domain needs a dot and a last label that reads like a suffix.
func isDomainish(domain string) bool {
	dot := strings.LastIndexByte(domain, '.')
	if dot < 1 || dot == len(domain)-1 {
		return false
	}
	tld := domain[dot+1:]
	if len(tld) < 2 {
		return false
	}
	for i := range len(tld) {
		c := tld[i]
		if (c < 'a' || c > 'z') && (c < 'A' || c > 'Z') {
			return false
		}
	}
	return true
}

func isLocalByte(c byte) bool {
	switch {
	case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
		return true
	}
	return strings.IndexByte(".!#$%&'*+/=?^_`{|}~-", c) >= 0
}

func isDomainByte(c byte) bool {
	switch {
	case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
		return true
	}
	return c == '.' || c == '-'
}

// worthParsing reports whether a candidate ending at end can be an address at
// all, so that the loop in matchAddr does not spend a parse on a length that
// cannot be one.
//
// A trailing dot is punctuation. A trailing colon is punctuation TOO — except
// when it is the second half of "::", which is IPv6 syntax and part of the
// address rather than after it. Skipping those left every address ending in a
// zero run standing: "peer 2001:db8:: is gone" came out of Scrub unchanged.
//
// The fuzzer could not have found this, and that is the part worth writing
// down. FuzzScrubRemovesEveryAddressItCanSee asks whether the filter still sees
// an address in its own output — so a candidate this matcher never looks at is
// one the property never asks about. The web port in F1b checks the output with
// net.isIP over every substring instead, which shares no code with the matcher,
// and it produced this input in three thousand random cases.
func worthParsing(s string, i, end int) bool {
	switch s[end-1] {
	case '.':
		return false
	case ':':
		return end-2 >= i && s[end-2] == ':'
	}
	return true
}

// maxAddrLen bounds one candidate. See matchAddr for what it costs and why.
const maxAddrLen = 64

// isAddrByte covers every byte that can appear in an IPv4 or IPv6 address, its
// zone, or a bracketed host:port.
func isAddrByte(c byte) bool {
	switch {
	case c >= '0' && c <= '9', c >= 'a' && c <= 'f', c >= 'A' && c <= 'F':
		return true
	}
	return c == '.' || c == ':' || c == '[' || c == ']' || c == '%'
}

// scrubValue walks one attribute value.
//
// Three kinds carry text and are handled; the rest are numbers, times and
// booleans, which cannot hold an address. A struct logged with slog.Any could,
// and is deliberately not walked — nothing in this service logs one, and a
// reflective walk of arbitrary values is a lot of machinery guarding a case
// that does not exist. If one appears, this is where it goes, and the ADR says
// so.
func scrubValue(v slog.Value) slog.Value { return walk(v, Scrub) }

// walk applies one string transform to every value that carries text.
func walk(v slog.Value, f func(string) string) slog.Value {
	switch v.Kind() {
	case slog.KindString:
		if s := f(v.String()); s != v.String() {
			return slog.StringValue(s)
		}
		return v

	case slog.KindGroup:
		attrs := v.Group()
		out := make([]slog.Attr, 0, len(attrs))
		changed := false
		for _, a := range attrs {
			next := a
			next.Value = walk(a.Value.Resolve(), f)
			if !next.Value.Equal(a.Value) {
				changed = true
			}
			out = append(out, next)
		}
		if !changed {
			return v
		}
		return slog.GroupValue(out...)

	case slog.KindAny:
		// The path that matters. internal/mail wraps the relay's own words into
		// an error, internal/contact logs that error, and a 550 from a relay
		// routinely quotes the address it refused. The value renders as its
		// Error() string, so that is what gets filtered.
		switch a := v.Any().(type) {
		case error:
			if s := f(a.Error()); s != a.Error() {
				return slog.StringValue(s)
			}
		case fmt.Stringer:
			if s := f(a.String()); s != a.String() {
				return slog.StringValue(s)
			}
		}
		return v
	}

	return v
}

// selfAuthored names the attribute keys whose values this service generates
// itself and whose shape it therefore knows.
//
// There is exactly one, and it was found by running the thing rather than by
// reasoning about it: an RFC 5322 Message-ID is an addr-spec — `msg_01M0PZ…@timseil.dev`
// — so it IS address-shaped, and the filter replaced the whole of it with the
// marker. The line that logs it exists to prove a message was assembled, and it
// was left saying that an address had been removed instead. A reader would have
// concluded the opposite of the truth.
//
// The entry is a claim about the VALUE, not a convenience for the key: this id
// is built in internal/contact from an identifier this service minted plus its
// own domain, and no part of it comes from a visitor. Adding a key here means
// making that claim again, and it is the kind of claim that gets a line in a
// review.
var selfAuthored = map[string]bool{"message_id": true}

func scrubAttr(a slog.Attr) slog.Attr {
	if selfAuthored[a.Key] {
		// Exempt from REDACTION, not from the filter. The entry above is a
		// claim about the SHAPE of the value and says nothing about control
		// characters — a key nobody may redact is still not a key anyone may
		// use to write a second line.
		a.Value = walk(a.Value.Resolve(), StripControl)
		return a
	}
	a.Value = scrubValue(a.Value.Resolve())
	return a
}
