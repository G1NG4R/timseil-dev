package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
)

const (
	rightToken = "0f1e2d3c4b5a69788796a5b4c3d2e1f0"
	wrongToken = "ffffffffffffffffffffffffffffffff"
)

func guarded(t *testing.T) http.Handler {
	t.Helper()

	reached := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	return Bearer(rightToken, slog.New(slog.NewTextHandler(io.Discard, nil)))(reached)
}

func present(t *testing.T, header string) *httptest.ResponseRecorder {
	t.Helper()

	r := httptest.NewRequest(http.MethodPost, "/api/internal/probe", strings.NewReader("{}"))
	r.RemoteAddr = "203.0.113.7:51000"
	if header != "" {
		r.Header.Set("Authorization", header)
	}
	// A fixed id, so that two refusals differ in nothing at all — without it
	// the byte comparison below would be comparing two random strings.
	r = r.WithContext(reqid.With(r.Context(), "req_test_0001"))

	rec := httptest.NewRecorder()
	guarded(t).ServeHTTP(rec, r)
	return rec
}

func TestTheRightTokenGetsThrough(t *testing.T) {
	if rec := present(t, "Bearer "+rightToken); rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204: %s", rec.Code, rec.Body.String())
	}
}

// RFC 9110 says the scheme is case-insensitive. The token is not — it is an
// opaque string that has to match what was generated.
func TestTheSchemeIsCaseInsensitiveAndTheTokenIsNot(t *testing.T) {
	if rec := present(t, "bearer "+rightToken); rec.Code != http.StatusNoContent {
		t.Errorf("a lowercase scheme was refused: %d", rec.Code)
	}
	if rec := present(t, "Bearer "+strings.ToUpper(rightToken)); rec.Code != http.StatusUnauthorized {
		t.Errorf("an upper-cased token was accepted: %d", rec.Code)
	}
}

// ------------------------------------------------------------- one answer

// The heart of the acceptance criterion: "a wrong token answers 401 with no
// detail". Every way of getting it wrong has to produce the same answer, or the
// answer itself tells somebody which part they got right.
func TestEveryRefusalIsTheSameAnswerToTheByte(t *testing.T) {
	refusals := map[string]string{
		"no header at all":       "",
		"another scheme":         "Basic dXNlcjpwYXNz",
		"a scheme and nothing":   "Bearer",
		"an empty bearer":        "Bearer ",
		"the wrong token":        "Bearer " + wrongToken,
		"a token of odd length":  "Bearer " + wrongToken[:7],
		"a very long token":      "Bearer " + strings.Repeat("f", 4096),
		"the other endpoint's":   "Bearer a1b2c3d4e5f60718293a4b5c6d7e8f90",
		"the right token, split": "Bearer " + rightToken[:16] + " " + rightToken[16:],
	}

	var first []byte
	var firstName string

	for name, header := range refusals {
		rec := present(t, header)

		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s: status = %d, want 401", name, rec.Code)
			continue
		}

		// RFC 9110 requires it, and the contract declares it as a constant.
		if got := rec.Header().Get("WWW-Authenticate"); got != "Bearer" {
			t.Errorf("%s: WWW-Authenticate = %q, want %q", name, got, "Bearer")
		}
		if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
			t.Errorf("%s: Content-Type = %q", name, got)
		}
		// An error answer nobody may cache. A 401 sitting in a shared cache
		// would answer the next caller who did have a token.
		if got := rec.Header().Get("Cache-Control"); got != "no-store" {
			t.Errorf("%s: Cache-Control = %q, want no-store", name, got)
		}

		if first == nil {
			first, firstName = rec.Body.Bytes(), name
			continue
		}
		if !bytes.Equal(first, rec.Body.Bytes()) {
			t.Errorf("%s answers differently from %q:\n  %s\n  %s",
				name, firstName, first, rec.Body.Bytes())
		}
	}
}

// Nothing about the attempt may come back — not the token, not a hint about
// which part of it was wrong, and not the name of the variable it is compared
// against.
func TestTheAnswerSaysNothingAboutTheAttempt(t *testing.T) {
	rec := present(t, "Bearer "+wrongToken)

	body := rec.Body.String()
	for _, leak := range []string{wrongToken, rightToken, "INTERNAL_", "expected"} {
		if strings.Contains(body, leak) {
			t.Errorf("the answer leaks %q:\n%s", leak, body)
		}
	}

	var problem map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
		t.Fatalf("the answer is not a problem document: %v", err)
	}
	if problem["requestId"] != "req_test_0001" {
		t.Errorf("requestId = %v", problem["requestId"])
	}
	if !strings.HasSuffix(problem["type"].(string), "/unauthorized") {
		t.Errorf("type = %v", problem["type"])
	}
}

