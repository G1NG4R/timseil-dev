package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/G1NG4R/timseil-dev/api/internal/config"
	"github.com/G1NG4R/timseil-dev/api/internal/contact"
	"github.com/G1NG4R/timseil-dev/api/internal/health"
	"github.com/G1NG4R/timseil-dev/api/internal/mail"
	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
)

// stubDB stands in for the pool. The broken case is the interesting one, and it
// is the one that needs no database at all.
//
// Its query side always fails: these tests are about routing and the chain, and
// what /api/health answers on a working database belongs to the health package
// and to make check-db. What matters here is that the failure comes back as a
// problem document rather than as a panic.
type stubDB struct{ err error }

func (s stubDB) Ping(context.Context) error { return s.err }

func (s stubDB) Exec(context.Context, string, ...interface{}) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errNoDatabase
}

func (s stubDB) Query(context.Context, string, ...interface{}) (pgx.Rows, error) {
	return nil, errNoDatabase
}

func (s stubDB) QueryRow(context.Context, string, ...interface{}) pgx.Row {
	return failingRow{}
}

var errNoDatabase = errors.New("dial tcp 10.0.0.1:5432: connect: connection refused")

type failingRow struct{}

func (failingRow) Scan(...any) error { return errNoDatabase }

// testConfig is deliberately generous on the rate limit: these tests are about
// routing, and a limiter that bites halfway through would make them flaky in a
// way that looks like a routing bug.
func testConfig() config.Config {
	return config.Config{
		RequestTimeout: 5 * time.Second,
		RateLimit:      config.RateLimit{PerMinute: 6000, Burst: 1000},
		AllowedOrigins: []string{"https://timseil.dev"},
		Mail:           config.Mail{Transport: "log", Username: "contact@timseil.dev", To: "inbox@timseil.dev"},
		Contact:        config.Contact{IPPepper: "0123456789abcdef0123456789abcdef"},
		Internal: config.Internal{
			ProbeToken:  testProbeToken,
			DeployToken: testDeployToken,
		},
	}
}

// The two internal tokens as the assembled router sees them. Different from
// each other, because half of what the tests below prove is that one endpoint's
// token does not open the other.
const (
	testProbeToken  = "0f1e2d3c4b5a69788796a5b4c3d2e1f0"
	testDeployToken = "a1b2c3d4e5f60718293a4b5c6d7e8f90"
)

// handler builds the whole thing — routes plus chain — rather than the bare
// mux. What ships is the assembled handler, so that is what the tests should
// be able to hold against the contract.
func handler(t *testing.T, pingErr error, accepting bool) http.Handler {
	t.Helper()

	var flag atomic.Bool
	flag.Store(accepting)

	h, stop := New(testConfig(), stubDB{err: pingErr}, health.Build{
		Version: "dev", SHA: "unknown", StartedAt: time.Unix(0, 0).UTC(),
	},
		mail.NewLogSender("contact@timseil.dev", slog.New(slog.NewTextHandler(io.Discard, nil))),
		contact.NewBudget(time.Now()),
		slog.New(slog.NewTextHandler(io.Discard, nil)), &flag)
	t.Cleanup(stop)
	return h
}

func do(t *testing.T, h http.Handler, method, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	r := httptest.NewRequest(method, path, nil)
	r.RemoteAddr = "203.0.113.7:1234"
	h.ServeHTTP(rec, r)
	return rec
}

// postJSON is the shape both write paths take: a body, a content type, and
// optionally a bearer token.
func postJSON(t *testing.T, h http.Handler, path, token, body string) *httptest.ResponseRecorder {
	t.Helper()

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	r.RemoteAddr = "203.0.113.7:1234"
	r.Header.Set("Content-Type", "application/json")
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	h.ServeHTTP(rec, r)
	return rec
}

