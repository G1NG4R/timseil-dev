//go:build db

// The acceptance criterion of phase B4, and the broken cases around it.
//
// These live beside the B2 and B3 database tests because they need the same
// three things: a real Postgres, a freshly migrated schema, and a connection as
// timseil_app. The connection helpers are in cycle_db_test.go. Moving them into
// a package of their own belongs to C1, which will want them a fourth time.
//
// Run with: make check-db
package migrations_test

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/G1NG4R/timseil-dev/api/internal/seed"
)

// seeded migrates, seeds as the app role, and hands back the app connection.
// Every test here starts from exactly this state.
func seeded(t *testing.T) (*sql.DB, seed.Counts) {
	t.Helper()
	freshSchema(t)

	db := appDB(t)
	counts, err := seed.Apply(context.Background(), db)
	if err != nil {
		t.Fatalf("seeding: %v", err)
	}
	return db, counts
}

func scalar(t *testing.T, db *sql.DB, query string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow(query, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	return n
}

// TestSeedIsTheAcceptanceCriterion is the phase's stated criterion, counted
// rather than claimed: 13 applied, 9 queued, no core, and one system behind
// every piece of evidence.
//
// The build plan and the handbook say "9 learning" here. They are older than the
// derivation. `learning` means an in_build system exists, and on launch day none
// does — vat-check is `queued`, timseil.dev is `live`. A track with no evidence
// at all is `queued`, because "I am learning this" with nothing to point at is
// self-assessment, and invariant 2 exists to keep self-assessment out of the
// log. ADR 0003 carries the reasoning; the four documents that say otherwise are
// corrected in K1.
func TestSeedIsTheAcceptanceCriterion(t *testing.T) {
	db, counts := seeded(t)

	if counts != seed.Expected {
		t.Errorf("seed wrote %s, want %s", counts, seed.Expected)
	}

	states := map[string]int{}
	rows, err := db.Query(`SELECT state, count(*) FROM v_track_states GROUP BY state`)
	if err != nil {
		t.Fatalf("reading the derivation: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var state string
		var n int
		if err := rows.Scan(&state, &n); err != nil {
			t.Fatalf("scanning: %v", err)
		}
		states[state] = n
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("reading the derivation: %v", err)
	}

	want := map[string]int{"applied": 13, "queued": 9}
	for state, n := range want {
		if states[state] != n {
			t.Errorf("%s: got %d tracks, want %d", state, states[state], n)
		}
	}
	// Zero core is the whole point of the launch-day log: something built once is
	// something run once. Two live systems is a different claim.
	for _, state := range []string{"core", "learning"} {
		if n := states[state]; n != 0 {
			t.Errorf("%s: got %d tracks, want 0 on launch day", state, n)
		}
	}

	// The log header: EVIDENCE: 01 SYSTEM. One, and it says one.
	if n := scalar(t, db, `SELECT count(DISTINCT system_id) FROM track_evidence`); n != 1 {
		t.Errorf("evidence systems: got %d, want 1", n)
	}
}

// TestSeedWritesNoMeasurements is the invariant this phase is most likely to
// break later, because filling the grid is tempting and the schema allows it.
//
// timseil.dev is `live` from the first seed and every metric tile still reads
// `— NO DATA`, because on day one nothing has been measured. A seeded ops_day or
// a seeded metric_snapshot would be a number no system produced — invariant 1 —
// and a seeded `ok` day would be invariant 6 as well.
func TestSeedWritesNoMeasurements(t *testing.T) {
	db, _ := seeded(t)

	for _, table := range []string{
		"ops_checks", "ops_days", "incidents", "deploys", "metric_snapshots",
	} {
		if n := scalar(t, db, `SELECT count(*) FROM `+table); n != 0 {
			t.Errorf("%s has %d rows — the seed writes content, never measurements", table, n)
		}
	}
}

// The seed runs on every deploy, so running twice has to be the same as running
// once — including the identical text, not merely the identical counts.
func TestSeedIsIdempotent(t *testing.T) {
	db, first := seeded(t)
	before := dump(t, db)

	second, err := seed.Apply(context.Background(), db)
	if err != nil {
		t.Fatalf("seeding twice: %v", err)
	}
	if second != first {
		t.Errorf("second run wrote %s, first wrote %s", second, first)
	}
	if after := dump(t, db); after != before {
		t.Errorf("the second run changed the content:\n--- first\n%s\n--- second\n%s", before, after)
	}
}

// dump is the content as text, ordered, so two runs can be compared for real
// rather than by row count.
func dump(t *testing.T, db *sql.DB) string {
	t.Helper()
	var out string
	err := db.QueryRow(`
		SELECT string_agg(line, E'\n' ORDER BY line) FROM (
		    SELECT format('system %s %s %s %s %s', slug, system_no, state,
		                  source_access, array_to_string(stack, '+')) AS line
		      FROM systems
		    UNION ALL
		    SELECT format('module %s %s', module_no, title) FROM modules
		    UNION ALL
		    SELECT format('track %s %s %s', m.module_no, t.sort_order, t.name)
		      FROM tracks t JOIN modules m ON m.id = t.module_id
		    UNION ALL
		    SELECT format('evidence %s %s %s', t.name, s.slug, coalesce(e.detail, '-'))
		      FROM track_evidence e
		      JOIN tracks t ON t.id = e.track_id
		      JOIN systems s ON s.id = e.system_id
		) AS content`).Scan(&out)
	if err != nil {
		t.Fatalf("dumping the content: %v", err)
	}
	return out
}

// The training tree is replaced wholesale, so anything that is no longer
// declared has to disappear. Otherwise a track removed from seed.sql would keep
// being served, and the log would carry a claim no file makes any more.
func TestSeedIsAuthoritativeOverTheTrainingTree(t *testing.T) {
	db, _ := seeded(t)

	var moduleID, trackID, systemID int64
	if err := db.QueryRow(
		`INSERT INTO modules (module_no, title) VALUES ('09', 'Leftovers') RETURNING id`,
	).Scan(&moduleID); err != nil {
		t.Fatalf("inserting a stray module: %v", err)
	}
	if err := db.QueryRow(
		`INSERT INTO tracks (module_id, name, sort_order) VALUES ($1, 'Fortran', 1) RETURNING id`,
		moduleID,
	).Scan(&trackID); err != nil {
		t.Fatalf("inserting a stray track: %v", err)
	}
	if err := db.QueryRow(
		`SELECT id FROM systems WHERE slug = 'timseil-dev'`,
	).Scan(&systemID); err != nil {
		t.Fatalf("reading the system: %v", err)
	}
	if _, err := db.Exec(
		`INSERT INTO track_evidence (track_id, system_id, detail) VALUES ($1, $2, 'made up')`,
		trackID, systemID,
	); err != nil {
		t.Fatalf("inserting stray evidence: %v", err)
	}

	if _, err := seed.Apply(context.Background(), db); err != nil {
		t.Fatalf("re-seeding over stray rows: %v", err)
	}

	for what, query := range map[string]string{
		"module":   `SELECT count(*) FROM modules WHERE module_no = '09'`,
		"track":    `SELECT count(*) FROM tracks WHERE name = 'Fortran'`,
		"evidence": `SELECT count(*) FROM track_evidence WHERE detail = 'made up'`,
	} {
		if n := scalar(t, db, query); n != 0 {
			t.Errorf("the stray %s survived the seed", what)
		}
	}
}

// systems are upserted, never replaced, because ops_checks and friends point at
// their ids with ON DELETE RESTRICT. The consequence is that a system nobody
// declares can sit there — and it would render an empty stack list, which reads
// like a decision instead of the oversight it is. So the seed refuses.
func TestSeedRefusesASystemNothingDeclares(t *testing.T) {
	db, _ := seeded(t)

	if _, err := db.Exec(`
		INSERT INTO systems (slug, system_no, name, state, source_access, source_reason)
		VALUES ('ghost', '09', 'Ghost', 'queued', 'private', 'internal')`); err != nil {
		t.Fatalf("inserting an undeclared system: %v", err)
	}

	_, err := seed.Apply(context.Background(), db)
	if err == nil {
		t.Fatal("the seed accepted a system with an empty stack")
	}
	if !strings.Contains(err.Error(), "ghost") {
		t.Errorf("error %q does not name the system", err)
	}
}

// The guard that matters most, held to its broken case: seed.sql inserts its
// evidence through a join on track names, so a rename on one side only drops a
// row in silence and a track turns from APPLIED to QUEUED on the live page.
//
// Forcing the count to disagree proves two things at once — that the mismatch is
// caught, and that the transaction rolls back rather than leaving half a log.
func TestSeedRefusesToCommitAWrongCount(t *testing.T) {
	freshSchema(t)
	db := appDB(t)

	original := seed.Expected
	t.Cleanup(func() { seed.Expected = original })
	seed.Expected = seed.Counts{Systems: 2, Modules: 5, Tracks: 22, Evidence: 12}

	if _, err := seed.Apply(context.Background(), db); err == nil {
		t.Fatal("the seed committed a count it did not expect")
	}
	for _, table := range []string{"systems", "modules", "tracks", "track_evidence"} {
		if n := scalar(t, db, `SELECT count(*) FROM `+table); n != 0 {
			t.Errorf("%s has %d rows — the failed seed did not roll back", table, n)
		}
	}
}

// No version number is typed into seed.sql. Whatever `make gen` resolved out of
// go.mod, package.json and compose.dev.yaml is what the page shows, and a stale
// stack.gen.json shows up right here.
func TestSeedStackComesFromTheManifest(t *testing.T) {
	db, _ := seeded(t)

	bundle, err := seed.Stack()
	if err != nil {
		t.Fatalf("reading the manifest: %v", err)
	}
	if len(bundle.Systems) != seed.Expected.Systems {
		t.Fatalf("the manifest covers %d systems, the seed declares %d",
			len(bundle.Systems), seed.Expected.Systems)
	}

	for slug, entries := range bundle.Systems {
		var got string
		if err := db.QueryRow(
			`SELECT array_to_string(stack, '+') FROM systems WHERE slug = $1`, slug,
		).Scan(&got); err != nil {
			t.Fatalf("reading the stack of %s: %v", slug, err)
		}
		if want := strings.Join(entries, "+"); got != want {
			t.Errorf("%s stack: got %q, want %q", slug, got, want)
		}
	}
}

// The claim of ADR 0013, proven rather than stated: everything above ran as
// timseil_app, and that role cannot create, alter or drop anything. If the seed
// ever needs DDL, this is the test that will say so.
func TestSeedNeedsNoSchemaPrivileges(t *testing.T) {
	freshSchema(t)
	db := appDB(t)

	if _, err := seed.Apply(context.Background(), db); err != nil {
		t.Fatalf("the seed needed more than DML: %v", err)
	}
	mustReject(t, db, "DDL from the seed's own role", `CREATE TABLE seed_probe (id int)`)
}
