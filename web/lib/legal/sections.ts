// The order of `/privacy`, as data.
//
// THE SAME ARGUMENT lib/about/sections.ts AND lib/home/sections.ts MAKE: `npm
// test` reads `lib/**` and `styles/**` and nothing else, so a list of sections
// that lived beside the page it orders would be a checklist nothing checks.
//
// THE ORDER IS THE ARGUMENT HERE TOO, and it is the sheet's. 07.01 says who is
// answerable, 07.02 says what the server writes down without being asked,
// 07.03 says what nobody counts, 07.04 says what stays on the reader's own
// machine, 07.05 says what never leaves this one, 07.06 says what happens when
// they write to me, and 07.07 says what they can do about any of it. Moved
// around, the page answers "what do you take" after "what are your rights",
// which is the order a policy uses when it would rather not be read.
//
// WHY 07.03 IS STILL HERE, having no subject any more. The sheet writes "I
// count page views with [ANALYTICS TOOL]" and there is no such tool: ten
// services in compose.yaml and not one of them counts visitors. Deleting the
// section would have renumbered the five below it and left the reader who came
// looking for the analytics answer without one. So the section keeps its
// number and its title, and the answer is that nothing counts them. An absence
// stated is worth more than an absence tidied away — the same reason the
// imprint lists what does not apply to it instead of omitting it.
//
// WHAT IS HERE AND WHAT IS IN content.ts: ids and titles are the page's
// skeleton and the jump rail is generated from them, so they are here. Every
// sentence is prose and lives in content.ts.

import type { Messages } from "../i18n/messages/en.ts";

export interface Section {
  /** The marker, exactly as the sheet writes it. The number is the order. */
  readonly id: string;
  /**
   * The section's name, in the sheet's own sentence case rather than the
   * upper-case nomenclature the other pages' heads carry. That is the sheet's
   * form and not a slip: `SYS.05.02 WHAT I RUN` is a label, "Who is
   * responsible" is the beginning of a sentence the section finishes.
   */
  readonly title: string;
  /**
   * The short label the jump rail uses, where the title is too long for the
   * 380px column. The sheet draws both and they differ — "What is stored on
   * your device" heads the section, "On your device" stands in the rail.
   */
  readonly railLabel: string;
  /**
   * Which sentence says why the section is empty today, or `null` once it is
   * not empty any more. EXACTLY ONE OF THIS AND `owedBy` IS SET — the pair
   * lib/about/sections.ts, lib/home/sections.ts and lib/gallery/registry.ts
   * already carry, held here by sections.test.ts. STATE.05: a dead state
   * without a reason is a bug.
   *
   * EVERY ROW SHIPS WITH BOTH AT `null`, AND THAT IS THE ASSERTION. No part of
   * this page is owed to a later phase, because a legal text with a `[SOON]`
   * in it is not a legal text. The pair stays because the next section somebody
   * adds will be tempted to be one — `ts404.best` in 07.04 is owed to H11, and
   * the answer there is silence rather than a shell, see content.ts.
   */
  readonly reasonKey: keyof Messages | null;
  /** The phase that fills it, or `null` once one has. Not rendered. */
  readonly owedBy: string | null;
}

/**
 * The seven sections, in the order the Legal sheet draws them on artboard 1b.
 *
 * THE MOBILE ARTBOARD DRAWS FIVE OF THE SEVEN — 07.01 and 07.05 fall away at
 * 390 — and that is a layout decision rather than a different document, so it
 * is not a second list. The page renders all seven at every width; what the
 * sheet's mobile frame really says is that the short version above them is
 * doing the work there, and it is.
 */
export const SECTIONS: readonly Section[] = [
  {
    id: "07.01",
    title: "Who is responsible",
    railLabel: "Responsible",
    reasonKey: null,
    owedBy: null,
  },
  {
    id: "07.02",
    title: "Server logs",
    railLabel: "Server logs",
    reasonKey: null,
    owedBy: null,
  },
  {
    id: "07.03",
    title: "Visitor counting",
    railLabel: "Visitor counting",
    reasonKey: null,
    owedBy: null,
  },
  {
    id: "07.04",
    title: "What is stored on your device",
    railLabel: "On your device",
    reasonKey: null,
    owedBy: null,
  },
  {
    id: "07.05",
    title: "What never leaves this server",
    railLabel: "Nothing leaves",
    reasonKey: null,
    owedBy: null,
  },
  {
    id: "07.06",
    title: "Form and mail",
    railLabel: "Form and mail",
    reasonKey: null,
    owedBy: null,
  },
  {
    id: "07.07",
    title: "Your rights",
    railLabel: "Your rights",
    reasonKey: null,
    owedBy: null,
  },
];

/**
 * The ordinal a marker carries, or `null` if it is not one of this page's.
 *
 * A PARSER AND NOT AN INDEX LOOKUP, so the test can ask the sheet's own
 * question — "do these read 01 through 07 going down the page" — of a list it
 * did not build. `SYS.07` is the page rather than a section and answers `null`,
 * as does `06.01`, which belongs to the imprint.
 */
export function sectionNumber(id: string): number | null {
  const match = /^07\.(\d{2})$/.exec(id);
  if (match === null) return null;
  const number = Number.parseInt(match[1], 10);
  return number === 0 ? null : number;
}

/**
 * The anchor a section is reached by. Derived rather than stored, because a
 * second copy of `07.04` is exactly the copy that would end up pointing at
 * nothing — `legal.spec.ts` walks the rail and holds every href against an id
 * on the page.
 */
export function anchorFor(id: string): string {
  return `s-${id.replace(".", "-")}`;
}
