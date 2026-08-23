package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/logx"
	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
)

func quiet() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

// capture returns a logger writing JSON into a buffer, so a test can assert
// what was logged rather than that logging was called.
//
// Built through logx, exactly as cmd/api builds the real one. That matters here
// more than it looks: since F1 the request id and the trace id come off the
// context inside the handler chain, not from the call site. A bare JSONHandler
// would make these tests pass against a logger this service never uses, and the
// first thing they would stop noticing is correlation going missing.
func capture() (*slog.Logger, *bytes.Buffer) {
	var buf bytes.Buffer
	return logx.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})), &buf
}

func serve(h http.Handler, r *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

// ---------------------------------------------------------------- request id

func TestEveryResponseCarriesARequestId(t *testing.T) {
	h := Chain(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}), RequestID(dockerNet(t)))

	rec := serve(h, from("203.0.113.7:1234"))
	if got := rec.Header().Get(reqid.Header); !reqid.Valid(got) {
		t.Errorf("%s = %q", reqid.Header, got)
	}
}

// A stranger's identifier ends up in our logs. From a trusted proxy that is the
// web tier passing one through; from anywhere else it is a value somebody chose
// while looking at us.
func TestAnInboundIdIsOnlyAdoptedFromATrustedPeer(t *testing.T) {
	var seen string
	h := Chain(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		seen = reqid.From(r.Context())
	}), RequestID(dockerNet(t)))

	r := from("203.0.113.7:1234")
	r.Header.Set(reqid.Header, "chosen-by-a-stranger")
	serve(h, r)

	if seen == "chosen-by-a-stranger" {
		t.Error("an identifier from an untrusted peer was adopted")
	}

	r = from("172.18.0.5:1234")
	r.Header.Set(reqid.Header, "passed-through-by-web")
	serve(h, r)

	if seen != "passed-through-by-web" {
		t.Errorf("id = %q, want the one the trusted proxy passed through", seen)
	}
}

// The broken case: a newline in the identifier forges a log line, and a
// carriage return splits the response header.
func TestAMalformedInboundIdIsReplacedEvenFromATrustedPeer(t *testing.T) {
	h := Chain(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}), RequestID(dockerNet(t)))

	r := from("172.18.0.5:1234")
	r.Header.Set(reqid.Header, "abcdefgh\nlevel=ERROR msg=\"forged\"")
	rec := serve(h, r)

	got := rec.Header().Get(reqid.Header)
	if strings.ContainsAny(got, "\r\n") || !reqid.Valid(got) {
		t.Errorf("%s = %q — a malformed identifier survived", reqid.Header, got)
	}
}

// ------------------------------------------------------------------ recovery

// The Definition of Done, in one test: the server survives, the caller gets a
// readable 500, and the log line carries the same request id as the response.
func TestAPanicBecomesAProblemAndALogLineWithTheRequestId(t *testing.T) {
	log, logged := capture()

	h := Chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("the handler stepped on a nil map")
	}), RequestID(dockerNet(t)), Recover(log))

	rec := serve(h, from("203.0.113.7:1234"))

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("Content-Type = %q", got)
	}

	id := rec.Header().Get(reqid.Header)
	if id == "" {
		t.Fatal("the panic response carries no request id")
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the panic response is not JSON: %v", err)
	}
	if body["requestId"] != id {
		t.Errorf("requestId = %v, header = %q — the two must agree", body["requestId"], id)
	}

	// The stack belongs in the log, and nowhere else.
	if s := rec.Body.String(); strings.Contains(s, "goroutine") ||
		strings.Contains(s, "nil map") || strings.Contains(s, ".go:") {
		t.Errorf("the response leaked the panic:\n%s", s)
	}
	if !strings.Contains(logged.String(), id) {
		t.Errorf("no log line carries the request id %q:\n%s", id, logged.String())
	}
	if !strings.Contains(logged.String(), "nil map") {
		t.Error("the log line does not carry the panic value")
	}
}

func TestTheServerKeepsServingAfterAPanic(t *testing.T) {
	var panicked bool
	h := Chain(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if !panicked {
			panicked = true
			panic("once")
		}
		w.WriteHeader(http.StatusOK)
	}), RequestID(dockerNet(t)), Recover(quiet()))

	_ = serve(h, from("203.0.113.7:1234"))
	if rec := serve(h, from("203.0.113.7:1234")); rec.Code != http.StatusOK {
		t.Errorf("the request after a panic = %d, want 200", rec.Code)
	}
}

// http.ErrAbortHandler is net/http's own "stop, quietly". Turning it into a 500
// would invent an error and a false alarm in the log.
func TestAnAbortIsNotTurnedIntoAnError(t *testing.T) {
	h := Chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic(http.ErrAbortHandler)
	}), Recover(quiet()))

	defer func() {
		if recover() == nil {
			t.Error("ErrAbortHandler was swallowed")
		}
	}()
	serve(h, from("203.0.113.7:1234"))
}

// ------------------------------------------------------------------- timeout

func TestAHandlerPastItsDeadlineGetsAProblem(t *testing.T) {
	h := Chain(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		<-r.Context().Done() // a well-behaved handler returns when its context does
	}), RequestID(dockerNet(t)), Timeout(20*time.Millisecond, quiet()))

	rec := serve(h, from("203.0.113.7:1234"))

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("Content-Type = %q — the timeout answered outside the error model", got)
	}
}

