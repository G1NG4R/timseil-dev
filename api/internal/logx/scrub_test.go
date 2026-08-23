package logx

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"testing"
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

func FuzzScrubNeverLeavesAnAddressBehind(f *testing.F) {
	f.Add("550 <a@b.tld> from 203.0.113.7")
	f.Add("plain")
	f.Add("::1")

	f.Fuzz(func(t *testing.T, s string) {
		got := Scrub(s)
		// Scrubbing twice must find nothing new. If it does, the first pass left
		// something behind that the second one recognised — which is exactly the
		// failure this package cannot have.
		if again := Scrub(got); again != got {
			t.Errorf("not idempotent:\n  in:   %q\n  once: %q\n  twice:%q", s, got, again)
		}
	})
}
