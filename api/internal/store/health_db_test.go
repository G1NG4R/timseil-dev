//go:build db

// The health queries against a real server.
//
// The handler tests next door run against a stub, which proves what the Go code
// does with an answer. This file proves the answers: that the counts are right
// on a seeded database, that "nothing measured yet" arrives as pgx.ErrNoRows
// rather than as a row of zeros, and that invariant 3 is enforced by the query
// itself rather than by the caller remembering.
//
// Run with: make check-db
package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/G1NG4R/timseil-dev/api/internal/dbtest"
	"github.com/G1NG4R/timseil-dev/api/internal/seed"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

const selfSlug = "timseil-dev"

// seeded brings the schema up, writes the curated content, and hands back a pgx
// pool on the app role — the role the API actually runs as, so a privilege the
// queries need but do not have shows up here rather than in production.
func seeded(t *testing.T) *store.Queries {
	t.Helper()

	dbtest.FreshSchema(t)

	sqlDB := dbtest.App(t)
	if _, err := seed.Apply(context.Background(), sqlDB); err != nil {
		t.Fatalf("seeding: %v", err)
	}

	pool, err := pgxpool.New(context.Background(), dbtest.DSN(t, dbtest.EnvAppURL))
	if err != nil {
		t.Fatalf("opening a pool: %v", err)
	}
	t.Cleanup(pool.Close)

	return store.New(pool)
}

func TestTheCountsMatchTheSeed(t *testing.T) {
	q := seeded(t)

	counts, err := q.HealthCounts(context.Background())
	if err != nil {
		t.Fatalf("HealthCounts: %v", err)
	}

	// B4's acceptance criterion: exactly two systems, one of them live.
	if counts.SystemsLive != 1 || counts.SystemsTotal != 2 {
		t.Errorf("counts = %d live of %d, want 1 of 2", counts.SystemsLive, counts.SystemsTotal)
	}
}

func TestTheSelfSystemIsLive(t *testing.T) {
	q := seeded(t)

	state, err := q.SelfState(context.Background(), selfSlug)
	if err != nil {
		t.Fatalf("SelfState(%q): %v", selfSlug, err)
	}
	if state != "live" {
		t.Errorf("state = %q, want live", state)
	}
}

// The shape "there is no such system" has to be pgx.ErrNoRows, because that is
// what the handler branches on to answer degraded instead of failing.
func TestAnUnknownSlugIsErrNoRows(t *testing.T) {
	q := seeded(t)

	_, err := q.SelfState(context.Background(), "no-such-system")
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("SelfState of an unknown slug = %v, want pgx.ErrNoRows", err)
	}
}

// Day one, and the whole argument of the site in one assertion: the seed writes
// content, never measurements, so there is nothing to report and the query says
// so by returning no row. A row of zeros here would be an invented measurement.
func TestNothingIsMeasuredOnDayOne(t *testing.T) {
	q := seeded(t)

	if _, err := q.LatestMetrics(context.Background(), selfSlug); !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("LatestMetrics on a fresh database = %v, want pgx.ErrNoRows", err)
	}
	if _, err := q.LastDeploy(context.Background(), selfSlug); !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("LastDeploy on a fresh database = %v, want pgx.ErrNoRows", err)
	}
}

// The counts survive an empty database too: count() over no rows is zero, not
// no row, and /api/health has to answer on a database that has never been
// seeded rather than fail on it.
func TestTheCountsAnswerOnAnEmptyDatabase(t *testing.T) {
	dbtest.FreshSchema(t)

	pool, err := pgxpool.New(context.Background(), dbtest.DSN(t, dbtest.EnvAppURL))
	if err != nil {
		t.Fatalf("opening a pool: %v", err)
	}
	t.Cleanup(pool.Close)

	counts, err := store.New(pool).HealthCounts(context.Background())
	if err != nil {
		t.Fatalf("HealthCounts on an empty database: %v", err)
	}
	if counts.SystemsLive != 0 || counts.SystemsTotal != 0 {
		t.Errorf("counts = %d / %d, want 0 / 0", counts.SystemsLive, counts.SystemsTotal)
	}
}

// Invariant 3 lives in the WHERE clause, and this is what proves it. A
// measurement is written for a system that is not live; the query must refuse
// to hand it back, so that a system leaving 'live' empties its own metrics
// without anybody in Go remembering to.
func TestMetricsAreRefusedForASystemThatIsNotLive(t *testing.T) {
	q := seeded(t)
	ctx := context.Background()

	sqlDB := dbtest.App(t)
	_, err := sqlDB.Exec(`
		INSERT INTO metric_snapshots (system_id, measured_at, uptime_90d, p95_ms, error_rate)
		SELECT id, now(), 99.9, 120, 0.001 FROM systems WHERE slug = 'vat-check'`)
	if err != nil {
		t.Fatalf("writing a measurement for the queued system: %v", err)
	}

	// vat-check is seeded as queued, so its measurement must not be readable.
	if _, err := q.LatestMetrics(ctx, "vat-check"); !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("LatestMetrics returned numbers for a system that is not live: %v", err)
	}
}
