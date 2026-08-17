// The loop, without a database.
//
// What the roll-up computes is proven in internal/store against a real server;
// what is proven here is everything around it — that it runs before the first
// tick, that it survives a broken database, that it stops when the process does,
// and that a shutdown in the middle of a query is not reported as a fault.
package ops

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

	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// A real pgx connection failure, host and role included. A test that used
// errors.New("boom") would pass just as well against a handler that logged the
// whole error into a public place.
var errUnreachable = errors.New("failed to connect to `host=db user=timseil_app database=timseil`: " +
	"dial tcp 172.18.0.2:5432: connect: connection refused")

// stubQueries is the database as the loop sees it: one answer, one failure, and
// a channel a test can wait on instead of sleeping past a call.
type stubQueries struct {
	rows int64
	err  error

	// hold, when set, keeps the query running until it is closed or the context
	// is cancelled — the shutdown-during-a-query case.
	hold chan struct{}

	mu     sync.Mutex
	seen   []store.RollUpOpsDaysParams
	called chan struct{}
}

func newStub() *stubQueries {
	return &stubQueries{called: make(chan struct{}, 16)}
}

func (s *stubQueries) RollUpOpsDays(ctx context.Context, arg store.RollUpOpsDaysParams) (int64, error) {
	s.mu.Lock()
	s.seen = append(s.seen, arg)
	s.mu.Unlock()

	select {
	case s.called <- struct{}{}:
	default:
	}

	if s.hold != nil {
		select {
		case <-s.hold:
		case <-ctx.Done():
			return 0, ctx.Err()
		}
	}
	return s.rows, s.err
}

func (s *stubQueries) calls() []store.RollUpOpsDaysParams {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]store.RollUpOpsDaysParams(nil), s.seen...)
}

// safeBuffer is a log sink two goroutines may touch: the loop writes, the test
// reads.
type safeBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *safeBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *safeBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// newAggregator starts one with the clock in the test's hand.
func newAggregator(t *testing.T, q Queries, out io.Writer) (*Aggregator, chan time.Time) {
	t.Helper()

	ticks := make(chan time.Time)
	a := start(q, slog.New(slog.NewJSONHandler(out, nil)), ticks, func() {})
	t.Cleanup(a.Stop)
	return a, ticks
}

// waitForCalls blocks until the stub has been entered n times, or fails.
func waitForCalls(t *testing.T, s *stubQueries, n int) {
	t.Helper()

	for i := 0; i < n; i++ {
		select {
		case <-s.called:
		case <-time.After(2 * time.Second):
			t.Fatalf("waited for call %d of %d and it never came", i+1, n)
		}
	}
}

// ----------------------------------------------------------------- the loop

// A process that restarts more often than the tick period would never aggregate
// at all if the first run waited for a tick. Nothing is sent here.
func TestTheRollUpRunsOnceBeforeTheFirstTick(t *testing.T) {
	s := newStub()
	newAggregator(t, s, &safeBuffer{})

	waitForCalls(t, s, 1)
}

func TestEveryTickRunsTheRollUp(t *testing.T) {
	s := newStub()
	_, ticks := newAggregator(t, s, &safeBuffer{})

	waitForCalls(t, s, 1) // the run at startup

	for i := 0; i < 3; i++ {
		ticks <- time.Now()
	}
	waitForCalls(t, s, 3)

	if n := len(s.calls()); n != 4 {
		t.Errorf("the roll-up ran %d times for one start and three ticks, want 4", n)
	}
}

// The four constants are the only thing this package contributes to a public
// number, and this is the one place they leave it. Reading them back is how a
// wrong Duration conversion stops being invisible: int32(5*time.Minute) is
// 300 000 000 000 truncated, not 300.
func TestTheParametersAreTheOnesTheGridIsBuiltOn(t *testing.T) {
	s := newStub()
	newAggregator(t, s, &safeBuffer{})
	waitForCalls(t, s, 1)

	want := store.RollUpOpsDaysParams{
		LookbackSec:      86400,
		OutageChecks:     2,
		ProbeIntervalSec: 300,
	}
	if got := s.calls()[0]; got != want {
		t.Errorf("the roll-up ran with %+v, want %+v", got, want)
	}
}

// ------------------------------------------------------------- the broken case

// A grid that goes stale is bad; a grid that never updates again because
// Postgres was restarted once is worse. The failure is reported and the loop
// keeps its next appointment.
func TestABrokenDatabaseIsALogLineAndNotADeadLoop(t *testing.T) {
	s := newStub()
	s.err = errUnreachable
	out := &safeBuffer{}
	_, ticks := newAggregator(t, s, out)

	waitForCalls(t, s, 1)
	ticks <- time.Now()
	waitForCalls(t, s, 1)

	if n := len(s.calls()); n < 2 {
		t.Errorf("the loop ran %d times after a failure, want it to keep ticking", n)
	}

	logged := out.String()
	if !strings.Contains(logged, `"level":"ERROR"`) {
		t.Errorf("a failed roll-up was not reported: %s", logged)
	}
	if !strings.Contains(logged, "the ops roll-up failed") {
		t.Errorf("the error line does not say what failed: %s", logged)
	}
}

// -------------------------------------------------------------- the shutdown

func TestTheLoopStopsWhenTheProcessDoes(t *testing.T) {
	s := newStub()
	a, ticks := newAggregator(t, s, &safeBuffer{})

	waitForCalls(t, s, 1)
	a.Stop()

	before := len(s.calls())
	select {
	case ticks <- time.Now():
		t.Fatal("the stopped loop is still reading its ticker")
	case <-time.After(50 * time.Millisecond):
	}

	if after := len(s.calls()); after != before {
		t.Errorf("the roll-up ran %d more times after Stop", after-before)
	}
}

// The shutdown path reaches Stop on two different routes — a listener that could
// not bind, and a drained server — and neither should have to reason about
// whether the other one ran.
func TestStopIsIdempotent(t *testing.T) {
	s := newStub()
	a, _ := newAggregator(t, s, &safeBuffer{})

	waitForCalls(t, s, 1)

	done := make(chan struct{})
	go func() {
		defer close(done)
		a.Stop()
		a.Stop()
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Stop did not return — the second call is waiting on a closed loop")
	}
}

// Waiting politely for a running query would add statement_timeout to a shutdown
// that has already spent its grace, and the container answers an overrun with a
// SIGKILL. So the query is cancelled — and a cancelled query is this package
// being stopped, not this package failing. An ERROR line here would cry wolf on
// every deploy.
func TestAShutdownDuringAQueryIsNotAnError(t *testing.T) {
	s := newStub()
	s.hold = make(chan struct{}) // never closed: only the cancellation ends it
	out := &safeBuffer{}
	a, _ := newAggregator(t, s, out)

	waitForCalls(t, s, 1)

	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		a.Stop()
	}()

	select {
	case <-stopped:
	case <-time.After(2 * time.Second):
		t.Fatal("Stop waited for the running query instead of cancelling it")
	}

	if logged := out.String(); strings.Contains(logged, `"level":"ERROR"`) {
		t.Errorf("a cancelled roll-up was reported as a failure: %s", logged)
	}
}
