package uptime

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/buildinfo"
)

// The two addresses this package reaches, and both are compiled in.
//
// The SSRF rule, and the same sentence config.GitHub carries: a URL that can be
// set from the environment is one edit away from a URL that can be set from a
// request. Nothing about which branch of which repository holds this log differs
// between deployments, so nothing about it belongs in the environment.
//
// They are var and not const for exactly one reason: the tests point them at an
// httptest server. Nothing in the running binary writes to them.
var (
	logURL  = "https://raw.githubusercontent.com/G1NG4R/timseil-dev/ops-data/uptime-log.txt"
	headURL = "https://api.github.com/repos/G1NG4R/timseil-dev/commits/ops-data"
)

var (
	errUpstreamStatus = errors.New("the ops-data branch answered with an unexpected status")
	errMalformedRef   = errors.New("github named something that is not a commit sha")
)

// A full commit sha, lowercase. Checked here because the column will not check
// it: deploys.sha carries a CHECK on its shape and ops_checks.source_ref does
// not, so this is the only place between GitHub's answer and the database where
// "the evidence names a commit" is more than a hope.
var commitSha = regexp.MustCompile(`^[0-9a-f]{40}$`)

// document is one read of the outage log.
//
// unchanged and missing are both ordinary answers rather than errors, and they
// are the two the loop sees almost every time: the file has not moved since the
// last run, or no outage has ever happened and the prober has not created it.
type document struct {
	unchanged bool
	missing   bool

	etag      string
	body      []byte
	sourceRef string
}

// fetcher holds the client. One per process, because an http.Client is a pool
// and a fresh one per call would open a new TLS connection every quarter hour
// for no reason.
type fetcher struct {
	client *http.Client
	agent  string
}

func newFetcher() *fetcher {
	build := buildinfo.Read()

	return &fetcher{
		// Never http.DefaultClient: no timeout at all, and it belongs to the
		// whole process — a transport setting made here would reach every other
		// caller in the binary.
		client: &http.Client{
			Timeout: attemptTimeout,
			Transport: &http.Transport{
				DialContext:           (&net.Dialer{Timeout: 5 * time.Second}).DialContext,
				TLSHandshakeTimeout:   5 * time.Second,
				ResponseHeaderTimeout: 5 * time.Second,
				// Two hosts, one connection each, kept warm between reads.
				MaxIdleConns:        4,
				MaxIdleConnsPerHost: 2,
				IdleConnTimeout:     90 * time.Second,
				ForceAttemptHTTP2:   true,
			},
		},
		// GitHub requires a User-Agent and answers 403 without one. Naming the
		// build means a rate-limit complaint arrives with a version attached.
		agent: "timseil.dev/" + build.Version + " (+https://timseil.dev)",
	}
}

// fetch performs one attempt: the file, and then the commit that names it.
// Retries and the breaker are the loop's business, not this function's.
//
// The commit is asked for SECOND and only after a 200. On the ordinary run the
// file is unchanged, the answer is a 304 with no body, and this function makes
// exactly one request — which is what keeps a quarter-hourly loop against
// somebody else's server polite.
func (f *fetcher) fetch(ctx context.Context, etag string) (document, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, logURL, nil)
	if err != nil {
		return document{}, err
	}
	req.Header.Set("Accept", "text/plain")
	req.Header.Set("User-Agent", f.agent)
	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	}

	resp, err := f.client.Do(req)
	if err != nil {
		return document{}, err
	}
	defer func() {
		// Drained before closing so the connection can be reused, and drained
		// through a limit: a body nobody wants is still a body a hostile server
		// can make enormous.
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxBytes))
		_ = resp.Body.Close()
	}()

	switch resp.StatusCode {
	case http.StatusNotModified:
		// The etag is echoed back rather than re-read: a 304 carries one only
		// sometimes, and forgetting it here would make the next run
		// unconditional.
		return document{unchanged: true, etag: etag}, nil

	case http.StatusNotFound:
		// No outage has ever happened. The prober creates the file when it
		// first has a line to write, so its absence is the normal state of a
		// host that has been up since F4 landed.
		return document{missing: true}, nil

	case http.StatusOK:

	default:
		return document{}, fmt.Errorf("%w: %s", errUpstreamStatus, resp.Status)
	}

	// One byte past the limit, so that a file over it is detected rather than
	// silently cut down to a shorter history. parse holds the same bound; this
	// one exists because reading the whole body into memory first is what makes
	// the retry cheap.
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBytes+1))
	if err != nil {
		return document{}, err
	}

	ref, err := f.sourceRef(ctx)
	if err != nil {
		return document{}, err
	}

	return document{etag: resp.Header.Get("ETag"), body: body, sourceRef: ref}, nil
}

// sourceRef asks which commit the branch currently points at.
//
// This is the value ops_checks.source_ref will carry, and the reason a
// backfilled row is evidence rather than an assertion: it names something a
// stranger can fetch and count for themselves.
//
// It is read AFTER the file, which leaves a race — a commit could land between
// the two requests, and then a row would cite the commit after the one it came
// from. That is accepted rather than solved: the log is append-only, so the
// later commit still contains every line the earlier one had, and citing it
// points at a file that does contain the evidence. Reading the blob through the
// contents API instead would name a blob rather than a commit, which is what the
// migration asked for and not what it says.
func (f *fetcher) sourceRef(ctx context.Context) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, headURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", f.agent)

	resp, err := f.client.Do(req)
	if err != nil {
		return "", err
	}
	defer func() {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxCommitBytes))
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("%w: %s", errUpstreamStatus, resp.Status)
	}

	var answer struct {
		SHA string `json:"sha"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxCommitBytes)).Decode(&answer); err != nil {
		return "", err
	}

	if !commitSha.MatchString(answer.SHA) {
		return "", fmt.Errorf("%w: %q", errMalformedRef, answer.SHA)
	}

	return answer.SHA, nil
}
