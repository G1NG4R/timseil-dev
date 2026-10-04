/**
 * German is longer, and this is where that stops being a worry and becomes a
 * measurement.
 *
 * THE SHEET NAMES THE RISK AND NOT ITS SIZE: "FRANZÖSISCH IST LÄNGER:
 * Hero-Überschrift und Kopf haben keine festen Höhen, die Statuszeile bricht
 * um." German runs long in the same places and in a few more of its own —
 * `ÜBER MICH` in a nav that has four entries and no room, `SCHLIESSEN` in the
 * mobile menu bar, `FILTER ZURÜCKSETZEN` on two pages, `VERFÜGBARKEIT` where
 * `UPTIME` stood, and `KEIN SYSTEM PASST ZU DIESER KOMBINATION` in an empty
 * state. None of them has a fixed height to break, so what a long word does
 * here is overflow sideways — and nothing on this site was measuring that at
 * every width in a second language.
 *
 * TWO QUESTIONS, AND THE FIRST ONE IS THE CHEAPER. Does `/de` change shape
 * anywhere `/` does not — that is the fingerprint, the same machinery
 * home.sweep.spec.ts runs, pointed at the German address. And does anything
 * overflow at any of the 53 samples between 1440 and 390 — that is the one
 * German can break without moving a single switch.
 *
 * `about.spec.ts` ALREADY READS `scrollWidth` AT SEVEN WIDTHS and it is not
 * the same check: seven rows cannot see what happens between them, and a label
 * that outgrows its cell does it at one particular width.
 */
import { expect, test } from "@playwright/test";

import { HEIGHT, STEP, at, edges, moved, type Probe } from "./sweep";
import { HOME_SWITCHES, WIDTHS } from "./widths";

/** The homepage's probes, transcribed from home.sweep.spec.ts.
 *
 *  TRANSCRIBED AND NOT IMPORTED, because the question is different: that file
 *  asks what the homepage's switches move, this one asks whether the German
 *  homepage has the same ones. A shared constant would make the two tests one
 *  test run twice, and the day somebody tunes the probe list for English this
 *  file should still be asking its own question. */
const PROBES: readonly Probe[] = [
  { key: "hero", kind: "tracks", selector: ".hero" },
  { key: "term", kind: "computed", selector: ".term-body", prop: "display" },
  { key: "h1", kind: "computed", selector: "main h1", prop: "font-size" },
  { key: "head", kind: "computed", selector: ".head", prop: "height" },
  { key: "nav", kind: "computed", selector: ".nav-desktop", prop: "display" },
  { key: "button", kind: "computed", selector: ".nav-button", prop: "display" },
];

/** The routes a long German label can break, and one of them is the reason the
 *  list is not just `/de`: the chrome is on every page, the empty states are
 *  not. The rig has no api, so `/de/work` draws `workListDown` and
 *  `/de/blog` draws its own empty state — which is exactly where the longest
 *  German strings in the catalogue end up. */
const ROUTES = ["/de", "/de/work", "/de/blog", "/de/contact", "/de/work/timseil-dev"];

/**
 * One overflow this file found and did not cause, carried by name.
 *
 * MEASURED IN ALL THREE LANGUAGES AND IDENTICAL IN ALL THREE: `/work/timseil-dev`,
 * `/de/work/timseil-dev` and `/fr/work/timseil-dev` each put the document 2 px
 * wider than the window at 720, and 3 px at 721 and 722. So it is not German,
 * and U8 is only the first thing to sample the width it happens at.
 *
 * WHAT IT IS. `span.st-nodata-text` — the `— NO DATA` run — is 144 px wide and
 * does not break. The five metric tiles reflow 2 → 3 → 5 and the five-column
 * form arrives at 720, where a fifth of the content column is narrower than
 * 144 px. It is therefore the OUTAGE state only: with numbers in the tiles the
 * row fits, and this rig has no api, which is also the only reason it is
 * visible here at all.
 *
 * WHY NOTHING CAUGHT IT. `case-study.spec.ts` asserts `scrollWidth <=
 * clientWidth` already, and it runs at the seven checked widths — which hold
 * 719 but not 720. CLAUDE.md asks for "jeder Schalter beidseitig"; the tile
 * switch is at 720 and the list carries only the side below it. That hole is
 * the finding, and the 2 px is the symptom.
 *
 * NOT FIXED HERE. The fix is either a width in that list or a change to the
 * reflow the Intermediate Widths sheet draws, and both are decisions of their
 * own. It is written up in backlog.md under U8 · Gefunden, and this entry goes
 * red the day the number changes — which is the half a carried exception has to
 * do to be worth more than a deleted test.
 */
const CARRIED: readonly { route: string; width: number; over: number }[] = [
  { route: "/de/work/timseil-dev", width: 720, over: 2 },
];

test.describe("German does not move a switch", () => {
  test("the German homepage has the same edges as the English one", async ({ page }) => {
    await page.goto("/de");

    const found = await edges(page, PROBES);

    expect(found, "a German label moved a layout switch").toEqual([...HOME_SWITCHES]);
  });

  test("and each switch still moves what it is for", async ({ page }) => {
    await page.goto("/de");

    for (const width of HOME_SWITCHES) {
      const wide = await at(page, width, PROBES);
      const narrow = await at(page, width - 1, PROBES);

      expect(moved(wide, narrow).length, `nothing moved across ${String(width)}`).toBeGreaterThan(
        0,
      );
    }
  });
});

test.describe("nothing German overflows", () => {
  for (const route of ROUTES) {
    test(`${route} fits its viewport at every width from 1440 to 390`, async ({ page }) => {
      await page.goto(route);

      const worst: { width: number; over: number }[] = [];

      // The literal bounds come off `WIDTHS`, which is `as const` — so the
      // loop reads them through a plain number to stop the narrowed tuple types
      // from making the comparison a constant the linter can fold away.
      const widest: number = WIDTHS[0];
      const narrowest: number = WIDTHS[WIDTHS.length - 1];

      for (let width = widest; width >= narrowest; width -= STEP) {
        await page.setViewportSize({ width, height: HEIGHT });

        const box = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));

        // THE CLIENT WIDTH, NOT THE REQUESTED ONE. A vertical scrollbar takes
        // pixels off the viewport, and comparing against `width` would report an
        // overflow that is the scrollbar's. about.spec.ts reads it the same way
        // and for the same reason.
        if (box.scroll > box.client) worst.push({ width, over: box.scroll - box.client });
      }

      const carried = CARRIED.filter((entry) => entry.route === route).map(
        ({ width, over }) => ({ width, over }),
      );

      expect(worst, `${route} overflows horizontally`).toEqual(carried);
    });
  }
});
