/**
 * What `/de` is, measured on the delivered document.
 *
 * THE UNIT TESTS ALREADY PROVE THE PREDICATE. `resolveMessages("de").resolved`
 * is `de`, and `complete.test.ts` proves that a missing bundle takes it back to
 * `en`. What neither can answer is whether the ATTRIBUTE on the delivered page
 * followed — `textLang` is read in a Server Component, hung on four blocks, and
 * `<main lang>` is the one that makes every word inside it a claim about a
 * language. That is a question about markup, so it is here.
 *
 * `/fr` IS IN THIS FILE AND IT IS NOT AN AFTERTHOUGHT. An empty language that
 * serves English and says so is the honest half of this design, and it is the
 * half that regresses silently: if `languageComplete` ever answered `true` for
 * a language nobody wrote, the page would look translated and be English.
 *
 * COUNTED, NEVER LINE-COUNTED. The witness assertions below count OCCURRENCES
 * of a sentence in one string. A delivered Next document is one line, so
 * anything that counts lines reports 1 for "present" and 1 for "present eleven
 * times" — the U5 and U7 finding, and the reason `countOf` exists rather than a
 * regex with a `g` flag and a `match()?.length` that is `undefined` for zero.
 */
import { expect, test, type Page } from "@playwright/test";

import { de } from "../lib/i18n/messages/de";
import { en } from "../lib/i18n/messages/en";
import { HAS_LOG, MOBILE_BREAKPOINT } from "./widths";

/** The width this project is running at. home.spec.ts's idiom, unchanged. */
function widthOf(page: Page): number {
  const size = page.viewportSize();
  if (size === null) throw new Error("no viewport");
  return size.width;
}

/** How many times `needle` occurs in `haystack`. Occurrences, not lines. */
function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The text of the one `<main>`, with the markup taken out. */
async function mainText(page: Page): Promise<string> {
  return (await page.locator("#main").innerText()).replace(/\s+/g, " ");
}

test.describe("the German route is German", () => {
  test("the document declares German and no block corrects it", async ({ page }) => {
    await page.goto("/de");

    await expect(page.locator("html")).toHaveAttribute("lang", "de");

    // THE ABSENCE IS THE ASSERTION. `textLang` is `undefined` when the strings
    // are in the route's own language, so these four blocks carry no attribute
    // at all — and an attribute here would mean the dictionary had decided the
    // language was not finished.
    for (const selector of ["#main", "header.col", "footer.foot", "a.skip"]) {
      await expect(page.locator(selector)).not.toHaveAttribute("lang", /./);
    }
  });

  test("the chrome is in German", async ({ page }) => {
    await page.goto("/de");

    await expect(page.locator("a.skip")).toHaveText(de.skip);
    await expect(page.locator(".foot-legal span").first()).toHaveText(de.based);
    await expect(page.locator(`.foot-legal a[href="/de/privacy"]`)).toHaveText(de.privacy);
    await expect(page.locator(`.foot-legal a[href="/de/imprint"]`)).toHaveText(de.imprint);
  });

  // THREE OF THE FOUR, AND THAT IS log-gate.spec.ts's DECISION RATHER THAN A
  // GAP. U2 emptied content/posts and ADR 0079 took the log out of the chrome
  // with it, so `LOG` is not drawn while the repository holds no entry — and
  // the first draft of this test asked for four and went red on a page that was
  // right. The list follows the gate, so the day Tim writes an entry the fourth
  // label is asserted without anybody editing this file.
  test("the nav labels are the sheet's German ones", async ({ page }) => {
    test.skip(widthOf(page) < MOBILE_BREAKPOINT, "the desktop nav does not exist here");
    await page.goto("/de");

    await expect(page.locator("header .nav-link")).toHaveText(
      HAS_LOG
        ? [de.navWork, de.navLog, de.navAbout, de.navContact]
        : [de.navWork, de.navAbout, de.navContact],
    );
  });

  // THE WITNESSES ARE CATALOGUE STRINGS AND NOTHING ELSE, which is what makes
  // this test honest about the phase it is in. U8 translates the catalogue;
  // U8a translates the page prose in lib/about/, content/case-studies/ and the
  // scattered modules, and until it merges there IS English inside `<main>` on
  // /de. Asserting "no English anywhere" here would be a test that has to be
  // weakened to pass, which is worse than one that says what it covers.
  test("no English catalogue sentence survives inside main", async ({ page }) => {
    await page.goto("/de");
    const text = await mainText(page);

    const witnesses = [
      en.homeHeadline,
      en.homeTagline,
      en.availability,
      en.homeTerminalWhy,
      en.homeBio,
    ];

    for (const witness of witnesses) {
      expect(countOf(text, witness), `English in <main> on /de: ${witness}`).toBe(0);
    }

    // AND THE GERMAN HAS TO BE THERE, because zero occurrences of the English
    // is also what an empty page gives.
    for (const expected of [de.homeHeadline, de.homeTagline, de.homeBio]) {
      expect(countOf(text, expected), `missing German in <main>: ${expected}`).toBe(1);
    }
  });

  test("the work index is German too", async ({ page }) => {
    await page.goto("/de/work");
    const text = await mainText(page);

    expect(countOf(text, en.workDeck)).toBe(0);
    expect(countOf(text, de.workDeck)).toBe(1);
  });
});

