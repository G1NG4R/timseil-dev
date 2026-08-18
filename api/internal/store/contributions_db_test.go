//go:build db

// The contribution cache against a real server.
//
// The handler tests in internal/contributions run against a stub and prove what
// the Go code does with a row. This file proves the row — and the property that
// matters most is not the calendar but its age: cacheAgeSec is the one number on
// this endpoint a visitor is asked to trust, it is computed in SQL, and it is
// computed against the clock of the database rather than the clock of whichever
// instance happened to answer.
//
// The second thing proved here is a refusal. contributions_cache is the only
// table in this schema holding data we did not produce, and the one rule it
// carries is that an empty calendar may not be stored — invariant 1 at the one
// place in stage C where it can be broken by a write.
//
// Run with: make check-db
package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/G1NG4R/timseil-dev/api/internal/dbtest"
	"github.com/G1NG4R/timseil-dev/api/internal/fixtures"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// The login under test. Not the real one: a test that hard-codes the site
// owner's account passes for the wrong reason on the day GITHUB_LOGIN changes.
const cacheLogin = "octocat"

// A calendar in the shape the refresher writes — the contract's steps, not
// GitHub's quartile names. Two weeks is enough to prove storage and read-back;
// the mapping itself is proved in internal/contributions against the served
// document.
const twoWeeks = `[
  {"days":[{"date":"2026-08-03","count":0,"level":"l0"},
           {"date":"2026-08-04","count":7,"level":"l2"}]},
  {"days":[{"date":"2026-08-10","count":19,"level":"l4"}]}
]`

func upsert(t *testing.T, q *store.Queries, total int32, weeks string) {
	t.Helper()

	err := q.UpsertContributions(context.Background(), store.UpsertContributionsParams{
		Login:              cacheLogin,
		TotalContributions: total,
		Weeks:              []byte(weeks),
	})
	if err != nil {
		t.Fatalf("UpsertContributions: %v", err)
	}
}

func read(t *testing.T, q *store.Queries) store.GetContributionsRow {
	t.Helper()

	row, err := q.GetContributions(context.Background(), cacheLogin)
	if err != nil {
		t.Fatalf("GetContributions: %v", err)
	}
	return row
}

// ------------------------------------------------------------------ the cache

func TestAStoredCalendarComesBackUnchanged(t *testing.T) {
	q := loaded(t, fixtures.Empty)

	upsert(t, q, 1234, twoWeeks)
	row := read(t, q)

	if row.TotalContributions != 1234 {
		t.Errorf("total = %d, want 1234", row.TotalContributions)
	}
	// jsonb normalises whitespace and key order, so the bytes are not the bytes
	// that went in — but they are the same value, and they are stable for that
	// value. Stability is what the handler's ETag rests on, so it is asserted
	// here rather than assumed: two reads of one row hash the same.
	again := read(t, q)
	if string(row.Weeks) != string(again.Weeks) {
		t.Errorf("two reads of one row returned different bytes:\n%s\n%s", row.Weeks, again.Weeks)
	}
}

// The upsert is the only writer and it replaces the whole calendar. A partial
// update would leave a row that is half of one fetch and half of another, which
// is a calendar nobody measured.
func TestTheUpsertReplacesTheRowAndMovesFetchedAt(t *testing.T) {
	q := loaded(t, fixtures.Empty)

	upsert(t, q, 100, twoWeeks)
	first := read(t, q)

	upsert(t, q, 200, `[{"days":[{"date":"2026-08-17","count":3,"level":"l1"}]}]`)
	second := read(t, q)

	if second.TotalContributions != 200 {
		t.Errorf("total = %d, want 200 — the second write did not replace the first",
			second.TotalContributions)
	}
	if !second.FetchedAt.Time.After(first.FetchedAt.Time) &&
		!second.FetchedAt.Time.Equal(first.FetchedAt.Time) {
		t.Errorf("fetched_at went backwards: %v then %v", first.FetchedAt.Time, second.FetchedAt.Time)
	}
	if string(second.Weeks) == string(first.Weeks) {
		t.Error("the weeks did not change — ON CONFLICT did not update them")
	}

	// One row, still. The login is the key; a second insert must not accumulate.
	var rows int
	if err := dbtest.App(t).QueryRow(
		`SELECT count(*) FROM contributions_cache`).Scan(&rows); err != nil {
		t.Fatalf("counting: %v", err)
	}
	if rows != 1 {
		t.Errorf("rows = %d, want 1", rows)
	}
}

// -------------------------------------------------------------------- the age

// The age is Postgres's subtraction, not Go's. This is the test that would fail
// if somebody moved the arithmetic into the handler and used time.Now.
func TestTheAgeIsComputedByPostgres(t *testing.T) {
	q := loaded(t, fixtures.Empty)
	upsert(t, q, 1, twoWeeks)

	// Backdated by hand, because waiting ninety minutes is not a test.
	if _, err := dbtest.App(t).Exec(
		`UPDATE contributions_cache SET fetched_at = now() - interval '90 minutes'`); err != nil {
		t.Fatalf("backdating: %v", err)
	}

	age := read(t, q).CacheAgeSec
	const want = 90 * 60
	if age < want-5 || age > want+5 {
		t.Errorf("cacheAgeSec = %d, want about %d", age, want)
	}
}

