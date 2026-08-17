//go:build db

// The systems queries against a real server.
//
// The handler tests in internal/systems run against a stub and prove what the Go
// code does with an answer. This file proves the answers, and three of them are
// invariants rather than behaviour: metrics are unreadable for a system that is
// not live (3), a day nobody measured comes back as nodata rather than missing
// or ok (6), and the window has exactly as many cells as it claims (7).
//
// Run with: make check-db
package store_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/G1NG4R/timseil-dev/api/internal/dbtest"
	"github.com/G1NG4R/timseil-dev/api/internal/fixtures"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

const (
	liveSlug   = "timseil-dev"
	queuedSlug = "vat-check"
)

// loaded brings the schema up, builds one of the four fixture sets, and hands
// back a pgx pool on the app role — the role the API actually runs as, so a
// privilege these queries need but do not have shows up here and not in
// production.
func loaded(t *testing.T, set string) *store.Queries {
	t.Helper()

	dbtest.FreshSchema(t)

	sqlDB := dbtest.App(t)
	if err := fixtures.Load(context.Background(), sqlDB, set); err != nil {
		t.Fatalf("loading fixture %s: %v", set, err)
	}

	pool, err := pgxpool.New(context.Background(), dbtest.DSN(t, dbtest.EnvAppURL))
	if err != nil {
		t.Fatalf("opening a pool: %v", err)
	}
	t.Cleanup(pool.Close)

	return store.New(pool)
}

// systemID looks up the surrogate key the three ops queries take. The endpoint
// gets it from GetSystemBySlug; a test that hard-coded 1 would pass for the
// wrong system the day the seed order changes.
func systemID(t *testing.T, q *store.Queries, slug string) int64 {
	t.Helper()

	row, err := q.GetSystemBySlug(context.Background(), slug)
	if err != nil {
		t.Fatalf("GetSystemBySlug(%q): %v", slug, err)
	}
	return row.ID
}

// ---------------------------------------------------------------- the list

