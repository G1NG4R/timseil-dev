/**
 * `.04 OPERATIONS` and `.05 RESULT` on the built page.
 *
 * NO SUFFIX, so this file runs at all seven widths, the same as
 * `case-study.arch.spec.ts` and for the same reason: every rule below has a
 * width at which it is the interesting one. Measurements against a drawing live
 * in `case-study.sheet.spec.ts`, which runs at the three widths that have one.
 *
 * IT WAITS ON EVERY STREAMED REGION, and unlike `.02` and `.03` it has to. The
 * grid and the incident log are behind a `<Suspense>` boundary, so between the
 * fallback and its replacement both are in the document — which is exactly the
 * race #279 was paid for twice. `settled()` is imported, never copied; H2a found
 * out what copying it costs.
 *
 * WHAT IT DOES NOT ASSERT IS THE DATA. Production answers `incidents: []` and a
 * window that is mostly `nodata`; the rig runs against a production build with
 * no api at all. So every rule here is about structure and coupling — the count
 * of cells against the count in the caption, a notch against the entry it points
 * at — and none of them can be changed by whether the api answered. The four
 * cell states and a working notch are shown in the gallery instead, which is the
 * one place they exist.
 */
import { expect, test, type Page } from "@playwright/test";

import { settled } from "./streaming";
import { CASE_STUDY } from "./widths";

/** Seven rows. The grid's own shape, and the divisor for its column count. */
const ROWS = 7;

async function widthOf(page: Page): Promise<number> {
  return page.evaluate(() => window.innerWidth);
}

test.beforeEach(async ({ page }) => {
  await page.goto(CASE_STUDY);
  await settled(page);
});

test("both sections are present exactly once and are named by their heads", async ({ page }) => {
  for (const id of ["sec-04", "sec-05"]) {
    const section = page.locator(`section[aria-labelledby="${id}"]`);
    await expect(section).toHaveCount(1);

    // An aria-labelledby pointing at an element that never got its id is a
    // region with no name at all, and it fails silently in every browser.
    const title = page.locator(`#${id}`);
    await expect(title).toHaveCount(1);
    await expect(title).not.toBeEmpty();
  }
});

test("the pipeline is seven stages, numbered in order", async ({ page }) => {
  const stages = page.locator(".pipe-stage");
  await expect(stages).toHaveCount(7);

  // The ordinal is a counter, so it is in no text node — and Chromium reports
  // the AUTHORED `content`, not the resolved digits, so the rendered "01" cannot
  // be read from here at all. `case-study.arch.spec.ts` learned that about the
  // phases; the mechanism is checked end to end instead, because a reset without
  // an increment renders nothing and takes the claim about order with it.
  const counter = await page.locator(".pipeline").evaluate((list) => {
    const title = list.querySelector(".pipe-title");
    return {
      reset: getComputedStyle(list).counterReset,
      increments: [...list.querySelectorAll("li")].map((item) => getComputedStyle(item).counterIncrement),
      content: title === null ? "" : getComputedStyle(title, "::before").content,
    };
  });

  expect(counter.reset).toContain("stage");
  expect(counter.increments).toHaveLength(7);
  for (const increment of counter.increments) expect(increment).toContain("stage");
  expect(counter.content).toContain("counter(stage");
  expect(counter.content).toContain("decimal-leading-zero");

  // Every stage says something. A box with a title and no detail would be the
  // shape the sheet's placeholder timings left behind.
  for (let i = 0; i < 7; i += 1) {
    await expect(stages.nth(i).locator(".pipe-detail")).not.toBeEmpty();
  }
});

test("the pipeline is divided in both directions, at every column count", async ({ page }) => {
  // THE BUG THIS IS WRITTEN AGAINST WAS FOUND IN A SCREENSHOT. With the divider
  // as `border-inline-end` on each box, the row was divided at 1440 and a single
  // undivided column at 390 — seven stages reading as one paragraph. The gap
  // draws it in both directions, so the rule is that neighbours never touch.
  const touching = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll<HTMLElement>(".pipe-stage")];
    let same = 0;
    for (let i = 1; i < boxes.length; i += 1) {
      const a = boxes[i - 1].getBoundingClientRect();
      const b = boxes[i].getBoundingClientRect();
      const sameRow = Math.abs(a.top - b.top) < 1;
      if (sameRow ? b.left - a.right < 0.5 : b.top - a.bottom < 0.5) same += 1;
    }
    return same;
  });
  expect(touching).toBe(0);
});

test("the grid draws the window it says it drew", async ({ page }) => {
  const caption = await page.locator(".ops-label").innerText();
  const cells = await page.locator(".ops-cell").count();

  // THE RIG HAS NO API, so this is normally the empty answer — and the empty
  // answer is the one with a rule of its own. A window of nothing is not a
  // window of zero days: it is not knowing what the window was, and the caption
  // says the placeholder rather than "0 days (0 weeks)", which would be the
  // first invented number on a page built to argue against them.
  if (cells === 0) {
    expect(caption).toContain("— NO DATA");
    expect(caption).not.toMatch(/\d/);
    return;
  }

  // INVARIANT 7, and the reason the caption is computed rather than typed: the
  // window has to stay countable. A caption reading "91 days (13 weeks)" over a
  // grid of twelve columns is the drift, and the two numbers in it are the two
  // things measured here.
  const days = Number(/·\s*(\d+)\s*days/.exec(caption)?.[1] ?? -1);
  const weeks = Number(/\((\d+)\s*weeks\)/.exec(caption)?.[1] ?? -1);

  expect(days).toBe(cells);
  expect(weeks).toBe(Math.ceil(cells / ROWS));

  const columns = await page.evaluate(() => {
    const grid = document.querySelector(".ops-grid");
    return grid === null ? 0 : getComputedStyle(grid).gridTemplateColumns.split(" ").length;
  });
  expect(columns).toBe(weeks);
});

