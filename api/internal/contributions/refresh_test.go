package contributions

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// A real pgx connection failure, host and role included. A test that used
// errors.New("boom") would pass just as happily against code that put the whole
// thing somewhere public.
var errUnreachable = errors.New("failed to connect to `host=db user=timseil_app database=timseil`: " +
	"dial tcp 172.18.0.2:5432: connect: connection refused")

// errGitHubDown is the simulated outage the phase is accepted on.
var errGitHubDown = errors.New("github answered with an unexpected status: 502")

// stubStore is the database as the loop sees it.
type stubStore struct {
	mu sync.Mutex

	row      store.GetContributionsRow
	hasRow   bool
	readErr  error
	writeErr error

	reads   int
	written []store.UpsertContributionsParams
}

func (s *stubStore) GetContributions(_ context.Context, _ string) (store.GetContributionsRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.reads++
	switch {
	case s.readErr != nil:
		return store.GetContributionsRow{}, s.readErr
	case !s.hasRow:
		return store.GetContributionsRow{}, pgx.ErrNoRows
	}
	return s.row, nil
}

func (s *stubStore) UpsertContributions(_ context.Context, arg store.UpsertContributionsParams) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.writeErr != nil {
		return s.writeErr
	}
	s.written = append(s.written, arg)
	return nil
}

func (s *stubStore) writes() []store.UpsertContributionsParams {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]store.UpsertContributionsParams(nil), s.written...)
}

func (s *stubStore) aged(age time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.hasRow = true
	s.row = store.GetContributionsRow{
		TotalContributions: 500,
		Weeks:              []byte(`[{"days":[]}]`),
		CacheAgeSec:        int32(age.Seconds()),
	}
}

// stubFetch is GitHub. It counts, it can be told to fail, and it can be told to
// hold — the shutdown-in-the-middle case.
type stubFetch struct {
	mu    sync.Mutex
	calls int
	err   error
	hold  chan struct{}
}

func (f *stubFetch) fetch(ctx context.Context) (calendar, error) {
	f.mu.Lock()
	f.calls++
	err, hold := f.err, f.hold
	f.mu.Unlock()

	if hold != nil {
		select {
		case <-hold:
		case <-ctx.Done():
			return calendar{}, ctx.Err()
		}
	}
	if err != nil {
		return calendar{}, err
	}
	return calendar{total: 412, weeks: oneRealWeek()}, nil
}

func (f *stubFetch) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

func (f *stubFetch) failWith(err error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.err = err
}

