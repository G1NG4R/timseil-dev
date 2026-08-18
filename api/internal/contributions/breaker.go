package contributions

import (
	"context"
	"math/rand/v2"
	"time"
)

// The nine numbers this package runs on.
//
// Constants and not environment variables, for the reason ADR 0019 gives about
// the roll-up: they answer no question that differs between one deployment and
// another. Two of them carry a second reason. staleAfter is the hour the
// contract promises in `Cache-Control: s-maxage=3600`, and moving it from the
// environment would let a deployment disagree with its own headers; the breaker
// numbers decide how often a credential goes over the wire during an outage,
// which is a security property and belongs in a commit next to its reason.
const (
	// The tick. Not an hour, even though the calendar is an hour old before it
	// is worth refetching: after a failed run the next chance would then be an
	// hour away, and an hour of staleness bought by a single 502 is a bad trade.
	// A tick that finds a fresh row costs one indexed lookup of one row.
	refreshEvery = 5 * time.Minute

	// The hour. This is the number the contract, the build plan and the handbook
	// all state, and it is the only one of these that a reader of the site can
	// observe: `cacheAgeSec` crosses it and the next tick refetches.
	staleAfter = time.Hour

	// The ceiling on one run. A run may never overlap the next tick — two runs
	// at once would race on the same row and double the requests during exactly
	// the outage the breaker exists to damp.
	runTimeout = 30 * time.Second

	// One HTTP attempt.
	attemptTimeout = 8 * time.Second

	// Derived from runTimeout, not chosen next to it. Worst case is three
	// attempts plus two backoffs: 8 + 0.5 + 8 + 1 + 8 = 25.5s, comfortably
	// inside the 30s ceiling. TestTheAttemptBudgetFitsInsideTheRunTimeout is
	// where that arithmetic is kept honest when somebody edits one of the four.
	maxAttempts = 3

	// Doubling, with full jitter. The jitter is not decoration: during a
	// zero-downtime deploy (E5) two instances start within a second of each
	// other, and without it they would retry in lockstep for as long as GitHub
	// is unwell.
	backoffBase = 500 * time.Millisecond

	// Consecutive failed runs before a tick stops reaching for the network.
	breakerThreshold = 3

	// How long it stays shut. A day-long GitHub outage costs about 48 requests
	// instead of 288, and each of those requests carries a credential.
	breakerCooldown = 30 * time.Minute

	// A calendar is about 30 KB. This is the bound on what a host we do not run
	// can make this process allocate.
	maxResponseBytes = 2 << 20
)

// breaker is the three-state circuit breaker in front of GitHub.
//
// Honest about its size: at a five-minute tick this damps rather than prevents.
// Its value is that a long outage stops putting a credential on the wire every
// five minutes, and that the intent is written down before somebody shortens the
// tick and turns the difference into a real one.
//
// No mutex, and that is a decision rather than an omission. The refresher owns
// one of these and touches it from one goroutine — its loop. A lock here would
// suggest a second caller exists and invite one.
type breaker struct {
	failures int
	openedAt time.Time

	// now is injected so the cooldown can be tested without waiting half an
	// hour. The refresher hands it time.Now.
	now func() time.Time
}

func newBreaker(now func() time.Time) *breaker { return &breaker{now: now} }

// allow reports whether this run may reach the network, and moves the breaker to
// half-open when the cooldown has passed.
//
// The openedAt reset on the half-open path is what makes it one probe rather
// than one per tick: without it every tick for the rest of time would be allowed
// through the moment the first cooldown elapsed, which is an open breaker with
// extra steps.
func (b *breaker) allow() bool {
	if b.failures < breakerThreshold {
		return true
	}
	if b.now().Sub(b.openedAt) >= breakerCooldown {
		b.openedAt = b.now()
		return true
	}
	return false
}

// succeeded closes it. One good answer is enough: the thing being protected
// against is a sustained outage, not a flaky minute.
func (b *breaker) succeeded() {
	b.failures = 0
	b.openedAt = time.Time{}
}

// failed counts, and re-opens on the way past the threshold — including from
// half-open, where a failed probe has to restart the cooldown rather than let
// the next tick straight through.
func (b *breaker) failed() {
	b.failures++
	if b.failures >= breakerThreshold {
		b.openedAt = b.now()
	}
}

// open reports the state for the log line. Not used for control flow — allow is
// the only thing that decides — so the two can never disagree about what a
// half-open moment is.
func (b *breaker) open() bool { return b.failures >= breakerThreshold }

// retry runs do until it succeeds or the budget is spent, and returns how many
// attempts that took so the log line can say.
//
// Backoff is exponential from backoffBase with full jitter: the wait is uniform
// in [0, base·2ⁿ) rather than exactly that value. Full rather than equal jitter
// because there are at most two instances and at most three attempts, so
// spreading them as widely as possible costs nothing and the alternative buys a
// tighter distribution nobody here needs.
//
// A cancelled context ends it immediately and returns the cancellation, not the
// last upstream error: the run being stopped is this package being shut down,
// and reporting GitHub's last 502 for it would put a false cause in the log at
// every deploy.
func retry(ctx context.Context, do func(context.Context) (calendar, error)) (calendar, int, error) {
	var lastErr error

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		result, err := do(ctx)
		if err == nil {
			return result, attempt, nil
		}
		lastErr = err

		if ctx.Err() != nil {
			return calendar{}, attempt, ctx.Err()
		}
		if attempt == maxAttempts {
			break
		}

		wait := backoffBase << (attempt - 1)
		select {
		case <-ctx.Done():
			return calendar{}, attempt, ctx.Err()
		case <-time.After(rand.N(wait)):
		}
	}

	return calendar{}, maxAttempts, lastErr
}
