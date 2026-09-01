/**
 * The system list in the one place its rows exist.
 *
 * WHY THIS FILE HAD TO BE WRITTEN — `gallery.training.spec.ts`'s reason, one
 * section up, and `gallery.ops.spec.ts`'s one page over. `home.spec.ts` checks
 * SYS.02 on the page that carries it, and there it is empty: this rig runs a
 * production build with NO API, so `/` shows the outage panel and not a single
 * system row is in the document. A spec that asked about rows there would pass
 * by finding nothing to check.
 *
 * AND IT CARRIES THE ROW'S OWN SWITCH, which is the part that is new.
 * e2e/widths.ts explains at length why `HOME_SWITCHES` does not grow: the rule
 * that turns this row into a card is real, it is in layout.css, and the page
 * sweep cannot see it because the page has no rows. It is checked here instead,
 * where they are.
 *
 * WHAT IS ASSERTED HERE THAT IS NOT ASSERTED ANYWHERE ELSE: that a row with
 * nowhere to go has NO control rather than a disabled one, and that a state the
 * contract declares and this site has no word for reads `— NO DATA`. Neither is
 * reachable in production — the seed holds one live and one queued system, and
 * nothing is `in_build`.
 */
import { expect, test } from "@playwright/test";

const GALLERY = "/dev/components";

/** The demo section, so nothing here can match a row of another component. */
const PART = ".gal-part:has(.gal-name:text-is('SystemRow'))";
const ROWS = `${PART} .sys-row`;

test.beforeEach(async ({ page }) => {
  await page.goto(GALLERY);
  // No `settled()`: nothing on this route waits for an api, which is the
  // property that makes it usable here at all.
  await expect(page.locator(ROWS)).toHaveCount(3);
});

// THE DECISION OF THIS PHASE, AS A TEST.
//
// STATE.05 refuses a dead control — "ein toter Zustand ohne Begründung ist ein
// Bug" — and the inventory asks for `disabled (queued)`. What got built is an
// ABSENT exit, because `/work/vat-check` is a 404 and a greyed-out arrow would
// be a control that explains nothing. This goes red if anybody renders one.
test("a row with nowhere to go carries no control at all", async ({ page }) => {
  const rows = page.locator(ROWS);

  // Row 0 is `vat-check`: queued, no case study, therefore no link.
  await expect(rows.nth(0).locator(".sys-exit a")).toHaveCount(0);
  await expect(rows.nth(0).locator(".sys-exit")).toHaveText("");

  // Row 1 is `timseil.dev`: live, has a case study, therefore one.
  await expect(rows.nth(1).locator(".sys-exit a")).toHaveCount(1);
  await expect(rows.nth(1).locator(".sys-exit a")).toHaveAttribute("href", "/work/timseil-dev");
});

// The state column is what says WHY the row above has no arrow, and it has to
// say it in a word rather than in the absence of one.
test("the state column carries a word for every row", async ({ page }) => {
  await expect(page.locator(`${ROWS} .sys-state`)).toHaveText([
    "QUEUED",
    "LIVE",
    "— NO DATA",
  ]);
});

// #289, and the reason the third fixture row exists. `in_build` is in the
// contract, lib/state/words.ts has no word for it, and H6 owes the ninth mark.
// Inventing IN BUILD here would be a word with no tone, no dot and no
// dictionary key behind it.
test("a state this site has no word for reads — NO DATA, not a guess", async ({ page }) => {
  const row = page.locator(ROWS).nth(2);

  await expect(row.locator(".sys-state")).toHaveText("— NO DATA");
  // And no dot beside it. `— NO DATA` is the absence of a state rather than one
  // of them, so there is nothing for a mark to mark.
  await expect(row.locator(".sys-state .st-dot")).toHaveCount(0);
});

// Every value in the row is readable at rest. This is SkillRow's finding from
// H4 applied to the second row component on the page: the hover may emphasise,
// it may not reveal.
test("the hover adds emphasis and no words", async ({ page }) => {
  const row = page.locator(ROWS).nth(1);
  const before = (await row.innerText()).trim();

  await row.hover();
  await expect(row).toHaveCSS("box-shadow", /inset/);

  expect((await row.innerText()).trim()).toBe(before);
});