// handlerWithLimit is the assembled handler with the broad limiter turned down
// far enough to bite, for the one test that needs to see it do so.
func handlerWithLimit(t *testing.T, perMinute int) http.Handler {
	t.Helper()

	cfg := testConfig()
	cfg.RateLimit = config.RateLimit{PerMinute: perMinute, Burst: 1}

	var flag atomic.Bool
	flag.Store(true)

	h, stop := New(cfg, stubDB{}, health.Build{Version: "dev", SHA: "unknown", StartedAt: time.Unix(0, 0).UTC()},
		mail.NewLogSender("contact@timseil.dev", slog.New(slog.NewTextHandler(io.Discard, nil))),
		contact.NewBudget(time.Now()),
		slog.New(slog.NewTextHandler(io.Discard, nil)), &flag)
	t.Cleanup(stop)
	return h
}

// A liveness probe that answers anything to anyone is not evidence of much.
func TestHealthzRejectsPost(t *testing.T) {
	rec := do(t, handler(t, nil, true), http.MethodPost, "/healthz")
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST /healthz = %d, want %d", rec.Code, http.StatusMethodNotAllowed)
	}
}

func TestHealthzIsOK(t *testing.T) {
	rec := do(t, handler(t, nil, true), http.MethodGet, "/healthz")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /healthz = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestUnknownPathIsNotFound(t *testing.T) {
	rec := do(t, handler(t, nil, true), http.MethodGet, "/does-not-exist")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("GET /does-not-exist = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

// The whole point of a second probe: with Postgres gone the process is still
// alive, and /readyz has to say so rather than report health it cannot see.
func TestReadyzIsUnavailableWhenPingFails(t *testing.T) {
	rec := do(t, handler(t, errors.New("dial tcp 10.0.0.1:5432: connect: connection refused"), true),
		http.MethodGet, "/readyz")

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("GET /readyz = %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
	// The driver error belongs in the log. Leaking a host and port into a
	// public response is the failure this assertion exists to catch.
	if body := rec.Body.String(); strings.Contains(body, "5432") || strings.Contains(body, "dial tcp") {
		t.Fatalf("readiness response leaked the driver error: %q", body)
	}
}

func TestReadyzIsOKWhenPingSucceeds(t *testing.T) {
	rec := do(t, handler(t, nil, true), http.MethodGet, "/readyz")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /readyz = %d, want %d", rec.Code, http.StatusOK)
	}
}

// A draining server is not ready even though the database is fine. The question
// the probe asks is "should you send me work", and during a drain the answer is
// no — otherwise the proxy keeps routing to an instance that is going away.
func TestReadyzIsUnavailableWhileDraining(t *testing.T) {
	rec := do(t, handler(t, nil, false), http.MethodGet, "/readyz")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("GET /readyz while draining = %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
}

// Liveness is not readiness. A draining process is still alive, and answering
// 503 here would make the orchestrator kill it in the middle of its own drain.
func TestHealthzStaysOKWhileDraining(t *testing.T) {
	rec := do(t, handler(t, nil, false), http.MethodGet, "/healthz")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /healthz while draining = %d, want %d", rec.Code, http.StatusOK)
	}
}

// ADR 0009 admits no exception, and these two are the errors a stranger poking
// at the API is most likely to meet first — neither is written by a handler.
func TestTheRoutersOwnErrorsAreProblemDocuments(t *testing.T) {
	h := handler(t, nil, true)

	for _, tc := range []struct {
		what   string
		method string
		path   string
		status int
	}{
		{"an unknown path", http.MethodGet, "/does-not-exist", http.StatusNotFound},
		{"a wrong method", http.MethodPost, "/healthz", http.StatusMethodNotAllowed},
		// The method in the route pattern is what makes this a 405 instead of a
		// route that quietly ignores what was sent. It also proves the training
		// log is mounted at all, which nothing else in this package does.
		{"a write to a read-only endpoint", http.MethodPost, "/api/training", http.StatusMethodNotAllowed},
		// Same for the contribution calendar, and for the same second reason:
		// nothing else in this package proves it is mounted, and an endpoint
		// that is not mounted answers 404 — which for a documented path reads as
		// "gone" rather than "not built yet".
		{"a write to the calendar", http.MethodPost, "/api/contributions", http.StatusMethodNotAllowed},
	} {
		rec := do(t, h, tc.method, tc.path)

		if rec.Code != tc.status {
			t.Errorf("%s = %d, want %d", tc.what, rec.Code, tc.status)
		}
		if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
			t.Errorf("%s: Content-Type = %q", tc.what, got)
		}

		var body map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("%s: body is not JSON: %v\n%s", tc.what, err, rec.Body.String())
		}
		if body["status"] != float64(tc.status) {
			t.Errorf("%s: body status = %v", tc.what, body["status"])
		}
		if body["requestId"] == nil {
			t.Errorf("%s: no request id in the body", tc.what)
		}
		// The plain-text default must be gone, not merely joined by JSON.
		if strings.Contains(rec.Body.String(), "page not found") {
			t.Errorf("%s: the default body survived:\n%s", tc.what, rec.Body.String())
		}
	}
}

// The three badges, through the assembled chain.
//
// They are the only routes a stranger reaches without meaning to — as an image
// in a README — so "is it mounted" is worth asserting somewhere other than the
// package that owns it. The stub database fails every query, which makes this
// test say two things at once: the version badge does not touch the database
// and must answer anyway, and the other two must fail as problem documents
// rather than as an invented number.
func TestTheThreeBadgesAreMountedAndTellAnOutageFromAnAbsence(t *testing.T) {
	h := handler(t, nil, true)

	for _, tc := range []struct {
		path   string
		status int
	}{
		{"/api/badge/version", http.StatusOK},
		{"/api/badge/uptime", http.StatusInternalServerError},
		{"/api/badge/systems", http.StatusInternalServerError},
	} {
		rec := do(t, h, http.MethodGet, tc.path)

		if rec.Code != tc.status {
			t.Errorf("GET %s = %d, want %d: %s", tc.path, rec.Code, tc.status, rec.Body.String())
		}

		// A 404 here would mean the route is not mounted at all, and the
		// README would show three broken images pointing at a site whose
		// argument is that its claims are checkable.
		if rec.Code == http.StatusNotFound {
			t.Errorf("GET %s is not mounted", tc.path)
		}

		if tc.status != http.StatusInternalServerError {
			continue
		}
		if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
			t.Errorf("GET %s: Content-Type = %q on a failure", tc.path, got)
		}
		// The distinction the contract's 500 was added for: a database that
		// cannot be reached must not come back looking like a measurement
		// nobody has taken yet.
		if strings.Contains(rec.Body.String(), "NO DATA") {
			t.Errorf("GET %s rendered an outage as a missing measurement:\n%s",
				tc.path, rec.Body.String())
		}
	}
}

