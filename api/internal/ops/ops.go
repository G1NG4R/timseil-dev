// Package ops derives the daily operations grid from the raw checks.
//
// The arithmetic is not here. ADR 0017 put the 91-day window in SQL so that the
// read path could not invent an `ok`, and ADR 0019 puts the roll-up there for the
// same reason; what is left in Go is a ticker, four constants and a log line. A
// Go loop over ops_checks would do the same thing right up until somebody edits
// it — the sentence queries/systems.sql already carries about the window.
//
// Nothing in this package decides what a day means. `ok`, `degraded` and
// `outage` come out of one CASE in queries/ops.sql, and `nodata` is produced by
// nobody at all: a day with no check never reaches the INSERT, so the gap in the
// grid is a property of the shape rather than a rule someone has to remember
// (invariant 6).
//
// There is no injected clock here, and that is a departure from internal/systems
// and internal/training on purpose. Those two put a timestamp into a response.
// This one puts no time anywhere — every `now()` in the statement is Postgres's,
// which is the whole point of ADR 0017's rule that "today" has exactly one
// definition. The seam the tests need is the tick channel instead.
package ops

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/store"
	"github.com/G1NG4R/timseil-dev/api/internal/traceparent"
)

// The four numbers this loop runs on.
//
// They are constants and not environment variables, and that is a decision
// rather than an omission. cmd/api gives the same reason for its connection
// limits — they answer no question that differs between one deployment and
// another — and two of these carry a second reason on top of it.
//
// outageChecks decides what a public cell CLAIMS: it is the line between amber
// and red. An operator who could move it from the environment would recolour
// months of history on the next tick, and the site would go on looking correct.
// That is invariant 1's failure mode wearing an operations hat, so the value
// lives in the repository, in a commit, next to the reason for it.
//
// ProbeInterval USED TO BE the second of those and is not any more. down_sec was
// failed checks times this number until #180 counted the probe actually running
// at about a seventh of its declared cadence; queries/ops.sql now derives every
// duration from the observed_at instants themselves, and no constant reaches a
// public duration.
const (
	// The cadence of the external probe (F4). The other half of this number is
	// the cron expression in .github/workflows/probe.yml, and the two have to
	// move together — tools/check-probe-cadence.sh is what makes that true
	// rather than remembered, and docs/runbooks/ops.md says why.
	//
	// Exported, alone among the four, and the reason changed with #180. It is no
	// longer that a duration is multiplied by it — nothing multiplies anything
	// now. It is that internal/uptime replays an outage as instants at this
	// spacing, and those instants become checks_total and checks_down, which are
	// what outageChecks is compared against. A private copy over there would be
	// one number with two truths.
	ProbeInterval = 5 * time.Minute

	// One failed check is a bad ten minutes, two is an outage. The Incident
	// fixture already states this split and deliberately calls it a convention of
	// its own rather than the rule; ADR 0019 is where it becomes the rule.
	outageChecks = 2

	// How often the roll-up runs. Matched to the probe: aggregating faster than
	// measurements arrive rewrites the same rows, aggregating slower leaves the
	// grid behind the data for no reason.
	aggregateEvery = 5 * time.Minute

	// How far back the scan of ops_checks reaches. Bounded on recorded_at, not on
	// observed_at, so a backfill of a month-old observation is inside it however
	// old the observation is — a day is generous for a five-minute tick, and the
	// bound exists to keep the scan off the whole table rather than to decide
	// which days are eligible.
	lookback = 24 * time.Hour
)

// Queries is the slice of the store this package needs.
//
// One method, hand-written because sqlc emits no interface (sqlc.yaml), and
// narrow on purpose: it is what lets the loop, the error path and the shutdown
// be tested without Postgres.
type Queries interface {
	RollUpOpsDays(ctx context.Context, arg store.RollUpOpsDaysParams) (int64, error)
}

