//go:build db

// Issue #32: every `incidents.post_slug` names a file in web/content/posts.
//
// WHY IT CANNOT BE A CONSTRAINT. `post_slug` points across a boundary a foreign
// key cannot reach. 00004_operations.sql does what a schema can — NOT NULL, non
// blank, and the `^[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$` shape the reader in
// web/lib/content/posts.ts copies — and none of that can tell whether the file
// is there. Invariant 4 says a notch owes a post-mortem; this is the half of it
// that lives outside the database.
//
// WHY NOW. Until H9a `/blog/<slug>` answered 404 for every slug, so the page
// printed the name as text and there was nothing to point into nothing. H9c
// makes it a link when the entry resolves, and a condition nothing checks is a
// hope. web/lib/case/postmortem.ts is what the page does if one slips past;
// this is what stops one.
//
// #32 SAYS "THE JOB HAS TO SKIP FIXTURES" AND IT DOES NOT HAVE TO. That was
// written for a job that would run against whatever database it found.
// dbtest.FreshSchema applies migrations and nothing else, so the fixture — which
// writes `001-fixture-outage` for an outage that never happened, and says so in
// its own comment — is not present to be skipped. An exception nobody has to
// write is an exception nobody can later widen.
//
// AND IT REPORTS WHAT IT CHECKED. The seed writes no incidents and production
// has answered `incidents: []` every day this page has existed, so the first
// test below passes today by finding nothing. That is the shape of the four
// green tests H2b caught doing exactly that, and the answer is not to skip the
// check but to make it say out loud how many rows it saw. The second test is
// what keeps it honest in the meantime: it hands the finder a row that is
// wrong and requires it to say so.
//
// Run with: make check-db
package migrations_test

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/G1NG4R/timseil-dev/api/internal/dbtest"
)

// THE SAME RELATIVE PATH ON A LAPTOP AND IN THE CONTAINER. `go test` runs in the
// package directory, which is api/migrations here and /app/migrations there, so
// this resolves to <repo>/web/content/posts and /web/content/posts — and
// compose.dev.yaml mounts the directory at exactly that second path so the two
// spellings can stay one string.
const postsDir = "../../web/content/posts"

// postMortemsOnDisk is the set of slugs this repository actually holds, read as
// filenames rather than as frontmatter: the filename IS the slug, which is the
// whole reason ADR 0002 put the log in the repository.
func postMortemsOnDisk(t *testing.T) map[string]struct{} {
	t.Helper()

	entries, err := os.ReadDir(postsDir)
	if err != nil {
		// NOT t.Skip. A check that quietly disappears when it cannot find the
		// corpus is a check that reports success for the one failure it exists
		// to catch — the image or the mount that shipped without the content.
		t.Fatalf("reading %s: %v", postsDir, err)
	}

	held := make(map[string]struct{}, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || filepath.Ext(name) != ".mdx" {
			continue
		}
		held[strings.TrimSuffix(name, ".mdx")] = struct{}{}
	}

	if len(held) == 0 {
		t.Fatalf("%s holds no entries", postsDir)
	}
	return held
}

// unresolvedPostMortems returns `INC-nnn → slug` for every incident whose
// post-mortem is not on disk, and the number of rows it looked at.
func unresolvedPostMortems(t *testing.T, db *sql.DB, held map[string]struct{}) (map[string]string, int) {
	t.Helper()

	rows, err := db.Query(`SELECT id, post_slug FROM incidents ORDER BY id`)
	if err != nil {
		t.Fatalf("reading incidents: %v", err)
	}
	defer rows.Close()

	missing := map[string]string{}
	seen := 0
	for rows.Next() {
		var id, slug string
		if err := rows.Scan(&id, &slug); err != nil {
			t.Fatalf("scanning an incident: %v", err)
		}
		seen++
		if _, ok := held[slug]; !ok {
			missing[id] = slug
		}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("reading incidents: %v", err)
	}
	return missing, seen
}

// The check itself, over the data a migrated and seeded database holds.
func TestEveryIncidentNamesAPostMortemThatExists(t *testing.T) {
	held := postMortemsOnDisk(t)
	db, _ := seeded(t)

	missing, seen := unresolvedPostMortems(t, db, held)

	// The count is logged rather than asserted. Zero is the honest answer today
	// — the seed writes no incidents, because those are measurements — and a
	// test that demanded one would be demanding an outage.
	t.Logf("checked %d incident(s) against %d entries in %s", seen, len(held), postsDir)

	for id, slug := range missing {
		t.Errorf("%s cites %s, and web/content/posts holds no such entry", id, slug)
	}
}

// The broken case, which is what makes the test above a check rather than a
// green run over an empty table.
func TestTheCheckFindsAnIncidentWhosePostMortemWasNeverWritten(t *testing.T) {
	held := postMortemsOnDisk(t)
	db := dbtest.FreshSchema(t)
	systemID := insertSystem(t, db)

	// One real and one invented, so the finder has to tell them apart rather
	// than reject everything. The real one is read out of the corpus instead of
	// typed here: a slug spelled into a test is a slug that goes stale, which is
	// the defect H9c spent a second repair on in lib/work/log.test.ts.
	var real string
	for slug := range held {
		real = slug
		break
	}

	insert := `INSERT INTO incidents (id, system_id, started_at, duration_sec, cause, fix, post_slug)
	           VALUES ($1, $2, now(), 2520, 'the migration held a lock', 'lock_timeout on the role', $3)`
	dbtest.MustAccept(t, db, "an incident citing an entry that exists", insert, "INC-001", systemID, real)
	dbtest.MustAccept(t, db, "an incident citing one that does not", insert, "INC-002", systemID, "001-fixture-outage")

	missing, seen := unresolvedPostMortems(t, db, held)

	if seen != 2 {
		t.Fatalf("looked at %d incidents, wanted 2", seen)
	}
	if _, ok := missing["INC-001"]; ok {
		t.Errorf("INC-001 cites %s, which is on disk, and was reported missing", real)
	}
	if got := missing["INC-002"]; got != "001-fixture-outage" {
		t.Errorf("INC-002 was not reported: got %q", got)
	}
	if len(missing) != 1 {
		t.Errorf("reported %d missing post-mortems, wanted 1: %v", len(missing), missing)
	}
}
