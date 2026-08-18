package contact

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/mail"
	"github.com/G1NG4R/timseil-dev/api/internal/middleware"
	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// The handler against stubs. What runs against a real server is in
// internal/store/contact_db_test.go; what runs against a real SMTP server is in
// internal/mail. This file is about the five answers and the order the checks
// run in, which is the part of C6 that is a decision rather than a mechanism.

const testRequestID = "req_test_0001"

// A pepper of the right shape and worth nothing. Its only job here is to make
// two different addresses hash differently.
var testPepper = []byte("0123456789abcdef0123456789abcdef")

var testNow = time.Date(2026, 8, 18, 14, 22, 7, 0, time.UTC)

type stubQueries struct {
	inserted  []store.InsertContactMessageParams
	insertErr error

	// existingID is what the idempotency lookup returns. Setting it makes the
	// insert behave like a repeat: no row, and the receipt from the first time.
	existingID string

	recent   int64
	oldest   time.Time
	countErr error

	sent    []store.MarkContactMessageSentParams
	failed  []store.MarkContactMessageFailedParams
	markErr error
}

func (q *stubQueries) InsertContactMessage(_ context.Context,
	arg store.InsertContactMessageParams,
) (string, error) {
	if q.insertErr != nil {
		return "", q.insertErr
	}
	if q.existingID != "" {
		return "", pgx.ErrNoRows
	}
	q.inserted = append(q.inserted, arg)
	return arg.ID, nil
}

func (q *stubQueries) FindContactMessageID(_ context.Context,
	_ store.FindContactMessageIDParams,
) (string, error) {
	if q.existingID == "" {
		return "", pgx.ErrNoRows
	}
	return q.existingID, nil
}

func (q *stubQueries) CountRecentContactMessages(_ context.Context,
	_ store.CountRecentContactMessagesParams,
) (store.CountRecentContactMessagesRow, error) {
	if q.countErr != nil {
		return store.CountRecentContactMessagesRow{}, q.countErr
	}
	row := store.CountRecentContactMessagesRow{Recent: q.recent}
	if !q.oldest.IsZero() {
		row.Oldest = pgtype.Timestamptz{Time: q.oldest, Valid: true}
	}
	return row, nil
}

func (q *stubQueries) MarkContactMessageSent(_ context.Context,
	arg store.MarkContactMessageSentParams,
) error {
	q.sent = append(q.sent, arg)
	return q.markErr
}

func (q *stubQueries) MarkContactMessageFailed(_ context.Context,
	arg store.MarkContactMessageFailedParams,
) error {
	q.failed = append(q.failed, arg)
	return q.markErr
}

type stubSender struct {
	sent []mail.Message
	err  error
}

func (s *stubSender) From() string { return "contact@timseil.dev" }

func (s *stubSender) Send(_ context.Context, m mail.Message) error {
	if s.err != nil {
		return s.err
	}
	s.sent = append(s.sent, m)
	return nil
}

func newHandler(t *testing.T, q Queries, sender mail.Sender) *Handler {
	t.Helper()

	h := New(q, sender, "inbox@timseil.dev", testPepper,
		[]string{"https://timseil.dev", "http://localhost:3000"},
		middleware.NewClientIP(nil),
		NewBudget(testNow),
		slog.New(slog.NewTextHandler(io.Discard, nil)))
	h.now = func() time.Time { return testNow }
	return h
}

func body(overrides map[string]any) map[string]any {
	base := map[string]any{
		"name":    "Anna Keller",
		"email":   "anna@example.org",
		"message": "Hallo, ich hätte eine Frage zu einem der Systeme auf dieser Seite.",
		"company": "",
		"dwellMs": 4200,
		"ts":      testNow.Format(time.RFC3339),
	}
	for k, v := range overrides {
		base[k] = v
	}
	return base
}

