//go:build db

// The one thing the fixture tests cannot see: how long a failed check vouches
// for.
//
// This file is issue #180. down_sec used to be failed checks TIMES a declared
// probe interval, and the interval was declared rather than driven — counted
// over 2026-08-24, the probe ran 41 times in 23.66 hours where its cron
// promises 284. Every outage duration on the public grid was understated by
// roughly that factor.
//
// WHY IT NEEDS ITS OWN FILE. The Incident fixture probes every 30 minutes and
// its roll-up was parameterised with 1800, so the old arithmetic and the new
// one return the same numbers for it — 3600 on the outage day, 1800 on the
// degraded one. Those agreements are worth having and they are worth naming as
// what they are: a case where the two arithmetics cannot be told apart. The
// case that tells them apart is one whose real cadence differs from the number
// the caller used to pass, and every test below is that case.
//
// The mutation that has to turn these red: put `checks_down * <any constant>`
// back into queries/ops.sql. TestAnOutageIsAsLongAsTheGapTheProbeActuallyLeft
// is the one that catches it by seven times.
//
// Run with: make check-db
package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/dbtest"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// check writes one raw observation at an explicit instant.
//
// Through InsertOpsCheck rather than through SQL of its own, so these cases
// travel the path the probe travels — including the schema rules that a failed
// check carries no latency and a successful one carries no reason.
func check(t *testing.T, q *store.Queries, id int64, at time.Time, up bool) {
	t.Helper()

	arg := store.InsertOpsCheckParams{SystemID: id, ObservedAt: stamp(at), Up: up}
	if up {
		arg.LatencyMs = ptr(int32(118))
	} else {
		arg.Reason = ptr("connection refused")
	}

	if _, err := q.InsertOpsCheck(context.Background(), arg); err != nil {
		t.Fatalf("InsertOpsCheck at %s (up=%v): %v", at.Format(time.RFC3339), up, err)
	}
}

// noonYesterday is the anchor every case here is built from.
//
// Yesterday, so a case may run past its own last check without crossing into
// tomorrow; noon, so a gap of a few hours in either direction stays inside the
// same UTC day and the day boundary is never what a test is accidentally
// measuring. A case that IS about the boundary builds its own instants.
func noonYesterday() time.Time {
	return time.Now().UTC().AddDate(0, 0, -1).Truncate(24 * time.Hour).Add(12 * time.Hour)
}

// downSecOf reads the derived cell back.
func downSecOf(t *testing.T, id int64, day time.Time) (int, string, int) {
	t.Helper()

	db := dbtest.App(t)

	var downSec, total int
	var state string
	if err := db.QueryRow(
		`SELECT down_sec, state, checks_total FROM ops_days WHERE system_id = $1 AND day = $2`,
		id, day.Format(time.DateOnly),
	).Scan(&downSec, &state, &total); err != nil {
		t.Fatalf("reading %s back: %v", day.Format(time.DateOnly), err)
	}
	return downSec, state, total
}

// ------------------------------------------------------------- the broken case

// The headline of #180, as an arithmetic anybody can recount.
//
// The probe is DECLARED at five minutes and DRIVEN at thirty-five, which is
// what GitHub's scheduler actually delivered. One check fails, the next one
// answers thirty-five minutes later, so the site was unreachable across a
// thirty-five minute gap and the grid has to say so.
//
// 2100 against the 300 the old statement produced: the seven-times
// understatement, in one assertion, without reference to any constant. The
// numbers below are the two instants and nothing else.
func TestAnOutageIsAsLongAsTheGapTheProbeActuallyLeft(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	const driven = 35 * time.Minute
	at := noonYesterday()

	check(t, q, id, at.Add(-driven), true) // answered
	check(t, q, id, at, false)             // did not
	check(t, q, id, at.Add(driven), true)  // answered again

	rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks)

	downSec, state, total := downSecOf(t, id, at)
	if want := int(driven.Seconds()); downSec != want {
		t.Errorf("down_sec is %d, want %d — the gap between the failed check and "+
			"the one that answered next. A constant of 300 would say 300 here.",
			downSec, want)
	}
	if state != "degraded" {
		t.Errorf("the day reads %q, want degraded — one failure below a threshold of %d",
			state, fixtureOutageChecks)
	}
	if total != 3 {
		t.Errorf("the day counted %d checks, want 3", total)
	}
}

