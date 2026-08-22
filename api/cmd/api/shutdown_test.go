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
// The delay is a separate parameter from the grace and every existing caller
// passes zero, deliberately: those tests are about the drain, and three seconds
// of waiting for a proxy that does not exist in them would be three seconds
// added to the suite for nothing. The one test that is about the delay passes a
// real one.
func startServing(t *testing.T, h http.Handler, delay, grace time.Duration) (
	base string, cancel context.CancelFunc, wait func() error,
	poolClosed *atomic.Int32, accepting *atomic.Bool,
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
	// Returned as well as used, so a test can hand it to a handler and assert
	// what a caller sees at the instant serve() flips it. That overlap is the
	// whole of the shutdown delay, and it cannot be observed from outside.
	accepting = &atomic.Bool{}
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
		done <- serve(ctx, srv, ln, delay, grace, accepting,
			func() { closes.Add(1) },
			slog.New(slog.NewTextHandler(io.Discard, nil)))
	}()

	return "http://" + ln.Addr().String(), cancel, func() error { return <-done }, &closes, accepting
}

// The Definition of Done, literally: "SIGTERM beendet ohne abgeschnittene
// Requests". A request that is already running when the shutdown starts has to
// arrive complete — not a short read, not an unexpected EOF.
func TestShutdownDoesNotCutAnInFlightRequest(t *testing.T) {
	started := make(chan struct{})

	base, cancel, wait, _, _ := startServing(t, http.HandlerFunc(
		func(w http.ResponseWriter, _ *http.Request) {
			close(started)
			time.Sleep(300 * time.Millisecond)
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, "complete")
		}), 0, 5*time.Second)

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

	base, cancel, wait, _, _ := startServing(t, http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			close(started)
			time.Sleep(200 * time.Millisecond)
			// After the shutdown has begun: the request context must still be
			// alive, because this request was accepted before it.
			ctxErr <- r.Context().Err()
			w.WriteHeader(http.StatusOK)
		}), 0, 5*time.Second)

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
	base, cancel, wait, _, _ := startServing(t, http.HandlerFunc(
		func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		}), 0, 5*time.Second)

	cancel()
	if err := wait(); err != nil {
		t.Fatalf("serve returned %v", err)
	}

	if resp, err := http.Get(base + "/"); err == nil {
		_ = resp.Body.Close()
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
	base, cancel, wait, c, _ := startServing(t, http.HandlerFunc(
		func(w http.ResponseWriter, _ *http.Request) {
			close(inHandler)
			time.Sleep(200 * time.Millisecond)
			// The pool must not have been closed while this handler runs.
			poolStillOpen <- closes.Load() == 0
			w.WriteHeader(http.StatusOK)
		}), 0, 5*time.Second)
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

	base, cancel, wait, _, _ := startServing(t, http.HandlerFunc(
		func(w http.ResponseWriter, _ *http.Request) {
			close(started)
			time.Sleep(2 * time.Second)
			w.WriteHeader(http.StatusOK)
		}), 0, 50*time.Millisecond)

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

// THE BROKEN CASE FOR THE SHUTDOWN DELAY, and it is not "does it sleep".
//
// A test that only measured the pause would pass on a `time.Sleep` sitting
// anywhere in the shutdown — including after the listener has closed, which is
// where it would do nothing at all. What issue #65 asks for is an ORDER:
//
//	the readiness probe says 503   …while the listener is still accepting…
//
// That overlap is the whole mechanism. It is the window the proxy in front uses
// to take this instance out of its pool, and without it a request that arrives
// during the swap lands on a socket that is going away — which in E5b's lab did
// not come back refused, it hung, because the address had stopped belonging to
// anything.
//
// So this asserts both halves at one instant: 503 from /readyz AND 200 from a
// normal route, after the shutdown has begun. Delete the delay from serve() and
// the second half fails with a connection error.
func TestReadinessIsAlreadyRefusingWhileTheListenerStillAccepts(t *testing.T) {
	var accepting *atomic.Bool

	mux := http.NewServeMux()
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, _ *http.Request) {
		if !accepting.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("GET /work", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "served")
	})

	// The flag serve() flips is the one the handler above reads — the same
	// wiring cmd/api uses, rather than a copy that could disagree with it.
	base, cancel, wait, _, flag := startServing(t, mux, 2*time.Second, 5*time.Second)
	accepting = flag

	// Alive before anything happens, or the assertions below prove nothing.
	if code := statusOf(t, base+"/readyz"); code != http.StatusOK {
		t.Fatalf("before shutdown: /readyz = %d, want 200", code)
	}

	cancel()

	// Inside the delay, comfortably: 2s of delay, asked at 500ms. Not a race —
	// the failing direction of this test is the listener being GONE by now, and
	// a delay that is accidentally too short fails it the same way.
	time.Sleep(500 * time.Millisecond)

	if code := statusOf(t, base+"/readyz"); code != http.StatusServiceUnavailable {
		t.Errorf("during the delay: /readyz = %d, want 503 — nothing tells the proxy to stop", code)
	}

	resp, err := http.Get(base + "/work") //nolint:noctx // the point is a plain request
	if err != nil {
		t.Fatalf("during the delay: /work failed with %v — the listener closed before the "+
			"proxy could have noticed the 503, which is the defect issue #65 describes", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("during the delay: /work = %d, want 200", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "served" {
		t.Errorf("during the delay: /work said %q, want %q", body, "served")
	}

	if err := wait(); err != nil {
		t.Errorf("serve returned %v", err)
	}
}

// statusOf is one GET whose only interesting part is the code.
func statusOf(t *testing.T, url string) int {
	t.Helper()
	resp, err := http.Get(url) //nolint:noctx // see above
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer func() { _ = resp.Body.Close() }()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.StatusCode
}
