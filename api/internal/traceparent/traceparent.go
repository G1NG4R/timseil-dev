// Package traceparent carries the identifier that ties one request to the work
// it caused in the next service, and to the span F6 will hang on it later.
//
// Named after the wire format rather than the concept, and deliberately: F6
// imports go.opentelemetry.io/otel/trace, and two packages called "trace" in one
// file cost an alias that every later reader has to decode. This name leaves the
// good one free for the package that will need it.
//
// It sits beside internal/reqid rather than inside it, and the two never import
// each other. They answer different questions: a request id is what a visitor
// quotes from an error page, a trace id is what a backend correlates on. They
// also have different lifetimes — F6 replaces the generator here with the
// OpenTelemetry SDK and leaves reqid untouched.
//
// The wire format is W3C Trace Context, written by hand. The SDK is not a
// dependency yet: F6 is after launch, and an id that already has the right
// shape is all that is needed for the log lines of today to join the traces of
// tomorrow.
package traceparent

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"strings"
)

// Header is the name on the wire. Lowercase because the specification writes it
// that way; Go's http.Header canonicalises on the way in and out, so this is
// only ever visible to a human reading a capture.
const Header = "traceparent"

// version is the only one that exists. A future one may add fields after the
// flags, so a parser must accept a longer string with a known version — but not
// an unknown version, and never "ff", which the specification reserves as
// invalid.
const version = "00"

const (
	traceIDHex = 32 // 16 bytes
	spanIDHex  = 16 // 8 bytes
	flagsHex   = 2
)

// sampled is the only flag bit with a meaning today.
const sampledBit = 0x01

// SpanContext is what travels: the trace this request belongs to, and the span that
// this service is. Sampled is carried through untouched — the decision belongs
// to whoever made it first, and re-deciding it halfway would split one trace
// into a sampled and an unsampled half.
type SpanContext struct {
	TraceID string
	SpanID  string
	Sampled bool
}

type contextKey struct{}

// New starts a trace. Sampled is true because nothing samples yet: F6 introduces
// the rate limiter that turns it off, and until then a false here would mean
// "dropped" to every collector that reads it.
func New() SpanContext {
	return SpanContext{TraceID: randomHex(16), SpanID: randomHex(8), Sampled: true}
}

// Child continues a trace in this service: same trace, new span. The parent's
// sampling decision is inherited rather than remade, for the reason on Sampled.
func Child(parent SpanContext) SpanContext {
	return SpanContext{TraceID: parent.TraceID, SpanID: randomHex(8), Sampled: parent.Sampled}
}

// Header renders the value for an outgoing request.
func (c SpanContext) Header() string {
	flags := "00"
	if c.Sampled {
		flags = "01"
	}
	return version + "-" + c.TraceID + "-" + c.SpanID + "-" + flags
}

// Valid reports whether this is a usable context. The zero SpanContext is not, and
// neither is one whose ids are all zeroes — the specification says both mean
// "no trace", and treating them as one would make every unset caller share a
// single trace id in Loki.
func (c SpanContext) Valid() bool {
	return validID(c.TraceID, traceIDHex) && validID(c.SpanID, spanIDHex)
}

// Parse reads an inbound traceparent.
//
// A false return is not an error to report to the caller. Everywhere this is
// used, the answer to a header that does not parse is to start a fresh trace —
// the same rule requestid.go applies to a malformed X-Request-Id, and for the
// same reason: a stranger's broken header is not a reason to fail their request.
//
// The value ends up in a JSON log line, so the strictness is not fussiness. Only
// lowercase hex and exactly the expected lengths get through, which leaves no
// room for a newline to forge a log entry or a control character to split a
// header on the way back out.
func Parse(header string) (SpanContext, bool) {
	// A single value only. The specification allows a comma-separated list on
	// some headers; traceparent is not one of them, and accepting one here
	// would mean deciding which element wins.
	if header == "" || strings.ContainsAny(header, ",\r\n\t ") {
		return SpanContext{}, false
	}

	parts := strings.Split(header, "-")
	if len(parts) < 4 {
		return SpanContext{}, false
	}

	// Version 00 is exactly four fields. A later version may append, so a longer
	// string is only tolerated for a version this code does not know — and it
	// does not know any, so today that means rejected. Written as the check it
	// will become rather than as `len(parts) != 4`, because the day a version 01
	// exists this is the line that has to be right.
	if parts[0] != version || len(parts) != 4 {
		return SpanContext{}, false
	}

	if !validID(parts[1], traceIDHex) || !validID(parts[2], spanIDHex) {
		return SpanContext{}, false
	}

	if len(parts[3]) != flagsHex || !lowerHex(parts[3]) {
		return SpanContext{}, false
	}

	flags, err := hex.DecodeString(parts[3])
	if err != nil {
		return SpanContext{}, false
	}

	return SpanContext{
		TraceID: parts[1],
		SpanID:  parts[2],
		Sampled: flags[0]&sampledBit != 0,
	}, true
}

// With returns a context carrying the trace.
func With(ctx context.Context, c SpanContext) context.Context {
	return context.WithValue(ctx, contextKey{}, c)
}

// From returns the trace, or false when there is none. An absent trace is a
// caller outside the chain — a unit test, or one of the process lifecycle lines
// in main — and the callers treat it as "nothing to attach" rather than as an
// error. logx relies on that: a line with no trace gets no trace_id field at
// all, which is better than an empty one that every query then has to exclude.
func From(ctx context.Context) (SpanContext, bool) {
	c, ok := ctx.Value(contextKey{}).(SpanContext)
	if !ok || !c.Valid() {
		return SpanContext{}, false
	}
	return c, true
}

// randomHex draws n random bytes and returns them as lowercase hex.
//
// crypto/rand.Read never fails on any platform Go supports; since Go 1.24 it
// panics rather than returning an error, so there is no degraded path here to
// get wrong quietly. Same reasoning as reqid.New.
func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b) //nolint:errcheck // documented never to fail; it panics instead
	return hex.EncodeToString(b)
}

// validID checks one of the two ids: right length, lowercase hex, not all zero.
func validID(s string, want int) bool {
	if len(s) != want || !lowerHex(s) {
		return false
	}
	return strings.Trim(s, "0") != ""
}

// lowerHex reports whether every byte is 0-9 or a-f.
//
// Uppercase is rejected rather than folded. The specification says the value is
// lowercase, two spellings of one id are two series in a log store, and a peer
// that sends uppercase is one whose id is better replaced than repaired.
func lowerHex(s string) bool {
	for i := range len(s) {
		c := s[i]
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}
