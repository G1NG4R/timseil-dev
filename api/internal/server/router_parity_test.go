package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/contact"
	"github.com/G1NG4R/timseil-dev/api/internal/health"
	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/mail"
	"github.com/G1NG4R/timseil-dev/api/internal/middleware"
)

// The router parity check, in both directions.
//
// ADR 0016 declined to mount the generated router while eleven operations did
// not exist, and promised the swap to the phase that filled the last handler.
// C7 is that phase and does not swap; ADR 0024 has the four reasons. What ADR
// 0016 actually wanted is not a mechanism but a guarantee — no operation of the
// contract goes unmounted, and no mounted route stands outside it — and that is
// what this file is. The ADR names the check itself and dates it to E2; C7
// brings it forward instead.
//
// The list of contract routes is not written here. It is read out of
// httpx.HandlerWithOptions by handing it a mux that only takes notes, so it
// comes from generated code and updates itself on every `make gen`. The list of
// mounted routes is not written here either: routes() records what it
// registers. Neither side is a restatement, which is the only reason the
// comparison means anything.

// recorder is an httpx.ServeMux that serves nothing and writes down everything.
//
// HandlerWithOptions registers against that two-method interface, so the
// patterns it hands over are the routing table the contract describes —
// obtained without mounting anything and without a single generated handler
// ever running.
type recorder struct {
	patterns []string
	http.ServeMux
}

func (r *recorder) HandleFunc(pattern string, _ func(http.ResponseWriter, *http.Request)) {
	r.patterns = append(r.patterns, pattern)
}

// contractRoutes is the fourteen patterns of the contract, read from generated
// code rather than listed.
func contractRoutes(t *testing.T) []string {
	t.Helper()

	rec := &recorder{}
	// NewStrictHandler is the adapter from the strict interface to the one the
	// router registers. Going through it rather than implementing
	// httpx.ServerInterface directly keeps nopStrict written in the shape every
	// handler in this service already has.
	httpx.HandlerWithOptions(
		httpx.NewStrictHandler(nopStrict{}, nil),
		httpx.StdHTTPServerOptions{BaseRouter: rec},
	)

	if len(rec.patterns) == 0 {
		t.Fatal("the generated router registered nothing — this test would pass on anything")
	}
	return rec.patterns
}

// mountedRoutes is what routes() actually registers.
func mountedRoutes(t *testing.T) []string {
	t.Helper()

	var flag atomic.Bool
	flag.Store(true)

	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	cfg := testConfig()

	client := middleware.NewClientIP(cfg.TrustedProxies)
	limiter := middleware.NewRateLimiterPer(
		contact.RateLimit, contact.RateLimitWindow, contact.RateLimit,
		client, middleware.NewIPHasher(), log)
	t.Cleanup(limiter.Stop)

	reg := routes(cfg, stubDB{}, health.Build{Version: "dev", SHA: "unknown", StartedAt: time.Unix(0, 0).UTC()},
		mail.NewLogSender("contact@timseil.dev", log),
		contact.NewBudget(time.Now()), limiter, client, log, &flag)

	return reg.patterns
}

// The two paths that are deliberately not in the contract. They belong to the
// orchestrator rather than to a reader, they answer plain text, and putting
// them in a document whose audience is a stranger with curl would be describing
// the wrong thing to the wrong person.
var notInTheContract = []string{"GET /healthz", "GET /readyz"}

// Direction one: everything the contract describes is mounted.
//
// This is the failure ADR 0016 accepted on purpose for six phases — a
// documented operation answering 404 — and the one this check exists to end.
func TestEveryContractOperationIsMounted(t *testing.T) {
	mounted := mountedRoutes(t)

	for _, pattern := range contractRoutes(t) {
		if !slices.Contains(mounted, pattern) {
			t.Errorf("the contract describes %q and nothing mounts it", pattern)
		}
	}
}

// Direction two: nothing is mounted under /api that the contract does not
// describe. An undocumented route is the other half of the same promise — the
// contract is the single source of truth about this interface, and a route it
// does not know about makes that sentence false.
func TestNothingIsMountedThatTheContractDoesNotDescribe(t *testing.T) {
	described := contractRoutes(t)

	for _, pattern := range mountedRoutes(t) {
		if slices.Contains(notInTheContract, pattern) {
			continue
		}
		if !slices.Contains(described, pattern) {
			t.Errorf("%q is mounted and the contract does not describe it", pattern)
		}
	}
}

