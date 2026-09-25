/**
 * `/about` at every checked width.
 *
 * THE FIRST PAGE OF STAGE H THAT THE RIG SEES WHOLE. The three before it read
 * an endpoint, and this rig runs a production build with no api — so `/work` is
 * an outage panel here and half of SYS.01 is only ever in the gallery. Nothing
 * on this page is an answer: every word comes out of lib/about/ and lib/i18n/,
 * so what this file measures is the page a visitor gets.
 *
 * WHAT IT IS FOR, ABOVE EVERYTHING ELSE: the About sheet is the most
 * placeholder-dense drawing in the handoff — eleven bracketed strings across
 * two artboards, in two languages — and this phase's whole content decision is
 * that a bracket is a sentence the page would be making up. lib/about/
 * content.test.ts holds the constants to that. This file holds the DOCUMENT to
 * it, which is the only place a placeholder reintroduced in markup would show.
 */
import { expect, test, type Page } from "@playwright/test";

import { ABOUT } from "./widths";

/** The width this project is running at. home.spec.ts's idiom, unchanged. */
function widthOf(page: Page): number {
  const size = page.viewportSize();
  if (size === null) throw new Error("no viewport");
  return size.width;
}

/**
 * The markers, as the sheet draws them, transcribed a second time.
 *
 * lib/about/sections.test.ts already holds the TABLE to this list. This holds
 * the PAGE to it, and the two are different assertions: a table in the right
 * order still ships a page in the wrong one if the renderer stops reading it.
 * K-26 is that having happened once on the homepage.
 */
// THREE SINCE U4. `SYS.05.04 OFF-SYSTEM` is not postponed, it is gone — ADR
// 0079 stops owing the one human line rather than letting a section stand empty
// until somebody writes it. This list is held against the PAGE; the record of
// what the sheet drew and what was taken off it lives in sections.test.ts,
// which is where a removal has to be argued in writing.
const MARKERS = ["SYS.05.01", "SYS.05.02", "SYS.05.03"];

test.beforeEach(async ({ page }) => {
  // No `settled`. There is no streamed region on this page, which is the whole
  // reason about.sheet.spec.ts passes the runner no `ready` either.
  await page.goto(ABOUT);
});

test("the page has exactly one h1, and it is the page's own sentence", async ({ page }) => {
  // The 390 artboard writes `<h2>` for these words and the 1440 artboard writes
  // `<h1>`. Shipping that would give a phone a document with no level-one
  // heading, so the canvas artefact is not followed — the same call WorkHeader
  // made, for the same reason.
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("main h1")).toHaveText("I learn systems by running them.");
});

test("the four markers stand in the sheet's order", async ({ page }) => {
  const found = await page.locator("main .sec-id").allInnerTexts();
  expect(found).toEqual(MARKERS);
});

test("every section is a landmark with the name already on the screen", async ({ page }) => {
  // SectionHead renders a `<div>` rather than an `<h2>` — its own comment says
  // why — so `aria-labelledby` is how a region gets a name without inventing a
  // second sentence only some readers get. H2a is where three unnamed
  // `<section>` landmarks turned out to be worse than none.
  const names = await page.evaluate(() =>
    [...document.querySelectorAll("main section")].map((section) => {
      const id = section.getAttribute("aria-labelledby");
      return id === null ? null : (document.getElementById(id)?.textContent ?? null);
    }),
  );

  expect(names).toEqual(["TRAJECTORY", "WHAT I RUN", "HOW I WORK"]);
});

test("no bracketed placeholder reaches the document", async ({ page }) => {
  // THE BROKEN CASE OF THIS PHASE. `[LANGUAGES]`, `[SPEC]`, `[BOOK OR PAPER]`,
  // `[ONE LINE]`, `[PORTRAIT PHOTO]`, `[99.98%]` and `[Y1]`–`[Y5]` are all
  // drawn on the About sheet, and every one of them is a claim this page cannot
  // make.
  //
  // AND `[SOON]` IS NO LONGER AN EXCEPTION. It used to be carved out by name:
  // the site's own word for a named absence, which says nothing is there rather
  // than standing in for something. U5 wrote the six station paragraphs, the
  // word left the page with them, and the carve-out went with it — a filter for
  // a string that cannot occur is a filter that hides the next one.
  const text = await page.locator("main").innerText();

  expect([...text.matchAll(/\[[^\]]*\]/g)].map((m) => m[0]), "a placeholder shipped").toEqual([]);
});

