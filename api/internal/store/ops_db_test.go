//go:build db

// The roll-up against a real server: ops_checks in, ops_days out.
//
// This file is phase C4. The read path was built in C2 and proves that a missing
// row renders as nodata; what is proven here is the other direction — that the
// write path never produces a row for a day nobody measured, so the gap the read
// path renders is a gap that genuinely exists.
//
// The centrepiece is TestTheRollUpRebuildsTheIncidentGridFromItsRawChecks. The
// Incident fixture states its aggregate and calls that a convention of its own
// rather than the rule; these tests wipe the stated aggregate, derive it again
// from the 1440 raw checks the fixture also wrote, and require the same numbers
// back. A fixture whose roll-up contradicted its raw data could not tell a
// correct aggregation from a wrong one — this is the test that cashes in the
// sentence at the top of incident.sql.
//
// Every query here runs through loaded(), which connects as timseil_app. The
// upsert needs INSERT and UPDATE on ops_days; a privilege it lacks fails here
// rather than in production.
//
// What is deliberately NOT here: the MustReject cases for
// ops_days_nodata_iff_unmeasured_ck. They are the schema's business and are
// tested directly in migrations/invariants_db_test.go. The roll-up cannot reach
// that constraint at all — see the file header of queries/ops.sql.
//
// Run with: make check-db
package store_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/dbtest"
	"github.com/G1NG4R/timseil-dev/api/internal/fixtures"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// The Incident fixture's own numbers, and the reason the roll-up takes them as
// parameters instead of holding them: replaying a fixture with the cadence it
// was written at is what makes the comparison meaningful. The production values
// live in internal/ops and are a different pair.
const (
	fixtureProbeInterval = 1800 // the fixture probes every 30 minutes
	fixtureOutageChecks  = 2    // ...and two failures are its outage

	// Every fixture row is written with recorded_at DEFAULT now(), seconds before
	// the test runs, so a day of lookback covers all of them with room to spare.
	testLookback = 86400

	fixtureChecksPerDay  = 48 // 24 h at one probe every 30 minutes
	fixtureMeasuredDays  = 30
	fixtureUnmeasuredDay = 61 // 91 - 30, the cells before measurement started
)

// rollUp runs the aggregation with the Incident fixture's cadence and returns the
// number of rows it wrote.
func rollUp(t *testing.T, q *store.Queries, probeInterval, outageChecks int32) int64 {
	t.Helper()

	n, err := q.RollUpOpsDays(context.Background(), store.RollUpOpsDaysParams{
		LookbackSec:      testLookback,
		OutageChecks:     outageChecks,
		ProbeIntervalSec: probeInterval,
	})
	if err != nil {
		t.Fatalf("RollUpOpsDays: %v", err)
	}
	return n
}

// wipeRollUp clears every derived value without touching the raw checks or the
// notch, so what follows is a derivation and not a comparison against itself.
//
// UPDATE and not DELETE: deleting the outage day would take incident_id with it,
// and one of the tests below is about the notch surviving a recomputation.
// '-infinity' rather than a date, so that nothing here depends on when the
// fixture happened to be loaded.
func wipeRollUp(t *testing.T, db *sql.DB) {
	t.Helper()

	if _, err := db.Exec(`
		UPDATE ops_days
		   SET state = 'nodata', down_sec = 0, checks_total = 0, checks_up = 0,
		       computed_at = '-infinity'`); err != nil {
		t.Fatalf("wiping the roll-up: %v", err)
	}
}

