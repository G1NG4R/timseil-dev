package middleware

import (
	"errors"
	"log/slog"
	"net/http"
	"runtime/debug"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// Recover turns a panic into a 500 the caller can read and a log line the
// author can act on.
//
// The Definition of Done for this phase names it: "ein Panic bringt den Server
// nicht um und erzeugt eine Logzeile mit Request-ID". The stack goes into that
// line and never into the body — a stack trace in a production response is the
// oldest way to hand an attacker a map of the code.
//
// It sits inside the logging so the access line records the 500 it produced,
// and outside the timeout so a panic in the timeout machinery is caught too.
func Recover(log *slog.Logger) Func {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rec := newRecorder(w)

			defer func() {
				v := recover()
				if v == nil {
					return
				}

				// http.ErrAbortHandler is net/http's own way of saying "stop,
				// quietly". Swallowing it here would turn a deliberate abort
				// into a 500 and a false alarm in the log.
				if err, ok := v.(error); ok && errors.Is(err, http.ErrAbortHandler) {
					panic(v)
				}

				log.ErrorContext(r.Context(), "recovered from a panic",
					"panic", v,
					"path", r.URL.Path,
					"stack", string(debug.Stack()),
				)

				// If the handler already started writing there is nothing
				// honest left to send: the status line is gone and appending a
				// problem document would corrupt whatever is on the wire. The
				// connection is dropped instead, and the log line is the
				// record.
				if rec.wrote {
					panic(http.ErrAbortHandler)
				}

				httpx.WriteProblem(rec, r, http.StatusInternalServerError,
					httpx.TypeInternalError, "Internal error",
					"Something broke on our side. Quote the request id if you report it.")
			}()

			next.ServeHTTP(rec, r)
		})
	}
}
