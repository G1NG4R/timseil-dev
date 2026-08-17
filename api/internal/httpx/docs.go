// Package httpx holds the generated contract types and the handlers that serve the
// contract itself. Everything else in here — gen.go — is generated; do not edit it.
package httpx

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"embed"
	"encoding/base64"
	"encoding/hex"
	"io"
	"net/http"
	"strings"
)

// The renderer is vendored, not fetched. ADR 0006 keeps third parties out of the
// reader's request path, and the privacy page says so in as many words — a CDN script
// tag here would quietly make that untrue.
//
// Vendored: @scalar/api-reference 1.65.1, dist/browser/standalone.js, gzipped with
// `gzip -9 -n`. To update: `npm pack @scalar/api-reference@<version>`, extract that
// one file, gzip it the same way, and bump the version in this comment.
//
// The document served here is the *public* bundle: `make gen` writes it from
// contract/openapi.public.yaml, which has every `x-internal: true` operation filtered
// out. Serving contract/openapi.yaml instead would publish the internal endpoints.
//
//go:embed assets
var assets embed.FS

const (
	scalarPath = "assets/scalar.standalone.js.gz"
	specPath   = "assets/openapi.yaml"

	cacheHour = "public, s-maxage=3600, stale-while-revalidate=7200"
)

// bootstrap is the only inline script on the page. It is a constant, so its hash can
// go straight into the CSP and script-src never needs 'unsafe-inline'.
//
// The three settings are not cosmetic. Left at their defaults the bundle pulls
// webfonts from fonts.scalar.com, routes "try it" through proxy.scalar.com, and
// phones home — three third parties on the page that exists to argue there are none.
const bootstrap = `
  Scalar.createApiReference('#app', {
    url: '/api/openapi.yaml',
    withDefaultFonts: false,
    proxyUrl: '',
    telemetry: false,
    hideClientButton: true
  });
`

// contentSecurityPolicy is the part that actually holds.
//
// Settings are a promise the next version of a dependency can quietly break: this
// bundle fetches api.scalar.com/vector/registry on mount with no option to turn it
// off, and it took a network trace to notice. `connect-src 'self'` makes the
// guarantee structural — whatever a future build decides to call, the browser
// refuses. The code already handles the failed fetch; the panel it feeds stays empty.
//
// style-src keeps 'unsafe-inline' because Scalar injects its stylesheet at runtime.
// That is a static page with no user input and no data, which is a different risk
// than the site itself — L4 gives that one a nonce.
var contentSecurityPolicy = strings.Join([]string{
	"default-src 'none'",
	"script-src 'self' '" + sriHash(bootstrap) + "'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"font-src 'self' data:",
	"connect-src 'self'",
	"base-uri 'none'",
	"form-action 'none'",
	"frame-ancestors 'none'",
}, "; ")

// page is the whole document. Scalar renders into it; nothing else loads.
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>timseil.dev API</title>
</head>
<body>
<div id="app"></div>
<script src="/api/docs/scalar.js"></script>
<script>` + bootstrap + `</script>
</body>
</html>
`

// RegisterDocs adds the three documentation routes to mux. It needs no database and
// no config, so it can be wired before anything else and answers even while the
// readiness probe is red — someone checking what this API promises should not depend
// on Postgres being up.
//
// The assets are read once here rather than per request; the renderer is a megabyte.
func RegisterDocs(mux *http.ServeMux) {
	spec := mustRead(specPath)
	scalar := mustRead(scalarPath)
	pageBytes := []byte(page)

	mux.HandleFunc("GET /api/docs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", contentSecurityPolicy)
		serve(w, r, pageBytes, "text/html; charset=utf-8", false)
	})

	mux.HandleFunc("GET /api/openapi.yaml", func(w http.ResponseWriter, r *http.Request) {
		serve(w, r, spec, "application/yaml; charset=utf-8", false)
	})

	mux.HandleFunc("GET /api/docs/scalar.js", func(w http.ResponseWriter, r *http.Request) {
		serve(w, r, scalar, "text/javascript; charset=utf-8", true)
	})
}

// serve writes a fixed byte slice with an ETag and honours If-None-Match.
//
// When stored is true the payload is gzip on disk. Almost every client accepts it as
// is, which is the point — the bundle sits in the binary at a third of its size. A
// client that does not gets it decompressed rather than a broken download.
func serve(w http.ResponseWriter, r *http.Request, body []byte, contentType string, stored bool) {
	etag := etagOf(body)

	w.Header().Set("Cache-Control", cacheHour)
	w.Header().Set("ETag", etag)

	if match := r.Header.Get("If-None-Match"); match != "" && strings.Contains(match, etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	w.Header().Set("Content-Type", contentType)

	if !stored {
		_, _ = w.Write(body)
		return
	}

	if acceptsGzip(r) {
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Vary", "Accept-Encoding")
		_, _ = w.Write(body)
		return
	}

	w.Header().Set("Vary", "Accept-Encoding")
	zr, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		http.Error(w, "asset unreadable", http.StatusInternalServerError)
		return
	}
	defer func() { _ = zr.Close() }()
	_, _ = io.Copy(w, zr)
}

func acceptsGzip(r *http.Request) bool {
	for _, part := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		name, _, _ := strings.Cut(strings.TrimSpace(part), ";")
		if strings.EqualFold(name, "gzip") {
			return true
		}
	}
	return false
}

func etagOf(body []byte) string {
	sum := sha256.Sum256(body)
	return `"` + hex.EncodeToString(sum[:16]) + `"`
}

// sriHash is the CSP source form for an inline script: the base64 SHA-256 of exactly
// the bytes between the script tags. Change the bootstrap and the hash follows, so
// the two cannot drift into a page that silently refuses to run.
func sriHash(s string) string {
	sum := sha256.Sum256([]byte(s))
	return "sha256-" + base64.StdEncoding.EncodeToString(sum[:])
}

// mustRead fails at startup rather than on the first request. A missing asset means
// `make gen` did not run, and that is a build problem, not a runtime one.
func mustRead(name string) []byte {
	b, err := assets.ReadFile(name)
	if err != nil {
		panic("httpx: embedded asset missing: " + name + " — run make gen")
	}
	return b
}
