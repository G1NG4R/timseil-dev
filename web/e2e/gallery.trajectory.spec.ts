/**
 * The trajectory rail, in the gallery, at every checked width.
 *
 * WHY HERE AS WELL AS ON THE PAGE. `/about` reads no endpoint, so unlike
 * `/work` the rail is in the document on its own route too — about.spec.ts
 * presses its keys there. What the gallery adds is the SECOND rail: two radio
 * groups in one document, which is the case that proves `name` had to be a prop
 * rather than a constant. A hard-coded name would make the two fight over one
 * selection, and nothing on either page would say so.
 */
import { expect, test } from "@playwright/test";

const PART = ".gal-part:has(.gal-name:text-is('TrajectoryRail'))";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/components");
});

test("the rail draws six stations and rests on the last", async ({ page }) => {
  const part = page.locator(PART);

  await expect(part.locator(".tl-item")).toHaveCount(6);
  await expect(part.locator(".tl-input")).toHaveCount(6);
  await expect(part.locator(".tl-input").nth(5)).toBeChecked();
  await expect(part.locator(".tl-item").nth(5).locator(".tl-label")).toHaveText("NOW");
});

test("exactly one panel is open, and it is the resting one", async ({ page }) => {
  const part = page.locator(PART);
  const open = part.locator(".tl-panel:visible");

  await expect(open).toHaveCount(1);
  await expect(open.locator(".tl-head-no")).toHaveText("NOW");
});

test("the three states are drawn, and past and future differ", async ({ page }) => {
  // The inventory asks for `jahr aktiv` and `inaktiv`. What the sheet actually
  // draws is THREE buckets — active, past, future — and the two inactive ones
  // are not the same: a station behind you carries a half-accent ring, one
  // ahead of you a plain one. A test that only asked "active differs from the
  // rest" would pass with past and future identical, which is the drawing
  // collapsed by one state.
  const part = page.locator(PART);
  await part.locator(".tl-item").nth(2).click();

  const ring = async (index: number) =>
    part
      .locator(".tl-item")
      .nth(index)
      .locator(".tl-dot")
      .evaluate((el) => getComputedStyle(el).borderTopColor);

  const fill = async (index: number) =>
    part
      .locator(".tl-item")
      .nth(index)
      .locator(".tl-dot")
      .evaluate((el) => getComputedStyle(el).backgroundColor);

  const [past, active, future] = [await ring(1), await ring(2), await ring(4)];

  expect(active, "the chosen dot has no ring of its own").not.toBe(past);
  expect(past, "past and future draw the same ring").not.toBe(future);
  expect(await fill(2), "the chosen dot is not filled").not.toBe(await fill(4));
});

test("two rails in one document do not share a selection", async ({ page }) => {
  // THE CASE THAT MADE `name` A PROP. Radios group by name; the gallery renders
  // its own rail beside nothing else today, but the assertion is about the
  // mechanism rather than about this page — the moment a second one exists,
  // a shared name silently makes both rails one control.
  const names = await page
    .locator(".tl-input")
    .evaluateAll((els) => [...new Set(els.map((el) => (el as HTMLInputElement).name))]);

  expect(names.length, "every rail in a document needs its own group name").toBe(
    await page.locator(".tl-rail").count(),
  );
});

test("a station with nothing shipped draws no shipped cell", async ({ page }) => {
  // ADR 0055's cut, for the fourth time: no cell rather than an em dash. The
  // sheet draws `—` on two of its six.
  const part = page.locator(PART);

  await part.locator(".tl-item").nth(0).click();
  await expect(part.locator(".tl-panel:visible .tl-shipped")).toHaveCount(0);

  await part.locator(".tl-item").nth(4).click();
  await expect(part.locator(".tl-panel:visible .tl-shipped")).toHaveCount(1);
  await expect(part.locator(".tl-panel:visible .tl-shipped")).toHaveText("02 timseil.dev");
});
