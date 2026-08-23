// One JSON line per event, in the shape the api writes, so that one query reads
// both containers.
//
// THE SHAPE IS COPIED, NOT INVENTED. Go's slog JSON handler writes three fixed
// keys first and in this order — `time`, `level`, `msg` — then the attributes in
// the order they were added, and internal/logx appends the correlation last. The
// level is upper case (`DEBUG` `INFO` `WARN` `ERROR`). That is what this
// reproduces, key for key.
//
// The one honest difference: Go writes RFC 3339 with nanoseconds and
// `Date.toISOString()` writes milliseconds. Both are RFC 3339 and F1's
// acceptance greps, so it does not matter yet; from F2 the Alloy pipeline parses
// `time` as a timestamp and BOTH precisions have to pass. That is in the backlog
// against F2, not repaired here by padding zeroes onto a number this process
// does not actually know.
//
// A MISSING ID IS A MISSING FIELD, never an empty one. api/internal/logx makes
// the same choice and says why: an empty request_id in Loki is a value every
// query then has to exclude, where an absent one is a value they can match on.
// Process lifecycle lines have no request, and saying so by silence is honest.
//
// WHAT WEB DOES NOT LOG, and it is a decision rather than an omission: there is
// no access line. proxy.ts runs before the response exists and knows neither
// status nor duration, so a line from there could not carry the two fields the
// api's access line exists for — it would duplicate Traefik's log and say less.
// Web logs what web DOES: the upstream call, the errors, the lifecycle.

import { errorText, scrub } from "./scrub.ts";

export type Level = "DEBUG" | "INFO" | "WARN" | "ERROR";

/** What may appear as an attribute value. Anything else is a call site to fix. */
export type LogValue = string | number | boolean | null | undefined | Error;

export type Attrs = Record<string, LogValue>;

/**
 * The two ids from the request, when there is a request.
 *
 * Passed in rather than read from a global. `output: "standalone"` traces each
 * entry point separately, so two bundles can hold two copies of one module —
 * lib/drain.ts documents the same hazard from the other side — and Next's own
 * guidance for proxy.ts is that information reaches the application through
 * headers, not through shared state. lib/correlation.ts is the one place that
 * turns those headers back into this object.
 */
export interface Correlation {
  requestId?: string;
  traceId?: string;
}

// The numbers are slog's, so that a level comparison here and there mean the
// same thing.
const SEVERITY: Record<Level, number> = { DEBUG: -4, INFO: 0, WARN: 4, ERROR: 8 };

/**
 * Writes one line, if the level clears the threshold.
 *
 * The message goes through the scrubber as well as the attributes: a message
 * built around an error carries whatever the error had.
 */
export function log(level: Level, msg: string, attrs: Attrs = {}, ids: Correlation = {}): void {
  if (SEVERITY[level] < threshold()) return;

  const line: Record<string, string | number | boolean | null> = {
    time: new Date().toISOString(),
    level,
    msg: scrub(msg),
  };

  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    line[key] = scrubValue(value);
  }

  // Last, and at the root of the object, exactly as the Go handler places them.
  if (ids.requestId !== undefined) line.request_id = ids.requestId;
  if (ids.traceId !== undefined) line.trace_id = ids.traceId;

  // console.log rather than process.stdout.write: the process exits immediately
  // after the last line on SIGTERM, and this is the path instrumentation.ts has
  // been using since D1 without losing one.
  console.log(JSON.stringify(line));
}

function scrubValue(value: Exclude<LogValue, undefined>): string | number | boolean | null {
  if (typeof value === "string") return scrub(value);
  if (value instanceof Error) return scrub(errorText(value));
  // Numbers, booleans and null cannot hold an address or a control character.
  return value;
}

/**
 * The minimum level to write, from LOG_LEVEL.
 *
 * The api's variable, not a second one. It is one knob with one meaning, the
 * same way SHUTDOWN_DELAY is shared (lib/drain.ts), and a WEB_LOG_LEVEL would be
 * invisible to tools/check-env.sh — that script derives the required names from
 * api/internal/config/config.go, so a web-only variable could go missing from
 * .env.example and compose without anything noticing.
 *
 * Read per line rather than cached. It costs a property lookup at the volume
 * this site logs, and it keeps the value changeable in a test without a module
 * reset.
 */
function threshold(): number {
  switch ((process.env.LOG_LEVEL ?? "").trim().toLowerCase()) {
    case "debug":
      return SEVERITY.DEBUG;
    case "warn":
      return SEVERITY.WARN;
    case "error":
      return SEVERITY.ERROR;
    // Anything unrecognised included. The api refuses to start on a bad value
    // and names it; web is not the place to duplicate that judgement, and
    // falling back to the documented default is better than falling silent.
    default:
      return SEVERITY.INFO;
  }
}
