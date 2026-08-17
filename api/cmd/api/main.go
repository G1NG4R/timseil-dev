// Command api is the timseil.dev backend.
//
// Two operational paths: /healthz says the process is alive, /readyz says it
// can reach Postgres and is still accepting work. The contract's own endpoints
// arrive over the rest of stage C.
//
// Phase C1 owns the lifecycle. The configuration is read and validated once at
// startup, the pool is sized and carries the three Postgres timeouts, and a
// SIGTERM drains rather than cuts — which is what E5 leans on when it runs two
// instances of this binary at once to deploy without downtime.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
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

// Connection-level limits. They are not configurable because they answer no
// question that differs between one deployment and another: they exist to stop
// a client from holding a connection open for free.
const (
	readHeaderTimeout = 5 * time.Second
	readTimeout       = 15 * time.Second
	writeTimeout      = 30 * time.Second
	idleTimeout       = 60 * time.Second
)

// pinger is everything /readyz needs from the database. Keeping it this narrow
// is what lets the handler be tested without a running Postgres.
type pinger interface {
	Ping(ctx context.Context) error
}

func main() {
	// A logger before the configuration, because the configuration is the
	// first thing that can fail. JSON from the first line: F1 correlates the
	// two services by request id, and a process that starts in one format and
	// continues in another is a parser nobody wants to write.
	log := newLogger(slog.LevelInfo)

	cfg, err := config.Load()
	if err != nil {
		log.Error("invalid configuration\n" + err.Error())
		os.Exit(1)
	}
	log = newLogger(cfg.LogLevel)

	// Installed before anything else can block, so a SIGTERM during startup is
	// still an orderly stop rather than a kill.
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := run(ctx, cfg, log); err != nil {
		log.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func newLogger(level slog.Level) *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level}))
}

func run(ctx context.Context, cfg config.Config, log *slog.Logger) error {
	// context.Background, not ctx: this context only governs building the pool.
	// Handing it the signal context would make a SIGTERM during startup look
	// like a database that could not be reached.
	pool, err := db.Open(context.Background(), cfg)
	if err != nil {
		return err
	}

	// Flipped before the listener closes, so /readyz says 503 while the last
	// requests drain and whatever is watching stops sending new ones.
	var accepting atomic.Bool
	accepting.Store(true)

	srv := &http.Server{
		Handler:           newMux(pool, log, &accepting),
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
		ErrorLog:          slog.NewLogLogger(log.Handler(), slog.LevelWarn),

		// context.Background, and this line is the whole phase in one place.
		// BaseContext is the parent of every request context: wiring the signal
		// context here would cancel every request in flight the instant SIGTERM
		// arrives, which is precisely the cut this phase promises not to make.
		// It reads like careful code and it is the opposite.
		BaseContext: func(net.Listener) context.Context { return context.Background() },
	}

	ln, err := net.Listen("tcp", listenAddr)
	if err != nil {
		pool.Close()
		return err
	}

	log.Info("api listening", "addr", ln.Addr().String())
	return serve(ctx, srv, ln, cfg.ShutdownGrace, &accepting, pool.Close, log)
}

// serve runs the server until ctx is done, then drains it.
//
// Split out of run so the shutdown can be tested against the code that actually
// ships rather than against a copy of it. onDrained is the pool: it is closed
// last, on purpose.
func serve(
	ctx context.Context,
	srv *http.Server,
	ln net.Listener,
	grace time.Duration,
	accepting *atomic.Bool,
	onDrained func(),
	log *slog.Logger,
) error {
	failed := make(chan error, 1)
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			failed <- err
		}
	}()

	select {
	case err := <-failed:
		onDrained()
		return err
	case <-ctx.Done():
	}

	accepting.Store(false)
	log.Info("shutdown requested, draining", "grace", grace.String())

	// context.Background again: the shutdown must not inherit the deadline of
	// the signal that asked for it.
	drain, cancel := context.WithTimeout(context.Background(), grace)
	defer cancel()

	err := srv.Shutdown(drain)

	// After the drain, never before. A handler still writing its response may
	// still need the database, and closing the pool first would turn the last
	// requests into 500s — the same cut, wearing a different hat.
	onDrained()

	if err != nil {
		// Reported, not fatal. Exiting non-zero on a SIGTERM makes Docker mark
		// the container failed and can trip a restart policy in the middle of a
		// perfectly normal rolling deploy. The log line is the signal.
		log.Error("the grace period expired with requests still running", "err", err)
		return nil
	}

	log.Info("drained cleanly")
	return nil
}

// newMux wires the two operational paths. The method in the pattern is
// load-bearing: "GET /healthz" makes ServeMux answer 405 to a POST instead of
// pretending the process was asked whether it is alive.
func newMux(dbConn pinger, log *slog.Logger, accepting *atomic.Bool) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writePlain(w, http.StatusOK, "ok")
	})

	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		// Draining counts as not ready even though the database is fine: the
		// answer to "should you send me work" is no, and that is the question
		// this probe is asked.
		if !accepting.Load() {
			writePlain(w, http.StatusServiceUnavailable, "shutting down")
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), readyTimeout)
		defer cancel()

		if err := dbConn.Ping(ctx); err != nil {
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
