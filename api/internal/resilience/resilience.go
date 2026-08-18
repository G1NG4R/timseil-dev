// Package resilience holds the two things a caller of an unreliable service
// needs: a circuit breaker, and a retry with exponential backoff and jitter.
//
// It exists because there are now two such callers. The contribution refresher
// reaches GitHub on a five-minute tick; the contact dispatcher reaches the mail
// relay. Until the second one existed this code lived in
// internal/contributions, where it was written, and moving it earlier would
// have been an abstraction with one caller — the same argument that kept
// httpx.CacheControl* from existing until the third handler wanted it.
//
// **The numbers are not here.** Threshold, cooldown, attempt count and backoff
// base stay with the caller, as constants next to the reason they were chosen.
// ADR 0020 §7 is the rule: they decide how often a credential goes over the
// wire during an outage, which is a security property that belongs in a commit
// and not in a shared default somebody inherits by accident. Two callers with
// different upstreams have different answers, and a package-level default would
// quietly give one of them the other's.
package resilience

import (
	"context"
	"math/rand/v2"
	"time"
)

// BreakerPolicy is how much failure is an outage, and how long to wait it out.
type BreakerPolicy struct {
	// Threshold is the number of consecutive failures that opens the breaker.
	Threshold int

	// Cooldown is how long it stays shut before letting one probe through.
	Cooldown time.Duration
}

// RetryPolicy bounds one call's worth of attempts.
type RetryPolicy struct {
	// MaxAttempts includes the first one, so 1 means "do not retry".
	MaxAttempts int

	// BackoffBase is the first wait; it doubles per attempt and is jittered.
	BackoffBase time.Duration
}

// Breaker is a three-state circuit breaker: closed, open, and the half-open
// moment after a cooldown in which exactly one probe is allowed through.
//
// No mutex, and that is a decision rather than an omission. A Breaker is owned
// by one loop and touched from one goroutine. A lock here would suggest a second
// caller exists and invite one, and two goroutines sharing a breaker want to
// share a decision about the upstream, which is a different design than this.
type Breaker struct {
	policy   BreakerPolicy
	failures int
	openedAt time.Time

	// now is injected so a cooldown can be tested without waiting it out.
	now func() time.Time
}

func NewBreaker(policy BreakerPolicy, now func() time.Time) *Breaker {
	return &Breaker{policy: policy, now: now}
}

// Allow reports whether this run may reach the network, and moves the breaker to
// half-open when the cooldown has passed.
//
// The openedAt reset on the half-open path is what makes it one probe rather
// than one per tick: without it every run for the rest of time would be allowed
// through the moment the first cooldown elapsed, which is an open breaker with
// extra steps.
func (b *Breaker) Allow() bool {
	if b.failures < b.policy.Threshold {
		return true
	}
	if b.now().Sub(b.openedAt) >= b.policy.Cooldown {
		b.openedAt = b.now()
		return true
	}
	return false
}

// Succeeded closes it. One good answer is enough: what is being guarded against
// is a sustained outage, not a flaky minute.
func (b *Breaker) Succeeded() {
	b.failures = 0
	b.openedAt = time.Time{}
}

// Failed counts, and re-opens on the way past the threshold — including from
// half-open, where a failed probe has to restart the cooldown rather than let
// the next run straight through.
func (b *Breaker) Failed() {
	b.failures++
	if b.failures >= b.policy.Threshold {
		b.openedAt = b.now()
	}
}

// Open reports the state for a log line. Not used for control flow — Allow is
// the only thing that decides — so the two can never disagree about what a
// half-open moment is.
func (b *Breaker) Open() bool { return b.failures >= b.policy.Threshold }

// Retry runs do until it succeeds or the budget is spent, and returns how many
// attempts that took so a log line can say.
//
// Backoff is exponential from BackoffBase with full jitter: the wait is uniform
// in [0, base·2ⁿ) rather than exactly that value. The jitter is not decoration.
// During a zero-downtime deploy (E5) two instances start within a second of each
// other, and without it they would retry in lockstep for as long as the upstream
// is unwell — turning two clients into one louder client at the worst moment.
//
// A cancelled context ends it immediately and returns the cancellation, not the
// last upstream error: the run being stopped is the process shutting down, and
// reporting the upstream's last 502 for it would put a false cause in the log at
// every deploy.
func Retry[T any](ctx context.Context, policy RetryPolicy, do func(context.Context) (T, error)) (
	result T, attempts int, err error,
) {
	var zero T
	var lastErr error

	// A policy of zero attempts would skip the loop and return a zero value
	// with a nil error — success, invented. One attempt is the smallest honest
	// reading of "call this", so that is what a missing or negative count
	// means.
	budget := max(policy.MaxAttempts, 1)

	for attempt := 1; attempt <= budget; attempt++ {
		value, err := do(ctx)
		if err == nil {
			return value, attempt, nil
		}
		lastErr = err

		if ctx.Err() != nil {
			return zero, attempt, ctx.Err()
		}
		if attempt == budget {
			break
		}

		// rand.N panics on a non-positive bound, so a policy without a backoff
		// retries immediately rather than taking the process down. That is the
		// behaviour the field name promises when it is left at zero.
		if wait := policy.BackoffBase << (attempt - 1); wait > 0 {
			select {
			case <-ctx.Done():
				return zero, attempt, ctx.Err()
			case <-time.After(rand.N(wait)):
			}
		}
	}

	return zero, budget, lastErr
}
