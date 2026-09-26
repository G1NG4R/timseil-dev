/**
 * `.02 BUILD` on the built page — the compose excerpt, and the section around it.
 *
 * IT WAS `case-study.arch.spec.ts` AND IT HELD ELEVEN TESTS. Six of them measured
 * the request path, the side lanes, the decision table and the build phases, and
 * U6 removed all four (ADR 0081). The file is renamed rather than kept under a
 * name that describes a section the page no longer has: `.02 ARCHITECTURE` is
 * gone, `.03 BUILD` is now `.01`, and a spec called `.arch` would be the same
 * class of stale pointer as a head with no body.
 *
 * NO SUFFIX, so this file runs at all seven widths. The rules below are about
 * behaviour, and `case-study.sheet.spec.ts` is where a measurement is held
 * against a drawing, at the three widths that have one.
 *
 * NOTHING HERE ASSUMES WHETHER THE API ANSWERED, which is `case-study.spec.ts`'s
 * rule and applies here for a stronger reason: this section reads nothing
 * measured at all. The compose block is a build artefact in the image. If an
 * assertion below could ever be changed by the api being up, it is testing the
 * wrong thing.
 *
 * IT WAITS ON ALL FIVE STREAMED REGIONS, THOUGH THIS SECTION IS NOT ONE. `.01`
 * prerenders whole, so nothing here can be caught mid-swap — and the first draft
 * of the file it comes from still copied the pre-#279 wait that looked only at
 * the breadcrumb. The definition lives in `streaming.ts` so that the next spec
 * against this route inherits the fix instead of the bug.
 */
import { expect, test } from "@playwright/test";

import excerpt from "../content/generated/compose-api.gen.json";
import { settled } from "./streaming";
import { CASE_STUDY } from "./widths";

/** The three sections `/work/timseil-dev` draws, in the order it draws them. */
const SECTIONS = ["sec-01", "sec-02", "sec-03"] as const;

test.beforeEach(async ({ page }) => {
  await page.goto(CASE_STUDY);
  await settled(page);
});

test("the sections keep their distance, including the last one", async ({ page }) => {
  // H1 shipped `.01` alone, and the 96px above it belonged to the metric row
  // rather than to the section — so the rhythm read as present and was not. With
  // three sections the gaps measured zero, and so did the space before the
  // footer. Checked as "every gap is the same and none of them is nothing",
  // never as a pixel count, because the step may be re-chosen and the rule that
  // matters is that a section is spaced from whatever follows it.
  //
  // THE FLOOR IS TWO AND WAS THREE. U6 left two sections, and a `>= 3` here
  // would have gone red about the phase rather than about the rhythm. It is a
  // floor and not an equality for the reason it was written as one: the next
  // section Tim writes must not have to edit a number in a test about spacing.
  const gaps = await page.evaluate(() => {
    const sections = [...document.querySelectorAll<HTMLElement>(".cs-section")];
    return sections.map((section) => Math.round(parseFloat(getComputedStyle(section).marginBlockEnd)));
  });

  expect(gaps.length).toBeGreaterThanOrEqual(3);
  expect(new Set(gaps).size).toBe(1);
  expect(gaps[0]).toBeGreaterThan(0);
});

test("the sections are numbered from one, with no gap", async ({ page }) => {
  // THE NUMBERS HAVE MOVED TWICE AND THIS IS THE ASSERTION THAT HOLDS THEM. U6
  // made `.03` and `.04` into `.01` and `.02`; restoring the problem section
  // pushed them to `.02` and `.03`. Each time they were renumbered rather than
  // left with a gap, because the numbers are on the screen and a page that opens
  // at `.02` claims a section a reader cannot find — invariant 5 about a
  // different kind of pointer.
  //
  // The ids and the visible ordinals are two separate spellings of the same
  // sequence, so both are read: `SectionHead` puts the ordinal in `.sec-id` and
  // the page puts the id on the `<section>`, and nothing but this connects them.
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll("main section[aria-labelledby]")].map((s) =>
      s.getAttribute("aria-labelledby"),
    ),
  );
  expect(ids).toEqual([...SECTIONS]);

  const ordinals = await page.locator("main .cs-section .sec-id").allInnerTexts();
  expect(ordinals).toEqual(["01", "02", "03"]);
});

