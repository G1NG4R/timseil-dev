/**
 * The page against the arithmetic of its own grid, at every width between 1440
 * and 390 — not against a picture.
 *
 * THE SHEET ASKS FOR THIS TEST IN ONE SENTENCE. `Intermediate Widths`, under
 * the seven-row test protocol:
 *
 *   "Zwischen diesen Breiten wird zusätzlich einmal langsam durchgezogen — von
 *    1440 bis 390 am Fenstergriff. Was dabei springt, ohne in dieser Tabelle zu
 *    stehen, ist ein Fehler."
 *
 * That is a check nobody can run by hand more than once, and it is the only one
 * that can find a switch nobody declared. The `Consistency Check` sheet names
 * the same class of finding as its tenth axis and says where it came from:
 * K-28 and K-29 "entstand erst beim Nachrechnen der Zwischenbreiten und prüft
 * keine Seite gegen eine andere, sondern jede Seite gegen die Arithmetik ihres
 * Rasters."
 *
 * WHY IT IS NOT A SCREENSHOT. A screenshot says two pictures differ. This says
 * at which pixel the layout changed and whether a switch is allowed to be
 * there — and it says it identically on an Arch box and on a CI runner, because
 * it compares numbers rather than glyphs.
 *
 * WHY ONE PROJECT. Resizing the window is the test, so a project that fixes a
 * viewport has nothing to offer it. playwright.config.ts excludes
 * `*.sweep.spec.ts` from the seven width projects for that reason.
 *
 * THE CONTENT COLUMN IS CHECKED HERE AND NOWHERE ELSE. `.col` is set by the
 * root layout and is the same rule on all ten pages, so `home.sweep.spec.ts`
 * does not repeat it: a second run of a page-independent rule is time, not
 * coverage. What that file does carry is its own fingerprint, because what a
 * switch moves is a property of the page.
 */
import { expect, test } from "@playwright/test";

import { HEIGHT, STEP, at, edges, moved, type Probe } from "./sweep";
import { CASE_STUDY, COLUMN_TABLE, SWITCHES, column } from "./widths";

/** What the case study's four switches move. */
const PROBES: readonly Probe[] = [
  { key: "hero", kind: "tracks", selector: ".cs-spec" },
  { key: "prob", kind: "tracks", selector: ".cs-prob" },
  { key: "spec", kind: "tracks", selector: ".spec-body" },
  { key: "tiles", kind: "tracks", selector: ".ops-tiles" },
  { key: "cons", kind: "tracks", selector: ".cs-constraints" },
  { key: "rail", kind: "computed", selector: ".spec", prop: "position" },
  { key: "h1", kind: "computed", selector: "h1", prop: "font-size" },
  { key: "head", kind: "computed", selector: ".head", prop: "height" },
  { key: "nav", kind: "computed", selector: ".nav-desktop", prop: "display" },
  { key: "button", kind: "computed", selector: ".nav-button", prop: "display" },
];

/**
 * What each switch is FOR — the sheet's "WORAUF GESCHAUT WIRD" column, as keys.
 *
 * THIS TABLE EXISTS BECAUSE A MUTATION SURVIVED WITHOUT IT. Setting `.rail` to
 * `position: static` at every width — deleting the sticky behaviour outright —
 * left the edge list untouched, because four other components still change at
 * 1080 and the edge was still found there. The sweep asks WHERE the layout
 * changes; on its own it cannot ask WHAT changed, and a component that quietly
 * stops taking part in a switch is exactly the kind of drift twelve more H
 * phases will produce.
 *
 * It names keys and not values on purpose. The values belong to
 * case-study.spec.ts, which asserts them at 1081/1079 and 719/559 with the
 * reasons attached; two copies of a number is how the two start disagreeing.
 */
const SWITCH_MOVES: Record<number, string[]> = {
  // The five two-column rows collapse together — "EIN SCHALTER FÜR ALLE
  // ZWEISPALTER" — and the rail stops sticking in the same query, because a
  // rail under its section would otherwise stick to the bottom of it.
  1080: ["cons", "hero", "prob", "rail", "spec"],
  // The header switches to the menu button, and its height with it. ADR 0044.
  900: ["button", "head", "nav"],
  // The display step, the first tile wrap — and the spec rail again, which is
  // the entry measurement corrected rather than reasoned: the two-pair grid it
  // takes below 1080 needs 300px per pair, and at a 639px column the second
  // pair would break mid-word, so H1a stacks key over value here as well.
  720: ["cons", "h1", "spec", "tiles"],
  // Two columns cannot divide five; the fifth runs the full width.
  560: ["tiles"],
};

test.describe("the content column follows its formula", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(CASE_STUDY);
  });

  // The sheet's own table, on its own rows. Transcribed in widths.ts and
  // recomputed by `column()`; if the two ever disagree the table wins, because
  // the table is the sheet and the function is ours.
  test("the sheet's seven rows are the widths they say they are", async ({ page }) => {
    for (const row of COLUMN_TABLE) {
      expect(column(row.viewport), `formula at ${String(row.viewport)}`).toBe(row.column);

      await page.setViewportSize({ width: row.viewport, height: HEIGHT });
      const box = await page.locator("main.col").boundingBox();

      expect(box, `no content column at ${String(row.viewport)}`).not.toBeNull();
      expect(Math.round(box?.width ?? 0), `column at ${String(row.viewport)}`).toBe(row.column);
      expect(Math.round(box?.x ?? 0), `margin at ${String(row.viewport)}`).toBe(row.margin);
    }
  });

  // And between them. The sheet tabulates seven points; the rule is a formula,
  // and a formula that only holds at the points somebody wrote down is not the
  // rule that was written.
  test("and every width between them", async ({ page }) => {
    for (let width = 1440; width >= 390; width -= STEP) {
      await page.setViewportSize({ width, height: HEIGHT });
      const box = await page.locator("main.col").boundingBox();
      expect(Math.round(box?.width ?? 0), `column at ${String(width)}`).toBe(column(width));
    }
  });
});

test.describe("nothing changes shape except at a declared switch", () => {
  test("every edge between 1440 and 390 is one of the four", async ({ page }) => {
    await page.goto(CASE_STUDY);

    const found = await edges(page, PROBES);

    expect(found, "the layout changes shape somewhere the sheet does not allow").toEqual([
      ...SWITCHES,
    ]);
  });

  // The other half, and the half a mutation proved was missing: a switch that
  // still fires for four components and has quietly stopped firing for a fifth
  // leaves the edge list above completely unchanged.
  test("and each switch moves what it is for", async ({ page }) => {
    await page.goto(CASE_STUDY);

    for (const width of SWITCHES) {
      const wide = await at(page, width, PROBES);
      const narrow = await at(page, width - 1, PROBES);

      expect(moved(wide, narrow), `across ${String(width)}`).toEqual(SWITCH_MOVES[width]);
    }
  });
});
