// A Server Component. It hosts two client leaves — the theme switch and a clock
// — and is otherwise static text.

import { Clock } from "@/components/Clock";
import { ThemeSwitch } from "@/components/ThemeSwitch";

/**
 * The meta bar. Byte-identical on all ten pages, in both footer variants — the
 * sheet's short version is this and nothing else.
 *
 * INVARIANT 1 OVER THE SHEET. It draws `BUILD v3.2.1`, a live `ONLINE` and
 * `UPTIME 99.98%`. None of the three is measured, and the api client is G4, so
 * all three read `— NO DATA` and the dot sits neutral without a pulse. The
 * props below are the seam G4 fills; they default to null so that "no data" is
 * the state you get by not saying anything, which is the right way round.
 *
 * The tempting shortcut — reading the build sha out of a NEXT_PUBLIC_ variable
 * — is refused by the no-restricted-syntax rule in eslint.config.mjs unless the
 * name is added to PUBLIC_ENV. /api/health already returns `version`; G4's
 * client is the intended path.
 *
 * `BASED IN LUXEMBOURG · PRIVACY · IMPRINT` is in every meta bar (K-07), which
 * is why the short footer still carries it — and why an unplanned route gets
 * the short footer rather than none.
 */
const NO_DATA = "— NO DATA";

export function FooterMeta({
  build = null,
  uptime = null,
  online = null,
}: {
  build?: string | null;
  uptime?: number | null;
  online?: boolean | null;
}) {
  return (
    <div className="foot-meta">
      <div className="foot-meta-main">
        <span className="foot-cell">BUILD {build ?? NO_DATA}</span>
        <span className="foot-cell">
          <span className="foot-dot" aria-hidden="true" />
          {online === null ? NO_DATA : online ? "ONLINE" : "OFFLINE"}
        </span>
        <span className="foot-cell">
          UPTIME {uptime === null ? NO_DATA : `${uptime.toFixed(2)}%`}
        </span>
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
