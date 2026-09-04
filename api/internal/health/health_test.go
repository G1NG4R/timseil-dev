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

	delivery    store.ContactDeliverabilityRow
	deliveryErr error

	// The interval the handler actually asked for. Recorded rather than asserted
	// in place, so that one test can hold it against the number in the answer.
	askedWindow *pgtype.Interval
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

func (s stubQueries) ContactDeliverability(_ context.Context, window pgtype.Interval) (
	store.ContactDeliverabilityRow, error,
) {
	if s.askedWindow != nil {
		*s.askedWindow = window
	}
	return s.delivery, s.deliveryErr
}

// dayOne is the state after B4's seed and before the probe has ever run: two
// systems, one of them live, and not a single measurement anywhere.
//
// The zero ContactDeliverabilityRow is the truthful day-one value and not a
// placeholder: nobody has written yet, so both counts are zero. The query
// answers that with a row rather than pgx.ErrNoRows, which is why this field
// carries no error twin like the four above it.
func dayOne() stubQueries {
	return stubQueries{
		counts:     store.HealthCountsRow{SystemsLive: 1, SystemsTotal: 2},
		state:      "live",
		metricsErr: pgx.ErrNoRows,
		deployErr:  pgx.ErrNoRows,
	}
}

// deliverability reads the object out of an answer, or fails the test.
func deliverability(t *testing.T, ops map[string]any) map[string]any {
	t.Helper()
	got, ok := ops["deliverability"].(map[string]any)
	if !ok {
		t.Fatalf("ops.deliverability is not an object: %v", ops["deliverability"])
	}
	return got
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
		"uptime90d", "p95Ms", "errorRate", "measuredAt", "deliverability"} {
		if _, ok := ops[key]; !ok {
			t.Errorf("ops has no %q, which the contract requires", key)
		}
	}
	if body["status"] != string(httpx.HealthStatusOk) {
		t.Errorf("status = %v, want ok", body["status"])
	}
}

// ---------------------------------------------------------- deliverability
//
// Issue #206. The fifth SLI of docs/slo.md had a definition, a data source and
// no way out of the database. These are the branches that answer for it.

// The day-one case, and the one a falsiness check gets wrong. Nothing has been
// accepted, so there is no quotient to form: 0/0 is not 0 %, and `0.00 %` on the
// only conversion point of this site would read as "this form loses everything"
// (invariant 1). The counts beside it are real zeros and stay zeros.
func TestAnEmptyMessageBoxIsNoDataAndNotZeroPercent(t *testing.T) {
	ops := decode(t, get(t, newHandler(t, dayOne()), ""))["ops"].(map[string]any)
	got := deliverability(t, ops)

	rate, present := got["rate"]
	if !present {
		t.Fatal("deliverability.rate is missing — the contract requires the key, null and all")
	}
	if rate != nil {
		t.Errorf("rate = %v with nothing accepted, want null", rate)
	}
	if got["delivered"] != float64(0) || got["accepted"] != float64(0) {
		t.Errorf("counts = %v / %v, want 0 / 0", got["delivered"], got["accepted"])
	}
	if got["windowDays"] != float64(deliverabilityWindowDays) {
		t.Errorf("windowDays = %v, want %d", got["windowDays"], deliverabilityWindowDays)
	}
}

// The dip this SLI is designed to show. A message the handler took but the relay
// has not yet been given counts in the denominator and not in the numerator —
// it has not been delivered. Reading it the other way would make a jammed queue
// invisible for as long as it stays jammed, which is the failure the number
// exists for.
func TestAQueuedMessageCountsAsAcceptedAndNotDelivered(t *testing.T) {
	q := dayOne()
	q.delivery = store.ContactDeliverabilityRow{Accepted: 3, Delivered: 2}

	got := deliverability(t, decode(t, get(t, newHandler(t, q), ""))["ops"].(map[string]any))

	rate, ok := got["rate"].(float64)
	if !ok {
		t.Fatalf("rate = %v, want a number", got["rate"])
	}
	if rate < 66.6 || rate > 66.7 {
		t.Errorf("rate = %v, want about 66.67", rate)
	}
	if got["delivered"] != float64(2) || got["accepted"] != float64(3) {
		t.Errorf("counts = %v / %v, want 2 / 3", got["delivered"], got["accepted"])
	}
}

