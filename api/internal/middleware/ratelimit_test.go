package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"
)

// clock is injected so the tests move time instead of sleeping through it. A
// limiter tested with real sleeps is a limiter tested once.
type clock struct{ t time.Time }

func (c *clock) now() time.Time      { return c.t }
func (c *clock) add(d time.Duration) { c.t = c.t.Add(d) }

func limiter(t *testing.T, perMinute, burst int) (*RateLimiter, *clock, http.Handler) {
	t.Helper()

	c := &clock{t: time.Date(2026, 8, 17, 12, 0, 0, 0, time.UTC)}
	rl := NewRateLimiter(perMinute, burst, dockerNet(t), NewIPHasher(), quiet())
	rl.now = c.now
	t.Cleanup(rl.Stop)

	return rl, c, Chain(okHandler(), RequestID(dockerNet(t)), rl.Middleware())
}

func TestTheBurstIsSpentAndThenRefused(t *testing.T) {
	_, _, h := limiter(t, 120, 3)

	for i := 1; i <= 3; i++ {
		if rec := serve(h, from("203.0.113.7:1234")); rec.Code != http.StatusOK {
			t.Fatalf("request %d = %d, want 200", i, rec.Code)
		}
	}

	rec := serve(h, from("203.0.113.7:1234"))
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("the request past the burst = %d, want 429", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("Content-Type = %q", got)
	}

	// A 429 a client cannot see coming is a 429 it retries immediately.
	seconds, err := strconv.Atoi(rec.Header().Get("Retry-After"))
	if err != nil || seconds < 1 {
		t.Errorf("Retry-After = %q, want a number of seconds",
			rec.Header().Get("Retry-After"))
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the 429 body is not JSON: %v", err)
	}
	if body["type"] != "https://timseil.dev/problems/rate-limited" {
		t.Errorf("type = %v", body["type"])
	}
	if body["requestId"] == nil || body["requestId"] == "" {
		t.Error("the 429 carries no request id")
	}
}

// A limiter that cannot tell two clients apart is a denial of service with
// extra steps.
func TestOneClientDoesNotSpendAnothersBudget(t *testing.T) {
	_, _, h := limiter(t, 120, 2)

	for i := 0; i < 3; i++ {
		serve(h, from("203.0.113.7:1234"))
	}
	if rec := serve(h, from("198.51.100.9:1234")); rec.Code != http.StatusOK {
		t.Errorf("a second client = %d, want 200", rec.Code)
	}
}

func TestTokensComeBackWithTime(t *testing.T) {
	_, c, h := limiter(t, 60, 1) // one per second

	if rec := serve(h, from("203.0.113.7:1234")); rec.Code != http.StatusOK {
		t.Fatalf("the first request = %d", rec.Code)
	}
	if rec := serve(h, from("203.0.113.7:1234")); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("the second request = %d, want 429", rec.Code)
	}

	c.add(2 * time.Second)
	if rec := serve(h, from("203.0.113.7:1234")); rec.Code != http.StatusOK {
		t.Errorf("after two seconds = %d, want 200", rec.Code)
	}
}

// The privacy page says the rate-limit address is kept for ten minutes. This is
// the line where the code keeps that promise rather than the text making it.
func TestABucketIsForgottenAfterTenMinutes(t *testing.T) {
	rl, c, h := limiter(t, 120, 5)

	serve(h, from("203.0.113.7:1234"))
	if n := rl.count(); n != 1 {
		t.Fatalf("buckets = %d, want 1", n)
	}

	c.add(idleTTL + time.Minute)
	rl.evict(c.now())

	if n := rl.count(); n != 0 {
		t.Errorf("buckets = %d after the retention window, want 0", n)
	}
}

// The other half of that promise: what is held is a label, not an address.
func TestNoAddressIsHeldInTheClear(t *testing.T) {
	rl, _, h := limiter(t, 120, 5)

	serve(h, from("203.0.113.7:1234"))
	serve(h, from("[2001:db8::1]:1234"))

	rl.mu.Lock()
	defer rl.mu.Unlock()
	for key := range rl.buckets {
		if strings.ContainsAny(key, ".:") {
			t.Errorf("a bucket key looks like an address: %q", key)
		}
	}
}

// The operational trap. A trusted proxy that forwards nothing would otherwise
// put every visitor in one bucket, and the site would look down after the
// hundred-and-twenty-first request in a minute. It fails open, loudly: a rate
// limit is a courtesy control, and taking the site down to protect it is not
// protection.
func TestATrustedProxyWithoutAForwardedHeaderFailsOpen(t *testing.T) {
	_, _, h := limiter(t, 120, 2)

	for i := 1; i <= 20; i++ {
		if rec := serve(h, from("172.18.0.5:52000")); rec.Code != http.StatusOK {
			t.Fatalf("request %d = %d, want 200 — the limiter closed on a "+
				"misconfigured proxy and took the site with it", i, rec.Code)
		}
	}
}

// The same misconfiguration must not become an outage of its own: a warning per
// request is how a log volume problem is born.
func TestTheMisconfigurationWarningIsRateLimitedItself(t *testing.T) {
	c := &clock{t: time.Date(2026, 8, 17, 12, 0, 0, 0, time.UTC)}
	log, logged := capture()

	rl := NewRateLimiter(120, 5, dockerNet(t), NewIPHasher(), log)
	rl.now = c.now
	t.Cleanup(rl.Stop)

	h := Chain(okHandler(), rl.Middleware())
	for i := 0; i < 50; i++ {
		serve(h, from("172.18.0.5:52000"))
	}

	if got := strings.Count(logged.String(), "no usable X-Forwarded-For"); got != 1 {
		t.Errorf("the warning fired %d times for 50 requests, want once", got)
	}
}

// The probes are the container's own, several times a minute. A liveness check
// that runs out of tokens is a deploy that fails for no reason.
func TestTheProbesAreNotRateLimited(t *testing.T) {
	_, _, h := limiter(t, 120, 1)

	for i := 0; i < 10; i++ {
		r := httptest.NewRequest(http.MethodGet, "/healthz", nil)
		r.RemoteAddr = "203.0.113.7:1234"
		if rec := serve(h, r); rec.Code != http.StatusOK {
			t.Fatalf("/healthz request %d = %d, want 200", i+1, rec.Code)
		}
	}
}

// count is a test seam. Reaching into the map from the test file directly would
// work, but the lock discipline should live with the type.
func (rl *RateLimiter) count() int {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	return len(rl.buckets)
}
