// Package intake answers the two internal endpoints: POST /api/internal/probe
// and POST /api/internal/deploy.
//
// Both are write paths for facts this host cannot establish about itself. A
// host cannot report its own outage — handbook chapter 8 — so the uptime series
// is written from outside by a watcher that runs somewhere else, and the deploy
// duration is reported by the pipeline that measured it rather than estimated
// here. That is the whole reason the numbers on the case study may call
// themselves measured.
//
// Neither endpoint aggregates. The probe appends one row to ops_checks and the
// loop in internal/ops picks it up on the next tick (ADR 0019); the deploy
// endpoint appends one row to deploys and nothing else reads it until
// /api/health next asks for the latest.
//
// Neither appears in /api/docs: both operations are marked x-internal in the
// contract, redocly strips them from the public bundle, and tools/check-contract.sh
// fails if one ever leaks. The token is one layer of protection; the reverse
// proxy blocking the prefix from outside is the other, and that is L3.
package intake

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// cacheControl is what the contract declares for both paths
// (components/responses/AcceptedNoContent). The value lives in httpx, held
// against the served document there; this line only picks which of the four
// directives these paths carry (ADR 0009).
const cacheControl = httpx.CacheControlNone

// maxBodyBytes is small because both documents are small: four short fields.
// The generated strict decoder reads r.Body with no bound at all, which is one
// of the reasons these two endpoints keep their own adapter rather than being
// decoded for them.
const maxBodyBytes = 8 << 10

// Queries is the slice of the store these two endpoints need.
type Queries interface {
	SystemIDBySlug(ctx context.Context, slug string) (int64, error)
	InsertOpsCheck(ctx context.Context, arg store.InsertOpsCheckParams) (int64, error)
	InsertDeploy(ctx context.Context, arg store.InsertDeployParams) (int64, error)
}

type Handler struct {
	queries  Queries
	selfSlug string
	log      *slog.Logger

	// now is injected so the clock-skew rules below can be tested against a
	// fixed instant rather than against whatever time it is.
	now func() time.Time
}

func New(q Queries, selfSlug string, log *slog.Logger) *Handler {
	return &Handler{queries: q, selfSlug: selfSlug, log: log, now: time.Now}
}

// invalidBody is every rejected field of one request, so the answer names all
// of them at once rather than making a pipeline discover them one deploy at a
// time. The contract's own rule for invalidParams is one entry per rejected
// field.
type invalidBody struct{ params []httpx.InvalidParam }

func (e *invalidBody) Error() string { return "the request did not validate" }

// errNoSuchSystem is a misconfiguration, not a caller's mistake: SITE_SYSTEM_SLUG
// names a system that is not in the database. It answers 500 because from the
// caller's side nothing is wrong — a 400 would send a pipeline looking for a bug
// in its own payload.
var errNoSuchSystem = errors.New("the configured site system does not exist")

// ------------------------------------------------------------------- probe

// ReportProbe carries the signature of httpx.StrictServerInterface.
func (h *Handler) ReportProbe(ctx context.Context, req httpx.ReportProbeRequestObject) (
	httpx.ReportProbeResponseObject, error,
) {
	if req.Body == nil {
		return nil, &invalidBody{params: []httpx.InvalidParam{
			{Name: "body", Reason: "expected a JSON document"},
		}}
	}
	report := *req.Body

	if params := h.validateProbe(report); len(params) > 0 {
		return nil, &invalidBody{params: params}
	}

	systemID, err := h.systemID(ctx)
	if err != nil {
		return nil, err
	}

	arg := store.InsertOpsCheckParams{
		SystemID:   systemID,
		ObservedAt: timestamp(report.At),
		Up:         report.Up,
	}
	if report.LatencyMs != nil {
		//nolint:gosec // G115: validateProbe ran checkInt32 on this above
		latency := int32(*report.LatencyMs)
		arg.LatencyMs = &latency
	}
	if report.Reason != nil {
		reason := truncate(collapse(*report.Reason), maxReasonRunes)
		arg.Reason = &reason
	}

	rows, err := h.queries.InsertOpsCheck(ctx, arg)
	if err != nil {
		return nil, err
	}

	// Zero rows is a retry, and a retry is not an error — the prober is allowed
	// to send the same observation again after a timeout. It is logged because
	// a prober stuck resending one timestamp looks exactly like a healthy one
	// from here, and this line is the only place the difference shows.
	if rows == 0 {
		h.log.InfoContext(ctx, "probe already recorded", "observedAt", report.At.UTC())
	}

	return probeAccepted(), nil
}