func post(t *testing.T, h *Handler, payload map[string]any, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()

	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("encoding the payload: %v", err)
	}
	return postRaw(t, h, string(encoded), headers)
}

func postRaw(t *testing.T, h *Handler, payload string, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()

	r := httptest.NewRequest(http.MethodPost, "/api/contact", strings.NewReader(payload))
	r.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		if v == "" {
			r.Header.Del(k)
			continue
		}
		r.Header.Set(k, v)
	}
	r.RemoteAddr = "203.0.113.7:51000"
	r = r.WithContext(reqid.With(r.Context(), testRequestID))

	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func receiptOf(t *testing.T, w *httptest.ResponseRecorder) httpx.ContactAccepted {
	t.Helper()

	if w.Code != http.StatusAccepted {
		t.Fatalf("status %d, want 202\n%s", w.Code, w.Body.String())
	}
	var out httpx.ContactAccepted
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("the 202 body does not decode: %v\n%s", err, w.Body.String())
	}
	return out
}

func problem(t *testing.T, w *httptest.ResponseRecorder, status int) httpx.Problem {
	t.Helper()

	if w.Code != status {
		t.Fatalf("status %d, want %d\n%s", w.Code, status, w.Body.String())
	}
	if got := w.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("content type %q, want application/problem+json", got)
	}
	var out httpx.Problem
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("the problem body does not decode: %v\n%s", err, w.Body.String())
	}
	if out.RequestId == nil || *out.RequestId != testRequestID {
		t.Errorf("requestId = %v, want %q", out.RequestId, testRequestID)
	}
	return out
}

// ------------------------------------------------------------------ accepted

func TestAValidSubmissionIsStoredAndSent(t *testing.T) {
	q := &stubQueries{}
	sender := &stubSender{}
	h := newHandler(t, q, sender)

	receipt := receiptOf(t, post(t, h, body(nil), nil))

	if !bool(receipt.Ok) || !strings.HasPrefix(receipt.Id, "msg_") {
		t.Errorf("receipt = %+v", receipt)
	}
	if len(q.inserted) != 1 {
		t.Fatalf("%d rows inserted, want 1", len(q.inserted))
	}
	if len(sender.sent) != 1 {
		t.Fatalf("%d messages sent, want 1", len(sender.sent))
	}
	if len(q.sent) != 1 || q.sent[0].ID != receipt.Id {
		t.Errorf("the row was not marked sent with the receipt: %+v", q.sent)
	}
}

// The one rule OVH imposes on everything this service sends. The visitor is the
// Reply-To and never the From — an envelope sender this domain is not
// authorised for is what SPF exists to reject.
func TestTheVisitorIsTheReplyToAndNothingElse(t *testing.T) {
	sender := &stubSender{}
	h := newHandler(t, &stubQueries{}, sender)

	post(t, h, body(nil), nil)

	m := sender.sent[0]
	if m.From != "contact@timseil.dev" {
		t.Errorf("From = %q, want the authenticated account", m.From)
	}
	if m.ReplyTo != "anna@example.org" {
		t.Errorf("Reply-To = %q", m.ReplyTo)
	}
	if m.To != "inbox@timseil.dev" {
		t.Errorf("To = %q", m.To)
	}
	if !strings.Contains(m.Subject, "Anna Keller") {
		t.Errorf("Subject = %q", m.Subject)
	}
	if !strings.Contains(m.Body, "Frage zu einem der Systeme") {
		t.Errorf("the message text is not in the body:\n%s", m.Body)
	}
}

func TestTheReceiptIsTheRowID(t *testing.T) {
	q := &stubQueries{}
	sender := &stubSender{}
	h := newHandler(t, q, sender)

	receipt := receiptOf(t, post(t, h, body(nil), nil))

	if q.inserted[0].ID != receipt.Id {
		t.Errorf("the row id is %q and the receipt is %q — the visitor cannot quote it",
			q.inserted[0].ID, receipt.Id)
	}
	if !strings.HasPrefix(sender.sent[0].MessageID, receipt.Id+"@") {
		t.Errorf("the Message-ID %q does not carry the receipt", sender.sent[0].MessageID)
	}
}

