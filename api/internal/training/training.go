// Package training answers GET /api/training.
//
// This is the endpoint where invariant 2 becomes visible from outside. A track
// has no state column; its state is counted in v_track_states from the systems
// that prove it (ADR 0003), and nothing in this package decides one. The whole
// job here is assembly: three flat answers from the store become the tree the
// contract describes, in the order the queries returned them.
//
// Two rules worth stating in Go, because Go is where they are easiest to break:
//
// A track with no evidence keeps its place. Nine of the twenty-two tracks are
// self-study at launch, and dropping them — or letting an inner join drop them —
// would make the log look fuller than it is. They come back with an empty array
// and a note that says so, which the interface renders as
// `NO SYSTEM YET → SELF-STUDY`.
//
// The two header numbers are counted from the rows that are actually served, not
// asked of the database a second time. A second count is a second truth, and the
// one place it can differ is the one place it matters: the line above the list
// would disagree with the list.
//
// The handler carries the shape httpx.StrictServerInterface expects even though
// the router mounts it directly (ADR 0016). When the generated router takes over
// in C7 that has to be a router change and not a rewrite.
package training

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// cacheControl is what the contract declares for this path
// (components/headers/CacheControlMedium). The value lives in httpx, held
// against the served document there; this line only picks which of the four
// directives this path carries, and the contract test next door checks that the
// pick is the right one (ADR 0009).
const cacheControl = httpx.CacheControlMedium

// selfStudyNote is the API side of `NO SYSTEM YET → SELF-STUDY`.
//
// A constant rather than a column: the contract sets the field only when
// `evidence` is empty, so a column would carry the same nine words nine times
// and a migration to hold them. Lowercase because the API is lowercase and the
// interface uppercases (handbook ch. 14).
const selfStudyNote = "self-study"

