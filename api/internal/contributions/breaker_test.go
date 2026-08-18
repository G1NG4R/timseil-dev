package contributions

import (
	"context"
	"errors"
	"testing"
	"time"
)

// clock is a hand-wound one. The breaker's whole subject is elapsed time, and a
// test that waited half an hour for the cooldown would be a test nobody runs.
type clock struct{ t time.Time }

func newClock() *clock {
	return &clock{t: time.Date(2026, 8, 18, 9, 0, 0, 0, time.UTC)}
}

func (c *clock) now() time.Time      { return c.t }
func (c *clock) add(d time.Duration) { c.t = c.t.Add(d) }

// ------------------------------------------------------------------ the breaker

func TestAFreshBreakerAllows(t *testing.T) {
	b := newBreaker(newClock().now)

	if !b.allow() {
		t.Error("a breaker that has seen nothing refused")
	}
	if b.open() {
		t.Error("a breaker that has seen nothing reports open")
	}
}

// Below the threshold nothing changes. Two failed runs in a row are a bad ten
// minutes, not an outage — the same split the ops grid draws between degraded
// and down.
func TestFailuresBelowTheThresholdDoNotOpenIt(t *testing.T) {
	b := newBreaker(newClock().now)

	for i := 0; i < breakerThreshold-1; i++ {
		b.failed()
		if !b.allow() {
			t.Fatalf("closed after %d failures, want %d", i+1, breakerThreshold)
		}
	}
}

func TestTheBreakerOpensOnTheThirdFailedRun(t *testing.T) {
	b := newBreaker(newClock().now)

	for i := 0; i < breakerThreshold; i++ {
		b.failed()
	}

	if b.allow() {
		t.Errorf("still allowing after %d failed runs", breakerThreshold)
	}
	if !b.open() {
		t.Error("open() disagrees with allow()")
	}
}

// The whole point of the cooldown: one probe, not one per tick. Without the
// openedAt reset on the half-open path, every tick after the first cooldown
// would be let through — an open breaker with extra steps.
func TestAfterTheCooldownExactlyOneProbeGoesThrough(t *testing.T) {
	c := newClock()
	b := newBreaker(c.now)

	for i := 0; i < breakerThreshold; i++ {
		b.failed()
	}

	c.add(breakerCooldown - time.Second)
	if b.allow() {
		t.Error("a probe went through before the cooldown elapsed")
	}

	c.add(2 * time.Second)
	if !b.allow() {
		t.Fatal("no probe went through after the cooldown elapsed")
	}
	// The tick right behind it, still inside the new window, must not.
	c.add(refreshEvery)
	if b.allow() {
		t.Error("a second probe went through inside the same cooldown window")
	}
}

func TestAFailedProbeRestartsTheCooldown(t *testing.T) {
	c := newClock()
	b := newBreaker(c.now)

	for i := 0; i < breakerThreshold; i++ {
		b.failed()
	}
	c.add(breakerCooldown)

	if !b.allow() {
		t.Fatal("the probe did not go through")
	}
	b.failed()

	c.add(breakerCooldown - time.Second)
	if b.allow() {
		t.Error("the cooldown was not restarted by the failed probe")
	}
	c.add(2 * time.Second)
	if !b.allow() {
		t.Error("the breaker never re-opened for a second probe")
	}
}

// One good answer closes it. What is being guarded against is a sustained
// outage, not a flaky minute — a breaker that needed several successes would
// keep the calendar stale long after GitHub came back.
func TestOneSuccessClosesIt(t *testing.T) {
	c := newClock()
	b := newBreaker(c.now)

	for i := 0; i < breakerThreshold; i++ {
		b.failed()
	}
	c.add(breakerCooldown)

	b.allow()
	b.succeeded()

	if !b.allow() || b.open() {
		t.Error("the breaker stayed open after a success")
	}
	// And the failure count really is back to zero, not merely below the line.
	for i := 0; i < breakerThreshold-1; i++ {
		b.failed()
	}
	if !b.allow() {
		t.Error("the count was not reset — it opened again too early")
	}
}

