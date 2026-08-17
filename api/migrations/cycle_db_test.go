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
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/G1NG4R/timseil-dev/api/migrations"
)

const dir = "."

func TestMain(m *testing.M) {
	goose.SetBaseFS(migrations.FS)
	goose.SetSequential(true)
	goose.SetLogger(goose.NopLogger())
	if err := goose.SetDialect("postgres"); err != nil {
		panic(err)
	}
	os.Exit(m.Run())
}

// openAs connects with one of the two test DSNs. A missing variable is fatal:
// whoever set the build tag wants a database, and the only way to be green here
// is to have one.
func openAs(t *testing.T, envVar string) *sql.DB {
	t.Helper()

	dsn := os.Getenv(envVar)
	if dsn == "" {
		t.Fatalf("%s is empty — these tests need a real Postgres, run make check-db", envVar)
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("open %s: %v", envVar, err)
	}
	t.Cleanup(func() { _ = db.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		t.Fatalf("cannot reach the test database via %s: %v", envVar, err)
	}
	return db
}

// migrateDB is the schema owner: it is the only role allowed to run DDL.
func migrateDB(t *testing.T) *sql.DB { return openAs(t, "TEST_DATABASE_URL") }

// appDB is what the API process gets. It may read and write rows and nothing
// more.
func appDB(t *testing.T) *sql.DB { return openAs(t, "TEST_APP_DATABASE_URL") }

// freshSchema leaves the database at the top of the migration list and tears it
// back down afterwards, so every test starts from the same place regardless of
// what the one before it did.
func freshSchema(t *testing.T) *sql.DB {
	t.Helper()
	db := migrateDB(t)

	ctx := context.Background()
	if err := goose.DownToContext(ctx, db, dir, 0); err != nil {
		t.Fatalf("clearing the schema: %v", err)
	}
	if err := goose.UpContext(ctx, db, dir); err != nil {
		t.Fatalf("applying the schema: %v", err)
	}
	t.Cleanup(func() {
		if err := goose.DownToContext(context.Background(), db, dir, 0); err != nil {
			t.Errorf("tearing the schema down: %v", err)
		}
	})
	return db
}

// TestUpDownUpThreeTimes is the phase's stated acceptance criterion, word for
// word: "up -> down -> up runs cleanly three times".
//
// It is not enough that the statements succeed. A migration can be reversible
// on the first pass and leave something behind on the second — a constraint
// that was never dropped, a privilege that accumulated — and the schema would
// then drift silently with every deploy. So the shape of the schema is captured
// after each pass and the third has to equal the first.
func TestUpDownUpThreeTimes(t *testing.T) {
	db := migrateDB(t)
	ctx := context.Background()

	if err := goose.DownToContext(ctx, db, dir, 0); err != nil {
		t.Fatalf("starting from zero: %v", err)
	}

	var shapes []string
	for pass := 1; pass <= 3; pass++ {
		if err := goose.UpContext(ctx, db, dir); err != nil {
			t.Fatalf("pass %d, up: %v", pass, err)
		}
		shapes = append(shapes, schemaShape(t, db))

		if err := goose.DownToContext(ctx, db, dir, 0); err != nil {
			t.Fatalf("pass %d, down: %v", pass, err)
		}

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

// schemaShape renders every column, constraint and index into one sorted string
// so two passes can be compared as text.
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
)
SELECT string_agg(line, E'\n' ORDER BY line)
  FROM (SELECT line FROM cols UNION ALL SELECT line FROM cons UNION ALL SELECT line FROM idx) all_lines`

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
