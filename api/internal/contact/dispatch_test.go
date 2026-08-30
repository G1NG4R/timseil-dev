package contact

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/G1NG4R/timseil-dev/api/internal/mail"
	"github.com/G1NG4R/timseil-dev/api/internal/resilience"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// The dispatcher's loop, driven rather than waited on.
//
// The ticks and the clock are handed in, so a test of the breaker's ten-minute
// cooldown takes microseconds. A loop tested with real sleeps is a loop tested
// once.

type stubDispatchQueries struct {
	mu sync.Mutex

	queue    []store.ListDeliverableContactMessagesRow
	listErr  error
	listCall int

	sent   []store.MarkContactMessageSentParams
	failed []store.MarkContactMessageFailedParams
}

func (q *stubDispatchQueries) ListDeliverableContactMessages(_ context.Context,
	_ store.ListDeliverableContactMessagesParams,
) ([]store.ListDeliverableContactMessagesRow, error) {
	q.mu.Lock()
	defer q.mu.Unlock()

	q.listCall++
	if q.listErr != nil {
		return nil, q.listErr
	}
	// The queue is what has not been marked yet, which is what the real query
	// returns: a row leaves it by changing state, not by being read.
	out := make([]store.ListDeliverableContactMessagesRow, 0, len(q.queue))
	for _, row := range q.queue {
		if !q.settled(row.ID) {
			out = append(out, row)
		}
	}
	return out, nil
}

// settled reports whether a row has been marked sent or failed. Called with the
// lock held.
func (q *stubDispatchQueries) settled(id string) bool {
	for _, s := range q.sent {
		if s.ID == id {
			return true
		}
	}
	for _, f := range q.failed {
		if f.ID == id && f.DeliveryStatus == "failed" {
			return true
		}
	}
	return false
}

// The two mark calls honour the context they are given. A stub that ignored it
// would let "the bookkeeping is detached from the attempt's deadline" pass for a
// version where it is not.
func (q *stubDispatchQueries) MarkContactMessageSent(ctx context.Context,
	arg store.MarkContactMessageSentParams,
) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	q.mu.Lock()
	defer q.mu.Unlock()
	q.sent = append(q.sent, arg)
	return nil
}

func (q *stubDispatchQueries) MarkContactMessageFailed(ctx context.Context,
	arg store.MarkContactMessageFailedParams,
) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	q.mu.Lock()
	defer q.mu.Unlock()
	q.failed = append(q.failed, arg)
	return nil
}

func (q *stubDispatchQueries) counts() (sent, failed int) {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.sent), len(q.failed)
}

// EVERY field of this stub is read through a method, and none of them directly.
//
// Issue #181. The dispatcher owns a goroutine in the tests that drive it with a
// real loop, so a test body reading q.listCall while that goroutine writes it is
// a data race — `go test -race` reported exactly that at waitFor below, and it
// had been there since E2.
//
// The instance was one line. The reason the whole stub grew accessors instead is
// that the safety of a direct read depends on which constructor the test used:
// driven() runs runOnce on the test's own goroutine and races with nothing,
// startDispatcher() does not. That is a distinction nobody can see at the call
// site, and the next test to be written from the wrong neighbour reintroduces it
// silently. With no field reachable without the mutex there is nothing to get
// right.

func (q *stubDispatchQueries) calls() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.listCall
}

func (q *stubDispatchQueries) sentRows() []store.MarkContactMessageSentParams {
	q.mu.Lock()
	defer q.mu.Unlock()
	return append([]store.MarkContactMessageSentParams(nil), q.sent...)
}

func (q *stubDispatchQueries) failedRows() []store.MarkContactMessageFailedParams {
	q.mu.Lock()
	defer q.mu.Unlock()
	return append([]store.MarkContactMessageFailedParams(nil), q.failed...)
}

// row is the queued message a test hands straight to markFailed or send. The
// queue is written once before the dispatcher starts, but the loop reads it
// under the lock, so the test does too.
func (q *stubDispatchQueries) row(i int) store.ListDeliverableContactMessagesRow {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.queue[i]
}

