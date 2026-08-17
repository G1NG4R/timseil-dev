package training

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// The handler tests. They run against a stub, so every state of the world below
// — an empty database, a track nobody has shipped, a database that is gone — is
// a value rather than a fixture. The db-tagged tests in internal/store prove the
// answers these are written against.

// stubQueries is the database as this endpoint sees it. Three answers and three
// failures, one per query, because "the log came back without its evidence" is a
// case with its own assertion below.
type stubQueries struct {
	modules    []store.ListModulesRow
	modulesErr error

	tracks    []store.ListTracksWithStateRow
	tracksErr error

	evidence    []store.ListTrackEvidenceRow
	evidenceErr error
}

func (s *stubQueries) ListModules(context.Context) ([]store.ListModulesRow, error) {
	return s.modules, s.modulesErr
}

func (s *stubQueries) ListTracksWithState(context.Context) ([]store.ListTracksWithStateRow, error) {
	return s.tracks, s.tracksErr
}

func (s *stubQueries) ListTrackEvidence(context.Context) ([]store.ListTrackEvidenceRow, error) {
	return s.evidence, s.evidenceErr
}

// errUnreachable is a real pgx connection failure, host and role included —
// which is the point: none of it may reach a response body.
var errUnreachable = errors.New("failed to connect to `host=db user=timseil_app`: " +
	"dial tcp 172.18.0.2:5432: connect: connection refused")

// ------------------------------------------------------------------ the stage

// launchDay is the seed as B4 declares it, in miniature: five modules, tracks in
// sheet order, evidence pointing at one system. The numbers it produces are the
// ones the db test asserts against the real seed — 22 tracks, 13 applied, 9
// queued, one system in the header.
//
// It is deliberately NOT nine learning. The build plan and the handbook say so
// and they are older than ADR 0003: `learning` needs a system in `in_build`, and
// on launch day none exists. A track with nothing to point at is `queued`.
func launchDay() *stubQueries {
	modules := []store.ListModulesRow{
		{ModuleNo: "01", Title: "Languages"},
		{ModuleNo: "02", Title: "Backend"},
		{ModuleNo: "03", Title: "Data"},
		{ModuleNo: "04", Title: "DevOps"},
		{ModuleNo: "05", Title: "Foundations"},
	}

	// module, name, and whether the seed backs it with a system.
	declared := []struct {
		module   string
		name     string
		evidence string
	}{
		{"01", "Go", "api, health endpoint"},
		{"01", "TypeScript", "frontend"},
		{"01", "Python", ""},
		{"01", "SQL", "schema, views, migrations"},
		{"01", "C", ""},

		{"02", "HTTP servers & JSON APIs (Go/TS)", "/api/health, /api/contact"},
		{"02", "Auth (JWT)", ""},
		{"02", "Webhooks", "deploy on push"},
		{"02", "Pub/sub (RabbitMQ)", ""},
		{"02", "Cryptography fundamentals", ""},

		{"03", "PostgreSQL", "systems, training, ops data"},
		{"03", "SQLite", ""},
		{"03", "Caching", "http cache headers, contribution cache"},

		{"04", "Linux", "vps, all services"},
		{"04", "Docker", "compose via dokploy"},
		{"04", "Kubernetes", ""},
		{"04", "CI/CD (GitHub Actions)", "build + deploy"},
		{"04", "AWS (S3 + CloudFront)", "s3 backups only, no cdn"},
		{"04", "Logging & observability", "alloy, prometheus, loki, grafana"},

		{"05", "Git", "one repo"},
		{"05", "Data structures & algorithms", ""},
		{"05", "OOP & functional programming", ""},
	}

	tracks := make([]store.ListTracksWithStateRow, 0, len(declared))
	evidence := make([]store.ListTrackEvidenceRow, 0, len(declared))

	for i, d := range declared {
		id := int64(i + 1)
		state := "queued"
		if d.evidence != "" {
			// One live system behind it: v_track_states says applied.
			state = "applied"
			detail := d.evidence
			evidence = append(evidence, store.ListTrackEvidenceRow{
				TrackID: id, Slug: "timseil-dev", SystemNo: "02", Detail: &detail,
			})
		}
		tracks = append(tracks, store.ListTracksWithStateRow{
			ModuleNo: d.module, TrackID: id, Name: d.name, State: state,
		})
	}

	return &stubQueries{modules: modules, tracks: tracks, evidence: evidence}
}

func newHandler(t *testing.T, q Queries) *Handler {
	t.Helper()
	h := New(q, slog.New(slog.NewTextHandler(io.Discard, nil)))
	h.now = func() time.Time { return time.Date(2026, 8, 17, 12, 0, 0, 0, time.UTC) }
	return h
}

