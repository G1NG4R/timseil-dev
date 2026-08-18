package mail

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/smtp"
	"net/textproto"
	"strings"
	"time"
)

// endpoint is the OVH MX Plan relay, and it is not configurable.
//
// The same argument as internal/contributions makes for GitHub, and ADR 0020 §8
// states it: a host that can be set from the environment is one edit away from a
// host that can be set from a request, and the outbound destinations of this
// service are compiled in. A provider change is a commit, which is the right
// size for a change that decides where a stranger's message is carried.
//
// Port 465, implicit TLS, rather than 587 with STARTTLS. STARTTLS begins in the
// clear and upgrades on the server's say-so, so there is a window in which an
// attacker on the path can strip the offer and watch the credential go by. 465
// has no such window: if the handshake fails, nothing is sent.
//
// A var only so the tests can point it somewhere else — unexported, and read
// from exactly one place below.
var endpoint = "ssl0.ovh.net:465"

// The timeouts of one delivery attempt.
//
// Constants rather than configuration, following ADR 0020 §7: they answer no
// question that differs between two deployments, and they decide how long a
// visitor waits before being told the truth. The whole attempt is bounded well
// under the 8 s the contact page gives up at and far under REQUEST_TIMEOUT.
const (
	dialTimeout    = 5 * time.Second
	attemptTimeout = 7 * time.Second
)

// ErrPermanent marks a refusal that retrying cannot fix.
//
// SMTP separates 4xx ("try later") from 5xx ("no"), and the separation is worth
// carrying: a mailbox that does not exist or a message the relay will never
// accept should stop the dispatcher on the first answer rather than five
// attempts and twenty minutes later. Everything else is transient by default —
// the safe direction, because retrying a permanent failure costs four log lines
// while giving up on a transient one loses the message.
var ErrPermanent = errors.New("the mail provider refused the message permanently")

// errWrongSender is a configuration mistake caught before the credential is
// sent. OVH MX Plan requires From to equal the authenticated account; a
// mismatch is refused by the relay after the password has already crossed the
// wire, and the error it gives back does not say which of the two is wrong.
var errWrongSender = errors.New("From does not match the authenticated account")

// Sender delivers one message. Two implementations: SMTPSender and LogSender.
//
// From is part of the interface because OVH ties it to the account: the caller
// composing a Message must not have to know that rule, and asking the sender is
// the only way it cannot be got wrong.
type Sender interface {
	From() string
	Send(ctx context.Context, m Message) error
}

// SMTPSender talks to the relay.
type SMTPSender struct {
	username string
	password string

	// dial is injected so the dialogue below can be tested against a real SMTP
	// server over a plain connection. Everything this type does that is worth
	// getting right happens after the connection exists; TLS is the two lines
	// in dialTLS and is asserted separately.
	dial func(ctx context.Context) (*smtp.Client, error)
}

// NewSMTPSender builds the production sender. username is the full mail address
// — it is both the SMTP login and, because OVH requires it, the From of every
// message this service sends.
func NewSMTPSender(username, password string) *SMTPSender {
	s := &SMTPSender{username: username, password: password}
	s.dial = dialTLS
	return s
}

// From is the address every message must carry, which is the account itself.
// Exposed so that the caller composing a Message does not have to know the rule
// and cannot get it wrong.
func (s *SMTPSender) From() string { return s.username }

func dialTLS(ctx context.Context) (*smtp.Client, error) {
	host, _, err := net.SplitHostPort(endpoint)
	if err != nil {
		return nil, err
	}

	dialer := &tls.Dialer{
		NetDialer: &net.Dialer{Timeout: dialTimeout},
		// No InsecureSkipVerify, no MinVersion below the default. The point of
		// choosing 465 was to have a connection that is either verified or not
		// made at all.
		Config: &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12},
	}

	conn, err := dialer.DialContext(ctx, "tcp", endpoint)
	if err != nil {
		return nil, err
	}

	// The context bounds the dial; this bounds everything after it. Without the
	// deadline a relay that accepts the connection and then says nothing holds
	// the request until REQUEST_TIMEOUT cuts it — an outage that looks like a
	// slow handler rather than like a mail problem. net/smtp exposes no way to
	// pass a context into the dialogue, so the deadline goes on the connection
	// before the client is wrapped around it.
	if deadline, ok := ctx.Deadline(); ok {
		if err := conn.SetDeadline(deadline); err != nil {
			_ = conn.Close()
			return nil, err
		}
	}

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		_ = conn.Close()
		return nil, err
	}
	return client, nil
}

// Send performs one delivery attempt. Retries and the breaker belong to the
// dispatcher, not here — this function either delivers or says why it did not.
func (s *SMTPSender) Send(ctx context.Context, m Message) error {
	if !strings.EqualFold(strings.TrimSpace(m.From), s.username) {
		return fmt.Errorf("%w: %q is authenticated, message says %q",
			errWrongSender, s.username, m.From)
	}

	// Built before the connection is opened. A message that cannot be built is
	// a bug, and finding it out after AUTH means the credential went over the
	// wire for nothing.
	raw, err := m.Build()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(ctx, attemptTimeout)
	defer cancel()

	client, err := s.dial(ctx)
	if err != nil {
		return classify(err)
	}
	// Close rather than Quit on the failure paths: Quit expects a cooperative
	// server, and the paths that reach here are the ones where it is not.
	defer func() { _ = client.Close() }()

	if err := s.deliver(client, m, raw); err != nil {
		return err
	}

	// Quit is what makes the relay commit. Its failure is a real failure: a
	// connection dropped before QUIT may or may not have queued the message.
	return classify(client.Quit())
}

func (s *SMTPSender) deliver(client *smtp.Client, m Message, raw []byte) error {
	host, _, err := net.SplitHostPort(endpoint)
	if err != nil {
		return err
	}

	// PlainAuth refuses to send the password over a connection it does not
	// consider secure, which is a guard worth having rather than working
	// around: if this ever errors in production, the TLS above did not happen.
	if err := client.Auth(smtp.PlainAuth("", s.username, s.password, host)); err != nil {
		return classify(err)
	}

	// The envelope. MAIL FROM is the account and RCPT TO is the operator's
	// inbox — the visitor's address appears in neither, because an envelope
	// sender this domain is not authorised for is exactly what SPF exists to
	// reject.
	if err := client.Mail(s.username); err != nil {
		return classify(err)
	}
	if err := client.Rcpt(m.To); err != nil {
		return classify(err)
	}

	w, err := client.Data()
	if err != nil {
		return classify(err)
	}
	if _, err := w.Write(raw); err != nil {
		_ = w.Close()
		return classify(err)
	}
	// The close is the end of DATA and carries the relay's verdict on the
	// message. Ignoring it would report a rejected message as delivered.
	return classify(w.Close())
}

// classify separates "no" from "not now".
//
// The relay's own words never travel further than this: they go into
// last_error, which lives in a table the public API never reads, and the visitor
// gets the one sentence internal/contact writes. Bounded and flattened on the
// way, for the same reason httpx.WriteProblem bounds its detail — what is long
// here is a transcript, not an explanation.
func classify(err error) error {
	if err == nil {
		return nil
	}

	var protocol *textproto.Error
	if errors.As(err, &protocol) && protocol.Code >= 500 {
		return fmt.Errorf("%w: %d %s", ErrPermanent, protocol.Code, oneLine(protocol.Msg))
	}
	return err
}

// oneLine bounds and flattens a relay message so it can go in a log line and a
// text column without carrying a newline into either.
func oneLine(s string) string {
	s = strings.TrimSpace(strings.Map(func(r rune) rune {
		if r == '\n' || r == '\r' || r == '\t' {
			return ' '
		}
		return r
	}, s))

	const limit = 200
	if len(s) > limit {
		return s[:limit] + "…"
	}
	return s
}

var _ Sender = (*SMTPSender)(nil)
