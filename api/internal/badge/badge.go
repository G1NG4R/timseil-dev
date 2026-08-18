// Package badge answers the three Shields.io endpoint badges.
//
// They are the README's own claim-checking device: a reader who does not trust
// the number in the prose can follow the badge to the endpoint that produced
// it. That only works if the badge is as honest as the endpoint, which for this
// package means one distinction carried everywhere below — a measurement that
// does not exist reads `— NO DATA`, and a database that cannot be reached is a
// 500. Rendering the second as the first would hide an outage behind invariant
// 1, which is the opposite of what invariant 1 is for.
//
// The handlers are written in the shape httpx.StrictServerInterface expects,
// like every handler since C1, even though the router mounts them directly.
package badge

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// cacheControl is what the contract declares for all three paths
// (components/responses/BadgeOK → components/headers/CacheControlMedium). The
// value lives in httpx, held against the served document there; this line only
// picks which of the four directives these paths carry (ADR 0009).
const cacheControl = httpx.CacheControlMedium

// noData is the message for a badge with nothing behind it.
//
// The same three words the site renders, spelled the same way, because a reader
// who sees `— NO DATA` on the page and something else on the badge has found a
// disagreement between two things that are supposed to be one system.
const noData = "— NO DATA"

// The Shields.io colour names this package uses. Not tokens: these strings are
// Shields' vocabulary and are resolved on Shields' servers, so tokens.css has
// no say in them and invariant 8 is not in play.
const (
	colorGreen  = "brightgreen"
	colorYellow = "yellow"
	colorRed    = "red"
	colorGrey   = "lightgrey"
	colorBlue   = "blue"
)

// The two thresholds that colour the uptime badge. Constants rather than
// configuration for the reason ADR 0019 §6 gives about the roll-up's four
// numbers: they decide what a public claim looks like, and a value somebody can
// turn at runtime would recolour the same measurement without the page ever
// looking wrong.
const (
	uptimeGood = 99.0
	uptimeFair = 95.0
)

// Queries is the slice of the store these three endpoints need. Narrow on
// purpose: it is what lets every branch below — including the ones that only
// happen on an empty database or a broken one — be tested without Postgres.
type Queries interface {
	HealthCounts(ctx context.Context) (store.HealthCountsRow, error)
	LatestMetrics(ctx context.Context, slug string) (store.LatestMetricsRow, error)
}

type Handler struct {
	queries  Queries
	version  string
	selfSlug string
	log      *slog.Logger
}

// New takes the version rather than the whole build stamp: the version badge is
// the only one that needs it, and the commit SHA belongs on /api/health where
// there is room to say what it is.
func New(q Queries, version, selfSlug string, log *slog.Logger) *Handler {
	return &Handler{queries: q, version: version, selfSlug: selfSlug, log: log}
}

// GetUptimeBadge carries the signature of httpx.StrictServerInterface.
func (h *Handler) GetUptimeBadge(ctx context.Context, _ httpx.GetUptimeBadgeRequestObject) (
	httpx.GetUptimeBadgeResponseObject, error,
) {
	metrics, err := h.queries.LatestMetrics(ctx, h.selfSlug)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		// No snapshot at all, or the system is not live — the query carries
		// invariant 3 in its WHERE clause, so both arrive here. Neither is a
		// failure: on day one this is the correct answer and it stays correct
		// until the probe has run.
		return uptimeOK(badge("uptime", noData, colorGrey)), nil
	case err != nil:
		return nil, err
	}

	// A row can exist with a null uptime: metric_snapshots is nullable by
	// design and a snapshot may have carried only p95. Null is not zero, and a
	// zero here would read as "down all quarter" (invariant 1).
	if metrics.Uptime90d == nil {
		return uptimeOK(badge("uptime", noData, colorGrey)), nil
	}

	value := *metrics.Uptime90d
	return uptimeOK(badge("uptime", fmt.Sprintf("%.2f%%", value), uptimeColor(value))), nil
}

// GetVersionBadge carries the signature of httpx.StrictServerInterface.
//
// The only badge that never touches the database, and therefore the only one
// that cannot answer 500. An unstamped build says "dev" rather than inventing a
// version — the same honest default /api/health uses.
func (h *Handler) GetVersionBadge(_ context.Context, _ httpx.GetVersionBadgeRequestObject) (
	httpx.GetVersionBadgeResponseObject, error,
) {
	return httpx.GetVersionBadge200JSONResponse{
		BadgeOKJSONResponse: badge("version", h.version, colorBlue),
	}, nil
}