// testRequestID is put into the context the way middleware.RequestID does it in
// production, so that the problem documents below can be checked for the field
// that makes a 500 traceable. Without it httpx omits requestId — correctly, but
// then the assertion would be testing the test.
const testRequestID = "0123456789abcdef0123456789abcdef"

func get(t *testing.T, h *Handler, ifNoneMatch string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, "/api/training", nil)
	r = r.WithContext(reqid.With(r.Context(), testRequestID))
	if ifNoneMatch != "" {
		r.Header.Set("If-None-Match", ifNoneMatch)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

// The response as JSON, kept raw so that "present and null" and "absent" stay
// two different observations — json.Unmarshal into map[string]any collapses them.
type jsonTrack struct {
	Name     string          `json:"name"`
	State    string          `json:"state"`
	Evidence json.RawMessage `json:"evidence"`
	Note     *string         `json:"note"`
}

type jsonModule struct {
	No     string      `json:"no"`
	Title  string      `json:"title"`
	Tracks []jsonTrack `json:"tracks"`
}

type jsonTraining struct {
	Modules         []jsonModule `json:"modules"`
	TrackCount      int          `json:"trackCount"`
	EvidenceSystems int          `json:"evidenceSystems"`
	GeneratedAt     string       `json:"generatedAt"`
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) jsonTraining {
	t.Helper()
	var body jsonTraining
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the response is not JSON: %v\n%s", err, rec.Body.String())
	}
	return body
}

func allTracks(body jsonTraining) []jsonTrack {
	var out []jsonTrack
	for _, m := range body.Modules {
		out = append(out, m.Tracks...)
	}
	return out
}

// ----------------------------------------------------------------- launch day

