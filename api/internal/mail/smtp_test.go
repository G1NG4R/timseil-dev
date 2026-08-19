package mail

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"io"
	"log"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/smtp"
	"strings"
	"sync"
	"testing"
	"time"
)

// The tests for the sender, against a real SMTP server.
//
// Not a mock of *SMTPSender and not an interface stood in for: a listener that
// speaks the protocol, so the assertions are about the bytes that crossed the
// connection. The thing worth proving here cannot be proven any other way — that
// a visitor's address reaches Reply-To and reaches neither MAIL FROM nor the
// authenticated account, and that a message which fails to build never opens a
// connection at all, so the credential is not spent on it.
//
// The connection is plain rather than TLS. PlainAuth allows that only against a
// loopback address, which is what the fake listens on, and what has branches is
// the dialogue — so the dialogue is what runs here. The dial itself is held to
// its own two tests at the bottom of this file: the relay is the value the ADR
// names, and a certificate no root signed ends the connection before a word is
// said over it.

// fakeSMTP is a one-connection-at-a-time SMTP server that records what it was
// told and can be scripted to refuse at any step.
type fakeSMTP struct {
	listener net.Listener

	// failAt is the verb to refuse at: AUTH, MAIL, RCPT, DATA or DOT ("DOT" is
	// the end of the message body, where a relay passes its verdict on the
	// content). Empty accepts everything.
	failAt   string
	failCode string

	mu         sync.Mutex
	transcript []string
	auth       string
	body       string
	dials      int
}

func newFakeSMTP(t *testing.T) *fakeSMTP {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listening: %v", err)
	}

	server := &fakeSMTP{listener: listener}
	go server.serve()

	// endpoint is a package var precisely so this is possible. Restored by the
	// cleanup, because a leaked value would point the next test at OVH.
	previous := endpoint
	endpoint = listener.Addr().String()
	t.Cleanup(func() {
		endpoint = previous
		_ = listener.Close()
	})

	return server
}

func (s *fakeSMTP) serve() {
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			return
		}
		s.mu.Lock()
		s.dials++
		s.mu.Unlock()
		s.handle(conn)
	}
}

func (s *fakeSMTP) handle(conn net.Conn) {
	defer func() { _ = conn.Close() }()

	reader := bufio.NewReader(conn)
	write := func(line string) { _, _ = io.WriteString(conn, line+"\r\n") }

	write("220 fake.timseil.test ESMTP")

	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimRight(line, "\r\n")

		s.mu.Lock()
		s.transcript = append(s.transcript, line)
		s.mu.Unlock()

		verb, rest, _ := strings.Cut(line, " ")
		verb = strings.ToUpper(verb)

		refuse := func(step string) bool {
			if s.failAt != step {
				return false
			}
			write(s.failCode + " scripted refusal at " + step)
			return true
		}

		switch verb {
		case "EHLO", "HELO":
			// No STARTTLS and no 8BITMIME advertised: this connection is
			// already plain and the client must not try to upgrade or to
			// decorate MAIL FROM.
			write("250-fake.timseil.test")
			write("250 AUTH PLAIN")

		case "AUTH":
			if refuse("AUTH") {
				continue
			}
			_, payload, _ := strings.Cut(rest, " ")
			decoded, _ := base64.StdEncoding.DecodeString(payload)
			s.mu.Lock()
			// The wire form is \x00user\x00password; the NULs would make the
			// assertion unreadable in a failure message.
			s.auth = strings.ReplaceAll(string(decoded), "\x00", "|")
			s.mu.Unlock()
			write("235 authenticated")

		case "MAIL":
			if refuse("MAIL") {
				continue
			}
			write("250 sender ok")

		case "RCPT":
			if refuse("RCPT") {
				continue
			}
			write("250 recipient ok")

		case "DATA":
			if refuse("DATA") {
				continue
			}
			write("354 go ahead")
			s.readBody(reader)
			if refuse("DOT") {
				continue
			}
			write("250 queued as FAKE1")

		case "QUIT":
			write("221 bye")
			return

		default:
			write("250 ok")
		}
	}
}

