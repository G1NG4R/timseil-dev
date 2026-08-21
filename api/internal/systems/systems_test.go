package systems

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// stubQueries is the database as these two endpoints see it. Every field is a
// deliberate state of the world, and the counters exist because two of the
// assertions below are about a query NOT being made.
type stubQueries struct {
	list    []store.ListSystemsRow
	listErr error

	system    store.GetSystemBySlugRow
	systemErr error

	metrics    store.LatestMetricsRow
	metricsErr error

	days    []store.OpsDaysForSystemRow
	daysErr error

	incidents    []store.IncidentsForSystemRow
	incidentsErr error

	deploys    []store.DeploysForSystemRow
	deploysErr error

	calls        int
	lastDayspan  int32
	lastSystemID int64
}

func (s *stubQueries) ListSystems(context.Context) ([]store.ListSystemsRow, error) {
	s.calls++
	return s.list, s.listErr
}

func (s *stubQueries) GetSystemBySlug(_ context.Context, slug string) (store.GetSystemBySlugRow, error) {
	s.calls++
	if s.systemErr != nil {
		return store.GetSystemBySlugRow{}, s.systemErr
	}
	if slug != s.system.Slug {
		return store.GetSystemBySlugRow{}, pgx.ErrNoRows
	}
	return s.system, nil
}

func (s *stubQueries) LatestMetrics(context.Context, string) (store.LatestMetricsRow, error) {
	s.calls++
	return s.metrics, s.metricsErr
}

func (s *stubQueries) OpsDaysForSystem(_ context.Context, arg store.OpsDaysForSystemParams) (
	[]store.OpsDaysForSystemRow, error,
) {
	s.calls++
	s.lastDayspan = arg.WindowSize
	s.lastSystemID = arg.SystemID
	return s.days, s.daysErr
}

func (s *stubQueries) IncidentsForSystem(_ context.Context, _ store.IncidentsForSystemParams) (
	[]store.IncidentsForSystemRow, error,
) {
	s.calls++
	return s.incidents, s.incidentsErr
}

func (s *stubQueries) DeploysForSystem(_ context.Context, _ store.DeploysForSystemParams) (
	[]store.DeploysForSystemRow, error,
) {
	s.calls++
	return s.deploys, s.deploysErr
}

// The two systems the seed writes, in the shape the list query returns them: no
// measurements anywhere, because the seed writes content and never numbers.
func liveRow() store.ListSystemsRow {
	url := "https://github.com/G1NG4R/timseil-dev"
	return store.ListSystemsRow{
		Slug: "timseil-dev", SystemNo: "02", Name: "timseil.dev", State: "live",
		SourceAccess: "public", SourceUrl: &url,
		Stack: []string{"Next.js 16.3", "Go 1.26", "PostgreSQL 18.6"},
	}
}

func queuedRow() store.ListSystemsRow {
	reason := "internal"
	return store.ListSystemsRow{
		Slug: "vat-check", SystemNo: "01", Name: "VAT Check API", State: "queued",
		SourceAccess: "private", SourceReason: &reason,
		Stack: []string{"Python", "FastAPI"},
	}
}

// dayOne is the state after the seed and before the probe has ever run.
func dayOne() *stubQueries {
	live := liveRow()
	url := *live.SourceUrl
	return &stubQueries{
		list: []store.ListSystemsRow{queuedRow(), live},
		system: store.GetSystemBySlugRow{
			ID: 2, Slug: live.Slug, SystemNo: live.SystemNo, Name: live.Name,
			State: live.State, SourceAccess: live.SourceAccess, SourceUrl: &url,
			Stack: live.Stack,
		},
		metricsErr: pgx.ErrNoRows,
	}
}

// queuedOnly answers the detail endpoint for the system that is not live.
func queuedOnly() *stubQueries {
	row := queuedRow()
	reason := *row.SourceReason
	return &stubQueries{
		list: []store.ListSystemsRow{row},
		system: store.GetSystemBySlugRow{
			ID: 1, Slug: row.Slug, SystemNo: row.SystemNo, Name: row.Name,
			State: row.State, SourceAccess: row.SourceAccess, SourceReason: &reason,
			Stack: row.Stack,
		},
		metricsErr: pgx.ErrNoRows,
	}
}