// The order is the contract's, not the insert order: systems are listed by their
// display number, so 01 comes before 02 whatever the seed did.
func TestListSystemsIsOrderedByNumber(t *testing.T) {
	q := loaded(t, fixtures.TwoSystems)

	rows, err := q.ListSystems(context.Background())
	if err != nil {
		t.Fatalf("ListSystems: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("got %d systems, want the two the seed writes", len(rows))
	}
	if rows[0].Slug != queuedSlug || rows[1].Slug != liveSlug {
		t.Errorf("order = %q, %q — want %q (01) before %q (02)",
			rows[0].Slug, rows[1].Slug, queuedSlug, liveSlug)
	}
}

// Day one on a seeded database: content exists, measurements do not. Every
// metric of every system is nil, including the live one — the seed writes no
// measurement at all, and a row of zeros here would be an invented one.
func TestNothingIsMeasuredOnASeededDatabase(t *testing.T) {
	q := loaded(t, fixtures.TwoSystems)

	rows, err := q.ListSystems(context.Background())
	if err != nil {
		t.Fatalf("ListSystems: %v", err)
	}
	for _, row := range rows {
		if row.Uptime90d != nil || row.P95Ms != nil || row.ErrorRate != nil {
			t.Errorf("%s carries numbers on a database with no measurements: %v %v %v",
				row.Slug, row.Uptime90d, row.P95Ms, row.ErrorRate)
		}
		if row.MeasuredAt.Valid {
			t.Errorf("%s carries a measurement time with no measurement", row.Slug)
		}
	}
}

// Invariant 3, and the broken case that proves the WHERE clause carries it: a
// measurement is written for a system that is not live, and the list must still
// refuse to hand it back. Without `AND s.state = 'live'` inside the lateral this
// test goes red and every other one in the file stays green.
func TestTheListRefusesMetricsForASystemThatIsNotLive(t *testing.T) {
	q := loaded(t, fixtures.TwoSystems)

	sqlDB := dbtest.App(t)
	_, err := sqlDB.Exec(`
		INSERT INTO metric_snapshots (system_id, measured_at, uptime_90d, p95_ms, error_rate)
		SELECT id, now(), 99.9, 120, 0.001 FROM systems WHERE slug = 'vat-check'`)
	if err != nil {
		t.Fatalf("writing a measurement for the queued system: %v", err)
	}

	rows, err := q.ListSystems(context.Background())
	if err != nil {
		t.Fatalf("ListSystems: %v", err)
	}
	for _, row := range rows {
		if row.Slug != queuedSlug {
			continue
		}
		if row.Uptime90d != nil || row.P95Ms != nil || row.ErrorRate != nil || row.MeasuredAt.Valid {
			t.Errorf("the list returned a measurement for a queued system: %v %v %v",
				row.Uptime90d, row.P95Ms, row.ErrorRate)
		}
	}
}

// The lateral takes the newest snapshot, not an arbitrary one. Two measurements
// an hour apart, and the later one has to win — otherwise the site would show a
// number that was true once.
func TestTheListTakesTheLatestMeasurement(t *testing.T) {
	q := loaded(t, fixtures.TwoSystems)

	sqlDB := dbtest.App(t)
	_, err := sqlDB.Exec(`
		INSERT INTO metric_snapshots (system_id, measured_at, uptime_90d, p95_ms, error_rate)
		SELECT id, now() - interval '1 hour', 98.0, 300, 0.02 FROM systems WHERE slug = 'timseil-dev'
		UNION ALL
		SELECT id, now(),                     99.6, 142, 0.0007 FROM systems WHERE slug = 'timseil-dev'`)
	if err != nil {
		t.Fatalf("writing two measurements: %v", err)
	}

	rows, err := q.ListSystems(context.Background())
	if err != nil {
		t.Fatalf("ListSystems: %v", err)
	}
	for _, row := range rows {
		if row.Slug != liveSlug {
			continue
		}
		if row.P95Ms == nil || *row.P95Ms != 142 {
			t.Errorf("p95 = %v, want the later measurement, 142", row.P95Ms)
		}
	}
}

// An empty database is an answer, not a failure. The list is the one endpoint
// that has to work before the seed has ever run.
func TestTheListIsEmptyOnAnEmptyDatabase(t *testing.T) {
	q := loaded(t, fixtures.Empty)

	rows, err := q.ListSystems(context.Background())
	if err != nil {
		t.Fatalf("ListSystems on an empty database: %v", err)
	}
	if len(rows) != 0 {
		t.Errorf("got %d systems on an empty database, want none", len(rows))
	}
}

// -------------------------------------------------------------- the detail

// "No such system" has to be pgx.ErrNoRows, because that is the shape the
// handler turns into a 404. Anything else and an unknown slug becomes a 500.
func TestAnUnknownSlugHasNoSystemRow(t *testing.T) {
	q := loaded(t, fixtures.TwoSystems)

	if _, err := q.GetSystemBySlug(context.Background(), "no-such-system"); !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("GetSystemBySlug of an unknown slug = %v, want pgx.ErrNoRows", err)
	}
}

// The source axis arrives as the schema stores it: exactly one of the two fields
// set. The handler builds the contract's oneOf from this, and a row with both or
// neither would leave it with nothing honest to send.
func TestTheSourceAxisIsEitherOr(t *testing.T) {
	q := loaded(t, fixtures.TwoSystems)
	ctx := context.Background()

	open, err := q.GetSystemBySlug(ctx, liveSlug)
	if err != nil {
		t.Fatalf("GetSystemBySlug(%q): %v", liveSlug, err)
	}
	if open.SourceAccess != "public" || open.SourceUrl == nil || open.SourceReason != nil {
		t.Errorf("%s = %s / url %v / reason %v, want public with a url and no reason",
			liveSlug, open.SourceAccess, open.SourceUrl, open.SourceReason)
	}

	closed, err := q.GetSystemBySlug(ctx, queuedSlug)
	if err != nil {
		t.Fatalf("GetSystemBySlug(%q): %v", queuedSlug, err)
	}
	if closed.SourceAccess != "private" || closed.SourceReason == nil || closed.SourceUrl != nil {
		t.Errorf("%s = %s / url %v / reason %v, want private with a reason and no url",
			queuedSlug, closed.SourceAccess, closed.SourceUrl, closed.SourceReason)
	}
}

// ----------------------------------------------------------------- the grid

