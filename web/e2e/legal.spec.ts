/**
 * `/privacy` at every checked width.
 *
 * WHAT THIS FILE IS FOR, ABOVE EVERYTHING ELSE. lib/legal/content.test.ts holds
 * the SENTENCES — that every duration is one a file enforces, that the six
 * claims the design sheet outgrew are gone, that only two brackets remain. This
 * holds the DOCUMENT: a table in the right order still ships a page in the wrong
 * one if the renderer stops reading it, and a claim that is true in a constant
 * and absent from the markup is a claim nobody makes.
 *
 * AND IT HOLDS THE ONE THING NO UNIT TEST CAN SEE. The readout panel exists to
 * show a visitor their own browser, and the only way to know it does is to ask
 * the browser the same questions and compare. Everything else on this page is a
 * string; this is a measurement.
 */
import { expect, test, type Page } from "@playwright/test";

import { PRIVACY } from "./widths";

/** The width this project is running at. home.spec.ts's idiom, unchanged. */
function widthOf(page: Page): number {
  const size = page.viewportSize();
  if (size === null) throw new Error("no viewport");
  return size.width;
}

/**
 * The markers, as the Legal sheet draws them, transcribed a second time.
 *
 * lib/legal/sections.test.ts already holds the TABLE to this list. 07.03 is in
 * it: the section lost its subject when it turned out nothing counts visitors,
 * and it kept its number so the five below it did not shift and so a reader
 * looking for the analytics answer finds one.
 */
const MARKERS = ["07.01", "07.02", "07.03", "07.04", "07.05", "07.06", "07.07"];

/** The eight readout labels, in the sheet's order. */
const FIELDS = [
  "IP",
  "TIMESTAMP",
  "REQUEST",
  "USER-AGENT",
  "REFERRER",
  "LANGUAGE",
  "VIEWPORT",
  "TIME ZONE",
];

test.beforeEach(async ({ page }) => {
  // No `settled`. This page reads no endpoint at all — it is the second page on
  // this site with nothing streamed into it, after the 404 — which is also why
  // privacy.sheet.spec.ts passes the runner no `ready`.
  await page.goto(PRIVACY);
});

test("the page draws itself, with its head and its heading", async ({ page }) => {
  await expect(page.locator(".lg-eyebrow")).toHaveText("SYS.07 — PRIVACY");
  await expect(page.locator("main h1")).toHaveText("What this server knows");
});

test("the markers are the sheet's, in the sheet's order, read off the page", async ({ page }) => {
  const rendered = await page.locator(".lg-section .sec-id").allTextContents();
  expect(rendered.map((text) => text.trim())).toEqual(MARKERS);
});

test("every jump-rail link points at a section that exists", async ({ page }) => {
  const width = widthOf(page);
  const rail = page.locator(".lg-rail");

  // Below 1080 the rail is display:none — layout.css, and the sheet's mobile
  // artboard draws no rail either. It is still in the DOM, so its hrefs are
  // still worth holding to their targets: a broken anchor does not become
  // correct by being invisible.
  if (width >= 1080) await expect(rail).toBeVisible();
  else await expect(rail).toBeHidden();

  const hrefs = await rail.locator("a").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") ?? ""),
  );
  expect(hrefs).toHaveLength(MARKERS.length);

  for (const href of hrefs) {
    expect(href.startsWith("#")).toBe(true);
    await expect(page.locator(href)).toHaveCount(1);
  }
});

// THE FOOTER IS NOT WHERE THIS LINE LIVES, AND THAT IS A DECISION WITH A TEST.
// The Legal sheet draws `LAST REVISED [DATE]` in the footer rail; the Chrome
// sheet is the binding version of the footer and has no such line, FooterMeta is
// byte-identical on ten pages, and lib/chrome.ts is held to exactly that. A
// revision date is also a statement about THIS text — on `/work` it would be
// false. ADR 0076.
test("the revision date is on the page and not in the chrome", async ({ page }) => {
  await expect(page.locator("main .lg-revised")).toContainText("LAST REVISED");
  await expect(page.locator("footer").getByText("LAST REVISED")).toHaveCount(0);
});

// `activeNav()` returns null for this route — the sheet's rule that the legal
// pages and the 404 mark nothing — and this is the page proving it renders what
// the table says, which is the split ADR 0044 draws.
//
// THE SELECTOR IS THE MAIN NAV AND NOT `header nav`, and the first draft of this
// test was the broader one. It failed at both widths against three elements,
// which is not a bug in the chrome: the language menu marks the current language
// with `aria-current` and the mobile menu carries its own copy of the nav. A
// test that reads "nothing in the header is current" is asking a different
// question from the one the sheet answers, and getting a true answer to it.
test("the main nav marks nothing active on this page", async ({ page }) => {
  await expect(page.locator('nav[aria-label="Main"] a[aria-current]')).toHaveCount(0);
  // And the nav is there to be marked, so the count above is a measurement
  // rather than a selector that matches nothing.
  await expect(page.locator('nav[aria-label="Main"] a')).not.toHaveCount(0);
});

