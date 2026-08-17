package middleware

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
)

// Timeout bounds how long a handler may take.
//
// Not http.TimeoutHandler, for two reasons. It buffers the entire response in
// memory to avoid racing a second writer, which for /api/docs/scalar.js means
// buffering a megabyte on every request. And it answers with a plain-text 503,
// making it the one error in this API that is not an RFC 9457 document — ADR
// 0009 says there is no such exception.
//
// The deadline is put on the request context, which is what the database call
// underneath already respects: pgx cancels the query, the handler gets an
// error, and it writes a problem the normal way. This middleware only has to
// answer for the case where the handler returns without having written
// anything.
//
// The status is 500 rather than 504. The contract declares exactly one status
// for "broke on our side" on these paths, and a handler that answers something
// the contract does not describe is a contract bug, not a handler decision
// (ADR 0009). The log line carries the real cause, found by request id.
func Timeout(limit time.Duration, log *slog.Logger) Func {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), limit)
			defer cancel()

			rec := newRecorder(w)
			next.ServeHTTP(rec, r.WithContext(ctx))

			if rec.wrote || !errors.Is(ctx.Err(), context.DeadlineExceeded) {
				return
			}

			log.Error("the request ran past its deadline",
				"limit", limit.String(),
				"request_id", reqid.From(r.Context()),
				"path", r.URL.Path,
			)
			httpx.WriteProblem(rec, r, http.StatusInternalServerError,
				httpx.TypeInternalError, "Internal error",
				"The request took too long. Quote the request id if you report it.")
		})
	}
}
