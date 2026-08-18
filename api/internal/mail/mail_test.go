package mail

import (
	"encoding/base64"
	"errors"
	"mime"
	netmail "net/mail"
	"strings"
	"testing"
	"time"
)

// The tests for the message builder.
//
// Most of them are about one attack, from several directions: a visitor whose
// address or name carries a line break turns Reply-To into two headers, and the
// second one is theirs. The build plan (11.3) and the handbook (ch. 16) both
// raise it independently, and it is the reason this package exists as something
// other than three lines of fmt.Sprintf.
//
// The assertions are deliberately made against a *reparsed* message rather than
// against the bytes. Checking that the output does not contain the string "Bcc"
// would pass for a message that is broken in some other way; checking that a
// mail parser finds no Bcc header is the property that actually matters.

func fixture() Message {
	return Message{
		From:      "contact@timseil.dev",
		To:        "inbox@timseil.dev",
		ReplyTo:   "anna@example.org",
		Subject:   "[timseil.dev] Anna Keller",
		Body:      "Anna Keller <anna@example.org>\n\nHallo, ich habe eine Frage.\n",
		MessageID: "msg_01K3F9QX7ABCDEFG@timseil.dev",
		Date:      time.Date(2026, 8, 18, 14, 22, 7, 0, time.UTC),
	}
}

func build(t *testing.T, m Message) *netmail.Message {
	t.Helper()

	raw, err := m.Build()
	if err != nil {
		t.Fatalf("building the message: %v", err)
	}
	parsed, err := netmail.ReadMessage(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatalf("the built message does not parse as mail: %v", err)
	}
	return parsed
}

func body(t *testing.T, parsed *netmail.Message) string {
	t.Helper()

	var encoded strings.Builder
	buf := make([]byte, 1024)
	for {
		n, err := parsed.Body.Read(buf)
		encoded.Write(buf[:n])
		if err != nil {
			break
		}
	}
	decoded, err := base64.StdEncoding.DecodeString(
		strings.NewReplacer("\r", "", "\n", "").Replace(encoded.String()))
	if err != nil {
		t.Fatalf("the body is not valid base64: %v", err)
	}
	return string(decoded)
}

func TestTheHeadersAreWhatWasGivenIn(t *testing.T) {
	parsed := build(t, fixture())

	for _, want := range []struct{ header, value string }{
		{"From", "contact@timseil.dev"},
		{"To", "inbox@timseil.dev"},
		{"Reply-To", "anna@example.org"},
		{"Subject", "[timseil.dev] Anna Keller"},
		{"Message-Id", "<msg_01K3F9QX7ABCDEFG@timseil.dev>"},
		{"Mime-Version", "1.0"},
		{"Content-Transfer-Encoding", "base64"},
	} {
		if got := parsed.Header.Get(want.header); got != want.value {
			t.Errorf("%s is %q, want %q", want.header, got, want.value)
		}
	}
}

func TestTheVisitorIsNeverTheSender(t *testing.T) {
	// OVH MX Plan refuses a From that is not the authenticated account, and SPF
	// would refuse it even if OVH did not. The visitor belongs in Reply-To.
	parsed := build(t, fixture())

	if from := parsed.Header.Get("From"); strings.Contains(from, "example.org") {
		t.Fatalf("From is %q — the visitor's domain must never appear there", from)
	}
}

func TestTheBodyComesBackUnchanged(t *testing.T) {
	m := fixture()
	parsed := build(t, m)

	if got := body(t, parsed); got != m.Body {
		t.Errorf("the body decodes to %q, want %q", got, m.Body)
	}
}

func TestABodyCannotBecomeAHeader(t *testing.T) {
	// The visitor's message is the one field with no length limit worth
	// speaking of and no character they cannot type. Base64 is what makes this
	// a non-question rather than a filter that has to be right every time.
	m := fixture()
	m.Body = "harmless\r\n\r\nBcc: everyone@example.net\r\nSubject: buy pills\r\n"

	parsed := build(t, m)

	if bcc := parsed.Header.Get("Bcc"); bcc != "" {
		t.Fatalf("the body produced a Bcc header: %q", bcc)
	}
	if subject := parsed.Header.Get("Subject"); subject != m.Subject {
		t.Fatalf("the body overwrote the subject: %q", subject)
	}
	if got := body(t, parsed); got != m.Body {
		t.Errorf("the body decodes to %q, want it unchanged", got)
	}
}

