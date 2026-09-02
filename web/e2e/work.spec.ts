/**
 * `/work` at every checked width.
 *
 * WHAT THIS PAGE CAN AND CANNOT BE ASKED HERE. The rig runs a production build
 * with no api — playwright.config.ts says so — so the list is an outage panel
 * at every width and no `.work-row` is ever in the document. That is not a gap
 * in the coverage, it is the half of this page that only the gallery can show:
 * e2e/gallery.work.spec.ts asserts the rows, and this file asserts everything
 * that is true whether or not an answer arrives.
 *
 * WHICH IS MORE OF THE PAGE THAN IT SOUNDS. The head, the counter, the empty
 * panel, the legend and the way to a conversation are all here — and three of
 * those five are the ones a visitor meets when the api is down, which is
 * exactly the state nobody looks at until it happens.
 */
import { expect, test, type Page } from "@playwright/test";

import { settled, WORK_REGIONS } from "./streaming";
import { WORK } from "./widths";

/** The width this project is running at. home.spec.ts's idiom, unchanged. */
function widthOf(page: Page): number {
  const size = page.viewportSize();
  if (size === null) throw new Error("no viewport");
  return size.width;
}

test.beforeEach(async ({ page }) => {
  await page.goto(WORK);
  await settled(page, WORK_REGIONS);
});

test("the page has exactly one h1, and it is the page's own title", async ({ page }) => {
  // The 390 artboard writes `<h2>` for these words and the 1440 artboard writes
  // `<h1>`. Shipping that would give a phone a document with no level-one
  // heading, so the canvas artefact is not followed — WorkHeader says so.
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("main h1")).toHaveText("Selected work");
});

test("nothing on this page is wider than the window", async ({ page }) => {
  // THE ASSERTION THAT FOUND THE STAT RAIL. Four tiles each holding a 130px
  // non-wrapping `— NO DATA` do not fit a 346px column, and at 390 the document
  // came out 49px wider than the viewport. The rail collapses to one tile when
  // there is nothing to count, and this is what says so.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(overflow.scrollWidth, "something overflows horizontally").toBeLessThanOrEqual(
    overflow.clientWidth,
  );
});

test("the counter names its source even when it cannot count", async ({ page }) => {
  // There is no api here, so this is the failed read rather than the wait — and
  // the two say the same thing on purpose. `— NO DATA` in place of the numbers,
  // and the endpoint still named, so a reader can see where to check.
  await expect(page.locator(".work-count")).toHaveText(
    "— NO DATA · FIGURES FROM /api/systems",
  );
});

test("the stat rail says nothing rather than zero when nothing arrived", async ({ page }) => {
  // `00` is a measurement: it says the api answered and there are none. The
  // tiles had not measured anything, and for one build they printed `00 SYSTEMS`
  // over a counter reading `— NO DATA` — two claims about one answer.
  const values = page.locator(".work-stat dd");

  await expect(values).toHaveCount(1);
  await expect(values).toHaveText("— NO DATA");
});

test("the failed list explains itself and names the endpoint", async ({ page }) => {
  // STATE.05: an empty thing owes a reason. An empty list would read as "there
  // are no systems", which is a claim about the work; what happened is that the
  // api did not answer, which is a claim about the api.
  const panel = page.locator(".st-empty-panel");

  await expect(panel).toHaveCount(1);
  await expect(panel.locator(".st-empty-head")).toHaveText("— NO DATA");

  const reason = (await panel.locator(".st-empty-reason").innerText()).trim();
  expect(reason.length).toBeGreaterThan(30);
  expect(reason).toContain("/api/systems");
});

test("the legend defines every state word the rows can carry", async ({ page }) => {
  // THE REASON #289 HAD TO BE CLOSED IN THIS PHASE. A legend cannot define a
  // word the page has no way to draw, and this page draws all three of the
  // contract's system states.
  const words = page.locator(".work-legend .st-word");

  await expect(words).toHaveText(["LIVE", "IN BUILD", "QUEUED"]);
});

test("the legend and the way out survive an outage", async ({ page }) => {
  // Both are prerendered into the static shell because neither reads anything.
  // A reader whose api is down still gets the vocabulary and a way to a
  // conversation — the half of an outage this site keeps having to remember it
  // owes.
  await expect(page.locator(".work-legend")).toHaveCount(1);
  await expect(page.locator(".work-legend-exit")).toHaveAttribute("href", "/");
  await expect(page.locator(".work-contact a")).toHaveAttribute("href", "/contact");
});

test("the contact line is a sentence with a link in it", async ({ page }) => {
  // Routes gap #06. The matrix records `/work → /contact` as a cross-reference
  // that exists; the sheet draws the sentence and forgets the anchor. This is
  // what says which of the two shipped.
  const line = page.locator(".work-contact");

  await expect(line).toHaveCount(1);
  expect((await line.innerText()).trim().length).toBeGreaterThan(40);
  await expect(line.locator("a")).toHaveCount(1);
});

test("nothing here links into a page that does not exist", async ({ page }) => {
  // Invariant 5, as a count rather than a hope. A missing link is invisible in a
  // screenshot; an extra one is not, and `/blog/<slug>` is a 404 until H9.
  await expect(page.locator('main a[href*="/blog/"]')).toHaveCount(0);
  await expect(page.locator('main a[href="/work/vat-check"]')).toHaveCount(0);
});

test("the header does not offer the page the reader is on", async ({ page }) => {
  // K-05: the active entry is white and cyan stays hover and action. `/work` is
  // the first page other than a case study where an entry is active at all.
  const active = page.locator(".nav-desktop [aria-current='page']");

  if (await active.count()) await expect(active).toHaveText("WORK");
});

test("the h1 is the step K-08 gives this page", async ({ page }) => {
  // "Zwei Stufen: 62 für Startseite und About, 52 sonst, mobil 34." globals.css
  // sets 62 on the element, work.css drops it to 52 with `:where()` so that
  // layout.css can still drop it to 34 under 720 — source order, not
  // specificity.
  const expected = widthOf(page) < 720 ? "34px" : "52px";

  await expect(page.locator("main h1")).toHaveCSS("font-size", expected);
});