// Aggregator ticks the roll-up. It owns a goroutine from the moment it is
// created, in the shape middleware.RateLimiter already uses for its janitor.
type Aggregator struct {
	queries Queries
	log     *slog.Logger

	ticks       <-chan time.Time
	stopTicking func()

	// cancel ends the query that is running, rather than waiting for it. See Stop.
	cancel context.CancelFunc

	stop chan struct{}
	done chan struct{}
}

// New starts the loop. Call Stop before closing the pool.
func New(q Queries, log *slog.Logger) *Aggregator {
	ticker := time.NewTicker(aggregateEvery)
	return start(q, log, ticker.C, ticker.Stop)
}

// start is New with the clock handed in, so the tests drive the loop instead of
// sleeping through it.
func start(q Queries, log *slog.Logger, ticks <-chan time.Time, stopTicking func()) *Aggregator {
	ctx, cancel := context.WithCancel(context.Background())

	a := &Aggregator{
		queries:     q,
		log:         log,
		ticks:       ticks,
		stopTicking: stopTicking,
		cancel:      cancel,
		stop:        make(chan struct{}),
		done:        make(chan struct{}),
	}

	go a.loop(ctx)
	return a
}

// Stop ends the loop and returns.
//
// It cancels the context the running query holds instead of waiting politely for
// it to finish. Every connection carries statement_timeout, so waiting could add
// that whole timeout AFTER the server has already spent its shutdown grace — and
// the container's stop_grace_period answers a process that overruns with a
// SIGKILL. A roll-up interrupted halfway is free to lose: the next tick after
// the restart derives the same days again.
//
// Idempotent, because the shutdown path reaches it on two different routes and
// should not have to reason about which one ran.
func (a *Aggregator) Stop() {
	select {
	case <-a.stop:
		return
	default:
	}

	close(a.stop)
	a.cancel()
	a.stopTicking()
	<-a.done
}

// loop runs the roll-up once and then on every tick.
//
// Once immediately rather than on the first tick: a process that restarts more
// often than the tick period would otherwise never aggregate at all, and after a
// deploy the grid would sit stale for five minutes for no reason. It happens on
// this goroutine, so a database that is not up yet delays nothing — the pool
// dials lazily, and the failure is a log line rather than a refusal to start.
func (a *Aggregator) loop(ctx context.Context) {
	defer close(a.done)

	a.runOnce(ctx)

	for {
		select {
		case <-a.stop:
			return
		case <-a.ticks:
			a.runOnce(ctx)
		}
	}
}

// runOnce is one derivation.
//
// A failure is a log line and the next tick, never a dead goroutine: a grid that
// goes stale is bad, and a grid that never updates again because Postgres was
// restarted once is worse.
func (a *Aggregator) runOnce(ctx context.Context) {
	// One trace per run, and that is the whole of what correlation means for a
	// loop: no visitor asked for this, so there is no request id, but the four
	// or five lines a single run writes belong together and are otherwise
	// indistinguishable from the run before it. F6 hangs a real span here later
	// and changes nothing about the shape.
	ctx = traceparent.With(ctx, traceparent.New())

	if ctx.Err() != nil {
		return
	}

	days, err := a.queries.RollUpOpsDays(ctx, store.RollUpOpsDaysParams{
		LookbackSec:  int32(lookback.Seconds()),
		OutageChecks: outageChecks,
	})
	switch {
	case errors.Is(err, context.Canceled):
		// The shutdown cancelled it. That is this package being stopped, not this
		// package failing, and an ERROR line here would cry wolf on every deploy.
		return
	case err != nil:
		a.log.ErrorContext(ctx, "the ops roll-up failed", "err", err)
		return
	}

	// At INFO and on every run, including the runs that write nothing. This line
	// is the only evidence that the loop is alive, and the runbook's first
	// question — "has the grid stopped updating?" — is answered by its absence.
	a.log.InfoContext(ctx, "ops roll-up", "days", days)
}
