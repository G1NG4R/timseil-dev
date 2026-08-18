// Package config reads the process configuration from the environment once, at
// startup, and refuses to hand back a half-valid one.
//
// Two properties are deliberate. The first is that it collects every problem
// before it reports: a process that dies on the first missing variable makes
// you restart it once per mistake, and three restarts to learn three names is
// three restarts too many. The second is that nothing here reads the
// environment later — a value that can change under a running server is a value
// two requests can disagree about.
//
// What is NOT here: MIGRATE_DATABASE_URL. The api process runs as timseil_app
// and may not carry DDL credentials (ADR 0011). Refusing to read the variable
// is weaker than refusing the role, so this package does the latter — see
// checkAppRole.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net/netip"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

// Environment variable names, in one place so the runbook and .env.example have
// something to be checked against.
const (
	EnvDatabaseURL      = "DATABASE_URL"
	EnvLogLevel         = "LOG_LEVEL"
	EnvRequestTimeout   = "REQUEST_TIMEOUT"
	EnvShutdownGrace    = "SHUTDOWN_GRACE"
	EnvDBMaxConns       = "DB_MAX_CONNS"
	EnvDBMinConns       = "DB_MIN_CONNS"
	EnvStatementTimeout = "DB_STATEMENT_TIMEOUT"
	EnvLockTimeout      = "DB_LOCK_TIMEOUT"
	EnvIdleTxTimeout    = "DB_IDLE_TX_TIMEOUT"
	EnvRateLimitPerMin  = "RATE_LIMIT_RPM"
	EnvRateLimitBurst   = "RATE_LIMIT_BURST"
	EnvTrustedProxies   = "TRUSTED_PROXY_CIDRS"
	EnvAllowedOrigins   = "CORS_ALLOWED_ORIGINS"
	EnvSiteSystemSlug   = "SITE_SYSTEM_SLUG"
	EnvGitHubToken      = "GITHUB_TOKEN"
	EnvGitHubLogin      = "GITHUB_LOGIN"
)

// The role the api is allowed to connect as. ADR 0011 splits the schema owner
// from the data writer so that an injection in a handler cannot drop a table;
// handing this process the other DSN would make that split decorative.
const forbiddenRole = "timseil_migrate"

// Defaults. Every one of them is a decision with a reason, and the reasons live
// in ADR 0014 rather than in this list.
const (
	defaultLogLevel         = "info"
	defaultRequestTimeout   = 15 * time.Second
	defaultShutdownGrace    = 20 * time.Second
	defaultMaxConns         = 10
	defaultMinConns         = 2
	defaultStatementTimeout = 5 * time.Second
	defaultLockTimeout      = 2 * time.Second
	defaultIdleTxTimeout    = 10 * time.Second
	defaultRateLimitPerMin  = 120
	defaultRateLimitBurst   = 60
	defaultAllowedOrigins   = "https://timseil.dev,https://www.timseil.dev,http://localhost:3000"
	defaultSiteSystemSlug   = "timseil-dev"
	defaultGitHubLogin      = "G1NG4R"

	// Empty on purpose: trust nobody. A program that assumes a proxy stands in
	// front of it will believe a forwarded header the day it is reachable
	// directly, and then any client can pick its own identity for the rate
	// limiter. Which networks are trustworthy is a fact about the deployment,
	// so the deployment states it — compose.dev.yaml for development, Dokploy
	// in production.
	defaultTrustedProxies = ""
)