func scalar(t *testing.T, db *sql.DB, query string, args ...any) int {
	t.Helper()

	var n int
	if err := db.QueryRow(query, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	return n
}

// states reads the whole grid as a histogram, the same shape
// migrations/fixtures_db_test.go pins for the fixture itself.
func states(t *testing.T, db *sql.DB) map[string]int {
	t.Helper()

	rows, err := db.Query(`SELECT state, count(*) FROM ops_days GROUP BY state`)
	if err != nil {
		t.Fatalf("counting states: %v", err)
	}
	defer func() { _ = rows.Close() }()

	got := map[string]int{}
	for rows.Next() {
		var state string
		var n int
		if err := rows.Scan(&state, &n); err != nil {
			t.Fatalf("scanning a state count: %v", err)
		}
		got[state] = n
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("counting states: %v", err)
	}
	return got
}

// ------------------------------------------------------- the fixture, rebuilt

// The phase in one test: throw the fixture's stated aggregate away and derive it
// again from the raw checks it was supposed to have been derived from.
//
// The expected numbers are not this test's invention. 61 nodata / 28 ok /
// 1 degraded / 1 outage is what migrations/fixtures_db_test.go already requires
// of the fixture, and 3600 seconds of downtime on the outage day is what
// INC-001 declares as its duration. If the roll-up disagreed with either, one of
// the two would be lying.
func TestTheRollUpRebuildsTheIncidentGridFromItsRawChecks(t *testing.T) {
	q := loaded(t, fixtures.Incident)
	db := dbtest.App(t)

	wipeRollUp(t, db)

	if n := rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks); n != fixtureMeasuredDays {
		t.Fatalf("the roll-up wrote %d days, want %d — one per day that has a check",
			n, fixtureMeasuredDays)
	}

	want := map[string]int{
		"nodata":   fixtureUnmeasuredDay,
		"ok":       28,
		"degraded": 1,
		"outage":   1,
	}
	got := states(t, db)
	for state, n := range want {
		if got[state] != n {
			t.Errorf("%d days read %s, want %d", got[state], state, n)
		}
	}
	if len(got) != len(want) {
		t.Errorf("the grid carries %d distinct states, want %d: %v", len(got), len(want), got)
	}

	// down_sec is failed checks times the cadence, and on the outage day that has
	// to come out as the hour INC-001 claims. The two numbers are written by
	// different authors — this fixture and this query — and a reader is invited
	// to check them against each other.
	if sec := scalar(t, db, `SELECT down_sec FROM ops_days WHERE state = 'outage'`); sec != 3600 {
		t.Errorf("the outage day reports %ds of downtime, want 3600 — INC-001.duration_sec", sec)
	}
	if sec := scalar(t, db, `SELECT down_sec FROM ops_days WHERE state = 'degraded'`); sec != fixtureProbeInterval {
		t.Errorf("the degraded day reports %ds of downtime, want %d", sec, fixtureProbeInterval)
	}

	// The evidence columns behind the colour. Every measured day saw the full 48
	// probes; only the number that answered moves.
	if n := scalar(t, db, `
		SELECT count(*) FROM ops_days
		 WHERE state <> 'nodata' AND checks_total <> $1`, fixtureChecksPerDay); n != 0 {
		t.Errorf("%d measured days do not carry %d checks", n, fixtureChecksPerDay)
	}
	for state, up := range map[string]int{"ok": 48, "degraded": 47, "outage": 46} {
		if n := scalar(t, db,
			`SELECT count(*) FROM ops_days WHERE state = $1 AND checks_up <> $2`, state, up); n != 0 {
			t.Errorf("%d %s days do not report %d answering checks", n, state, up)
		}
	}
}

// The agreement query from migrations/fixtures_db_test.go, turned around: there
// it holds the fixture against its own raw data, here it holds a grid this code
// produced against the same raw data.
func TestTheRecomputedGridStillAgreesWithItsRawChecks(t *testing.T) {
	q := loaded(t, fixtures.Incident)
	db := dbtest.App(t)

	wipeRollUp(t, db)
	rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks)

	if n := scalar(t, db, `
		SELECT count(*) FROM ops_days d
		  JOIN (SELECT system_id,
		               (observed_at AT TIME ZONE 'UTC')::date AS day,
		               count(*) AS total,
		               count(*) FILTER (WHERE up) AS up
		          FROM ops_checks GROUP BY 1, 2) c
		    ON c.system_id = d.system_id AND c.day = d.day
		 WHERE d.checks_total <> c.total
		    OR d.checks_up <> c.up
		    OR d.down_sec <> (c.total - c.up) * $1`, fixtureProbeInterval); n != 0 {
		t.Errorf("%d derived days disagree with the checks they were derived from", n)
	}
}

