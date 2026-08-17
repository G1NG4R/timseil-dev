package middleware

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
)

// probePaths are answered many times a minute by the container's own
// healthcheck. At info level they would be most of the log volume and would
// push the lines somebody actually wants out of Loki's retention window.
var probePaths = map[string]bool{"/healthz": true, "/readyz": true}

// Logging writes one line per request, in JSON, after the response is done.
//
// After, not before: the status and the size are the point, and a line written
// on the way in would have to be joined to one written on the way out. It also
// sits outside the recovery so that a panic still produces exactly one access
// line, carrying status 500 — with the two swapped, the requests worth reading
// about would be the ones missing from the log.
//
// What is deliberately not logged: the query string, and the client address in
// the clear. The privacy page promises no raw IPs, and F1 automates the rest;
// a promise the code does not keep is a promise with legal consequences.
func Logging(log *slog.Logger, client ClientIP, hasher IPHasher) Func {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			started := time.Now()
			rec := newRecorder(w)

			next.ServeHTTP(rec, r)

			level := slog.LevelInfo
			if probePaths[r.URL.Path] {
				level = slog.LevelDebug
			}
			if rec.status >= http.StatusInternalServerError {
				level = slog.LevelError
			}

			attrs := []any{
				"method", r.Method,
				// The path only, never the raw query: a path here names a
				// public resource, a query string is whatever a stranger typed.
				"path", r.URL.Path,
				"status", rec.status,
				"bytes", rec.written,
				"duration_ms", time.Since(started).Milliseconds(),
				"request_id", reqid.From(r.Context()),
			}
			if addr, ok := client.Resolve(r); ok {
				attrs = append(attrs, "client", hasher.Hash(client.Bucket(addr)))
			}

			log.LogAttrs(r.Context(), level, "request", toAttrs(attrs)...)
		})
	}
}

// toAttrs converts the key/value form to typed attributes so the JSON handler
// does no reflection per line. Cheap here, and the shape stays the one F1 will
// add a trace id to.
func toAttrs(kv []any) []slog.Attr {
	attrs := make([]slog.Attr, 0, len(kv)/2)
	for i := 0; i+1 < len(kv); i += 2 {
		key, _ := kv[i].(string)
		attrs = append(attrs, slog.Any(key, kv[i+1]))
	}
	return attrs
}