func TestTheBadgesRefuseAWrite(t *testing.T) {
	h := handler(t, nil, true)

	for _, path := range []string{"/api/badge/uptime", "/api/badge/version", "/api/badge/systems"} {
		if rec := do(t, h, http.MethodPost, path); rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("POST %s = %d, want 405", path, rec.Code)
		}
	}
}

// The two internal endpoints, through the assembled chain.
//
// Everything about the token lives in middleware.Bearer and is tested there.
// What is tested here is the wiring, which is the part that cannot be tested
// anywhere else and the part whose failure is worst: a guard that was written
// and not mounted looks exactly like a guard that works, right up until
// somebody posts without one.
func TestTheInternalEndpointsAreGuardedWhereTheyAreMounted(t *testing.T) {
	h := handler(t, nil, true)

	for _, path := range []string{"/api/internal/probe", "/api/internal/deploy"} {
		rec := postJSON(t, h, path, "", `{}`)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("POST %s with no token = %d, want 401: %s",
				path, rec.Code, rec.Body.String())
		}
		if got := rec.Header().Get("WWW-Authenticate"); got != "Bearer" {
			t.Errorf("POST %s: WWW-Authenticate = %q", path, got)
		}
		if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
			t.Errorf("POST %s: Content-Type = %q", path, got)
		}
		if got := rec.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("POST %s: Cache-Control = %q", path, got)
		}
	}
}

