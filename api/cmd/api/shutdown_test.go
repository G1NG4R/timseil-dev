package main

import (
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"sync/atomic"
	"testing"
	"time"
)

// startServing runs serve against a real listener on a free port and returns
// its base URL plus a function that waits for it to finish.
//
// A real listener rather than httptest.Server, because what is under test is
// the drain: httptest.Server closes connections itself, which is the behaviour
// this file exists to distinguish from.
func startServing(t *testing.T, h http.Handler, grace time.Duration) (
	base string, cancel context.CancelFunc, wait func() error, poolClosed *atomic.Int32,
) {
	t.Helper()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	// An atomic counter rather than a slice: onDrained runs on serve's
	// goroutine and the assertions read it from a handler, so an unsynchronised
	// append would be a data race in the test that proves ordering.
	var closes atomic.Int32
	var accepting atomic.Bool
	accepting.Store(true)

	ctx, cancel := context.WithCancel(context.Background())

	srv := &http.Server{
		Handler: h,
		// The same line as in run(), because a test that wires this differently
		// tests something the binary does not do.
		BaseContext: func(net.Listener) context.Context { return context.Background() },
	}

	done := make(chan error, 1)
	go func() {
		done <- serve(ctx, srv, ln, grace, &accepting,
			func() { closes.Add(1) },
			slog.New(slog.NewTextHandler(io.Discard, nil)))
	}()

	return "http://" + ln.Addr().String(), cancel, func() error { return <-done }, &closes
}

// The Definition of Done, literally: "SIGTERM beendet ohne abgeschnittene
// Requests". A request that is already running when the shutdown starts has to
// arrive complete — not a short read, not an unexpected EOF.
func TestShutdownDoesNotCutAnInFlightRequest(t *testing.T) {
	started := make(chan struct{})

	base, cancel, wait, _ := startServing(t, http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			close(started)
			time.Sleep(300 * time.Millisecond)
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, "complete")
		}), 5*time.Second)

	type result struct {
		status int
		body   string
		err    error
	}
	got := make(chan result, 1)
	go func() {
		resp, err := http.Get(base + "/slow")
		if err != nil {
			got <- result{err: err}
			return
		}
		defer func() { _ = resp.Body.Close() }()
		body, err := io.ReadAll(resp.Body)
		got <- result{status: resp.StatusCode, body: string(body), err: err}
	}()

	<-started
	cancel() // this is what a SIGTERM does to run()

	r := <-got
	if r.err != nil {
		t.Fatalf("the request did not survive the shutdown: %v", r.err)
	}
	if r.status != http.StatusOK {
		t.Errorf("status = %d, want 200", r.status)
	}
	if r.body != "complete" {
		t.Errorf("body = %q, want %q — the response was truncated", r.body, "complete")
	}

	if err := wait(); err != nil {
		t.Errorf("serve returned %v", err)
	}
}

// The broken case that looks like correct code.
//
// Passing the signal context to http.Server.BaseContext reads as careful
// plumbing and cancels every request in flight the moment SIGTERM arrives. The
// test above would still pass if the handler ignored its context; this one
// fails the moment somebody makes that change.
func TestShutdownDoesNotCancelTheRequestContext(t *testing.T) {
	started := make(chan struct{})
	ctxErr := make(chan error, 1)

	base, cancel, wait, _ := startServing(t, http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			close(started)
			time.Sleep(200 * time.Millisecond)
			// After the shutdown has begun: the request context must still be
			// alive, because this request was accepted before it.
			ctxErr <- r.Context().Err()
			w.WriteHeader(http.StatusOK)
		}), 5*time.Second)

	// The response does not matter here; the handler's context does.
	go func() {
		resp, err := http.Get(base + "/slow")
		if err == nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
		}
	}()

	<-started
	cancel()

	if err := <-ctxErr; err != nil {
		t.Fatalf("the request context was cancelled by the shutdown: %v — "+
			"BaseContext must not be the signal context", err)
	}
	if err := wait(); err != nil {
		t.Errorf("serve returned %v", err)
	}
}

// A drain that keeps accepting is not a drain. Anything arriving after the
// signal has to be refused at the socket, so the client retries against the
// instance that is coming up instead of queueing behind the one going away.
func TestTheListenerStopsAcceptingImmediately(t *testing.T) {
	base, cancel, wait, _ := startServing(t, http.HandlerFunc(
		func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		}), 5*time.Second)

	cancel()
	if err := wait(); err != nil {
		t.Fatalf("serve returned %v", err)
	}

	if _, err := http.Get(base + "/"); err == nil {
		t.Error("the server answered a request made after it had drained")
	}
}

// The pool is closed after the drain, never before. A handler still writing its
// response may still need the database, and the ordering is otherwise
// invisible — nothing about a passing test suite would reveal it.
func TestThePoolIsClosedAfterTheServerHasDrained(t *testing.T) {
	inHandler := make(chan struct{})
	poolStillOpen := make(chan bool, 1)

	var closes *atomic.Int32
	base, cancel, wait, c := startServing(t, http.HandlerFunc(
		func(w http.ResponseWriter, _ *http.Request) {
			close(inHandler)
			time.Sleep(200 * time.Millisecond)
			// The pool must not have been closed while this handler runs.
			poolStillOpen <- closes.Load() == 0
			w.WriteHeader(http.StatusOK)
		}), 5*time.Second)
	closes = c

	go func() {
		resp, err := http.Get(base + "/slow")
		if err == nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
		}
	}()

	<-inHandler
	cancel()

	if !<-poolStillOpen {
		t.Error("the pool was closed while a request was still being served")
	}
	if err := wait(); err != nil {
		t.Errorf("serve returned %v", err)
	}
	if got := closes.Load(); got != 1 {
		t.Errorf("the pool was closed %d times, want exactly once", got)
	}
}

// The grace period is a bound, not a wish. When it expires the process says so
// and still exits zero — a non-zero exit on SIGTERM makes Docker mark the
// container failed and can trip a restart policy during a normal deploy.
func TestAnExpiredGracePeriodIsReportedAndNotFatal(t *testing.T) {
	started := make(chan struct{})

	base, cancel, wait, _ := startServing(t, http.HandlerFunc(
		func(w http.ResponseWriter, _ *http.Request) {
			close(started)
			time.Sleep(2 * time.Second)
			w.WriteHeader(http.StatusOK)
		}), 50*time.Millisecond)

	go func() {
		resp, err := http.Get(base + "/slow")
		if err == nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
		}
	}()

	<-started
	cancel()

	if err := wait(); err != nil {
		t.Errorf("serve returned %v, want nil even after the grace period expired", err)
	}
}
