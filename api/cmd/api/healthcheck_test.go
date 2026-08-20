package main

import (
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestTheProbeRecognisesBothSpellings(t *testing.T) {
	for _, tc := range []struct {
		args []string
		want bool
	}{
		{[]string{"-healthcheck"}, true},
		{[]string{"--healthcheck"}, true},
		{nil, false},
		{[]string{}, false},
		{[]string{"-healthchek"}, false},
		{[]string{"healthcheck"}, false},
		{[]string{"-serve", "--healthcheck"}, true},
	} {
		if got := wantsHealthcheck(tc.args); got != tc.want {
			t.Errorf("wantsHealthcheck(%q) = %v, want %v", tc.args, got, tc.want)
		}
	}
}

// The good case, so the broken ones below mean something.
func TestAReadyServerProbesHealthy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != healthcheckPath {
			t.Errorf("the probe asked for %q, want %q", r.URL.Path, healthcheckPath)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	if got := healthcheck(srv.URL + healthcheckPath); got != 0 {
		t.Errorf("healthcheck against a ready server = %d, want 0", got)
	}
}

// The case the whole design turns on. /readyz answers 503 while the server
// drains, and a container that is draining is exactly one that should stop
// being sent traffic — so the probe has to see that and say unhealthy.
func TestADrainingServerProbesUnhealthy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	if got := healthcheck(srv.URL + healthcheckPath); got != 1 {
		t.Errorf("healthcheck against a draining server = %d, want 1", got)
	}
}

// Any other answer is unhealthy too, and 200 is the only one that is not. A
// probe that accepted a 3xx or a 404 would report a container healthy because
// something answered on the port, which is not the question.
func TestOnlyTwoHundredIsHealthy(t *testing.T) {
	for _, code := range []int{
		http.StatusMovedPermanently,
		http.StatusNoContent,
		http.StatusNotFound,
		http.StatusMethodNotAllowed,
		http.StatusInternalServerError,
	} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(code)
		}))
		if got := healthcheck(srv.URL + healthcheckPath); got != 1 {
			t.Errorf("healthcheck against %d = %d, want 1", code, got)
		}
		srv.Close()
	}
}

// Nothing listening at all — the container whose process died, and the first
// seconds of one that has not finished starting.
func TestARefusedConnectionProbesUnhealthy(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("could not take a port to release it: %v", err)
	}
	url := "http://" + ln.Addr().String() + healthcheckPath
	if err := ln.Close(); err != nil {
		t.Fatalf("could not release the port: %v", err)
	}

	if got := healthcheck(url); got != 1 {
		t.Errorf("healthcheck against a closed port = %d, want 1", got)
	}
}

// A server that accepts the connection and then says nothing. Without the
// timeout the probe would hang until Docker killed it, and a killed probe and a
// failed one are the same to Docker but not to whoever is reading the logs.
func TestAHangingServerProbesUnhealthyWithinTheTimeout(t *testing.T) {
	block := make(chan struct{})
	defer close(block)

	srv := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		select {
		case <-block:
		case <-r.Context().Done():
		}
	}))
	defer srv.Close()

	start := time.Now()
	got := healthcheck(srv.URL + healthcheckPath)
	elapsed := time.Since(start)

	if got != 1 {
		t.Errorf("healthcheck against a hanging server = %d, want 1", got)
	}
	if elapsed > healthcheckTimeout+time.Second {
		t.Errorf("the probe took %s, want it to give up around %s", elapsed, healthcheckTimeout)
	}
}

// The port is fixed in one place. Two spellings of 8080 is one pair of numbers
// that can disagree, and the disagreement would only show in a container.
func TestTheProbeUsesTheAddressTheServerListensOn(t *testing.T) {
	url := probeURL()

	if !strings.HasSuffix(url, healthcheckPath) {
		t.Errorf("probeURL() = %q, want it to end in %q", url, healthcheckPath)
	}
	if !strings.Contains(url, listenAddr) {
		t.Errorf("probeURL() = %q, want it to carry listenAddr %q", url, listenAddr)
	}
	// Loopback, not the container's own name or 0.0.0.0: the probe runs inside
	// the container it is asking about.
	if !strings.HasPrefix(url, "http://127.0.0.1:") {
		t.Errorf("probeURL() = %q, want it to knock on loopback", url)
	}
}
