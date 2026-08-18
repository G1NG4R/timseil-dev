package contact

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/netip"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/mail"
	"github.com/G1NG4R/timseil-dev/api/internal/middleware"
	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// cacheControl is the contract's, never a literal. ADR 0009 puts the directive
// in the document so a handler cannot invent one; the contract test holds this
// constant against it.
const cacheControl = httpx.CacheControlNone

// maxBodyBytes bounds what an unauthenticated stranger can make this process
// allocate. The largest lawful body is a 4000-rune message plus five short
// fields — under 20 KB even with every rune four bytes wide. 64 KB leaves room
// and is still nothing.
const maxBodyBytes = 64 << 10

// Queries is the slice of the store this endpoint needs. Narrow on purpose: it
// is what lets every one of the five answers be tested without Postgres.
type Queries interface {
	InsertContactMessage(ctx context.Context, arg store.InsertContactMessageParams) (string, error)
	FindContactMessageID(ctx context.Context, arg store.FindContactMessageIDParams) (string, error)
	CountRecentContactMessages(ctx context.Context, arg store.CountRecentContactMessagesParams) (
		store.CountRecentContactMessagesRow, error)
	MarkContactMessageSent(ctx context.Context, arg store.MarkContactMessageSentParams) error
	MarkContactMessageFailed(ctx context.Context, arg store.MarkContactMessageFailedParams) error
}

// Handler serves POST /api/contact.
type Handler struct {
	queries Queries
	sender  mail.Sender
	to      string
	pepper  []byte

	// origins is the allowlist from CORS_ALLOWED_ORIGINS, lowercased. ADR 0015
	// §1: the read paths answer any origin because the argument of this site is
	// "check it yourself", and that argument does not extend to a write.
	origins map[string]bool

	client middleware.ClientIP
	budget *Budget

	// now is injected because three things here are decided by the clock — the
	// receipt, the Date header and the rate-limit window — and a handler tested
	// against the wall clock is a handler tested once.
	now func() time.Time

	log *slog.Logger
}

// New builds the handler. to is the inbox; sender decides whether a message
// reaches it or a log line.
func New(q Queries, sender mail.Sender, to string, pepper []byte, origins []string,
	client middleware.ClientIP, budget *Budget, log *slog.Logger,
) *Handler {
	set := make(map[string]bool, len(origins))
	for _, origin := range origins {
		set[strings.ToLower(origin)] = true
	}

	return &Handler{
		queries: q,
		sender:  sender,
		to:      to,
		pepper:  pepper,
		origins: set,
		client:  client,
		budget:  budget,
		now:     time.Now,
		log:     log,
	}
}

// The failures, as sentinels carrying what the problem document needs. Each one
// is its own type rather than a shared "bad request": a 400 needs the field
// list, a 429 needs the wait, and a 502 needs neither — and the mapping in
// writeError is then a switch a reader can check against the contract.
type (
	invalidBody   struct{ params []httpx.InvalidParam }
	foreignOrigin struct{}
	throttled     struct{ retryAfter time.Duration }
)

func (e *invalidBody) Error() string   { return "the submission did not validate" }
func (e *foreignOrigin) Error() string { return "the Origin is not on the allowlist" }
func (e *throttled) Error() string     { return "too many submissions from this address" }

// errRelayUnavailable is the 502. It is deliberately not the relay's own words:
// those go to last_error and to the log, and what a visitor is shown is a
// sentence they can act on.
var errRelayUnavailable = errors.New("the mail provider did not accept the message")

// wireBody is ContactRequest with the address as a plain string, and it exists
// because of a measured surprise rather than a preference.
//
// oapi-codegen types `email` as openapi_types.Email, which carries an
// UnmarshalJSON that does two things this endpoint must not delegate. It refuses
// an address that fails its own regex — so `anna@example.org\r\nBcc: …` comes
// back as "not a valid ContactRequest document" and the answer no longer names
// the field, against the contract's own rule that invalidParams is one entry per
// rejected field. And it *normalises*: `"Anna" <anna@example.org>` decodes to
// `anna@example.org`, so what gets stored is not what was sent, and the display
// name is stripped by a library rather than refused by a rule.
//
// Neither is a hole — both end in a refusal — but both put the decision in
// generated code that a regeneration could change without a test noticing. So
// the body is decoded as written and validate makes every call.
//
// The other five fields keep their generated types: a bad `ts` or `dwellMs` is a
// type error, which is a different answer from a bad value and is correctly a
// whole-document refusal.
type wireBody struct {
	Name    string    `json:"name"`
	Email   string    `json:"email"`
	Message string    `json:"message"`
	Company string    `json:"company"`
	DwellMs int       `json:"dwellMs"`
	Ts      time.Time `json:"ts"`
}

