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

// Scrub removes email addresses and IP addresses from one string.
//
// Exported because the boundary is worth testing directly, and because F11 is
// told by the build plan to scrub frontend telemetry "wie F1" — when that
// arrives it should call this rather than write a second answer.
func Scrub(s string) string {
	// The overwhelmingly common case is a line with none of this in it. One
	// pass to find out costs less than the two scans below.
	if !strings.ContainsAny(s, "@.:") {
		return s
	}
	return scrubAddresses(scrubEmails(s))
}

// scrubEmails replaces anything shaped like an address around an '@'.
//
// Deliberately looser than RFC 5321. This is not validating an address a user
// typed, it is finding one in a sentence somebody else's server wrote, and the
// cost of being wrong runs one way: a redacted token that was not an address is
// a small loss of detail in a log line, a missed address is a promise broken.
func scrubEmails(s string) string {
	at := strings.IndexByte(s, '@')
	if at < 0 {
		return s
	}

	var b strings.Builder
	rest := s

	for {
		at = strings.IndexByte(rest, '@')
		if at < 0 {
			b.WriteString(rest)
			return b.String()
		}

		start := at
		for start > 0 && isLocalByte(rest[start-1]) {
			start--
		}

		end := at + 1
		for end < len(rest) && isDomainByte(rest[end]) {
			end++
		}
		// A trailing dot is punctuation, not part of the domain: "…from
		// a@b.tld." ends a sentence.
		for end > at+1 && rest[end-1] == '.' {
			end--
		}

		if start == at || !isDomainish(rest[at+1:end]) {
			// An '@' that is not an address after all — a rate-limit message,
			// a Go struct printed with %v. Keep it and carry on past it.
			b.WriteString(rest[:at+1])
			rest = rest[at+1:]
			continue
		}

		b.WriteString(rest[:start])
		b.WriteString(redactedEmail)
		rest = rest[end:]
	}
}

// scrubAddresses replaces anything the standard library agrees is an IP.
//
// Candidates are cut out by shape and then handed to net/netip, rather than
// matched by a pattern. That is what keeps a timestamp out of it: "11:19:35"
// looks like an IPv6 address to a regular expression and does not parse as one.
func scrubAddresses(s string) string {
	var b strings.Builder
	i := 0

	for i < len(s) {
		if !isAddrByte(s[i]) {
			b.WriteByte(s[i])
			i++
			continue
		}

		j := i
		for j < len(s) && isAddrByte(s[j]) {
			j++
		}
		// Trailing punctuation is not part of the address.
		for j > i && (s[j-1] == '.' || s[j-1] == ':') {
			j--
		}

		// The run was punctuation and nothing else — a lone dot between two
		// words. Emit it and move on; without this the index does not advance
		// and the scan never ends, which is a hang rather than a wrong answer
		// and so the more expensive of the two mistakes.
		if j == i {
			b.WriteByte(s[i])
			i++
			continue
		}

		token := s[i:j]
		if isAddress(token) {
			b.WriteString(redactedIP)
		} else {
			b.WriteString(token)
		}
		i = j
	}

	return b.String()
}

// isAddress reports whether the token is an IP address, with or without a port.
func isAddress(token string) bool {
	if _, err := netip.ParseAddr(token); err == nil {
		return true
	}
	// "127.0.0.1:8080" and "[::1]:8080". The port goes with it: an address is
	// not less identifying for having one.
	if _, err := netip.ParseAddrPort(token); err == nil {
		return true
	}
	return false
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
func scrubValue(v slog.Value) slog.Value {
	switch v.Kind() {
	case slog.KindString:
		if s := Scrub(v.String()); s != v.String() {
			return slog.StringValue(s)
		}
		return v

	case slog.KindGroup:
		attrs := v.Group()
		out := make([]slog.Attr, 0, len(attrs))
		changed := false
		for _, a := range attrs {
			s := scrubAttr(a)
			if !s.Value.Equal(a.Value) {
				changed = true
			}
			out = append(out, s)
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
			if s := Scrub(a.Error()); s != a.Error() {
				return slog.StringValue(s)
			}
		case fmt.Stringer:
			if s := Scrub(a.String()); s != a.String() {
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
		return a
	}
	a.Value = scrubValue(a.Value.Resolve())
	return a
}
