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

	"github.com/G1NG4R/timseil-dev/api/internal/buildinfo"
	"github.com/G1NG4R/timseil-dev/api/internal/config"
	"github.com/G1NG4R/timseil-dev/api/internal/db"
	"github.com/G1NG4R/timseil-dev/api/internal/health"
	"github.com/G1NG4R/timseil-dev/api/internal/ops"
	"github.com/G1NG4R/timseil-dev/api/internal/server"
	"github.com/G1NG4R/timseil-dev/api/internal/store"
)

// The port is fixed inside the container. Which port it appears on for the
// host is a compose concern (API_PORT in .env), not this program's.
const listenAddr = ":8080"

// Connection-level limits. They are not configurable because they answer no
// question that differs between one deployment and another: they exist to stop
// a client from holding a connection open for free.
const (
	readHeaderTimeout = 5 * time.Second
	readTimeout       = 15 * time.Second
	writeTimeout      = 30 * time.Second
	idleTimeout       = 60 * time.Second
)

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

	// Started here, after the pool and before anything can listen. The roll-up is
	// the only thing besides a handler that touches the database, so it has to be
	// stoppable on every path out of this function — and it has to stop before the
	// pool closes, which is the one ordering rule below that is load-bearing.
	//
	// C4 has no endpoint. This loop is the phase: it derives ops_days from
	// ops_checks every few minutes, and a day nobody measured never reaches the
	// table at all.
	aggregator := ops.New(store.New(pool), log)

	// Flipped before the listener closes, so /readyz says 503 while the last
	// requests drain and whatever is watching stops sending new ones.
	var accepting atomic.Bool
	accepting.Store(true)

	// Read once, here, so that the identity in the log line and the identity on
	// /api/health cannot disagree.
	build := buildinfo.Read()
	log.Info("build", "version", build.Version, "sha", build.SHA)

	handler, stopLimiter := server.New(cfg, pool, health.Build{
		Version:   build.Version,
		SHA:       build.SHA,
		StartedAt: time.Now().UTC(),
	}, log, &accepting)

	srv := &http.Server{
		Handler:           handler,
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
		aggregator.Stop()
		stopLimiter()
		pool.Close()
		return err
	}

	log.Info("api listening", "addr", ln.Addr().String())

	// All three released after the drain, and in this order: the aggregator first
	// because it is the only background user of the pool and a roll-up in flight
	// would otherwise meet a closed one, the limiter's janitor next because
	// nothing is waiting on it, the pool last because a handler still writing its
	// response may still need it.
	return serve(ctx, srv, ln, cfg.ShutdownGrace, &accepting, func() {
		aggregator.Stop()
		stopLimiter()
		pool.Close()
	}, log)
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
