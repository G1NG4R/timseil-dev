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