// readBody consumes the DATA payload up to the lone dot, undoing the dot
// stuffing the client's writer applies.
func (s *fakeSMTP) readBody(reader *bufio.Reader) {
	var out strings.Builder
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			break
		}
		trimmed := strings.TrimRight(line, "\r\n")
		if trimmed == "." {
			break
		}
		out.WriteString(strings.TrimPrefix(trimmed, "."))
		out.WriteString("\r\n")
	}

	s.mu.Lock()
	s.body = out.String()
	s.mu.Unlock()
}

func (s *fakeSMTP) said() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.transcript...)
}

func (s *fakeSMTP) sawVerb(verb string) string {
	for _, line := range s.said() {
		if strings.HasPrefix(strings.ToUpper(line), verb) {
			return line
		}
	}
	return ""
}

func (s *fakeSMTP) credential() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.auth
}

func (s *fakeSMTP) delivered() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.body
}

func (s *fakeSMTP) dialCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.dials
}

// plainSender is the production sender with the TLS dial swapped for a plain
// one. Everything else — the From check, Build, the dialogue, classify — is the
// code that runs in production.
func plainSender(username, password string) *SMTPSender {
	s := NewSMTPSender(username, password)
	s.dial = func(ctx context.Context) (*smtp.Client, error) {
		host, _, err := net.SplitHostPort(endpoint)
		if err != nil {
			return nil, err
		}
		dialer := &net.Dialer{Timeout: dialTimeout}
		conn, err := dialer.DialContext(ctx, "tcp", endpoint)
		if err != nil {
			return nil, err
		}
		if deadline, ok := ctx.Deadline(); ok {
			_ = conn.SetDeadline(deadline)
		}
		return smtp.NewClient(conn, host)
	}
	return s
}

func TestAMessageCrossesTheWireIntact(t *testing.T) {
	server := newFakeSMTP(t)
	sender := plainSender("contact@timseil.dev", "hunter2")

	if err := sender.Send(context.Background(), fixture()); err != nil {
		t.Fatalf("Send: %v", err)
	}

	if got := server.credential(); got != "|contact@timseil.dev|hunter2" {
		t.Errorf("AUTH carried %q", got)
	}
	if got := server.sawVerb("MAIL FROM"); got != "MAIL FROM:<contact@timseil.dev>" {
		t.Errorf("MAIL FROM is %q", got)
	}
	if got := server.sawVerb("RCPT TO"); got != "RCPT TO:<inbox@timseil.dev>" {
		t.Errorf("RCPT TO is %q", got)
	}
	if !strings.Contains(server.delivered(), "Reply-To: anna@example.org\r\n") {
		t.Errorf("the body that arrived has no Reply-To for the visitor:\n%s", server.delivered())
	}
	if server.sawVerb("QUIT") == "" {
		t.Error("the client never sent QUIT, so the relay was never told to commit")
	}
}

// TestTheEnvelopeNeverCarriesTheVisitor is the SPF half of the OVH rule.
//
// An envelope sender this domain is not authorised for is what SPF exists to
// reject, and a relay that accepted it would be sending mail as somebody else on
// our reputation.
func TestTheEnvelopeNeverCarriesTheVisitor(t *testing.T) {
	server := newFakeSMTP(t)
	sender := plainSender("contact@timseil.dev", "hunter2")

	if err := sender.Send(context.Background(), fixture()); err != nil {
		t.Fatalf("Send: %v", err)
	}

	for _, verb := range []string{"MAIL FROM", "RCPT TO"} {
		if line := server.sawVerb(verb); strings.Contains(line, "example.org") {
			t.Errorf("%s carries the visitor's domain: %q", verb, line)
		}
	}
}

