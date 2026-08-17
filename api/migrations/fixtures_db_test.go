//go:build db

// The four fixture sets of phase B4, each held to what it claims to be.
//
// A fixture nobody checks is a fixture that quietly stops describing the state it
// is named after — and then every test built on it passes for the wrong reason.
// So: day-one is verified to be entirely nodata, and the incident set is verified
// to carry a post-mortem and a roll-up that agrees with its own raw data.
//
// Run with: make check-db
package migrations_test

import (
	"context"
	"database/sql"
	"testing"

	"github.com/G1NG4R/timseil-dev/api/internal/fixtures"
	"github.com/G1NG4R/timseil-dev/api/internal/seed"
)

// loaded migrates and builds the named set as the app role.
func loaded(t *testing.T, set string) *sql.DB {
	t.Helper()
	freshSchema(t)

	db := appDB(t)
	if err := fixtures.Load(context.Background(), db, set); err != nil {
		t.Fatalf("loading fixture %s: %v", set, err)
	}
	return db
}

// The empty state is a first-class state, not the absence of one: it is what the
// site shows before anything has been measured, and every metric has to read
// `— NO DATA` rather than 0.
func TestFixtureEmptyLeavesNothing(t *testing.T) {
	db := loaded(t, fixtures.Empty)

	for _, table := range []string{
		"systems", "modules", "tracks", "track_evidence",
		"ops_checks", "ops_days", "incidents", "deploys", "metric_snapshots",
		"contact_messages",
	} {
		if n := scalar(t, db, `SELECT count(*) FROM `+table); n != 0 {
			t.Errorf("%s has %d rows in the empty set", table, n)
		}
	}
}

// two-systems is the seed and nothing added, which is what makes it the golden
// case for C2: a system that is not live must have null in every metric field,
// and here there is no snapshot to read at all.
func TestFixtureTwoSystemsIsExactlyTheSeed(t *testing.T) {
	db := loaded(t, fixtures.TwoSystems)

	got := seed.Counts{
		Systems:  scalar(t, db, `SELECT count(*) FROM systems`),
		Modules:  scalar(t, db, `SELECT count(*) FROM modules`),
		Tracks:   scalar(t, db, `SELECT count(*) FROM tracks`),
		Evidence: scalar(t, db, `SELECT count(*) FROM track_evidence`),
	}
	if got != seed.Expected {
		t.Errorf("fixture holds %s, the seed declares %s", got, seed.Expected)
	}
	for _, table := range []string{"ops_checks", "ops_days", "incidents", "deploys", "metric_snapshots"} {
		if n := scalar(t, db, `SELECT count(*) FROM `+table); n != 0 {
			t.Errorf("%s has %d rows — two-systems is the seed, and the seed measures nothing", table, n)
		}
	}
	if n := scalar(t, db, `SELECT count(*) FROM systems WHERE state <> 'live'`); n != 1 {
		t.Errorf("got %d systems that are not live, want exactly 1 (vat-check)", n)
	}
}

// Launch day. The grid is there, it is 91 cells wide, and every cell is nodata.
// The failure this guards is the tempting one: filling a cell in with `ok`
// because an empty grid looks broken. It is not broken, it is honest — and an
// empty grid is the thing that makes the difference visible three months later.
func TestFixtureDayOneIsAllNodata(t *testing.T) {
	db := loaded(t, fixtures.DayOne)

	// 91, not 90: 13 × 7. The number has to stay countable.
	if n := scalar(t, db, `SELECT count(*) FROM ops_days`); n != 91 {
		t.Errorf("got %d days, want 91 (13 × 7)", n)
	}
	if n := scalar(t, db, `SELECT count(*) FROM ops_days WHERE state <> 'nodata'`); n != 0 {
		t.Errorf("%d cells are not nodata on day one", n)
	}
	if n := scalar(t, db,
		`SELECT count(*) FROM ops_days WHERE checks_total <> 0 OR checks_up <> 0 OR down_sec <> 0`); n != 0 {
		t.Errorf("%d cells carry a measurement they cannot have", n)
	}
	if n := scalar(t, db, `SELECT count(*) FROM ops_checks`); n != 0 {
		t.Errorf("got %d raw checks on day one, want 0", n)
	}

	// The grid belongs to the live system only. A queued system has no
	// operational record, and an empty grid for it would be a different claim
	// from no grid at all.
	if n := scalar(t, db,
		`SELECT count(DISTINCT d.system_id) FROM ops_days d
		   JOIN systems s ON s.id = d.system_id WHERE s.state = 'live'`); n != 1 {
		t.Errorf("got %d live systems with a grid, want 1", n)
	}
	if n := scalar(t, db,
		`SELECT count(*) FROM ops_days d JOIN systems s ON s.id = d.system_id
		  WHERE s.state <> 'live'`); n != 0 {
		t.Errorf("%d cells belong to a system that is not live", n)
	}
}

