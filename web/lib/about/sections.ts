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
 * The sub-sections, in the order the About sheet draws them — three of the
 * four it counts.
 *
 * THERE IS NO FIFTH. The hero above and the contact block below carry no
 * `SYS.05.NN`.
 *
 * AND SINCE U4 THERE IS NO FOURTH EITHER. `SYS.05.04 OFF-SYSTEM` was the one
 * section on this page whose content was nobody's to derive — the sheet drew a
 * bracketed German paragraph and three rows of which two were brackets, so H7a
 * shipped it as a shell that said whose turn it was and named K2. ADR 0079
 * takes the turn away rather than postponing it: the one human line on this
 * site is a thing Tim writes when he has it, and a section standing empty
 * waiting for it is a promise the page keeps making. It is removed here, not
 * hidden, and sections.test.ts holds the removal against the sheet in writing
 * rather than letting the transcription quietly shrink.
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
    // `[SPEC]` IS GONE FROM THIS LINE ON PURPOSE, AND THE HOST HAS CHANGED
    // UNDER IT. The sheet writes "ONE VPS · [SPEC] · ADMINISTERED BY ME", and
    // the bracket wants the host's size — the current state of this machine,
    // which CLAUDE.md keeps off every outward surface. That argument is
    // unchanged; what moved is which machine the section is about. Since U3
    // the main evidence is talos-prod (ADR 0079), so the line names it and the
    // one fact about it that is neither a measurement nor a route: it is bare
    // metal, and it is mine.
    //
    // THREE WORDS WHERE THERE WERE FIVE, which matters to layout.css: the rule
    // that a section title must not be squeezed into two lines by its own meta
    // was written with this line as the worst case on the site. It no longer
    // is, and the comment there says so.
    meta: "TALOS-PROD · BARE METAL",
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
];

/**
 * The ordinal a marker carries, or `null` if it is not one of this page's.
 *
 * A PARSER AND NOT AN INDEX LOOKUP, so the test can ask the sheet's own
 * question — "do these read 01, 02, 03 going down the page" — of a list it did
 * not build. `SYS.05` on its own is the page, not a section, and answers `null`
 * like anything else that is not a sub-marker.
 *
 * IT STILL READS TWO DIGITS AFTER U4 DROPPED THE FOURTH SECTION. The parser
 * describes the sheet's notation, not the length of the list below it, and a
 * parser narrowed to the markers that happen to exist today would have to be
 * widened again the next time one is added.
 */
export function subMarkerNumber(id: string): number | null {
  const match = /^SYS\.05\.(\d{2})$/.exec(id);
  if (match === null) return null;
  return Number.parseInt(match[1], 10);
}

/**
 * Whether a section answers for itself: filled, or owed by a named phase.
 *
 * THE PREDICATE IS HERE AND NOT IN THE TEST, and U4 is why. `reasonKey` and
 * `owedBy` are independently nullable, so the compiler accepts a section that
 * is both filled and owed, or neither — the defect lib/gallery/registry.ts
 * names for components: a row nobody answers for. Until U4 the test could ask
 * the question of the shipped list and be sure of getting an answer, because
 * two of the four sections were shells. None is now, so a test written that way
 * would only ever see one half of the rule.
 *
 * Exported, it can be asked of a row that does NOT ship — which is how
 * sections.test.ts builds the broken case itself rather than waiting for one to
 * appear. ADR 0057 is the form; the training log's left join is where the same
 * trap was caught one stage earlier.
 */
export function accountedFor(section: Section): boolean {
  return (section.reasonKey === null) === (section.owedBy === null);
}