test("each section is present exactly once and is named by its head", async ({ page }) => {
  for (const id of SECTIONS) {
    const section = page.locator(`section[aria-labelledby="${id}"]`);
    await expect(section).toHaveCount(1);

    // The name has to resolve to something. An aria-labelledby pointing at an
    // element that never got its id is a region with no name at all, and it
    // fails silently in every browser.
    const title = page.locator(`#${id}`);
    await expect(title).toHaveCount(1);
    await expect(title).not.toBeEmpty();
  }
});

test("the compose block is the generated excerpt, line for line", async ({ page }) => {
  // THE POINT OF THE WHOLE SECTION, and after U6 the only thing in it. `make gen`
  // cuts this out of compose.yaml and `make check-contract` compares its checksum
  // either side of a run; what this adds is the other half — that what the file
  // says is also what the page shows. A component that dropped, reordered or
  // re-indented a line would pass every check in the Makefile and fail here.
  //
  // It is also why the block survived the cut. ADR 0081's criterion is that a
  // system produces it or a check holds it, and this is both.
  const text = await page.locator(".compose").innerText();
  const rendered = text.replace(/\r/gu, "").replace(/\n$/u, "").split("\n");
  expect(rendered).toEqual(excerpt.lines);
});

test("the compose block has the content column to itself", async ({ page }) => {
  // `.cs-arch` STOOD HERE AND IS GONE. It was `1fr 420px` with the build phases
  // in the rail, and with the phases cut the rail would have been 420px of
  // nothing — the empty frame this phase was measured against. So the excerpt
  // takes the column, and this is the assertion that says so rather than a
  // comment claiming it.
  const [block, column] = await Promise.all([
    page.locator("section[aria-labelledby=\"sec-02\"] .compose").boundingBox(),
    page.locator("main.col").boundingBox(),
  ]);

  expect(block).not.toBeNull();
  expect(column).not.toBeNull();
  // Within a pixel of the column: the block carries its own border, and a
  // rounding either way is not the question. A 420px rail beside it would show
  // up here as roughly 480 missing.
  expect(Math.round(column?.width ?? 0) - Math.round(block?.width ?? 0)).toBeLessThanOrEqual(1);
});

test("the section says nothing the repository stopped believing", async ({ page }) => {
  // The sheet this section comes from draws a React Router front end, Postgres
  // 16, a Go container aggregating into SQLite, and "no metrics stack for one
  // host". All four are older than ADR 0005 and ADR 0007, and two of them are
  // English UI copy rather than annotation — quoting them would put a false
  // claim on a page whose whole argument is that it does not do that.
  const text = await page.locator('section[aria-labelledby="sec-02"]').innerText();
  for (const stale of ["React Router", "PostgreSQL 16", "SQLite", "metrics stack", "wget", "env_file"]) {
    expect(text).not.toContain(stale);
  }
});

test("this half of the page is still nothing to operate", async ({ page }) => {
  // The section adds no client component and no control, and the bundle
  // measurement says the same thing from the other side. A tab stop appearing
  // here would mean something became interactive without anyone deciding it —
  // which is the shape of #256, an invisible dialog over every page that no test
  // had ever clicked. The grid's notches are anchors and they are in `.02`, a
  // section this assertion does not reach.
  const focusable = page.locator(
    'section[aria-labelledby="sec-02"] a, section[aria-labelledby="sec-02"] button, ' +
      'section[aria-labelledby="sec-02"] [tabindex]',
  );
  await expect(focusable).toHaveCount(0);
});
