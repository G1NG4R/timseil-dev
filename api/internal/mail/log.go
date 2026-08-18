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
// It is a development transport. The address of whoever filled in the form ends
// up in a log line, which is exactly what F1's PII rule forbids, and that is why
// selecting it logs a warning at startup rather than a note. In production
// MAIL_TRANSPORT is smtp, and it is the default so that this has to be chosen
// rather than forgotten.
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

func (s *LogSender) Send(_ context.Context, m Message) error {
	if !strings.EqualFold(strings.TrimSpace(m.From), s.from) {
		return fmt.Errorf("%w: %q is configured, message says %q",
			errWrongSender, s.from, m.From)
	}

	raw, err := m.Build()
	if err != nil {
		return err
	}

	s.log.Info("mail not sent — MAIL_TRANSPORT is log",
		"message_id", m.MessageID,
		"to", m.To,
		"bytes", len(raw),
		"envelope", string(raw),
	)
	return nil
}

var _ Sender = (*LogSender)(nil)
