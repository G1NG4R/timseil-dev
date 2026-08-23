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

// ------------------------------------------------------ the window form (C6)

// Three per ten minutes cannot be said with a whole number of tokens per minute:
// as an int it is 0, which refuses everybody forever and would turn the only
// conversion point on the site off with a rounding error.
func TestAWindowRateThatIsNotAWholeNumberPerMinute(t *testing.T) {
	clock := &clock{t: time.Date(2026, 8, 18, 12, 0, 0, 0, time.UTC)}
	rl := NewRateLimiterPer(3, 10*time.Minute, 3, NewClientIP(nil), NewIPHasher(), quiet())
	rl.now = clock.now
	t.Cleanup(rl.Stop)

	handler := rl.Gate(okHandler())

	for i := range 3 {
		if w := gateThrough(handler); w.Code != http.StatusOK {
			t.Fatalf("request %d gave %d, want 200", i+1, w.Code)
		}
	}
	w := gateThrough(handler)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("the fourth request gave %d, want 429", w.Code)
	}
	if w.Header().Get("Retry-After") == "" {
		t.Error("the 429 carries no Retry-After")
	}

	// A third of the window buys back one token, and not two.
	clock.add(200 * time.Second)
	if w := gateThrough(handler); w.Code != http.StatusOK {
		t.Errorf("a refilled token was refused: %d", w.Code)
	}
	if w := gateThrough(handler); w.Code != http.StatusTooManyRequests {
		t.Errorf("a second token appeared out of one third of the window: %d", w.Code)
	}
}

// Gate makes no decision about which paths it covers, so that the route it is
// wrapped around is the whole statement of scope. Middleware is the one that
// tests the path.
func TestGateCoversWhateverItWraps(t *testing.T) {
	rl := NewRateLimiterPer(1, time.Hour, 1, NewClientIP(nil), NewIPHasher(), quiet())
	t.Cleanup(rl.Stop)

	handler := rl.Gate(okHandler())

	if w := gateThrough(handler); w.Code != http.StatusOK {
		t.Fatalf("status %d", w.Code)
	}
	// Not an /api/ path, and still limited: the mux line decides the scope.
	r := httptest.NewRequest(http.MethodPost, "/somewhere-else", nil)
	r.RemoteAddr = "203.0.113.7:51000"
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)

	if w.Code != http.StatusTooManyRequests {
		t.Errorf("status %d, want 429 — Gate must not test the path itself", w.Code)
	}
}

// The broad limiter and the strict one count separately. Spending the contact
// budget must not close the read endpoints, and reading must not use up
// somebody's three messages.
func TestTwoLimitersDoNotShareABucket(t *testing.T) {
	broad := NewRateLimiter(120, 60, NewClientIP(nil), NewIPHasher(), quiet())
	strict := NewRateLimiterPer(3, 10*time.Minute, 3, NewClientIP(nil), NewIPHasher(), quiet())
	t.Cleanup(broad.Stop)
	t.Cleanup(strict.Stop)

	strictly := strict.Gate(okHandler())
	for range 3 {
		gateThrough(strictly)
	}
	if w := gateThrough(strictly); w.Code != http.StatusTooManyRequests {
		t.Fatalf("the strict limiter did not bite: %d", w.Code)
	}

	broadly := broad.Middleware()(okHandler())
	r := httptest.NewRequest(http.MethodGet, "/api/systems", nil)
	r.RemoteAddr = "203.0.113.7:51000"
	w := httptest.NewRecorder()
	broadly.ServeHTTP(w, r)

	if w.Code != http.StatusOK {
		t.Errorf("status %d — a spent contact budget closed the read endpoints", w.Code)
	}
}

func gateThrough(h http.Handler) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/contact", nil)
	r.RemoteAddr = "203.0.113.7:51000"
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

// The one line in this service that printed an address in the clear.
//
// It fires when a trusted proxy forwards nothing usable, and "it is only the
// proxy" is not an exception the operations sheet makes: it says no IP, and a
// log line cannot know whose address it is holding. The label stays, so a
// misconfiguration is still recognisable across lines — it is the same value
// the access line writes as `client` for the same machine.
func TestTheMisconfigurationWarningCarriesNoRawAddress(t *testing.T) {
	log, logged := capture()

	rl := NewRateLimiter(120, 3, dockerNet(t), NewIPHasher(), log)
	t.Cleanup(rl.Stop)
	h := Chain(okHandler(), RequestID(dockerNet(t)), rl.Middleware())

	// A trusted peer — 172.16/12 is in dockerNet — that forwarded nothing.
	serve(h, from("172.17.0.4:5555"))

	line := logged.String()
	if !strings.Contains(line, "not being rate limited") {
		t.Fatalf("the warning did not fire, so this test proves nothing:\n%s", line)
	}
	if strings.Contains(line, "172.17.0.4") {
		t.Errorf("the peer address reached the log in the clear:\n%s", line)
	}
	if !strings.Contains(line, `"peer"`) {
		t.Errorf("the peer label is gone, and it was how two lines get tied together:\n%s", line)
	}
}
