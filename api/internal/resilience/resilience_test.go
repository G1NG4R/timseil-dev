package resilience

import (
	"context"
	"errors"
	"testing"
	"time"
)

// These tests moved here with the code, from internal/contributions, when the
// contact dispatcher became the second caller. They read the same, with one
// difference that is the point of the move: the policy is a value the test
// chooses rather than a package constant it borrows. A test that used the
// refresher's threshold would go red the day the mail sender wanted a different
// one, which is precisely the coupling this package exists to remove.

// clock is a hand-wound one. The breaker's whole subject is elapsed time, and a
// test that waited half an hour for the cooldown would be a test nobody runs.
type clock struct{ t time.Time }

func newClock() *clock {
	return &clock{t: time.Date(2026, 8, 18, 9, 0, 0, 0, time.UTC)}
}

func (c *clock) now() time.Time      { return c.t }
func (c *clock) add(d time.Duration) { c.t = c.t.Add(d) }

var testBreaker = BreakerPolicy{Threshold: 3, Cooldown: 30 * time.Minute}

var testRetry = RetryPolicy{MaxAttempts: 3, BackoffBase: 500 * time.Millisecond}

// ------------------------------------------------------------------ the breaker

func TestAFreshBreakerAllows(t *testing.T) {
	b := NewBreaker(testBreaker, newClock().now)

	if !b.Allow() {
		t.Error("a breaker that has seen nothing refused")
	}
	if b.Open() {
		t.Error("a breaker that has seen nothing reports open")
	}
}

// Below the threshold nothing changes. Two failed runs in a row are a bad ten
// minutes, not an outage — the same split the ops grid draws between degraded
// and down.
func TestFailuresBelowTheThresholdDoNotOpenIt(t *testing.T) {
	b := NewBreaker(testBreaker, newClock().now)

	for i := 0; i < testBreaker.Threshold-1; i++ {
		b.Failed()
		if !b.Allow() {
			t.Fatalf("closed after %d failures, want %d", i+1, testBreaker.Threshold)
		}
	}
}

func TestTheBreakerOpensOnTheThresholdFailure(t *testing.T) {
	b := NewBreaker(testBreaker, newClock().now)

	for i := 0; i < testBreaker.Threshold; i++ {
		b.Failed()
	}

	if b.Allow() {
		t.Errorf("still allowing after %d failed runs", testBreaker.Threshold)
	}
	if !b.Open() {
		t.Error("Open disagrees with Allow")
	}
}

// The whole point of the cooldown: one probe, not one per run. Without the
// openedAt reset on the half-open path, every run after the first cooldown
// would be let through — an open breaker with extra steps.
func TestAfterTheCooldownExactlyOneProbeGoesThrough(t *testing.T) {
	c := newClock()
	b := NewBreaker(testBreaker, c.now)

	for i := 0; i < testBreaker.Threshold; i++ {
		b.Failed()
	}

	c.add(testBreaker.Cooldown - time.Second)
	if b.Allow() {
		t.Error("a probe went through before the cooldown elapsed")
	}

	c.add(2 * time.Second)
	if !b.Allow() {
		t.Fatal("no probe went through after the cooldown elapsed")
	}
	// The run right behind it, still inside the new window, must not.
	c.add(time.Minute)
	if b.Allow() {
		t.Error("a second probe went through inside the same cooldown window")
	}
}

func TestAFailedProbeRestartsTheCooldown(t *testing.T) {
	c := newClock()
	b := NewBreaker(testBreaker, c.now)

	for i := 0; i < testBreaker.Threshold; i++ {
		b.Failed()
	}
	c.add(testBreaker.Cooldown)

	if !b.Allow() {
		t.Fatal("the probe did not go through")
	}
	b.Failed()

	c.add(testBreaker.Cooldown - time.Second)
	if b.Allow() {
		t.Error("the cooldown was not restarted by the failed probe")
	}
	c.add(2 * time.Second)
	if !b.Allow() {
		t.Error("the breaker never re-opened for a second probe")
	}
}

// One good answer closes it. What is being guarded against is a sustained
// outage, not a flaky minute — a breaker that needed several successes would
// keep the caller cut off long after the upstream came back.
func TestOneSuccessClosesIt(t *testing.T) {
	c := newClock()
	b := NewBreaker(testBreaker, c.now)

	for i := 0; i < testBreaker.Threshold; i++ {
		b.Failed()
	}
	c.add(testBreaker.Cooldown)

	b.Allow()
	b.Succeeded()

	if !b.Allow() || b.Open() {
		t.Error("the breaker stayed open after a success")
	}
	// And the failure count really is back to zero, not merely below the line.
	for i := 0; i < testBreaker.Threshold-1; i++ {
		b.Failed()
	}
	if !b.Allow() {
		t.Error("the count was not reset — it opened again too early")
	}
}

