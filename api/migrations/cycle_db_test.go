//go:build db

// The acceptance criterion of phase B2, measured rather than claimed.
//
// Behind a build tag, not an env guard with t.Skip. With the tag these tests do
// not appear in `go test ./...` at all, so there is no skipped line that could
// be mistaken for a passing one; inside the tagged package a missing DSN is a
// fatal error, not a skip. A plain env guard goes green the day somebody
// forgets to set the variable in CI — which is the `gofmt -l` bug from A4
// wearing a different hat.
//
// Run with: make check-db
package migrations_test

import (
	"database/sql"
	"testing"

	"github.com/G1NG4R/timseil-dev/api/internal/dbtest"
)

// TestUpDownUpThreeTimes is the phase's stated acceptance criterion, word for
// word: "up -> down -> up runs cleanly three times".
//
// It is not enough that the statements succeed. A migration can be reversible
// on the first pass and leave something behind on the second — a constraint
// that was never dropped, a privilege that accumulated — and the schema would
// then drift silently with every deploy. So the shape of the schema is captured
// after each pass and the third has to equal the first.
func TestUpDownUpThreeTimes(t *testing.T) {
	db := dbtest.Migrate(t)
	dbtest.DownToZero(t, db)

	var shapes []string
	for pass := 1; pass <= 3; pass++ {
		dbtest.Up(t, db)
		shapes = append(shapes, schemaShape(t, db))
		dbtest.DownToZero(t, db)

		// goose keeps its own bookkeeping table, so "empty" means "nothing but
		// goose_db_version".
		if left := leftoverTables(t, db); len(left) > 0 {
			t.Fatalf("pass %d left tables behind after down: %v", pass, left)
		}
	}

	if shapes[0] != shapes[2] {
		t.Errorf("the schema drifted between the first and the third pass:\nfirst:\n%s\nthird:\n%s",
			shapes[0], shapes[2])
	}
	if shapes[0] != shapes[1] {
		t.Errorf("the schema drifted between the first and the second pass")
	}
}

// schemaShape renders every column, constraint, index and view definition into
// one sorted string so two passes can be compared as text.
func schemaShape(t *testing.T, db *sql.DB) string {
	t.Helper()

	const q = `
WITH cols AS (
    SELECT format('column %s.%s %s null=%s default=%s',
                  table_name, column_name, data_type, is_nullable,
                  coalesce(column_default, '-')) AS line
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name <> 'goose_db_version'
), cons AS (
    SELECT format('constraint %s %s', conname, pg_get_constraintdef(oid)) AS line
      FROM pg_constraint
     WHERE connamespace = 'public'::regnamespace
), idx AS (
    SELECT format('index %s', indexdef) AS line
      FROM pg_indexes
     WHERE schemaname = 'public' AND tablename <> 'goose_db_version'
), views AS (
    -- The definition, not just the columns. information_schema.columns lists a
    -- view's columns like any other, so without this line a rewritten CASE with
    -- unchanged column names would pass three cycles unnoticed — and the whole
    -- point of v_track_states is what that CASE says (ADR 0003).
    SELECT format('view %s %s', viewname,
                  pg_get_viewdef(format('%I.%I', schemaname, viewname)::regclass)) AS line
      FROM pg_views
     WHERE schemaname = 'public'
)
SELECT string_agg(line, E'\n' ORDER BY line)
  FROM (SELECT line FROM cols UNION ALL SELECT line FROM cons
        UNION ALL SELECT line FROM idx UNION ALL SELECT line FROM views) all_lines`

	var shape sql.NullString
	if err := db.QueryRow(q).Scan(&shape); err != nil {
		t.Fatalf("reading the schema shape: %v", err)
	}
	if !shape.Valid || shape.String == "" {
		t.Fatal("the schema shape came back empty — did the migrations apply at all?")
	}
	return shape.String
}

func leftoverTables(t *testing.T, db *sql.DB) []string {
	t.Helper()

	rows, err := db.Query(`
		SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_name <> 'goose_db_version'
		 ORDER BY table_name`)
	if err != nil {
		t.Fatalf("listing tables: %v", err)
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			t.Fatalf("scanning table name: %v", err)
		}
		names = append(names, n)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("listing tables: %v", err)
	}
	return names
}
