//go:build db

// The training queries against a real server.
//
// The handler tests in internal/training run against a stub and prove what the
// Go code does with an answer. This file proves the answers — and the one that
// matters most is not a number but a movement: invariant 2 says a track's state
// is derived, so setting a system live has to move its tracks without anybody
// writing a state anywhere. That is the acceptance criterion of phase C3 and it
// is the last test in this file.
//
// Run with: make check-db
package store_test

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/G1NG4R/timseil-dev/api/internal/dbtest"
	"github.com/G1NG4R/timseil-dev/api/internal/fixtures"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// The seed as B4 declares it. These four numbers are the launch-day log, and
// they are asserted rather than described because the build plan and the
// handbook describe them wrongly: both say "9 learning", and both are older than
// ADR 0003. `learning` needs a system in `in_build`; on launch day none exists,
// so a track with nothing to point at is `queued`.
const (
	seedModules  = 5
	seedTracks   = 22
	seedEvidence = 13
	seedApplied  = 13
	seedQueued   = 9
)

func trainingStates(t *testing.T, q *store.Queries) map[string]int {
	t.Helper()

	rows, err := q.ListTracksWithState(context.Background())
	if err != nil {
		t.Fatalf("ListTracksWithState: %v", err)
	}

	states := map[string]int{}
	for _, row := range rows {
		states[row.State]++
	}
	return states
}

// ------------------------------------------------------------- the launch day

func TestTheSeededTrainingLogIsFiveModulesAndTwentyTwoTracks(t *testing.T) {
	q := loaded(t, fixtures.TwoSystems)
	ctx := context.Background()

	modules, err := q.ListModules(ctx)
	if err != nil {
		t.Fatalf("ListModules: %v", err)
	}
	if len(modules) != seedModules {
		t.Errorf("modules = %d, want %d", len(modules), seedModules)
	}
	// The order is the contract's: by display number, whatever the insert did.
	for i := 1; i < len(modules); i++ {
		if modules[i-1].ModuleNo >= modules[i].ModuleNo {
			t.Errorf("modules are not ordered by number: %q before %q",
				modules[i-1].ModuleNo, modules[i].ModuleNo)
		}
	}

	tracks, err := q.ListTracksWithState(ctx)
	if err != nil {
		t.Fatalf("ListTracksWithState: %v", err)
	}
	if len(tracks) != seedTracks {
		t.Errorf("tracks = %d, want %d", len(tracks), seedTracks)
	}

	evidence, err := q.ListTrackEvidence(ctx)
	if err != nil {
		t.Fatalf("ListTrackEvidence: %v", err)
	}
	if len(evidence) != seedEvidence {
		t.Errorf("evidence lines = %d, want %d", len(evidence), seedEvidence)
	}
}

// The launch-day states, counted from the database rather than claimed.
//
// Zero core is the point of the whole log: something built once means having got
// it to run once. Zero learning is what the derivation actually says on a
// database whose only unbuilt system is `queued`.
func TestTheSeededTrackStatesAreThirteenAppliedAndNineQueued(t *testing.T) {
	states := trainingStates(t, loaded(t, fixtures.TwoSystems))

	for state, want := range map[string]int{"applied": seedApplied, "queued": seedQueued} {
		if states[state] != want {
			t.Errorf("%s = %d, want %d (all states: %v)", state, states[state], want, states)
		}
	}
	for _, state := range []string{"core", "learning"} {
		if states[state] != 0 {
			t.Errorf("%s = %d on launch day, want 0", state, states[state])
		}
	}
}

