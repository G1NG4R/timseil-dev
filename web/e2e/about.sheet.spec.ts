/**
 * `/about` against what the design handoff draws.
 *
 * The runner and the argument are in e2e/sheet.ts; the oracle is
 * `e2e/oracle/about.gen.json`, written by `tools/gen-sheet-oracle.mjs` out of
 * the read-only sheets and checked for drift by `make check-contract`.
 *
 * TWO WIDTHS, like the homepage. The About sheet draws 1440 and 390, and the
 * Intermediate Widths sheet declines to add a third IN WRITING rather than by
 * omission: "Fliesstext, Blog, About, Contact und Legal fliessen, dort ist
 * nichts zu entscheiden." The 1024 frames exist for pages with a fixed column
 * to rebuild, and this page has none.
 *
 * AND NO `ready`. Every other page with an oracle hands the runner a function
 * that waits for its streamed regions to settle, because a measurement taken
 * against a fallback is a measurement of the fallback. This page reads no
 * endpoint at all — every word comes out of lib/about/ and lib/i18n/ — so there
 * is no region, no fallback and nothing to wait for. `load` is the whole
 * condition, and that is a property of the page rather than a shortcut.
 */
import generated from "./oracle/about.gen.json";
import { runSheetOracle, type Oracle } from "./sheet";
import { ABOUT, ABOUT_DRAWN_WIDTHS } from "./widths";

runSheetOracle({
  oracle: generated as unknown as Oracle,
  route: ABOUT,
  drawnWidths: ABOUT_DRAWN_WIDTHS,
  // 61 AFTER H7b, AND NOT ONE OF THEM CARRIES AN `on:`. That is the first time
  // since H3, and it is the same fact as the missing `ready` above: `/work` has
  // to take twenty-four of its thirty-six measurements in the gallery because
  // the rig has no api and no row stands on the page. Nothing on this page is
  // an answer, so the page in this rig is the page in production.
  //
  // H7b RAISED IT FROM 42 AND KEPT THE PROPERTY. The trajectory rail is the one
  // component this page has that a rig without an api could have hidden, and it
  // does not: it reads nothing either, so its nineteen measurements are taken
  // where a visitor meets it rather than in the gallery.
  minimumEntries: 61,
});
