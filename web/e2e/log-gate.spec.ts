/**
 * The gate U2 hung on the log, asserted in the state this repository is in.
 *
 * WHY THIS FILE EXISTS AT ALL. Five specs and one describe in `home.spec.ts`
 * skip themselves while `content/posts` is empty, and a skip is silence: it says
 * "nobody measured this", which is the right thing for a renderer with nothing
 * to render and the wrong thing for a decision. The decision is that the log and
 * everything pointing at it disappear until Tim writes the first entry
 * (ADR 0079), and a decision nothing checks is a hope. This is the half that
 * runs.
 *
 * BOTH HALVES ARE HERE, AND ONLY ONE OF THEM RUNS. Whichever state the
 * repository is in, one describe asserts it and the other skips — so the day an
 * entry exists the same file proves the opposite claim, rather than being a
 * fixture somebody has to remember to delete.
 *
 * `010-two-tests-were-green-because-nothing-was-there` is the entry this phase
 * removed, and its finding is the reason for the shape: a test that iterates
 * nothing passes without checking anything. Nothing below iterates.
 */
import { expect, test } from "@playwright/test";

import { BLOG, HAS_LOG, HOME } from "./widths";

test.describe("with no log", () => {
  test.skip(() => HAS_LOG, "the repository holds an entry — the other half applies");

  // The navigation is one component drawn twice: `.nav-links` above 900 and the
  // menu below it, both in the document at every width (SiteHeader draws the
  // menu unconditionally and CSS hides it). So one count covers both, and a
  // header that offered the log in only one of the two would fail here.
  test("the chrome offers no way into the log", async ({ page }) => {
    await page.goto(HOME);

    await expect(page.locator('header a[href="/blog"]')).toHaveCount(0);
    await expect(page.locator("header .nav-link")).toHaveText(["WORK", "ABOUT", "CONTACT"]);
  });

  // NOT `.log` ALONE. An empty section would satisfy a check for rows and fail
  // the thing U2 decided: the section is not drawn, and the markers below it
  // close without a gap.
  test("the homepage draws no log section, and its markers still ascend", async ({ page }) => {
    await page.goto(HOME);

    await expect(page.locator("main .log")).toHaveCount(0);
    await expect(page.locator("main .sec-id")).toHaveText(["SYS.01", "SYS.02", "SYS.03"]);
  });

  // ADR 0047 decided this one before U2 existed: an empty channel is a valid
  // document, and a reader that gets an error shows the visitor a failure once
  // per poll. "Der Feed bricht nicht" is the phase's own wording.
  test("the feed answers, and answers with no items", async ({ page }) => {
    const response = await page.request.get("/feed.xml");

    expect(response.status()).toBe(200);
    const xml = await response.text();
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });

  // The page keeps answering and keeps its designed empty panel (ADR 0071 §4),
  // because a bookmark is not a reason to serve a 404. What it stops doing is
  // inviting a crawler in.
  test("the index answers and says it should not be indexed", async ({ page }) => {
    await page.goto(BLOG);
    await expect(page.locator("main h1")).toHaveCount(1);

    const robots = page.locator('head meta[name="robots"]');
    await expect(robots).toHaveAttribute("content", /noindex/);

    const sitemap = await page.request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).not.toContain("/blog");
  });
});

test.describe("with a log", () => {
  test.skip(() => !HAS_LOG, "the repository holds no entry — the other half applies");

  test("the chrome offers the way into the log", async ({ page }) => {
    await page.goto(HOME);

    await expect(page.locator('header a[href="/blog"]')).toHaveCount(2);
    await expect(page.locator("header .nav-link")).toHaveText([
      "WORK",
      "LOG",
      "ABOUT",
      "CONTACT",
    ]);
  });

  test("the homepage draws the log section", async ({ page }) => {
    await page.goto(HOME);

    await expect(page.locator("main .log")).toHaveCount(1);
    await expect(page.locator("main .sec-id")).toHaveText([
      "SYS.01",
      "SYS.02",
      "SYS.03",
      "SYS.04",
    ]);
  });

  test("the feed carries the entries and the sitemap lists the index", async ({ page }) => {
    const feed = await page.request.get("/feed.xml");
    expect(feed.status()).toBe(200);
    expect(await feed.text()).toContain("<item>");

    const sitemap = await page.request.get("/sitemap.xml");
    expect(await sitemap.text()).toContain("/blog");
  });
});
