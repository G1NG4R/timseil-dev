/**
 * The case study at every checked width, clicked rather than read.
 *
 * WHY THIS FILE EXISTS IN THIS SHAPE. #256 was a closed `<dialog>` lying over
 * every page at `opacity: 0`, invisible to every acceptance run this repository
 * had done, because none of them had ever clicked anything. The lesson is in
 * backlog.md in one sentence: "Nichts hat je auf irgendetwas geklickt." So this
 * asserts what a reader would see and what a reader could reach, at both sides
 * of every switch the page crosses.
 *
 * IT DOES NOT ASSERT PIXELS. The design sheets are canvases with fixed artboards
 * at 1440 and 390 and no reflow in between (build plan 6.2), so five of the
 * seven widths have no drawing to be compared against. What is stated here is
 * the behaviour the Intermediate Widths sheet writes out as rules — which
 * components are in one column and which are in two, what disappears rather
 * than shrinking, and that nothing scrolls sideways. H1b adds the sheet
 * comparison for the two widths that have one.
 *
 * NOTHING HERE ASSUMES WHETHER THE API ANSWERED, and the first run is why. The
 * rig reuses an already-running server when it finds one, so locally it may
 * reach an api and in CI it reaches none — the first draft asserted five em
 * dashes, passed against no api and failed against one, which is a test about
 * the developer's terminal rather than about the page. What is asserted instead
 * is the RULE that holds either way: a tile is dashed exactly when it has no
 * number, the coverage line exists exactly when the window is known, and the
 * breadcrumb names the address whatever the api said.
 */
import { expect, test, type Page } from "@playwright/test";

import { CASE_REGIONS, settled } from "./streaming";
import { CASE_STUDY, RAIL_BREAKPOINT } from "./widths";

const NO_DATA = "— NO DATA";

/** The width this project runs at, so a test can say which side of a switch it is on. */
function widthOf(page: Page): number {
  return page.viewportSize()?.width ?? 0;
}

test.beforeEach(async ({ page }) => {
  await page.goto(CASE_STUDY);
  await settled(page);
});

test("the page is the system's, and it says which system", async ({ page }) => {
  await expect(page.locator("h1")).toHaveText("This site is the system it describes.");

  // The breadcrumb waits for the api and its fallback is the slug, never an em
  // dash: a reader has to know where they are standing whatever the api said.
  const here = page.locator(".cs-crumb .here");
  await expect(here).not.toHaveText(NO_DATA);
  await expect(here).toContainText("timseil");
});

// The rule, not the fixture. `data-has` decides the border style, and a tile
// that draws a solid border around an em dash — or a dashed one around a number
// — is invariant 1 broken in a place nothing else looks.
test("a tile is dashed exactly when it has no number", async ({ page }) => {
  const tiles = page.locator(".ops-tiles .tile");
  await expect(tiles).toHaveCount(5);

  for (const tile of await tiles.all()) {
    const has = await tile.getAttribute("data-has");
    const value = (await tile.locator(".tile-value").textContent()) ?? "";
    expect(value.includes(NO_DATA), `data-has=${has ?? "null"} for "${value}"`).toBe(has === "no");
  }
});

// Issue #208. The coverage line belongs to the uptime tile and to no other, and
// it exists exactly when the window is known — the label carries the window, so
// the two are one statement and are asserted as one.
test("the coverage line stands under the uptime figure, and only there", async ({ page }) => {
  const first = page.locator(".ops-tiles .tile").first();
  const label = (await first.locator(".tile-label").textContent()) ?? "";
  const notes = page.locator(".ops-tiles .tile-note");

  if (/·\s*\d+\s*D$/.test(label)) {
    await expect(notes).toHaveCount(1);
    await expect(notes.first()).toHaveText(/^\d+ of \d+ days measured$/);
    await expect(first.locator(".tile-note")).toBeVisible();
  } else {
    // No window means the api did not answer. The tile already says `— NO DATA`
    // where the number goes; a second em dash underneath would say nothing.
    await expect(notes).toHaveCount(0);
  }
});

