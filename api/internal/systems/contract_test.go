package systems

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// The contract test for the two endpoints this phase serves.
//
// The tests next door check that the handlers behave; this one checks that they
// behave the way the served document says — and it reads the expectation out of
// that document rather than restating it. ADR 0009 puts the cache directives in
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

		Parameters map[string]struct {
			Name   string `yaml:"name"`
			Schema struct {
				Enum    []int `yaml:"enum"`
				Default int   `yaml:"default"`
			} `yaml:"schema"`
		} `yaml:"parameters"`
	} `yaml:"components"`
}

const (
	listPath   = "/api/systems"
	detailPath = "/api/systems/{slug}"
)

func loadSpec(t *testing.T) specDoc {
	t.Helper()
	var doc specDoc
	if err := yaml.Unmarshal(httpx.Spec(), &doc); err != nil {
		t.Fatalf("the served document does not parse: %v", err)
	}
	return doc
}

func operation(t *testing.T, doc specDoc, path string) map[string]response {
	t.Helper()
	item, ok := doc.Paths[path]
	if !ok || item.Get == nil {
		t.Fatalf("the served contract describes no GET %s", path)
	}
	return item.Get.Responses
}

func refName(ref string) string { return ref[strings.LastIndex(ref, "/")+1:] }

// ok200 is one successful response from each endpoint, for the assertions that
// compare a header the handler sent against the one the document declares.
func ok200(t *testing.T, path string) *httptest.ResponseRecorder {
	t.Helper()
	if path == listPath {
		return getList(t, newHandler(t, dayOne()), "")
	}
	return getDetail(t, newHandler(t, dayOne()), "timseil-dev", "", "")
}

// The value the handlers send must be the value the contract declares, resolved
// through the one level of $ref the bundle keeps — and both paths have to
// declare the same one, because they share the const in the handler.
func TestTheCacheDirectiveIsTheContractsOwn(t *testing.T) {
	doc := loadSpec(t)

	for _, path := range []string{listPath, detailPath} {
		ref := operation(t, doc, path)["200"].Headers["Cache-Control"].Ref
		if ref == "" {
			t.Fatalf("the contract declares no Cache-Control on the 200 of %s", path)
		}

		declared := doc.Components.Headers[refName(ref)].Schema.Const
		if declared == "" {
			t.Fatalf("the contract declares no constant Cache-Control for %s (ref %q)", path, ref)
		}
		if declared != cacheControl {
			t.Errorf("%s: the handler sends %q, the contract declares %q",
				path, cacheControl, declared)
		}
		if got := ok200(t, path).Header().Get("Cache-Control"); got != declared {
			t.Errorf("%s: the response carries %q", path, got)
		}
	}
}

func TestTheDeclaredMediaTypeIsWhatIsSent(t *testing.T) {
	doc := loadSpec(t)

	for _, path := range []string{listPath, detailPath} {
		var declared string
		for mediaType := range operation(t, doc, path)["200"].Content {
			declared = mediaType
		}
		if declared == "" {
			t.Fatalf("the contract declares no content for a 200 on %s", path)
		}
		if sent := ok200(t, path).Header().Get("Content-Type"); !strings.HasPrefix(sent, declared) {
			t.Errorf("%s: Content-Type = %q, contract declares %q", path, sent, declared)
		}
	}
}

// The ETag is declared on both 200s, so it has to be there. Without it the
// 304 branch is unreachable and every poll pays for the full body — on a site
// with no CDN the ETag is the saving that actually reaches the wire (ADR 0009).
func TestTheContractsETagIsSent(t *testing.T) {
	doc := loadSpec(t)

	for _, path := range []string{listPath, detailPath} {
		if _, declared := operation(t, doc, path)["200"].Headers["ETag"]; !declared {
			t.Fatalf("the contract declares no ETag for %s", path)
		}
		if got := ok200(t, path).Header().Get("ETag"); got == "" {
			t.Errorf("no ETag on %s", path)
		}
	}
}

// Each declared response has to be reachable. A status in the document the
// handler can never produce is a promise to a client that will never be kept —
// and the reverse, a status the handler produces that the document does not
// declare, is what the 400 was added to the contract for in this phase.
func TestEveryDeclaredResponseIsReachableOnTheList(t *testing.T) {
	got := operation(t, loadSpec(t), listPath)

	for _, want := range []string{"200", "304", "429", "500"} {
		if _, ok := got[want]; !ok {
			t.Errorf("the contract no longer declares %s for %s", want, listPath)
		}
	}
	// There is no such thing as a missing list: an empty database has zero
	// systems, which is an answer with a 200 on it.
	if _, declared := got["404"]; declared {
		t.Errorf("%s declares a 404", listPath)
	}

	h := newHandler(t, dayOne())
	if rec := getList(t, h, ""); rec.Code != http.StatusOK {
		t.Errorf("200 is unreachable: got %d", rec.Code)
	}
	if rec := getList(t, h, getList(t, h, "").Header().Get("ETag")); rec.Code != http.StatusNotModified {
		t.Errorf("304 is unreachable: got %d", rec.Code)
	}

	// The 429 belongs to the rate limiter, so it is asserted against the
	// assembled router in the server package rather than here.
	rec := getList(t, newHandler(t, &stubQueries{listErr: errUnreachable}), "")
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("500 is unreachable: got %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("the 500 is %q, the contract declares application/problem+json", got)
	}
}

