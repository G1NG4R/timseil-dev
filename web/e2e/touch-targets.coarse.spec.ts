/**
 * The 44 x 44 rule, measured rather than grepped.
 *
 * This is debt 1 of #236, and the reason it is a measurement is a mistake that
 * already happened: the first consistency run grepped for `min-height:44px` and
 * missed seventeen chips. A target can reach 44 px through padding, through
 * line-height, through a pseudo-element that widens the hit area — and a grep
 * for one declaration sees none of those, in either direction.
 *
 * THE RULE HANGS ON `pointer: coarse`, NOT ON THE WIDTH. CLAUDE.md says so, and
 * it is why this file is `.coarse.spec.ts` and runs in one project. A narrow
 * desktop window is not a phone: it has a mouse, the rule does not apply, and a
 * measurement taken there would report a pass for something it never evaluated.
 */
import { expect, test, type Page } from "@playwright/test";

/** WCAG 2.2 AA asks for 24. This project's rule is 44, and 44 is what is checked. */
const MIN = 44;

/**
 * Everything a finger is meant to hit.
 *
 * Anchors without an href are left out because they are not targets. The glyphs
 * inside a control are not asked about separately either — the target is the
 * control, and `aria-hidden` spans are its decoration.
 */
const INTERACTIVE = [
  "a[href]",
  "button",
  '[role="button"]',
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
].join(", ");

interface Target {
  label: string;
  w: number;
  h: number;
}

/**
 * Every visible control inside `root`, with the box the browser gives it.
 *
 * getBoundingClientRect and not a style declaration: it is the rendered box,
 * padding and borders included, which is the thing a finger actually meets.
 */
async function measure(page: Page, root: string): Promise<Target[]> {
  return page.evaluate(
    ({ selector, within }) => {
      const host = document.querySelector(within);
      if (!host) return [];

      const out: Target[] = [];
      for (const el of Array.from(host.querySelectorAll(selector))) {
        const box = el.getBoundingClientRect();

        // A control the layout has collapsed to nothing is not a small target,
        // it is an absent one, and that is a different question.
        if (box.width === 0 && box.height === 0) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;

        const text = el.textContent.trim().replace(/\s+/g, " ").slice(0, 32);
        out.push({
          label: `${el.tagName.toLowerCase()}.${el.className || "-"} ${JSON.stringify(
            el.getAttribute("aria-label") ?? text,
          )}`,
          w: Math.round(box.width * 100) / 100,
          h: Math.round(box.height * 100) / 100,
        });
      }
      return out;
    },
    { selector: INTERACTIVE, within: root },
  );
}

const tooSmall = (targets: Target[]) => targets.filter((t) => t.w < MIN || t.h < MIN);

/** The failure message is the measurement, so a red run does not need a rerun. */
const report = (targets: Target[]) =>
  `\n${tooSmall(targets)
    .map((t) => `    ${String(t.w)} x ${String(t.h)}  ${t.label}`)
    .join("\n")}\n`;

test.describe("targets a finger has to hit", () => {
  // The guard, and it runs first for a reason. Every assertion below is only
  // about the coarse-pointer rules if the browser actually reports a coarse
  // pointer; on a desktop context this whole file would pass while proving
  // nothing. #236 asks for exactly this line.
  test("the browser really reports a coarse pointer", async ({ page }) => {
    await page.goto("/");

    const pointer = await page.evaluate(() => ({
      coarse: matchMedia("(pointer: coarse)").matches,
      fine: matchMedia("(pointer: fine)").matches,
      hover: matchMedia("(hover: hover)").matches,
    }));

    expect(
      pointer,
      "this project exists to evaluate the coarse-pointer rules; if the browser " +
        "reports a fine pointer, every other test in this file is vacuous",
    ).toEqual({ coarse: true, fine: false, hover: false });
  });

  test("the header's controls are at least 44 x 44", async ({ page }) => {
    await page.goto("/");
    const targets = await measure(page, "header");

    expect(targets.length, "no interactive element found in the header").toBeGreaterThan(0);
    expect(tooSmall(targets), report(targets)).toEqual([]);
  });

  test("the open menu's controls are at least 44 x 44", async ({ page }) => {
    await page.goto("/");
    await page.locator("header button.nav-button").click();
    await expect(page.locator("dialog.menu")).toHaveAttribute("open", "");

    const targets = await measure(page, "dialog.menu");

    expect(targets.length, "the menu opened with nothing in it to press").toBeGreaterThan(5);
    expect(tooSmall(targets), report(targets)).toEqual([]);
  });

  test("the footer's controls are at least 44 x 44", async ({ page }) => {
    await page.goto("/");
    const targets = await measure(page, "footer");

    // No count is asserted here. The footer may legitimately carry no control
    // on a page this early; what must not happen is a control that is too small.
    expect(tooSmall(targets), report(targets)).toEqual([]);
  });
});