func TestTheAnswerIsNeverCached(t *testing.T) {
	h := newHandler(t, &stubQueries{}, &stubSender{})
	w := post(t, h, body(nil), nil)

	if got := w.Header().Get("Cache-Control"); got != string(cacheControl) {
		t.Errorf("Cache-Control = %q, want %q", got, cacheControl)
	}
}

// The double click. One button press is one mail, and the visitor gets the
// receipt they were given the first time rather than a new one for a message
// that was only ever sent once.
func TestARepeatedSubmissionIsNotSentTwice(t *testing.T) {
	q := &stubQueries{existingID: "msg_THEFIRSTONE00"}
	sender := &stubSender{}
	h := newHandler(t, q, sender)

	receipt := receiptOf(t, post(t, h, body(nil), nil))

	if receipt.Id != "msg_THEFIRSTONE00" {
		t.Errorf("receipt = %q, want the first one", receipt.Id)
	}
	if len(sender.sent) != 0 {
		t.Errorf("%d messages sent for a repeat, want 0", len(sender.sent))
	}
}

// ----------------------------------------------------------------- discarded

// The fifth answer path. A filled honeypot gets a receipt that leads nowhere:
// no row, no mail, and nothing a bot can tell apart from success — which is the
// point, because a 400 would name the rule that caught it.
func TestAFilledHoneypotLooksExactlyLikeSuccess(t *testing.T) {
	q := &stubQueries{}
	sender := &stubSender{}
	h := newHandler(t, q, sender)

	honest := receiptOf(t, post(t, h, body(nil), nil))
	trapped := receiptOf(t, post(t, h, body(map[string]any{"company": "Acme Inc"}), nil))

	if !bool(trapped.Ok) {
		t.Error("the discarded answer is distinguishable by ok")
	}
	if len(trapped.Id) != len(honest.Id) || !strings.HasPrefix(trapped.Id, "msg_") {
		t.Errorf("the discarded receipt %q is shaped differently from %q", trapped.Id, honest.Id)
	}
	if len(q.inserted) != 1 {
		t.Errorf("%d rows inserted, want only the honest one", len(q.inserted))
	}
	if len(sender.sent) != 1 {
		t.Errorf("%d messages sent, want only the honest one", len(sender.sent))
	}
}

func TestATooFastSubmissionIsDiscardedSilently(t *testing.T) {
	q := &stubQueries{}
	sender := &stubSender{}
	h := newHandler(t, q, sender)

	receiptOf(t, post(t, h, body(map[string]any{"dwellMs": minDwell - 1}), nil))

	if len(q.inserted) != 0 || len(sender.sent) != 0 {
		t.Error("a submission under the dwell floor was stored or sent")
	}
}

// The floor is a floor, not a fence: exactly three seconds is a human.
func TestTheDwellFloorIsInclusive(t *testing.T) {
	q := &stubQueries{}
	h := newHandler(t, q, &stubSender{})

	receiptOf(t, post(t, h, body(map[string]any{"dwellMs": minDwell}), nil))

	if len(q.inserted) != 1 {
		t.Error("a submission at exactly the dwell floor was discarded")
	}
}

// A honeypot check that trimmed would let a browser's stray space through, and
// a hidden field a human never touches has no reason to hold one.
func TestAWhitespaceHoneypotIsStillAHoneypot(t *testing.T) {
	q := &stubQueries{}
	h := newHandler(t, q, &stubSender{})

	receiptOf(t, post(t, h, body(map[string]any{"company": " "}), nil))

	if len(q.inserted) != 0 {
		t.Error("a honeypot holding a space was treated as empty")
	}
}

// ------------------------------------------------------------------ rejected