// The count in the head is the rows under it, not a number anybody typed. The
// fixture holds three where production holds two, so a hard-coded `02` would be
// visible here immediately.
test("the head counts the rows it drew", async ({ page }) => {
  await expect(page.locator(`${PART} .sec-meta`)).toHaveText(
    "03 SYSTEMS · SOURCE: /api/systems",
  );
});

// THE DEFECT H5a SHIPPED AND MEASURED ITS WAY OUT OF. The sheet draws five stack
// items and gives their column `auto`; production answers eleven, `auto` is
// max-content, and the description column beside it computed to ZERO — the
// sentence the row exists to carry was not drawn at all, and the row stood four
// times taller than the one above it. Neither `/` nor this gallery could show it
// until the fixture carried the real stack, which it now does.
test("the description column survives the longest stack this site has", async ({ page }) => {
  const row = page.locator(ROWS).nth(1);

  const blurb = await row.locator(".sys-blurb").boundingBox();
  expect(blurb, "the row has no description box at all").not.toBeNull();
  expect(blurb?.width ?? 0, "the stack column ate the description").toBeGreaterThan(200);

  // And the row does not tower over its neighbour. 334px against 76 was the
  // shape of the defect; a wrapped stack costs a fraction of that.
  const tall = (await row.boundingBox())?.height ?? 0;
  const short = (await page.locator(ROWS).nth(0).boundingBox())?.height ?? 0;
  expect(tall, `${String(tall)} against ${String(short)}`).toBeLessThan(short * 2);
});

// THE ROW MUST NOT BE WIDER THAN THE BOX IT STANDS IN, at any width. It was —
// 54px over at 560 — and the page-level overflow test could not see it for the
// reason this whole file exists. Written as its own assertion rather than left
// to the description check above, because they failed for different reasons and
// a reader of a red run deserves to know which.
test("the row never pushes past its own container", async ({ page }) => {
  const over = await page.locator(ROWS).evaluateAll((rows) =>
    rows.map((r) => r.scrollWidth - r.clientWidth),
  );
  expect(over, "a row is wider than the column it stands in").toEqual([0, 0, 0]);
});

// THE ROW'S SWITCH, checked where the component is. e2e/widths.ts says why the
// page sweep cannot see it and this can.
//
// 1080 AND NOT 560, WHICH IS THE CORRECTION H5a MEASURED ITS WAY TO. The shared
// rule in layout.css turns table rows into cards at 560, and this row cannot
// wait that long: six tracks carry 526px that will not shrink, so below 1080 the
// description is 37px at 899, zero at 719, and at 560 the row is wider than its
// container. 1080 is the switch every other multi-column row on this site
// already uses.
test.describe("the row becomes a card below 1080", () => {
  test("it is a grid at 1080 and a column at 1079", async ({ page }) => {
    const row = page.locator(ROWS).first();

    await page.setViewportSize({ width: 1080, height: 900 });
    await expect(row).toHaveCSS("display", "grid");

    await page.setViewportSize({ width: 1079, height: 900 });
    await expect(row).toHaveCSS("display", "flex");
    await expect(row).toHaveCSS("flex-direction", "column");
  });

  // And the card keeps every cell. `.work-row` drops its preview at this same
  // switch — "weglassen, nicht verkleinern" — which is right for decoration and
  // wrong here: every cell of a system row is a claim, and the 390 artboard
  // draws all of them stacked.
  test("the card drops nothing", async ({ page }) => {
    await page.setViewportSize({ width: 1079, height: 900 });
    const row = page.locator(ROWS).nth(1);

    for (const cell of [".sys-no", ".sys-name", ".sys-blurb", ".sys-stack", ".sys-source", ".sys-state", ".sys-exit"]) {
      await expect(row.locator(cell), `${cell} was dropped`).toBeVisible();
    }
  });
});
