package middleware

import (
	"net/http"
	"strings"
)

// preflightMaxAge in seconds. Ten minutes keeps a browser from asking again on
// every call without pinning a wrong answer for a whole afternoon.
const preflightMaxAge = "600"

// CORS answers reads from anywhere and preflights only from the origins the
// deployment names.
//
// The asymmetry is the argument of this site. ADR 0004 makes the read API
// public so that a stranger can check the numbers "ohne den Betreiber" — and a
// stranger with a browser is still a stranger. An origin allowlist on the read
// paths would mean the API is checkable with curl and not from a page, which is
// a footnote away from "checkable if you ask nicely".
//
// Credentials are never allowed. Without that line, `Access-Control-Allow-
// Origin: *` is refused by browsers anyway; with it and a reflected origin it
// would turn every visitor's cookies into an attack surface. There are no
// cookies here, and there is no reason to leave the door open for the day
// somebody adds one.
//
// allowed is not consulted by the read paths at all. It exists for the write
// path in C6, where an origin check is one of the layers on the contact form.
func CORS(allowed []string) Func {
	set := make(map[string]bool, len(allowed))
	for _, origin := range allowed {
		set[strings.ToLower(origin)] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !isAPI(r.URL.Path) || isInternal(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			// Preflight. The browser is asking whether a non-simple request
			// would be allowed, so this is where the allowlist applies.
			if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
				w.Header().Set("Vary", "Origin")
				if origin := r.Header.Get("Origin"); set[strings.ToLower(origin)] {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
					w.Header().Set("Access-Control-Allow-Headers", "Content-Type, If-None-Match, "+
						"X-Request-Id")
					w.Header().Set("Access-Control-Max-Age", preflightMaxAge)
				}
				// An unknown origin gets a bare 204 rather than a 403. The
				// browser is the one that reports the failure, and a status
				// would only tell a non-browser client that origins are being
				// evaluated at all.
				w.WriteHeader(http.StatusNoContent)
				return
			}

			switch {
			case r.Method == http.MethodGet || r.Method == http.MethodHead:
				// No Vary: Origin. The value is constant, so varying on it
				// would fragment every cache in front of this for nothing.
				w.Header().Set("Access-Control-Allow-Origin", "*")

			case set[strings.ToLower(r.Header.Get("Origin"))]:
				// The write path, and the half that was missing until C6.
				//
				// The preflight above was answered correctly, so the browser
				// sent the POST — and then refused to hand the response to the
				// page, because the response itself carried no
				// Access-Control-Allow-Origin. The form would have shown a
				// network error for a message that was accepted and delivered,
				// and the receipt in the 202 body — the one thing a visitor
				// takes away from it — would never have been readable.
				//
				// Nothing reported it: every server-side test passed, the
				// endpoint answered 202, and only a browser could see the
				// difference. Vary: Origin here, unlike above, because this
				// value really does depend on the request.
				w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
				w.Header().Add("Vary", "Origin")
			}

			next.ServeHTTP(w, r)
		})
	}
}

func isAPI(path string) bool {
	return path == "/api" || strings.HasPrefix(path, "/api/")
}

// isInternal excludes the two token-authenticated write paths from CORS, and
// only from CORS — isAPI is shared with the rate limiter, and these two declare
// a 429 like every other operation, so widening the exclusion would take their
// rate limit away with their preflight.
//
// Nothing exploitable is being closed here. A cross-site POST carries no
// Authorization header, so it is refused by the token whatever CORS says. What
// is closed is an answer: with CORS applied, a preflight from an allowlisted
// origin came back advertising `Access-Control-Allow-Methods: GET, POST,
// OPTIONS` for a path that is not in the public document and that L3 will block
// from outside. Neither caller is a browser — the prober and the pipeline both
// speak HTTP directly — so the preflight had no user and one reader.
func isInternal(path string) bool {
	return strings.HasPrefix(path, "/api/internal/")
}
