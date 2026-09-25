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

/**
 * The four measurements of blocks `/about` stopped drawing in U4, in two
 * groups, because the difference is the whole of what a reader needs.
 *
 * OWED BACK: the closing strip. `.run-note` said "The page you are reading is
 * served by that stack" and `.run-note-exit` linked to the case study. After U4
 * the tiles above it name talos-prod, which does not serve this page and has no
 * case study — so the strip is wrong rather than merely redundant. U9 draws it
 * again after the cutover, and these three measurements come back with it.
 *
 * NOT OWED: `.run-detail`, the sentence under a tile title. A tile names what
 * runs and stops (ADR 0079 rules out saying how the cluster is wired, and there
 * is nothing measured to say instead), so this one is not waiting for a phase.
 * It stays in the oracle because the sheet still draws it and this file does not
 * edit sheets — but nothing is going to bring it back.
 *
 * THE ORACLE IS NOT TOUCHED AND `minimumEntries` DOES NOT MOVE. That is the
 * rule e2e/sheet.ts states for this filter and the reason U2 could use it for
 * the ten `home-log-*` entries: a shrinking oracle stays a failure.
 */
const NOT_DRAWN_TODAY = new Set([
  "about-run-note-padding",
  "about-run-note-size",
  "about-run-exit-size",
]);
const NOT_DRAWN_EVER = new Set(["about-run-detail-size"]);

runSheetOracle({
  oracle: generated as unknown as Oracle,
  route: ABOUT,
  drawnWidths: ABOUT_DRAWN_WIDTHS,
  applies: (entry) => !NOT_DRAWN_TODAY.has(entry.id) && !NOT_DRAWN_EVER.has(entry.id),
  // STILL 61 AFTER U4, WHICH REMOVED A SECTION AND FOUR TILES. The oracle
  // counts what the sheet draws, not what the page builds; `applies` above is
  // what moved. Lowering this number would be the one way to make a lost
  // transcription look like a clean run.
  //
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
