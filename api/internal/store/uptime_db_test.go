//go:build db

// The replay side of ops_checks against a real server: what BackfillOpsChecks
// may and may not write.
//
// This file is phase F4, and it is the other half of intake_db_test.go. That
// one proves a live probe cannot claim to be evidence from outside the
// infrastructure; this one proves the reverse and the two rules that hang off
// it — that a replayed row is always an outage, and that it never overwrites
// what a live probe already recorded.
//
// None of this is checkable without a server. The constants are in the SQL, the
// rules are CHECK and UNIQUE constraints, and the count the loop logs is what
// ON CONFLICT DO NOTHING decided to skip. A stub would agree with whatever the
// caller believed.
//
// Run with: make check-db
package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/G1NG4R/timseil-dev/api/internal/dbtest"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// A full commit sha, the shape internal/uptime checks before it gets here —
// ops_checks.source_ref has no CHECK on its form, unlike deploys.sha.
const opsDataCommit = "0f4d21a3c8b7e6519a0d2c4f8b3e7a1d6c5904fe"

// instants is one outage expanded onto a probe interval, in the form the query
// takes it.
func instants(from time.Time, step time.Duration, n int) []pgtype.Timestamptz {
	at := make([]pgtype.Timestamptz, 0, n)
	for i := range n {
		at = append(at, stamp(from.Add(time.Duration(i)*step)))
	}
	return at
}

// Everything a replayed row is not allowed to decide for itself, read back off
// the server rather than off the parameters that were sent.
func TestABackfilledRowIsAlwaysAnOutageAndAlwaysCitesACommit(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	from := time.Now().Add(-2 * time.Hour).Truncate(time.Minute)

	n, err := q.BackfillOpsChecks(context.Background(), store.BackfillOpsChecksParams{
		SystemID:   id,
		Reason:     ptr("connect timeout"),
		SourceRef:  ptr(opsDataCommit),
		ObservedAt: instants(from, 5*time.Minute, 5),
	})
	if err != nil {
		t.Fatalf("BackfillOpsChecks: %v", err)
	}
	if n != 5 {
		t.Fatalf("wrote %d rows, want 5", n)
	}

	db := dbtest.App(t)

	// up is a constant in the query, not an argument, so there is no caller
	// mistake that can produce a replayed row claiming the site answered.
	if up := scalar(t, db,
		`SELECT count(*) FROM ops_checks WHERE system_id = $1 AND up`, id); up != 0 {
		t.Errorf("%d replayed rows say the site was up, want none", up)
	}

	// latency_ms is omitted from the column list, so it is NULL by construction
	// rather than by the caller remembering — which is also what satisfies
	// ops_checks_no_latency_when_down_ck.
	if withLatency := scalar(t, db,
		`SELECT count(*) FROM ops_checks WHERE system_id = $1 AND latency_ms IS NOT NULL`,
		id); withLatency != 0 {
		t.Errorf("%d replayed rows carry a latency for a request that never completed", withLatency)
	}

	if cited := scalar(t, db,
		`SELECT count(*) FROM ops_checks
		  WHERE system_id = $1 AND origin = 'backfill' AND source_ref = $2`,
		id, opsDataCommit); cited != 5 {
		t.Errorf("%d of 5 rows are backfill rows citing the commit they came from", cited)
	}

	// recorded_at takes its default here for the same reason InsertOpsCheck
	// leaves it alone: the roll-up bounds its scan on it, and an observation
	// from two hours ago has to be aggregated now.
	if seconds := scalarFloat(t, db,
		`SELECT max(extract(epoch FROM (now() - recorded_at))) FROM ops_checks WHERE system_id = $1`,
		id); seconds > 60 {
		t.Errorf("recorded_at is %.0fs old — the replay supplied it and the roll-up will never see these rows",
			seconds)
	}
}

// The migration's own sentence: "a backfill never overwrites a live probe."
// Not a convention in the caller — the unique constraint decides it, and
// ON CONFLICT DO NOTHING is what turns the collision into a skipped row rather
// than an applied one.
func TestABackfillNeverOverwritesALiveProbe(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	contested := time.Now().Add(-time.Hour).Truncate(time.Minute)

	if _, err := q.InsertOpsCheck(context.Background(), store.InsertOpsCheckParams{
		SystemID: id, ObservedAt: stamp(contested), Up: true, LatencyMs: ptr(int32(88)),
	}); err != nil {
		t.Fatalf("InsertOpsCheck: %v", err)
	}

	// Three instants, the first of which is the one the live probe already has.
	n, err := q.BackfillOpsChecks(context.Background(), store.BackfillOpsChecksParams{
		SystemID:   id,
		Reason:     ptr("api unreachable"),
		SourceRef:  ptr(opsDataCommit),
		ObservedAt: instants(contested, 5*time.Minute, 3),
	})
	if err != nil {
		t.Fatalf("BackfillOpsChecks: %v", err)
	}

	// Two, not three. The count is what internal/uptime logs as rows_new, and
	// the difference is the evidence that the collision was skipped.
	if n != 2 {
		t.Fatalf("wrote %d rows, want 2 — the third collided with a live probe", n)
	}

	db := dbtest.App(t)

	var origin string
	var up bool
	var latency *int32
	if err := db.QueryRow(
		`SELECT origin, up, latency_ms FROM ops_checks WHERE system_id = $1 AND observed_at = $2`,
		id, contested.UTC(),
	).Scan(&origin, &up, &latency); err != nil {
		t.Fatalf("reading the contested row back: %v", err)
	}

	if origin != "probe" || !up || latency == nil || *latency != 88 {
		t.Errorf("the contested row is now origin=%q up=%v latency=%v — the replay overwrote a measurement",
			origin, up, latency)
	}
}

