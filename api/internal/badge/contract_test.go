package badge

import (
	"net/http"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// The contract test for the three badges.
//
// The tests next door check that the handlers behave; this one checks that they
// behave the way the served document says — and it reads the expectation out of
// that document rather than restating it. The badges are the one part of this
// API a stranger reaches without knowing it is an API, through an image on the
// README, so the shape they promise matters twice.

type specDoc struct {
	Paths map[string]struct {
		Get *struct {
			Responses map[string]struct {
				Headers map[string]struct {
					Ref string `yaml:"$ref"`
				} `yaml:"headers"`
				Content map[string]struct{} `yaml:"content"`
				Ref     string              `yaml:"$ref"`
			} `yaml:"responses"`
		} `yaml:"get"`
	} `yaml:"paths"`

	Components struct {
		Headers map[string]struct {
			Schema struct {
				Const string `yaml:"const"`
			} `yaml:"schema"`
		} `yaml:"headers"`

		Responses map[string]struct {
			Headers map[string]struct {
				Ref string `yaml:"$ref"`
			} `yaml:"headers"`
			Content map[string]struct {
				Schema struct {
					Ref string `yaml:"$ref"`
				} `yaml:"schema"`
			} `yaml:"content"`
		} `yaml:"responses"`

		Schemas map[string]struct {
			Required []string `yaml:"required"`
		} `yaml:"schemas"`
	} `yaml:"components"`
}

// The three paths as the contract spells them. get() next door knows which
// handler each one belongs to, so a path that moves in the contract fails in
// both files rather than in a reader's browser.
var paths = []string{
	"/api/badge/uptime",
	"/api/badge/version",
	"/api/badge/systems",
}

func loadSpec(t *testing.T) specDoc {
	t.Helper()
	var doc specDoc
	if err := yaml.Unmarshal(httpx.Spec(), &doc); err != nil {
		t.Fatalf("the served document does not parse: %v", err)
	}
	return doc
}

func refName(ref string) string {
	return ref[strings.LastIndex(ref, "/")+1:]
}

// The value the handlers send must be the value the contract declares, resolved
// through the two levels of $ref the bundle keeps: the operation points at
// components/responses/BadgeOK, which points at components/headers.
func TestTheCacheDirectiveIsTheContractsOwn(t *testing.T) {
	doc := loadSpec(t)

	for _, path := range paths {
		item, ok := doc.Paths[path]
		if !ok || item.Get == nil {
			t.Fatalf("the served contract describes no GET %s", path)
		}

		response := doc.Components.Responses[refName(item.Get.Responses["200"].Ref)]
		declared := doc.Components.Headers[refName(response.Headers["Cache-Control"].Ref)].Schema.Const

		if declared == "" {
			t.Fatalf("the contract declares no constant Cache-Control for %s", path)
		}
		if declared != cacheControl {
			t.Errorf("%s: the handler sends %q, the contract declares %q",
				path, cacheControl, declared)
		}
	}
}

// Every field the contract calls required has to be in the answer. Shields
// silently renders a badge with a missing label as an empty grey box, so this
// is a failure that looks like a styling problem.
func TestTheRequiredBadgeFieldsAreAllSent(t *testing.T) {
	doc := loadSpec(t)

	required := doc.Components.Schemas["Badge"].Required
	if len(required) == 0 {
		t.Fatal("the contract declares no required fields for Badge")
	}

	for _, path := range paths {
		answer := decode(t, get(t, newHandler(t, dayOne()), path))
		for _, field := range required {
			if _, ok := answer[field]; !ok {
				t.Errorf("%s: the contract requires %q and the answer has no such key", path, field)
			}
		}
	}
}

// Each declared response has to be reachable. A status in the document that the
// handler can never produce is a promise to a client that will never be kept —
// and the 500 was added to this contract in C7 precisely because the handler
// could produce one the document did not declare.
func TestEveryDeclaredResponseIsReachable(t *testing.T) {
	doc := loadSpec(t)

	for _, path := range paths {
		declared := doc.Paths[path].Get.Responses
		for _, want := range []string{"200", "429", "500"} {
			if _, ok := declared[want]; !ok {
				t.Errorf("the contract no longer declares %s for %s", want, path)
			}
		}
		if len(declared) != 3 {
			t.Errorf("%s declares %d responses; this test knows about 3", path, len(declared))
		}
	}

	// 200 from every handler.
	for _, path := range paths {
		rec := get(t, newHandler(t, dayOne()), path)
		if rec.Code != http.StatusOK {
			t.Errorf("%s: 200 is unreachable, got %d", path, rec.Code)
		}
	}

	// 500 from the two that read the database. The version badge cannot reach
	// it — it has no database in its path at all — and that is why the test
	// names the two rather than looping over three.
	for path, q := range map[string]stubQueries{
		"/api/badge/uptime":  {metricsErr: errUnreachable},
		"/api/badge/systems": {countsErr: errUnreachable},
	} {
		if rec := get(t, newHandler(t, q), path); rec.Code != http.StatusInternalServerError {
			t.Errorf("%s: 500 is unreachable, got %d", path, rec.Code)
		}
	}

	// The 429 is written by the rate limiter, so it is asserted against the
	// assembled router in the server package instead.
}

// The version badge declares a 500 it can never produce. That is not a bug in
// the handler — the three badges share one response set and splitting the
// contract three ways to spare one status would be worse — but it should be a
// decision somebody made rather than one nobody noticed.
func TestTheVersionBadgeNeverNeedsItsFiveHundred(t *testing.T) {
	h := newHandler(t, stubQueries{countsErr: errUnreachable, metricsErr: errUnreachable})

	if rec := get(t, h, "/api/badge/version"); rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200: the version badge must not depend on the database", rec.Code)
	}
}
