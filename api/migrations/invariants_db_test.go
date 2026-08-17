//go:build db

// One test per invariant, and each one asserts the BROKEN case.
//
// A test that inserts a valid row and sees it stored proves nothing about a
// constraint — it would pass just as happily with no constraint at all. What
// has to be shown is that the database refuses the row the invariant forbids.
package migrations_test

import (
	"database/sql"
	"strings"
	"testing"

	"github.com/G1NG4R/timseil-dev/api/internal/dbtest"
)

// insertSystem creates one live, public system and returns its id. Most
// invariants need something to hang off.
func insertSystem(t *testing.T, db *sql.DB) int64 {
	t.Helper()
	var id int64
	err := db.QueryRow(`
		INSERT INTO systems (slug, system_no, name, state, source_access, source_url, stack)
		VALUES ('timseil-dev', '02', 'timseil.dev', 'live', 'public',
		        'https://github.com/G1NG4R/timseil-dev', ARRAY['Go 1.26'])
		RETURNING id`).Scan(&id)
	if err != nil {
		t.Fatalf("seeding a system: %v", err)
	}
	return id
}

// Invariant: state and source are two axes, and the contract's oneOf says a
// system carries the field matching its access and not the other one.
func TestSourceAxisRejectsEveryHalfState(t *testing.T) {
	db := dbtest.FreshSchema(t)

	dbtest.MustReject(t, db, "a public system with no URL", `
		INSERT INTO systems (slug, system_no, name, state, source_access)
		VALUES ('a', '01', 'A', 'queued', 'public')`)

	dbtest.MustReject(t, db, "a private system with no reason", `
		INSERT INTO systems (slug, system_no, name, state, source_access)
		VALUES ('b', '02', 'B', 'queued', 'private')`)

	// The half the handbook sketch would have let through: an excuse and a URL
	// at the same time.
	dbtest.MustReject(t, db, "a private system that still carries a URL", `
		INSERT INTO systems (slug, system_no, name, state, source_access, source_url, source_reason)
		VALUES ('c', '03', 'C', 'queued', 'private', 'https://example.com/c', 'nda')`)

	dbtest.MustReject(t, db, "an unknown source reason", `
		INSERT INTO systems (slug, system_no, name, state, source_access, source_reason)
		VALUES ('d', '04', 'D', 'queued', 'private', 'because')`)

	dbtest.MustReject(t, db, "an unknown state", `
		INSERT INTO systems (slug, system_no, name, state, source_access, source_url)
		VALUES ('e', '05', 'E', 'planned', 'public', 'https://example.com/e')`)

	dbtest.MustReject(t, db, "a system number that is not two digits", `
		INSERT INTO systems (slug, system_no, name, state, source_access, source_url)
		VALUES ('f', '6', 'F', 'queued', 'public', 'https://example.com/f')`)

	dbtest.MustAccept(t, db, "a well formed public system", `
		INSERT INTO systems (slug, system_no, name, state, source_access, source_url)
		VALUES ('ok-public', '07', 'OK', 'live', 'public', 'https://example.com/ok')`)

	dbtest.MustAccept(t, db, "a well formed private system", `
		INSERT INTO systems (slug, system_no, name, state, source_access, source_reason)
		VALUES ('ok-private', '08', 'OK2', 'queued', 'private', 'nda')`)
}

// Invariant 5: evidence never points into nothing. A deleted system that leaves
// a track state standing is exactly the lie the derivation exists to prevent.
func TestEvidenceCannotBeLeftDangling(t *testing.T) {
	db := dbtest.FreshSchema(t)
	systemID := insertSystem(t, db)

	var moduleID, trackID int64
	if err := db.QueryRow(`
		INSERT INTO modules (module_no, title) VALUES ('04', 'DevOps') RETURNING id`).Scan(&moduleID); err != nil {
		t.Fatalf("seeding a module: %v", err)
	}
	if err := db.QueryRow(`
		INSERT INTO tracks (module_id, name, sort_order)
		VALUES ($1, 'CI/CD (GitHub Actions)', 1) RETURNING id`, moduleID).Scan(&trackID); err != nil {
		t.Fatalf("seeding a track: %v", err)
	}
	dbtest.MustAccept(t, db, "an evidence row", `
		INSERT INTO track_evidence (track_id, system_id, detail)
		VALUES ($1, $2, 'build + deploy')`, trackID, systemID)

	dbtest.MustReject(t, db, "deleting a system that still backs a track",
		`DELETE FROM systems WHERE id = $1`, systemID)

	dbtest.MustReject(t, db, "the same system twice under one track", `
		INSERT INTO track_evidence (track_id, system_id) VALUES ($1, $2)`, trackID, systemID)

	dbtest.MustReject(t, db, "an evidence row with an empty detail", `
		INSERT INTO track_evidence (track_id, system_id, detail)
		VALUES ($1, $2, '   ')`, trackID, systemID)
}