// No track falls out of the query, and this is the C3 counterpart to the golden
// test of C2.
//
// Nine of the twenty-two tracks have no evidence at all. An inner join against
// track_evidence would drop exactly those nine — and the log would then show a
// fuller profile than the one that exists, which is the single failure mode this
// site is built against. Counted against the table so that the assertion cannot
// be satisfied by a query that lost rows and a constant that was updated to
// match.
func TestNoTrackIsLostOnTheWayOut(t *testing.T) {
	q := loaded(t, fixtures.TwoSystems)

	rows, err := q.ListTracksWithState(context.Background())
	if err != nil {
		t.Fatalf("ListTracksWithState: %v", err)
	}

	var inTable int
	sqlDB := dbtest.App(t)
	if err := sqlDB.QueryRow(`SELECT count(*) FROM tracks`).Scan(&inTable); err != nil {
		t.Fatalf("counting tracks: %v", err)
	}
	if len(rows) != inTable {
		t.Errorf("the query returns %d of %d tracks — the ones without evidence "+
			"are the ones that go missing", len(rows), inTable)
	}

	evidenced := map[int64]bool{}
	evidence, err := q.ListTrackEvidence(context.Background())
	if err != nil {
		t.Fatalf("ListTrackEvidence: %v", err)
	}
	for _, row := range evidence {
		evidenced[row.TrackID] = true
	}

	withoutEvidence := 0
	for _, row := range rows {
		if !evidenced[row.TrackID] {
			withoutEvidence++
		}
	}
	if withoutEvidence != seedQueued {
		t.Errorf("tracks without an evidence line = %d, want %d",
			withoutEvidence, seedQueued)
	}
}

// Every evidence line points at a system that exists, with the number the site
// shows. Invariant 5 in the read path: a line into a gap cannot be stored, so it
// must not be servable either.
func TestEveryEvidenceLinePointsAtARealSystem(t *testing.T) {
	q := loaded(t, fixtures.TwoSystems)

	rows, err := q.ListTrackEvidence(context.Background())
	if err != nil {
		t.Fatalf("ListTrackEvidence: %v", err)
	}

	for _, row := range rows {
		if row.Slug == "" || row.SystemNo == "" {
			t.Errorf("track %d carries an evidence line with no system: %+v", row.TrackID, row)
		}
		// The seed backs every line with 02 timseil.dev, which is why the log
		// header reads one system and not thirteen.
		if row.Slug != liveSlug {
			t.Errorf("track %d is backed by %q, and the seed backs all thirteen "+
				"lines with %q", row.TrackID, row.Slug, liveSlug)
		}
	}
}

// An empty database answers with three empty slices and no error. "There is no
// training log yet" is a state this endpoint has to survive — it is what the
// service says between the first migration and the first seed.
func TestAnEmptyDatabaseHasAnEmptyTrainingLog(t *testing.T) {
	q := loaded(t, fixtures.Empty)
	ctx := context.Background()

	modules, err := q.ListModules(ctx)
	if err != nil {
		t.Fatalf("ListModules: %v", err)
	}
	tracks, err := q.ListTracksWithState(ctx)
	if err != nil {
		t.Fatalf("ListTracksWithState: %v", err)
	}
	evidence, err := q.ListTrackEvidence(ctx)
	if err != nil {
		t.Fatalf("ListTrackEvidence: %v", err)
	}

	if len(modules) != 0 || len(tracks) != 0 || len(evidence) != 0 {
		t.Errorf("an empty database returned %d modules, %d tracks, %d evidence lines",
			len(modules), len(tracks), len(evidence))
	}
}

// ----------------------------------------------------- the acceptance criterion

