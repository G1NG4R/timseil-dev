// The loop, without a network and without a database.
//
// What the grammar accepts is proven in parse_test.go and what the arithmetic
// computes in expand_test.go. What is proven here is everything around them:
// that a 304 writes nothing, that a file this parser rejects is not partially
// applied, that the etag is only kept once the rows are stored, and that a
// deployment which says it does not replay owns no goroutine at all.
package uptime

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

	"github.com/G1NG4R/timseil-dev/api/internal/config"
	"github.com/G1NG4R/timseil-dev/api/internal/resilience"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

const (
	slug      = "timseil-dev"
	sourceRef = "0f4d21a3c8b7e6519a0d2c4f8b3e7a1d6c5904fe"
)

// A real pgx failure, host and role included. A test that used
// errors.New("boom") would pass just as well against a loop that logged the
// whole error into a public place.
var errStore = errors.New("failed to connect to `host=db user=timseil_app database=timseil`: " +
	"dial tcp 172.18.0.2:5432: connect: connection refused")

type stubQueries struct {
	mu       sync.Mutex
	systemID int64
	idErr    error
	err      error
	calls    []store.BackfillOpsChecksParams
	written  int64

	called chan struct{}
}

func newStub() *stubQueries {
	return &stubQueries{systemID: 7, written: 1, called: make(chan struct{}, 16)}
}

func (s *stubQueries) SystemIDBySlug(_ context.Context, _ string) (int64, error) {
	return s.systemID, s.idErr
}

func (s *stubQueries) BackfillOpsChecks(_ context.Context, arg store.BackfillOpsChecksParams) (int64, error) {
	s.mu.Lock()
	s.calls = append(s.calls, arg)
	s.mu.Unlock()

	select {
	case s.called <- struct{}{}:
	default:
	}

	if s.err != nil {
		return 0, s.err
	}
	return s.written * int64(len(arg.ObservedAt)), nil
}

func (s *stubQueries) seen() []store.BackfillOpsChecksParams {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]store.BackfillOpsChecksParams(nil), s.calls...)
}

// recorder is a fetch that answers from a script and remembers the etags it was
// given, which is how the conditional request is observed at all.
type recorder struct {
	mu     sync.Mutex
	answer []document
	err    []error
	etags  []string
	n      int
	fired  chan struct{}
}

func scripted(docs ...document) *recorder {
	return &recorder{answer: docs, fired: make(chan struct{}, 16)}
}

func (r *recorder) fetch(_ context.Context, etag string) (document, error) {
	r.mu.Lock()
	i := r.n
	r.n++
	r.etags = append(r.etags, etag)
	r.mu.Unlock()

	select {
	case r.fired <- struct{}{}:
	default:
	}

	if i < len(r.err) && r.err[i] != nil {
		return document{}, r.err[i]
	}
	if i < len(r.answer) {
		return r.answer[i], nil
	}
	return document{unchanged: true, etag: etag}, nil
}

func (r *recorder) sentEtags() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]string(nil), r.etags...)
}

// logs captures what the loop said, because half of what this package promises
// is a line somebody can grep for at two in the morning.
func logs(t *testing.T) (*slog.Logger, func() string) {
	t.Helper()

	var mu sync.Mutex
	buf := &bytes.Buffer{}
	w := writerFunc(func(p []byte) (int, error) {
		mu.Lock()
		defer mu.Unlock()
		return buf.Write(p)
	})

	return slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{Level: slog.LevelDebug})),
		func() string {
			mu.Lock()
			defer mu.Unlock()
			return buf.String()
		}
}

type writerFunc func(p []byte) (int, error)

func (f writerFunc) Write(p []byte) (int, error) { return f(p) }

var _ io.Writer = writerFunc(nil)

// run drives exactly one pass of the loop and stops it, so no test depends on a
// ticker or on a sleep.
func run(t *testing.T, q Queries, fetch fetchFunc, log *slog.Logger) *Backfiller {
	t.Helper()

	ticks := make(chan time.Time)
	b := start(q, slug, 5*time.Minute, fetch, log, ticks, func() { close(ticks) })
	t.Cleanup(b.Stop)
	return b
}

