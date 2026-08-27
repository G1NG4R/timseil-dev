// Package snapshots copies the site's own numbers out of Prometheus and into
// Postgres, every five minutes.
//
// WHY THE COPY EXISTS AT ALL. ADR 0007 put it in four words -- Prometheus
// misst, Postgres serviert. The site never queries Prometheus on a page load,
// so a Prometheus that is down, restarting or being upgraded costs the page
// nothing except the age of its numbers. That is not a caching decision, it is
// the reason `compose.yaml` has no `depends_on` pointing at the observability
// containers at all.
//
// WHAT IS DECIDED HERE AND WHAT IS NOT. Nothing in this package decides what a
// number means. p95 and error ratio are computed by two recording rules in
// ops/prometheus/rules/slis.yml; the 91-day uptime is computed by one CASE in
// queries/metrics.sql. What is left in Go is a ticker, five constants, a
// conversion from seconds to milliseconds, and the one judgement this loop is
// actually for: WHETHER TO WRITE A ROW.
//
// THE ROW THAT IS NOT WRITTEN. 00005_metrics.sql allows a snapshot whose three
// values are all NULL and says what it would mean -- "we asked Prometheus and
// got nothing back", which is a different fact from "we never asked". This
// package never produces one, and the acceptance criterion of F5 is why.
// LatestMetrics reads ORDER BY measured_at DESC LIMIT 1, so a fresh empty row
// would be the newest measurement and would push the last good numbers off the
// page: the site would show `— NO DATA` at the exact moment it could have shown
// a real value with an honest age. So a run that measured nothing writes
// nothing, and the page keeps ageing instead of going blank. ADR 0041 5.
//
// THE GUARANTEE IS ABOUT THE ROW, NOT ABOUT EACH FIELD, and stating it loosely
// would be a promise this package does not keep. A run that measured ONE of the
// two writes the row, and the field it could not measure is null in it -- so
// that field does show `— NO DATA` while the other one moves, until the next
// run measures it again. That is not the empty-row failure above; it is what a
// snapshot IS. Every column says what was true at measured_at, and measured_at
// is one instant for the row rather than three ages for three numbers.
//
// The alternative -- write only when both are present -- reads tidier and is
// worse. A p95 over a histogram that saw one bucket comes back NaN as its
// ordinary answer, and letting that suppress a measured error ratio would throw
// away real measurements on quiet nights to keep a rule symmetrical.
//
// NO BREAKER AND NO RETRY, unlike internal/contributions and internal/uptime.
// Both of those call a foreign host over the internet with a credential, and a
// breaker exists to spare that host our retries during ITS outage. Prometheus
// is a container on the same machine, on the same docker network, with no
// credential and a sub-millisecond answer. The build plan asks for exactly what
// is here instead: short timeout, failure is not fatal. A failed run is a log
// line and the next tick, five minutes later.
package snapshots

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/G1NG4R/timseil-dev/api/internal/config"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
	"github.com/G1NG4R/timseil-dev/api/internal/systems"
	"github.com/G1NG4R/timseil-dev/api/internal/traceparent"
)

// Queries is the slice of the store this package needs.
//
// Two methods, hand-written because sqlc emits no interface (sqlc.yaml), and
// narrow on purpose: it is what lets the loop, every failure path and the
// shutdown be tested without Postgres.
type Queries interface {
	SystemIDBySlug(ctx context.Context, slug string) (int64, error)
	InsertMetricSnapshot(ctx context.Context, arg store.InsertMetricSnapshotParams) (int64, error)
}

// fetchFunc is one attempt at Prometheus. A field rather than a call so the
// loop can be driven by a stub -- the outage this phase promises to survive has
// to be producible in a test, and it must not need a network to produce it.
type fetchFunc func(ctx context.Context) ([]sample, error)

// Snapshotter ticks the copy. It owns a goroutine from the moment it is
// created, in the shape internal/ops, internal/contributions and
// internal/uptime already use.
type Snapshotter struct {
	queries Queries
	slug    string
	fetch   fetchFunc
	log     *slog.Logger

	ticks       <-chan time.Time
	stopTicking func()

	// cancel ends the query that is running rather than waiting for it. See Stop.
	cancel context.CancelFunc

	stop chan struct{}
	done chan struct{}
}