// errUnreachable is what a dead database actually looks like, host and port
// included — which is the point: none of it may reach a response body.
var errUnreachable = errors.New("failed to connect to `host=db user=timseil_app`: " +
	"dial tcp 172.18.0.2:5432: connect: connection refused")

func newHandler(t *testing.T, q Queries) *Handler {
	t.Helper()
	h := New(q, slog.New(slog.NewTextHandler(io.Discard, nil)))
	h.now = func() time.Time { return time.Date(2026, 8, 17, 12, 0, 0, 0, time.UTC) }
	return h
}

func getList(t *testing.T, h *Handler, ifNoneMatch string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, "/api/systems", nil)
	if ifNoneMatch != "" {
		r.Header.Set("If-None-Match", ifNoneMatch)
	}
	rec := httptest.NewRecorder()
	h.ServeList(rec, r)
	return rec
}

// getDetail goes through a ServeMux rather than calling ServeDetail directly,
// because r.PathValue("slug") is only populated by the pattern that matched.
func getDetail(t *testing.T, h *Handler, slug, query, ifNoneMatch string) *httptest.ResponseRecorder {
	t.Helper()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/systems/{slug}", h.ServeDetail)

	target := "/api/systems/" + slug
	if query != "" {
		target += "?" + query
	}
	r := httptest.NewRequest(http.MethodGet, target, nil)
	if ifNoneMatch != "" {
		r.Header.Set("If-None-Match", ifNoneMatch)
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, r)
	return rec
}

// decode keeps the values raw, so "present and null" and "absent" stay two
// different observations. json.Unmarshal into map[string]any collapses them.
func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]json.RawMessage {
	t.Helper()
	var body map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the response is not JSON: %v\n%s", err, rec.Body.String())
	}
	return body
}

func decodeInto(t *testing.T, raw json.RawMessage) map[string]json.RawMessage {
	t.Helper()
	var out map[string]json.RawMessage
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("not an object: %v\n%s", err, raw)
	}
	return out
}

// ------------------------------------------------------------- the golden test

// The acceptance criterion of this phase, on the list: every system with a state
// other than live carries null in EVERY metric field.
//
// Asserted on the raw JSON rather than on the Go struct, because the failure
// this guards against is a serialisation one. An `omitempty` on a nullable field
// would leave every Go-level assertion green while turning "no measurement" into
// "no such field" — and the site renders a missing field the way it renders a
// zero.
func TestEverySystemThatIsNotLiveHasNullInEveryMetricField(t *testing.T) {
	// A live system that HAS numbers, so the test cannot pass by the answer
	// being empty everywhere.
	uptime, p95, rate := 99.64, 142.0, 0.0007
	measured := time.Date(2026, 8, 17, 11, 55, 0, 0, time.UTC)

	live := liveRow()
	live.Uptime90d, live.P95Ms, live.ErrorRate = &uptime, &p95, &rate
	live.MeasuredAt = pgtype.Timestamptz{Time: measured, Valid: true}

	q := &stubQueries{list: []store.ListSystemsRow{queuedRow(), live}}

	rec := getList(t, newHandler(t, q), "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var payload struct {
		Systems []struct {
			Slug    string                     `json:"slug"`
			State   string                     `json:"state"`
			Metrics map[string]json.RawMessage `json:"metrics"`
		} `json:"systems"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("the response is not JSON: %v", err)
	}
	if len(payload.Systems) != 2 {
		t.Fatalf("got %d systems, want 2", len(payload.Systems))
	}

	fields := []string{"uptime90d", "p95Ms", "errorRate", "measuredAt"}
	var sawLiveWithNumbers bool

	for _, system := range payload.Systems {
		for _, field := range fields {
			value, present := system.Metrics[field]
			if !present {
				t.Errorf("%s: metrics has no %q key at all — null is a value, not an absence",
					system.Slug, field)
				continue
			}
			if system.State == "live" {
				if string(value) != "null" {
					sawLiveWithNumbers = true
				}
				continue
			}
			if string(value) != "null" {
				t.Errorf("%s is %s and carries %s = %s — invariant 3",
					system.Slug, system.State, field, value)
			}
		}
	}

	if !sawLiveWithNumbers {
		t.Error("the live system carried no numbers, so this test proved nothing")
	}
}

// The same rule on the detail endpoint. It reaches the metrics through a
// different query, so it can break on its own.
func TestTheDetailOfASystemThatIsNotLiveHasNullMetrics(t *testing.T) {
	rec := getDetail(t, newHandler(t, queuedOnly()), "vat-check", "", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	metrics := decodeInto(t, decode(t, rec)["metrics"])
	for _, field := range []string{"uptime90d", "p95Ms", "errorRate", "measuredAt"} {
		value, present := metrics[field]
		if !present {
			t.Errorf("metrics has no %q key", field)
			continue
		}
		if string(value) != "null" {
			t.Errorf("a queued system carries %s = %s", field, value)
		}
	}
}

// Day one on a live system: the seed has run, the probe has not. Four nulls,
// never four zeros — the case invariant 1 exists for.
func TestALiveSystemWithNoMeasurementCarriesNullsNotZeros(t *testing.T) {
	rec := getList(t, newHandler(t, dayOne()), "")

	var payload struct {
		Systems []struct {
			Slug    string                     `json:"slug"`
			Metrics map[string]json.RawMessage `json:"metrics"`
		} `json:"systems"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("the response is not JSON: %v", err)
	}

	for _, system := range payload.Systems {
		for field, value := range system.Metrics {
			if string(value) == "0" {
				t.Errorf("%s reports %s = 0 where nothing was measured", system.Slug, field)
			}
			if string(value) != "null" {
				t.Errorf("%s reports %s = %s on a database with no measurements",
					system.Slug, field, value)
			}
		}
	}
}

