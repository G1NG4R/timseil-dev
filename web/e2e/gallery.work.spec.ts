/**
 * The Work Index rows, in the only place this rig can see one.
 *
 * WHY THIS FILE EXISTS AT ALL is the sentence e2e/gallery.systems.spec.ts wrote
 * first and this phase pays a second time: there is no api in the rig, so
 * `/work` renders an outage panel and no `.work-row` is ever in its document.
 * Every claim below is about a row, so every claim below has to be made here.
 *
 * WHAT IS ASSERTED HERE AND NOWHERE ELSE: that a system nobody measures carries
 * no figure CELL rather than `— NO DATA` in one; that a live system with no
 * measurement yet carries the opposite; that the row's two switches are the two
 * layout.css declares; and that the third system state draws its word.
 *
 * IT RUNS ONCE PER WIDTH, like every plain `.spec.ts`, which is what lets the
 * switch assertions read the row at both sides of a breakpoint without a sweep
 * of their own.
 */
import { expect, test, type Page } from "@playwright/test";

const GALLERY = "/dev/components";

/** The demo section, so nothing here can match another component's row. */
const PART = ".gal-part:has(.gal-name:text-is('WorkList'))";
const ROWS = `${PART} .work-row`;

/** The width this project is running at. */
function widthOf(page: Page): number {
  const size = page.viewportSize();
  if (size === null) throw new Error("no viewport");
  return size.width;
}

test.beforeEach(async ({ page }) => {
  await page.goto(GALLERY);
});

test("the fixture draws every state the contract declares", async ({ page }) => {
  // Two rows the seed produces and one it cannot. `in_build` has never existed
  // in production and had no word at all until H6 closed #289.
  await expect(page.locator(`${ROWS} .work-state`)).toHaveText([
    "QUEUED",
    "LIVE",
    "IN BUILD",
  ]);
});

test("a system nobody measures carries no figure at all", async ({ page }) => {
  // ADR 0055, and the distinction this page turns on. `— NO DATA` says a
  // measurement was attempted and did not arrive; nobody attempts the uptime of
  // a system that is not running, and the contract guarantees `null` in every
  // metric field for one — in SQL, inside the lateral.
  const rows = page.locator(ROWS);

  await expect(rows.nth(0).locator(".work-figure")).toBeEmpty();
  await expect(rows.nth(2).locator(".work-figure")).toBeEmpty();
});

test("a live system keeps its label and says the number has not arrived", async ({ page }) => {
  // The other half of the same distinction, and today's actual state: the
  // snapshot loop has written nothing, so the cell stands with an empty value.
  const figure = page.locator(ROWS).nth(1).locator(".work-figure");

  await expect(figure.locator(".work-figure-label")).toHaveText("UPTIME · 91 D");
  await expect(figure.locator(".work-figure-value")).toHaveText("— NO DATA");
});

test("the window in the label is the contract's and not the request's", async ({ page }) => {
  // `/api/systems` sends no `window` field, unlike the detail answer the case
  // study labels from. 91 is what the contract writes into `uptime90d` — "the
  // name says 90 for historical reasons" — and invariant 7 is why it stays
  // countable.
  const label = page.locator(ROWS).nth(1).locator(".work-figure-label");

  await expect(label).toContainText("91 D");
});

test("a row with nowhere to go carries no control at all", async ({ page }) => {
  // STATE.05 refuses a dead control. `/work/vat-check` is a 404 — a system is
  // not a case study — so the arrow is absent rather than greyed out, and the
  // state column beside it is what says why.
  const rows = page.locator(ROWS);

  await expect(rows.nth(0).locator(".work-exit a")).toHaveCount(0);
  await expect(rows.nth(2).locator(".work-exit a")).toHaveCount(0);

  await expect(rows.nth(1).locator(".work-exit a")).toHaveCount(1);
  await expect(rows.nth(1).locator(".work-exit a")).toHaveAttribute("href", "/work/timseil-dev");
});

test("one link per row, and it is the arrow", async ({ page }) => {
  // The sheet draws three controls to one destination. `SystemRow` turned that
  // down in H5a as "a keyboard trap dressed as thoroughness", and this row
  // inherits the decision: the repo address is printed rather than linked, and
  // the log count is text.
  await expect(page.locator(ROWS).nth(1).locator("a")).toHaveCount(1);
});

test("the log count is a number and never a link", async ({ page }) => {
  // Invariant 5 for the third time on this site: `/blog/<slug>` is a 404 until
  // H9 builds the renderer. The sheet draws `01 ENTRY IN THE LOG →`; the arrow
  // is what is missing here, deliberately.
  const log = page.locator(ROWS).nth(1).locator(".work-log");

  await expect(log).toHaveText("03 ENTRIES IN THE LOG");
  await expect(log.locator("a")).toHaveCount(0);
});

