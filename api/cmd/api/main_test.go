package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

// stubPinger stands in for the pool. The broken case is the interesting one,
// and it is the one that needs no database at all.
type stubPinger struct{ err error }

func (s stubPinger) Ping(context.Context) error { return s.err }

func quietMux(err error) *http.ServeMux {
	var accepting atomic.Bool
	accepting.Store(true)
	return newMux(stubPinger{err: err}, slog.New(slog.NewTextHandler(io.Discard, nil)), &accepting)
}

// draining is the same mux after the shutdown has begun.
func drainingMux() *http.ServeMux {
	var accepting atomic.Bool // zero value: no longer accepting
	return newMux(stubPinger{}, slog.New(slog.NewTextHandler(io.Discard, nil)), &accepting)
}

func do(t *testing.T, mux *http.ServeMux, method, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	return rec
}

// A liveness probe that answers anything to anyone is not evidence of much.
func TestHealthzRejectsPost(t *testing.T) {
	rec := do(t, quietMux(nil), http.MethodPost, "/healthz")
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST /healthz = %d, want %d", rec.Code, http.StatusMethodNotAllowed)
	}
}

func TestHealthzIsOK(t *testing.T) {
	rec := do(t, quietMux(nil), http.MethodGet, "/healthz")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /healthz = %d, want %d", rec.Code, http.StatusOK)
	}
}

func TestUnknownPathIsNotFound(t *testing.T) {
	rec := do(t, quietMux(nil), http.MethodGet, "/does-not-exist")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("GET /does-not-exist = %d, want %d", rec.Code, http.StatusNotFound)
	}
}

// The whole point of a second probe: with Postgres gone the process is still
// alive, and /readyz has to say so rather than report health it cannot see.
func TestReadyzIsUnavailableWhenPingFails(t *testing.T) {
	rec := do(t, quietMux(errors.New("dial tcp 10.0.0.1:5432: connect: connection refused")),
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
	rec := do(t, quietMux(nil), http.MethodGet, "/readyz")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /readyz = %d, want %d", rec.Code, http.StatusOK)
	}
}

// A draining server is not ready even though the database is fine. The question
// the probe asks is "should you send me work", and during a drain the answer is
// no — otherwise the proxy keeps routing to an instance that is going away.
func TestReadyzIsUnavailableWhileDraining(t *testing.T) {
	rec := do(t, drainingMux(), http.MethodGet, "/readyz")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("GET /readyz while draining = %d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
}

// Liveness is not readiness. A draining process is still alive, and answering
// 503 here would make the orchestrator kill it in the middle of its own drain.
func TestHealthzStaysOKWhileDraining(t *testing.T) {
	rec := do(t, drainingMux(), http.MethodGet, "/healthz")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /healthz while draining = %d, want %d", rec.Code, http.StatusOK)
	}
}
