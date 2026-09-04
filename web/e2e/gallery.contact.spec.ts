/**
 * The contact panel's six states, in the gallery, where they are the only place
 * all six exist at once.
 *
 * WHY HERE AS WELL AS ON THE PAGE. contact.spec.ts drives the form and reaches
 * four of the six by mocking an answer. What it cannot do is stand them beside
 * each other, and that is the assertion this file makes: six states, six words,
 * no two the same, and the fill following the kind of answer behind it rather
 * than the mood of the state. The Consistency Check's second round lists "sechs
 * Formzustände" as settled for `/contact` and nothing rendered the claim until
 * H8b built this section.
 */
import { expect, test } from "@playwright/test";

const PART = ".gal-part:has(.gal-name:text-is('ContactForm'))";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/components");
});

test("draws the six the sheet draws, each with its own word", async ({ page }) => {
  const part = page.locator(PART);

  await expect(part.locator(".tx")).toHaveCount(6);
  await expect(part.locator(".tx-state")).toHaveText([
    "REST",
    "COMPOSING",
    "REJECTED",
    "SENDING",
    "ACCEPTED",
    "FAILED",
  ]);
});

test("no state is carried by its colour", async ({ page }) => {
  const part = page.locator(PART);

  // Every state that has a dot has a word beside it, and the dot is hidden from
  // a screen reader — the same fact drawn twice, and only one of the two is the
  // accessible name.
  const dots = part.locator(".tx-head .st-dot");
  await expect(dots).toHaveCount(6);
  for (const dot of await dots.all()) {
    await expect(dot).toHaveAttribute("aria-hidden", "true");
  }

  const words = await part.locator(".tx-state").allTextContents();
  expect(new Set(words).size).toBe(words.length);
});

test("only the state with a measurement behind it gets a measured fill", async ({ page }) => {
  const part = page.locator(PART);

  // `solid` means "measured, and good" everywhere on this site. A 202 with a
  // round trip is the one state on this page that has measured anything; a
  // sending request is holding a deadline and not a value.
  const solid = part.locator(".tx-head .st-dot[data-dot='solid']");
  await expect(solid).toHaveCount(1);
  await expect(
    part.locator(".gal-case:has(.st-dot[data-dot='solid']) .tx-state"),
  ).toHaveText("ACCEPTED");

  // And the pulse never stands alone: it may only decorate a fill that already
  // tells the state apart, because prefers-reduced-motion removes it entirely.
  const pulsing = part.locator(".tx-head .st-dot[data-pulse]");
  for (const dot of await pulsing.all()) {
    await expect(dot).toHaveAttribute("data-dot", "solid");
  }
});

test("the alert tone is spent once", async ({ page }) => {
  // "EIN ALERT-MOMENT: DER FEHLSCHLAG" — the sheet's own rule one line above
  // the six cards. Two red states on one page spends it twice.
  const part = page.locator(PART);

  await expect(part.locator(".tx-head[data-tone='alert']")).toHaveCount(1);
  await expect(part.locator(".gal-case:has([data-tone='alert']) .tx-state")).toHaveText("FAILED");
});

test("the log carries the duration, and never a verdict it did not see", async ({ page }) => {
  const part = page.locator(PART);
  const accepted = part.locator(".gal-case:has(.tx-state:text-is('ACCEPTED'))");

  await expect(accepted.locator(".tx-log li[data-dir='in']")).toHaveText("202 accepted · 1120ms");
  await expect(accepted.locator(".tx-log")).not.toContainText("delivered");

  // Across all four logs on the page, and not only the accepted one: the two
  // lines the sheet's demo script writes are claims about a verdict the browser
  // never saw and a provider it never speaks to.
  for (const text of await part.locator(".tx-log").allTextContents()) {
    expect(text).not.toContain("spam");
    expect(text).not.toContain("provider unavailable");
    expect(text).not.toContain("delivered");
  }
});

test("the resting state has no log at all", async ({ page }) => {
  // A log that opened with a line about nothing having happened would be the
  // panel describing its own emptiness — and below 720 it is what decides
  // whether the panel is on the page.
  const part = page.locator(PART);
  const rest = part.locator(".gal-case:has(.tx-state:text-is('REST'))");

  await expect(rest.locator(".tx-log")).toHaveCount(0);
  await expect(rest.locator(".tx")).not.toHaveAttribute("data-log", "");
  await expect(rest.locator(".tx-body")).toContainText("waiting for input");
});
