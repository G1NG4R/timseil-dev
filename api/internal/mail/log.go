package mail

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
)

// LogSender builds the message in full and writes it to the log instead of
// sending it.
//
// It exists because of a sequencing fact, not as a convenience: L1 sets up the
// OVH mailbox and the DNS records, and the build plan puts L1 after stage D
// (chapter 8.5's appendix, "Phasen mit externer Uhr"). C6 is in stage C, so at
// the time the contact endpoint is built there is no mailbox to send to. The
// alternatives were an api that refuses to start under `make dev` and a sender
// that silently does nothing; this one does neither. Everything up to the
// socket really happens — the same Build, the same refusals, the same bytes —
// so a header injection that got past the validator would be caught here too.
//
// It is a development transport, and until F1 it wrote the whole message —
// address, name and text — into a log line, which is what the operations sheet
// forbids. It no longer does; only the message id and the byte count are logged.
// Selecting it still warns at startup, because a service that is not sending
// mail should say so loudly. In production MAIL_TRANSPORT is smtp, and it is
// the default so that this has to be chosen rather than forgotten.
type LogSender struct {
	from string
	log  *slog.Logger
}

// NewLogSender takes the address that would have been authenticated, so that a
// message built for the wrong sender is refused here exactly as SMTPSender
// refuses it. A dev transport that accepts what production rejects teaches the
// wrong thing.
func NewLogSender(from string, log *slog.Logger) *LogSender {
	return &LogSender{from: from, log: log}
}

// From is the address every message must carry.
func (s *LogSender) From() string { return s.from }

func (s *LogSender) Send(ctx context.Context, m Message) error {
	if !strings.EqualFold(strings.TrimSpace(m.From), s.from) {
		return fmt.Errorf("%w: %q is configured, message says %q",
			errWrongSender, s.from, m.From)
	}

	raw, err := m.Build()
	if err != nil {
		return err
	}

	// The size, not the message. `envelope` used to carry the whole of RFC 5322
	// here — Reply-To, the sender's name and the text they typed — and the
	// operations sheet rules out exactly that: "no IP, no form contents".
	//
	// internal/logx cannot repair this one. It redacts an address it recognises
	// and leaves the name and the message standing, so a filter here would look
	// like protection and not be any. The line has to not be built.
	//
	// Nothing is lost: the row in contact_messages holds all of it, and what
	// this transport is for is proving the message was really assembled — which
	// the byte count and a successful Build() say on their own.
	s.log.InfoContext(ctx, "mail not sent — MAIL_TRANSPORT is log",
		"message_id", m.MessageID,
		"bytes", len(raw),
	)
	return nil
}

var _ Sender = (*LogSender)(nil)
