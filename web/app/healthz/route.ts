// The readiness probe Traefik asks, once a second, per backend.
//
// NOT `/`. A health check that renders the homepage every second is a page
// render every second, and from stage H that page is not cheap. This route
// answers one question and touches nothing: is this container still willing to
// be sent work.
//
// 200 normally, 503 from the moment SIGTERM arrives — while the listener is
// still open and still answering everything else. That overlap is the whole
// point; lib/drain.ts says why.

import { connection } from "next/server";

import { isDraining } from "@/lib/drain";

/**
 * Never prerendered and never cached. A statically optimised readiness probe is
 * a file on disk that says "ready" after the process has stopped being ready,
 * which is worse than having no probe at all.
 *
 * `export const dynamic = "force-dynamic"` said that until G4, when Cache
 * Components made route segment configs an error. `connection()` says the same
 * thing and says it better: the danger here was never caching, it was being
 * answered without a request having arrived, and that is the sentence this
 * function is.
 *
 * It has to be `await`ed before `isDraining()` and not after. Draining state is
 * module state, not a request API, so nothing else in this handler would stop
 * the prerender — the call is load-bearing rather than ceremonial.
 */
export async function GET(): Promise<Response> {
  await connection();

  const draining = isDraining();
  return new Response(draining ? "shutting down\n" : "ready\n", {
    status: draining ? 503 : 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