// Config is the whole of it. Passed by value: it is small, it never changes
// after Load, and a pointer would invite somebody to write to it.
type Config struct {
	DatabaseURL string
	LogLevel    slog.Level

	// RequestTimeout is the ceiling the timeout middleware puts on a handler.
	// ShutdownGrace is how long a stopping server waits for what is still in
	// flight. The first must be smaller than the second, or the grace period
	// expires while a request it is waiting for is still legally running.
	RequestTimeout time.Duration
	ShutdownGrace  time.Duration

	DB        DB
	RateLimit RateLimit
	GitHub    GitHub

	// TrustedProxies decides whether X-Forwarded-For is believed at all. Empty
	// is the default and means "believe nobody" — then the peer address is the
	// client address, always.
	TrustedProxies []netip.Prefix

	// AllowedOrigins is not consulted by the read endpoints, which answer any
	// origin (ADR 0015). It exists for the write path in C6.
	AllowedOrigins []string

	// SiteSystemSlug names the system /api/health reports operational numbers
	// for. deploys and metric_snapshots hang off a system; OpsSummary carries
	// one set of values, so one system has to be named rather than guessed.
	SiteSystemSlug string
}

// DB is the pool shape and the three session timeouts it sets on every
// connection.
type DB struct {
	MaxConns int32
	MinConns int32

	StatementTimeout time.Duration
	LockTimeout      time.Duration
	IdleTxTimeout    time.Duration
}

// RateLimit is a token bucket per client: Burst tokens to spend at once,
// PerMinute tokens added back over a minute.
type RateLimit struct {
	PerMinute int
	Burst     int
}

// GitHub is what the contribution refresher needs to reach the GraphQL API.
//
// The endpoint itself is not here. A URL that can be set from the environment is
// one edit away from being a URL that can be set from a request, and the whole
// point of the SSRF rule is that the two outbound destinations this service has
// are compiled in. Which account, and with which credential — those differ
// between deployments, so they live here.
type GitHub struct {
	// Token is a personal access token with scope read:user and nothing else.
	// It never reaches a log line, a response body, an image layer or anything
	// behind NEXT_PUBLIC_. Handbook ch. 15.
	Token string

	// Login is whose calendar is fetched. Also the primary key of the cached
	// row, which is why a change to it leaves the old row behind — see
	// docs/runbooks/api.md.
	Login string
}