// The amber note explains the em dashes above it and is written to disappear
// when they fill. Its presence is therefore a statement about them, and the
// coupling is what is asserted rather than the note.
test("the reason the tiles are empty is shown exactly while they are", async ({ page }) => {
  const filled = await page.locator('.ops-tiles .tile[data-has="yes"]').count();
  const note = page.locator(".cs-note-label");

  if (filled > 1) {
    await expect(note).toHaveCount(0);
  } else {
    await expect(note).toHaveText("EMPTY ON PURPOSE");
  }
});

test("the spec rail names no version this repository does not hold", async ({ page }) => {
  const rail = page.locator(".spec");
  await expect(rail).toBeVisible();
  // Design corrections #1 and #2. The stack comes from systems.stack, which
  // make gen fills out of go.mod, package.json and compose.yaml — so the sheet's
  // `React Router 7` and `PostgreSQL 16` are unreachable rather than fixed.
  await expect(rail).not.toContainText("React Router");
  await expect(rail).not.toContainText("PostgreSQL 16");
});

test("the spec rail is four rows, and none of them is a role", async ({ page }) => {
  // U6 REMOVED ROLE AND THIS IS WHERE THAT IS HELD. The rail was ROLE · STACK ·
  // YEAR · STATUS · SOURCE; three of the four left are answers, `year` is typed
  // and is a statement about the system. `role` was a statement about the person
  // who built it, which is the one claim on this site no running system carries
  // (ADR 0079, ADR 0081).
  //
  // Read as the keys the rail draws rather than as a count, because a count going
  // from five to four is satisfied by losing the wrong one.
  //
  // UNDER `main`, AND MEASURED RATHER THAN ASSUMED. React streams an out-of-order
  // region into `<div hidden id="S:n">` at the end of `<body>` and splices it into
  // place from an inline script; until that runs, every streamed region is in the
  // document twice. Unscoped this read returns eight keys on a cold load. `settled`
  // makes the race unlikely, not impossible, and `main` makes it irrelevant —
  // which is the U5 lesson about counting over a whole document.
  const keys = await page.locator("main .spec .spec-key").allInnerTexts();
  expect(keys).toEqual(["STACK", "YEAR", "STATUS", "SOURCE"]);
});

// K-08: two H1 steps, 62 for the homepage and About and 52 everywhere else,
// 34 on mobile. The `:where()` in case.css is what lets layout.css keep winning
// under 720, and this is the assertion that would catch it being made a class.
test("the headline is 52 above 720 and 34 below it", async ({ page }) => {
  const size = await page.locator("h1").evaluate((el) => getComputedStyle(el).fontSize);
  expect(size).toBe(widthOf(page) < 720 ? "34px" : "52px");
});

// The switch, from both sides. Intermediate Widths: "Zwei Pixel neben 1081 und
// ein anderes Layout — genau hier findet man vergessene Regeln." A rail that
// stays sticky after the columns collapse sticks to the bottom of its section
// and covers what is under it.
test("the rail is sticky in two columns and static in one", async ({ page }) => {
  const position = await page.locator(".spec").evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe(widthOf(page) >= RAIL_BREAKPOINT ? "sticky" : "static");
});

test("the tiles wrap five to three to two", async ({ page }) => {
  const columns = await page
    .locator(".ops-tiles")
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);

  const width = widthOf(page);
  expect(columns).toBe(width < 560 ? 2 : width < 720 ? 3 : 5);
});

// Weglassen vor Verkleinern, and the page may never scroll sideways. A `1fr`
// column with implicit `min-width: auto` is the classic way to break this — the
// stack line in the rail is a long unbroken run of names.
test("nothing pushes the page wider than the window", async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

// K-16: three exits from every page, and the breadcrumb is the one that belongs
// to this page rather than to the chrome. Clicked, not read — a link whose href
// is right and whose element is covered is the defect #256 was.
//
test("the breadcrumb goes back to the work index", async ({ page }) => {
  await page.locator(".cs-crumb a").click();
  await expect(page).toHaveURL(/\/work$/);
});

// What `settled` enforces, said out loud rather than left implicit in a helper.
// It asserts the same four counts the beforeEach already waited on, and that
// repetition is the point: a region that never stops being doubled fails here
// under its own name, instead of turning all 30-odd tests in this file into a
// setup error nobody can read.
test("nothing is left over from the streaming", async ({ page }) => {
  for (const selector of CASE_REGIONS) {
    await expect(page.locator(selector), selector).toHaveCount(1);
  }
});

// The registry is the gate: one system has a case study and the other does not.
// A page of em dashes for `talos-prod` would be worse than a 404.
test("a system without a written case study has no page", async ({ page }) => {
  expect((await page.goto("/work/talos-prod"))?.status()).toBe(404);
  expect((await page.goto("/work/nope"))?.status()).toBe(404);
});

// ── The two U6 acceptance criteria, as assertions ───────────────────────────
//
// They are here and not in `case-study.build.spec.ts` because this is the file
// that runs at all seven widths with the clicking rule attached, and both are
// claims about the whole page rather than about one section.

test("no section is a head without a body", async ({ page }) => {
  // THE PHASE'S OWN CRITERION: "die Seite trägt sich ohne leere Rahmen an allen
  // Prüfbreiten." U6 removed three of five sections and the two-column wrapper
  // that held the build phases, and the failure it was avoiding is specific — a
  // `.cs-arch` rail with nothing in it, or a `SectionHead` left standing over a
  // block somebody deleted. Both render as a title with air under it, both pass
  // every other test in this directory, and neither is visible in a diff.
  //
  // MEASURED, NOT COUNTED. A section with a second child that has zero height is
  // the same defect as a section with no second child, so the height is what is
  // asked. `.sec` itself is excluded from the body: it is the head.
  //
  // AND `<template>` IS EXCLUDED, because it is not a frame. React puts one per
  // Suspense boundary inline — `<template id="B:5">` sits between the pipeline and
  // the operation grid — and it is a marker with no box by definition. Measured on
  // a cold load of the production build: seven of them, all zero-height, one of
  // them inside `.02`. A test that counted it as an empty block would go red about
  // the framework rather than about the page, which is the exact failure this
  // repository keeps writing down.
  const sections = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main .cs-section")].map((section) => ({
      id: section.getAttribute("aria-labelledby") ?? "(unnamed)",
      heads: section.querySelectorAll(":scope > .sec").length,
      body: [...section.children]
        .filter((child) => !child.classList.contains("sec"))
        .filter((child) => child.tagName !== "TEMPLATE")
        .map((child) => Math.round((child as HTMLElement).getBoundingClientRect().height)),
    })),
  );

  expect(sections.length).toBeGreaterThan(0);

  for (const section of sections) {
    expect(section.heads, `${section.id} has one head`).toBe(1);
    expect(section.body.length, `${section.id} has a body`).toBeGreaterThan(0);
    for (const height of section.body) {
      expect(height, `${section.id} draws a block with height`).toBeGreaterThan(0);
    }
  }
});

test("the old role is nowhere a reader can see it", async ({ page }) => {
  // THE CLOSING CHECK OVER U1 TO U6: "keine nutzersichtbare Stelle nennt mehr die
  // alte Rolle." The two last occurrences were `role` and one sentence of
  // `problem[]` in content/case-studies (A11's list), and this is the assertion
  // that stops them coming back.
  //
  // OVER `main`, NOT OVER THE DOCUMENT, and the U5 acceptance is why: a count
  // taken over the whole page includes the footer and, in a streamed response,
  // the RSC payload — which is how `grep -c` invented a broken criterion for
  // `[SOON]` on /about. `innerText` of `main` is what a reader can read.
  //
  // AND NOT VIA A SELECTOR. `.spec-key` with the text ROLE no longer exists, so a
  // locator for it would go green by finding nothing — the failure mode the
  // trajectory rail's own `[SOON]` test records. The text is asked for instead.
  //
  // ONE WORD, NOT TWO. An earlier draft also refused `/\bROLE\b/`, which was a
  // second spelling of the assertion above it — "the spec rail is four rows" —
  // and it became a trap the moment `.01 PROBLEM` came back: that section says
  // "For a DevOps role", and only the absent `i` flag kept the test green. A
  // guard that passes because of a flag nobody meant to rely on is worse than no
  // guard, so the rail is checked where the rail is checked and this asks the one
  // question it was written for.
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/\bbackend\b/iu);
});