// The calendar a successful fetch produces, built through translate so that the
// bytes this loop stores are the bytes the real path would store — a
// hand-written literal here could drift from the shape github.go actually emits
// and this file would never notice.
func oneRealWeek() []httpx.ContributionWeek {
	var answer graphQLAnswer
	if err := json.Unmarshal([]byte(githubCalendar(412, oneWeek)), &answer); err != nil {
		panic(err)
	}
	cal, err := translate(answer)
	if err != nil {
		panic(err)
	}
	return cal.weeks
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

// newRefresher starts one with the ticks, the clock and GitHub in the test's
// hand. Nothing here touches a network or a database.
func newRefresher(t *testing.T, s *stubStore, f *stubFetch, out io.Writer) (*Refresher, chan time.Time, *clock) {
	t.Helper()

	ticks := make(chan time.Time)
	c := newClock()
	r := start(s, "octocat", f.fetch, slog.New(slog.NewJSONHandler(out, nil)),
		ticks, func() {}, c.now)
	t.Cleanup(r.Stop)

	return r, ticks, c
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

// ------------------------------------------------------------------- the loop

// Once immediately, not on the first tick. A process that restarts more often
// than the tick period would otherwise never refresh at all.
func TestAColdCacheIsFetchedBeforeTheFirstTick(t *testing.T) {
	s, f := &stubStore{}, &stubFetch{}
	var out safeBuffer
	newRefresher(t, s, f, &out)

	waitFor(t, "the first fetch", func() bool { return len(s.writes()) == 1 })

	written := s.writes()[0]
	if written.Login != "octocat" || written.TotalContributions != 412 {
		t.Errorf("wrote %+v", written)
	}
	// The weeks are stored as the contract's JSON, so the read path can hand
	// them back without knowing anything about GitHub.
	if !strings.Contains(string(written.Weeks), `"level":"l0"`) {
		t.Errorf("weeks are not in the contract's shape: %s", written.Weeks)
	}
	if !strings.Contains(out.String(), `"state":"fetched"`) {
		t.Errorf("no line says the run happened:\n%s", out.String())
	}
}

// The hour. A tick that finds a calendar younger than staleAfter costs one
// lookup of one row and nothing else.
func TestAFreshCalendarIsNotRefetched(t *testing.T) {
	s, f := &stubStore{}, &stubFetch{}
	s.aged(30 * time.Minute)

	var out safeBuffer
	newRefresher(t, s, f, &out)

	waitFor(t, "the first run", func() bool { return strings.Contains(out.String(), `"state":"fresh"`) })

	if f.count() != 0 {
		t.Errorf("GitHub was asked %d times for a calendar that is 30 minutes old", f.count())
	}
	if len(s.writes()) != 0 {
		t.Error("a fresh calendar was rewritten")
	}
}

func TestACalendarPastTheHourIsRefetched(t *testing.T) {
	s, f := &stubStore{}, &stubFetch{}
	s.aged(staleAfter + time.Minute)

	var out safeBuffer
	newRefresher(t, s, f, &out)

	waitFor(t, "the refetch", func() bool { return len(s.writes()) == 1 })
}

// --------------------------------------------------- the acceptance criterion

// The phase is accepted on this: a simulated GitHub outage returns the cache
// with its age instead of an error.
//
// The half proved here is the half that could quietly break — the write path
// must not touch the row. Nothing in runOnce clears it, sets it empty or marks
// it stale, so the handler keeps answering 200 from a calendar that goes on
// ageing honestly. The other half, that the handler serves it, is in
// contributions_test.go.
func TestAFailedFetchLeavesTheCacheStanding(t *testing.T) {
	s, f := &stubStore{}, &stubFetch{}
	s.aged(staleAfter + time.Minute)
	f.failWith(errGitHubDown)

	var out safeBuffer
	_, ticks, _ := newRefresher(t, s, f, &out)

	waitFor(t, "the failed run", func() bool { return strings.Contains(out.String(), `"state":"failed"`) })

	if writes := s.writes(); len(writes) != 0 {
		t.Fatalf("the outage wrote to the cache: %+v", writes)
	}

	// And again on the next tick: still no write, and the stored calendar is
	// untouched however long the outage lasts.
	s.aged(3 * staleAfter)
	tick(t, ticks)
	waitFor(t, "the second failed run", func() bool { return f.count() > maxAttempts })

	if writes := s.writes(); len(writes) != 0 {
		t.Fatalf("a later outage wrote to the cache: %+v", writes)
	}

	// The failure is a warning and not an error: the site is still answering,
	// with an older calendar and an honest age.
	if !strings.Contains(out.String(), `"level":"WARN"`) {
		t.Errorf("the outage was not logged at WARN:\n%s", out.String())
	}
}

// Retries happen inside a run, so one bad answer does not cost the hour until
// the next tick.
func TestAFailedRunUsesTheWholeAttemptBudget(t *testing.T) {
	s, f := &stubStore{}, &stubFetch{}
	f.failWith(errGitHubDown)

	var out safeBuffer
	newRefresher(t, s, f, &out)

	waitFor(t, "the failed run", func() bool { return strings.Contains(out.String(), `"state":"failed"`) })

	if f.count() != maxAttempts {
		t.Errorf("GitHub was asked %d times, want %d", f.count(), maxAttempts)
	}
}

// ---------------------------------------------------------------- the breaker

func TestTheBreakerShutsAfterThreeFailedRuns(t *testing.T) {
	s, f := &stubStore{}, &stubFetch{}
	f.failWith(errGitHubDown)

	var out safeBuffer
	_, ticks, _ := newRefresher(t, s, f, &out)

	// One run at start plus two ticks makes three failed runs.
	waitFor(t, "the first failed run", func() bool { return f.count() == maxAttempts })
	for range breakerThreshold - 1 {
		tick(t, ticks)
	}
	waitFor(t, "three failed runs", func() bool { return f.count() == breakerThreshold*maxAttempts })

	// The fourth tick must not reach the network at all.
	tick(t, ticks)
	waitFor(t, "the breaker line", func() bool { return strings.Contains(out.String(), `"state":"breaker open"`) })

	if f.count() != breakerThreshold*maxAttempts {
		t.Errorf("GitHub was asked %d times with the breaker shut, want %d",
			f.count(), breakerThreshold*maxAttempts)
	}
}

func TestAfterTheCooldownTheLoopTriesAgainAndRecovers(t *testing.T) {
	s, f := &stubStore{}, &stubFetch{}
	f.failWith(errGitHubDown)

	var out safeBuffer
	_, ticks, c := newRefresher(t, s, f, &out)

	waitFor(t, "the first failed run", func() bool { return f.count() == maxAttempts })
	for range breakerThreshold - 1 {
		tick(t, ticks)
	}
	waitFor(t, "three failed runs", func() bool { return f.count() == breakerThreshold*maxAttempts })

	// GitHub comes back, but the breaker is shut and the cooldown has not run.
	f.failWith(nil)
	tick(t, ticks)
	waitFor(t, "the breaker line", func() bool { return strings.Contains(out.String(), `"state":"breaker open"`) })
	if len(s.writes()) != 0 {
		t.Fatal("the breaker let a run through before the cooldown")
	}

	// Wind the clock past the cooldown: one probe, and it succeeds.
	c.add(breakerCooldown + time.Minute)
	tick(t, ticks)
	waitFor(t, "the recovery", func() bool { return len(s.writes()) == 1 })
}

// ------------------------------------------------------------ the wrong side

// A database that cannot be read says nothing about GitHub. Counting it as a
// breaker failure would shut the breaker for half an hour over an outage on the
// other side of the process.
func TestAnUnreadableCacheIsNotABreakerFailure(t *testing.T) {
	s, f := &stubStore{}, &stubFetch{}
	s.readErr = errUnreachable

	var out safeBuffer
	_, ticks, _ := newRefresher(t, s, f, &out)

	waitFor(t, "the first run", func() bool { return strings.Contains(out.String(), `"state":"cache unreadable"`) })

	// Postgres comes back. The very next tick fetches — no cooldown in between.
	s.mu.Lock()
	s.readErr = nil
	s.mu.Unlock()

	tick(t, ticks)
	waitFor(t, "the fetch", func() bool { return len(s.writes()) == 1 })
}

// A fetch that worked and a write that did not is our storage failing, not
// GitHub. The breaker stays closed so the next tick tries again immediately.
func TestAFailedWriteDoesNotShutTheBreaker(t *testing.T) {
	s, f := &stubStore{}, &stubFetch{}
	s.writeErr = errUnreachable

	var out safeBuffer
	_, ticks, _ := newRefresher(t, s, f, &out)

	waitFor(t, "the first run", func() bool { return strings.Contains(out.String(), `"state":"not stored"`) })

	for range breakerThreshold + 1 {
		tick(t, ticks)
	}
	waitFor(t, "further attempts", func() bool { return f.count() > breakerThreshold })

	if strings.Contains(out.String(), `"state":"breaker open"`) {
		t.Error("a storage failure shut the breaker in front of GitHub")
	}
}

// ---------------------------------------------------------------- the shutdown

func TestStopEndsTheLoopAndIsIdempotent(t *testing.T) {
	s, f := &stubStore{}, &stubFetch{}
	var out safeBuffer
	r, _, _ := newRefresher(t, s, f, &out)

	waitFor(t, "the first run", func() bool { return len(s.writes()) == 1 })

	done := make(chan struct{})
	go func() {
		r.Stop()
		r.Stop() // the shutdown path reaches it twice; the second must return.
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Stop did not return")
	}
}

// The shutdown cancels the fetch rather than waiting for it — a fetch may sit
// for most of half a minute, and waiting could spend that AFTER the server has
// already used its grace period, at which point the container answers with a
// SIGKILL.
func TestStopCancelsAFetchInFlight(t *testing.T) {
	s := &stubStore{}
	f := &stubFetch{hold: make(chan struct{})}
	defer close(f.hold)

	var out safeBuffer
	r, _, _ := newRefresher(t, s, f, &out)

	waitFor(t, "the fetch to start", func() bool { return f.count() == 1 })

	stopped := make(chan struct{})
	go func() { r.Stop(); close(stopped) }()

	select {
	case <-stopped:
	case <-time.After(2 * time.Second):
		t.Fatal("Stop waited for the fetch instead of cancelling it")
	}

	// And it is not reported as a fault. An ERROR line here would cry wolf on
	// every deploy.
	if strings.Contains(out.String(), `"level":"ERROR"`) || strings.Contains(out.String(), `"state":"failed"`) {
		t.Errorf("the shutdown was logged as a failure:\n%s", out.String())
	}
}