// The notch is human-curated: the roll-up puts the outage on the grid, a person
// writes the post-mortem afterwards (00004_operations.sql). Recomputing a day
// must therefore leave incident_id exactly where it was.
//
// Mutation test: add `incident_id = EXCLUDED.incident_id` to the DO UPDATE list
// and this goes red, because the roll-up inserts no incident at all.
func TestTheRollUpDoesNotTouchTheNotch(t *testing.T) {
	q := loaded(t, fixtures.Incident)
	db := dbtest.App(t)

	wipeRollUp(t, db)
	rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks)

	if n := scalar(t, db, `SELECT count(*) FROM ops_days WHERE incident_id IS NOT NULL`); n != 1 {
		t.Fatalf("%d days carry a notch after the roll-up, want 1", n)
	}
	if n := scalar(t, db, `
		SELECT count(*) FROM ops_days
		 WHERE incident_id = 'INC-001' AND state = 'outage'`); n != 1 {
		t.Errorf("INC-001 no longer sits on the outage day")
	}
}

// The acceptance criterion of the phase, from the write side: not merely that
// the unmeasured days came out nodata, but that the roll-up never wrote them at
// all. computed_at is the witness — it is '-infinity' on everything the wipe
// left alone and now() on everything this statement touched.
func TestTheRollUpNeverWritesADayItDidNotMeasure(t *testing.T) {
	q := loaded(t, fixtures.Incident)
	db := dbtest.App(t)

	wipeRollUp(t, db)
	rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks)

	if n := scalar(t, db, `
		SELECT count(*) FROM ops_days WHERE checks_total = 0 AND state <> 'nodata'`); n != 0 {
		t.Errorf("%d days claim a state with no measurement behind it", n)
	}
	if n := scalar(t, db, `
		SELECT count(*) FROM ops_days
		 WHERE computed_at > '-infinity' AND checks_total = 0`); n != 0 {
		t.Errorf("the roll-up touched %d unmeasured days — it should not see them at all", n)
	}
	if n := scalar(t, db, `
		SELECT count(*) FROM ops_days WHERE computed_at = '-infinity'`); n != fixtureUnmeasuredDay {
		t.Errorf("%d days were left untouched, want %d", n, fixtureUnmeasuredDay)
	}
}

// ----------------------------------------------------------- the gap test