// The set that carries invariant 4 and invariant 5 at once.
func TestFixtureIncidentCarriesItsPostMortem(t *testing.T) {
	db := loaded(t, fixtures.Incident)

	// Every notch has its explanation. NOT NULL alone does not say this — an
	// empty string satisfies NOT NULL and would put a red cell on the grid with
	// nothing behind it, so the schema checks for text and so does this.
	if n := scalar(t, db, `
		SELECT count(*) FROM incidents
		 WHERE btrim(cause) = '' OR btrim(fix) = '' OR btrim(post_slug) = ''`); n != 0 {
		t.Errorf("%d incidents have a blank explanation", n)
	}
	if n := scalar(t, db, `SELECT count(*) FROM incidents`); n != 1 {
		t.Fatalf("got %d incidents, want 1", n)
	}

	// A day that carries a notch points at an incident that exists, and the only
	// day that does is the outage.
	if n := scalar(t, db,
		`SELECT count(*) FROM ops_days WHERE state = 'outage' AND incident_id IS NULL`); n != 0 {
		t.Errorf("%d outage days have no notch", n)
	}
	if n := scalar(t, db, `SELECT count(*) FROM ops_days WHERE incident_id IS NOT NULL`); n != 1 {
		t.Errorf("got %d days with a notch, want 1", n)
	}

	// All four day states in one database, which is what makes this set worth
	// having: 61 nodata before measurement started, then 28 ok, 1 degraded, 1
	// outage.
	want := map[string]int{"nodata": 61, "ok": 28, "degraded": 1, "outage": 1}
	for state, n := range want {
		got := scalar(t, db, `SELECT count(*) FROM ops_days WHERE state = $1`, state)
		if got != n {
			t.Errorf("%s: got %d days, want %d", state, got, n)
		}
	}

	// The roll-up agrees with the raw data it was computed from. Without this the
	// fixture could not tell a correct aggregation in C4 from a wrong one.
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
		    OR d.down_sec <> (c.total - c.up) * 1800`); n != 0 {
		t.Errorf("%d days disagree with the checks they were rolled up from", n)
	}

	// Invariant 5, and the reason track_evidence and the ops tables use RESTRICT
	// towards systems rather than CASCADE: a deleted system that leaves a notch
	// on the grid is exactly the dangling claim this construction prevents.
	mustReject(t, db, "deleting a system that a notch points at",
		`DELETE FROM systems WHERE slug = 'timseil-dev'`)

	if n := scalar(t, db, `SELECT count(*) FROM deploys WHERE result = 'rollback'`); n != 1 {
		t.Errorf("got %d rollbacks, want 1 — the deploy that ended the outage", n)
	}
}

// Every set starts from empty, so loading one after another leaves no trace of
// the one before. Otherwise the incident set would leak its outage into whatever
// test ran next and the failure would surface far from its cause.
func TestFixtureSetsDoNotLeakIntoEachOther(t *testing.T) {
	freshSchema(t)
	db := appDB(t)
	ctx := context.Background()

	if err := fixtures.Load(ctx, db, fixtures.Incident); err != nil {
		t.Fatalf("loading incident: %v", err)
	}
	if err := fixtures.Load(ctx, db, fixtures.DayOne); err != nil {
		t.Fatalf("loading day-one after incident: %v", err)
	}

	for what, query := range map[string]string{
		"incidents":     `SELECT count(*) FROM incidents`,
		"raw checks":    `SELECT count(*) FROM ops_checks`,
		"deploys":       `SELECT count(*) FROM deploys`,
		"measured days": `SELECT count(*) FROM ops_days WHERE state <> 'nodata'`,
	} {
		if n := scalar(t, db, query); n != 0 {
			t.Errorf("day-one still holds %d %s from the incident set", n, what)
		}
	}
	if n := scalar(t, db, `SELECT count(*) FROM ops_days`); n != 91 {
		t.Errorf("got %d days after reloading, want 91", n)
	}
}

func TestFixtureRefusesAnUnknownSet(t *testing.T) {
	freshSchema(t)
	db := appDB(t)

	if err := fixtures.Load(context.Background(), db, "day-two"); err == nil {
		t.Fatal("an unknown fixture set was accepted")
	}
}