test("the legend names all four kinds of day", async ({ page }) => {
  const items = page.locator(".ops-legend li");
  await expect(items).toHaveCount(4);

  const states = await items.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-state")));
  expect(new Set(states)).toEqual(new Set(["ok", "degraded", "outage", "nodata"]));

  // The legend's swatch and the grid's cell must be the same picture, or the key
  // explains a grid that is not there. Coupled through `data-state` in the
  // stylesheet, so what is checked is that the two agree — not what either is.
  const agree = await page.evaluate(() => {
    const cellFill = (state: string) => {
      const el = document.querySelector(`.ops-cell[data-state="${state}"]`);
      return el === null ? null : getComputedStyle(el).backgroundColor;
    };
    const swatchFill = (state: string) => {
      const el = document.querySelector(`.ops-legend [data-state="${state}"] .ops-swatch`);
      return el === null ? null : getComputedStyle(el).backgroundColor;
    };
    return (["ok", "degraded", "outage", "nodata"] as const)
      .map((s) => ({ s, cell: cellFill(s), swatch: swatchFill(s) }))
      .filter((x) => x.cell !== null && x.cell !== x.swatch)
      .map((x) => x.s);
  });
  expect(agree).toEqual([]);
});

test("the incident log explains itself when it is empty", async ({ page }) => {
  const entries = await page.locator(".incident").count();
  if (entries > 0) {
    // Every entry carries the three things invariant 4 requires. The api drops
    // an incomplete one before it gets here; this says the page would show the
    // difference if it did not.
    for (const label of ["CAUSE", "FIX", "POST-MORTEM"]) {
      await expect(page.locator(".incident-body dt", { hasText: label }).first()).toBeVisible();
    }
    return;
  }

  // The state that actually ships. STATE.05: an empty list owes a reason, and a
  // panel that could render without one eventually would.
  const empty = page.locator("section[aria-labelledby='sec-04'] .st-empty-panel");
  await expect(empty).toHaveCount(1);
  await expect(empty.locator(".st-empty-reason")).not.toBeEmpty();
});

test("the result is two lists and a card that does not point into nothing", async ({ page }) => {
  const panels = page.locator(".cs-result .cs-panel");
  await expect(panels).toHaveCount(2);

  // Both lists say something. A `.05` with an empty "what I would change" would
  // be the section quietly becoming a list of wins.
  for (let i = 0; i < 2; i += 1) {
    expect(await panels.nth(i).locator("li").count()).toBeGreaterThan(0);
  }

  // The next system has no page — `vat-check` is queued and the registry gives
  // it none — so the card links to the index, and a link to `/work/<anything>`
  // here would be a 404 by construction.
  const card = page.locator(".cs-next");
  await expect(card).toHaveCount(1);
  const href = (await card.getAttribute("href")) ?? "";
  expect(href).toMatch(/\/work$/);
});

test("neither section says anything the repository stopped believing", async ({ page }) => {
  for (const id of ["sec-04", "sec-05"]) {
    const text = await page.locator(`section[aria-labelledby="${id}"]`).innerText();

    // The first six are the sheets' own stale copy. The last four are the DATA
    // SAFETY panel, which is not built: three of its four rows are named in the
    // `Operations` sheet's own list of what must not be published, and a phase
    // that quietly reinstated one of them would leave no other trace.
    for (const stale of [
      "React Router",
      "PostgreSQL 16",
      "SQLite",
      "metrics stack",
      "go test ./...",
      "compose pull",
      "pg_dump",
      "Restore drill",
      "DATA SAFETY",
      "Backup",
    ]) {
      expect(text, `${id} contains "${stale}"`).not.toContain(stale);
    }
  }
});

test("nothing here needs JavaScript to be operated", async ({ page }) => {
  // The phase's central decision, seen from the page. Every control in `.04` is
  // an anchor: no button, no [tabindex], no element with a click handler bound
  // by a client component — which is what "zero bytes of our own JavaScript"
  // means in markup rather than in a bundle report.
  const section = "section[aria-labelledby='sec-04']";
  await expect(page.locator(`${section} button`)).toHaveCount(0);
  await expect(page.locator(`${section} [tabindex]`)).toHaveCount(0);

  const notches = await page.locator(".ops-notch").count();
  const focusable = await page.locator(`${section} a`).count();
  expect(focusable).toBe(notches);
});

test("the grid fits the narrowest column this site has", async ({ page }) => {
  // layout.css states it as an arithmetic fact and gives the grid no rule at any
  // breakpoint because of it: thirteen columns of 15px plus twelve 4px gaps is
  // 243px. If that stops being true the file's comment is wrong, and it is the
  // reason a whole media query is missing.
  const width = await widthOf(page);
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow, `horizontal overflow at ${String(width)}`).toBeLessThanOrEqual(0);
});