func TestEveryDeclaredResponseIsReachableOnTheDetail(t *testing.T) {
	got := operation(t, loadSpec(t), detailPath)

	for _, want := range []string{"200", "304", "400", "404", "429", "500"} {
		if _, ok := got[want]; !ok {
			t.Errorf("the contract does not declare %s for %s", want, detailPath)
		}
	}

	h := newHandler(t, dayOne())
	if rec := getDetail(t, h, "timseil-dev", "", ""); rec.Code != http.StatusOK {
		t.Errorf("200 is unreachable: got %d", rec.Code)
	}

	tag := getDetail(t, h, "timseil-dev", "", "").Header().Get("ETag")
	if rec := getDetail(t, h, "timseil-dev", "", tag); rec.Code != http.StatusNotModified {
		t.Errorf("304 is unreachable: got %d", rec.Code)
	}

	// The status this phase added. It exists because the window parameter has
	// values outside its enum, and a caller who names one deserves to be told
	// rather than handed a different period without comment.
	if rec := getDetail(t, h, "timseil-dev", "window=45", ""); rec.Code != http.StatusBadRequest {
		t.Errorf("400 is unreachable: got %d", rec.Code)
	}
	if rec := getDetail(t, h, "no-such-system", "", ""); rec.Code != http.StatusNotFound {
		t.Errorf("404 is unreachable: got %d", rec.Code)
	}

	broken := dayOne()
	broken.systemErr = errUnreachable
	if rec := getDetail(t, newHandler(t, broken), "timseil-dev", "", ""); rec.Code != http.StatusInternalServerError {
		t.Errorf("500 is unreachable: got %d", rec.Code)
	}
}

// Every failure both operations declare points at a shared response object, and
// those carry application/problem+json. A 404 in application/json would parse
// for a generic client and break every one that branches on the media type
// (ADR 0009 — one error shape, no exceptions per endpoint).
func TestTheFailuresAreSharedProblemResponses(t *testing.T) {
	doc := loadSpec(t)

	for path, statuses := range map[string][]string{
		listPath:   {"429", "500"},
		detailPath: {"400", "404", "429", "500"},
	} {
		for _, status := range statuses {
			ref := operation(t, doc, path)[status].Ref
			if !strings.Contains(ref, "/responses/") {
				t.Errorf("%s %s = %q, want a components/responses ref", path, status, ref)
			}
		}
	}

	// And what the handler writes for the two it produces itself.
	h := newHandler(t, dayOne())
	for what, query := range map[string]string{"400": "window=45", "404": ""} {
		slug := "timseil-dev"
		if what == "404" {
			slug = "no-such-system"
		}
		rec := getDetail(t, h, slug, query, "")
		if ct := rec.Header().Get("Content-Type"); ct != "application/problem+json" {
			t.Errorf("the %s answered %q", what, ct)
		}
	}
}

// The window the handler accepts is the window the contract declares — enum and
// default both. This is the pair that would drift quietly: adding 365 to the
// contract without touching the handler produces a documented value that answers
// 400, and changing the default in the handler produces a grid nobody asked for.
func TestTheWindowEnumAndDefaultAreTheContractsOwn(t *testing.T) {
	doc := loadSpec(t)

	item := doc.Paths[detailPath]
	if item.Get == nil {
		t.Fatalf("the served contract describes no GET %s", detailPath)
	}

	var declared []int
	var fallback int
	for _, param := range item.Get.Parameters {
		p := doc.Components.Parameters[refName(param.Ref)]
		if p.Name != "window" {
			continue
		}
		declared, fallback = p.Schema.Enum, p.Schema.Default
	}
	if len(declared) == 0 {
		t.Fatal("the contract declares no window enum")
	}
	if fallback != DefaultWindow {
		t.Errorf("the handler defaults to %d, the contract declares %d", DefaultWindow, fallback)
	}

	h := newHandler(t, dayOne())
	for _, value := range declared {
		rec := getDetail(t, h, "timseil-dev", "window="+strconv.Itoa(value), "")
		if rec.Code != http.StatusOK {
			t.Errorf("the contract declares window=%d and the handler answered %d", value, rec.Code)
		}
	}
}
