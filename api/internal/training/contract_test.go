package training

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// The contract test for the one endpoint this phase serves.
//
// The tests next door check that the handler behaves; this one checks that it
// behaves the way the served document says — and it reads the expectation out of
// that document rather than restating it. ADR 0009 puts the cache directive in
// the contract so that a handler cannot invent one; a test that hard-coded the
// value would be a second copy and the exact thing that rule prevents.

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
			Parameters []struct {
				Ref string `yaml:"$ref"`
			} `yaml:"parameters"`
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
		} `yaml:"schemas"`
	} `yaml:"components"`
}

const trainingPath = "/api/training"

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
	item, ok := doc.Paths[trainingPath]
	if !ok || item.Get == nil {
		t.Fatalf("the served contract describes no GET %s", trainingPath)
	}
	return item.Get.Responses
}

func refName(ref string) string { return ref[strings.LastIndex(ref, "/")+1:] }

// The value the handler sends must be the value the contract declares, resolved
// through the one level of $ref the bundle keeps.
func TestTheCacheDirectiveIsTheContractsOwn(t *testing.T) {
	doc := loadSpec(t)

	ref := operation(t, doc)["200"].Headers["Cache-Control"].Ref
	if ref == "" {
		t.Fatalf("the contract declares no Cache-Control on the 200 of %s", trainingPath)
	}

	declared := doc.Components.Headers[refName(ref)].Schema.Const
	if declared == "" {
		t.Fatalf("the contract declares no constant Cache-Control for %s (ref %q)", trainingPath, ref)
	}
	if declared != cacheControl {
		t.Errorf("the handler sends %q, the contract declares %q", cacheControl, declared)
	}
	if got := get(t, newHandler(t, launchDay()), "").Header().Get("Cache-Control"); got != declared {
		t.Errorf("the response carries %q", got)
	}
}

func TestTheDeclaredMediaTypeIsWhatIsSent(t *testing.T) {
	var declared string
	for mediaType := range operation(t, loadSpec(t))["200"].Content {
		declared = mediaType
	}
	if declared == "" {
		t.Fatalf("the contract declares no content for a 200 on %s", trainingPath)
	}

	sent := get(t, newHandler(t, launchDay()), "").Header().Get("Content-Type")
	if !strings.HasPrefix(sent, declared) {
		t.Errorf("Content-Type = %q, contract declares %q", sent, declared)
	}
}

// The ETag is declared, so it has to be there. Without it the 304 branch is
// unreachable and every poll pays for the full body — on a site with no CDN the
// ETag is the saving that actually reaches the wire (ADR 0009).
func TestTheContractsETagIsSent(t *testing.T) {
	if _, declared := operation(t, loadSpec(t))["200"].Headers["ETag"]; !declared {
		t.Fatalf("the contract declares no ETag for %s", trainingPath)
	}
	if got := get(t, newHandler(t, launchDay()), "").Header().Get("ETag"); got == "" {
		t.Error("no ETag")
	}
}

// Each declared response has to be reachable, and nothing else may be produced.
// A status in the document the handler can never produce is a promise to a
// client that will never be kept; a status the handler produces that the
// document does not declare is the case ADR 0017 had to fix in the contract.
func TestEveryDeclaredResponseIsReachable(t *testing.T) {
	got := operation(t, loadSpec(t))

	for _, want := range []string{"200", "304", "429", "500"} {
		if _, ok := got[want]; !ok {
			t.Errorf("the contract no longer declares %s for %s", want, trainingPath)
		}
	}

	// This path takes no parameter that can be wrong and names no resource that
	// can be missing, so neither status has anything to mean here.
	for _, unwanted := range []string{"400", "404"} {
		if _, declared := got[unwanted]; declared {
			t.Errorf("%s declares a %s", trainingPath, unwanted)
		}
	}

	h := newHandler(t, launchDay())
	if rec := get(t, h, ""); rec.Code != http.StatusOK {
		t.Errorf("200 is unreachable: got %d", rec.Code)
	}
	if rec := get(t, h, get(t, h, "").Header().Get("ETag")); rec.Code != http.StatusNotModified {
		t.Errorf("304 is unreachable: got %d", rec.Code)
	}

	// The 429 belongs to the rate limiter, so it is asserted against the
	// assembled router in the server package rather than here.
	rec := get(t, newHandler(t, &stubQueries{modulesErr: errUnreachable}), "")
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("500 is unreachable: got %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("the 500 is %q, the contract declares application/problem+json", got)
	}
}

// Every field the contract requires is in the answer, and it is there for a
// database with nothing in it as well. `required` is the promise a generated
// client is written against: a missing key is a parse error on the other side,
// and an empty log is exactly when it would happen.
func TestTheRequiredFieldsArePresentOnAnEmptyLog(t *testing.T) {
	required := loadSpec(t).Components.Schemas["Training"].Required
	if len(required) == 0 {
		t.Fatal("the served contract lists no required fields for Training")
	}

	for what, q := range map[string]Queries{
		"the launch-day log": launchDay(),
		"an empty database":  &stubQueries{},
	} {
		var body map[string]json.RawMessage
		rec := get(t, newHandler(t, q), "")
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("%s: the response is not JSON: %v", what, err)
		}

		for _, field := range required {
			raw, ok := body[field]
			if !ok {
				t.Errorf("%s: the contract requires %q and the answer omits it", what, field)
				continue
			}
			if string(raw) == "null" {
				t.Errorf("%s: %q is null, and the contract requires a value", what, field)
			}
		}
	}
}
