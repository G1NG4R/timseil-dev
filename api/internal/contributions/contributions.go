// Package contributions answers GET /api/contributions and keeps the answer
// fresh.
//
// Two halves that never meet in a request. The Refresher fetches GitHub's
// calendar on a ticker and stores it; the Handler reads what is stored and
// nothing else. GitHub is not in the request path at all, which is what lets the
// endpoint keep its promise: an upstream that does not answer costs an older
// calendar with an honest age, never an error and never an empty year.
//
// That promise is where this endpoint differs from every other one on the site.
// Elsewhere the rule is invariant 1 — no measurement, no number, `— NO DATA`.
// Here there IS a measurement; it is simply old, and saying "412 contributions,
// three hours old" is more honest than saying nothing. `cacheAgeSec` is what
// makes the difference visible instead of hidden, so it is the one field on this
// endpoint that must never be rounded, cached or guessed.
//
// The 502 is the cold start and only the cold start: GitHub has never answered
// since this database was created, so there is nothing to be old about.
//
// The handler carries the shape httpx.StrictServerInterface expects even though
// the router mounts it directly (ADR 0016). When the generated router takes over
// in C7 that has to be a router change and not a rewrite.
package contributions

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// cacheControl is what the contract declares for this path
// (components/headers/CacheControlHour). The value lives in httpx, held against
// the served document there; this line only picks which of the four directives
// this path carries, and the contract test next door checks that the pick is the
// right one (ADR 0009).
const cacheControl = httpx.CacheControlHour

// ErrNoCalendar is the cold start: nothing has ever been fetched.
//
// A sentinel and not a generated 502 response object, for the reason ADR 0017
// gives about ErrNoSuchSystem — the generated error responses carry no
// requestId, no instance and no `Cache-Control: no-store`, so the mapping
// happens in the layer that still holds the request.
var ErrNoCalendar = errors.New("no calendar has ever been fetched")

// Queries is the slice of the store this endpoint needs. One method, narrow on
// purpose: it is what lets the cold start, a broken database and the 304 path be
// tested without Postgres.
type Queries interface {
	GetContributions(ctx context.Context, login string) (store.GetContributionsRow, error)
}

type Handler struct {
	queries Queries
	login   string
	log     *slog.Logger
}

// New takes the login rather than reading it, because the row it selects and the
// row the Refresher writes have to be the same row, and a package-level default
// in two places is how they stop being.
//
// There is no injected clock here, and that is a departure from internal/systems
// and internal/training on purpose. Those two put a timestamp of their own into
// a response. This one puts no time anywhere: `fetchedAt` is the stored one and
// `cacheAgeSec` is subtracted by Postgres, which is the only clock two instances
// can agree on.
func New(q Queries, login string, log *slog.Logger) *Handler {
	return &Handler{queries: q, login: login, log: log}
}

// GetContributions carries the signature of httpx.StrictServerInterface.
func (h *Handler) GetContributions(ctx context.Context, req httpx.GetContributionsRequestObject) (
	httpx.GetContributionsResponseObject, error,
) {
	row, err := h.queries.GetContributions(ctx, h.login)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return nil, ErrNoCalendar
	case err != nil:
		return nil, err
	}

	var weeks []httpx.ContributionWeek
	if err := json.Unmarshal(row.Weeks, &weeks); err != nil {
		return nil, err
	}
	if weeks == nil {
		// Never nil: the contract requires the array, and `null` where an array
		// is required is a shape no generated client expects. Unreachable while
		// the CHECK on the table holds, and cheap enough to keep as the second
		// line of it.
		weeks = []httpx.ContributionWeek{}
	}

	etag := etagOf(row)

	if httpx.MatchesETag(ifNoneMatch(req), etag) {
		return httpx.GetContributions304Response{
			Headers: httpx.NotModifiedResponseHeaders{ETag: &etag},
		}, nil
	}

	cache := cacheControl
	return httpx.GetContributions200JSONResponse{
		Body: httpx.Contributions{
			TotalContributions: int(row.TotalContributions),
			Weeks:              weeks,
			FetchedAt:          row.FetchedAt.Time.UTC(),
			CacheAgeSec:        int(row.CacheAgeSec),
		},
		Headers: httpx.GetContributions200ResponseHeaders{
			CacheControl: &cache,
			ETag:         &etag,
		},
	}, nil
}

// ---------------------------------------------------------------- the adapter

// ServeHTTP adapts the strict signature to a route. It is what the generated
// router replaces in C7.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var params httpx.GetContributionsParams
	if match := r.Header.Get("If-None-Match"); match != "" {
		params.IfNoneMatch = &match
	}

	resp, err := h.GetContributions(r.Context(), httpx.GetContributionsRequestObject{Params: params})
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	if err := resp.VisitGetContributionsResponse(w); err != nil {
		// The status line is already out; there is nothing left to send but a
		// log line.
		h.log.ErrorContext(r.Context(), "writing the contributions response", "err", err)
	}
}

// writeError is the one place a failure becomes a status.
//
// One sentinel, because this path declares one failure the contract knows about.
// Everything else is ours and goes to the log with its request id, never to the
// visitor.
func (h *Handler) writeError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, ErrNoCalendar) {
		// The cold start, and the only way to reach this. A cached calendar is
		// answered with its age however old it is, so 502 here means GitHub has
		// never answered since this database was created — not that it is down
		// now. The detail says which of the two it is, because the difference
		// decides whether waiting helps.
		h.log.WarnContext(r.Context(), "no cached calendar to serve", "login", h.login)
		httpx.WriteProblem(w, r, http.StatusBadGateway, httpx.TypeUpstreamUnavailable,
			"Upstream unavailable",
			"GitHub has not answered since this service started and there is no "+
				"calendar to show instead.")
		return
	}
	httpx.WriteInternalProblem(w, r, h.log, err)
}

// etagOf hashes the calendar, and only the calendar.
//
// fetchedAt and cacheAgeSec are deliberately not in it. cacheAgeSec moves every
// second, so with it in the hash every request would get a new tag,
// If-None-Match would never match, and the 304 path would be dead code that
// nothing reports — the endpoint would still look correct while shipping a full
// body to every poll. TestTheETagDoesNotMoveWithTheCacheAge is what keeps that
// from being reintroduced.
//
// The weeks are hashed as they are stored. Postgres normalises jsonb on write,
// so one value has one byte sequence: a refresh that fetched the same calendar
// produces the same tag, and a reader with the calendar already in hand still
// gets a 304 after the row has been rewritten.
func etagOf(row store.GetContributionsRow) string {
	body := make([]byte, 0, len(row.Weeks)+16)
	body = strconv.AppendInt(body, int64(row.TotalContributions), 10)
	body = append(body, ':')
	body = append(body, row.Weeks...)

	return httpx.ETagOf(body)
}

func ifNoneMatch(req httpx.GetContributionsRequestObject) string {
	if req.Params.IfNoneMatch == nil {
		return ""
	}
	return *req.Params.IfNoneMatch
}

var _ http.Handler = (*Handler)(nil)
