//go:build db

package dbtest

import (
	"context"
	"database/sql"
	"os"
	"sync"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/G1NG4R/timseil-dev/api/migrations"
)

// The two test DSNs. Both point at the throwaway database, never at the
// development one: proving the schema must not cost you what you were looking
// at when you started.
const (
	EnvMigrateURL = "TEST_DATABASE_URL"
	EnvAppURL     = "TEST_APP_DATABASE_URL"
)

// dir is the migration directory as goose sees it. With SetBaseFS the path is
// relative to the embedded filesystem, not to the working directory — which is
// what lets a test in any package apply the same schema.
const dir = "."

// connectTimeout is generous because the database may still be starting when
// the first test connects, and stingy enough that a wrong host fails the run
// instead of hanging it.
const connectTimeout = 10 * time.Second

// configure runs once per process. goose keeps this state in package-level
// variables, so setting it from every helper would be a data race the moment
// two packages ran their tests in parallel.
var configure = sync.OnceFunc(func() {
	goose.SetBaseFS(migrations.FS)
	goose.SetSequential(true)
	goose.SetLogger(goose.NopLogger())
	if err := goose.SetDialect("postgres"); err != nil {
		panic("dbtest: " + err.Error())
	}
})

// DSN reads one of the two test DSNs. A missing variable is fatal, never a
// skip: whoever compiled with the `db` tag asked for a database, and the only
// way to be green here is to have one. A skip would go green on the day
// somebody forgets the variable in CI, which is the failure this whole
// arrangement exists to avoid.
func DSN(t *testing.T, envVar string) string {
	t.Helper()

	dsn := os.Getenv(envVar)
	if dsn == "" {
		t.Fatalf("%s is empty — these tests need a real Postgres, run make check-db", envVar)
	}
	return dsn
}

// Open connects with one of the two test DSNs and pings, because sql.Open does
// not dial and a connection that is never used is not a connection that works.
func Open(t *testing.T, envVar string) *sql.DB {
	t.Helper()

	db, err := sql.Open("pgx", DSN(t, envVar))
	if err != nil {
		t.Fatalf("open %s: %v", envVar, err)
	}
	t.Cleanup(func() { _ = db.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), connectTimeout)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		t.Fatalf("cannot reach the test database via %s: %v", envVar, err)
	}
	return db
}

// Migrate is the schema owner: the only role allowed to run DDL.
func Migrate(t *testing.T) *sql.DB { return Open(t, EnvMigrateURL) }

// App is what the API process gets. It may read and write rows and nothing
// more.
func App(t *testing.T) *sql.DB { return Open(t, EnvAppURL) }

// Up applies every migration.
func Up(t *testing.T, db *sql.DB) {
	t.Helper()
	configure()
	if err := goose.UpContext(context.Background(), db, dir); err != nil {
		t.Fatalf("applying the schema: %v", err)
	}
}

// DownToZero rolls the schema back to nothing.
func DownToZero(t *testing.T, db *sql.DB) {
	t.Helper()
	configure()
	if err := goose.DownToContext(context.Background(), db, dir, 0); err != nil {
		t.Fatalf("clearing the schema: %v", err)
	}
}

// FreshSchema leaves the database at the top of the migration list and tears it
// back down afterwards, so every test starts from the same place regardless of
// what the one before it did.
func FreshSchema(t *testing.T) *sql.DB {
	t.Helper()

	db := Migrate(t)
	DownToZero(t, db)
	Up(t, db)

	t.Cleanup(func() {
		if err := goose.DownToContext(context.Background(), db, dir, 0); err != nil {
			t.Errorf("tearing the schema down: %v", err)
		}
	})
	return db
}

// MustReject runs a statement the schema is supposed to refuse. It fails the
// test when the statement succeeds, which is the whole point: a test that
// inserts a valid row and sees it stored would pass just as happily with no
// constraint at all.
func MustReject(t *testing.T, db *sql.DB, what, stmt string, args ...any) {
	t.Helper()
	if _, err := db.Exec(stmt, args...); err == nil {
		t.Errorf("the database accepted %s — it must not", what)
	}
}

// MustAccept is the other half. Without it a constraint written too tightly
// would look like a success.
func MustAccept(t *testing.T, db *sql.DB, what, stmt string, args ...any) {
	t.Helper()
	if _, err := db.Exec(stmt, args...); err != nil {
		t.Errorf("the database refused %s: %v", what, err)
	}
}
