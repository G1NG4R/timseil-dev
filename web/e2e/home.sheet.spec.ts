/**
 * The homepage against what the design handoff draws.
 *
 * The runner and the argument are in e2e/sheet.ts; the oracle is
 * `e2e/oracle/home.gen.json`, written by `tools/gen-sheet-oracle.mjs` out of
 * the read-only sheet and checked for drift by `make check-contract`.
 *
 * TWO WIDTHS, NOT THREE. The case study has a third drawing at 1024, in the
 * frame that annotates its single-column rebuild. This page has none, and the
 * same sheet says why in the same breath: "DIE STARTSEITE FEHLT ABSICHTLICH:
 * ihr Umbau ist der einfachste von allen — Terminal unter den Hero-Text,
 * Reihenfolge bleibt." Five of the seven checked widths therefore have no
 * drawing here, and home.sweep.spec.ts asks the other question about them.
 */
import generated from "./oracle/home.gen.json";
import { runSheetOracle, type Oracle } from "./sheet";
import { HOME_REGIONS, settled } from "./streaming";
import { HOME, HOME_DRAWN_WIDTHS } from "./widths";

runSheetOracle({
  oracle: generated as unknown as Oracle,
  route: HOME,
  ready: (page) => settled(page, HOME_REGIONS),
  drawnWidths: HOME_DRAWN_WIDTHS,
  // 21 in H3, 30 in H4, 40 in H5a, 53 in H5b, 66 in H5c. It moves up with each
  // phase that adds measurements to this page, and never down without someone
  // saying why.
  //
  // FIVE OF THE EIGHT H4 ADDED ARE MEASURED ON ANOTHER ROUTE, AND ALL TEN OF
  // H5a's ARE, AND SO ARE ALL THIRTEEN OF H5b's. The oracle carries an `on`
  // field for that, and e2e/sheet.ts explains it: without an api SYS.01 is an
  // outage panel here and SYS.02 is a second one, so neither the module grid nor
  // a single system row is in the document, and an entry pointed at `/` would
  // assert against nothing. SYS.03 makes it two panels of its own, because it
  // reads two endpoints. That is H2b's finding, one page over.
  //
  // AND NONE OF H5c's THIRTEEN DOES, WHICH BREAKS THAT RUN. SYS.04 reads
  // content/posts out of the repository and the rig has the repository, so its
  // rows and the foot under them are in the document on `/`. The share of this
  // oracle that has to stand in the gallery grows with every section that
  // connects to the API — and shrinks with the one that does not.
  minimumEntries: 66,
});
