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
	"math"
	"net/netip"
	"net/url"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"github.com/G1NG4R/timseil-dev/api/internal/mail"
)

// Environment variable names, in one place so the runbook and .env.example have
// something to be checked against.
const (
	EnvDatabaseURL      = "DATABASE_URL"
	EnvLogLevel         = "LOG_LEVEL"
	EnvRequestTimeout   = "REQUEST_TIMEOUT"
	EnvShutdownGrace    = "SHUTDOWN_GRACE"
	EnvShutdownDelay    = "SHUTDOWN_DELAY"
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
	EnvContribTransport = "CONTRIBUTIONS_TRANSPORT"
	// G101 reads the string and sees a credential. It is the NAME of the
	// variable that carries one; the value is read from the environment and
	// never appears in this file — config_test.go holds that as its own test.
	EnvGitHubToken     = "GITHUB_TOKEN" //nolint:gosec // G101: a variable name, not a secret
	EnvGitHubLogin     = "GITHUB_LOGIN"
	EnvMailTransport   = "MAIL_TRANSPORT"
	EnvSMTPUsername    = "SMTP_USERNAME"
	EnvSMTPPassword    = "SMTP_PASSWORD"
	EnvMailTo          = "MAIL_TO"
	EnvContactIPPepper = "CONTACT_IP_PEPPER"
	EnvProbeToken      = "INTERNAL_PROBE_TOKEN"
	EnvDeployToken     = "INTERNAL_DEPLOY_TOKEN"
)

// The two answers CONTRIBUTIONS_TRANSPORT accepts.
//
// Here and not in internal/contributions, which is where the matching pair for
// mail lives one package over. internal/mail is a leaf and can hold its own
// names; internal/contributions takes a config.GitHub, so it already imports
// this package and naming them there would close a cycle. The names are the
// same shape either way.
const (
	TransportGitHub = "github"
	TransportOff    = "off"
)

// The role the api is allowed to connect as. ADR 0011 splits the schema owner
// from the data writer so that an injection in a handler cannot drop a table;
// handing this process the other DSN would make that split decorative.
const forbiddenRole = "timseil_migrate"