// The count, stated once, so that "fourteen of fourteen" is a thing this suite
// asserts rather than a thing a commit message claims.
func TestTheTwoSidesAreTheSameSize(t *testing.T) {
	described := contractRoutes(t)
	mounted := mountedRoutes(t)

	if len(described) != 14 {
		t.Errorf("the contract now has %d operations, not 14 — if that is right, "+
			"this number moves with it", len(described))
	}
	if got := len(mounted) - len(notInTheContract); got != len(described) {
		t.Errorf("%d contract routes mounted, %d described", got, len(described))
	}
}

// A pattern in the list that nobody actually registered would make both
// directions above pass while the route answered 404 — which matters because
// three of them are recorded by hand, RegisterDocs owning its own registration.
// So every pattern is driven, and none of them may be a 404.
func TestEveryMountedPatternAnswers(t *testing.T) {
	h := handler(t, nil, true)

	for _, pattern := range mountedRoutes(t) {
		method, path, ok := splitPattern(pattern)
		if !ok {
			t.Errorf("%q has no method; the mux would match it for every verb", pattern)
			continue
		}

		// A path parameter needs something in it to be routed at all.
		if path == "/api/systems/{slug}" {
			path = "/api/systems/timseil-dev"
		}

		if rec := do(t, h, method, path); rec.Code == http.StatusNotFound {
			t.Errorf("%s %s is recorded as mounted and answers 404", method, path)
		}
	}
}

// The method in the pattern is load-bearing, and it is easy to lose: a pattern
// written without one matches every verb, so a POST to a read endpoint would be
// quietly accepted and ignored instead of refused.
func TestEveryRouteRefusesTheWrongMethod(t *testing.T) {
	h := handler(t, nil, true)

	for _, pattern := range mountedRoutes(t) {
		method, path, ok := splitPattern(pattern)
		if !ok {
			continue
		}
		if path == "/api/systems/{slug}" {
			path = "/api/systems/timseil-dev"
		}

		other := http.MethodPost
		if method == http.MethodPost {
			other = http.MethodGet
		}

		rec := do(t, h, other, path)
		if rec.Code != http.StatusMethodNotAllowed {
			t.Errorf("%s %s = %d, want 405", other, path, rec.Code)
		}
		if got := rec.Header().Get("Allow"); got == "" {
			t.Errorf("%s %s: a 405 without Allow", other, path)
		}
	}
}

// ADR 0009 admits no exception, and ADR 0024 §5 turns that into a rule with a
// sharp edge: no handler may return a generated *ApplicationProblemPlusJSONResponse,
// because their Visit writes a status and a body and none of the requestId, the
// instance and the Cache-Control: no-store that every error answer here carries.
//
// The generated types are in gen.go, they are named after the status they
// carry, and they look exactly like the intended path. This is the assertion
// that catches the first person to reach for one — including me, in F1, having
// forgotten this paragraph.
//
// It sweeps every mounted route rather than listing the ones that can fail. The
// stub database refuses every query, so most reads answer 500; the two internal
// endpoints answer 401 without a token; contact answers 400 to an empty body.
// Whatever comes back, if it is an error it has to be a problem document.
func TestEveryErrorFromEveryRouteIsAProblemDocument(t *testing.T) {
	h := handler(t, nil, true)

	var errors int

	for _, pattern := range mountedRoutes(t) {
		method, path, ok := splitPattern(pattern)
		if !ok {
			continue
		}
		if path == "/api/systems/{slug}" {
			path = "/api/systems/timseil-dev"
		}

		// Both verbs: the declared one, which fails on the stub database or on
		// the missing token, and the wrong one, which is a 405 the router
		// writes rather than a handler.
		other := http.MethodPost
		if method == http.MethodPost {
			other = http.MethodGet
		}

		for _, verb := range []string{method, other} {
			rec := postEmpty(t, h, verb, path)
			if rec.Code < 400 {
				continue
			}
			errors++

			what := verb + " " + path

			// /healthz and /readyz answer plain text on purpose — they belong
			// to the orchestrator, not to the contract's audience.
			if path == "/healthz" || path == "/readyz" {
				continue
			}

			if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
				t.Errorf("%s = %d with Content-Type %q", what, rec.Code, got)
			}
			if got := rec.Header().Get("Cache-Control"); got != "no-store" {
				t.Errorf("%s = %d with Cache-Control %q, want no-store", what, rec.Code, got)
			}

			var body map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Errorf("%s = %d and the body is not JSON: %s", what, rec.Code, rec.Body.String())
				continue
			}
			for _, field := range []string{"type", "title", "status", "requestId", "instance"} {
				if body[field] == nil {
					t.Errorf("%s = %d and the document has no %s: %s",
						what, rec.Code, field, rec.Body.String())
				}
			}
			if body["status"] != float64(rec.Code) {
				t.Errorf("%s: status line %d, document says %v", what, rec.Code, body["status"])
			}
		}
	}

	// Without this the loop above passes on a router that answers 200 to
	// everything, which is the shape a mistake here would actually take.
	if errors < 20 {
		t.Errorf("only %d error answers were provoked across %d routes — "+
			"this test is not reaching the paths it claims to",
			errors, len(mountedRoutes(t)))
	}
}

