/**
 * The 404 against what the design handoff draws.
 *
 * The runner and the argument are in e2e/sheet.ts; the oracle is
 * `e2e/oracle/notfound.gen.json`, written by `tools/gen-sheet-oracle.mjs` out
 * of the read-only sheet and checked for drift by `make check-contract`.
 *
 * TWO WIDTHS, and the Intermediate Widths sheet names this page in the list of
 * the ones with nothing to decide at 1024. e2e/widths.ts holds the long version,
 * including the half of that sentence which is not a reading of this drawing.
 *
 * IT IS THE ONLY PAGE HERE WITH A `ready` THAT IS NOT ABOUT AN ENDPOINT. The
 * three that wait — `/`, `/work`, the case study — wait because an api answer
 * arrives late. This page asks no endpoint; it suspends because `headers()` is
 * runtime data and reading it in the body of a prerendered route is a build
 * error under `cacheComponents`. The swap is the same swap either way, and a
 * measurement taken during it sees two of everything.
 */
import generated from "./oracle/notfound.gen.json";
import { runSheetOracle, type Oracle } from "./sheet";
import { NOT_FOUND_REGIONS, settled } from "./streaming";
import { NOT_FOUND, NOT_FOUND_DRAWN_WIDTHS } from "./widths";

runSheetOracle({
  oracle: generated as unknown as Oracle,
  route: NOT_FOUND,
  ready: (page) => settled(page, NOT_FOUND_REGIONS),
  drawnWidths: NOT_FOUND_DRAWN_WIDTHS,
  // 27 in H10b, the phase that wrote this file. Nineteen at 1440 and eight at
  // 390. It moves up with each phase that adds measurements to this page, and
  // never down without someone saying why.
  //
  // TWO THINGS THE SHEET DRAWS ARE ABSENT RATHER THAN EXCUSED, and the map says
  // so at length: the chrome, which this route cannot render at all, and the
  // inside of SYS.404.01, which H11 builds after launch. A `diverges` block
  // means "we drew it differently"; neither of those is drawn here.
  minimumEntries: 27,
});
