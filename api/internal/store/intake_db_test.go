//go:build db

// The write side of the operations tables against a real server: the three
// queries C7's internal endpoints run.
//
// This file is phase C7. What it is for is the half of those queries that no
// stub can check — the CHECK constraints, the unique constraints behind the
// idempotency, the DEFAULT on recorded_at that the roll-up depends on, and
// whether timseil_app is allowed to write these tables at all. The handler
// tests next door prove that a contradiction is refused before it gets here;
// these prove that it would have been refused if it had.
//
// The most load-bearing test in the file is the last one. The probe endpoint
// deliberately does not set recorded_at, because RollUpOpsDays scans on it and
// groups on observed_at — that is what makes a months-old observation from the
// ops-data branch aggregate correctly. It is one omitted column, nothing warns
// about it, and getting it wrong makes rows that are written and never counted.
//
// Run with: make check-db
package store_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/G1NG4R/timseil-dev/api/internal/dbtest"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// selfSlug — the site's own system, the one both endpoints resolve through
// SITE_SYSTEM_SLUG — is declared in health_db_test.go and shared across this
// package's db tests.

func stamp(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}

func selfID(t *testing.T, q *store.Queries) int64 {
	t.Helper()

	id, err := q.SystemIDBySlug(context.Background(), selfSlug)
	if err != nil {
		t.Fatalf("SystemIDBySlug(%q): %v", selfSlug, err)
	}
	return id
}

// constraintOf names the CHECK or UNIQUE a write tripped, so a test can say
// which rule caught it rather than only that something did. A test that
// accepted any error would pass on a typo in the column list.
func constraintOf(t *testing.T, err error) string {
	t.Helper()

	if err == nil {
		t.Fatal("the write was accepted")
	}
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		t.Fatalf("not a database error: %v", err)
	}
	return pgErr.ConstraintName
}

// ------------------------------------------------------------ the slug lookup

// pgx.ErrNoRows is what tells the handler that SITE_SYSTEM_SLUG names nothing,
// and it is the difference between a 500 with a log line and a silent write to
// a system that does not exist.
func TestAnUnknownSlugIsNoRowsAndNotAZero(t *testing.T) {
	q := loaded(t, "day-one")

	id, err := q.SystemIDBySlug(context.Background(), "no-such-system")
	if err == nil {
		t.Fatalf("an unknown slug resolved to %d", id)
	}
	if !errors.Is(err, sql.ErrNoRows) && err.Error() != "no rows in result set" {
		t.Fatalf("SystemIDBySlug returned %v, want no rows", err)
	}
}

// ------------------------------------------------------------------ ops_checks

func TestAProbeRowIsWrittenAndCountedOnce(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	arg := store.InsertOpsCheckParams{
		SystemID:   id,
		ObservedAt: stamp(time.Now().Add(-time.Minute)),
		Up:         true,
		LatencyMs:  ptr(int32(142)),
	}

	rows, err := q.InsertOpsCheck(context.Background(), arg)
	if err != nil {
		t.Fatalf("InsertOpsCheck: %v", err)
	}
	if rows != 1 {
		t.Fatalf("wrote %d rows, want 1", rows)
	}

	// The retry. The prober may send the same observation again after a
	// timeout, and the conflict clause is what keeps that from being a second
	// measurement of the same instant.
	again, err := q.InsertOpsCheck(context.Background(), arg)
	if err != nil {
		t.Fatalf("a repeated observation errored instead of being ignored: %v", err)
	}
	if again != 0 {
		t.Errorf("a repeated observation wrote %d rows, want 0", again)
	}
}

// The rule the migration states as "a backfill never overwrites a live probe",
// tested from the direction that would hurt: a second report for the same
// instant that disagrees is DISCARDED, not applied. The endpoint answers 204
// either way, so this is the only place the semantics are visible.
func TestASecondReportForTheSameInstantDoesNotChangeTheFirst(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)
	at := stamp(time.Now().Add(-time.Minute))

	if _, err := q.InsertOpsCheck(context.Background(), store.InsertOpsCheckParams{
		SystemID: id, ObservedAt: at, Up: true, LatencyMs: ptr(int32(142)),
	}); err != nil {
		t.Fatalf("the first write: %v", err)
	}

	if _, err := q.InsertOpsCheck(context.Background(), store.InsertOpsCheckParams{
		SystemID: id, ObservedAt: at, Up: false, Reason: ptr("connect timeout"),
	}); err != nil {
		t.Fatalf("the contradicting write: %v", err)
	}

	db := dbtest.App(t)
	var up bool
	if err := db.QueryRow(`SELECT up FROM ops_checks WHERE system_id = $1 AND observed_at = $2`,
		id, at.Time).Scan(&up); err != nil {
		t.Fatalf("reading the row back: %v", err)
	}
	if !up {
		t.Error("the second report overwrote the first; the conflict clause is not DO NOTHING")
	}
}

