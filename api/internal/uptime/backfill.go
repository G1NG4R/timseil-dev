package uptime

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/G1NG4R/timseil-dev/api/internal/config"
	"github.com/G1NG4R/timseil-dev/api/internal/resilience"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
	"github.com/G1NG4R/timseil-dev/api/internal/traceparent"
)

// Queries is the slice of the store this package needs.
//
// Hand-written because sqlc emits no interface (sqlc.yaml), and narrow on
// purpose: it is what lets the loop, the error paths and the shutdown be tested
// without Postgres.
type Queries interface {
	SystemIDBySlug(ctx context.Context, slug string) (int64, error)
	BackfillOpsChecks(ctx context.Context, arg store.BackfillOpsChecksParams) (int64, error)
}

// fetchFunc is one read of the log, with the etag of the last one.
type fetchFunc func(ctx context.Context, etag string) (document, error)

// Backfiller replays the outage log into ops_checks.
//
// It owns a goroutine from the moment it is created, in the shape
// ops.Aggregator and contributions.Refresher already use.
type Backfiller struct {
	queries Queries
	slug    string
	step    time.Duration
	fetch   fetchFunc
	breaker *resilience.Breaker
	log     *slog.Logger

	// etag of the last successful read. Touched only by the loop goroutine, so
	// it needs no lock — the same argument resilience.Breaker makes about
	// itself.
	etag string

	ticks       <-chan time.Time
	stopTicking func()

	// cancel ends the read that is running rather than waiting for it. See Stop.
	cancel context.CancelFunc

	stop chan struct{}
	done chan struct{}
}

// New starts the loop. Call Stop before closing the pool.
//
// step is the probe interval, handed in rather than declared here. ADR 0019 §6
// keeps that number in internal/ops next to the reason it was chosen, and a
// second copy of it in this package would be the same number with two truths —
// the failure mode being an outage duration on a public page that is off by a
// factor and looks entirely correct.
//
// Unless the deployment says it does not replay, in which case the loop is not
// started at all. Not started rather than started and made to do nothing: a
// ticker that wakes to decide it has no work shows up in a profile as work.
func New(q Queries, cfg config.Uptime, slug string, step time.Duration, log *slog.Logger) *Backfiller {
	if !cfg.Replays() {
		log.Warn("the outage log is NOT being replayed — "+
			config.EnvUptimeTransport+" is "+config.TransportOff,
			"reason", "this deployment says it does not read the ops-data branch",
			"effect", "an outage this host could not record for itself stays a gap in the grid")
		return stopped()
	}

	ticker := time.NewTicker(replayEvery)
	return start(q, slug, step, newFetcher().fetch, log, ticker.C, ticker.Stop)
}

// stopped is a Backfiller that has already finished. It owns no goroutine and
// holds no ticker, and Stop walks its ordinary path over it: the shutdown in
// cmd/api releases the same things in the same order whatever the transport,
// which is one branch that does not have to exist there.
func stopped() *Backfiller {
	stop, done := make(chan struct{}), make(chan struct{})
	close(stop)
	close(done)

	return &Backfiller{
		cancel:      func() {},
		stopTicking: func() {},
		stop:        stop,
		done:        done,
	}
}

// start is New with the clock, the ticks and GitHub itself handed in, so the
// tests drive the loop instead of sleeping through it.
func start(
	q Queries,
	slug string,
	step time.Duration,
	fetch fetchFunc,
	log *slog.Logger,
	ticks <-chan time.Time,
	stopTicking func(),
) *Backfiller {
	ctx, cancel := context.WithCancel(context.Background())

	b := &Backfiller{
		queries:     q,
		slug:        slug,
		step:        step,
		fetch:       fetch,
		breaker:     resilience.NewBreaker(breakerPolicy, time.Now),
		log:         log,
		ticks:       ticks,
		stopTicking: stopTicking,
		cancel:      cancel,
		stop:        make(chan struct{}),
		done:        make(chan struct{}),
	}

	go b.loop(ctx)
	return b
}

// Stop ends the loop and returns. Idempotent, because the shutdown path reaches
// it on two different routes and should not have to reason about which one ran.
func (b *Backfiller) Stop() {
	select {
	case <-b.stop:
		return
	default:
	}

	close(b.stop)
	b.cancel()
	b.stopTicking()
	<-b.done
}

// loop reads once and then on every tick.
//
// Once immediately, and here that is the whole point rather than a convenience:
// a process starting is usually a host that has just come back, and the run at
// startup is the one that turns the outage nobody could record into rows. On the
// aggregator the same choice avoids a stale grid; here it is the feature.
func (b *Backfiller) loop(ctx context.Context) {
	defer close(b.done)

	b.runOnce(ctx)

	for {
		select {
		case <-b.stop:
			return
		case <-b.ticks:
			b.runOnce(ctx)
		}
	}
}