// New starts the loop. Call Stop before closing the pool.
//
// Unless the deployment says it has no Prometheus, in which case the loop is
// not started at all. Not started, rather than started and made to fail: a
// ticker that wakes every five minutes to log a connection refused would train
// its reader to skip connection-refused lines, and that is the one line this
// package writes that has to keep meaning something.
func New(q Queries, cfg config.Snapshots, slug string, log *slog.Logger) *Snapshotter {
	if !cfg.Takes() {
		log.Warn("metric snapshots are NOT being taken — "+config.EnvSnapshotsTransport+" is "+config.TransportOff,
			"reason", "this deployment says it has no Prometheus to ask",
			"effect", "uptime90d, p95Ms and errorRate stay null and the page shows — NO DATA")
		return stopped()
	}

	ticker := time.NewTicker(snapshotEvery)
	return start(q, slug, newFetcher().fetch, log, ticker.C, ticker.Stop)
}

// stopped is a Snapshotter that has already finished. It owns no goroutine and
// holds no ticker, and Stop walks its ordinary path over it: the shutdown in
// cmd/api releases the same things in the same order whatever the transport,
// which is one branch that does not have to exist there.
func stopped() *Snapshotter {
	stop, done := make(chan struct{}), make(chan struct{})
	close(stop)
	close(done)
	return &Snapshotter{
		cancel:      func() {},
		stopTicking: func() {},
		stop:        stop,
		done:        done,
	}
}

// start is New with the ticks and Prometheus itself handed in, so the tests
// drive the loop instead of sleeping through it.
//
// No injected clock, and that is a departure from internal/contributions on
// purpose. This package puts no time anywhere of its own: measured_at is the
// instant Prometheus answered, stamped by Prometheus, and recorded_at is
// Postgres's now(). A Go clock here would be a third definition of "when", and
// the one nobody looks at when the three disagree.
func start(
	q Queries,
	slug string,
	fetch fetchFunc,
	log *slog.Logger,
	ticks <-chan time.Time,
	stopTicking func(),
) *Snapshotter {
	ctx, cancel := context.WithCancel(context.Background())

	s := &Snapshotter{
		queries:     q,
		slug:        slug,
		fetch:       fetch,
		log:         log,
		ticks:       ticks,
		stopTicking: stopTicking,
		cancel:      cancel,
		stop:        make(chan struct{}),
		done:        make(chan struct{}),
	}

	go s.loop(ctx)
	return s
}

// Stop ends the loop and returns.
//
// It cancels the context the running query holds instead of waiting politely,
// for the reason internal/contributions gives: waiting could add the run's
// remaining budget AFTER the server has already spent its shutdown grace, at
// which point the container's stop_grace_period answers with a SIGKILL. A run
// interrupted halfway loses nothing -- it either wrote the row or it did not,
// and Prometheus still holds the same numbers when the next process starts.
//
// Idempotent, because the shutdown path reaches it on two different routes and
// should not have to reason about which one ran.
func (s *Snapshotter) Stop() {
	select {
	case <-s.stop:
		return
	default:
	}

	close(s.stop)
	s.cancel()
	s.stopTicking()
	<-s.done
}

// loop runs once and then on every tick.
//
// Once immediately rather than on the first tick, for the reason internal/ops
// gives: a process that restarts more often than the tick period would
// otherwise never measure at all, and after a deploy the page would sit five
// minutes staler than it needs to for no reason. tools/check-observability.sh
// --snapshots depends on this too — it forces a run by restarting the api
// rather than by waiting out a tick.
func (s *Snapshotter) loop(ctx context.Context) {
	defer close(s.done)

	s.runOnce(ctx)

	for {
		select {
		case <-s.stop:
			return
		case <-s.ticks:
			s.runOnce(ctx)
		}
	}
}

