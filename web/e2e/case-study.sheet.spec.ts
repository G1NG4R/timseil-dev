/**
 * The built page against what the design handoff draws.
 *
 * The oracle is `e2e/oracle/case-study.gen.json`, written by
 * `tools/gen-sheet-oracle.mjs` out of the read-only sheets and checked for
 * drift by `make check-contract`. That file carries the whole argument for why
 * the sheet is parsed rather than rendered; the short version is that a
 * comparison depending on unpkg and Google Fonts being up is a comparison that
 * goes red for reasons that are not ours.
 *
 * THREE WIDTHS, NOT TWO, and finding the third was this file's first result.
 * `case-study.spec.ts` says in its header that "five of the seven widths have
 * no drawing to be compared against" — one artboard short. `Case Study Template`
 * draws 1440 and 390; `Intermediate Widths` draws the case study a third time
 * at 1024, in the frame that annotates the single-column rebuild. Four widths
 * have no drawing: 1081, 1079, 899, 719, and `layout.sweep.spec.ts` covers them
 * with a different question.
 *
 * A DIVERGENCE IS A RESULT, NOT AN EXCUSE. An entry whose `expect` is not the
 * sheet's own number carries the decision that moved it, and the generator
 * refuses a divergence whose reason is not written down. The test name says so
 * out loud, so a run that is green because everything was excused reads as such.
 *
 * WHAT IT DOES NOT CHECK: content. `React Router 7`, `PostgreSQL 16` and the
 * German paragraphs are chapter 7's corrections #1, #2 and #4 — the sheets are
 * older than the decisions, and this compares geometry and type, never words.
 */
import { expect, test, type Page } from "@playwright/test";

// Imported rather than read off disk: `resolveJsonModule` is on, Playwright
// transpiles this file to CommonJS where `import.meta` does not exist, and an
// import gives the oracle a compile-time shape as a side effect — a generator
// that started emitting a different document would be a type error rather than
// a run that quietly asserted nothing.
import generated from "./oracle/case-study.gen.json";
import { CASE_STUDY } from "./widths";

/** The four things an entry can ask to be measured, each with only its own fields. */
type Measure =
  | { kind: "box-width"; selector: string }
  | { kind: "track-count"; selector: string }
  | { kind: "computed"; selector: string; prop: string }
  | { kind: "gap-x"; from: string; to: string };

interface Entry {
  id: string;
  sheet: string;
  artboard: string;
  line: number;
  width: number;
  says: string;
  reading: string;
  measure: Measure;
  expect: number | string;
  diverges?: { class: string; sheet: string };
}

interface Oracle {
  divergenceReasons: Record<string, string>;
  entries: Entry[];
}

const oracle = generated as unknown as Oracle;

/** Tall enough that nothing is scrolled out of the way at any of the three widths. */
const HEIGHT = 1400;

async function take(page: Page, measure: Measure): Promise<number | string> {
  if (measure.kind === "gap-x") {
    const from = await page.locator(measure.from).boundingBox();
    const to = await page.locator(measure.to).boundingBox();
    if (from === null || to === null) {
      throw new Error(`no box for ${measure.from} or ${measure.to}`);
    }
    return Math.round(to.x - (from.x + from.width));
  }

  const locator = page.locator(measure.selector).first();

  if (measure.kind === "box-width") {
    const box = await locator.boundingBox();
    if (box === null) throw new Error(`no box for ${measure.selector}`);
    return Math.round(box.width);
  }

  if (measure.kind === "track-count") {
    return locator.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(/\s+/).length);
  }

  // A computed longhand. `grid-template-columns` is the one property that reads
  // back a RESOLVED track list, so it takes the first track only — the rest
  // follow the window and mean nothing on their own.
  const { prop } = measure;
  const value = await locator.evaluate((el, name) => getComputedStyle(el).getPropertyValue(name), prop);
  return prop === "grid-template-columns" ? value.split(/\s+/)[0] : value;
}

// One `describe` per width, so a failure names the artboard it came from.
for (const width of [...new Set(oracle.entries.map((entry) => entry.width))].sort((a, b) => b - a)) {
  const here = oracle.entries.filter((entry) => entry.width === width);

  test.describe(`what the sheet draws at ${String(width)}`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    for (const entry of here) {
      const excused = entry.diverges === undefined ? "" : ` — diverges: ${entry.diverges.class}`;

      test(`${entry.id}: ${entry.reading}${excused}`, async ({ page }) => {
        await page.goto(CASE_STUDY);
        // The streaming swap leaves both the fallback and its replacement in the
        // document for a moment; every locator here would see two of everything.
        await expect(page.locator(".cs-crumb")).toHaveCount(1);

        const got = await take(page, entry.measure);

        const because =
          entry.diverges === undefined
            ? `${entry.sheet}:${String(entry.line)} says \`${entry.says}\``
            : `${entry.sheet}:${String(entry.line)} says \`${entry.says}\`; we draw ` +
              `${String(entry.expect)} because ${oracle.divergenceReasons[entry.diverges.class]}`;

        expect(got, because).toBe(entry.expect);
      });
    }
  });
}

// The oracle is only worth what its refusals are worth, and one of them cannot
// be demonstrated by the generator itself: that the list did not quietly shrink.
test("the oracle still covers every width a sheet draws", () => {
  const widths = [...new Set(oracle.entries.map((entry) => entry.width))].sort((a, b) => b - a);
  expect(widths).toEqual([1440, 1024, 390]);
  expect(oracle.entries.length).toBeGreaterThanOrEqual(26);
});
