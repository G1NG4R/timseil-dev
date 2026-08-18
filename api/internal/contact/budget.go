package contact

import (
	"sync"
	"time"
)

// Budget is the hourly ceiling on messages handed to the relay, shared by the
// handler and the dispatcher.
//
// It is the answer to this phase's acceptance criterion — "the rate limit bites
// before OVH's quota does" — and a per-IP limit cannot be. Three per address per
// ten minutes bounds one visitor; a hundred addresses each taking their lawful
// three is three hundred messages in ten minutes against a quota of about two
// hundred an hour. So there is one limit here that is not per anything.
//
// Running out is not an outage. The row is stored, the visitor is told the
// message was accepted — which is true, that is what 202 means — and the
// dispatcher carries it out in the next hour's budget. The only thing lost is
// immediacy, and only under a flood.
//
// Unlike middleware.RateLimiter this one has a mutex, because it is genuinely
// shared: request goroutines take from it and so does the dispatcher's loop.
// That is also why the handler has no circuit breaker of its own — a breaker is
// a single-goroutine object (see internal/resilience), and what a breaker would
// bound during an outage, this already bounds.
type Budget struct {
	mu     sync.Mutex
	tokens float64
	last   time.Time

	perHour float64
}

func NewBudget(now time.Time) *Budget {
	return &Budget{
		// Starts full. A restart during an outage should not have to wait an
		// hour to send the first message, and the ceiling exists to bound a
		// sustained rate rather than to meter a cold start.
		tokens:  float64(sendBudgetPerHour),
		last:    now,
		perHour: float64(sendBudgetPerHour),
	}
}

// take spends one token and reports whether there was one.
//
// Refill is continuous rather than a reset on the hour: a bucket that empties at
// 13:59 and refills at 14:00 would send an hour's worth of mail in one minute,
// which is the shape OVH's quota is watching for.
func (b *Budget) take(now time.Time) bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	if elapsed := now.Sub(b.last).Seconds(); elapsed > 0 {
		b.tokens = min(b.perHour, b.tokens+elapsed*b.perHour/3600)
		b.last = now
	}

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

// remaining is for the dispatcher's log line, so that "nothing went out this
// run" can be told apart from "the budget was spent".
func (b *Budget) remaining() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return int(b.tokens)
}
