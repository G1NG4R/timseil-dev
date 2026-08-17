// Package db builds the connection pool: a reasoned size, and the three
// Postgres session timeouts that keep one bad query from becoming an outage.
package db

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/G1NG4R/timseil-dev/api/internal/config"
)

// applicationName shows up in pg_stat_activity. A blank one there is a session
// nobody can attribute while they are trying to work out what is holding a lock.
const applicationName = "timseil-api"

// The lifetime settings are not configurable, because there is no operational
// question they answer differently on one machine than on another.
const (
	// Under an hour, so a connection never survives long enough to meet an
	// hourly reaper on the other side, and jittered so the pool does not
	// recycle all of its connections in the same second.
	maxConnLifetime = 55 * time.Minute
	lifetimeJitter  = 5 * time.Minute

	maxConnIdleTime = 5 * time.Minute

	// pgx checks every minute by default, which is long enough for a request to
	// find the dead connection first and pay for the discovery.
	healthCheckPeriod = 30 * time.Second
)

// Config turns the validated configuration into a pool configuration.
//
// It is separate from Open so the whole thing can be asserted without a
// database: what this function decides is exactly what tends to be wrong.
func Config(cfg config.Config) (*pgxpool.Config, error) {
	pc, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		// The DSN carries a password. Naming the variable is enough to find
		// the problem; quoting its value would put credentials in a log.
		return nil, fmt.Errorf("%s does not parse: %w", config.EnvDatabaseURL, err)
	}

	pc.MaxConns = cfg.DB.MaxConns
	pc.MinConns = cfg.DB.MinConns
	pc.MaxConnLifetime = maxConnLifetime
	pc.MaxConnLifetimeJitter = lifetimeJitter
	pc.MaxConnIdleTime = maxConnIdleTime
	pc.HealthCheckPeriod = healthCheckPeriod

	// The three timeouts travel in the startup packet rather than as a SET
	// after connecting. Two reasons, and both matter on a reconnect: a runtime
	// parameter is in force before the first query on every connection the pool
	// ever opens, and it costs no round trip that could itself hang.
	//
	// Assigned after ParseConfig on purpose, so the code wins over the DSN. The
	// DSN is one string a human edits in a deployment UI; an operational limit
	// that lives there is not reviewable and does not survive a copy-paste.
	pc.ConnConfig.RuntimeParams["statement_timeout"] = millis(cfg.DB.StatementTimeout)
	pc.ConnConfig.RuntimeParams["lock_timeout"] = millis(cfg.DB.LockTimeout)
	pc.ConnConfig.RuntimeParams["idle_in_transaction_session_timeout"] = millis(cfg.DB.IdleTxTimeout)
	pc.ConnConfig.RuntimeParams["application_name"] = applicationName

	return pc, nil
}

// Open builds the pool. It does not dial: pgxpool connects lazily, which is why
// the server can start while Postgres is down and answer /readyz with a 503
// instead of refusing to exist. Whether the database is reachable is a question
// for the readiness probe, not for the constructor.
func Open(ctx context.Context, cfg config.Config) (*pgxpool.Pool, error) {
	pc, err := Config(cfg)
	if err != nil {
		return nil, err
	}
	return pgxpool.NewWithConfig(ctx, pc)
}

// millis renders a duration the way Postgres wants its timeout GUCs. A bare
// integer is milliseconds, which avoids the unit-suffix parsing differences
// between the values a human writes and the ones a driver sends.
func millis(d time.Duration) string {
	return strconv.FormatInt(d.Milliseconds(), 10)
}