// Invariant 2 / ADR 0003: the state of a track is derived, never stored. Asked
// of the live catalogue rather than of the migration text, so it also catches a
// column added by some other route.
func TestTracksHasNoStateColumn(t *testing.T) {
	db := dbtest.FreshSchema(t)

	var n int
	err := db.QueryRow(`
		SELECT count(*) FROM information_schema.columns
		 WHERE table_schema = 'public' AND table_name = 'tracks' AND column_name = 'state'`).Scan(&n)
	if err != nil {
		t.Fatalf("asking the catalogue: %v", err)
	}
	if n != 0 {
		t.Error("tracks has a state column — states are derived in v_track_states, never stored (ADR 0003)")
	}
}

// Invariant 4: no notch without a post-mortem. NOT NULL alone does not carry
// it, because an empty string satisfies NOT NULL and would put a red cell on
// the grid with nothing behind it.
func TestIncidentNeedsAnActualPostMortem(t *testing.T) {
	db := dbtest.FreshSchema(t)
	systemID := insertSystem(t, db)

	insert := `INSERT INTO incidents (id, system_id, started_at, duration_sec, cause, fix, post_slug)
	           VALUES ($1, $2, now(), 2520, $3, $4, $5)`

	dbtest.MustReject(t, db, "an incident with an empty cause",
		insert, "INC-001", systemID, "", "restarted the pool", "011-migration-lock")
	dbtest.MustReject(t, db, "an incident with a blank fix",
		insert, "INC-002", systemID, "lock held", "   ", "011-migration-lock")
	dbtest.MustReject(t, db, "an incident with an empty post slug",
		insert, "INC-003", systemID, "lock held", "restarted", "")
	dbtest.MustReject(t, db, "an incident with a zero duration",
		`INSERT INTO incidents (id, system_id, started_at, duration_sec, cause, fix, post_slug)
		 VALUES ('INC-004', $1, now(), 0, 'c', 'f', '011-migration-lock')`, systemID)
	dbtest.MustReject(t, db, "an incident id that is not INC-nnn",
		insert, "INC-5", systemID, "lock held", "restarted", "011-migration-lock")

	dbtest.MustAccept(t, db, "a complete incident",
		insert, "INC-001", systemID, "migration held a lock", "restarted the pool", "011-migration-lock")
}

// Invariant 6: a day without a measurement is nodata, never ok. The equivalence
// holds both ways, so an invented ok and a hidden measurement are both refused.
func TestDayWithoutMeasurementIsNodata(t *testing.T) {
	db := dbtest.FreshSchema(t)
	systemID := insertSystem(t, db)

	dbtest.MustReject(t, db, "an unmeasured day claiming to be ok", `
		INSERT INTO ops_days (system_id, day, state, checks_total, checks_up)
		VALUES ($1, DATE '2026-06-12', 'ok', 0, 0)`, systemID)

	dbtest.MustReject(t, db, "a measured day claiming to be nodata", `
		INSERT INTO ops_days (system_id, day, state, checks_total, checks_up)
		VALUES ($1, DATE '2026-06-13', 'nodata', 288, 288)`, systemID)

	dbtest.MustReject(t, db, "a nodata day carrying downtime", `
		INSERT INTO ops_days (system_id, day, state, down_sec, checks_total)
		VALUES ($1, DATE '2026-06-14', 'nodata', 60, 0)`, systemID)

	dbtest.MustReject(t, db, "more successful checks than checks", `
		INSERT INTO ops_days (system_id, day, state, checks_total, checks_up)
		VALUES ($1, DATE '2026-06-15', 'ok', 10, 11)`, systemID)

	dbtest.MustReject(t, db, "more downtime than a day has seconds", `
		INSERT INTO ops_days (system_id, day, state, down_sec, checks_total, checks_up)
		VALUES ($1, DATE '2026-06-16', 'outage', 90000, 288, 0)`, systemID)

	// Day one of the grid, and the honest answer.
	dbtest.MustAccept(t, db, "an unmeasured day as nodata", `
		INSERT INTO ops_days (system_id, day, state, checks_total, checks_up)
		VALUES ($1, DATE '2026-06-17', 'nodata', 0, 0)`, systemID)

	dbtest.MustReject(t, db, "two rows for the same system and day", `
		INSERT INTO ops_days (system_id, day, state, checks_total, checks_up)
		VALUES ($1, DATE '2026-06-17', 'nodata', 0, 0)`, systemID)
}