// Two tokens, and this is the whole reason there are two: a probe token that
// could write a deploy row would be able to invent the one number the case
// study calls measured rather than claimed.
func TestOneInternalTokenDoesNotOpenTheOtherEndpoint(t *testing.T) {
	h := handler(t, nil, true)

	for _, tc := range []struct{ path, token string }{
		{"/api/internal/probe", testDeployToken},
		{"/api/internal/deploy", testProbeToken},
	} {
		rec := postJSON(t, h, tc.path, tc.token, `{}`)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("POST %s with the other endpoint's token = %d, want 401",
				tc.path, rec.Code)
		}
	}
}

// Past the token, the request reaches the handler — which is what makes the
// 401s above mean something. The stub database fails every query, so the
// furthest an empty body gets is the validator: a 400 here proves the token was
// accepted and the body was read.
func TestTheRightTokenReachesTheHandler(t *testing.T) {
	h := handler(t, nil, true)

	for _, tc := range []struct{ path, token string }{
		{"/api/internal/probe", testProbeToken},
		{"/api/internal/deploy", testDeployToken},
	} {
		rec := postJSON(t, h, tc.path, tc.token, `{}`)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("POST %s with its own token = %d, want 400 from the validator: %s",
				tc.path, rec.Code, rec.Body.String())
		}
	}
}

// The internal paths are excluded from CORS and must not be excluded from the
// rate limiter — isAPI is shared by both, so the exclusion had to go inside
// CORS. This is the assertion that keeps the two apart.
func TestTheInternalPathsAreOutsideCorsAndInsideTheRateLimit(t *testing.T) {
	h := handler(t, nil, true)

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodOptions, "/api/internal/probe", nil)
	r.RemoteAddr = "203.0.113.7:1234"
	r.Header.Set("Origin", "https://timseil.dev")
	r.Header.Set("Access-Control-Request-Method", http.MethodPost)
	h.ServeHTTP(rec, r)

	// An allowlisted origin would otherwise be told that POST is available on a
	// path that is in no public document.
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got != "" {
		t.Errorf("a preflight advertised %q for an internal path", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("a preflight allowed %q for an internal path", got)
	}

	// The contract declares a 429 on both operations, which is only true while
	// the broad limiter still covers them.
	spent := handlerWithLimit(t, 1)
	var throttled bool
	for range 5 {
		if postJSON(t, spent, "/api/internal/probe", "", `{}`).Code == http.StatusTooManyRequests {
			throttled = true
			break
		}
	}
	if !throttled {
		t.Error("the internal paths lost their rate limit along with their preflight")
	}
}

// RFC 9110 requires Allow on a 405, and ServeMux sets it. Rewriting the body
// must not cost the header.
func TestA405StillNamesTheAllowedMethod(t *testing.T) {
	rec := do(t, handler(t, nil, true), http.MethodPost, "/healthz")
	if got := rec.Header().Get("Allow"); !strings.Contains(got, http.MethodGet) {
		t.Errorf("Allow = %q, want it to name GET", got)
	}
}

// Every answer, not only the ones a handler wrote.
func TestEveryAnswerCarriesARequestId(t *testing.T) {
	h := handler(t, nil, true)

	for _, path := range []string{"/healthz", "/readyz", "/api/docs", "/does-not-exist"} {
		if got := do(t, h, http.MethodGet, path).Header().Get(reqid.Header); got == "" {
			t.Errorf("GET %s carries no %s", path, reqid.Header)
		}
	}
}

