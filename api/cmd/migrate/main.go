// Command migrate applies the schema in api/migrations to Postgres.
//
// It exists as a binary rather than as `go tool goose` for three reasons. The
// goose CLI package pulls every driver it supports — mysql, clickhouse,
// vertica, ydb, mssql, sqlite — into go.sum, and `go tool` offers no place to
// strip them with build tags. The CLI also takes a -dir path, and a path can
// be wrong in a way an embed.FS cannot. And D2 needs a migration container
// anyway: with this binary that phase is a compose block, not a second tooling
// decision.
//
// It connects as timseil_migrate, which owns the schema and is the only role
// allowed to run DDL. The api process connects as timseil_app and cannot.
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"os"
	"time"

	// Registers "pgx" with database/sql. goose speaks database/sql, the rest of
	// the API speaks pgxpool directly — same driver underneath either way.
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/G1NG4R/timseil-dev/api/migrations"
)

// Long enough for a cold start behind a healthcheck, short enough that a
// misconfigured host fails while you are still looking at the terminal.
const connectTimeout = 30 * time.Second

// embeddedRoot is where the .sql files sit INSIDE the embedded filesystem.
// migrations.FS is rooted at api/migrations itself, so they are at its top
// level and the path is "." — "migrations" would be a subdirectory that does
// not exist there.
const embeddedRoot = "."

// createDir is a real path on disk, used only by `create`, which writes a file
// and therefore cannot go through the embedded copy.
const createDir = "migrations"

func main() {
	dir := flag.String("dir", createDir, "where `create` writes new files")
	flag.Usage = usage
	flag.Parse()

	if err := run(flag.Args(), *dir); err != nil {
		fmt.Fprintf(os.Stderr, "migrate: %v\n", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `usage: migrate [-dir path] <command>

  up        apply every pending migration
  down      roll back exactly one migration
  reset     roll back to zero (the only reliable way down once B3 adds a view)
  status    list every migration and whether it is applied
  version   print the current schema version
  create    write a new empty migration; needs a name argument

Reads MIGRATE_DATABASE_URL. Postgres publishes no port, so this runs inside
the docker network: make migrate, make migrate-status, ...
`)
}

func run(args []string, dir string) error {
	if len(args) == 0 {
		usage()
		return errors.New("no command given")
	}
	cmd, rest := args[0], args[1:]

	goose.SetBaseFS(migrations.FS)
	goose.SetSequential(true)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}

	// create is the one command that writes a file and never touches the
	// database, so it must not require a DSN to be set.
	if cmd == "create" {
		if len(rest) == 0 {
			return errors.New("create needs a name, e.g. create add_track_notes")
		}
		// Writing needs the real directory, not the embedded copy.
		goose.SetBaseFS(nil)
		return goose.Create(nil, dir, rest[0], "sql")
	}

	db, err := open()
	if err != nil {
		return err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), connectTimeout)
	defer cancel()

	switch cmd {
	case "up":
		return goose.UpContext(ctx, db, embeddedRoot)
	case "down":
		return goose.DownContext(ctx, db, embeddedRoot)
	case "reset":
		// DownTo(0), not Reset: goose.Reset walks the applied list, and the
		// list is what we are trying to empty. DownTo unwinds by version and
		// is the operation the runbook documents.
		return goose.DownToContext(ctx, db, embeddedRoot, 0)
	case "status":
		return goose.StatusContext(ctx, db, embeddedRoot)
	case "version":
		return goose.VersionContext(ctx, db, embeddedRoot)
	default:
		usage()
		return fmt.Errorf("unknown command %q", cmd)
	}
}

func open() (*sql.DB, error) {
	dsn := os.Getenv("MIGRATE_DATABASE_URL")
	if dsn == "" {
		return nil, errors.New("MIGRATE_DATABASE_URL is empty — copy .env.example to .env")
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}

	// sql.Open does not dial. Without this ping a wrong DSN surfaces as a
	// goose error about the version table, which sends you looking in the
	// wrong place entirely.
	ctx, cancel := context.WithTimeout(context.Background(), connectTimeout)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("cannot reach the database as timseil_migrate: %w", err)
	}
	return db, nil
}
