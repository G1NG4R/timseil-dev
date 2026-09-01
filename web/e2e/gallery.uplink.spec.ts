/**
 * SYS.03's two blocks in the one place either of them exists.
 *
 * WHY THIS FILE HAD TO BE WRITTEN, and it is the same wall `gallery.ops.spec.ts`
 * hit one section over with a sharper edge. This rig runs a production build
 * with NO API — playwright.config.ts says so — and both blocks of UPLINK read
 * one. On `/` there is therefore not a single cell of either in the document:
 * `home.spec.ts` sees two outage panels and nothing else. Every rule about what
 * a calendar or a strip looks like is unassertable on the page that carries it.
 *
 * The gallery is the answer G7 already built, and app/dev/components carries the
 * REAL shapes rather than handy ones — 53 columns, 367 days, a short last week,
 * all five steps, and a second calendar starting on a Wednesday, which no live
 * answer has yet produced. H5a is why that matters: the defect that phase found
 * was a column that computed to zero pixels because the fixture had five stack
 * entries where production answers eleven.
 *
 * NO COLOUR LITERAL ANYWHERE BELOW. `check-tokens` refuses one, and it is right
 * twice: there are seven palettes and the theme is chosen before first paint, so
 * a test naming a value would be a test of which palette the runner loaded. What
 * holds in all seven is the COUPLING — a step that is not declared has no fill
 * and a dashed rule where a declared one has a fill and no rule.
 */
import { expect, test } from "@playwright/test";

const GALLERY = "/dev/components";

function part(name: string): string {
  return `.gal-part:has(.gal-name:text-is('${name}'))`;
}

const GRAPH = part("ContributionGraph");
const STRIP = part("OpsStrip");

test.beforeEach(async ({ page }) => {
  await page.goto(GALLERY);
  // No `settled()`: nothing on this route waits for an api, which is the
  // property that makes it usable here at all.
  await expect(page.locator(`${GRAPH} .upl-cols`).first()).toBeVisible();
});

test("the calendar is seven rows deep and as many columns as the answer sent", async ({ page }) => {
  const shape = await page.evaluate(() => {
    const grid = document.querySelector(".gal-part .upl-cols");
    if (grid === null) return null;
    const cells = [...grid.querySelectorAll(".upl-cell")];
    return {
      rows: new Set(cells.map((c) => Math.round(c.getBoundingClientRect().top))).size,
      columns: new Set(cells.map((c) => Math.round(c.getBoundingClientRect().left))).size,
      cells: cells.length,
      declared: getComputedStyle(grid).getPropertyValue("--cols").trim(),
    };
  });

  expect(shape).not.toBeNull();
  expect(shape?.rows, "seven days to a column").toBe(7);
  // 53 and not 52: production answered 53 weeks and 367 days on 2026-09-01, the
  // last of them short. The number is COUNTED from the answer — `--cols` is what
  // the component wrote out of it, and the columns on screen have to agree.
  expect(shape?.columns).toBe(53);
  expect(shape?.declared).toBe("53");
  expect(shape?.cells).toBe(367);
});

// THE CASE NO LIVE ANSWER PRODUCES. Today's calendar begins on a Sunday, so a
// row derived from a position in the array and a row derived from the date give
// the same answer, and nothing on `/` would look wrong. A calendar beginning on
// a Wednesday hands back a first week of four days that belong on rows 4–7;
// placed at the top, the entire year slides up three rows.
test("a short first column starts on the row its dates name", async ({ page }) => {
  const grids = page.locator(`${GRAPH} .upl-cols`);
  await expect(grids).toHaveCount(3);

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll(".gal-part .upl-cols")].map((grid) => {
      const first = grid.querySelector(".upl-cell");
      return first === null ? null : getComputedStyle(first).gridRowStart;
    }),
  );

  expect(rows[0], "the production shape begins on a Sunday").toBe("1");
  expect(rows[1], "and this one on a Wednesday").toBe("4");
});

test("all five steps are drawn, and an undeclared one is neither of them", async ({ page }) => {
  const drawn = await page.evaluate(() => {
    const grid = document.querySelector(".gal-part .upl-cols");
    const seen = new Set<string>();
    for (const cell of grid?.querySelectorAll(".upl-cell") ?? []) {
      seen.add(cell.getAttribute("data-level") ?? "none");
    }
    return [...seen].sort();
  });

  expect(drawn).toEqual(["l0", "l1", "l2", "l3", "l4"]);
});

