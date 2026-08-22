// Runs once when a server instance starts. Here it does exactly one thing:
// take over SIGTERM so that shutting down is graceful from the VISITOR's side
// and not only from the process's.
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

import { beginDraining, shutdownDelayMs } from "@/lib/drain";

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
    console.log(
      JSON.stringify({
        level: "INFO",
        msg: "shutdown requested, readiness is now 503",
        signal,
        delay: `${String(delay)}ms`,
      }),
    );

    // Deliberately not unref'd. The listener is what keeps the loop alive
    // today, so this would fire either way — but the pause is the mechanism
    // here, and a timer that is allowed not to matter is one that stops
    // mattering the day something else about the process changes.
    setTimeout(() => {
      console.log(JSON.stringify({ level: "INFO", msg: "leaving", signal }));
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
