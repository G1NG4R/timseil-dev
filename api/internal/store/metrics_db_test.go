//go:build db

// The snapshot write path against a real server. F5.
//
// The unit tests in internal/snapshots prove what the Go code does with an
// answer from Prometheus. This file proves the half that never travels through
// Go at all: uptime_90d is derived inside the INSERT, from ops_days, and the
// three things that can go wrong with it are arithmetic rather than logic —
// a day with no check must not dilute the average, a window with no checks at
// all must be null rather than zero, and the window has to be the ninety-one
// days the contract says and not ninety or ninety-two.
//
// Run with: make check-db
package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/dbtest"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
	"github.com/G1NG4R/timseil-dev/api/internal/systems"
)

// snapshotAt writes one instant with the numbers the caller cares about, and
// returns how many rows it wrote.
func snapshotAt(t *testing.T, q *store.Queries, systemID int64, at time.Time, p95, ratio *float64) int64 {
	t.Helper()

	written, err := q.InsertMetricSnapshot(context.Background(), store.InsertMetricSnapshotParams{
		SystemID:   systemID,
		MeasuredAt: stamp(at),
		P95Ms:      p95,
		ErrorRate:  ratio,
		WindowSize: systems.DefaultWindow,
	})
	if err != nil {
		t.Fatalf("InsertMetricSnapshot: %v", err)
	}
	return written
}

// day writes one row of the operations grid, `offset` days before today in UTC.
func day(t *testing.T, systemID int64, offset, total, up int) {
	t.Helper()

	state := "ok"
	switch {
	case total == 0:
		state = "nodata"
	case up < total:
		state = "outage"
	}

	sqlDB := dbtest.App(t)
	_, err := sqlDB.Exec(`
		INSERT INTO ops_days (system_id, day, state, down_sec, checks_total, checks_up)
		VALUES ($1, (now() AT TIME ZONE 'UTC')::date - $2::int, $3, 0, $4, $5)`,
		systemID, offset, state, total, up)
	if err != nil {
		t.Fatalf("writing ops_days at -%d: %v", offset, err)
	}
}

// stored reads back the one snapshot this file writes.
func stored(t *testing.T, q *store.Queries) store.LatestMetricsRow {
	t.Helper()

	row, err := q.LatestMetrics(context.Background(), selfSlug)
	if err != nil {
		t.Fatalf("LatestMetrics: %v", err)
	}
	return row
}

// The ordinary case, and the first time these three numbers have ever been in
// the same row. B2 built the table and nothing wrote to it until this phase.
func TestASnapshotBecomesTheNumbersTheSiteServes(t *testing.T) {
	q := seeded(t)
	id := selfID(t, q)

	// Two days measured, one of them with a failure: 287 of 288 checks up.
	day(t, id, 1, 288, 288)
	day(t, id, 0, 288, 287)

	if written := snapshotAt(t, q, id, time.Now().UTC(), ptr(74.6), ptr(0.002)); written != 1 {
		t.Fatalf("wrote %d rows, want 1", written)
	}

	row := stored(t, q)
	if row.P95Ms == nil || *row.P95Ms != 74.6 {
		t.Errorf("p95_ms = %v", row.P95Ms)
	}
	if row.ErrorRate == nil || *row.ErrorRate != 0.002 {
		t.Errorf("error_rate = %v", row.ErrorRate)
	}
	if row.Uptime90d == nil {
		t.Fatal("uptime_90d is null with two measured days in the window")
	}
	// 575 of 576. The number is the point: it comes from ops_days and never
	// from Prometheus, which keeps seven days and cannot answer a 91-day
	// question at all. ADR 0041 §1.
	if want := 575.0 / 576.0 * 100; *row.Uptime90d != want {
		t.Errorf("uptime_90d = %v, want %v", *row.Uptime90d, want)
	}
}

// Invariant 6, in the average. A day nobody measured is `nodata`, and a nodata
// day carries checks_total = 0 — so it contributes to neither sum and cannot
// drag the percentage down. The alternative, counting it as a day of downtime,
// would turn a gap in the record into an outage that did not happen.
func TestDaysWithoutChecksDoNotDiluteTheAverage(t *testing.T) {
	q := seeded(t)
	id := selfID(t, q)

	day(t, id, 0, 288, 288)
	day(t, id, 1, 0, 0)
	day(t, id, 2, 0, 0)

	snapshotAt(t, q, id, time.Now().UTC(), nil, ptr(0.0))

	row := stored(t, q)
	if row.Uptime90d == nil {
		t.Fatal("uptime_90d is null with one measured day in the window")
	}
	if *row.Uptime90d != 100 {
		t.Errorf("uptime_90d = %v, want 100 — two nodata days diluted it", *row.Uptime90d)
	}
}

