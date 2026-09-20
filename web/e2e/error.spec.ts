/**
 * The 500, and the two answers it has.
 *
 * THIS FILE DELIBERATELY DOES NOT COPY notfound.spec.ts. That spec reads
 * `response.text()` — the bytes on the wire — because H10 shipped three 404s
 * that existed only after hydration and a DOM assertion could not tell them
 * apart from a working page. The same assertion here would be asking the
 * framework for something it does not offer: React's server renderer has no
 * error boundaries at all (`getDerivedStateFromError` appears zero times in
 * react-dom-server.node.production.js, and Next's own boundary is a class
 * component built on it). The designed 500 can never be in the bytes.
 *
 * So the bytes are still read — to pin that fact, not to hope it changed.
 *
 * AND THE STATUS IS ASSERTED ON BOTH ADDRESSES, because the phase's finding is
 * that they differ. Under Cache Components a real page streams a shell first,
 * so a failure inside it arrives after the headers and the response stays 200.
 * A drill with only the tidy answer would have proved half of this.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { TAGS, carriedRules } from "./axe";
import { ERROR_BEFORE_FIRST_BYTE, ERROR_IN_A_HOLE } from "./widths";

test("a failure before the first byte answers 500", async ({ page }) => {
  const response = await page.goto(ERROR_BEFORE_FIRST_BYTE);

  expect(response?.status()).toBe(500);
});

// THE BROKEN CASE, and it is broken in the way nobody expects: the status is
// right and there is no page at all. 21 characters of plain text, no document,
// no chrome, nothing to hydrate. Written down as a test so that it is a
// measured property rather than a surprise during an incident.
test("and it has no page in it, only a line of text", async ({ page }) => {
  const response = await page.goto(ERROR_BEFORE_FIRST_BYTE);
  const body = await (response?.text() ?? Promise.resolve(""));

  expect(body.trim()).toBe("Internal Server Error");
  expect(body).not.toContain("RENDER FAILED");
});

// The shape every real page on this site has, because every real page reads its
// data inside a Suspense boundary. This is the one a visitor actually meets.
test("a failure inside a streamed hole answers 200, and that is not a defect", async ({ page }) => {
  const response = await page.goto(ERROR_IN_A_HOLE);

  expect(response?.status()).toBe(200);
});

test("the designed page is never in the bytes, and the chrome always is", async ({ page }) => {
  const response = await page.goto(ERROR_IN_A_HOLE);
  const body = await (response?.text() ?? Promise.resolve(""));

  // Fizz cannot render the boundary. ADR 0078.
  expect(body).not.toContain("RENDER FAILED");

  // But the shell had already been sent, so the real document survived — this
  // is NOT Next's `<html id="__next_error__">` fallback.
  expect(body).not.toContain('id="__next_error__"');
  expect(body).toContain("<header");
  expect(body).toContain("<footer");
});

test("the 500 renders inside the real chrome", async ({ page }) => {
  await page.goto(ERROR_IN_A_HOLE);

  await expect(page.locator(".er-head")).toHaveText("RENDER FAILED");
  await expect(page.locator("header")).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();

  // ADR 0044's objection, answered. The 404 hand-copies this row because it
  // renders outside every layout (#358); this page inherits the real footer.
  await expect(page.locator('footer a[href$="/privacy"]')).toHaveCount(1);
  await expect(page.locator('footer a[href$="/imprint"]')).toHaveCount(1);
});

// STATE.05: "Rot nur hier — pro Seite ein Alert-Moment." Unlike the 404, where
// the sheet makes red the theme of the page, this page spends it once.
test("it spends exactly one alert moment", async ({ page }) => {
  await page.goto(ERROR_IN_A_HOLE);

  await expect(page.locator('[data-tone="alert"]')).toHaveCount(1);
});

// The number this page would most easily have invented. "500" is what an error
// page wants to say; here the response was 200 and the panel says so, because
// it reads PerformanceNavigationTiming rather than declaring anything.
test("the panel prints the status it measured, not the one it wanted", async ({ page }) => {
  await page.goto(ERROR_IN_A_HOLE);

  const lines = page.locator('[data-tone="alert"] .st-log > li');
  await expect(lines.nth(0)).toHaveText("web: 200 render failed");
  await expect(lines.nth(1)).toHaveText("last good measurement: — NO DATA");
});

test("the digest is a real identifier, not a placeholder", async ({ page }) => {
  await page.goto(ERROR_IN_A_HOLE);

  const digest = page.locator('[data-tone="alert"] .st-log > li').last();
  await expect(digest).toHaveText(/^digest: \d+(@E\d+)?$/);
  await expect(digest).not.toHaveText(/NO DATA/);
});

// The first test of a retry in this repository. `retry()` is a real second
// attempt — it refetches — so the proof is a new request, not a redrawn page.
test("try again makes a second attempt that fails the same way", async ({ page }) => {
  await page.goto(ERROR_IN_A_HOLE);

  const refetched = page.waitForRequest((request) => request.url().includes("/error-drill/stream"));
  await page.getByRole("button", { name: "TRY AGAIN" }).click();
  await refetched;

  // The drill still throws, so the boundary comes back — which is the honest
  // outcome and the reason #231 stays open: the count did not survive either.
  await expect(page.locator(".er-head")).toHaveText("RENDER FAILED");
});

test("the way out goes home", async ({ page }) => {
  await page.goto(ERROR_IN_A_HOLE);

  await page.getByRole("link", { name: "RETURN TO ROOT" }).click();
  await expect(page).toHaveURL(/\/$/);
});

// THE CARRIED LIST APPLIES HERE TOO, and finding that out is what moved it into
// e2e/axe.ts. This page inherits the real footer, so it inherits the footer's
// own open finding: the seven theme swatches are 11 px to a mouse (#257, carried
// with a date). What the run proved is that the 500 adds nothing of its own —
// every node axe flagged at 1024 was in the footer, none was on this page.
test("the 500 has no accessibility violations of its own", async ({ page }) => {
  await page.goto(ERROR_IN_A_HOLE);
  await expect(page.locator(".er-head")).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const violations = results.violations.filter((v) => !carriedRules.has(v.id));

  const report = violations
    .map(
      (v) =>
        `    ${v.id} (${v.impact ?? "no impact stated"}) — ${v.help}\n` +
        v.nodes.map((n) => `        ${n.target.join(" ")}`).join("\n"),
    )
    .join("\n");

  expect(violations, `\n${report}\n`).toEqual([]);
});
