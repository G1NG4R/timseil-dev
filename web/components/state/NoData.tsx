import { NO_DATA } from "@/lib/state/words";

/**
 * `— NO DATA`. The one place the string is written.
 *
 * It has existed since G4 as a literal in lib/api/health.ts and, until this
 * phase, as a SECOND literal in app/[lang]/page.tsx — two copies of the site's
 * most load-bearing sentence, either of which could have been edited alone.
 * Invariant 1 says `null` renders as `— NO DATA` and never as `0`; that is one
 * claim, so it gets one component and one constant.
 *
 * NOT TRANSLATED, and for the reason design-correction #6 gave `[SOON]`: it is
 * a placeholder token, one string in all three languages, not a word.
 *
 * Deliberately without a dot. This component is for the inside of a cell, where
 * the surrounding label already says what is missing; where a state needs a
 * mark of its own, `<StatusDot state="nodata" …/>` draws the em dash at dot
 * size.
 */
export function NoData() {
  return <span className="st-nodata-text">{NO_DATA}</span>;
}
