package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"runtime/debug"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
)

func request(id string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/api/systems/vat-check", nil)
	if id != "" {
		r = r.WithContext(reqid.With(r.Context(), id))
	}
	return r
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the problem body is not JSON: %v\n%s", err, rec.Body.String())
	}
	return body
}

func TestAProblemCarriesTheContractShape(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteProblem(rec, request("abc123def456"), http.StatusNotFound,
		TypeNotFound, "Not found", "No system with that slug.")

	if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("Content-Type = %q", got)
	}
	// A cached error would outlive the breakage it describes.
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d", rec.Code)
	}

	body := decode(t, rec)
	for _, key := range []string{"type", "title", "status"} {
		if _, ok := body[key]; !ok {
			t.Errorf("the document has no %q — RFC 9457 requires it", key)
		}
	}
	if body["instance"] != "/api/systems/vat-check" {
		t.Errorf("instance = %v", body["instance"])
	}
}

// ADR 0009: requestId is always present, and it is the same value as the
// header. Two identifiers that disagree are worse than one that is missing.
func TestTheRequestIdIsInTheBodyAndTheHeader(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteProblem(rec, request("abc123def456"), http.StatusNotFound, TypeNotFound, "Not found", "")

	if got := rec.Header().Get(reqid.Header); got != "abc123def456" {
		t.Errorf("%s = %q", reqid.Header, got)
	}
	if got := decode(t, rec)["requestId"]; got != "abc123def456" {
		t.Errorf("requestId = %v", got)
	}
}

// The leak test, and the reason WriteInternalProblem takes an error while the
// body never sees one. The inputs are the ones that actually turn up.
func TestTheBodyNeverCarriesTheCause(t *testing.T) {
	causes := map[string]error{
		"a postgres error":  errors.New(`ERROR: relation "systems" does not exist (SQLSTATE 42P01)`),
		"a dial failure":    errors.New("failed to connect to `host=db user=timseil_app database=timseil`: dial tcp 172.18.0.2:5432: connect: connection refused"),
		"a leaked password": errors.New("postgres://timseil_app:hunter2@db:5432/timseil"),
		"a stack trace":     errors.New(string(debug.Stack())),
	}

	for what, cause := range causes {
		rec := httptest.NewRecorder()
		WriteInternalProblem(rec, request("abc123def456"),
			slog.New(slog.NewTextHandler(io.Discard, nil)), cause)

		body := rec.Body.String()
		for _, secret := range []string{
			"SQLSTATE", "relation", "dial tcp", "5432", "timseil_app",
			"hunter2", "goroutine", "runtime/debug",
		} {
			if strings.Contains(body, secret) {
				t.Errorf("%s leaked %q into the response:\n%s", what, secret, body)
			}
		}
		if strings.Contains(body, cause.Error()) {
			t.Errorf("%s put the whole error in the body", what)
		}
		if rec.Code != http.StatusInternalServerError {
			t.Errorf("%s: status = %d", what, rec.Code)
		}
	}
}

// A detail is a sentence for a visitor. Structurally one line, structurally
// bounded — so that even a caller who passes the wrong thing cannot produce a
// document with a stack trace in it.
func TestTheDetailIsOneLineAndBounded(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteProblem(rec, request("abc123def456"), http.StatusBadRequest,
		TypeValidationFailed, "Validation failed",
		"first line\nsecond line\r\nthird line"+strings.Repeat(" padding", 100))

	detail, _ := decode(t, rec)["detail"].(string)
	if strings.ContainsAny(detail, "\r\n") {
		t.Errorf("the detail spans lines: %q", detail)
	}
	if len([]rune(detail)) > detailLimit {
		t.Errorf("the detail is %d runes, want at most %d", len([]rune(detail)), detailLimit)
	}
}

// A 429 without Retry-After is a 429 the client retries immediately.
func TestTheRateLimitProblemCarriesRetryAfter(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteRateLimitProblem(rec, request("abc123def456"), 2500*time.Millisecond)

	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("status = %d", rec.Code)
	}
	seconds, err := strconv.Atoi(rec.Header().Get("Retry-After"))
	if err != nil {
		t.Fatalf("Retry-After = %q, want a number of seconds", rec.Header().Get("Retry-After"))
	}
	if seconds < 1 {
		t.Errorf("Retry-After = %d — a client told to wait zero seconds does not wait", seconds)
	}
	if got := decode(t, rec)["type"]; got != TypeRateLimited {
		t.Errorf("type = %v", got)
	}
}

// Rounding down must never reach zero: sub-second waits are still waits.
func TestAShortRetryAfterIsRoundedUpToOne(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteRateLimitProblem(rec, request("abc123def456"), 10*time.Millisecond)

	if got := rec.Header().Get("Retry-After"); got != "1" {
		t.Errorf("Retry-After = %q, want 1", got)
	}
}

func TestInvalidParamsAppearOnAValidationProblem(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteValidationProblem(rec, request("abc123def456"), "Two fields did not validate.",
		[]InvalidParam{
			{Name: "email", Reason: "not a valid address"},
			{Name: "dwellMs", Reason: "below 3000"},
		})

	body := decode(t, rec)
	params, ok := body["invalidParams"].([]any)
	if !ok || len(params) != 2 {
		t.Fatalf("invalidParams = %v", body["invalidParams"])
	}
	if body["status"] != float64(http.StatusBadRequest) {
		t.Errorf("status = %v", body["status"])
	}
}

// A problem written outside the chain — a handler under unit test — must still
// be a valid document rather than a panic or a half-filled one.
func TestAProblemWithoutARequestIdIsStillValid(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteProblem(rec, request(""), http.StatusNotFound, TypeNotFound, "Not found", "")

	body := decode(t, rec)
	if _, present := body["requestId"]; present {
		t.Error("requestId is present but empty — omit it instead of claiming one")
	}
	if body["type"] != TypeNotFound {
		t.Errorf("type = %v", body["type"])
	}
}