// The numbers the log claims about itself have to be the numbers a reader can
// count in it. This is the whole endpoint in one assertion.
func TestTheLaunchDayLogCountsItself(t *testing.T) {
	rec := get(t, newHandler(t, launchDay()), "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := decode(t, rec)

	if len(body.Modules) != 5 {
		t.Errorf("modules = %d, want 5", len(body.Modules))
	}

	counted := len(allTracks(body))
	if counted != 22 {
		t.Errorf("tracks in the tree = %d, want 22", counted)
	}
	if body.TrackCount != counted {
		t.Errorf("trackCount = %d, but the tree carries %d tracks",
			body.TrackCount, counted)
	}

	// Every one of the thirteen lines points at the same system, so the header
	// says one system rather than rounding the log up to thirteen.
	if body.EvidenceSystems != 1 {
		t.Errorf("evidenceSystems = %d, want 1", body.EvidenceSystems)
	}

	states := map[string]int{}
	for _, track := range allTracks(body) {
		states[track.State]++
	}
	for state, want := range map[string]int{"applied": 13, "queued": 9} {
		if states[state] != want {
			t.Errorf("%s = %d, want %d (states: %v)", state, states[state], want, states)
		}
	}
	// Zero core is the point of a launch-day log, and zero learning is what the
	// derivation actually says: nothing is in_build yet.
	for _, state := range []string{"core", "learning"} {
		if states[state] != 0 {
			t.Errorf("%s = %d on launch day, want 0", state, states[state])
		}
	}
}

// The nine tracks nobody has shipped are the honest half of this document. They
// keep their place, they carry an empty array rather than a missing one, and
// they say why.
func TestATrackWithoutEvidenceIsAnEmptyArrayAndANote(t *testing.T) {
	body := decode(t, get(t, newHandler(t, launchDay()), ""))

	withoutEvidence := 0
	for _, track := range allTracks(body) {
		empty := string(track.Evidence) == "[]"

		if empty {
			withoutEvidence++
			if track.Note == nil || *track.Note != "self-study" {
				t.Errorf("%s has no evidence and no self-study note: %v",
					track.Name, track.Note)
			}
			continue
		}

		// The contract: set only when `evidence` is empty.
		if track.Note != nil {
			t.Errorf("%s is backed by a system and still carries note %q",
				track.Name, *track.Note)
		}
	}

	if withoutEvidence != 9 {
		t.Errorf("tracks without evidence = %d, want 9", withoutEvidence)
	}
}

// `null` where the contract requires an array is a shape no generated client
// expects, and it is one forgotten `make` away. Asserted on the raw JSON,
// because that is where the difference lives.
func TestNoEvidenceArrayIsEverNull(t *testing.T) {
	body := decode(t, get(t, newHandler(t, launchDay()), ""))

	for _, track := range allTracks(body) {
		if string(track.Evidence) == "null" {
			t.Errorf("%s carries evidence: null, want []", track.Name)
		}
	}

	// The same rule one level up: a module without tracks, and the empty
	// database below.
	empty := &stubQueries{modules: []store.ListModulesRow{{ModuleNo: "06", Title: "Empty"}}}
	raw := get(t, newHandler(t, empty), "").Body.String()
	if !strings.Contains(raw, `"tracks":[]`) {
		t.Errorf("a module without tracks does not carry an empty array:\n%s", raw)
	}
}

// The header counts systems, not lines. Two tracks proven by one system are one
// system — the launch-day case — and the count only rises when a second system
// actually exists.
func TestTheHeaderCountsDistinctSystems(t *testing.T) {
	detail := "shipped"
	base := []store.ListModulesRow{{ModuleNo: "01", Title: "Languages"}}
	tracks := []store.ListTracksWithStateRow{
		{ModuleNo: "01", TrackID: 1, Name: "Go", State: "applied"},
		{ModuleNo: "01", TrackID: 2, Name: "SQL", State: "applied"},
	}

	cases := map[string]struct {
		evidence []store.ListTrackEvidenceRow
		want     int
	}{
		"one system behind both tracks": {
			evidence: []store.ListTrackEvidenceRow{
				{TrackID: 1, Slug: "timseil-dev", SystemNo: "02", Detail: &detail},
				{TrackID: 2, Slug: "timseil-dev", SystemNo: "02", Detail: &detail},
			},
			want: 1,
		},
		"two systems": {
			evidence: []store.ListTrackEvidenceRow{
				{TrackID: 1, Slug: "timseil-dev", SystemNo: "02", Detail: &detail},
				{TrackID: 2, Slug: "vat-check", SystemNo: "01", Detail: &detail},
			},
			want: 2,
		},
		"no evidence at all": {
			evidence: nil,
			want:     0,
		},
	}

	for what, c := range cases {
		q := &stubQueries{modules: base, tracks: tracks, evidence: c.evidence}
		body := decode(t, get(t, newHandler(t, q), ""))
		if body.EvidenceSystems != c.want {
			t.Errorf("%s: evidenceSystems = %d, want %d", what, body.EvidenceSystems, c.want)
		}
	}
}

// An empty database is an answer. Two zeroes and an empty list is what this
// endpoint says before the seed has ever run — not a 500, and not a 404.
func TestAnEmptyDatabaseIsAnEmptyLog(t *testing.T) {
	rec := get(t, newHandler(t, &stubQueries{}), "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	if raw := rec.Body.String(); !strings.Contains(raw, `"modules":[]`) {
		t.Errorf("modules is not an empty array:\n%s", raw)
	}

	body := decode(t, rec)
	if body.TrackCount != 0 || body.EvidenceSystems != 0 {
		t.Errorf("trackCount = %d, evidenceSystems = %d, want 0 and 0",
			body.TrackCount, body.EvidenceSystems)
	}
}

// The order is the design sheet's, and it is the store's to decide: modules by
// module_no, tracks by sort_order. The handler may not re-sort and may not lose
// the order to a map.
func TestTheOrderOfTheQueryIsTheOrderOfTheAnswer(t *testing.T) {
	body := decode(t, get(t, newHandler(t, launchDay()), ""))

	wantModules := []string{"01", "02", "03", "04", "05"}
	for i, want := range wantModules {
		if body.Modules[i].No != want {
			t.Fatalf("module %d = %s, want %s", i, body.Modules[i].No, want)
		}
	}

	// The first module in sheet order, not in alphabetical order — C before Go
	// would mean the handler sorted.
	wantTracks := []string{"Go", "TypeScript", "Python", "SQL", "C"}
	for i, want := range wantTracks {
		if got := body.Modules[0].Tracks[i].Name; got != want {
			t.Errorf("track %d of module 01 = %q, want %q", i, got, want)
		}
	}

	// Ten requests over the same data: a map iterated instead of a slice would
	// show up here as a moving tag.
	h := newHandler(t, launchDay())
	first := get(t, h, "").Header().Get("ETag")
	for i := 0; i < 10; i++ {
		if got := get(t, newHandler(t, launchDay()), "").Header().Get("ETag"); got != first {
			t.Fatalf("the tag moved between two identical answers: %q then %q", first, got)
		}
	}
}

// ---------------------------------------------------------- caching and 304

func TestTheCacheDirectiveAndETagArePresent(t *testing.T) {
	rec := get(t, newHandler(t, launchDay()), "")

	if got := rec.Header().Get("Cache-Control"); got != cacheControl {
		t.Errorf("Cache-Control = %q, want %q", got, cacheControl)
	}
	if rec.Header().Get("ETag") == "" {
		t.Error("no ETag")
	}
}

// With generatedAt inside the hash the tag would change every time the clock
// does, and the 304 path would be dead code that nobody notices.
func TestTheETagDoesNotMoveWithTheClock(t *testing.T) {
	first := newHandler(t, launchDay())
	second := newHandler(t, launchDay())
	second.now = func() time.Time { return time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC) }

	if a, b := get(t, first, "").Header().Get("ETag"), get(t, second, "").Header().Get("ETag"); a != b {
		t.Errorf("the tag moved with the clock: %q then %q", a, b)
	}
}

