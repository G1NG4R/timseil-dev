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
