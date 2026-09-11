/**
 * `/imprint` at every checked width.
 *
 * WHAT THIS FILE IS FOR. lib/legal/imprint.test.ts holds the SENTENCES — that
 * the flat third-party claim is gone and the scoped one is there, that no
 * duration appears on a page that enforces none, that the operator list takes
 * its name from lib/site.ts. lib/legal/brackets.test.ts holds the rule that no
 * legal page ships an unfilled fact. THIS holds the DOCUMENT: a list in the
 * right order still reaches a reader in the wrong one if the renderer stops
 * reading it, and a claim that is true in a constant and absent from the markup
 * is a claim nobody makes.
 *
 * AND IT HOLDS THE TWO THINGS ONLY A BROWSER CAN ANSWER: that every jump-rail
 * href lands on an element that exists, and that the way to the other legal
 * page stays inside the language the reader is already in.
 */
import { expect, test, type Page } from "@playwright/test";

import { IMPRINT } from "./widths";

/** The width this project is running at. home.spec.ts's idiom, unchanged. */
function widthOf(page: Page): number {
  const size = page.viewportSize();
  if (size === null) throw new Error("no viewport");
  return size.width;
}

/**
 * The markers, as artboard 1a draws them, transcribed a second time.
 *
 * lib/legal/sections.test.ts already holds the TABLE to this list; this holds
 * the PAGE to it. Four and not seven: an imprint answers who is answerable,
 * where the thing runs, who wrote what is on it and what may be done with it.
 */
const MARKERS = ["06.01", "06.02", "06.03", "06.04"];

/** The four compulsory entries this site does not have, in the sheet's order. */
const NOT_APPLICABLE = [
  "Trade register entry",
  "VAT identification number",
  "Supervisory authority",
  "Consumer dispute resolution",
];

test.beforeEach(async ({ page }) => {
  // No `settled` and no `ready`. This page reads no endpoint and has no client
  // component under it at all, which is also why imprint.sheet.spec.ts passes
  // the runner no `ready`.
  await page.goto(IMPRINT);
});

test("the page draws itself, with its head and its heading", async ({ page }) => {
  await expect(page.locator(".lg-eyebrow")).toHaveText("SYS.06 — IMPRINT");
  await expect(page.locator("main h1")).toHaveText("Who runs this");
});

test("the markers are the sheet's, in the sheet's order, read off the page", async ({ page }) => {
  const rendered = await page.locator(".lg-section .sec-id").allTextContents();
  expect(rendered.map((text) => text.trim())).toEqual(MARKERS);
});

test("the operator list names a person, an address and a capacity", async ({ page }) => {
  const keys = await page.locator(".lg-def dt").allTextContents();
  expect(keys).toEqual(["NAME", "ADDRESS", "EMAIL", "CAPACITY", "CONTENT"]);

  // THE SHEET DRAWS A PHONE ROW AND THIS PAGE HAS NONE. Its value there is
  // `[OPTIONAL — WEGLASSEN IST ZULÄSSIG]`, which is an instruction to whoever
  // builds the page rather than a fact about whoever runs it. A reader who has
  // to reach me has the two rows above it.
  expect(keys).not.toContain("PHONE");
});

test("every jump-rail link points at a section that exists", async ({ page }) => {
  const width = widthOf(page);
  const rail = page.locator(".lg-rail");

  // Below 1080 the rail is display:none — layout.css, and the sheet's phone
  // frame draws no rail for this page either. It is still in the DOM, so its
  // hrefs are still worth holding to their targets: a broken anchor does not
  // become correct by being invisible.
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

// THE LIST OF WHAT DOES NOT APPLY IS PART OF THE DOCUMENT, AND THAT IS WHY IT
// STAYS ON A PHONE. The rail above it is navigation and goes away below 1080;
// these four lines are the page saying that their absence is a decision, and a
// document that says less on a small screen is a second document nobody
// maintains. The sheet's own phone frame draws them, under everything else.
test("the four entries that do not apply are listed at every width", async ({ page }) => {
  const box = page.locator(".lg-na");
  await expect(box).toBeVisible();
  expect(await box.locator("li").allTextContents()).toEqual(NOT_APPLICABLE);
  await expect(box.locator(".lg-na-note")).toContainText("decision");
});

// THE FOOTER IS NOT WHERE THIS LINE LIVES, AND THAT IS A DECISION WITH A TEST.
// The Legal sheet draws `LAST REVISED [DATE]` in the footer rail on both
// artboards; the Chrome sheet is the binding version of the footer and has no
// such line, FooterMeta is byte-identical on ten pages, and lib/chrome.ts is
// held to exactly that. ADR 0076, and `/privacy` carries the same pair.
test("the revision date is on the page and not in the chrome", async ({ page }) => {
  await expect(page.locator("main .lg-revised")).toContainText("LAST REVISED");
  await expect(page.locator("footer").getByText("LAST REVISED")).toHaveCount(0);
});

// The sheet's rule that the legal pages and the 404 mark nothing in the nav.
//
// THE SELECTOR IS THE MAIN NAV AND NOT `header nav`: the language menu marks
// the current language with `aria-current` and the mobile menu carries its own
// copy of the navigation, so the broader query finds three elements and answers
// a question nobody asked. legal.spec.ts records that finding in full.
test("the main nav marks nothing active on this page", async ({ page }) => {
  await expect(page.locator('nav[aria-label="Main"] a[aria-current]')).toHaveCount(0);
  await expect(page.locator('nav[aria-label="Main"] a')).not.toHaveCount(0);
});

// ── The way to the other legal page ────────────────────────────────────────

test("SEE ALSO points at the privacy page", async ({ page }) => {
  const card = page.locator(".lg-seealso");
  await expect(card).toBeVisible();
  await expect(card.locator("a")).toHaveAttribute("href", "/privacy");
  await expect(card.locator("a")).toContainText("SYS.07 — PRIVACY");

  // And it actually goes there. The card existed on the sheet from 16.08.2026
  // and on neither page until H12c, because until H12c one of the two targets
  // was a `[SOON]` stub — the second dead end lib/notfound/mounted.ts refuses.
  await card.locator("a").click();
  await expect(page).toHaveURL(/\/privacy$/);

  // THE PAGE YOU CAME FROM IS STILL IN THE DOCUMENT, HIDDEN, and this filter is
  // the whole reason to say so. After a client-side navigation between these
  // two routes `main` holds two `.lg` trees: the one being shown, and the one
  // that was — kept mounted and `hidden` so that going back is instant. The
  // first draft of this line was `page.locator("main h1")` and it failed with a
  // strict-mode violation naming both headlines, which is how it was found.
  //
  // It is not a defect: `display: none` takes the old tree out of the
  // accessibility tree and out of the tab order, and only the visible one is a
  // heading anybody can reach. It IS a rule for every test on this site that
  // clicks from one page to another — a global selector after a navigation
  // matches the page you left as well.
  await expect(page.locator("main h1").filter({ visible: true })).toHaveText(
    "What this server knows",
  );
});

// THE LINK CARRIES THE LANGUAGE, and this is the one thing on this page that a
// unit test cannot answer: lib/legal/imprint.ts holds a PATH, and whether the
// page turns it into the reader's own address is a question about the rendered
// document. `/de/imprint` sending somebody to `/privacy` would drop them into
// another language on the way out of a legal text.
test("the link stays in the language the reader is in", async ({ page }) => {
  for (const prefix of ["", "/de", "/fr"]) {
    await page.goto(`${prefix}/imprint`);
    await expect(page.locator(".lg-seealso a")).toHaveAttribute("href", `${prefix}/privacy`);
  }
});
