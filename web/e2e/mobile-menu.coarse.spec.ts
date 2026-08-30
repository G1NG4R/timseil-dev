/**
 * The `<Activity>` question, and it is a measurement rather than an argument.
 *
 * Debt 2 of #236. `cacheComponents: true` keeps up to three routes mounted and
 * merely hidden, so the worry was a menu that survives a navigation invisibly
 * and leaves the document locked.
 *
 * G4 answered it structurally: `SiteHeader` is a sibling of `{children}`, and
 * Activity hides routes rather than the layout, so the menu cannot be caught by
 * it. That is a good argument and it is still an argument. What was missing was
 * a run, and the reason it was missing is written in the issue: the button only
 * exists below 900, a tiling window manager will not make the window narrower,
 * and forcing a mobile viewport through CSS measures the override rather than
 * the application.
 *
 * A browser context with a real 390 px viewport and a coarse pointer is the
 * window that was missing.
 *
 * IT RUNS AGAINST A PRODUCTION BUILD. Under `next dev` there is no route cache
 * to be caught by, so a green run there would answer a question nobody asked —
 * see the header of playwright.config.ts.
 */
import { expect, test } from "@playwright/test";

/** True while the document behind the modal is prevented from scrolling. */
async function documentIsLocked(page: import("@playwright/test").Page) {
  return page.evaluate(() => getComputedStyle(document.documentElement).overflow === "hidden");
}

test.describe("the mobile menu across a navigation", () => {
  // THE CANARY, and it is here because it caught a wrong reading while this
  // file was being written. A <dialog> gets `display: none` when closed and
  // `display: block` when open from the USER AGENT, with no stylesheet at all —
  // which is very close to what a passing result looks like. A page whose CSS
  // never arrived would therefore make most of this file green.
  //
  // --d-glow is read because it is a token, not a guess: tokens.css sets it to
  // 160ms, and if the cascade is in place that value comes back.
  //
  // COMPARED AS A DURATION, NOT AS A STRING, and that is not fussiness — the
  // first version of this test asserted "160ms" and went red against the
  // production build, which ships the same token minified to ".16s". A canary
  // that cries wolf over notation is a canary somebody deletes.
  test("the stylesheet is actually applied", async ({ page }) => {
    await page.goto("/");

    const glow = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--d-glow").trim(),
    );

    const ms = /^([\d.]+)(ms|s)$/.exec(glow);

    expect(
      ms,
      `--d-glow reads ${JSON.stringify(glow)} — no tokens on the document, and ` +
        "every dialog assertion below would be measuring a user-agent default " +
        "that happens to resemble a pass",
    ).not.toBeNull();
    expect(Number(ms?.[1]) * (ms?.[2] === "s" ? 1000 : 1)).toBe(160);
  });

  test("the button exists here and the desktop nav does not", async ({ page }) => {
    await page.goto("/");

    // The premise of every test below. If the chrome ever stops switching at
    // this width, the rest of this file would pass by not finding anything.
    await expect(page.locator("header button.nav-button")).toBeVisible();
  });

  // The finding this rig existed for one run before it found it (#256): the
  // CLOSED dialog carried `display: flex` from its base rule, so it sat at
  // inset:0 over the whole viewport with opacity:0 — invisible, and still
  // hit-testable. Nothing on the site could be clicked, at any width.
  //
  // Asserted on the computed value rather than on a successful click, because a
  // click that works says nothing about why: this names the cause.
  test("the closed menu is not laid out over the page", async ({ page }) => {
    await page.goto("/");

    const closed = await page.evaluate(() => {
      const d = document.querySelector("dialog.menu");
      if (!d) return null;
      const box = d.getBoundingClientRect();
      return {
        display: getComputedStyle(d).display,
        area: Math.round(box.width * box.height),
        atCentre:
          document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.closest("dialog.menu") !== null,
      };
    });

    expect(closed, "there is no dialog.menu to check").not.toBeNull();
    expect(closed?.display, "a closed dialog that is laid out is a shield over the page").toBe("none");
    expect(closed?.area, "the closed menu still occupies area").toBe(0);
    expect(closed?.atCentre, "the closed menu is what a tap in the middle of the page hits").toBe(false);
  });

  test("opening locks the document and closing releases it", async ({ page }) => {
    await page.goto("/");
    expect(await documentIsLocked(page)).toBe(false);

    await page.locator("header button.nav-button").click();
    await expect(page.locator("dialog.menu")).toHaveAttribute("open", "");
    expect(
      await documentIsLocked(page),
      "the modal is in the top layer but the document behind it still scrolls",
    ).toBe(true);

    await page.locator("dialog.menu button.menu-close").click();
    await expect(page.locator("dialog.menu")).not.toHaveAttribute("open", "");
    expect(await documentIsLocked(page)).toBe(false);
  });

  test("Escape closes it, and Escape is the native path around React", async ({ page }) => {
    await page.goto("/");
    await page.locator("header button.nav-button").click();
    await expect(page.locator("dialog.menu")).toHaveAttribute("open", "");

    await page.keyboard.press("Escape");

    await expect(page.locator("dialog.menu")).not.toHaveAttribute("open", "");
    expect(
      await documentIsLocked(page),
      "the dialog closed natively and the lock was left behind",
    ).toBe(false);
  });

  // The one the issue is actually about: navigating away from inside the menu.
  test("a link inside the menu navigates and leaves nothing open", async ({ page }) => {
    await page.goto("/");
    await page.locator("header button.nav-button").click();
    await expect(page.locator("dialog.menu")).toHaveAttribute("open", "");

    await page.locator("dialog.menu nav a.menu-link").first().click();
    await page.waitForURL((url) => url.pathname !== "/");

    await expect(page.locator("dialog.menu")).not.toHaveAttribute("open", "");
    expect(
      await documentIsLocked(page),
      "the route changed and the document is still locked — a visitor cannot scroll",
    ).toBe(false);
  });

  // And the half a click cannot reach: the history buttons. This is where a
  // cached route would show, because going back restores a tree rather than
  // building one.
  test("back and forward leave nothing open", async ({ page }) => {
    await page.goto("/");
    await page.locator("header button.nav-button").click();
    await page.locator("dialog.menu nav a.menu-link").first().click();
    await page.waitForURL((url) => url.pathname !== "/");

    await page.goBack();
    await expect(page.locator("dialog.menu")).not.toHaveAttribute("open", "");
    expect(await documentIsLocked(page), "back restored an open menu").toBe(false);

    await page.goForward();
    await expect(page.locator("dialog.menu")).not.toHaveAttribute("open", "");
    expect(await documentIsLocked(page), "forward restored an open menu").toBe(false);
  });
});
