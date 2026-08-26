package snapshots

import (
	"context"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

// serveJSON stands in for Prometheus and hands back the answer it is given.
// promBase is a package var for exactly this, and for nothing else.
func serveJSON(t *testing.T, status int, body string) (*fetcher, *[]string) {
	t.Helper()

	queries := new([]string)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*queries = append(*queries, r.URL.Query().Get("query"))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)

	previous := promBase
	promBase = server.URL
	t.Cleanup(func() { promBase = previous })

	return newFetcher(), queries
}

// vector is one /api/v1/query answer, spelled the way Prometheus spells it:
// the value is a two-element array of a float timestamp and a STRING.
func vector(series ...string) string {
	return `{"status":"success","data":{"resultType":"vector","result":[` +
		strings.Join(series, ",") + `]}}`
}

// ----------------------------------------------------------------- the query

// The two names are the contract with slis.yml. If this test has to be edited,
// ops/prometheus/rules/slis.yml has to be edited in the same commit, and
// tools/check-rule-names.sh is what makes that true rather than remembered.
func TestTheSelectorNamesBothRulesAndNothingElse(t *testing.T) {
	got := selector()

	for _, name := range []string{rulePercentile, ruleErrorRatio} {
		if !strings.Contains(got, name) {
			t.Errorf("the selector does not ask for %s: %s", name, got)
		}
	}
	// A filter on stack="timseil" would match nothing: external_labels are
	// attached to data that LEAVES the server and are invisible to a local
	// query. The runbook had this backwards until F5 measured it.
	if strings.Contains(got, "stack") {
		t.Errorf("the selector filters on an external label: %s", got)
	}
}

// One request and not two, so that both numbers describe one instant by
// construction rather than by luck.
func TestOneRunAsksOnce(t *testing.T) {
	f, queries := serveJSON(t, http.StatusOK, vector())

	if _, err := f.fetch(context.Background()); err != nil {
		t.Fatal(err)
	}

	if len(*queries) != 1 {
		t.Fatalf("one run made %d requests", len(*queries))
	}
	if (*queries)[0] != selector() {
		t.Errorf("asked %q", (*queries)[0])
	}
}

