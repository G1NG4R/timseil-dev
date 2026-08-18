package contact

import (
	"strings"
	"testing"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// The validator, field by field.
//
// The handler tests next door prove the answers; this proves the boundaries, and
// it proves them on both sides. A rule tested only from the outside — "80
// characters is refused" — passes just as happily for a rule that refuses
// everything, so every bound here is checked at the value that must pass and at
// the value that must not.

func request(overrides func(*httpx.ContactRequest)) httpx.ContactRequest {
	body := httpx.ContactRequest{
		Name:    "Anna Keller",
		Email:   "anna@example.org",
		Message: "Hallo, ich hätte eine Frage zu einem der Systeme auf dieser Seite.",
		Company: "",
		DwellMs: 4200,
		Ts:      testNow,
	}
	if overrides != nil {
		overrides(&body)
	}
	return body
}

func TestTheFieldBoundsHoldOnBothSides(t *testing.T) {
	for _, tc := range []struct {
		name  string
		body  httpx.ContactRequest
		want  verdict
		field string
	}{
		{
			name: "a plain submission",
			body: request(nil),
			want: accepted,
		},
		{
			name:  "a name of one character",
			body:  request(func(b *httpx.ContactRequest) { b.Name = "A" }),
			want:  rejected,
			field: "name",
		},
		{
			name: "a name of exactly two",
			body: request(func(b *httpx.ContactRequest) { b.Name = "Jo" }),
			want: accepted,
		},
		{
			name: "a name of exactly eighty",
			body: request(func(b *httpx.ContactRequest) { b.Name = strings.Repeat("a", maxName) }),
			want: accepted,
		},
		{
			name:  "a name of eighty-one",
			body:  request(func(b *httpx.ContactRequest) { b.Name = strings.Repeat("a", maxName+1) }),
			want:  rejected,
			field: "name",
		},
		{
			// Runes, not bytes. Eighty umlauts are eighty characters to the
			// person typing them and a hundred and sixty octets to a length
			// check that counts wrong.
			name: "eighty non-ASCII characters",
			body: request(func(b *httpx.ContactRequest) { b.Name = strings.Repeat("ä", maxName) }),
			want: accepted,
		},
		{
			name: "a name that is only spaces",
			body: request(func(b *httpx.ContactRequest) { b.Name = "    " }),
			want: rejected, field: "name",
		},
		{
			name:  "a message of nineteen characters",
			body:  request(func(b *httpx.ContactRequest) { b.Message = strings.Repeat("x", minMessage-1) }),
			want:  rejected,
			field: "message",
		},
		{
			name: "a message of exactly twenty",
			body: request(func(b *httpx.ContactRequest) { b.Message = strings.Repeat("x", minMessage) }),
			want: accepted,
		},
		{
			name: "a message of exactly four thousand",
			body: request(func(b *httpx.ContactRequest) { b.Message = strings.Repeat("x", maxMessage) }),
			want: accepted,
		},
		{
			name:  "a message of four thousand and one",
			body:  request(func(b *httpx.ContactRequest) { b.Message = strings.Repeat("x", maxMessage+1) }),
			want:  rejected,
			field: "message",
		},
		{
			// Whitespace is trimmed before the minimum is applied, or a
			// thousand spaces would be a message.
			name:  "a message of spaces around nothing",
			body:  request(func(b *httpx.ContactRequest) { b.Message = strings.Repeat(" ", 100) }),
			want:  rejected,
			field: "message",
		},
		{
			name:  "an address with no domain dot",
			body:  request(func(b *httpx.ContactRequest) { b.Email = "anna@example" }),
			want:  rejected,
			field: "email",
		},
		{
			name:  "an address with a one-letter top level domain",
			body:  request(func(b *httpx.ContactRequest) { b.Email = "anna@example.o" }),
			want:  rejected,
			field: "email",
		},
		{
			name:  "an address with a numeric top level domain",
			body:  request(func(b *httpx.ContactRequest) { b.Email = "anna@example.12" }),
			want:  rejected,
			field: "email",
		},
		{
			name: "an internationalised domain in punycode",
			body: request(func(b *httpx.ContactRequest) { b.Email = "anna@xn--bcher-kva.example" }),
			want: accepted,
		},
		{
			name:  "an address literal",
			body:  request(func(b *httpx.ContactRequest) { b.Email = "anna@[192.0.2.1]" }),
			want:  rejected,
			field: "email",
		},
		{
			name:  "a display name",
			body:  request(func(b *httpx.ContactRequest) { b.Email = `"Anna" <anna@example.org>` }),
			want:  rejected,
			field: "email",
		},
		{
			name:  "two addresses in one field",
			body:  request(func(b *httpx.ContactRequest) { b.Email = "a@b.co, c@d.co" }),
			want:  rejected,
			field: "email",
		},
		{
			name: "an address of exactly 254 octets",
			body: request(func(b *httpx.ContactRequest) {
				b.Email = openapi_types.Email(strings.Repeat("a", maxEmail-len("@example.org")) +
					"@example.org")
			}),
			want: accepted,
		},
		{
			name: "an address of 255 octets",
			body: request(func(b *httpx.ContactRequest) {
				b.Email = openapi_types.Email(strings.Repeat("a", maxEmail-len("@example.org")+1) +
					"@example.org")
			}),
			want:  rejected,
			field: "email",
		},
		{
			name:  "a timestamp from the last century",
			body:  request(func(b *httpx.ContactRequest) { b.Ts = time.Date(1999, 1, 1, 0, 0, 0, 0, time.UTC) }),
			want:  rejected,
			field: "ts",
		},
		{
			name:  "no timestamp at all",
			body:  request(func(b *httpx.ContactRequest) { b.Ts = time.Time{} }),
			want:  rejected,
			field: "ts",
		},
		{
			// A drifting laptop clock is not a reason to lose somebody's
			// message. See maxClockSkew.
			name: "a clock a day out",
			body: request(func(b *httpx.ContactRequest) { b.Ts = testNow.Add(-24 * time.Hour) }),
			want: accepted,
		},
		{
			name:  "a dwell that would overflow the column",
			body:  request(func(b *httpx.ContactRequest) { b.DwellMs = maxInt32 + 1 }),
			want:  rejected,
			field: "dwellMs",
		},
		{
			name: "the honeypot",
			body: request(func(b *httpx.ContactRequest) { b.Company = "Acme" }),
			want: discarded,
		},
		{
			name: "a submission faster than a human",
			body: request(func(b *httpx.ContactRequest) { b.DwellMs = minDwell - 1 }),
			want: discarded,
		},
		{
			name: "a negative dwell",
			body: request(func(b *httpx.ContactRequest) { b.DwellMs = -1 }),
			want: discarded,
		},
		{
			// The silent paths win over the loud one. There is no point telling
			// a bot that its message was also too short.
			name: "a honeypot on an otherwise invalid submission",
			body: request(func(b *httpx.ContactRequest) {
				b.Company = "Acme"
				b.Message = "kurz"
			}),
			want: discarded,
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, got, invalid := validate(tc.body, testNow)

			if got != tc.want {
				t.Fatalf("verdict = %v, want %v (invalidParams %+v)", got, tc.want, invalid)
			}
			if tc.want != rejected {
				return
			}
			if len(invalid) != 1 || invalid[0].Name != tc.field {
				t.Fatalf("invalidParams = %+v, want one entry for %q", invalid, tc.field)
			}
			if invalid[0].Reason == "" {
				t.Error("the entry has no reason, so the form cannot say what is wrong")
			}
		})
	}
}

