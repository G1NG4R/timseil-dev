//go:build db

// The pool against a real server.
//
// pool_test.go asserts what the code puts into the configuration; this file
// asserts what Postgres received. The difference is the whole point: a
// misspelled GUC name looks perfectly correct in a map, and only the server can
// say whether the value arrived — or whether it bites.
//
// Run with: make check-db
package db_test

import (
	"context"
	"testing"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/config"
	"github.com/G1NG4R/timseil-dev/api/internal/db"
	"github.com/G1NG4R/timseil-dev/api/internal/dbtest"
)

func poolConfig(t *testing.T, statement time.Duration) config.Config {
	t.Helper()
	return config.Config{
		DatabaseURL: dbtest.DSN(t, dbtest.EnvAppURL),
		DB: config.DB{
			MaxConns:         4,
			MinConns:         1,
			StatementTimeout: statement,
			LockTimeout:      2 * time.Second,
			IdleTxTimeout:    10 * time.Second,
		},
	}
}

// The three timeouts, read back from the session that the pool actually opened.
func TestTheThreeTimeoutsReachTheServer(t *testing.T) {
	ctx := context.Background()

	pool, err := db.Open(ctx, poolConfig(t, 5*time.Second))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(pool.Close)

	for name, want := range map[string]string{
		"statement_timeout":                   "5s",
		"lock_timeout":                        "2s",
		"idle_in_transaction_session_timeout": "10s",
		"application_name":                    "timseil-api",
	} {
		var got string
		if err := pool.QueryRow(ctx, "SHOW "+name).Scan(&got); err != nil {
			t.Fatalf("SHOW %s: %v", name, err)
		}
		if got != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}
}

// The broken case. A timeout the server reports but does not enforce would pass
// the test above and still let one query hold a pool slot until the process
// dies, which is the failure the setting exists to prevent.
func TestAStatementPastTheTimeoutIsCancelled(t *testing.T) {
	ctx := context.Background()

	const limit = 300 * time.Millisecond
	pool, err := db.Open(ctx, poolConfig(t, limit))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(pool.Close)

	start := time.Now()
	_, err = pool.Exec(ctx, "SELECT pg_sleep(5)")
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("a five second sleep completed under a 300ms statement timeout")
	}
	// Generous, because a loaded machine is still a correct machine. The
	// assertion is "the server cut it", not "the server cut it punctually".
	if elapsed > 3*time.Second {
		t.Errorf("the statement ran for %s — the timeout did not cut it", elapsed)
	}
}

// A pool that hands out more connections than it was told to would defeat the
// arithmetic the size was chosen by, and it would do so only under load.
func TestThePoolRespectsItsCeiling(t *testing.T) {
	ctx := context.Background()

	pool, err := db.Open(ctx, poolConfig(t, 5*time.Second))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(pool.Close)

	var held []interface{ Release() }
	for i := 0; i < 4; i++ {
		conn, err := pool.Acquire(ctx)
		if err != nil {
			t.Fatalf("acquiring connection %d of 4: %v", i+1, err)
		}
		held = append(held, conn)
	}
	t.Cleanup(func() {
		for _, c := range held {
			c.Release()
		}
	})

	// The fifth has to wait rather than open a fifth connection.
	waiting, cancel := context.WithTimeout(ctx, 200*time.Millisecond)
	defer cancel()
	if _, err := pool.Acquire(waiting); err == nil {
		t.Error("the pool handed out a fifth connection with MaxConns = 4")
	}
}
