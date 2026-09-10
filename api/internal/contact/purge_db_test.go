//go:build db

// The half of the purge that only a real Postgres can answer.
//
// purge_test.go drives the loop with a stub and proves what Go decides: the
// cutoff, the tick, the shutdown. None of that can prove the one property the
// statement exists to have — that a message still owed to somebody survives it.
// That lives in the WHERE clause, so it is tested where WHERE clauses run.
//
// It goes through store.New(pool) rather than through a copy of the SQL, so the
// query under test is the query that ships. And it deletes as timseil_app,
// because the loop does: 00001_privileges.sql grants DML to that role through
// DEFAULT PRIVILEGES, and a purge that turns out to lack DELETE in production
// is a silent failure that no unit test could ever have caught.
package contact_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/G1NG4R/timseil-dev/api/internal/dbtest"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// insertMessage writes one row with a received_at of our choosing.
//
// Not through InsertContactMessage: that query has no received_at parameter
// because nothing in production sets one, and a test that cannot place a row in
// time cannot test a retention window at all.
//
// message_hash is derived from the id rather than being a constant, because
// contact_messages_idempotency_idx is (client_ts, lower(email), message_hash)
// and every row here shares the other two. Two rows at the same instant with a
// fixed hash are one row as far as that index is concerned.
func insertMessage(t *testing.T, db *sql.DB, id string, received time.Time, status string) {
	t.Helper()

	var delivered any
	if status == "sent" {
		// contact_messages_delivered_iff_sent_ck: the status and the timestamp
		// are the same fact and may not disagree.
		delivered = received
	}

	_, err := db.Exec(`
		INSERT INTO contact_messages (
			id, received_at, client_ts, name, email, message,
			message_hash, ip_hash, dwell_ms,
			delivery_status, delivery_attempts, delivered_at
		) VALUES ($1, $2, $2, 'Someone', 'someone@example.org',
		          'A message long enough to be plausible.',
		          sha256(convert_to($1, 'UTF8')), decode(repeat('62', 32), 'hex'), 4000,
		          $3, 1, $4)`,
		id, received, status, delivered)
	if err != nil {
		t.Fatalf("seeding %s: %v", id, err)
	}
}

func ids(t *testing.T, db *sql.DB) []string {
	t.Helper()

	rows, err := db.Query(`SELECT id FROM contact_messages ORDER BY id`)
	if err != nil {
		t.Fatalf("reading back: %v", err)
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatalf("scanning: %v", err)
		}
		out = append(out, id)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("reading back: %v", err)
	}
	return out
}

// THE BROKEN CASE THIS WHOLE FILE IS FOR.
//
// A purge written on received_at alone deletes the third row below — a message
// the dispatcher never delivered, to a visitor who was handed a 202 saying it
// was accepted. It would go silently, and nothing downstream would ever know a
// message had been lost rather than answered.
func TestThePurgeTakesTheSettledAndLeavesTheOwed(t *testing.T) {
	db := dbtest.FreshSchema(t)

	now := time.Now().UTC()
	old := now.Add(-40 * 24 * time.Hour)
	recent := now.Add(-1 * time.Hour)

	insertMessage(t, db, "a-old-sent", old, "sent")
	insertMessage(t, db, "b-old-failed", old, "failed")
	insertMessage(t, db, "c-old-queued", old, "queued")
	insertMessage(t, db, "d-recent-sent", recent, "sent")

	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbtest.DSN(t, dbtest.EnvAppURL))
	if err != nil {
		t.Fatalf("app pool: %v", err)
	}
	defer pool.Close()

	cutoff := now.Add(-30 * 24 * time.Hour)
	deleted, err := store.New(pool).PurgeContactMessages(ctx,
		pgtype.Timestamptz{Time: cutoff, Valid: true})
	if err != nil {
		// A permission error lands here, and it is the failure this test is
		// most worth having: DELETE reaches timseil_app through DEFAULT
		// PRIVILEGES, so a future migration that creates the table outside that
		// grant breaks the purge and nothing else.
		t.Fatalf("purging as timseil_app: %v", err)
	}

	if deleted != 2 {
		t.Errorf("deleted %d rows, want 2 (the old sent one and the old failed one)", deleted)
	}

	got := ids(t, db)
	want := []string{"c-old-queued", "d-recent-sent"}
	if len(got) != len(want) {
		t.Fatalf("left behind %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("left behind %v, want %v", got, want)
		}
	}
}

// The boundary, from both sides, so "older than" cannot quietly become "older
// than or equal to" — or the other way round.
func TestThePurgeIsExclusiveAtTheCutoff(t *testing.T) {
	db := dbtest.FreshSchema(t)

	cutoff := time.Now().UTC().Truncate(time.Second).Add(-30 * 24 * time.Hour)

	insertMessage(t, db, "a-one-microsecond-older", cutoff.Add(-time.Microsecond), "sent")
	insertMessage(t, db, "b-exactly-at-the-cutoff", cutoff, "sent")

	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbtest.DSN(t, dbtest.EnvAppURL))
	if err != nil {
		t.Fatalf("app pool: %v", err)
	}
	defer pool.Close()

	deleted, err := store.New(pool).PurgeContactMessages(ctx,
		pgtype.Timestamptz{Time: cutoff, Valid: true})
	if err != nil {
		t.Fatalf("purging: %v", err)
	}

	if deleted != 1 {
		t.Fatalf("deleted %d rows, want 1 — the cutoff itself is not older than itself", deleted)
	}
	if got := ids(t, db); len(got) != 1 || got[0] != "b-exactly-at-the-cutoff" {
		t.Fatalf("left behind %v, want [b-exactly-at-the-cutoff]", got)
	}
}