// ------------------------------------------------------- the three arrays

// The contract says days, incidents and deploys are present only for a live
// system. Absent and empty are two different claims: "this system has no
// operation grid" is true for a system in build, "its grid is blank" is not.
func TestTheOperationArraysAreAbsentUnlessTheSystemIsLive(t *testing.T) {
	body := decode(t, getDetail(t, newHandler(t, queuedOnly()), "vat-check", "", ""))

	for _, key := range []string{"days", "incidents", "deploys"} {
		if _, present := body[key]; present {
			t.Errorf("a queued system carries %q", key)
		}
	}
}

// And they are present for a live one, even when every one of them is empty:
// a live system with nothing recorded yet still has a grid, it is just blank.
func TestTheOperationArraysArePresentAndEmptyForALiveSystemWithNoHistory(t *testing.T) {
	body := decode(t, getDetail(t, newHandler(t, dayOne()), "timseil-dev", "", ""))

	for _, key := range []string{"days", "incidents", "deploys"} {
		value, present := body[key]
		if !present {
			t.Errorf("a live system is missing %q", key)
			continue
		}
		if string(value) != "[]" {
			t.Errorf("%s = %s, want an empty array", key, value)
		}
	}
}

// The grid passes through what the query produced, states and notch included.
// The handler does not compute a day state — that is the query's job, and this
// asserts the handler does not quietly reinterpret one.
func TestTheGridIsPassedThroughUntouched(t *testing.T) {
	notch := "INC-001"
	day := func(date string, state string, down int32, incident *string) store.OpsDaysForSystemRow {
		at, err := time.Parse(time.DateOnly, date)
		if err != nil {
			t.Fatalf("bad test date: %v", err)
		}
		return store.OpsDaysForSystemRow{
			Day:        pgtype.Date{Time: at, Valid: true},
			State:      state,
			DownSec:    down,
			IncidentID: incident,
		}
	}

	q := dayOne()
	q.days = []store.OpsDaysForSystemRow{
		day("2026-06-10", "nodata", 0, nil),
		day("2026-06-11", "ok", 0, nil),
		day("2026-06-12", "outage", 3600, &notch),
	}

	body := decode(t, getDetail(t, newHandler(t, q), "timseil-dev", "", ""))

	var days []struct {
		D          string  `json:"d"`
		State      string  `json:"state"`
		DownSec    int     `json:"downSec"`
		IncidentID *string `json:"incidentId"`
	}
	if err := json.Unmarshal(body["days"], &days); err != nil {
		t.Fatalf("days is not an array: %v", err)
	}
	if len(days) != 3 {
		t.Fatalf("got %d days, want 3", len(days))
	}

	if days[0].State != "nodata" || days[0].D != "2026-06-10" {
		t.Errorf("first cell = %s / %s, want 2026-06-10 / nodata", days[0].D, days[0].State)
	}
	if days[0].IncidentID != nil {
		t.Error("a nodata day carries a notch")
	}
	if days[2].State != "outage" || days[2].DownSec != 3600 {
		t.Errorf("third cell = %s / %ds, want outage / 3600s", days[2].State, days[2].DownSec)
	}
	if days[2].IncidentID == nil || *days[2].IncidentID != notch {
		t.Errorf("the outage lost its notch: %v", days[2].IncidentID)
	}
}