// The constraint that makes a derived row traceable. Without source_ref there
// is nothing to check the claim against, and ops_checks_backfill_cites_source_ck
// is what says so — the query cannot omit it by accident, but the next query
// somebody writes could.
func TestABackfillWithoutACommitIsRefused(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	_, err := q.BackfillOpsChecks(context.Background(), store.BackfillOpsChecksParams{
		SystemID:   id,
		Reason:     ptr("dns failure"),
		SourceRef:  nil,
		ObservedAt: instants(time.Now().Add(-time.Hour), 5*time.Minute, 2),
	})

	if got := constraintOf(t, err); got != "ops_checks_backfill_cites_source_ck" {
		t.Fatalf("the write tripped %q, want ops_checks_backfill_cites_source_ck", got)
	}
}

// The loop re-reads the file after every restart, so the second replay of the
// same outage has to cost nothing. This is the test that lets internal/uptime
// be careless about how often it runs.
func TestReplayingTheSameOutageTwiceWritesNothingTheSecondTime(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	arg := store.BackfillOpsChecksParams{
		SystemID:   id,
		Reason:     ptr("http 5xx"),
		SourceRef:  ptr(opsDataCommit),
		ObservedAt: instants(time.Now().Add(-3*time.Hour).Truncate(time.Minute), 5*time.Minute, 4),
	}

	first, err := q.BackfillOpsChecks(context.Background(), arg)
	if err != nil {
		t.Fatalf("first replay: %v", err)
	}
	second, err := q.BackfillOpsChecks(context.Background(), arg)
	if err != nil {
		t.Fatalf("second replay: %v", err)
	}

	if first != 4 || second != 0 {
		t.Fatalf("the two replays wrote %d and %d rows, want 4 and 0", first, second)
	}

	db := dbtest.App(t)
	if total := scalar(t, db, `SELECT count(*) FROM ops_checks WHERE system_id = $1`, id); total != 4 {
		t.Fatalf("the table holds %d rows after replaying the same outage twice, want 4", total)
	}
}

// End to end, which is the only place the arithmetic in internal/uptime and the
// arithmetic in queries/ops.sql are held against each other: N replayed
// instants have to become an outage day whose duration is the gaps between
// them, rather than a gap in the grid.
//
// #180 CHANGED WHAT THIS TEST EXPECTS, and the change is a cost worth naming.
// The roll-up used to multiply N by the interval, so a replay came out exact by
// construction. It now sums the gaps the instants leave, and the last instant
// has no successor — the recovery is NOT written as a row, because a backfilled
// row may never claim the site was up (ADR 0038). So a replayed outage is one
// step short: four gaps for five instants.
//
// That is an understatement and it is the direction this repository prefers, but
// it is not free. Making it exact again would mean writing the recovery as an
// observation of its own, which reopens ADR 0038 rather than settling #180, and
// is deliberately not done here.
func TestReplayedInstantsBecomeAnOutageDay(t *testing.T) {
	q := loaded(t, "day-one")
	id := selfID(t, q)

	const n = 5
	step := time.Duration(fixtureProbeInterval) * time.Second

	// Yesterday, so the whole outage lands inside one day whatever time the
	// test runs at.
	from := time.Now().AddDate(0, 0, -1).UTC().Truncate(24 * time.Hour).Add(9 * time.Hour)

	if _, err := q.BackfillOpsChecks(context.Background(), store.BackfillOpsChecksParams{
		SystemID:   id,
		Reason:     ptr("connect refused"),
		SourceRef:  ptr(opsDataCommit),
		ObservedAt: instants(from, step, n),
	}); err != nil {
		t.Fatalf("BackfillOpsChecks: %v", err)
	}

	if rolled := rollUp(t, q, fixtureProbeInterval, fixtureOutageChecks); rolled == 0 {
		t.Fatal("the roll-up counted no days after a replay")
	}

	db := dbtest.App(t)
	day := from.Format("2006-01-02")

	var state string
	var downSec, total, upCount int
	if err := db.QueryRow(
		`SELECT state, down_sec, checks_total, checks_up FROM ops_days
		  WHERE system_id = $1 AND day = $2`, id, day,
	).Scan(&state, &downSec, &total, &upCount); err != nil {
		t.Fatalf("reading the day back: %v", err)
	}

	if state != "outage" {
		t.Errorf("the day is %q, want outage — %d failed checks is past the threshold of %d",
			state, n, fixtureOutageChecks)
	}
	if want := (n - 1) * fixtureProbeInterval; downSec != want {
		t.Errorf("down_sec is %d, want %d — %d instants leave %d closed gaps, and the "+
			"last one has no successor to be bounded by",
			downSec, want, n, n-1)
	}
	if total != n || upCount != 0 {
		t.Errorf("the day counted %d checks with %d up, want %d and 0", total, upCount, n)
	}
}