// A message the dispatcher gave up on after five attempts is the failure a 202
// hides: the visitor was told it was accepted and it never arrived. It has to
// move this number, and the two counts have to make the loss legible — 9 of 10
// is a different statement from 90 of 100 at the same percentage.
func TestAMessageTheDispatcherGaveUpOnLowersTheRate(t *testing.T) {
	q := dayOne()
	q.delivery = store.ContactDeliverabilityRow{Accepted: 10, Delivered: 9}

	got := deliverability(t, decode(t, get(t, newHandler(t, q), ""))["ops"].(map[string]any))

	if got["rate"] != float64(90) {
		t.Errorf("rate = %v, want 90", got["rate"])
	}
	if got["accepted"] != float64(10) {
		t.Errorf("accepted = %v, want 10 — the denominator is what makes 90%% readable",
			got["accepted"])
	}
}

// Everything delivered is a measured 100, not a null. The empty case above and
// this one are the two ends invariant 1 keeps apart.
func TestEverythingDeliveredIsAMeasuredHundred(t *testing.T) {
	q := dayOne()
	q.delivery = store.ContactDeliverabilityRow{Accepted: 4, Delivered: 4}

	got := deliverability(t, decode(t, get(t, newHandler(t, q), ""))["ops"].(map[string]any))
	if got["rate"] != float64(100) {
		t.Errorf("rate = %v, want 100", got["rate"])
	}
}

// Both ends of the same number. The window the query was given and the window
// the answer declares come from one constant, so a reader counting thirty days
// is counting the days that were actually measured (invariant 7).
func TestTheWindowInTheAnswerIsTheWindowThatWasAsked(t *testing.T) {
	var asked pgtype.Interval
	q := dayOne()
	q.askedWindow = &asked

	got := deliverability(t, decode(t, get(t, newHandler(t, q), ""))["ops"].(map[string]any))

	if !asked.Valid || asked.Days != deliverabilityWindowDays {
		t.Errorf("the query was asked for %+v, want %d days", asked, deliverabilityWindowDays)
	}
	// Days rather than microseconds, so that Postgres adds the window by the
	// calendar. A DST boundary inside the window would otherwise move it by an
	// hour without anybody changing the constant.
	if asked.Microseconds != 0 || asked.Months != 0 {
		t.Errorf("the window is %+v, want it expressed in days alone", asked)
	}
	if got["windowDays"] != float64(deliverabilityWindowDays) {
		t.Errorf("windowDays = %v, want %d", got["windowDays"], deliverabilityWindowDays)
	}
}

// Invariant 3 governs the three numbers above it, not this one. The contact form
// keeps taking messages whatever state the self system is in, and a delivery rate
// that blanked itself on a mis-seeded database would hide the queue exactly when
// somebody has a reason to look at it.
func TestDeliverabilityStandsEvenWhenTheSelfSystemIsNotLive(t *testing.T) {
	q := dayOne()
	q.state = "in_build"
	q.delivery = store.ContactDeliverabilityRow{Accepted: 2, Delivered: 2}

	body := decode(t, get(t, newHandler(t, q), ""))
	ops := body["ops"].(map[string]any)

	if body["status"] != "degraded" {
		t.Fatalf("status = %v, want degraded", body["status"])
	}
	if ops["uptime90d"] != nil {
		t.Errorf("uptime90d = %v for a system that is not live, want null", ops["uptime90d"])
	}
	if got := deliverability(t, ops); got["rate"] != float64(100) {
		t.Errorf("rate = %v, want 100 — the form does not stop working when the seed is wrong",
			got["rate"])
	}
}

// There is no honest value for `accepted` when the query fails, and the two
// counts are required integers. HealthCounts has already answered by this point,
// so a failure here is a genuine surprise rather than an empty measurement — and
// a zero would be an invented number with the weight of a measurement.
func TestAFailedDeliverabilityQueryIsAProblemAndNotAZero(t *testing.T) {
	q := dayOne()
	q.deliveryErr = errUnreachable

	rec := get(t, newHandler(t, q), "")

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "5432") {
		t.Errorf("the driver text reached the body: %s", rec.Body.String())
	}
}
