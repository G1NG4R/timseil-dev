// Command api is the timseil.dev backend.
//
// Phase A4 gives it exactly two paths, both operational: /healthz says the
// process is alive, /readyz says it can reach Postgres. Everything else —
// config validation, the pool with a reasoned size and the three Postgres
// timeouts, graceful shutdown, the middleware chain — is phase C1 and is
// deliberately absent here rather than half-built.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
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

	// Full env validation is C1. The one variable this phase cannot run
	// without is checked here, so the failure is loud instead of a 503 you
	// then go looking for in the wrong place.
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Error("DATABASE_URL is empty — copy .env.example to .env")
		os.Exit(1)
	}

	// Defaults on purpose. pgxpool.New parses the DSN but does not dial, so
	// the server still starts while Postgres is down — and /readyz then says
	// 503, which is the entire reason for having two probes instead of one.
	pool, err := pgxpool.New(context.Background(), dsn)
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

	return mux
}

func writePlain(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body + "\n"))
}