// runOnce is one query and, at most, one row.
//
// Every failure path returns WITHOUT writing, and that is the shape the
// acceptance criterion is a property of rather than a rule anybody has to
// remember: "stop the Prometheus container and the site keeps showing the last
// valid value with its age" is true because there is no branch here that writes
// a row a failed query could have produced.
func (s *Snapshotter) runOnce(ctx context.Context) {
	// One trace per run, and that is the whole of what correlation means for a
	// loop: no visitor asked for this, so there is no request id, but the lines
	// a single run writes belong together and are otherwise indistinguishable
	// from the run before it. F6 hangs a real span here later and changes
	// nothing about the shape.
	ctx = traceparent.With(ctx, traceparent.New())

	if ctx.Err() != nil {
		return
	}

	// The ceiling on a run. Independent of REQUEST_TIMEOUT, because this is not
	// a request — no visitor is waiting on it, and nothing here runs inside a
	// handler.
	runCtx, cancel := context.WithTimeout(ctx, runTimeout)
	defer cancel()

	samples, err := s.fetch(runCtx)
	switch {
	case errors.Is(err, context.Canceled):
		// The shutdown cancelled it. That is this package being stopped, not
		// this package failing, and an ERROR line here would cry wolf on every
		// deploy.
		return
	case err != nil:
		// WARN and not ERROR: the site is still answering, with older numbers
		// and an honest age. It becomes worth waking up for when the age on the
		// page gets embarrassing, which is a judgement the runbook makes and a
		// log level cannot.
		s.log.WarnContext(ctx, "metric snapshot", "state", "not measured", "err", err)
		return
	}

	measurement := s.read(ctx, samples)
	if !measurement.measured() {
		// Prometheus answered and had nothing to say. On this stack that means
		// no request reached the proxy in five minutes, which is rare — F4's
		// probe alone puts one there — but it is a real state and it is NOT a
		// failure. INFO, and no row: see the package comment.
		s.log.InfoContext(ctx, "metric snapshot", "state", "nothing measured")
		return
	}

	// The slug is resolved separately so that "no such system" and "that
	// instant is already recorded" stay two answers. queries/metrics.sql says
	// why at length; the short version is that folding them together would let
	// a misspelled SITE_SYSTEM_SLUG look exactly like an ordinary duplicate.
	systemID, err := s.queries.SystemIDBySlug(runCtx, s.slug)
	switch {
	case errors.Is(err, context.Canceled):
		return
	case errors.Is(err, pgx.ErrNoRows):
		// ERROR, and it is the only ERROR this loop can raise about itself: the
		// deployment names a system that does not exist, so no run will ever
		// write anything, and no amount of waiting fixes it.
		s.log.ErrorContext(ctx, "metric snapshot",
			"state", "no such system", "slug", s.slug,
			"fix", "SITE_SYSTEM_SLUG names a row in systems")
		return
	case err != nil:
		s.log.ErrorContext(ctx, "metric snapshot", "state", "system unreadable", "err", err)
		return
	}

	written, err := s.queries.InsertMetricSnapshot(runCtx, store.InsertMetricSnapshotParams{
		SystemID:   systemID,
		MeasuredAt: pgtype.Timestamptz{Time: measurement.at, Valid: true},
		P95Ms:      measurement.p95Ms,
		ErrorRate:  measurement.errorRate,
		// One place holds the 91, and it is not this one. invariant 7.
		WindowSize: systems.DefaultWindow,
	})
	switch {
	case errors.Is(err, context.Canceled):
		return
	case err != nil:
		// The query worked, so this is our own storage failing rather than
		// Prometheus. ERROR: unlike a missing measurement, nothing about this
		// gets better by itself.
		s.log.ErrorContext(ctx, "metric snapshot", "state", "not stored", "err", err)
		return
	}

	if written == 0 {
		// Something had already recorded this instant. Not an error and not
		// news, but saying "written" here would be a small untruth in the one
		// line that is supposed to prove the loop is alive. queries/metrics.sql
		// says how rare this is and which case actually reaches it.
		s.log.InfoContext(ctx, "metric snapshot",
			"state", "discarded", "reason", "same instant already recorded",
			"measured_at", measurement.at)
		return
	}

	// At INFO and on every successful run. Together with the two lines above,
	// this is the only evidence that the loop is alive, and the runbook's first
	// question — "have the numbers stopped moving?" — is answered by its
	// absence.
	s.log.InfoContext(ctx, "metric snapshot",
		"state", "written",
		"measured_at", measurement.at,
		"p95_ms", logValue(measurement.p95Ms),
		"error_rate", logValue(measurement.errorRate))
}

