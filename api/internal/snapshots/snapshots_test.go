package snapshots

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"math"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/G1NG4R/timseil-dev/api/internal/config"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
	"github.com/G1NG4R/timseil-dev/api/internal/systems"
)

// A real pgx connection failure, host and role included. A test that used
// errors.New("boom") would pass just as happily against code that put the whole
// thing somewhere public.
var errUnreachable = errors.New("failed to connect to `host=db user=timseil_app database=timseil`: " +
	"dial tcp 172.18.0.2:5432: connect: connection refused")

// errPrometheusDown is the simulated outage this phase is accepted on. It is
// what the fetcher returns when the container is stopped, verbatim.
var errPrometheusDown = errors.New("Get \"http://timseil-prometheus:9090/api/v1/query?query=%7B__name__%3D~%22timseil%3Asite%3A" +
	"request_duration_seconds%3Ap95_5m%7Ctimseil%3Asite%3Arequests%3Aerror_ratio_5m%22%7D\": " +
	"dial tcp: lookup timseil-prometheus: no such host")

// The instant every test in this file measures at, so that a stored measured_at
// can be compared against something rather than merely inspected.
var instant = time.Date(2026, 8, 26, 19, 56, 15, 0, time.UTC)

// stubStore is the database as the loop sees it.
type stubStore struct {
	mu sync.Mutex

	systemID  int64
	lookupErr error
	insertErr error
	// affected is what InsertMetricSnapshot reports. Zero means the row was
	// discarded by ON CONFLICT, which is a state this loop has a line for.
	affected int64

	lookups int
	written []store.InsertMetricSnapshotParams
}

func newStore() *stubStore { return &stubStore{systemID: 2, affected: 1} }

func (s *stubStore) SystemIDBySlug(_ context.Context, _ string) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.lookups++
	if s.lookupErr != nil {
		return 0, s.lookupErr
	}
	return s.systemID, nil
}

func (s *stubStore) InsertMetricSnapshot(_ context.Context, arg store.InsertMetricSnapshotParams) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.insertErr != nil {
		return 0, s.insertErr
	}
	s.written = append(s.written, arg)
	return s.affected, nil
}

func (s *stubStore) writes() []store.InsertMetricSnapshotParams {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]store.InsertMetricSnapshotParams(nil), s.written...)
}

// stubFetch is Prometheus. It counts, it can be told to fail, and it can be
// told to hold — the shutdown-in-the-middle case.
type stubFetch struct {
	mu      sync.Mutex
	calls   int
	samples []sample
	err     error
	hold    chan struct{}
}