// The query has to survive URL encoding intact — it is full of colons, braces
// and a pipe.
func TestTheSelectorSurvivesEncoding(t *testing.T) {
	encoded := url.Values{"query": {selector()}}.Encode()

	decoded, err := url.ParseQuery(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if decoded.Get("query") != selector() {
		t.Errorf("round trip changed the query to %q", decoded.Get("query"))
	}
}

// ---------------------------------------------------------------- the answer

func TestAVectorIsDecoded(t *testing.T) {
	f, _ := serveJSON(t, http.StatusOK, vector(
		`{"metric":{"__name__":"`+rulePercentile+`"},"value":[1756238175.123,"0.0746"]}`,
		`{"metric":{"__name__":"`+ruleErrorRatio+`"},"value":[1756238175.123,"0"]}`,
	))

	samples, err := f.fetch(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(samples) != 2 {
		t.Fatalf("decoded %d samples, want 2", len(samples))
	}

	want := time.UnixMilli(1756238175123).UTC()
	for _, s := range samples {
		if !s.at.Equal(want) {
			t.Errorf("%s carries instant %v, want %v", s.name, s.at, want)
		}
	}
	if samples[0].value != 0.0746 {
		t.Errorf("p95 = %v", samples[0].value)
	}
	// A measured zero arrives as a zero and not as an absence.
	if samples[1].value != 0 {
		t.Errorf("ratio = %v, want 0", samples[1].value)
	}
}

// An empty vector is an ANSWER, not a failure: the rules evaluated to nothing,
// which is what no traffic in five minutes looks like. The caller writes no row
// either way, but only one of the two is worth a WARN.
func TestAnEmptyVectorIsNotAnError(t *testing.T) {
	f, _ := serveJSON(t, http.StatusOK, vector())

	samples, err := f.fetch(context.Background())
	if err != nil {
		t.Fatalf("an empty vector was reported as a failure: %v", err)
	}
	if len(samples) != 0 {
		t.Errorf("decoded %d samples out of nothing", len(samples))
	}
}

// JSON has no spelling for NaN, so Prometheus sends it as a string — which is
// the whole reason `value[1]` is one. Losing this would turn "nobody measured"
// into a parse error and then into a WARN every quiet night.
func TestNaNArrivesAsNaN(t *testing.T) {
	f, _ := serveJSON(t, http.StatusOK, vector(
		`{"metric":{"__name__":"`+rulePercentile+`"},"value":[1756238175.123,"NaN"]}`,
	))

	samples, err := f.fetch(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(samples) != 1 || !math.IsNaN(samples[0].value) {
		t.Errorf("decoded %+v, want one NaN", samples)
	}
}

// ------------------------------------------------------------- the broken case

func TestANonTwoHundredIsAnError(t *testing.T) {
	f, _ := serveJSON(t, http.StatusUnprocessableEntity,
		`{"status":"error","errorType":"execution","error":"whatever"}`)

	_, err := f.fetch(context.Background())
	if !errors.Is(err, errUpstreamStatus) {
		t.Fatalf("err = %v, want an upstream status", err)
	}
	// The status is enough to act on. Prometheus's error text can carry the
	// query back at us and is not ours to put anywhere a visitor might see.
	if strings.Contains(err.Error(), "whatever") {
		t.Errorf("the upstream body was quoted back: %v", err)
	}
}

// A 200 whose body says the query failed. Trusting the status alone would store
// an empty answer as "nothing measured", which is a different fact.
func TestATwoHundredThatSaysErrorIsAnError(t *testing.T) {
	f, _ := serveJSON(t, http.StatusOK, `{"status":"error","errorType":"bad_data"}`)

	_, err := f.fetch(context.Background())
	if !errors.Is(err, errUpstreamRefused) {
		t.Fatalf("err = %v, want a refusal", err)
	}
}

// A matrix instead of a vector means somebody changed the endpoint or the
// query. Reading value[0] of a matrix would produce a number-shaped thing that
// is not the number.
func TestAResultTypeThatIsNotAVectorIsRefused(t *testing.T) {
	f, _ := serveJSON(t, http.StatusOK, `{"status":"success","data":{"resultType":"matrix","result":[]}}`)

	if _, err := f.fetch(context.Background()); !errors.Is(err, errUpstreamRefused) {
		t.Fatalf("err = %v, want a refusal", err)
	}
}

// The selector asks for two names. A third means the query and the switch in
// decode have drifted apart, and guessing which field it belongs to is the one
// thing worse than failing.
func TestAnUnexpectedSeriesIsRefused(t *testing.T) {
	f, _ := serveJSON(t, http.StatusOK, vector(
		`{"metric":{"__name__":"timseil:site:something_else"},"value":[1756238175.123,"1"]}`,
	))

	if _, err := f.fetch(context.Background()); !errors.Is(err, errUpstreamRefused) {
		t.Fatalf("err = %v, want a refusal", err)
	}
}

// A malformed element fails the whole answer rather than being skipped. Carrying
// on with what parsed would turn a broken upstream into a partial snapshot that
// looks exactly like a quiet five minutes.
func TestAMalformedSampleFailsTheWholeAnswer(t *testing.T) {
	f, _ := serveJSON(t, http.StatusOK, vector(
		`{"metric":{"__name__":"`+rulePercentile+`"},"value":[1756238175.123,"0.05"]}`,
		`{"metric":{"__name__":"`+ruleErrorRatio+`"},"value":[1756238175.123,"not a number"]}`,
	))

	if _, err := f.fetch(context.Background()); !errors.Is(err, errUpstreamRefused) {
		t.Fatalf("err = %v, want a refusal", err)
	}
}

// The bound on what a host we do not run can make this process allocate. It is
// a container on our own machine today, and it is still the cheapest line in
// the file.
func TestTheResponseBodyIsBounded(t *testing.T) {
	huge := `{"status":"success","data":{"resultType":"vector","result":[` +
		strings.Repeat(`{"metric":{"__name__":"x"},"value":[0,"0"]},`, 40_000) + `]}}`
	f, _ := serveJSON(t, http.StatusOK, huge)

	// Truncated at maxResponseBytes, so it stops being valid JSON. What matters
	// is that it fails rather than being read in full.
	if _, err := f.fetch(context.Background()); err == nil {
		t.Fatal("an oversized answer was accepted")
	}
}

// A cancelled context ends the attempt. The shutdown path depends on it.
func TestACancelledContextEndsTheAttempt(t *testing.T) {
	f, _ := serveJSON(t, http.StatusOK, vector())

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := f.fetch(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
}
