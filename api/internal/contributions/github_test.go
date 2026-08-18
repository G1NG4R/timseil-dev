package contributions

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/config"
	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

const testToken = "ghp_not_a_real_token"

func testGitHub() config.GitHub {
	return config.GitHub{Token: testToken, Login: "octocat"}
}

// serving points the package's endpoint at a test server for the duration of one
// test. The variable is unexported precisely so that this is the only way to
// move it: nothing outside this package, and nothing at all at runtime, can send
// the token somewhere else.
func serving(t *testing.T, handler http.HandlerFunc) *fetcher {
	t.Helper()

	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	previous := endpoint
	endpoint = srv.URL
	t.Cleanup(func() { endpoint = previous })

	return newFetcher(testGitHub())
}

// A calendar the way GitHub sends one: quartile names, not the contract's steps.
func githubCalendar(total int, weeks ...string) string {
	return `{"data":{"user":{"contributionsCollection":{"contributionCalendar":{` +
		`"totalContributions":` + itoa(total) + `,"weeks":[` + strings.Join(weeks, ",") + `]}}}}}`
}

const oneWeek = `{"contributionDays":[
  {"date":"2026-08-10","contributionCount":0,"contributionLevel":"NONE"},
  {"date":"2026-08-11","contributionCount":3,"contributionLevel":"FIRST_QUARTILE"},
  {"date":"2026-08-12","contributionCount":9,"contributionLevel":"FOURTH_QUARTILE"}]}`

func itoa(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}

func ok(w http.ResponseWriter, body string) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = io.WriteString(w, body)
}

// ------------------------------------------------------------- the happy path

func TestACalendarComesBackInTheContractsShape(t *testing.T) {
	f := serving(t, func(w http.ResponseWriter, _ *http.Request) {
		ok(w, githubCalendar(412, oneWeek))
	})

	cal, err := f.fetch(context.Background())
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}

	if cal.total != 412 {
		t.Errorf("total = %d, want 412", cal.total)
	}
	if len(cal.weeks) != 1 || len(cal.weeks[0].Days) != 3 {
		t.Fatalf("weeks = %+v", cal.weeks)
	}

	day := cal.weeks[0].Days[1]
	if got := day.Date.Time.Format(time.DateOnly); got != "2026-08-11" {
		t.Errorf("date = %q", got)
	}
	if day.Count != 3 {
		t.Errorf("count = %d, want 3", day.Count)
	}
	if day.Level != httpx.L1 {
		t.Errorf("level = %q, want l1", day.Level)
	}
}

// The five steps, and no sixth. GitHub's own `color` is never requested and
// never appears here: this site has its own steps and GitHub's green is not one
// of them.
func TestTheFiveQuartilesMapOntoTheFiveSteps(t *testing.T) {
	want := map[string]httpx.ContributionLevel{
		"NONE":            httpx.L0,
		"FIRST_QUARTILE":  httpx.L1,
		"SECOND_QUARTILE": httpx.L2,
		"THIRD_QUARTILE":  httpx.L3,
		"FOURTH_QUARTILE": httpx.L4,
	}

	if len(levels) != len(want) {
		t.Fatalf("%d levels, want %d", len(levels), len(want))
	}
	for name, step := range want {
		if levels[name] != step {
			t.Errorf("%s maps to %q, want %q", name, levels[name], step)
		}
	}
}

// ------------------------------------------------------------------ the token

func TestTheTokenIsSentAsABearerWithAUserAgent(t *testing.T) {
	var auth, agent, contentType string

	f := serving(t, func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		agent = r.Header.Get("User-Agent")
		contentType = r.Header.Get("Content-Type")
		ok(w, githubCalendar(1, oneWeek))
	})

	if _, err := f.fetch(context.Background()); err != nil {
		t.Fatalf("fetch: %v", err)
	}

	if auth != "Bearer "+testToken {
		t.Errorf("Authorization = %q", auth)
	}
	// GitHub answers 403 to a request without one, which is a confusing way to
	// find out.
	if !strings.HasPrefix(agent, "timseil.dev/") {
		t.Errorf("User-Agent = %q, want it to name this build", agent)
	}
	if contentType != "application/json" {
		t.Errorf("Content-Type = %q", contentType)
	}
}

