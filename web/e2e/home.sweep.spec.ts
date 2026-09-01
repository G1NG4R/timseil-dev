/**
 * The homepage against the arithmetic of its own grid, at every width between
 * 1440 and 390.
 *
 * WHAT IS NOT REPEATED HERE. The content column is `.col` on `<main>`, set by
 * the root layout and identical on all ten pages; layout.sweep.spec.ts checks
 * it once against the sheet's table and against the formula between its rows.
 * Running that a second time would be time rather than coverage.
 *
 * WHAT IS: this page's own fingerprint, and its own edge list — which is three
 * switches and not four. widths.ts says why.
 */
import { expect, test } from "@playwright/test";

import { at, edges, moved, type Probe } from "./sweep";
import { HOME, HOME_SWITCHES } from "./widths";

/** What the homepage's switches move. */
const PROBES: readonly Probe[] = [
  { key: "hero", kind: "tracks", selector: ".hero" },
  { key: "term", kind: "computed", selector: ".term-body", prop: "display" },
  { key: "h1", kind: "computed", selector: "main h1", prop: "font-size" },
  { key: "head", kind: "computed", selector: ".head", prop: "height" },
  { key: "nav", kind: "computed", selector: ".nav-desktop", prop: "display" },
  { key: "button", kind: "computed", selector: ".nav-button", prop: "display" },
];

/**
 * What each switch is FOR, as keys.
 *
 * The table exists because a mutation survived without one on the case study:
 * a component that quietly stops taking part in a switch leaves the edge list
 * below completely unchanged. The homepage has one component in the 1080 switch
 * rather than five, so it would be the easiest page on this site for that to
 * happen on.
 */
const SWITCH_MOVES: Record<number, string[]> = {
  // The hero row collapses. One component, not five — but the same width, and
  // that is the sheet's rule rather than an accident: "EIN SCHALTER FÜR ALLE
  // ZWEISPALTER … Kein Bauteil bekommt seinen eigenen Wert." The register
  // computes 1012 for this row and the row switches at 1080 anyway.
  1080: ["hero"],
  // The header switches to the menu button, and its height with it. ADR 0044.
  900: ["button", "head", "nav"],
  // The display step falls to 34, and the terminal frame drops its body — which
  // IS the mobile artboard's strip, drawn from one component instead of two.
  720: ["h1", "term"],
};

test.describe("the homepage changes shape only where it is allowed to", () => {
  test("every edge between 1440 and 390 is one of the three", async ({ page }) => {
    await page.goto(HOME);

    const found = await edges(page, PROBES);

    expect(found, "the homepage changes shape somewhere the sheet does not allow").toEqual([
      ...HOME_SWITCHES,
    ]);
  });

  test("and each switch moves what it is for", async ({ page }) => {
    await page.goto(HOME);

    for (const width of HOME_SWITCHES) {
      const wide = await at(page, width, PROBES);
      const narrow = await at(page, width - 1, PROBES);

      expect(moved(wide, narrow), `across ${String(width)}`).toEqual(SWITCH_MOVES[width]);
    }
  });
});
