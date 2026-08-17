package health

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

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// stubQueries is the database as this endpoint sees it. Every field is a
// deliberate state of the world: an empty database, a seeded one with nothing
// measured, a measured one, a broken one.
type stubQueries struct {
	counts    store.HealthCountsRow
	countsErr error

	state    string
	stateErr error

	metrics    store.LatestMetricsRow
	metricsErr error

	deploy    store.LastDeployRow
	deployErr error
}

func (s stubQueries) HealthCounts(context.Context) (store.HealthCountsRow, error) {
	return s.counts, s.countsErr
}

func (s stubQueries) SelfState(context.Context, string) (string, error) {
	return s.state, s.stateErr
}

func (s stubQueries) LatestMetrics(context.Context, string) (store.LatestMetricsRow, error) {
	return s.metrics, s.metricsErr
}

func (s stubQueries) LastDeploy(context.Context, string) (store.LastDeployRow, error) {
	return s.deploy, s.deployErr
}

// dayOne is the state after B4's seed and before the probe has ever run: two
// systems, one of them live, and not a single measurement anywhere.
func dayOne() stubQueries {
	return stubQueries{
		counts:     store.HealthCountsRow{SystemsLive: 1, SystemsTotal: 2},
		state:      "live",
		metricsErr: pgx.ErrNoRows,
		deployErr:  pgx.ErrNoRows,
	}
}

// errUnreachable is what a dead database actually looks like, host and port
// included — which is the point: none of it may reach a response body.
var errUnreachable = errors.New("failed to connect to `host=db user=timseil_app`: " +
	"dial tcp 172.18.0.2:5432: connect: connection refused")

func newHandler(t *testing.T, q Queries) *Handler {
	t.Helper()
	h := New(q, Build{
		Version:   "dev",
		SHA:       "unknown",
		StartedAt: time.Date(2026, 8, 17, 9, 0, 0, 0, time.UTC),
	}, "timseil-dev", slog.New(slog.NewTextHandler(io.Discard, nil)))
	h.now = func() time.Time { return time.Date(2026, 8, 17, 12, 0, 0, 0, time.UTC) }
	return h
}

func get(t *testing.T, h *Handler, ifNoneMatch string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	if ifNoneMatch != "" {
		r.Header.Set("If-None-Match", ifNoneMatch)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the response is not JSON: %v\n%s", err, rec.Body.String())
	}
	return body
}

// Invariant 1, at the one place it is easiest to break in Go: the four metric
// keys have to be PRESENT and null, not absent. An `omitempty` on a nullable
// field would make this endpoint pass every other test in this file while
// quietly turning "no measurement" into "no such field" — and the site renders
// a missing field the same way it renders a zero.
func TestOnDayOneEveryMetricIsNullAndPresent(t *testing.T) {
	rec := get(t, newHandler(t, dayOne()), "")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	ops, ok := decode(t, rec)["ops"].(map[string]any)
	if !ok {
		t.Fatal("the response has no ops object")
	}

	for _, key := range []string{"uptime90d", "p95Ms", "errorRate", "measuredAt", "lastDeploy"} {
		value, present := ops[key]
		if !present {
			t.Errorf("ops.%s is missing — a missing field reads as no data, and so "+
				"would a zero; the contract says null", key)
			continue
		}
		if value != nil {
			t.Errorf("ops.%s = %v, want null", key, value)
		}
	}

	if ops["systemsLive"] != float64(1) || ops["systemsTotal"] != float64(2) {
		t.Errorf("counts = %v / %v, want 1 / 2", ops["systemsLive"], ops["systemsTotal"])
	}
}

func TestAMeasuredSystemReportsItsNumbers(t *testing.T) {
	uptime, p95, errorRate := 99.64, 142.0, 0.0007
	q := dayOne()
	q.metricsErr = nil
	q.metrics = store.LatestMetricsRow{
		Uptime90d:  &uptime,
		P95Ms:      &p95,
		ErrorRate:  &errorRate,
		MeasuredAt: pgtype.Timestamptz{Time: time.Date(2026, 8, 17, 11, 55, 0, 0, time.UTC), Valid: true},
	}

	ops := decode(t, get(t, newHandler(t, q), ""))["ops"].(map[string]any)

	if ops["uptime90d"] != 99.64 || ops["p95Ms"] != 142.0 {
		t.Errorf("metrics = %v", ops)
	}
	// Zero is a real measurement and must survive as one.
	if ops["errorRate"] != 0.0007 {
		t.Errorf("errorRate = %v", ops["errorRate"])
	}
}

// A zero error rate is an excellent value; a missing one is not a value at all.
// Rendering them the same way would be the most elegant way to lie.
func TestAZeroMeasurementIsNotMistakenForNoData(t *testing.T) {
	zero := 0.0
	q := dayOne()
	q.metricsErr = nil
	q.metrics = store.LatestMetricsRow{
		ErrorRate:  &zero,
		MeasuredAt: pgtype.Timestamptz{Time: time.Now(), Valid: true},
	}

	ops := decode(t, get(t, newHandler(t, q), ""))["ops"].(map[string]any)

	if ops["errorRate"] != float64(0) {
		t.Errorf("errorRate = %v, want 0", ops["errorRate"])
	}
	if ops["uptime90d"] != nil {
		t.Errorf("uptime90d = %v, want null", ops["uptime90d"])
	}
}