// `--l0`…`--l4` have been in all seven palettes since G1 with nothing drawing
// them, and this is the grid they were cut for. Checked as five DIFFERENT fills
// rather than five named ones, for the reason at the head of this file.
test("the five steps are five different fills", async ({ page }) => {
  const fills = await page.evaluate(() =>
    ["l0", "l1", "l2", "l3", "l4"].map((level) => {
      const cell = document.querySelector(`.gal-part .upl-cell[data-level="${level}"]`);
      return cell === null ? null : getComputedStyle(cell).backgroundColor;
    }),
  );

  expect(fills.every((fill) => fill !== null)).toBe(true);
  expect(new Set(fills).size, "five steps, five fills").toBe(5);
});

// ONE NAME AND NOT 367, which is where this picture parts company with the
// operation grid beside it. `gallery.ops.spec.ts` asserts that every cell of the
// 91-day grid carries its own accessible name; at 367 that is a wall rather than
// a list, so the figure is one `role="img"` and the cells are hidden.
test("the calendar is one picture with one name", async ({ page }) => {
  const grid = page.locator(`${GRAPH} .upl-cols`).first();

  await expect(grid).toHaveAttribute("role", "img");
  await expect(grid).toHaveAttribute("aria-label", /\d+ contributions over \d+ days/);

  const named = await page.evaluate(() => {
    const first = document.querySelector(".gal-part .upl-cols");
    return {
      labelled: first?.querySelectorAll(".upl-cell[aria-label]").length,
      hidden: first?.querySelectorAll('.upl-cell[aria-hidden="true"]').length,
      cells: first?.querySelectorAll(".upl-cell").length,
    };
  });

  expect(named.labelled, "no cell carries a name of its own").toBe(0);
  expect(named.hidden).toBe(named.cells);
});

// The caption counts what is drawn. The sheet writes `LAST 365 DAYS`; the answer
// carries 367, and 365 is a round number about a year rather than this one.
test("the caption counts the cells rather than a year", async ({ page }) => {
  const caption = await page.locator(`${GRAPH} .upl-label`).first().innerText();

  expect(caption).toContain("LAST 367 DAYS");
  expect(caption).toContain("SOURCE: /api/contributions");
  // The age, at every age. A cached number without one is a claim whose evidence
  // is a moment nobody names.
  expect(caption).toMatch(/· \d+[SMHD] OLD$/);
});

// THREE STATEMENTS AND NOT TWO. An old calendar is not an error: the api answers
// with the last good one and its age for as long as it has one, so `from cache`
// is the same picture wearing a larger number. Only the cold start — GitHub has
// never replied — has nothing to draw.
test("an old calendar is a picture with an age, and a cold one is a panel", async ({ page }) => {
  const captions = await page.locator(`${GRAPH} .upl-label`).allInnerTexts();

  expect(captions).toHaveLength(3);
  expect(captions[2], "nine hours old, and still a calendar").toMatch(/\d+H OLD$/);

  const panel = page.locator(`${GRAPH} .st-empty-panel`);
  await expect(panel).toHaveCount(1);
  await expect(panel.locator(".st-empty-head")).toHaveText("— NO DATA");
  await expect(panel.locator(".st-empty-reason")).toContainText("/api/contributions");
});

test("the strip is thirty cells with four kinds of day in it", async ({ page }) => {
  const cells = page.locator(`${STRIP} .upl-strip .ops-cell`);
  await expect(cells).toHaveCount(30);

  const states = await page.evaluate(() => {
    const seen = new Set<string>();
    for (const cell of document.querySelectorAll(".gal-part .upl-strip .ops-cell")) {
      seen.add((cell as HTMLElement).dataset.state ?? "none");
    }
    return [...seen].sort();
  });

  expect(states).toEqual(["degraded", "nodata", "ok", "outage"]);
});