// ── The readout ────────────────────────────────────────────────────────────

test("the panel shows eight lines, in the sheet's order", async ({ page }) => {
  const keys = await page.locator(".lg-field dt").allTextContents();
  expect(keys).toEqual(FIELDS);

  // The count under the panel is derived from the list above it, and this is
  // where the two meet on a rendered page.
  await expect(page.locator(".lg-count")).toHaveText(`${String(FIELDS.length)} FIELDS · NOTHING ELSE`);
});

test("the user agent line is the browser's own, measured rather than asserted", async ({ page }) => {
  const shown = await page.locator(".lg-field", { hasText: "USER-AGENT" }).locator("dd").innerText();
  const real = await page.evaluate(() => navigator.userAgent);

  // Truncated at 96 with a visible mark. Comparing the prefix is the assertion:
  // a panel that rendered a plausible constant would fail it, and that is the
  // only failure mode this page cannot afford.
  expect(real.startsWith(shown.replace(/…$/, ""))).toBe(true);
  expect(shown.length).toBeLessThanOrEqual(97);
});

// WHAT THE PAGE PROMISES, AND IT IS NARROWER THAN THE FIRST DRAFT ASSERTED.
// That draft demanded the line carry the protocol whenever the test could read
// one, and it failed once — at 390, in the first full sweep, under the load of
// 2344 tests, and in no run since across 261 attempts. `nextHopProtocol` is
// populated when the navigation response completes, and hydration can run
// before that; the panel then reads an empty string and honestly says nothing
// about a protocol it did not measure. The test was asserting something the
// page never undertook to do.
//
// So the promise is the one worth having: whatever the line says is measured,
// and it never says a status. A page whose argument is that nothing on it is
// invented is better served by a line that is sometimes shorter than by one
// that is always complete.
test("the request line is measured, and never claims a status", async ({ page }) => {
  const shown = await page.locator(".lg-field", { hasText: "REQUEST" }).locator("dd").innerText();
  const real = await page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return entry.nextHopProtocol;
  });

  expect(shown).toContain("GET /privacy");

  // Either it names the protocol this navigation negotiated, or it names none.
  // What it must never do is name a different one — which is precisely what the
  // sheet's `HTTP/2` literal would have done on an http/1.1 connection.
  const claimed = /· (\S+)$/.exec(shown);
  if (claimed !== null) expect(claimed[1]).toBe(real);

  // The sheet's mock also writes `· 200`. A browser cannot see the status of the
  // document it is displaying, so the page does not claim one.
  expect(shown).not.toMatch(/\b[1-5]\d\d\b/);
});

test("the IP line is a sentence about the server and never an address", async ({ page }) => {
  const shown = await page.locator(".lg-field", { hasText: "IP" }).first().locator("dd").innerText();
  expect(shown).toContain("recorded server-side");
  expect(shown).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
});

test("the panel drops its reason once it has read something", async ({ page }) => {
  await expect(page.locator(".lg-term")).toHaveAttribute("data-state", "live");
  await expect(page.locator(".lg-term-pending")).toBeHidden();
});

// ── Without JavaScript ─────────────────────────────────────────────────────
//
// The reader who most needs to be told why the panel is empty is the one whose
// browser never ran the component. So the reason ships in the server HTML and is
// merely hidden once a reading exists — and this is the only test on the site
// that turns scripting off, because this is the only panel whose emptiness is a
// statement rather than a defect.

test.describe("with scripting off", () => {
  test.use({ javaScriptEnabled: false });

  test("the panel says why it is empty, and claims no measurement", async ({ page }) => {
    await page.goto(PRIVACY);

    await expect(page.locator(".lg-term")).toHaveAttribute("data-state", "pending");
    await expect(page.locator(".lg-term-pending")).toBeVisible();

    // All eight labels are there, so nothing about the page's shape depends on a
    // script — and the one line that needs no browser is filled in even here.
    await expect(page.locator(".lg-field")).toHaveCount(FIELDS.length);
    await expect(
      page.locator(".lg-field", { hasText: "IP" }).first().locator("dd"),
    ).toContainText("recorded server-side");
  });

  test("the whole document is still there", async ({ page }) => {
    await page.goto(PRIVACY);
    await expect(page.locator(".lg-section")).toHaveCount(MARKERS.length);
    await expect(page.locator(".lg-short li")).toHaveCount(8);
  });
});
