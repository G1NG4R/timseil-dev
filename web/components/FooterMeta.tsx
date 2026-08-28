// A Server Component. It hosts two client leaves — the theme switch and a clock
// — and one streamed island, and is otherwise static text.

import { Suspense } from "react";

import { Clock } from "@/components/Clock";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { NO_HEALTH, buildText, onlineText, uptimeText, type FooterHealth } from "@/lib/api/health";
import { footerHealthNow } from "@/lib/api/readers";

/**
 * The meta bar. Byte-identical on all ten pages, in both footer variants — the
 * sheet's short version is this and nothing else.
 *
 * G4 FILLED THE SEAM G3 LEFT. The sheet draws `BUILD v3.2.1`, a live `ONLINE`
 * and `UPTIME 99.98%`; none of the three was measured, so all three read
 * `— NO DATA` and the props defaulted to null. They are now read from
 * /api/health — and the defaults stay exactly where they were, because "no data"
 * must remain the state you get by not saying anything.
 *
 * `BASED IN LUXEMBOURG · PRIVACY · IMPRINT` is in every meta bar (K-07), which
 * is why the short footer still carries it — and why an unplanned route gets
 * the short footer rather than none.
 */
export function FooterMeta() {
  return (
    <div className="foot-meta">
      <div className="foot-meta-main">
        {/*
          The three measured cells stream; everything around them is in the
          prerendered shell. <Suspense> adds no element, so the row keeps the
          children the sheet draws, in the order it draws them.

          The fallback is not a loading state. It is the resting state of this
          bar — the same `— NO DATA` a visitor sees when the api cannot answer —
          which is why streaming costs nothing in this design language and why
          there is no spinner to design.
        */}
        <Suspense fallback={<MetaCells {...NO_HEALTH} />}>
          <MetaCellsLive />
        </Suspense>

        <span className="foot-cell">CV → TERMINAL ON / : cv</span>
        <ThemeSwitch />
        <span className="foot-cell">
          ALT <span>/de</span> <span>/fr</span>
        </span>
      </div>

      <div className="foot-meta-side">
        <span className="foot-cell nums">49.6117° N · 6.1300° E</span>
        <Clock />
      </div>

      <div className="foot-legal">
        <span>BASED IN LUXEMBOURG</span>
        <a href="/privacy">PRIVACY</a>
        <a href="/imprint">IMPRINT</a>
      </div>
    </div>
  );
}

/**
 * The three cells, given three values. Decides nothing, fetches nothing.
 *
 * This is the seam ADR 0044 described, unchanged: it renders `— NO DATA` for a
 * null and a number for a number, and it is the same component in the fallback
 * and in the filled state, so the two cannot drift apart.
 */
function MetaCells({ build, uptime, online }: FooterHealth) {
  return (
    <>
      <span className="foot-cell">BUILD {buildText(build)}</span>
      <span className="foot-cell">
        <span className="foot-dot" aria-hidden="true" />
        {onlineText(online)}
      </span>
      <span className="foot-cell">UPTIME {uptimeText(uptime)}</span>
    </>
  );
}

/** The same three cells, with the answer the api gave. */
async function MetaCellsLive() {
  return <MetaCells {...await footerHealthNow()} />;
}
