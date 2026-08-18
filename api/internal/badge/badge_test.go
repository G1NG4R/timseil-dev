package badge

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

	"github.com/jackc/pgx/v5"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

const testRequestID = "req_test_0001"

// stubQueries is the database as these three endpoints see it: an empty one, a
// seeded one with nothing measured, a measured one, a broken one.
type stubQueries struct {
	counts    store.HealthCountsRow
	countsErr error

	metrics    store.LatestMetricsRow
	metricsErr error
}

func (s stubQueries) HealthCounts(context.Context) (store.HealthCountsRow, error) {
	return s.counts, s.countsErr
}

func (s stubQueries) LatestMetrics(context.Context, string) (store.LatestMetricsRow, error) {
	return s.metrics, s.metricsErr
}

// dayOne is the state after B4's seed and before the probe has ever run: two
// systems, one live, and not a single measurement anywhere.
func dayOne() stubQueries {
	return stubQueries{
		counts:     store.HealthCountsRow{SystemsLive: 1, SystemsTotal: 2},
		metricsErr: pgx.ErrNoRows,
	}
}

// errUnreachable is what a dead database actually looks like, host and port
// included — which is the point: none of it may reach a response body.
var errUnreachable = errors.New("failed to connect to `host=db user=timseil_app`: " +
	"dial tcp 172.18.0.2:5432: connect: connection refused")

func measured(uptime float64) stubQueries {
	q := dayOne()
	q.metricsErr = nil
	q.metrics = store.LatestMetricsRow{Uptime90d: &uptime}
	return q
}

func newHandler(t *testing.T, q Queries) *Handler {
	t.Helper()
	return New(q, "1.4.0", "timseil-dev", slog.New(slog.NewTextHandler(io.Discard, nil)))
}

// route names the three badges by the path the contract gives them, so a test
// reads the way a curl would.
func get(t *testing.T, h *Handler, path string) *httptest.ResponseRecorder {
	t.Helper()

	var serve func(http.ResponseWriter, *http.Request)
	switch path {
	case "/api/badge/uptime":
		serve = h.ServeUptime
	case "/api/badge/version":
		serve = h.ServeVersion
	case "/api/badge/systems":
		serve = h.ServeSystems
	default:
		t.Fatalf("no such badge: %s", path)
	}

	r := httptest.NewRequest(http.MethodGet, path, nil)
	r.RemoteAddr = "203.0.113.7:51000"
	r = r.WithContext(reqid.With(r.Context(), testRequestID))

	rec := httptest.NewRecorder()
	serve(rec, r)
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

// ------------------------------------------------------------------ no data

// Invariant 1 at the place a badge is most tempting to fake. Shields renders
// whatever it is handed, so a `0` here would put "0.00%" over the README of a
// site whose whole argument is that its numbers are measured — and it would
// look like an outage rather than like an absence.
func TestWithNoSnapshotTheUptimeBadgeSaysNoDataRatherThanZero(t *testing.T) {
	rec := get(t, newHandler(t, dayOne()), "/api/badge/uptime")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}

	body := decode(t, rec)
	if body["message"] != noData {
		t.Errorf("message = %v, want %q", body["message"], noData)
	}
	if strings.Contains(rec.Body.String(), "0.00") {
		t.Errorf("a zero reached the badge: %s", rec.Body.String())
	}
}

// A row that exists with a null uptime is the same absence as no row at all.
// metric_snapshots is nullable by design, so a snapshot carrying only p95 gets
// here — and dereferencing it would be a panic, reading it as zero a lie.
func TestASnapshotWithANullUptimeIsAlsoNoData(t *testing.T) {
	q := dayOne()
	q.metricsErr = nil
	q.metrics = store.LatestMetricsRow{} // present row, Uptime90d nil

	body := decode(t, get(t, newHandler(t, q), "/api/badge/uptime"))
	if body["message"] != noData {
		t.Errorf("message = %v, want %q", body["message"], noData)
	}
}

// `— NO DATA` is not an error state. Shields paints isError red, and a red
// badge says "this system is broken" — which is a different claim from "nobody
// has measured this yet" and the wrong one to make on day one.
func TestNoDataIsNotAnError(t *testing.T) {
	body := decode(t, get(t, newHandler(t, dayOne()), "/api/badge/uptime"))

	isError, ok := body["isError"].(bool)
	if !ok {
		t.Fatalf("isError is missing or not a bool: %v", body["isError"])
	}
	if isError {
		t.Error("isError = true for a missing measurement; it is an absence, not a fault")
	}
	if body["color"] != colorGrey {
		t.Errorf("color = %v, want %q", body["color"], colorGrey)
	}
}

// ------------------------------------------------------------------ measured

func TestAMeasuredUptimeIsRenderedWithItsColour(t *testing.T) {
	for _, tc := range []struct {
		name    string
		uptime  float64
		message string
		color   string
	}{
		{"well above the line", 99.64, "99.64%", colorGreen},
		{"exactly on the good threshold", 99.0, "99.00%", colorGreen},
		{"just under it", 98.99, "98.99%", colorYellow},
		{"exactly on the fair threshold", 95.0, "95.00%", colorYellow},
		{"under both", 94.99, "94.99%", colorRed},
		// A hundred per cent is a real measurement and must not be mistaken
		// for a missing one anywhere on the way out.
		{"a perfect quarter", 100.0, "100.00%", colorGreen},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body := decode(t, get(t, newHandler(t, measured(tc.uptime)), "/api/badge/uptime"))

			if body["message"] != tc.message {
				t.Errorf("message = %v, want %q", body["message"], tc.message)
			}
			if body["color"] != tc.color {
				t.Errorf("color = %v, want %q", body["color"], tc.color)
			}
		})
	}
}

