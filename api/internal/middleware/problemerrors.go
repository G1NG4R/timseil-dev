package middleware

import (
	"net/http"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// ProblemErrors rewrites the router's own 404 and 405 as problem documents.
//
// ADR 0009 admits no exception: every error answer is application/problem+json.
// Two of them are not written by any handler — ServeMux answers "no such route"
// and "wrong method for this route" itself, in plain text, and those are the
// two errors a stranger poking at the API is most likely to see first.
//
// It cannot be done by registering a catch-all "/" instead. That pattern would
// match a POST to /healthz more specifically than nothing does, and ServeMux
// would answer 404 where it currently answers 405 — trading a correct status
// for a correct content type.
//
// So the default answers are intercepted instead: the status is taken, the
// plain-text body is dropped, and a document is written in its place. Anything
// that already declared itself a problem is passed straight through, so a
// handler writing its own 404 keeps its own detail.
//
// This is an adapter around ServeMux, not a policy link, so it sits innermost —
// under the rate limit, closest to the routes.
func ProblemErrors() Func {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			pw := &problemWriter{ResponseWriter: w}
			next.ServeHTTP(pw, r)

			switch pw.intercepted {
			case http.StatusNotFound:
				httpx.WriteProblem(w, r, http.StatusNotFound, httpx.TypeNotFound,
					"Not found", "No route answers this path.")
			case http.StatusMethodNotAllowed:
				// ServeMux has already set Allow, which RFC 9110 requires on a
				// 405 and which WriteProblem leaves alone.
				httpx.WriteProblem(w, r, http.StatusMethodNotAllowed, httpx.TypeNotFound,
					"Method not allowed", "That path does not answer this method.")
			}
		})
	}
}

type problemWriter struct {
	http.ResponseWriter
	intercepted int
	wrote       bool
}

func (p *problemWriter) WriteHeader(status int) {
	if p.wrote {
		return
	}
	if (status == http.StatusNotFound || status == http.StatusMethodNotAllowed) &&
		p.Header().Get("Content-Type") != "application/problem+json" {
		p.intercepted = status
		p.wrote = true
		// Deliberately not forwarded: the status is written afterwards, by the
		// problem writer, together with the headers that belong to it.
		return
	}
	p.wrote = true
	p.ResponseWriter.WriteHeader(status)
}

func (p *problemWriter) Write(b []byte) (int, error) {
	if !p.wrote {
		p.WriteHeader(http.StatusOK)
	}
	if p.intercepted != 0 {
		// Swallow "404 page not found\n" and its 405 sibling. Reporting the
		// full length keeps the caller from treating the drop as a short write.
		return len(b), nil
	}
	return p.ResponseWriter.Write(b)
}

func (p *problemWriter) Unwrap() http.ResponseWriter { return p.ResponseWriter }