// Load reads and validates the environment.
//
// The error it returns names every problem it found, one per line, so a cold
// start against an unprepared machine costs one run rather than one run per
// missing variable.
func Load() (Config, error) {
	var l loader

	cfg := Config{
		DatabaseURL: l.required(EnvDatabaseURL),
		LogLevel:    l.level(EnvLogLevel, defaultLogLevel),

		RequestTimeout: l.duration(EnvRequestTimeout, defaultRequestTimeout),
		ShutdownGrace:  l.duration(EnvShutdownGrace, defaultShutdownGrace),

		DB: DB{
			MaxConns:         int32(l.positive(EnvDBMaxConns, defaultMaxConns)),
			MinConns:         int32(l.atLeastZero(EnvDBMinConns, defaultMinConns)),
			StatementTimeout: l.duration(EnvStatementTimeout, defaultStatementTimeout),
			LockTimeout:      l.duration(EnvLockTimeout, defaultLockTimeout),
			IdleTxTimeout:    l.duration(EnvIdleTxTimeout, defaultIdleTxTimeout),
		},

		RateLimit: RateLimit{
			PerMinute: l.positive(EnvRateLimitPerMin, defaultRateLimitPerMin),
			Burst:     l.positive(EnvRateLimitBurst, defaultRateLimitBurst),
		},

		TrustedProxies: l.prefixes(EnvTrustedProxies, defaultTrustedProxies),
		AllowedOrigins: l.origins(EnvAllowedOrigins, defaultAllowedOrigins),
		SiteSystemSlug: l.text(EnvSiteSystemSlug, defaultSiteSystemSlug),

		GitHub: GitHub{
			Token: l.credential(EnvGitHubToken,
				"a personal access token with scope read:user — github.com/settings/tokens"),
			Login: l.login(EnvGitHubLogin, defaultGitHubLogin),
		},
	}

	// Cross-field rules. They run last because each one needs two values that
	// may themselves have failed to parse; checking them earlier would report a
	// contradiction between two numbers that do not exist.
	if cfg.DatabaseURL != "" {
		l.checkAppRole(cfg.DatabaseURL)
	}
	if cfg.RequestTimeout >= cfg.ShutdownGrace {
		l.fail("%s (%s) must be shorter than %s (%s) — otherwise a request is still "+
			"legally running when the grace period ends and the shutdown cuts it",
			EnvRequestTimeout, cfg.RequestTimeout, EnvShutdownGrace, cfg.ShutdownGrace)
	}
	if cfg.DB.StatementTimeout > cfg.RequestTimeout {
		l.fail("%s (%s) must not exceed %s (%s) — a query may not outlive the request that asked for it",
			EnvStatementTimeout, cfg.DB.StatementTimeout, EnvRequestTimeout, cfg.RequestTimeout)
	}
	if cfg.DB.MinConns > cfg.DB.MaxConns {
		l.fail("%s (%d) must not exceed %s (%d)",
			EnvDBMinConns, cfg.DB.MinConns, EnvDBMaxConns, cfg.DB.MaxConns)
	}

	if err := l.err(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// loader accumulates failures instead of returning on the first one.
type loader struct{ errs []error }

func (l *loader) fail(format string, a ...any) {
	l.errs = append(l.errs, fmt.Errorf(format, a...))
}

func (l *loader) err() error {
	if len(l.errs) == 0 {
		return nil
	}
	lines := make([]string, 0, len(l.errs)+1)
	lines = append(lines, fmt.Sprintf("%d configuration problem(s):", len(l.errs)))
	for _, e := range l.errs {
		lines = append(lines, "  - "+e.Error())
	}
	return errors.New(strings.Join(lines, "\n"))
}

// required is the only shape that has no default: there is no sensible address
// for a database this process has never been told about.
func (l *loader) required(key string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		l.fail("%s is empty — copy .env.example to .env", key)
	}
	return v
}

// credential is required with two differences, and both of them earn their
// lines.
//
// The first is the message. required says "copy .env.example to .env", which is
// the right instruction for a DSN that is written down in that file and the
// wrong one for a secret that is deliberately not — so the caller passes the
// sentence that actually helps, naming the scope and where to get one.
//
// The second is a CR/LF check. This value goes into an Authorization header. A
// newline in it lets whoever set it append headers of their own, which is the
// same class of failure as the CRLF rule for mail fields in C6, one endpoint
// earlier and against a smaller attacker — but the check is three lines and the
// alternative is trusting that nobody ever pastes a token with a trailing
// newline into a Dokploy field.
//
// The value itself never appears in the error. A configuration failure is
// printed by a process that is about to exit, and a secret in that line is a
// secret in the container log.
func (l *loader) credential(key, hint string) string {
	v := strings.TrimSpace(os.Getenv(key))
	switch {
	case v == "":
		l.fail("%s is empty — %s", key, hint)
	case strings.ContainsAny(v, "\r\n"):
		l.fail("%s contains a line break — it is sent as an HTTP header and must not", key)
		return ""
	}
	return v
}

// login validates the GitHub account name.
//
// Not paranoia about injection: the login travels as a JSON variable in a
// GraphQL document, where it cannot escape into the query. It is validated
// because the failure mode of a typo is silence. GitHub answers an unknown user
// with `data.user: null` and HTTP 200, so a wrong letter here becomes an hourly
// failure that looks exactly like GitHub being down — and the calendar just
// quietly stops ageing forward.
//
// The rule is GitHub's own: alphanumerics and single hyphens, not at either end,
// up to 39 characters.
func (l *loader) login(key, def string) string {
	v := l.text(key, def)
	if len(v) > maxGitHubLogin || !githubLogin.MatchString(v) {
		l.fail("%s is %q — want a GitHub login: letters, digits and single hyphens, "+
			"not at either end, up to %d characters", key, v, maxGitHubLogin)
		return def
	}
	return v
}

// Written as groups rather than with a lookahead: Go's regexp is RE2 and has
// none, and "runs of alphanumerics joined by single hyphens" says the same thing
// without one. The length is checked separately for the same reason.
const maxGitHubLogin = 39

var githubLogin = regexp.MustCompile(`^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$`)

func (l *loader) text(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func (l *loader) level(key, def string) slog.Level {
	raw := l.text(key, def)
	var lvl slog.Level
	if err := lvl.UnmarshalText([]byte(raw)); err != nil {
		l.fail("%s is %q — want one of debug, info, warn, error", key, raw)
		return slog.LevelInfo
	}
	return lvl
}

func (l *loader) duration(key string, def time.Duration) time.Duration {
	raw := os.Getenv(key)
	if strings.TrimSpace(raw) == "" {
		return def
	}
	d, err := time.ParseDuration(strings.TrimSpace(raw))
	if err != nil {
		l.fail("%s is %q — want a duration such as 15s or 500ms", key, raw)
		return def
	}
	if d <= 0 {
		l.fail("%s is %q — want a positive duration", key, raw)
		return def
	}
	return d
}

func (l *loader) positive(key string, def int) int {
	n, ok := l.number(key, def)
	if ok && n <= 0 {
		l.fail("%s is %d — want a positive number", key, n)
		return def
	}
	return n
}

func (l *loader) atLeastZero(key string, def int) int {
	n, ok := l.number(key, def)
	if ok && n < 0 {
		l.fail("%s is %d — want zero or more", key, n)
		return def
	}
	return n
}

func (l *loader) number(key string, def int) (value int, parsed bool) {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return def, false
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		l.fail("%s is %q — want a whole number", key, raw)
		return def, false
	}
	return n, true
}

// prefixes parses the trusted proxy list. Empty is the default and a valid
// answer: it means no forwarded header is ever believed and the peer address is
// the client address.
func (l *loader) prefixes(key, def string) []netip.Prefix {
	var out []netip.Prefix
	for _, part := range splitList(l.text(key, def)) {
		p, err := netip.ParsePrefix(part)
		if err != nil {
			l.fail("%s contains %q — want a CIDR such as 172.16.0.0/12", key, part)
			continue
		}
		// Masked so that a sloppy 10.1.2.3/8 still means the network it was
		// meant to mean instead of never matching anything.
		out = append(out, p.Masked())
	}
	return out
}

// origins validates that each entry is a bare scheme://host[:port] — an origin,
// not a URL. A trailing path here would silently never match a browser's Origin
// header, and the failure would look like a CORS bug in the frontend.
func (l *loader) origins(key, def string) []string {
	var out []string
	for _, part := range splitList(l.text(key, def)) {
		u, err := url.Parse(part)
		switch {
		case err != nil:
			l.fail("%s contains %q — not a URL", key, part)
		case u.Scheme != "http" && u.Scheme != "https":
			l.fail("%s contains %q — want an http or https origin", key, part)
		case u.Host == "":
			l.fail("%s contains %q — no host", key, part)
		case u.Path != "" || u.RawQuery != "" || u.Fragment != "":
			l.fail("%s contains %q — an origin is scheme://host, without a path", key, part)
		default:
			out = append(out, u.Scheme+"://"+u.Host)
		}
	}
	return out
}

// checkAppRole refuses the schema owner's DSN.
//
// Parsing with pgconn rather than net/url is the point: it accepts both the URL
// and the keyword/value form, and it is the same parser the pool will use. If
// this accepts a string, the pool will too — which turns "the DSN is valid"
// from a hope into a property.
func (l *loader) checkAppRole(dsn string) {
	parsed, err := pgconn.ParseConfig(dsn)
	if err != nil {
		l.fail("%s does not parse: %v", EnvDatabaseURL, err)
		return
	}
	if parsed.User == forbiddenRole {
		l.fail("%s connects as %s — the api runs as the DML-only role and must not "+
			"hold DDL credentials (ADR 0011)", EnvDatabaseURL, forbiddenRole)
	}
}

func splitList(raw string) []string {
	var out []string
	for _, part := range strings.Split(raw, ",") {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}
