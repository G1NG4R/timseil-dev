// Package systems answers GET /api/systems and GET /api/systems/{slug}.
//
// These two are what the build plan calls the proving ground of the site: the
// claim is that `curl https://timseil.dev/api/systems` returns exactly what the
// page shows, so anything the handler decides on its own is a way for the two to
// disagree. Almost nothing is decided here — the metric filter lives in the SQL,
// the grid's gaps are produced by the query, the cache directive is the
// contract's, and the response types are generated from it.
//
// The one rule worth stating in Go, because Go is where it is easiest to break:
// `null` is a measurement that does not exist and `0` is one that does. Every
// nullable field is a pointer and none of them carries omitempty, so a missing
// number arrives as a present key with a null value rather than as no key at all
// (invariant 1). The other side of that rule is the golden test next door.
//
// Both handlers carry the shape httpx.StrictServerInterface expects even though
// the router mounts them directly (ADR 0016). When the generated router takes
// over in C7 that has to be a router change and not a rewrite — including for
// the two sentinel errors below, which map to problem documents through the
// strict handler's ResponseErrorHandlerFunc exactly as they do through the
// adapters here.
package systems

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// cacheControl is what the contract declares for both paths
// (components/headers/CacheControlMedium). Five minutes rather than the health
// endpoint's one: this answer changes when a measurement lands or a system moves
// state, not on every deploy. Restated here because the generated response
// object takes it as a value, and held against the served document by the
// contract test next door — a handler that invents a cache header is a contract
// bug, not a handler decision (ADR 0009).
const cacheControl = "public, s-maxage=300, stale-while-revalidate=1800"

// defaultWindow is the contract's default and the site's own number: 91 is 13×7,
// so seven rows come out even. At 90 the last column would have a hole that
// looks like a bug (invariant 7).
const defaultWindow = 91

// slugPattern is the contract's Slug parameter, character for character — and
// the same expression as systems_slug_shape_ck in 00002_systems.sql. Checking it
// here is not duplicated validation: what the pattern rejects cannot be in the
// table, so the answer is already known and there is no reason to ask Postgres.
// It also means a sixty-four-kilobyte path segment never becomes a query.
var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

const slugMaxLen = 64

// The two things that can go wrong in a way the contract has a status for.
//
// They are errors rather than response objects because the generated 400 and 404
// types write only a status and a body: no requestId, no instance, no
// `Cache-Control: no-store`. All three come from httpx's problem writer, and an
// error is what carries the decision to the layer that still has the request to
// hand (ADR 0009).
var (
	ErrNoSuchSystem = errors.New("no such system")
	ErrBadWindow    = errors.New("window is not one of 30, 91, 182")
)

// Queries is the slice of the store these two endpoints need. Narrow on purpose:
// it is what lets every branch below — an empty database, a system with no
// history, a broken one — be tested without Postgres.
type Queries interface {
	ListSystems(ctx context.Context) ([]store.ListSystemsRow, error)
	GetSystemBySlug(ctx context.Context, slug string) (store.GetSystemBySlugRow, error)
	LatestMetrics(ctx context.Context, slug string) (store.LatestMetricsRow, error)
	OpsDaysForSystem(ctx context.Context, arg store.OpsDaysForSystemParams) ([]store.OpsDaysForSystemRow, error)
	IncidentsForSystem(ctx context.Context, arg store.IncidentsForSystemParams) ([]store.IncidentsForSystemRow, error)
	DeploysForSystem(ctx context.Context, arg store.DeploysForSystemParams) ([]store.DeploysForSystemRow, error)
}

type Handler struct {
	queries Queries
	log     *slog.Logger

	// now is injected so the tests can assert on generatedAt without racing it.
	now func() time.Time
}

func New(q Queries, log *slog.Logger) *Handler {
	return &Handler{queries: q, log: log, now: time.Now}
}

// ------------------------------------------------------------ GET /api/systems

