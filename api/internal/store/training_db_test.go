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
	"maps"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/G1NG4R/timseil-dev/api/internal/dbtest"
	"github.com/G1NG4R/timseil-dev/api/internal/fixtures"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// The seed as U3 declares it. These numbers are the log, and they are asserted
// rather than described because every prose copy of them has drifted at least
// once.
//
// The shape changed with ADR 0079: the old tree carried nine tracks with no
// evidence at all, and `queued` was the biggest bucket in it. Now every track
// has a line, `learning` is what the cluster alone backs, and `queued` is a
// state the seed no longer produces — it survives in the view for the day a
// track loses its last evidence line, which is what TestNoTrackIsLostOnTheWayOut
// builds on purpose.
const (
	seedModules  = 6
	seedTracks   = 14
	seedEvidence = 19
	seedApplied  = 8
	seedLearning = 6
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

// ----------------------------------------------------------- what is seeded

func TestTheSeededTrainingLogIsSixModulesAndFourteenTracks(t *testing.T) {
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

// The seeded states, counted from the database rather than claimed.
//
// Zero core is still the point of the log: core needs two live systems under one
// track, and the cluster is `in_build` until the cutover in U9. Zero queued is
// the half that is new — a track with nothing to point at was the normal case
// before U3 and does not exist after it.
func TestTheSeededTrackStatesAreEightAppliedAndSixLearning(t *testing.T) {
	states := trainingStates(t, loaded(t, fixtures.TwoSystems))

	for state, want := range map[string]int{"applied": seedApplied, "learning": seedLearning} {
		if states[state] != want {
			t.Errorf("%s = %d, want %d (all states: %v)", state, states[state], want, states)
		}
	}
	for _, state := range []string{"core", "queued"} {
		if states[state] != 0 {
			t.Errorf("%s = %d on the seeded database, want 0", state, states[state])
		}
	}
}

// No track falls out of the query, and this is the C3 counterpart to the golden
// test of C2. An inner join against track_evidence would drop every track with
// no evidence line — and the log would then show a fuller profile than the one
// that exists, which is the single failure mode this site is built against.
//
// Before U3 the seed itself supplied that case: nine of twenty-two tracks had no
// evidence at all. It no longer does — all fourteen are backed — so the test now
// BUILDS the case instead of counting on it. That is the whole point of the
// rewrite: left as it was, the assertion would have counted zero against zero
// and stayed green while proving nothing (ADR 0057).
func TestNoTrackIsLostOnTheWayOut(t *testing.T) {
	q := loaded(t, fixtures.TwoSystems)
	ctx := context.Background()
	sqlDB := dbtest.App(t)

	var inTable int
	if err := sqlDB.QueryRow(`SELECT count(*) FROM tracks`).Scan(&inTable); err != nil {
		t.Fatalf("counting tracks: %v", err)
	}

	rows, err := q.ListTracksWithState(ctx)
	if err != nil {
		t.Fatalf("ListTracksWithState: %v", err)
	}
	if len(rows) != inTable {
		t.Fatalf("the query returns %d of %d tracks", len(rows), inTable)
	}

	// Strip one track of its evidence. Nothing else changes, and the seed offers
	// no such track on its own.
	var stripped int64
	if err := sqlDB.QueryRow(`
		DELETE FROM track_evidence
		 WHERE track_id = (SELECT min(track_id) FROM track_evidence)
		RETURNING track_id`).Scan(&stripped); err != nil {
		t.Fatalf("stripping a track of its evidence: %v", err)
	}

	rows, err = q.ListTracksWithState(ctx)
	if err != nil {
		t.Fatalf("ListTracksWithState after the delete: %v", err)
	}
	if len(rows) != inTable {
		t.Errorf("the query returns %d of %d tracks — the one without evidence "+
			"is the one that goes missing", len(rows), inTable)
	}

	var found bool
	for _, row := range rows {
		if row.TrackID != stripped {
			continue
		}
		found = true
		// It comes back, and it comes back honest: no evidence is `queued`,
		// which is the state the seed itself no longer produces.
		if row.State != "queued" {
			t.Errorf("track %d has no evidence left and reads %q, want %q",
				stripped, row.State, "queued")
		}
	}
	if !found {
		t.Errorf("track %d lost its evidence and fell out of the query entirely", stripped)
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

	seen := map[string]bool{}
	for _, row := range rows {
		if row.Slug == "" || row.SystemNo == "" {
			t.Errorf("track %d carries an evidence line with no system: %+v", row.TrackID, row)
		}
		if row.Slug != liveSlug && row.Slug != buildingSlug {
			t.Errorf("track %d is backed by %q, and the seed declares only %q and %q",
				row.TrackID, row.Slug, buildingSlug, liveSlug)
		}
		seen[row.Slug] = true
	}
	// Both systems back something. Since U3 the log header reads
	// EVIDENCE: 02 SYSTEMS, and one slug going missing here is how that header
	// would quietly become wrong.
	if len(seen) != 2 {
		t.Errorf("the evidence lines name %d systems, want both: %v", len(seen), seen)
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
// This is phase C3's acceptance criterion: the same system walked through the
// three states that matter, with the query read after each step. Nothing is
// written to any track at any point.
//
// The whole distribution is asserted, not one bucket of it. A state change that
// leaked into tracks it has nothing to do with would otherwise pass — and after
// U3 that risk is real in a way it was not before, because talos-prod backs
// eleven of the fourteen tracks and timseil.dev eight, five of them the same.
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
		want        map[string]int
	}{
		// Where the seed stands: eight tracks applied, six backed by the
		// cluster alone.
		{"live", map[string]int{"applied": seedApplied, "learning": seedLearning}},
		// The site goes back into build. Nothing is written to any track, and
		// every one of the fourteen falls to learning — both systems are now
		// `in_build`, so nothing is proven by anything running.
		{"in_build", map[string]int{"learning": seedTracks}},
		// Live again — the jump the build plan names as the criterion.
		{"live", map[string]int{"applied": seedApplied, "learning": seedLearning}},
		// And the honest floor: a system nobody is building proves nothing. The
		// three tracks only this system backs fall all the way to queued; the
		// eleven the cluster still backs stay at learning, which is the second
		// half of the assertion.
		{"queued", map[string]int{"learning": 11, "queued": 3}},
	} {
		setState(step.systemState)

		if states := trainingStates(t, q); !maps.Equal(states, step.want) {
			t.Errorf("with %s in state %q the log reads %v, want %v",
				liveSlug, step.systemState, states, step.want)
		}
	}
}

// Two live systems behind one track is `core`, and the boundary is `>= 2` rather
// than `= 2`.
//
// The seed reaches it by moving, not by writing: five tracks are backed by both
// systems, so setting the cluster live turns exactly those five core and leaves
// the other nine applied. Before U3 this test had to insert an evidence line of
// its own, because no track was backed twice — that row is gone, and with it the
// only place in this file that added content rather than moving it.
//
// This is also the shape the cutover in U9 produces, asserted here before it
// happens rather than after.
func TestTwoLiveSystemsBehindATrackAreCore(t *testing.T) {
	q := loaded(t, fixtures.TwoSystems)
	sqlDB := dbtest.App(t)

	if _, err := sqlDB.Exec(`UPDATE systems SET state = 'live' WHERE slug = $1`, buildingSlug); err != nil {
		t.Fatalf("setting %s live: %v", buildingSlug, err)
	}

	want := map[string]int{"core": 5, "applied": 9}
	if states := trainingStates(t, q); !maps.Equal(states, want) {
		t.Errorf("with both systems live the log reads %v, want %v", states, want)
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