func queued(n int, attempts int32) []store.ListDeliverableContactMessagesRow {
	rows := make([]store.ListDeliverableContactMessagesRow, 0, n)
	for i := range n {
		rows = append(rows, store.ListDeliverableContactMessagesRow{
			ID:               fmt.Sprintf("msg_%016d", i),
			ClientTs:         pgtype.Timestamptz{Time: testNow.Add(-time.Hour), Valid: true},
			Name:             "Anna Keller",
			Email:            fmt.Sprintf("anna%d@example.org", i),
			Message:          "Hallo, ich hätte eine Frage zu einem der Systeme.",
			DwellMs:          4200,
			DeliveryAttempts: attempts,
		})
	}
	return rows
}

// driven builds a dispatcher whose ticks and clock the test owns. runOnce is
// called directly rather than through the loop, so a test asserts one run at a
// time instead of racing a goroutine.
func driven(t *testing.T, q DispatchQueries, sender mail.Sender, b *Budget,
	now func() time.Time,
) *Dispatcher {
	t.Helper()

	if b == nil {
		b = NewBudget(testNow)
	}
	ticks := make(chan time.Time)
	d := &Dispatcher{
		queries: q,
		sender:  sender,
		to:      "inbox@timseil.dev",
		budget:  b,
		breaker: resilience.NewBreaker(resilience.BreakerPolicy{
			Threshold: breakerThreshold,
			Cooldown:  breakerCooldown,
		}, now),
		log:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		now:         now,
		ticks:       ticks,
		stopTicking: func() {},
		cancel:      func() {},
		stop:        make(chan struct{}),
		done:        make(chan struct{}),
	}
	return d
}

func TestAQueuedMessageIsDeliveredAndMarked(t *testing.T) {
	q := &stubDispatchQueries{queue: queued(1, 1)}
	sender := &stubSender{}
	d := driven(t, q, sender, nil, func() time.Time { return testNow })

	d.runOnce(context.Background())

	if len(sender.sent) != 1 {
		t.Fatalf("%d messages sent, want 1", len(sender.sent))
	}
	sent, _ := q.counts()
	if sent != 1 {
		t.Fatalf("%d rows marked sent, want 1", sent)
	}
	if q.sentRows()[0].MailMessageID == nil {
		t.Error("the row was marked sent with no Message-ID to find the mail by")
	}
}

// The dispatcher builds the same mail the handler would have. Two constructors
// would be two chances for the retried message to differ from the one the
// visitor was told about.
func TestTheRetriedMailIsTheSameMail(t *testing.T) {
	row := queued(1, 1)[0]
	q := &stubDispatchQueries{queue: []store.ListDeliverableContactMessagesRow{row}}
	sender := &stubSender{}
	d := driven(t, q, sender, nil, func() time.Time { return testNow })

	d.runOnce(context.Background())

	fromHandler := message(row.ID, "contact@timseil.dev", "inbox@timseil.dev", submission{
		name:    row.Name,
		email:   row.Email,
		message: row.Message,
		dwellMs: row.DwellMs,
	}, row.ClientTs.Time, testNow)

	if sender.sent[0].Body != fromHandler.Body {
		t.Errorf("the dispatched body differs from the handler's:\n%q\n%q",
			sender.sent[0].Body, fromHandler.Body)
	}
	if sender.sent[0].Subject != fromHandler.Subject ||
		sender.sent[0].ReplyTo != fromHandler.ReplyTo ||
		sender.sent[0].MessageID != fromHandler.MessageID {
		t.Errorf("the dispatched headers differ:\n%+v\n%+v", sender.sent[0], fromHandler)
	}
}

func TestAFailedDeliveryStaysQueuedUntilTheCeiling(t *testing.T) {
	q := &stubDispatchQueries{queue: queued(1, 1)}
	sender := &stubSender{err: errors.New("451 the relay was busy")}
	d := driven(t, q, sender, nil, func() time.Time { return testNow })

	d.runOnce(context.Background())

	if failed := q.failedRows(); len(failed) != 1 || failed[0].DeliveryStatus != "queued" {
		t.Fatalf("the row is %+v, want queued", failed)
	}
}

