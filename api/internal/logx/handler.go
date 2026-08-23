// Package logx wraps the JSON handler so that two things are true of every line
// this service writes, rather than of the lines somebody remembered.
//
// CORRELATION. A request id and a trace id belong on every line a request
// caused, not only on the access line. Setting them at the call site is what
// this service did until F1, and it worked for the eight places that did it and
// not for the fifty that did not — the ones that matter, because they are the
// error paths. A handler cannot forget.
//
// PRIVACY. The operations sheet promises "no IP, no form contents" of the
// application log, and that promise is quoted by the privacy page. The leak it
// has to stop is not a call site logging an address on purpose; it is
// internal/mail putting a relay's refusal into an error and internal/contact
// logging that error, where "550 5.1.1 <someone@example.com>: Recipient address
// rejected" arrives as somebody else's text. No amount of discipline at the
// call site catches that, because the call site is already careful — the
// address is not a field it chose to log.
//
// ORDER. Context on the outside, scrubbing in the middle, JSON at the bottom:
//
//	Context  →  Scrub  →  JSON
//
// The other way round, the scrubber would not see the attributes the context
// handler adds, and "every line" would have an exception nobody keeps in mind.
// The ids are hex and have nothing to redact — that is not the point. The point
// is that there is no way past the filter.
package logx

import (
	"context"
	"log/slog"

	"github.com/G1NG4R/timseil-dev/api/internal/reqid"
	"github.com/G1NG4R/timseil-dev/api/internal/traceparent"
)

// New builds the logger the whole service shares.
func New(inner slog.Handler) *slog.Logger {
	return slog.New(NewContextHandler(NewScrubHandler(inner)))
}

// --------------------------------------------------------------------- scrub

// ScrubHandler filters every attribute on its way to the writer.
type ScrubHandler struct{ inner slog.Handler }

func NewScrubHandler(inner slog.Handler) *ScrubHandler { return &ScrubHandler{inner: inner} }

func (h *ScrubHandler) Enabled(ctx context.Context, l slog.Level) bool {
	return h.inner.Enabled(ctx, l)
}

// WithAttrs scrubs once, here, instead of once per line. Attributes attached
// this way are fixed for the lifetime of the logger, so filtering them on every
// record would be the same work repeated.
func (h *ScrubHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	out := make([]slog.Attr, len(attrs))
	for i, a := range attrs {
		out[i] = scrubAttr(a)
	}
	return &ScrubHandler{inner: h.inner.WithAttrs(out)}
}

func (h *ScrubHandler) WithGroup(name string) slog.Handler {
	return &ScrubHandler{inner: h.inner.WithGroup(name)}
}

func (h *ScrubHandler) Handle(ctx context.Context, rec slog.Record) error {
	// The message too. "contact delivery failed" carries nothing, but a message
	// built with fmt.Sprintf around an error carries whatever the error had.
	out := slog.NewRecord(rec.Time, rec.Level, Scrub(rec.Message), rec.PC)

	rec.Attrs(func(a slog.Attr) bool {
		out.AddAttrs(scrubAttr(a))
		return true
	})

	return h.inner.Handle(ctx, out)
}

// ------------------------------------------------------------------- context

// ContextHandler attaches the request id and the trace id from the context.
//
// A line with neither gets neither field. That is deliberate: process lifecycle
// lines have no request, and an empty request_id in Loki is a value every query
// then has to exclude — worse than an absent one, which they can simply match on.
type ContextHandler struct {
	// base is the handler as it was handed over, with nothing applied to it.
	// ops replays what was asked for since. Keeping the two apart is what makes
	// the ids land at the root of the object even when a group is open: the
	// context attributes are applied to base FIRST, and the groups after them.
	//
	// Without this, a logger that had WithGroup called on it would file
	// request_id inside that group, and the one field every query in this
	// system joins on would move depending on which package wrote the line.
	// Nothing in this service groups today. The handler is not the place to
	// depend on that.
	base slog.Handler
	ops  []op

	// ready is base with ops applied — the handler to use when there is nothing
	// from the context to add. Precomputed so the common path allocates nothing.
	ready slog.Handler
}

type op struct {
	group string
	attrs []slog.Attr
}

func NewContextHandler(inner slog.Handler) *ContextHandler {
	return &ContextHandler{base: inner, ready: inner}
}

func (h *ContextHandler) Enabled(ctx context.Context, l slog.Level) bool {
	return h.ready.Enabled(ctx, l)
}

func (h *ContextHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	if len(attrs) == 0 {
		return h
	}
	return h.with(op{attrs: attrs})
}

func (h *ContextHandler) WithGroup(name string) slog.Handler {
	if name == "" {
		return h
	}
	return h.with(op{group: name})
}

func (h *ContextHandler) with(o op) *ContextHandler {
	ops := make([]op, len(h.ops), len(h.ops)+1)
	copy(ops, h.ops)
	ops = append(ops, o)
	return &ContextHandler{base: h.base, ops: ops, ready: apply(h.ready, o)}
}

func (h *ContextHandler) Handle(ctx context.Context, rec slog.Record) error {
	attrs := contextAttrs(ctx)
	if len(attrs) == 0 {
		return h.ready.Handle(ctx, rec)
	}

	// The fast path, and in this service the only one taken: no group is open,
	// so the ids can go straight onto the record at the root of the object.
	if len(h.ops) == 0 {
		rec.AddAttrs(attrs...)
		return h.ready.Handle(ctx, rec)
	}

	// Something grouped. Rebuild from base with the ids in front, so that they
	// stay at the root and the groups nest below them where they were asked to.
	inner := h.base.WithAttrs(attrs)
	for _, o := range h.ops {
		inner = apply(inner, o)
	}
	return inner.Handle(ctx, rec)
}

func apply(h slog.Handler, o op) slog.Handler {
	if o.group != "" {
		return h.WithGroup(o.group)
	}
	return h.WithAttrs(o.attrs)
}

// contextAttrs is the whole of what correlation means here: what a visitor can
// quote, and what a collector can join on.
func contextAttrs(ctx context.Context) []slog.Attr {
	if ctx == nil {
		return nil
	}

	var attrs []slog.Attr
	if id := reqid.From(ctx); id != "" {
		attrs = append(attrs, slog.String("request_id", id))
	}
	// trace_id only. The span id has no reader before F8 builds the Tempo link,
	// and a field on every line is a field on a disk Loki shares with Postgres.
	if t, ok := traceparent.From(ctx); ok {
		attrs = append(attrs, slog.String("trace_id", t.TraceID))
	}
	return attrs
}
