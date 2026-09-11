/**
 * `/imprint` against the arithmetic of its own rows, at every width between
 * 1440 and 390.
 *
 * WHAT IS NOT REPEATED HERE. The content column is `.col` on `<main>`, set by
 * the root layout and identical on every page; layout.sweep.spec.ts checks it
 * once. That is also why 560 is not in this page's switch list.
 *
 * WHAT IS: this page reads no endpoint, so every component it draws is in the
 * document at every width and an edge missing here is missing from the page.
 * There is no rig caveat to make, which is true of exactly three pages on this
 * site — this one, `/privacy` and the 404.
 *
 * THE POINT OF THIS FILE IN ONE SENTENCE: this page has one two-column row and
 * it has no measurement of its own. `.lg-body` takes `.cs-prob`'s pair, the
 * same pair `/privacy` takes, and the whole value of that decision is that all
 * three move when it moves. A ninth geometry introduced later would leave the
 * edge list below unchanged and would be caught by the second test.
 *
 * ONE PROBE THE OTHER LEGAL PAGE DOES NOT HAVE: `def`. The operator's label
 * column stops standing beside its value at 720, which is the display step's
 * switch — one width doing two jobs rather than a fifth breakpoint for a label.
 */
import { expect, test } from "@playwright/test";

import { at, edges, moved, type Probe } from "./sweep";
import { IMPRINT, IMPRINT_SWITCHES } from "./widths";

/** What this page's switches move. */
const PROBES: readonly Probe[] = [
  // The body: prose beside the column that holds the rail, the list of what
  // does not apply, and the way to `/privacy`.
  { key: "body", kind: "tracks", selector: ".lg-body" },
  // The rail itself, which does not stack below the switch — it goes away. The
  // two boxes under it stay, because they are the document rather than
  // navigation, and that asymmetry is the reason `.lg-aside` exists.
  { key: "rail", kind: "computed", selector: ".lg-rail", prop: "display" },
  { key: "h1", kind: "computed", selector: "main h1", prop: "font-size" },
  // 06.01's label column: two tracks over the switch, one under it.
  { key: "def", kind: "tracks", selector: ".lg-def-row" },
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
 * case study. Here it carries a second job: the body and the rail are asserted
 * to move TOGETHER at 1080, which is the content of the decision to give this
 * page no measurement of its own.
 */
const SWITCH_MOVES: Record<number, string[]> = {
  // NO `hero` KEY, AND THAT IS THE ONE DIFFERENCE FROM `/privacy`. That page
  // puts a readout panel beside its headline and loses the column here; nothing
  // stands beside this one, so its head is `.lg-head` and has nothing to lose.
  1080: ["body", "rail"],
  // The chrome switches to the menu button. This page declares nothing of its
  // own here and that is worth an entry rather than an omission: a legal page
  // is prose, and prose has nothing to rearrange at 900.
  900: ["button", "chromeHead", "nav"],
  // The display step falls to 34 (K-08), and the operator's label goes above
  // its value rather than beside it.
  720: ["def", "h1"],
};

test.describe("the imprint changes shape only where it is allowed to", () => {
  test("every edge between 1440 and 390 is one of the three", async ({ page }) => {
    await page.goto(IMPRINT);

    const found = await edges(page, PROBES);

    expect(found, "the imprint changes shape somewhere the sheet does not allow").toEqual([
      ...IMPRINT_SWITCHES,
    ]);
  });

  test("and each switch moves what it is for", async ({ page }) => {
    await page.goto(IMPRINT);

    for (const [width, keys] of Object.entries(SWITCH_MOVES)) {
      const edge = Number(width);
      const above = await at(page, edge, PROBES);
      const below = await at(page, edge - 1, PROBES);

      expect(moved(above, below), `the ${width} switch moved the wrong things`).toEqual(keys);
    }
  });
});
