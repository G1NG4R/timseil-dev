package traceparent

import (
	"context"
	"strings"
	"testing"
)

// The valid header from the W3C specification's own example, used as the
// control: every rejection case below is this string with one thing wrong, so a
// test that fails points at the thing rather than at the shape.
const good = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"

func TestAWellFormedHeaderIsAdopted(t *testing.T) {
	c, ok := Parse(good)
	if !ok {
		t.Fatal("the specification's own example was rejected")
	}
	if c.TraceID != "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Errorf("trace id: got %q", c.TraceID)
	}
	if c.SpanID != "00f067aa0ba902b7" {
		t.Errorf("span id: got %q", c.SpanID)
	}
	if !c.Sampled {
		t.Error("flags 01 means sampled")
	}
	if c.Header() != good {
		t.Errorf("round trip: got %q, want %q", c.Header(), good)
	}
}

// The point of the phase. Every one of these has to be refused, because each of
// them either forges a log line, splits a header, or collapses many requests
// onto one id that a query can no longer separate.
func TestABrokenHeaderIsRefused(t *testing.T) {
	cases := []struct {
		name   string
		header string
	}{
		{"empty", ""},
		{"three fields", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7"},
		{"five fields", good + "-extra"},
		{"unknown version", "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"},
		// Reserved as invalid by the specification, and the one version value a
		// naive "anything but 00 is a future version" parser lets through.
		{"version ff", "ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"},
		{"version not hex", "zz-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"},
		{"trace id all zero", "00-00000000000000000000000000000000-00f067aa0ba902b7-01"},
		{"span id all zero", "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01"},
		{"trace id too short", "00-4bf92f3577b34da6a3ce929d0e0e473-00f067aa0ba902b7-01"},
		{"trace id too long", "00-4bf92f3577b34da6a3ce929d0e0e47366-00f067aa0ba902b7-01"},
		{"span id too short", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b-01"},
		{"trace id not hex", "00-4bf92f3577b34da6a3ce929d0e0e473g-00f067aa0ba902b7-01"},
		// Uppercase is a second spelling of one id. Two spellings are two series
		// in a log store, so the value is replaced rather than folded.
		{"trace id uppercase", "00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01"},
		{"flags too long", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-011"},
		{"flags not hex", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-0z"},
		// The three that would reach a log line or a response header intact.
		{"newline", good + "\nlevel=ERROR msg=forged"},
		{"carriage return", good + "\r"},
		{"tab", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01\t"},
		{"space", good + " "},
		{"comma separated list", good + "," + good},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if c, ok := Parse(tc.header); ok {
				t.Errorf("adopted %q as %+v", tc.header, c)
			}
		})
	}
}

// Refused means replaced, not rejected: the caller starts a fresh trace. This is
// the behaviour requestid.go already has for a malformed X-Request-Id, and the
// test is here so that a later "return an error instead" cannot pass quietly.
func TestARefusedHeaderStillYieldsAUsableTrace(t *testing.T) {
	if _, ok := Parse("nonsense"); ok {
		t.Fatal("precondition: this should not parse")
	}
	fresh := New()
	if !fresh.Valid() {
		t.Error("the replacement for a broken header has to be usable")
	}
}

func TestFlagsZeroMeansNotSampled(t *testing.T) {
	c, ok := Parse("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00")
	if !ok {
		t.Fatal("flags 00 is valid, it just means unsampled")
	}
	if c.Sampled {
		t.Error("flags 00 is not sampled")
	}
	if c.Header() != "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00" {
		t.Errorf("round trip lost the flag: %q", c.Header())
	}
}

// Bits other than the low one are not ours to interpret, but they must not make
// the header unparseable either — a peer running a newer specification is still
// a peer whose trace we want to join.
func TestUnknownFlagBitsDoNotRejectTheHeader(t *testing.T) {
	c, ok := Parse("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-fe")
	if !ok {
		t.Fatal("unknown flag bits are not a reason to refuse")
	}
	if c.Sampled {
		t.Error("0xfe has the low bit clear, so it is not sampled")
	}
}

func TestNewProducesDistinctIdsThatAreNotAllZero(t *testing.T) {
	a, b := New(), New()
	if a.TraceID == b.TraceID {
		t.Error("two traces got the same id")
	}
	if a.SpanID == b.SpanID {
		t.Error("two spans got the same id")
	}
	if !a.Valid() {
		t.Errorf("a fresh trace is not valid: %+v", a)
	}
	if strings.Trim(a.TraceID, "0") == "" {
		t.Error("an all-zero trace id means 'no trace'")
	}
}

func TestChildKeepsTheTraceAndMovesTheSpan(t *testing.T) {
	parent, _ := Parse("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00")
	child := Child(parent)

	if child.TraceID != parent.TraceID {
		t.Error("a child that starts a new trace is not a child")
	}
	if child.SpanID == parent.SpanID {
		t.Error("a child that reuses the span id is indistinguishable from its parent")
	}
	// Inherited, not remade: re-deciding halfway splits one trace into a sampled
	// and an unsampled half, which is worse than either answer.
	if child.Sampled != parent.Sampled {
		t.Error("the sampling decision belongs to whoever made it first")
	}
}

func TestTheContextRoundTrips(t *testing.T) {
	want := New()
	got, ok := From(With(context.Background(), want))
	if !ok || got != want {
		t.Errorf("got %+v (%v), want %+v", got, ok, want)
	}
}

// A handler running outside the chain — a unit test, or one of main's lifecycle
// lines. logx depends on this answer: no trace means no trace_id field, not an
// empty one that every query then has to exclude.
func TestAnEmptyContextCarriesNoTrace(t *testing.T) {
	if c, ok := From(context.Background()); ok {
		t.Errorf("invented a trace out of nothing: %+v", c)
	}
}

// The zero Context can be stored, so From has to catch it on the way out rather
// than trusting that a value was put there on purpose.
func TestAZeroTraceInTheContextCountsAsNone(t *testing.T) {
	if c, ok := From(With(context.Background(), SpanContext{})); ok {
		t.Errorf("the zero value passed as a real trace: %+v", c)
	}
}

func FuzzParseNeverPanicsAndNeverYieldsAnUnusableTrace(f *testing.F) {
	f.Add(good)
	f.Add("")
	f.Add("00-0-0-0")

	f.Fuzz(func(t *testing.T, header string) {
		c, ok := Parse(header)
		if !ok {
			return
		}
		// Anything Parse accepts is about to be written into a JSON log line and
		// possibly onto an outgoing header. Whatever the fuzzer found, it may
		// not carry either of those anywhere.
		if !c.Valid() {
			t.Errorf("accepted an unusable trace from %q: %+v", header, c)
		}
		if strings.ContainsAny(c.Header(), "\r\n\t ,") {
			t.Errorf("accepted %q and rendered %q", header, c.Header())
		}
	})
}