test("the one alert-red moment is on the row the reader is standing in", async ({ page }) => {
  // STATE.05 allows one per page and the sheet spends it here. It is a claim
  // about where the reader is, not a state of the system, so it carries no dot.
  const badges = page.locator(`${ROWS} .work-here`);

  await expect(badges).toHaveCount(1);
  await expect(badges).toHaveText("YOU ARE HERE");
  await expect(page.locator(ROWS).nth(1).locator(".work-here")).toHaveCount(1);
});

test("the head counts the rows it drew", async ({ page }) => {
  // The fixture holds three where production holds two, so a hard-coded `02`
  // would be visible here immediately — the trap H5a wrote down for SYS.02.
  await expect(page.locator(`${PART} .work-count`).first()).toHaveText(
    "SHOWING 03 OF 03 · FIGURES FROM /api/systems",
  );
});

test("the stat rail counts the same rows the list drew", async ({ page }) => {
  const values = page.locator(`${PART} .work-stats[data-counted] .work-stat dd`);

  await expect(values).toHaveText(["03", "01", "01", "01"]);
});

test("the resting state says nothing rather than zero", async ({ page }) => {
  // The second demo under the same heading is `body={null}` — the fallback, and
  // also what a failed read looks like. Its rail collapses to one tile because
  // the absence is one fact, not four.
  const rails = page.locator(`${PART} .work-stats`);

  await expect(rails.nth(1)).not.toHaveAttribute("data-counted", "");
  await expect(rails.nth(1).locator(".work-stat dd")).toHaveText("— NO DATA");
});

test("the row changes shape only at the two widths layout.css gives it", async ({ page }) => {
  // H6 MEASURED THIS INSTEAD OF INHERITING IT, which is the open half of a
  // switch G1 declared and nobody ever held against a row. `.work-row` had a
  // 560 rule from the start; the row is five fixed tracks and four gaps, 400px
  // of chrome at every width, against a content minimum the Intermediate Widths
  // register states as 300. That crossing is at a 780px viewport, and 900 is the
  // declared switch above it — 720 would leave sixty pixels in which the row is
  // drawn under its own stated minimum.
  const row = page.locator(ROWS).first();
  const width = widthOf(page);

  const display = await row.evaluate((el) => getComputedStyle(el).display);
  expect(display).toBe(width >= 900 ? "grid" : "flex");

  // And the sixth track goes at 1080 — dropped, never shrunk. "WEGLASSEN VOR
  // VERKLEINERN: unter 1080 fällt die Vorschau in der Work-Zeile weg, sie wird
  // nicht 60px klein."
  const preview = await row
    .locator(".prev")
    .evaluate((el) => getComputedStyle(el).display);
  expect(preview).toBe(width >= 1080 ? "block" : "none");
});

test("the stacked card is left-aligned and full width", async ({ page }) => {
  // THE BUG THIS PHASE FOUND IN A ROW IT DID NOT WRITE. `align-items: center` is
  // correct for the grid and wrong for the stack, where the cross axis is
  // horizontal — it centres every line of the card. `.sys-row` had been doing
  // exactly that on the homepage at 390 since H5a, in production, where there
  // is an api and the rows are real.
  if (widthOf(page) >= 900) return;

  const box = await page.locator(ROWS).first().boundingBox();
  const id = await page.locator(`${ROWS} .work-id`).first().boundingBox();

  expect(box).not.toBeNull();
  expect(id).not.toBeNull();
  // The 8px inset is the row's own padding; anything more is centring.
  expect(Math.round((id?.x ?? 0) - (box?.x ?? 0))).toBeLessThanOrEqual(8);
});

test("nothing in the gallery's work section overflows the window", async ({ page }) => {
  // EVALUATED ON THE LOCATOR AND NOT ON THE PAGE, because `PART` is a Playwright
  // selector: `:text-is()` is its engine's, not CSS, and `document.querySelector`
  // throws on it. Handing the resolved element in is the difference between
  // asking the browser to parse our selector and asking it to measure our
  // element — and the whole gallery is checked elsewhere, so this must not fall
  // back to the document.
  const over = await page.locator(PART).first().evaluate((part) => {
    let worst = 0;
    for (const el of part.querySelectorAll("*")) {
      const right = el.getBoundingClientRect().right;
      worst = Math.max(worst, right - document.documentElement.clientWidth);
    }
    return worst;
  });

  expect(over).toBeLessThanOrEqual(1);
});

/* ── The filters, H6b ──────────────────────────────────────────────────────
   THE ONLY PLACE THEY CAN BE PRESSED IN THIS RIG, for the reason at the top of
   this file: `/work` renders an outage panel, and a chip row over no rows is
   not what a reader gets. `mobile-menu.coarse.spec.ts` is the model for the
   shape of these — a premise first, then the computed value rather than the
   successful click.                                                         */

