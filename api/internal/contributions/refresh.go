package contributions

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/G1NG4R/timseil-dev/api/internal/config"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// RefreshQueries is the slice of the store the refresher needs. Narrow on
// purpose: it is what lets the loop, the outage path and the shutdown be tested
// without Postgres.
type RefreshQueries interface {
	GetContributions(ctx context.Context, login string) (store.GetContributionsRow, error)
	UpsertContributions(ctx context.Context, arg store.UpsertContributionsParams) error
}

// fetchFunc is one attempt at GitHub. A field rather than a call so the loop can
// be driven by a stub — the outage this phase promises to survive has to be
// producible in a test, and it must not need a network to produce it.
type fetchFunc func(ctx context.Context) (calendar, error)

// Refresher keeps the cached calendar fresh. It owns a goroutine from the moment
// it is created, in the shape internal/ops and middleware.RateLimiter already
// use.
type Refresher struct {
	queries RefreshQueries
	login   string
	fetch   fetchFunc
	breaker *breaker
	log     *slog.Logger

	ticks       <-chan time.Time
	stopTicking func()

	// cancel ends the fetch that is running rather than waiting for it. See Stop.
	cancel context.CancelFunc

	stop chan struct{}
	done chan struct{}
}

// NewRefresher starts the loop. Call Stop before closing the pool.
func NewRefresher(q RefreshQueries, gh config.GitHub, log *slog.Logger) *Refresher {
	ticker := time.NewTicker(refreshEvery)
	return start(q, gh.Login, newFetcher(gh).fetch, log, ticker.C, ticker.Stop, time.Now)
}

// start is NewRefresher with the clock, the ticks and GitHub itself handed in,
// so the tests drive the loop instead of sleeping through it.
func start(
	q RefreshQueries,
	login string,
	fetch fetchFunc,
	log *slog.Logger,
	ticks <-chan time.Time,
	stopTicking func(),
	now func() time.Time,
) *Refresher {
	ctx, cancel := context.WithCancel(context.Background())

	r := &Refresher{
		queries:     q,
		login:       login,
		fetch:       fetch,
		breaker:     newBreaker(now),
		log:         log,
		ticks:       ticks,
		stopTicking: stopTicking,
		cancel:      cancel,
		stop:        make(chan struct{}),
		done:        make(chan struct{}),
	}

	go r.loop(ctx)
	return r
}

// Stop ends the loop and returns.
//
// It cancels the context the running fetch holds instead of waiting politely.
// A fetch can legitimately sit for the better part of half a minute, and waiting
// could add that AFTER the server has already spent its shutdown grace — at
// which point the container's stop_grace_period answers with a SIGKILL. A
// refresh interrupted halfway loses nothing: it either wrote the row or it did
// not, and the next tick after the restart fetches the same calendar.
//
// Idempotent, because the shutdown path reaches it on two different routes and
// should not have to reason about which one ran.
func (r *Refresher) Stop() {
	select {
	case <-r.stop:
		return
	default:
	}

	close(r.stop)
	r.cancel()
	r.stopTicking()
	<-r.done
}

// loop runs once and then on every tick.
//
// Once immediately rather than on the first tick, for the reason internal/ops
// gives: a process that restarts more often than the tick period would otherwise
// never refresh at all, and after a deploy the calendar would sit five minutes
// older than it needs to for no reason.
func (r *Refresher) loop(ctx context.Context) {
	defer close(r.done)

	r.runOnce(ctx)

	for {
		select {
		case <-r.stop:
			return
		case <-r.ticks:
			r.runOnce(ctx)
		}
	}
}

// runOnce is one decision and, at most, one fetch.
//
// The order of the three guards is the design of this phase. The breaker comes
// first because an open breaker means not touching the network at all; the age
// second because a fresh calendar makes a fetch waste; and only then does
// anything leave the process. A failure at any point past that returns without
// writing, which is what makes "GitHub is down" show the last good calendar
// rather than an error — the acceptance criterion of C5 is a property of this
// shape and not a rule anybody has to remember.
func (r *Refresher) runOnce(ctx context.Context) {
	if ctx.Err() != nil {
		return
	}

	if !r.breaker.allow() {
		// INFO and not WARN: a shut breaker is this package working, and the
		// thing that is wrong was already reported when it shut.
		r.log.Info("contributions refresh", "state", "breaker open", "login", r.login)
		return
	}

	age, cached, err := r.age(ctx)
	switch {
	case errors.Is(err, context.Canceled):
		return
	case err != nil:
		// Not a breaker failure. The database being unreachable says nothing
		// about GitHub, and counting it here would shut the breaker for half an
		// hour over an outage on the wrong side.
		r.log.Error("contributions refresh", "state", "cache unreadable", "err", err)
		return
	case cached && age < staleAfter:
		r.log.Info("contributions refresh", "state", "fresh", "age_sec", int(age.Seconds()))
		return
	}

	// The ceiling on a run. Independent of REQUEST_TIMEOUT, because this is not
	// a request — no visitor is waiting on it, and nothing here runs inside a
	// handler.
	runCtx, cancel := context.WithTimeout(ctx, runTimeout)
	defer cancel()

	result, attempts, err := retry(runCtx, r.fetch)
	switch {
	case errors.Is(err, context.Canceled):
		// The shutdown cancelled it. That is this package being stopped, not
		// this package failing, and an ERROR line here would cry wolf on every
		// deploy.
		return
	case err != nil:
		r.breaker.failed()
		// WARN and not ERROR: the site is still answering, with an older
		// calendar and an honest age. It becomes worth waking up for when the
		// age on the page gets embarrassing, which is a judgement the runbook
		// makes and a log level cannot.
		r.log.Warn("contributions refresh",
			"state", "failed", "attempts", attempts, "breaker", r.breaker.open(), "err", err)
		return
	}

	if err := r.write(ctx, result); err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		// The fetch worked, so the breaker stays closed: GitHub is fine and
		// this is our own storage failing.
		r.log.Error("contributions refresh", "state", "not stored", "err", err)
		return
	}

	r.breaker.succeeded()

	// At INFO and on every successful run. Together with the "fresh" line above
	// this is the only evidence that the loop is alive, and the runbook's first
	// question — "has the calendar stopped ageing?" — is answered by its absence.
	r.log.Info("contributions refresh",
		"state", "fetched", "attempts", attempts,
		"weeks", len(result.weeks), "total", result.total)
}

// age reports how old the stored calendar is, and whether there is one at all.
//
// A missing row is not an error here. It is the cold start: nothing has ever
// been fetched, which is exactly the case this run exists to fix. The handler
// turns the same absence into the contract's 502.
func (r *Refresher) age(ctx context.Context) (time.Duration, bool, error) {
	row, err := r.queries.GetContributions(ctx, r.login)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return 0, false, nil
	case err != nil:
		return 0, false, err
	}
	return time.Duration(row.CacheAgeSec) * time.Second, true, nil
}

func (r *Refresher) write(ctx context.Context, result calendar) error {
	weeks, err := json.Marshal(result.weeks)
	if err != nil {
		return err
	}

	return r.queries.UpsertContributions(ctx, store.UpsertContributionsParams{
		Login:              r.login,
		TotalContributions: int32(result.total),
		Weeks:              weeks,
	})
}
