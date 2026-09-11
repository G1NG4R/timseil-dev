/**
 * `/privacy` against the arithmetic of its own rows, at every width between
 * 1440 and 390.
 *
 * WHAT IS NOT REPEATED HERE. The content column is `.col` on `<main>`, set by
 * the root layout and identical on every page; layout.sweep.spec.ts checks it
 * once. That is also why 560 is not in this page's switch list.
 *
 * WHAT IS: this page reads no endpoint at all, so every component it draws is
 * in the document at every width and an edge missing here is missing from the
 * page. There is no rig caveat to make, which is true of exactly two pages on
 * this site — this one and the 404.
 *
 * THE POINT OF THIS FILE IN ONE SENTENCE: neither of this page's two rows has a
 * measurement of its own. `.lg-hero` takes `.hero`'s pair and `.lg-body` takes
 * `.cs-prob`'s, and the whole value of that decision is that they move when
 * those move. A ninth geometry introduced later would leave the edge list below
 * unchanged and would be caught by the second test.
 */
import { expect, test } from "@playwright/test";

import { at, edges, moved, type Probe } from "./sweep";
import { PRIVACY, PRIVACY_SWITCHES } from "./widths";

/** What this page's switches move. */
const PROBES: readonly Probe[] = [
  // The hero: headline beside the readout panel over 1080, stacked under it.
  { key: "hero", kind: "tracks", selector: ".lg-hero" },
  // The body: prose beside the jump rail, and the rail itself, which does not
  // stack below the switch — it goes away. A table of contents between the last
  // section and the footer is where one is least useful and most in the way.
  { key: "body", kind: "tracks", selector: ".lg-body" },
  { key: "rail", kind: "computed", selector: ".lg-rail", prop: "display" },
  { key: "h1", kind: "computed", selector: "main h1", prop: "font-size" },
  // The chrome trio, as every page sweep carries it. ADR 0044.
  { key: "chromeHead", kind: "computed", selector: ".head", prop: "height" },
  { key: "nav", kind: "computed", selector: ".nav-desktop", prop: "display" },
  { key: "button", kind: "computed", selector: ".nav-button", prop: "display" },
];

/**
 * What each switch is FOR, as keys.
 *
 * The table exists because an edge list alone cannot see a component that
 * quietly stops taking part in a switch — that mutation survived once on the
 * case study. Here it carries the second job named above: the hero, the body
 * and the rail are asserted to move TOGETHER at 1080, which is the content of
 * the decision to give this page no measurement of its own.
 */
const SWITCH_MOVES: Record<number, string[]> = {
  1080: ["body", "hero", "rail"],
  // The chrome switches to the menu button. This page declares nothing of its
  // own here and that is worth an entry rather than an omission: a legal page
  // is prose, and prose has nothing to rearrange at 900.
  900: ["button", "chromeHead", "nav"],
  // The display step falls to 34 (K-08), and nothing else moves.
  720: ["h1"],
};

test.describe("privacy changes shape only where it is allowed to", () => {
  test("every edge between 1440 and 390 is one of the three", async ({ page }) => {
    await page.goto(PRIVACY);

    const found = await edges(page, PROBES);

    expect(found, "privacy changes shape somewhere the sheet does not allow").toEqual([
      ...PRIVACY_SWITCHES,
    ]);
  });

  test("and each switch moves what it is for", async ({ page }) => {
    await page.goto(PRIVACY);

    for (const [width, keys] of Object.entries(SWITCH_MOVES)) {
      const edge = Number(width);
      const above = await at(page, edge, PROBES);
      const below = await at(page, edge - 1, PROBES);

      expect(moved(above, below), `the ${width} switch moved the wrong things`).toEqual(keys);
    }
  });
});