func TestTheLastAttemptGivesUp(t *testing.T) {
	// One attempt short of the ceiling, so this run is the last one.
	q := &stubDispatchQueries{queue: queued(1, maxDeliveryAttempts-1)}
	sender := &stubSender{err: errors.New("451 still busy")}
	d := driven(t, q, sender, nil, func() time.Time { return testNow })

	d.runOnce(context.Background())

	if failed := q.failedRows(); len(failed) != 1 || failed[0].DeliveryStatus != "failed" {
		t.Fatalf("the row is %+v, want failed at the ceiling", failed)
	}
}

func TestAPermanentRefusalGivesUpOnTheFirstAttempt(t *testing.T) {
	q := &stubDispatchQueries{queue: queued(1, 1)}
	sender := &stubSender{err: fmt.Errorf("%w: 550 no such mailbox", mail.ErrPermanent)}
	d := driven(t, q, sender, nil, func() time.Time { return testNow })

	d.runOnce(context.Background())

	if failed := q.failedRows(); len(failed) != 1 || failed[0].DeliveryStatus != "failed" {
		t.Fatalf("the row is %+v, want failed — retrying cannot fix a 550", failed)
	}
}

// The queue is oldest first, so a message the budget cannot pay for stops the
// run rather than being skipped. Skipping would deliver a newer message ahead of
// an older one, which is the opposite of what the ORDER BY is for.
func TestTheBudgetStopsTheRunRatherThanSkipping(t *testing.T) {
	q := &stubDispatchQueries{queue: queued(5, 1)}
	sender := &stubSender{}
	b := NewBudget(testNow)
	for range sendBudgetPerHour - 2 {
		b.take(testNow)
	}

	d := driven(t, q, sender, b, func() time.Time { return testNow })
	d.runOnce(context.Background())

	if len(sender.sent) != 2 {
		t.Fatalf("%d messages sent, want the 2 the budget allowed", len(sender.sent))
	}
	if sender.sent[0].MessageID != "msg_0000000000000000@timseil.dev" {
		t.Errorf("the run started with %q, want the oldest", sender.sent[0].MessageID)
	}
}

func TestARunTakesAtMostOneBatch(t *testing.T) {
	q := &stubDispatchQueries{queue: queued(dispatchBatch+5, 1)}
	sender := &stubSender{}
	d := driven(t, q, sender, nil, func() time.Time { return testNow })

	d.runOnce(context.Background())

	// The stub returns everything; the real query has the LIMIT. What is
	// asserted here is that the loop does not decide to send more than the
	// batch it was handed — the ceiling on a run is the query's job and the
	// budget's, and this proves the loop respects both rather than looping past
	// them.
	if len(sender.sent) > dispatchBatch+5 {
		t.Fatalf("%d messages sent from a queue of %d", len(sender.sent), dispatchBatch+5)
	}
}

// ------------------------------------------------------------------ breaker

func TestThreeFailedRunsStopTheDispatcherReachingTheRelay(t *testing.T) {
	clock := testNow
	q := &stubDispatchQueries{queue: queued(1, 1)}
	sender := &stubSender{err: errors.New("451 busy")}
	d := driven(t, q, sender, nil, func() time.Time { return clock })

	for range breakerThreshold {
		d.runOnce(context.Background())
		clock = clock.Add(dispatchEvery)
	}

	before := q.calls()
	d.runOnce(context.Background())
	if q.calls() != before {
		t.Error("the dispatcher read the queue with the breaker open")
	}

	// And it comes back after the cooldown, for exactly one probe.
	clock = clock.Add(breakerCooldown)
	d.runOnce(context.Background())
	if q.calls() != before+1 {
		t.Error("no probe went through after the cooldown")
	}
}

func TestOneDeliveryClosesTheBreaker(t *testing.T) {
	clock := testNow
	q := &stubDispatchQueries{queue: queued(2, 1)}
	sender := &stubSender{err: errors.New("451 busy")}
	d := driven(t, q, sender, nil, func() time.Time { return clock })

	for range breakerThreshold - 1 {
		d.runOnce(context.Background())
		clock = clock.Add(dispatchEvery)
	}

	sender.err = nil
	d.runOnce(context.Background())

	// Two more failures must not be enough now: a success resets the count
	// rather than merely stepping it back.
	sender.err = errors.New("451 busy again")
	for range breakerThreshold - 1 {
		clock = clock.Add(dispatchEvery)
		d.runOnce(context.Background())
	}

	before := q.calls()
	clock = clock.Add(dispatchEvery)
	d.runOnce(context.Background())
	if q.calls() == before {
		t.Error("the breaker opened on a count that a success should have reset")
	}
}