// Queries is the slice of the store this endpoint needs. Narrow on purpose: it
// is what lets every branch below — an empty database, a track without
// evidence, a broken query — be tested without Postgres.
type Queries interface {
	ListModules(ctx context.Context) ([]store.ListModulesRow, error)
	ListTracksWithState(ctx context.Context) ([]store.ListTracksWithStateRow, error)
	ListTrackEvidence(ctx context.Context) ([]store.ListTrackEvidenceRow, error)
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

// GetTraining carries the signature of httpx.StrictServerInterface.
//
// There is no honest partial answer here. A training log without its evidence
// lines is not a degraded version of this document — it is the claim that
// twenty-two tracks rest on nothing, which is a different claim and a false one.
// So any query error is an error, and the adapter turns it into a problem
// document.
func (h *Handler) GetTraining(ctx context.Context, req httpx.GetTrainingRequestObject) (
	httpx.GetTrainingResponseObject, error,
) {
	moduleRows, err := h.queries.ListModules(ctx)
	if err != nil {
		return nil, err
	}
	trackRows, err := h.queries.ListTracksWithState(ctx)
	if err != nil {
		return nil, err
	}
	evidenceRows, err := h.queries.ListTrackEvidence(ctx)
	if err != nil {
		return nil, err
	}

	body := assemble(moduleRows, trackRows, evidenceRows)

	etag, err := etagOf(body)
	if err != nil {
		return nil, err
	}

	if httpx.MatchesETag(ifNoneMatch(req), etag) {
		return httpx.GetTraining304Response{
			Headers: httpx.NotModifiedResponseHeaders{ETag: &etag},
		}, nil
	}

	// Filled after the tag is computed, deliberately — see etagOf.
	body.GeneratedAt = h.now().UTC()

	cache := cacheControl
	return httpx.GetTraining200JSONResponse{
		Body: body,
		Headers: httpx.GetTraining200ResponseHeaders{
			CacheControl: &cache,
			ETag:         &etag,
		},
	}, nil
}

// ------------------------------------------------------------------ assembly

// assemble turns the three flat answers into the contract's tree.
//
// Track ids are the join key and they stop here: the contract exposes none, so
// no caller ever learns one. Everything else is a copy, in the order the queries
// produced — module_no, then sort_order, then system_no inside a track.
//
// The grouping map is read through the ordered slices and never ranged over. Map
// iteration in Go is deliberately random, and a response whose order changes
// between two identical database states has a different ETag every time, which
// would leave the 304 path dead without anything looking broken.
func assemble(
	moduleRows []store.ListModulesRow,
	trackRows []store.ListTracksWithStateRow,
	evidenceRows []store.ListTrackEvidenceRow,
) httpx.Training {
	evidence := make(map[int64][]httpx.Evidence, len(evidenceRows))
	systems := make(map[string]struct{}, len(evidenceRows))

	for _, row := range evidenceRows {
		evidence[row.TrackID] = append(evidence[row.TrackID], httpx.Evidence{
			SystemId: row.Slug,
			SystemNo: row.SystemNo,
			Detail:   row.Detail,
		})
		systems[row.Slug] = struct{}{}
	}

	tracks := make(map[string][]httpx.Track, len(moduleRows))
	for _, row := range trackRows {
		track := httpx.Track{
			Name:  row.Name,
			State: httpx.TrackState(row.State),
			// Never nil: the contract requires the array, and `null` where an
			// array is required is a shape no generated client expects.
			Evidence: []httpx.Evidence{},
		}
		if lines, ok := evidence[row.TrackID]; ok {
			track.Evidence = lines
		} else {
			note := selfStudyNote
			track.Note = &note
		}
		tracks[row.ModuleNo] = append(tracks[row.ModuleNo], track)
	}

	// An empty database is an answer, not a failure: `modules: []` with two
	// zeroes is what this endpoint says before the seed has ever run.
	modules := make([]httpx.Module, 0, len(moduleRows))
	trackCount := 0
	for _, row := range moduleRows {
		module := httpx.Module{
			No:     row.ModuleNo,
			Title:  row.Title,
			Tracks: []httpx.Track{},
		}
		if list, ok := tracks[row.ModuleNo]; ok {
			module.Tracks = list
		}
		trackCount += len(module.Tracks)
		modules = append(modules, module)
	}

	return httpx.Training{
		Modules:    modules,
		TrackCount: trackCount,
		// Distinct systems behind the lines this document actually carries. On
		// launch day every one of the thirteen points at 02 timseil.dev, so the
		// header reads one system rather than rounding the log up to thirteen.
		EvidenceSystems: len(systems),
	}
}

// ---------------------------------------------------------------- the adapter

// ServeHTTP adapts the strict signature to a route.
//
// It is what the generated router replaces in C7. There are no sentinel errors
// in this package because this path declares no 400 and no 404: it takes no
// parameter that can be wrong, and the training log exists as soon as the
// service does.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var params httpx.GetTrainingParams
	if match := r.Header.Get("If-None-Match"); match != "" {
		params.IfNoneMatch = &match
	}

	resp, err := h.GetTraining(r.Context(), httpx.GetTrainingRequestObject{Params: params})
	if err != nil {
		httpx.WriteInternalProblem(w, r, h.log, err)
		return
	}
	if err := resp.VisitGetTrainingResponse(w); err != nil {
		// The status line is already out; there is nothing left to send but a
		// log line.
		h.log.Error("writing the training response", "err", err)
	}
}

// etagOf hashes the answer without generatedAt.
//
// With it in the hash the tag would change every time the clock does,
// If-None-Match would never match, and the 304 path would be dead code that
// nobody notices — the endpoint would still look correct and would ship a full
// body to every poll.
//
// The body is taken by value, so blanking the field is local to the hash and the
// caller's copy keeps the real time.
func etagOf(body httpx.Training) (string, error) {
	body.GeneratedAt = time.Time{}
	encoded, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	return httpx.ETagOf(encoded), nil
}

func ifNoneMatch(req httpx.GetTrainingRequestObject) string {
	if req.Params.IfNoneMatch == nil {
		return ""
	}
	return *req.Params.IfNoneMatch
}

var _ http.Handler = (*Handler)(nil)