// A handler that answered in time must be left alone, even if it took most of
// the budget. Writing a second status onto a finished response is how a
// timeout middleware corrupts the answers it was meant to protect.
func TestAHandlerThatAnsweredIsNotOverwritten(t *testing.T) {
	h := Chain(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusTeapot)
		_, _ = io.WriteString(w, "brewed")
	}), Timeout(50*time.Millisecond, quiet()))

	rec := serve(h, from("203.0.113.7:1234"))
	if rec.Code != http.StatusTeapot || rec.Body.String() != "brewed" {
		t.Errorf("status = %d body = %q, want the handler's own answer", rec.Code, rec.Body.String())
	}
}

// ---------------------------------------------------------------------- CORS

// ADR 0004 makes the read API public so a stranger can check the numbers
// without asking the operator. A stranger with a browser is still a stranger.
func TestAReadIsAnswerableFromAnyOrigin(t *testing.T) {
	h := Chain(okHandler(), CORS([]string{"https://timseil.dev"}))

	r := from("203.0.113.7:1234")
	r.Header.Set("Origin", "https://someone-elses-site.example")
	rec := serve(h, r)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("Access-Control-Allow-Origin = %q, want *", got)
	}
}

func TestCredentialsAreNeverAllowed(t *testing.T) {
	h := Chain(okHandler(), CORS([]string{"https://timseil.dev"}))

	for _, r := range []*http.Request{
		withOrigin(from("203.0.113.7:1234"), "https://timseil.dev"),
		preflight("https://timseil.dev"),
		preflight("https://evil.example"),
	} {
		rec := serve(h, r)
		if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "" {
			t.Errorf("Access-Control-Allow-Credentials = %q on %s", got, r.Method)
		}
	}
}

func TestAPreflightIsOnlyAnsweredForANamedOrigin(t *testing.T) {
	h := Chain(okHandler(), CORS([]string{"https://timseil.dev"}))

	rec := serve(h, preflight("https://timseil.dev"))
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://timseil.dev" {
		t.Errorf("allowed origin: Access-Control-Allow-Origin = %q", got)
	}

	rec = serve(h, preflight("https://evil.example"))
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("unknown origin got Access-Control-Allow-Origin = %q", got)
	}
	if rec.Code != http.StatusNoContent {
		t.Errorf("unknown origin: status = %d, want 204 — the browser reports the failure", rec.Code)
	}
}

// The probes are not part of the API and must not grow API headers.
func TestTheProbesAreLeftAlone(t *testing.T) {
	h := Chain(okHandler(), CORS([]string{"https://timseil.dev"}))

	r := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	if got := serve(h, r).Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("/healthz carries Access-Control-Allow-Origin = %q", got)
	}
}

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}

func withOrigin(r *http.Request, origin string) *http.Request {
	r.Header.Set("Origin", origin)
	return r
}

func preflight(origin string) *http.Request {
	r := httptest.NewRequest(http.MethodOptions, "/api/contact", nil)
	r.RemoteAddr = "203.0.113.7:1234"
	r.Header.Set("Origin", origin)
	r.Header.Set("Access-Control-Request-Method", "POST")
	return r
}

// ------------------------------------------------------------------- logging

func TestTheAccessLineCarriesTheRequestIdAndNoRawAddress(t *testing.T) {
	log, logged := capture()
	client := dockerNet(t)

	h := Chain(okHandler(),
		RequestID(client),
		Logging(log, client, NewIPHasher()))

	rec := serve(h, from("203.0.113.7:1234"))
	line := logged.String()

	if id := rec.Header().Get(reqid.Header); !strings.Contains(line, id) {
		t.Errorf("the access line does not carry the request id:\n%s", line)
	}
	// The privacy page promises no raw addresses. A promise the code does not
	// keep is a promise with legal consequences.
	if strings.Contains(line, "203.0.113.7") {
		t.Errorf("the access line carries the raw client address:\n%s", line)
	}
	if !strings.Contains(line, `"status":200`) {
		t.Errorf("the access line has no status:\n%s", line)
	}
}

// The query string is whatever a stranger typed. The path is a public resource.
func TestTheQueryStringIsNotLogged(t *testing.T) {
	log, logged := capture()
	client := dockerNet(t)

	h := Chain(okHandler(), Logging(log, client, NewIPHasher()))

	r := httptest.NewRequest(http.MethodGet, "/api/systems?secret=hunter2", nil)
	r.RemoteAddr = "203.0.113.7:1234"
	serve(h, r)

	if strings.Contains(logged.String(), "hunter2") {
		t.Errorf("the access line carries the query string:\n%s", logged.String())
	}
}

// The broken case for Except, and it is the one that matters: a probe must get
// through a limiter that has already refused everybody else. Written as "the
// bucket is empty and /readyz still answers", because that is the state Traefik
// finds the service in when a rate limit has been reached — and taking the
// backend out of the pool at exactly that moment would turn a busy minute into
// an outage.
func TestExceptLetsThroughWhatTheLinkWouldHaveRefused(t *testing.T) {
	// The parameter is deliberately unused: this stand-in refuses before it ever
	// reaches what it wraps, which is what a rate limiter at its ceiling does.
	refuse := func(_ http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusTooManyRequests)
		})
	}

	h := Except(refuse, "/healthz", "/readyz")(
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

	for _, tc := range []struct {
		path string
		want int
	}{
		{"/readyz", http.StatusOK},
		{"/healthz", http.StatusOK},
		{"/api/health", http.StatusTooManyRequests},
		// Exact, not prefix. This is the case a `strings.HasPrefix` would let
		// through, and letting it through is a hole in the limiter.
		{"/readyz/../api/health", http.StatusTooManyRequests},
		{"/readyzz", http.StatusTooManyRequests},
	} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tc.path, nil))
		if rec.Code != tc.want {
			t.Errorf("%s = %d, want %d", tc.path, rec.Code, tc.want)
		}
	}
}