func (w wireBody) contactRequest() httpx.SubmitContactJSONRequestBody {
	return httpx.ContactRequest{
		Name:    w.Name,
		Email:   openapi_types.Email(w.Email),
		Message: w.Message,
		Company: w.Company,
		DwellMs: w.DwellMs,
		Ts:      w.Ts,
	}
}

// facts are what the strict signature cannot carry.
//
// SubmitContact takes a context and a decoded body, which is the shape C7's
// generated router calls; the origin and the client address live in the request
// itself. Rather than give this package a second entry point, ServeHTTP puts
// them in the context — the same way internal/reqid carries the request id
// through code that never sees an *http.Request.
type facts struct {
	origin string
	client netip.Addr

	// known is false in exactly one case: a trusted proxy that forwarded no
	// usable address. See the comment at the rate-limit check.
	known bool
}

type factsKey struct{}

func withFacts(ctx context.Context, f facts) context.Context {
	return context.WithValue(ctx, factsKey{}, f)
}

func factsFrom(ctx context.Context) facts {
	f, _ := ctx.Value(factsKey{}).(facts)
	return f
}

// ServeHTTP adapts the strict signature to a route, and does the two things that
// signature cannot: it reads the request's own headers, and it decodes the body.
// It is what the generated router replaces in C7.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// A write endpoint takes JSON and nothing else, and the strictness is worth
	// more than protocol tidiness. A cross-origin <form> can send
	// application/x-www-form-urlencoded, text/plain or multipart without ever
	// triggering a preflight; it cannot send application/json. Refusing
	// everything else is therefore the layer that makes the Origin check below
	// enforceable rather than advisory.
	if !isJSON(r.Header.Get("Content-Type")) {
		h.writeError(w, r, &invalidBody{params: []httpx.InvalidParam{{
			Name:   "Content-Type",
			Reason: "must be application/json",
		}}})
		return
	}

	var wire wireBody
	decoder := json.NewDecoder(io.LimitReader(r.Body, maxBodyBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&wire); err != nil {
		// The decoder's message is not passed on. It names types and offsets,
		// which helps nobody filling in a form and tells whoever is probing
		// exactly which field their payload reached.
		h.writeError(w, r, &invalidBody{params: []httpx.InvalidParam{{
			Name:   "body",
			Reason: "not a valid ContactRequest document",
		}}})
		return
	}
	body := wire.contactRequest()

	addr, known := h.client.Resolve(r)
	ctx := withFacts(r.Context(), facts{
		origin: r.Header.Get("Origin"),
		client: addr,
		known:  known,
	})

	resp, err := h.SubmitContact(ctx, httpx.SubmitContactRequestObject{Body: &body})
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	if err := resp.VisitSubmitContactResponse(w); err != nil {
		h.log.Error("writing the contact response", "err", err)
	}
}