func TestTheSystemsBadgeCountsWhatTheDatabaseCounts(t *testing.T) {
	body := decode(t, get(t, newHandler(t, dayOne()), "/api/badge/systems"))

	if body["message"] != "1/2 live" {
		t.Errorf("message = %v, want %q", body["message"], "1/2 live")
	}
}

// Zero live systems is a state this site was in for eleven phases, and it is a
// measurement rather than an absence: the count is known and it is zero. Grey
// would say nobody looked.
func TestNoLiveSystemIsAnAnswerAndNotNoData(t *testing.T) {
	q := dayOne()
	q.counts = store.HealthCountsRow{SystemsLive: 0, SystemsTotal: 2}

	body := decode(t, get(t, newHandler(t, q), "/api/badge/systems"))
	if body["message"] != "0/2 live" {
		t.Errorf("message = %v, want %q", body["message"], "0/2 live")
	}
	if body["color"] != colorYellow {
		t.Errorf("color = %v, want %q", body["color"], colorYellow)
	}
}

func TestTheVersionBadgeReadsTheBuildAndNotTheDatabase(t *testing.T) {
	// A database that answers nothing at all: the version badge must not care.
	h := newHandler(t, stubQueries{countsErr: errUnreachable, metricsErr: errUnreachable})

	rec := get(t, h, "/api/badge/version")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	if body := decode(t, rec); body["message"] != "1.4.0" {
		t.Errorf("message = %v, want %q", body["message"], "1.4.0")
	}
}

// -------------------------------------------------------------- broken database

// The branch the contract's 500 was added for. An unreachable database is an
// outage, and rendering it as `— NO DATA` would hide the outage behind
// invariant 1 — the exact inversion of what invariant 1 is for.
func TestABrokenDatabaseIsAProblemDocumentAndNotNoData(t *testing.T) {
	for _, tc := range []struct {
		path string
		q    stubQueries
	}{
		{"/api/badge/uptime", stubQueries{metricsErr: errUnreachable}},
		{"/api/badge/systems", stubQueries{countsErr: errUnreachable}},
	} {
		t.Run(tc.path, func(t *testing.T) {
			rec := get(t, newHandler(t, tc.q), tc.path)

			if rec.Code != http.StatusInternalServerError {
				t.Fatalf("status = %d, want 500: %s", rec.Code, rec.Body.String())
			}
			if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
				t.Errorf("Content-Type = %q, want application/problem+json", got)
			}
			if strings.Contains(rec.Body.String(), noData) {
				t.Error("an outage was rendered as a missing measurement")
			}
			// The DSN, the host and the port are all in errUnreachable. None
			// of them is an answer to give a stranger.
			for _, leak := range []string{"172.18.0.2", "timseil_app", "connection refused"} {
				if strings.Contains(rec.Body.String(), leak) {
					t.Errorf("the response leaks %q: %s", leak, rec.Body.String())
				}
			}
			if body := decode(t, rec); body["requestId"] != testRequestID {
				t.Errorf("requestId = %v, want %q", body["requestId"], testRequestID)
			}
		})
	}
}

// ------------------------------------------------------------------- payload

// cacheSeconds and the Cache-Control header are one fact. Written twice they
// agree on the day they are written; read from one string they cannot drift.
func TestTheAdvertisedLifetimeMatchesTheHeader(t *testing.T) {
	rec := get(t, newHandler(t, dayOne()), "/api/badge/systems")

	if got := rec.Header().Get("Cache-Control"); got != httpx.CacheControlMedium {
		t.Fatalf("Cache-Control = %q, want %q", got, httpx.CacheControlMedium)
	}

	body := decode(t, rec)

	seconds, ok := body["cacheSeconds"].(float64)
	if !ok {
		t.Fatalf("cacheSeconds is missing or not a number: %v", body["cacheSeconds"])
	}
	if int(seconds) != 300 {
		t.Errorf("cacheSeconds = %d, want 300 — the s-maxage of the header above", int(seconds))
	}
}

// Shields refuses a payload without these three. They are required by the
// contract's own schema too, so an omitempty slipped onto any of them breaks
// both at once.
func TestEveryBadgeCarriesWhatShieldsRequires(t *testing.T) {
	for _, path := range []string{"/api/badge/uptime", "/api/badge/version", "/api/badge/systems"} {
		t.Run(path, func(t *testing.T) {
			b := decode(t, get(t, newHandler(t, dayOne()), path))

			if v, ok := b["schemaVersion"].(float64); !ok || int(v) != 1 {
				t.Errorf("schemaVersion = %v, want 1", b["schemaVersion"])
			}
			for _, key := range []string{"label", "message"} {
				if s, ok := b[key].(string); !ok || s == "" {
					t.Errorf("%s = %v, want a non-empty string", key, b[key])
				}
			}
		})
	}
}