// ListSystems carries the signature of httpx.StrictServerInterface.
//
// There is no honest partial answer here: the list is the site's claim about
// which systems exist, and a short list would be a different claim rather than a
// degraded one. So a query error is an error, and the adapter turns it into a
// problem document.
func (h *Handler) ListSystems(ctx context.Context, req httpx.ListSystemsRequestObject) (
	httpx.ListSystemsResponseObject, error,
) {
	rows, err := h.queries.ListSystems(ctx)
	if err != nil {
		return nil, err
	}

	// An empty database is an answer, not a failure: `systems: []` is what this
	// endpoint says before the seed has ever run.
	list := httpx.SystemList{Systems: make([]httpx.System, 0, len(rows))}
	for _, row := range rows {
		system, err := systemFromList(row)
		if err != nil {
			return nil, err
		}
		list.Systems = append(list.Systems, system)
	}

	etag, err := etagOfList(list)
	if err != nil {
		return nil, err
	}

	if httpx.MatchesETag(ifNoneMatch(req.Params.IfNoneMatch), etag) {
		return httpx.ListSystems304Response{
			Headers: httpx.NotModifiedResponseHeaders{ETag: &etag},
		}, nil
	}

	// Filled after the tag is computed, deliberately — see etagOf.
	list.GeneratedAt = h.now().UTC()

	cache := cacheControl
	return httpx.ListSystems200JSONResponse{
		Body: list,
		Headers: httpx.ListSystems200ResponseHeaders{
			CacheControl: &cache,
			ETag:         &etag,
		},
	}, nil
}

// ----------------------------------------------------- GET /api/systems/{slug}

// GetSystem carries the signature of httpx.StrictServerInterface.
//
// Five queries rather than one join, for the reason ADR 0016 gives: each column
// keeps the nullability it has in its own table, and "there is nothing here yet"
// arrives as pgx.ErrNoRows or as an empty slice instead of as a scan failure. At
// five minutes of cache the round trips are not the expensive part.
func (h *Handler) GetSystem(ctx context.Context, req httpx.GetSystemRequestObject) (
	httpx.GetSystemResponseObject, error,
) {
	window, err := resolveWindow(req.Params.Window)
	if err != nil {
		return nil, err
	}

	if !validSlug(req.Slug) {
		// Rejected without asking Postgres: the table's own CHECK forbids this
		// shape, so the row cannot exist. 404 rather than 400 because the
		// question was "is there a system called this", and the answer is no.
		return nil, ErrNoSuchSystem
	}

	row, err := h.queries.GetSystemBySlug(ctx, req.Slug)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return nil, ErrNoSuchSystem
	case err != nil:
		return nil, err
	}

	system, err := systemFromDetail(row)
	if err != nil {
		return nil, err
	}

	live := row.State == string(httpx.SystemStateLive)

	if live {
		// Invariant 3 is in the query as well — this branch spares the round
		// trip, it does not enforce the rule.
		metrics, mErr := h.queries.LatestMetrics(ctx, req.Slug)
		switch {
		case errors.Is(mErr, pgx.ErrNoRows):
			// Nothing measured yet. Four nulls, never four zeros.
		case mErr != nil:
			return nil, mErr
		default:
			system.Metrics = metricsFrom(metrics.Uptime90d, metrics.P95Ms, metrics.ErrorRate, metrics.MeasuredAt)
		}
	}

	detail := httpx.SystemDetail{
		Slug:     system.Slug,
		SystemNo: system.SystemNo,
		Name:     system.Name,
		State:    system.State,
		Source:   system.Source,
		Stack:    system.Stack,
		Metrics:  system.Metrics,
		Window:   window,
		// Adding a field to System in the contract means adding it here too:
		// oapi-codegen flattens the allOf, so nothing makes the copy for us.
		// TestTheDetailCarriesEveryFieldTheListDoes is what catches the omission.
	}

	// The three arrays are present exactly when the contract says they are:
	// `state: live`. For a system that never ran they are absent, not empty —
	// "there is no operation grid" and "the grid is blank" are different claims,
	// and the first one is the true one for a system in build.
	if live {
		days, incidents, deploys, err := h.operations(ctx, row.ID, window)
		if err != nil {
			return nil, err
		}
		detail.Days = &days
		detail.Incidents = &incidents
		detail.Deploys = &deploys
	}

	etag, err := etagOfDetail(detail)
	if err != nil {
		return nil, err
	}

	if httpx.MatchesETag(ifNoneMatch(req.Params.IfNoneMatch), etag) {
		return httpx.GetSystem304Response{
			Headers: httpx.NotModifiedResponseHeaders{ETag: &etag},
		}, nil
	}

	detail.GeneratedAt = h.now().UTC()

	cache := cacheControl
	return httpx.GetSystem200JSONResponse{
		Body: detail,
		Headers: httpx.GetSystem200ResponseHeaders{
			CacheControl: &cache,
			ETag:         &etag,
		},
	}, nil
}

