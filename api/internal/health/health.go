// Package health answers GET /api/health.
//
// It is the endpoint the deploy gate polls — no 200 within sixty seconds of a
// release and the pipeline rolls back — and the one the README badges read. It
// is also the first endpoint of the contract this service serves, so it sets
// the pattern the rest of stage C follows: the payload type is generated, the
// headers come from the contract's own response object, and a missing
// measurement is null rather than zero.
//
// The handler is written in the shape httpx.StrictServerInterface expects, even
// though the router mounts it directly. When the last handler of stage C lands
// and the generated router takes over, that has to be a router change and not a
// rewrite of every handler.
package health

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// cacheControl is what the contract declares for this path
// (components/headers/CacheControlShort). The value lives in httpx, held against
// the served document there; this line only picks which of the four directives
// this path carries — a handler that invents a cache header is a contract bug,
// not a handler decision (ADR 0009), and the contract test next door checks that
// the pick is the right one.
const cacheControl = httpx.CacheControlShort

// Queries is the slice of the store this endpoint needs. Narrow on purpose: it
// is what lets every branch below — including the ones that only happen on an
// empty database or a broken one — be tested without Postgres.
type Queries interface {
	HealthCounts(ctx context.Context) (store.HealthCountsRow, error)
	SelfState(ctx context.Context, slug string) (string, error)
	LatestMetrics(ctx context.Context, slug string) (store.LatestMetricsRow, error)
	LastDeploy(ctx context.Context, slug string) (store.LastDeployRow, error)
}

// Build is what the binary knows about itself. The contract requires both
// strings, and both are honest defaults rather than plausible ones: an
// unstamped build says "dev" and "unknown" instead of inventing a version.
type Build struct {
	Version   string
	SHA       string
	StartedAt time.Time
}

type Handler struct {
	queries  Queries
	build    Build
	selfSlug string
	log      *slog.Logger

	// now is injected so the tests can assert on generatedAt without racing it.
	now func() time.Time
}

func New(q Queries, build Build, selfSlug string, log *slog.Logger) *Handler {
	return &Handler{queries: q, build: build, selfSlug: selfSlug, log: log, now: time.Now}
}

// GetHealth carries the signature of httpx.StrictServerInterface.
//
// Returning an error means "this could not be answered": the adapter turns it
// into a problem document. Everything that can be answered — including "the
// seed has not run" and "nothing has ever been measured" — comes back as a
// response object, because those are facts about the system and this endpoint
// exists to report facts about the system.
func (h *Handler) GetHealth(ctx context.Context, req httpx.GetHealthRequestObject) (
	httpx.GetHealthResponseObject, error,
) {
	// The two counts are the only part of the answer that is never null, so
	// they are the part that decides between an answer and a failure. There is
	// no honest value to put in systemsLive when the database is unreachable:
	// the field is a required integer, and a zero there would be an invented
	// number with the weight of a measurement (invariant 1).
	counts, err := h.queries.HealthCounts(ctx)
	if err != nil {
		return nil, err
	}

	ops := httpx.OpsSummary{
		SystemsLive:  int(counts.SystemsLive),
		SystemsTotal: int(counts.SystemsTotal),
	}

	// A missing self system is `degraded`, not a 500. The deploy gate reads
	// this endpoint, and rolling a good binary back because a seed did not run
	// would be the wrong lever: the service is up, it just cannot find the
	// system it reports on. `degraded` is the contract's own word for that.
	selfState, err := h.queries.SelfState(ctx, h.selfSlug)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		h.log.Error("the configured self system does not exist", "slug", h.selfSlug)
	case err != nil:
		return nil, err
	}

	live := err == nil && selfState == string(httpx.SystemStateLive)

	if live {
		// Metrics only for a live system — invariant 3, and the query carries
		// it too, so neither side can forget.
		metrics, mErr := h.queries.LatestMetrics(ctx, h.selfSlug)
		switch {
		case errors.Is(mErr, pgx.ErrNoRows):
			// Nothing measured yet. That is the answer on day one and it stays
			// the answer until the probe has run: four nulls, never four zeros.
		case mErr != nil:
			return nil, mErr
		default:
			ops.Uptime90d = metrics.Uptime90d
			ops.P95Ms = metrics.P95Ms
			ops.ErrorRate = metrics.ErrorRate
			if metrics.MeasuredAt.Valid {
				measured := metrics.MeasuredAt.Time
				ops.MeasuredAt = &measured
			}
		}
	}

	deploy, dErr := h.queries.LastDeploy(ctx, h.selfSlug)
	switch {
	case errors.Is(dErr, pgx.ErrNoRows):
		// Nothing deployed through the pipeline yet. E4 writes the first one.
	case dErr != nil:
		return nil, dErr
	default:
		ops.LastDeploy = &httpx.Deploy{
			Sha:         deploy.Sha,
			DurationSec: int(deploy.DurationSec),
			Result:      httpx.DeployResult(deploy.Result),
			At:          deploy.DeployedAt.Time,
		}
	}

	status := httpx.HealthStatusOk
	if !live {
		status = httpx.HealthStatusDegraded
	}

	body := httpx.Health{
		Status:    status,
		Version:   h.build.Version,
		Sha:       h.build.SHA,
		StartedAt: h.build.StartedAt,
		Ops:       ops,
	}

	etag, err := etagOf(body)
	if err != nil {
		return nil, err
	}

	if httpx.MatchesETag(ifNoneMatch(req), etag) {
		return httpx.GetHealth304Response{
			Headers: httpx.NotModifiedResponseHeaders{ETag: &etag},
		}, nil
	}

	// Filled after the tag is computed, deliberately — see etagOf.
	body.GeneratedAt = h.now().UTC()

	cache := cacheControl
	return httpx.GetHealth200JSONResponse{
		Body: body,
		Headers: httpx.GetHealth200ResponseHeaders{
			CacheControl: &cache,
			ETag:         &etag,
		},
	}, nil
}

// ServeHTTP adapts the strict signature to a route.
//
// Fifteen lines that the generated router will replace in the phase that mounts
// it. Until then this is the whole cost of not publishing eleven endpoints that
// do not exist yet.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var params httpx.GetHealthParams
	if match := r.Header.Get("If-None-Match"); match != "" {
		params.IfNoneMatch = &match
	}

	resp, err := h.GetHealth(r.Context(), httpx.GetHealthRequestObject{Params: params})
	if err != nil {
		httpx.WriteInternalProblem(w, r, h.log, err)
		return
	}
	if err := resp.VisitGetHealthResponse(w); err != nil {
		// The status line is already out; there is nothing left to send but a
		// log line.
		h.log.Error("writing the health response", "err", err)
	}
}

// etagOf hashes the answer without generatedAt.
//
// With it in the hash the tag would change every time the clock does,
// If-None-Match would never match, and the 304 path would be dead code that
// nobody notices — the endpoint would still look correct and would ship the
// full body to every poll of the deploy gate and every badge refresh.
// startedAt stays in: a restart is a legitimate reason to invalidate a cache.
func etagOf(body httpx.Health) (string, error) {
	body.GeneratedAt = time.Time{}
	encoded, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	return httpx.ETagOf(encoded), nil
}

func ifNoneMatch(req httpx.GetHealthRequestObject) string {
	if req.Params.IfNoneMatch == nil {
		return ""
	}
	return *req.Params.IfNoneMatch
}

var _ http.Handler = (*Handler)(nil)