// INVARIANT 6, AND IT IS THE SAME COUPLING `gallery.ops.spec.ts` CHECKS one
// section over: the unmeasured cell has no fill and a dashed rule where a
// measured one has a fill and no rule. Two pictures of one idea, one vocabulary.
test("a day without a measurement is never a filled cell here either", async ({ page }) => {
  const shape = await page.evaluate(() => {
    const filled = (el: Element) => {
      const alpha = /rgba?\([^)]*?,\s*([\d.]+)\)$/.exec(getComputedStyle(el).backgroundColor);
      return alpha === null ? true : Number(alpha[1]) > 0;
    };
    const at = (state: string) => {
      const cell = document.querySelector(`.gal-part .upl-strip .ops-cell[data-state="${state}"]`);
      return cell === null
        ? null
        : { filled: filled(cell), dashed: getComputedStyle(cell).borderTopStyle === "dashed" };
    };
    return { nodata: at("nodata"), ok: at("ok") };
  });

  expect(shape.nodata).toEqual({ filled: false, dashed: true });
  expect(shape.ok).toEqual({ filled: true, dashed: false });
});

// PURE DISPLAY, AND THIS IS THE ASSERTION THAT SAYS SO. The Operation Grid sheet
// separates the two places this picture appears in one sentence — "reine Anzeige
// ohne Klick" here against clickable notches on the case study — and the way to
// hold that is to count the controls rather than to look at them.
test("nothing in the strip can be pressed", async ({ page }) => {
  await expect(page.locator(`${STRIP} .upl-strip a, ${STRIP} .upl-strip button`)).toHaveCount(0);

  // What it has instead: every cell says which day it is and what happened.
  const named = await page.locator(`${STRIP} .upl-strip .ops-cell[aria-label]`).count();
  expect(named).toBe(30);
  await expect(page.locator(`${STRIP} .upl-strip .ops-cell`).first()).toHaveAttribute(
    "aria-label",
    /^\d{4}-\d{2}-\d{2} · /,
  );
});

test("the strip names the endpoint and the window it asked for", async ({ page }) => {
  await expect(page.locator(`${STRIP} .upl-source`)).toHaveText(
    "SOURCE: /api/systems/timseil-dev?window=30",
  );
  await expect(page.locator(`${STRIP} .upl-label`).first()).toContainText("LAST 30 DAYS");
});

// NEITHER BLOCK ANSWERS TO A SWITCH, which is the thing to check rather than to
// assert in prose. The calendar shrinks continuously between the sheet's two
// drawings and the strip wraps; `HOME_SWITCHES` is unchanged by this phase, and
// this is where that claim is measurable — on `/` neither block is in the
// document at all.
test.describe("the two blocks change size without changing shape", () => {
  test("the calendar is 15px wherever the column allows it, and smaller below", async ({ page }) => {
    const at = async (width: number) => {
      await page.setViewportSize({ width, height: 900 });
      return page.evaluate(() => {
        const grid = document.querySelector(".gal-part .upl-cols");
        const cell = grid?.querySelector(".upl-cell");
        return {
          rows: new Set(
            [...(grid?.querySelectorAll(".upl-cell") ?? [])].map((c) =>
              Math.round(c.getBoundingClientRect().top),
            ),
          ).size,
          cell: cell === undefined || cell === null ? 0 : cell.getBoundingClientRect().width,
        };
      });
    };

    const wide = await at(1440);
    const narrow = await at(719);

    // Seven rows at both, which is the "shape" half: what changes is the size.
    expect(wide.rows).toBe(7);
    expect(narrow.rows).toBe(7);
    expect(narrow.cell).toBeLessThan(wide.cell);
    expect(narrow.cell).toBeGreaterThan(0);
  });

  test("the strip wraps rather than scrolling or shrinking", async ({ page }) => {
    const at = async (width: number) => {
      await page.setViewportSize({ width, height: 900 });
      return page.evaluate(() => {
        const cells = [...document.querySelectorAll(".gal-part .upl-strip .ops-cell")];
        const strip = document.querySelector(".gal-part .upl-strip");
        return {
          rows: new Set(cells.map((c) => Math.round(c.getBoundingClientRect().top))).size,
          cell: cells[0].getBoundingClientRect().width,
          scrolls: strip === null ? false : strip.scrollWidth > strip.clientWidth + 1,
        };
      });
    };

    const wide = await at(1440);
    const narrow = await at(390);

    expect(wide.rows, "thirty across in a full column").toBe(1);
    expect(narrow.rows, "and onto a second line at 390").toBeGreaterThan(1);
    // The cell does NOT shrink here, unlike the calendar's: both artboards draw
    // the strip at 15px and let it wrap. #294 is the standing complaint about
    // the third option.
    expect(Math.round(narrow.cell)).toBe(Math.round(wide.cell));
    expect(narrow.scrolls, "and it never swipes sideways").toBe(false);
  });
});
