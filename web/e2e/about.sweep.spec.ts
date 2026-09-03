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
  // H7b · the rail turns ninety degrees at 720. Six tracks above it, one below.
  { key: "rail", kind: "tracks", selector: ".tl-rail" },
  // And the panel it opens joins the 1080 two-column switch.
  // `:nth-child(6)` AND NOT `.tl-panel`, AND NOT `:visible` EITHER — two traps,
  // one probe.
  //
  // Not `.tl-panel`: five of the six are `display: none`, and a computed track
  // list on a box that was never laid out reads back the SPECIFIED value —
  // `minmax(0, 1fr) 380px` splits into three tokens where the used value is
  // two. The oracle avoids that with `:visible`, which works there because
  // `take()` measures through a LOCATOR.
  //
  // Not `:visible`: this file measures through `page.evaluate`, so the selector
  // reaches `document.querySelector` and `:visible` is a Playwright engine
  // selector rather than CSS — it throws. `gallery.work.spec.ts` wrote that
  // trap down for `:has()` and `:text-is()`; this is the third member of the
  // family, and the first to be met from the other direction.
  //
  // The sixth panel is the one the rail rests on and nothing here clicks, so
  // naming it by position is plain CSS and always the open one.
  { key: "panel", kind: "tracks", selector: ".tl-panel:nth-child(6)" },
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
  // The hero stops being two columns, and the trajectory panel with it — the
  // sixth consumer of a switch layout.css has owned since G1, rather than a
  // seventh geometry. ADR 0066.
  1080: ["hero", "panel"],
  // The chrome switches to the menu button, ADR 0044 — and both of this page's
  // own grids drop at the same width.
  900: ["button", "chromeHead", "nav", "prin", "run"],
  // The display step falls to 34 (K-08), and the rail stands up — measured at
  // 716, so 720 is the nearest declared switch above it. One change of shape on
  // a phone rather than two.
  720: ["h1", "rail"],
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
