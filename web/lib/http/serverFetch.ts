// The web→api hop, and the one line that proves it happened.
//
// DELIBERATELY THIN, and the list of what is missing is the useful part of this
// comment. G4 builds the api client: types from lib/api/schema.d.ts, ETag and
// If-None-Match, `use cache` with tags that a deploy invalidates, RFC 9457
// problem documents read into something a page can render, React.cache() so one
// render does not ask twice. None of that is here. F1b builds the road the ids
// travel on; G4 puts a client on it.
//
// If this file grows a second concern before G4, that is the moment to stop and
// write G4 instead.
//
// WHY THE RESULT HAS A `status: 0` INSTEAD OF A THROW
//
// Because the page has one thing to do either way, and it is invariant 1: show
// `— NO DATA`. A thrown error would make every caller write the same try/catch
// to reach the same answer, and the first caller to forget it would render a 500
// on a page whose only job was to admit it has no number. ADR 0035 says the api
// is briefly gone during step 3 of every rollout, so this is a normal Tuesday
// rather than an exceptional path.
//
// THE UPSTREAM REQUEST ID IS THE BRIDGE.
//
// The api adopts an inbound X-Request-Id only from a trusted proxy, and
// TRUSTED_PROXY_CIDRS is empty in compose.dev.yaml on purpose — so the id sent
// from here does NOT become the api's id. Logging the one it answers with is
// what keeps the build plan's promise ("one request id finds all the lines from
// both services") true in one hop, while the trace id keeps it true in none.

import { headers } from "next/headers";

import { correlationFrom, logIds } from "@/lib/correlation";
import { log } from "@/lib/log";
import { REQUEST_ID_HEADER } from "@/lib/reqid";
import { errorText } from "@/lib/scrub";
import { TRACEPARENT_HEADER, childSpan, renderTraceparent } from "@/lib/trace";

import { upstreamUrl } from "./url.ts";

export interface UpstreamResponse {
  /** The HTTP status, or 0 when there was no answer at all. */
  status: number;
  /** The parsed JSON body, or null when there was none or it was not JSON. */
  body: unknown;
  /** The id the api filed this request under, when it answered. */
  upstreamRequestId: string | null;
}

// Short on purpose. This runs inside a page render, so it is a budget for how
// long a visitor waits before being told there is no number — not a budget for
// how patient we can afford to be.
const DEFAULT_TIMEOUT_MS = 2_000;

export async function serverFetch(
  path: `/${string}`,
  options: { timeoutMs?: number } = {},
): Promise<UpstreamResponse> {
  const correlation = correlationFrom(await headers());
  const ids = logIds(correlation);
  const started = performance.now();

  // Same trace, a new span: without one this container and the api are a single
  // span in F8's view and the hop has no width. A request with no inbound trace
  // is a route outside the proxy's matcher, and it gets no traceparent rather
  // than an invented one.
  const outbound = correlation.span === null ? null : childSpan(correlation.span);

  // Loud rather than silent. A call with no correlation still works and still
  // returns a body, so the failure would look exactly like success — the hop
  // would simply stop being findable, and nothing would say when it stopped.
  // Today it means one thing: serverFetch was called from a path proxy.ts does
  // not match.
  if (correlation.requestId === null && correlation.span === null) {
    log("WARN", "upstream request has no correlation", { path }, ids);
  }

  const requestHeaders = new Headers({ accept: "application/json" });
  if (correlation.requestId !== null) {
    requestHeaders.set(REQUEST_ID_HEADER, correlation.requestId);
  }
  if (outbound !== null) {
    requestHeaders.set(TRACEPARENT_HEADER, renderTraceparent(outbound));
  }

  try {
    const response = await fetch(upstreamUrl(path), {
      headers: requestHeaders,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      // No caching here. G4 decides what may be cached and for how long, and a
      // default chosen in passing is the hardest kind to find later.
      cache: "no-store",
    });

    const upstreamRequestId = response.headers.get(REQUEST_ID_HEADER);
    const body = await readJson(response);

    log(
      "INFO",
      "upstream request",
      {
        method: "GET",
        path,
        status: response.status,
        duration_ms: Math.round(performance.now() - started),
        upstream_request_id: upstreamRequestId,
      },
      ids,
    );

    return { status: response.status, body, upstreamRequestId };
  } catch (err: unknown) {
    // The line the scrubber exists for. undici puts the refused address in the
    // cause of a TypeError, so errorText walks the chain and lib/scrub redacts
    // what it finds — without both halves, every rollout writes the container
    // addresses into the log.
    log(
      "ERROR",
      "upstream request failed",
      {
        method: "GET",
        path,
        status: 0,
        duration_ms: Math.round(performance.now() - started),
        error: errorText(err),
      },
      ids,
    );

    return { status: 0, body: null, upstreamRequestId: null };
  }
}

/**
 * Reads the body as JSON, or gives up quietly.
 *
 * A body that will not parse is not an error worth its own line: the status
 * already says what happened, and the caller's answer to both is the same.
 */
async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    if (text === "") return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