// SubmitContact carries the signature of httpx.StrictServerInterface.
func (h *Handler) SubmitContact(ctx context.Context, req httpx.SubmitContactRequestObject) (
	httpx.SubmitContactResponseObject, error,
) {
	if req.Body == nil {
		return nil, &invalidBody{params: []httpx.InvalidParam{{
			Name: "body", Reason: "required",
		}}}
	}

	f := factsFrom(ctx)
	now := h.now()

	// The origin check, and the one case it lets through.
	//
	// A request with no Origin at all is allowed: curl, a CI job and a
	// generated client are legitimate callers of a public API, and this site's
	// whole argument is that its numbers can be checked without asking. A
	// request that states an origin and states one that is not ours is a
	// browser on somebody else's page, which is the case worth refusing.
	//
	// 400 rather than a silent discard. A silent one would be tighter against
	// bots and would turn a frontend deployed on a new hostname into a data
	// grave nobody notices; the WARN below is the thing that gets read.
	if f.origin != "" && !h.origins[strings.ToLower(f.origin)] {
		h.log.Warn("contact submission from an unlisted origin",
			"request_id", reqid.From(ctx), "origin", f.origin)
		return nil, &foreignOrigin{}
	}

	sub, decision, invalid := validate(*req.Body, now)
	switch decision {
	case rejected:
		return nil, &invalidBody{params: invalid}

	case discarded:
		// The fifth answer path. No row, no mail, and a receipt that is
		// well-formed and leads nowhere, so that a bot cannot tell this apart
		// from success and tune its way past the rule that caught it.
		reason := "dwell"
		if req.Body.Company != "" {
			reason = "honeypot"
		}
		h.log.Warn("contact submission discarded",
			"request_id", reqid.From(ctx), "reason", reason,
			"client", h.label(f), "dwell_ms", req.Body.DwellMs)
		return accepted202(newID(now)), nil
	}

	// The rate-limit floor. The token bucket in front of this route has already
	// counted the request — including every discarded one, which is the half of
	// the rule this query cannot see, because a discarded submission is never
	// stored. This half is the one that survives a restart and a second
	// instance.
	//
	// Skipped when the address is unknown, which happens only behind a trusted
	// proxy that forwarded nothing usable. Attributing every visitor to the
	// proxy would let the fourth person in ten minutes be refused, and the site
	// would lose its only conversion point to a misconfiguration. Fails open,
	// and the limiter has already logged why.
	ipHash := h.hashClient(f)
	if f.known {
		if wait, err := h.overLimit(ctx, ipHash, now); err != nil {
			return nil, err
		} else if wait > 0 {
			h.log.Warn("contact rate limit exceeded",
				"request_id", reqid.From(ctx), "client", h.label(f),
				"retry_after", wait.String())
			return nil, &throttled{retryAfter: wait}
		}
	}

	id, fresh, err := h.store(ctx, sub, ipHash, now)
	if err != nil {
		return nil, err
	}
	if !fresh {
		// The double click. The row is already there and has already been sent
		// or queued; sending again would deliver the same message twice for one
		// button press. The visitor gets the receipt they were given the first
		// time.
		h.log.Info("contact submission is a repeat", "request_id", reqid.From(ctx), "id", id)
		return accepted202(id), nil
	}

	outgoing := message(id, h.sender.From(), h.to, sub, now, now)

	// The hourly ceiling, which is what stands between this service and OVH's
	// quota. Spent means the message stays queued and the dispatcher carries it
	// out later — the visitor is told it was accepted, which is true.
	if !h.budget.take(now) {
		h.log.Warn("contact send budget spent — queued for the dispatcher",
			"request_id", reqid.From(ctx), "id", id)
		return accepted202(id), nil
	}

	if err := h.sender.Send(ctx, outgoing); err != nil {
		h.markFailed(ctx, id, err)
		h.log.Error("contact mail was not accepted",
			"request_id", reqid.From(ctx), "id", id, "err", err)
		return nil, errRelayUnavailable
	}

	// Detached for the same reason as the failure path, and with more at stake:
	// the mail is already gone, so a cancelled request here means a delivered
	// message stays queued and goes out a second time.
	markCtx, cancelMark := context.WithTimeout(context.WithoutCancel(ctx), bookkeepingTimeout)
	defer cancelMark()

	if err := h.queries.MarkContactMessageSent(markCtx, store.MarkContactMessageSentParams{
		ID:            id,
		MailMessageID: &outgoing.MessageID,
	}); err != nil {
		// The mail is gone; only the bookkeeping failed. Answering 502 here
		// would invite a resend of a message that has already been delivered,
		// so this is a 202 with a loud log line — the row stays 'queued' and the
		// dispatcher may send a duplicate, which is the lesser of the two.
		h.log.Error("contact mail was sent but the row was not marked",
			"request_id", reqid.From(ctx), "id", id, "err", err)
	}

	h.log.Info("contact message delivered", "request_id", reqid.From(ctx), "id", id)
	return accepted202(id), nil
}

// overLimit reports how long this address has to wait, or zero.
func (h *Handler) overLimit(ctx context.Context, ipHash []byte, now time.Time) (
	time.Duration, error,
) {
	row, err := h.queries.CountRecentContactMessages(ctx,
		store.CountRecentContactMessagesParams{
			IpHash:     ipHash,
			WindowSize: pgtype.Interval{Microseconds: RateLimitWindow.Microseconds(), Valid: true},
		})
	if err != nil {
		return 0, fmt.Errorf("counting recent contact messages: %w", err)
	}
	if row.Recent < RateLimit || !row.Oldest.Valid {
		return 0, nil
	}

	// Measured, not guessed: the window frees when the oldest message in it
	// falls out. A flat "ten minutes" would be wrong for everyone who submitted
	// nine minutes ago, and a wait a client cannot see coming is a wait it does
	// not take.
	wait := row.Oldest.Time.Add(RateLimitWindow).Sub(now)
	if wait < time.Second {
		wait = time.Second
	}
	return wait, nil
}

