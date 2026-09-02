/**
 * `/work` against the arithmetic of its own grid, at every width between 1440
 * and 390.
 *
 * WHAT IS NOT REPEATED HERE. The content column is `.col` on `<main>`, set by
 * the root layout and identical on all ten pages; layout.sweep.spec.ts checks
 * it once against the sheet's table and against the formula between its rows.
 *
 * WHAT IS: this page's own fingerprint, and its own edge list — which is three
 * switches and not four. widths.ts says why, and the short version is that the
 * fourth belongs to a row this rig cannot produce.
 */
import { expect, test } from "@playwright/test";

import { at, edges, moved, type Probe } from "./sweep";
import { WORK, WORK_SWITCHES } from "./widths";

/** What the work index's switches move. */
const PROBES: readonly Probe[] = [
  // The header grid: deck beside the stat rail over 1080, stacked under it.
  { key: "head", kind: "computed", selector: ".work-head", prop: "display" },
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
 * below completely unchanged.
 */
const SWITCH_MOVES: Record<number, string[]> = {
  // The header stops being two columns. ONE COMPONENT, and the sheet's rule
  // allows that — "EIN SCHALTER FÜR ALLE ZWEISPALTER … Kein Bauteil bekommt
  // seinen eigenen Wert." The row's own 1080 switch drops the preview column,
  // and it is checked in gallery.work.spec.ts because no row is in this
  // document.
  1080: ["head"],
  // The header switches to the menu button, and its height with it. ADR 0044.
  900: ["button", "chromeHead", "nav"],
  // The display step falls to 34. K-08.
  720: ["h1"],
};

test.describe("the work index changes shape only where it is allowed to", () => {
  test("every edge between 1440 and 390 is one of the three", async ({ page }) => {
    await page.goto(WORK);

    const found = await edges(page, PROBES);

    expect(found, "the work index changes shape somewhere the sheet does not allow").toEqual([
      ...WORK_SWITCHES,
    ]);
  });

  test("and each switch moves what it is for", async ({ page }) => {
    await page.goto(WORK);

    for (const width of WORK_SWITCHES) {
      const wide = await at(page, width, PROBES);
      const narrow = await at(page, width - 1, PROBES);

      expect(moved(wide, narrow), `across ${String(width)}`).toEqual(SWITCH_MOVES[width]);
    }
  });
});
