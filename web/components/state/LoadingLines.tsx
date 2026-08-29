import type { CSSProperties } from "react";

import { loadingLines } from "@/lib/state/lines";

/**
 * What stands where an answer will be.
 *
 * STATE.05: "Kein Spinner. Die Seite sagt, was sie holt und woher", and
 * "skeleton hält die exakte höhe". Both halves are here: two lines that name
 * the fetch and the address, and a reserved height so nothing below moves when
 * the answer lands.
 *
 * `lines` is what the ANSWER will need, not what this placeholder draws. Two is
 * the default because that is what this component itself renders; a caller
 * standing in for a six-line table passes six and gets six lines of room.
 *
 * A SPINNER WOULD SAY LESS THAN THIS AND COST MORE. "source: ops-api
 * /api/health" is a claim a reader can go and check, which is the only kind
 * this site makes.
 */
export function LoadingLines({
  what,
  source,
  lines = 2,
}: {
  what: string;
  source: string;
  lines?: number;
}) {
  return (
    <div
      className="st-wait"
      // The reserved height, as a number the stylesheet multiplies by one line
      // of monospace. Inline because it is data, not a design decision —
      // invariant 8 is about colours, radii and durations, and this is a count.
      style={{ "--st-lines": lines } as CSSProperties}
      role="status"
      aria-live="polite"
    >
      <ul className="st-log">
        {loadingLines(what, source).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