// Defaults. Every one of them is a decision with a reason, and the reasons live
// in ADR 0014 rather than in this list.
const (
	defaultLogLevel       = "info"
	defaultRequestTimeout = 15 * time.Second
	defaultShutdownGrace  = 20 * time.Second

	// The pause between "stop sending me work" and "the socket is closing", and
	// the only number in this list that was read off a measurement rather than
	// reasoned to. Issue #65 asked for it in C1 and it was refused there for the
	// right reason: there was no proxy in front, so it would have been a knob
	// with no effect and a number nobody could justify.
	//
	// E5b put the proxy in front and measured what it costs to leave it out. On
	// every rollout one request landed on the socket of a container Traefik had
	// not stopped using yet, and it did not fail — it HUNG, because the address
	// belongs to a container that is gone and packets to it go nowhere. The
	// retry middleware cannot rescue a request that never fails.
	//
	// Three seconds, and the three is not padding: Traefik's health check on
	// /readyz runs every second (compose.yaml), so a 503 is seen after at most
	// one interval plus one timeout. Three gives that a whole second of margin
	// and still leaves the drain its full SHUTDOWN_GRACE inside the container's
	// stop_grace_period — 3 + 20 < 30, and Load() below refuses any combination
	// where that stops being true.
	defaultShutdownDelay = 3 * time.Second

	// What compose.yaml writes as `stop_grace_period` for the api service. It is
	// not configurable and it is not read from anywhere: it is Docker's number,
	// this process cannot see it, and restating it here is the only way the check
	// below can exist at all. If that line in compose.yaml moves, this one moves
	// with it — tools/check-compose.sh refuses the two of them disagreeing so
	// that the copy cannot rot quietly.
	stopGracePeriod         = 30 * time.Second
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

	// smtp and not log. A default that sends is a default you have to opt out
	// of; the other way round, one forgotten variable in Dokploy turns the only
	// conversion point on the site into a log line nobody reads, and it fails
	// silently — every submission answered 202, no mail, no error.
	defaultMailTransport = "smtp"

	// github and not off, and the direction is the whole decision — the same
	// one MAIL_TRANSPORT makes one block down. A default that fetches is a
	// default you opt out of; the other way round, one variable nobody set in
	// Dokploy leaves the homepage promising a contribution graph and rendering
	// `— NO DATA` for ever, which is invariant 1 broken by omission.
	//
	// off exists for the deployment that has no credential and knows it: a
	// local container being checked by hand, a CI job that starts the binary.
	// It switches the refresher off, never the start — the guarantee stays
	// exactly where it was.
	defaultContribTransport = "github"

	// The pepper has no default at all, for the same reason GITHUB_TOKEN has
	// none: a shipped value is a value every deployment shares, and a shared
	// pepper is no pepper. minPepperLength is the floor rather than a
	// suggestion — the thing being resisted is a dictionary of 2^32 addresses,
	// and a short key is one somebody guesses instead of building.
	minPepperLength = 32

	// The two internal tokens have no default either, and the floor is the same
	// number for a different reason. A pepper resists a dictionary; a bearer
	// token resists being guessed by somebody who may try as often as the rate
	// limiter allows. Thirty-two characters of `openssl rand -hex 32` is well
	// past both, and a floor spares the deployment the question.
	minTokenLength = 32

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
	//
	// ShutdownDelay sits before both of them: on SIGTERM the readiness probe
	// goes to 503 immediately, and then nothing else happens for this long. It
	// is time bought for the proxy in front to notice and stop routing here,
	// and it is the difference between a graceful shutdown of the PROCESS and a
	// graceful shutdown as seen by a VISITOR. Issue #65, ADR 0035.
	RequestTimeout time.Duration
	ShutdownGrace  time.Duration
	ShutdownDelay  time.Duration

	DB        DB
	RateLimit RateLimit
	GitHub    GitHub
	Mail      Mail
	Contact   Contact
	Internal  Internal

	// TrustedProxies decides whether X-Forwarded-For is believed at all. Empty
	// is the default and means "believe nobody" — then the peer address is the
	// client address, always.
	TrustedProxies []netip.Prefix

	// AllowedOrigins is not consulted by the read endpoints, which answer any
	// origin (ADR 0015). It exists for the write path in C6.
	AllowedOrigins []string

	// SiteSystemSlug names the system /api/health reports operational numbers
	// for, and since C7 the system the two internal endpoints write their rows
	// against. deploys, metric_snapshots and ops_checks all hang off a system;
	// neither OpsSummary nor ProbeReport carries one, so one has to be named
	// rather than guessed.
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
	// Transport is TransportGitHub or TransportOff. Off means this deployment
	// has no credential and says so: the refresher is never started, nothing is
	// fetched and nothing is written. The endpoint is unaffected — it reads the
	// cached row and nothing else, so with an empty cache it keeps answering
	// what it answers on a cold start (ADR 0020), and it never invents a
	// calendar to fill the gap.
	Transport string

	// Token is a personal access token with scope read:user and nothing else.
	// It never reaches a log line, a response body, an image layer or anything
	// behind NEXT_PUBLIC_. Handbook ch. 15.
	Token string

	// Login is whose calendar is fetched. Also the primary key of the cached
	// row, which is why a change to it leaves the old row behind — see
	// docs/runbooks/api.md.
	Login string
}

// Fetches reports whether this deployment reaches GitHub at all. Shaped like
// Mail.Sends and read in the same two places: the thing that owns the loop, and
// the startup line that says out loud which of the two states this process is in.
func (g GitHub) Fetches() bool { return g.Transport == TransportGitHub }

// Mail is how the contact form reaches the outside world.
//
// The relay host is not here. ssl0.ovh.net is compiled into internal/mail, for
// the same reason GitHub's endpoint is compiled into internal/contributions and
// ADR 0020 §8 spells out: a host that can come from the environment is one edit
// away from a host that can come from a request. What differs between
// deployments is the account, not the provider.
//
// There is no From either, and its absence is a rule rather than an omission.
// OVH MX Plan requires the From header to equal the authenticated account, so
// From *is* Username. A separate variable could only ever be set wrong, and it
// would be rejected by the relay after the password had already crossed the
// wire.
type Mail struct {
	// Transport is mail.TransportSMTP or mail.TransportLog. The log transport
	// builds the message in full and writes it to a log line instead of sending
	// it; it exists because L1 sets up the mailbox and L1 comes after stage D,
	// so at C6 there is nothing to send to.
	Transport string

	// Username is the full mail address, and therefore also the From of every
	// message this service sends.
	Username string

	// Password never reaches a log line, a response body or an image layer.
	Password string

	// To is the inbox the messages land in.
	To string
}

// Sends reports whether this deployment actually delivers mail. The one caller
// is the startup warning: a process that is only logging its mail should say so
// once, loudly, rather than let somebody discover it from an empty inbox.
func (m Mail) Sends() bool { return m.Transport == mail.TransportSMTP }

