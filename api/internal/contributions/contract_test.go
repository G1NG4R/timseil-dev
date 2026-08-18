package contributions

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"gopkg.in/yaml.v3"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// The contract test for this phase's endpoint.
//
// The tests next door check that the handler behaves; this one checks that it
// behaves the way the served document says — and it reads the expectation out of
// that document rather than restating it. ADR 0009 puts the cache directive in
// the contract so a handler cannot invent one, and a test that hard-coded the
// value would be a second copy and the exact thing that rule prevents.
//
// It carries one assertion the other endpoints' contract tests do not need: the
// five contribution steps. The stored calendar is jsonb with no CHECK on its
// contents (00008_contributions.sql says why), so the coupling between GitHub's
// quartile names and `components/schemas/ContributionLevel` lives here, where it
// can read the enum instead of repeating it.

type response struct {
	Headers map[string]struct {
		Ref string `yaml:"$ref"`
	} `yaml:"headers"`
	Content map[string]struct{} `yaml:"content"`
	Ref     string              `yaml:"$ref"`
}

type specDoc struct {
	Paths map[string]struct {
		Get *struct {
			Responses map[string]response `yaml:"responses"`
		} `yaml:"get"`
	} `yaml:"paths"`

	Components struct {
		Headers map[string]struct {
			Schema struct {
				Const string `yaml:"const"`
			} `yaml:"schema"`
		} `yaml:"headers"`

		Schemas map[string]struct {
			Required []string `yaml:"required"`
			Enum     []string `yaml:"enum"`
		} `yaml:"schemas"`
	} `yaml:"components"`
}

const contributionsPath = "/api/contributions"

func loadSpec(t *testing.T) specDoc {
	t.Helper()

	var doc specDoc
	if err := yaml.Unmarshal(httpx.Spec(), &doc); err != nil {
		t.Fatalf("the served document does not parse: %v", err)
	}
	return doc
}

func operation(t *testing.T, doc specDoc) map[string]response {
	t.Helper()

	item, ok := doc.Paths[contributionsPath]
	if !ok || item.Get == nil {
		t.Fatalf("the served contract describes no GET %s", contributionsPath)
	}
	return item.Get.Responses
}

func refName(ref string) string { return ref[strings.LastIndex(ref, "/")+1:] }

func TestTheCacheDirectiveIsTheContractsOwn(t *testing.T) {
	doc := loadSpec(t)

	ref := operation(t, doc)["200"].Headers["Cache-Control"].Ref
	if ref == "" {
		t.Fatalf("the contract declares no Cache-Control on the 200 of %s", contributionsPath)
	}

	declared := doc.Components.Headers[refName(ref)].Schema.Const
	if declared == "" {
		t.Fatalf("the contract declares no constant Cache-Control for %s (ref %q)", contributionsPath, ref)
	}
	if declared != cacheControl {
		t.Errorf("the handler sends %q, the contract declares %q", cacheControl, declared)
	}
	if got := get(t, newHandler(t, cached(time.Hour)), "").Header().Get("Cache-Control"); got != declared {
		t.Errorf("the response carries %q", got)
	}

	// The hour in the header and the hour in the refresher are the same hour.
	// They are two constants in two packages, and nothing but this line holds
	// them together: a calendar refreshed every six hours behind an
	// `s-maxage=3600` would promise a freshness it does not have.
	if !strings.Contains(declared, "s-maxage="+itoa(int(staleAfter.Seconds()))) {
		t.Errorf("the contract promises %q, the refresher refetches after %s", declared, staleAfter)
	}
}

func TestTheDeclaredMediaTypeIsWhatIsSent(t *testing.T) {
	var declared string
	for mediaType := range operation(t, loadSpec(t))["200"].Content {
		declared = mediaType
	}
	if declared == "" {
		t.Fatalf("the contract declares no content for a 200 on %s", contributionsPath)
	}

	sent := get(t, newHandler(t, cached(time.Hour)), "").Header().Get("Content-Type")
	if !strings.HasPrefix(sent, declared) {
		t.Errorf("Content-Type = %q, contract declares %q", sent, declared)
	}
}

