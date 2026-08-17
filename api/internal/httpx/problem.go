package httpx

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
)

// The six problem types, from ADR 0009. They are part of the interface: a
// client may branch on `type`, so the strings are as stable as a field name and
// a seventh one is a contract decision, not a handler decision.
const problemBase = "https://timseil.dev/problems/"

const (
	TypeValidationFailed        = problemBase + "validation-failed"
	TypeNotFound                = problemBase + "not-found"
	TypeRateLimited             = problemBase + "rate-limited"
	TypeMailProviderUnavailable = problemBase + "mail-provider-unavailable"
	TypeUnauthorized            = problemBase + "unauthorized"
	TypeInternalError           = problemBase + "internal-error"
)

// detailLimit bounds what a visitor is shown. Nothing legitimate here is long;
// what is long is a stack trace or a driver message that got this far by
// mistake, and a bound turns that leak from a page into a sentence.
const detailLimit = 200

// WriteProblem writes an RFC 9457 document.
//
// Note what it does not take: an error. There is no parameter an err.Error()
// fits into, so a driver message cannot reach a response body by absent-
// mindedness — the compiler is a better guard than a rule somebody has to
// remember. Callers log the error and pass a sentence a visitor can read.
func WriteProblem(w http.ResponseWriter, r *http.Request, status int, typeURI, title, detail string) {
	writeProblem(w, r, Problem{
		Type:   typeURI,
		Title:  title,
		Status: status,
		Detail: optional(detail),
	})
}

// WriteValidationProblem is the 400 with its per-field reasons. invalidParams
// is present on 400 and nowhere else (ADR 0009).
func WriteValidationProblem(w http.ResponseWriter, r *http.Request, detail string, invalid []InvalidParam) {
	p := Problem{
		Type:   TypeValidationFailed,
		Title:  "Validation failed",
		Status: http.StatusBadRequest,
		Detail: optional(detail),
	}
	if len(invalid) > 0 {
		p.InvalidParams = &invalid
	}
	writeProblem(w, r, p)
}

// WriteRateLimitProblem writes the 429 together with the Retry-After header the
// contract declares for it. A 429 a client cannot see coming is a 429 it
// retries immediately, which is the opposite of a rate limit.
func WriteRateLimitProblem(w http.ResponseWriter, r *http.Request, retryAfter time.Duration) {
	seconds := int(retryAfter.Round(time.Second) / time.Second)
	if seconds < 1 {
		seconds = 1
	}
	w.Header().Set("Retry-After", strconv.Itoa(seconds))

	writeProblem(w, r, Problem{
		Type:   TypeRateLimited,
		Title:  "Too many requests",
		Status: http.StatusTooManyRequests,
		Detail: optional("Slow down and try again in " + strconv.Itoa(seconds) + " seconds."),
	})
}

// WriteInternalProblem is the one every unexpected failure funnels into. The
// cause goes to the log with the request id; the visitor gets a sentence and
// that id, which is enough for them to quote and enough for us to find.
func WriteInternalProblem(w http.ResponseWriter, r *http.Request, log *slog.Logger, cause error) {
	id := reqid.From(r.Context())
	if log != nil && cause != nil {
		log.Error("request failed", "err", cause, "request_id", id, "path", r.URL.Path)
	}
	writeProblem(w, r, Problem{
		Type:   TypeInternalError,
		Title:  "Internal error",
		Status: http.StatusInternalServerError,
		Detail: optional("Something broke on our side. Quote the request id if you report it."),
	})
}

func writeProblem(w http.ResponseWriter, r *http.Request, p Problem) {
	if id := reqid.From(r.Context()); id != "" {
		p.RequestId = &id
		// Set defensively rather than trusting the middleware: a handler under
		// unit test, or a future route mounted outside the chain, still has to
		// produce a document whose body and headers agree.
		if w.Header().Get(reqid.Header) == "" {
			w.Header().Set(reqid.Header, id)
		}
	}

	instance := r.URL.Path
	p.Instance = &instance

	p.Detail = sanitise(p.Detail)
	p.Title = strings.TrimSpace(oneLine(p.Title))

	// An error is never a cacheable representation. Without this a 500 on
	// /api/health would be stored under that path's s-maxage=60 and a broken
	// answer would outlive the breakage.
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(p.Status)

	// Encoded into the response directly: the status line is already written,
	// so there is nothing useful left to do with an encoding failure except not
	// pretend it did not happen. It cannot fail for this shape anyway.
	_ = json.NewEncoder(w).Encode(p)
}

// sanitise makes a detail safe to put in a JSON body: one line, bounded length.
//
// The CR/LF strip is what makes a stack trace structurally unable to survive
// the field even if somebody passes one, and the truncation bounds a driver
// message that arrived some other way.
func sanitise(detail *string) *string {
	if detail == nil {
		return nil
	}
	s := strings.TrimSpace(oneLine(*detail))
	if s == "" {
		return nil
	}
	if utf8.RuneCountInString(s) > detailLimit {
		runes := []rune(s)
		s = string(runes[:detailLimit-1]) + "…"
	}
	return &s
}

func oneLine(s string) string {
	return strings.Map(func(r rune) rune {
		if r == '\n' || r == '\r' || r == '\t' {
			return ' '
		}
		return r
	}, s)
}

func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
