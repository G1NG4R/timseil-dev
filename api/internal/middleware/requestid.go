package middleware

import (
	"net/http"

	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
)

// RequestID puts an identifier on every request and echoes it immediately.
//
// Set on the response before the handler runs, not after: a 304, a 429 and a
// panic all have to carry it, and none of them go through a handler that could
// remember to set it.
//
// An inbound identifier is adopted only when the peer is a trusted proxy — the
// web tier passes one through so that F1 can find both services from one id
// (build plan G4). From anywhere else it is a string a stranger chose that ends
// up in our logs, so a fresh one is generated instead. Even from a trusted peer
// it has to survive reqid.Valid: the value goes into a JSON log line and a
// response header, where a newline forges entries and a control character
// splits headers.
func RequestID(client ClientIP) Func {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := ""
			if inbound := r.Header.Get(reqid.Header); inbound != "" &&
				client.PeerIsTrusted(r) && reqid.Valid(inbound) {
				id = inbound
			}
			if id == "" {
				id = reqid.New()
			}

			w.Header().Set(reqid.Header, id)
			next.ServeHTTP(w, r.WithContext(reqid.With(r.Context(), id)))
		})
	}
}
