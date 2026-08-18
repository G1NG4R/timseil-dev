package intake

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

	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

const testRequestID = "req_test_0001"

// testNow is the instant every clock rule below is measured against, so "in the
// future" means a fixed thing rather than whatever time the suite runs at.
var testNow = time.Date(2026, 8, 18, 14, 22, 7, 0, time.UTC)

// stubQueries is the database as these two endpoints see it, and it records
// what they tried to write — the arguments are half of what is being tested.
type stubQueries struct {
	systemID    int64
	systemIDErr error

	checks    []store.InsertOpsCheckParams
	checkRows int64
	checkErr  error

	deploys    []store.InsertDeployParams
	deployRows int64
	deployErr  error
}

func (s *stubQueries) SystemIDBySlug(context.Context, string) (int64, error) {
	return s.systemID, s.systemIDErr
}

func (s *stubQueries) InsertOpsCheck(_ context.Context, arg store.InsertOpsCheckParams) (int64, error) {
	s.checks = append(s.checks, arg)
	return s.checkRows, s.checkErr
}

func (s *stubQueries) InsertDeploy(_ context.Context, arg store.InsertDeployParams) (int64, error) {
	s.deploys = append(s.deploys, arg)
	return s.deployRows, s.deployErr
}

func working() *stubQueries {
	return &stubQueries{systemID: 2, checkRows: 1, deployRows: 1}
}

var errUnreachable = errors.New("failed to connect to `host=db user=timseil_app`: " +
	"dial tcp 172.18.0.2:5432: connect: connection refused")

func newHandler(t *testing.T, q Queries) *Handler {
	t.Helper()
	h := New(q, "timseil-dev", slog.New(slog.NewTextHandler(io.Discard, nil)))
	h.now = func() time.Time { return testNow }
	return h
}

// probeBody and deployBody build a valid document that a test then spoils in
// one place, so every case reads as "this and only this is wrong".
func probeBody(overrides map[string]any) map[string]any {
	body := map[string]any{
		"at":        testNow.Add(-30 * time.Second).Format(time.RFC3339),
		"up":        true,
		"latencyMs": 142,
	}
	for k, v := range overrides {
		if v == nil {
			delete(body, k)
			continue
		}
		body[k] = v
	}
	return body
}

func deployBody(overrides map[string]any) map[string]any {
	body := map[string]any{
		"sha":         "a41f9c2",
		"durationSec": 42,
		"result":      "ok",
		"at":          testNow.Add(-2 * time.Minute).Format(time.RFC3339),
	}
	for k, v := range overrides {
		if v == nil {
			delete(body, k)
			continue
		}
		body[k] = v
	}
	return body
}

func post(t *testing.T, h *Handler, path string, payload any) *httptest.ResponseRecorder {
	t.Helper()

	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("the test payload does not encode: %v", err)
	}
	return postRaw(t, h, path, string(encoded), "application/json")
}

func postRaw(t *testing.T, h *Handler, path, payload, contentType string) *httptest.ResponseRecorder {
	t.Helper()

	r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(payload))
	r.RemoteAddr = "203.0.113.7:51000"
	if contentType != "" {
		r.Header.Set("Content-Type", contentType)
	}
	r = r.WithContext(reqid.With(r.Context(), testRequestID))

	rec := httptest.NewRecorder()
	switch path {
	case "/api/internal/probe":
		h.ServeProbe(rec, r)
	case "/api/internal/deploy":
		h.ServeDeploy(rec, r)
	default:
		t.Fatalf("no such endpoint: %s", path)
	}
	return rec
}

func problem(t *testing.T, rec *httptest.ResponseRecorder, status int) map[string]any {
	t.Helper()

	if rec.Code != status {
		t.Fatalf("status = %d, want %d: %s", rec.Code, status, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("Content-Type = %q, want application/problem+json", got)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}

	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("the answer is not a problem document: %v\n%s", err, rec.Body.String())
	}
	if out["requestId"] != testRequestID {
		t.Errorf("requestId = %v", out["requestId"])
	}
	return out
}

// rejectedFields is what the answer names, so a test can say which field it
// expected to be blamed rather than only that something was.
func rejectedFields(t *testing.T, rec *httptest.ResponseRecorder) []string {
	t.Helper()

	out := problem(t, rec, http.StatusBadRequest)

	params, ok := out["invalidParams"].([]any)
	if !ok {
		t.Fatalf("a 400 with no invalidParams: %s", rec.Body.String())
	}

	names := make([]string, 0, len(params))
	for _, p := range params {
		names = append(names, p.(map[string]any)["name"].(string))
	}
	return names
}

func hasField(names []string, want string) bool {
	for _, name := range names {
		if name == want {
			return true
		}
	}
	return false
}

// ------------------------------------------------------------------ accepted

