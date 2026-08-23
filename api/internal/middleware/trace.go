package middleware

import (
	"net/http"

	"github.com/G1NG4R/timseil-dev/api/internal/traceparent"
)

// Trace continues an inbound trace or starts a new one.
//
// It takes the header from ANY peer, and that is the one place it differs from
// RequestID next door. The difference is deliberate, and the reason is what each
// id is FOR:
//
//	X-Request-Id  is echoed in the response header and in every problem
//	              document (ADR 0009). A stranger who sets it chooses the name
//	              his request goes by in our logs and in our replies to other
//	              people. That is why it needs a trusted peer.
//	traceparent   goes nowhere. Thirty-two hex characters that this service only
//	              ever writes into its own log line, and Parse accepts nothing
//	              else — no newline to forge an entry, no separator to split a
//	              header, no room for a value that means anything.
//
// The alternative was to gate this on the proxy list too, and it does not work
// here. compose.dev.yaml leaves TRUSTED_PROXY_CIDRS empty on purpose — filling
// it would make the api stop rate limiting and say so once a minute — so a gate
// would mean the two services could never share an id in development, which is
// where the correlation gets demonstrated. In production api and web sit on two
// networks and which address the connection uses is not pinned, so the gate
// would be a coin toss there as well.
//
// Outermost, before RequestID: a panic, a 429 and a timeout all belong to the
// trace that caused them, and none of them reach a handler that could set it.
func Trace() Func {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sc, ok := parseInbound(r)
			if ok {
				// Same trace, our own span. Without a new span id, this service
				// and its caller are one span in F8's view, and the hop between
				// them — the thing worth seeing — has no width.
				sc = traceparent.Child(sc)
			} else {
				sc = traceparent.New()
			}

			// Not written to the response. traceparent is a request header; the
			// answer already carries X-Request-Id, which is the id a person
			// quotes.
			next.ServeHTTP(w, r.WithContext(traceparent.With(r.Context(), sc)))
		})
	}
}

// parseInbound reads the header, refusing a request that carries more than one.
//
// The specification says a receiver must restart the trace when it sees several,
// and it is right: picking one would be picking which of two callers to believe.
func parseInbound(r *http.Request) (traceparent.SpanContext, bool) {
	values := r.Header.Values(traceparent.Header)
	if len(values) != 1 {
		return traceparent.SpanContext{}, false
	}
	return traceparent.Parse(values[0])
}
