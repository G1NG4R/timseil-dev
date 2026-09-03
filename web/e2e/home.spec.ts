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
  // FOUR PANELS AND NO SHELL SINCE H5c, and the `[SOON]` that stood at the end
  // of this list is gone rather than moved. The line it was on said what it was
  // for — "the day it is built this line goes red, which is what it is for" —
  // and SYS.04 is that day. What is left is one heading repeated four times,
  // which is the whole state language: `— NO DATA` is a component that exists
  // and whose source did not answer. This rig runs a production build with NO
  // API — playwright.config.ts says so — so every API-backed section stands in
  // its outage panel, every run.
  //
  // FOUR PANELS FOR THREE SECTIONS, and the fourth is the point rather than an
  // off-by-one: SYS.03 reads TWO endpoints, and each of its blocks fails on its
  // own. A section that answered for one and not the other would look exactly
  // like this test expects, which is what having two panels is for.
  //
  // That makes this test the one place the rig sees those failure paths without
  // arranging anything, which is why the assertion spells the heading out four
  // times rather than widening to "each one says something".
  //
  // AND SYS.04 IS NOT HERE AT ALL, which is the thing that changed. Its source
  // is content/posts in this repository, so it is the one section on this page
  // the rig can see with real data in it — the assertions further down are
  // about the rows themselves rather than about a panel standing in for them.
  test("every empty panel says what is missing and why", async ({ page }) => {
    const panels = page.locator("main .st-empty-panel");
    await expect(panels).toHaveCount(4);

    const headings = panels.locator(".st-empty-head");
    await expect(headings).toHaveText(["— NO DATA", "— NO DATA", "— NO DATA", "— NO DATA"]);

    for (let i = 0; i < 4; i++) {
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

// THE FIRST SECTION OF THIS PAGE THE RIG CAN SEE SINCE H3, and that is why this
// block exists rather than a fifth gallery spec. H4, H5a and H5b each wrote the
// same limit down: this rig builds the site in production mode with NO api, so
// every section that reads an endpoint stands here as an outage panel and not
// one row, cell or column of it is in the document — every measurement had to
// move to /dev/components.
//
// SYS.04 reads content/posts out of the repository, which the rig has. So its
// rows are real rows, its count is a real count, and both are asserted where
// they ship instead of in a gallery that frames its own components.
test.describe("SYS.04, the log", () => {
  test("draws the three newest entries, newest first", async ({ page }) => {
    const rows = page.locator(".log-row");
    await expect(rows).toHaveCount(3);

    const dates = await page.locator(".log-date").allInnerTexts();
    expect(dates).toHaveLength(3);
    for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Descending, and the tie-break matters: several posts share a day, so a
    // sort on the date alone would leave these three to readdir order.
    expect(dates).toEqual([...dates].sort().reverse());

    // Every cell the row draws has something in it. H5a's finding was a column
    // that computed to zero pixels wide, and the reason nothing caught it was
    // that nothing looked at a row at all.
    for (let i = 0; i < 3; i++) {
      const row = rows.nth(i);
      await expect(row.locator(".log-title")).not.toBeEmpty();
      await expect(row.locator(".log-deck")).not.toBeEmpty();
    }
  });

  test("names its source and counts the rows it drew", async ({ page }) => {
    const meta = page.locator(".log .sec-meta");
    // The count is `logEntries().length`, not the sheet's drawn `LATEST 03`.
    await expect(meta).toHaveText("LATEST 03 · SOURCE: content/posts");
  });

  // THE DoD TEST OF THIS PHASE, and it is written as a count because a missing
  // link is invisible and an extra one is not. `/blog/<slug>` is a 404 until H9,
  // so a row that linked would be evidence pointing into nothing — invariant 5,
  // and the decision components/home/LogRow.tsx carries.
  test("no row is a link, and the section's one link is in its head", async ({ page }) => {
    await expect(page.locator(".log-row a")).toHaveCount(0);
    await expect(page.locator(".log a")).toHaveCount(1);
    await expect(page.locator(".log .sec-action a")).toHaveAttribute(
      "href",
      "/work/timseil-dev",
    );
  });

  // The sheet writes `SYSTEM 02 · CASE STUDY →` and the 02 comes from
  // /api/systems, which this section does not read. Typing it here is the
  // failure `systemsMeta` names in its own comment.
  test("the head's link carries no number it did not read", async ({ page }) => {
    await expect(page.locator(".log .sec-action")).toHaveText("CASE STUDY →");
  });

  // The one section on this page that is in the static shell rather than behind
  // a boundary, and the raw document is the only witness that can say so: an
  // interactive browser has already run the swap by the time anyone looks.
  test("its rows are in the document before anything streams", async ({ page }) => {
    const html = await (await page.request.get("/")).text();
    expect(html).toContain("LATEST 03 · SOURCE: content/posts");
    expect(html.match(/class="log-row"/g) ?? []).toHaveLength(3);
  });
});

test.describe("the foot of the page", () => {
  test("carries the bio and the way to the long version", async ({ page }) => {
    await expect(page.locator(".bio-text")).not.toBeEmpty();
    await expect(page.locator(".bio a")).toHaveAttribute("href", "/about");
  });

  // ADR 0055: images are K2's, and an invented picture is the picture version of
  // an invented number. The sheet draws a 92x92 `[PORTRAIT]` box here.
  test("draws no portrait placeholder", async ({ page }) => {
    await expect(page.locator("main")).not.toContainText("[PORTRAIT]");
    await expect(page.locator("main img")).toHaveCount(0);
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

  // The large dot is the homepage's alone — K-14, resolved as "Punkt in der
  // Meta-Leiste jeder Seite, gross im Hero nur auf der Startseite". A rule that
  // landed in chrome.css instead of home.css would put it on all ten pages and
  // nothing else here would notice.
  //
  // IT WALKS TO `/about` AND THAT STOPPED BEING A FORMALITY IN H7. When this
  // was written the target was a `[SOON]` stub, so the assertion could only
  // ever have failed through a stylesheet. It is a page now, and it is the very
  // artboard K-14 was filed against: the About sheet draws this dot in its own
  // hero. H7a built it from the drawing, and this line went red on the first
  // full run. Where a canvas artefact and the correction table disagree, the
  // table is the decision — ADR 0055 — and this is what says so out loud.
  // FOUND IN H7, ON THIS PAGE, BY MEASURING A DIFFERENT ONE. `/about` gave a
  // section head a seven-word meta and its title broke in half at 390. Bisecting
  // that showed SYS.01 doing the same thing here, from 560 up to and including
  // 744 — a 185px band of widths, in production since H4. Nothing caught it
  // because no test read a head's line count, and when a title wraps nothing
  // else in the row moves: no overflow, no changed switch, no failing sweep.
  //
  // layout.css puts the meta on its own line from 900 down, and 900 rather than
  // 720 because 720 would leave twenty-four pixels in which this head is still
  // drawn under its own minimum.
  test("no section title is squeezed into two lines by its own meta", async ({ page }) => {
    const wrapped = await page.evaluate(() =>
      [...document.querySelectorAll("main .sec .sec-title")]
        .filter((title) => {
          const lh = Number.parseFloat(getComputedStyle(title).lineHeight);
          return title.getBoundingClientRect().height / lh > 1.5;
        })
        .map((title) => title.textContent),
    );

    expect(wrapped, "a section title broke over two lines").toEqual([]);
  });

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
