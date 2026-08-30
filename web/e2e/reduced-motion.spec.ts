/**
 * `prefers-reduced-motion: reduce`, run in a browser that has the setting.
 *
 * Debt 3 of #236. `globals.css` has disabled every animation and transition
 * under this query since G1, and both the state language (G6) and the glitch
 * burst (G7) depend on that. It had never been run.
 *
 * WHAT THE TWO EARLIER PROOFS WERE, and why neither is this one. G7 proved the
 * CSS half by quoting the shipped stylesheet — which shows the rule exists, not
 * that it applies. And it proved the JS half by overriding `matchMedia`, which
 * shows the code branches on the answer it was handed, not that the browser
 * gives that answer. Playwright's `reducedMotion` sets the real emulated
 * preference, so the browser evaluates the query itself.
 */
import { expect, test } from "@playwright/test";

import { ROUTES } from "./widths";

// A browser-context option rather than a project of its own: this is the only
// file that wants the preference, and a ninth project to carry one setting
// would be a project everything else has to skip.
test.use({ contextOptions: { reducedMotion: "reduce" } });

/**
 * Every element whose computed style still animates or transitions.
 *
 * Read off getComputedStyle rather than off the stylesheet: a rule can exist and
 * lose to a more specific one, and the question here is what the element ends up
 * with. `animation-name: none` and a zero duration are the two shapes that mean
 * "nothing will move".
 */
async function stillMoving(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const moving: string[] = [];

    for (const el of Array.from(document.querySelectorAll("*"))) {
      const s = getComputedStyle(el);
      const name = `${el.tagName.toLowerCase()}.${el.className || "-"}`;

      const animates =
        s.animationName !== "none" &&
        s.animationName !== "" &&
        parseFloat(s.animationDuration) > 0;

      const transitions =
        s.transitionProperty !== "none" &&
        s.transitionProperty !== "" &&
        parseFloat(s.transitionDuration) > 0;

      if (animates) moving.push(`${name} animation ${s.animationName} ${s.animationDuration}`);
      if (transitions) {
        moving.push(`${name} transition ${s.transitionProperty} ${s.transitionDuration}`);
      }
    }
    return moving;
  });
}

test("the browser really reports the preference", async ({ page }) => {
  await page.goto("/");

  expect(
    await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    "without this, every assertion in this file is about a browser that was never asked",
  ).toBe(true);
});

for (const route of ROUTES) {
  test(`nothing on ${route} animates or transitions`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();

    const moving = await stillMoving(page);

    expect(moving, `\n    ${moving.join("\n    ")}\n`).toEqual([]);
  });
}

// The clock is the one thing that keeps moving, and it must: it is a value being
// replaced, not an element being animated. Reduced motion is about movement, not
// about a page that stops telling the truth.
//
// ANY VISIBLE CLOCK, not the header's. The first version of this test asked for
// `header .clock` and went red at 899, 719 and 390 — correctly, because below
// the breakpoint the header is 52 px of wordmark and menu button, and the clock
// lives in the footer meta bar and inside the menu instead. Components.tsx says
// so in as many words: "All three clocks on a page — header, footer meta bar,
// mobile menu — share one interval". The test was wrong, not the chrome.
test("the clock still ticks — a value is not a movement", async ({ page }) => {
  await page.goto("/");

  const clock = page.locator(".clock:visible").first();
  await expect(clock, "no clock is visible at this width").toBeVisible();

  const first = await clock.textContent();
  expect(first, "the clock rendered its placeholder and never filled in").not.toBe("--:--:--");

  await expect
    .poll(async () => clock.textContent(), { timeout: 4_000, message: "the clock stopped" })
    .not.toBe(first);
});