func TestAFreshRowIsAlmostNoSecondsOld(t *testing.T) {
	q := loaded(t, fixtures.Empty)
	upsert(t, q, 1, twoWeeks)

	if age := read(t, q).CacheAgeSec; age < 0 || age > 5 {
		t.Errorf("cacheAgeSec = %d, want 0 or close to it", age)
	}
}

// A row from the future is not a hypothetical: a restored dump, a clock stepped
// backwards, or a hand-edited row all produce one. A negative age is a number
// nobody measured, so the query clamps.
func TestTheAgeIsNeverNegative(t *testing.T) {
	q := loaded(t, fixtures.Empty)
	upsert(t, q, 1, twoWeeks)

	if _, err := dbtest.App(t).Exec(
		`UPDATE contributions_cache SET fetched_at = now() + interval '1 hour'`); err != nil {
		t.Fatalf("dating forward: %v", err)
	}

	if age := read(t, q).CacheAgeSec; age != 0 {
		t.Errorf("cacheAgeSec = %d, want 0 — a future row must not produce a negative age", age)
	}
}

// The cold start. GitHub has never answered, there is nothing to remember, and
// the handler turns exactly this error into the contract's 502 rather than into
// an empty calendar.
func TestAMissingRowIsErrNoRows(t *testing.T) {
	q := loaded(t, fixtures.Empty)

	_, err := q.GetContributions(context.Background(), cacheLogin)
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("err = %v, want pgx.ErrNoRows", err)
	}
}

// ------------------------------------------------------------- the refusals

// Invariant 1, at the one place a write can break it. An empty calendar stored
// over a good one would render as a year of quiet days — zero standing in for
// "no data", which is the one substitution this whole system refuses.
func TestAnEmptyCalendarIsRefused(t *testing.T) {
	dbtest.FreshSchema(t)
	db := dbtest.App(t)

	dbtest.MustReject(t, db, "an empty weeks array",
		`INSERT INTO contributions_cache (login, total_contributions, weeks)
		 VALUES ($1, 0, '[]'::jsonb)`, cacheLogin)

	dbtest.MustReject(t, db, "a weeks object that is not an array",
		`INSERT INTO contributions_cache (login, total_contributions, weeks)
		 VALUES ($1, 0, '{"weeks":[]}'::jsonb)`, cacheLogin)

	dbtest.MustReject(t, db, "a negative total",
		`INSERT INTO contributions_cache (login, total_contributions, weeks)
		 VALUES ($1, -1, $2::jsonb)`, cacheLogin, twoWeeks)

	dbtest.MustReject(t, db, "a blank login",
		`INSERT INTO contributions_cache (login, total_contributions, weeks)
		 VALUES ('   ', 0, $1::jsonb)`, twoWeeks)

	// The other half: written too tightly, the constraints above would refuse
	// the real thing and this file would still be green.
	dbtest.MustAccept(t, db, "a calendar with a total of zero",
		`INSERT INTO contributions_cache (login, total_contributions, weeks)
		 VALUES ($1, 0, $2::jsonb)`, cacheLogin, twoWeeks)
}

// ADR 0011: the api runs as timseil_app and must be able to read and write this
// table without ever holding DDL rights. The grant comes from ALTER DEFAULT
// PRIVILEGES in 00001_privileges.sql, which only reaches tables created after it
// — so a migration placed above that file would silently lock the app out.
func TestTimseilAppMayReadAndWriteTheCacheButNotDropIt(t *testing.T) {
	q := loaded(t, fixtures.Empty)

	upsert(t, q, 42, twoWeeks)
	if read(t, q).TotalContributions != 42 {
		t.Error("timseil_app could not read back what it wrote")
	}

	app := dbtest.App(t)
	dbtest.MustAccept(t, app, "a delete by the app role",
		`DELETE FROM contributions_cache WHERE login = $1`, cacheLogin)
	dbtest.MustReject(t, app, "a table drop by the app role",
		`DROP TABLE contributions_cache`)
}

// A guard against a plausible future edit: the age must keep coming from the
// stored timestamp, so a row written a moment ago and read after a pause has to
// have grown. Cheap, and it fails loudly if cache_age_sec is ever frozen to a
// constant or read from a column.
func TestTheAgeGrowsBetweenTwoReads(t *testing.T) {
	q := loaded(t, fixtures.Empty)
	upsert(t, q, 1, twoWeeks)

	if _, err := dbtest.App(t).Exec(
		`UPDATE contributions_cache SET fetched_at = now() - interval '10 seconds'`); err != nil {
		t.Fatalf("backdating: %v", err)
	}
	before := read(t, q).CacheAgeSec

	if _, err := dbtest.App(t).Exec(
		`UPDATE contributions_cache SET fetched_at = now() - interval '70 seconds'`); err != nil {
		t.Fatalf("backdating: %v", err)
	}
	after := read(t, q).CacheAgeSec

	if after <= before {
		t.Errorf("the age did not grow: %d then %d", before, after)
	}
	if d := after - before; d < 55 || d > 65 {
		t.Errorf("the age grew by %d seconds, want about 60", d)
	}
}
