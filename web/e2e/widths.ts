/**
 * The seven widths, in one place, because they are one list.
 *
 * CLAUDE.md, "Prüfbreiten": 1440 · 1081 · 1079 · 1024 · 899 · 719 · 390 — every
 * switch from both sides. 1081/1079 and 900/899 are pairs on purpose: they sit
 * one pixel apart around a breakpoint, so a rule that fires at the wrong
 * comparison is caught rather than straddled.
 *
 * The heights are not a measurement of anything and are chosen to be tall
 * enough that a page is not scrolled by accident.
 */
export const WIDTHS = [1440, 1081, 1079, 1024, 899, 719, 390] as const;

export type Width = (typeof WIDTHS)[number];

/** Below this the mobile menu button exists and the desktop nav does not. */
export const MOBILE_BREAKPOINT = 900;

export function heightFor(width: Width): number {
  return width < MOBILE_BREAKPOINT ? 844 : 900;
}

/**
 * The routes that exist today.
 *
 * Stage H builds thirteen pages and this list grows with them. It is a list
 * rather than a crawl because a crawl cannot tell a route that is missing from
 * a route that was never meant to be there, and the point of an accessibility
 * sweep is to be exhaustive over something stated.
 */
export const ROUTES = [
  "/",
  "/about",
  "/work",
  // H1. The first route with a segment in it, and the first one that is allowed
  // to be indexed besides `/`. content/case-studies is the list of slugs that
  // exist; there is one.
  "/work/timseil-dev",
  "/blog",
  "/contact",
  "/privacy",
  "/imprint",
] as const;

/** The case study every width test drives. One system has a page today. */
export const CASE_STUDY = "/work/timseil-dev";

/** The homepage. H3 — the second route with a spec of its own. */
export const HOME = "/";

/**
 * Where the two-column rows collapse, from the Intermediate Widths sheet.
 *
 * 1080 is not a round number chosen for tidiness: the case study's spec rail is
 * the component that sets it. 400px rail + 80px gap + 517px of reading measure
 * (68 characters at 15px Geist) is 997, in a content column that is the window
 * minus 80 — so the row breaks at 1077, rounded up so that every two-column
 * component in the site switches at one width.
 */
export const RAIL_BREAKPOINT = 1080;

/**
 * The four switches layout.css owns, in the order it declares them.
 *
 * They are the ONLY widths at which this site is allowed to change shape, and
 * that is a rule the Intermediate Widths sheet states rather than a summary of
 * the stylesheet: "EIN SCHALTER FÜR ALLE ZWEISPALTER: 1080 gilt für Hero,
 * Fallstudien-Hero, Spec-Rail, Constraints und Architektur gemeinsam. Kein
 * Bauteil bekommt seinen eigenen Wert, auch wenn er rechnerisch günstiger
 * wäre."
 *
 * Each is the FIRST width at which the wider layout no longer applies — the
 * media queries are written `max-width: 1079`, `899`, `719`, `559`, so the
 * change happens between `n` and `n - 1`.
 */
export const SWITCHES = [1080, 900, 720, 560] as const;

/**
 * The content column, as the sheet tabulates it.
 *
 * `LAYOUT.03`: `width: min(1160px, 100% - 80px)`. Above 1240 the column stands
 * at 1160 and the margins grow; from 1240 down the margin is 40 and the column
 * follows the window. The sheet is explicit that 1240 is not a switch — "der
 * Punkt, an dem sich die beiden Grenzen treffen" — so it needs no media query
 * and appears in no protocol.
 *
 * 390 is the exception and it is a real rule: below 560 the column is
 * `calc(100% - 44px)`, which is the mobile artboard's 22px margin on each side.
 *
 * TRANSCRIBED, NOT DERIVED. lib/chrome.test.ts states the reason: a table the
 * implementation reads is not an oracle, it is a second copy of the answer.
 * `column()` below computes the same numbers a different way, and sweep.spec.ts
 * holds the two against each other.
 */
export const COLUMN_TABLE: readonly { viewport: number; column: number; margin: number }[] = [
  { viewport: 1440, column: 1160, margin: 140 },
  { viewport: 1280, column: 1160, margin: 60 },
  { viewport: 1240, column: 1160, margin: 40 },
  { viewport: 1080, column: 1000, margin: 40 },
  { viewport: 1024, column: 944, margin: 40 },
  { viewport: 960, column: 880, margin: 40 },
  { viewport: 900, column: 820, margin: 40 },
  { viewport: 390, column: 346, margin: 22 },
];

/** The formula, so the sweep can check between the table's rows as well as on them. */
export function column(viewport: number): number {
  if (viewport < 560) return viewport - 44;
  return Math.min(1160, viewport - 80);
}

/**
 * The widths a sheet actually draws the case study at.
 *
 * THREE, NOT TWO, and the third was found in H1b. `case-study.spec.ts` says in
 * its header that "five of the seven widths have no drawing to be compared
 * against" — that was one artboard short. `Case Study Template` draws 1440 and
 * 390; `Intermediate Widths` draws the case study a third time at 1024
 * (artboard `#1c`, `data-screen-label="Fallstudie 1024"`), which is the frame
 * that annotates the single-column rebuild.
 *
 * So four of the seven checked widths have no drawing: 1081, 1079, 899, 719.
 * They are covered by the sweep instead, which asks a different question — not
 * "does this match a picture" but "does this obey the arithmetic of its grid".
 */
export const DRAWN_WIDTHS = [1440, 1024, 390] as const;
