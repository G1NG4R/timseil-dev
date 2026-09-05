/**
 * The log index's two empty states, and the entry row's two.
 *
 * WHY THIS IS IN THE GALLERY AND NOT ON `/blog`. The page reads files that are
 * in this image, so it always has a list — the two states it owes a reader are
 * the two it can never show. `gallery.ops.spec.ts` opened this route to the rig
 * in H2b for the same reason and the same shape: "four tests that passed by
 * finding nothing to check".
 *
 * THE THIRD EMPTY STATE IS NOT HERE. Nought MATCHING entries needs the island
 * and a filter, so it is driven on the page itself, in blog-index.spec.ts.
 */
import { expect, test } from "@playwright/test";

const GALLERY = "/dev/components";

/** The two `BlogList` blocks, in the order the gallery renders them. */
const READ_AND_EMPTY = 0;
const COULD_NOT_READ = 1;

/** Both `BlogList` blocks of the gallery, in the order the page renders them. */
const BLOG_LIST = '.gal-part:has(.gal-name:text-is("BlogList")) .gal-demo';

test.beforeEach(async ({ page }) => {
  await page.goto(GALLERY);
});

// THE TWO CLAIMS, AND THE WHOLE POINT OF HAVING BOTH. `00` is a measurement:
// the directory was read and holds nothing. `— NO DATA` means the read failed.
// A page that printed `00` for both would report a working, empty log while its
// own content was missing from the image.
test("an empty log and an unreadable one say different things", async ({ page }) => {
  const blocks = page.locator(BLOG_LIST);
  await expect(blocks).toHaveCount(2);

  const empty = blocks.nth(READ_AND_EMPTY);
  const down = blocks.nth(COULD_NOT_READ);

  await expect(empty.locator('.blog-stat[data-stat="entries"] dd')).toHaveText("00");
  await expect(down.locator('.blog-stat[data-stat="entries"] dd')).toHaveText("— NO DATA");

  await expect(empty.locator(".st-empty-head")).toHaveText("00 ENTRIES");
  await expect(down.locator(".st-empty-head")).toHaveText("— NO DATA");

  // Two different sentences, not one placeholder used twice.
  const emptyReason = await empty.locator(".st-empty-reason").innerText();
  const downReason = await down.locator(".st-empty-reason").innerText();
  expect(emptyReason).not.toBe(downReason);
});

// lib/blog/counts.ts, and ADR 0070 §2's reading of `updated` one route over: a
// dash here would say a figure is MISSING when in truth nothing has happened.
test("an empty log draws no LATEST row at all rather than a dash", async ({ page }) => {
  const empty = page.locator(BLOG_LIST).nth(READ_AND_EMPTY);
  await expect(empty.locator('.blog-stat[data-stat="latest"]')).toHaveCount(0);
});

// The counted rows go and the addresses stay. Neither the feed nor the case
// study depends on the log being readable, so neither disappears with it.
test("both states keep the two rows that are addresses", async ({ page }) => {
  for (const index of [READ_AND_EMPTY, COULD_NOT_READ]) {
    const block = page.locator(BLOG_LIST).nth(index);
    await expect(block.locator('.blog-stat[data-stat="feed"] a')).toHaveAttribute(
      "href",
      "/feed.xml",
    );
    await expect(block.locator('.blog-stat[data-stat="system"] a')).toBeVisible();
  }
});

// STATE.05, and the sheet names this exit: "SYSTEME ANSEHEN →". It is offered
// for both, because a reader whose image lost its content is no less stuck than
// one who arrived early.
test("both states offer a way out", async ({ page }) => {
  for (const index of [READ_AND_EMPTY, COULD_NOT_READ]) {
    const exit = page.locator(BLOG_LIST).nth(index).locator(".blog-exit a");
    await expect(exit).toHaveAttribute("href", "/work");
    await expect(exit).toBeVisible();
  }
});

// Neither state may draw a control that narrows a list that is not there.
test("neither empty state draws the filters", async ({ page }) => {
  for (const index of [READ_AND_EMPTY, COULD_NOT_READ]) {
    const block = page.locator(BLOG_LIST).nth(index);
    await expect(block.locator(".blog-chips")).toHaveCount(0);
    await expect(block.locator(".blog-search-input")).toHaveCount(0);
    await expect(block.locator(".blog-count")).toHaveCount(0);
  }
});

// PostCard's own two states. The empty reading-time cell is a file the listing
// named and the reader could not re-open — not `— NO DATA`, because nobody
// attempted a measurement of a file that is not there.
test("the entry row keeps its reading-time cell when there is no reading time", async ({
  page,
}) => {
  const section = page.locator('.gal-part:has(.gal-name:text-is("PostCard"))');
  const rows = section.locator(".post-card");
  await expect(rows).toHaveCount(3);

  await expect(rows.nth(0).locator(".post-card-latest")).toHaveCount(1);
  await expect(rows.nth(1).locator(".post-card-latest")).toHaveCount(0);

  await expect(rows.nth(0).locator(".post-card-min")).toHaveText("12 MIN");
  await expect(rows.nth(2).locator(".post-card-min")).toHaveText("");
  await expect(rows.nth(2).locator(".post-card-min")).toHaveCount(1);
});