func TestAShortMessageIsRejectedWithItsField(t *testing.T) {
	h := newHandler(t, &stubQueries{}, &stubSender{})
	w := post(t, h, body(map[string]any{"message": "zu kurz"}), nil)

	p := problem(t, w, http.StatusBadRequest)
	if p.Type != httpx.TypeValidationFailed {
		t.Errorf("type = %q", p.Type)
	}
	if p.InvalidParams == nil || len(*p.InvalidParams) != 1 ||
		(*p.InvalidParams)[0].Name != "message" {
		t.Fatalf("invalidParams = %+v, want one entry for message", p.InvalidParams)
	}
}

func TestEveryBadFieldGetsItsOwnEntry(t *testing.T) {
	h := newHandler(t, &stubQueries{}, &stubSender{})
	w := post(t, h, body(map[string]any{
		"name":    "A",
		"email":   "anna@example",
		"message": "kurz",
	}), nil)

	p := problem(t, w, http.StatusBadRequest)
	if p.InvalidParams == nil {
		t.Fatal("invalidParams is absent")
	}
	var names []string
	for _, entry := range *p.InvalidParams {
		names = append(names, entry.Name)
	}
	if strings.Join(names, ",") != "name,email,message" {
		t.Errorf("invalidParams names = %v, want name, email, message in form order", names)
	}
}

// The header injection, as the endpoint sees it. Mutation-checked: remove the
// containsControl branch from validate and this goes from 400 to a 500 raised by
// mail.Build — still refused, but by the wrong layer and with no field named.
func TestACarriageReturnInTheAddressIsRejected(t *testing.T) {
	q := &stubQueries{}
	sender := &stubSender{}
	h := newHandler(t, q, sender)

	w := post(t, h, body(map[string]any{
		"email": "anna@example.org\r\nBcc: everyone@example.net",
	}), nil)

	p := problem(t, w, http.StatusBadRequest)
	if p.InvalidParams == nil || (*p.InvalidParams)[0].Name != "email" {
		t.Fatalf("invalidParams = %+v, want an entry for email", p.InvalidParams)
	}
	if len(q.inserted) != 0 || len(sender.sent) != 0 {
		t.Error("a header injection was stored or sent")
	}
}

func TestALineBreakInTheNameIsRejected(t *testing.T) {
	// The name becomes the Subject, which is the second header a stranger
	// controls. Appendix F of the build plan asks for both.
	h := newHandler(t, &stubQueries{}, &stubSender{})
	w := post(t, h, body(map[string]any{"name": "Anna\r\nBcc: everyone@example.net"}), nil)

	p := problem(t, w, http.StatusBadRequest)
	if p.InvalidParams == nil || (*p.InvalidParams)[0].Name != "name" {
		t.Fatalf("invalidParams = %+v, want an entry for name", p.InvalidParams)
	}
}

// A problem document that quotes what an attacker sent is a reflection vector
// looking for a renderer.
func TestTheAnswerNeverEchoesWhatWasSent(t *testing.T) {
	h := newHandler(t, &stubQueries{}, &stubSender{})
	w := post(t, h, body(map[string]any{
		"name":  "<script>alert(1)</script>",
		"email": "anna@example.org\r\nBcc: everyone@example.net",
	}), nil)

	answer := w.Body.String()
	for _, forbidden := range []string{"script", "Bcc", "example.net"} {
		if strings.Contains(answer, forbidden) {
			t.Errorf("the answer echoes %q back:\n%s", forbidden, answer)
		}
	}
}

func TestADisplayNameInTheAddressIsRejected(t *testing.T) {
	// `format: email` in the contract is annotation, not validation. Every
	// OpenAPI validator passes this and net/mail parses it into a display name
	// plus an address — a second place for a stranger's text in a header.
	h := newHandler(t, &stubQueries{}, &stubSender{})
	w := post(t, h, body(map[string]any{"email": `"Anna" <anna@example.org>`}), nil)

	problem(t, w, http.StatusBadRequest)
}

