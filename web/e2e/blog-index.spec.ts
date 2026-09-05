/**
 * `/blog` at every checked width — the list, the two axes, and the panel for
 * nought.
 *
 * THE RIG HAS NO API AND THIS PAGE DOES NOT WANT ONE, which is `/blog/<slug>`'s
 * property and the reason this file can assert content rather than emptiness.
 * Every row of this list is a file in the image.
 *
 * WHAT LIVES HERE RATHER THAN IN A UNIT TEST. lib/blog/filter.ts is held against
 * its own predicate by `node --test`, and that proves the arithmetic. It cannot
 * prove that pressing the control runs it: the chip row is a client island, the
 * rows are server output handed across the boundary as nodes, and the only place
 * those two halves exist at once is the hydrated document. A filter that narrows
 * a list nobody is holding is the defect no unit test can see.
 *
 * `:visible` ON EVERY SELECTOR THAT OUTLIVES A NAVIGATION, AND THE FIRST DRAFT
 * OF THIS FILE DID NOT HAVE IT. The H9a backlog says `<Activity>` "keeps up to
 * three routes mounted and merely hidden" and names the two phases it would hit
 * next — "H9b und J1 zuerst". The draft argued its way out of the warning: the
 * index and an entry are two DIFFERENT routes, so surely no selector could be
 * ambiguous. `main h1` resolved to two elements the first time the navigation
 * test ran. The rule is about what stays mounted, not about which route it
 * belongs to.
 */
import { expect, test, type Page } from "@playwright/test";

import { BLOG } from "./widths";

/** The counter, as the two numbers it states. */
async function shown(page: Page): Promise<{ shown: number; total: number }> {
  const text = (await page.locator(".blog-count").innerText()).trim();
  const match = /SHOWING (\d+) OF (\d+) ENTRIES/.exec(text);
  if (match === null) throw new Error(`the counter reads ${text}`);
  return { shown: Number(match[1]), total: Number(match[2]) };
}

test.beforeEach(async ({ page }) => {
  await page.goto(BLOG);
});

test("the index has exactly one h1, and it is the page", async ({ page }) => {
  const h1 = page.locator("main h1");
  await expect(h1).toHaveCount(1);
  await expect(h1).toHaveText("Writing");
});

// THE COUNTER AND THE LIST ARE TWO STATEMENTS ABOUT ONE THING, and H6a shipped
// them disagreeing on `/work` for the length of one build. This is the assertion
// that they cannot.
test("the head, the counter and the list all state the same number", async ({ page }) => {
  const rows = await page.locator(".post-card").count();
  const { shown: n, total } = await shown(page);
  const head = (await page.locator('.blog-stat[data-stat="entries"] dd').innerText()).trim();

  expect(rows).toBeGreaterThan(0);
  expect(n).toBe(rows);
  expect(total).toBe(rows);
  expect(Number(head)).toBe(rows);
});

// The year separators add up to the list, and each is a heading rather than a
// list item — an `<li>` there would make the entries announce themselves as
// more items than there are.
test("every entry sits under a year, and the years add up", async ({ page }) => {
  const rows = await page.locator(".post-card").count();
  const years = page.locator(".post-cards-year");
  await expect(years.first()).toBeVisible();

  // Off the count element rather than off the heading's whole text: `2026` and
  // `23 ENTRIES` are two spans, and `textContent` runs them into `202623`.
  const counts = await years
    .locator(".post-cards-year-count")
    .evaluateAll((nodes) => nodes.map((node) => Number(/(\d+)/.exec(node.textContent)?.[1])));
  expect(counts.reduce((sum, one) => sum + one, 0)).toBe(rows);

  await expect(page.locator("li.post-cards-year")).toHaveCount(0);
});

// ONE LINK PER ROW. `WorkRow` refuses to be a link because the sheet gave it
// three controls to one destination; this row is one link precisely so the count
// is the same. Two would be the keyboard trap that argument is about.
test("each entry is exactly one link, and it goes to that entry", async ({ page }) => {
  const rows = page.locator(".post-card");
  const count = await rows.count();

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    await expect(row.locator("a")).toHaveCount(1);
    await expect(row.locator("a")).toHaveAttribute("href", /^\/blog\/\d{3}-[a-z0-9-]+$/);
  }
});

// The badge names one entry and the head names its date; both are read off the
// first row, so they cannot be two opinions about which entry is newest.
test("exactly one entry is the latest, and it is the first", async ({ page }) => {
  await expect(page.locator(".post-card-latest")).toHaveCount(1);
  await expect(page.locator(".post-card").first().locator(".post-card-latest")).toBeVisible();

  const head = (await page.locator('.blog-stat[data-stat="latest"] time').innerText()).trim();
  const first = (await page.locator(".post-card-date").first().innerText()).trim();
  expect(head).toBe(first);
});

// THE CHIP ACTUALLY RUNS THE FILTER. The count on the chip is the server's, the
// narrowing is the island's, and the row's `data-tags` is the server's again —
// three things that have to agree and are built in two places.
test("a tag chip narrows the list to exactly what it claims", async ({ page }) => {
  const chip = page.locator(".blog-chips .chip").nth(3);
  // The count is a child element rather than part of the label — FilterChip
  // nests it so it can be tabular while the word is not — so the two are read
  // apart. Splitting the text on whitespace gives `ACCEPTANCE01`.
  const claimedText = (await chip.locator(".chip-n").innerText()).trim();
  const claimed = Number(claimedText);
  const full = (await chip.innerText()).replace(/\s+/g, "");
  const key = full.slice(0, full.length - claimedText.length).toLowerCase();

  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");

  const rows = page.locator(".post-card");
  await expect(rows).toHaveCount(claimed);
  expect((await shown(page)).shown).toBe(claimed);

  const tags = await rows.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset.tags ?? ""),
  );
  for (const carried of tags) {
    expect(carried.split(" ")).toContain(key);
  }
});