// The deploy gate polls this endpoint and rolls back when it does not get a
// 200. A seed that has not run is not a reason to roll back a good binary — the
// service is up, it just cannot find the system it reports on.
func TestAMissingSelfSystemIsDegradedAndNotAFailure(t *testing.T) {
	q := dayOne()
	q.stateErr = pgx.ErrNoRows
	q.state = ""

	rec := get(t, newHandler(t, q), "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 — a missing seed must not roll back a release", rec.Code)
	}
	if got := decode(t, rec)["status"]; got != "degraded" {
		t.Errorf("status = %v, want degraded", got)
	}
}

// Invariant 3: metrics exist only for a live system. The query says so too, and
// this is the half that holds when somebody changes the query.
func TestASystemThatIsNotLiveReportsNoMetrics(t *testing.T) {
	uptime := 99.9
	q := dayOne()
	q.state = "in_build"
	q.metricsErr = nil
	q.metrics = store.LatestMetricsRow{Uptime90d: &uptime}

	body := decode(t, get(t, newHandler(t, q), ""))
	ops := body["ops"].(map[string]any)

	if body["status"] != "degraded" {
		t.Errorf("status = %v, want degraded", body["status"])
	}
	if ops["uptime90d"] != nil {
		t.Errorf("uptime90d = %v for a system that is not live, want null", ops["uptime90d"])
	}
}

// There is no honest value for systemsLive when the database is unreachable:
// the field is a required integer, and a zero there would be an invented number
// carrying the weight of a measurement.
func TestAnUnreachableDatabaseIsAProblemWithoutDriverText(t *testing.T) {
	q := dayOne()
	q.countsErr = errUnreachable

	rec := get(t, newHandler(t, q), "")

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("Content-Type = %q", got)
	}
	for _, secret := range []string{"dial tcp", "5432", "timseil_app", "host=db"} {
		if strings.Contains(rec.Body.String(), secret) {
			t.Errorf("the response leaked %q:\n%s", secret, rec.Body.String())
		}
	}
}

// ------------------------------------------------------------------- caching

// The trap. generatedAt moves every time the clock does, so hashing the whole
// body would give a new tag on every request, If-None-Match would never match,
// and the 304 path would be dead code that nobody notices — while the deploy
// gate and three badges pull the full body on every poll.
func TestTheETagIgnoresGeneratedAt(t *testing.T) {
	h := newHandler(t, dayOne())

	first := get(t, h, "").Header().Get("ETag")

	h.now = func() time.Time { return time.Date(2026, 8, 17, 12, 0, 30, 0, time.UTC) }
	second := get(t, h, "").Header().Get("ETag")

	if first == "" {
		t.Fatal("no ETag on the response")
	}
	if first != second {
		t.Errorf("the ETag changed with the clock: %s then %s", first, second)
	}
}

func TestTheETagChangesWhenTheAnswerDoes(t *testing.T) {
	before := get(t, newHandler(t, dayOne()), "").Header().Get("ETag")

	q := dayOne()
	q.deployErr = nil
	q.deploy = store.LastDeployRow{
		Sha: "a41f9c2", DurationSec: 42, Result: "ok",
		DeployedAt: pgtype.Timestamptz{Time: time.Date(2026, 8, 17, 11, 0, 0, 0, time.UTC), Valid: true},
	}
	after := get(t, newHandler(t, q), "").Header().Get("ETag")

	if before == after {
		t.Error("the ETag survived a change to the answer")
	}
}

func TestIfNoneMatchProducesAnEmpty304(t *testing.T) {
	h := newHandler(t, dayOne())
	etag := get(t, h, "").Header().Get("ETag")

	rec := get(t, h, etag)
	if rec.Code != http.StatusNotModified {
		t.Fatalf("status = %d, want 304", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("the 304 carries a body: %q", rec.Body.String())
	}
	if rec.Header().Get("ETag") != etag {
		t.Errorf("the 304 lost its ETag")
	}
}

// RFC 9110 defines `If-None-Match: *` as "any current representation". A client
// sending it expects a 304.
func TestIfNoneMatchStarProducesA304(t *testing.T) {
	if rec := get(t, newHandler(t, dayOne()), "*"); rec.Code != http.StatusNotModified {
		t.Errorf("If-None-Match: * = %d, want 304", rec.Code)
	}
}

func TestADifferentETagStillGetsTheBody(t *testing.T) {
	if rec := get(t, newHandler(t, dayOne()), `"something-else"`); rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
}

// The cache directive is the contract's, not the handler's. contract_test.go
// holds this constant against the served document; this asserts it reaches the
// wire.
func TestTheCacheDirectiveIsSent(t *testing.T) {
	rec := get(t, newHandler(t, dayOne()), "")
	if got := rec.Header().Get("Cache-Control"); got != cacheControl {
		t.Errorf("Cache-Control = %q, want %q", got, cacheControl)
	}
}

// Every required field of the contract, present. The rest of stage C copies
// this test with a different schema name.
func TestEveryRequiredFieldIsPresent(t *testing.T) {
	body := decode(t, get(t, newHandler(t, dayOne()), ""))

	for _, key := range []string{"status", "version", "sha", "startedAt", "generatedAt", "ops"} {
		if _, ok := body[key]; !ok {
			t.Errorf("the response has no %q, which the contract requires", key)
		}
	}
	ops := body["ops"].(map[string]any)
	for _, key := range []string{"systemsLive", "systemsTotal", "lastDeploy",
		"uptime90d", "p95Ms", "errorRate", "measuredAt"} {
		if _, ok := ops[key]; !ok {
			t.Errorf("ops has no %q, which the contract requires", key)
		}
	}
	if body["status"] != string(httpx.HealthStatusOk) {
		t.Errorf("status = %v, want ok", body["status"])
	}
}