// runOnce is one replay.
//
// A failure is a log line and the next tick, never a dead goroutine. The rows
// are on the branch and ON CONFLICT DO NOTHING makes arriving late free, so
// there is nothing here worth ending a process over.
func (b *Backfiller) runOnce(ctx context.Context) {
	// One trace per run: no visitor asked for this, so there is no request id,
	// but the lines one run writes belong together and are otherwise
	// indistinguishable from the run before it.
	ctx = traceparent.With(ctx, traceparent.New())

	if ctx.Err() != nil {
		return
	}

	if !b.breaker.Allow() {
		// INFO and not WARN: a shut breaker is this package working, and the
		// thing that is wrong was already reported when it shut.
		b.log.InfoContext(ctx, "uptime backfill", "state", "breaker open")
		return
	}

	runCtx, cancel := context.WithTimeout(ctx, runTimeout)
	defer cancel()

	doc, attempts, err := resilience.Retry(runCtx, retryPolicy,
		func(ctx context.Context) (document, error) { return b.fetch(ctx, b.etag) })
	switch {
	case errors.Is(err, context.Canceled):
		// The shutdown cancelled it. That is this package being stopped, not
		// this package failing, and an ERROR line here would cry wolf on every
		// deploy.
		return
	case err != nil:
		b.breaker.Failed()
		// WARN and not ERROR: the site is answering and the grid is honest,
		// it is only missing the cells for an outage it already survived.
		b.log.WarnContext(ctx, "uptime backfill",
			"state", "unreachable", "attempts", attempts, "breaker", b.breaker.Open(), "err", err)
		return
	}

	b.breaker.Succeeded()

	switch {
	case doc.missing:
		// The ordinary state of a host that has not gone down since F4 landed.
		b.log.InfoContext(ctx, "uptime backfill", "state", "no log yet")
		return
	case doc.unchanged:
		b.log.InfoContext(ctx, "uptime backfill", "state", "unchanged")
		return
	}

	ts, err := parse(newReader(doc.body))
	if err != nil {
		// ERROR, and the run gives up on the whole file. parse rejects rather
		// than skips for the reason spelled out there: a partially read outage
		// log is a claim that the site was up. The breaker stays closed —
		// GitHub did its job, the file is the problem, and retrying it faster
		// would not make it parse.
		b.log.ErrorContext(ctx, "uptime backfill", "state", "unreadable", "err", err)
		return
	}

	os := outages(ts, b.step)

	written, err := b.write(ctx, os, doc.sourceRef)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		// The read worked, so the breaker stays closed: this is our own storage
		// failing, and it says nothing about the branch.
		b.log.ErrorContext(ctx, "uptime backfill", "state", "not stored", "err", err)
		return
	}

	// Only now, and this is the line that makes re-reading cheap: an etag stored
	// before the write would let a failed write turn into a 304 for ever, and the
	// rows would be lost to an optimisation.
	b.etag = doc.etag

	// At INFO and on every run that got this far. Together with the two lines
	// above it is the only evidence the loop is alive, and the runbook's
	// question — "did the outage ever get filled in?" — is answered by its
	// absence.
	//
	// checks minus written is what the database already had. During a rollout
	// two instances replay the same file and the second one writes nothing,
	// which is the number saying so rather than a fault.
	b.log.InfoContext(ctx, "uptime backfill",
		"state", "replayed",
		"attempts", attempts,
		"transitions", len(ts),
		"outages", len(os),
		"checks", checks(os),
		"rows_new", written,
		"source_ref", doc.sourceRef)
}

// write inserts one statement per outage and returns how many rows were new.
//
// Not one transaction around all of them. Each statement is idempotent on its
// own, a partial replay is a correct shorter one, and the next run completes it
// — so a transaction would buy atomicity nothing here needs and hold a lock
// across a loop.
func (b *Backfiller) write(ctx context.Context, os []outage, sourceRef string) (int64, error) {
	if len(os) == 0 {
		return 0, nil
	}

	systemID, err := b.queries.SystemIDBySlug(ctx, b.slug)
	if err != nil {
		return 0, err
	}

	var written int64
	for _, o := range os {
		at := make([]pgtype.Timestamptz, 0, len(o.at))
		for _, t := range o.at {
			at = append(at, pgtype.Timestamptz{Time: t.UTC(), Valid: true})
		}

		reason, ref := o.reason, sourceRef

		n, err := b.queries.BackfillOpsChecks(ctx, store.BackfillOpsChecksParams{
			SystemID:   systemID,
			Reason:     &reason,
			SourceRef:  &ref,
			ObservedAt: at,
		})
		if err != nil {
			return written, err
		}
		written += n
	}

	return written, nil
}