test("no section is a shell, and [SOON] is gone from this page", async ({ page }) => {
  // THIS ASSERTION TURNED OVER IN U4 RATHER THAN DISAPPEARING, and the turn is
  // the acceptance criterion of the phase: "no [SOON] on About except in the
  // trajectory". It counted two empty panels in H7a and one after H7b built
  // the rail; there are none now, because SYS.05.04 was removed rather than
  // filled. A test that was simply deleted would have left the criterion with
  // nothing standing behind it.
  //
  // STATE.05 STILL HOLDS — "ein toter Zustand ohne Begründung ist ein Bug" —
  // and the way it gets broken again is by adding a shell, so the assertion is
  // that there is not one. lib/about/sections.test.ts asks the same question of
  // the table; this asks it of the document.
  await expect(page.locator("main .st-empty-panel")).toHaveCount(0);

  // AND THE WORD IS DOWN TO NO HOMES, WHICH IS THE CRITERION OF U5. This
  // assertion has now turned over twice rather than being deleted either time:
  // H7a counted two empty panels, H7b one, U4 held it to "none outside the
  // trajectory" while five stations still printed it, and U5 wrote the six
  // paragraphs. Each turn left the criterion with something standing behind it;
  // a deleted test would have left it with a sentence in a plan.
  //
  // COUNTED OVER THE WHOLE OF `main` AND NOT OVER A SELECTOR, because the point
  // is the absence of a word rather than the state of a component: `.tl-soon`
  // is gone from the stylesheet, so a selector for it would pass by finding
  // nothing no matter what the page said.
  const occurrences = await page.evaluate(() =>
    [...document.querySelectorAll("main *")].filter(
      (node) => node.children.length === 0 && node.textContent.includes("[SOON]"),
    ).length,
  );
  expect(occurrences, "[SOON] survived U5").toBe(0);
});

test("the tiles under WHAT I RUN name the cluster and nothing else", async ({ page }) => {
  // THE SECTION EXISTS TO PROVE RATHER THAN CLAIM, and after U4 the thing it
  // proves is talos-prod (ADR 0079). Held on the rendered page and not only in
  // the table, because lib/about/content.test.ts can be green while the
  // component drops a field — the argument components/about/StackTiles.tsx
  // makes for owning the separator.
  const tiles = page.locator("main .run-tile");
  await expect(tiles).toHaveCount(6);

  const labels = await tiles.locator(".run-label").allInnerTexts();
  expect(labels.map((label) => label.trim())).toEqual([
    "BASE",
    "NETWORK",
    "EDGE",
    "DELIVERY",
    "DATA",
    "WATCH",
  ]);

  // THE CLOSING STRIP IS GONE WITH THE SENTENCE THAT CARRIED IT. It read "The
  // page you are reading is served by that stack" beside a link to the case
  // study — true of the VPS, not of the tiles above it, and the link resolved
  // to timseil.dev, a different system from the one on display. U9 draws it
  // again after the cutover. Until then `/about` has no outgoing evidence link,
  // which is a real loss and is recorded as one.
  await expect(page.locator("main .run-note")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /READ THE CASE STUDY/ })).toHaveCount(0);
});

