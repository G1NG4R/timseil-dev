/**
 * The 404 at every checked width, and the two things about it that no other
 * spec in this rig has ever checked.
 *
 * THE STATUS CODE IS THE POINT OF THIS FILE. Nothing in `e2e/` has asserted an
 * HTTP status until now — every page here answers 200 and the question never
 * came up. It comes up here because Next can serve a 404 body under a `200`:
 * "when streaming, a 200 status code will be returned … the status code cannot
 * be updated" (loading.md). That is a soft 404, and this site argues against
 * exactly that shape one level up, in docs/systemhandbuch.md, where the
 * deploy acceptance counts non-200 rather than 5xx. So the status is asserted
 * on every address that should have one.
 *
 * AND THE SECOND IS THAT THE PAGE EXISTS IN THE RESPONSE. H10a shipped its
 * fourth attempt at this file's route for one reason: the first three rendered
 * the 404 in the browser and nowhere else — an empty body full of <script>,
 * assembled after hydration. A Playwright assertion on the DOM cannot tell that
 * apart from a working page, because Playwright runs the script. So the
 * assertions below read `response.text()`, which is the bytes on the wire, and
 * that is the only form in which "server-rendered" is a claim rather than a
 * hope.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { MOUNTED_ROUTES } from "../lib/notfound/mounted";
import { parseMs } from "../lib/scramble";
import { NOT_FOUND } from "./widths";

/** WCAG 2.2 AA, the same set a11y.spec.ts sweeps the real routes with. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("an address that resolves to nothing answers 404", async ({ page }) => {
  const response = await page.goto(NOT_FOUND);

  expect(response?.status()).toBe(404);
});

// Four shapes of missing, because they take four different paths through the
// router and only one of them is the obvious one.
for (const path of ["/no-such-address", "/de/no-such-address", "/es/about", "/a/b/c"]) {
  test(`${path} answers 404 and carries the page`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);

    // The bytes, not the DOM. See the file header.
    const html = (await response?.text()) ?? "";
    expect(html).toContain("SIGNAL");
    expect(html).toContain("MOUNTED ROUTES");
  });
}

test("the response carries a stylesheet, so the page is not raw markup", async ({ page }) => {
  const response = await page.goto(NOT_FOUND);
  const html = (await response?.text()) ?? "";

  expect(html).toMatch(/rel="stylesheet"/);
});

test("the router trace names the address that was asked for", async ({ page }) => {
  await page.goto(NOT_FOUND);

  await expect(page.locator(".nf-fact-path")).toHaveText(NOT_FOUND);
});

// THE ONE A STRANGER CONTROLS. The address is the only thing on this site that
// a visitor writes and the page prints, so it is the site's one reflected-input
// surface outside the terminal. lib/notfound/trace.ts holds the same case as a
// unit test; this is the half that proves React escaped it in a real browser.
test("markup in the address is printed, never executed", async ({ page }) => {
  const attack = "/<img src=x onerror=alert(1)>";
  let dialogs = 0;
  page.on("dialog", (dialog) => {
    dialogs += 1;
    void dialog.dismiss();
  });

  const response = await page.goto(attack);

  expect(response?.status()).toBe(404);
  expect(dialogs).toBe(0);

  // AND THE BROWSER GOT THERE FIRST, which is worth writing down rather than
  // asserting around: it percent-encodes the address before the request is
  // sent, so what the page prints is `/%3Cimg%20src=x…`. The raw bytes only
  // arrive from a client that does not encode — curl, or a scanner — and that
  // case is lib/notfound/trace.test.ts's, where it can be driven exactly.
  await expect(page.locator(".nf-fact-path")).toContainText("%3Cimg");
  // Either way: characters, never an element.
  await expect(page.locator(".nf-fact-path img")).toHaveCount(0);
});

// The sheet's note says four mounted routes and its artboard draws five
// columns; Routes and Paths settles it at five, "sonst ist sie eine Sackgasse
// mit Dekoration". Both halves are asserted, because a list of five under a
// sentence that says four is the defect this phase nearly shipped.
test("five ways out, and the trace counts the same five", async ({ page }) => {
  await page.goto(NOT_FOUND);

  await expect(page.locator(".nf-routes-list li")).toHaveCount(MOUNTED_ROUTES.length);
  await expect(page.locator(".nf-log")).toContainText(
    `matching ${String(MOUNTED_ROUTES.length)} mounted routes`,
  );
});

// ADR 0044: the footer is "der einzige Weg zu PRIVACY und IMPRINT von einer
// Fehlerseite aus", and this page cannot render the real footer. The two links
// it renders by hand instead are what that ADR is owed.
test("privacy and imprint stay reachable from the error page", async ({ page }) => {
  await page.goto(NOT_FOUND);

  await expect(page.locator('.nf-legal a[href$="/privacy"]')).toHaveCount(1);
  await expect(page.locator('.nf-legal a[href$="/imprint"]')).toHaveCount(1);
});

// H11 builds the game. Until then the surface says so, and `[SOON]` rather than
// `— NO DATA` is the distinction lib/state/words.ts exists to keep: nothing was
// measured and failed, the thing does not exist yet.
test("the error-budget surface is a surface, not a disabled control", async ({ page }) => {
  await page.goto(NOT_FOUND);

  await expect(page.locator(".nf-budget-state")).toHaveText("[SOON]");
  await expect(page.locator(".nf-budget canvas")).toHaveCount(0);
  await expect(page.locator(".nf-lane")).toHaveCount(4);
});

// ── H10b · the glitch ──────────────────────────────────────────────────────
//
// THE FIRST MOVING THING ON THIS PAGE, and the first on this site whose FIRST
// run belongs to the server. The sheet's own version is a script that assigns
// an animation on mount; this one is an attribute in the markup and a rule in
// the stylesheet, so the assertions below are about the bytes, the token and
// the restart — not about a JavaScript branch having been taken.

test("the glitch is in the bytes, so the first run needs no hydration", async ({ page }) => {
  const response = await page.goto(NOT_FOUND);
  const html = (await response?.text()) ?? "";

  // The same proof form H10a introduced for the whole page: `response.text()`
  // is what a client without JavaScript receives. An assertion on the DOM would
  // pass even if React had added the attribute after hydration, which is the
  // exact difference this test exists to see.
  expect(html).toMatch(/class="[^"]*nf-display[^"]*"[^>]*data-glitch/);
});

test("the move lasts the token and not a literal", async ({ page }) => {
  await page.goto(NOT_FOUND);

  // Invariant 8, at the one place on this page where it could be broken without
  // anybody noticing: the sheet writes `.3s` and `--d-glitch` is 280ms.
  //
  // COMPARED AS A NUMBER, NOT AS TEXT, and the first draft of this test compared
  // text and went red on a correct build. The minifier rewrites `280ms` to
  // `.28s` in the shipped stylesheet, so the token READS differently in
  // development and in production while meaning the same thing. What the rule
  // has to say is that the animation lasts whatever the token lasts; the
  // spelling is the build's business. `parseMs` is the same function
  // `StateFlip` reads `--d-glitch` with.
  const [duration, token] = await Promise.all([
    page.locator(".nf-display").evaluate((el) => getComputedStyle(el).animationDuration),
    page.locator(":root").evaluate((el) => getComputedStyle(el).getPropertyValue("--d-glitch")),
  ]);

  expect(parseMs(token), `--d-glitch reads \`${token}\``).toBe(280);
  expect(parseMs(duration), `the move reads \`${duration}\``).toBe(
    parseMs(token),
  );
});

test("replay fires the move again, once per click", async ({ page }) => {
  // The control is not drawn on the mobile artboard, and layout.css removes it
  // at 720 — so this test has nothing to click at 719 and 390. Skipped there
  // rather than given a viewport of its own: the point of the seven width
  // projects is that a spec runs at every width the site is checked at, and a
  // test that set its own would stop answering for the five in between.
  const width = page.viewportSize()?.width ?? 0;
  test.skip(width < 720, "artboard 1b draws no replay control");

  await page.goto(NOT_FOUND);

  // A COUNTER IN THE PAGE RATHER THAN A STOPWATCH IN THE RUNNER. The move lasts
  // 280ms, so anything that tried to catch it running — `getAnimations().length`
  // a moment after the click — would be a race, and a race in a test is a red
  // run somebody eventually deletes. `animationstart` fires exactly once per run
  // of the keyframe, which is the event the claim is actually about.
  await page.evaluate(() => {
    document.body.dataset.glitches = "0";
    document.addEventListener(
      "animationstart",
      (event) => {
        if (event.animationName !== "nf-glitch") return;
        const seen = Number(document.body.dataset.glitches ?? "0");
        document.body.dataset.glitches = String(seen + 1);
      },
      true,
    );
  });

  // Once, and then once more — the second click is the half that would catch a
  // control which only ever works the first time, which is what an attribute
  // toggled without a remount would give.
  await page.locator(".nf-replay").click();
  await expect(page.locator("body")).toHaveAttribute("data-glitches", "1");

  await page.locator(".nf-replay").click();
  await expect(page.locator("body")).toHaveAttribute("data-glitches", "2");
});

// ARTBOARD `1b` DRAWS NO THIRD CONTROL, and that decision also keeps the one
// target on this page that would have been under 44px away from every screen
// where the rule applies. Both halves are asserted, because "it is hidden" and
// "it is hidden at the right width" are different claims.
test("replay is drawn at a desk and not on the mobile artboard", async ({ page }) => {
  await page.goto(NOT_FOUND);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".nf-replay")).toBeVisible();

  await page.setViewportSize({ width: 719, height: 844 });
  await expect(page.locator(".nf-replay")).toBeHidden();
});

// A CONTROL THAT MOVES NOTHING IS WORSE THAN NO CONTROL. Under the preference
// the keyframe is disabled by globals.css, so the button is removed with it —
// otherwise REPLAY GLITCH would be a promise the page has decided not to keep.
test.describe("with reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("nothing moves and the replay control is gone", async ({ page }) => {
    await page.goto(NOT_FOUND);

    const glitch = page.locator(".nf-display");
    const name = await glitch.evaluate((el) => getComputedStyle(el).animationName);

    expect(name).toBe("none");
    await expect(page.locator(".nf-replay")).toBeHidden();
  });
});

test("the accessibility sweep is clean", async ({ page }) => {
  await page.goto(NOT_FOUND);

  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  expect(results.violations).toEqual([]);
});