func TestTheLoginTravelsAsAVariableAndNotInTheQuery(t *testing.T) {
	var sent struct {
		Query     string            `json:"query"`
		Variables map[string]string `json:"variables"`
	}

	f := serving(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&sent)
		ok(w, githubCalendar(1, oneWeek))
	})
	if _, err := f.fetch(context.Background()); err != nil {
		t.Fatalf("fetch: %v", err)
	}

	if sent.Variables["login"] != "octocat" {
		t.Errorf("variables = %v", sent.Variables)
	}
	// Interpolated into the document instead, the login would be one quoting
	// mistake away from being part of the query. It is a parameter, so it is
	// not.
	if strings.Contains(sent.Query, "octocat") {
		t.Error("the login was interpolated into the query text")
	}
	if !strings.Contains(sent.Query, "contributionCalendar") {
		t.Errorf("query does not look like the calendar query:\n%s", sent.Query)
	}
	// The colours are never asked for.
	if strings.Contains(sent.Query, "color") {
		t.Error("the query requests GitHub's colours — this site has its own steps")
	}
}

// Whatever goes wrong, the credential is not in the error. Errors from here are
// logged, and a log line is a place a token outlives its rotation.
func TestNoFailureQuotesTheToken(t *testing.T) {
	bodies := []string{
		`{"errors":[{"type":"FORBIDDEN","message":"bad credentials for ` + testToken + `"}]}`,
		`{"data":{"user":null}}`,
		`not json at all ` + testToken,
	}

	for _, body := range bodies {
		f := serving(t, func(w http.ResponseWriter, _ *http.Request) { ok(w, body) })

		_, err := f.fetch(context.Background())
		if err == nil {
			t.Fatalf("fetch succeeded on %q", body)
		}
		if strings.Contains(err.Error(), testToken) {
			t.Errorf("the error quotes the token: %v", err)
		}
	}
}

// ---------------------------------------------------------------- the refusals

// The GraphQL trap: HTTP 200 with the failure in the body. A client that checks
// only the status reads zeros out of a null `data` and stores a year of quiet
// days.
func TestAnErrorsArrayIsAFailureEvenAtTwoHundred(t *testing.T) {
	f := serving(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, `{"data":{"user":null},"errors":[{"type":"RATE_LIMITED","message":"slow down"}]}`)
	})

	_, err := f.fetch(context.Background())
	if !errors.Is(err, errGraphQL) {
		t.Fatalf("err = %v, want errGraphQL", err)
	}
	// The type is useful and safe; the message is GitHub's prose and stays out.
	if !strings.Contains(err.Error(), "RATE_LIMITED") {
		t.Errorf("the error does not name the graphql type: %v", err)
	}
	if strings.Contains(err.Error(), "slow down") {
		t.Errorf("the error carries GitHub's message text: %v", err)
	}
}

func TestAnUnknownLoginIsItsOwnFailure(t *testing.T) {
	f := serving(t, func(w http.ResponseWriter, _ *http.Request) {
		ok(w, `{"data":{"user":null}}`)
	})

	if _, err := f.fetch(context.Background()); !errors.Is(err, errNoSuchUser) {
		t.Errorf("err = %v, want errNoSuchUser", err)
	}
}

// Invariant 1. An empty calendar is not a quiet year, it is an answer we did not
// get — and stored over a good one there is no way back to it.
func TestAnEmptyCalendarIsRefused(t *testing.T) {
	f := serving(t, func(w http.ResponseWriter, _ *http.Request) {
		ok(w, githubCalendar(0))
	})

	if _, err := f.fetch(context.Background()); !errors.Is(err, errEmptyCalendar) {
		t.Errorf("err = %v, want errEmptyCalendar", err)
	}
}