func TestAFormPostIsRefused(t *testing.T) {
	// The content type is a security control, not tidiness: a cross-origin
	// <form> can send urlencoded, text/plain or multipart with no preflight at
	// all, and it cannot send application/json.
	h := newHandler(t, &stubQueries{}, &stubSender{})

	for _, contentType := range []string{
		"application/x-www-form-urlencoded",
		"text/plain",
		"multipart/form-data; boundary=x",
		"",
	} {
		w := postRaw(t, h, `{}`, map[string]string{"Content-Type": contentType})
		if w.Code != http.StatusBadRequest {
			t.Errorf("Content-Type %q gave %d, want 400", contentType, w.Code)
		}
	}
}

func TestAParameterisedJSONContentTypeIsAccepted(t *testing.T) {
	h := newHandler(t, &stubQueries{}, &stubSender{})
	w := post(t, h, body(nil), map[string]string{
		"Content-Type": "application/json; charset=utf-8",
	})

	if w.Code != http.StatusAccepted {
		t.Errorf("status %d, want 202", w.Code)
	}
}

func TestAMalformedBodyIsRejectedWithoutDetail(t *testing.T) {
	h := newHandler(t, &stubQueries{}, &stubSender{})
	w := postRaw(t, h, `{"name": `, nil)

	p := problem(t, w, http.StatusBadRequest)
	if p.Detail != nil && strings.Contains(*p.Detail, "unexpected end") {
		t.Errorf("the decoder's own message reached the visitor: %q", *p.Detail)
	}
}

// ------------------------------------------------------------------- origins

func TestASubmissionFromAnotherOriginIsRefused(t *testing.T) {
	q := &stubQueries{}
	h := newHandler(t, q, &stubSender{})

	w := post(t, h, body(nil), map[string]string{"Origin": "https://evil.example"})

	p := problem(t, w, http.StatusBadRequest)
	if p.InvalidParams != nil {
		t.Errorf("invalidParams is present on an origin refusal: %+v", p.InvalidParams)
	}
	if len(q.inserted) != 0 {
		t.Error("a submission from an unlisted origin was stored")
	}
}

func TestASubmissionFromOurOwnOriginGoesThrough(t *testing.T) {
	h := newHandler(t, &stubQueries{}, &stubSender{})

	for _, origin := range []string{"https://timseil.dev", "http://localhost:3000"} {
		w := post(t, h, body(nil), map[string]string{"Origin": origin})
		if w.Code != http.StatusAccepted {
			t.Errorf("origin %q gave %d, want 202", origin, w.Code)
		}
	}
}

// curl, a CI job and a generated client send no Origin at all, and this site's
// whole argument is that its numbers can be checked without asking permission.
func TestARequestWithNoOriginIsAllowed(t *testing.T) {
	h := newHandler(t, &stubQueries{}, &stubSender{})
	w := post(t, h, body(nil), map[string]string{"Origin": ""})

	if w.Code != http.StatusAccepted {
		t.Errorf("status %d, want 202 — a caller without a browser is still a caller", w.Code)
	}
}

// ----------------------------------------------------------------- throttled

func TestTheFloorRefusesTheFourthMessage(t *testing.T) {
	q := &stubQueries{recent: rateLimit, oldest: testNow.Add(-9 * time.Minute)}
	h := newHandler(t, q, &stubSender{})

	w := post(t, h, body(nil), nil)

	p := problem(t, w, http.StatusTooManyRequests)
	if p.Type != httpx.TypeRateLimited {
		t.Errorf("type = %q", p.Type)
	}
	if len(q.inserted) != 0 {
		t.Error("a throttled submission was stored")
	}
}

