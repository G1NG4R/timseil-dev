package contact

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/G1NG4R/timseil-dev/api/internal/mail"
	"github.com/G1NG4R/timseil-dev/api/internal/resilience"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// DispatchQueries is the slice of the store the dispatcher needs. Narrow on
// purpose, and deliberately narrower than the handler's: nothing in this loop
// may insert a message or read the rate-limit floor.
type DispatchQueries interface {
	ListDeliverableContactMessages(ctx context.Context,
		arg store.ListDeliverableContactMessagesParams) (
		[]store.ListDeliverableContactMessagesRow, error)
	MarkContactMessageSent(ctx context.Context, arg store.MarkContactMessageSentParams) error
	MarkContactMessageFailed(ctx context.Context, arg store.MarkContactMessageFailedParams) error
}

// Dispatcher carries out what the handler could not.
//
// It exists because the handler gets exactly one attempt. A visitor is waiting
// on the answer, the contact page gives up after eight seconds, and a retry
// inside the request would spend a budget that belongs to the person watching
// the form. So a failed send leaves the row queued with its error, and this loop
// comes back for it — which is what turns five columns in 00006_contact.sql from
// decoration into a delivery machine.
//
// Same shape as internal/contributions' Refresher and internal/ops' Aggregator:
// it owns a goroutine from construction, its clock and its ticks are injectable,
// Stop is idempotent, and a run never dies on an error.
type Dispatcher struct {
	queries DispatchQueries
	sender  mail.Sender
	to      string
	budget  *Budget
	breaker *resilience.Breaker
	log     *slog.Logger
	now     func() time.Time

	ticks       <-chan time.Time
	stopTicking func()

	cancel context.CancelFunc
	stop   chan struct{}
	done   chan struct{}
}

// NewDispatcher starts the loop. Call Stop before closing the pool.
func NewDispatcher(q DispatchQueries, sender mail.Sender, to string, b *Budget,
	log *slog.Logger,
) *Dispatcher {
	ticker := time.NewTicker(dispatchEvery)
	return startDispatcher(q, sender, to, b, log, ticker.C, ticker.Stop, time.Now)
}

func startDispatcher(
	q DispatchQueries,
	sender mail.Sender,
	to string,
	b *Budget,
	log *slog.Logger,
	ticks <-chan time.Time,
	stopTicking func(),
	now func() time.Time,
) *Dispatcher {
	ctx, cancel := context.WithCancel(context.Background())

	d := &Dispatcher{
		queries: q,
		sender:  sender,
		to:      to,
		budget:  b,
		breaker: resilience.NewBreaker(resilience.BreakerPolicy{
			Threshold: breakerThreshold,
			Cooldown:  breakerCooldown,
		}, now),
		log:         log,
		now:         now,
		ticks:       ticks,
		stopTicking: stopTicking,
		cancel:      cancel,
		stop:        make(chan struct{}),
		done:        make(chan struct{}),
	}

	go d.loop(ctx)
	return d
}

// Stop ends the loop, cancelling the send that is running rather than waiting
// for it. Idempotent, because the shutdown path reaches it on two routes and
// should not have to reason about which one ran.
//
// A send interrupted halfway is the one loss this design accepts: the relay may
// have taken the message without the row being marked, so the next run may
// deliver it twice. The alternative is holding the shutdown open for an SMTP
// conversation that has already used most of the grace period, and a duplicate
// mail to one's own inbox is cheaper than a container killed mid-drain.
func (d *Dispatcher) Stop() {
	select {
	case <-d.stop:
		return
	default:
	}

	close(d.stop)
	d.cancel()
	d.stopTicking()
	<-d.done
}

// loop runs once and then on every tick. Once immediately, for the reason
// internal/ops gives: a process that restarts more often than the tick would
// otherwise never run at all, and after a deploy a queued message would wait a
// minute longer than it has to.
func (d *Dispatcher) loop(ctx context.Context) {
	defer close(d.done)

	d.runOnce(ctx)

	for {
		select {
		case <-d.stop:
			return
		case <-d.ticks:
			d.runOnce(ctx)
		}
	}
}

