/**
 * The training log's rows in the one place all five of them exist.
 *
 * WHY THIS FILE HAD TO BE WRITTEN, and it is `gallery.ops.spec.ts`'s reason one
 * page over. `home.spec.ts` checks SYS.01 on the page that carries it, and
 * there it is empty: this rig runs a production build with NO API, so `/`
 * shows the outage panel and there is not a single track row in the document.
 * A spec that asked about rows there would pass by finding nothing to check —
 * the shape H2b named and the shape this repository keeps re-finding.
 *
 * The gallery renders the same components from data in the page. Two of the
 * five states cannot be produced by production either: `core` needs two live
 * systems and `learning` needs one in build, and this site has one system,
 * live. The seed is 13 x applied and 9 x queued, so without this route the
 * other two would ship never having been looked at.
 *
 * WHAT IS ASSERTED HERE THAT IS NOT ASSERTED ANYWHERE ELSE: that the evidence
 * line is readable without a hover. That is the phase's one contested decision
 * — the handoff inventory says `rest 28 %`, the SYS.01 sheet says "immer voll
 * lesbar" — and a decision with no test is how the other reading comes back.
 */
import { expect, test } from "@playwright/test";

const GALLERY = "/dev/components";

/** The demo card, so nothing here can accidentally match another component. */
const CARD = ".gal-part:has(.gal-name:text-is('SkillRow')) .trn-grid";
const ROWS = `${CARD} .trn-row`;

test.beforeEach(async ({ page }) => {
  await page.goto(GALLERY);
  // No `settled()`: nothing on this route waits for an api, which is the
  // property that makes it usable here in the first place.
  await expect(page.locator(ROWS)).toHaveCount(5);
});

// THE DECISION OF THIS PHASE, AS A TEST.
//
// The build plan writes it as a sentence — "die Information darf nie nur in der
// Deckkraft liegen" — and a sentence is not a gate. What follows fails if
// anybody builds the inventory's `rest 28 %` instead.
test("the evidence line is readable without touching anything", async ({ page }) => {
  const lines = page.locator(`${ROWS} .trn-evi`);
  await expect(lines).toHaveCount(5);

  for (let i = 0; i < 5; i++) {
    const line = lines.nth(i);
    await expect(line).toBeVisible();

    // Opacity is the thing the inventory would have dimmed, so opacity is what
    // is read — on the line and on every box between it and the row, because a
    // parent at 28 % dims a child that says 1.
    const opacity = await line.evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement;
      let value = 1;
      while (node !== null && !node.classList.contains("trn-grid")) {
        value *= Number(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      return value;
    });
    expect(opacity, `row ${String(i)} hides its evidence until hover`).toBe(1);
  }
});

test("a hover adds no words the resting row does not have", async ({ page }) => {
  // The other half of the same decision, and the reason "Skill-Zeilen-Hover auf
  // Touch prüfen" is not on this phase's list: there is nothing behind the
  // hover to reach. A finger cannot hover, so anything only a hover reveals is
  // absent on a phone — this asserts there is nothing to be absent.
  const row = page.locator(ROWS).first();
  const resting = (await row.innerText()).trim();

  await row.hover();
  expect((await row.innerText()).trim()).toBe(resting);
});

test("every state says its own word, and no two say the same one", async ({ page }) => {
  // Four states plus the one this build cannot name. `— NO DATA` is in the list
  // on purpose: it is what the fifth row must say, and a row that guessed at a
  // word instead would be an invented claim about somebody's skill.
  const words = await page.locator(`${ROWS} .trn-state, ${ROWS} .st-nodata-text`).allInnerTexts();

  expect(words.map((w) => w.trim())).toEqual([
    "CORE",
    "APPLIED",
    "LEARNING",
    "QUEUED",
    "— NO DATA",
  ]);
});

test("the bar is a second feature and not a repeat of the colour", async ({ page }) => {
  // Four states, four different fills, so the ordering survives a greyscale
  // screenshot and a palette swap. words.test.ts holds the same claim against
  // the table; this holds it against what the browser actually drew.
  const filled = await page.locator(ROWS).evaluateAll((rows) =>
    rows.map((row) => row.querySelectorAll(".trn-seg[data-on]").length),
  );

  expect(filled).toEqual([4, 3, 2, 0, 0]);
});

test("the bar is out of the accessibility tree", async ({ page }) => {
  // It says exactly what the word beside it says, and a screen reader should
  // hear that once. Four unlabelled boxes per row, twenty-two rows, is noise
  // with no content.
  const bars = page.locator(`${ROWS} .trn-bar`);
  await expect(bars).toHaveCount(5);

  for (let i = 0; i < 5; i++) {
    await expect(bars.nth(i)).toHaveAttribute("aria-hidden", "true");
  }
});

test("a row with no system points at nothing rather than at an arrow", async ({ page }) => {
  // `NO SYSTEM YET` is a whole sentence. The arrow belongs to the target, so a
  // row without one must not draw it — home.css puts it on `.trn-sys::before`
  // for exactly this, and `::before` on an element that is not there draws
  // nothing.
  const queued = page.locator(ROWS).nth(3);
  await expect(queued.locator(".trn-pre")).toHaveText("NO SYSTEM YET");
  await expect(queued.locator(".trn-sys")).toHaveText("SELF-STUDY");

  const unknown = page.locator(ROWS).nth(4);
  await expect(unknown.locator(".trn-pre")).toHaveText("NO SYSTEM YET");
  await expect(unknown.locator(".trn-sys")).toHaveCount(0);
});

test("an empty module keeps its card and counts to nought", async ({ page }) => {
  // ADR 0018 keeps a module with no tracks in the answer: "das Modul ist leer"
  // is a different statement from "das Modul gibt es nicht". The card is how
  // the interface makes the same distinction, and `0 TRACKS` is a count of what
  // is drawn rather than a number from a field — so it cannot disagree with it.
  const cards = page.locator(`${CARD} .trn-mod`);
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1).locator(".trn-mod-count")).toHaveText("0 TRACKS");
  await expect(cards.nth(1).locator(".trn-row")).toHaveCount(0);
});

test("each module's count is the number of rows under it", async ({ page }) => {
  const cards = page.locator(`${CARD} .trn-mod`);
  const counted = await cards.evaluateAll((els) =>
    els.map((el) => ({
      says: (el.querySelector(".trn-mod-count")?.textContent ?? "").trim(),
      has: el.querySelectorAll(".trn-row").length,
    })),
  );

  for (const card of counted) {
    expect(card.says, "a card's count and its rows disagree").toBe(
      `${String(card.has)} ${card.has === 1 ? "TRACK" : "TRACKS"}`,
    );
  }
});