// Contact is what the contact endpoint needs beyond the mail settings.
type Contact struct {
	// IPPepper keys the digest stored in contact_messages.ip_hash.
	//
	// A different problem from the rate limiter's key, which is random per
	// process and never configured (ADR 0015 §3): that one labels a bucket that
	// is forgotten after ten minutes, this one is written to a table that
	// outlives every restart. 00006_contact.sql states the requirement in the
	// column comment — a bare SHA-256 of an IPv4 is a spelling of the address,
	// because the whole space is 2^32 and a dictionary of it is minutes of work.
	//
	// Rotating it orphans every hash written before the change: the rate-limit
	// floor stops recognising an address it has already seen. That is a
	// deliberate property and not a bug — it is also the only way to forget
	// everybody at once — and it is written down in docs/runbooks/api.md.
	IPPepper string
}

// Internal is the pair of bearer tokens the two internal endpoints compare
// against.
//
// Two and not one, deliberately. The prober (F4) and the deploy pipeline (E4)
// are different callers with different lifetimes, and the two writes they make
// are worth different amounts: an invented uptime row is one cell in a grid of
// ninety-one, an invented deploy row is the number the case study points at
// when it says the deploy duration is measured rather than claimed. One leaked
// token should not buy both, and rotating one should not mean rotating the
// other.
type Internal struct {
	// ProbeToken authenticates POST /api/internal/probe.
	ProbeToken string

	// DeployToken authenticates POST /api/internal/deploy.
	DeployToken string
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
		// Zero is a legal value and means "do not wait": a deployment with no
		// proxy in front of it — `make dev`, a test, anybody's laptop — has
		// nobody to wait for, and making them sit through three seconds on
		// every Ctrl-C would be this repository imposing production on them.
		ShutdownDelay: l.atLeastZeroDuration(EnvShutdownDelay, defaultShutdownDelay),

		DB: DB{
			MaxConns:         l.positiveInt32(EnvDBMaxConns, defaultMaxConns),
			MinConns:         l.atLeastZeroInt32(EnvDBMinConns, defaultMinConns),
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
			Transport: l.oneOf(EnvContribTransport, defaultContribTransport,
				TransportGitHub, TransportOff),
			Token: l.secret(EnvGitHubToken),
			Login: l.login(EnvGitHubLogin, defaultGitHubLogin),
		},

		Mail: Mail{
			Transport: l.oneOf(EnvMailTransport, defaultMailTransport,
				mail.TransportSMTP, mail.TransportLog),
			Username: l.address(EnvSMTPUsername),
			Password: strings.TrimSpace(os.Getenv(EnvSMTPPassword)),
			To:       l.address(EnvMailTo),
		},

		Contact: Contact{
			IPPepper: l.pepper(EnvContactIPPepper),
		},

		Internal: Internal{
			ProbeToken:  l.token(EnvProbeToken, "the external prober from F4"),
			DeployToken: l.token(EnvDeployToken, "the deploy pipeline from E4"),
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
	// THE OTHER HALF OF THIS NUMBER IS IN compose.yaml, and no runtime notices
	// when only one of them moves — the same shape as limits.memory and
	// GOMEMLIMIT, which the compose runbook already lists as a pair.
	//
	// stop_grace_period is what Docker waits between SIGTERM and SIGKILL. Spend
	// longer than that between the two and the delay is not a courtesy, it is a
	// cut: SIGKILL arrives while the drain is still running and the requests
	// this whole mechanism exists to protect are dropped after all. Refused
	// here rather than discovered as a truncated response in production.
	if cfg.ShutdownDelay+cfg.ShutdownGrace > stopGracePeriod {
		l.fail("%s (%s) plus %s (%s) exceeds the container's stop_grace_period (%s) — "+
			"SIGKILL would arrive mid-drain. compose.yaml holds the other half of this pair",
			EnvShutdownDelay, cfg.ShutdownDelay, EnvShutdownGrace, cfg.ShutdownGrace, stopGracePeriod)
	}
	if cfg.DB.StatementTimeout > cfg.RequestTimeout {
		l.fail("%s (%s) must not exceed %s (%s) — a query may not outlive the request that asked for it",
			EnvStatementTimeout, cfg.DB.StatementTimeout, EnvRequestTimeout, cfg.RequestTimeout)
	}
	if cfg.DB.MinConns > cfg.DB.MaxConns {
		l.fail("%s (%d) must not exceed %s (%d)",
			EnvDBMinConns, cfg.DB.MinConns, EnvDBMaxConns, cfg.DB.MaxConns)
	}
	// Required only when this deployment actually fetches, and read
	// unconditionally above for the reason the mail block below gives: a token
	// with a line break in it is reported even under the off transport, so
	// switching the transport back on does not hand you a second failure you
	// could have been told about the first time.
	//
	// The message names the scope and where to get one, because .env.example
	// deliberately carries no value — and it names the way out, because the
	// deployment that hits this line is usually a container being checked by
	// hand rather than production.
	if cfg.GitHub.Fetches() && cfg.GitHub.Token == "" {
		l.fail("%s is empty — a personal access token with scope read:user, "+
			"github.com/settings/tokens (set %s=%s to start without one; the "+
			"calendar is then never refreshed)",
			EnvGitHubToken, EnvContribTransport, TransportOff)
	}

	// The three mail values are required only when mail is actually sent. They
	// are read and validated unconditionally above, so that a wrong address is
	// reported under the log transport too — a deployment that fixes its
	// transport should not then discover a typo it could have been told about
	// at the same time.
	if cfg.Mail.Sends() {
		if cfg.Mail.Username == "" {
			l.fail("%s is empty — the full mail address of the OVH mailbox, which is also "+
				"the From of every message (set %s=%s to build mail without sending it)",
				EnvSMTPUsername, EnvMailTransport, mail.TransportLog)
		}
		if cfg.Mail.Password == "" {
			l.fail("%s is empty — the password of that mailbox", EnvSMTPPassword)
		}
		if cfg.Mail.To == "" {
			l.fail("%s is empty — the inbox contact form messages are delivered to", EnvMailTo)
		}
	}
	// Checked whatever the transport, and never echoed: this value goes into an
	// SMTP AUTH exchange, so a line break in it is a line the relay reads as a
	// command. Same class as the GITHUB_TOKEN check, one endpoint later.
	if strings.ContainsAny(cfg.Mail.Password, "\r\n") {
		l.fail("%s contains a line break — it is sent in an SMTP exchange and must not",
			EnvSMTPPassword)
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

// secret reads a credential and checks the one thing that is true of it
// whatever the deployment does with it.
//
// Empty is allowed here and reported later, by the cross-field rule that knows
// whether this deployment fetches at all — the same split internal/mail's three
// values get, and for the same reason.
//
// What is not deferred is the CR/LF check. This value goes into an Authorization
// header. A newline in it lets whoever set it append headers of their own, which
// is the same class of failure as the CRLF rule for mail fields in C6, one
// endpoint earlier and against a smaller attacker — but the check is three lines
// and the alternative is trusting that nobody ever pastes a token with a
// trailing newline into a Dokploy field.
//
// The value itself never appears in the error. A configuration failure is
// printed by a process that is about to exit, and a secret in that line is a
// secret in the container log.
func (l *loader) secret(key string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if strings.ContainsAny(v, "\r\n") {
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

// oneOf accepts the names a switch actually implements and nothing else.
//
// The refusal is the point, and it is the same one for both callers. Read
// permissively, a typo means "not the default" and silently selects the other
// branch: MAIL_TRANSPORT=sntp would answer every submission with 202 and deliver
// nothing, which is the worst failure that endpoint has because it looks exactly
// like success; CONTRIBUTIONS_TRANSPORT=gihub would stop refreshing the calendar
// and leave the page ageing quietly. Neither shows up until somebody goes
// looking, so neither is allowed to happen.
//
// The first name in allowed is the default, so the message lists the way back
// as well as the way out.
func (l *loader) oneOf(key, def string, allowed ...string) string {
	v := strings.ToLower(l.text(key, def))
	if slices.Contains(allowed, v) {
		return v
	}
	l.fail("%s is %q — want %s", key, v, strings.Join(allowed, " or "))
	return def
}

// address reads a mail address and holds it to the same rule the message
// builder does. Empty is allowed here and reported later, by the cross-field
// rule that knows whether this deployment sends at all.
//
// The value is echoed in the failure because neither of these is a secret and
// "SMTP_USERNAME is contact@timseil,dev" finds the typo in one read.
func (l *loader) address(key string) string {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return ""
	}
	address, err := mail.BareAddress(raw)
	if err != nil {
		l.fail("%s is %q — want a plain mail address, without a display name: %v", key, raw, err)
		return ""
	}
	return address
}

// pepper reads the key that makes a stored ip_hash worth storing.
//
// Required unconditionally, unlike the mail settings: the hash is written on
// every submission, including under the log transport, and a deployment that
// wrote unpeppered digests for a week would have to be told that its table is
// now a list of addresses.
//
// The value never appears in the error. A configuration failure is printed by a
// process about to exit, and a secret in that line is a secret in the container
// log.
func (l *loader) pepper(key string) string {
	v := strings.TrimSpace(os.Getenv(key))
	switch {
	case v == "":
		l.fail("%s is empty — a server-side secret that keys the stored ip_hash. "+
			"Generate one with: openssl rand -hex 32", key)
	case len(v) < minPepperLength:
		l.fail("%s is %d characters — want at least %d, because what it resists is a "+
			"dictionary of the whole IPv4 space", key, len(v), minPepperLength)
		return ""
	case strings.ContainsAny(v, "\r\n"):
		l.fail("%s contains a line break", key)
		return ""
	}
	return v
}

// token reads one of the two internal bearer tokens.
//
// Shaped like pepper rather than like credential: credential (GITHUB_TOKEN)
// checks only that something is there and that it has no line break, because
// the length of a GitHub token is GitHub's business. These two are generated by
// whoever deploys, so nothing but this function stands between a hurried
// `INTERNAL_PROBE_TOKEN=test` and a public write endpoint.
//
// The value never appears in the error, for the same reason it does not in
// pepper: a configuration failure is printed by a process about to exit, and a
// secret in that line is a secret in the container log.
func (l *loader) token(key, who string) string {
	v := strings.TrimSpace(os.Getenv(key))
	switch {
	case v == "":
		l.fail("%s is empty — the bearer token %s presents. "+
			"Generate one with: openssl rand -hex 32", key, who)
		return ""
	case len(v) < minTokenLength:
		l.fail("%s is %d characters — want at least %d", key, len(v), minTokenLength)
		return ""
	case strings.ContainsAny(v, "\r\n"):
		l.fail("%s contains a line break — it is compared against an HTTP header "+
			"and must not", key)
		return ""
	}
	return v
}

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

// atLeastZeroDuration is duration() with zero allowed.
//
// Its own function rather than a flag on duration(), because the two answer
// different questions: a REQUEST_TIMEOUT of zero is a configuration mistake,
// and a SHUTDOWN_DELAY of zero is the honest setting for a process with no
// proxy in front of it. A boolean argument at the call site would have said
// which one this is only to whoever went and read the signature.
func (l *loader) atLeastZeroDuration(key string, def time.Duration) time.Duration {
	raw := os.Getenv(key)
	if strings.TrimSpace(raw) == "" {
		return def
	}
	d, err := time.ParseDuration(strings.TrimSpace(raw))
	if err != nil {
		l.fail("%s is %q — want a duration such as 3s or 0", key, raw)
		return def
	}
	if d < 0 {
		l.fail("%s is %q — want a duration of zero or more", key, raw)
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

// positiveInt32 and atLeastZeroInt32 exist because the pool fields are int32 and
// the environment is not.
//
// The version this replaces was `int32(l.positive(...))`, and the hole it left
// is narrow but silent: `positive` rejects zero and below, so DB_MAX_CONNS=0 was
// caught — but 4294967306 was not. It is positive, it survives the check, and
// the conversion wraps it to 10. A number nobody typed, accepted as if it had
// been, in a loader whose whole promise (ADR 0014) is that the configuration is
// completely validated before anything starts.
//
// Refusing the range here rather than converting afterwards is also why the
// conversion is gone: there is nothing left for gosec's G115 to warn about,
// because the value cannot be out of range by the time it is one.
//
// internal/intake does the same thing for the same reason and calls it
// checkInt32 — there the source is a probe report, here it is an environment
// variable, and both widen to a 64-bit int on the way in.
func (l *loader) positiveInt32(key string, def int32) int32 {
	n, ok := l.number(key, int(def))
	if !ok {
		return def
	}
	if n <= 0 {
		l.fail("%s is %d — want a positive number", key, n)
		return def
	}
	if n > math.MaxInt32 {
		l.fail("%s is %d — want at most %d", key, n, math.MaxInt32)
		return def
	}
	return int32(n)
}

func (l *loader) atLeastZeroInt32(key string, def int32) int32 {
	n, ok := l.number(key, int(def))
	if !ok {
		return def
	}
	if n < 0 {
		l.fail("%s is %d — want zero or more", key, n)
		return def
	}
	if n > math.MaxInt32 {
		l.fail("%s is %d — want at most %d", key, n, math.MaxInt32)
		return def
	}
	return int32(n)
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