func TestAProbeIsRecordedAndAnsweredWithNothing(t *testing.T) {
	q := working()
	rec := post(t, newHandler(t, q), "/api/internal/probe", probeBody(nil))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.Len() != 0 {
		t.Errorf("a 204 with a body: %s", rec.Body.String())
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}

	if len(q.checks) != 1 {
		t.Fatalf("wrote %d rows, want 1", len(q.checks))
	}
	written := q.checks[0]

	if written.SystemID != 2 {
		t.Errorf("SystemID = %d, want the resolved slug's id", written.SystemID)
	}
	if !written.Up {
		t.Error("Up = false for an up report")
	}
	if written.LatencyMs == nil || *written.LatencyMs != 142 {
		t.Errorf("LatencyMs = %v, want 142", written.LatencyMs)
	}
	if !written.ObservedAt.Time.Equal(testNow.Add(-30 * time.Second)) {
		t.Errorf("ObservedAt = %v", written.ObservedAt.Time)
	}
}

func TestADeployIsRecordedAndAnsweredWithNothing(t *testing.T) {
	q := working()
	rec := post(t, newHandler(t, q), "/api/internal/deploy", deployBody(nil))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204: %s", rec.Code, rec.Body.String())
	}
	if len(q.deploys) != 1 {
		t.Fatalf("wrote %d rows, want 1", len(q.deploys))
	}

	written := q.deploys[0]
	if written.Sha != "a41f9c2" || written.DurationSec != 42 || written.Result != "ok" {
		t.Errorf("wrote %+v", written)
	}
}

// A down report is the one the whole external-probe apparatus exists for, and
// it is the shape the CHECK constraints are strictest about.
func TestADownProbeCarriesItsReasonAndNoLatency(t *testing.T) {
	q := working()
	rec := post(t, newHandler(t, q), "/api/internal/probe", probeBody(map[string]any{
		"up":        false,
		"latencyMs": nil,
		"reason":    "connect timeout",
	}))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204: %s", rec.Code, rec.Body.String())
	}

	written := q.checks[0]
	if written.Up {
		t.Error("Up = true for a down report")
	}
	if written.LatencyMs != nil {
		t.Errorf("LatencyMs = %v on a down report", *written.LatencyMs)
	}
	if written.Reason == nil || *written.Reason != "connect timeout" {
		t.Errorf("Reason = %v", written.Reason)
	}
}

// ---------------------------------------------------------------- idempotency

// A prober that times out waiting for our 204 is allowed to send the same
// observation again. Zero affected rows is the conflict clause doing its job,
// not a failure — and the answer must be indistinguishable, because the
// contract gives a 204 no body to distinguish it in.
func TestARepeatedReportIsAcceptedAndWritesNothingTwice(t *testing.T) {
	for _, tc := range []struct {
		path string
		body any
	}{
		{"/api/internal/probe", probeBody(nil)},
		{"/api/internal/deploy", deployBody(nil)},
	} {
		t.Run(tc.path, func(t *testing.T) {
			q := working()
			q.checkRows, q.deployRows = 0, 0 // ON CONFLICT DO NOTHING

			rec := post(t, newHandler(t, q), tc.path, tc.body)
			if rec.Code != http.StatusNoContent {
				t.Fatalf("status = %d, want 204: %s", rec.Code, rec.Body.String())
			}
			if rec.Body.Len() != 0 {
				t.Errorf("a repeat answered differently: %s", rec.Body.String())
			}
		})
	}
}

// ---------------------------------------------------- the CHECKs, taken early