// TestAMessageThatCannotBeBuiltNeverOpensAConnection is the reason Build runs
// before the dial.
//
// A visitor who gets a CRLF past the validator must not cost a TCP connection, a
// TLS handshake and an AUTH — the credential goes over the wire in that
// exchange, and spending it on an attacker's request is the difference between
// a rejected message and a rejected message that also rate-limits us at OVH.
func TestAMessageThatCannotBeBuiltNeverOpensAConnection(t *testing.T) {
	server := newFakeSMTP(t)
	sender := plainSender("contact@timseil.dev", "hunter2")

	m := fixture()
	m.ReplyTo = "anna@example.org\r\nBcc: everyone@example.net"

	if err := sender.Send(context.Background(), m); !errors.Is(err, errHeaderInjection) {
		t.Fatalf("Send returned %v, want errHeaderInjection", err)
	}
	if dials := server.dialCount(); dials != 0 {
		t.Errorf("the sender opened %d connection(s) for a message it could not build", dials)
	}
}

func TestAMessageForAnotherSenderIsRefusedBeforeTheDial(t *testing.T) {
	server := newFakeSMTP(t)
	sender := plainSender("contact@timseil.dev", "hunter2")

	m := fixture()
	m.From = "someone-else@timseil.dev"

	if err := sender.Send(context.Background(), m); !errors.Is(err, errWrongSender) {
		t.Fatalf("Send returned %v, want errWrongSender", err)
	}
	if dials := server.dialCount(); dials != 0 {
		t.Errorf("the sender opened %d connection(s) for a From it could not use", dials)
	}
}

func TestAFiveHundredIsPermanent(t *testing.T) {
	// The relay's verdict on the content arrives at the end of DATA, which is
	// the step most likely to produce a permanent refusal in practice.
	server := newFakeSMTP(t)
	server.failAt = "DOT"
	server.failCode = "550"

	sender := plainSender("contact@timseil.dev", "hunter2")

	err := sender.Send(context.Background(), fixture())
	if !errors.Is(err, ErrPermanent) {
		t.Fatalf("Send returned %v, want ErrPermanent", err)
	}
	if strings.ContainsAny(err.Error(), "\r\n") {
		t.Errorf("the error carries a line break into a log line and a text column: %q", err)
	}
}

func TestAFourHundredIsNotPermanent(t *testing.T) {
	// "Try later" must stay retryable. Treating it as permanent would throw
	// away a message because the relay was busy for a minute.
	server := newFakeSMTP(t)
	server.failAt = "MAIL"
	server.failCode = "451"

	sender := plainSender("contact@timseil.dev", "hunter2")

	err := sender.Send(context.Background(), fixture())
	if err == nil {
		t.Fatal("Send succeeded against a relay that refused MAIL FROM")
	}
	if errors.Is(err, ErrPermanent) {
		t.Fatalf("a 451 was classified as permanent: %v", err)
	}
}

func TestARefusedAuthIsReported(t *testing.T) {
	server := newFakeSMTP(t)
	server.failAt = "AUTH"
	server.failCode = "535"

	sender := plainSender("contact@timseil.dev", "wrong")

	err := sender.Send(context.Background(), fixture())
	if !errors.Is(err, ErrPermanent) {
		t.Fatalf("Send returned %v, want ErrPermanent for a rejected credential", err)
	}
	if strings.Contains(err.Error(), "wrong") {
		t.Errorf("the password appears in the error: %q", err)
	}
}

func TestAnUnreachableRelayIsTransient(t *testing.T) {
	// The 502 path of the contact endpoint. Not permanent: a relay that is down
	// comes back, and the dispatcher should keep the message.
	previous := endpoint
	endpoint = "127.0.0.1:1"
	t.Cleanup(func() { endpoint = previous })

	sender := plainSender("contact@timseil.dev", "hunter2")

	err := sender.Send(context.Background(), fixture())
	if err == nil {
		t.Fatal("Send succeeded against a closed port")
	}
	if errors.Is(err, ErrPermanent) {
		t.Fatalf("an unreachable relay was classified as permanent: %v", err)
	}
}

