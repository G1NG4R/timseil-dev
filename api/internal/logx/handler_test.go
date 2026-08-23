package logx

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"

	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
	"github.com/G1NG4R/timseil-dev/api/internal/traceparent"
)

func logger(buf *bytes.Buffer) *slog.Logger {
	return New(slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug}))
}

// requestCtx is a context as the middleware chain leaves it.
func requestCtx() (context.Context, string, string) {
	id := reqid.New()
	sc := traceparent.New()
	ctx := traceparent.With(reqid.With(context.Background(), id), sc)
	return ctx, id, sc.TraceID
}

func oneLine(t *testing.T, buf *bytes.Buffer) map[string]any {
	t.Helper()
	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 1 {
		t.Fatalf("expected exactly one line, got %d:\n%s", len(lines), buf.String())
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(lines[0]), &m); err != nil {
		t.Fatalf("not one JSON object: %v\n%s", err, lines[0])
	}
	return m
}

func TestEveryLineFromARequestCarriesBothIds(t *testing.T) {
	var buf bytes.Buffer
	ctx, id, traceID := requestCtx()

	logger(&buf).ErrorContext(ctx, "writing the systems response", "err", "broken pipe")

	line := oneLine(t, &buf)
	if line["request_id"] != id {
		t.Errorf("request_id: got %v, want %q", line["request_id"], id)
	}
	if line["trace_id"] != traceID {
		t.Errorf("trace_id: got %v, want %q", line["trace_id"], traceID)
	}
}

// The classic wrapper bug: WithAttrs returns the inner handler and the wrapper
// disappears, so the first log.With(...) anywhere in the service silently ends
// correlation for every line after it.
func TestCorrelationSurvivesWithAttrs(t *testing.T) {
	var buf bytes.Buffer
	ctx, id, _ := requestCtx()

	logger(&buf).With("component", "contact.dispatcher").InfoContext(ctx, "ran")

	line := oneLine(t, &buf)
	if line["request_id"] != id {
		t.Errorf("the wrapper was lost at WithAttrs: %v", line)
	}
	if line["component"] != "contact.dispatcher" {
		t.Errorf("the attribute was lost: %v", line)
	}
}

// The second half of the same bug, and the one that is easy to get subtly
// wrong rather than obviously: with a group open, a naive handler files the
// correlation as {"db":{"request_id":…}} — where every query in this system
// that joins on request_id stops finding it, depending on which package
// happened to write the line.
func TestAGroupDoesNotSwallowTheCorrelation(t *testing.T) {
	var buf bytes.Buffer
	ctx, id, traceID := requestCtx()

	logger(&buf).WithGroup("db").ErrorContext(ctx, "query failed", "table", "systems")

	line := oneLine(t, &buf)
	if line["request_id"] != id {
		t.Errorf("request_id is not at the root of the object: %v", line)
	}
	if line["trace_id"] != traceID {
		t.Errorf("trace_id is not at the root of the object: %v", line)
	}
	group, ok := line["db"].(map[string]any)
	if !ok {
		t.Fatalf("the group is gone: %v", line)
	}
	if group["table"] != "systems" {
		t.Errorf("the grouped attribute did not land in the group: %v", line)
	}
	if _, nested := group["request_id"]; nested {
		t.Errorf("request_id was filed inside the group: %v", line)
	}
}

func TestGroupsAndAttributesNest(t *testing.T) {
	var buf bytes.Buffer
	ctx, id, _ := requestCtx()

	logger(&buf).With("a", 1).WithGroup("g").With("b", 2).InfoContext(ctx, "x")

	line := oneLine(t, &buf)
	if line["request_id"] != id || line["a"] != float64(1) {
		t.Errorf("root level is wrong: %v", line)
	}
	g, ok := line["g"].(map[string]any)
	if !ok || g["b"] != float64(2) {
		t.Errorf("the group is wrong: %v", line)
	}
}