func (f *stubFetch) fetch(ctx context.Context) ([]sample, error) {
	f.mu.Lock()
	f.calls++
	err, hold, samples := f.err, f.hold, f.samples
	f.mu.Unlock()

	if hold != nil {
		select {
		case <-hold:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	if err != nil {
		return nil, err
	}
	return samples, nil
}

func (f *stubFetch) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

// answering is the ordinary case: both rules have a value.
func answering(p95Seconds, ratio float64) *stubFetch {
	return &stubFetch{samples: []sample{
		{name: rulePercentile, value: p95Seconds, at: instant},
		{name: ruleErrorRatio, value: ratio, at: instant},
	}}
}

// safeBuffer is a log sink two goroutines touch: the loop writes, the test
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

// newSnapshotter starts one with the ticks and Prometheus in the test's hand.
// Nothing here touches a network or a database.
func newSnapshotter(t *testing.T, s *stubStore, f *stubFetch, out io.Writer) (*Snapshotter, chan time.Time) {
	t.Helper()

	ticks := make(chan time.Time)
	snap := start(s, "timseil-dev", f.fetch, slog.New(slog.NewJSONHandler(out, nil)), ticks, func() {})
	t.Cleanup(snap.Stop)

	return snap, ticks
}

// waitFor polls instead of sleeping a fixed amount. The loop is a goroutine and
// the alternative is either a flaky test or a slow one.
func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func tick(t *testing.T, ticks chan time.Time) {
	t.Helper()

	select {
	case ticks <- time.Time{}:
	case <-time.After(2 * time.Second):
		t.Fatal("the loop did not take a tick")
	}
}

// settle gives the loop a chance to do the thing this test says it must NOT do.
// A negative assertion that runs immediately proves only that the goroutine had
// not been scheduled yet.
func settle(t *testing.T, f *stubFetch, runs int) {
	t.Helper()
	waitFor(t, "the run to finish", func() bool { return f.count() >= runs })
	time.Sleep(20 * time.Millisecond)
}

// ------------------------------------------------------------------- the loop

// Once immediately, not on the first tick. A process that restarts more often
// than the tick period would otherwise never measure at all — and
// check-observability.sh --snapshots forces a run by restarting the api rather
// than by waiting five minutes for one.
func TestTheFirstRunHappensBeforeTheFirstTick(t *testing.T) {
	s, f := newStore(), answering(0.0746, 0.002)
	var out safeBuffer
	newSnapshotter(t, s, f, &out)

	waitFor(t, "the first run", func() bool { return len(s.writes()) == 1 })

	written := s.writes()[0]
	if written.SystemID != 2 {
		t.Errorf("wrote against system %d", written.SystemID)
	}
	if !written.MeasuredAt.Valid || !written.MeasuredAt.Time.Equal(instant) {
		t.Errorf("measured_at = %v, want %v", written.MeasuredAt, instant)
	}
	if !strings.Contains(out.String(), `"state":"written"`) {
		t.Errorf("no line says the run happened:\n%s", out.String())
	}
}

// The window is the contract's, and it is not written down here. Invariant 7
// says 91 has to stay countable, and it stays countable by living in exactly
// one place.
func TestTheWindowIsTheOneTheContractDeclares(t *testing.T) {
	s, f := newStore(), answering(0.05, 0)
	newSnapshotter(t, s, f, io.Discard)

	waitFor(t, "the first run", func() bool { return len(s.writes()) == 1 })

	if got := s.writes()[0].WindowSize; got != systems.DefaultWindow {
		t.Errorf("window = %d, want systems.DefaultWindow (%d)", got, systems.DefaultWindow)
	}
}

// THE ACCEPTANCE CRITERION OF THIS PHASE, in a unit test.
//
// "Stop the Prometheus container and the site keeps showing the last valid
// value with its age." That is true only if a failed run writes NOTHING — a row
// carrying nulls would be the newest measurement and would push the last good
// numbers off the page. See the package comment.
func TestNothingIsWrittenWhenPrometheusIsUnreachable(t *testing.T) {
	s := newStore()
	f := &stubFetch{err: errPrometheusDown}
	var out safeBuffer
	newSnapshotter(t, s, f, &out)

	settle(t, f, 1)

	if got := len(s.writes()); got != 0 {
		t.Fatalf("wrote %d rows over a dead Prometheus, want none", got)
	}
	// Not even a lookup: nothing about the database is asked, because there is
	// nothing to store.
	if s.lookups != 0 {
		t.Errorf("asked the database %d times with nothing to write", s.lookups)
	}
	if !strings.Contains(out.String(), `"state":"not measured"`) {
		t.Errorf("the failure is not in the log:\n%s", out.String())
	}
	// WARN and not ERROR: the site is still answering, with older numbers and
	// an honest age.
	if !strings.Contains(out.String(), `"level":"WARN"`) {
		t.Errorf("a dead Prometheus was logged above WARN:\n%s", out.String())
	}
}

// The other half of the same rule. Prometheus answered, and it had nothing:
// no request reached the proxy in five minutes. Real state, not a failure, and
// still no row.
func TestNothingIsWrittenWhenBothRulesAreEmpty(t *testing.T) {
	s, f := newStore(), &stubFetch{samples: nil}
	var out safeBuffer
	newSnapshotter(t, s, f, &out)

	settle(t, f, 1)

	if got := len(s.writes()); got != 0 {
		t.Fatalf("wrote %d rows with nothing measured, want none", got)
	}
	if !strings.Contains(out.String(), `"state":"nothing measured"`) {
		t.Errorf("the empty answer is not in the log:\n%s", out.String())
	}
	// INFO, because this is the package working. A WARN here would cry wolf on
	// every quiet night.
	if strings.Contains(out.String(), `"level":"WARN"`) {
		t.Errorf("an empty answer was logged as a problem:\n%s", out.String())
	}
}

// A tick after a failure measures again. "Fehler nicht fatal" is not only about
// the process staying up: the loop has to still be a loop afterwards, and a
// runOnce that returned early must not have left anything behind that the next
// tick trips over.
func TestAFailedRunDoesNotStopTheLoop(t *testing.T) {
	s := newStore()
	f := &stubFetch{err: errPrometheusDown}
	_, ticks := newSnapshotter(t, s, f, io.Discard)

	settle(t, f, 1)

	f.mu.Lock()
	f.err = nil
	f.samples = []sample{{name: ruleErrorRatio, value: 0, at: instant}}
	f.mu.Unlock()

	tick(t, ticks)

	waitFor(t, "the run after the failure", func() bool { return len(s.writes()) == 1 })
}

// ------------------------------------------------------- invariant 1, both ways

// A measured zero is a measurement. 0 % errors is an excellent value and a
// missing error rate is no value at all; rendering them the same way would be
// the most elegant way to lie without noticing.
func TestAMeasuredZeroErrorRateIsStoredAsZero(t *testing.T) {
	s, f := newStore(), answering(0.05, 0)
	newSnapshotter(t, s, f, io.Discard)

	waitFor(t, "the first run", func() bool { return len(s.writes()) == 1 })

	rate := s.writes()[0].ErrorRate
	if rate == nil {
		t.Fatal("a measured zero was stored as null")
	}
	if *rate != 0 {
		t.Errorf("error_rate = %v, want 0", *rate)
	}
}

// The other direction. NaN is the rules' own word for "nobody measured", and it
// has to become null rather than zero.
func TestANaNBecomesNullAndNeverZero(t *testing.T) {
	s := newStore()
	f := &stubFetch{samples: []sample{
		{name: rulePercentile, value: math.NaN(), at: instant},
		{name: ruleErrorRatio, value: 0.002, at: instant},
	}}
	var out safeBuffer
	newSnapshotter(t, s, f, &out)

	waitFor(t, "the first run", func() bool { return len(s.writes()) == 1 })

	written := s.writes()[0]
	if written.P95Ms != nil {
		t.Errorf("p95_ms = %v, want null", *written.P95Ms)
	}
	// The row is still written: the other rule measured something, and throwing
	// that away to keep the row tidy would discard a real measurement.
	if written.ErrorRate == nil {
		t.Error("the measured error rate was discarded along with the NaN")
	}
	// NaN is the ordinary answer on a quiet five minutes. A WARN on it would be
	// noise every night.
	if strings.Contains(out.String(), `"state":"value refused"`) {
		t.Errorf("a NaN was reported as a refused value:\n%s", out.String())
	}
}

// Seconds in, milliseconds out. slis.yml explains why the conversion is not
// done there: a series name that does not say `milliseconds` should not
// secretly be in them.
func TestSecondsBecomeMilliseconds(t *testing.T) {
	s, f := newStore(), answering(0.0746, 0)
	newSnapshotter(t, s, f, io.Discard)

	waitFor(t, "the first run", func() bool { return len(s.writes()) == 1 })

	p95 := s.writes()[0].P95Ms
	if p95 == nil {
		t.Fatal("p95_ms is null")
	}
	if math.Abs(*p95-74.6) > 0.001 {
		t.Errorf("p95_ms = %v, want 74.6", *p95)
	}
}

// ------------------------------------------------------------- the broken case

// A value the process cannot explain is refused rather than clamped and rather
// than passed through. Clamping invents a number; passing it through hits
// metric_snapshots_error_rate_range_ck and aborts the whole INSERT, taking the
// other number in the row with it.
func TestARatioAboveOneIsRefusedAndTheOtherNumberSurvives(t *testing.T) {
	s := newStore()
	f := &stubFetch{samples: []sample{
		{name: rulePercentile, value: 0.05, at: instant},
		{name: ruleErrorRatio, value: 1.4, at: instant},
	}}
	var out safeBuffer
	newSnapshotter(t, s, f, &out)

	waitFor(t, "the first run", func() bool { return len(s.writes()) == 1 })

	written := s.writes()[0]
	if written.ErrorRate != nil {
		t.Errorf("error_rate = %v, want null — the column would have refused it", *written.ErrorRate)
	}
	if written.P95Ms == nil {
		t.Error("the good number was dropped along with the impossible one")
	}
	if !strings.Contains(out.String(), `"state":"value refused"`) {
		t.Errorf("an impossible value was refused silently:\n%s", out.String())
	}
}

// Same rule, the other column, and the sign is the reason it is worth its own
// test: metric_snapshots_p95_range_ck admits zero and refuses everything below.
func TestANegativeLatencyIsRefused(t *testing.T) {
	s := newStore()
	f := &stubFetch{samples: []sample{{name: rulePercentile, value: -0.05, at: instant}}}
	newSnapshotter(t, s, f, io.Discard)

	settle(t, f, 1)

	// Nothing else measured, so the row is not written at all.
	if got := len(s.writes()); got != 0 {
		t.Fatalf("wrote %d rows out of one impossible value", got)
	}
}

// An infinity is not a NaN. NaN says "nobody measured" and is ordinary; ±Inf
// says something upstream is wrong and nothing else will report it.
func TestAnInfiniteValueIsRefusedAndLogged(t *testing.T) {
	s := newStore()
	f := &stubFetch{samples: []sample{
		{name: rulePercentile, value: math.Inf(1), at: instant},
		{name: ruleErrorRatio, value: 0, at: instant},
	}}
	var out safeBuffer
	newSnapshotter(t, s, f, &out)

	waitFor(t, "the first run", func() bool { return len(s.writes()) == 1 })

	if s.writes()[0].P95Ms != nil {
		t.Error("an infinite p95 reached the column")
	}
	if !strings.Contains(out.String(), `"state":"value refused"`) {
		t.Errorf("an infinity was refused silently:\n%s", out.String())
	}
}

// ------------------------------------------------------------------ the store

// SITE_SYSTEM_SLUG naming nothing is the one thing this loop can say about
// itself that no amount of waiting fixes.
func TestAMissingSystemIsAnErrorAndNotASilentSkip(t *testing.T) {
	s, f := newStore(), answering(0.05, 0)
	s.lookupErr = pgx.ErrNoRows
	var out safeBuffer
	newSnapshotter(t, s, f, &out)

	settle(t, f, 1)

	if got := len(s.writes()); got != 0 {
		t.Fatalf("wrote %d rows against a system that does not exist", got)
	}
	if !strings.Contains(out.String(), `"state":"no such system"`) {
		t.Errorf("a misconfigured slug was not reported:\n%s", out.String())
	}
	if !strings.Contains(out.String(), `"level":"ERROR"`) {
		t.Errorf("a misconfigured slug was logged below ERROR:\n%s", out.String())
	}
}

// A database that cannot be reached is our own storage failing, not Prometheus.
func TestAnUnreachableDatabaseIsLoggedAndNotFatal(t *testing.T) {
	s, f := newStore(), answering(0.05, 0)
	s.insertErr = errUnreachable
	var out safeBuffer
	newSnapshotter(t, s, f, &out)

	settle(t, f, 1)

	if !strings.Contains(out.String(), `"state":"not stored"`) {
		t.Errorf("a failed write was not reported:\n%s", out.String())
	}
}

// Two ticks on one Prometheus evaluation instant. Not an error and not news,
// but saying "written" would be a small untruth in the one line that proves the
// loop is alive.
func TestADiscardedInstantIsNotReportedAsWritten(t *testing.T) {
	s, f := newStore(), answering(0.05, 0)
	s.affected = 0
	var out safeBuffer
	newSnapshotter(t, s, f, &out)

	settle(t, f, 1)

	if !strings.Contains(out.String(), `"state":"discarded"`) {
		t.Errorf("a discarded row was not reported as one:\n%s", out.String())
	}
	if strings.Contains(out.String(), `"state":"written"`) {
		t.Errorf("a discarded row was reported as written:\n%s", out.String())
	}
}

// ---------------------------------------------------------------- the shutdown

func TestStopEndsTheLoopAndIsIdempotent(t *testing.T) {
	s, f := newStore(), answering(0.05, 0)
	snap, _ := newSnapshotter(t, s, f, io.Discard)

	waitFor(t, "the first run", func() bool { return len(s.writes()) == 1 })

	snap.Stop()
	// The shutdown path in cmd/api reaches Stop on two different routes and
	// should not have to reason about which one ran.
	snap.Stop()
}

// Stop cancels the query in flight rather than waiting for it. Waiting could
// add the run's remaining budget after the server has already spent its
// shutdown grace, and the container answers that with a SIGKILL.
func TestStopCancelsAQueryInFlight(t *testing.T) {
	s := newStore()
	f := answering(0.05, 0)
	f.hold = make(chan struct{})
	snap, _ := newSnapshotter(t, s, f, io.Discard)

	waitFor(t, "the query to start", func() bool { return f.count() == 1 })

	done := make(chan struct{})
	go func() {
		snap.Stop()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Stop waited for the query instead of cancelling it")
	}

	if got := len(s.writes()); got != 0 {
		t.Errorf("a cancelled run wrote %d rows", got)
	}
}

// Not started, rather than started and made to fail. A ticker that wakes every
// five minutes to log a refused connection teaches its reader to skip
// refused-connection lines.
func TestTheOffTransportStartsNoLoop(t *testing.T) {
	s, f := newStore(), answering(0.05, 0)
	var out safeBuffer

	snap := New(s, config.Snapshots{Transport: config.TransportOff}, "timseil-dev",
		slog.New(slog.NewJSONHandler(&out, nil)))
	t.Cleanup(snap.Stop)

	time.Sleep(20 * time.Millisecond)

	if f.count() != 0 || len(s.writes()) != 0 {
		t.Error("the off transport asked Prometheus anyway")
	}
	if !strings.Contains(out.String(), config.EnvSnapshotsTransport) {
		t.Errorf("the off transport did not announce itself:\n%s", out.String())
	}
	// Stop walks its ordinary path over a Snapshotter that never started.
	snap.Stop()
}