// runOnce drains what it can of the queue.
//
// It never returns an error and never ends the loop. A run that cannot reach the
// database is a run that logs and comes back in a minute; a loop that died there
// would leave every later message queued forever with nothing to say why.
func (d *Dispatcher) runOnce(ctx context.Context) {
	if !d.breaker.Allow() {
		// INFO and not WARN: a shut breaker is this loop working. The relay
		// being down is what WARN was for, and it has already been logged three
		// times.
		d.log.Info("contact dispatch", "state", "breaker open")
		return
	}

	runCtx, cancel := context.WithTimeout(ctx, dispatchTimeout)
	defer cancel()

	rows, err := d.queries.ListDeliverableContactMessages(runCtx,
		store.ListDeliverableContactMessagesParams{
			MaxAttempts: maxDeliveryAttempts,
			BackoffBase: pgtype.Interval{
				Microseconds: deliveryBackoffBase.Microseconds(), Valid: true,
			},
			BatchSize: dispatchBatch,
		})
	if err != nil {
		if errors.Is(err, context.Canceled) {
			// The process is stopping. An ERROR line here would cry wolf on
			// every deploy.
			return
		}
		d.log.Error("contact dispatch", "state", "queue unreadable", "err", err)
		return
	}

	if len(rows) == 0 {
		// One line per run, whether or not there was work. It is the only
		// evidence that this loop is alive — CLAUDE.md forbids a metric without
		// a dashboard, and Prometheus arrives in stage F.
		d.log.Info("contact dispatch", "state", "queue empty",
			"budget", d.budget.remaining())
		return
	}

	sent, failed, deferred := d.deliver(runCtx, rows)

	d.log.Info("contact dispatch", "state", "ran",
		"queued", len(rows), "sent", sent, "failed", failed, "deferred", deferred,
		"budget", d.budget.remaining())

	// The breaker counts runs, not messages. A run in which something got
	// through is a run that says the relay is up, whatever else failed.
	switch {
	case sent > 0:
		d.breaker.Succeeded()
	case failed > 0:
		d.breaker.Failed()
		if d.breaker.Open() {
			d.log.Warn("contact dispatch has stopped reaching the relay",
				"cooldown", breakerCooldown.String())
		}
	}
}

// deliver sends what the budget allows, and stops at the first message the
// budget cannot pay for.
//
// Stops rather than skips: the queue is oldest first, so continuing past a
// message the budget refused would deliver a newer one ahead of it and leave the
// oldest waiting longest — the opposite of what the ORDER BY is for.
func (d *Dispatcher) deliver(ctx context.Context,
	rows []store.ListDeliverableContactMessagesRow,
) (sent, failed, deferred int) {
	for i, row := range rows {
		if ctx.Err() != nil {
			return sent, failed, deferred + len(rows) - i
		}
		if !d.budget.take(d.now()) {
			return sent, failed, deferred + len(rows) - i
		}

		if err := d.send(ctx, row); err != nil {
			failed++
			continue
		}
		sent++
	}
	return sent, failed, deferred
}

func (d *Dispatcher) send(ctx context.Context, row store.ListDeliverableContactMessagesRow) error {
	now := d.now()

	// Received is the moment the visitor was answered, not the moment of this
	// attempt: the mail says when the message arrived, which is what they were
	// told, while Date says when it was handed over.
	received := now
	if row.ClientTs.Valid {
		received = row.ClientTs.Time
	}

	outgoing := message(row.ID, d.sender.From(), d.to, submission{
		name:    row.Name,
		email:   row.Email,
		message: row.Message,
		dwellMs: row.DwellMs,
	}, received, now)

	if err := d.sender.Send(ctx, outgoing); err != nil {
		// Attempt number and the reason, never the address. F1's PII rule, and
		// there is nothing a log line could do with an address that the row
		// cannot do better.
		d.log.Warn("contact delivery failed",
			"id", row.ID, "attempt", row.DeliveryAttempts+1, "err", err)
		d.markFailed(ctx, row, err)
		return err
	}

	// Detached from the run's deadline. A send that finishes just as the run
	// times out is a message the relay took, and a cancelled UPDATE here would
	// leave it queued to be sent again.
	markCtx, cancelMark := context.WithTimeout(context.WithoutCancel(ctx), bookkeepingTimeout)
	defer cancelMark()

	if err := d.queries.MarkContactMessageSent(markCtx, store.MarkContactMessageSentParams{
		ID:            row.ID,
		MailMessageID: &outgoing.MessageID,
	}); err != nil {
		// Delivered, not recorded. The row stays queued and the next run may
		// send it again; a duplicate to one's own inbox is the cheaper of the
		// two mistakes, and this line is how it gets explained.
		d.log.Error("contact message was delivered but not marked", "id", row.ID, "err", err)
	}
	return nil
}

func (d *Dispatcher) markFailed(ctx context.Context,
	row store.ListDeliverableContactMessagesRow, cause error,
) {
	// Detached: the attempt counter is what ends the retries, and a run cut at
	// its deadline must still record that it tried. Without this a message
	// whose every attempt lands on the deadline stays eligible forever.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), bookkeepingTimeout)
	defer cancel()

	attempts := row.DeliveryAttempts + 1

	status := "queued"
	switch {
	case errors.Is(cause, mail.ErrPermanent):
		status = "failed"
	case attempts >= maxDeliveryAttempts:
		status = "failed"
	}

	if status == "failed" {
		// The moment a message stops being this loop's problem and becomes a
		// person's. Nothing is lost — the row still holds the address and the
		// text, so the answer can be written by hand — but nothing further
		// happens on its own, and that is worth an ERROR rather than a WARN.
		d.log.Error("contact message given up on",
			"id", row.ID, "attempts", attempts, "err", cause)
	}

	reason := truncate(cause.Error())
	if err := d.queries.MarkContactMessageFailed(ctx, store.MarkContactMessageFailedParams{
		ID:             row.ID,
		DeliveryStatus: status,
		LastError:      &reason,
	}); err != nil {
		d.log.Error("recording a failed contact delivery", "id", row.ID, "err", err)
	}
}