test("no section title is squeezed into two lines by its own meta", async ({ page }) => {
  // THE DEFECT H7 MEASURED, AND IT WAS NOT ONLY THIS PAGE'S. `.sec` is one flex
  // row and it had carried five heads without complaint, because a meta is
  // normally two or three words. SYS.05.02's was seven — `ONE VPS ·
  // ADMINISTERED BY ME` — and at 390 the title `WHAT I RUN` was squeezed from
  // 94px to 84 and broke in half.
  //
  // U4 SHORTENED THAT META TO THREE WORDS AND THE TEST STAYS. `TALOS-PROD ·
  // BARE METAL` is no longer the worst case on the site; the homepage's SYS.01
  // is, and it was the reason the switch is 900 rather than 560 in the first
  // place. A guard that only ever watched the line that provoked it would have
  // retired here, one page before the defect it also covers.
  //
  // Bisecting that turned up the same thing on `/`: SYS.01's title wraps from
  // 560 up to 744 — a 185px band, in production since H4 — because no test
  // anywhere read a head's line count and nothing else in that row moves when
  // the title does. layout.css puts the meta on its own line from 900 down,
  // which is the switch the HOMEPAGE's crossing chose rather than this page's.
  //
  // A LINE COUNT AND NOT A HEIGHT, because a height is a number that changes
  // when a font step does. Two lines is the defect; one line is the assertion.
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

test.describe("the trajectory rail", () => {
  test("six stations, resting on NOW, with one panel open", async ({ page }) => {
    await expect(page.locator(".tl-item")).toHaveCount(6);
    await expect(page.locator(".tl-input").nth(5)).toBeChecked();
    await expect(page.locator(".tl-panel:visible")).toHaveCount(1);
    await expect(page.locator(".tl-panel:visible .tl-head-title")).toHaveText(
      "Bare-metal cluster",
    );
  });

  test("no label is a year, and the last one is NOW", async ({ page }) => {
    // The rail is a timeline and this repository has no dates. The label is the
    // position; lib/about/trajectory.ts carries the argument and holds the
    // table, and this holds the DOCUMENT — a year typed into markup would pass
    // the table's test untouched.
    const labels = await page.locator(".tl-label").allInnerTexts();

    expect(labels).toEqual(["01", "02", "03", "04", "05", "NOW"]);
    for (const label of labels) expect(label).not.toMatch(/\d{4}/);
  });

  test("the whole group is one tab stop, and the arrows step through it", async ({ page }) => {
    // THE REASON THIS IS A RADIO GROUP. The sheet gives every station
    // `tabindex="0"` and rebuilds the arrows in an `onKeyDown`; six tab stops in
    // a row is the keyboard trap H6a refused under OpsGrid's name, and the
    // handwritten arrows are a client component this page does not have.
    await page.locator(".tl-input").nth(5).focus();

    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(".tl-panel:visible .tl-head-title")).toHaveText("Talos lab");

    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(".tl-panel:visible .tl-head-title")).toHaveText("Own VPS");

    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".tl-panel:visible .tl-head-title")).toHaveText("Talos lab");

    // Up and down move too, and that is the platform's answer rather than ours:
    // a radio group is one control on both axes, which is what the rail needs
    // when it stands up below 720.
    await page.keyboard.press("ArrowUp");
    await expect(page.locator(".tl-panel:visible .tl-head-title")).toHaveText("Own VPS");

    // One stop for the group: tabbing again leaves it.
    await page.keyboard.press("Tab");
    const stillInside = await page.evaluate(() =>
      (document.activeElement?.className ?? "").includes("tl-input"),
    );
    expect(stillInside, "the rail holds more than one tab stop").toBe(false);
  });

  test("the arrows wrap at the ends, which the sheet's script does not", async ({ page }) => {
    // A DIVERGENCE, ASSERTED SO IT STAYS ONE. The sheet clamps —
    // `Math.max(0, Math.min(TL.length - 1, i))` — and a native radio group
    // wraps, which is also what the WAI-ARIA radio group pattern specifies.
    // Clamping would mean taking the keys back off the browser and writing
    // them again in a client component, which is the whole cost this phase
    // avoided. A reader who has met a radio group anywhere else gets the
    // behaviour they already know.
    await page.locator(".tl-input").nth(0).focus();
    await page.keyboard.press("ArrowLeft");

    await expect(page.locator(".tl-input").nth(5)).toBeChecked();
    await expect(page.locator(".tl-panel:visible .tl-head-title")).toHaveText(
      "Bare-metal cluster",
    );
  });

  test("the fill line ends under the chosen dot, not past it", async ({ page }) => {
    // `(index + 0.5) / 6`, which lib/about/trajectory.ts holds under test. Here
    // it is measured on the rendered rail, because a percentage in a stylesheet
    // and a percentage of the right box are two different claims.
    await page.locator(".tl-item").nth(2).click();
    await expect(page.locator(".tl-panel:visible .tl-head-no")).toHaveText("03");

    // POLLED, BECAUSE THE LINE IS IN MOTION WHEN THE PANEL IS ALREADY THERE. The
    // panel swaps on `display`, which is instant; the fill transitions over
    // `--d-wipe`. Reading it on the next tick measures a frame of the animation
    // — the first version of this assertion read 46.5% on its way from 91.7 to
    // 41.7 and called it a wrong number. The measurement is the value it comes
    // to rest at.
    await expect
      .poll(async () =>
        page.locator(".tl-rail").evaluate((rail) => {
          const fill = rail.querySelector(".tl-fill");
          if (fill === null) throw new Error("no fill");
          const across = getComputedStyle(rail).gridTemplateColumns.split(/\s+/).length === 6;
          const r = rail.getBoundingClientRect();
          const f = fill.getBoundingClientRect();
          return Math.round(across ? (f.width / r.width) * 100 : (f.height / r.height) * 100);
        }),
      )
      .toBe(42);
  });

  test("the shipped cell comes in three shapes, and only one of them links", async ({ page }) => {
    // NOTHING SHIPPED — NO CELL. ADR 0055's cut, for the fifth time on this
    // site: a station that shipped nothing gets no row rather than an em dash.
    await page.locator(".tl-item").nth(0).click();
    await expect(page.locator(".tl-panel:visible .tl-shipped")).toHaveCount(0);

    // SHIPPED, AND THERE IS A PAGE — A LINK. Invariant 5: it goes somewhere.
    // The station numbers and the system numbers share a notation, so the cell
    // carries the NAME as well; a bare `02` would be indistinguishable from the
    // station two rows up, and since U5 there is a station `01` as well.
    await page.locator(".tl-item").nth(3).click();
    await expect(page.locator(".tl-panel:visible .tl-shipped a")).toHaveText("02 timseil.dev");

    // SHIPPED, AND THERE IS NO PAGE — A NAME, AND NO `<a>` AT ALL. ADR 0079 §2
    // gives the cluster no case study, and `/work` draws its row the same way.
    // The `<a>` count is the assertion; the text alone would pass against a
    // link, which is the failure this is here to catch.
    await page.locator(".tl-item").nth(5).click();
    const cluster = page.locator(".tl-panel:visible .tl-shipped");
    await expect(cluster).toHaveText("01 talos-prod");
    await expect(cluster.locator("a")).toHaveCount(0);

    // Last, because it leaves the page.
    await page.locator(".tl-item").nth(3).click();
    await page.locator(".tl-panel:visible .tl-shipped a").click();
    await page.waitForURL("**/work/timseil-dev");
  });
});