// Retry-After is measured from the oldest message still in the window. A flat
// ten minutes would be wrong for everyone who submitted nine minutes ago, and a
// wait a client cannot see coming is a wait it does not take.
func TestTheWaitIsMeasuredNotGuessed(t *testing.T) {
	q := &stubQueries{recent: rateLimit, oldest: testNow.Add(-9 * time.Minute)}
	h := newHandler(t, q, &stubSender{})

	w := post(t, h, body(nil), nil)

	problem(t, w, http.StatusTooManyRequests)
	if got := w.Header().Get("Retry-After"); got != "60" {
		t.Errorf("Retry-After = %q, want 60 — a minute of the window is left", got)
	}
}

func TestTheThirdMessageStillGoesThrough(t *testing.T) {
	q := &stubQueries{recent: rateLimit - 1, oldest: testNow.Add(-time.Minute)}
	h := newHandler(t, q, &stubSender{})

	if w := post(t, h, body(nil), nil); w.Code != http.StatusAccepted {
		t.Errorf("status %d, want 202 — the limit is three, not two", w.Code)
	}
}

// -------------------------------------------------------------------- 502

func TestARefusedRelayAnswers502AndKeepsTheMessage(t *testing.T) {
	q := &stubQueries{}
	sender := &stubSender{err: errors.New("451 the relay was busy")}
	h := newHandler(t, q, sender)

	w := post(t, h, body(nil), nil)

	p := problem(t, w, http.StatusBadGateway)
	if p.Type != httpx.TypeMailProviderUnavailable {
		t.Errorf("type = %q, want %q", p.Type, httpx.TypeMailProviderUnavailable)
	}
	if len(q.inserted) != 1 {
		t.Error("the message was not stored — a 502 must not lose it")
	}
	if len(q.failed) != 1 || q.failed[0].DeliveryStatus != "queued" {
		t.Fatalf("the row is %+v, want queued for the dispatcher", q.failed)
	}
	if p.Detail == nil || !strings.Contains(*p.Detail, "Nothing was lost") {
		t.Errorf("the visitor is not told the message survived: %v", p.Detail)
	}
}

// A permanent refusal is not worth five more attempts with the same credential
// for the same answer.
func TestAPermanentRefusalGivesUpImmediately(t *testing.T) {
	q := &stubQueries{}
	sender := &stubSender{err: fmt.Errorf("%w: 550 no such mailbox", mail.ErrPermanent)}
	h := newHandler(t, q, sender)

	problem(t, post(t, h, body(nil), nil), http.StatusBadGateway)

	if len(q.failed) != 1 || q.failed[0].DeliveryStatus != "failed" {
		t.Fatalf("the row is %+v, want failed", q.failed)
	}
}

// The relay's own words go to last_error and to the log; the visitor gets a
// sentence. And last_error is one line, because the column is read by a person
// looking for a reason rather than a transcript.
func TestTheRelaysWordsStayOutOfTheAnswer(t *testing.T) {
	q := &stubQueries{}
	sender := &stubSender{err: errors.New("550 5.7.1 rejected by\r\npolicy engine")}
	h := newHandler(t, q, sender)

	w := post(t, h, body(nil), nil)

	if strings.Contains(w.Body.String(), "policy engine") {
		t.Errorf("the relay's message reached the visitor:\n%s", w.Body.String())
	}
	if q.failed[0].LastError == nil {
		t.Fatal("last_error was not recorded")
	}
	if strings.ContainsAny(*q.failed[0].LastError, "\r\n") {
		t.Errorf("last_error carries a line break: %q", *q.failed[0].LastError)
	}
}

// The one case where the mail is gone and only the bookkeeping failed.
// Answering 502 would invite a resend of a message that has already been
// delivered.
func TestAFailedMarkAfterAGoodSendIsStill202(t *testing.T) {
	q := &stubQueries{markErr: errors.New("the pool is gone")}
	h := newHandler(t, q, &stubSender{})

	if w := post(t, h, body(nil), nil); w.Code != http.StatusAccepted {
		t.Errorf("status %d, want 202 — the message was delivered", w.Code)
	}
}

