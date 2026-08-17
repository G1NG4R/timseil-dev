// Package seed writes the curated content of the site — two systems, five
// modules, 22 tracks, 13 evidence rows — and nothing else.
//
// Nothing else is the load-bearing half. A seed that also wrote ops_days or
// metric_snapshots would be inventing measurements, and every number this site
// shows is supposed to come from a system that produced it. So timseil.dev is
// `live` from the first run and still renders `— NO DATA` in every tile until
// the probe has measured something. ADR 0013.
//
// It needs no DDL: it runs as timseil_app, the role that may only SELECT,
// INSERT, UPDATE and DELETE. That it works without timseil_migrate is not a
// convenience, it is the assertion.
package seed

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/G1NG4R/timseil-dev/api/internal/stack"
)

// Counts is what ended up in the database.
type Counts struct {
	Systems  int
	Modules  int
	Tracks   int
	Evidence int
}

func (c Counts) String() string {
	return fmt.Sprintf("%d systems, %d modules, %d tracks, %d evidence",
		c.Systems, c.Modules, c.Tracks, c.Evidence)
}

// Expected is what seed.sql declares, restated here so that it can be checked.
//
// The failure it catches is quiet and expensive: seed.sql inserts its evidence
// through a JOIN on track names, so renaming a track on one side only drops an
// evidence row without any error. The track would then turn from APPLIED to
// QUEUED on the live page, and the page would be wrong in exactly the way the
// whole site argues against. Verified before COMMIT, so a miscount reaches
// nothing.
//
// Changing the content means changing this line too. That is the intent.
var Expected = Counts{Systems: 2, Modules: 5, Tracks: 22, Evidence: 13}

// Apply seeds the database inside one transaction and returns what it wrote.
// Running it twice is the same as running it once.
func Apply(ctx context.Context, db *sql.DB) (Counts, error) {
	bundle, err := Stack()
	if err != nil {
		return Counts{}, err
	}

	rows, err := files.ReadFile("seed.sql")
	if err != nil {
		return Counts{}, err
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Counts{}, err
	}
	// Rollback after a successful Commit is a no-op, so this needs no flag.
	defer tx.Rollback()

	// One statement per file, on purpose: seed.sql renumbers tracks, and
	// tracks_order_unique_per_module is DEFERRABLE INITIALLY DEFERRED so that
	// swapping two positions is only checked at COMMIT. Split across
	// transactions it would collide on the first UPDATE.
	//
	// Passing NO arguments here is what makes a multi-statement file work: pgx
	// falls back to the simple protocol when a query has no parameters, and the
	// extended protocol refuses more than one command per statement. Add a `$1`
	// to seed.sql and the whole file stops running — parameters belong in the
	// separate statements below.
	if _, err := tx.ExecContext(ctx, string(rows)); err != nil {
		return Counts{}, fmt.Errorf("applying seed.sql: %w", err)
	}

	if err := applyStack(ctx, tx, bundle); err != nil {
		return Counts{}, err
	}

	counts, err := count(ctx, tx)
	if err != nil {
		return Counts{}, err
	}
	if counts != Expected {
		return counts, fmt.Errorf("seed wrote %s, expected %s — a join in seed.sql stopped matching", counts, Expected)
	}

	return counts, tx.Commit()
}

// Stack returns the resolved stack strings that `make gen` wrote.
func Stack() (*stack.Bundle, error) {
	data, err := files.ReadFile("stack.gen.json")
	if err != nil {
		return nil, err
	}
	var bundle stack.Bundle
	if err := json.Unmarshal(data, &bundle); err != nil {
		return nil, fmt.Errorf("parsing stack.gen.json — run make gen: %w", err)
	}
	if len(bundle.Systems) == 0 {
		return nil, fmt.Errorf("stack.gen.json lists no systems — run make gen")
	}
	return &bundle, nil
}

// applyStack copies the resolved manifest into systems.stack, and insists that
// the two sides name the same systems. A manifest entry for a system the seed
// does not declare is a typo in a slug; a seeded system missing from the
// manifest would render an empty stack list on its page, which reads like a
// design decision rather than the oversight it is.
func applyStack(ctx context.Context, tx *sql.Tx, bundle *stack.Bundle) error {
	for slug, entries := range bundle.Systems {
		res, err := tx.ExecContext(ctx,
			`UPDATE systems SET stack = $1 WHERE slug = $2`, entries, slug)
		if err != nil {
			return fmt.Errorf("setting stack for %s: %w", slug, err)
		}
		n, err := res.RowsAffected()
		if err != nil {
			return err
		}
		if n != 1 {
			return fmt.Errorf("%s names system %q, which the seed does not declare", stack.FileName, slug)
		}
	}

	// string_agg rather than array_agg: database/sql has no Scan for a Postgres
	// array, and a comma-separated list is what the error message wants anyway.
	var missing sql.NullString
	if err := tx.QueryRowContext(ctx,
		`SELECT string_agg(slug, ', ' ORDER BY slug)
		   FROM systems WHERE cardinality(stack) = 0`).Scan(&missing); err != nil {
		return err
	}
	if missing.Valid {
		return fmt.Errorf("no %s entry for %s — their pages would show an empty stack",
			stack.FileName, missing.String)
	}
	return nil
}

func count(ctx context.Context, tx *sql.Tx) (Counts, error) {
	var c Counts
	err := tx.QueryRowContext(ctx, `
		SELECT (SELECT count(*) FROM systems),
		       (SELECT count(*) FROM modules),
		       (SELECT count(*) FROM tracks),
		       (SELECT count(*) FROM track_evidence)`).
		Scan(&c.Systems, &c.Modules, &c.Tracks, &c.Evidence)
	return c, err
}
