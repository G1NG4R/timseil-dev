/**
 * `.02 ARCHITECTURE` and `.03 BUILD` on the built page.
 *
 * NO SUFFIX, so this file runs at all seven widths. The rules below are about
 * behaviour and reflow, and every one of them has a width at which it is the
 * interesting one — `case-study.sheet.spec.ts` is where a measurement is held
 * against a drawing, and it runs at the three widths that have one.
 *
 * NOTHING HERE ASSUMES WHETHER THE API ANSWERED, which is `case-study.spec.ts`'s
 * rule and applies to this file for a different reason: these two sections read
 * nothing measured at all. If an assertion below could ever be changed by the
 * api being up, it is testing the wrong thing.
 *
 * IT WAITS ON ALL FOUR STREAMED REGIONS, THOUGH NEITHER SECTION IS ONE. `.02`
 * and `.03` prerender whole, so nothing here can be caught mid-swap — and the
 * first draft of this file still copied the pre-#279 wait that looked only at
 * the breadcrumb. A local helper is copied; that is what local helpers are for.
 * The definition now lives in `streaming.ts`, both specs import it, and the next
 * spec against this route inherits the fix instead of the bug.
 *
 * COUPLINGS, NOT FIXTURES. "The two owned stations are accented" is checked as
 * *all owned boxes share a border colour, all others share another, and the two
 * differ* — never as a hex value. There are seven palettes and the theme is
 * chosen before first paint; a test that named a colour would be a test of
 * which theme the runner happened to load.
 */
import { expect, test, type Page } from "@playwright/test";

import excerpt from "../content/generated/compose-api.gen.json";
import { settled } from "./streaming";
import { CASE_STUDY, RAIL_BREAKPOINT } from "./widths";

/** The switch below which tables go to one column — layout.css's third. */
const TABLE_BREAKPOINT = 720;

async function widthOf(page: Page): Promise<number> {
  return page.evaluate(() => window.innerWidth);
}

test.beforeEach(async ({ page }) => {
  await page.goto(CASE_STUDY);
  await settled(page);
});

test("the sections keep their distance, including the last one", async ({ page }) => {
  // H1 shipped `.01` alone, and the 96px above it belonged to the metric row
  // rather than to the section — so the rhythm read as present and was not. With
  // three sections the gaps measured zero, and so did the space before the
  // footer. Checked as "every gap is the same and none of them is nothing",
  // never as a pixel count, because the step may be re-chosen and the rule that
  // matters is that a section is spaced from whatever follows it.
  const gaps = await page.evaluate(() => {
    const sections = [...document.querySelectorAll<HTMLElement>(".cs-section")];
    return sections.map((section) => Math.round(parseFloat(getComputedStyle(section).marginBlockEnd)));
  });

  expect(gaps.length).toBeGreaterThanOrEqual(3);
  expect(new Set(gaps).size).toBe(1);
  expect(gaps[0]).toBeGreaterThan(0);
});

test("both sections are present exactly once and are named by their heads", async ({ page }) => {
  for (const id of ["sec-02", "sec-03"]) {
    const section = page.locator(`section[aria-labelledby="${id}"]`);
    await expect(section).toHaveCount(1);

    // The name has to resolve to something. An aria-labelledby pointing at an
    // element that never got its id is a region with no name at all, and it
    // fails silently in every browser.
    const title = page.locator(`#${id}`);
    await expect(title).toHaveCount(1);
    await expect(title).not.toBeEmpty();
  }
});

test("the request path has five stations and the accent marks exactly the owned ones", async ({ page }) => {
  const hops = page.locator(".arch-hop");
  await expect(hops).toHaveCount(5);

  const groups = await page.evaluate(() => {
    const own: string[] = [];
    const rest: string[] = [];
    for (const hop of document.querySelectorAll<HTMLElement>(".arch-hop")) {
      const box = hop.querySelector(".arch-box");
      if (box === null) continue;
      const colour = getComputedStyle(box).borderTopColor;
      (hop.dataset.own === "yes" ? own : rest).push(colour);
    }
    return { own, rest };
  });

  expect(groups.own.length).toBeGreaterThan(0);
  expect(groups.rest.length).toBeGreaterThan(0);
  expect(new Set(groups.own).size).toBe(1);
  expect(new Set(groups.rest).size).toBe(1);
  expect(groups.own[0]).not.toBe(groups.rest[0]);
});

test("the arrows are drawn between stations and go when the path stands up", async ({ page }) => {
  const width = await widthOf(page);
  const arrows = page.locator(".arch-arrow");

  // Four arrows for five stations, always in the markup — the list is the
  // order either way, and below the switch they are hidden rather than removed.
  await expect(arrows).toHaveCount(4);

  const visible = await arrows.evaluateAll((nodes) =>
    nodes.filter((node) => getComputedStyle(node).display !== "none").length,
  );
  expect(visible).toBe(width >= RAIL_BREAKPOINT ? 4 : 0);
});

