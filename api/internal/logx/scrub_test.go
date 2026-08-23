package logx

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"testing"
	"time"
)

// The line this package exists for.
//
// internal/mail/smtp.go builds it: fmt.Errorf("%w: %d %s", ErrPermanent,
// protocol.Code, oneLine(protocol.Msg)) — where protocol.Msg is up to 200
// characters of whatever the relay said. internal/contact/dispatch.go logs it
// as "err". The comment directly above that call already says "never the
// address"; the address arrives anyway, because it is inside somebody else's
// sentence rather than in a field this service chose.
func TestTheRelaysRefusalLosesTheAddress(t *testing.T) {
	relay := "the mail provider refused the message permanently: " +
		"550 5.1.1 <visitor@example.com>: Recipient address rejected: User unknown"

	got := Scrub(relay)

	if strings.Contains(got, "visitor@example.com") {
		t.Fatalf("the address survived:\n%s", got)
	}
	if !strings.Contains(got, redactedEmail) {
		t.Errorf("no marker, so nobody can tell filtering happened:\n%s", got)
	}
	// The reason has to survive, or the line stops being worth writing.
	for _, keep := range []string{"550", "5.1.1", "Recipient address rejected", "User unknown"} {
		if !strings.Contains(got, keep) {
			t.Errorf("lost %q, which is the half that explains the failure:\n%s", keep, got)
		}
	}
}

func TestEmailAddressesAreRemoved(t *testing.T) {
	cases := []struct{ name, in string }{
		{"bare", "a@b.tld"},
		{"angle brackets", "<someone@example.com>"},
		{"in a sentence", "could not reach tim.seil@sub.domain.co.uk today"},
		{"plus tag", "contact+form@timseil.dev"},
		{"trailing sentence dot", "the recipient was a@b.com."},
		{"uppercase", "A.Person@Example.COM"},
		{"two of them", "from a@b.tld to c@d.tld"},
		{"digits", "user123@host9.io"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Scrub(tc.in)
			if strings.Contains(got, "@") && !strings.Contains(got, redactedEmail) {
				t.Errorf("an @ survived unredacted: %q → %q", tc.in, got)
			}
			for _, frag := range []string{"example.com", "b.tld", "timseil.dev", "sub.domain.co.uk"} {
				if strings.Contains(tc.in, "@"+frag) && strings.Contains(got, frag) {
					t.Errorf("the domain survived: %q → %q", tc.in, got)
				}
			}
		})
	}
}

func TestIPAddressesAreRemoved(t *testing.T) {
	cases := []struct{ name, in string }{
		{"ipv4", "peer 203.0.113.7 refused"},
		{"ipv4 loopback", "127.0.0.1"},
		{"ipv4 with port", "dial tcp 203.0.113.7:5432: connection refused"},
		{"ipv6", "2001:db8::8a2e:370:7334"},
		{"ipv6 loopback", "listening on ::1"},
		{"ipv6 bracketed with port", "dial tcp [2001:db8::1]:8080: timeout"},
		{"cidr-ish", "not in 198.51.100.0"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Scrub(tc.in)
			if !strings.Contains(got, redactedIP) {
				t.Errorf("no address found in %q → %q", tc.in, got)
			}
			for _, frag := range []string{"203.0.113.7", "127.0.0.1", "2001:db8", "198.51.100.0"} {
				if strings.Contains(tc.in, frag) && strings.Contains(got, frag) {
					t.Errorf("the address survived: %q → %q", tc.in, got)
				}
			}
		})
	}
}

// The other half of the promise, and the half a regular expression gets wrong.
// A filter that eats the values this service logs on purpose is a filter that
// gets switched off.
func TestWhatMustSurviveUntouched(t *testing.T) {
	cases := []struct{ name, in string }{
		// middleware/logging.go writes this on every single line.
		{"the client hash", "a3f19c02be74dd58"},
		// reqid.New, 32 hex characters. It is what a visitor quotes.
		{"a request id", "0a3ea5d8730791a5e0f0b02ae6e2687f"},
		{"a trace id", "4bf92f3577b34da6a3ce929d0e0e4736"},
		{"a timestamp", "2026-08-23T11:19:35.215Z"},
		{"a clock time", "started at 11:19:35 and ended at 11:19:41"},
		{"a duration", "the request ran 1.523s past its deadline"},
		{"a version", "v0.1.0"},
		{"a semver with build", "1.2.3-rc.1"},
		{"a path", "/api/systems/timseil-dev"},
		{"a percentage", "disk at 71.4%"},
		{"an ordinary sentence", "the ops roll-up failed"},
		{"a status line", "550 5.1.1 permanent failure"},
		{"an email-ish word", "user@localhost"},
		{"a go type", "&contact.Handler{...}"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Scrub(tc.in); got != tc.in {
				t.Errorf("redacted something that had to stay:\n  in:  %q\n  out: %q", tc.in, got)
			}
		})
	}
}