// operations reads the three window-bounded arrays. All three take the same
// window, computed the same way inside the same three queries, so the grid a
// reader counts and the notches laid over it cannot cover different periods.
func (h *Handler) operations(ctx context.Context, systemID int64, window int) (
	[]httpx.OpsDay, []httpx.Incident, []httpx.Deploy, error,
) {
	span := int32(window)

	dayRows, err := h.queries.OpsDaysForSystem(ctx, store.OpsDaysForSystemParams{
		SystemID: systemID, WindowSize: span,
	})
	if err != nil {
		return nil, nil, nil, err
	}
	days := make([]httpx.OpsDay, 0, len(dayRows))
	for _, row := range dayRows {
		days = append(days, httpx.OpsDay{
			D:          openapi_types.Date{Time: row.Day.Time},
			State:      httpx.DayState(row.State),
			DownSec:    int(row.DownSec),
			IncidentId: row.IncidentID,
		})
	}

	incidentRows, err := h.queries.IncidentsForSystem(ctx, store.IncidentsForSystemParams{
		SystemID: systemID, WindowSize: span,
	})
	if err != nil {
		return nil, nil, nil, err
	}
	incidents := make([]httpx.Incident, 0, len(incidentRows))
	for _, row := range incidentRows {
		incidents = append(incidents, httpx.Incident{
			Id:          row.ID,
			StartedAt:   row.StartedAt.Time,
			DurationSec: int(row.DurationSec),
			Cause:       row.Cause,
			Fix:         row.Fix,
			PostSlug:    row.PostSlug,
		})
	}

	deployRows, err := h.queries.DeploysForSystem(ctx, store.DeploysForSystemParams{
		SystemID: systemID, WindowSize: span,
	})
	if err != nil {
		return nil, nil, nil, err
	}
	deploys := make([]httpx.Deploy, 0, len(deployRows))
	for _, row := range deployRows {
		deploys = append(deploys, httpx.Deploy{
			Sha:         row.Sha,
			DurationSec: int(row.DurationSec),
			Result:      httpx.DeployResult(row.Result),
			At:          row.DeployedAt.Time,
		})
	}

	return days, incidents, deploys, nil
}

// ------------------------------------------------------------------- mapping

// systemFromList builds one entry of the list, metrics included: the lateral
// join already applied invariant 3, so a system that is not live arrives here
// with three nils and an invalid timestamp and needs no second filter.
func systemFromList(row store.ListSystemsRow) (httpx.System, error) {
	source, err := sourceOf(row.SourceAccess, row.SourceUrl, row.SourceReason)
	if err != nil {
		return httpx.System{}, fmt.Errorf("system %s: %w", row.Slug, err)
	}
	return httpx.System{
		Slug:     row.Slug,
		SystemNo: row.SystemNo,
		Name:     row.Name,
		State:    httpx.SystemState(row.State),
		Source:   source,
		Stack:    row.Stack,
		Metrics:  metricsFrom(row.Uptime90d, row.P95Ms, row.ErrorRate, row.MeasuredAt),
	}, nil
}

// systemFromDetail is the same shape from the other query. Metrics start empty
// and are filled by the caller only for a live system.
func systemFromDetail(row store.GetSystemBySlugRow) (httpx.System, error) {
	source, err := sourceOf(row.SourceAccess, row.SourceUrl, row.SourceReason)
	if err != nil {
		return httpx.System{}, fmt.Errorf("system %s: %w", row.Slug, err)
	}
	return httpx.System{
		Slug:     row.Slug,
		SystemNo: row.SystemNo,
		Name:     row.Name,
		State:    httpx.SystemState(row.State),
		Source:   source,
		Stack:    row.Stack,
	}, nil
}

// metricsFrom passes the four values through unchanged, and that is the whole
// job: no default, no zero, no rounding. A nil stays nil.
func metricsFrom(uptime, p95, errorRate *float64, measuredAt pgtype.Timestamptz) httpx.Metrics {
	m := httpx.Metrics{
		Uptime90d: uptime,
		P95Ms:     p95,
		ErrorRate: errorRate,
	}
	if measuredAt.Valid {
		at := measuredAt.Time.UTC()
		m.MeasuredAt = &at
	}
	return m
}

// sourceOf builds the contract's oneOf from the schema's either-or.
//
// systems_source_axis_ck already guarantees that exactly one of the two fields
// is set, so the impossible third case cannot come out of Postgres. It is still
// an error rather than a fallback: if it ever does happen, the cause is a schema
// change and the honest answer is a 500 with a log line, not a system rendered
// as closed because its URL went missing.
func sourceOf(access string, url, reason *string) (httpx.Source, error) {
	var source httpx.Source

	switch access {
	case "public":
		if url == nil {
			return source, errors.New("source_access is public with no source_url")
		}
		if err := source.FromSourcePublic(httpx.SourcePublic{
			Access: "public",
			Url:    *url,
		}); err != nil {
			return source, err
		}
	case "private":
		if reason == nil {
			return source, errors.New("source_access is private with no source_reason")
		}
		if err := source.FromSourcePrivate(httpx.SourcePrivate{
			Access: "private",
			Reason: httpx.SourceReason(*reason),
		}); err != nil {
			return source, err
		}
	default:
		return source, fmt.Errorf("unknown source_access %q", access)
	}

	return source, nil
}