// ------------------------------------------------------------------- budget

// The acceptance criterion of this phase: the limit bites before OVH's quota
// does. Spending the budget is not an outage — the row is stored and the
// dispatcher carries it out.
func TestASpentBudgetQueuesInsteadOfSending(t *testing.T) {
	q := &stubQueries{}
	sender := &stubSender{}
	h := newHandler(t, q, sender)

	for range sendBudgetPerHour {
		h.budget.take(testNow)
	}

	receipt := receiptOf(t, post(t, h, body(nil), nil))

	if receipt.Id == "" {
		t.Error("no receipt was handed out")
	}
	if len(q.inserted) != 1 {
		t.Error("the message was not stored")
	}
	if len(sender.sent) != 0 {
		t.Errorf("%d messages sent past the budget, want 0", len(sender.sent))
	}
	if len(q.sent) != 0 {
		t.Error("a message that was never sent was marked sent")
	}
}

// ---------------------------------------------------------------- the ip hash

func TestTheStoredAddressIsThirtyTwoPepperedBytes(t *testing.T) {
	q := &stubQueries{}
	h := newHandler(t, q, &stubSender{})

	post(t, h, body(nil), nil)

	stored := q.inserted[0].IpHash
	if len(stored) != 32 {
		t.Fatalf("ip_hash is %d bytes, want 32 — the column check refuses anything else",
			len(stored))
	}
	if strings.Contains(string(stored), "203.0.113") {
		t.Error("the address is stored in the clear")
	}

	// A different pepper over the same address has to give a different digest,
	// or the pepper is decoration.
	other := New(q, &stubSender{}, "inbox@timseil.dev",
		[]byte("fedcba9876543210fedcba9876543210"), nil,
		middleware.NewClientIP(nil), NewBudget(testNow),
		slog.New(slog.NewTextHandler(io.Discard, nil)))
	other.now = func() time.Time { return testNow }
	post(t, other, body(map[string]any{"ts": testNow.Add(time.Second).Format(time.RFC3339)}), nil)

	if string(q.inserted[1].IpHash) == string(stored) {
		t.Error("two peppers produced the same digest — CONTACT_IP_PEPPER does nothing")
	}
}

// --------------------------------------------------------------------- 500

func TestAnUnreachableDatabaseIsAnInternalError(t *testing.T) {
	q := &stubQueries{insertErr: errors.New("the pool is gone")}
	h := newHandler(t, q, &stubSender{})

	p := problem(t, post(t, h, body(nil), nil), http.StatusInternalServerError)
	if p.Type != httpx.TypeInternalError {
		t.Errorf("type = %q", p.Type)
	}
	if p.Detail != nil && strings.Contains(*p.Detail, "pool") {
		t.Errorf("the driver's message reached the visitor: %q", *p.Detail)
	}
}

// The receipt is not a sequence number. Two submissions in the same millisecond
// need to differ, and the contract's ten-character example cannot.
func TestTwoReceiptsInTheSameInstantDiffer(t *testing.T) {
	seen := make(map[string]bool, 1000)
	for range 1000 {
		id := newID(testNow)
		if seen[id] {
			t.Fatalf("%q was handed out twice", id)
		}
		seen[id] = true
	}
}

func TestAReceiptIsReadableAloud(t *testing.T) {
	// Crockford's alphabet, so there is no pair of characters a person can
	// confuse while reading an id off a screen into a mail — which is the only
	// thing a receipt is for.
	id := strings.TrimPrefix(newID(testNow), idPrefix)

	if len(id) != idTimeChars+idRandomChars {
		t.Fatalf("the receipt is %d characters, want %d", len(id), idTimeChars+idRandomChars)
	}
	if strings.ContainsAny(id, "ILOU") {
		t.Errorf("%q uses a character Crockford's alphabet leaves out", id)
	}
}
