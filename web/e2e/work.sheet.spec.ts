/**
 * The work index against what the design handoff draws.
 *
 * The runner and the argument are in e2e/sheet.ts; the oracle is
 * `e2e/oracle/work.gen.json`, written by `tools/gen-sheet-oracle.mjs` out of
 * the read-only sheets and checked for drift by `make check-contract`.
 *
 * THREE WIDTHS, like the case study and unlike the homepage. The Work Index
 * sheet draws 1440 and 390; the Intermediate Widths sheet adds a 1024 frame of
 * its own — "1024 · Work Index — Vorschauspalte weg, Name gewinnt 154px" — and
 * that is the frame that annotates the five-track rebuild, so it is where the
 * dropped preview column is held against a drawing rather than against
 * arithmetic.
 */
import generated from "./oracle/work.gen.json";
import { runSheetOracle, type Oracle } from "./sheet";
import { settled, WORK_REGIONS } from "./streaming";
import { WORK, WORK_DRAWN_WIDTHS } from "./widths";

runSheetOracle({
  oracle: generated as unknown as Oracle,
  route: WORK,
  ready: (page) => settled(page, WORK_REGIONS),
  drawnWidths: WORK_DRAWN_WIDTHS,
  // 25 in H6, and MORE THAN HALF OF THEM STAND IN THE GALLERY — thirteen of the
  // twenty-five carry `on: '/dev/components'`. That share is the highest of the
  // three pages with an oracle, and it is a fact about this page rather than
  // about the rig's mood: `/work` lists what an endpoint answers, and there is
  // no api here, so every measurement of a row has to be taken where a row
  // exists.
  //
  // H5c's thirteen additions carried none of these, because SYS.04 reads files
  // out of the repository. The share follows what a section is made of, and
  // this page is made entirely of the answer.
  minimumEntries: 25,
});
