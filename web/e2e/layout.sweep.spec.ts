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
 */
import { expect, test, type Page } from "@playwright/test";

import { CASE_STUDY, COLUMN_TABLE, SWITCHES, column } from "./widths";

/** Tall enough that nothing is scrolled by accident at any width. */
const HEIGHT = 1200;

/** The coarse step. 1440 → 390 in 20px increments is 53 samples. */
const STEP = 20;

/**
 * What the layout looks like, as values that can only jump.
 *
 * ONLY DISCRETE VALUES BELONG IN HERE. The content column changes continuously
 * — it is `min(1160px, 100% - 80px)` — so putting its width in the fingerprint
 * would report a jump at every single sample. It is checked separately, against
 * the formula, at every sample; that is the half of this file that covers the
 * space between the sheet's seven rows rather than only on them.
 *
 * Each entry is a thing one of the four switches moves. `null` where a
 * component is not on the page at that width, which is itself a value: the
 * desktop nav disappearing IS the 900 switch.
 */
async function fingerprint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const read = (selector: string, prop: string): string => {
      const el = document.querySelector(selector);
      if (el === null) return "absent";
      return getComputedStyle(el).getPropertyValue(prop);
    };

    const tracks = (selector: string): string => {
      const el = document.querySelector(selector);
      if (el === null) return "absent";
      const value = getComputedStyle(el).gridTemplateColumns;
      // The COUNT, not the widths: the widths follow the window continuously
      // and the count is what a switch changes.
      return value === "none" ? "none" : String(value.split(/\s+/).length);
    };

    return [
      `hero=${tracks(".cs-spec")}`,
      `prob=${tracks(".cs-prob")}`,
      `spec=${tracks(".spec-body")}`,
      `tiles=${tracks(".ops-tiles")}`,
      `cons=${tracks(".cs-constraints")}`,
      `rail=${read(".spec", "position")}`,
      `h1=${read("h1", "font-size")}`,
      `head=${read(".head", "height")}`,
      `nav=${read(".nav-desktop", "display")}`,
      `button=${read(".nav-button", "display")}`,
    ].join(" · ");
  });
}

async function at(page: Page, width: number): Promise<string> {
  await page.setViewportSize({ width, height: HEIGHT });
  return fingerprint(page);
}

/** Which fingerprint keys changed between two prints. */
function moved(wide: string, narrow: string): string[] {
  const a = new Map(wide.split(" · ").map((part) => part.split("=") as [string, string]));
  const b = new Map(narrow.split(" · ").map((part) => part.split("=") as [string, string]));
  return [...a.keys()].filter((key) => a.get(key) !== b.get(key)).sort();
}

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
  720: ["h1", "spec", "tiles"],
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

    // Coarse pass: find the intervals in which the fingerprint changed.
    const samples: { width: number; print: string }[] = [];
    for (let width = 1440; width >= 390; width -= STEP) {
      samples.push({ width, print: await at(page, width) });
    }

    const intervals: { wide: number; narrow: number }[] = [];
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].print !== samples[i - 1].print) {
        intervals.push({ wide: samples[i - 1].width, narrow: samples[i].width });
      }
    }

    // Fine pass: bisect each interval to the exact pixel. The edge is reported
    // as the narrowest width that still LOOKS LIKE the wider layout plus one —
    // i.e. the first width at which the wider layout no longer applies, which
    // is how SWITCHES is defined and how `max-width` queries actually fire.
    const edges: number[] = [];
    for (const interval of intervals) {
      let wide = interval.wide;
      let narrow = interval.narrow;
      const wideprint = await at(page, wide);

      while (wide - narrow > 1) {
        const middle = Math.floor((wide + narrow) / 2);
        if ((await at(page, middle)) === wideprint) wide = middle;
        else narrow = middle;
      }
      edges.push(wide);
    }

    // A switch that fires twice — two components crossing at the same width —
    // is one edge, not two.
    const found = [...new Set(edges)].sort((a, b) => b - a);

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
      const wide = await at(page, width);
      const narrow = await at(page, width - 1);

      expect(moved(wide, narrow), `across ${String(width)}`).toEqual(SWITCH_MOVES[width]);
    }
  });
});