func (h *Handler) validateProbe(report httpx.ProbeReport) []httpx.InvalidParam {
	var params []httpx.InvalidParam

	// The two CHECK constraints in 00004_operations.sql, taken in advance. Left
	// to the database they arrive as a driver error and leave here as a 500 —
	// which tells a prober that we broke when in fact it sent a contradiction.
	if report.Up && report.Reason != nil {
		params = append(params, httpx.InvalidParam{
			Name:   "reason",
			Reason: "only meaningful when up is false",
		})
	}
	if !report.Up && report.LatencyMs != nil {
		params = append(params, httpx.InvalidParam{
			Name:   "latencyMs",
			Reason: "a host that did not answer has no latency",
		})
	}

	// The column is a Postgres integer. The contract says `type: integer` and
	// oapi-codegen widens that to a 64-bit int, so everything between 2^31 and
	// 2^63 decodes cleanly here and fails in the driver.
	if report.LatencyMs != nil {
		if reason := checkInt32(*report.LatencyMs); reason != "" {
			params = append(params, httpx.InvalidParam{Name: "latencyMs", Reason: reason})
		}
	}

	if reason := h.checkInstant(report.At); reason != "" {
		params = append(params, httpx.InvalidParam{Name: "at", Reason: reason})
	}

	return params
}

// ------------------------------------------------------------------ deploy

// ReportDeploy carries the signature of httpx.StrictServerInterface.
func (h *Handler) ReportDeploy(ctx context.Context, req httpx.ReportDeployRequestObject) (
	httpx.ReportDeployResponseObject, error,
) {
	if req.Body == nil {
		return nil, &invalidBody{params: []httpx.InvalidParam{
			{Name: "body", Reason: "expected a JSON document"},
		}}
	}
	report := *req.Body

	if params := h.validateDeploy(report); len(params) > 0 {
		return nil, &invalidBody{params: params}
	}

	systemID, err := h.systemID(ctx)
	if err != nil {
		return nil, err
	}

	rows, err := h.queries.InsertDeploy(ctx, store.InsertDeployParams{
		SystemID: systemID,
		Sha:      report.Sha,
		//nolint:gosec // G115: validateDeploy ran checkInt32 on this above
		DurationSec: int32(report.DurationSec),
		Result:      string(report.Result),
		DeployedAt:  timestamp(report.At),
	})
	if err != nil {
		return nil, err
	}

	if rows == 0 {
		h.log.InfoContext(ctx, "deploy already recorded", "sha", report.Sha, "at", report.At.UTC())
	}

	return deployAccepted(), nil
}

func (h *Handler) validateDeploy(report httpx.DeployReport) []httpx.InvalidParam {
	var params []httpx.InvalidParam

	// deploys_sha_shape_ck is lowercase hex only. Rejected rather than
	// lower-cased: a pipeline sending an upper-cased SHA should find that out
	// once, at the point it happens, instead of having its input silently
	// rewritten — what is stored has to be what was sent.
	if reason := checkSHA(report.Sha); reason != "" {
		params = append(params, httpx.InvalidParam{Name: "sha", Reason: reason})
	}

	// encoding/json puts any string into a DeployResult without asking; the
	// generated Valid() is the enum check and has to be called. Same shape as
	// the window enum in C2 — a value the type permits and the database does
	// not.
	if !report.Result.Valid() {
		params = append(params, httpx.InvalidParam{
			Name:   "result",
			Reason: "must be one of ok, rollback",
		})
	}

	if reason := checkInt32(report.DurationSec); reason != "" {
		params = append(params, httpx.InvalidParam{Name: "durationSec", Reason: reason})
	}

	if reason := h.checkInstant(report.At); reason != "" {
		params = append(params, httpx.InvalidParam{Name: "at", Reason: reason})
	}

	return params
}