// The backfill from the ops-data branch has to stay traceable and repeatable:
// the API re-reads uptime-log.txt after every restart.
func TestOpsChecksKeepTheirOrigin(t *testing.T) {
	db := dbtest.FreshSchema(t)
	systemID := insertSystem(t, db)

	dbtest.MustReject(t, db, "a backfilled row with no source to cite", `
		INSERT INTO ops_checks (system_id, observed_at, up, latency_ms, origin)
		VALUES ($1, now(), true, 142, 'backfill')`, systemID)

	dbtest.MustReject(t, db, "an unknown origin", `
		INSERT INTO ops_checks (system_id, observed_at, up, origin)
		VALUES ($1, now(), true, 'guess')`, systemID)

	dbtest.MustReject(t, db, "a latency on a check that was down", `
		INSERT INTO ops_checks (system_id, observed_at, up, latency_ms, reason, origin)
		VALUES ($1, now(), false, 142, 'connect timeout', 'probe')`, systemID)

	dbtest.MustReject(t, db, "a reason on a check that was up", `
		INSERT INTO ops_checks (system_id, observed_at, up, reason, origin)
		VALUES ($1, now(), true, 'all good', 'probe')`, systemID)

	dbtest.MustAccept(t, db, "a live probe", `
		INSERT INTO ops_checks (system_id, observed_at, up, latency_ms, origin)
		VALUES ($1, TIMESTAMPTZ '2026-06-12 03:11:00Z', true, 142, 'probe')`, systemID)

	// Replaying the log must not create a second row for the same instant.
	dbtest.MustReject(t, db, "a second observation at the same instant", `
		INSERT INTO ops_checks (system_id, observed_at, up, reason, origin, source_ref)
		VALUES ($1, TIMESTAMPTZ '2026-06-12 03:11:00Z', false, 'connect timeout', 'backfill', 'a41f9c2')`, systemID)
}

// Invariant 1: nullable is the point. 0 is a real measurement and must never
// stand in for a missing one, which is why the columns are nullable and why a
// snapshot of three nulls is a legitimate row rather than an error.
func TestMetricsAreNullableOnPurpose(t *testing.T) {
	db := dbtest.FreshSchema(t)
	systemID := insertSystem(t, db)

	dbtest.MustAccept(t, db, "a snapshot that measured nothing at all", `
		INSERT INTO metric_snapshots (system_id, measured_at)
		VALUES ($1, TIMESTAMPTZ '2026-06-12 03:00:00Z')`, systemID)

	dbtest.MustAccept(t, db, "a snapshot with a zero error rate", `
		INSERT INTO metric_snapshots (system_id, measured_at, uptime_90d, p95_ms, error_rate)
		VALUES ($1, TIMESTAMPTZ '2026-06-12 03:05:00Z', 99.64, 142, 0)`, systemID)

	dbtest.MustReject(t, db, "an uptime above 100 percent", `
		INSERT INTO metric_snapshots (system_id, measured_at, uptime_90d)
		VALUES ($1, TIMESTAMPTZ '2026-06-12 03:10:00Z', 101)`, systemID)

	dbtest.MustReject(t, db, "an error rate above one", `
		INSERT INTO metric_snapshots (system_id, measured_at, error_rate)
		VALUES ($1, TIMESTAMPTZ '2026-06-12 03:15:00Z', 1.5)`, systemID)

	dbtest.MustReject(t, db, "a negative latency", `
		INSERT INTO metric_snapshots (system_id, measured_at, p95_ms)
		VALUES ($1, TIMESTAMPTZ '2026-06-12 03:20:00Z', -1)`, systemID)

	// A row exists because a measurement happened, so it always has its time.
	dbtest.MustReject(t, db, "a snapshot with no measurement time", `
		INSERT INTO metric_snapshots (system_id, uptime_90d) VALUES ($1, 99.9)`, systemID)
}

// The mail header injection finding, defended a second time in the schema. The
// first line is the validator in C6.
func TestContactRejectsHeaderInjection(t *testing.T) {
	db := dbtest.FreshSchema(t)

	insert := `INSERT INTO contact_messages
	    (id, client_ts, name, email, message, message_hash, ip_hash, dwell_ms)
	    VALUES ($1, now(), 'A Visitor', $2, 'a message long enough to be real',
	            sha256('body'::bytea), sha256('ip'::bytea), 4018)`

	dbtest.MustReject(t, db, "an address carrying a carriage return",
		insert, "msg_1", "a@example.com\r\nBcc: victim@example.com")
	dbtest.MustReject(t, db, "an address carrying a newline",
		insert, "msg_2", "a@example.com\nBcc: victim@example.com")

	dbtest.MustAccept(t, db, "an ordinary address", insert, "msg_3", "a@example.com")

	dbtest.MustReject(t, db, "a second message with the same idempotency key", `
		INSERT INTO contact_messages
		    (id, client_ts, name, email, message, message_hash, ip_hash, dwell_ms)
		SELECT 'msg_4', client_ts, name, upper(email), message, message_hash, ip_hash, dwell_ms
		  FROM contact_messages WHERE id = 'msg_3'`)

	dbtest.MustReject(t, db, "an ip hash that is not a sha-256", `
		INSERT INTO contact_messages
		    (id, client_ts, name, email, message, message_hash, ip_hash, dwell_ms)
		VALUES ('msg_5', now(), 'A', 'b@example.com', 'a message long enough to be real',
		        sha256('body'::bytea), '\x00'::bytea, 4018)`)

	dbtest.MustReject(t, db, "a delivered message with no delivery time", `
		UPDATE contact_messages SET delivery_status = 'sent' WHERE id = 'msg_3'`)

	dbtest.MustAccept(t, db, "a message marked sent with its time", `
		UPDATE contact_messages SET delivery_status = 'sent', delivered_at = now()
		 WHERE id = 'msg_3'`)
}