// reading is what one run measured, in the contract's units.
//
// Both fields are pointers and both may be nil, because null and zero are
// different answers here and the whole site is built on being able to tell them
// apart (invariant 1). uptime_90d is deliberately absent: it is derived in SQL
// from ops_days and never travels through Go.
type reading struct {
	at        time.Time
	p95Ms     *float64
	errorRate *float64
}

// measured reports whether this run has anything worth a row.
//
// EITHER is enough, not both. The two rules can legitimately disagree: an
// error ratio of exactly 0 records fine while a p95 over a histogram that only
// saw the lowest bucket can still come back NaN. Refusing the row in that case
// would throw away a real measurement to keep a rule tidy.
//
// The cost is stated at the top of this file rather than hidden here: the row
// this returns true for can carry a null beside a number, and that null is what
// the page shows for the field until the next run. keep() refusing an
// impossible value has the same effect as the upstream never producing one, and
// deliberately so -- from the page's side "not measured" is one answer, not
// two.
func (r reading) measured() bool { return r.p95Ms != nil || r.errorRate != nil }

// read turns the answer into the contract's units and refuses what it cannot
// publish.
//
// The instant comes from Prometheus and not from here. Every series in one
// instant query carries the same evaluation timestamp, so the first one is the
// run's instant; there is no averaging and no rounding beyond the millisecond
// promql.go already applied.
func (s *Snapshotter) read(ctx context.Context, samples []sample) reading {
	var out reading

	for _, sm := range samples {
		if out.at.IsZero() {
			out.at = sm.at
		}

		switch sm.name {
		case rulePercentile:
			// Seconds to milliseconds, and this is the only unit conversion in
			// the phase. slis.yml explains why it is not done there: a series
			// name that does not say `milliseconds` should not secretly be in
			// them. math.MaxFloat64 as the ceiling because the contract sets
			// none — p95_ms >= 0 is the whole of what the column asks.
			out.p95Ms = s.keep(ctx, sm.name, sm.value*1000, 0, math.MaxFloat64)
		case ruleErrorRatio:
			out.errorRate = s.keep(ctx, sm.name, sm.value, minRatio, maxRatio)
		}
	}

	return out
}

// keep decides whether one number may be published.
//
// THE THREE OUTCOMES ARE NOT THE SAME, and collapsing any two of them is how
// invariant 1 breaks in this package:
//
//   - NaN is the rules' own word for "nobody measured". It becomes nil, and it
//     is NOT logged: it is the ordinary answer for a five minutes with no
//     traffic, and a WARN on it would be noise on a quiet night.
//   - ±Inf and anything outside the contract's range is a number this process
//     cannot explain. It becomes nil and it IS logged, because something is
//     wrong upstream and nothing else will say so.
//   - Everything else is published exactly as measured, zero included. A
//     measured 0 % error rate is an excellent value, and turning it into null
//     would be the most elegant way to lie without noticing.
//
// Refused rather than clamped, and refused rather than passed through. Clamping
// invents a value; passing it through hits metric_snapshots_p95_range_ck or
// metric_snapshots_error_rate_range_ck and aborts the whole INSERT, which would
// throw away the OTHER number in the same row for a fault it had nothing to do
// with.
func (s *Snapshotter) keep(ctx context.Context, rule string, value, low, high float64) *float64 {
	switch {
	case math.IsNaN(value):
		return nil
	case math.IsInf(value, 0), value < low, value > high:
		// FormatFloat and not the float64 itself, and the reason is measured
		// rather than stylistic: slog's JSONHandler marshals a float64 through
		// encoding/json, which refuses ±Inf, so the field comes out as
		// "!ERROR:json: unsupported value: +Inf". The one value this line exists
		// to name would have been the one value it could not carry.
		s.log.WarnContext(ctx, "metric snapshot",
			"state", "value refused", "rule", rule,
			"value", strconv.FormatFloat(value, 'g', -1, 64))
		return nil
	}

	return &value
}

// logValue renders a nullable number for a log line, where slog would otherwise
// print a pointer address.
func logValue(v *float64) any {
	if v == nil {
		return nil
	}
	return *v
}
