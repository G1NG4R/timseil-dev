// Package mail builds and sends the one mail this service ever sends: a contact
// form submission, forwarded to the operator's inbox.
//
// Two rules shape everything here, and both come from the same finding in the
// build plan (11.3) and the handbook (ch. 16). Reply-To is built from a
// visitor's address, so a `\r` or `\n` anywhere in a header would let them
// append headers of their own — a Bcc to a thousand strangers, sent by this
// domain, with the reputation SPF and DKIM just built. And From must equal the
// authenticated SMTP account, because OVH MX Plan rejects anything else; the
// visitor's address therefore lives in Reply-To and nowhere else.
//
// The answer to the first rule is not a filter but a shape: every header value
// is refused if it contains a line break, and the body is base64, so the one
// field a visitor can make arbitrarily long cannot contain a line at all.
// Plaintext only — never HTML, which would add a second parser and a second set
// of ways to be wrong.
package mail

import (
	"encoding/base64"
	"errors"
	"fmt"
	"mime"
	netmail "net/mail"
	"strings"
	"time"
)

// The failures of Build. They are bugs rather than visitor mistakes — the
// validator in internal/contact rejects a CRLF long before a Message exists —
// so nothing branches on them and they funnel into a 500. They are sentinels
// anyway, because a test that asserts "some error" passes for the wrong reason.
var (
	errHeaderInjection = errors.New("a header value contains a line break")
	errNotBareAddress  = errors.New("not a bare mail address")
	errNoMessageID     = errors.New("the message id is empty")
)

// The two transports. Named here rather than in internal/config so that the
// strings a deployment may set and the senders that implement them cannot drift
// apart; config validates against these constants.
const (
	TransportSMTP = "smtp"
	TransportLog  = "log"
)

// base64LineLength is the wrap width RFC 2045 asks for. Not a style choice:
// some relays still fold longer lines themselves, and a relay that folds a
// base64 body folds it wrong.
const base64LineLength = 76

// crlf is the line ending of RFC 5322. A bare \n is what a Go programmer writes
// by habit and what a strict MTA rejects, so it is spelled out once here and
// never typed again below.
const crlf = "\r\n"

// Message is one outgoing mail, already decided.
//
// It carries no opinion about the contact form: the subject and the body are
// composed by internal/contact, which is the package that knows what a
// submission looks like. What this package knows is how to put those strings on
// the wire without letting them become headers.
type Message struct {
	// From is the authenticated SMTP account and nothing else. It is not the
	// visitor. See the package comment.
	From string

	// To is the operator's inbox.
	To string

	// ReplyTo is the visitor's address — the one field here that a stranger
	// controls, and the reason this file exists.
	ReplyTo string

	Subject string
	Body    string

	// MessageID is the addr-spec form, without angle brackets: Build adds them.
	// It is derived from the receipt the visitor was handed, so a quoted id
	// finds the mail as well as the row.
	MessageID string

	// Date is passed in rather than read from the clock, so that a test can
	// assert the whole byte stream instead of everything except one line.
	Date time.Time
}

// Build renders the message as RFC 5322 bytes, ready for SMTP DATA.
//
// It re-checks what the validator already checked. That is deliberate
// duplication and the only kind this repository allows: the validator protects
// the visitor from a mistake, this protects the domain from an attacker, and a
// defence that lives in exactly one place is one refactor away from living in
// none.
func (m Message) Build() ([]byte, error) {
	from, err := BareAddress(m.From)
	if err != nil {
		return nil, fmt.Errorf("from: %w", err)
	}
	to, err := BareAddress(m.To)
	if err != nil {
		return nil, fmt.Errorf("to: %w", err)
	}
	replyTo, err := BareAddress(m.ReplyTo)
	if err != nil {
		return nil, fmt.Errorf("reply-to: %w", err)
	}

	if strings.TrimSpace(m.MessageID) == "" {
		return nil, errNoMessageID
	}
	if containsLineBreak(m.MessageID) || strings.ContainsAny(m.MessageID, "<>") {
		return nil, fmt.Errorf("message-id: %w", errHeaderInjection)
	}
	if containsLineBreak(m.Subject) {
		return nil, fmt.Errorf("subject: %w", errHeaderInjection)
	}

	// Encoded after the line-break check, never before. QEncoding leaves pure
	// ASCII untouched, so a subject that is entirely ASCII plus a newline would
	// come back out of the encoder with the newline intact — the check has to
	// see the raw value or it sees nothing.
	subject := encodeHeader(m.Subject)

	// Date in the RFC 1123 form with a numeric zone. time.RFC1123Z rather than
	// RFC1123, because the named-zone form is ambiguous and some filters score
	// it down.
	headers := []string{
		"From: " + from,
		"To: " + to,
		"Reply-To: " + replyTo,
		"Subject: " + subject,
		"Date: " + m.Date.Format(time.RFC1123Z),
		"Message-ID: <" + m.MessageID + ">",
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=utf-8",
		"Content-Transfer-Encoding: base64",
	}

	var out strings.Builder
	for _, header := range headers {
		out.WriteString(header)
		out.WriteString(crlf)
	}
	out.WriteString(crlf)
	out.WriteString(encodeBody(m.Body))

	return []byte(out.String()), nil
}

