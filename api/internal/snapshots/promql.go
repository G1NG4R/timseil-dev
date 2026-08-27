package snapshots

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/G1NG4R/timseil-dev/api/internal/buildinfo"
)

// The two recording rules this package reads, by name.
//
// THESE TWO STRINGS ARE HALF OF A CONTRACT. The other half is
// ops/prometheus/rules/slis.yml, which defines them, and ADR 0040 4 made the
// names binding rather than incidental: rename one there and this file asks for
// a series that does not exist, the query comes back empty, and the page
// quietly returns to "- NO DATA" with nothing failing anywhere.
// tools/check-rule-names.sh is what turns that from a comment into a check.
//
// Why the `site` pair and not the per-service three: contract/openapi.yaml has
// room for one p95Ms and one errorRate, Traefik has two services, and the
// weighting that turns two into one belongs where the requests are counted
// rather than here. ADR 0041 2.
const (
	rulePercentile = "timseil:site:request_duration_seconds:p95_5m"
	ruleErrorRatio = "timseil:site:requests:error_ratio_5m"
)

// promBase is where the numbers come from, and it is not configurable.
//
// The rule this repository already carries: a URL that can be set from the
// environment is one edit away from a URL that can be set from a request
// (internal/config, internal/contributions, internal/uptime all say it). It is
// a var rather than a const only so the tests here can point it at an
// httptest.Server -- unexported, and read from nowhere else.
//
// THE ALIAS AND NOT THE SERVICE NAME, and that is the whole reason this line
// has a comment. The api container sits on two networks, dokploy-network and
// the compose default one, and Docker resolves a name that exists on several of
// a reader's networks from the network whose name sorts FIRST -- measured
// 2026-08-23 and written up at compose.yaml's prometheus service. dokploy-network
// is shared with every other app on this host and sorts ahead of the default.
// So if any neighbour ever publishes a container called `prometheus` there,
// `http://prometheus:9090` would answer from THEIR server, and this loop would
// write a stranger's latency into a page that says it measured itself. Green,
// plausible, and about the wrong system -- the same failure ADR 0039 2 caught
// for the Grafana datasource, mirrored. compose.yaml gives our Prometheus the
// alias `timseil-prometheus` on the default network for this reader alone.
var promBase = "http://timseil-prometheus:9090"

// errUpstreamStatus is anything but a 200 from Prometheus.
var errUpstreamStatus = errors.New("prometheus answered with an unexpected status")

// errUpstreamRefused is a well-formed answer that says the query failed.
var errUpstreamRefused = errors.New("prometheus refused the query")

// sample is one series out of one instant query: which rule it belongs to, what
// it read, and when Prometheus evaluated it.
type sample struct {
	name  string
	value float64
	at    time.Time
}

// fetcher performs the query. It holds no state beyond its client.
type fetcher struct {
	client *http.Client
	agent  string
}

func newFetcher() *fetcher {
	build := buildinfo.Read()

	return &fetcher{
		// Never http.DefaultClient: it has no timeout at all and it belongs to
		// the whole process, so a transport setting made here would reach every
		// other caller in the binary.
		client: &http.Client{
			Timeout: attemptTimeout,
			Transport: &http.Transport{
				DialContext:           (&net.Dialer{Timeout: time.Second}).DialContext,
				ResponseHeaderTimeout: time.Second,
				// One host, one connection, kept warm between five-minute runs.
				MaxIdleConns:        2,
				MaxIdleConnsPerHost: 2,
				IdleConnTimeout:     90 * time.Second,
				ForceAttemptHTTP2:   true,
			},
		},
		// Not required by Prometheus, unlike GitHub. It is here so that a line
		// in somebody else's access log says which build asked.
		agent: "timseil.dev/" + build.Version + " (+https://timseil.dev)",
	}
}

// selector is the instant query, and it names both rules in one request.
//
// One request rather than two, and that is not about saving a round trip to a
// neighbouring container. An instant query evaluates at ONE moment and stamps
// every series in the answer with it, so both numbers in a snapshot describe
// the same instant by construction. Two queries would return two timestamps a
// few milliseconds apart, and then measured_at would be one of them and a small
// lie about the other -- on a row whose whole purpose is to carry the age of
// what it holds.
//
// No filter on `stack="timseil"`. external_labels are attached to data that
// LEAVES the server -- federation, remote_write, alerts -- and are invisible to
// a local query; a filter on it would match nothing and read as an outage.
// docs/runbooks/observability.md had this backwards until F5 measured it.
func selector() string {
	return `{__name__=~"` + rulePercentile + `|` + ruleErrorRatio + `"}`
}

