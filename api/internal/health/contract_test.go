package health

import (
	"net/http"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// The contract test for the one endpoint this phase serves.
//
// The tests next door check that the handler behaves; this one checks that it
// behaves the way the served document says — and it reads the expectation out
// of that document rather than restating it. ADR 0009 puts the cache directives
// in the contract so that a handler cannot invent one; a test that hard-coded
// the value would be a second copy and the exact thing that rule prevents.

type specDoc struct {
	Paths map[string]struct {
		Get *struct {
			Responses map[string]struct {
				Headers map[string]struct {
					Ref string `yaml:"$ref"`
				} `yaml:"headers"`
				Content map[string]struct{} `yaml:"content"`
			} `yaml:"responses"`
		} `yaml:"get"`
	} `yaml:"paths"`

	Components struct {
		Headers map[string]struct {
			Schema struct {
				Const string `yaml:"const"`
			} `yaml:"schema"`
		} `yaml:"headers"`
	} `yaml:"components"`
}

const path = "/api/health"

func loadSpec(t *testing.T) specDoc {
	t.Helper()
	var doc specDoc
	if err := yaml.Unmarshal(httpx.Spec(), &doc); err != nil {
		t.Fatalf("the served document does not parse: %v", err)
	}
	return doc
}

func operation(t *testing.T, doc specDoc) map[string]struct {
	Headers map[string]struct {
		Ref string `yaml:"$ref"`
	} `yaml:"headers"`
	Content map[string]struct{} `yaml:"content"`
} {
	t.Helper()
	item, ok := doc.Paths[path]
	if !ok || item.Get == nil {
		t.Fatalf("the served contract describes no GET %s", path)
	}
	return item.Get.Responses
}

// The value the handler sends must be the value the contract declares, resolved
// through the one level of $ref the bundle keeps.
func TestTheCacheDirectiveIsTheContractsOwn(t *testing.T) {
	doc := loadSpec(t)
	responses := operation(t, doc)

	ref := responses["200"].Headers["Cache-Control"].Ref
	name := ref[strings.LastIndex(ref, "/")+1:]

	declared := doc.Components.Headers[name].Schema.Const
	if declared == "" {
		t.Fatalf("the contract declares no constant Cache-Control for %s (ref %q)", path, ref)
	}
	if declared != cacheControl {
		t.Errorf("the handler sends %q, the contract declares %q", cacheControl, declared)
	}
}

func TestTheDeclaredMediaTypeIsWhatIsSent(t *testing.T) {
	responses := operation(t, loadSpec(t))

	var declared string
	for mediaType := range responses["200"].Content {
		declared = mediaType
	}
	if declared == "" {
		t.Fatalf("the contract declares no content for a 200 on %s", path)
	}

	got := get(t, newHandler(t, dayOne()), "").Header().Get("Content-Type")
	if !strings.HasPrefix(got, declared) {
		t.Errorf("Content-Type = %q, contract declares %q", got, declared)
	}
}

// Each declared response has to be reachable. A status in the document that the
// handler can never produce is a promise to a client that will never be kept.
func TestEveryDeclaredResponseIsReachable(t *testing.T) {
	responses := operation(t, loadSpec(t))

	for _, want := range []string{"200", "304", "429", "500"} {
		if _, ok := responses[want]; !ok {
			t.Errorf("the contract no longer declares %s for %s", want, path)
		}
	}

	// 200 and 304 come from this handler; 500 from its error path. The 429 is
	// written by the rate limiter, so it is asserted against the assembled
	// router in the server package instead.
	if rec := get(t, newHandler(t, dayOne()), ""); rec.Code != http.StatusOK {
		t.Errorf("200 is unreachable: got %d", rec.Code)
	}

	h := newHandler(t, dayOne())
	if rec := get(t, h, get(t, h, "").Header().Get("ETag")); rec.Code != http.StatusNotModified {
		t.Errorf("304 is unreachable: got %d", rec.Code)
	}

	broken := dayOne()
	broken.countsErr = errUnreachable
	rec := get(t, newHandler(t, broken), "")
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("500 is unreachable: got %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("the 500 is %q, the contract declares application/problem+json", got)
	}
}

// The ETag is declared on the 200, so it has to be there.
func TestTheContractsETagIsSent(t *testing.T) {
	responses := operation(t, loadSpec(t))

	if _, declared := responses["200"].Headers["ETag"]; !declared {
		t.Fatalf("the contract declares no ETag for %s", path)
	}
	if got := get(t, newHandler(t, dayOne()), "").Header().Get("ETag"); got == "" {
		t.Error("no ETag on the response")
	}
}