func TestErrorValuesAreFiltered(t *testing.T) {
	err := fmt.Errorf("outer: %w", errors.New("550 <a@b.tld> rejected from 203.0.113.7"))

	got := scrubValue(anyValue(err))

	s := got.String()
	if strings.Contains(s, "a@b.tld") || strings.Contains(s, "203.0.113.7") {
		t.Errorf("an error carried both past the filter: %q", s)
	}
	if !strings.Contains(s, "outer:") {
		t.Errorf("the wrapping was lost: %q", s)
	}
}

// A string with none of the three trigger characters takes the early return.
// Worth a test because that branch is the one every line in the service hits.
func TestAPlainMessageIsReturnedUnchanged(t *testing.T) {
	const msg = "recovered from a panic"
	if got := Scrub(msg); got != msg {
		t.Errorf("got %q", got)
	}
}

// The three lines CodeQL raised go/log-injection on, by their real shapes.
// All three predate F1a; the diff only moved them to the Context variants, and
// CodeQL reports on changed lines. They were false positives — the JSON handler
// escapes a newline and the line stays one line — but "the encoder happens to
// escape it" is a guarantee in a different file from the value it protects, and
// F2 puts a new writer at the end of the pipe.
func TestAValueFromARequestCannotWriteASecondLine(t *testing.T) {
	cases := []struct{ name, in string }{
		// middleware/bearer.go and httpx/problem.go log r.URL.Path. A raw
		// newline cannot survive HTTP framing, but %0A decodes into it.
		{"path with a forged entry", "/api/x\n{\"level\":\"ERROR\",\"msg\":\"FORGED\"}"},
		{"path with a carriage return", "/api/x\r\nSet-Cookie: a=b"},
		// intake.go logs report.Sha. checkSHA already refuses anything but
		// lowercase hex; this asserts the second line of defence, not the first.
		{"sha with a newline", "deadbeef\nlevel=ERROR"},
		{"a tab", "/api/x\tvalue"},
		{"a DEL byte", "/api/x\x7fvalue"},
		{"a NUL byte", "/api/x\x00value"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Scrub(tc.in)
			if strings.ContainsAny(got, "\r\n\t\x00\x7f") {
				t.Errorf("a control byte survived: %q → %q", tc.in, got)
			}
			// One byte, one space — CRLF becomes two. Offsets in the value
			// stay where they were, which is what makes a scrubbed line still
			// comparable with the request it came from.
			if len(got) != len(tc.in) {
				t.Errorf("length changed: %q (%d) → %q (%d)", tc.in, len(tc.in), got, len(got))
			}
		})
	}
}

// A space rather than a deletion: two tokens run together read as one value
// that was never in the log.
func TestAStrippedControlByteLeavesAGap(t *testing.T) {
	if got := StripControl("alpha\nbeta"); got != "alpha beta" {
		t.Errorf("got %q, want %q", got, "alpha beta")
	}
}

// Multi-byte UTF-8 must come through whole: every continuation byte is >= 0x80,
// so a byte-wise filter cannot cut a rune in half — asserted rather than argued.
func TestUnicodeSurvivesTheControlFilter(t *testing.T) {
	const in = "Grüße aus München — 日本語 — ✓"
	if got := Scrub(in); got != in {
		t.Errorf("mangled: %q → %q", in, got)
	}
}

// The exemption is about address SHAPE. It is not a key anyone may use to
// write a second line.
func TestAnExemptKeyStillLosesItsControlBytes(t *testing.T) {
	got := scrubAttr(slog.String("message_id", "msg_01M0@timseil.dev\n{\"msg\":\"FORGED\"}"))

	out := got.Value.String()
	if strings.ContainsAny(out, "\r\n") {
		t.Errorf("a control byte survived an exempt key: %q", out)
	}
	if !strings.Contains(out, "msg_01M0@timseil.dev") {
		t.Errorf("the exemption stopped working: %q", out)
	}
}

// anyValue builds the value kind internal/contact actually produces: an error
// handed to slog as a bare value, where the JSON handler renders Error().
func anyValue(v any) slog.Value { return slog.AnyValue(v) }

// Found by running the api, not by reading it: the contact form's Message-ID is
// an addr-spec, so the filter replaced it wholesale and the line came out
// saying "message_id":"redacted-email" — the exact opposite of what happened.
func TestAMessageIdIsNotMistakenForAnAddress(t *testing.T) {
	got := scrubAttr(slog.String("message_id", "msg_01M0PZS6ZY5TNKPW@timseil.dev"))

	if got.Value.String() != "msg_01M0PZS6ZY5TNKPW@timseil.dev" {
		t.Errorf("the message id was eaten: %q", got.Value.String())
	}
}

// The exemption is a claim about one key, not a hole anyone can widen by
// picking a name. A visitor's address under any other key is still removed.
func TestTheExemptionIsNarrow(t *testing.T) {
	for _, key := range []string{"email", "to", "reply_to", "err", "msg", "id"} {
		got := scrubAttr(slog.String(key, "anna@example.org"))
		if strings.Contains(got.Value.String(), "anna@example.org") {
			t.Errorf("key %q was treated as self-authored", key)
		}
	}
}