/** The two rows, and the list they narrow. Scoped to the fixture with rows. */
const FILTERS = `${PART} .work-filters`;
const CHIPS = `${FILTERS} .chip`;

/** One chip by its visible word, which is how a reader picks it too. */
function chip(page: Page, label: string) {
  return page.locator(CHIPS).filter({ hasText: label }).first();
}

test("the premise: both rows are drawn and nothing is narrowed yet", async ({ page }) => {
  // If the island ever stopped rendering, every assertion below would pass by
  // finding nothing. This is the one that fails instead.
  await expect(page.locator(`${FILTERS} .work-filter-label`)).toHaveText(["STATUS", "STACK"]);

  // Four status chips: the sentinel and the contract's three states. The
  // vocabulary is the enum, so it does not move with the fixture.
  await expect(page.locator(`${FILTERS} .work-chips`).first().locator(".chip")).toHaveText([
    "ALL03",
    "LIVE01",
    "IN BUILD01",
    "QUEUED01",
  ]);

  // Both sentinels are the pressed pair a page loads in.
  await expect(page.locator(`${CHIPS}[data-sentinel][aria-pressed="true"]`)).toHaveCount(2);
});

test("the chip counts are the rail's numbers in the rail's notation", async ({ page }) => {
  // `03` above and `3` below would be one count in two notations. Both go
  // through `padTwo`, and the sheet's rule is that every number on this page is
  // two digits and tabular.
  const rail = await page.locator(`${PART} .work-stats[data-counted] .work-stat dd`).allTextContents();
  const chips = await page.locator(`${FILTERS} .work-chips`).first().locator(".chip .chip-n").allTextContents();

  expect(chips).toEqual(rail);
});

test("the stack row is derived from the answer, so no chip matches nothing", async ({ page }) => {
  // The sheet types five chips — ANY · GO · TYPESCRIPT · PYTHON · POSTGRES ·
  // DOCKER — against stacks that contain neither `TypeScript` nor anything
  // spelled `POSTGRES`. Three of them would have emptied the list every time
  // they were pressed. These come out of `stackTags`, sorted by key.
  const stack = page.locator(`${FILTERS} .work-chips`).nth(1).locator(".chip");

  await expect(stack.first()).toHaveText("ANY");
  await expect(stack.filter({ hasText: "TYPESCRIPT" })).toHaveCount(0);
  await expect(stack.filter({ hasText: "PostgreSQL" })).toHaveCount(1);

  // Every chip that is not the sentinel selects at least one row.
  const labels = await stack.allTextContents();
  for (const label of labels.slice(1)) {
    await chip(page, label).click();
    await expect(page.locator(ROWS)).not.toHaveCount(0);
  }
});

test("a status chip narrows the list and the counter says by how much", async ({ page }) => {
  await chip(page, "LIVE").click();

  await expect(page.locator(ROWS)).toHaveCount(1);
  await expect(page.locator(ROWS).locator(".work-name")).toHaveText("timseil.dev");
  await expect(page.locator(`${PART} .work-count`).first()).toHaveText(
    "SHOWING 01 OF 03 · FIGURES FROM /api/systems",
  );

  // The total does not move. It is what the answer held, not what survived.
  await chip(page, "QUEUED").click();
  await expect(page.locator(`${PART} .work-count`).first()).toContainText("OF 03");
});

test("pressing a chip presses exactly one on its own row and leaves the other alone", async ({
  page,
}) => {
  await chip(page, "LIVE").click();

  const status = page.locator(`${FILTERS} .work-chips`).first().locator(".chip");
  await expect(status.filter({ has: page.locator('[aria-pressed="true"]') })).toHaveCount(0);
  await expect(page.locator(`${CHIPS}[aria-pressed="true"]`)).toHaveCount(2);
  await expect(chip(page, "LIVE")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "ALL")).toHaveAttribute("aria-pressed", "false");
  // The other axis is untouched: its sentinel is still the pressed one.
  await expect(chip(page, "ANY")).toHaveAttribute("aria-pressed", "true");
});

test("set is inverted, and the difference is a fill rather than a shade", async ({ page }) => {
  // "gesetzt = invertiert" is the inventory's word for this state. Read as a
  // computed value rather than trusted from a class, because a click that works
  // says nothing about what it drew.
  const read = (label: string) =>
    chip(page, label).evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, color: s.color };
    });

  const rest = await read("QUEUED");
  await chip(page, "QUEUED").click();
  const set = await read("QUEUED");

  // Read off the token rather than written down here — invariant 8 applies to a
  // test as much as to a stylesheet, and an assertion carrying its own copy of
  // the accent would keep passing after the palette moved under it.
  const accent = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--acc)";
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });

  expect(set.background).toBe(accent);
  expect(set.background).not.toBe(rest.background);
  expect(set.color).not.toBe(rest.color);
});

