/**
 * `/imprint` against what the design handoff draws.
 *
 * The runner and the argument are in e2e/sheet.ts; the oracle is
 * `e2e/oracle/imprint.gen.json`, written by `tools/gen-sheet-oracle.mjs` out of
 * the read-only sheet and checked for drift by `make check-contract`.
 *
 * THE SECOND MAP AGAINST ONE SHEET. `privacy.sheet.spec.ts` measures artboard
 * 1b; this measures 1a and the lower half of 1c. `runSheetOracle` takes one
 * route, and the two legal pages are two routes however much one sheet draws
 * them together.
 *
 * TWO WIDTHS, and the Intermediate Widths sheet names Legal in its list of the
 * pages with nothing to decide: "Fliesstext, Blog, About, Contact und Legal
 * fliessen." e2e/widths.ts holds the long version, including why the 390 frame
 * is a drawing of a section rather than of this page.
 *
 * NO `ready`. This page reads no endpoint, suspends on nothing and has no
 * client component anywhere beneath it — the third page on this site of which
 * the first two are true and the only one of which all three are. A measurement
 * here is taken on a document that was finished before it arrived.
 */
import generated from "./oracle/imprint.gen.json";
import { runSheetOracle, type Oracle } from "./sheet";
import { IMPRINT, IMPRINT_DRAWN_WIDTHS } from "./widths";

runSheetOracle({
  oracle: generated as unknown as Oracle,
  route: IMPRINT,
  drawnWidths: IMPRINT_DRAWN_WIDTHS,
  // 14 in H12c, the phase that wrote this file. Ten at 1440 and four at 390.
  // It moves up with each phase that adds measurements to this page, and never
  // down without someone saying why.
  //
  // WHAT THE SHEET DRAWS AND THIS MAP DOES NOT MEASURE is every word on the
  // page: whether the third-party claim is scoped, whether a duration appears
  // that no file enforces, whether a bracket survived a merge. Those are
  // lib/legal/imprint.test.ts and lib/legal/brackets.test.ts, and they are the
  // reason the page exists. This file measures the drawing.
  minimumEntries: 14,
});
