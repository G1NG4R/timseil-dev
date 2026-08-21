package contributions

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"strconv"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/G1NG4R/timseil-dev/api/internal/buildinfo"
	"github.com/G1NG4R/timseil-dev/api/internal/config"
	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// endpoint is where the calendar comes from, and it is not configurable.
//
// A URL that can be set from the environment is one edit away from a URL that
// can be set from a request, and the SSRF rule this repository carries says the
// two outbound destinations this service has are compiled in. It is a var rather
// than a const only so the tests in this package can point it at an
// httptest.Server: unexported, so nothing outside the package can move it, and
// no code path reads it from anywhere but here.
var endpoint = "https://api.github.com/graphql"

// The query, verbatim from handbook ch. 15.
//
// GraphQL and not REST, because REST does not serve the contribution calendar at
// all — there is no endpoint for it, and finding that out is reportedly an hour
// of searching. The comment is the hour.
//
// It asks for exactly four fields. contributionLevel is GitHub's quartile name
// and is translated below; the `color` that comes with it is never requested,
// because this site has its own five steps and GitHub's green is not one of
// them.
const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`

// The five steps, GitHub's names on the left and the contract's on the right.
//
// A map and not a switch with a default, deliberately: a default would have to
// choose a step for a name nobody has seen, and the only honest choice is to
// refuse. A sixth quartile would mean GitHub changed the vocabulary, and
// painting it as l0 would draw a quiet day that was not quiet — invariant 1, in
// a colour.
var levels = map[string]httpx.ContributionLevel{
	"NONE":            httpx.L0,
	"FIRST_QUARTILE":  httpx.L1,
	"SECOND_QUARTILE": httpx.L2,
	"THIRD_QUARTILE":  httpx.L3,
	"FOURTH_QUARTILE": httpx.L4,
}

// The failures, as sentinels, because the refresher logs them and the runbook
// reads the log. Each one is its own error rather than a shared "fetch failed":
// an expired token, a broken GitHub and a login that does not exist need three
// different things done about them, and a single message would send whoever is
// on it to the wrong place.
var (
	errUpstreamStatus = errors.New("github answered with an unexpected status")
	errGraphQL        = errors.New("github returned a graphql error")
	errNoSuchUser     = errors.New("github has no such user")
	errEmptyCalendar  = errors.New("github returned a calendar with no weeks")
	errUnknownLevel   = errors.New("github used a contribution level this service does not know")
	errMalformedDay   = errors.New("github returned a day this service cannot read")
)

// calendar is a successful fetch: already translated into the contract's shape,
// so that nothing downstream has to know GitHub's vocabulary.
type calendar struct {
	total int
	weeks []httpx.ContributionWeek
}

// fetcher holds the client. One per process, because an http.Client is a pool
// and a fresh one per call would open a new TLS connection every hour for no
// reason.
type fetcher struct {
	client *http.Client
	gh     config.GitHub
	agent  string
}

func newFetcher(gh config.GitHub) *fetcher {
	build := buildinfo.Read()

	return &fetcher{
		// Never http.DefaultClient. It has no timeout at all, and it belongs to
		// the whole process — a transport setting made here would reach every
		// other caller in the binary.
		client: &http.Client{
			// The outer bound, covering redirects and the body read. The inner
			// bounds below exist because this one alone would let a connection
			// that never completes its handshake use the whole budget.
			Timeout: attemptTimeout,
			Transport: &http.Transport{
				DialContext:           (&net.Dialer{Timeout: 5 * time.Second}).DialContext,
				TLSHandshakeTimeout:   5 * time.Second,
				ResponseHeaderTimeout: 5 * time.Second,
				// One host, one connection, kept warm between hourly fetches.
				MaxIdleConns:        2,
				MaxIdleConnsPerHost: 2,
				IdleConnTimeout:     90 * time.Second,
				ForceAttemptHTTP2:   true,
			},
		},
		gh: gh,
		// GitHub requires a User-Agent and answers 403 without one. Naming the
		// build means a rate-limit complaint from them arrives with a version
		// attached.
		agent: "timseil.dev/" + build.Version + " (+https://timseil.dev)",
	}
}

// fetch performs one attempt. Retries and the breaker are the refresher's
// business, not this function's.
func (f *fetcher) fetch(ctx context.Context) (calendar, error) {
	body, err := json.Marshal(map[string]any{
		"query":     query,
		"variables": map[string]string{"login": f.gh.Login},
	})
	if err != nil {
		return calendar{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return calendar{}, err
	}
	req.Header.Set("Authorization", "Bearer "+f.gh.Token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", f.agent)

	resp, err := f.client.Do(req)
	if err != nil {
		return calendar{}, err
	}
	defer func() {
		// Drained before closing so the connection can be reused, and drained
		// through the same limit: a body nobody wants is still a body a hostile
		// server can make enormous.
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxResponseBytes))
		_ = resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		// The status and nothing else. GitHub's error bodies are helpful to a
		// developer and are not ours to put anywhere a visitor might see; the
		// status is enough to tell 401 (rotate the token) from 502 (wait).
		return calendar{}, fmt.Errorf("%w: %s", errUpstreamStatus, strconv.Itoa(resp.StatusCode))
	}

	// Bounded. A calendar is about thirty kilobytes; reading an unbounded body
	// from a host we do not run is a memory risk that costs one line to remove.
	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return calendar{}, err
	}

	var answer graphQLAnswer
	if err := json.Unmarshal(raw, &answer); err != nil {
		return calendar{}, err
	}

	return translate(answer)
}

// graphQLAnswer is the shape of the response, and the pointer on User is the
// load-bearing part of it: GraphQL says "no such user" by putting null there,
// not by failing.
type graphQLAnswer struct {
	Data struct {
		User *struct {
			ContributionsCollection struct {
				ContributionCalendar struct {
					TotalContributions int `json:"totalContributions"`
					Weeks              []struct {
						ContributionDays []struct {
							Date              string `json:"date"`
							ContributionCount int    `json:"contributionCount"`
							ContributionLevel string `json:"contributionLevel"`
						} `json:"contributionDays"`
					} `json:"weeks"`
				} `json:"contributionCalendar"`
			} `json:"contributionsCollection"`
		} `json:"user"`
	} `json:"data"`

	Errors []struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"errors"`
}