// BareAddress accepts an addr-spec and refuses everything else.
//
// `Anna Keller <anna@example.org>` is a valid address and is rejected here on
// purpose. A display name is a second place for a stranger's text to live in a
// header, and this service has no use for one: the visitor's name goes in the
// subject and the body, where it is data rather than syntax.
//
// Exported because internal/config applies the same rule to SMTP_USERNAME and
// MAIL_TO at startup, and internal/contact applies it to whatever a visitor
// typed. One rule with one implementation: a second copy would be a second
// answer to "what is an address", and the two would differ on the day it
// mattered.
func BareAddress(raw string) (string, error) {
	address := strings.TrimSpace(raw)
	if containsLineBreak(address) {
		return "", errHeaderInjection
	}

	// A comma or a semicolon would make one header into a recipient list. Caught
	// before parsing, because ParseAddress reads only the first of them and
	// would report the rest as valid by silently dropping them.
	if strings.ContainsAny(address, ",;") {
		return "", errNotBareAddress
	}

	parsed, err := netmail.ParseAddress(address)
	if err != nil {
		return "", fmt.Errorf("%w: %v", errNotBareAddress, err)
	}
	if parsed.Name != "" || parsed.Address != address {
		return "", errNotBareAddress
	}
	return parsed.Address, nil
}

// containsLineBreak is the whole of the header injection defence, and it looks
// for more than CR and LF.
//
// U+2028 and U+2029 are line breaks to some parsers and not to others, and a
// NUL truncates the header in whatever C code eventually handles it. None of
// them belong in an address or a subject under any circumstances, so the check
// costs nothing and closes three doors instead of one.
func containsLineBreak(s string) bool {
	return strings.ContainsAny(s, "\r\n\x00\u2028\u2029")
}

// encodeHeader wraps a header value in an encoded-word when it needs one and
// leaves it alone when it does not.
//
// mime.QEncoding does exactly this, which is why it is used rather than an
// unconditional encode: an ASCII subject stays readable in a log line and in
// every mail client's list view.
func encodeHeader(value string) string {
	return mime.QEncoding.Encode("utf-8", value)
}

// encodeBody renders the body as base64 in lines of base64LineLength.
//
// Base64 rather than quoted-printable or 8bit, and the reason is the same one
// the package comment gives: it makes the body structurally incapable of
// carrying a header. Whatever a visitor types — a bare CRLF, a `Bcc:` on its
// own line, an entire second message — comes out as an alphabet of 64
// characters that no parser can read as anything but a body.
func encodeBody(body string) string {
	encoded := base64.StdEncoding.EncodeToString([]byte(body))

	var out strings.Builder
	for start := 0; start < len(encoded); start += base64LineLength {
		end := min(start+base64LineLength, len(encoded))
		out.WriteString(encoded[start:end])
		out.WriteString(crlf)
	}

	// An empty body still gets one line, so that the message never ends on the
	// blank line that separates headers from body — some MTAs read that as a
	// truncated DATA.
	if encoded == "" {
		out.WriteString(crlf)
	}
	return out.String()
}