// THE ASSERTION THE WHOLE PHASE STANDS ON, and the only one a hand-written
// keyboard handler could not pass. ADR 0066 trades the sheet's script for a
// radio group and claims two things in exchange: zero bytes, and a control that
// works when scripts do not. The first is measured in the phase notes; this is
// the second, and without it the trade is an assertion rather than a fact.
//
// #244 IS WHY IT MATTERS ON THIS PAGE IN PARTICULAR: under `cacheComponents` a
// streamed placeholder stays put without JavaScript. A rail that also stopped
// would be the second thing on this site that does not work, on the page whose
// argument is that it only says what it can back.
test("the rail works with JavaScript turned off", async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: testInfo.project.use.viewport ?? { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto("/about");

  await expect(page.locator(".tl-item")).toHaveCount(6);
  await expect(page.locator(".tl-panel:visible .tl-head-title")).toHaveText("Bare-metal cluster");

  await page.locator(".tl-item").nth(4).click();
  await expect(page.locator(".tl-panel:visible .tl-head-title")).toHaveText("Talos lab");

  await page.locator(".tl-input").nth(4).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".tl-panel:visible .tl-head-title")).toHaveText("Own VPS");

  await context.close();
});

test("nothing on this page is wider than the window", async ({ page }) => {
  // Measured rather than assumed at every width, and `clientWidth` is read here
  // rather than the viewport we asked for: the H6a acceptance found two runs
  // reporting identical numbers for 1440 and 390 because both had quietly run
  // in the default window. A width you do not measure is a width you assume.
  const box = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(box.clientWidth, "the project did not get the width it asked for").toBe(widthOf(page));
  expect(box.scrollWidth, "something overflows horizontally").toBeLessThanOrEqual(box.clientWidth);
});

test("the page is indexable and says who it is about", async ({ page }) => {
  // The stub wrote `robots: { index: false }` because a crawler that found
  // `ABOUT [SOON]` would file that away as what this site has to say on the
  // subject. lib/seo/pages.ts flipped one boolean, and both the meta and the
  // sitemap follow it.
  await expect(page.locator('head meta[name="robots"]')).toHaveCount(0);

  // `textContent` AND NOT `innerText`. The block is a `<script>` in the head:
  // it is never rendered, so `innerText` — which is defined in terms of what a
  // user would see — answers with an empty string and `JSON.parse` throws on
  // it. The data is there either way; only one of the two accessors admits it.
  // NOT `head script`. React hoists a `<script>` into the head only when it is
  // one it can deduplicate; this one carries `dangerouslySetInnerHTML` and
  // stays where the component rendered it, which is inside `<body>`. That is
  // fine for the format — a crawler reads the document, not the head — and it
  // is worth the selector saying so, because the first version of this test
  // waited thirty seconds for an element that was six thousand bytes further
  // down the same page.
  const block = await page
    .locator('script[type="application/ld+json"]')
    .evaluate((el) => el.textContent);
  const graph = (JSON.parse(block) as { "@graph": Record<string, string>[] })["@graph"];

  expect(graph[1]["@type"]).toBe("ProfilePage");
  // ABSOLUTE, AND THAT IS THE ONE THING THE TYPE CANNOT CATCH. Next resolves a
  // relative canonical against `metadataBase`; nothing resolves a JSON-LD
  // document, and the first rendered block on this page said `"url": "/about"`.
  expect(graph[1].url).toMatch(/^https:\/\//);
});