// The broken case this phase is really about.
//
// Every row here is a CHECK constraint in 00004_operations.sql. Left to the
// database each one arrives as a driver error and leaves as a 500 — which tells
// a prober that we broke when what happened is that it sent a contradiction.
// The names matter as much as the status: a pipeline should learn which field
// to fix without reading our source.
func TestEveryDatabaseConstraintIsA400WithItsFieldName(t *testing.T) {
	for _, tc := range []struct {
		name  string
		path  string
		body  any
		field string
	}{
		{
			"a reason on a host that answered",
			"/api/internal/probe",
			probeBody(map[string]any{"reason": "connect timeout"}),
			"reason",
		},
		{
			"a latency on a host that did not",
			"/api/internal/probe",
			probeBody(map[string]any{"up": false, "latencyMs": 142}),
			"latencyMs",
		},
		{
			"a negative latency",
			"/api/internal/probe",
			probeBody(map[string]any{"latencyMs": -1}),
			"latencyMs",
		},
		{
			"a latency wider than the column",
			"/api/internal/probe",
			probeBody(map[string]any{"latencyMs": 2147483648}),
			"latencyMs",
		},
		{
			"a sha that is not hex",
			"/api/internal/deploy",
			deployBody(map[string]any{"sha": "ZZZZZZZ"}),
			"sha",
		},
		{
			"a sha in capitals",
			"/api/internal/deploy",
			deployBody(map[string]any{"sha": "A41F9C2"}),
			"sha",
		},
		{
			"a sha too short to identify anything",
			"/api/internal/deploy",
			deployBody(map[string]any{"sha": "a41f9"}),
			"sha",
		},
		{
			"a result outside the enum",
			"/api/internal/deploy",
			deployBody(map[string]any{"result": "banana"}),
			"result",
		},
		{
			"a negative duration",
			"/api/internal/deploy",
			deployBody(map[string]any{"durationSec": -1}),
			"durationSec",
		},
		{
			"a duration wider than the column",
			"/api/internal/deploy",
			deployBody(map[string]any{"durationSec": 2147483648}),
			"durationSec",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			q := working()
			rec := post(t, newHandler(t, q), tc.path, tc.body)

			if names := rejectedFields(t, rec); !hasField(names, tc.field) {
				t.Errorf("the answer blames %v, want it to name %q", names, tc.field)
			}
			// Nothing may reach the database. A row that the CHECK would have
			// refused must not be attempted, or the 400 is decoration in front
			// of a 500 that did not happen to fire.
			if len(q.checks) != 0 || len(q.deploys) != 0 {
				t.Errorf("an invalid report was written anyway: %+v %+v", q.checks, q.deploys)
			}
		})
	}
}

// Two wrong fields, two entries. The contract's rule for invalidParams is one
// per rejected field, and answering only the first would make a pipeline fix
// them one deploy at a time.
func TestEveryRejectedFieldIsNamedAtOnce(t *testing.T) {
	rec := post(t, newHandler(t, working()), "/api/internal/deploy", deployBody(map[string]any{
		"sha":         "nothex",
		"result":      "banana",
		"durationSec": -1,
	}))

	names := rejectedFields(t, rec)
	for _, want := range []string{"sha", "result", "durationSec"} {
		if !hasField(names, want) {
			t.Errorf("the answer does not name %q: %v", want, names)
		}
	}
}

// ------------------------------------------------------------------- the clock

// A deploy stamped in the future is the expensive mistake, because nothing can
// take it back: LastDeploy is ORDER BY deployed_at DESC LIMIT 1, so one skewed
// clock owns /api/health's lastDeploy and the version badge for ever.
func TestAReportFromTheFutureIsRefused(t *testing.T) {
	for _, tc := range []struct {
		path string
		body any
	}{
		{"/api/internal/probe", probeBody(map[string]any{
			"at": testNow.Add(10 * time.Minute).Format(time.RFC3339),
		})},
		{"/api/internal/deploy", deployBody(map[string]any{
			"at": testNow.Add(10 * time.Minute).Format(time.RFC3339),
		})},
	} {
		t.Run(tc.path, func(t *testing.T) {
			if names := rejectedFields(t, post(t, newHandler(t, working()), tc.path, tc.body)); !hasField(names, "at") {
				t.Errorf("the answer blames %v, want it to name \"at\"", names)
			}
		})
	}
}

// Ordinary clock skew between a GitHub runner and this host is not an error.
func TestASmallSkewAheadIsAccepted(t *testing.T) {
	rec := post(t, newHandler(t, working()), "/api/internal/probe", probeBody(map[string]any{
		"at": testNow.Add(30 * time.Second).Format(time.RFC3339),
	}))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204: %s", rec.Code, rec.Body.String())
	}
}

// The past is generous on purpose. RollUpOpsDays scans on recorded_at and
// groups on observed_at, so a late report is still aggregated — the floor is
// about how many rows a broken prober can write, not about the roll-up.
func TestAnObservationFromLastWeekIsStillAccepted(t *testing.T) {
	rec := post(t, newHandler(t, working()), "/api/internal/probe", probeBody(map[string]any{
		"at": testNow.Add(-7 * 24 * time.Hour).Format(time.RFC3339),
	}))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204: %s", rec.Code, rec.Body.String())
	}
}

func TestAnObservationOlderThanTheFloorIsRefused(t *testing.T) {
	rec := post(t, newHandler(t, working()), "/api/internal/probe", probeBody(map[string]any{
		"at": testNow.Add(-maxAge - time.Hour).Format(time.RFC3339),
	}))
	if names := rejectedFields(t, rec); !hasField(names, "at") {
		t.Errorf("the answer blames %v, want it to name \"at\"", names)
	}
}

// `at` is required by the contract. Absent it decodes to the zero time, which
// is 0001-01-01 and therefore also caught by the floor — but "required" is the
// honest reason to give back.
func TestAMissingInstantIsRefused(t *testing.T) {
	rec := post(t, newHandler(t, working()), "/api/internal/probe",
		probeBody(map[string]any{"at": nil}))

	if names := rejectedFields(t, rec); !hasField(names, "at") {
		t.Errorf("the answer blames %v, want it to name \"at\"", names)
	}
}

