/**
 * `/blog/<slug>` at every checked width.
 *
 * THE RIG HAS NO API AND THIS PAGE DOES NOT WANT ONE. Every stage-H page before
 * it reads an endpoint, so a rig without one measures an outage panel; this
 * route reads twenty-one files that are in the image. What is on the screen here
 * is what is on the screen in production, which makes this the second page after
 * `/contact` whose e2e can assert content rather than emptiness.
 *
 * THE ANCHOR ORACLE LIVES HERE, and it is the reason this file exists rather
 * than being three assertions in the sheet spec. lib/content/toc.ts derives the
 * contents rail's hrefs and `rehype-slug` writes the ids into the compiled body;
 * the two use the same package, but they are two code paths over two
 * representations of one heading, and the only place both exist at once is the
 * rendered document. A rail link that resolves to nothing is invariant 5 inside
 * a page, and no unit test can see it.
 */
import { expect, test, type Page } from "@playwright/test";

import { BLOG_POST } from "./widths";

function widthOf(page: Page): number {
  const size = page.viewportSize();
  if (size === null) throw new Error("no viewport");
  return size.width;
}

test.beforeEach(async ({ page }) => {
  await page.goto(BLOG_POST);
});

test("the entry has exactly one h1, and it is the title", async ({ page }) => {
  const h1 = page.locator("main h1");
  await expect(h1).toHaveCount(1);
  await expect(h1).toHaveText("Zero-downtime, measured instead of claimed");
});

// THE BROKEN CASE FOR THE RAIL. Every link in the contents list has to land on
// a heading in this document. It would break silently: `rehype-slug` numbering a
// duplicate, a heading written as inline code, or the two implementations
// drifting apart all produce a link that scrolls nowhere and throws nothing.
test("every contents link lands on a heading in the document", async ({ page }) => {
  const hrefs = await page.locator(".post-toc a").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") ?? ""),
  );

  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect(href.startsWith("#"), `${href} is not a fragment`).toBe(true);
    await expect(page.locator(href)).toHaveCount(1);
  }
});

test("the rail numbers the same headings the body numbers", async ({ page }) => {
  const rail = await page.locator(".post-toc li > span").allTextContents();
  const headings = await page.locator(".post-body h2").count();

  expect(rail).toEqual(
    Array.from({ length: headings }, (_, i) => String(i + 1).padStart(2, "0")),
  );
});

// Invariant 1, on the one measured number this page prints. A word count is the
// only figure here that could be wrong without looking wrong.
test("the meta row prints a read size that is not zero", async ({ page }) => {
  const size = page.locator(".post-size");
  await expect(size).toHaveCount(1);
  await expect(size).not.toHaveText(/\b00 MIN\b/);
  await expect(size).toHaveText(/^\d{2} MIN · [\d ]+ WORDS$/);
});

test("nothing on the page is wider than the window", async ({ page }) => {
  const width = widthOf(page);
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));

  expect(overflow.scroll, `at ${String(width)} the document scrolls sideways`).toBeLessThanOrEqual(
    overflow.client,
  );
});

// The two blocks that scroll have to be reachable without a mouse. axe reports
// this as `scrollable-region-focusable`; asserting it here as well names WHICH
// element, which an axe failure on a page of forty does not.
test("a code block can be reached from the keyboard", async ({ page }) => {
  const pres = page.locator(".post-body .post-pre");
  await expect(pres.first()).toHaveAttribute("tabindex", "0");
});

test("the source link points at the file this page was rendered from", async ({ page }) => {
  const link = page.locator(".post-source a");
  await expect(link).toHaveAttribute(
    "href",
    /\/blob\/main\/web\/content\/posts\/001-zero-downtime-measured-not-claimed\.mdx$/,
  );
});

// THE ONE EMPTY STATE OF A POST, from both ends. The sheet's rule is that the
// row never disappears — "ein fehlendes Element liest sich als Fehler, ein
// benanntes nicht" — so what is asserted is that the cell is THERE and says so.
test("the oldest entry keeps its PREVIOUS cell and names the absence", async ({ page }) => {
  const cells = page.locator(".post-neighbour");
  await expect(cells).toHaveCount(2);

  const none = page.locator(".post-neighbour-none");
  await expect(none).toHaveCount(1);
  await expect(none).toHaveText("— none yet");
  await expect(page.locator(".post-neighbour-why")).toContainText("the first entry");
});

// THE CHAIN, WALKED. Starting at the oldest entry and following NEXT until a
// foot has none proves three things at once that no unit test can: every link in
// the chain resolves, the chain has exactly one end, and that end draws the
// other half of the empty state. It replaces a constant naming "the newest
// entry", which was wrong within one pull request of being written — this phase
// adds a post, and the post it named stopped being the newest.
test("the log is one unbroken chain, and only its ends are empty", async ({ page }) => {
  const seen: string[] = [];

  // `:visible`, AND IT IS NOT DEFENSIVE — IT IS `<Activity>`. next.config.ts
  // records the behaviour under `cacheComponents`: "Navigation keeps up to three
  // routes mounted and merely hidden." This is the first spec on this site that
  // navigates from one instance of a route to another instance of the SAME
  // route, so after one step `.post-neighbour` resolves to four elements — two
  // on the page in front of the reader and two on the page behind it. Measured,
  // not guessed: the first version of this walk failed with "Received: 4".
  const live = (selector: string) => page.locator(`${selector}:visible`);

  // A ceiling rather than a count. The rig must not need to know how many
  // entries exist — that is the fact the constant got wrong — and a walk with no
  // ceiling is a walk that hangs on a cycle instead of failing.
  for (let step = 0; step < 200; step++) {
    const here = new URL(page.url()).pathname;
    expect(seen, `the chain returned to ${here}`).not.toContain(here);
    seen.push(here);

    await expect(live(".post-neighbour")).toHaveCount(2);

    const next = live('.post-neighbour[data-align="end"] a');
    if ((await next.count()) === 0) break;

    await next.click();
    // WAITING ON THE URL AND NOT ON AN ELEMENT. The first version of this loop
    // waited for `main h1` to be present, which is true on the page it just left
    // — so it passed instantly, the walk never moved, and the cycle guard fired
    // on the second step. A wait that is already satisfied is not a wait.
    await page.waitForURL((url) => new URL(url).pathname !== here);
  }

  expect(seen.length).toBeGreaterThan(1);

  // The end of the walk is the newest entry, and it draws the absence rather
  // than dropping the cell.
  await expect(live(".post-neighbour-none")).toHaveText("— none yet");
  await expect(live(".post-neighbour-why")).toContainText("the newest entry");
  await expect(live(".post-all a")).toHaveAttribute("href", "/blog");
});

test("the oldest entry offers the index as the way out", async ({ page }) => {
  await expect(page.locator(".post-all a")).toHaveAttribute("href", "/blog");
});

// The crumb is one of only two ways back — the sheet draws no back button — so
// it is driven rather than read.
test("the crumb goes back to the index", async ({ page }) => {
  await page.locator(".post-crumb a").click();
  await expect(page).toHaveURL(/\/blog$/);
});

// H9a's own claim: this route ships no JavaScript of its own. What can be
// measured from here is that the page is whole without any — the rail, the
// prose, the meta and the foot are all in the served document.
test("the entry is complete without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(BLOG_POST);

  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator(".post-body h2").first()).toBeVisible();
  await expect(page.locator(".post-toc a").first()).toBeVisible();
  await expect(page.locator(".post-size")).toHaveCount(1);
  await expect(page.locator(".post-neighbour")).toHaveCount(2);

  await context.close();
});
