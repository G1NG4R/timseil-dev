// The order of `/about`, as data.
//
// THE SAME ARGUMENT lib/home/sections.ts MAKES, one page over: `npm test` reads
// `lib/**` and `styles/**` and nothing else, so a list of sections that lived
// beside the page it orders would be a checklist nothing checks. K-26 is that
// defect having already happened once on the homepage — "eine Kopie geriet in
// die Reihenfolge 02 · 01 · 03 · 04".
//
// THE MARKERS ARE THREE-PART HERE AND TWO-PART THERE, and that is the sheet's
// own form rather than a variation: the homepage numbers its sections `SYS.01`
// through `SYS.04`, and About is `SYS.05` — one system — whose sub-sections are
// `SYS.05.01` through `SYS.05.04`. So the parser below is not the homepage's,
// and the two lists cannot be merged into one table without one of them lying
// about its own numbering.
//
// WHAT IS HERE AND WHAT IS IN en.ts: ids and titles are nomenclature —
// LANG.01, "Übersetzt wird Prosa, nicht Nomenklatur" — and a German About page
// would still read SYS.05.02 WHAT I RUN. The sentence that says why a section
// is empty is prose, so only its KEY is here.

import type { Messages } from "../i18n/messages/en.ts";

export interface Section {
  /** The marker, exactly as the sheet writes it. The number is the order. */
  readonly id: string;
  /** The section's name. Nomenclature, so it is not a dictionary key. */
  readonly title: string;
  /**
   * The line on the right of the head, or `null` where the sheet draws none.
   *
   * NOMENCLATURE, AND ONLY WHERE IT DESCRIBES THE PAGE. H2a's rule, kept: a
   * meta that describes the DRAWING rather than the page is a label for
   * something absent. The sheet gives TRAJECTORY "SELECT A YEAR · ← → TO STEP ·
   * DATES ARE PLACEHOLDERS" — three statements about a rail that does not exist
   * until H7b, so the section carries none until it does.
   */
  readonly meta: string | null;
  /**
   * Which sentence says why the section is empty today, or `null` once it is
   * not empty any more. EXACTLY ONE OF THIS AND `owedBy` IS SET — the pair
   * lib/home/sections.ts and lib/gallery/registry.ts already carry, and
   * sections.test.ts holds it here too. STATE.05: a dead state without a reason
   * is a bug.
   */
  readonly reasonKey: keyof Messages | null;
  /** The phase that fills it, or `null` once one has. Not rendered. */
  readonly owedBy: string | null;
}

/**
 * The four sub-sections, in the order the About sheet draws them.
 *
 * THERE IS NO FIFTH. The hero above and the contact block below carry no
 * `SYS.05.NN`, and the sheet counts four.
 */
export const SECTIONS: readonly Section[] = [
  {
    id: "SYS.05.01",
    title: "TRAJECTORY",
    // BUILT IN H7b, AND THE META ARRIVED WITH THE CONTROL IT DESCRIBES. H7a
    // carried none because the sheet's line — "SELECT A YEAR · ← → TO STEP ·
    // DATES ARE PLACEHOLDERS" — was three statements about a rail that did not
    // exist. Two of the three are now true and the third is not: there are no
    // dates to be placeholders FOR, so the line says what the control does and
    // stops. The arrows are the sheet's own and they are literal — a radio
    // group answers them natively.
    meta: "SELECT A STATION · ← → TO STEP",
    reasonKey: null,
    owedBy: null,
  },
  {
    id: "SYS.05.02",
    title: "WHAT I RUN",
    // `[SPEC]` IS GONE FROM THIS LINE ON PURPOSE. The sheet writes "ONE VPS ·
    // [SPEC] · ADMINISTERED BY ME", and the bracket wants the host's size. That
    // is the current state of this machine, and CLAUDE.md's rule is that no
    // outward surface carries it — not the README, not an ADR, and not a page.
    // What is left is the shape of the arrangement, which ADR 0008 already
    // publishes.
    meta: "ONE VPS · ADMINISTERED BY ME",
    reasonKey: null,
    owedBy: null,
  },
  {
    id: "SYS.05.03",
    title: "HOW I WORK",
    // The sheet draws no meta here, and it is right not to: four principles are
    // not a count anybody needs above them.
    meta: null,
    reasonKey: null,
    owedBy: null,
  },
  {
    id: "SYS.05.04",
    title: "OFF-SYSTEM",
    meta: null,
    // The one human moment on the page, and the only section whose content is
    // nobody's to derive. The sheet draws a bracketed German paragraph and three
    // rows of which two are brackets and the third names a system that does not
    // exist. K2 is the content phase; until it runs, the section says so.
    reasonKey: "aboutOffSystemSoon",
    owedBy: "K2",
  },
];

/**
 * The ordinal a marker carries, or `null` if it is not one of this page's.
 *
 * A PARSER AND NOT AN INDEX LOOKUP, so the test can ask the sheet's own
 * question — "do these read 01, 02, 03, 04 going down the page" — of a list it
 * did not build. `SYS.05` on its own is the page, not a section, and answers
 * `null` like anything else that is not a sub-marker.
 */
export function subMarkerNumber(id: string): number | null {
  const match = /^SYS\.05\.(\d{2})$/.exec(id);
  if (match === null) return null;
  return Number.parseInt(match[1], 10);
}