// store writes the row, or finds the one an identical submission already made.
//
// fresh is false for the second of two identical submissions. The caller uses it
// to decide whether to send, which is the whole point of the idempotency key:
// one button press, one mail.
func (h *Handler) store(ctx context.Context, sub submission, ipHash []byte, now time.Time) (
	id string, fresh bool, err error,
) {
	hash := sha256.Sum256([]byte(sub.message))

	id, err = h.queries.InsertContactMessage(ctx, store.InsertContactMessageParams{
		ID:          newID(now),
		ClientTs:    pgtype.Timestamptz{Time: sub.clientTs, Valid: true},
		Name:        sub.name,
		Email:       sub.email,
		Message:     sub.message,
		MessageHash: hash[:],
		IpHash:      ipHash,
		DwellMs:     sub.dwellMs,
	})
	switch {
	case err == nil:
		return id, true, nil
	case !errors.Is(err, pgx.ErrNoRows):
		return "", false, fmt.Errorf("storing the contact message: %w", err)
	}

	// No row came back, so the conflict target matched: this exact message from
	// this exact address at this exact client timestamp is already stored.
	id, err = h.queries.FindContactMessageID(ctx, store.FindContactMessageIDParams{
		ClientTs:    pgtype.Timestamptz{Time: sub.clientTs, Valid: true},
		Email:       sub.email,
		MessageHash: hash[:],
	})
	if err != nil {
		return "", false, fmt.Errorf("finding the existing contact message: %w", err)
	}
	return id, false, nil
}

func (h *Handler) markFailed(ctx context.Context, id string, cause error) {
	// Detached from the request. A visitor who closes the tab mid-send cancels
	// this context, and then the row would keep delivery_attempts = 0 for a
	// message the relay has already refused — it would be retried without its
	// counter ever advancing, and nothing would say why.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), bookkeepingTimeout)
	defer cancel()

	status := "queued"
	if errors.Is(cause, mail.ErrPermanent) {
		// A refusal retrying cannot fix. Five more attempts over half an hour
		// would put the same credential on the wire five more times for the
		// same answer.
		status = "failed"
	}

	reason := truncate(cause.Error())
	if err := h.queries.MarkContactMessageFailed(ctx, store.MarkContactMessageFailedParams{
		ID:             id,
		DeliveryStatus: status,
		LastError:      &reason,
	}); err != nil {
		h.log.Error("recording a failed contact delivery", "id", id, "err", err)
	}
}

// message turns a submission into a mail.
//
// One function for both paths. The handler builds the message it sends inline
// and the dispatcher builds the same message from the stored row; two
// constructors would be two chances for the retried mail to differ from the one
// the visitor was told about.
//
// The visitor's address is the Reply-To and nothing else. From is the
// authenticated account, because OVH requires the two to match and SPF would
// refuse anything else — and it is passed in from the sender rather than named
// here, so this function cannot get the rule wrong.
func message(id, from, to string, sub submission, received, now time.Time) mail.Message {
	return mail.Message{
		From:    from,
		To:      to,
		ReplyTo: sub.email,
		// The name goes in the subject, where a line break would fold the
		// header. validate refuses one and mail.Build refuses it again.
		Subject: "[timseil.dev] " + sub.name,
		Body:    renderBody(id, sub, received),
		// Derived from the receipt, so a quoted id finds the mail as well as
		// the row.
		MessageID: id + "@timseil.dev",
		Date:      now,
	}
}

