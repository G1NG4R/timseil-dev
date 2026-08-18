// Package server assembles the routes and the middleware chain.
//
// It mounts only what exists. The generated router in internal/httpx registers
// all fourteen contract operations at once, and this service is deployed after
// every phase of stage C — so between C1 and C7 the unbuilt ones would have to
// answer something in production, and every candidate is a lie: 500 says we
// broke, 501 is declared by no operation so a generated client cannot parse it,
// and 404 for a documented resource is only honest if the route genuinely does
// not exist. Which is exactly what not registering it achieves.
//
// The swap to httpx.HandlerWithOptions belongs to the phase that fills the last
// handler; every handler written until then should carry the shape the strict
// interface expects, so that the change is a router change and not a rewrite.
package server

import (
	"context"
	"log/slog"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/badge"
	"github.com/G1NG4R/timseil-dev/api/internal/config"
	"github.com/G1NG4R/timseil-dev/api/internal/contact"
	"github.com/G1NG4R/timseil-dev/api/internal/contributions"
	"github.com/G1NG4R/timseil-dev/api/internal/health"
	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/intake"
	"github.com/G1NG4R/timseil-dev/api/internal/mail"
	"github.com/G1NG4R/timseil-dev/api/internal/middleware"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
	"github.com/G1NG4R/timseil-dev/api/internal/systems"
	"github.com/G1NG4R/timseil-dev/api/internal/training"
)

// A readiness probe that can hang is not a probe.
const readyTimeout = 2 * time.Second

// DB is everything this package needs from the pool: a ping for the readiness
// probe, and the query surface the generated store runs on. Narrow on purpose —
// it is what lets the routes be tested without a running Postgres.
type DB interface {
	store.DBTX
	Ping(ctx context.Context) error
}

// New returns the handler and a function that releases what it started.
//
// The returned cleanup stops the rate limiter's janitor. It is separate from
// closing the pool because the two have to happen in order, after the drain,
// and the caller is the only place that knows when that is.
func New(cfg config.Config, pool DB, build health.Build, sender mail.Sender,
	budget *contact.Budget, log *slog.Logger, accepting *atomic.Bool,
) (http.Handler, func()) {
	client := middleware.NewClientIP(cfg.TrustedProxies)
	hasher := middleware.NewIPHasher()
	limiter := middleware.NewRateLimiter(
		cfg.RateLimit.PerMinute, cfg.RateLimit.Burst, client, hasher, log)

	// The second limiter, and the reason it is not another link in the chain:
	// three per ten minutes belongs to one route, and wrapping that route at its
	// mux line makes the route the whole statement of scope. A chain link would
	// need a path test of its own, and then the scope and the mounting could
	// disagree. ADR 0015 §3 asked for it in as many words.
	contactLimiter := middleware.NewRateLimiterPer(
		contact.RateLimit, contact.RateLimitWindow, contact.RateLimit, client, hasher, log)

	// The chain, in the order the build plan states it, read outermost first.
	//
	// Request id first, because everything after it has to be able to quote
	// one. Logging second, so the access line records the final status —
	// including a 500 that recovery produced, which is the line most worth
	// having. Recovery inside logging for that reason and outside the timeout
	// so a panic in the timeout machinery is caught too. CORS before the rate
	// limit, because a preflight answered with 429 reaches the browser as an
	// opaque CORS failure instead of a readable one. The rate limit last, so a
	// throttled request still has an id and a log line.
	handler := middleware.Chain(
		routes(cfg, pool, build, sender, budget, contactLimiter, client, log, accepting).mux,
		middleware.RequestID(client),
		middleware.Logging(log, client, hasher),
		middleware.Recover(log),
		middleware.Timeout(cfg.RequestTimeout, log),
		middleware.CORS(cfg.AllowedOrigins),
		limiter.Middleware(),
		// Not a policy link: an adapter that turns ServeMux's own plain-text
		// 404 and 405 into problem documents. Innermost, closest to the routes.
		middleware.ProblemErrors(),
	)

	// Both janitors, in one function, because the caller is the only place that
	// knows when the drain is over and should not have to remember that there
	// are two.
	return handler, func() {
		limiter.Stop()
		contactLimiter.Stop()
	}
}

