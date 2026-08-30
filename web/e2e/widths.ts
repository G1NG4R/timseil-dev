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
  "/blog",
  "/contact",
  "/privacy",
  "/imprint",
] as const;