// Consecutive failures add up, and the sum is still only instants.
//
// Three failures at an uneven cadence — 35, then 12, then a recovery 48 minutes
// on. The unevenness is the point: no single interval could stand in for these
// three spans, so a statement that multiplies anything cannot produce 5700.
func TestConsecutiveFailuresSumTheirOwnUnevenGaps(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	at := noonYesterday()
	gaps := []time.Duration{35 * time.Minute, 12 * time.Minute, 48 * time.Minute}

	cur := at
	check(t, q, id, cur, false)
	for _, g := range gaps[:len(gaps)-1] {
		cur = cur.Add(g)
		check(t, q, id, cur, false)
	}
	check(t, q, id, cur.Add(gaps[len(gaps)-1]), true) // the recovery

	rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks)

	want := 0
	for _, g := range gaps {
		want += int(g.Seconds())
	}

	downSec, state, total := downSecOf(t, id, at)
	if downSec != want {
		t.Errorf("down_sec is %d, want %d — 35 + 12 + 48 minutes, each one a pair "+
			"of instants in ops_checks", downSec, want)
	}
	if state != "outage" {
		t.Errorf("the day reads %q, want outage — three failures at a threshold of %d",
			state, fixtureOutageChecks)
	}
	if total != 4 {
		t.Errorf("the day counted %d checks, want 4", total)
	}
}

// ------------------------------------------ what the arithmetic refuses to say

// A failed check with nothing after it vouches for nothing.
//
// One check, on a day nothing else measured, and it failed. The next check this
// system has is on another day, and the roll-up deliberately does not reach for
// it: clipping that span to midnight would put 86 400 seconds of outage on a
// cell whose own checks_total reads 1 — a full day of downtime derived from a
// single glance.
//
// So the cell says degraded with no duration, which is the true statement: we
// looked once, it was down, and we cannot say for how long. The evidence that
// makes it readable is already beside it — checks_total is 1, and issue #208 is
// about putting that coverage next to the number on the page.
func TestASingleFailedCheckReportsNoDuration(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	at := noonYesterday()
	check(t, q, id, at, false)

	rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks)

	downSec, state, total := downSecOf(t, id, at)
	if downSec != 0 {
		t.Errorf("down_sec is %d, want 0 — one observation bounds no interval", downSec)
	}
	if state != "degraded" {
		t.Errorf("the day reads %q, want degraded — the colour does not depend on the duration",
			state)
	}
	if total != 1 {
		t.Errorf("the day counted %d checks, want 1", total)
	}
}

// An outage that is still open contributes nothing, and it is the same refusal
// internal/uptime/expand.go makes for a trailing `down`: counting up to now()
// would put a number on the page that no probe produced.
//
// Four failures and no recovery yet. Three spans are known, the fourth is not,
// and the fourth is dropped rather than guessed — so the day reports the three
// gaps that closed and nothing for the one that has not.
func TestAnOpenOutageCountsOnlyTheGapsThatClosed(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	const step = 20 * time.Minute
	at := noonYesterday()

	for i := range 4 {
		check(t, q, id, at.Add(time.Duration(i)*step), false)
	}

	rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks)

	downSec, state, total := downSecOf(t, id, at)
	if want := 3 * int(step.Seconds()); downSec != want {
		t.Errorf("down_sec is %d, want %d — three closed gaps, and nothing for the "+
			"failure that has no successor yet", downSec, want)
	}
	if state != "outage" || total != 4 {
		t.Errorf("the day reads %q with %d checks, want outage and 4", state, total)
	}
}

// A span never crosses midnight, and the cost of that is stated rather than
// hidden: the last failure of a day loses its span, because the check that
// closes it belongs to the next day's cell.
//
// The reason is the schema, not taste. A day inside the gap has no checks at
// all, ops_days_nodata_iff_unmeasured_ck makes it nodata, and
// ops_days_nodata_has_no_downtime_ck forbids downtime on a nodata day — so
// there is no cell for the other half of the span to land in.
func TestASpanDoesNotCrossMidnight(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	// 23:30 yesterday fails; the next check answers at 00:10 today.
	midnight := time.Now().UTC().Truncate(24 * time.Hour)
	lastNight := midnight.Add(-24 * time.Hour)

	check(t, q, id, lastNight.Add(23*time.Hour), true)
	check(t, q, id, lastNight.Add(23*time.Hour+30*time.Minute), false)
	check(t, q, id, midnight.Add(10*time.Minute), true)

	rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks)

	downSec, state, total := downSecOf(t, id, lastNight)
	if downSec != 0 {
		t.Errorf("down_sec is %d, want 0 — the check that closes the 23:30 failure "+
			"is on the next day, and a span is not clipped to the boundary", downSec)
	}
	if state != "degraded" || total != 2 {
		t.Errorf("yesterday reads %q with %d checks, want degraded and 2", state, total)
	}

	// And today's cell is untouched by it: the 00:10 check answered.
	if sec, st, n := downSecOf(t, id, midnight); sec != 0 || st != "ok" || n != 1 {
		t.Errorf("today reads %q with %d checks and %ds down, want ok, 1 and 0", st, n, sec)
	}
}