// "Fehlende Messungen erzeugen nodata, niemals ok" — the phase's acceptance
// criterion, word for word, and read back through the query the API actually
// serves rather than out of the table.
//
// Three scattered days are measured out of ninety-one. The grid still has
// ninety-one cells, three of them ok, and ops_days holds three rows and not
// ninety-one: the eighty-eight gaps are gaps, not remembered zeroes.
func TestAGapInTheMeasurementIsNodataAndNeverOk(t *testing.T) {
	q := loaded(t, fixtures.DayOne)
	ctx := context.Background()
	db := dbtest.App(t)
	id := systemID(t, q, liveSlug)

	// DayOne pre-writes the whole window as nodata rows. They are cleared here so
	// that "the cell is nodata" can only be answered by the read path generating
	// it, never by a row that happened to be lying there.
	if _, err := db.Exec(`DELETE FROM ops_days`); err != nil {
		t.Fatalf("clearing the grid: %v", err)
	}

	measured := []int{10, 8, 5} // days before today
	for _, back := range measured {
		if _, err := db.Exec(`
			INSERT INTO ops_checks (system_id, observed_at, up, latency_ms, origin)
			SELECT $1,
			       (((now() AT TIME ZONE 'UTC')::date - $2::int)::timestamp AT TIME ZONE 'UTC')
			           + (n || ' minutes')::interval,
			       true, 118, 'probe'
			  FROM generate_series(0, 24 * 60 - 30, 30) AS n`, id, back); err != nil {
			t.Fatalf("measuring day -%d: %v", back, err)
		}
	}

	if n := rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks); n != int64(len(measured)) {
		t.Fatalf("the roll-up wrote %d days, want %d", n, len(measured))
	}
	if n := scalar(t, db, `SELECT count(*) FROM ops_days`); n != len(measured) {
		t.Fatalf("ops_days holds %d rows, want %d — a day with no check must not be stored at all",
			n, len(measured))
	}

	rows, err := q.OpsDaysForSystem(ctx, store.OpsDaysForSystemParams{SystemID: id, WindowSize: 91})
	if err != nil {
		t.Fatalf("OpsDaysForSystem: %v", err)
	}
	if len(rows) != 91 {
		t.Fatalf("the grid has %d cells, want 91", len(rows))
	}

	want := map[string]bool{}
	for _, back := range measured {
		want[time.Now().UTC().AddDate(0, 0, -back).Format(time.DateOnly)] = true
	}

	var ok, nodata int
	for _, row := range rows {
		day := row.Day.Time.Format(time.DateOnly)
		switch row.State {
		case "ok":
			ok++
			if !want[day] {
				t.Errorf("%s reads ok and nothing measured it", day)
			}
		case "nodata":
			nodata++
			if want[day] {
				t.Errorf("%s was measured and reads nodata", day)
			}
			if row.DownSec != 0 {
				t.Errorf("%s is nodata and reports %ds of downtime", day, row.DownSec)
			}
		default:
			t.Errorf("%s reads %q — nothing here should produce that", day, row.State)
		}
	}
	if ok != len(measured) {
		t.Errorf("%d cells read ok, want %d", ok, len(measured))
	}
	if nodata != 91-len(measured) {
		t.Errorf("%d cells read nodata, want %d", nodata, 91-len(measured))
	}
}

// ------------------------------------------------------- re-runs and backfill

// The F4 path. A check that arrives hours or days late carries an old
// observed_at and a fresh recorded_at, and the roll-up has to move the day it
// belongs to rather than the day it arrived on. This is the whole reason the
// scan is bounded on recorded_at and the grouping on observed_at.
func TestALateBackfillMovesTheDayItBelongsTo(t *testing.T) {
	q := loaded(t, fixtures.Incident)
	db := dbtest.App(t)

	wipeRollUp(t, db)
	rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks)

	// A day that came out ok, and an instant on it that no probe used: the fixture
	// probes on the half hour, this one lands at :15.
	const back = 20
	if _, err := db.Exec(`
		INSERT INTO ops_checks (system_id, observed_at, up, reason, origin, source_ref)
		SELECT s.id,
		       (((now() AT TIME ZONE 'UTC')::date - $1::int)::timestamp AT TIME ZONE 'UTC')
		           + interval '4 hours 15 minutes',
		       false, 'connect timeout', 'backfill', 'a41f9c2'
		  FROM systems s WHERE s.slug = $2`, back, liveSlug); err != nil {
		t.Fatalf("backfilling a failed check: %v", err)
	}

	// Not asserted on the row count. RowsAffected is every day inside the lookback,
	// not every day that changed — the fixture wrote all 1440 checks seconds ago,
	// so all thirty are rewritten with the same values. That is the price of
	// dropping the computed_at staleness clause (ADR 0019), and the property that
	// matters is content, which is what the rest of this test reads.
	rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks)

	var state string
	var downSec, total int
	if err := db.QueryRow(`
		SELECT state, down_sec, checks_total FROM ops_days
		 WHERE day = (now() AT TIME ZONE 'UTC')::date - $1::int`, back).
		Scan(&state, &downSec, &total); err != nil {
		t.Fatalf("reading the backfilled day: %v", err)
	}
	if state != "degraded" {
		t.Errorf("the backfilled day reads %q, want degraded", state)
	}
	if downSec != fixtureProbeInterval {
		t.Errorf("the backfilled day reports %ds of downtime, want %d", downSec, fixtureProbeInterval)
	}
	if total != fixtureChecksPerDay+1 {
		t.Errorf("the backfilled day counts %d checks, want %d", total, fixtureChecksPerDay+1)
	}

	// And nothing else moved: the fixture's own outage and degraded day are still
	// the only other days that are not ok.
	if n := scalar(t, db, `
		SELECT count(*) FROM ops_days WHERE state NOT IN ('ok', 'nodata')`); n != 3 {
		t.Errorf("%d days are not ok after the backfill, want 3", n)
	}
}