// ---------------------------------------------------------------- the window

func TestAnAbsentWindowIsNinetyOne(t *testing.T) {
	q := dayOne()
	body := decode(t, getDetail(t, newHandler(t, q), "timseil-dev", "", ""))

	if string(body["window"]) != "91" {
		t.Errorf("window = %s, want 91", body["window"])
	}
	if q.lastDayspan != 91 {
		t.Errorf("the grid was asked for %d days, want 91", q.lastDayspan)
	}
	// The ops queries take the surrogate key from the row that was just read,
	// not a second lookup by slug — the id is why GetSystemBySlug returns it.
	if q.lastSystemID != q.system.ID {
		t.Errorf("the grid was read for system %d, want %d", q.lastSystemID, q.system.ID)
	}
}

func TestTheThreeContractWindowsAreAccepted(t *testing.T) {
	for _, want := range []string{"30", "91", "182"} {
		q := dayOne()
		rec := getDetail(t, newHandler(t, q), "timseil-dev", "window="+want, "")
		if rec.Code != http.StatusOK {
			t.Errorf("window=%s = %d, want 200", want, rec.Code)
			continue
		}
		if got := string(decode(t, rec)["window"]); got != want {
			t.Errorf("asked for window=%s, answered %s", want, got)
		}
		n, err := strconv.Atoi(want)
		if err != nil {
			t.Fatalf("bad test window %q: %v", want, err)
		}
		if q.lastDayspan != int32(n) {
			t.Errorf("window=%s reached the query as %d", want, q.lastDayspan)
		}
	}
}

// A window outside the enum is a 400 with the field named, not a silent fall
// back to 91. The silent version is the failure worth a test: it would answer
// 200 with a document that looks entirely correct and covers a period nobody
// asked about.
func TestAWindowOutsideTheEnumIsRejectedRatherThanReplaced(t *testing.T) {
	for _, bad := range []string{"45", "0", "-91", "90", "9999", "ninety-one", "91.0"} {
		q := dayOne()
		rec := getDetail(t, newHandler(t, q), "timseil-dev", "window="+bad, "")

		if rec.Code != http.StatusBadRequest {
			t.Errorf("window=%s = %d, want 400", bad, rec.Code)
			continue
		}
		if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
			t.Errorf("window=%s answered %q", bad, got)
		}

		var problem struct {
			Type          string `json:"type"`
			Status        int    `json:"status"`
			InvalidParams []struct {
				Name   string `json:"name"`
				Reason string `json:"reason"`
			} `json:"invalidParams"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
			t.Fatalf("the 400 is not a problem document: %v", err)
		}
		if problem.Status != http.StatusBadRequest {
			t.Errorf("window=%s: status field = %d", bad, problem.Status)
		}
		if len(problem.InvalidParams) != 1 || problem.InvalidParams[0].Name != "window" {
			t.Errorf("window=%s: invalidParams = %+v, want one entry naming window",
				bad, problem.InvalidParams)
		}
		if q.calls != 0 {
			t.Errorf("window=%s reached the database %d times before being rejected",
				bad, q.calls)
		}
	}
}

// ------------------------------------------------------------------ not found

func TestAnUnknownSlugIsAProblemDocument(t *testing.T) {
	rec := getDetail(t, newHandler(t, dayOne()), "no-such-system", "", "")

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("Content-Type = %q, want application/problem+json", got)
	}
	// An error is never a cacheable representation.
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control on the 404 = %q, want no-store", got)
	}

	var problem struct {
		Type     string `json:"type"`
		Status   int    `json:"status"`
		Instance string `json:"instance"`
		Detail   string `json:"detail"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
		t.Fatalf("the 404 is not a problem document: %v", err)
	}
	if problem.Type != "https://timseil.dev/problems/not-found" {
		t.Errorf("type = %q", problem.Type)
	}
	if problem.Status != http.StatusNotFound {
		t.Errorf("status field = %d", problem.Status)
	}
	if problem.Instance != "/api/systems/no-such-system" {
		t.Errorf("instance = %q", problem.Instance)
	}
}