// ------------------------------------------------------------------- the body

func TestTheBodyMustBeJSONAndSayThatItIs(t *testing.T) {
	for _, tc := range []struct{ name, contentType, payload string }{
		{"no content type", "", `{"at":"2026-08-18T14:00:00Z","up":true}`},
		{"a form post", "application/x-www-form-urlencoded", "at=now&up=true"},
		{"json-ish", "text/json", `{"at":"2026-08-18T14:00:00Z","up":true}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rec := postRaw(t, newHandler(t, working()), "/api/internal/probe", tc.payload, tc.contentType)
			if names := rejectedFields(t, rec); !hasField(names, "Content-Type") {
				t.Errorf("the answer blames %v", names)
			}
		})
	}
}

// A charset parameter is legal and common.
func TestAContentTypeWithACharsetIsFine(t *testing.T) {
	rec := postRaw(t, newHandler(t, working()), "/api/internal/probe",
		`{"at":"2026-08-18T14:00:00Z","up":true}`, "application/json; charset=utf-8")

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204: %s", rec.Code, rec.Body.String())
	}
}

func TestAnUnknownFieldIsRefused(t *testing.T) {
	rec := post(t, newHandler(t, working()), "/api/internal/probe",
		probeBody(map[string]any{"systemId": 7}))

	if names := rejectedFields(t, rec); !hasField(names, "body") {
		t.Errorf("the answer blames %v", names)
	}
}

// The decoder's own message names Go types and byte offsets. Neither is an
// answer to give a caller.
func TestABrokenBodyDoesNotEchoTheDecoder(t *testing.T) {
	rec := postRaw(t, newHandler(t, working()), "/api/internal/probe", `{"up":`, "application/json")

	problem(t, rec, http.StatusBadRequest)
	for _, leak := range []string{"httpx.", "unexpected EOF", "offset", "cannot unmarshal"} {
		if strings.Contains(rec.Body.String(), leak) {
			t.Errorf("the answer leaks %q: %s", leak, rec.Body.String())
		}
	}
}

// The generated strict decoder reads r.Body unbounded. This adapter exists
// partly so that it does not.
func TestAnOversizedBodyIsRefusedRatherThanRead(t *testing.T) {
	huge := `{"at":"2026-08-18T14:00:00Z","up":true,"reason":"` + strings.Repeat("x", maxBodyBytes*2) + `"}`

	rec := postRaw(t, newHandler(t, working()), "/api/internal/probe", huge, "application/json")
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400: a body twice the limit was read", rec.Code)
	}
}

// reason is unbounded text in the schema and lands in a column a public grid
// reads. A prober pasting a stack trace into it should not paste it into us.
func TestALongReasonIsCutDownAndFlattened(t *testing.T) {
	q := working()
	rec := post(t, newHandler(t, q), "/api/internal/probe", probeBody(map[string]any{
		"up":        false,
		"latencyMs": nil,
		"reason":    "connect timeout\r\n" + strings.Repeat("x", 500),
	}))

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204: %s", rec.Code, rec.Body.String())
	}

	written := *q.checks[0].Reason
	if len([]rune(written)) > maxReasonRunes {
		t.Errorf("stored %d runes, want at most %d", len([]rune(written)), maxReasonRunes)
	}
	if strings.ContainsAny(written, "\r\n") {
		t.Errorf("a line break survived into the column: %q", written)
	}
}

// -------------------------------------------------------------- broken system

// SITE_SYSTEM_SLUG naming nothing is our misconfiguration. A 400 would send a
// pipeline hunting for a bug in a payload that is correct.
func TestAnUnknownSiteSystemIsOurProblemAndNotTheCallers(t *testing.T) {
	q := working()
	q.systemIDErr = pgx.ErrNoRows

	rec := post(t, newHandler(t, q), "/api/internal/probe", probeBody(nil))
	out := problem(t, rec, http.StatusInternalServerError)

	if strings.Contains(rec.Body.String(), "timseil-dev") {
		t.Errorf("the answer names our configuration: %s", rec.Body.String())
	}
	if _, ok := out["invalidParams"]; ok {
		t.Error("a 500 with invalidParams blames the caller for our misconfiguration")
	}
}

func TestABrokenDatabaseNeverReachesTheAnswer(t *testing.T) {
	q := working()
	q.checkErr = errUnreachable

	rec := post(t, newHandler(t, q), "/api/internal/probe", probeBody(nil))
	problem(t, rec, http.StatusInternalServerError)

	for _, leak := range []string{"172.18.0.2", "timseil_app", "connection refused"} {
		if strings.Contains(rec.Body.String(), leak) {
			t.Errorf("the answer leaks %q: %s", leak, rec.Body.String())
		}
	}
}
