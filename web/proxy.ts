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
//
// SINCE G5 IT ALSO MAPS THE ADDRESS ONTO THE TREE, and that is four lines with
// a design decision behind them. English carries no prefix — `/about`, not
// `/en/about` — but the route tree lives under `app/[lang]/`, because Next has
// no notion of an unprefixed default locale. So:
//
//	/about      REWRITTEN to /en/about   the visitor's address is unchanged
//	/en/about   REDIRECTED to /about     308, so one page has one address
//	/de/about   left alone               it already names a real route
//
// THIS IS NOT LANGUAGE NEGOTIATION. `Accept-Language` is not read here or
// anywhere else, and the sheet is why: "KEINE AUTOMATISCHE UMLEITUNG nach
// Browsersprache. Die URL ist die Wahrheit — sonst schickt ein geteilter Link
// jeden woanders hin." Both moves above are decided by the path alone, and the
// same path always yields the same answer.
//
// The decisions themselves are in lib/i18n/routes.ts, where `node --test` can
// reach them — this file holds the two calls. ADR 0046.

import { NextResponse, type NextRequest } from "next/server";

import { canonicalRedirect, rewriteTarget } from "@/lib/i18n/routes";
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

  // The redirect goes first, and the order is load-bearing: `/en/about` must
  // leave as a 308 rather than be rewritten to `/en/en/about`. It is decided on
  // the address the visitor sent, which is the only address either function
  // ever sees — the rewrite below is internal and never comes back through here.
  const canonical = canonicalRedirect(request.nextUrl.pathname);
  if (canonical !== null) {
    const url = request.nextUrl.clone();
    url.pathname = canonical;
    return withRequestId(NextResponse.redirect(url, 308), requestId);
  }

  const target = rewriteTarget(request.nextUrl.pathname);
  const response =
    target === null
      ? NextResponse.next({ request: { headers } })
      : rewrite(request, target, headers);

  return withRequestId(response, requestId);
}

/** Serve `target` while the browser keeps showing the address it asked for.
 *  The header channel is carried through unchanged — a rewritten request is
 *  still this visitor's request, and it has to reach the render with the same
 *  two ids on it. */
function rewrite(request: NextRequest, target: string, headers: Headers): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = target;
  return NextResponse.rewrite(url, { request: { headers } });
}

/** Echoed so a visitor has something to quote, exactly as the api does (ADR
 *  0009). The traceparent is NOT echoed: it is a request header, and the answer
 *  already carries the id a person reads.
 *
 *  A redirect gets it too. It is an answer this container produced, and the one
 *  a visitor would quote if the redirect is the thing that went wrong. */
function withRequestId(response: NextResponse, requestId: string): NextResponse {
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
  // favicon.svg is the whole of public/ today. G5b adds robots.txt, sitemap.xml,
  // feed.xml and og.png, and they belong here for the same reason — they are
  // files, not requests anybody correlates.
  //
  // THE MATCHER IS NOT THE SAME LIST as RESERVED in lib/i18n/routes.ts, and the
  // difference is deliberate. This one decides which requests get an id at all;
  // that one decides which paths never get a language. A path can be excluded
  // here and still need to be in RESERVED — nothing guarantees the two lists
  // stay in step, so RESERVED names every one of them itself rather than
  // trusting this matcher to have caught it first.
  matcher: ["/((?!_next/static|_next/image|favicon\\.svg|healthz).*)"],
};