func TestTheContractsETagIsSent(t *testing.T) {
	if _, declared := operation(t, loadSpec(t))["200"].Headers["ETag"]; !declared {
		t.Fatalf("the contract declares no ETag for %s", contributionsPath)
	}
	if got := get(t, newHandler(t, cached(time.Hour)), "").Header().Get("ETag"); got == "" {
		t.Error("no ETag")
	}
}

// Each declared response has to be reachable, and nothing else may be produced.
// A status in the document the handler can never produce is a promise to a
// client that will never be kept.
func TestEveryDeclaredResponseIsReachable(t *testing.T) {
	got := operation(t, loadSpec(t))

	for _, want := range []string{"200", "304", "429", "502", "500"} {
		if _, ok := got[want]; !ok {
			t.Errorf("the contract no longer declares %s for %s", want, contributionsPath)
		}
	}

	// This path takes no parameter that can be wrong and names no resource that
	// can be missing.
	for _, unwanted := range []string{"400", "404"} {
		if _, declared := got[unwanted]; declared {
			t.Errorf("%s declares a %s", contributionsPath, unwanted)
		}
	}

	h := newHandler(t, cached(time.Hour))
	if rec := get(t, h, ""); rec.Code != http.StatusOK {
		t.Errorf("200 is unreachable: got %d", rec.Code)
	}
	if rec := get(t, h, get(t, h, "").Header().Get("ETag")); rec.Code != http.StatusNotModified {
		t.Errorf("304 is unreachable: got %d", rec.Code)
	}

	// The 502 is the cold start and nothing else — this is the one endpoint on
	// the site that declares one, and it is reachable only before GitHub has
	// ever answered.
	if rec := get(t, newHandler(t, &stubQueries{err: pgx.ErrNoRows}), ""); rec.Code != http.StatusBadGateway {
		t.Errorf("502 is unreachable: got %d", rec.Code)
	}

	// The 429 belongs to the rate limiter, so it is asserted against the
	// assembled router in the server package rather than here.
	rec := get(t, newHandler(t, &stubQueries{err: errUnreachable}), "")
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("500 is unreachable: got %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("the 500 is %q, the contract declares application/problem+json", got)
	}
}

// Every field the contract requires is in the answer, including the two that are
// easy to leave out because they are about the answer rather than in it —
// `fetchedAt` and `cacheAgeSec`. Those two are the endpoint's honesty: without
// them an old calendar is indistinguishable from a fresh one.
func TestTheRequiredFieldsArePresent(t *testing.T) {
	required := loadSpec(t).Components.Schemas["Contributions"].Required
	if len(required) == 0 {
		t.Fatal("the served contract lists no required fields for Contributions")
	}

	var body map[string]json.RawMessage
	rec := get(t, newHandler(t, cached(3*time.Hour)), "")
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("the response is not JSON: %v", err)
	}

	for _, field := range required {
		raw, ok := body[field]
		if !ok {
			t.Errorf("the contract requires %q and the answer omits it", field)
			continue
		}
		if string(raw) == "null" {
			t.Errorf("%q is null, and the contract requires a value", field)
		}
	}
}

// The five steps are the contract's, and the map in github.go is the only place
// GitHub's names are translated. Held against the served enum rather than
// against a copy of it, because the stored jsonb carries no CHECK — this is the
// coupling the migration deliberately left to Go.
func TestTheStepsAreTheContractsEnum(t *testing.T) {
	declared := loadSpec(t).Components.Schemas["ContributionLevel"].Enum
	if len(declared) == 0 {
		t.Fatal("the served contract lists no ContributionLevel enum")
	}

	produced := map[string]bool{}
	for _, step := range levels {
		produced[string(step)] = true
	}

	if len(produced) != len(declared) {
		t.Errorf("the translation produces %d distinct steps, the contract declares %d",
			len(produced), len(declared))
	}
	for _, step := range declared {
		if !produced[step] {
			t.Errorf("the contract declares %q and nothing produces it", step)
		}
	}

	// And the other way round: nothing may be produced that the contract has no
	// name for. A sixth step would be a value no generated client can hold.
	allowed := map[string]bool{}
	for _, step := range declared {
		allowed[step] = true
	}
	for name, step := range levels {
		if !allowed[string(step)] {
			t.Errorf("%s maps to %q, which the contract does not declare", name, step)
		}
	}
}
