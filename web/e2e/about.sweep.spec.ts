/**
 * `/about` against the arithmetic of its own grids, at every width between 1440
 * and 390.
 *
 * WHAT IS NOT REPEATED HERE. The content column is `.col` on `<main>`, set by
 * the root layout and identical on all ten pages; layout.sweep.spec.ts checks
 * it once against the sheet's table and against the formula between its rows.
 *
 * WHAT IS: this page's own fingerprint and its own edge list. Unlike `/work`
 * the list is not short because of the rig — this page reads no endpoint, so
 * every component it draws is in the document at every width, and an edge that
 * is missing here is missing from the page.
 *
 * THE 900 EDGE IS THE ONE THIS PHASE HAD TO DERIVE. The sheet draws four tiles
 * at 1440 and two at 390 and says nothing about where they swap; layout.css
 * carries the arithmetic and the measurement that chose 900 over 720. This file
 * is what stops that choice from being quietly undone.
 */
import { expect, test } from "@playwright/test";

import { at, edges, moved, type Probe } from "./sweep";
import { ABOUT, ABOUT_SWITCHES } from "./widths";

/** What About's switches move. */
const PROBES: readonly Probe[] = [
  // The hero: sentence beside the operator card over 1080, stacked under it.
  { key: "hero", kind: "computed", selector: ".hero", prop: "display" },
  // The two grids this page declares, both at the same switch and on purpose.
  { key: "run", kind: "tracks", selector: ".run-grid" },
  { key: "prin", kind: "tracks", selector: ".prin-grid" },
  { key: "h1", kind: "computed", selector: "main h1", prop: "font-size" },
  { key: "chromeHead", kind: "computed", selector: ".head", prop: "height" },
  { key: "nav", kind: "computed", selector: ".nav-desktop", prop: "display" },
  { key: "button", kind: "computed", selector: ".nav-button", prop: "display" },
];

/**
 * What each switch is FOR, as keys.
 *
 * The table exists because a mutation survived without one on the case study: a
 * component that quietly stops taking part in a switch leaves the edge list
 * below completely unchanged. Here it carries a second job — the two grids are
 * asserted to move TOGETHER, which is the whole content of the decision that
 * gave them one switch instead of the two the arithmetic offered.
 */
const SWITCH_MOVES: Record<number, string[]> = {
  // The hero stops being two columns. It is layout.css's rule and not this
  // page's — one hero geometry on this site since G1, and H3 deleted the second.
  1080: ["hero"],
  // The chrome switches to the menu button, ADR 0044 — and both of this page's
  // own grids drop at the same width.
  900: ["button", "chromeHead", "nav", "prin", "run"],
  // The display step falls to 34. K-08.
  720: ["h1"],
};

test.describe("about changes shape only where it is allowed to", () => {
  test("every edge between 1440 and 390 is one of the three", async ({ page }) => {
    await page.goto(ABOUT);

    const found = await edges(page, PROBES);

    expect(found, "about changes shape somewhere the sheet does not allow").toEqual([
      ...ABOUT_SWITCHES,
    ]);
  });

  test("and each switch moves what it is for", async ({ page }) => {
    await page.goto(ABOUT);

    for (const [width, keys] of Object.entries(SWITCH_MOVES)) {
      const edge = Number(width);
      const above = await at(page, edge, PROBES);
      const below = await at(page, edge - 1, PROBES);

      expect(moved(above, below), `the ${width} switch moved the wrong things`).toEqual(keys);
    }
  });
});
