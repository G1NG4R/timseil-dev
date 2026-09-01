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
   * Which sentence says why the section is empty today, or `null` once it is
   * not empty any more.
   *
   * REQUIRED WHILE THE SECTION IS A SHELL, and that is STATE.05 as a type:
   * "DISABLED SAGT WARUM: 'queued' oder '0 treffer' statt einfach ausgegraut.
   * Ein toter Zustand ohne Begründung ist ein Bug." A shell that could be
   * rendered without one eventually would be.
   *
   * H4 IS WHY IT BECAME NULLABLE. SYS.01 is the first of the four to be filled,
   * and an excuse a section no longer needs is worse than no field at all: the
   * sentence would stay in the dictionary, keep compiling, and go on explaining
   * an absence that has ended. So `reasonKey` and `owedBy` are now the pair
   * lib/gallery/registry.ts already carries — EXACTLY ONE OF THEM IS SET, and
   * sections.test.ts holds that. A section that is both built and owed is a
   * bookkeeping error; one that is neither is a shell nobody answers for.
   */
  readonly reasonKey: keyof Messages | null;
  /**
   * The phase that fills it, or `null` once one has. Not rendered — it is why
   * the emptiness has an end, and it is what makes this list reviewable against
   * the build plan rather than against anybody's memory.
   */
  readonly owedBy: string | null;
  /**
   * The way out of the empty state, or `null` where there is none.
   *
   * STATE.05 asks an empty panel for three things — what is missing, why, and a
   * way back — and EmptyState makes the first two required. The third cannot
   * be: two of these four sections have somewhere to send a reader and two do
   * not. A training log has no index of its own and neither does the uplink;
   * inventing a destination for them would be worse than admitting there is
   * none.
   *
   * The paths are the navigation's, held against lib/chrome.ts by the test.
   * Both are still `[SOON]` stubs, and that is deliberately fine: case.css
   * settled it for the breadcrumb in H1 — "a stub is a place, an absent link is
   * not."
   */
  readonly exit: { readonly path: string; readonly labelKey: keyof Messages } | null;
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
    // Filled by H4. The first of the four to lose its excuse — 22 tracks in
    // five modules, read from /api/training, and the derivation of every state
    // in v_track_states rather than in this repository.
    reasonKey: null,
    owedBy: null,
    // Still none, and now for a stronger reason than "not built yet": the
    // training log HAS no index of its own. The systems it points at are
    // SYS.02's, one section down, and inventing a destination for the log
    // itself would be worse than admitting there is none.
    exit: null,
  },
  {
    id: "SYS.02",
    title: "SELECTED WORK",
    // Filled by H5a. The second of the four to lose its excuse — both systems
    // out of /api/systems, each with the state its own row carries, and the
    // link into the case study only where there is one to read.
    reasonKey: null,
    owedBy: null,
    // Still `/work`, and it is still a `[SOON]` stub until H6. That is the
    // section's exit and not a row's: a reader who wants the whole list rather
    // than the two the homepage selects has somewhere to go, and case.css
    // settled in H1 that a stub is a place.
    exit: { path: "/work", labelKey: "navWork" },
  },
  {
    id: "SYS.03",
    title: "UPLINK",
    // Built in H5b. Two blocks with two endpoints and two Suspense boundaries —
    // components/home/Uplink.tsx says why the head is not inside either.
    reasonKey: null,
    owedBy: null,
    // No exit, and it is the sheet's own answer rather than an omission: the
    // calendar and the strip both point at systems this site already lists one
    // section up, and there is no page a reader would rather be on.
    exit: null,
  },
  {
    id: "SYS.04",
    title: "LOG",
    // Built in H5c, and the last of the four to lose its excuse. The one section
    // on this page whose source is not an endpoint: fourteen files in
    // content/posts, three rows, and a head that names the directory the way the
    // others name their path — components/home/Log.tsx has the argument.
    reasonKey: null,
    owedBy: null,
    // LOG points at /blog, and that is not a typo — K-20 unified the label and
    // left the path alone because it is in other people's bookmarks. lib/chrome.ts
    // carries the same split for the navigation.
    exit: { path: "/blog", labelKey: "navLog" },
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
