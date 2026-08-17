// Command seed writes the curated content — systems, modules, tracks, evidence
// — into Postgres. Idempotent: running it twice leaves the same rows.
//
// It connects as timseil_app, the DML-only role, and reads DATABASE_URL. That is
// the interesting part of this file: the seed needs no schema privileges at all,
// and running it without them is the proof rather than the claim. timseil_migrate
// belongs to cmd/migrate and to nothing else.
//
// It writes no measurements. See api/internal/seed and ADR 0013.
package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"time"

	// Registers "pgx" with database/sql.
	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/G1NG4R/timseil-dev/api/internal/seed"
)

// Long enough for a cold start behind a healthcheck, short enough that a
// misconfigured host fails while you are still looking at the terminal.
const timeout = 30 * time.Second

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "seed: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	db, err := open()
	if err != nil {
		return err
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	counts, err := seed.Apply(ctx, db)
	if err != nil {
		return err
	}
	fmt.Printf("seed: %s\n", counts)
	return nil
}

func open() (*sql.DB, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return nil, errors.New("DATABASE_URL is empty — copy .env.example to .env")
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}

	// sql.Open does not dial. Without this ping a wrong DSN surfaces as an error
	// about a missing table, which sends you looking at the migrations instead
	// of at the connection string.
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("cannot reach the database as timseil_app: %w", err)
	}
	return db, nil
}
