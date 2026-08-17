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
	"github.com/G1NG4R/timseil-dev/api/internal/health"
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
	}
}

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