// A slug the table's own CHECK forbids cannot name a row, so the answer is known
// before Postgres is asked. The assertion that matters is the call count: a
// path segment of any size or shape must not become a query.
//
// Driven through the strict method rather than an HTTP request, because some of
// these cannot be put into a URL at all — and PathValue hands the handler the
// decoded segment, which is exactly what is being tested.
func TestAMalformedSlugIsRejectedWithoutAskingTheDatabase(t *testing.T) {
	malformed := []string{
		"NOT_A_SLUG",
		"trailing-",
		"-leading",
		"double--dash",
		"has spaces",
		"ünïcode",
		"a/../b",
		"",
		longSlug(),
	}

	for _, slug := range malformed {
		q := dayOne()
		_, err := newHandler(t, q).GetSystem(context.Background(),
			httpx.GetSystemRequestObject{Slug: slug})

		if !errors.Is(err, ErrNoSuchSystem) {
			t.Errorf("slug %.20q = %v, want ErrNoSuchSystem", slug, err)
		}
		if q.calls != 0 {
			t.Errorf("slug %.20q reached the database %d times", slug, q.calls)
		}
	}

	// And the adapter turns that into the status the contract declares.
	if rec := getDetail(t, newHandler(t, dayOne()), "NOT_A_SLUG", "", ""); rec.Code != http.StatusNotFound {
		t.Errorf("a malformed slug over HTTP = %d, want 404", rec.Code)
	}
}

// longSlug is a valid-looking slug over the contract's maxLength of 64.
func longSlug() string {
	return strings.Repeat("a", 80)
}

// ------------------------------------------------------------ caching and 304

func TestTheCacheDirectiveAndETagAreOnBothEndpoints(t *testing.T) {
	list := getList(t, newHandler(t, dayOne()), "")
	detail := getDetail(t, newHandler(t, dayOne()), "timseil-dev", "", "")

	for name, rec := range map[string]*httptest.ResponseRecorder{"list": list, "detail": detail} {
		if got := rec.Header().Get("Cache-Control"); got != cacheControl {
			t.Errorf("%s: Cache-Control = %q, want %q", name, got, cacheControl)
		}
		if rec.Header().Get("ETag") == "" {
			t.Errorf("%s: no ETag", name)
		}
	}
}

// The tag must survive the clock. If generatedAt were in the hash, every request
// would produce a new tag, If-None-Match would never match, and the 304 branch
// would be dead code that still looks correct.
func TestTheETagDoesNotMoveWithTheClock(t *testing.T) {
	h := newHandler(t, dayOne())
	first := getList(t, h, "").Header().Get("ETag")

	h.now = func() time.Time { return time.Date(2026, 8, 18, 3, 30, 0, 0, time.UTC) }
	second := getList(t, h, "").Header().Get("ETag")

	if first != second {
		t.Errorf("the tag moved with the clock: %s then %s", first, second)
	}
}

