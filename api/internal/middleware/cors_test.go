package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The write path of the CORS layer, which is the half nothing covered.
//
// chain_test.go has held the read path, the preflight allowlist, the absence of
// credentials and the untouched probes since C1 — every one of them about a GET
// or an OPTIONS. The response to the actual POST was in no test at all, and that
// is how it came to carry no Access-Control-Allow-Origin: the preflight was
// answered correctly, the request went through, the endpoint replied 202, and
// only a browser could see that the page it answered was not allowed to read it.
//
// The asymmetry these tests pin down is ADR 0015 §1. Reads answer any origin,
// because the argument of this site is "check the numbers yourself" and a
// stranger with a browser is still a stranger. The write path does not: it
// answers the origins the deployment names, and nobody else.

var allowedOrigins = []string{"https://timseil.dev", "http://localhost:3000"}

func corsHandler() http.Handler {
	return CORS(allowedOrigins)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
}

func through(method, path string, headers map[string]string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, nil)
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	corsHandler().ServeHTTP(w, r)
	return w
}

// The half that was missing. Without this header the browser sends the POST,
// gets the 202, and refuses to hand it to the page — so the form shows a network
// error for a message that was accepted and delivered, and the receipt is never
// readable.
func TestAWriteFromAnAllowedOriginCanBeRead(t *testing.T) {
	for _, origin := range allowedOrigins {
		w := through(http.MethodPost, "/api/contact", map[string]string{"Origin": origin})

		if got := w.Header().Get("Access-Control-Allow-Origin"); got != origin {
			t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, origin)
		}
		if got := w.Header().Get("Vary"); got != "Origin" {
			t.Errorf("Vary = %q, want Origin — this value depends on the request", got)
		}
	}
}

func TestAWriteFromAnywhereElseIsNotReadable(t *testing.T) {
	w := through(http.MethodPost, "/api/contact", map[string]string{
		"Origin": "https://evil.example",
	})

	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Errorf("Access-Control-Allow-Origin = %q, want none", got)
	}
	// The request still reaches the handler: refusing it is the endpoint's job
	// and it has its own reason to. This layer only decides what a browser may
	// read.
	if w.Code != http.StatusOK {
		t.Errorf("status %d — this layer must not refuse the request itself", w.Code)
	}
}

// The wildcard belongs to reads only. On a write it would be the one line that
// makes every origin's POST readable, which is the opposite of the rule.
func TestTheWildcardNeverAppearsOnAWrite(t *testing.T) {
	for _, origin := range []string{"https://timseil.dev", "https://evil.example", ""} {
		headers := map[string]string{}
		if origin != "" {
			headers["Origin"] = origin
		}
		w := through(http.MethodPost, "/api/contact", headers)

		if got := w.Header().Get("Access-Control-Allow-Origin"); got == "*" {
			t.Errorf("origin %q got a wildcard on a POST", origin)
		}
	}
}

func TestOriginMatchingIgnoresCase(t *testing.T) {
	// Host names are case-insensitive and a browser may send either. A check
	// that missed this would refuse a legitimate page for a reason nobody could
	// see from the server side.
	w := through(http.MethodPost, "/api/contact", map[string]string{
		"Origin": "https://TIMSEIL.dev",
	})

	if w.Header().Get("Access-Control-Allow-Origin") == "" {
		t.Error("a differently cased origin was treated as a stranger")
	}
}

func TestAPreflightFromAnAllowedOriginNamesTheMethods(t *testing.T) {
	w := through(http.MethodOptions, "/api/contact", map[string]string{
		"Origin":                        "https://timseil.dev",
		"Access-Control-Request-Method": "POST",
	})

	if w.Code != http.StatusNoContent {
		t.Errorf("status %d, want 204", w.Code)
	}
	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "https://timseil.dev" {
		t.Errorf("Access-Control-Allow-Origin = %q", got)
	}
	for _, want := range []string{"GET", "POST", "OPTIONS"} {
		if !contains(w.Header().Get("Access-Control-Allow-Methods"), want) {
			t.Errorf("Access-Control-Allow-Methods = %q, missing %s",
				w.Header().Get("Access-Control-Allow-Methods"), want)
		}
	}
	// Content-Type has to be allowed or the contact form's application/json —
	// which is itself a security control on that endpoint — never gets past the
	// preflight.
	if !contains(w.Header().Get("Access-Control-Allow-Headers"), "Content-Type") {
		t.Errorf("Access-Control-Allow-Headers = %q, missing Content-Type",
			w.Header().Get("Access-Control-Allow-Headers"))
	}
}

func contains(header, value string) bool {
	for _, part := range strings.Split(header, ",") {
		if strings.TrimSpace(part) == value {
			return true
		}
	}
	return false
}
