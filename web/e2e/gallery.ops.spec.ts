/**
 * The operation grid in the one place all five of its states exist.
 *
 * WHY THIS FILE HAD TO BE WRITTEN. `case-study.ops.spec.ts` checks the grid on
 * the page that carries it, and there it is empty: production has answered
 * `incidents: []` and a window that is mostly `nodata` every day the page has
 * existed, and this rig runs a production build with no api at all. The first
 * draft of that spec had three tests that PASSED BY FINDING NOTHING TO CHECK —
 * a green run over a `null` body, which is the shape of every finding this
 * repository keeps having.
 *
 * The gallery is the answer G7 already built: every component in every state,
 * rendered from data in the page rather than from an answer. app/dev/components
 * fabricates a window with all four kinds of day in it and one incident to
 * reach, so the rules below have something to be wrong about.
 *
 * AND THE FIFTH STATE IS OPERATED, NOT DRAWN. `selected` is `:target`, so the
 * test clicks a notch and asks the document which entry is targeted. That is the
 * whole argument for the anchor — components/case/OpsGrid.tsx makes it — and
 * this is the assertion that would go red if someone replaced it with state.
 *
 * The route is `DEV_GALLERY=1` in the rig's own server. playwright.config.ts
 * says why that is not a security decision.
 */
import { expect, test } from "@playwright/test";

const GALLERY = "/dev/components";

test.beforeEach(async ({ page }) => {
  await page.goto(GALLERY);
  // No `settled()`: nothing on this route waits for an api, which is the
  // property that makes it usable here in the first place.
  await expect(page.locator(".ops-grid")).toHaveCount(1);
});

test("a day without a measurement is never a filled cell", async ({ page }) => {
  // INVARIANT 6 IN A STYLESHEET. Checked as a coupling and not as a colour:
  // there are seven palettes and the theme is chosen before first paint, so a
  // test that named a value would be a test of which one the runner loaded. What
  // holds in all seven is that the unmeasured cell has no fill and a dashed rule
  // where a measured one has a fill and no rule.
  //
  // AND NO COLOUR IS NAMED HERE EITHER — the first draft of this test named two — it compared
  // `backgroundColor` against the literal `rgba(0, 0, 0, 0)`, which `check-tokens`
  // refused as a colour outside tokens.css. It was right twice: invariant 8 aside,
  // this file's own rule is couplings and not fixtures, and "is there a fill" is
  // the question. The alpha channel answers it without a value crossing the
  // boundary.
  const shape = await page.evaluate(() => {
    const filled = (el: Element) => {
      const alpha = /rgba?\([^)]*?,\s*([\d.]+)\)$/.exec(getComputedStyle(el).backgroundColor);
      return alpha === null ? true : Number(alpha[1]) > 0;
    };
    const at = (state: string) => {
      const cell = document.querySelector(`.ops-cell[data-state="${state}"]`);
      return cell === null ? null : { filled: filled(cell), dashed: getComputedStyle(cell).borderTopStyle === "dashed" };
    };
    return { nodata: at("nodata"), ok: at("ok") };
  });

  // The unmeasured cell is an outline with nothing in it, which is the shape of
  // the statement: the day is in the window and no measurement is. Invariant 6
  // in a stylesheet, and the same choice words.ts makes for its `dash` dot.
  expect(shape.nodata).not.toBeNull();
  expect(shape.nodata?.dashed).toBe(true);
  expect(shape.nodata?.filled).toBe(false);

  // And the measured one is the other half of the same claim.
  expect(shape.ok).not.toBeNull();
  expect(shape.ok?.dashed).toBe(false);
  expect(shape.ok?.filled).toBe(true);
});

