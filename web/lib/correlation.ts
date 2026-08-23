// Turning a request's headers back into the two ids every line carries.
//
// THE HEADERS ARE THE CHANNEL, and that is a decision rather than a convenience.
// proxy.ts mints the ids and writes them onto the forwarded request; everything
// downstream reads them here. Next's own guidance for proxy.ts says why: it "is
// meant to be invoked separately of your render code", so shared modules and
// globals are not shared with it. lib/drain.ts documents the same hazard from
// the other side — `output: "standalone"` traces each entry point separately, so
// two bundles can hold two copies of one module, and the value one writes is not
// the value the other reads.
//
// There is also no moment at which a request-scoped store could be entered:
// proxy.ts has returned before rendering begins, and instrumentation.ts runs
// once per process. The request itself is the one thing that travels the whole
// way.
//
// Nothing from `next/*` in here, so the parsing stays testable and stays usable
// from proxy.ts.

import type { Correlation } from "./log.ts";
import { REQUEST_ID_HEADER, isValidRequestId } from "./reqid.ts";
import { inboundSpan, type SpanContext } from "./trace.ts";

/**
 * What proxy.ts put on the request.
 *
 * Both halves are nullable and mean it: a route reached outside the proxy's
 * matcher has neither, and saying so by absence is what keeps an empty
 * `request_id` out of the log.
 */
export interface RequestCorrelation {
  requestId: string | null;
  span: SpanContext | null;
}

/**
 * Reads the correlation off a request.
 *
 * The request id is validated rather than trusted even here, and not out of
 * suspicion of proxy.ts: this same function reads the headers Next hands to
 * `onRequestError`, and a value that reached a log line unchecked is a value a
 * stranger could have chosen the shape of.
 */
export function correlationFrom(headers: Headers): RequestCorrelation {
  const raw = headers.get(REQUEST_ID_HEADER);
  return {
    requestId: raw !== null && isValidRequestId(raw) ? raw : null,
    span: inboundSpan(headers),
  };
}

/** The two fields a log line carries. Absent stays absent. */
export function logIds(correlation: RequestCorrelation): Correlation {
  return {
    requestId: correlation.requestId ?? undefined,
    traceId: correlation.span?.traceId,
  };
}

/**
 * Builds a Headers from the plain object Next hands to `onRequestError`.
 *
 * That callback gets `{ [key: string]: string | string[] }` rather than a
 * Headers, and joining a repeated header with a comma is what Headers itself
 * does — which matters for exactly one header here, because a comma is how
 * inboundSpan recognises that a request carried two traceparents and refuses to
 * pick between them.
 */
export function headersFrom(record: Record<string, string | string[]>): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(record)) {
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}