test("the two axes narrow together, and the panel says which two", async ({ page }) => {
  // The combination neither chip reaches alone: one row is LIVE, one is Python,
  // and no row is both. This is the only way `/work` reaches nought, because a
  // derived stack chip can never be empty on its own.
  await chip(page, "LIVE").click();
  await chip(page, "Python").click();

  await expect(page.locator(ROWS)).toHaveCount(0);
  await expect(page.locator(`${PART} .work-count`).first()).toHaveText(
    "SHOWING 00 OF 03 · FIGURES FROM /api/systems",
  );

  const panel = page.locator(`${PART} .st-empty-panel`).first();
  await expect(panel.locator(".st-empty-head")).toHaveText("NO SYSTEMS MATCH THIS COMBINATION");
  // STATE.05: a dead state without a reason is a bug. The sheet's own line
  // carries none, so `EmptyState` requires one and this is it.
  await expect(panel.locator(".st-empty-reason")).toContainText("narrow together");
  // And it echoes back what is narrowing, so the cause is read rather than
  // inferred — both of them, in the order the rows are drawn.
  await expect(panel.locator(".st-empty-filters span")).toHaveText(["LIVE", "Python"]);
});

test("the way back puts both axes on their sentinel", async ({ page }) => {
  await chip(page, "LIVE").click();
  await chip(page, "Python").click();

  await page.locator(`${PART} .st-empty-panel .btn`).first().click();

  await expect(page.locator(ROWS)).toHaveCount(3);
  await expect(chip(page, "ALL")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "ANY")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`${PART} .work-count`).first()).toHaveText(
    "SHOWING 03 OF 03 · FIGURES FROM /api/systems",
  );
});

test("every chip is a button, and the keyboard works one", async ({ page }) => {
  // The sheet draws `<span onClick>` with no role, no tabindex and no key
  // handler, and has no keyboard note anywhere. State Language allows no
  // exception — "gleiche form für alle elemente" — so these are buttons, which
  // answer Enter and Space without this page owning a handler for either.
  await expect(page.locator(`${CHIPS}:not(button)`)).toHaveCount(0);

  await chip(page, "LIVE").focus();
  await expect(chip(page, "LIVE")).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.locator(ROWS)).toHaveCount(1);

  await chip(page, "ALL").focus();
  await page.keyboard.press("Space");
  await expect(page.locator(ROWS)).toHaveCount(3);
});

test("each row of chips is a group named by the label beside it", async ({ page }) => {
  const groups = page.locator(`${FILTERS} .work-chips[role="group"]`);

  await expect(groups).toHaveCount(2);

  for (const [index, word] of ["STATUS", "STACK"].entries()) {
    const id = await groups.nth(index).getAttribute("aria-labelledby");
    expect(id).not.toBeNull();
    await expect(page.locator(`#${id ?? ""}`)).toHaveText(word);
  }
});

test("the row carries what the chip selects it by", async ({ page }) => {
  // Nothing in the site's own code reads these — the filter runs in React, not
  // over the DOM. They exist so this assertion can be made at all: that the
  // element a chip claims is the element that carries the claim.
  const rows = page.locator(ROWS);

  await expect(rows.nth(0)).toHaveAttribute("data-st", "queued");
  await expect(rows.nth(1)).toHaveAttribute("data-st", "live");
  await expect(rows.nth(2)).toHaveAttribute("data-st", "in_build");

  const sk = await rows.nth(2).getAttribute("data-sk");
  expect(sk?.split(" ")).toContain("go");
});

test("the filter block reshapes only at the switch the row already uses", async ({ page }) => {
  // 900, and not a fifth number: the label sits beside its chips above it and
  // above them below it. `.work-row` becomes a card at the same width.
  const columns = await page
    .locator(FILTERS)
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);

  expect(columns).toBe(widthOf(page) >= 900 ? 2 : 1);
});

test("the chips wrap rather than hiding themselves behind a swipe", async ({ page }) => {
  // The 390 artboard puts both rows in `overflow-x:auto` with the scrollbar
  // suppressed. It draws six stack chips it typed; this row holds however many
  // the answer named, which is sixteen in this fixture — and a hidden scrollbar
  // at the one width where the reader cannot see there is more is the shape
  // #294 already holds open against the request path.
  const box = await page.locator(`${FILTERS} .work-chips`).nth(1).evaluate((el) => {
    const s = getComputedStyle(el);
    return { wrap: s.flexWrap, overflow: s.overflowX, scroll: el.scrollWidth - el.clientWidth };
  });

  expect(box.wrap).toBe("wrap");
  expect(box.overflow).toBe("visible");
  expect(box.scroll).toBeLessThanOrEqual(1);
});
