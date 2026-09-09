/**
 * The 404 against the arithmetic of its own grid, at every width between 1440
 * and 390.
 *
 * WHAT IS NOT REPEATED HERE. The content column is `.col` on `<main>`, set by
 * the root layout on every other page and by `app/global-not-found.tsx` itself
 * on this one; layout.sweep.spec.ts checks it once against the sheet's table.
 *
 * WHAT IS: this page's own fingerprint and its own edge list — which is two
 * switches and not three, because this page has no chrome to switch. widths.ts
 * says what that absence is worth.
 */
import { expect, test } from "@playwright/test";

import { at, edges, moved, type Probe } from "./sweep";
import { NOT_FOUND, NOT_FOUND_SWITCHES } from "./widths";

/** What the 404's switches move. */
const PROBES: readonly Probe[] = [
  // The lead beside the router trace over 1080, stacked under it.
  { key: "main", kind: "tracks", selector: ".nf-main" },
  // The display step, 108 over 720 and 58 under it. This page is the one whose
  // `h1` does not fall to 34, so the probe reads the class rather than `main h1`
  // — the value is the point and both selectors find the same element.
  { key: "display", kind: "computed", selector: ".nf-display", prop: "font-size" },
  // H10b. REPLAY GLITCH, which the mobile artboard does not draw. It reports
  // `absent` below 720 rather than throwing, which is what `Probe` is for: a
  // control disappearing IS the switch, and a probe that failed there would
  // hide the thing it exists to see.
  { key: "replay", kind: "computed", selector: ".nf-replay", prop: "display" },
  // The two ways out, side by side at a desk and stacked full width on the
  // mobile artboard.
  { key: "actions", kind: "computed", selector: ".nf-actions", prop: "flex-direction" },
  // The way out of the page. Five cells, then three, then one — and the count
  // is what a switch changes. H10b declared those counts; before it, `auto-fit`
  // moved them at four widths nothing draws.
  { key: "routes", kind: "tracks", selector: ".nf-routes-list" },
  // The three type steps artboard `1b` draws and layout.css carries. They are
  // page-local classes rather than shared components, which is the whole reason
  // they may step here at all — `.btn` draws at 10.5 on the same artboard and
  // does NOT step, and the oracle records that refusal rather than this file.
  { key: "status", kind: "computed", selector: ".nf-status", prop: "font-size" },
  { key: "lede", kind: "computed", selector: ".nf-lede", prop: "font-size" },
  { key: "log", kind: "computed", selector: ".nf-log", prop: "font-size" },
];

/**
 * What each switch is FOR, as keys.
 *
 * The table exists because a mutation survived without one on the case study: a
 * component that quietly stops taking part in a switch leaves the edge list
 * below completely unchanged.
 */
const SWITCH_MOVES: Record<number, string[]> = {
  // The lead stops standing beside the trace, and the route list goes from five
  // columns to three. `.nf-main` joined the four other two-column rows in
  // layout.css rather than taking a value of its own, and the list joined the
  // same edge rather than jumping wherever `auto-fit` happened to jump — both
  // are that file's standing rule: "Kein Bauteil bekommt seinen eigenen Wert."
  1080: ["main", "routes"],
  // SEVEN COMPONENTS ON ONE EDGE, which is the same rule read the other way
  // round: not one of them got an edge of its own. The display step falls 108 →
  // 58 (#247), REPLAY GLITCH goes away, the ways out stack full width, the
  // route list becomes one column, and three page-local type sizes take the
  // mobile artboard's step. Every one of the seven is something `1b` draws, and
  // this switch already existed to carry all of them.
  720: ["actions", "display", "lede", "log", "replay", "routes", "status"],
};

test.describe("the 404 changes shape only where it is allowed to", () => {
  test("every edge between 1440 and 390 is one of the two", async ({ page }) => {
    await page.goto(NOT_FOUND);

    const found = await edges(page, PROBES);

    expect(found, "the 404 changes shape somewhere the sheet does not allow").toEqual([
      ...NOT_FOUND_SWITCHES,
    ]);
  });

  test("and each switch moves what it is for", async ({ page }) => {
    await page.goto(NOT_FOUND);

    for (const width of NOT_FOUND_SWITCHES) {
      const wide = await at(page, width, PROBES);
      const narrow = await at(page, width - 1, PROBES);

      expect(moved(wide, narrow), `across ${String(width)}`).toEqual(SWITCH_MOVES[width]);
    }
  });
});