// The guarded handler must not run. Obvious, and the one thing that would make
// every assertion above cosmetic.
func TestARefusedRequestNeverReachesTheHandler(t *testing.T) {
	var reached bool

	inner := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { reached = true })
	h := Bearer(rightToken, slog.New(slog.NewTextHandler(io.Discard, nil)))(inner)

	r := httptest.NewRequest(http.MethodPost, "/api/internal/probe", strings.NewReader("{}"))
	r.Header.Set("Authorization", "Bearer "+wrongToken)
	h.ServeHTTP(httptest.NewRecorder(), r)

	if reached {
		t.Fatal("the handler ran behind a refused token")
	}
}

// ---------------------------------------------------------------- timing

// The other half of the acceptance criterion: "without a measurable timing
// difference".
//
// Measured on the comparison itself rather than on the whole handler, and that
// is the honest place for it: writing the problem document costs microseconds
// and would drown any difference here in noise, so a wall-clock assertion
// against ServeHTTP would pass whatever the comparison did. It would be a green
// test that proves nothing.
//
// What this catches is the mistake the function is written to avoid. Handed two
// strings of different lengths, subtle.ConstantTimeCompare returns 0
// immediately — so a version without the hashing answers a short token in
// almost no time and a full-length one in full time, and the response time
// spells out how long the real token is. Hashing first makes all the inputs
// below exactly thirty-two bytes of work.
//
// The bound is deliberately loose. These differ by a percent or two in
// practice; a short-circuit shows up as two orders of magnitude, so 2x is far
// from the noise and nowhere near the fault.
func TestTheComparisonCostsTheSameWhateverItIsHanded(t *testing.T) {
	cases := map[string]string{
		"nothing at all":           "",
		"the wrong token":          wrongToken,
		"a much shorter token":     "f",
		"the right token":          rightToken,
		"the right token but one":  rightToken[:len(rightToken)-1] + "0",
		"the right token's prefix": rightToken[:16],
	}

	slowest, fastest := time.Duration(0), time.Duration(0)
	var slowestName, fastestName string

	for name, got := range cases {
		took := measure(func() { _ = ConstantTimeTokenEqual(got, rightToken) })

		if slowest == 0 || took > slowest {
			slowest, slowestName = took, name
		}
		if fastest == 0 || took < fastest {
			fastest, fastestName = took, name
		}
		t.Logf("%-26s %6.1f ns/op", name, float64(took.Nanoseconds())/float64(samples))
	}

	if ratio := float64(slowest) / float64(fastest); ratio > 2.0 {
		t.Errorf("%q takes %.1fx as long as %q — the comparison is branching on its input",
			slowestName, ratio, fastestName)
	}
}

// samples is enough that one scheduler hiccup does not decide the answer, and
// few enough that the whole test costs well under a second. Best-of-five on top
// of that: the interesting number is how fast the code can go, and the noise
// only ever runs in one direction.
const samples = 50_000

func measure(f func()) time.Duration {
	best := time.Duration(0)

	for range 5 {
		start := time.Now()
		for range samples {
			f()
		}
		if took := time.Since(start); best == 0 || took < best {
			best = took
		}
	}
	return best
}

func TestTheComparisonIsStillCorrect(t *testing.T) {
	for _, tc := range []struct {
		got, want string
		equal     bool
	}{
		{rightToken, rightToken, true},
		{"", "", true},
		{rightToken, wrongToken, false},
		{"", rightToken, false},
		{rightToken, "", false},
		{rightToken[:16], rightToken, false},
		{rightToken + "x", rightToken, false},
		{strings.ToUpper(rightToken), rightToken, false},
	} {
		if got := ConstantTimeTokenEqual(tc.got, tc.want); got != tc.equal {
			t.Errorf("ConstantTimeTokenEqual(%q, %q) = %v, want %v",
				tc.got, tc.want, got, tc.equal)
		}
	}
}

// The numbers this produces are the ones quoted in ADR 0023. Run it by hand:
//
//	go test ./internal/middleware -bench BenchmarkBearer -benchtime 200x -count 10
func BenchmarkBearerComparison(b *testing.B) {
	for name, got := range map[string]string{
		"empty":   "",
		"wrong":   wrongToken,
		"short":   "f",
		"long":    strings.Repeat("f", 4096),
		"correct": rightToken,
	} {
		b.Run(name, func(b *testing.B) {
			for range b.N {
				_ = ConstantTimeTokenEqual(got, rightToken)
			}
		})
	}
}
