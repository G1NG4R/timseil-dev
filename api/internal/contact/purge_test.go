package contact

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// The purge's loop, driven rather than waited on.
//
// The window, the ticks and the clock are all handed in, so a test of a
// thirty-day boundary takes microseconds. What the WHERE clause does with the
// cutoff is purge_db_test.go's job; what Go does with it is this file's.

type stubPurgeQueries struct {
	mu sync.Mutex

	cutoffs []time.Time
	err     error
}

func (q *stubPurgeQueries) PurgeContactMessages(ctx context.Context,
	cutoff pgtype.Timestamptz,
) (int64, error) {
	// The stub honours the context it is given. One that ignored it would let
	// "the run is bounded by purgeTimeout" pass for a version where it is not.
	if err := ctx.Err(); err != nil {
		return 0, err
	}

	q.mu.Lock()
	defer q.mu.Unlock()

	// Recorded before the error, so a failing run still counts as a run and the
	// test below can prove the loop came back.
	q.cutoffs = append(q.cutoffs, cutoff.Time)
	if q.err != nil {
		return 0, q.err
	}
	return 1, nil
}

func (q *stubPurgeQueries) runs() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.cutoffs)
}

func (q *stubPurgeQueries) lastCutoff() time.Time {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.cutoffs[len(q.cutoffs)-1]
}

// lockedBuffer is a writer the loop's goroutine and the test may touch at the
// same time. Stop already gives the two a happens-before edge, but a log sink
// that is only safe because of where it happens to be read is a trap for the
// next test written against it.
type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// capture gives a logger and a way to read what it wrote. The other tests in
// this package discard their logs; these three are about what does and does not
// reach one.
func capture() (*slog.Logger, func() string) {
	b := &lockedBuffer{}
	handler := slog.NewTextHandler(b, &slog.HandlerOptions{Level: slog.LevelDebug})
	return slog.New(handler), b.String
}

func TestThePurgeRunsAtStartupTicksAndStops(t *testing.T) {
	q := &stubPurgeQueries{}
	ticks := make(chan time.Time)
	tickerStopped := false

	p := startPurger(q, slog.New(slog.NewTextHandler(io.Discard, nil)),
		30*24*time.Hour, ticks, func() { tickerStopped = true }, time.Now)

	// Once at startup, before any tick. An hourly loop in a process that is
	// redeployed twice an hour would otherwise never run at all.
	waitFor(t, func() bool { return q.runs() == 1 })

	ticks <- time.Time{}
	waitFor(t, func() bool { return q.runs() == 2 })

	p.Stop()
	p.Stop() // idempotent: cmd/api reaches it on two routes

	if !tickerStopped {
		t.Error("Stop left the ticker running")
	}

	// Nothing is reading the channel any more. A send that succeeds here would
	// mean the goroutine outlived Stop, which is the leak that shows up as a
	// pool being closed under a query.
	select {
	case ticks <- time.Time{}:
		t.Error("something still reads the tick channel after Stop")
	default:
	}
}

func TestTheCutoffIsNowMinusTheWindow(t *testing.T) {
	q := &stubPurgeQueries{}
	fixed := time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)
	window := 30 * 24 * time.Hour

	p := startPurger(q, slog.New(slog.NewTextHandler(io.Discard, nil)),
		window, make(chan time.Time), func() {},
		func() time.Time { return fixed })
	waitFor(t, func() bool { return q.runs() == 1 })
	p.Stop()

	want := fixed.Add(-window)
	if got := q.lastCutoff(); !got.Equal(want) {
		t.Errorf("cutoff %s, want %s", got, want)
	}

	// The column is timestamptz and the loop reads a wall clock that may be in
	// any zone. Sending a local time would still compare correctly in Postgres,
	// but the log line beside it would name an hour nobody could check against
	// the container's clock.
	if _, offset := q.lastCutoff().Zone(); offset != 0 {
		t.Errorf("cutoff is not UTC: %s", q.lastCutoff())
	}
}

// A run that cannot reach the database is a run that logs and comes back. A
// loop that died there would leave the table growing forever, and the privacy
// page would go on promising a deletion that had quietly stopped happening.
func TestAFailedRunDoesNotStopTheLoop(t *testing.T) {
	q := &stubPurgeQueries{err: errors.New("connection refused")}
	log, read := capture()
	ticks := make(chan time.Time)

	p := startPurger(q, log, 30*24*time.Hour, ticks, func() {}, time.Now)
	waitFor(t, func() bool { return q.runs() == 1 })

	ticks <- time.Time{}
	waitFor(t, func() bool { return q.runs() == 2 })

	p.Stop()

	if !strings.Contains(read(), "level=ERROR") {
		t.Error("a failed run said nothing")
	}
}

// The deploy case. Stop cancels the run in flight, and the error that comes
// back is context.Canceled — which is the process working, not a fault.
func TestACancelledRunIsNotAnError(t *testing.T) {
	q := &stubPurgeQueries{err: context.Canceled}
	log, read := capture()

	p := startPurger(q, log, 30*24*time.Hour, make(chan time.Time), func() {}, time.Now)
	waitFor(t, func() bool { return q.runs() == 1 })
	p.Stop()

	if strings.Contains(read(), "level=ERROR") {
		t.Errorf("a cancelled run cried wolf: %s", read())
	}
}

// The package comment says no name, no address and no message reaches a log.
// This is the loop that handles the rows those live in, so it is the loop where
// the claim is worth an assertion rather than a promise.
func TestThePurgeLogsACountAndNothingElse(t *testing.T) {
	q := &stubPurgeQueries{}
	log, read := capture()

	p := startPurger(q, log, 30*24*time.Hour, make(chan time.Time), func() {}, time.Now)
	waitFor(t, func() bool { return q.runs() == 1 })
	p.Stop()

	line := read()
	if !strings.Contains(line, "deleted=1") {
		t.Errorf("the count is not in the line: %s", line)
	}
	for _, forbidden := range []string{"@", "name=", "email", "message="} {
		if strings.Contains(line, forbidden) {
			t.Errorf("the line carries %q: %s", forbidden, line)
		}
	}
}
