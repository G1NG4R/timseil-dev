package contact

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/G1NG4R/timseil-dev/api/internal/traceparent"
)

// PurgeQueries is the slice of the store the purge needs, and it is one
// statement wide.
//
// Narrower than DispatchQueries for the same reason that one is narrower than
// the handler's: nothing in this loop may insert, read or send. A purge that
// could also SELECT a message would be the one place in this package where
// personal data could be read back out without a person asking for it, and the
// cheapest way not to have that place is not to have the method.
type PurgeQueries interface {
	PurgeContactMessages(ctx context.Context, cutoff pgtype.Timestamptz) (int64, error)
}

// Purger deletes what the retention window no longer covers.
//
// It exists because the privacy page names a number, and a number on that page
// that no loop keeps is what the handbook calls an untruth with legal
// consequences. 00006_contact.sql anticipated it in as many words — the index
// this query needs "arrives with the job, not before it" — and H12 is where the
// job arrives.
//
// Same shape as the Dispatcher next door, and as internal/ops' Aggregator and
// internal/contributions' Refresher: it owns a goroutine from construction, its
// clock and its ticks are injectable, Stop is idempotent, and a run never dies
// on an error.
//
// WITH ONE PIECE OF THAT MACHINERY LEFT OUT, deliberately: there is no breaker.
// The dispatcher has one because every attempt it makes carries a credential to
// somebody else's relay, so failing fast is a courtesy and a security property.
// This loop talks to the pool it already holds. A run that cannot reach the
// database is a run that logs and comes back in an hour, and an hour is already
// slower than any breaker would be.
type Purger struct {
	queries PurgeQueries
	log     *slog.Logger
	now     func() time.Time
	window  time.Duration

	ticks       <-chan time.Time
	stopTicking func()

	cancel context.CancelFunc
	stop   chan struct{}
	done   chan struct{}
}

// NewPurger starts the loop. Call Stop before closing the pool.
func NewPurger(q PurgeQueries, log *slog.Logger) *Purger {
	ticker := time.NewTicker(purgeEvery)
	return startPurger(q, log, retentionWindow, ticker.C, ticker.Stop, time.Now)
}

// startPurger is the seam the tests drive. The window is a parameter here and a
// constant at the call above, so a test can put the boundary a millisecond away
// instead of thirty days away.
func startPurger(
	q PurgeQueries,
	log *slog.Logger,
	window time.Duration,
	ticks <-chan time.Time,
	stopTicking func(),
	now func() time.Time,
) *Purger {
	ctx, cancel := context.WithCancel(context.Background())

	p := &Purger{
		queries:     q,
		log:         log,
		now:         now,
		window:      window,
		ticks:       ticks,
		stopTicking: stopTicking,
		cancel:      cancel,
		stop:        make(chan struct{}),
		done:        make(chan struct{}),
	}

	go p.loop(ctx)
	return p
}

// Stop ends the loop, cancelling the delete that is running rather than waiting
// for it. Idempotent, because the shutdown path reaches it on two routes and
// should not have to reason about which one ran.
//
// A delete cut halfway loses nothing. It is one statement, so the transaction
// either committed or it did not, and whatever it did not take this hour it
// takes the next.
func (p *Purger) Stop() {
	select {
	case <-p.stop:
		return
	default:
	}

	close(p.stop)
	p.cancel()
	p.stopTicking()
	<-p.done
}

// loop runs once and then on every tick. Once immediately, for the reason the
// dispatcher gives: a process that restarts more often than the tick would
// otherwise never run at all — and on an hourly tick that is a real prospect
// during a week of deploys, which is exactly the week nobody would notice the
// table had stopped being cleared.
func (p *Purger) loop(ctx context.Context) {
	defer close(p.done)

	p.runOnce(ctx)

	for {
		select {
		case <-p.stop:
			return
		case <-p.ticks:
			p.runOnce(ctx)
		}
	}
}

// runOnce deletes one window's worth of settled messages.
//
// It never returns an error and never ends the loop. A run that cannot reach
// the database is a run that logs and comes back on the next tick; a loop that
// died there would leave the table growing forever with nothing to say why, and
// the page would go on promising a deletion that had quietly stopped happening.
func (p *Purger) runOnce(ctx context.Context) {
	// One trace per run, for the reason the dispatcher gives: nobody asked for
	// this, so there is no request id, but the lines one run writes belong
	// together and are otherwise indistinguishable from the run before it.
	ctx = traceparent.With(ctx, traceparent.New())

	cutoff := p.now().UTC().Add(-p.window)

	runCtx, cancel := context.WithTimeout(ctx, purgeTimeout)
	defer cancel()

	deleted, err := p.queries.PurgeContactMessages(runCtx, pgtype.Timestamptz{
		Time: cutoff, Valid: true,
	})
	if err != nil {
		if errors.Is(err, context.Canceled) {
			// The process is stopping. An ERROR line here would cry wolf on
			// every deploy.
			return
		}
		p.log.ErrorContext(ctx, "contact purge", "error", err)
		return
	}

	if deleted == 0 {
		// The ordinary case, seven hundred times out of seven hundred and one.
		// At INFO it would be the loudest thing in the log and would say
		// nothing.
		p.log.DebugContext(ctx, "contact purge", "deleted", 0)
		return
	}

	// A count and a cutoff, and nothing else. The package comment says no name,
	// no address and no message reaches a log, and a purge is the last place
	// that rule would be worth breaking for convenience.
	p.log.InfoContext(ctx, "contact purge",
		"deleted", deleted,
		"older_than", cutoff.Format(time.RFC3339))
}