test("the five side lanes reflow 4 to 2 to 1", async ({ page }) => {
  await expect(page.locator(".arch-lane")).toHaveCount(5);

  const width = await widthOf(page);
  const expected = width < 560 ? 1 : width < TABLE_BREAKPOINT ? 2 : 4;

  const tracks = await page.locator(".arch-lanes").evaluate((node) =>
    getComputedStyle(node).gridTemplateColumns.split(" ").length,
  );
  expect(tracks).toBe(expected);
});

test("exactly one source of column labels is showing", async ({ page }) => {
  const width = await widthOf(page);
  const stacked = width < TABLE_BREAKPOINT;

  // The head row and the per-cell labels say the same words. Both showing is a
  // page that repeats itself; neither showing is a column of prose nobody can
  // place. `display: none` is used rather than a visually-hidden class, so what
  // is invisible is also out of the accessibility tree — which is why this is
  // one assertion and not two.
  const head = page.locator(".decision-table thead");
  const labels = page.locator(".decision-table .dt-label");

  await expect(head).toHaveCount(1);
  await expect(labels).toHaveCount(8);

  if (stacked) {
    await expect(head).toBeHidden();
    await expect(labels.first()).toBeVisible();
  } else {
    await expect(head).toBeVisible();
    await expect(labels.first()).toBeHidden();
  }
});

test("every decision names what it rejected", async ({ page }) => {
  const rows = page.locator(".decision-table tbody tr");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);

  // The table's whole claim, and the one thing that would make it a list of
  // opinions instead: a row with an empty alternative.
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    await expect(row.locator("th")).not.toBeEmpty();
    await expect(row.locator(".dt-alt")).not.toBeEmpty();
  }
});

test("the compose block is the generated excerpt, line for line", async ({ page }) => {
  // THE POINT OF THE WHOLE SECTION. `make gen` cuts this out of compose.yaml and
  // `make check-contract` compares its checksum either side of a run; what this
  // adds is the other half — that what the file says is also what the page
  // shows. A component that dropped, reordered or re-indented a line would pass
  // every check in the Makefile and fail here.
  const text = await page.locator(".compose").innerText();
  const rendered = text.replace(/\r/gu, "").replace(/\n$/u, "").split("\n");
  expect(rendered).toEqual(excerpt.lines);
});

test("the phases are numbered and none of them is a title alone", async ({ page }) => {
  const items = page.locator(".phases li");
  await expect(items).toHaveCount(4);

  for (const part of [".phase-title", ".phase-detail"]) {
    const parts = page.locator(`.phases ${part}`);
    await expect(parts).toHaveCount(4);
    for (let i = 0; i < 4; i++) await expect(parts.nth(i)).not.toBeEmpty();
  }

  // The ordinal is a counter, so it is in no text node and no accessible name —
  // and Chromium reports the AUTHORED `content`, not the resolved digits, so the
  // rendered "01" cannot be read from here at all. What can be checked is that
  // the mechanism is wired end to end, which is what would silently break:
  // a reset without an increment, or an increment on a list that never reset,
  // both render nothing and take the claim about order with them.
  const counter = await page.locator(".phases").evaluate((list) => ({
    reset: getComputedStyle(list).counterReset,
    increments: [...list.querySelectorAll("li")].map(
      (item) => getComputedStyle(item).counterIncrement,
    ),
    content: getComputedStyle(list.querySelector("li") as Element, "::before").content,
  }));

  expect(counter.reset).toContain("phase");
  expect(counter.increments).toHaveLength(4);
  for (const increment of counter.increments) expect(increment).toContain("phase");

  // Zero-padded, which is the sheet's form and the reason this is a counter
  // rather than a list marker in the first place.
  expect(counter.content).toContain("counter(phase");
  expect(counter.content).toContain("decimal-leading-zero");
});

test("neither section says anything the repository stopped believing", async ({ page }) => {
  // The sheets these sections come from draw a React Router front end, Postgres
  // 16, a Go container aggregating into SQLite, and "no metrics stack for one
  // host". All four are older than ADR 0005 and ADR 0007, and two of them are
  // English UI copy rather than annotation — quoting them would put a false
  // claim on a page whose whole argument is that it does not do that.
  for (const id of ["sec-02", "sec-03"]) {
    const text = await page.locator(`section[aria-labelledby="${id}"]`).innerText();
    for (const stale of ["React Router", "PostgreSQL 16", "SQLite", "metrics stack", "wget", "env_file"]) {
      expect(text).not.toContain(stale);
    }
  }
});

test("this half of the page is still nothing to operate", async ({ page }) => {
  // H2a adds no client component and no control, and the bundle measurement says
  // the same thing from the other side. A tab stop appearing here would mean
  // something became interactive without anyone deciding it — which is the shape
  // of #256, an invisible dialog over every page that no test had ever clicked.
  // H2b's grid is `.04`, a section this assertion does not reach.
  for (const id of ["sec-02", "sec-03"]) {
    const focusable = page.locator(
      `section[aria-labelledby="${id}"] a, section[aria-labelledby="${id}"] button, ` +
        `section[aria-labelledby="${id}"] [tabindex]`,
    );
    await expect(focusable).toHaveCount(0);
  }
});