// The two contradictions the handler refuses in advance. If either of these
// ever stopped being a database error, the handler's validation would be the
// only thing standing between a bad payload and a wrong public grid — and a
// single rule with no backstop is a rule one refactor from being gone.
func TestTheDatabaseStillRefusesWhatTheHandlerRefusesFirst(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	for _, tc := range []struct {
		name       string
		arg        store.InsertOpsCheckParams
		constraint string
	}{
		{
			"a reason on a host that answered",
			store.InsertOpsCheckParams{
				SystemID: id, ObservedAt: stamp(time.Now()), Up: true,
				Reason: ptr("connect timeout"),
			},
			"ops_checks_reason_only_when_down_ck",
		},
		{
			"a latency on a host that did not",
			store.InsertOpsCheckParams{
				SystemID: id, ObservedAt: stamp(time.Now()), Up: false,
				LatencyMs: ptr(int32(142)),
			},
			"ops_checks_no_latency_when_down_ck",
		},
		{
			"a negative latency",
			store.InsertOpsCheckParams{
				SystemID: id, ObservedAt: stamp(time.Now()), Up: true,
				LatencyMs: ptr(int32(-1)),
			},
			"ops_checks_latency_ck",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := q.InsertOpsCheck(context.Background(), tc.arg)
			if got := constraintOf(t, err); got != tc.constraint {
				t.Errorf("tripped %q, want %q", got, tc.constraint)
			}
		})
	}
}

// origin is fixed to 'probe' in the query rather than taken from the caller.
// The other value the CHECK allows is 'backfill', which is F4's and carries a
// source_ref naming a public commit; a live probe able to claim it would be a
// row asserting it came from outside the infrastructure when it did not.
func TestAProbeRowCannotClaimToBeABackfill(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	if _, err := q.InsertOpsCheck(context.Background(), store.InsertOpsCheckParams{
		SystemID: id, ObservedAt: stamp(time.Now()), Up: true,
	}); err != nil {
		t.Fatalf("InsertOpsCheck: %v", err)
	}

	db := dbtest.App(t)
	var origin string
	var sourceRef *string
	if err := db.QueryRow(
		`SELECT origin, source_ref FROM ops_checks WHERE system_id = $1`, id,
	).Scan(&origin, &sourceRef); err != nil {
		t.Fatalf("reading the row back: %v", err)
	}

	if origin != "probe" {
		t.Errorf("origin = %q, want probe", origin)
	}
	if sourceRef != nil {
		t.Errorf("source_ref = %q; it belongs to the backfill in F4", *sourceRef)
	}
}

// The omission the roll-up depends on.
//
// InsertOpsCheck does not name recorded_at, so it takes its DEFAULT now().
// RollUpOpsDays bounds its scan on recorded_at and groups on observed_at —
// which is exactly what makes a months-old observation replayed from the
// ops-data branch aggregate correctly. Supply recorded_at from the caller and a
// late report lands outside the lookback window and is never counted; the row
// is in the table, the grid says nodata, and nothing anywhere reports a
// problem.
func TestALateObservationIsStillFreshlyRecordedAndStillAggregated(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	// Two months old, which is well outside any lookback the loop uses.
	observed := time.Now().AddDate(0, -2, 0)

	if _, err := q.InsertOpsCheck(context.Background(), store.InsertOpsCheckParams{
		SystemID: id, ObservedAt: stamp(observed), Up: false,
		Reason: ptr("recovered from uptime-log.txt"),
	}); err != nil {
		t.Fatalf("InsertOpsCheck: %v", err)
	}

	db := dbtest.App(t)
	var age time.Duration
	var seconds float64
	if err := db.QueryRow(
		`SELECT extract(epoch FROM (now() - recorded_at)) FROM ops_checks WHERE system_id = $1`, id,
	).Scan(&seconds); err != nil {
		t.Fatalf("reading recorded_at back: %v", err)
	}
	age = time.Duration(seconds) * time.Second

	if age > time.Minute {
		t.Fatalf("recorded_at is %v old — the insert supplied it instead of "+
			"letting the default stand, and the roll-up will never see this row", age)
	}

	// And the roll-up does find it, which is the point of the paragraph above.
	rolled := rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks)
	if rolled == 0 {
		t.Error("the roll-up counted no days after a late observation")
	}

	day := observed.UTC().Format("2006-01-02")
	if n := scalar(t, db,
		`SELECT count(*) FROM ops_days WHERE system_id = $1 AND day = $2`, id, day); n != 1 {
		t.Errorf("the two-month-old observation produced %d rows for %s, want 1", n, day)
	}
}