// The role split, which is a claim until somebody tries to break it. An SQL
// injection in the API must not be able to take the schema with it.
func TestAppRoleCannotTouchTheSchema(t *testing.T) {
	migrate := dbtest.FreshSchema(t)
	insertSystem(t, migrate)

	app := dbtest.App(t)

	// The default privileges from migration 00001 have to have landed, or the
	// API would be locked out of its own tables.
	var n int
	if err := app.QueryRow(`SELECT count(*) FROM systems`).Scan(&n); err != nil {
		t.Fatalf("the app role cannot read systems — check ALTER DEFAULT PRIVILEGES in 00001: %v", err)
	}
	if n != 1 {
		t.Errorf("the app role sees %d systems, want 1", n)
	}

	dbtest.MustAccept(t, app, "the app role writing a row", `
		INSERT INTO modules (module_no, title) VALUES ('05', 'Foundations')`)
	dbtest.MustAccept(t, app, "the app role updating a row", `
		UPDATE modules SET title = 'Foundations II' WHERE module_no = '05'`)
	dbtest.MustAccept(t, app, "the app role deleting a row", `
		DELETE FROM modules WHERE module_no = '05'`)

	// And now the half that matters.
	for _, tc := range []struct {
		what string
		stmt string
	}{
		{"the app role creating a table", `CREATE TABLE sneaky (id int)`},
		{"the app role dropping a table", `DROP TABLE systems`},
		{"the app role adding a column", `ALTER TABLE tracks ADD COLUMN state text`},
		{"the app role creating an index", `CREATE INDEX sneaky_idx ON systems (slug)`},
		{"the app role truncating a table", `TRUNCATE contact_messages`},
	} {
		if _, err := app.Exec(tc.stmt); err == nil {
			t.Errorf("%s succeeded — the role split is decoration, not least privilege", tc.what)
		} else if !strings.Contains(strings.ToLower(err.Error()), "permission denied") &&
			!strings.Contains(strings.ToLower(err.Error()), "must be owner") {
			t.Errorf("%s failed for the wrong reason: %v", tc.what, err)
		}
	}
}

// Passwords are hashed with SCRAM, not MD5.
//
// The direct assertion would read pg_authid.rolpassword, but that catalogue is
// superuser-only and neither test role is a superuser — deliberately. What is
// readable is the setting that decides how ALTER ROLE ... PASSWORD hashes, and
// since the roles are created by the initdb script after that setting is in
// place, this is the same fact from the side we are allowed to look at.
func TestPasswordsAreHashedWithScram(t *testing.T) {
	db := dbtest.Migrate(t)

	var encryption string
	if err := db.QueryRow(`SHOW password_encryption`).Scan(&encryption); err != nil {
		t.Fatalf("reading password_encryption: %v", err)
	}
	if encryption != "scram-sha-256" {
		t.Errorf("password_encryption is %q, want scram-sha-256", encryption)
	}

	// Both roles exist, neither is a superuser, and both can log in — the last
	// point is proven by appDB connecting at all.
	rows, err := db.Query(`
		SELECT rolname, rolsuper, rolcanlogin FROM pg_roles
		 WHERE rolname IN ('timseil_migrate', 'timseil_app') ORDER BY rolname`)
	if err != nil {
		t.Fatalf("listing the roles: %v", err)
	}
	defer rows.Close()

	seen := 0
	for rows.Next() {
		var name string
		var super, canLogin bool
		if err := rows.Scan(&name, &super, &canLogin); err != nil {
			t.Fatalf("scanning a role: %v", err)
		}
		seen++
		if super {
			t.Errorf("%s is a superuser — no superuser at runtime", name)
		}
		if !canLogin {
			t.Errorf("%s cannot log in", name)
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("listing the roles: %v", err)
	}
	if seen != 2 {
		t.Errorf("found %d of the two roles — did ops/postgres/initdb run? make dev-reset", seen)
	}
}
