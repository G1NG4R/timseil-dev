package db

import (
	"strings"
	"testing"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/config"
)

func testConfig() config.Config {
	return config.Config{
		DatabaseURL: "postgres://timseil_app:pw@db:5432/timseil?sslmode=disable",
		DB: config.DB{
			MaxConns:         10,
			MinConns:         2,
			StatementTimeout: 5 * time.Second,
			LockTimeout:      2 * time.Second,
			IdleTxTimeout:    10 * time.Second,
		},
	}
}

func TestTheThreeTimeoutsAreSetAsRuntimeParams(t *testing.T) {
	pc, err := Config(testConfig())
	if err != nil {
		t.Fatalf("Config: %v", err)
	}

	want := map[string]string{
		"statement_timeout":                   "5000",
		"lock_timeout":                        "2000",
		"idle_in_transaction_session_timeout": "10000",
		"application_name":                    applicationName,
	}
	for key, value := range want {
		if got := pc.ConnConfig.RuntimeParams[key]; got != value {
			t.Errorf("RuntimeParams[%q] = %q, want %q", key, got, value)
		}
	}
}

// The DSN is one string somebody edits in a deployment UI. If a value there
// could quietly raise the statement timeout, the limit would be a suggestion —
// so the code has to win, and that is worth an assertion rather than a comment.
func TestTheDSNCannotRaiseTheTimeouts(t *testing.T) {
	cfg := testConfig()
	cfg.DatabaseURL = "postgres://timseil_app:pw@db:5432/timseil" +
		"?sslmode=disable&statement_timeout=60000&lock_timeout=60000"

	pc, err := Config(cfg)
	if err != nil {
		t.Fatalf("Config: %v", err)
	}

	if got := pc.ConnConfig.RuntimeParams["statement_timeout"]; got != "5000" {
		t.Errorf("statement_timeout = %q, want the configured 5000 — the DSN won", got)
	}
	if got := pc.ConnConfig.RuntimeParams["lock_timeout"]; got != "2000" {
		t.Errorf("lock_timeout = %q, want the configured 2000 — the DSN won", got)
	}
}

func TestPoolSizeAndLifetimesComeFromTheConfiguration(t *testing.T) {
	pc, err := Config(testConfig())
	if err != nil {
		t.Fatalf("Config: %v", err)
	}

	if pc.MaxConns != 10 || pc.MinConns != 2 {
		t.Errorf("pool = %d/%d, want 10/2", pc.MaxConns, pc.MinConns)
	}
	if pc.MaxConnLifetime != maxConnLifetime || pc.MaxConnLifetimeJitter != lifetimeJitter {
		t.Errorf("lifetime = %s +/- %s", pc.MaxConnLifetime, pc.MaxConnLifetimeJitter)
	}
	// Without the jitter every connection in the pool is opened and retired in
	// the same second, which turns a routine recycle into a latency spike.
	if pc.MaxConnLifetimeJitter == 0 {
		t.Error("MaxConnLifetimeJitter is zero — the pool would recycle in lockstep")
	}
}

// The DSN carries a password, so the failure path is as much about what the
// error does NOT say as about the fact that it fails.
func TestAnUnparseableDSNFailsWithoutQuotingIt(t *testing.T) {
	cfg := testConfig()
	cfg.DatabaseURL = "postgres://timseil_app:hunter2@db:5432/timseil?sslmode=nonsense"

	_, err := Config(cfg)
	if err == nil {
		t.Fatal("Config accepted an invalid DSN")
	}
	if strings.Contains(err.Error(), "hunter2") {
		t.Errorf("the error quotes the password: %q", err)
	}
}