// The roll-up runs every five minutes forever, so re-deriving the same data has
// to be a no-op. Compared on content: computed_at is excluded on purpose,
// because it moves on every run by design — that is what makes "the grid has
// stopped updating" diagnosable at all (docs/runbooks/ops.md).
func TestRunningTheRollUpTwiceChangesNothing(t *testing.T) {
	q := loaded(t, fixtures.Incident)
	db := dbtest.App(t)

	wipeRollUp(t, db)
	rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks)

	const snapshot = `
		SELECT md5(string_agg(
		           day::text || state || down_sec || checks_total || checks_up ||
		           coalesce(incident_id, '-'), ',' ORDER BY system_id, day))
		  FROM ops_days`

	var before, after string
	if err := db.QueryRow(snapshot).Scan(&before); err != nil {
		t.Fatalf("taking the first snapshot: %v", err)
	}

	rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks)

	if err := db.QueryRow(snapshot).Scan(&after); err != nil {
		t.Fatalf("taking the second snapshot: %v", err)
	}
	if before != after {
		t.Errorf("a second roll-up over unchanged checks moved the grid")
	}
}

// ------------------------------------------------------------- the broken case

// A cadence that does not fit in a day. down_sec is capped at 86400 by
// ops_days_down_sec_ck, and the statement has to clamp one cell rather than
// abort the whole run — a misconfigured interval must not stop the grid from
// updating for every system at once.
//
// Mutation test: drop LEAST from the INSERT and this fails with a check
// constraint violation instead of a wrong number, which is exactly the point.
func TestADayCannotReportMoreDowntimeThanADayHas(t *testing.T) {
	q := loaded(t, fixtures.Incident)
	db := dbtest.App(t)

	wipeRollUp(t, db)

	// One "probe interval" of a full day, so the outage day's two failed checks
	// would come to 172 800 seconds.
	rollUp(t, q, 86400, fixtureOutageChecks)

	if sec := scalar(t, db, `SELECT down_sec FROM ops_days WHERE state = 'outage'`); sec != 86400 {
		t.Errorf("the outage day reports %ds of downtime, want it clamped to 86400", sec)
	}
	if n := scalar(t, db, `SELECT count(*) FROM ops_days WHERE down_sec > 86400`); n != 0 {
		t.Errorf("%d days report more downtime than a day has", n)
	}
}

// The threshold is the caller's, not the query's. At outage_checks = 3 the
// fixture's two-failure day is degraded rather than an outage — and the notch
// stays on it, because the roll-up does not curate notches.
//
// Mutation test: change `checks_down < outage_checks` to `<=` and this goes red.
func TestTheOutageThresholdIsTheOneTheCallerStates(t *testing.T) {
	q := loaded(t, fixtures.Incident)
	db := dbtest.App(t)

	wipeRollUp(t, db)
	rollUp(t, q, fixtureProbeInterval, 3)

	if n := scalar(t, db, `SELECT count(*) FROM ops_days WHERE state = 'outage'`); n != 0 {
		t.Errorf("%d days read outage at a threshold of three failures, want 0", n)
	}
	if n := scalar(t, db, `SELECT count(*) FROM ops_days WHERE state = 'degraded'`); n != 2 {
		t.Errorf("%d days read degraded at a threshold of three failures, want 2", n)
	}
}