test("every notch reaches its incident, and nothing else is a link", async ({ page }) => {
  const notches = page.locator(".ops-notch");
  const count = await notches.count();

  // INVARIANT 5, at the one place on this page the database cannot enforce it: a
  // day can carry an `incidentId` whose incident is not in the answer, and a
  // link to a fragment that is not in the document is evidence pointing into
  // nothing. lib/api/systems.ts resolves the id against the list; this is that
  // decision seen from the built page.
  for (let i = 0; i < count; i += 1) {
    const href = await notches.nth(i).getAttribute("href");
    expect(href).toMatch(/^#inc-/);
    await expect(page.locator(`${href ?? ""}.incident`)).toHaveCount(1);
  }

  // ONLY NOTCHES ARE LINKS. Ninety-one tab stops would be a keyboard trap, and
  // the Template's caption is precise about which cells are clickable. The count
  // of links inside the grid is therefore the count of notches and no more.
  await expect(page.locator(".ops-grid a")).toHaveCount(count);
});

test("every cell says which day it is and what happened", async ({ page }) => {
  // The grid has no visible text at all — it is ninety-one squares — so its
  // whole readable form is the accessible name on each cell. This repository has
  // no visually-hidden utility (ADR 0055 declined to add one), which makes the
  // label the only mechanism and worth a test of its own.
  const unnamed = await page.evaluate(() => {
    return [...document.querySelectorAll(".ops-cell")].filter((cell) => {
      const own = cell.getAttribute("aria-label");
      const link = cell.querySelector("a")?.getAttribute("aria-label");
      const name = own ?? link ?? "";
      return !/\d{4}-\d{2}-\d{2}/.test(name);
    }).length;
  });
  expect(unnamed).toBe(0);
});


test("clicking a notch selects the incident it points at", async ({ page }) => {
  // GECLICKT, NICHT GELESEN. The `selected` state the component inventory has
  // asked for since G7 is `:target`, and the only way to assert a `:target` is
  // to produce one. A rewrite that moved the selection into component state
  // would leave this red rather than leaving it passing over a class name.
  const notch = page.locator(".ops-notch").first();
  const href = await notch.getAttribute("href");
  expect(href).toMatch(/^#inc-/);

  await expect(page.locator(".incident:target")).toHaveCount(0);
  await notch.click();

  await expect(page.locator(".incident:target")).toHaveCount(1);
  await expect(page.locator(`${href ?? ""}.incident`)).toHaveClass(/incident/);
  expect(new URL(page.url()).hash).toBe(href);
});

test("the selected entry looks different from the one beside it", async ({ page }) => {
  // The first version of the `:target` rule shifted three borders from 10% steel
  // to 35% cyan and was invisible in a screenshot of two entries side by side —
  // found by looking, because every test that could have caught it would have
  // asserted the rule rather than the difference. So the difference is what is
  // asserted: the targeted entry does not render identically to its neighbour.
  await page.locator(".ops-notch").first().click();
  await expect(page.locator(".incident:target")).toHaveCount(1);

  const same = await page.evaluate(() => {
    const target = document.querySelector(".incident:target");
    const other = [...document.querySelectorAll(".incident")].find((e) => e !== target);
    if (target === null || other === undefined) return null;
    const read = (e: Element) => {
      const s = getComputedStyle(e);
      return [s.outlineStyle, s.outlineWidth, s.backgroundColor].join("|");
    };
    return read(target) === read(other);
  });

  expect(same).toBe(false);
});

test("the empty incident log is on the same page as the full one", async ({ page }) => {
  // Both states side by side is what a gallery is for, and here it is also the
  // proof that the empty one is a designed state rather than an absence: it owes
  // a heading and a reason, and STATE.05 refuses a dead end without one.
  const empty = page.locator(".st-empty-panel").filter({ hasText: "NO INCIDENTS" });
  await expect(empty).toHaveCount(1);
  await expect(empty.locator(".st-empty-reason")).not.toBeEmpty();
});

test("the grid is seven rows deep and thirteen columns wide", async ({ page }) => {
  // INVARIANT 7 WHERE THERE ARE CELLS TO COUNT. `case-study.ops.spec.ts` holds
  // the caption against the cell count, but on that page there are no cells: the
  // rig has no api, so its column check never runs. Here there are ninety-one,
  // and 91 = 13 × 7 is the arithmetic the invariant asks to stay countable —
  // together with layout.css's claim that thirteen 15px columns and twelve 4px
  // gaps are 243px, which is why the grid has no media query at any width.
  const shape = await page.evaluate(() => {
    const grid = document.querySelector(".ops-grid");
    if (grid === null) return null;
    const s = getComputedStyle(grid);
    return {
      rows: s.gridTemplateRows.split(" ").length,
      columns: s.gridTemplateColumns.split(" ").length,
      cells: grid.querySelectorAll(".ops-cell").length,
    };
  });

  expect(shape?.rows).toBe(7);
  expect(shape?.cells).toBe(91);
  expect(shape?.columns).toBe(13);
});