// translate turns GitHub's answer into the contract's, and refuses everything it
// cannot vouch for.
//
// Every branch below ends in an error rather than in a smaller calendar. That is
// the whole design of this endpoint in one function: a failed fetch leaves the
// stored calendar standing, so refusing costs an hour of staleness, while
// accepting a half-answer overwrites a good calendar with a worse one and there
// is no way back to it.
func translate(answer graphQLAnswer) (calendar, error) {
	// The trap. GraphQL answers HTTP 200 and puts the failure in the body, so a
	// client that checks only the status reads zeros out of a null `data` and
	// stores them as a year of quiet days.
	if len(answer.Errors) > 0 {
		first := answer.Errors[0]
		reason := first.Type
		if reason == "" {
			reason = "unspecified"
		}
		return calendar{}, fmt.Errorf("%w: %s", errGraphQL, reason)
	}

	if answer.Data.User == nil {
		// Almost always a typo in GITHUB_LOGIN. Its own error because it is the
		// one failure here that no amount of waiting fixes.
		return calendar{}, errNoSuchUser
	}

	source := answer.Data.User.ContributionsCollection.ContributionCalendar

	// Invariant 1, at the point where it can be broken by a write. An empty
	// calendar is not a quiet year; it is an answer we did not get.
	if len(source.Weeks) == 0 {
		return calendar{}, errEmptyCalendar
	}

	weeks := make([]httpx.ContributionWeek, 0, len(source.Weeks))
	for _, sourceWeek := range source.Weeks {
		days := make([]httpx.ContributionDay, 0, len(sourceWeek.ContributionDays))

		for _, sourceDay := range sourceWeek.ContributionDays {
			level, known := levels[sourceDay.ContributionLevel]
			if !known {
				return calendar{}, fmt.Errorf("%w: %q", errUnknownLevel, sourceDay.ContributionLevel)
			}

			day, err := time.Parse(time.DateOnly, sourceDay.Date)
			if err != nil {
				return calendar{}, fmt.Errorf("%w: %q", errMalformedDay, sourceDay.Date)
			}
			if sourceDay.ContributionCount < 0 {
				return calendar{}, fmt.Errorf("%w: %d contributions", errMalformedDay, sourceDay.ContributionCount)
			}

			days = append(days, httpx.ContributionDay{
				Date:  openapi_types.Date{Time: day},
				Count: sourceDay.ContributionCount,
				Level: level,
			})
		}

		// Never nil: `days` is required by the contract, and `null` where an
		// array is required is a shape no generated client expects.
		weeks = append(weeks, httpx.ContributionWeek{Days: days})
	}

	// Both bounds, not just the lower one. total_contributions is a Postgres
	// integer, so a value above MaxInt32 wrapped negative on the way in and was
	// caught by the column CHECK rather than here — a rejection that arrives as
	// a driver error instead of a named one. Found by gosec G115 in E2.
	if source.TotalContributions < 0 || source.TotalContributions > math.MaxInt32 {
		return calendar{}, fmt.Errorf("%w: total is %d", errMalformedDay, source.TotalContributions)
	}

	return calendar{total: source.TotalContributions, weeks: weeks}, nil
}