// The documentation routes predate the chain and have their own ETag, cache and
// CSP handling. Wrapping them must not take any of it away.
func TestTheDocumentationRoutesStillAnswerThroughTheChain(t *testing.T) {
	h := handler(t, nil, true)

	for _, path := range []string{"/api/docs", "/api/openapi.yaml", "/api/docs/scalar.js"} {
		rec := do(t, h, http.MethodGet, path)
		if rec.Code != http.StatusOK {
			t.Errorf("GET %s = %d, want 200", path, rec.Code)
		}
		if rec.Header().Get("ETag") == "" {
			t.Errorf("GET %s lost its ETag", path)
		}
		if rec.Header().Get("Cache-Control") == "" {
			t.Errorf("GET %s lost its Cache-Control", path)
		}
	}
	if got := do(t, h, http.MethodGet, "/api/docs").Header().Get("Content-Security-Policy"); got == "" {
		t.Error("/api/docs lost its content security policy")
	}

	// The 304 and the gzip negotiation are asserted here and not only in
	// httpx/docs_test.go, and the difference matters: those tests run against a
	// mux docsMux() builds for them, which nothing in production serves. If
	// these three routes were ever taken over by something that answers 200 to
	// everything, that suite would stay green and the only symptom would be a
	// megabyte of renderer on every page load.
	first := do(t, h, http.MethodGet, "/api/docs/scalar.js")
	etag := first.Header().Get("ETag")
	if etag == "" {
		t.Fatal("no ETag to revalidate with")
	}

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/docs/scalar.js", nil)
	r.RemoteAddr = "203.0.113.7:1234"
	r.Header.Set("If-None-Match", etag)
	h.ServeHTTP(rec, r)

	if rec.Code != http.StatusNotModified {
		t.Errorf("a revalidation through the chain = %d, want 304", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("a 304 with %d bytes of body", rec.Body.Len())
	}

	rec = httptest.NewRecorder()
	r = httptest.NewRequest(http.MethodGet, "/api/docs/scalar.js", nil)
	r.RemoteAddr = "203.0.113.7:1234"
	r.Header.Set("Accept-Encoding", "gzip")
	h.ServeHTTP(rec, r)

	if got := rec.Header().Get("Content-Encoding"); got != "gzip" {
		t.Errorf("Content-Encoding = %q through the chain, want gzip — the bundle "+
			"is stored compressed and is a third of its size that way", got)
	}
}

// The read API is public on purpose (ADR 0004), and the probes are not part of
// it — so the header belongs on one and not the other.
func TestOnlyTheApiIsAnswerableFromAnyOrigin(t *testing.T) {
	h := handler(t, nil, true)

	if got := do(t, h, http.MethodGet, "/api/docs").Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("/api/docs: Access-Control-Allow-Origin = %q, want *", got)
	}
	if got := do(t, h, http.MethodGet, "/healthz").Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("/healthz: Access-Control-Allow-Origin = %q, want none", got)
	}
}

// ------------------------------------------------------------- contact (C6)

func submit(t *testing.T, h http.Handler) *httptest.ResponseRecorder {
	t.Helper()

	payload := `{"name":"Anna Keller","email":"anna@example.org",` +
		`"message":"Hallo, ich hätte eine Frage zu einem der Systeme.",` +
		`"company":"","dwellMs":4200,"ts":"2026-08-18T14:22:07Z"}`

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/api/contact", strings.NewReader(payload))
	r.Header.Set("Content-Type", "application/json")
	r.RemoteAddr = "203.0.113.9:1234"
	h.ServeHTTP(rec, r)
	return rec
}

func TestContactAnswersPostAndNothingElse(t *testing.T) {
	// The method in the pattern is load-bearing. A GET on the only write path
	// is a 405, not a route that quietly does nothing.
	h := handler(t, nil, true)

	if rec := do(t, h, http.MethodGet, "/api/contact"); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET /api/contact = %d, want 405", rec.Code)
	}
	// The database is unreachable in this harness, so a well-formed submission
	// reaches the store and fails there. 500 is the proof that it was routed;
	// what it answers on a working database is internal/contact's business.
	if rec := submit(t, h); rec.Code != http.StatusInternalServerError {
		t.Errorf("POST /api/contact = %d, want it routed to the handler", rec.Code)
	}
}