// resolveWindow turns the optional parameter into the number the answer will
// carry. Absent means the contract's default; anything outside the enum is
// ErrBadWindow and becomes a 400.
//
// Falling back to 91 for an unrecognised value was the alternative, and it is
// the wrong one: the response states its own window, so a silent substitution
// would hand back a document that answers a question nobody asked and looks
// entirely correct while doing it.
func resolveWindow(w *httpx.GetSystemParamsWindow) (int, error) {
	if w == nil {
		return defaultWindow, nil
	}
	if !w.Valid() {
		return 0, ErrBadWindow
	}
	return int(*w), nil
}

func validSlug(slug string) bool {
	return len(slug) <= slugMaxLen && slugPattern.MatchString(slug)
}

func ifNoneMatch(header *string) string {
	if header == nil {
		return ""
	}
	return *header
}

// ---------------------------------------------------------------- the adapters

// ServeList and ServeDetail adapt the strict signatures to routes.
//
// They are what the generated router replaces in C7. Until then this is the
// whole cost of not publishing eleven operations that do not exist yet — and the
// error mapping below is the same mapping the strict handler's
// ResponseErrorHandlerFunc will carry, moved rather than rewritten.
func (h *Handler) ServeList(w http.ResponseWriter, r *http.Request) {
	var params httpx.ListSystemsParams
	if match := r.Header.Get("If-None-Match"); match != "" {
		params.IfNoneMatch = &match
	}

	resp, err := h.ListSystems(r.Context(), httpx.ListSystemsRequestObject{Params: params})
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	if err := resp.VisitListSystemsResponse(w); err != nil {
		h.log.Error("writing the systems response", "err", err)
	}
}

func (h *Handler) ServeDetail(w http.ResponseWriter, r *http.Request) {
	params := httpx.GetSystemParams{}
	if match := r.Header.Get("If-None-Match"); match != "" {
		params.IfNoneMatch = &match
	}

	// The query string is bound here rather than by the generated wrapper, so it
	// has to reject the same things: a non-integer is as wrong as an integer
	// outside the enum, and both are the same 400 to a caller.
	if raw := r.URL.Query().Get("window"); raw != "" {
		n, convErr := strconv.Atoi(raw)
		if convErr != nil {
			h.writeError(w, r, ErrBadWindow)
			return
		}
		window := httpx.GetSystemParamsWindow(n)
		params.Window = &window
	}

	resp, err := h.GetSystem(r.Context(), httpx.GetSystemRequestObject{
		Slug:   r.PathValue("slug"),
		Params: params,
	})
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	if err := resp.VisitGetSystemResponse(w); err != nil {
		h.log.Error("writing the system response", "err", err)
	}
}

// writeError is the one place a failure becomes a status. The two sentinels are
// answers the contract declares; everything else is ours and goes to the log
// with its request id, never to the visitor.
func (h *Handler) writeError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrNoSuchSystem):
		// The slug is deliberately not echoed. It came from the URL, it is
		// already in `instance`, and repeating attacker-controlled text into a
		// second field buys nothing.
		httpx.WriteProblem(w, r, http.StatusNotFound, httpx.TypeNotFound,
			"Not found", "There is no system at this path.")
	case errors.Is(err, ErrBadWindow):
		httpx.WriteValidationProblem(w, r, "The request did not validate.",
			[]httpx.InvalidParam{{
				Name:   "window",
				Reason: "must be one of 30, 91, 182",
			}})
	default:
		httpx.WriteInternalProblem(w, r, h.log, err)
	}
}

// etagOfList and etagOfDetail hash the answer without generatedAt.
//
// With it in the hash the tag would change every time the clock does,
// If-None-Match would never match, and the 304 path would be dead code that
// nobody notices — the endpoint would still look correct and would ship a full
// body to every poll. `window` deliberately stays in: two windows are two
// representations and must not share a tag.
//
// Both take their body by value, so blanking the field is local to the hash and
// the caller's copy keeps the real time.
func etagOfList(body httpx.SystemList) (string, error) {
	body.GeneratedAt = time.Time{}
	return hash(body)
}

func etagOfDetail(body httpx.SystemDetail) (string, error) {
	body.GeneratedAt = time.Time{}
	return hash(body)
}

func hash(body any) (string, error) {
	encoded, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	return httpx.ETagOf(encoded), nil
}
