// The `migrate` subcommand: applies the schema in api/migrations to Postgres.
//
// It lived in its own main package until D2. What moved it here is the
// production image: distroless carries exactly the binaries we copy into it, and
// Go does not share anything between two of them. Measured on this commit:
// api 12.06 MiB + migrate 11.07 + seed 9.02 = 32.15 MiB against the 20 MiB
// ceiling make check-images enforces. Folded into one binary the same three
// programs are 14.87 MiB, because pgx, database/sql and crypto/tls are paid for
// once instead of three times. ADR 0027.
//
// It connects as timseil_migrate, which owns the schema and is the only role
// allowed to run DDL. The server path of this same binary connects as
// timseil_app and cannot — the separation is in the DSN each service is given,
// never in which file the code sits (ADR 0011).
package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"io"
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
const migrateConnectTimeout = 30 * time.Second

// embeddedRoot is where the .sql files sit INSIDE the embedded filesystem.
// migrations.FS is rooted at api/migrations itself, so they are at its top
// level and the path is "." — "migrations" would be a subdirectory that does
// not exist there.
const embeddedRoot = "."

// migrateCreateDir is a real path on disk, used only by `create`, which writes a
// file and therefore cannot go through the embedded copy.
const migrateCreateDir = "migrations"

// runMigrate is the whole subcommand: it owns its own FlagSet rather than the
// package-level flag package, because `api` itself takes no flags and a shared
// CommandLine set would let `api -dir=x` parse as if it meant something.
func runMigrate(args []string) error {
	fs := flag.NewFlagSet("migrate", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	dir := fs.String("dir", migrateCreateDir, "where `create` writes new files")
	fs.Usage = func() { migrateUsage(os.Stderr) }
	if err := fs.Parse(args); err != nil {
		return err
	}

	rest := fs.Args()
	if len(rest) == 0 {
		migrateUsage(os.Stderr)
		return errors.New("no command given")
	}
	cmd, rest := rest[0], rest[1:]

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
		return goose.Create(nil, *dir, rest[0], "sql")
	}

	// The verb is checked before the connection is opened. Otherwise a typo
	// reports "MIGRATE_DATABASE_URL is empty" on a machine where the variable is
	// simply not this command's problem — an error about the wrong thing sends
	// you to the wrong file.
	if !knownMigrateCommands[cmd] {
		migrateUsage(os.Stderr)
		return fmt.Errorf("unknown command %q", cmd)
	}

	db, err := openMigrateDB()
	if err != nil {
		return err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), migrateConnectTimeout)
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
		// Unreachable: knownMigrateCommands above is the gate. It stays as the
		// compiler's reminder that the map and this switch are two lists of the
		// same thing and have to be edited together.
		return fmt.Errorf("unhandled command %q", cmd)
	}
}

// knownMigrateCommands is every verb the switch below handles, minus `create`,
// which is handled earlier because it is the one that needs no database.
var knownMigrateCommands = map[string]bool{
	"up": true, "down": true, "reset": true, "status": true, "version": true,
}

func migrateUsage(w io.Writer) {
	fmt.Fprint(w, `usage: api migrate [-dir path] <command>

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

func openMigrateDB() (*sql.DB, error) {
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
	ctx, cancel := context.WithTimeout(context.Background(), migrateConnectTimeout)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("cannot reach the database as timseil_migrate: %w", err)
	}
	return db, nil
}
