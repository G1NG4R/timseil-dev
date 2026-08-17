package httpx

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func get(t *testing.T, path string, header map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	docsMux().ServeHTTP(rec, req)
	return rec
}

func docsMux() *http.ServeMux {
	mux := http.NewServeMux()
	RegisterDocs(mux)
	return mux
}

// The one test that actually proves the filter. contract/openapi.yaml describes the
// internal endpoints — C7 needs the generated types, and E2 needs them for router
// parity — but the document this handler serves is the bundle they were stripped from.
//
// Get this wrong and the site publishes the paths that are supposed to be closed,
// while every other check stays green.
func TestServedSpecHasNoInternalEndpoints(t *testing.T) {
	rec := get(t, "/api/openapi.yaml", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/openapi.yaml = %d, want %d", rec.Code, http.StatusOK)
	}

	body := rec.Body.String()
	for _, forbidden := range []string{"/api/internal", "x-internal", "internalToken", "ProbeReport", "DeployReport"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("the served document leaks %q — it was built from the unfiltered contract", forbidden)
		}
	}
}

// A document that does not parse is worse than none: Scalar renders an empty page and
// nothing else notices.
func TestServedSpecParses(t *testing.T) {
	var doc struct {
		OpenAPI string                 `yaml:"openapi"`
		Paths   map[string]interface{} `yaml:"paths"`
	}
	if err := yaml.Unmarshal([]byte(get(t, "/api/openapi.yaml", nil).Body.String()), &doc); err != nil {
		t.Fatalf("served document does not parse: %v", err)
	}
	if !strings.HasPrefix(doc.OpenAPI, "3.1") {
		t.Fatalf("openapi = %q, want 3.1.x", doc.OpenAPI)
	}
	if _, ok := doc.Paths["/api/systems"]; !ok {
		t.Fatal("served document has no /api/systems — the filter removed too much")
	}
}

func TestDocsPageRenders(t *testing.T) {
	rec := get(t, "/api/docs", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/docs = %d, want %d", rec.Code, http.StatusOK)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Fatalf("Content-Type = %q, want text/html", ct)
	}
}

// The page exists to argue that no third party sits in the reader's request path. A
// single absolute URL in it would make that argument false, and it is the kind of line
// a copied snippet brings along.
func TestDocsPageLoadsNothingExternal(t *testing.T) {
	body := get(t, "/api/docs", nil).Body.String()
	// "//" catches the protocol-relative form, which is just as external.
	for _, scheme := range []string{"http://", "https://", `"//`, "'//"} {
		if strings.Contains(body, scheme) {
			t.Fatalf("the docs page references an absolute URL (%q):\n%s", scheme, body)
		}
	}
	// Defaults that reach out to fonts.scalar.com and proxy.scalar.com.
	for _, required := range []string{"withDefaultFonts: false", "proxyUrl: ''", "telemetry: false"} {
		if !strings.Contains(body, required) {
			t.Fatalf("the docs page is missing %q", required)
		}
	}
}

// The settings above are a promise; this is the enforcement. The vendored bundle
// calls api.scalar.com on mount with no option to stop it — found in a network trace,
// not in the source — so a future version deciding to call something else has to be
// caught by the browser rather than by whoever reads the release notes.
func TestDocsPageSendsAClosedContentSecurityPolicy(t *testing.T) {
	csp := get(t, "/api/docs", nil).Header().Get("Content-Security-Policy")
	if csp == "" {
		t.Fatal("no Content-Security-Policy on the docs page")
	}
	for _, directive := range []string{"default-src 'none'", "connect-src 'self'", "frame-ancestors 'none'"} {
		if !strings.Contains(csp, directive) {
			t.Fatalf("CSP is missing %q:\n%s", directive, csp)
		}
	}
	// 'unsafe-inline' for scripts would let anything injected into the page run.
	// The bootstrap is a constant, so it travels as a hash instead.
	scriptSrc, _, _ := strings.Cut(csp[strings.Index(csp, "script-src"):], ";")
	if strings.Contains(scriptSrc, "unsafe-inline") {
		t.Fatalf("script-src allows unsafe-inline: %s", scriptSrc)
	}
	if !strings.Contains(scriptSrc, "sha256-") {
		t.Fatalf("script-src carries no hash for the inline bootstrap: %s", scriptSrc)
	}
}

// A hash that does not match the script it is meant to allow produces a page that
// looks fine and renders nothing. Recomputing it here catches a bootstrap edited
// without regard for the policy.
func TestInlineScriptMatchesItsCspHash(t *testing.T) {
	body := get(t, "/api/docs", nil).Body.String()

	open := strings.LastIndex(body, "<script>") + len("<script>")
	inline := body[open:strings.LastIndex(body, "</script>")]

	if want := sriHash(inline); !strings.Contains(contentSecurityPolicy, want) {
		t.Fatalf("CSP does not allow the inline script it ships: want %s", want)
	}
}

func TestDocsRejectsPost(t *testing.T) {
	rec := httptest.NewRecorder()
	docsMux().ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/docs", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("POST /api/docs = %d, want %d", rec.Code, http.StatusMethodNotAllowed)
	}
}

func TestRendererIsServedGzippedAndDecompresses(t *testing.T) {
	rec := get(t, "/api/docs/scalar.js", map[string]string{"Accept-Encoding": "gzip"})
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/docs/scalar.js = %d, want %d", rec.Code, http.StatusOK)
	}
	if enc := rec.Header().Get("Content-Encoding"); enc != "gzip" {
		t.Fatalf("Content-Encoding = %q, want gzip", enc)
	}

	zr, err := gzip.NewReader(rec.Body)
	if err != nil {
		t.Fatalf("body is not gzip: %v", err)
	}
	plain, err := io.ReadAll(zr)
	if err != nil {
		t.Fatalf("gzip body truncated: %v", err)
	}
	if !strings.Contains(string(plain), "createApiReference") {
		t.Fatal("the vendored bundle does not export createApiReference")
	}
}

// The broken case for the stored-gzip shortcut: a client that does not accept gzip
// must get readable JavaScript, not a binary blob labelled text/javascript.
func TestRendererDecompressesForClientsWithoutGzip(t *testing.T) {
	rec := get(t, "/api/docs/scalar.js", map[string]string{"Accept-Encoding": "identity"})
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/docs/scalar.js = %d, want %d", rec.Code, http.StatusOK)
	}
	if enc := rec.Header().Get("Content-Encoding"); enc != "" {
		t.Fatalf("Content-Encoding = %q, want none", enc)
	}
	if !strings.Contains(rec.Body.String(), "createApiReference") {
		t.Fatal("body was not decompressed for a client that cannot read gzip")
	}
}

func TestETagAnswersIfNoneMatch(t *testing.T) {
	first := get(t, "/api/openapi.yaml", nil)
	etag := first.Header().Get("ETag")
	if etag == "" {
		t.Fatal("no ETag on the document")
	}

	second := get(t, "/api/openapi.yaml", map[string]string{"If-None-Match": etag})
	if second.Code != http.StatusNotModified {
		t.Fatalf("conditional GET = %d, want %d", second.Code, http.StatusNotModified)
	}
	if second.Body.Len() != 0 {
		t.Fatalf("304 carried a body of %d bytes", second.Body.Len())
	}
}