test.describe("the English islands", () => {
  // ADR 0083, decision 2. 1.842 words of legal text stay English in every
  // language, and the block says so itself — without this attribute the
  // paragraphs below would be German by inheritance from <html>.
  for (const route of ["/de/privacy", "/de/imprint"]) {
    test(`${route} keeps its legal text in English and admits it`, async ({ page }) => {
      await page.goto(route);

      await expect(page.locator("html")).toHaveAttribute("lang", "de");
      await expect(page.locator(".lg")).toHaveAttribute("lang", "en");
    });
  }

  // The chrome AROUND the island is still German, which is the point of making
  // it an island rather than giving the page `lang="en"`.
  test("the island does not take the footer with it", async ({ page }) => {
    await page.goto("/de/privacy");

    await expect(page.locator(".foot-legal span").first()).toHaveText(de.based);
  });
});

test.describe("the French route is honest about being English", () => {
  test("every block says the text is English", async ({ page }) => {
    await page.goto("/fr");

    await expect(page.locator("html")).toHaveAttribute("lang", "fr");

    // THE PRESENCE IS THE ASSERTION, and it is the mirror of the German test
    // above: French is empty on purpose, so the strings are English and the
    // markup says which language they are in.
    for (const selector of ["#main", "header.col", "footer.foot", "a.skip"]) {
      await expect(page.locator(selector)).toHaveAttribute("lang", "en");
    }
  });

  test("the text really is the English text", async ({ page }) => {
    await page.goto("/fr");
    const text = await mainText(page);

    expect(countOf(text, en.homeHeadline)).toBe(1);
    expect(countOf(text, de.homeHeadline)).toBe(0);
  });
});

test.describe("the switcher keeps the page and changes the language", () => {
  // IT CLICKS. A test that only reads the href of a row proves the markup and
  // not the navigation — and the rows in the desktop panel are not links at
  // all: they are listbox options that call `router.push(switchLocale(...))`.
  //
  // AND EVERY LOCATOR IN IT IS FILTERED TO THE VISIBLE ONE, WHICH IS A FIND OF
  // THIS PHASE. `/about` and `/de/about` are different `[lang]` segments, so
  // they are different layout instances — and `cacheComponents: true` keeps up
  // to three routes mounted and merely hidden. After the first switch the
  // document holds TWO headers: the French one that is painted and the German
  // one from the page before it, hidden by `<Activity>`. The first draft of this
  // test clicked `.lang-button` and failed strict mode with two matches, one
  // labelled `Language — Français` and one `Sprache — Français`. That is not a
  // defect — mobile-menu.coarse.spec.ts was written about the same behaviour —
  // but it is the first test on this site to meet it, and a `.first()` here
  // would have been a coin toss about which language's chrome gets clicked.
  test("/de/about → /fr/about → /about, the same page every time", async ({ page }) => {
    test.skip(widthOf(page) < MOBILE_BREAKPOINT, "the desktop switcher does not exist here");

    const button = page.locator(".lang-button").filter({ visible: true });
    const option = (name: string) =>
      page.locator(".lang-option").filter({ visible: true }).filter({ hasText: name });

    await page.goto("/de/about");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");

    await button.click();
    await option("Français").click();
    await expect(page).toHaveURL(/\/fr\/about$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");

    await button.click();
    await option("English").click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  // Below 900 the dropdown does not exist and the chips in the full-screen menu
  // are real links — the sheet's "EIN ORT PRO GERÄT".
  test("the mobile menu's chips carry the current path", async ({ page }) => {
    test.skip(widthOf(page) >= MOBILE_BREAKPOINT, "the menu button does not exist here");

    await page.goto("/de/about");
    await page.locator("button.nav-button").click();

    const langs = page.locator(".menu-langs a");
    await expect(langs).toHaveCount(3);
    await expect(langs.nth(0)).toHaveAttribute("href", "/about");
    await expect(langs.nth(1)).toHaveAttribute("href", "/de/about");
    await expect(langs.nth(2)).toHaveAttribute("href", "/fr/about");
    await expect(langs.nth(1)).toHaveAttribute("aria-current", "true");
  });
});

test.describe("the numbers follow the language", () => {
  // THE RIG HAS NO API, so the five tiles on a case study are `— NO DATA` and
  // there is no uptime to read a decimal mark off. What CAN be read is the
  // label the locale composes — `VERFÜGBARKEIT · 91 D` — which goes through
  // `count()` for the window and through the dictionary for the word. The
  // decimal mark itself is unit-tested in lib/format/numbers.test.ts, and
  // measured against production in the acceptance.
  test("the uptime tile is labelled in German and counts its own window", async ({ page }) => {
    await page.goto("/de/work/timseil-dev");

    await expect(page.locator(".ops-tiles .tile-label").first()).toHaveText(
      new RegExp(`^${de.uptime}`),
    );
  });
});