// ------------------------------------------------------------------- the retry

func TestASuccessOnTheFirstAttemptDoesNotRetry(t *testing.T) {
	calls := 0
	_, attempts, err := retry(context.Background(), func(context.Context) (calendar, error) {
		calls++
		return calendar{total: 7}, nil
	})

	if err != nil {
		t.Fatalf("retry: %v", err)
	}
	if calls != 1 || attempts != 1 {
		t.Errorf("calls = %d, attempts = %d, want 1 and 1", calls, attempts)
	}
}

func TestAFailureIsRetriedUpToTheBudget(t *testing.T) {
	calls := 0
	boom := errors.New("boom")

	_, attempts, err := retry(context.Background(), func(context.Context) (calendar, error) {
		calls++
		return calendar{}, boom
	})

	if !errors.Is(err, boom) {
		t.Errorf("err = %v, want the upstream error", err)
	}
	if calls != maxAttempts || attempts != maxAttempts {
		t.Errorf("calls = %d, attempts = %d, want %d", calls, attempts, maxAttempts)
	}
}

func TestASecondAttemptCanSucceed(t *testing.T) {
	calls := 0
	result, attempts, err := retry(context.Background(), func(context.Context) (calendar, error) {
		calls++
		if calls == 1 {
			return calendar{}, errors.New("one bad answer")
		}
		return calendar{total: 3}, nil
	})

	if err != nil {
		t.Fatalf("retry: %v", err)
	}
	if attempts != 2 || result.total != 3 {
		t.Errorf("attempts = %d, total = %d", attempts, result.total)
	}
}

// A cancelled run reports the cancellation and not GitHub's last complaint.
// Otherwise every deploy would put a false cause in the log: the shutdown
// stopped it, and the 502 it happened to be holding is not why.
func TestACancelledRetryReportsTheCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())

	_, _, err := retry(ctx, func(context.Context) (calendar, error) {
		cancel()
		return calendar{}, errors.New("github said no")
	})

	if !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v, want context.Canceled", err)
	}
}

// The arithmetic in the constant block, as a test. Three attempts of eight
// seconds plus two backoffs of at most half a second and a second have to fit
// inside the thirty-second ceiling on a run — otherwise a run can overlap the
// next tick, two of them race on the same row, and the requests double during
// exactly the outage the breaker exists to damp.
func TestTheAttemptBudgetFitsInsideTheRunTimeout(t *testing.T) {
	worst := time.Duration(maxAttempts) * attemptTimeout
	for attempt := 1; attempt < maxAttempts; attempt++ {
		worst += backoffBase << (attempt - 1)
	}

	if worst >= runTimeout {
		t.Errorf("the worst case is %s and runTimeout is %s — a run can overlap the next tick",
			worst, runTimeout)
	}
	if runTimeout >= refreshEvery {
		t.Errorf("runTimeout %s is not shorter than the tick %s", runTimeout, refreshEvery)
	}
	// And the hour the contract promises is the hour this package uses.
	if staleAfter != time.Hour {
		t.Errorf("staleAfter = %s, want an hour — the contract says s-maxage=3600", staleAfter)
	}
}

// Full jitter means the wait is uniform in [0, base·2ⁿ), so it is never the bare
// doubling. Driven through the real retry rather than a copy of the formula:
// what matters is that the code sleeps less than the ceiling, not that a second
// implementation of the arithmetic agrees with the first.
func TestTheBackoffIsJitteredAndBounded(t *testing.T) {
	var ceiling time.Duration
	for attempt := 1; attempt < maxAttempts; attempt++ {
		ceiling += backoffBase << (attempt - 1)
	}

	started := time.Now()
	_, _, _ = retry(context.Background(), func(context.Context) (calendar, error) {
		return calendar{}, errors.New("no")
	})
	elapsed := time.Since(started)

	if elapsed > ceiling {
		t.Errorf("the retries took %s, longer than the un-jittered ceiling %s", elapsed, ceiling)
	}
}
