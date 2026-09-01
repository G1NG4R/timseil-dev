/**
 * The homepage, at the seven widths.
 *
 * THE SHEET STATES ONE TEST AND THIS FILE OPENS WITH IT: "die vier Marker
 * müssen auf der Seite in aufsteigender Reihenfolge stehen. Das ist der ganze
 * Test." lib/home/sections.test.ts asks the same question of the list; this
 * asks it of the rendered document, because a correct list can still be
 * rendered in the wrong order.
 *
 * WHAT IS NOT HERE. Geometry against the drawing is `home.sheet.spec.ts`, and
 * where the layout is allowed to change shape is `home.sweep.spec.ts`. This
 * file is about what the page says and what it refuses to do.
 *
 * THE API IS DOWN IN THIS RIG, ALWAYS. playwright.config.ts runs a production
 * build with no api behind it, so `— NO DATA` is the DEFAULT case here and not
 * the exception. That is the right way round: the empty state is the one that
 * ships first, and H1 wrote down what happens to a phase that tests the full
 * page and ships the empty one.
 */
import { expect, test, type Page } from "@playwright/test";

import { HOME_REGIONS, settled } from "./streaming";
import { HOME, MOBILE_BREAKPOINT } from "./widths";

/** The width this project is running at. */
function widthOf(page: Page): number {
  const size = page.viewportSize();
  if (size === null) throw new Error("no viewport");
  return size.width;
}

test.beforeEach(async ({ page }) => {
  await page.goto(HOME);
  await settled(page, HOME_REGIONS);
});

test.describe("HOME.01, on the page rather than in the list", () => {
  // `toEqual` on the sequence, and that is the difference between this test and
  // one that passes on a broken page: four `toBeVisible()` calls are just as
  // green when the markers read 02 · 01 · 03 · 04, which is the copy K-26
  // found.
  test("the four markers stand in ascending order", async ({ page }) => {
    await expect(page.locator("main .sec-id")).toHaveText([
      "SYS.01",
      "SYS.02",
      "SYS.03",
      "SYS.04",
    ]);
  });

  // Every empty panel says WHY it is empty. STATE.05: a dead state without a
  // reason is a bug, and four grey rectangles would satisfy the test above.
  //
  // ONE SHELL AND FOUR OUTAGES SINCE H5b, and the difference between the two
  // headings is the whole state language rather than bookkeeping. `[SOON]` is a
  // component that does not exist yet; `— NO DATA` is one that exists and whose
  // source did not answer. This rig runs a production build with NO API —
  // playwright.config.ts says so — so every built section stands here in its
  // outage panel, every run.
  //
  // That makes this test the one place the rig sees those failure paths without
  // arranging anything, which is why the assertion names them rather than
  // widening to "one of two headings".
  //
  // FIVE PANELS FOR FOUR SECTIONS, and the fifth is the point rather than an
  // off-by-one: SYS.03 reads TWO endpoints, and each of its blocks fails on its
  // own. A section that answered for one and not the other would look exactly
  // like this test expects, which is what having two panels is for.
  test("every shell says what is missing and why", async ({ page }) => {
    const panels = page.locator("main .st-empty-panel");
    await expect(panels).toHaveCount(5);

    // FOUR AND ONE SINCE H5b. SYS.01, SYS.02 and both blocks of SYS.03 are
    // built and their endpoints are unreachable here; SYS.04 does not exist yet.
    // The day it is built this line goes red — which is what it is for, and it
    // will have nothing left to say afterwards.
    const headings = panels.locator(".st-empty-head");
    await expect(headings).toHaveText([
      "— NO DATA",
      "— NO DATA",
      "— NO DATA",
      "— NO DATA",
      "[SOON]",
    ]);

    for (let i = 0; i < 5; i++) {
      const reason = await panels.nth(i).locator(".st-empty-reason").innerText();
      expect(reason.trim().length, `panel ${String(i)} has no reason`).toBeGreaterThan(30);
    }
  });

  // THE TWO OUTAGE SENTENCES ARE NOT ONE SENTENCE, and this is the line that
  // holds them apart. Both sections are down for the same reason in this rig,
  // and a reader is told WHICH endpoint did not answer — which is the only part
  // of the message that lets anyone check it.
  test("each failed section names its own endpoint", async ({ page }) => {
    const reasons = page.locator("main .st-empty-panel .st-empty-reason");

    await expect(reasons.nth(0)).toContainText("/api/training");
    await expect(reasons.nth(1)).toContainText("/api/systems");
    // SYS.03's two blocks, and they are two sentences for the reason above: a
    // shared one would name neither of the endpoints it stands over.
    await expect(reasons.nth(2)).toContainText("/api/contributions");
    await expect(reasons.nth(3)).toContainText("/api/systems");
  });

  // The head is inside the streamed region, so it arrives with the answer — and
  // when there is no answer it still has to name what it was reading. A section
  // that lost its source line during an outage would be an empty panel with no
  // way for a reader to check the claim.
  test("SYS.01 names its source even when nothing answered", async ({ page }) => {
    const meta = page.locator("main .sec-meta").first();
    await expect(meta).toContainText("SOURCE: /api/training");
    // Invariant 1 where a count belongs: `0 TRACKS` would be a measurement.
    await expect(meta).toContainText("— NO DATA TRACKS");
  });

  // THE REGRESSION H5a SHIPPED AND A TOUCH TEST CAUGHT BY COUNTING. Swapping the
  // shell for the real section took the shell's `WORK →` with it, and nothing
  // asserted the link itself — only that `main` held two tappable things. This
  // is the assertion the count was standing in for.
  test("a section that failed still offers the way out it declares", async ({ page }) => {
    const panel = page.locator("main .st-empty-panel").nth(1);
    await expect(panel.locator("a")).toHaveAttribute("href", "/work");
  });

  test("SYS.02 does the same, with its own count and its own source", async ({ page }) => {
    const meta = page.locator("main .sec-meta").nth(1);
    await expect(meta).toContainText("SOURCE: /api/systems");
    // `00 SYSTEMS` would say the api answered and there are none. It did not
    // answer, and those are two different claims.
    await expect(meta).toContainText("— NO DATA SYSTEMS");
  });
});

