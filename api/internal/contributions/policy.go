package contributions

import (
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/resilience"
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

// The two policies this package hands to internal/resilience.
//
// The numbers above stay here, next to the reasons they were chosen, and only
// their meaning travels. ADR 0020 §7 is why: the breaker numbers decide how
// often a credential goes over the wire during an outage, and the mail
// dispatcher's answer to that question is not GitHub's.
var (
	breakerPolicy = resilience.BreakerPolicy{
		Threshold: breakerThreshold,
		Cooldown:  breakerCooldown,
	}

	retryPolicy = resilience.RetryPolicy{
		MaxAttempts: maxAttempts,
		BackoffBase: backoffBase,
	}
)