// Invariant 7: the window is 91 days, and the number has to stay countable. The
// query is asked for 91 cells and returns 91, in ascending order, oldest first.
func TestTheGridHasExactlyAsManyCellsAsTheWindow(t *testing.T) {
	q := loaded(t, fixtures.DayOne)
	ctx := context.Background()
	id := systemID(t, q, liveSlug)

	for _, span := range []int32{30, 91, 182} {
		rows, err := q.OpsDaysForSystem(ctx, store.OpsDaysForSystemParams{
			SystemID: id, WindowSize: span,
		})
		if err != nil {
			t.Fatalf("OpsDaysForSystem(%d): %v", span, err)
		}
		if len(rows) != int(span) {
			t.Errorf("window %d returned %d cells", span, len(rows))
			continue
		}
		for i := 1; i < len(rows); i++ {
			if !rows[i-1].Day.Time.Before(rows[i].Day.Time) {
				t.Errorf("window %d is not ascending at cell %d", span, i)
				break
			}
		}
	}
}

// Day one: the grid exists and says nothing, which is the honest answer before
// the first probe has run. 91 cells, every one nodata, no downtime.
func TestDayOneIsEntirelyNodata(t *testing.T) {
	q := loaded(t, fixtures.DayOne)
	id := systemID(t, q, liveSlug)

	rows, err := q.OpsDaysForSystem(context.Background(), store.OpsDaysForSystemParams{
		SystemID: id, WindowSize: 91,
	})
	if err != nil {
		t.Fatalf("OpsDaysForSystem: %v", err)
	}
	for _, row := range rows {
		if row.State != "nodata" || row.DownSec != 0 {
			t.Fatalf("%s = %s / %ds, want nodata / 0s on day one",
				row.Day.Time.Format(time.DateOnly), row.State, row.DownSec)
		}
	}
}

// Invariant 6, and the broken case for it: a row is deleted from ops_days, and
// the cell has to come back as nodata rather than disappear from the grid or
// inherit the state of a neighbour. This is the reason the window is generated
// in SQL instead of read from the table.
func TestADeletedDayIsNodataAndNotMissing(t *testing.T) {
	q := loaded(t, fixtures.Incident)
	ctx := context.Background()
	id := systemID(t, q, liveSlug)

	sqlDB := dbtest.App(t)
	var gone time.Time
	err := sqlDB.QueryRow(`
		DELETE FROM ops_days
		 WHERE system_id = $1 AND state = 'ok'
		   AND day = (SELECT max(day) FROM ops_days WHERE system_id = $1 AND state = 'ok')
		RETURNING day`, id).Scan(&gone)
	if err != nil {
		t.Fatalf("deleting a measured day: %v", err)
	}

	rows, err := q.OpsDaysForSystem(ctx, store.OpsDaysForSystemParams{SystemID: id, WindowSize: 91})
	if err != nil {
		t.Fatalf("OpsDaysForSystem: %v", err)
	}
	if len(rows) != 91 {
		t.Fatalf("the grid lost a cell with the row: %d of 91", len(rows))
	}

	var found bool
	for _, row := range rows {
		if !row.Day.Time.Equal(gone) {
			continue
		}
		found = true
		if row.State != "nodata" {
			t.Errorf("the deleted day reads %q, want nodata", row.State)
		}
		if row.DownSec != 0 {
			t.Errorf("the deleted day reports %ds of downtime", row.DownSec)
		}
	}
	if !found {
		t.Errorf("the deleted day %s is missing from the grid entirely",
			gone.Format(time.DateOnly))
	}
}

// All four day states in one window, and the notch attached to the right cell.
// The fixture measures thirty days, so the sixty-one before them stay nodata —
// which is what a grid looks like on a system that has not been watched forever.
func TestTheGridCarriesEveryDayStateAndItsNotch(t *testing.T) {
	q := loaded(t, fixtures.Incident)
	id := systemID(t, q, liveSlug)

	rows, err := q.OpsDaysForSystem(context.Background(), store.OpsDaysForSystemParams{
		SystemID: id, WindowSize: 91,
	})
	if err != nil {
		t.Fatalf("OpsDaysForSystem: %v", err)
	}

	seen := map[string]int{}
	notches := 0
	for _, row := range rows {
		seen[row.State]++
		if row.IncidentID != nil {
			notches++
			if *row.IncidentID != "INC-001" {
				t.Errorf("notch = %q, want INC-001", *row.IncidentID)
			}
			if row.State != "outage" {
				t.Errorf("the notch sits on a %s day, want outage", row.State)
			}
		}
	}

	for _, state := range []string{"ok", "degraded", "outage", "nodata"} {
		if seen[state] == 0 {
			t.Errorf("no %s day in the window: %v", state, seen)
		}
	}
	if notches != 1 {
		t.Errorf("%d notches, want exactly the one the fixture writes", notches)
	}
	// The degraded day deliberately has no incident: a bad day is not
	// automatically a notch, and invariant 4 hangs on incidents, not on colour.
	if seen["degraded"] != 1 {
		t.Errorf("%d degraded days, want the one without a post-mortem", seen["degraded"])
	}
}

