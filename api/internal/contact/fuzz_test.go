package contact

import (
	"encoding/json"
	netmail "net/mail"
	"strings"
	"testing"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// The fuzz target for the contact validator.
//
// Chapter 5.1 of the build plan names exactly two fuzz targets in the whole
// project, and this is one of them. The reason it is worth a fuzzer rather than
// a longer table is that the property being defended is not "these inputs are
// refused" but "no input at all gets through to a header" — an open statement
// about every string, which is what a fuzzer is for and a table can only sample.
//
// The property, in one sentence: if validate says accepted, the message built
// from it parses back as exactly one mail with exactly the headers this service
// wrote, and the visitor's address is in Reply-To and nowhere else.
//
// That is stronger than checking for "\r\n" in the output. A payload could get
// through as a folded continuation line, as a U+2028 some parser reads as a
// break, or as a second address in one field — and every one of those is a mail
// parser finding a header we did not write, which is what the assertion looks
// for.
//
//	go test -run Fuzz -fuzz FuzzASubmissionNeverBecomesAHeader ./internal/contact/
func FuzzASubmissionNeverBecomesAHeader(f *testing.F) {
	// The seeds are the payloads a person would try. The fuzzer's job is the
	// ones nobody would.
	for _, seed := range [][3]string{
		{"Anna Keller", "anna@example.org", "Eine ganz gewöhnliche Nachricht, lang genug."},
		{"Anna", "anna@example.org\r\nBcc: everyone@example.net", "Eine ganz gewöhnliche Nachricht."},
		{"Anna\r\nSubject: buy pills", "anna@example.org", "Eine ganz gewöhnliche Nachricht."},
		{"Anna", "anna@example.org, everyone@example.net", "Eine ganz gewöhnliche Nachricht."},
		{"Anna", `"Anna" <anna@example.org>`, "Eine ganz gewöhnliche Nachricht."},
		{"Anna", "anna@example.org", "harmlos\r\n\r\nBcc: everyone@example.net\r\n"},
		{"Anna", "anna@example.org Bcc: everyone@example.net", "Eine gewöhnliche Nachricht."},
		{"Anna Keller", "anna@example.org", "Eine ganz gewöhnliche Nachricht, lang genug."},
		{"Änna Kellër", "änna@exämple.org", "Eine Nachricht mit Umlauten und genug Zeichen."},
		{"A\tB", "a@b.co", strings.Repeat("x", 4001)},
		{"", "", ""},
	} {
		f.Add(seed[0], seed[1], seed[2])
	}

	now := time.Date(2026, 8, 18, 14, 22, 7, 0, time.UTC)

	// The third parameter is `text` rather than `message` because message is
	// the function that builds the mail — shadowing it here would silently
	// change what this test exercises.
	f.Fuzz(func(t *testing.T, name, email, text string) {
		body := httpx.ContactRequest{
			Name:    name,
			Email:   openapi_types.Email(email),
			Message: text,
			Company: "",
			DwellMs: 4200,
			Ts:      now,
		}

		sub, decision, invalid := validate(body, now)
		if decision != accepted {
			// A refusal is always a correct answer; the only thing asserted
			// about one is that it says which field, so a visitor can fix it.
			if decision == rejected && len(invalid) == 0 {
				t.Fatalf("rejected with no field named: %q / %q / %q", name, email, text)
			}
			return
		}

		// From here on the input is one this endpoint would store and send.
		built, err := message(newID(now),
			"contact@timseil.dev", "inbox@timseil.dev", sub, now, now).Build()
		if err != nil {
			t.Fatalf("validate accepted %q / %q / %q and the message would not build: %v",
				name, email, text, err)
		}

		parsed, err := netmail.ReadMessage(strings.NewReader(string(built)))
		if err != nil {
			t.Fatalf("the built message does not parse: %v\n%s", err, built)
		}

		// Exactly the headers this service writes. Anything else is a header a
		// stranger put there, whatever it is called.
		want := map[string]bool{
			"From": true, "To": true, "Reply-To": true, "Subject": true,
			"Date": true, "Message-Id": true, "Mime-Version": true,
			"Content-Type": true, "Content-Transfer-Encoding": true,
		}
		for header := range parsed.Header {
			if !want[header] {
				t.Fatalf("the submission produced a %s header\ninput: %q / %q / %q\n%s",
					header, name, email, text, built)
			}
		}

		// One recipient in Reply-To, and it is the address that was validated.
		addresses, err := parsed.Header.AddressList("Reply-To")
		if err != nil {
			t.Fatalf("Reply-To does not parse: %v\n%s", err, built)
		}
		if len(addresses) != 1 {
			t.Fatalf("Reply-To carries %d addresses\n%s", len(addresses), built)
		}
		if addresses[0].Address != sub.email {
			t.Fatalf("Reply-To is %q, want %q", addresses[0].Address, sub.email)
		}
		if addresses[0].Name != "" {
			t.Fatalf("Reply-To carries a display name %q", addresses[0].Name)
		}

		// The envelope sender is never the visitor. SPF is the reason.
		from, err := parsed.Header.AddressList("From")
		if err != nil || len(from) != 1 || from[0].Address != "contact@timseil.dev" {
			t.Fatalf("From is %v (err %v), want the authenticated account", from, err)
		}

		// And the whole document is still a document: no line longer than RFC
		// 5322 allows, which is where a folded injection would show up.
		for _, line := range strings.Split(string(built), "\r\n") {
			if len(line) > 998 {
				t.Fatalf("a line is %d octets\n%s", len(line), built)
			}
		}
	})
}

// FuzzTheBodyDecoderNeverPanics covers the step before validate: whatever
// arrives on the wire has to end as a document or as a 400, never as a panic
// that the recovery middleware turns into a 500 with no cause.
func FuzzTheBodyDecoderNeverPanics(f *testing.F) {
	f.Add(`{"name":"Anna","email":"a@b.co","message":"x","company":"","dwellMs":1,"ts":"2026-08-18T14:22:07Z"}`)
	f.Add(`{"dwellMs": 99999999999999999999}`)
	f.Add(`{"ts": "not a date"}`)
	f.Add(`{"name": {"nested": true}}`)
	f.Add(``)
	f.Add(`null`)
	f.Add(`[]`)

	now := time.Date(2026, 8, 18, 14, 22, 7, 0, time.UTC)

	f.Fuzz(func(t *testing.T, payload string) {
		var wire wireBody
		if err := json.Unmarshal([]byte(payload), &wire); err != nil {
			return
		}
		// A document that decodes must survive validation without panicking,
		// whatever it holds.
		if _, decision, invalid := validate(wire.contactRequest(), now); decision == rejected &&
			len(invalid) == 0 {
			t.Fatalf("rejected with no field named: %q", payload)
		}
	})
}