// A line with no request must not get an empty field. An empty request_id in
// Loki is a value every query then has to exclude; an absent one they can match
// on directly.
func TestALineWithoutARequestCarriesNoEmptyFields(t *testing.T) {
	var buf bytes.Buffer

	logger(&buf).Info("api listening", "addr", "[::]:8080")

	line := oneLine(t, &buf)
	if _, present := line["request_id"]; present {
		t.Errorf("invented a request_id: %v", line)
	}
	if _, present := line["trace_id"]; present {
		t.Errorf("invented a trace_id: %v", line)
	}
}

// A background loop has a trace and no request. Both halves are asserted,
// because "no request id" is the easy one to get right by accident.
func TestABackgroundRunCarriesATraceAndNoRequestId(t *testing.T) {
	var buf bytes.Buffer
	sc := traceparent.New()

	logger(&buf).InfoContext(traceparent.With(context.Background(), sc), "ops roll-up", "days", 3)

	line := oneLine(t, &buf)
	if line["trace_id"] != sc.TraceID {
		t.Errorf("trace_id: got %v", line["trace_id"])
	}
	if _, present := line["request_id"]; present {
		t.Errorf("a loop line claimed a request: %v", line)
	}
}

// slog's JSON handler does not deduplicate keys. The whole reason the call
// sites gave up their hand-set attribute is that two of them in one object is
// valid JSON whose meaning depends on parser order.
func TestTheCorrelationKeysAppearExactlyOnce(t *testing.T) {
	var buf bytes.Buffer
	ctx, _, _ := requestCtx()

	logger(&buf).ErrorContext(ctx, "request failed", "err", "nope")

	for _, key := range []string{`"request_id"`, `"trace_id"`} {
		if n := strings.Count(buf.String(), key); n != 1 {
			t.Errorf("%s appears %d times:\n%s", key, n, buf.String())
		}
	}
}

// Without this the wrapper writes debug lines the JSON handler underneath would
// have dropped, and LOG_LEVEL stops meaning anything.
func TestTheLevelIsStillRespected(t *testing.T) {
	var buf bytes.Buffer
	log := New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelWarn}))
	ctx, _, _ := requestCtx()

	log.InfoContext(ctx, "probe already recorded")

	if buf.Len() != 0 {
		t.Errorf("an info line got past a warn-level handler:\n%s", buf.String())
	}
}

// net/http writes its own errors through this logger via slog.NewLogLogger in
// cmd/api, with no context and text this service did not write: "http: TLS
// handshake error from 203.0.113.7:54321". It is the one source of raw
// addresses that neither a careful call site nor a context can reach.
func TestNetHTTPsOwnErrorsLoseTheirAddress(t *testing.T) {
	var buf bytes.Buffer
	log := logger(&buf)

	slog.NewLogLogger(log.Handler(), slog.LevelWarn).
		Print("http: TLS handshake error from 203.0.113.7:54321: EOF")

	out := buf.String()
	if strings.Contains(out, "203.0.113.7") {
		t.Errorf("the address reached the writer:\n%s", out)
	}
	if !strings.Contains(out, "TLS handshake error") {
		t.Errorf("the reason was lost:\n%s", out)
	}
}

// The PII path, end to end through a real logger rather than through Scrub.
func TestARelayRefusalIsFilteredOnItsWayThroughTheHandler(t *testing.T) {
	var buf bytes.Buffer
	ctx, _, _ := requestCtx()

	logger(&buf).ErrorContext(ctx, "contact mail was not accepted",
		"id", "01J0", "err", relayError{})

	out := buf.String()
	if strings.Contains(out, "visitor@example.com") {
		t.Errorf("the address reached the writer:\n%s", out)
	}
	if !strings.Contains(out, "550") {
		t.Errorf("the code was lost with it:\n%s", out)
	}
}

type relayError struct{}

func (relayError) Error() string {
	return "the mail provider refused the message permanently: " +
		"550 5.1.1 <visitor@example.com>: Recipient address rejected"
}
