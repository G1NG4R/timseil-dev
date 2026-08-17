package config

import (
	"log/slog"
	"strings"
	"testing"
	"time"
)

const goodDSN = "postgres://timseil_app:dev_only_not_a_secret@db:5432/timseil?sslmode=disable"

// setEnv puts the process into a known state. Every variable this package reads
// is named here, including the ones a test does not care about: without that, a
// developer machine with DB_MAX_CONNS exported would change what the tests mean.
func setEnv(t *testing.T, overrides map[string]string) {
	t.Helper()

	base := map[string]string{
		EnvDatabaseURL:      goodDSN,
		EnvLogLevel:         "",
		EnvRequestTimeout:   "",
		EnvShutdownGrace:    "",
		EnvDBMaxConns:       "",
		EnvDBMinConns:       "",
		EnvStatementTimeout: "",
		EnvLockTimeout:      "",
		EnvIdleTxTimeout:    "",
		EnvRateLimitPerMin:  "",
		EnvRateLimitBurst:   "",
		EnvTrustedProxies:   "",
		EnvAllowedOrigins:   "",
		EnvSiteSystemSlug:   "",
	}
	for k, v := range overrides {
		base[k] = v
	}
	for k, v := range base {
		t.Setenv(k, v)
	}
}

func mustLoad(t *testing.T) Config {
	t.Helper()
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() failed on a valid environment:\n%v", err)
	}
	return cfg
}

func wantFailure(t *testing.T, contains ...string) {
	t.Helper()
	_, err := Load()
	if err == nil {
		t.Fatal("Load() succeeded, want a failure")
	}
	for _, want := range contains {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error does not mention %q:\n%v", want, err)
		}
	}
}

func TestDefaultsAreApplied(t *testing.T) {
	setEnv(t, nil)
	cfg := mustLoad(t)

	if cfg.DatabaseURL != goodDSN {
		t.Errorf("DatabaseURL = %q", cfg.DatabaseURL)
	}
	if cfg.LogLevel != slog.LevelInfo {
		t.Errorf("LogLevel = %v, want info", cfg.LogLevel)
	}
	if cfg.RequestTimeout != defaultRequestTimeout || cfg.ShutdownGrace != defaultShutdownGrace {
		t.Errorf("timeouts = %s / %s", cfg.RequestTimeout, cfg.ShutdownGrace)
	}
	if cfg.DB.MaxConns != defaultMaxConns || cfg.DB.MinConns != defaultMinConns {
		t.Errorf("pool = %d / %d", cfg.DB.MaxConns, cfg.DB.MinConns)
	}
	if cfg.SiteSystemSlug != defaultSiteSystemSlug {
		t.Errorf("SiteSystemSlug = %q", cfg.SiteSystemSlug)
	}
	// The default is deliberately "trust nobody": which networks are
	// trustworthy is a fact about the deployment, not about the program.
	if len(cfg.TrustedProxies) != 0 {
		t.Errorf("TrustedProxies = %v, want none by default", cfg.TrustedProxies)
	}
	if len(cfg.AllowedOrigins) != 3 {
		t.Errorf("AllowedOrigins = %v, want three", cfg.AllowedOrigins)
	}
}

// The one variable with no default. The message has to name the file that fixes
// it, because the person reading it is usually looking at a container that
// exited half a second after it started.
func TestMissingDatabaseURLIsFatal(t *testing.T) {
	setEnv(t, map[string]string{EnvDatabaseURL: ""})
	wantFailure(t, EnvDatabaseURL, "copy .env.example to .env")
}

// ADR 0011: the long-lived process may not hold DDL credentials. Reading the
// role out of the DSN is what makes the rule a property of the program instead
// of a sentence in a document.
func TestMigrateRoleIsRefused(t *testing.T) {
	setEnv(t, map[string]string{
		EnvDatabaseURL: "postgres://timseil_migrate:pw@db:5432/timseil?sslmode=disable",
	})
	wantFailure(t, "timseil_migrate", "ADR 0011")
}

func TestUnparseableDSNIsRefused(t *testing.T) {
	setEnv(t, map[string]string{EnvDatabaseURL: "://not a dsn"})
	wantFailure(t, EnvDatabaseURL)
}

// The property this package exists for: three mistakes cost one restart, not
// three. A loader that returned on the first error would pass every other test
// in this file and still be the wrong shape.
func TestEveryProblemIsReportedAtOnce(t *testing.T) {
	setEnv(t, map[string]string{
		EnvDatabaseURL:     "",
		EnvLogLevel:        "chatty",
		EnvRequestTimeout:  "soon",
		EnvDBMaxConns:      "ten",
		EnvAllowedOrigins:  "https://timseil.dev/contact",
		EnvTrustedProxies:  "10.0.0.0/8,not-a-cidr",
		EnvRateLimitPerMin: "-1",
	})
	wantFailure(t,
		EnvDatabaseURL,
		EnvLogLevel,
		EnvRequestTimeout,
		EnvDBMaxConns,
		EnvAllowedOrigins,
		EnvTrustedProxies,
		EnvRateLimitPerMin,
	)
}

