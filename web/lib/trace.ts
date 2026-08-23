// The identifier that ties one page request to the work it caused in the api.
//
// Mirror of api/internal/traceparent, deliberately down to the rejections. Two
// implementations of one wire format are two chances to get it differently
// wrong, and the cheapest insurance is that both refuse the same inputs — so
// trace.test.ts is the Go table of broken cases, written out again.
//
// WHY THIS IS THE CROSS-SERVICE KEY AND X-Request-Id IS NOT
//
// The api adopts an inbound `traceparent` from any peer and an inbound
// `X-Request-Id` only from a trusted one, and TRUSTED_PROXY_CIDRS is empty in
// compose.dev.yaml on purpose (filling it switches the rate limiter off and
// complains once a minute about it). So the request id web sends does NOT become
// the api's request id, while the trace id does become the api's trace id. ADR
// 0037 has the reasoning; the practical consequence for this file is that it
// carries the join key and lib/reqid.ts does not.
//
// NOTHING NODE-SPECIFIC IN HERE. proxy.ts imports this module, and web/proxy.ts
// may not carry a `runtime` export at all (Next refuses it with E1031), so this
// file has to work wherever Next decides to run it. `crypto.getRandomValues` is
// the one random source available in every runtime.
//
// The wire format is W3C Trace Context level 1, written by hand. F6 replaces the
// generator with the OpenTelemetry SDK and can keep the parser: the format is
// the specification's, not ours.

/** The name on the wire. Lowercase because the specification writes it so. */
export const TRACEPARENT_HEADER = "traceparent";

// The only version that exists. A future one may add fields after the flags, so
// a parser must accept a longer string with a KNOWN version — but not an unknown
// version, and never "ff", which the specification reserves as invalid.
const VERSION = "00";

const TRACE_ID_HEX = 32; // 16 bytes
const SPAN_ID_HEX = 16; // 8 bytes
const FLAGS_HEX = 2;

/** The only flag bit with a meaning today. */
const SAMPLED_BIT = 0x01;

/**
 * What travels: the trace this request belongs to, and the span this service is.
 *
 * `sampled` is carried through untouched — the decision belongs to whoever made
 * it first, and re-deciding it halfway would split one trace into a sampled and
 * an unsampled half.
 */
export interface SpanContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

/**
 * Starts a trace.
 *
 * `sampled` is true because nothing samples yet: F6 introduces the rate limiter
 * that turns it off, and until then a false here would mean "dropped" to every
 * collector that reads it.
 */
export function createSpan(): SpanContext {
  return { traceId: randomHex(16), spanId: randomHex(8), sampled: true };
}

/**
 * Continues a trace in this service: same trace, new span.
 *
 * Used twice, and for the same reason both times — once in proxy.ts for an
 * inbound header, once in serverFetch for the outbound one. Without a new span
 * id the two services are one span in F8's view, and the hop between them, which
 * is the thing worth seeing, has no width.
 */
export function childSpan(parent: SpanContext): SpanContext {
  return { traceId: parent.traceId, spanId: randomHex(8), sampled: parent.sampled };
}

/** Renders the value for an outgoing request. */
export function renderTraceparent(span: SpanContext): string {
  return [VERSION, span.traceId, span.spanId, span.sampled ? "01" : "00"].join("-");
}

/**
 * Reads an inbound traceparent, or returns null.
 *
 * A null is not an error to report to the caller. Everywhere this is used, the
 * answer to a header that does not parse is to start a fresh trace — a
 * stranger's broken header is not a reason to fail their request.
 *
 * The value ends up in a JSON log line, so the strictness is not fussiness. Only
 * lowercase hex and exactly the expected lengths get through, which leaves no
 * room for a newline to forge a log entry or a control character to split a
 * header on the way back out.
 */
export function parseTraceparent(header: string): SpanContext | null {
  // A single value only. Some headers may be comma-separated lists; traceparent
  // is not one of them, and accepting one would mean deciding which element wins.
  if (header === "" || /[,\r\n\t ]/.test(header)) return null;

  const parts = header.split("-");
  if (parts.length < 4) return null;

  // Version 00 is exactly four fields. A later version may append, so a longer
  // string is only tolerated for a version this code does not know — and it
  // knows none, so today that means rejected. Written as the check it will
  // become rather than as `parts.length !== 4`, because the day a version 01
  // exists this is the line that has to be right.
  if (parts[0] !== VERSION || parts.length !== 4) return null;

  if (!validId(parts[1], TRACE_ID_HEX) || !validId(parts[2], SPAN_ID_HEX)) return null;
  if (parts[3].length !== FLAGS_HEX || !lowerHex(parts[3])) return null;

  const flags = Number.parseInt(parts[3], 16);
  return {
    traceId: parts[1],
    spanId: parts[2],
    sampled: (flags & SAMPLED_BIT) !== 0,
  };
}

/**
 * Picks the inbound header out of a request, refusing one that carries several.
 *
 * The specification says a receiver must restart the trace when it sees more
 * than one, and it is right: picking one would be picking which of two callers
 * to believe. `Headers.get` joins duplicates with ", ", and the comma is already
 * refused by parseTraceparent — this function makes the intent explicit rather
 * than leaning on that.
 */
export function inboundSpan(headers: Headers): SpanContext | null {
  const raw = headers.get(TRACEPARENT_HEADER);
  if (raw === null || raw.includes(",")) return null;
  return parseTraceparent(raw);
}

/** Draws n random bytes and returns them as lowercase hex. */
function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Right length, lowercase hex, not all zero. */
function validId(s: string, want: number): boolean {
  // All-zero means "no trace" in the specification, and treating it as an id
  // would make every unset caller share one trace id in Loki.
  return s.length === want && lowerHex(s) && /[^0]/.test(s);
}

/**
 * Whether every character is 0-9 or a-f.
 *
 * Uppercase is rejected rather than folded. The specification says the value is
 * lowercase, two spellings of one id are two series in a log store, and a peer
 * that sends uppercase is one whose id is better replaced than repaired.
 */
function lowerHex(s: string): boolean {
  for (const c of s) {
    if (!((c >= "0" && c <= "9") || (c >= "a" && c <= "f"))) return false;
  }
  return true;
}