// GetSystemsBadge carries the signature of httpx.StrictServerInterface.
func (h *Handler) GetSystemsBadge(ctx context.Context, _ httpx.GetSystemsBadgeRequestObject) (
	httpx.GetSystemsBadgeResponseObject, error,
) {
	// Both counts are required integers, so there is no honest badge to render
	// when the database is unreachable. This is the branch the contract's 500
	// was added for: "0 live" would be a measurement, and a wrong one.
	counts, err := h.queries.HealthCounts(ctx)
	if err != nil {
		return nil, err
	}

	// Zero live systems is a real state and a legitimate badge — it is what the
	// site says before the first system goes live, and it is not grey.
	message := fmt.Sprintf("%d/%d live", counts.SystemsLive, counts.SystemsTotal)

	color := colorGreen
	if counts.SystemsLive == 0 {
		color = colorYellow
	}

	return httpx.GetSystemsBadge200JSONResponse{
		BadgeOKJSONResponse: badge("systems", message, color),
	}, nil
}

func uptimeColor(value float64) string {
	switch {
	case value >= uptimeGood:
		return colorGreen
	case value >= uptimeFair:
		return colorYellow
	default:
		return colorRed
	}
}

func uptimeOK(b httpx.BadgeOKJSONResponse) httpx.GetUptimeBadge200JSONResponse {
	return httpx.GetUptimeBadge200JSONResponse{BadgeOKJSONResponse: b}
}

// badge builds the payload Shields.io expects.
//
// isError stays false in every case this package produces, including `— NO
// DATA`. Shields renders isError as red, and a missing measurement is not a
// fault: colouring it like one would say the system is broken when the truth is
// that nothing has looked at it yet.
//
// cacheSeconds is read out of the directive rather than written beside it, so
// the body and the header cannot drift apart. If the directive ever loses its
// s-maxage the field is omitted — Shields then uses its own default, which is a
// better answer than a number this package made up.
func badge(label, message, color string) httpx.BadgeOKJSONResponse {
	body := httpx.Badge{
		SchemaVersion: httpx.N1,
		Label:         label,
		Message:       message,
		Color:         &color,
		IsError:       new(bool),
	}

	if seconds, ok := httpx.SharedMaxAge(cacheControl); ok {
		body.CacheSeconds = &seconds
	}

	directive := cacheControl
	return httpx.BadgeOKJSONResponse{
		Body:    body,
		Headers: httpx.BadgeOKResponseHeaders{CacheControl: &directive},
	}
}

// The three adapters. Each turns the strict signature into a route and maps a
// returned error onto a problem document — never onto a generated
// *ApplicationProblemPlusJSONResponse, whose Visit writes a status and a body
// and none of the requestId, instance and Cache-Control: no-store that ADR 0009
// requires of every error this API gives out.
func (h *Handler) ServeUptime(w http.ResponseWriter, r *http.Request) {
	resp, err := h.GetUptimeBadge(r.Context(), httpx.GetUptimeBadgeRequestObject{})
	if err != nil {
		httpx.WriteInternalProblem(w, r, h.log, err)
		return
	}
	if err := resp.VisitGetUptimeBadgeResponse(w); err != nil {
		h.log.Error("writing the uptime badge", "err", err)
	}
}

func (h *Handler) ServeVersion(w http.ResponseWriter, r *http.Request) {
	resp, err := h.GetVersionBadge(r.Context(), httpx.GetVersionBadgeRequestObject{})
	if err != nil {
		httpx.WriteInternalProblem(w, r, h.log, err)
		return
	}
	if err := resp.VisitGetVersionBadgeResponse(w); err != nil {
		h.log.Error("writing the version badge", "err", err)
	}
}

func (h *Handler) ServeSystems(w http.ResponseWriter, r *http.Request) {
	resp, err := h.GetSystemsBadge(r.Context(), httpx.GetSystemsBadgeRequestObject{})
	if err != nil {
		httpx.WriteInternalProblem(w, r, h.log, err)
		return
	}
	if err := resp.VisitGetSystemsBadgeResponse(w); err != nil {
		h.log.Error("writing the systems badge", "err", err)
	}
}
