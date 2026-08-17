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

	"github.com/G1NG4R/timseil-dev/api/internal/config"
	"github.com/G1NG4R/timseil-dev/api/internal/health"
	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/middleware"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
	"github.com/G1NG4R/timseil-dev/api/internal/systems"
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
func New(cfg config.Config, pool DB, build health.Build, log *slog.Logger, accepting *atomic.Bool) (http.Handler, func()) {
	client := middleware.NewClientIP(cfg.TrustedProxies)
	hasher := middleware.NewIPHasher()
	limiter := middleware.NewRateLimiter(
		cfg.RateLimit.PerMinute, cfg.RateLimit.Burst, client, hasher, log)

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
	handler := middleware.Chain(routes(cfg, pool, build, log, accepting),
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

	return handler, limiter.Stop
}

// routes wires what this phase actually serves. The method in the pattern is
// load-bearing: "GET /healthz" makes ServeMux answer 405 to a POST instead of
// pretending the process was asked whether it is alive.
func routes(cfg config.Config, pool DB, build health.Build, log *slog.Logger,
	accepting *atomic.Bool) *http.ServeMux {
	mux := http.NewServeMux()

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

	// The proving ground: the list is the site's claim about which systems
	// exist, the detail carries the operation grid behind one of them. The
	// method in the pattern is load-bearing here too — a POST to a read-only
	// endpoint is a 405, not a route that quietly ignores what was sent.
	sys := systems.New(queries, log)
	mux.HandleFunc("GET /api/systems", sys.ServeList)
	mux.HandleFunc("GET /api/systems/{slug}", sys.ServeDetail)

	// The contract, rendered and raw: /api/docs, /api/docs/scalar.js and
	// /api/openapi.yaml.
	httpx.RegisterDocs(mux)

	return mux
}

// writePlain answers the probes. They are read by Docker, by Traefik and by a
// human with curl, none of whom want JSON — and none of whom are the contract's
// audience, which is why these two paths are not in it.
func writePlain(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body + "\n"))
}