// Two callers must not share a decision about two different upstreams. The
// policy being a value rather than a constant is what makes that structural
// instead of a rule somebody remembers.
func TestTwoBreakersWithDifferentPoliciesDoNotAgree(t *testing.T) {
	c := newClock()
	strict := NewBreaker(BreakerPolicy{Threshold: 1, Cooldown: time.Minute}, c.now)
	patient := NewBreaker(BreakerPolicy{Threshold: 5, Cooldown: time.Minute}, c.now)

	strict.Failed()
	patient.Failed()

	if strict.Allow() {
		t.Error("the strict breaker stayed closed after its first failure")
	}
	if !patient.Allow() {
		t.Error("the patient breaker opened on somebody else's threshold")
	}
}

// ------------------------------------------------------------------- the retry

func TestASuccessOnTheFirstAttemptDoesNotRetry(t *testing.T) {
	calls := 0
	got, attempts, err := Retry(context.Background(), testRetry, func(context.Context) (int, error) {
		calls++
		return 7, nil
	})

	if err != nil {
		t.Fatalf("Retry: %v", err)
	}
	if calls != 1 || attempts != 1 || got != 7 {
		t.Errorf("calls = %d, attempts = %d, got = %d, want 1, 1 and 7", calls, attempts, got)
	}
}

func TestAFailureIsRetriedUpToTheBudget(t *testing.T) {
	calls := 0
	boom := errors.New("boom")

	_, attempts, err := Retry(context.Background(), testRetry, func(context.Context) (int, error) {
		calls++
		return 0, boom
	})

	if !errors.Is(err, boom) {
		t.Errorf("err = %v, want the upstream error", err)
	}
	if calls != testRetry.MaxAttempts || attempts != testRetry.MaxAttempts {
		t.Errorf("calls = %d, attempts = %d, want %d", calls, attempts, testRetry.MaxAttempts)
	}
}

func TestASecondAttemptCanSucceed(t *testing.T) {
	calls := 0
	got, attempts, err := Retry(context.Background(), testRetry, func(context.Context) (int, error) {
		calls++
		if calls == 1 {
			return 0, errors.New("one bad answer")
		}
		return 3, nil
	})

	if err != nil {
		t.Fatalf("Retry: %v", err)
	}
	if attempts != 2 || got != 3 {
		t.Errorf("attempts = %d, got = %d", attempts, got)
	}
}

// A cancelled run reports the cancellation and not the upstream's last
// complaint. Otherwise every deploy would put a false cause in the log: the
// shutdown stopped it, and the 502 it happened to be holding is not why.
func TestACancelledRetryReportsTheCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	_, _, err := Retry(ctx, testRetry, func(context.Context) (int, error) {
		cancel()
		return 0, errors.New("the upstream said no")
	})

	if !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v, want context.Canceled", err)
	}
}

// Full jitter means the wait is uniform in [0, base·2ⁿ), so it is never the bare
// doubling. Driven through the real Retry rather than a copy of the formula:
// what matters is that the code sleeps less than the ceiling, not that a second
// implementation of the arithmetic agrees with the first.
func TestTheBackoffIsJitteredAndBounded(t *testing.T) {
	var ceiling time.Duration
	for attempt := 1; attempt < testRetry.MaxAttempts; attempt++ {
		ceiling += testRetry.BackoffBase << (attempt - 1)
	}

	started := time.Now()
	_, _, _ = Retry(context.Background(), testRetry, func(context.Context) (int, error) {
		return 0, errors.New("no")
	})
	elapsed := time.Since(started)

	if elapsed > ceiling {
		t.Errorf("the retries took %s, longer than the un-jittered ceiling %s", elapsed, ceiling)
	}
}

// A policy with no attempts would skip the loop and hand back a zero value with
// a nil error — an invented success, which is invariant 1 in the shape of a
// control-flow bug. One attempt is the floor.
func TestAnEmptyBudgetStillCallsOnce(t *testing.T) {
	calls := 0
	boom := errors.New("boom")

	_, attempts, err := Retry(context.Background(), RetryPolicy{}, func(context.Context) (int, error) {
		calls++
		return 0, boom
	})

	if calls != 1 || attempts != 1 {
		t.Errorf("calls = %d, attempts = %d, want 1 and 1", calls, attempts)
	}
	if !errors.Is(err, boom) {
		t.Errorf("err = %v, want the upstream error rather than a manufactured success", err)
	}
}

// The zero backoff is the other half of that: rand.N panics on a non-positive
// bound, so a policy without one has to retry immediately rather than take the
// process down.
func TestAZeroBackoffRetriesWithoutPanicking(t *testing.T) {
	calls := 0

	_, _, _ = Retry(context.Background(), RetryPolicy{MaxAttempts: 3},
		func(context.Context) (int, error) {
			calls++
			return 0, errors.New("no")
		})

	if calls != 3 {
		t.Errorf("calls = %d, want 3", calls)
	}
}