func TestTheLogSenderRefusesWhatTheRelayWouldRefuse(t *testing.T) {
	// A development transport that accepts what production rejects teaches the
	// wrong thing and hides the bug until L1.
	sender := NewLogSender("contact@timseil.dev", slog.New(slog.NewTextHandler(io.Discard, nil)))

	if got := sender.From(); got != "contact@timseil.dev" {
		t.Errorf("From is %q", got)
	}
	if err := sender.Send(context.Background(), fixture()); err != nil {
		t.Fatalf("Send: %v", err)
	}

	m := fixture()
	m.ReplyTo = "anna@example.org\r\nBcc: everyone@example.net"
	if err := sender.Send(context.Background(), m); !errors.Is(err, errHeaderInjection) {
		t.Errorf("Send returned %v, want errHeaderInjection", err)
	}

	m = fixture()
	m.From = "someone-else@timseil.dev"
	if err := sender.Send(context.Background(), m); !errors.Is(err, errWrongSender) {
		t.Errorf("Send returned %v, want errWrongSender", err)
	}
}

func TestAnAttemptIsBounded(t *testing.T) {
	// A relay that accepts the connection and then says nothing must not hold
	// the request until REQUEST_TIMEOUT cuts it: that failure reads as a slow
	// handler and sends whoever is on it to the wrong runbook page.
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listening: %v", err)
	}
	t.Cleanup(func() { _ = listener.Close() })

	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		// Accept and stay silent: never send the 220 greeting.
		<-time.After(time.Minute)
		_ = conn.Close()
	}()

	previous := endpoint
	endpoint = listener.Addr().String()
	t.Cleanup(func() { endpoint = previous })

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()

	done := make(chan error, 1)
	go func() { done <- plainSender("contact@timseil.dev", "hunter2").Send(ctx, fixture()) }()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("Send succeeded against a silent relay")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Send did not return — the attempt is not bounded")
	}
}

// The two tests below are about the dial rather than the dialogue, and they
// arrived with L1 (ADR 0029 §9). Until that phase the relay was a value nobody
// had ever reached, so the two claims this file makes about it — that it is the
// one the ADR names, and that a connection to it is either verified or not made
// at all — were carried by a comment. L1 is the phase that made them load
// bearing, so they are held to a test here.

func TestTheRelayIsTheOneTheADRNames(t *testing.T) {
	// ADR 0021 §6 and ADR 0020 §8: the destination is compiled in, and changing
	// it is a commit rather than an environment variable. That is only true
	// while the value is what it claims to be.
	//
	// The second thing this catches is nearer: every test above repoints
	// endpoint at a listener and restores it in a cleanup. One that forgot would
	// leave the next run of this package dialling OVH from a laptop. Placing the
	// assertion last means a leak from any of them fails here.
	const want = "ssl0.ovh.net:465"
	if endpoint != want {
		t.Errorf("endpoint is %q, want %q — either the relay changed without an ADR, "+
			"or a test above leaked its listener address", endpoint, want)
	}
}

func TestARelayWhoseCertificateDoesNotVerifyIsNotTalkedTo(t *testing.T) {
	// The reason port 465 was chosen over 587 (smtp.go, the endpoint comment):
	// STARTTLS begins in the clear and can be stripped, 465 cannot. That
	// argument only holds while the handshake is actually verified, and the
	// whole of that guarantee is the absence of InsecureSkipVerify in dialTLS —
	// one word, four characters of diff, no test above it.
	//
	// httptest's certificate is self-signed and its issuer is in no root pool,
	// so a verifying client refuses it. It never speaks HTTP: the connection is
	// dropped during the handshake, long before either side says a word.
	server := httptest.NewTLSServer(http.HandlerFunc(
		func(http.ResponseWriter, *http.Request) {},
	))
	// The refused handshake is the assertion, and the server logs it as an
	// error. Silenced so a passing run stays quiet.
	server.Config.ErrorLog = log.New(io.Discard, "", 0)
	t.Cleanup(server.Close)

	previous := endpoint
	endpoint = server.Listener.Addr().String()
	t.Cleanup(func() { endpoint = previous })

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	client, err := dialTLS(ctx)
	if err == nil {
		_ = client.Close()
		t.Fatal("dialTLS accepted a certificate no root signed")
	}

	// Not merely "an error": a timeout or a connection refused would satisfy
	// that and would prove nothing about verification.
	var verification *tls.CertificateVerificationError
	if !errors.As(err, &verification) {
		t.Errorf("dialTLS returned %v (%T), want a certificate verification error", err, err)
	}
}