// Every control character, one at a time, in the two fields that become headers.
// A table would sample; this covers the range.
func TestNoControlCharacterSurvivesInAHeaderField(t *testing.T) {
	for r := rune(0); r <= 0x9f; r++ {
		if r >= 0x20 && r < 0x7f {
			continue // printable ASCII, which is the point of the range
		}
		body := request(func(b *httpx.ContactRequest) { b.Name = "Anna" + string(r) + "Keller" })

		if _, got, invalid := validate(body, testNow); got != rejected ||
			len(invalid) == 0 || invalid[0].Name != "name" {
			t.Errorf("U+%04X in a name gave %v / %+v, want a rejection naming name", r, got, invalid)
		}
	}

	for _, r := range []rune{'\u2028', '\u2029'} {
		body := request(func(b *httpx.ContactRequest) { b.Name = "Anna" + string(r) + "Keller" })
		if _, got, _ := validate(body, testNow); got != rejected {
			t.Errorf("U+%04X in a name was accepted", r)
		}
	}
}

// Trimming is not cosmetic here: the trimmed value is what gets stored, hashed
// for the idempotency key, and written into the mail.
func TestWhatIsStoredIsWhatWasTrimmed(t *testing.T) {
	sub, got, _ := validate(request(func(b *httpx.ContactRequest) {
		b.Name = "  Anna Keller  "
		b.Email = "  anna@example.org  "
		b.Message = "\n  Hallo, ich hätte da eine Frage.  \n"
	}), testNow)

	if got != accepted {
		t.Fatalf("verdict = %v", got)
	}
	if sub.name != "Anna Keller" || sub.email != "anna@example.org" {
		t.Errorf("submission = %+v", sub)
	}
	if strings.HasPrefix(sub.message, "\n") || strings.HasSuffix(sub.message, " ") {
		t.Errorf("the message kept its surrounding whitespace: %q", sub.message)
	}
}

// The idempotency key is built from the trimmed message, so a resend with a
// stray newline is still the same message. The alternative is a second row and
// a second mail for one button press.
func TestTrailingWhitespaceDoesNotMakeANewMessage(t *testing.T) {
	first, _, _ := validate(request(nil), testNow)
	second, _, _ := validate(request(func(b *httpx.ContactRequest) {
		b.Message += "\n"
	}), testNow)

	if first.message != second.message {
		t.Errorf("the same text with a trailing newline hashes differently:\n%q\n%q",
			first.message, second.message)
	}
}
