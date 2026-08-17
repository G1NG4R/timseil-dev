// Command api is the timseil.dev backend.
//
// Two operational paths: /healthz says the process is alive, /readyz says it
// can reach Postgres. The contract's own endpoints arrive over the rest of
// stage C.
//
// Phase C1 owns the lifecycle: the configuration is read and validated once at
// startup, the pool is sized and carries the three Postgres timeouts, and a
// SIGTERM drains rather than cuts.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/config"
	"github.com/G1NG4R/timseil-dev/api/internal/db"
	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// The port is fixed inside the container. Which port it appears on for the
// host is a compose concern (API_PORT in .env), not this program's.
const listenAddr = ":8080"

// A readiness probe that can hang is not a probe.
const readyTimeout = 2 * time.Second

// pinger is everything /readyz needs from the database. Keeping it this narrow
// is what lets the handler be tested without a running Postgres.
type pinger interface {
	Ping(ctx context.Context) error
}

func main() {
	// JSON logs with request and trace IDs arrive in F1. Text is what you want
	// to read in a terminal, and a terminal is all this file is for.
	log := slog.New(slog.NewTextHandler(os.Stdout, nil))

	// Everything the process needs from its environment, read once and
	// validated as a whole. A bad value stops the start here, with every
	// problem named, rather than turning into a 503 somewhere later that sends
	// you looking in the wrong place.
	cfg, err := config.Load()
	if err != nil {
		log.Error("invalid configuration\n" + err.Error())
		os.Exit(1)
	}

	// The pool does not dial here: pgxpool connects lazily, so the server still
	// starts while Postgres is down — and /readyz then says 503, which is the
	// entire reason for having two probes instead of one.
	pool, err := db.Open(context.Background(), cfg)
	if err != nil {
		log.Error("cannot build the connection pool", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	log.Info("api listening", "addr", listenAddr)
	if err := http.ListenAndServe(listenAddr, newMux(pool, log)); err != nil &&
		!errors.Is(err, http.ErrServerClosed) {
		log.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

// newMux wires the two operational paths. The method in the pattern is
// load-bearing: "GET /healthz" makes ServeMux answer 405 to a POST instead of
// pretending the process was asked whether it is alive.
func newMux(db pinger, log *slog.Logger) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writePlain(w, http.StatusOK, "ok")
	})

	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), readyTimeout)
		defer cancel()

		if err := db.Ping(ctx); err != nil {
			// The reason goes to the log, never into the response: a DSN, a
			// host name or a driver stacktrace is not an answer to give out.
			log.Error("readiness check failed", "err", err)
			writePlain(w, http.StatusServiceUnavailable, "database unreachable")
			return
		}
		writePlain(w, http.StatusOK, "ready")
	})

	// The contract, rendered and raw: /api/docs, /api/docs/scalar.js and
	// /api/openapi.yaml. The endpoints it describes arrive in stage C.
	httpx.RegisterDocs(mux)

	return mux
}

func writePlain(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body + "\n"))
}
