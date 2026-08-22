package middleware

import "net/http"

// Func is one link. The signature matches httpx.MiddlewareFunc structurally, so
// the same functions can be handed to the generated router when C2 mounts it —
// without this package importing the generated code.
type Func func(http.Handler) http.Handler

// Chain wraps h so that the first argument is the outermost link.
//
// Reading order equals execution order, which matters here more than usual:
// the build plan states the chain as "Request-ID → slog JSON → Recovery →
// Timeout → CORS → Rate-Limit", and the call site should be able to say exactly
// that without the reader mentally reversing it.
func Chain(h http.Handler, links ...Func) http.Handler {
	for i := len(links) - 1; i >= 0; i-- {
		h = links[i](h)
	}
	return h
}

// Except returns link, skipped for the given exact paths.
//
// It exists for one pair of routes and says so at the call site rather than in
// this file: /healthz and /readyz are asked by Docker and by Traefik, not by
// visitors, and putting them through the rate limiter counts an operational
// probe against a human being's budget.
//
// That is not a tidiness argument. Traefik's load-balancer health check runs
// once a second (compose.yaml), Traefik's own requests carry no forwarded
// header, so all of them share one bucket keyed on the proxy's address — sixty
// a minute against a RATE_LIMIT_RPM of 120. The failure that buys is the worst
// shape available: a 429 on /readyz reads to Traefik as an unhealthy backend,
// so the limiter would take the service out of the pool it is protecting.
//
// EXACT paths, not prefixes. A prefix match is how /readyz-and-something-else
// gets in for free, and a limiter with a hole in it is worth more attention
// than a limiter without one.
func Except(link Func, paths ...string) Func {
	skip := make(map[string]struct{}, len(paths))
	for _, p := range paths {
		skip[p] = struct{}{}
	}
	return func(next http.Handler) http.Handler {
		limited := link(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if _, ok := skip[r.URL.Path]; ok {
				next.ServeHTTP(w, r)
				return
			}
			limited.ServeHTTP(w, r)
		})
	}
}

// recorder tracks what a handler did with the response, which the links after
// it need in order to stay out of each other's way: the log needs the status,
// the timeout needs to know whether writing has already started, and the
// recovery needs to know whether a body is already on the wire.
type recorder struct {
	http.ResponseWriter
	status  int
	written int64
	wrote   bool
}

func newRecorder(w http.ResponseWriter) *recorder {
	return &recorder{ResponseWriter: w, status: http.StatusOK}
}

func (r *recorder) WriteHeader(status int) {
	if r.wrote {
		return
	}
	r.status = status
	r.wrote = true
	r.ResponseWriter.WriteHeader(status)
}

func (r *recorder) Write(b []byte) (int, error) {
	if !r.wrote {
		r.WriteHeader(http.StatusOK)
	}
	n, err := r.ResponseWriter.Write(b)
	r.written += int64(n)
	return n, err
}

// Unwrap lets http.ResponseController reach the underlying writer, so wrapping
// does not quietly take away flushing or deadline control from a handler.
func (r *recorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }
