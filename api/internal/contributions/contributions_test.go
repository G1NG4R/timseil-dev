package contributions

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// stubQueries is the one row this endpoint reads, or the absence of it.
type stubQueries struct {
	row store.GetContributionsRow
	err error
}

func (s *stubQueries) GetContributions(context.Context, string) (store.GetContributionsRow, error) {
	return s.row, s.err
}

// cached is a stored calendar of a given age. The weeks are what the Refresher
// writes: the contract's steps, in jsonb's normalised form.
func cached(age time.Duration) *stubQueries {
	return &stubQueries{row: store.GetContributionsRow{
		TotalContributions: 412,
		Weeks: []byte(`[{"days": [{"date": "2026-08-10", "count": 0, "level": "l0"}, ` +
			`{"date": "2026-08-11", "count": 3, "level": "l1"}]}]`),
		FetchedAt:   pgtype.Timestamptz{Time: time.Date(2026, 8, 18, 6, 0, 0, 0, time.UTC), Valid: true},
		CacheAgeSec: int32(age.Seconds()),
	}}
}

func newHandler(t *testing.T, q Queries) *Handler {
	t.Helper()
	return New(q, "octocat", slog.New(slog.NewTextHandler(io.Discard, nil)))
}

// testRequestID is put into the context the way middleware.RequestID does in
// production, so the problem documents below can be checked for the field that
// makes a 502 traceable.
const testRequestID = "0123456789abcdef0123456789abcdef"

func get(t *testing.T, h *Handler, ifNoneMatch string) *httptest.ResponseRecorder {
	t.Helper()

	r := httptest.NewRequest(http.MethodGet, "/api/contributions", nil)
	r = r.WithContext(reqid.With(r.Context(), testRequestID))
	if ifNoneMatch != "" {
		r.Header.Set("If-None-Match", ifNoneMatch)
	}

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

// Raw on the arrays, so that "present and null" and "absent" stay two different
// observations — unmarshalling into map[string]any collapses them.
type jsonContributions struct {
	TotalContributions *int            `json:"totalContributions"`
	FetchedAt          string          `json:"fetchedAt"`
	CacheAgeSec        *int            `json:"cacheAgeSec"`
	Weeks              json.RawMessage `json:"weeks"`
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) jsonContributions {
	t.Helper()

	var body jsonContributions
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the response is not JSON: %v\n%s", err, rec.Body.String())
	}
	return body
}

func decodeProblem(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the problem is not JSON: %v\n%s", err, rec.Body.String())
	}
	return body
}

func etagOfResponse(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()

	tag := rec.Header().Get("ETag")
	if tag == "" {
		t.Fatal("no ETag on the response")
	}
	return tag
}

// ----------------------------------------------------------- the served answer

func TestACachedCalendarIsServedWithItsAge(t *testing.T) {
	rec := get(t, newHandler(t, cached(3*time.Hour)), "")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d\n%s", rec.Code, rec.Body.String())
	}

	body := decode(t, rec)
	if body.TotalContributions == nil || *body.TotalContributions != 412 {
		t.Errorf("totalContributions = %v", body.TotalContributions)
	}
	if body.CacheAgeSec == nil || *body.CacheAgeSec != 3*60*60 {
		t.Errorf("cacheAgeSec = %v, want %d", body.CacheAgeSec, 3*60*60)
	}
	// The four required fields are all present. A missing one is a shape no
	// generated client expects, and `weeks: null` is the specific miss that
	// would render as a blank year rather than as an error.
	if len(body.Weeks) == 0 || string(body.Weeks) == "null" {
		t.Errorf("weeks = %s", body.Weeks)
	}
	if body.FetchedAt == "" {
		t.Error("fetchedAt is missing")
	}
}

// The age is the row's, never the process's clock. This handler has no clock at
// all, and this is the test that fails if somebody gives it one.
func TestTheAgeIsWhateverTheRowSays(t *testing.T) {
	for _, age := range []time.Duration{0, time.Minute, 26 * time.Hour} {
		rec := get(t, newHandler(t, cached(age)), "")
		body := decode(t, rec)

		if body.CacheAgeSec == nil || *body.CacheAgeSec != int(age.Seconds()) {
			t.Errorf("age %s came back as %v", age, body.CacheAgeSec)
		}
	}
}

// A stale calendar is still a 200. This is the endpoint's promise and the
// difference between it and every other one on the site: elsewhere no
// measurement means `— NO DATA`, here there is a measurement and it is simply
// old, so it is served with its age rather than withheld.
func TestAVeryOldCalendarIsStillServed(t *testing.T) {
	rec := get(t, newHandler(t, cached(30*24*time.Hour)), "")

	if rec.Code != http.StatusOK {
		t.Fatalf("a month-old calendar was not served: %d", rec.Code)
	}
	if body := decode(t, rec); body.CacheAgeSec == nil || *body.CacheAgeSec == 0 {
		t.Errorf("the age was hidden: %v", body.CacheAgeSec)
	}
}

func TestFetchedAtIsUTC(t *testing.T) {
	body := decode(t, get(t, newHandler(t, cached(time.Hour)), ""))

	if !strings.HasSuffix(body.FetchedAt, "Z") {
		t.Errorf("fetchedAt = %q, want a UTC instant", body.FetchedAt)
	}
}