func TestAMatchingETagIs304OnBothEndpoints(t *testing.T) {
	h := newHandler(t, dayOne())

	tag := getList(t, h, "").Header().Get("ETag")
	rec := getList(t, h, tag)
	if rec.Code != http.StatusNotModified {
		t.Errorf("the list answered %d to its own tag", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("the 304 carried a body of %d bytes", rec.Body.Len())
	}

	tag = getDetail(t, h, "timseil-dev", "", "").Header().Get("ETag")
	if rec := getDetail(t, h, "timseil-dev", "", tag); rec.Code != http.StatusNotModified {
		t.Errorf("the detail answered %d to its own tag", rec.Code)
	}
}

// Two windows are two representations. Sharing a tag would let a client that
// asked for 30 days be handed a cached 91-day answer with a 304 — the cache
// turning a correct handler into a wrong response.
func TestTwoWindowsDoNotShareATag(t *testing.T) {
	h := newHandler(t, dayOne())

	short := getDetail(t, h, "timseil-dev", "window=30", "").Header().Get("ETag")
	long := getDetail(t, h, "timseil-dev", "window=91", "").Header().Get("ETag")

	if short == long {
		t.Errorf("window=30 and window=91 share the tag %s", short)
	}
	if rec := getDetail(t, h, "timseil-dev", "window=91", short); rec.Code == http.StatusNotModified {
		t.Error("a 30-day tag produced a 304 on the 91-day representation")
	}
}

// ------------------------------------------------------------------- failures

// A broken database is a 500, not an answer with zeros in it. Both endpoints,
// and both have to keep the driver's message — host, port and role included —
// out of the body.
func TestABrokenDatabaseIsAProblemAndNotAnEmptyAnswer(t *testing.T) {
	cases := map[string]func() *stubQueries{
		"the list": func() *stubQueries {
			return &stubQueries{listErr: errUnreachable}
		},
		"the system row": func() *stubQueries {
			q := dayOne()
			q.systemErr = errUnreachable
			return q
		},
		"the metrics": func() *stubQueries {
			q := dayOne()
			q.metricsErr = errUnreachable
			return q
		},
		"the grid": func() *stubQueries {
			q := dayOne()
			q.daysErr = errUnreachable
			return q
		},
		"the incidents": func() *stubQueries {
			q := dayOne()
			q.incidentsErr = errUnreachable
			return q
		},
		"the deploys": func() *stubQueries {
			q := dayOne()
			q.deploysErr = errUnreachable
			return q
		},
	}

	for what, build := range cases {
		q := build()

		var rec *httptest.ResponseRecorder
		if what == "the list" {
			rec = getList(t, newHandler(t, q), "")
		} else {
			rec = getDetail(t, newHandler(t, q), "timseil-dev", "", "")
		}

		if rec.Code != http.StatusInternalServerError {
			t.Errorf("%s broken = %d, want 500", what, rec.Code)
		}
		if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
			t.Errorf("%s broken: Content-Type = %q", what, got)
		}
		for _, leak := range []string{"172.18.0.2", "timseil_app", "dial tcp", "host=db"} {
			if strings.Contains(rec.Body.String(), leak) {
				t.Errorf("%s broken: the response leaks %q\n%s", what, leak, rec.Body.String())
			}
		}
	}
}

// A row that satisfies neither half of the source axis cannot come out of
// Postgres — systems_source_axis_ck forbids it. If it ever does, the answer is a
// 500 with a log line, not a system quietly rendered as closed.
func TestARowThatBreaksTheSourceAxisIsAFailureNotAGuess(t *testing.T) {
	broken := queuedRow()
	broken.SourceReason = nil // private with no reason

	rec := getList(t, newHandler(t, &stubQueries{list: []store.ListSystemsRow{broken}}), "")
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
}

// An empty database is an answer. This is the endpoint that has to work before
// the seed has ever run, and `systems: []` is what it says then — the key is
// present and the array is empty, never null.
func TestAnEmptyDatabaseIsAnEmptyList(t *testing.T) {
	rec := getList(t, newHandler(t, &stubQueries{}), "")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := string(decode(t, rec)["systems"]); got != "[]" {
		t.Errorf("systems = %s, want []", got)
	}
}

// ---------------------------------------------------------------- the mapping

