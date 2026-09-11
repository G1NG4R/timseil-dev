// 'use client' because this panel is the one thing on this page the server is
// structurally unable to render: it shows the visitor's own browser back to
// them, and the server has never met it. The server's job here is to render the
// eight labels and the sentence saying why they are dashes, and then get out of
// the way — the same division of labour as components/Clock.tsx.
"use client";

import { type CSSProperties, useSyncExternalStore } from "react";

import {
  isPending,
  type ReadoutSource,
  readoutServerSnapshot,
  readoutSnapshot,
  subscribeReadout,
} from "@/lib/legal/readout";

/**
 * Everything the module needs, read off the one object the server does not have.
 *
 * THE PROTOCOL IS MEASURED RATHER THAN ASSUMED. The sheet's mock writes
 * `HTTP/2` as a literal; the Navigation Timing entry reports what was actually
 * negotiated, which on this host may well be h3 and on a proxied connection may
 * be http/1.1. A guess in this panel would be the one invented value on a page
 * whose argument is that it has none.
 */
function browserSource(): ReadoutSource {
  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;

  return {
    userAgent: navigator.userAgent,
    languages: navigator.languages,
    language: navigator.language,
    referrer: document.referrer,
    path: location.pathname,
    protocol: navigation?.nextHopProtocol,
    screenWidth: screen.width,
    screenHeight: screen.height,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    now: () => Date.now(),
  };
}

/** Module level, so React sees the same function identity on every render and
 *  does not re-subscribe. lib/clock.ts makes the same point about its own. */
function liveSnapshot() {
  return readoutSnapshot(browserSource);
}

/**
 * `tail -f access.log — your request`.
 *
 * THE HYDRATION TRAP IS CLOSED BY CONSTRUCTION, not by suppression: React
 * renders `getServerSnapshot` during hydration, so the server HTML and the
 * hydration render are the same eight rows of dashes, and the measured values
 * arrive only in the render after commit. There is no divergent tree at any
 * point. G3's acceptance criterion — zero hydration warnings — still holds.
 *
 * THE STAGGER IS THE STYLESHEET'S AND THE ARRIVAL IS JAVASCRIPT'S. ADR 0074:
 * the sheet's mock reveals the rows with `setTimeout(…, 260 + i * 130)`, which
 * would put a duration in a component, walk straight past
 * `prefers-reduced-motion` and — worst of it — make reduced-motion.spec.ts pass
 * while animating. So every row is in the DOM as soon as its value exists, the
 * cascade delays each one by `--i` steps, and `globals.css` switches the whole
 * thing off with one `!important` on the universal selector. The end state is
 * the default, so a visitor who wants no movement gets the complete panel
 * rather than an empty one.
 */
export function Readout({
  title,
  badge,
  footer,
  pending,
  label,
}: {
  title: string;
  badge: string;
  footer: string;
  pending: string;
  label: string;
}) {
  const fields = useSyncExternalStore(subscribeReadout, liveSnapshot, readoutServerSnapshot);
  const waiting = isPending(fields);

  return (
    <div className="lg-term" data-state={waiting ? "pending" : "live"}>
      <div className="lg-term-bar">
        <span className="lg-term-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {/* The card's title is a metaphor, not a command that ran, and it is
            marked as decorative so a screen reader is not told this page shelled
            out to `tail`. The list below carries the real name. */}
        <span className="lg-term-title" aria-hidden="true">
          {title}
        </span>
        <span className="lg-term-badge">{badge}</span>
      </div>

      <div className="lg-term-body">
        <dl className="lg-fields" aria-label={label}>
          {fields.map((field, index) => (
            <div
              className="lg-field"
              key={field.key}
              // A count, not a design decision — invariant 8 is about colours,
              // radii and durations, and the step this multiplies is a token.
              style={{ "--i": index } as CSSProperties}
            >
              <dt>{field.key}</dt>
              <dd data-emphasis={field.emphasis} suppressHydrationWarning>
                {field.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="lg-term-foot">
          <span className="lg-eof" aria-hidden="true">
            EOF
          </span>
          <span className="lg-caret" aria-hidden="true" />
          <span className="lg-count">{footer}</span>
        </p>

        {/* WHY THE REASON IS RENDERED AND HIDDEN RATHER THAN CONDITIONAL: it has
            to be in the server HTML, because the reader who needs it is the one
            whose browser never ran this component. `hidden` is removed the
            moment a reading exists. */}
        <p className="lg-term-pending" hidden={!waiting}>
          {pending}
        </p>
      </div>
    </div>
  );
}