// Moving a system moves the tracks it proves, and nothing writes a state.
//
// This is phase C3's acceptance criterion and it needs a stage the seed does not
// provide: with `timseil.dev` live and `vat-check` queued there is no `learning`
// anywhere. So the test builds the movement itself — the same system, walked
// through the three states that matter — and reads the query after each step.
//
// The query is what is observed rather than the view directly, because the view
// is already covered by the property test in api/migrations. What is new here is
// that the endpoint's own read path carries the movement: nothing between
// v_track_states and the response caches, copies or overrides a state.
//
// The thirteen tracks are the ones the seed backs with that system; the other
// nine stay queued throughout, which is the second half of the assertion — a
// state change must not leak into tracks that have nothing to do with it.
func TestSettingASystemLiveMovesTheTracksItProves(t *testing.T) {
	q := loaded(t, fixtures.TwoSystems)
	sqlDB := dbtest.App(t)

	setState := func(state string) {
		t.Helper()
		if _, err := sqlDB.Exec(
			`UPDATE systems SET state = $1 WHERE slug = $2`, state, liveSlug); err != nil {
			t.Fatalf("setting %s to %s: %v", liveSlug, state, err)
		}
	}

	for _, step := range []struct {
		systemState string
		trackState  string
	}{
		// Where the seed stands: one live system behind thirteen tracks.
		{"live", "applied"},
		// The system goes back into build. Nothing is written to any track, and
		// all thirteen have to fall back to learning.
		{"in_build", "learning"},
		// Live again — the jump the build plan names as the criterion.
		{"live", "applied"},
		// And the honest floor: a system nobody is building proves nothing.
		{"queued", "queued"},
	} {
		setState(step.systemState)

		states := trainingStates(t, q)
		if states[step.trackState] < seedApplied {
			t.Errorf("with %s in state %q, only %d tracks are %q — want the %d it backs "+
				"(all states: %v)",
				liveSlug, step.systemState, states[step.trackState], step.trackState,
				seedApplied, states)
		}
		// The nine self-study tracks are not affected by any of this. With
		// `queued` as the track state they merge into the same bucket, so that
		// step checks the total instead.
		if step.trackState != "queued" && states["queued"] != seedQueued {
			t.Errorf("with %s in state %q, queued = %d — want the %d tracks with no "+
				"evidence, untouched", liveSlug, step.systemState, states["queued"], seedQueued)
		}
		if step.trackState == "queued" && states["queued"] != seedTracks {
			t.Errorf("with %s in state %q, queued = %d — want all %d tracks",
				liveSlug, step.systemState, states["queued"], seedTracks)
		}
	}
}

// Two live systems behind one track is `core`, and the boundary is `>= 2` rather
// than `= 2`. The seed reaches neither, so the test writes the second system's
// evidence line — the only case in this file that adds a row rather than moving
// one, because `core` cannot otherwise be observed through the read path at all.
func TestTwoLiveSystemsBehindATrackAreCore(t *testing.T) {
	q := loaded(t, fixtures.TwoSystems)
	sqlDB := dbtest.App(t)

	if _, err := sqlDB.Exec(`UPDATE systems SET state = 'live' WHERE slug = $1`, queuedSlug); err != nil {
		t.Fatalf("setting %s live: %v", queuedSlug, err)
	}
	// The same track the seed already backs with 02, now backed by 01 as well.
	if _, err := sqlDB.Exec(`
		INSERT INTO track_evidence (track_id, system_id, detail)
		SELECT e.track_id, s.id, 'second system'
		  FROM track_evidence e
		  JOIN systems s ON s.slug = $1
		 WHERE e.track_id = (SELECT min(track_id) FROM track_evidence)
		 LIMIT 1`, queuedSlug); err != nil {
		t.Fatalf("adding a second evidence line: %v", err)
	}

	states := trainingStates(t, q)
	if states["core"] != 1 {
		t.Errorf("core = %d, want exactly the one track two live systems back "+
			"(all states: %v)", states["core"], states)
	}
}

// The app role reads all three queries and the view.
//
// v_track_states is created with security_invoker (00007), so it runs with the
// caller's rights rather than the migrator's. That is a door ADR 0011 closes on
// purpose, and it means the grant has to be real: every test above runs on the
// app role, and this one says so out loud rather than leaving it implied.
func TestTheAppRoleMayReadTheDerivation(t *testing.T) {
	loaded(t, fixtures.TwoSystems)

	pool, err := pgxpool.New(context.Background(), dbtest.DSN(t, dbtest.EnvAppURL))
	if err != nil {
		t.Fatalf("opening a pool on the app role: %v", err)
	}
	defer pool.Close()

	var tracks int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM v_track_states`).Scan(&tracks); err != nil {
		t.Fatalf("the app role cannot read v_track_states: %v", err)
	}
	if tracks != seedTracks {
		t.Errorf("v_track_states carries %d rows, want one per track (%d)", tracks, seedTracks)
	}
}