// addressesIn collects what the filter recognises, using the filter's own
// matchers. Circular on purpose: the promise is "what this recognises, it
// removes", and that is exactly what gets asserted below.
func addressesIn(s string) []string {
	var found []string
	for i := 0; i < len(s); {
		if runStart(s, i, isLocalByte) {
			if end, ok := matchEmail(s, i); ok {
				found = append(found, s[i:end])
				i = end
				continue
			}
		}
		if runStart(s, i, isAddrByte) {
			if end, ok := matchAddr(s, i); ok {
				found = append(found, s[i:end])
				i = end
				continue
			}
		}
		i++
	}
	return found
}

// The property, and it is NOT idempotence.
//
// Idempotence was the first thing asserted here, and it is not achievable — the
// fuzzer proved that twice from opposite directions and the second proof is the
// interesting one:
//
//	marker made of domain bytes    "0@::0.XA" → "0@redacted-ip.XA", and the
//	                               marker plus ".XA" then reads as a domain
//	marker wrapped in brackets     "0@0.AX[redacted-ip]", where the bracket ENDS
//	                               the domain scan and leaves "0.AX" looking
//	                               like one
//
// The two marker styles are duals: any text is either made of domain bytes and
// can join a domain, or is not and can end one. So a second pass may redact
// more than the first. That is a false positive on our own marker, not an
// address left behind — and this is the assertion that tells the two apart.
func FuzzScrubRemovesEveryAddressItCanSee(f *testing.F) {
	f.Add("550 <a@b.tld> from 203.0.113.7")
	f.Add("plain")
	f.Add("::1")
	f.Add("0@::0.XA")
	f.Add("00@0.AA@0.AA")
	f.Add("0@0.AX0.0.0.0")
	f.Add("::0X%::0")
	f.Add("0.0.0.0X0.0.0.00")

	f.Fuzz(func(t *testing.T, s string) {
		got := Scrub(s)

		// Rescan the OUTPUT, and fail only on an address whose exact text was
		// also in the input. Both halves of that are load-bearing.
		//
		// Rescanning the output is what catches something left behind:
		// "::0X%::0" came out as "redacted-ipX%::0" while a run-start
		// optimisation skipped the second "::0" entirely.
		//
		// Requiring the text to be in the input is what tolerates the marker
		// artefact described above: "0@::0.XA" comes out as
		// "0@redacted-ip.XA", which reads as an address on a rescan and is one
		// this filter built, not one it missed.
		for _, addr := range addressesIn(got) {
			if strings.Contains(s, addr) {
				t.Errorf("an address survived:\n  in:   %q\n  out:  %q\n  kept: %q", s, got, addr)
			}
		}
	})
}

// The cost of the shrinking loop in matchAddr, measured rather than asserted.
//
// Every line carries a request id and a trace id, and both are long hex runs.
// Without the "no dot, no colon" early-out each of them would cost one call
// into net/netip per length, which is the kind of price that only shows up in
// a profile after F2 has been running for a week.
func BenchmarkScrubTheLineEveryRequestWrites(b *testing.B) {
	const id = "0a3ea5d8730791a5e0f0b02ae6e2687f"
	b.ReportAllocs()
	for b.Loop() {
		Scrub(id)
	}
}

func BenchmarkScrubARelayRefusal(b *testing.B) {
	const msg = "the mail provider refused the message permanently: " +
		"550 5.1.1 <visitor@example.com>: Recipient address rejected: User unknown"
	b.ReportAllocs()
	for b.Loop() {
		Scrub(msg)
	}
}

func BenchmarkScrubAnOrdinaryPath(b *testing.B) {
	b.ReportAllocs()
	for b.Loop() {
		Scrub("/api/systems/timseil-dev")
	}
}

// A path a stranger chose, at the length a stranger may choose it.
//
// This is a regression test for a denial of service the fuzzer found in the
// filter itself: matchAddr used to try every length of every run, so a long run
// of colons and digits cost seconds inside the logger. r.URL.Path has no length
// limit worth relying on, so the input was reachable from outside.
//
// The budget is deliberately loose. It is not measuring speed; it is the
// difference between bounded work and quadratic work, and a regression to the
// latter takes minutes rather than the milliseconds this actually needs.
func TestALongAdversarialValueIsScrubbedInBoundedTime(t *testing.T) {
	const budget = 2 * time.Second
	adversarial := "/api/" + strings.Repeat(":4", 32*1024)

	done := make(chan string, 1)
	started := time.Now()
	go func() { done <- Scrub(adversarial) }()

	select {
	case got := <-done:
		if elapsed := time.Since(started); elapsed > budget {
			t.Errorf("took %s for %d bytes — the bound in matchAddr is gone",
				elapsed, len(adversarial))
		}
		if strings.ContainsAny(got, "\r\n") {
			t.Error("control bytes survived")
		}
	case <-time.After(budget):
		t.Fatalf("still running after %s for %d bytes — quadratic again",
			budget, len(adversarial))
	}
}

func BenchmarkScrubALongAdversarialPath(b *testing.B) {
	adversarial := "/api/" + strings.Repeat(":4", 4*1024)
	b.ReportAllocs()
	for b.Loop() {
		Scrub(adversarial)
	}
}