// renderBody writes the plaintext an operator reads.
//
// Shared with the dispatcher, which rebuilds it from the stored row rather than
// keeping the built message anywhere: a rendered copy of the text would be a
// second thing to go stale, and the row already holds every field this is made
// of. So the two paths produce the same mail, and there is nowhere for them to
// disagree.
//
// Nothing here needs escaping. mail.Build base64-encodes the body, which makes
// whatever a visitor typed structurally incapable of becoming a header — a
// `Bcc:` on its own line comes out as an alphabet of sixty-four characters.
func renderBody(id string, sub submission, received time.Time) string {
	const rule = "----------------------------------------------------------------------"

	var body strings.Builder
	fmt.Fprintf(&body, "From:     %s <%s>\n", sub.name, sub.email)
	fmt.Fprintf(&body, "Received: %s\n", received.UTC().Format("2006-01-02 15:04:05 UTC"))
	fmt.Fprintf(&body, "Receipt:  %s\n", id)
	fmt.Fprintf(&body, "Dwell:    %.1fs\n", float64(sub.dwellMs)/1000)
	body.WriteString("\n" + rule + "\n")
	body.WriteString(sub.message)
	body.WriteString("\n" + rule + "\n")
	body.WriteString("\nReply to this mail — Reply-To is the sender's own address.\n")
	return body.String()
}

// hashClient turns the client address into the 32 bytes contact_messages.ip_hash
// wants.
//
// HMAC with a configured pepper, not a bare digest. IPv4 is 2^32 addresses, so
// an unkeyed SHA-256 is a spelling of the address and not a replacement for it —
// 00006_contact.sql says so in the column comment, and it is the reason
// CONTACT_IP_PEPPER exists. The rate limiter's key is random per process
// (ADR 0015 §3) because it labels a bucket forgotten in ten minutes; this one is
// written to a table that outlives every restart, so it has to be a value the
// deployment holds.
//
// The bucket, not the address: /32 for IPv4 and /64 for IPv6, the same unit the
// limiter counts in. Otherwise one visitor on IPv6 would be eighteen quintillion
// different people to the floor query.
func (h *Handler) hashClient(f facts) []byte {
	mac := hmac.New(sha256.New, h.pepper)
	_, _ = mac.Write([]byte(h.client.Bucket(f.client).String()))
	return mac.Sum(nil)
}

// label is what a log line is allowed to say about who submitted. Never the
// address: F1 makes that a rule, and the eight hex characters here are enough
// to tell two clients apart in a log and worth nothing to anyone reading it.
func (h *Handler) label(f facts) string {
	if !f.known {
		return "unattributed"
	}
	return fmt.Sprintf("%x", h.hashClient(f)[:4])
}

func accepted202(id string) httpx.SubmitContact202JSONResponse {
	directive := cacheControl
	return httpx.SubmitContact202JSONResponse{
		Body:    httpx.ContactAccepted{Ok: httpx.True, Id: id},
		Headers: httpx.SubmitContact202ResponseHeaders{CacheControl: &directive},
	}
}

func (h *Handler) writeError(w http.ResponseWriter, r *http.Request, err error) {
	var (
		body       *invalidBody
		foreign    *foreignOrigin
		throttling *throttled
	)

	switch {
	case errors.As(err, &body):
		httpx.WriteValidationProblem(w, r, "The submission did not validate.", body.params)

	case errors.As(err, &foreign):
		// No invalidParams: ADR 0009 says that array is one entry per rejected
		// *field*, and an Origin is not one. The detail is the whole answer.
		httpx.WriteValidationProblem(w, r,
			"This endpoint does not accept submissions from that origin.", nil)

	case errors.As(err, &throttling):
		httpx.WriteRateLimitProblem(w, r, throttling.retryAfter)

	case errors.Is(err, errRelayUnavailable):
		httpx.WriteProblem(w, r, http.StatusBadGateway, httpx.TypeMailProviderUnavailable,
			"Mail provider unavailable",
			"Your message was stored and will be delivered as soon as the provider "+
				"answers. Nothing was lost.")

	default:
		httpx.WriteInternalProblem(w, r, h.log, err)
	}
}

// isJSON accepts application/json with or without parameters, and nothing else.
func isJSON(header string) bool {
	media, _, _ := strings.Cut(header, ";")
	return strings.EqualFold(strings.TrimSpace(media), "application/json")
}

// truncate bounds what goes into last_error. What is long there is a relay
// transcript, not an explanation, and the column is read by a person looking for
// a reason rather than a log.
func truncate(s string) string {
	const limit = 300
	s = strings.TrimSpace(strings.Map(func(r rune) rune {
		if r == '\n' || r == '\r' || r == '\t' {
			return ' '
		}
		return r
	}, s))
	if len(s) > limit {
		return s[:limit] + "…"
	}
	return s
}

var _ http.Handler = (*Handler)(nil)