// ------------------------------------------------- incidents and deploys

// Both arrays are bounded by the same window as the grid, so a reader who counts
// the cells and a reader who counts the notches arrive at the same period. The
// fixture's outage is fifteen days back: a 30-day window contains it, a 7-day
// window does not.
//
// 7 is not one of the contract's three windows on purpose — the enum is the
// handler's business, and this query has to be right for any span it is handed.
func TestIncidentsAndDeploysStayInsideTheWindow(t *testing.T) {
	q := loaded(t, fixtures.Incident)
	ctx := context.Background()
	id := systemID(t, q, liveSlug)

	inside, err := q.IncidentsForSystem(ctx, store.IncidentsForSystemParams{SystemID: id, WindowSize: 30})
	if err != nil {
		t.Fatalf("IncidentsForSystem(30): %v", err)
	}
	if len(inside) != 1 || inside[0].ID != "INC-001" {
		t.Fatalf("30-day window returned %d incidents, want INC-001", len(inside))
	}
	// Invariant 4 is a schema rule, and this is what it buys the reader: no
	// notch can reach the API without its explanation.
	if inside[0].Cause == "" || inside[0].Fix == "" || inside[0].PostSlug == "" {
		t.Errorf("INC-001 arrived without cause, fix or post slug: %+v", inside[0])
	}

	outside, err := q.IncidentsForSystem(ctx, store.IncidentsForSystemParams{SystemID: id, WindowSize: 7})
	if err != nil {
		t.Fatalf("IncidentsForSystem(7): %v", err)
	}
	if len(outside) != 0 {
		t.Errorf("a 7-day window returned an incident from 15 days ago")
	}

	deploys, err := q.DeploysForSystem(ctx, store.DeploysForSystemParams{SystemID: id, WindowSize: 30})
	if err != nil {
		t.Fatalf("DeploysForSystem(30): %v", err)
	}
	if len(deploys) != 2 {
		t.Fatalf("got %d deploys, want the two the fixture writes", len(deploys))
	}
	// Newest first: the rollback ended the outage, so it is the later of the two.
	if deploys[0].Sha != "b7d0e15" || deploys[0].Result != "rollback" {
		t.Errorf("first deploy = %s / %s, want b7d0e15 / rollback", deploys[0].Sha, deploys[0].Result)
	}
	if deploys[1].Sha != "a41f9c2" || deploys[1].Result != "ok" {
		t.Errorf("second deploy = %s / %s, want a41f9c2 / ok", deploys[1].Sha, deploys[1].Result)
	}

	none, err := q.DeploysForSystem(ctx, store.DeploysForSystemParams{SystemID: id, WindowSize: 7})
	if err != nil {
		t.Fatalf("DeploysForSystem(7): %v", err)
	}
	if len(none) != 0 {
		t.Errorf("a 7-day window returned a deploy from 15 days ago")
	}
}

// A system with no operational history at all answers with an empty grid rather
// than an error — and the grid is still the full window, all of it nodata.
// vat-check is queued, so day-one.sql never gave it a single cell.
func TestASystemWithNoHistoryStillGetsAFullGrid(t *testing.T) {
	q := loaded(t, fixtures.Incident)
	ctx := context.Background()
	id := systemID(t, q, queuedSlug)

	rows, err := q.OpsDaysForSystem(ctx, store.OpsDaysForSystemParams{SystemID: id, WindowSize: 91})
	if err != nil {
		t.Fatalf("OpsDaysForSystem: %v", err)
	}
	if len(rows) != 91 {
		t.Fatalf("got %d cells for a system with no history, want 91", len(rows))
	}
	for _, row := range rows {
		if row.State != "nodata" {
			t.Fatalf("a system that was never probed reports %q", row.State)
		}
	}

	incidents, err := q.IncidentsForSystem(ctx, store.IncidentsForSystemParams{SystemID: id, WindowSize: 91})
	if err != nil {
		t.Fatalf("IncidentsForSystem: %v", err)
	}
	if len(incidents) != 0 {
		t.Errorf("got %d incidents for a system that never ran", len(incidents))
	}
}