// fetch performs one attempt and returns whatever series existed.
//
// An empty slice is a legitimate answer and not an error: it means the rules
// evaluated to nothing, which is what "no requests in the last five minutes"
// looks like. Telling that apart from a failure is the caller's job and the
// difference matters -- one writes no row, the other writes no row and logs a
// problem.
func (f *fetcher) fetch(ctx context.Context) ([]sample, error) {
	endpoint := promBase + "/api/v1/query?" + url.Values{"query": {selector()}}.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", f.agent)

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() {
		// Drained before closing so the connection can be reused, and drained
		// through the same limit as the read below.
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxResponseBytes))
		_ = resp.Body.Close()
	}()

	// Prometheus answers 400 for a malformed query and 422 for one it cannot
	// execute, both with a JSON body. The status is enough to act on and the
	// body is not ours to put anywhere a visitor might see.
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: %s", errUpstreamStatus, strconv.Itoa(resp.StatusCode))
	}

	raw, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, err
	}

	var answer promAnswer
	if err := json.Unmarshal(raw, &answer); err != nil {
		return nil, err
	}

	if answer.Status != "success" {
		// errorType and not error: the first is a short enumerated word, the
		// second can carry the query back at us.
		return nil, fmt.Errorf("%w: %s", errUpstreamRefused, answer.ErrorType)
	}
	if answer.Data.ResultType != "vector" {
		return nil, fmt.Errorf("%w: resultType %s", errUpstreamRefused, answer.Data.ResultType)
	}

	return decode(answer)
}

// promAnswer is the shape of /api/v1/query.
//
// `value` is [<float unix seconds>, "<string>"] -- two JSON types in one array,
// which is why it is decoded element by element rather than into a struct.
type promAnswer struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Metric map[string]string `json:"metric"`
			Value  []json.RawMessage `json:"value"`
		} `json:"result"`
	} `json:"data"`
	ErrorType string `json:"errorType"`
}

// decode turns the answer into samples, and refuses anything it cannot read.
//
// A malformed element is an error rather than a skipped entry. The alternative
// -- carry on with what parsed -- would turn a broken upstream into a partial
// snapshot that looks like a quiet five minutes, and the two have to stay
// distinguishable (invariant 1).
func decode(answer promAnswer) ([]sample, error) {
	samples := make([]sample, 0, len(answer.Data.Result))
	seen := make(map[string]bool, 2)

	for _, series := range answer.Data.Result {
		name := series.Metric["__name__"]
		if name != rulePercentile && name != ruleErrorRatio {
			// The selector asked for two names. A third means somebody changed
			// the query without changing this switch, and guessing which field
			// it belongs to is the one thing worse than failing.
			return nil, fmt.Errorf("%w: unexpected series %q", errUpstreamRefused, name)
		}

		// A SECOND SERIES UNDER ONE NAME IS THE SAME AMBIGUITY, and refusing the
		// unknown name while accepting the duplicate would be an odd place to
		// stop. Both site rules aggregate every label away, so each can produce
		// at most one series and this cannot fire today; the day a `by` clause
		// is added to one of them it fires instead of silently letting the last
		// series win. Last-writer-wins is the failure that matters here: if the
		// second copy were NaN, a genuinely measured value would become null,
		// which is invariant 1 inverted and would not log a thing.
		if seen[name] {
			return nil, fmt.Errorf("%w: %s returned more than one series", errUpstreamRefused, name)
		}
		seen[name] = true

		if len(series.Value) != 2 {
			return nil, fmt.Errorf("%w: %s has %d value elements", errUpstreamRefused, name, len(series.Value))
		}

		var seconds float64
		if err := json.Unmarshal(series.Value[0], &seconds); err != nil {
			return nil, fmt.Errorf("%w: %s carries no timestamp", errUpstreamRefused, name)
		}

		// The value is a STRING in this API, and that is how NaN and +Inf reach
		// us at all -- JSON has no spelling for either. ParseFloat reads both,
		// and keeping them as float64 rather than rejecting them here is
		// deliberate: "NaN" means "nobody measured", which is an answer this
		// package has to be able to receive.
		var text string
		if err := json.Unmarshal(series.Value[1], &text); err != nil {
			return nil, fmt.Errorf("%w: %s carries no value", errUpstreamRefused, name)
		}
		value, err := strconv.ParseFloat(text, 64)
		if err != nil {
			return nil, fmt.Errorf("%w: %s value %q", errUpstreamRefused, name, text)
		}

		samples = append(samples, sample{
			name: name,
			// Rounded to the millisecond, which is the resolution Prometheus
			// evaluates at. measured_at is half of a unique key, so it has to
			// be reproducible rather than merely close.
			at:    time.UnixMilli(int64(math.Round(seconds * 1000))).UTC(),
			value: value,
		})
	}

	return samples, nil
}
