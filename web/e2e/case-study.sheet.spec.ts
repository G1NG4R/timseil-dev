/**
 * The case study against what the design handoff draws.
 *
 * The oracle is `e2e/oracle/case-study.gen.json`, written by
 * `tools/gen-sheet-oracle.mjs` out of the read-only sheets and checked for
 * drift by `make check-contract`. The runner is `e2e/sheet.ts`, which carries
 * the argument for why the sheets are parsed rather than rendered and why a
 * divergence is a result rather than an excuse.
 *
 * THREE WIDTHS, NOT TWO, and finding the third was this file's first result.
 * `case-study.spec.ts` says in its header that "five of the seven widths have
 * no drawing to be compared against" — one artboard short. `Case Study Template`
 * draws 1440 and 390; `Intermediate Widths` draws the case study a third time
 * at 1024, in the frame that annotates the single-column rebuild. Four widths
 * have no drawing: 1081, 1079, 899, 719, and `layout.sweep.spec.ts` covers them
 * with a different question.
 */
import { expect } from "@playwright/test";

// Imported rather than read off disk: `resolveJsonModule` is on, Playwright
// transpiles this file to CommonJS where `import.meta` does not exist, and an
// import gives the oracle a compile-time shape as a side effect — a generator
// that started emitting a different document would be a type error rather than
// a run that quietly asserted nothing.
import generated from "./oracle/case-study.gen.json";
import { runSheetOracle, type Oracle } from "./sheet";
import { CASE_STUDY, DRAWN_WIDTHS } from "./widths";

runSheetOracle({
  oracle: generated as unknown as Oracle,
  route: CASE_STUDY,
  // The streaming swap leaves both the fallback and its replacement in the
  // document for a moment; every locator would see two of everything.
  ready: async (page) => {
    await expect(page.locator(".cs-crumb")).toHaveCount(1);
  },
  drawnWidths: DRAWN_WIDTHS,
  // 26 after H1b, 39 after H2a. The floor moves up with each phase that adds
  // measurements; it never moves down without someone saying why.
  minimumEntries: 39,
});