func aLog(lines ...string) []byte {
	if len(lines) == 0 {
		return nil
	}
	return []byte(strings.Join(lines, "\n") + "\n")
}

func TestAReplayWritesOneStatementPerOutage(t *testing.T) {
	q := newStub()
	rec := scripted(document{
		etag:      `W/"abc"`,
		sourceRef: sourceRef,
		body: aLog(
			"2026-08-24T09:15:00Z\tdown\tconnect timeout",
			"2026-08-24T09:40:00Z\tup",
			"2026-08-25T14:00:00Z\tdown\tapi unreachable",
			"2026-08-25T14:15:00Z\tup",
		),
	})

	log, read := logs(t)
	run(t, q, rec.fetch, log)

	waitFor(t, q.called, 2)

	calls := q.seen()
	if len(calls) != 2 {
		t.Fatalf("got %d statements, want one per outage", len(calls))
	}
	if len(calls[0].ObservedAt) != 5 || len(calls[1].ObservedAt) != 3 {
		t.Fatalf("got %d and %d instants, want 5 and 3",
			len(calls[0].ObservedAt), len(calls[1].ObservedAt))
	}

	for i, want := range []string{"connect timeout", "api unreachable"} {
		if calls[i].Reason == nil || *calls[i].Reason != want {
			t.Errorf("statement %d carries reason %v, want %q", i, calls[i].Reason, want)
		}
		if calls[i].SourceRef == nil || *calls[i].SourceRef != sourceRef {
			t.Errorf("statement %d cites %v, want the commit the file came from", i, calls[i].SourceRef)
		}
		if calls[i].SystemID != 7 {
			t.Errorf("statement %d writes system %d, want the one the slug resolved to", i, calls[i].SystemID)
		}
	}

	// UTC, always: observed_at is compared against a Postgres timestamptz, and a
	// stamp carrying a local zone would be the same instant written in a way
	// nobody reading the table expects.
	if at := calls[0].ObservedAt[0]; at.Time.Location() != time.UTC {
		t.Errorf("the first instant is in %v, want UTC", at.Time.Location())
	}

	if out := read(); !strings.Contains(out, `"state":"replayed"`) ||
		!strings.Contains(out, `"source_ref":"`+sourceRef+`"`) {
		t.Errorf("the log line does not say what was replayed: %s", out)
	}
}

// The two ordinary answers. Neither is a fault, and neither may write.
func TestNothingIsWrittenWhenThereIsNothingNew(t *testing.T) {
	for name, tc := range map[string]struct {
		doc  document
		says string
	}{
		"no log yet":     {document{missing: true}, `"state":"no log yet"`},
		"not modified":   {document{unchanged: true, etag: `W/"abc"`}, `"state":"unchanged"`},
		"an empty file":  {document{body: aLog(), sourceRef: sourceRef}, `"state":"replayed"`},
		"an open outage": {document{body: aLog("2026-08-24T09:15:00Z\tdown\tdns failure"), sourceRef: sourceRef}, `"state":"replayed"`},
	} {
		t.Run(name, func(t *testing.T) {
			q := newStub()
			log, read := logs(t)

			rec := scripted(tc.doc)
			run(t, q, rec.fetch, log)
			waitFor(t, rec.fired, 1)

			if calls := q.seen(); len(calls) != 0 {
				t.Fatalf("got %d statements, want none", len(calls))
			}
			if out := read(); !strings.Contains(out, tc.says) {
				t.Errorf("the log says %s, want it to contain %s", out, tc.says)
			}
		})
	}
}

