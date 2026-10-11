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

import { CASE_WORDS_DE } from "../content/case-studies/timseil-dev.de";
import { CASE_WORDS_EN, STAGE_TITLES } from "../content/case-studies/timseil-dev";
import { ABOUT_WORDS_EN, PRINCIPLE_KEYS } from "../lib/about/content";
import { ABOUT_WORDS_DE } from "../lib/about/content.de";
import { SECTION_IDS, SECTION_WORDS_EN } from "../lib/about/sections";
import { SECTION_WORDS_DE } from "../lib/about/sections.de";
import { STATION_KEYS, STATION_PROSE_EN } from "../lib/about/trajectory";
import { STATION_PROSE_DE } from "../lib/about/trajectory.de";
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

  // THE WITNESSES IN THIS TEST ARE CATALOGUE STRINGS, and the one below it reads
  // a BUNDLE — which is the whole split U8a added. U8 translated the catalogue;
  // U8a translates the page prose in lib/about/, content/case-studies/ and the
  // scattered modules, one bundle per commit, and each one arrives here with a
  // witness of its own. Asserting "no English anywhere" in a single test would
  // be an assertion that has to be weakened on the way, which is worse than
  // several that each say what they cover.
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

  // THE FIRST BUNDLE ON THE PAGE, READ OFF THE PAGE. `lib/i18n/complete.ts`
  // registers it and `trajectory.test.ts` proves the resolution; what neither
  // can see is that all six panels are RENDERED — five of them are hidden by a
  // stylesheet until a radio is checked, and `innerText` of a hidden panel is
  // empty. So this counts in the markup instead, which is also the only place
  // the sixth paragraph was ever at risk.
  test("the six trajectory paragraphs on /de/about are German", async ({ page }) => {
    await page.goto("/de/about");
    const html = await page.locator("#main").innerHTML();

    for (const key of STATION_KEYS) {
      const german = STATION_PROSE_DE[key].body;
      const english = STATION_PROSE_EN[key].body;

      expect(countOf(html, english), `English station prose on /de: ${key}`).toBe(0);
      expect(countOf(html, german), `missing German station prose: ${key}`).toBe(1);
    }
  });

  // THE THREE SECTION HEADS, AND THE NOTE THEY DISPROVE. en.ts claimed until
  // this phase that "a German About page would still read SYS.05.02 WHAT I
  // RUN"; ADR 0083's sixth decision says a heading over content is a label, and
  // a label is translated. The markers themselves are not — they are the
  // sheet's notation — so they are counted as still being there.
  test("the section heads on /de/about are German and the markers are not", async ({ page }) => {
    await page.goto("/de/about");
    const text = await mainText(page);

    for (const id of SECTION_IDS) {
      expect(countOf(text, id), `the marker ${id} left the page`).toBe(1);
      expect(countOf(text, SECTION_WORDS_EN[id].title), `English head: ${id}`).toBe(0);
      expect(countOf(text, SECTION_WORDS_DE[id].title), `missing German head: ${id}`).toBe(1);
    }

    // The rail's hint moves; the line that names the cluster does not, and
    // sections.de.ts says why it is in the bundle anyway.
    expect(countOf(text, "SELECT A STATION")).toBe(0);
    expect(countOf(text, "STATION WÄHLEN")).toBe(1);
    expect(countOf(text, "TALOS-PROD · BARE METAL")).toBe(1);
  });

  // DECISION 6 OF ADR 0083, READ OFF THE DELIVERED CARD — both halves of it.
  // Every label is German, and the six values that are DATA are byte for byte
  // the English ones: `Luxembourg` is a place, and the imprint spells it the
  // same way. The seventh value is a sentence and is the only one that moves.
  test("the operator card translates its labels and keeps its data", async ({ page }) => {
    await page.goto("/de/about");

    // THE CARD AND NOT THE WHOLE OF `<main>`, which this test found out the
    // hard way: `Claude Code` is on this page TWICE — the `TOOLING` row and the
    // lede's own sentence about the assistant — so a count over the page was
    // asserting something about `aboutLede` while claiming to be about the
    // card. ADR 0079 §3 is why the page says it in both places.
    const text = (await page.locator(".op-card").innerText()).replace(/\s+/g, " ");

    expect(countOf(text, "PRIMARY")).toBe(0);
    expect(countOf(text, "SCHWERPUNKT")).toBe(1);
    expect(countOf(text, "ROLLE")).toBe(1);
    expect(countOf(text, "WERKZEUG")).toBe(1);

    expect(countOf(text, "Luxembourg · UTC+1"), "a datum was translated").toBe(1);
    expect(countOf(text, "Kubernetes · GitOps")).toBe(1);
    expect(countOf(text, "Claude Code")).toBe(1);

    const route = ABOUT_WORDS_EN.operator.route.value ?? "";
    const routeDe = ABOUT_WORDS_DE.operator.route.value ?? "";
    expect(route.length, "the English sentence is the fixture").toBeGreaterThan(0);
    expect(countOf(text, route)).toBe(0);
    expect(countOf(text, routeDe)).toBe(1);
  });

  // THE LONGEST PROSE OF THE PHASE, AND THE PAGE WITH THE MOST LABELS AROUND
  // IT. Three paragraphs, five constraints, a caption and seven stage
  // sentences — and seven stage TITLES that must not move, because five of them
  // are `ci.yml` job names and lib/content/pipeline.test.ts holds them against
  // the workflow.
  test("the case study argues in German on /de/work/timseil-dev", async ({ page }) => {
    await page.goto("/de/work/timseil-dev");
    const text = await mainText(page);

    expect(countOf(text, CASE_WORDS_EN.headline)).toBe(0);
    expect(countOf(text, CASE_WORDS_DE.headline)).toBe(1);

    for (const [index, paragraph] of CASE_WORDS_EN.problem.entries()) {
      expect(countOf(text, paragraph), `English paragraph ${String(index)}`).toBe(0);
      expect(countOf(text, CASE_WORDS_DE.problem[index]), `German paragraph ${String(index)}`).toBe(
        1,
      );
    }

    for (const [index, line] of CASE_WORDS_EN.constraints.entries()) {
      expect(countOf(text, line), `English constraint ${String(index)}`).toBe(0);
      expect(countOf(text, CASE_WORDS_DE.constraints[index]), `German constraint`).toBe(1);
    }

    expect(countOf(text, CASE_WORDS_EN.composeCaption)).toBe(0);
    expect(countOf(text, CASE_WORDS_DE.composeCaption)).toBe(1);

    for (const title of STAGE_TITLES) {
      expect(countOf(text, CASE_WORDS_EN.stages[title]), `English stage ${title}`).toBe(0);
      expect(countOf(text, CASE_WORDS_DE.stages[title]), `German stage ${title}`).toBe(1);
    }

    // THE BOXES THEMSELVES, READ OFF THE MARKUP AND NOT OUT OF THE PAGE TEXT.
    // `DB` and `CHECK` are words that turn up inside a compose excerpt and
    // inside `Health-Check`; the seven titles are a list, so they are asserted
    // as one.
    await expect(page.locator(".pipeline .pipe-title")).toHaveText([...STAGE_TITLES]);
  });

  // `blurb` HAS NO WITNESS HERE, AND THAT IS THE RIG RATHER THAN AN OVERSIGHT.
  // It is the one sentence of a case study drawn somewhere else — the row's
  // description on the homepage and on /work — which is why `systemEntries`
  // takes a locale at all. Both lists come from `/api/systems`, this rig has
  // none, and a page with no rows has no descriptions: SYS.02 is an outage
  // panel and /work draws `workListDown`. Asserted in lib/home/systems.test.ts
  // against the seeded answer instead, and counted on the delivered page in the
  // production acceptance, where the api answers.

  test("the principles and the stack axes are German on /de/about", async ({ page }) => {
    await page.goto("/de/about");
    const text = await mainText(page);

    for (const key of PRINCIPLE_KEYS) {
      expect(countOf(text, ABOUT_WORDS_EN.principles[key].detail), `English: ${key}`).toBe(0);
      expect(countOf(text, ABOUT_WORDS_DE.principles[key].detail), `missing German: ${key}`).toBe(1);
    }

    expect(countOf(text, "DELIVERY")).toBe(0);
    expect(countOf(text, "AUSLIEFERUNG")).toBe(1);
    expect(countOf(text, "ÜBERWACHUNG")).toBe(1);
    // The one axis that reads the same in both languages, and the component
    // names under all six, which never move.
    expect(countOf(text, "EDGE")).toBe(1);
    expect(countOf(text, "kube-prometheus-stack")).toBe(1);
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

  // ADR 0083, DECISION 2, ON THE DELIVERED PAGE — AND AS A RULE RATHER THAN A
  // SAMPLE. A log is the machine's voice and stays English in every language,
  // so every block that holds one says so; the one exception is the terminal,
  // whose lines are not all the machine's. Written over whatever the page
  // actually draws, because the first draft named `.st-panel` and found an
  // empty state instead — and because the next `.st-log` somebody adds should
  // land in this assertion without an edit.
  //
  // ONE SNAPSHOT AND NOT A LOOP OF LOCATORS, AND THAT IS A FIND RATHER THAN A
  // STYLE. The loop this replaces walked `logs.nth(i)` and called `.evaluate()`
  // per element; it passed on the branch and failed twice on main — a 30 s
  // timeout at 719 and a strict-mode violation at 390, where
  // `.term-body ul.st-log` resolved to TWO elements. The page really does hold
  // two copies of that panel for part of its life: the Suspense fallback of
  // SYS.INIT is the same component as its answer, and under `cacheComponents`
  // the hidden one stays in the document. The switcher test two blocks down
  // met the same thing with two headers and wrote it down in H10.
  //
  // So the rule is read once, from the document, and it is a rule about a SET:
  // every `ul.st-log` carries the right answer, however many copies of it the
  // page is holding. Hidden copies are checked too, which is correct — a hidden
  // block that says the wrong language becomes a visible one on the next paint.
  test("every log block on /de is an island, except the terminal's", async ({ page }) => {
    await page.goto("/de");
    await expect(page.locator("#main")).toBeVisible();

    const logs = await page.evaluate(() =>
      [...document.querySelectorAll("ul.st-log")].map((node) => ({
        terminal: node.closest(".term-body") !== null,
        lang: node.getAttribute("lang"),
      })),
    );

    expect(logs.length, "no log block on /de at all").toBeGreaterThan(0);

    const wrong = logs.filter((log) => (log.terminal ? log.lang !== null : log.lang !== "en"));
    expect(wrong, "a log block claims the wrong language").toEqual([]);
  });

  // THE ONE `.st-log` THAT IS NOT AN ISLAND, and the reason C10 could not be a
  // CSS selector. The terminal draws `stateLabel(…, messages)`, so on /de it
  // reads `terminal GEPLANT` — an attribute saying English over a German word
  // would be the lie this whole decision exists to avoid.
  //
  // `.first()` BECAUSE THE PAGE MAY HOLD TWO OF THEM, for the reason the test
  // above now carries in full. What is asserted here is what the panel SAYS;
  // how many copies of it are in the document is that test's business, and the
  // attribute is checked there across all of them.
  test("the terminal's log is German, so it carries no island", async ({ page }) => {
    await page.goto("/de");

    await expect(page.locator(".term-body ul.st-log").first()).toContainText(de.stateQueued);
  });

  // THE WORD U8a's ACCEPTANCE FOUND, AS AN ASSERTION. `SOURCE:` sat in
  // OpsStrip.tsx as a bare text node between two expressions, so neither C5's
  // grep for `title=`/`label=` attributes nor its grep for whole text nodes saw
  // it — and the delivered page read `… EINE ZELLE IST EIN TAG` and then
  // `SOURCE: /api/systems/…`. The endpoint stays, the label moves.
  //
  // IT IS COUNTED OVER THE WHOLE PAGE AND NOT OVER THE STRIP, because the
  // defect was never about one component: the question is whether any block on
  // /de still names its source in English. The rig has no api, so the strip
  // itself is an empty state here — which is exactly why this has to be a count
  // on the page and is checked against production in the acceptance too.
  test("no block on /de labels its source in English", async ({ page }) => {
    await page.goto("/de");

    const html = await page.content();

    expect(countOf(html, `${en.sourceLabel}:`), "an English source label on /de").toBe(0);
    expect(countOf(html, `${de.sourceLabel}:`), "no German source label at all").toBeGreaterThan(0);
  });

  test("the request drawing on /de/contact says it is English", async ({ page }) => {
    await page.goto("/de/contact");

    await expect(page.locator("pre.tx-body")).toHaveAttribute("lang", "en");
    // And the panel's accessible name is not in it: that is prose, it arrives
    // as a prop out of the dictionary, and it is why the attribute is on the
    // `<pre>` rather than on the `<aside>` around it.
    await expect(page.locator("aside.tx")).toHaveAttribute("aria-label", de.contactTraceAria);
  });

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

  // THE BROKEN CASE, ON A REAL ROUTE AND NOT A FIXTURE. A bundle resolves per
  // language exactly as the catalogue does, so the page that has German
  // paragraphs has English ones one segment over — and the `lang="en"` on
  // `<main>` is what keeps those paragraphs from claiming to be French. This is
  // the assertion that goes red the day a bundle answers `fr` without anybody
  // having written French.
  test("the trajectory on /fr/about is English and the block says so", async ({ page }) => {
    await page.goto("/fr/about");

    await expect(page.locator("#main")).toHaveAttribute("lang", "en");

    const html = await page.locator("#main").innerHTML();
    for (const key of STATION_KEYS) {
      expect(countOf(html, STATION_PROSE_EN[key].body), key).toBe(1);
      expect(countOf(html, STATION_PROSE_DE[key].body), key).toBe(0);
    }
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
