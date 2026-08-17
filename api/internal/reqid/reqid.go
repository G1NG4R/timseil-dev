// Package reqid carries the identifier that ties one request to every line it
// produced, in this service and in the next one.
//
// It is its own package, and forty lines is the right size for it. The
// middleware sets the id, the problem writer reads it, and the middleware
// already writes problems — so the two cannot both own it without a cycle.
// F1 adds a trace id beside it and touches neither.
package reqid

import (
	"context"
	"crypto/rand"
	"encoding/hex"
)

// Header is the name on the wire. ADR 0009: the same value appears as
// `requestId` in every problem document, so quoting either one from a bug
// report finds every log line from both services.
const Header = "X-Request-Id"

// Length in bytes before hex encoding. Sixteen gives 32 characters — long
// enough that a collision is not worth reasoning about, short enough to paste
// into a chat message and grep for.
const size = 16

type contextKey struct{}

// New returns a fresh identifier.
//
// crypto/rand.Read never fails on any platform Go supports; since Go 1.24 it
// panics rather than returning an error, so there is no degraded path here to
// get wrong quietly.
func New() string {
	var b [size]byte
	rand.Read(b[:]) //nolint:errcheck // documented never to fail; it panics instead
	return hex.EncodeToString(b[:])
}

// Valid reports whether an inbound identifier may be reused.
//
// This is not fussiness. The id is written into a JSON log line and echoed in a
// response header: a newline in it forges log entries, and a stray control
// character splits the header. Anything that does not match is replaced with a
// fresh one rather than rejected, because the caller's malformed header is not
// a reason to fail their request.
func Valid(s string) bool {
	if len(s) < 8 || len(s) > 64 {
		return false
	}
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z',
			r >= 'A' && r <= 'Z',
			r >= '0' && r <= '9',
			r == '-', r == '_':
		default:
			return false
		}
	}
	return true
}

// With returns a context carrying the identifier.
func With(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, contextKey{}, id)
}

// From returns the identifier, or the empty string when there is none. An empty
// answer is a handler running outside the chain — a unit test, usually — and
// the callers treat it as "nothing to quote" rather than as an error.
func From(ctx context.Context) string {
	id, _ := ctx.Value(contextKey{}).(string)
	return id
}
