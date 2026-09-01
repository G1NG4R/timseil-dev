/**
 * The built page against what the design handoff draws — the part that is the
 * same for every page.
 *
 * WHY IT IS A FILE AND NOT A PATTERN TO COPY: see the head of e2e/sweep.ts.
 * The per-width `describe` loop is thirty lines of which two are page-specific,
 * and thirty lines copied once is thirty lines that drift.
 *
 * THE ORACLE IS GENERATED, NOT WRITTEN. tools/gen-sheet-oracle.mjs reads the
 * read-only sheets and carries the whole argument for why they are parsed
 * rather than rendered; the short version is that a comparison depending on
 * unpkg and Google Fonts being up is a comparison that goes red for reasons
 * that are not ours. `make check-contract` refuses drift between the two.
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

/** The four things an entry can ask to be measured, each with only its own fields. */
export type Measure =
  | { kind: "box-width"; selector: string }
  | { kind: "track-count"; selector: string }
  | { kind: "computed"; selector: string; prop: string }
  | { kind: "gap-x"; from: string; to: string };

export interface Entry {
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

export interface Oracle {
  divergenceReasons: Record<string, string>;
  entries: Entry[];
}

/** Tall enough that nothing is scrolled out of the way at any drawn width. */
export const HEIGHT = 1400;

export async function take(page: Page, measure: Measure): Promise<number | string> {
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
  const value = await locator.evaluate(
    (el, name) => getComputedStyle(el).getPropertyValue(name),
    prop,
  );
  return prop === "grid-template-columns" ? value.split(/\s+/)[0] : value;
}

export interface SheetRun {
  /** The generated oracle for this page. */
  oracle: Oracle;
  /** The route to measure. */
  route: string;
  /** Wait until the streamed regions have swapped — during the swap both the
   *  fallback and its replacement are in the document and every locator here
   *  would see two of everything. */
  ready: (page: Page) => Promise<void>;
  /** The widths a sheet actually draws this page at. Asserted, so a shrinking
   *  oracle is a failure rather than a quieter run. */
  drawnWidths: readonly number[];
  /** The floor. It moves up with each phase that adds measurements; it never
   *  moves down without someone saying why. */
  minimumEntries: number;
}

/** Declares one `describe` per width, so a failure names the artboard it came from. */
export function runSheetOracle({
  oracle,
  route,
  ready,
  drawnWidths,
  minimumEntries,
}: SheetRun): void {
  const widths = [...new Set(oracle.entries.map((entry) => entry.width))].sort((a, b) => b - a);

  for (const width of widths) {
    const here = oracle.entries.filter((entry) => entry.width === width);

    test.describe(`what the sheet draws at ${String(width)}`, () => {
      test.use({ viewport: { width, height: HEIGHT } });

      for (const entry of here) {
        const excused = entry.diverges === undefined ? "" : ` — diverges: ${entry.diverges.class}`;

        test(`${entry.id}: ${entry.reading}${excused}`, async ({ page }) => {
          await page.goto(route);
          await ready(page);

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
  test(`the oracle for ${route} still covers every width a sheet draws`, () => {
    expect(widths).toEqual([...drawnWidths]);
    expect(oracle.entries.length).toBeGreaterThanOrEqual(minimumEntries);
  });
}