test.describe("the hero", () => {
  // One, and it carries the sentence. The mobile artboard draws an `<h2>`,
  // which is a drawing of a crop and not of a document outline; a page with no
  // `<h1>` is also an axe finding.
  test("there is exactly one h1 and it is the display statement", async ({ page }) => {
    const h1 = page.locator("main h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("I build the systems behind the screen.");
  });

  // K-08: 62 for the homepage and About, 34 on a phone. Neither number is in
  // home.css — globals.css and layout.css own them — so this is also the test
  // that would catch the case study's `:where()` leaking onto this page.
  test("the display step is the one K-08 gives this page", async ({ page }) => {
    const size = await page
      .locator("main h1")
      .evaluate((el) => getComputedStyle(el).fontSize);

    expect(size).toBe(widthOf(page) < 720 ? "34px" : "62px");
  });

  // K-23 and K-14 in one assertion, and it has to run in both directions: the
  // finding that produced K-23 was the two words having swapped places.
  test("AVAILABLE is the hero's word and ONLINE is the footer's", async ({ page }) => {
    await expect(page.locator(".hero-avail")).toContainText("AVAILABLE");
    await expect(page.locator(".hero-avail")).not.toContainText("ONLINE");
    await expect(page.locator(".foot-meta")).not.toContainText("AVAILABLE");
  });

  // The large dot is the homepage's alone. A rule that landed in chrome.css
  // instead of home.css would put it on all ten pages and nothing else here
  // would notice.
  test("the large dot appears on this page and on no other", async ({ page }) => {
    await expect(page.locator(".hero-dot")).toHaveCount(1);
    await page.goto("/about");
    await expect(page.locator(".hero-dot")).toHaveCount(0);
  });
});

test.describe("the terminal placeholder", () => {
  // THE DoD TEST OF THIS PHASE. The sheet draws an input here; ADR 0058 refuses
  // it. Transcribing the artboard faithfully is the likeliest way to break this
  // decision, and it would break it silently — an input that accepts nothing
  // looks exactly like one that does until somebody types.
  test("nothing in it can be focused", async ({ page }) => {
    await expect(page.locator(".term")).toHaveCount(1);
    await expect(
      page.locator(".term").locator("input, textarea, button, select, a[href], [tabindex]"),
    ).toHaveCount(0);
  });

  // And it says why it is inert rather than sitting there greyed out.
  test("it says which stage owes it", async ({ page }) => {
    await expect(page.locator(".term")).toContainText("[SOON]");
    await expect(page.locator(".term")).toContainText("QUEUED");
  });

  // The island: one region, and the row is either a state word or `— NO DATA`
  // — never blank, never both. The rig has no api, so `— NO DATA` is what runs
  // here; the assertion is written so that an api answering would pass too.
  test("the api row carries an answer or admits it has none", async ({ page }) => {
    const row = page.locator(".term .term-row").first();
    await expect(row).toHaveCount(1);

    const text = (await row.innerText()).replace(/^api/, "").trim();
    expect(text.length, "the api row is blank").toBeGreaterThan(0);
    expect(["— NO DATA", "LIVE", "DEGRADED"]).toContain(text);
  });
});

test.describe("the page as a whole", () => {
  // The defect this phase actually shipped and the rig actually caught, made
  // into a question that names its own cause. It surfaced two levels away —
  // as the mobile menu's close button landing outside the visible width —
  // because a horizontally overflowing page widens the layout viewport and the
  // dialog with it.
  test("nothing pushes the page wider than the window", async ({ page }) => {
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(overflow.scrollWidth, "something overflows horizontally").toBeLessThanOrEqual(
      overflow.clientWidth,
    );
  });

  // HOME.01's sixth line is the footer, in its long form. CHR.01 puts the
  // contact block on this page; lib/chrome.ts decides it and this reads the
  // decision off the rendered page.
  test("the footer is the long one", async ({ page }) => {
    await expect(page.locator(".foot-lead")).toHaveCount(1);
  });

  // K-05: on `/` no navigation entry is the current page. Above 900 only —
  // below it the desktop nav is not rendered at all, which is the 900 switch
  // and layout.sweep's business rather than this file's.
  test("no navigation entry claims to be this page", async ({ page }) => {
    test.skip(widthOf(page) < MOBILE_BREAKPOINT, "the desktop nav does not exist here");
    await expect(page.locator(".nav-desktop [aria-current]")).toHaveCount(0);
  });
});

/**
 * #257, and it is here rather than in touch-targets.coarse.spec.ts because the
 * pointer it is about is the one that file does not have.
 *
 * MEASURED, NOT GREPPED. K-27 is the finding that made that a rule: the first
 * touch pass counted `min-height: 44px` and missed seventeen chips that got
 * their height from padding. This reads boxes off the page and does the
 * arithmetic 2.5.8 actually specifies.
 */
test.describe("what a mouse has to hit", () => {
  test("the theme swatches are 24 apart, centre to centre", async ({ page }) => {
    const boxes = await page.locator(".theme-row [role='radio']").evaluateAll((els) =>
      els.map((el) => {
        const box = el.getBoundingClientRect();
        return { centre: box.x + box.width / 2, width: box.width };
      }),
    );

    // The presence check first. Seven is the number every sheet draws and the
    // number ThemeSwitch renders; an empty list would make the loop below pass
    // without measuring anything, which is the shape H2b found four times.
    expect(boxes, "no theme swatches to measure").toHaveLength(7);

    for (let i = 1; i < boxes.length; i++) {
      const offset = boxes[i].centre - boxes[i - 1].centre;
      // WCAG 2.2 AA 2.5.8: a target under 24 x 24 passes when its centre is at
      // least 24 from every adjacent target's. These are 11 wide by design —
      // the Chrome sheet draws them that way — so the offset is what has to
      // carry it.
      expect(
        offset,
        `swatch ${String(i)} sits ${String(offset)} from its neighbour's centre`,
      ).toBeGreaterThanOrEqual(24);
    }
  });
});
