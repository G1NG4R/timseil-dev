// Command api is the timseil.dev backend.
//
// Two operational paths: /healthz says the process is alive, /readyz says it
// can reach Postgres and is still accepting work. The contract's own endpoints
// arrive over the rest of stage C.
//
// One flag, and it is not a server: `api -healthcheck` dials the /readyz of a
// server this same binary is running and exits 0 or 1. The production image is
// distroless and has no shell to run a probe with, so the probe is in here.
//
// Two subcommands, and they are not servers either: `api migrate up` applies the
// schema and `api seed` writes the curated content. They are here rather than in
// their own binaries because D2 runs both as init containers from the SAME image
// this serves from, and three separately linked Go binaries cost 32 MiB where
// one costs 15. See subcommands.go and ADR 0027.
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
	"github.com/G1NG4R/timseil-dev/api/internal/contact"
	"github.com/G1NG4R/timseil-dev/api/internal/contributions"
	"github.com/G1NG4R/timseil-dev/api/internal/db"
	"github.com/G1NG4R/timseil-dev/api/internal/health"
	"github.com/G1NG4R/timseil-dev/api/internal/mail"
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
	// Before the logger and long before the configuration. The probe answers a
	// question about the server that is already running; reading this process's
	// own environment could only make it fail for reasons that have nothing to
	// do with whether that server is serving. See healthcheck.go.
	if wantsHealthcheck(os.Args[1:]) {
		runHealthcheck()
	}

	// Also before the configuration, and for a related reason. `api migrate up`
	// has nothing to say about GITHUB_TOKEN or the mail transport, and a process
	// that refuses to migrate because an unrelated variable is missing is a
	// process that cannot repair the database it is complaining about. The
	// subcommands read the one environment variable each of them needs and
	// nothing else. See subcommands.go.
	if name, rest, ok := wantsSubcommand(os.Args[1:]); ok {
		os.Exit(runSubcommand(name, rest))
	}

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
		// exitAfterDefer is correct that `defer stop()` above will not run, and
		// it does not matter: stop() only unregisters the signal handler, and
		// the process is one statement away from not having one. Restructuring
		// main to return an error just so a no-op can run would be ceremony.
		os.Exit(1) //nolint:gocritic // exitAfterDefer: stop() is moot at exit
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

	// The second background user of the pool, and the only thing in this binary
	// that talks to anything outside it. It keeps the contribution calendar
	// fresh so that no visitor ever waits on GitHub: the handler reads the
	// cached row and nothing else, and an unreachable GitHub costs an older
	// calendar with an honest age rather than an error.
	refresher := contributions.NewRefresher(store.New(pool), cfg.GitHub, log)

	// The mail transport, and the hourly ceiling both users of it share.
	//
	// One Budget for the handler and the dispatcher together, because it stands
	// between this service and OVH's quota and a quota is not per goroutine.
	// The sender is built here rather than inside internal/server so that the
	// dispatcher and the handler talk to the same one, and so that the choice of
	// transport is made once, next to the line that announces it.
	sender := newSender(cfg.Mail, log)
	budget := contact.NewBudget(time.Now())

	// The third background user of the pool. It carries out what the handler
	// could not: a visitor gets one attempt because they are waiting on the
	// answer, and everything after that is this loop's.
	dispatcher := contact.NewDispatcher(store.New(pool), sender, cfg.Mail.To, budget, log)

	// Flipped before the listener closes, so /readyz says 503 while the last
	// requests drain and whatever is watching stops sending new ones.
	var accepting atomic.Bool
	accepting.Store(true)

	// Read once, here, so that the identity in the log line and the identity on
	// /api/health cannot disagree.
	build := buildinfo.Read()
	log.Info("build", "version", build.Version, "sha", build.SHA)

	handler, stopLimiters := server.New(cfg, pool, health.Build{
		Version:   build.Version,
		SHA:       build.SHA,
		StartedAt: time.Now().UTC(),
	}, sender, budget, log, &accepting)

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

	// G102 is right about what this does and wrong about what it means here:
	// the process has no host interfaces to be careful about. It listens inside a
	// container whose port is never published (compose.yaml, ADR 0027) and is
	// reached over the docker network by Traefik alone. Binding to the container
	// IP instead would be a value nothing here knows at start.
	ln, err := net.Listen("tcp", listenAddr) //nolint:gosec // G102: see above
	if err != nil {
		aggregator.Stop()
		refresher.Stop()
		dispatcher.Stop()
		stopLimiters()
		pool.Close()
		return err
	}

	log.Info("api listening", "addr", ln.Addr().String())

	// All five released after the drain, and in this order: the three background
	// users of the pool first, because work in flight would otherwise meet a
	// closed one, the limiters' janitors next because nothing is waiting on
	// them, the pool last because a handler still writing its response may still
	// need it. Every Stop cancels rather than waits — a roll-up or a fetch cut
	// halfway loses nothing that the next tick does not redo, and a delivery cut
	// halfway costs at worst one duplicate mail to our own inbox, which is
	// cheaper than holding the drain open for an SMTP conversation.
	return serve(ctx, srv, ln, cfg.ShutdownGrace, &accepting, func() {
		aggregator.Stop()
		refresher.Stop()
		dispatcher.Stop()
		stopLimiters()
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

// newSender picks the transport and says so when it is not the real one.
//
// A process that only logs its mail is a process whose contact form is silently
// off, and the way that gets discovered otherwise is an empty inbox weeks later.
// So the log transport announces itself at WARN, once, at startup — the same
// place a missing credential would have.
func newSender(cfg config.Mail, log *slog.Logger) mail.Sender {
	if cfg.Sends() {
		return mail.NewSMTPSender(cfg.Username, cfg.Password)
	}

	log.Warn("mail is NOT being sent — MAIL_TRANSPORT is log",
		"reason", "messages are built in full and written to a log line instead",
		"note", "a visitor's address ends up in that line; this is a development transport")
	return mail.NewLogSender(cfg.Username, log)
}