// The whole file or none of it. A log that stops parsing halfway must not leave
// its first outages in the table: a partially applied outage log is a shorter
// one, and a shorter outage log reads as "the site was up".
func TestABrokenFileWritesNothingAtAll(t *testing.T) {
	q := newStub()
	log, read := logs(t)

	rec := scripted(document{
		sourceRef: sourceRef,
		body: aLog(
			"2026-08-24T09:15:00Z\tdown\tconnect timeout",
			"2026-08-24T09:40:00Z\tup",
			"2026-08-25T14:00:00Z\tdown\tconnect to 203.0.113.7 port 443 failed",
		),
	})

	b := run(t, q, rec.fetch, log)
	waitFor(t, rec.fired, 1)

	if calls := q.seen(); len(calls) != 0 {
		t.Fatalf("got %d statements from a file that does not parse, want none", len(calls))
	}
	if out := read(); !strings.Contains(out, `"state":"unreadable"`) {
		t.Errorf("the log says %s, want it to report the file as unreadable", out)
	}
	// The breaker is about the far end. GitHub answered; the file is our own
	// problem, and shutting it would delay the read that fixes it.
	if b.breaker.Open() {
		t.Error("an unparseable file opened the breaker, and it says nothing about the upstream")
	}
}

// The etag is the whole reason a quarter-hourly loop is polite, and storing it
// one line too early is the bug that would cost an outage: a 304 for ever over
// rows that were never written.
func TestTheEtagIsKeptOnlyAfterTheRowsAre(t *testing.T) {
	body := aLog("2026-08-24T09:15:00Z\tdown\tconnect timeout", "2026-08-24T09:40:00Z\tup")

	t.Run("kept after a good write", func(t *testing.T) {
		q := newStub()
		rec := scripted(
			document{etag: `W/"one"`, sourceRef: sourceRef, body: body},
			document{unchanged: true, etag: `W/"one"`},
		)

		log, _ := logs(t)
		b := run(t, q, rec.fetch, log)
		waitFor(t, q.called, 1)

		// Second pass, driven directly rather than through the ticker.
		b.runOnce(context.Background())

		if sent := rec.sentEtags(); len(sent) < 2 || sent[0] != "" || sent[1] != `W/"one"` {
			t.Fatalf("the etags sent were %q, want the second read to be conditional", sent)
		}
	})

	t.Run("dropped after a failed write", func(t *testing.T) {
		q := newStub()
		q.err = errStore

		rec := scripted(
			document{etag: `W/"one"`, sourceRef: sourceRef, body: body},
			document{etag: `W/"one"`, sourceRef: sourceRef, body: body},
		)

		log, read := logs(t)
		b := run(t, q, rec.fetch, log)
		waitFor(t, q.called, 1)

		b.runOnce(context.Background())

		if sent := rec.sentEtags(); len(sent) < 2 || sent[1] != "" {
			t.Fatalf("the etags sent were %q, want the read after a failed write to be unconditional", sent)
		}
		if out := read(); !strings.Contains(out, `"state":"not stored"`) {
			t.Errorf("the log says %s, want it to report the write as failed", out)
		}
	})
}

// A database that cannot be reached says nothing about the ops-data branch, so
// it must not shut the breaker that guards the branch.
func TestAFailingStoreDoesNotOpenTheBreaker(t *testing.T) {
	q := newStub()
	q.err = errStore

	rec := scripted(document{
		etag: `W/"one"`, sourceRef: sourceRef,
		body: aLog("2026-08-24T09:15:00Z\tdown\thttp 5xx", "2026-08-24T09:40:00Z\tup"),
	})

	log, _ := logs(t)
	b := run(t, q, rec.fetch, log)
	waitFor(t, q.called, 1)

	if b.breaker.Open() {
		t.Error("a database failure opened the breaker that stands in front of GitHub")
	}
}

