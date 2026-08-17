// Package fixtures loads the four database states the API tests are written
// against: nothing, the seed, launch day, and one outage with its post-mortem.
//
// It is test scaffolding and must stay that way. incident.sql contains invented
// operational data — probes that never ran, a failure that never happened — and
// invented operational data reaching a real database is the one thing this
// project is built against. Two things keep it out: nothing under api/cmd
// imports this package, and boundary_test.go fails if that ever changes.
//
// The seed is the opposite: curated content, no measurements, safe in production.
// See api/internal/seed and docs/runbooks/seed.md for the line between them.
package fixtures

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"sort"
	"strings"

	"github.com/G1NG4R/timseil-dev/api/internal/seed"
)

//go:embed *.sql
var files embed.FS

// The four sets of build plan B4. Each one is applied on top of an emptied
// database, and every set except Empty starts from the real seed — a fixture that
// invented its own systems would let a test pass against content the site does
// not have.
const (
	// Empty is a migrated database with no rows: every metric null, no grid.
	Empty = "empty"
	// TwoSystems is the seed exactly as production gets it. The golden case for
	// C2: vat-check is not live, so every one of its metric fields is null.
	TwoSystems = "two-systems"
	// DayOne adds the 91-cell grid with every cell nodata.
	DayOne = "day-one"
	// Incident adds 30 days of measurement, one outage with a post-mortem, one
	// degraded day without one, and two deploys.
	Incident = "incident"
)

// steps are the SQL files each set applies after the seed, in order.
var steps = map[string][]string{
	Empty:      nil,
	TwoSystems: nil,
	DayOne:     {"day-one.sql"},
	Incident:   {"day-one.sql", "incident.sql"},
}

// Names lists the known sets, for an error message worth reading.
func Names() []string {
	out := make([]string, 0, len(steps))
	for name := range steps {
		out = append(out, name)
	}
	sort.Strings(out)
	return out
}

// Load empties the database and builds the named set. Loading the same set twice
// leaves the same rows, and loading a different one afterwards is safe, because
// every set starts from empty.
func Load(ctx context.Context, db *sql.DB, set string) error {
	afterSeed, ok := steps[set]
	if !ok {
		return fmt.Errorf("unknown fixture set %q — known sets are %s", set, strings.Join(Names(), ", "))
	}

	if err := apply(ctx, db, "empty.sql"); err != nil {
		return err
	}
	if set == Empty {
		return nil
	}

	if _, err := seed.Apply(ctx, db); err != nil {
		return fmt.Errorf("fixture %s: %w", set, err)
	}
	for _, name := range afterSeed {
		if err := apply(ctx, db, name); err != nil {
			return fmt.Errorf("fixture %s: %w", set, err)
		}
	}
	return nil
}

// apply runs one file. No arguments, deliberately: pgx uses the simple protocol
// only when a query has no parameters, and the extended protocol refuses more
// than one command per statement. A `$1` anywhere in these files would stop the
// whole file from running.
func apply(ctx context.Context, db *sql.DB, name string) error {
	body, err := files.ReadFile(name)
	if err != nil {
		return err
	}
	if _, err := db.ExecContext(ctx, string(body)); err != nil {
		return fmt.Errorf("applying %s: %w", name, err)
	}
	return nil
}
