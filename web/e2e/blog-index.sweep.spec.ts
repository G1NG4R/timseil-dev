/**
 * `/blog` against the arithmetic of its own grid, at every width between 1440
 * and 390.
 *
 * WHAT IS NOT REPEATED HERE. The content column is `.col` on `<main>`, set by
 * the root layout and identical on every page; layout.sweep.spec.ts checks it
 * once against the sheet's table.
 *
 * WHAT IS: this page's own fingerprint and its own edge list. Unlike `/work`'s,
 * none of its three switches is short of a fourth the rig cannot see — this
 * page asks no endpoint, so everything it draws is in the document.
 */
import { expect, test } from "@playwright/test";

import { at, edges, moved, type Probe } from "./sweep";
import { BLOG, BLOG_SWITCHES } from "./widths";

/** What the log index's switches move. */
const PROBES: readonly Probe[] = [
  // The header grid: deck beside the stat rail over 1080, stacked under it.
  { key: "head", kind: "computed", selector: ".blog-head", prop: "display" },
  // The entry row: five tracks over 1080, stacked under it. This one the rig
  // CAN see, which `/work`'s cannot — there the row needs an api answer.
  //
  // AND IT IS THE ARROW'S `display` RATHER THAN THE ROW'S `grid-template-
  // columns`, which was the first draft and was wrong in a way worth keeping a
  // note about. A computed track list resolves `1fr` to a pixel value, so it
  // changes at EVERY width — the sweep found thirty-nine edges where the sheet
  // allows three. tools/gen-sheet-oracle.mjs states the same trap in its head:
  // "A computed value cannot be compared with an authored one." The arrow is
  // the fifth track and nothing else; it is drawn over 1080 and dropped under
  // it, so its `display` is the switch with no arithmetic in it.
  { key: "row", kind: "computed", selector: ".post-card-exit", prop: "display" },
  // The chip row wraps at a desk and scrolls on a phone.
  { key: "chips", kind: "computed", selector: ".blog-chips", prop: "flex-wrap" },
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
  // THREE COMPONENTS ON ONE EDGE, which is layout.css's rule rather than a
  // coincidence: "Kein Bauteil bekommt seinen eigenen Wert." The header stops
  // being two columns, the entry row stops being five, and the chip row turns
  // from a wrap into a scroller.
  1080: ["chips", "head", "row"],
  // The header switches to the menu button, and its height with it. ADR 0044.
  900: ["button", "chromeHead", "nav"],
  // The display step falls to 34. K-08.
  720: ["h1"],
};

test.describe("the log index changes shape only where it is allowed to", () => {
  test("every edge between 1440 and 390 is one of the three", async ({ page }) => {
    await page.goto(BLOG);

    const found = await edges(page, PROBES);

    expect(found, "the log index changes shape somewhere the sheet does not allow").toEqual([
      ...BLOG_SWITCHES,
    ]);
  });

  test("and each switch moves what it is for", async ({ page }) => {
    await page.goto(BLOG);

    for (const width of BLOG_SWITCHES) {
      const wide = await at(page, width, PROBES);
      const narrow = await at(page, width - 1, PROBES);

      expect(moved(wide, narrow), `across ${String(width)}`).toEqual(SWITCH_MOVES[width]);
    }
  });
});