// The half of the 3-per-10-minutes rule that lives in front of the route.
// internal/contact drives the database floor; this drives the token bucket, and
// it can only be driven through the assembled router because that is where the
// two limiters are put in order.
func TestTheContactLimiterBitesOnTheFourth(t *testing.T) {
	h := handler(t, nil, true)

	for i := range contact.RateLimit {
		if rec := submit(t, h); rec.Code == http.StatusTooManyRequests {
			t.Fatalf("submission %d was throttled, want the first %d through",
				i+1, contact.RateLimit)
		}
	}

	rec := submit(t, h)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("submission %d = %d, want 429", contact.RateLimit+1, rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Error("the 429 carries no Retry-After")
	}
}

// The broad limiter and the strict one are separate buckets. A spent contact
// budget must not close the read endpoints, which is the whole reason the strict
// one is wrapped around a route instead of added to the chain.
func TestASpentContactBudgetLeavesTheReadsAlone(t *testing.T) {
	h := handler(t, nil, true)

	for range contact.RateLimit {
		submit(t, h)
	}

	// The budget has to be spent for this test to mean anything. Without this
	// assertion "the read is not a 429" is also true when the contact limiter
	// was never applied at all — the test would pass on exactly the bug it is
	// meant to rule out.
	if rec := submit(t, h); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("the %dth submission = %d, want 429: the contact limiter never bit, "+
			"so what follows proves nothing", contact.RateLimit+1, rec.Code)
	}

	if rec := do(t, h, http.MethodGet, "/api/systems"); rec.Code == http.StatusTooManyRequests {
		t.Error("a spent contact budget throttled a read")
	}
}

// The write path's CORS header, through the assembled chain rather than the
// middleware alone: without it a browser sends the POST, gets the 202 and
// refuses to hand the receipt to the page.
// The Origin check, through the assembled handler.
//
// Every test of it lives in internal/contact and goes through ServeHTTP — which
// is the only place that calls withFacts, so those tests fill the context they
// then assert on. That is fine for what they cover and blind to one thing: if
// the route ever stopped going through that adapter, the context would be empty,
// f.origin would be "", and the check treats an absent Origin as curl and lets
// it through. The whole contact suite would stay green while the check passed
// everything.
//
// backlog.md flagged exactly this for C7 as a consequence of mounting the
// generated router. C7 does not mount it — ADR 0024 — so the hole was never
// opened, and this is the test that would have caught it and the one that keeps
// it shut.
func TestAForeignOriginIsRefusedThroughTheAssembledHandler(t *testing.T) {
	h := handler(t, nil, true)

	payload := `{"name":"Anna Keller","email":"anna@example.org",` +
		`"message":"Hallo, ich hätte eine Frage zu einem der Systeme.",` +
		`"company":"","dwellMs":4200,"ts":"2026-08-18T14:22:07Z"}`

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/api/contact", strings.NewReader(payload))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", "https://evil.example")
	r.RemoteAddr = "203.0.113.13:1234"
	h.ServeHTTP(rec, r)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("a submission from https://evil.example = %d, want 400: %s",
			rec.Code, rec.Body.String())
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the answer is not a problem document: %v", err)
	}
	// No invalidParams on this one: naming the field would tell a scraper which
	// header to change. ADR 0021 decided that; it is asserted here because this
	// is the path a browser actually takes.
	if _, named := body["invalidParams"]; named {
		t.Error("the refusal names the field a caller would have to fix")
	}

	// And the answer itself must not be readable cross-origin.
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("Access-Control-Allow-Origin = %q for an unlisted origin", got)
	}
}

func TestAContactAnswerIsReadableByTheSite(t *testing.T) {
	h := handler(t, nil, true)

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodPost, "/api/contact", strings.NewReader(`{}`))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", "https://timseil.dev")
	r.RemoteAddr = "203.0.113.11:1234"
	h.ServeHTTP(rec, r)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://timseil.dev" {
		t.Errorf("Access-Control-Allow-Origin = %q — the page cannot read its own answer", got)
	}
}
