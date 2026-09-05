/**
 * `/blog` against what the design handoff draws.
 *
 * The runner and the argument are in e2e/sheet.ts; the oracle is
 * `e2e/oracle/blog-index.gen.json`, written by `tools/gen-sheet-oracle.mjs` out
 * of the read-only sheets and checked for drift by `make check-contract`.
 *
 * TWO WIDTHS, and the Intermediate Widths sheet names this page in the sentence
 * that declines a third: "Fliesstext, Blog, About, Contact und Legal fliessen,
 * dort ist nichts zu entscheiden." The one fixed geometry here — the five-track
 * entry row — is drawn at 1440 and stacked below 1080, which is the switch the
 * entry page already uses rather than a frame the sheet owes.
 *
 * NO `ready`. This page reads no endpoint at all: the entries are files in the
 * image, so the rig sees the same rows a visitor does and there is nothing
 * streamed to wait for. Third page in a row with that property.
 *
 * SEVEN OF THE TWENTY-TWO DIVERGE, and four of the classes are new. Two are the
 * sheet contradicting itself — `search-is-not-only-titles`, where the
 * placeholder and the script disagree about what is searched — and
 * `chips-are-the-corpus`, where the artboard draws eight chips over ten
 * invented entries and the written twenty-three carry thirty-two tags. The
 * third, `no-pagination`, is an element that is drawn and not built.
 *
 * THE `min-height:44px` THE 390 ARTBOARD PUTS ON EVERY CHIP IS NOT HERE, and it
 * is not an omission. CLAUDE.md hangs that rule on `pointer: coarse` rather than
 * on the width, which is why `touch-targets.coarse.spec.ts` exists and measures
 * it rather than grepping for it — the method K-27 arrived at after a grep
 * missed seventeen chips. `/blog` is in `ROUTES`, so it is swept there.
 *
 * WHAT IS ABSENT FROM THE ORACLE, and each for a reason rather than an
 * oversight: the pagination row, the series marker (no series and no key for
 * one, ADR 0070 §5) and the year filter — the empty-state artboard echoes
 * `JAHR: 2025 ×` and no control on the page can set it, because the sheet's own
 * script holds `tag` and `q` and nothing else. An entry for an element that
 * does not exist would be a red test standing in for a decision.
 */
import generated from "./oracle/blog-index.gen.json";
import { runSheetOracle, type Oracle } from "./sheet";
import { BLOG, BLOG_INDEX_DRAWN_WIDTHS } from "./widths";

runSheetOracle({
  oracle: generated as unknown as Oracle,
  route: BLOG,
  drawnWidths: BLOG_INDEX_DRAWN_WIDTHS,
  // 22, and none of them carries an `on:` — every row of this list is on the
  // page the rig can open.
  minimumEntries: 22,
});