// The sheet's own script does this and it is easy to forget: a separator saying
// `07 ENTRIES` over three visible rows counts the corpus while the list beside
// it counts the filter.
test("the year separators go when anything narrows, and come back", async ({ page }) => {
  const years = page.locator(".post-cards-year");
  const before = await years.count();
  expect(before).toBeGreaterThan(0);

  await page.locator(".blog-chips .chip").nth(3).click();
  await expect(years).toHaveCount(0);

  await page.locator(".blog-search-input").fill("");
  await page.locator(".blog-chips .chip").first().click();
  await expect(years).toHaveCount(before);
});

test("the search narrows on what is typed, and not on the date", async ({ page }) => {
  const field = page.locator(".blog-search-input");

  await field.fill("witness");
  const hits = await page.locator(".post-card").count();
  expect(hits).toBeGreaterThan(0);
  expect((await shown(page)).shown).toBe(hits);

  // `2026` must not return the whole log. The sheet's script matches the whole
  // row and would; lib/blog/filter.ts searches the three fields the row draws.
  await field.fill("2026");
  await expect(page.locator(".blog-count")).toContainText("SHOWING 00");
});

// THE BROKEN CASE, AND ON THIS PAGE IT CAN ONLY BE REACHED ONE WAY. Every chip
// is derived from the corpus and carries its own count, so a tag alone can never
// produce nothing — the empty panel is the search, or a combination.
test("a combination that matches nothing explains itself and offers a way back", async ({
  page,
}) => {
  await page.locator(".blog-chips .chip").nth(3).click();
  await page.locator(".blog-search-input").fill("a-string-no-entry-carries");

  const panel = page.locator(".st-empty-panel");
  await expect(panel).toBeVisible();
  await expect(page.locator(".post-card")).toHaveCount(0);
  expect((await shown(page)).shown).toBe(0);

  // Both axes are echoed, and they are two elements rather than one string —
  // state.css draws a rule between them because two phrases with a gap read as
  // one sentence.
  await expect(panel.locator(".st-empty-filters span")).toHaveCount(2);
  await expect(panel).toContainText("TAG:");
  await expect(panel).toContainText("SEARCH:");
});

test("reset returns the page to the state it loaded in", async ({ page }) => {
  const total = await page.locator(".post-card").count();

  await page.locator(".blog-chips .chip").nth(3).click();
  await page.locator(".blog-search-input").fill("a-string-no-entry-carries");
  await expect(page.locator(".st-empty-panel")).toBeVisible();

  await page.locator(".st-empty-panel button").click();

  await expect(page.locator(".post-card")).toHaveCount(total);
  await expect(page.locator(".blog-search-input")).toHaveValue("");
  await expect(page.locator(".blog-chips .chip").first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".post-cards-year").first()).toBeVisible();
});

// The whole point of the phase, driven rather than read: the index is the way
// into the log, and it was a 404 for every one of these rows until H9a.
test("an entry can be reached from the index and the crumb comes back", async ({ page }) => {
  const href = await page.locator(".post-card-link").first().getAttribute("href");
  await page.locator(".post-card-link").first().click();
  await page.waitForURL(new RegExp(`${href ?? ""}$`));

  await expect(page.locator("main h1:visible")).toHaveCount(1);

  await page.locator(".post-crumb a:visible").click();
  await page.waitForURL(/\/blog$/);
  await expect(page.locator("main h1:visible")).toHaveText("Writing");
});

test("the feed is offered and the address is the one that answers", async ({ page }) => {
  await expect(page.locator('.blog-stat[data-stat="feed"] a')).toHaveAttribute(
    "href",
    "/feed.xml",
  );
  await expect(page.locator(".blog-subscribe a")).toHaveAttribute("href", "/feed.xml");

  const response = await page.request.get("/feed.xml");
  expect(response.status()).toBe(200);
  const body = await response.text();
  const rows = await page.locator(".post-card").count();
  // #322's neighbour: the sitemap and the feed disagreed about how much this
  // site had written for exactly one phase. The list and the feed are now one
  // number.
  expect(body.split("<item>").length - 1).toBe(rows);
});

// This page is the second indexable list on this site, and #322 is the decision
// that both describe themselves the same way.
test("the index tells a machine it is a list, and the list is the one on screen", async ({
  page,
}) => {
  const blocks = page.locator('script[type="application/ld+json"]');
  await expect(blocks).toHaveCount(1);

  const data = JSON.parse(await blocks.innerText()) as {
    "@graph": { "@type": string; mainEntity: { numberOfItems: number } }[];
  };
  const [node] = data["@graph"];
  expect(node["@type"]).toBe("CollectionPage");
  expect(node.mainEntity.numberOfItems).toBe(await page.locator(".post-card").count());
});

// The list, the head and the two controls are all in the served document. What
// stops working without JavaScript is the narrowing, and that is the trade
// components/blog/BlogFilters.tsx states rather than a defect.
test("the index is complete without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(BLOG);

  await expect(page.locator("main h1")).toHaveText("Writing");
  await expect(page.locator(".post-card").first()).toBeVisible();
  await expect(page.locator(".blog-count")).toContainText("SHOWING");
  await expect(page.locator(".blog-chips .chip").first()).toBeVisible();
  await expect(page.locator(".post-cards-year").first()).toBeVisible();

  await context.close();
});

// Every page on this site is checked for this at every width, and a chip row of
// thirty-two is the newest way to get it wrong.
test("the document never scrolls sideways", async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