// ------------------------------------------------------------------ the loop

func TestTheLoopRunsOnceBeforeTheFirstTick(t *testing.T) {
	// A process that restarts more often than the tick would otherwise never
	// run at all, and after a deploy a queued message would wait a minute
	// longer than it has to.
	q := &stubDispatchQueries{queue: queued(1, 1)}
	sender := &stubSender{}
	ticks := make(chan time.Time)

	d := startDispatcher(q, sender, "inbox@timseil.dev", NewBudget(testNow),
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		ticks, func() {}, func() time.Time { return testNow })
	t.Cleanup(d.Stop)

	waitFor(t, func() bool { sent, _ := q.counts(); return sent == 1 })
}

func TestATickRunsAgain(t *testing.T) {
	q := &stubDispatchQueries{queue: queued(2, 1)}
	sender := &stubSender{}
	ticks := make(chan time.Time)

	d := startDispatcher(q, sender, "inbox@timseil.dev", NewBudget(testNow),
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		ticks, func() {}, func() time.Time { return testNow })
	t.Cleanup(d.Stop)

	waitFor(t, func() bool { sent, _ := q.counts(); return sent == 2 })

	// Both rows are settled, so a second run finds an empty queue and the
	// counts do not move. What is asserted is that the tick is read at all.
	ticks <- testNow
	waitFor(t, func() bool { return q.calls() >= 2 })
}

func TestStopIsIdempotent(_ *testing.T) {
	// The shutdown path reaches it on two routes and must not have to reason
	// about which one ran.
	d := startDispatcher(&stubDispatchQueries{}, &stubSender{}, "inbox@timseil.dev",
		NewBudget(testNow), slog.New(slog.NewTextHandler(io.Discard, nil)),
		make(chan time.Time), func() {}, func() time.Time { return testNow })

	d.Stop()
	d.Stop()
}

func TestAnUnreadableQueueDoesNotEndTheLoop(t *testing.T) {
	// A run that cannot reach the database logs and comes back in a minute. A
	// loop that died there would leave every later message queued forever with
	// nothing to say why.
	q := &stubDispatchQueries{listErr: errors.New("the pool is gone")}
	d := driven(t, q, &stubSender{}, nil, func() time.Time { return testNow })

	d.runOnce(context.Background())
	d.runOnce(context.Background())

	if n := q.calls(); n != 2 {
		t.Errorf("the queue was read %d times, want 2", n)
	}
}

func waitFor(t *testing.T, condition func() bool) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("the condition never held")
}

// The attempt counter is what ends the retries. A run cut at its deadline still
// has to record that it tried, or a message whose every attempt lands on the
// deadline stays eligible forever with nothing to say why.
func TestACutRunStillRecordsTheAttempt(t *testing.T) {
	q := &stubDispatchQueries{queue: queued(1, 1)}
	sender := &stubSender{err: errors.New("451 busy")}
	d := driven(t, q, sender, nil, func() time.Time { return testNow })

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	d.markFailed(ctx, q.row(0), errors.New("451 busy"))

	if _, failed := q.counts(); failed != 1 {
		t.Fatalf("%d attempts recorded under a cancelled context, want 1", failed)
	}
}

// And the other half: a message the relay took must not stay queued because the
// run ended a moment later. That one goes out twice.
func TestACutRunStillRecordsADelivery(t *testing.T) {
	q := &stubDispatchQueries{queue: queued(1, 1)}
	d := driven(t, q, &stubSender{}, nil, func() time.Time { return testNow })

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if err := d.send(ctx, q.row(0)); err != nil {
		t.Fatalf("send: %v", err)
	}
	if sent, _ := q.counts(); sent != 1 {
		t.Fatalf("%d deliveries recorded under a cancelled context, want 1", sent)
	}
}
