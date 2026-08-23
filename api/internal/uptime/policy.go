package uptime

import (
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/resilience"
)

// The numbers this loop runs on.
//
// They stay here, next to the reasons, and only their meaning travels into
// internal/resilience — ADR 0020 §7. The contribution refresher's answers are
// not these answers: that one carries a credential to GitHub every five
// minutes, and this one reads a public file that changes twice a year.
const (
	// How often the log is re-read.
	//
	// The loop has work only after an outage, and the file it reads is
	// unchanged the rest of the time — 96 conditional requests a day, almost
	// all of them answered 304 with no body. Slower would be defensible; the
	// cost of being late is that the grid fills in up to fifteen minutes after
	// the host is back, and that is the window somebody looking at the page
	// right after a recovery would notice.
	//
	// The FIRST read happens at startup rather than on the first tick, which is
	// the case that actually matters: a process starting is usually a host that
	// has just come back.
	replayEvery = 15 * time.Minute

	// The ceiling on one run. A run may never overlap the next tick.
	runTimeout = 60 * time.Second

	// The ceiling on one HTTP request, and one attempt makes two of them: the
	// file, then the commit that names it. So an attempt costs up to 16s.
	attemptTimeout = 8 * time.Second

	// Derived from runTimeout, not chosen beside it. Worst case is three
	// attempts plus two backoffs: 16 + 1 + 16 + 2 + 16 = 51s, inside the 60s
	// ceiling. TestTheAttemptBudgetFitsInsideTheRunTimeout keeps that arithmetic
	// honest when somebody edits one of the four.
	maxAttempts = 3
	backoffBase = time.Second

	// Five consecutive failures, then half an hour of quiet.
	//
	// Looser than the refresher's, and it can afford to be: no credential goes
	// over this wire, so the breaker is here to stop hammering somebody else's
	// server rather than to keep a secret off it. A shut breaker costs a later
	// backfill and nothing else — the rows are still on the branch, and
	// ON CONFLICT DO NOTHING means arriving late is free.
	breakerThreshold = 5
	breakerCooldown  = 30 * time.Minute

	// The commit document is a few hundred bytes of JSON with one field this
	// package reads. The log's own bound is maxBytes, in parse.go, where the
	// grammar is.
	maxCommitBytes = 1 << 16
)

// The two policies this package hands to internal/resilience.
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
