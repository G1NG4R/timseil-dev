// Whether this process has been told to stop, and how long it waits before it
// actually does.
//
// WHY WEB NEEDS THIS AT ALL
//
// Next drains in-flight requests on SIGTERM, which is a promise about the
// PROCESS. The promise a visitor cares about is different: the proxy in front
// must stop routing here BEFORE the socket goes away. It does not, on its own —
// Traefik keeps a backend until it notices, and a request that lands on a
// container that has just gone does not come back refused. It hangs, because the
// address no longer belongs to anything.
//
// E5b measured exactly that: with the api fixed (SHUTDOWN_DELAY, issue #65) and
// web untouched, every rollout still lost one or two requests on `/` and none on
// `/api/health`. This file is the same repair on the other container.
//
// WHY globalThis AND NOT A MODULE-LEVEL LET
//
// `output: "standalone"` traces each entry point separately, so instrumentation
// and a route handler can end up holding two copies of this module — and then
// the flag one writes is not the flag the other reads. The failure would be
// silent and would look exactly like the bug this file exists to fix. The global
// is the one thing both bundles provably share.

const KEY = Symbol.for("timseil.draining");

interface Store {
  [KEY]?: boolean;
}

/** True once SIGTERM has arrived. `/healthz` answers 503 from that moment. */
export function isDraining(): boolean {
  return (globalThis as Store)[KEY] === true;
}

export function beginDraining(): void {
  (globalThis as Store)[KEY] = true;
}

// The same variable the api reads, deliberately: it is one pause with one
// meaning, and two names for it would be two numbers to keep in step. Written
// the way Go writes durations because Go is where it is also parsed.
const DEFAULT_DELAY_MS = 3_000;

/**
 * How long to keep accepting after SIGTERM, in milliseconds.
 *
 * Accepts the Go duration spellings that can appear in SHUTDOWN_DELAY — `3s`,
 * `500ms`, `0`. Anything else falls back to the default rather than throwing:
 * this runs inside a signal handler, and a process that crashes while trying to
 * shut down politely is worse than one that waits the usual three seconds.
 */
export function shutdownDelayMs(raw: string | undefined): number {
  const value = (raw ?? "").trim();
  if (value === "") return DEFAULT_DELAY_MS;

  const match = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(value);
  if (!match) return DEFAULT_DELAY_MS;

  const n = Number(match[1]);
  switch (match[2]) {
    case "ms":
      return n;
    case "m":
      return n * 60_000;
    case "s":
      return n * 1_000;
    default:
      // A bare number. Go reads that as nanoseconds and only accepts it for
      // zero; the only unsuffixed value worth honouring here is the same one.
      return n === 0 ? 0 : DEFAULT_DELAY_MS;
  }
}