func TestAMatchingETagIs304(t *testing.T) {
	h := newHandler(t, launchDay())
	tag := get(t, h, "").Header().Get("ETag")

	for _, match := range []string{tag, "*", `W/"nonsense", ` + tag} {
		rec := get(t, newHandler(t, launchDay()), match)
		if rec.Code != http.StatusNotModified {
			t.Errorf("If-None-Match %q = %d, want 304", match, rec.Code)
		}
		if rec.Body.Len() != 0 {
			t.Errorf("If-None-Match %q returned a body of %d bytes", match, rec.Body.Len())
		}
	}

	if rec := get(t, newHandler(t, launchDay()), `"someone else's"`); rec.Code != http.StatusOK {
		t.Errorf("a foreign tag = %d, want 200", rec.Code)
	}
}

// A track that changes state changes the document, and a cached copy has to
// stop being valid. This is the reader-facing half of invariant 2: the derived
// state is what the tag is computed over.
func TestAChangedTrackStateChangesTheTag(t *testing.T) {
	before := get(t, newHandler(t, launchDay()), "").Header().Get("ETag")

	moved := launchDay()
	moved.tracks[0].State = "core"
	after := get(t, newHandler(t, moved), "").Header().Get("ETag")

	if before == after {
		t.Error("a track moved from applied to core and the tag stayed the same")
	}
}

func TestGeneratedAtIsTheInjectedTimeInUTC(t *testing.T) {
	body := decode(t, get(t, newHandler(t, launchDay()), ""))
	if body.GeneratedAt != "2026-08-17T12:00:00Z" {
		t.Errorf("generatedAt = %q, want the injected time in UTC", body.GeneratedAt)
	}
}

// ------------------------------------------------------------ the broken case

// A training log without its evidence is not a degraded document, it is a false
// one. Each of the three queries fails on its own here, and each has to produce
// a problem document rather than a partial log — with the connection details in
// the log and not in the body.
func TestABrokenDatabaseIsAProblemAndNotAPartialLog(t *testing.T) {
	cases := map[string]func() *stubQueries{
		"the modules": func() *stubQueries {
			q := launchDay()
			q.modulesErr = errUnreachable
			return q
		},
		"the tracks": func() *stubQueries {
			q := launchDay()
			q.tracksErr = errUnreachable
			return q
		},
		"the evidence": func() *stubQueries {
			q := launchDay()
			q.evidenceErr = errUnreachable
			return q
		},
	}

	for what, build := range cases {
		rec := get(t, newHandler(t, build()), "")

		if rec.Code != http.StatusInternalServerError {
			t.Errorf("%s broken = %d, want 500", what, rec.Code)
		}
		if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
			t.Errorf("%s broken: Content-Type = %q", what, got)
		}
		if got := rec.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("%s broken: Cache-Control = %q, want no-store", what, got)
		}

		var problem map[string]json.RawMessage
		if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
			t.Fatalf("%s broken: the problem document is not JSON: %v", what, err)
		}
		if _, ok := problem["requestId"]; !ok {
			t.Errorf("%s broken: the problem document carries no requestId", what)
		}

		for _, leak := range []string{"172.18.0.2", "timseil_app", "dial tcp", "host=db"} {
			if strings.Contains(rec.Body.String(), leak) {
				t.Errorf("%s broken: the response leaks %q\n%s", what, leak, rec.Body.String())
			}
		}
	}
}

// The states leave the database lowercase and stay that way. The interface
// uppercases them for display (handbook ch. 14); an API that shipped
// `SHIPPED IN` would put a rendering decision in the payload.
func TestTheStatesAndDetailsAreLowercase(t *testing.T) {
	body := decode(t, get(t, newHandler(t, launchDay()), ""))

	for _, track := range allTracks(body) {
		if track.State != strings.ToLower(track.State) {
			t.Errorf("%s carries state %q", track.Name, track.State)
		}
	}
}
