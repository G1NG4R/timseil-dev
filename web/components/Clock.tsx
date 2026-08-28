// 'use client' because a clock is the one thing on this site the server is
// structurally unable to render: whatever time it picked would already be wrong
// by the time the HTML arrived, and it would differ from what the browser
// computes a moment later. The server's job here is to render the placeholder
// and get out of the way.
"use client";

import { useSyncExternalStore } from "react";

import {
  clockServerSnapshot,
  clockSnapshot,
  subscribeClock,
} from "@/lib/clock";

/**
 * `UTC HH:MM:SS`, ticking once a second.
 *
 * THE HYDRATION TRAP, AND WHY THIS SHAPE CLOSES IT. React renders
 * `getServerSnapshot` during hydration, not `getSnapshot`. So the server HTML
 * says `--:--:--`, the hydration render says `--:--:--`, they match by
 * construction, and the first real time appears in the render after commit.
 * There is no divergent tree at any point — which is a different thing from a
 * warning being suppressed, and it is the acceptance criterion of this phase.
 *
 * `suppressHydrationWarning` below is therefore NOT LOAD-BEARING. It is on the
 * one element whose text could ever diverge, scoped as narrowly as the API
 * allows — the attribute covers an element's own attributes and its direct text
 * content, so a span whose only child is the string is the smallest it goes. It
 * is documentation of where the risk lives, not the thing containing it. Anyone
 * tempted to "simplify" the store on the grounds that the suppression handles
 * this should read lib/clock.ts first.
 *
 * The word `UTC` sits OUTSIDE the ticking span, as the Chrome sheet draws it.
 * That is not only fidelity: it keeps the suppressed element down to the eight
 * characters that actually change.
 *
 * All three clocks on a page — header, footer meta bar, mobile menu — share one
 * interval through lib/clock.ts. Three of them ticking independently would drift
 * apart within a viewport.
 */
export function Clock({ className }: { className?: string }) {
  const value = useSyncExternalStore(
    subscribeClock,
    clockSnapshot,
    clockServerSnapshot,
  );

  return (
    <span className={className ? `clock ${className}` : "clock"}>
      UTC{" "}
      <span className="clock-digits" suppressHydrationWarning>
        {value}
      </span>
    </span>
  );
}
