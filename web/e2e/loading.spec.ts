/**
 * The wait, the outage, and the sentence that used to stand for both.
 *
 * WHAT THIS SPEC EXISTS FOR. Until U7 every streamed region passed `null` to its
 * component from two places — the `<Suspense>` fallback and a reader whose fetch
 * had failed — so one panel spoke for both. Measured against production on
 * 28.09.2026, with the api answering: `/` carried six "…did not answer this
 * request" and two more of the calendar's variant, `/work` two, and the case
 * study said its five tiles were "EMPTY ON PURPOSE" beside 80.05 % uptime. Eight
 * sentences about an outage in a document that carried the answers.
 *
 * THE BYTES ARE WHERE A WAIT CAN BE READ AT ALL. A fallback exists for as long as
 * the upstream call takes and is then swapped out by a script, so a DOM
 * assertion is a race by construction — but React ships it INSIDE the document,
 * which means `response.text()` holds it after the page has settled. That is
 * ADR 0078's method, and the reason it was chosen there applies here: measure the
 * state that cannot be caught, do not hope to catch it.
 *
 * THE EXPECTED STRINGS ARE DERIVED, NOT TYPED. `loadingLines` composes them and
 * lib/state/lines.test.ts holds their wording; what is asserted here is that they
 * REACH THE PAGE, which is the half no unit test can see. A literal here would
 * pass the day a component stopped calling the function.
 *
 * THIS RIG HAS NO API (playwright.config.ts), so every region ends up in the
 * `down` state — which makes it the one place where BOTH halves are observable in
 * one run: the wait in the bytes, the outage in the DOM afterwards. The third
 * criterion of U7, that an ANSWERING api leaves no such sentence anywhere, needs
 * an api and is measured against production in the phase's acceptance.
 */
import { expect, test, type Page } from "@playwright/test";

import { systemWaitSource } from "../lib/api/systems";
import { en } from "../lib/i18n/messages/en";
import { loadingLines } from "../lib/state/lines";
import { SITE_SYSTEM_SLUG } from "../lib/site";
import { CASE_REGIONS, HOME_REGIONS, WORK_REGIONS, settled } from "./streaming";
import { CASE_STUDY, HOME, WORK } from "./widths";

const OWN_SYSTEM = systemWaitSource(SITE_SYSTEM_SLUG);

/**
 * Every streamed panel of this site, with what it says while it waits and what
 * it says once the read has failed.
 *
 * ONE ROW PER PANEL AND NOT PER BOUNDARY. Five of the eleven `<Suspense>` holes
 * put `— NO DATA` in a cell and nothing else — the breadcrumb, the eyebrow, the
 * spec rail, the terminal frame, the meta bar — and a cell cannot tell a wait
 * from an outage, so it must say neither. The rows below are the panels that
 * explain an emptiness, which are the only places the distinction can be drawn.
 */
const PANELS = [
  { route: HOME, what: "training log", source: "ops-api /api/training", down: en.homeSys01Down },
  { route: HOME, what: "systems", source: "ops-api /api/systems", down: en.homeSys02Down },
  {
    route: HOME,
    what: "contribution calendar",
    source: "ops-api /api/contributions",
    down: en.homeUplinkGraphDown,
  },
  { route: HOME, what: "operation days", source: OWN_SYSTEM, down: en.homeUplinkStripDown },
  { route: WORK, what: "systems", source: "ops-api /api/systems", down: en.workListDown },
  { route: CASE_STUDY, what: "metrics", source: OWN_SYSTEM, down: en.csMetricsDown },
  {
    route: CASE_STUDY,
    what: "operation days and incidents",
    source: OWN_SYSTEM,
    down: en.csOpsDown,
  },
] as const;

const REGIONS: Record<string, readonly string[]> = {
  [HOME]: HOME_REGIONS,
  [WORK]: WORK_REGIONS,
  [CASE_STUDY]: CASE_REGIONS,
};

async function bytesOf(page: Page, route: string): Promise<string> {
  const response = await page.goto(route);
  // The wait is in the document that was streamed, and the swap does not remove
  // it from the response body. Settling first is what makes the read stable.
  await settled(page, REGIONS[route]);
  return await (response?.text() ?? Promise.resolve(""));
}

for (const panel of PANELS) {
  const [what, source] = loadingLines(panel.what, panel.source);

  test(`${panel.route} says "${what}" while it waits`, async ({ page }) => {
    const body = await bytesOf(page, panel.route);

    expect(body, what).toContain(what);
    expect(body, source).toContain(source);
  });
}

// THE BROKEN CASE, and it is the one that shipped. A region that has not been
// answered yet must not carry the sentence that names an endpoint as having
// failed — before U7 it carried exactly that, twice per response.
test("a wait and an outage are two different sentences", async ({ page }) => {
  for (const route of [HOME, WORK, CASE_STUDY]) {
    const body = await bytesOf(page, route);

    for (const panel of PANELS.filter((entry) => entry.route === route)) {
      const [what] = loadingLines(panel.what, panel.source);

      // Both are in the bytes here, because this rig answers nothing: the wait
      // was rendered and then replaced by the failure. What is asserted is that
      // they are not the same string — the panel that says "fetching" is not the
      // panel that says an endpoint did not answer.
      expect(body, `${route}: the wait`).toContain(what);
      expect(body, `${route}: the outage`).toContain(panel.down);
      expect(what).not.toBe(panel.down);
    }
  }
});

// And once the swap has happened, the wait is gone from the page a visitor is
// looking at. A skeleton that stayed beside an answer would be the opposite
// defect, and it is the one a fallback with real markup can have.
test("the wait is not in the settled page", async ({ page }) => {
  await page.goto(HOME);
  await settled(page, HOME_REGIONS);

  await expect(page.locator(".st-wait")).toHaveCount(0);
});

/**
 * The two states side by side, with no api in the process.
 *
 * WHY THE GALLERY IS THE PLACE. On `/` both panels are the same region a moment
 * apart, so nothing there can show them together; `/dev/components` renders each
 * component in every state it has, which is what G7 built it for (ADR 0049). It
 * is also the only place `WAITING` survives as a rendered state rather than as a
 * moment.
 */
test("the gallery draws the wait and the outage as separate panels", async ({ page }) => {
  await page.goto("/dev/components");

  const strip = page.locator(".gal-part:has(.gal-name:text-is('OpsStrip')) .upl-ops");

  // Three: the answered strip, the wait, the outage.
  await expect(strip).toHaveCount(3);
  await expect(strip.nth(1).locator(".st-wait")).toBeVisible();
  await expect(strip.nth(1)).toContainText("fetching operation days");
  await expect(strip.nth(2).locator(".st-empty-panel")).toBeVisible();
  await expect(strip.nth(2)).toContainText(en.homeUplinkStripDown);
});
