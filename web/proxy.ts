// Every request that reaches this container gets an identity here, before
// anything renders.
//
// `proxy.ts`, not `middleware.ts` — Next 16 renamed the convention and
// deprecated the old name.
//
// WHAT THIS FILE DOES NOT DO, and it is the shorter list: it does not log.
// Proxy runs BEFORE the response exists, so it knows neither the status nor the
// duration — the two fields the api's access line exists for. A line from here
// would duplicate Traefik's access log and say less than it does. Web logs what
// web does: the upstream call, the errors, the lifecycle.
//
// THE TWO IDS ARE TREATED DIFFERENTLY, on purpose.
//
//	traceparent   adopted from any peer when it parses, continued as a child.
//	              It goes into a log line and nowhere else, lib/trace.ts accepts
//	              nothing but 32 lowercase hex characters in a fixed grammar, and
//	              it is the key that joins this container's lines to the api's.
//	X-Request-Id  always minted, never adopted. The api adopts one from a
//	              TRUSTED proxy because the web tier is meant to pass one
//	              through; web has no such notion — it sits behind Traefik on the
//	              open internet, so an inbound id would be a name a stranger
//	              picks for his own request in our log and in our answers to
//	              other people. Same argument as middleware/requestid.go, with no
//	              exception to carve out. ADR 0037.
//
// There is no `export const runtime` here and there must not be. Next refuses
// one in this file with E1031, and its own message says why: "Proxy always runs
// on Node.js runtime." The absence is the guarantee, not an oversight.

import { NextResponse, type NextRequest } from "next/server";

import { REQUEST_ID_HEADER, createRequestId } from "@/lib/reqid";
import {
  TRACEPARENT_HEADER,
  childSpan,
  createSpan,
  inboundSpan,
  renderTraceparent,
} from "@/lib/trace";

export function proxy(request: NextRequest): NextResponse {
  const inbound = inboundSpan(request.headers);

  // Same trace, our own span. Without a new span id this container and the api
  // are one span in F8's view, and the hop between them has no width.
  const span = inbound === null ? createSpan() : childSpan(inbound);
  const requestId = createRequestId();

  // The request headers are the channel. Next's own guidance for this file is
  // that it "is meant to be invoked separately of your render code" and that
  // information reaches the application through headers rather than shared
  // modules or globals — and lib/drain.ts documents the same hazard from the
  // other side. lib/correlation.ts reads them back.
  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);
  headers.set(TRACEPARENT_HEADER, renderTraceparent(span));

  const response = NextResponse.next({ request: { headers } });

  // Echoed so a visitor has something to quote, exactly as the api does (ADR
  // 0009). The traceparent is NOT echoed: it is a request header, and the
  // answer already carries the id a person reads.
  response.headers.set(REQUEST_ID_HEADER, requestId);

  return response;
}

export const config = {
  // Without a matcher this runs on every request including static assets, and
  // two of the exclusions are load-bearing rather than tidy:
  //
  //   healthz        Traefik asks it once a second PER BACKEND. Minting two ids
  //                  and cloning the headers 86 400 times a day for a probe that
  //                  reads neither is the cost of forgetting this line.
  //   _next/static   immutable, content-hashed, and answered without ever
  //                  reaching a route that could read an id.
  //
  // favicon.svg is the whole of public/ today. When G5 adds robots.txt and
  // sitemap.xml they belong here too — they are files, not requests anybody
  // correlates.
  matcher: ["/((?!_next/static|_next/image|favicon\\.svg|healthz).*)"],
};
