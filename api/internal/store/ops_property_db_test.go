//go:build db

// The roll-up as a property, over a thousand generated measurement patterns.
//
// The Incident fixture proves the aggregation against one hand-written day of
// each kind, which is enough to catch a wrong query and not enough to catch a
// wrong boundary: it has exactly one day at zero, one at one and one at two
// failures. Everything between them, and every cadence other than half an hour,
// is generated here.
//
// This is the second site rapid is used at. The first is the track-state
// derivation in migrations/track_states_db_test.go; the build plan reserves the
// tool for those two — the derivation and this — and for nothing else.
//
// Run with: make check-db
package store_test

import (
	"context"
	"flag"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"pgregory.net/rapid"

	"github.com/G1NG4R/timseil-dev/api/internal/fixtures"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// The same reasoning as migrations/track_states_db_test.go, and the same two
// flags: the number of cases is an acceptance criterion and belongs in the code
// rather than in an invocation, and nofailfile keeps rapid from writing
// testdata/rapid/*.fail into a bind mount as root — which is how phase A4 ended
// up with directories their owner could not delete. The seed in the failure
// output reproduces a case without leaving anything behind.
//
// Duplicated rather than shared: this is a different test binary, and an init in
// another package would not run for it.
func init() {
	for name, value := range map[string]string{
		"rapid.checks":     "1000",
		"rapid.nofailfile": "true",
	} {
		if err := flag.Set(name, value); err != nil {
			panic("setting " + name + ": " + err.Error())
		}
	}
}

// day is one generated day of measurement: how many probes ran, and how many of
// them failed.
type genDay struct {
	back   int // days before today, 0..90 — inside the 91-day window
	total  int
	failed int
}

// drawDays generates a measurement pattern: a handful of distinct days, each
// with its own number of probes and failures.
//
// 48 is the fixture's cadence and a plausible ceiling; the point of the range is
// that `failed` sweeps the whole way from none to all, which is what turns the
// three-way CASE from "tested at three points" into "tested at its boundaries".
func drawDays(rt *rapid.T) []genDay {
	backs := rapid.SliceOfNDistinct(
		rapid.IntRange(0, 90), 0, 4, func(n int) int { return n },
	).Draw(rt, "days")

	days := make([]genDay, 0, len(backs))
	for _, back := range backs {
		total := rapid.IntRange(1, 48).Draw(rt, "checks")
		days = append(days, genDay{
			back:   back,
			total:  total,
			failed: rapid.IntRange(0, total).Draw(rt, "failed"),
		})
	}
	return days
}

// wantState is the rule this phase decided, written once, in Go, so that the
// SQL has something independent to be compared against. A test that re-derived
// it with the same CASE would agree with a wrong query.
func wantState(failed, outageChecks int) string {
	switch {
	case failed == 0:
		return "ok"
	case failed < outageChecks:
		return "degraded"
	default:
		return "outage"
	}
}

// TestTheRollUpHoldsForAnyPatternOfMeasurement generates a measurement pattern,
// derives the grid from it, and checks five things at once — the arithmetic, the
// evidence columns, the cap, the three-way threshold, and the gap.
//
// Each case runs in a transaction that is rolled back, so the thousand cases
// share one schema and one system and the pattern is the only thing that varies.
func TestTheRollUpHoldsForAnyPatternOfMeasurement(t *testing.T) {
	q, pool := loadedPool(t, fixtures.TwoSystems)
	ctx := context.Background()
	id := systemID(t, q, liveSlug)

	rapid.Check(t, func(rt *rapid.T) {
		days := drawDays(rt)

		// The cadence and the threshold are drawn too. down_sec is failures times
		// an interval the caller states, so an interval the test never varies is an
		// interval the test never checks — and 86400 is drawn on purpose, because
		// it is the one that makes LEAST do something.
		probeInterval := rapid.SampledFrom([]int{60, 300, 1800, 86400}).Draw(rt, "probeInterval")
		outageChecks := rapid.IntRange(1, 5).Draw(rt, "outageChecks")

		tx, err := pool.Begin(ctx)
		if err != nil {
			rt.Fatalf("beginning a transaction: %v", err)
		}
		defer func() { _ = tx.Rollback(ctx) }()

		txq := q.WithTx(tx)

		for _, d := range days {
			// The first `failed` probes of the day are the ones that failed. The
			// schema refuses a latency on a failed check and a reason on a
			// successful one, so the generator has to respect both or every case
			// would fail for the wrong reason.
			if _, err := tx.Exec(ctx, `
				INSERT INTO ops_checks (system_id, observed_at, up, latency_ms, reason, origin)
				SELECT $1,
				       (((now() AT TIME ZONE 'UTC')::date - $2::int)::timestamp AT TIME ZONE 'UTC')
				           + (n * interval '1 minute'),
				       n >= $3::int,
				       CASE WHEN n >= $3::int THEN 118 END,
				       CASE WHEN n <  $3::int THEN 'generated' END,
				       'probe'
				  FROM generate_series(0, $4::int - 1) AS n`,
				id, d.back, d.failed, d.total,
			); err != nil {
				rt.Fatalf("measuring day -%d (%d checks, %d failed): %v",
					d.back, d.total, d.failed, err)
			}
		}

		if _, err := txq.RollUpOpsDays(ctx, store.RollUpOpsDaysParams{
			LookbackSec:      testLookback,
			OutageChecks:     int32(outageChecks),
			ProbeIntervalSec: int32(probeInterval),
		}); err != nil {
			rt.Fatalf("RollUpOpsDays: %v", err)
		}

		// ---- what was written, day by day

		if stored := countRows(ctx, rt, tx,
			`SELECT count(*) FROM ops_days WHERE system_id = $1`, id); stored != len(days) {
			rt.Fatalf("ops_days holds %d rows for %d measured days — a day with no check must not be stored",
				stored, len(days))
		}

		measured := map[string]genDay{}
		for _, d := range days {
			var state string
			var downSec, total, up int
			err := tx.QueryRow(ctx, `
				SELECT state, down_sec, checks_total, checks_up
				  FROM ops_days
				 WHERE system_id = $1 AND day = (now() AT TIME ZONE 'UTC')::date - $2::int`,
				id, d.back).Scan(&state, &downSec, &total, &up)
			if err != nil {
				rt.Fatalf("reading day -%d: %v", d.back, err)
			}

			if want := wantState(d.failed, outageChecks); state != want {
				rt.Fatalf("day -%d with %d of %d failed at a threshold of %d reads %q, want %q",
					d.back, d.failed, d.total, outageChecks, state, want)
			}
			if want := min(d.failed*probeInterval, 86400); downSec != want {
				rt.Fatalf("day -%d reports %ds of downtime, want %d (%d failures × %ds, capped)",
					d.back, downSec, want, d.failed, probeInterval)
			}
			// The evidence columns, asked separately. A FILTER that counts the wrong
			// rows can still land on the right colour by accident; asking for the
			// counts takes the accident out of it.
			if total != d.total || up != d.total-d.failed {
				rt.Fatalf("day -%d counts %d checks and %d answering, want %d and %d",
					d.back, total, up, d.total, d.total-d.failed)
			}
			// The constraint the roll-up is never allowed to reach, stated as a
			// property rather than trusted to the schema.
			if (total == 0) != (state == "nodata") {
				rt.Fatalf("day -%d has %d checks and reads %q", d.back, total, state)
			}

			measured[dayKey(d.back)] = d
		}

		// ---- and what the grid makes of it

		grid, err := txq.OpsDaysForSystem(ctx, store.OpsDaysForSystemParams{
			SystemID: id, WindowSize: 91,
		})
		if err != nil {
			rt.Fatalf("OpsDaysForSystem: %v", err)
		}
		if len(grid) != 91 {
			rt.Fatalf("the grid has %d cells, want 91", len(grid))
		}

		for _, cell := range grid {
			key := cell.Day.Time.Format(time.DateOnly)
			d, wasMeasured := measured[key]
			switch {
			case wasMeasured:
				if want := wantState(d.failed, outageChecks); cell.State != want {
					rt.Fatalf("%s reads %q on the grid, want %q", key, cell.State, want)
				}
			case cell.State != "nodata":
				rt.Fatalf("%s reads %q and nothing measured it", key, cell.State)
			case cell.DownSec != 0:
				rt.Fatalf("%s is nodata and reports %ds of downtime", key, cell.DownSec)
			}
		}
	})
}

func dayKey(back int) string {
	return time.Now().UTC().AddDate(0, 0, -back).Format(time.DateOnly)
}

func countRows(ctx context.Context, rt *rapid.T, tx pgx.Tx, query string, args ...any) int {
	var n int
	if err := tx.QueryRow(ctx, query, args...).Scan(&n); err != nil {
		rt.Fatalf("%s: %v", query, err)
	}
	return n
}
