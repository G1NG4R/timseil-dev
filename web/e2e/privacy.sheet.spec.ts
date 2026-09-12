/**
 * `/privacy` against what the design handoff draws.
 *
 * The runner and the argument are in e2e/sheet.ts; the oracle is
 * `e2e/oracle/privacy.gen.json`, written by `tools/gen-sheet-oracle.mjs` out of
 * the read-only sheet and checked for drift by `make check-contract`.
 *
 * TWO WIDTHS, and the Intermediate Widths sheet names this page in the list of
 * the ones with nothing to decide: "Fliesstext, Blog, About, Contact und Legal
 * fliessen." e2e/widths.ts holds the long version.
 *
 * NO `ready`. This page reads no endpoint and suspends on nothing — the second
 * page on this site of which that is true, after the 404, and unlike the 404 it
 * does not touch `headers()` either. A measurement here is taken on a document
 * that was finished before it arrived.
 *
 * ONE ARTBOARD OF THE FOUR IS MEASURED HERE. 1a and the lower half of 1c are
 * `/imprint`, and since H12c `imprint.sheet.spec.ts` measures them against the
 * same sheet. That is the reason this file is `privacy.sheet.spec.ts` and not
 * `legal.sheet.spec.ts`: `runSheetOracle` takes one route, and the two legal
 * pages are two routes however much one sheet draws them together.
 */
import generated from "./oracle/privacy.gen.json";
import { runSheetOracle, type Oracle } from "./sheet";
import { PRIVACY, PRIVACY_DRAWN_WIDTHS } from "./widths";

runSheetOracle({
  oracle: generated as unknown as Oracle,
  route: PRIVACY,
  drawnWidths: PRIVACY_DRAWN_WIDTHS,
  // 13 in H12b, the phase that wrote this file. Eleven at 1440 and two at 390.
  // It moves up with each phase that adds measurements to this page, and never
  // down without someone saying why.
  //
  // WHAT THE SHEET DRAWS AND THIS MAP DOES NOT MEASURE is the readout's VALUES,
  // which are the page's whole argument and not one of them is a geometry.
  // legal.spec.ts holds the user-agent line against `navigator.userAgent` and
  // the request line against the Navigation Timing entry. That is a measurement
  // of the browser; this file measures the drawing.
  minimumEntries: 13,
});