// A total of zero with real weeks is a real measurement and must go through. The
// test above would pass just as happily with a rule that refused every zero.
func TestAQuietYearWithRealWeeksIsAccepted(t *testing.T) {
	f := serving(t, func(w http.ResponseWriter, _ *http.Request) {
		ok(w, githubCalendar(0, `{"contributionDays":[{"date":"2026-08-10","contributionCount":0,"contributionLevel":"NONE"}]}`))
	})

	cal, err := f.fetch(context.Background())
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if cal.total != 0 || len(cal.weeks) != 1 {
		t.Errorf("calendar = %+v", cal)
	}
}

// A sixth quartile means GitHub changed the vocabulary. Painting it l0 would
// draw a quiet day that was not quiet.
func TestAnUnknownContributionLevelIsRefused(t *testing.T) {
	f := serving(t, func(w http.ResponseWriter, _ *http.Request) {
		ok(w, githubCalendar(5,
			`{"contributionDays":[{"date":"2026-08-10","contributionCount":1,"contributionLevel":"FIFTH_QUARTILE"}]}`))
	})

	_, err := f.fetch(context.Background())
	if !errors.Is(err, errUnknownLevel) {
		t.Fatalf("err = %v, want errUnknownLevel", err)
	}
	if !strings.Contains(err.Error(), "FIFTH_QUARTILE") {
		t.Errorf("the error does not name the value: %v", err)
	}
}

func TestAMalformedDayIsRefused(t *testing.T) {
	for _, day := range []string{
		`{"date":"the tenth","contributionCount":1,"contributionLevel":"NONE"}`,
		`{"date":"2026-08-10","contributionCount":-4,"contributionLevel":"NONE"}`,
	} {
		f := serving(t, func(w http.ResponseWriter, _ *http.Request) {
			ok(w, githubCalendar(1, `{"contributionDays":[`+day+`]}`))
		})

		if _, err := f.fetch(context.Background()); !errors.Is(err, errMalformedDay) {
			t.Errorf("day %s: err = %v, want errMalformedDay", day, err)
		}
	}
}

// ----------------------------------------------------------------- the transport

func TestANonTwoHundredIsAFailureThatNamesTheStatus(t *testing.T) {
	for _, status := range []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusBadGateway} {
		f := serving(t, func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(status)
			_, _ = io.WriteString(w, `{"message":"whatever github says here"}`)
		})

		_, err := f.fetch(context.Background())
		if !errors.Is(err, errUpstreamStatus) {
			t.Fatalf("status %d: err = %v, want errUpstreamStatus", status, err)
		}
		// 401 means rotate the token, 502 means wait. The status is the only
		// part of GitHub's answer that is safe and useful to carry.
		if !strings.Contains(err.Error(), itoa(status)) {
			t.Errorf("status %d is not named in %v", status, err)
		}
		if strings.Contains(err.Error(), "whatever github says") {
			t.Errorf("the upstream body reached the error: %v", err)
		}
	}
}

// A body from a host we do not run is bounded. Without the limit this is the one
// place in the process where a remote party chooses how much memory to allocate.
func TestTheResponseBodyIsBounded(t *testing.T) {
	f := serving(t, func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// Valid JSON for as long as it lasts, then truncated by the reader —
		// which is what makes this a parse failure rather than a hang.
		_, _ = io.WriteString(w, `{"data":{"user":{"contributionsCollection":{"contributionCalendar":{"weeks":[`)
		chunk := strings.Repeat(oneWeek+",", 64)
		for written := 0; written < maxResponseBytes*2; written += len(chunk) {
			if _, err := io.WriteString(w, chunk); err != nil {
				return
			}
		}
	})

	if _, err := f.fetch(context.Background()); err == nil {
		t.Error("an oversized body was accepted")
	}
}

func TestACancelledContextEndsTheAttempt(t *testing.T) {
	release := make(chan struct{})
	f := serving(t, func(w http.ResponseWriter, _ *http.Request) {
		<-release
		ok(w, githubCalendar(1, oneWeek))
	})
	t.Cleanup(func() { close(release) })

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := f.fetch(ctx); !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v, want context.Canceled", err)
	}
}
