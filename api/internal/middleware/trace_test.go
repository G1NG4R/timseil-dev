package middleware

import (
	"net/http"
	"testing"

	"github.com/G1NG4R/timseil-dev/api/internal/traceparent"
)

const inbound = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"

// seen runs one request through Trace and reports what the handler saw.
func seen(t *testing.T, r *http.Request) (traceparent.SpanContext, bool) {
	t.Helper()

	var got traceparent.SpanContext
	var ok bool
	h := Trace()(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		got, ok = traceparent.From(r.Context())
	}))
	serve(h, r)
	return got, ok
}

func TestEveryRequestGetsATrace(t *testing.T) {
	got, ok := seen(t, from("203.0.113.7:1234"))
	if !ok || !got.Valid() {
		t.Fatalf("a request arrived without a trace: %+v", got)
	}
}

func TestAnInboundTraceIsContinuedInANewSpan(t *testing.T) {
	r := from("203.0.113.7:1234")
	r.Header.Set(traceparent.Header, inbound)

	got, ok := seen(t, r)
	if !ok {
		t.Fatal("the inbound trace was dropped")
	}
	if got.TraceID != "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Errorf("a new trace was started instead of joining: %+v", got)
	}
	// Without its own span the hop between the two services has no width, and
	// F8 would draw one span where there were two.
	if got.SpanID == "00f067aa0ba902b7" {
		t.Error("this service reused its caller's span id")
	}
}

// The difference from RequestID next door, asserted rather than only argued in
// the comment: a trace id is thirty-two hex characters that go nowhere, so a
// stranger setting one costs nothing. A request id is echoed back and needs the
// proxy list; this one must not.
func TestATraceIsAdoptedFromAnUntrustedPeerToo(t *testing.T) {
	r := from("198.51.100.9:4321") // not in dockerNet's trusted ranges
	r.Header.Set(traceparent.Header, inbound)

	got, _ := seen(t, r)
	if got.TraceID != "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Errorf("a trace from an untrusted peer was thrown away: %+v", got)
	}
}

// Refused means replaced, never rejected: a stranger's broken header is not a
// reason to fail their request. Same posture as reqid.Valid.
func TestAMalformedTraceparentStartsAFreshTraceWithoutFailingTheRequest(t *testing.T) {
	for _, bad := range []string{
		"nonsense",
		"00-00000000000000000000000000000000-00f067aa0ba902b7-01",
		"ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
		"00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01",
		inbound + "\nlevel=ERROR msg=forged",
	} {
		t.Run(bad[:min(len(bad), 20)], func(t *testing.T) {
			r := from("203.0.113.7:1234")
			r.Header.Set(traceparent.Header, bad)

			got, ok := seen(t, r)
			if !ok || !got.Valid() {
				t.Fatalf("no usable trace after a broken header: %+v", got)
			}
			if got.TraceID == "4bf92f3577b34da6a3ce929d0e0e4736" {
				t.Errorf("a malformed header was adopted anyway: %+v", got)
			}
		})
	}
}

// The specification says a receiver that sees several must restart, and it is
// right: choosing one would be choosing which caller to believe.
func TestTwoTraceparentHeadersStartAFreshTrace(t *testing.T) {
	r := from("203.0.113.7:1234")
	r.Header.Add(traceparent.Header, inbound)
	r.Header.Add(traceparent.Header, "00-1111111111111111111111111111111a-2222222222222222-01")

	got, ok := seen(t, r)
	if !ok || got.TraceID == "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Errorf("one of two competing traces was picked: %+v", got)
	}
}

// F6 replaces New()'s constant with a sampler. Until then the inbound decision
// still has to survive the hop, or the exchange is not a one-line change.
func TestTheSamplingDecisionIsInherited(t *testing.T) {
	r := from("203.0.113.7:1234")
	r.Header.Set(traceparent.Header, "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00")

	got, _ := seen(t, r)
	if got.Sampled {
		t.Error("an unsampled trace was re-decided as sampled halfway through")
	}
}

// traceparent is a request header. The answer already carries the id a person
// quotes, and echoing this one would put a second identifier in front of a
// visitor who has no use for it.
func TestTheTraceIsNotEchoedToTheClient(t *testing.T) {
	h := Trace()(okHandler())
	rec := serve(h, from("203.0.113.7:1234"))

	if v := rec.Header().Get(traceparent.Header); v != "" {
		t.Errorf("the trace was written to the response: %q", v)
	}
}