// The source axis is a separate axis from state, and the contract's oneOf is
// discriminated by `access`. A system can be open and not running, or running
// and closed; squeezing both into one field is the mistake the contract avoids.
func TestTheSourceAxisSurvivesTheMapping(t *testing.T) {
	body := decode(t, getList(t, newHandler(t, dayOne()), ""))

	var payload struct {
		Systems []struct {
			Slug   string `json:"slug"`
			State  string `json:"state"`
			Source struct {
				Access string `json:"access"`
				URL    string `json:"url"`
				Reason string `json:"reason"`
			} `json:"source"`
		} `json:"systems"`
	}
	if err := json.Unmarshal(body["systems"], &payload.Systems); err != nil {
		t.Fatalf("systems is not an array: %v", err)
	}

	for _, system := range payload.Systems {
		switch system.Slug {
		case "vat-check":
			if system.Source.Access != "private" || system.Source.Reason != "internal" {
				t.Errorf("vat-check source = %+v, want private / internal", system.Source)
			}
			if system.Source.URL != "" {
				t.Errorf("a private system carries a url: %q", system.Source.URL)
			}
			// The point of the separate axis: closed, and also not running.
			if system.State != "queued" {
				t.Errorf("vat-check state = %q, want queued", system.State)
			}
		case "timseil-dev":
			if system.Source.Access != "public" || system.Source.URL == "" {
				t.Errorf("timseil-dev source = %+v, want public with a url", system.Source)
			}
			if system.Source.Reason != "" {
				t.Errorf("a public system carries a reason: %q", system.Source.Reason)
			}
		}
	}
}

// The API speaks lowercase; the interface uppercases it for display. A handler
// that shouted would make the UI's own transformation a second source of truth.
func TestTheStatesAreLowercase(t *testing.T) {
	body := decode(t, getList(t, newHandler(t, dayOne()), ""))

	var systems []struct {
		State string `json:"state"`
	}
	if err := json.Unmarshal(body["systems"], &systems); err != nil {
		t.Fatalf("systems is not an array: %v", err)
	}
	for _, system := range systems {
		if system.State != "live" && system.State != "in_build" && system.State != "queued" {
			t.Errorf("state = %q, want one of the contract's three lowercase values", system.State)
		}
	}
}

// SystemDetail is `allOf: [System, ...]`, but oapi-codegen flattens it into its
// own struct — so the handler copies the seven System fields across by hand and
// nothing makes it. A field added to System in the contract would appear in the
// list, be missing from the detail, and every other test here would stay green.
//
// This is that test: every key the list produces for a system has to appear in
// the detail of the same system.
func TestTheDetailCarriesEveryFieldTheListDoes(t *testing.T) {
	h := newHandler(t, dayOne())

	var list struct {
		Systems []map[string]json.RawMessage `json:"systems"`
	}
	if err := json.Unmarshal(getList(t, h, "").Body.Bytes(), &list); err != nil {
		t.Fatalf("the list is not JSON: %v", err)
	}

	var entry map[string]json.RawMessage
	for _, system := range list.Systems {
		if string(system["slug"]) == `"timseil-dev"` {
			entry = system
		}
	}
	if entry == nil {
		t.Fatal("the list does not contain the system the detail is read for")
	}

	detail := decode(t, getDetail(t, h, "timseil-dev", "", ""))
	for key, want := range entry {
		got, present := detail[key]
		if !present {
			t.Errorf("the detail is missing %q, which the list carries", key)
			continue
		}
		if string(got) != string(want) {
			t.Errorf("%s: list says %s, detail says %s", key, want, got)
		}
	}
}

// generatedAt is what the clock says, in UTC, and it is not in the tag.
func TestGeneratedAtIsTheInjectedTimeInUTC(t *testing.T) {
	body := decode(t, getList(t, newHandler(t, dayOne()), ""))

	var at time.Time
	if err := json.Unmarshal(body["generatedAt"], &at); err != nil {
		t.Fatalf("generatedAt is not a time: %v", err)
	}
	if !at.Equal(time.Date(2026, 8, 17, 12, 0, 0, 0, time.UTC)) {
		t.Errorf("generatedAt = %s", at)
	}
	if at.Location() != time.UTC {
		t.Errorf("generatedAt is not UTC: %s", at.Location())
	}
}
