package middleware

import (
	"crypto/sha256"
	"crypto/subtle"
	"log/slog"
	"net/http"
	"strings"

	"github.com/G1NG4R/timseil-dev/api/internal/httpx"
)

// The scheme, and the whole of what a rejected caller is told. RFC 9110 wants a
// WWW-Authenticate on every 401; it also allows a realm and an error code, and
// both are declined here — they are the two places the standard leaves for a
// hint, and a hint is the information leak this middleware exists to avoid.
const bearerScheme = "Bearer"

// Bearer guards a route with a token compared in constant time.
//
// Scoped by being wrapped around one route at its mux.Handle line rather than
// by testing r.URL.Path in a chain link. Same reasoning as the contact limiter
// (ADR 0015 §3): the route is the whole statement of the scope, so there is
// nowhere for the scope and the mounting to disagree. A path test would be a
// second place that has to be kept in step with the router, and the failure
// mode of getting it wrong is an unauthenticated write endpoint.
//
// THREE WAYS TO BE REJECTED, ONE ANSWER. No Authorization header, a header that
// is not a Bearer, and a Bearer carrying the wrong token all take the same path
// through this function, produce the same problem document down to the byte,
// and take the same time. Telling them apart would be a courtesy to somebody
// working out whether a path is guarded at all — the contract puts it as "a
// wrong token answers 401 with no detail and no measurable timing difference".
//
// That is also why the comparison runs even when there is no header: an early
// return on the empty case is measurably faster than a comparison, and the
// difference between "fast" and "slow" is the answer to "does this endpoint
// have a token at all".
func Bearer(token string, log *slog.Logger) Func {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !ConstantTimeTokenEqual(presented(r), token) {
				// The reason is not in the answer and not in the log line
				// either. A log that records "wrong token" next to "no token"
				// is a log that answers the attacker's question, one grep away
				// from anybody who gets far enough to read it.
				log.Warn("internal endpoint refused a request", "path", r.URL.Path)

				w.Header().Set("WWW-Authenticate", bearerScheme)
				httpx.WriteProblem(w, r, http.StatusUnauthorized, httpx.TypeUnauthorized,
					"Unauthorized", "This endpoint requires a bearer token.")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// presented pulls the credential out of the Authorization header.
//
// A header that is missing, malformed or of another scheme yields the empty
// string, which then fails the comparison like any other wrong value. There is
// deliberately no error return: an error would be a third outcome, and a third
// outcome is something for a caller to branch on and eventually to report.
//
// The scheme is matched case-insensitively because RFC 9110 says it is
// case-insensitive. The token is not: it is an opaque string that has to match
// what was generated.
func presented(r *http.Request) string {
	header := r.Header.Get("Authorization")

	scheme, credential, found := strings.Cut(header, " ")
	if !found || !strings.EqualFold(scheme, bearerScheme) {
		return ""
	}
	return strings.TrimSpace(credential)
}

// ConstantTimeTokenEqual reports whether two tokens match, in time that does
// not depend on how much of them matches — or on how long they are.
//
// The hashing is the part that is easy to leave out. subtle.ConstantTimeCompare
// is constant-time only across equal lengths; handed two different lengths it
// returns 0 immediately, and then the response time tells a caller how long the
// real token is. Feeding it two SHA-256 digests makes every comparison the same
// thirty-two bytes, whatever came in — including the empty string, which is
// what a request with no Authorization header presents.
//
// SHA-256 is not being used as a password hash here and does not need to be one.
// The input is a 32-character random token from `openssl rand -hex 32`, not a
// human-chosen secret, so there is nothing for a dictionary to try; the digest
// is a length-equaliser, not a KDF.
func ConstantTimeTokenEqual(got, want string) bool {
	gotSum := sha256.Sum256([]byte(got))
	wantSum := sha256.Sum256([]byte(want))

	return subtle.ConstantTimeCompare(gotSum[:], wantSum[:]) == 1
}