// Two halves, and only the first one pays for the retries: one real failed run
// to prove it is counted and reported, then the breaker is shut by hand to
// prove what a shut one does. Driving five failing runs would spend a
// backoff budget to re-prove arithmetic internal/resilience already tests.
func TestAnUnreachableBranchIsCountedAndThenWaitedOut(t *testing.T) {
	q := newStub()

	rec := scripted()
	rec.err = []error{errors.New("dial tcp: lookup raw.githubusercontent.com: no such host")}

	// One attempt for the duration of this test. What the retry costs and how it
	// jitters is internal/resilience's own test; buying three seconds of backoff
	// here would re-prove it and slow every run of the suite.
	restore := retryPolicy
	retryPolicy = resilience.RetryPolicy{MaxAttempts: 1}
	t.Cleanup(func() { retryPolicy = restore })

	log, read := logs(t)
	b := idle(q, rec.fetch, log)
	b.runOnce(context.Background())

	if out := read(); !strings.Contains(out, `"state":"unreachable"`) ||
		!strings.Contains(out, `"level":"WARN"`) {
		t.Errorf("the log says %s, want a WARN naming the branch as unreachable", out)
	}
	if calls := q.seen(); len(calls) != 0 {
		t.Fatalf("got %d statements from a failed read, want none", len(calls))
	}

	// WARN and not ERROR: the site is answering and the grid is honest, it is
	// only missing cells for an outage it already survived.
	if strings.Contains(read(), `"level":"ERROR"`) {
		t.Error("an unreachable branch was reported at ERROR")
	}

	before := len(rec.sentEtags())
	for range breakerThreshold {
		b.breaker.Failed()
	}

	b.runOnce(context.Background())

	if got := len(rec.sentEtags()); got != before {
		t.Errorf("the loop reached the network %d times with the breaker shut, want 0", got-before)
	}
	if out := read(); !strings.Contains(out, `"state":"breaker open"`) {
		t.Errorf("the log says %s, want the shut breaker named", out)
	}
}

// A deployment that says it does not replay owns no goroutine and no ticker,
// and Stop still walks its ordinary path — cmd/api releases the same things in
// the same order whatever the transport.
func TestTheOffTransportStartsNothing(t *testing.T) {
	q := newStub()
	log, read := logs(t)

	b := New(q, config.Uptime{Transport: config.TransportOff}, slug, 5*time.Minute, log)

	b.Stop()
	b.Stop() // idempotent, because the shutdown reaches it on two routes

	if calls := q.seen(); len(calls) != 0 {
		t.Fatalf("got %d statements from a loop that was never started", len(calls))
	}
	if out := read(); !strings.Contains(out, "NOT being replayed") ||
		!strings.Contains(out, config.EnvUptimeTransport) {
		t.Errorf("the log says %s, want it to name the variable that switched it off", out)
	}
}

// The arithmetic behind the four numbers in policy.go, kept honest when
// somebody edits one of them. Two requests per attempt is what makes this
// tighter than the refresher's version of the same test.
func TestTheAttemptBudgetFitsInsideTheRunTimeout(t *testing.T) {
	const requestsPerAttempt = 2

	worst := time.Duration(maxAttempts) * requestsPerAttempt * attemptTimeout
	for i := 1; i < maxAttempts; i++ {
		worst += backoffBase << (i - 1)
	}

	if worst >= runTimeout {
		t.Fatalf("the worst case is %s, which does not fit inside runTimeout %s", worst, runTimeout)
	}
	if runTimeout >= replayEvery {
		t.Fatalf("a run may take %s and the next tick is %s away — two runs could overlap",
			runTimeout, replayEvery)
	}
}

// idle is a Backfiller with no goroutine and no ticker, for the tests that want
// to drive runOnce themselves rather than race the loop's first pass.
func idle(q Queries, fetch fetchFunc, log *slog.Logger) *Backfiller {
	return &Backfiller{
		queries: q,
		slug:    slug,
		step:    5 * time.Minute,
		fetch:   fetch,
		breaker: resilience.NewBreaker(breakerPolicy, time.Now),
		log:     log,
	}
}

// waitFor blocks until a channel has fired n times, so no test sleeps.
func waitFor(t *testing.T, c chan struct{}, n int) {
	t.Helper()

	for range n {
		select {
		case <-c:
		case <-time.After(2 * time.Second):
			t.Fatal("timed out waiting for the loop")
		}
	}
}