// -------------------------------------------------------------------- deploys

func TestADeployRowIsWrittenAndARetryDoesNotDoubleIt(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	arg := store.InsertDeployParams{
		SystemID: id, Sha: "a41f9c2", DurationSec: 42, Result: "ok",
		DeployedAt: stamp(time.Now().Add(-time.Hour)),
	}

	rows, err := q.InsertDeploy(context.Background(), arg)
	if err != nil {
		t.Fatalf("InsertDeploy: %v", err)
	}
	if rows != 1 {
		t.Fatalf("wrote %d rows, want 1", rows)
	}

	again, err := q.InsertDeploy(context.Background(), arg)
	if err != nil {
		t.Fatalf("a retried deploy errored instead of being ignored: %v", err)
	}
	if again != 0 {
		t.Errorf("a retried deploy wrote %d rows, want 0 — that is a second bar", again)
	}
}

// A rollback and the redeploy after it are the same commit at two instants, and
// they are two events. The unique constraint has to let them both in or the
// grid loses the more interesting one.
func TestTheSameCommitDeployedTwiceIsTwoRows(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	base := time.Now().Add(-2 * time.Hour)
	for _, tc := range []struct {
		at     time.Time
		result string
	}{
		{base, "rollback"},
		{base.Add(20 * time.Minute), "ok"},
	} {
		if _, err := q.InsertDeploy(context.Background(), store.InsertDeployParams{
			SystemID: id, Sha: "b7d0e15", DurationSec: 38, Result: tc.result,
			DeployedAt: stamp(tc.at),
		}); err != nil {
			t.Fatalf("InsertDeploy(%s): %v", tc.result, err)
		}
	}

	db := dbtest.App(t)
	if n := scalar(t, db,
		`SELECT count(*) FROM deploys WHERE system_id = $1 AND sha = 'b7d0e15'`, id); n != 2 {
		t.Errorf("a rollback and its redeploy produced %d rows, want 2", n)
	}
}

func TestTheDatabaseStillRefusesAMalformedDeploy(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	for _, tc := range []struct {
		name       string
		arg        store.InsertDeployParams
		constraint string
	}{
		{
			"a sha in capitals",
			store.InsertDeployParams{SystemID: id, Sha: "A41F9C2", DurationSec: 42,
				Result: "ok", DeployedAt: stamp(time.Now())},
			"deploys_sha_shape_ck",
		},
		{
			"a sha too short",
			store.InsertDeployParams{SystemID: id, Sha: "a41f9", DurationSec: 42,
				Result: "ok", DeployedAt: stamp(time.Now())},
			"deploys_sha_shape_ck",
		},
		{
			"a result outside the enum",
			store.InsertDeployParams{SystemID: id, Sha: "a41f9c2", DurationSec: 42,
				Result: "banana", DeployedAt: stamp(time.Now())},
			"deploys_result_ck",
		},
		{
			"a negative duration",
			store.InsertDeployParams{SystemID: id, Sha: "a41f9c2", DurationSec: -1,
				Result: "ok", DeployedAt: stamp(time.Now())},
			"deploys_duration_ck",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := q.InsertDeploy(context.Background(), tc.arg)
			if got := constraintOf(t, err); got != tc.constraint {
				t.Errorf("tripped %q, want %q", got, tc.constraint)
			}
		})
	}
}

func ptr[T any](v T) *T { return &v }
