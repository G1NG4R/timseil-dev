// The order of the homepage, as data.
//
// HOME.01 of the `Homepage` sheet is the only part of this page the build plan
// calls binding: "Reihenfolge ist in HOME.01 verbindlich, die Marker müssen
// aufsteigend stehen." The sheet says what the test is, in one sentence:
//
//	GEPRÜFT WIRD MIT EINEM BLICK: die vier Marker müssen auf der Seite in
//	aufsteigender Reihenfolge stehen. Das ist der ganze Test.
//
// WHY IN lib/ AND NOT IN content/. `npm test` reads `lib/**` and `styles/**`
// and nothing else, and Node strips types but does not transform JSX — so a
// list that lived beside the page it orders would be a checklist that nothing
// checks. That is the same argument lib/gallery/registry.ts makes about the
// component inventory, and it applies harder here: the inventory decays
// silently, and so does an order. K-26 is that exact defect already having
// happened once — "eine Kopie geriet in die Reihenfolge 02 · 01 · 03 · 04".
//
// AND NOT IN content/case-studies' SHAPE EITHER. That directory exists because
// there is one file per system. There is one homepage.
//
// WHAT IS HERE AND WHAT IS IN en.ts: the ids and the titles are nomenclature —
// LANG.01, "Übersetzt wird Prosa, nicht Nomenklatur" — and a German homepage
// would still read SYS.02 SELECTED WORK. The sentence that says why a section
// is empty is prose, so only its KEY is here.

import type { Messages } from "../i18n/messages/en.ts";

export interface Section {
  /**
   * The marker, exactly as the sheet writes it. THE NUMBER IS THE ORDER — the
   * sheet's own rule, and the reason this is a string and not an index:
   * `SYS.03` is what a reader sees and what the test reads back off the page.
   */
  readonly id: string;
  /** The section's name. Nomenclature, so it is not a dictionary key. */
  readonly title: string;
  /**
   * Which sentence says why the section is empty today.
   *
   * REQUIRED, and that is STATE.05 as a type: "DISABLED SAGT WARUM: 'queued'
   * oder '0 treffer' statt einfach ausgegraut. Ein toter Zustand ohne
   * Begründung ist ein Bug." A shell that could be rendered without one
   * eventually would be.
   */
  readonly reasonKey: keyof Messages;
  /**
   * The phase that fills it. Not rendered — it is why the emptiness has an end,
   * and it is what makes this list reviewable against the build plan rather
   * than against anybody's memory.
   */
  readonly owedBy: string;
}

/**
 * The four markers, in the order HOME.01 fixes and for the reason it gives.
 *
 * BELEG VOR BEHAUPTUNG is the whole argument: the training log stands BEFORE
 * the system list, because it supplies the evidence the list appeals to. The
 * sheet is explicit that reversing the two turns a demonstration back into a
 * self-description.
 *
 * There is no fifth. `HERO` above and `FUSS` below are not markers — they carry
 * no `SYS.NN`, and the sheet counts four.
 */
export const SECTIONS: readonly Section[] = [
  {
    id: "SYS.01",
    title: "TRAINING LOG",
    reasonKey: "homeSys01Why",
    owedBy: "H4",
  },
  {
    id: "SYS.02",
    title: "SELECTED WORK",
    reasonKey: "homeSys02Why",
    owedBy: "H5",
  },
  {
    id: "SYS.03",
    title: "UPLINK",
    reasonKey: "homeSys03Why",
    owedBy: "H5",
  },
  {
    id: "SYS.04",
    title: "LOG",
    reasonKey: "homeSys04Why",
    owedBy: "H5",
  },
];

/**
 * The ordinal a marker carries, or `null` if it is not one of ours.
 *
 * Written as a parser rather than an index lookup so that the test can ask the
 * question the sheet asks — "do these read 01, 02, 03, 04 going down the page"
 * — of a list it did not build.
 */
export function markerNumber(id: string): number | null {
  const match = /^SYS\.(\d{2})$/.exec(id);
  if (match === null) return null;
  return Number.parseInt(match[1], 10);
}
