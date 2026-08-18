package config

import (
	"log/slog"
	"strings"
	"testing"
	"time"
)

const goodDSN = "postgres://timseil_app:dev_only_not_a_secret@db:5432/timseil?sslmode=disable"

// Shaped like a fine-grained PAT and worth nothing. There is no default for this
// one, so every test that expects Load to succeed needs a value.
const goodToken = "github_pat_not_a_real_token_0000000000"

// Thirty-two characters, which is the floor, so a test that shortens it by one
// is testing the boundary rather than an arbitrary short string.
const goodPepper = "0123456789abcdef0123456789abcdef"

// Thirty-two characters each, which is the floor, so a test that shortens one
// by a single character is testing the boundary and not a round number. The two
// differ from each other on purpose: half of what these tests are for is that
// the probe token does not open the deploy endpoint.
const (
	goodProbeToken  = "0f1e2d3c4b5a69788796a5b4c3d2e1f0"
	goodDeployToken = "a1b2c3d4e5f60718293a4b5c6d7e8f90"
)

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
		EnvContribTransport: "",
		EnvGitHubToken:      goodToken,
		EnvGitHubLogin:      "",
		// The log transport is the base state so that the mail credentials are
		// not part of every unrelated test's setup. The tests that care about
		// sending switch it over.
		EnvMailTransport:   "log",
		EnvSMTPUsername:    "",
		EnvSMTPPassword:    "",
		EnvMailTo:          "",
		EnvContactIPPepper: goodPepper,
		EnvProbeToken:      goodProbeToken,
		EnvDeployToken:     goodDeployToken,
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
	if cfg.GitHub.Login != defaultGitHubLogin {
		t.Errorf("GitHub.Login = %q, want %q", cfg.GitHub.Login, defaultGitHubLogin)
	}
	if cfg.GitHub.Token != goodToken {
		t.Errorf("GitHub.Token was not read")
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

// ------------------------------------------------------------------- github

// The first secret this program has, and required whenever this deployment
// fetches — which is the default.
//
// Refusing to start is the honest option. The site promises a contribution graph
// on the homepage; a process that runs happily while it can never fetch one
// would show `— NO DATA` for ever and call it a measurement, which is invariant
// 1 wearing a startup hat. The message names the scope and where to get one,
// because .env.example deliberately does not contain the value — and it names
// the off switch, because the deployment that hits this line is usually a
// container being checked by hand.
func TestAMissingGitHubTokenStopsTheStart(t *testing.T) {
	setEnv(t, map[string]string{EnvGitHubToken: ""})
	wantFailure(t, EnvGitHubToken, "read:user", EnvContribTransport)
}

func TestABlankGitHubTokenIsNotAToken(t *testing.T) {
	setEnv(t, map[string]string{EnvGitHubToken: "   "})
	wantFailure(t, EnvGitHubToken)
}

// The token is sent as an Authorization header. A newline in it appends headers
// of the setter's choosing — the CRLF rule from C6, one endpoint earlier.
func TestATokenWithALineBreakIsRejected(t *testing.T) {
	for _, tok := range []string{
		"ghp_good\r\nX-Injected: yes",
		"ghp_good\nX-Injected: yes",
		"ghp_good\rX-Injected: yes",
	} {
		setEnv(t, map[string]string{EnvGitHubToken: tok})
		wantFailure(t, EnvGitHubToken, "line break")
	}
}

// ----------------------------------------------- the contributions transport

// The direction of the default is the decision, and it is the same one
// MAIL_TRANSPORT makes: a default that fetches is one you opt out of. The other
// way round, one variable nobody set in Dokploy leaves the homepage promising a
// contribution graph and rendering `— NO DATA` for ever.
func TestTheContributionsTransportDefaultsToFetching(t *testing.T) {
	setEnv(t, map[string]string{EnvContribTransport: ""})
	cfg := mustLoad(t)

	if !cfg.GitHub.Fetches() {
		t.Errorf("%s defaulted to %q, want %s",
			EnvContribTransport, cfg.GitHub.Transport, TransportGitHub)
	}
}

// The whole point of #59: a container can be started and checked by hand
// without a real token, and production keeps the guarantee.
func TestTheOffTransportStartsWithoutAToken(t *testing.T) {
	setEnv(t, map[string]string{
		EnvContribTransport: TransportOff,
		EnvGitHubToken:      "",
	})
	cfg := mustLoad(t)

	if cfg.GitHub.Fetches() {
		t.Error("the off transport reports that it fetches")
	}
}

// A typo must not read as "not github" and silently switch the calendar off —
// the same refusal MAIL_TRANSPORT gets, and for the same reason: nobody would
// notice until the page had quietly stopped ageing forward.
func TestAnUnknownContributionsTransportIsRefused(t *testing.T) {
	setEnv(t, map[string]string{EnvContribTransport: "gihub"})
	wantFailure(t, EnvContribTransport, TransportGitHub, TransportOff)
}

// Read even under the off transport, for the reason the mail block gives: a
// deployment switching the transport back on should not then be told about a
// second problem it could have heard about the first time.
func TestALineBreakInTheTokenIsReportedUnderTheOffTransport(t *testing.T) {
	setEnv(t, map[string]string{
		EnvContribTransport: TransportOff,
		EnvGitHubToken:      "ghp_good\nX-Injected: yes",
	})
	wantFailure(t, EnvGitHubToken, "line break")
}

// And the token never appears in the failure. A configuration error is printed
// by a process on its way out, and that line lands in the container log.
func TestTheTokenIsNotQuotedBackInAnError(t *testing.T) {
	const secret = "ghp_this_must_not_be_printed"
	setEnv(t, map[string]string{
		EnvGitHubToken: secret + "\n",
		EnvLogLevel:    "chatty",
	})

	_, err := Load()
	if err == nil {
		t.Fatal("Load() succeeded, want a failure")
	}
	if strings.Contains(err.Error(), secret) {
		t.Errorf("the error quotes the token back:\n%v", err)
	}
}

// A typo here does not fail loudly on its own: GitHub answers an unknown user
// with HTTP 200 and `data.user: null`, so the refresher would fail hourly and
// look exactly like GitHub being down.
func TestAnImpossibleGitHubLoginIsRefused(t *testing.T) {
	for _, login := range []string{
		"-leading-hyphen",
		"trailing-hyphen-",
		"double--hyphen",
		"has space",
		"has_underscore",
		"way-too-long-to-be-a-github-login-by-some-margin",
	} {
		setEnv(t, map[string]string{EnvGitHubLogin: login})
		wantFailure(t, EnvGitHubLogin)
	}
}

// The other half. Written too tightly, the rule above would refuse real logins
// and this file would still be green.
func TestARealGitHubLoginIsAccepted(t *testing.T) {
	for _, login := range []string{"G1NG4R", "a", "octo-cat", "torvalds", "a1-b2-c3"} {
		setEnv(t, map[string]string{EnvGitHubLogin: login})
		if cfg := mustLoad(t); cfg.GitHub.Login != login {
			t.Errorf("GitHub.Login = %q, want %q", cfg.GitHub.Login, login)
		}
	}
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
		EnvGitHubToken:     "",
		EnvGitHubLogin:     "not a login",
	})
	wantFailure(t,
		EnvDatabaseURL,
		EnvLogLevel,
		EnvRequestTimeout,
		EnvDBMaxConns,
		EnvAllowedOrigins,
		EnvTrustedProxies,
		EnvRateLimitPerMin,
		EnvGitHubToken,
		EnvGitHubLogin,
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

// ---------------------------------------------------------------- mail (C6)

// The full set a deployment that actually sends has to provide.
func sending(overrides map[string]string) map[string]string {
	base := map[string]string{
		EnvMailTransport: "smtp",
		EnvSMTPUsername:  "contact@timseil.dev",
		EnvSMTPPassword:  "not_a_real_password",
		EnvMailTo:        "inbox@timseil.dev",
	}
	for k, v := range overrides {
		base[k] = v
	}
	return base
}

func TestTheMailSettingsAreRead(t *testing.T) {
	setEnv(t, sending(nil))
	cfg := mustLoad(t)

	if !cfg.Mail.Sends() {
		t.Error("Sends() is false although the transport is smtp")
	}
	if cfg.Mail.Username != "contact@timseil.dev" || cfg.Mail.To != "inbox@timseil.dev" {
		t.Errorf("Mail = %+v", cfg.Mail)
	}
}

// The transport defaults to sending. A default that logs would turn one
// forgotten variable in Dokploy into a site that answers every submission with
// 202 and delivers nothing — a failure that looks exactly like success.
func TestTheTransportDefaultsToSending(t *testing.T) {
	setEnv(t, sending(map[string]string{EnvMailTransport: ""}))
	cfg := mustLoad(t)

	if !cfg.Mail.Sends() {
		t.Errorf("Transport defaulted to %q, want smtp", cfg.Mail.Transport)
	}
}

// A typo would otherwise read as "not smtp" and select the log transport.
func TestAnUnknownTransportIsRefused(t *testing.T) {
	setEnv(t, sending(map[string]string{EnvMailTransport: "sntp"}))
	wantFailure(t, EnvMailTransport, "smtp", "log")
}

func TestTheMailCredentialsAreRequiredOnlyWhenSending(t *testing.T) {
	setEnv(t, map[string]string{EnvMailTransport: "log"})
	cfg := mustLoad(t)

	if cfg.Mail.Sends() {
		t.Error("the log transport reports that it sends")
	}
}

func TestSendingWithoutCredentialsIsRefused(t *testing.T) {
	setEnv(t, map[string]string{EnvMailTransport: "smtp"})
	wantFailure(t, EnvSMTPUsername, EnvSMTPPassword, EnvMailTo)
}

// A display name is a second place for text to live in a header. The rule is
// internal/mail's and is applied here so a typo is caught at startup rather
// than at the first submission.
func TestADisplayNameInAMailAddressIsRefused(t *testing.T) {
	setEnv(t, sending(map[string]string{EnvSMTPUsername: `"Contact" <contact@timseil.dev>`}))
	wantFailure(t, EnvSMTPUsername, "without a display name")
}

// Read even under the log transport, so that a deployment fixing its transport
// is not then told about a typo it could have heard about at the same time.
func TestABadAddressIsReportedUnderTheLogTransport(t *testing.T) {
	setEnv(t, map[string]string{EnvMailTransport: "log", EnvMailTo: "inbox@timseil,dev"})
	wantFailure(t, EnvMailTo)
}

// Same class as the GITHUB_TOKEN check: the value goes into an SMTP exchange,
// and a line break in it is a line the relay reads as a command.
func TestALineBreakInTheMailPasswordIsRefused(t *testing.T) {
	setEnv(t, sending(map[string]string{EnvSMTPPassword: "hunter2\nQUIT"}))
	wantFailure(t, EnvSMTPPassword, "line break")
}

func TestTheMailPasswordNeverAppearsInAnError(t *testing.T) {
	const secret = "correct-horse-battery-staple\nQUIT"
	setEnv(t, sending(map[string]string{EnvSMTPPassword: secret}))

	_, err := Load()
	if err == nil {
		t.Fatal("Load accepted a password with a line break")
	}
	if strings.Contains(err.Error(), "correct-horse") {
		t.Errorf("the password is in the error a dying process prints:\n%v", err)
	}
}

// ------------------------------------------------------------- pepper (C6)

func TestThePepperIsRequiredEvenWithoutMail(t *testing.T) {
	// The hash is written on every submission, including under the log
	// transport. A deployment that wrote unpeppered digests for a week would
	// have to be told that its table is now a list of addresses.
	setEnv(t, map[string]string{EnvContactIPPepper: ""})
	wantFailure(t, EnvContactIPPepper, "openssl rand -hex 32")
}

func TestAShortPepperIsRefused(t *testing.T) {
	setEnv(t, map[string]string{EnvContactIPPepper: goodPepper[:minPepperLength-1]})
	wantFailure(t, EnvContactIPPepper, "at least")
}

func TestThePepperNeverAppearsInAnError(t *testing.T) {
	const secret = "short-but-memorable"
	setEnv(t, map[string]string{EnvContactIPPepper: secret})

	_, err := Load()
	if err == nil {
		t.Fatal("Load accepted a pepper below the floor")
	}
	if strings.Contains(err.Error(), secret) {
		t.Errorf("the pepper is in the error a dying process prints:\n%v", err)
	}
}

// ----------------------------------------------------- internal tokens (C7)

func TestBothInternalTokensAreRequired(t *testing.T) {
	// Neither has a default, for the reason GITHUB_TOKEN and the pepper have
	// none: a shipped value is a value every deployment shares, and a shared
	// bearer token is a public write endpoint.
	for _, key := range []string{EnvProbeToken, EnvDeployToken} {
		t.Run(key, func(t *testing.T) {
			setEnv(t, map[string]string{key: ""})
			wantFailure(t, key, "openssl rand -hex 32")
		})
	}
}

func TestAShortInternalTokenIsRefused(t *testing.T) {
	setEnv(t, map[string]string{EnvProbeToken: goodProbeToken[:minTokenLength-1]})
	wantFailure(t, EnvProbeToken, "at least")
}

// An HTTP header cannot carry a line break, so a token with one could never
// match anything — it would fail as "wrong token" at every request instead of
// as a configuration problem at startup, which is a whole afternoon.
func TestAnInternalTokenWithALineBreakIsRejected(t *testing.T) {
	setEnv(t, map[string]string{EnvDeployToken: goodDeployToken + "\nX-Injected: 1"})
	wantFailure(t, EnvDeployToken, "line break")
}

func TestAnInternalTokenNeverAppearsInAnError(t *testing.T) {
	const secret = "too-short-to-pass"

	for _, key := range []string{EnvProbeToken, EnvDeployToken} {
		t.Run(key, func(t *testing.T) {
			setEnv(t, map[string]string{key: secret})

			_, err := Load()
			if err == nil {
				t.Fatalf("Load accepted %s below the floor", key)
			}
			if strings.Contains(err.Error(), secret) {
				t.Errorf("the token is in the error a dying process prints:\n%v", err)
			}
		})
	}
}

// The whole point of there being two. If Load ever collapsed them onto one
// variable this would be the only test that noticed.
func TestTheTwoInternalTokensAreKeptApart(t *testing.T) {
	setEnv(t, nil)
	cfg := mustLoad(t)

	if cfg.Internal.ProbeToken != goodProbeToken {
		t.Errorf("ProbeToken = %q", cfg.Internal.ProbeToken)
	}
	if cfg.Internal.DeployToken != goodDeployToken {
		t.Errorf("DeployToken = %q", cfg.Internal.DeployToken)
	}
	if cfg.Internal.ProbeToken == cfg.Internal.DeployToken {
		t.Error("both endpoints ended up behind the same secret")
	}
}