// The two durations that have to hold hands. A request allowed to run longer
// than the grace period is a request the shutdown will cut — which is exactly
// the failure the phase promises not to have.
func TestRequestTimeoutMustBeShorterThanTheGracePeriod(t *testing.T) {
	setEnv(t, map[string]string{
		EnvRequestTimeout: "30s",
		EnvShutdownGrace:  "20s",
	})
	wantFailure(t, EnvRequestTimeout, EnvShutdownGrace)
}

func TestStatementTimeoutMayNotOutliveTheRequest(t *testing.T) {
	setEnv(t, map[string]string{
		EnvRequestTimeout:   "5s",
		EnvStatementTimeout: "10s",
	})
	wantFailure(t, EnvStatementTimeout, EnvRequestTimeout)
}

func TestMinConnsMayNotExceedMaxConns(t *testing.T) {
	setEnv(t, map[string]string{
		EnvDBMaxConns: "4",
		EnvDBMinConns: "8",
	})
	wantFailure(t, EnvDBMinConns, EnvDBMaxConns)
}

// An origin is scheme://host. A path here matches no browser's Origin header
// ever, and the resulting failure looks like a bug in the frontend rather than
// a typo in the environment.
func TestOriginWithAPathIsRefused(t *testing.T) {
	setEnv(t, map[string]string{EnvAllowedOrigins: "https://timseil.dev/api"})
	wantFailure(t, EnvAllowedOrigins, "without a path")
}

func TestOriginsAreNormalised(t *testing.T) {
	setEnv(t, map[string]string{
		EnvAllowedOrigins: " https://timseil.dev , http://localhost:3000 ",
	})
	cfg := mustLoad(t)

	want := []string{"https://timseil.dev", "http://localhost:3000"}
	if len(cfg.AllowedOrigins) != len(want) {
		t.Fatalf("AllowedOrigins = %v, want %v", cfg.AllowedOrigins, want)
	}
	for i := range want {
		if cfg.AllowedOrigins[i] != want[i] {
			t.Errorf("AllowedOrigins[%d] = %q, want %q", i, cfg.AllowedOrigins[i], want[i])
		}
	}
}

func TestTrustedProxiesAreRead(t *testing.T) {
	setEnv(t, map[string]string{EnvTrustedProxies: "172.16.0.0/12, ::1/128"})
	cfg := mustLoad(t)

	if len(cfg.TrustedProxies) != 2 {
		t.Fatalf("TrustedProxies = %v, want two", cfg.TrustedProxies)
	}
}

func TestTrustedProxiesAreMasked(t *testing.T) {
	setEnv(t, map[string]string{EnvTrustedProxies: "10.1.2.3/8"})
	cfg := mustLoad(t)

	if len(cfg.TrustedProxies) != 1 || cfg.TrustedProxies[0].String() != "10.0.0.0/8" {
		t.Errorf("TrustedProxies = %v, want [10.0.0.0/8]", cfg.TrustedProxies)
	}
}

func TestDurationsAndNumbersAreRead(t *testing.T) {
	setEnv(t, map[string]string{
		EnvLogLevel:         "warn",
		EnvRequestTimeout:   "3s",
		EnvShutdownGrace:    "9s",
		EnvStatementTimeout: "1500ms",
		EnvLockTimeout:      "700ms",
		EnvIdleTxTimeout:    "4s",
		EnvDBMaxConns:       "6",
		EnvDBMinConns:       "0",
		EnvRateLimitPerMin:  "30",
		EnvRateLimitBurst:   "15",
		EnvSiteSystemSlug:   "vat-check",
	})
	cfg := mustLoad(t)

	if cfg.LogLevel != slog.LevelWarn {
		t.Errorf("LogLevel = %v", cfg.LogLevel)
	}
	if cfg.DB.StatementTimeout != 1500*time.Millisecond {
		t.Errorf("StatementTimeout = %s", cfg.DB.StatementTimeout)
	}
	if cfg.DB.MinConns != 0 {
		t.Errorf("MinConns = %d, want a zero that survives the default", cfg.DB.MinConns)
	}
	if cfg.RateLimit.PerMinute != 30 || cfg.RateLimit.Burst != 15 {
		t.Errorf("RateLimit = %+v", cfg.RateLimit)
	}
	if cfg.SiteSystemSlug != "vat-check" {
		t.Errorf("SiteSystemSlug = %q", cfg.SiteSystemSlug)
	}
}

func TestZeroAndNegativeDurationsAreRefused(t *testing.T) {
	setEnv(t, map[string]string{EnvLockTimeout: "0s"})
	wantFailure(t, EnvLockTimeout, "positive")
}