// TestACarriageReturnInTheReplyToIsRefused is the broken case the definition of
// done asks for.
//
// Mutation-checked, and the result is worth writing down because it is not the
// one expected: deleting the containsLineBreak call from bareAddress does turn
// this test red, but every payload below is *also* refused by ParseAddress,
// with "expected single address" instead. So the explicit check is not what
// stops these five — it is what makes stopping them a stated rule of this
// package rather than a side effect of how net/mail happens to parse today. It
// is also the only defence Subject and Message-ID have, because neither of them
// goes through an address parser at all.
func TestACarriageReturnInTheReplyToIsRefused(t *testing.T) {
	for _, payload := range []string{
		"anna@example.org\r\nBcc: everyone@example.net",
		"anna@example.org\nBcc: everyone@example.net",
		"anna@example.org\rSubject: buy pills",
		"anna@example.org\x00",
		// U+2028 LINE SEPARATOR: a line break to some parsers, an ordinary
		// character to others. Exactly the disagreement an attacker looks for.
		"anna@example.org\u2028Bcc: everyone@example.net",
	} {
		m := fixture()
		m.ReplyTo = payload

		if _, err := m.Build(); !errors.Is(err, errHeaderInjection) {
			t.Errorf("Build(%q) returned %v, want errHeaderInjection", payload, err)
		}
	}
}

func TestALineBreakInTheSubjectIsRefused(t *testing.T) {
	// The subject carries the visitor's name, so it is the second field a
	// stranger controls. QEncoding would leave an ASCII newline untouched.
	m := fixture()
	m.Subject = "[timseil.dev] Anna\r\nBcc: everyone@example.net"

	if _, err := m.Build(); !errors.Is(err, errHeaderInjection) {
		t.Fatalf("Build returned %v, want errHeaderInjection", err)
	}
}

func TestADisplayNameIsRefused(t *testing.T) {
	m := fixture()
	m.ReplyTo = `"Anna Keller" <anna@example.org>`

	if _, err := m.Build(); !errors.Is(err, errNotBareAddress) {
		t.Fatalf("Build returned %v, want errNotBareAddress", err)
	}
}

func TestASecondRecipientInOneFieldIsRefused(t *testing.T) {
	// ParseAddress reads the first address and reports success, so a check that
	// trusted it would forward to a stranger and call it valid.
	for _, payload := range []string{
		"anna@example.org, everyone@example.net",
		"anna@example.org; everyone@example.net",
	} {
		m := fixture()
		m.ReplyTo = payload

		if _, err := m.Build(); !errors.Is(err, errNotBareAddress) {
			t.Errorf("Build(%q) returned %v, want errNotBareAddress", payload, err)
		}
	}
}

func TestANonAsciiSubjectIsEncoded(t *testing.T) {
	m := fixture()
	m.Subject = "[timseil.dev] Jürgen Groß"

	raw, err := m.Build()
	if err != nil {
		t.Fatalf("building: %v", err)
	}
	if strings.Contains(string(raw), "Jürgen") {
		t.Error("the subject went out as raw UTF-8 — it needs an encoded-word")
	}

	// Header.Get hands back the encoded-word verbatim; a mail client is what
	// decodes it, and here that client is mime.WordDecoder.
	parsed := build(t, m)
	got, err := (&mime.WordDecoder{}).DecodeHeader(parsed.Header.Get("Subject"))
	if err != nil {
		t.Fatalf("the encoded subject does not decode: %v", err)
	}
	if got != m.Subject {
		t.Errorf("the subject decodes to %q, want %q", got, m.Subject)
	}
}

func TestAnAsciiSubjectStaysReadable(t *testing.T) {
	// The counterpart to the test above: encoding unconditionally would work and
	// would make every log line and every inbox list unreadable.
	raw, err := fixture().Build()
	if err != nil {
		t.Fatalf("building: %v", err)
	}
	if !strings.Contains(string(raw), "Subject: [timseil.dev] Anna Keller\r\n") {
		t.Error("an ASCII subject was encoded when it did not need to be")
	}
}

func TestEveryLineEndsWithCrlfAndFitsRfc5322(t *testing.T) {
	m := fixture()
	m.Body = strings.Repeat("eine sehr lange Zeile ohne Umbruch ", 200)

	raw, err := m.Build()
	if err != nil {
		t.Fatalf("building: %v", err)
	}

	for _, line := range strings.Split(string(raw), crlf) {
		if strings.ContainsAny(line, "\r\n") {
			t.Fatalf("a line contains a bare CR or LF: %q", line)
		}
		if len(line) > 998 {
			t.Fatalf("a line is %d octets, RFC 5322 allows 998", len(line))
		}
	}
}

func TestAnEmptyMessageIdIsRefused(t *testing.T) {
	m := fixture()
	m.MessageID = "   "

	if _, err := m.Build(); !errors.Is(err, errNoMessageID) {
		t.Fatalf("Build returned %v, want errNoMessageID", err)
	}
}

func TestAngleBracketsInTheMessageIdAreRefused(t *testing.T) {
	// Build adds the brackets. A value that brings its own would close the
	// header early and leave the rest of the id outside it.
	m := fixture()
	m.MessageID = "<msg_1@timseil.dev> Bcc: everyone@example.net"

	if _, err := m.Build(); !errors.Is(err, errHeaderInjection) {
		t.Fatalf("Build returned %v, want errHeaderInjection", err)
	}
}