// postEmpty drives one route with one verb. The body and the content type are
// there for the three write paths; the reads ignore both.
func postEmpty(t *testing.T, h http.Handler, method, path string) *httptest.ResponseRecorder {
	t.Helper()

	rec := httptest.NewRecorder()
	r := httptest.NewRequest(method, path, strings.NewReader(`{}`))
	r.RemoteAddr = "203.0.113.7:1234"
	r.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, r)
	return rec
}

func splitPattern(pattern string) (method, path string, ok bool) {
	for i := range len(pattern) {
		if pattern[i] == ' ' {
			return pattern[:i], pattern[i+1:], true
		}
	}
	return "", pattern, false
}

// nopStrict satisfies httpx.StrictServerInterface so that HandlerWithOptions
// can be asked for its routing table.
//
// It exists ONLY here, and that is the difference between this file and the
// swap it replaces. Mounting the generated router would have required three
// methods like these in production — GetDocs and its two neighbours, which the
// mux would have to shadow because RegisterDocs answers 304, sets a CSP header
// and negotiates gzip, none of which the contract declares. Three methods that
// can never be called is precisely the objection ADR 0016 raised against
// answering 501. In a test they are furniture; in the binary they would be a
// lie with a doc comment.
type nopStrict struct{}

func (nopStrict) GetSystemsBadge(context.Context, httpx.GetSystemsBadgeRequestObject) (httpx.GetSystemsBadgeResponseObject, error) {
	panic("unreachable: nopStrict is registered, never called")
}

func (nopStrict) GetUptimeBadge(context.Context, httpx.GetUptimeBadgeRequestObject) (httpx.GetUptimeBadgeResponseObject, error) {
	panic("unreachable: nopStrict is registered, never called")
}

func (nopStrict) GetVersionBadge(context.Context, httpx.GetVersionBadgeRequestObject) (httpx.GetVersionBadgeResponseObject, error) {
	panic("unreachable: nopStrict is registered, never called")
}

func (nopStrict) SubmitContact(context.Context, httpx.SubmitContactRequestObject) (httpx.SubmitContactResponseObject, error) {
	panic("unreachable: nopStrict is registered, never called")
}

func (nopStrict) GetContributions(context.Context, httpx.GetContributionsRequestObject) (httpx.GetContributionsResponseObject, error) {
	panic("unreachable: nopStrict is registered, never called")
}

func (nopStrict) GetDocs(context.Context, httpx.GetDocsRequestObject) (httpx.GetDocsResponseObject, error) {
	panic("unreachable: nopStrict is registered, never called")
}

func (nopStrict) GetDocsAsset(context.Context, httpx.GetDocsAssetRequestObject) (httpx.GetDocsAssetResponseObject, error) {
	panic("unreachable: nopStrict is registered, never called")
}

func (nopStrict) GetHealth(context.Context, httpx.GetHealthRequestObject) (httpx.GetHealthResponseObject, error) {
	panic("unreachable: nopStrict is registered, never called")
}

func (nopStrict) ReportDeploy(context.Context, httpx.ReportDeployRequestObject) (httpx.ReportDeployResponseObject, error) {
	panic("unreachable: nopStrict is registered, never called")
}

func (nopStrict) ReportProbe(context.Context, httpx.ReportProbeRequestObject) (httpx.ReportProbeResponseObject, error) {
	panic("unreachable: nopStrict is registered, never called")
}

func (nopStrict) GetOpenapiDocument(context.Context, httpx.GetOpenapiDocumentRequestObject) (httpx.GetOpenapiDocumentResponseObject, error) {
	panic("unreachable: nopStrict is registered, never called")
}

func (nopStrict) ListSystems(context.Context, httpx.ListSystemsRequestObject) (httpx.ListSystemsResponseObject, error) {
	panic("unreachable: nopStrict is registered, never called")
}

func (nopStrict) GetSystem(context.Context, httpx.GetSystemRequestObject) (httpx.GetSystemResponseObject, error) {
	panic("unreachable: nopStrict is registered, never called")
}

func (nopStrict) GetTraining(context.Context, httpx.GetTrainingRequestObject) (httpx.GetTrainingResponseObject, error) {
	panic("unreachable: nopStrict is registered, never called")
}

var _ httpx.StrictServerInterface = nopStrict{}
