// Two things, and Next decides when each runs: `register` once when a server
// instance starts, `onRequestError` whenever the server captures an error.
//
// The first takes over SIGTERM so that shutting down is graceful from the
// VISITOR's side and not only from the process's. The second is the only place
// web hears about a failure it did not itself catch — a render that threw, a
// route handler that rejected — and since F1b it says so in the same line shape
// as everything else, under the ids proxy.ts put on the request.
//
// WHAT NEXT DOES ON ITS OWN, AND WHY IT IS NOT ENOUGH
//
// Next installs its own SIGTERM handler and drains in-flight requests before
// exiting (self-hosting guide, "graceful shutdown"). That is a true and narrow
// promise: nothing already running gets cut. It says nothing about the requests
// that have not arrived yet, and those are the problem — Traefik keeps routing
// here until it notices the container is gone, and the ones that arrive in the
// meantime hang rather than fail, because the address stops belonging to
// anything. E5b measured one or two of them on every rollout.
//
// So the handler is taken over: NEXT_MANUAL_SIG_HANDLE=true in web/Dockerfile
// stops Next registering its own (server/lib/start-server.js — read there, not
// assumed, because the documented mention of that variable sits under a
// Pages-Router heading and this is an App Router app).
//
// WHAT IS GIVEN UP BY TAKING IT OVER, said out loud
//
// Next's drain goes with it: after the pause this exits rather than waiting for
// in-flight work. That is safe HERE and only because of the order — by the time
// the pause is over, the health check has been answering 503 for seconds and
// Traefik has stopped sending anything, so there is nothing in flight to wait
// for. The pause is what makes the abrupt exit harmless; without it this trade
// would be a bad one.
//
// `next dev` ignores manual signal handling entirely, so none of this affects
// `make dev`.

import { correlationFrom, headersFrom, logIds } from "@/lib/correlation";
import { beginDraining, shutdownDelayMs } from "@/lib/drain";
import { log } from "@/lib/log";
import { errorText } from "@/lib/scrub";

export function register(): void {
  // Node's runtime only. The edge runtime has no process signals, and asking
  // for `process` there is how instrumentation breaks a build.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.NEXT_MANUAL_SIG_HANDLE) return;

  const delay = shutdownDelayMs(process.env.SHUTDOWN_DELAY);

  const stop = (signal: NodeJS.Signals, code: number) => () => {
    beginDraining();
    // One line, on the way out, in the same JSON shape the api uses for the
    // same moment — F1 correlates the two services and a shutdown that is
    // invisible in the logs is a shutdown nobody can explain afterwards.
    //
    // Hand-built JSON until F1b. It was missing `time`, which the api has
    // written since C1, so the two lines were the same shape only to a reader
    // and not to a parser.
    log("INFO", "shutdown requested, readiness is now 503", {
      signal,
      delay: `${String(delay)}ms`,
    });

    // Deliberately not unref'd. The listener is what keeps the loop alive
    // today, so this would fire either way — but the pause is the mechanism
    // here, and a timer that is allowed not to matter is one that stops
    // mattering the day something else about the process changes.
    setTimeout(() => {
      log("INFO", "leaving", { signal });
      process.exit(code);
    }, delay);
  };

  // 143 and 130 are what Next itself exits with for these two, and the numbers
  // are not decoration: 128 + the signal number is the convention every process
  // supervisor reads, and a container that exits 0 on SIGTERM and 0 on a crash
  // has thrown away the difference.
  process.on("SIGTERM", stop("SIGTERM", 143));
  process.on("SIGINT", stop("SIGINT", 130));
}

/**
 * Every server-side error, in the line shape the api uses.
 *
 * The correlation comes off `request.headers` rather than from a store, for the
 * reason lib/correlation.ts gives: this callback runs outside any request scope
 * the application could have entered.
 *
 * Deliberately synchronous. The documentation asks that async work be awaited,
 * and the way to honour that is to have none — this writes one line to stdout
 * and returns. An error reporter that can itself fail slowly is a second
 * failure on top of the one being reported.
 *
 * `err` is `unknown` on purpose in Next's own types: React may have replaced the
 * thrown value during a Server Components render. errorText walks the cause
 * chain and the scrubber runs over the result, which is the whole point — a
 * stack from a failed fetch quotes the address it could not reach.
 */
export function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[]> },
  context: { routerKind: string; routePath: string; routeType: string },
): void {
  const correlation = correlationFrom(headersFrom(request.headers));

  log(
    "ERROR",
    "request failed",
    {
      method: request.method,
      // The path only, and only as far as a log line needs it. Same reasoning
      // and same limit as the api's truncatePath: no route this site mounts
      // comes close, so what is longer was not asked for by anyone.
      path: request.path.slice(0, 256),
      route_path: context.routePath,
      route_type: context.routeType,
      error: errorText(err),
    },
    logIds(correlation),
  );
}