// routes wires what this phase actually serves. The method in the pattern is
// load-bearing: "GET /healthz" makes ServeMux answer 405 to a POST instead of
// pretending the process was asked whether it is alive.
func routes(cfg config.Config, pool DB, build health.Build, sender mail.Sender,
	budget *contact.Budget, contactLimiter *middleware.RateLimiter,
	client middleware.ClientIP, log *slog.Logger, accepting *atomic.Bool,
) *registry {
	mux := &registry{mux: http.NewServeMux()}

	// Liveness. It stays 200 while draining: a draining process is still alive,
	// and a 503 here would have the orchestrator kill it mid-shutdown.
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writePlain(w, http.StatusOK, "ok")
	})

	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		// Draining counts as not ready even though the database is fine. The
		// question this probe is asked is "should you send me work".
		if !accepting.Load() {
			writePlain(w, http.StatusServiceUnavailable, "shutting down")
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), readyTimeout)
		defer cancel()

		if err := pool.Ping(ctx); err != nil {
			// The reason goes to the log, never into the response: a DSN, a
			// host name or a driver stacktrace is not an answer to give out.
			log.Error("readiness check failed", "err", err)
			writePlain(w, http.StatusServiceUnavailable, "database unreachable")
			return
		}
		writePlain(w, http.StatusOK, "ready")
	})

	// The first operation of the contract this service serves. The rest of
	// stage C mounts itself here, one line at a time.
	queries := store.New(pool)

	mux.Handle("GET /api/health",
		health.New(queries, build, cfg.SiteSystemSlug, log))

	// The three Shields.io badges. They read the same numbers /api/health does
	// and exist so the README can point at a live endpoint instead of a claim —
	// which is why they are mounted next to it rather than with the systems.
	bdg := badge.New(queries, build.Version, cfg.SiteSystemSlug, log)
	mux.HandleFunc("GET /api/badge/uptime", bdg.ServeUptime)
	mux.HandleFunc("GET /api/badge/version", bdg.ServeVersion)
	mux.HandleFunc("GET /api/badge/systems", bdg.ServeSystems)

	// The proving ground: the list is the site's claim about which systems
	// exist, the detail carries the operation grid behind one of them. The
	// method in the pattern is load-bearing here too — a POST to a read-only
	// endpoint is a 405, not a route that quietly ignores what was sent.
	sys := systems.New(queries, log)
	mux.HandleFunc("GET /api/systems", sys.ServeList)
	mux.HandleFunc("GET /api/systems/{slug}", sys.ServeDetail)

	// The training log. It reads the derivation in v_track_states and decides
	// nothing itself — the one endpoint where invariant 2 leaves the database.
	mux.Handle("GET /api/training", training.New(queries, log))

	// The contribution calendar. This handler reads the cached row and nothing
	// else; GitHub is not in the request path at all. Whoever comes looking for
	// the outbound call finds it in the Refresher that cmd/api starts, which is
	// also where the token lives and where it stays.
	mux.Handle("GET /api/contributions",
		contributions.New(queries, cfg.GitHub.Login, log))

	// The one unauthenticated write path, and the only route with a limiter of
	// its own. The broad one has already counted this request by the time the
	// strict one sees it; the two are separate buckets on purpose, so that a
	// spent contact budget does not close the read endpoints and reading does
	// not use up somebody's three messages.
	mux.Handle("POST /api/contact", contactLimiter.Gate(
		contact.New(queries, sender, cfg.Mail.To, []byte(cfg.Contact.IPPepper),
			cfg.AllowedOrigins, client, budget, log)))

	// The two internal endpoints. A host cannot report its own outage and a
	// pipeline is the only thing that knows what its own release cost, so both
	// of these are written from outside — which is exactly why they are the two
	// routes with a token in front of them.
	//
	// The guard is wrapped here at the mux line rather than added to the chain,
	// for the reason the contact limiter is (ADR 0015 §3): the route is the
	// whole statement of the scope. A chain link would need a path test, and a
	// path test that drifts from the router is an unauthenticated write path.
	//
	// Two tokens and not one. The prober (F4) and the deploy pipeline (E4) are
	// different callers, and a leaked probe token must not be able to invent
	// the deploy duration the case study calls measured.
	in := intake.New(queries, cfg.SiteSystemSlug, log)
	mux.Handle("POST /api/internal/probe",
		middleware.Bearer(cfg.Internal.ProbeToken, log)(http.HandlerFunc(in.ServeProbe)))
	mux.Handle("POST /api/internal/deploy",
		middleware.Bearer(cfg.Internal.DeployToken, log)(http.HandlerFunc(in.ServeDeploy)))

	// The contract, rendered and raw: /api/docs, /api/docs/scalar.js and
	// /api/openapi.yaml.
	httpx.RegisterDocs(mux.mux)
	mux.record("GET /api/docs", "GET /api/docs/scalar.js", "GET /api/openapi.yaml")

	return mux
}

// registry is the ServeMux plus the list of patterns that went into it.
//
// The list exists for the parity check in router_parity_test.go, which holds it
// against the routing table oapi-codegen builds from the contract — in both
// directions, so a documented operation nobody mounted fails and a mounted
// route the contract does not describe fails too.
//
// Taken from the registration itself rather than restated in the test, and that
// is the whole design. A hand-kept list of routes is a second statement of the
// router, it agrees on the day it is written, and the failure it eventually
// hides is "this endpoint was never mounted" — which reads, from outside, as a
// documented resource answering 404.
//
// RegisterDocs is the one caller that cannot go through handle: it takes a
// concrete *http.ServeMux and registers three patterns itself. Those three are
// recorded by hand, and the smoke half of the parity test is what keeps that
// honest — a recorded pattern nobody registered answers 404 and fails there.
type registry struct {
	mux      *http.ServeMux
	patterns []string
}

func (g *registry) Handle(pattern string, h http.Handler) {
	g.record(pattern)
	g.mux.Handle(pattern, h)
}

func (g *registry) HandleFunc(pattern string, h func(http.ResponseWriter, *http.Request)) {
	g.record(pattern)
	g.mux.HandleFunc(pattern, h)
}

func (g *registry) record(patterns ...string) {
	g.patterns = append(g.patterns, patterns...)
}

// writePlain answers the probes. They are read by Docker, by Traefik and by a
// human with curl, none of whom want JSON — and none of whom are the contract's
// audience, which is why these two paths are not in it.
func writePlain(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body + "\n"))
}
