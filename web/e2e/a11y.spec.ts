/**
 * axe-core over every route that exists, at every checked width.
 *
 * Stage H asks for "axe-core grün" per phase; this file is the harness that
 * sentence needs, standing before H1 rather than being written thirteen times.
 * Today it sweeps seven routes; the list in `widths.ts` grows with the pages.
 *
 * WHAT AXE CANNOT DO, said here so nobody reads a green run as more than it is.
 * It finds a fraction of what a manual audit finds — M2 is the audit, with a
 * screen reader and a keyboard, and this does not replace it. What it does is
 * make the mechanical half impossible to regress silently across thirteen pages
 * that are built one after another.
 *
 * The width matters to it more than it looks: contrast is computed against what
 * is actually painted, and a layout that reflows can put text on a different
 * background. That is why this runs in every width project rather than one.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { CARRIED, TAGS, carriedRules } from "./axe";
import { ROUTES } from "./widths";

// The policy lives in e2e/axe.ts since H13, because error.spec.ts needs the
// same carried list and two copies of a date is one date nobody reads.

// The date is a real one and this is what makes it a clock rather than a
// comment. A carried rule whose date has passed fails the suite on its own,
// which is the only way "look at it again" ever happens.
test("no carried accessibility rule is past its date", () => {
  const overdue = CARRIED.filter((c) => new Date(c.until) < new Date());

  expect(
    overdue.map((c) => `${c.rule} (#${String(c.issue)}) was carried until ${c.until}`),
    "a carried rule outlived its date — decide it or move the date deliberately",
  ).toEqual([]);
});

/**
 * The site's routes, plus the workbench.
 *
 * H4 ADDED THE SECOND HALF AND THE REASON IS THE ONE H2b ALREADY PAID FOR.
 * SYS.01's twenty-two rows exist only where an api answered, and this rig runs
 * a production build with none — so on `/` axe sees an outage panel where the
 * training log should be, and every rule about a row it might have broken goes
 * unasked. The gallery renders those rows from data in the page, which makes it
 * the only place in this suite where axe can look at them at all.
 *
 * It is not part of the shipped site and does not need to be for this to be
 * worth doing: what is being checked is the COMPONENT, and the component is the
 * same one `/` renders when the api is up.
 */
const AXE_ROUTES = [...ROUTES, "/dev/components"];

for (const route of AXE_ROUTES) {
  test(`axe finds nothing on ${route}`, async ({ page }, testInfo) => {
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();

    const violations = results.violations.filter((v) => !carriedRules.has(v.id));

    // The failure message is the finding. A run that says "1 violation" and
    // makes somebody open a report is a run they will not open.
    const report = violations
      .map(
        (v) =>
          `    ${v.id} (${v.impact ?? "no impact stated"}) — ${v.help}\n` +
          v.nodes.map((n) => `        ${n.target.join(" ")}`).join("\n"),
      )
      .join("\n");

    // The FULL result is attached, carried rules included, so a run's artefact
    // is the whole truth even where the assertion is narrower than it.
    await testInfo.attach("axe.json", {
      body: JSON.stringify(results.violations, null, 2),
      contentType: "application/json",
    });

    expect(violations, `\n${report}\n`).toEqual([]);
  });
}