// --------------------------------------------------------------- the caching

func TestTheCacheDirectiveAndETagArePresent(t *testing.T) {
	rec := get(t, newHandler(t, cached(time.Hour)), "")

	if got := rec.Header().Get("Cache-Control"); got != cacheControl {
		t.Errorf("Cache-Control = %q, want %q", got, cacheControl)
	}
	if rec.Header().Get("ETag") == "" {
		t.Error("no ETag — ADR 0009 requires one on every public GET")
	}
}

// The test that keeps the 304 path alive.
//
// cacheAgeSec moves every second. If it were in the hash, every request would
// get a new tag, If-None-Match would never match, and the endpoint would go on
// looking correct while shipping a full body to every poll — a failure with no
// symptom.
func TestTheETagDoesNotMoveWithTheCacheAge(t *testing.T) {
	first := etagOfResponse(t, get(t, newHandler(t, cached(time.Minute)), ""))
	later := etagOfResponse(t, get(t, newHandler(t, cached(5*time.Hour)), ""))

	if first != later {
		t.Errorf("the tag moved with the age: %s then %s", first, later)
	}
}

// The other half: a tag that never moves is just as broken. A different calendar
// has to produce a different one, or a reader keeps the old year for ever.
func TestADifferentCalendarGetsADifferentETag(t *testing.T) {
	base := cached(time.Hour)

	moreDays := cached(time.Hour)
	moreDays.row.Weeks = []byte(`[{"days": [{"date": "2026-08-10", "count": 9, "level": "l4"}]}]`)

	moreTotal := cached(time.Hour)
	moreTotal.row.TotalContributions = 413

	first := etagOfResponse(t, get(t, newHandler(t, base), ""))
	second := etagOfResponse(t, get(t, newHandler(t, moreDays), ""))
	third := etagOfResponse(t, get(t, newHandler(t, moreTotal), ""))

	if first == second {
		t.Error("a changed calendar kept its tag")
	}
	// The total is part of the representation too: a day moving between weeks
	// could in principle leave the array equal and the header number different.
	if first == third {
		t.Error("a changed total kept its tag")
	}
}

func TestAMatchingETagIs304(t *testing.T) {
	h := newHandler(t, cached(time.Hour))
	tag := etagOfResponse(t, get(t, h, ""))

	rec := get(t, h, tag)
	if rec.Code != http.StatusNotModified {
		t.Fatalf("status = %d, want 304", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("a 304 carries a body: %s", rec.Body.String())
	}
	if rec.Header().Get("ETag") != tag {
		t.Errorf("the 304 does not repeat the tag: %q", rec.Header().Get("ETag"))
	}
}

func TestAStaleETagIsAFullAnswer(t *testing.T) {
	rec := get(t, newHandler(t, cached(time.Hour)), `"something-else-entirely"`)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
}

// ---------------------------------------------------------------- the failures

// The cold start, and the only way to reach a 502: GitHub has never answered
// since this database was created, so there is nothing to be old about. Every
// other outage is answered with the stored calendar and its age.
func TestAColdCacheIsA502AndNotAnEmptyCalendar(t *testing.T) {
	rec := get(t, newHandler(t, &stubQueries{err: pgx.ErrNoRows}), "")

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502\n%s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("Content-Type = %q", got)
	}
	// An error is never a cacheable representation. Without this it would be
	// stored under this path's s-maxage=3600 and outlive the breakage by an
	// hour.
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}

	body := decodeProblem(t, rec)
	if body["type"] != "https://timseil.dev/problems/upstream-unavailable" {
		t.Errorf("type = %v", body["type"])
	}
	if body["status"] != float64(http.StatusBadGateway) {
		t.Errorf("status in the body = %v", body["status"])
	}
	if body["requestId"] != testRequestID {
		t.Errorf("requestId = %v — a 502 nobody can quote is a 502 nobody can report", body["requestId"])
	}
	if body["instance"] != "/api/contributions" {
		t.Errorf("instance = %v", body["instance"])
	}
	// And it is not an empty calendar dressed as a success.
	if _, present := body["weeks"]; present {
		t.Error("the problem document carries a calendar")
	}
}

// A broken database is ours and stays ours. The driver message names a host and
// a role; none of it may reach a visitor.
func TestABrokenDatabaseIsAProblemAndNotAPartialCalendar(t *testing.T) {
	rec := get(t, newHandler(t, &stubQueries{err: errUnreachable}), "")

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}

	raw := rec.Body.String()
	for _, leak := range []string{"172.18.0.2", "timseil_app", "dial tcp", "host=db"} {
		if strings.Contains(raw, leak) {
			t.Errorf("the response leaks %q:\n%s", leak, raw)
		}
	}
	if body := decodeProblem(t, rec); body["type"] != "https://timseil.dev/problems/internal-error" {
		t.Errorf("type = %v", body["type"])
	}
}

// Stored bytes that are not a calendar are our failure, not GitHub's, and they
// are a 500 rather than a half-drawn year. Unreachable while the CHECK on the
// table holds — which is why it is worth knowing what happens if it ever does
// not.
func TestUnreadableStoredWeeksAreA500(t *testing.T) {
	broken := cached(time.Hour)
	broken.row.Weeks = []byte(`{"not":"an array"`)

	rec := get(t, newHandler(t, broken), "")
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
}