// ------------------------------------------------------------------ shared

func (h *Handler) systemID(ctx context.Context) (int64, error) {
	id, err := h.queries.SystemIDBySlug(ctx, h.selfSlug)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		h.log.ErrorContext(ctx, "the configured site system does not exist", "slug", h.selfSlug)
		return 0, errNoSuchSystem
	case err != nil:
		return 0, err
	}
	return id, nil
}

func probeAccepted() httpx.ReportProbe204Response {
	directive := cacheControl
	return httpx.ReportProbe204Response{
		Headers: httpx.AcceptedNoContentResponseHeaders{CacheControl: &directive},
	}
}

func deployAccepted() httpx.ReportDeploy204Response {
	directive := cacheControl
	return httpx.ReportDeploy204Response{
		Headers: httpx.AcceptedNoContentResponseHeaders{CacheControl: &directive},
	}
}

// writeError is the one place a returned error becomes an answer.
//
// It never returns a generated *ApplicationProblemPlusJSONResponse. Those types
// exist and look like the intended path, and their Visit writes a status and a
// body and nothing else — no requestId, no instance, no Cache-Control:
// no-store, all three of which ADR 0009 requires of every error this API gives
// out.
func (h *Handler) writeError(w http.ResponseWriter, r *http.Request, err error) {
	var body *invalidBody

	switch {
	case errors.As(err, &body):
		httpx.WriteValidationProblem(w, r, "The request did not validate.", body.params)
	default:
		// errNoSuchSystem lands here on purpose: it is our misconfiguration,
		// the caller can do nothing about it, and the detail is already in the
		// log next to the slug.
		httpx.WriteInternalProblem(w, r, h.log, err)
	}
}

// decode reads the body the way these endpoints need it read.
//
// Three properties the generated strict decoder does not have, and the reason
// both routes keep an adapter: a size bound, a refusal of unknown fields, and a
// Content-Type gate. The last is what makes the token check meaningful rather
// than advisory — without it a form post from a browser reaches the same code.
func decode[T any](h *Handler, w http.ResponseWriter, r *http.Request) (*T, bool) {
	if !isJSON(r.Header.Get("Content-Type")) {
		h.writeError(w, r, &invalidBody{params: []httpx.InvalidParam{
			{Name: "Content-Type", Reason: "expected application/json"},
		}})
		return nil, false
	}

	var body T
	decoder := json.NewDecoder(io.LimitReader(r.Body, maxBodyBytes))
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&body); err != nil {
		// The decoder's own message names Go types and byte offsets. Neither is
		// an answer to give a caller, and both are in the log already if the
		// caller quotes the request id.
		h.writeError(w, r, &invalidBody{params: []httpx.InvalidParam{
			{Name: "body", Reason: "not a valid document"},
		}})
		return nil, false
	}

	return &body, true
}

func isJSON(contentType string) bool {
	media, _, _ := strings.Cut(contentType, ";")
	return strings.EqualFold(strings.TrimSpace(media), "application/json")
}

// ServeProbe adapts the strict signature to a route.
func (h *Handler) ServeProbe(w http.ResponseWriter, r *http.Request) {
	body, ok := decode[httpx.ReportProbeJSONRequestBody](h, w, r)
	if !ok {
		return
	}

	resp, err := h.ReportProbe(r.Context(), httpx.ReportProbeRequestObject{Body: body})
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	if err := resp.VisitReportProbeResponse(w); err != nil {
		h.log.ErrorContext(r.Context(), "writing the probe response", "err", err)
	}
}

// ServeDeploy adapts the strict signature to a route.
func (h *Handler) ServeDeploy(w http.ResponseWriter, r *http.Request) {
	body, ok := decode[httpx.ReportDeployJSONRequestBody](h, w, r)
	if !ok {
		return
	}

	resp, err := h.ReportDeploy(r.Context(), httpx.ReportDeployRequestObject{Body: body})
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	if err := resp.VisitReportDeployResponse(w); err != nil {
		h.log.ErrorContext(r.Context(), "writing the deploy response", "err", err)
	}
}