// Invariant 1, at the one place in this phase where SQL can break it. Nothing
// measured is null; it is NOT zero, which would read as "this system answered
// none of the time" — the most alarming sentence the page can say, produced by
// an empty table.
func TestAnUnmeasuredWindowIsNullAndNotZero(t *testing.T) {
	q := seeded(t)
	id := selfID(t, q)

	// No ops_days at all. Day one of the deployment.
	snapshotAt(t, q, id, time.Now().UTC(), ptr(50.0), ptr(0.0))

	row := stored(t, q)
	if row.Uptime90d != nil {
		t.Errorf("uptime_90d = %v, want null", *row.Uptime90d)
	}
	// And the row still exists, carrying the two numbers that WERE measured.
	if row.P95Ms == nil || row.ErrorRate == nil {
		t.Error("the measured numbers were lost with the unmeasured one")
	}
}

// The other direction of the same invariant, and the one that is easy to lose
// while fixing the first: a day that was checked and failed every check is a
// measured zero, and it has to survive as one.
func TestAFullyFailedDayIsAMeasuredZero(t *testing.T) {
	q := seeded(t)
	id := selfID(t, q)

	day(t, id, 0, 288, 0)

	snapshotAt(t, q, id, time.Now().UTC(), nil, ptr(1.0))

	row := stored(t, q)
	if row.Uptime90d == nil {
		t.Fatal("a measured total outage arrived as null")
	}
	if *row.Uptime90d != 0 {
		t.Errorf("uptime_90d = %v, want 0", *row.Uptime90d)
	}
}

// Invariant 7: the window is 91 days, and the number has to stay countable.
// The day at -90 is the last one inside it and the day at -91 is the first one
// outside — a fencepost either way turns the site's own claim into a rounding
// error.
func TestTheWindowIsNinetyOneDaysAndNotNinetyTwo(t *testing.T) {
	q := seeded(t)
	id := selfID(t, q)

	// Perfect inside the window, catastrophic just outside it.
	day(t, id, 90, 100, 100)
	day(t, id, 91, 100, 0)

	snapshotAt(t, q, id, time.Now().UTC(), nil, ptr(0.0))

	row := stored(t, q)
	if row.Uptime90d == nil {
		t.Fatal("uptime_90d is null with a measured day at -90")
	}
	if *row.Uptime90d != 100 {
		t.Errorf("uptime_90d = %v, want 100 — the day at -91 was counted", *row.Uptime90d)
	}
}

// The idempotency key. A second write of one instant writes nothing and says so,
// rather than raising a constraint violation the loop would have to translate.
//
// Reaching it in production takes two writers inside one millisecond, which is a
// rollout and not a tick — queries/metrics.sql carries that arithmetic. The
// behaviour is worth pinning here anyway: it is what makes the loop safe to run
// twice, and a rollout runs it twice by design.
func TestTheSameInstantIsWrittenOnce(t *testing.T) {
	q := seeded(t)
	id := selfID(t, q)
	at := time.Now().UTC()

	if written := snapshotAt(t, q, id, at, ptr(50.0), ptr(0.0)); written != 1 {
		t.Fatalf("the first write reported %d rows", written)
	}
	if written := snapshotAt(t, q, id, at, ptr(999.0), ptr(0.5)); written != 0 {
		t.Errorf("the second write on the same instant reported %d rows", written)
	}

	// And it did not overwrite: DO NOTHING, not DO UPDATE.
	row := stored(t, q)
	if row.P95Ms == nil || *row.P95Ms != 50 {
		t.Errorf("p95_ms = %v, want the first write's 50", row.P95Ms)
	}
}

// The row that records "we asked and got nothing" is legal in the schema
// (00005_metrics.sql says so at length) and internal/snapshots never produces
// one. This proves the schema still permits it, so that the day somebody wants
// that fact recorded, the decision is theirs and not a migration.
func TestAnEmptySnapshotIsStillPermittedBySchema(t *testing.T) {
	q := seeded(t)
	id := selfID(t, q)

	if written := snapshotAt(t, q, id, time.Now().UTC(), nil, nil); written != 1 {
		t.Fatalf("the schema refused an all-null snapshot")
	}
}

// The app role writes this table, and it is the role the API runs as. A missing
// privilege has to fail here rather than in production. ADR 0011.
func TestTheAppRoleMayWriteASnapshot(t *testing.T) {
	q := seeded(t)

	if written := snapshotAt(t, q, selfID(t, q), time.Now().UTC(), ptr(1.0), ptr(0.0)); written != 1 {
		t.Errorf("the app role wrote %d rows", written)
	}
}
