/**
 * `/blog/<slug>` against what the design handoff draws.
 *
 * The runner and the argument are in e2e/sheet.ts; the oracle is
 * `e2e/oracle/blog-post.gen.json`, written by `tools/gen-sheet-oracle.mjs` out
 * of the read-only sheets and checked for drift by `make check-contract`.
 *
 * TWO WIDTHS, like About and Contact, and the Intermediate Widths sheet names
 * this page first in the sentence that declines a third: "Fliesstext, Blog,
 * About, Contact und Legal fliessen, dort ist nichts zu entscheiden." The one
 * fixed column here — the 196px contents rail — is drawn at 1440 and gone below
 * 1080, which is a switch layout.css owns rather than a frame the sheet owes.
 *
 * NO `ready`. Like About and Contact, this page reads no endpoint. Unlike them
 * it reads twenty-one files that are in the image, so the rig sees the same
 * words a visitor does — there is no streamed region and nothing to wait for.
 *
 * THIRTEEN OF THE THIRTY-FOUR DIVERGE, and one class is new: `heading-scale`.
 * The sheet sets both the section headings and the pull quote at 21px, which is
 * not a step, and unlike `half-pixel` this one rounds UP — the next step down
 * is the size of the prose the heading opens, and a heading the size of its
 * paragraph is not a rounding but the loss of a level.
 *
 * WHAT IS ABSENT FROM THE ORACLE IS THE LONGEST LIST ANY PAGE HAS PRODUCED —
 * the POSTMORTEM box, the MEASURE table, the terminal capture, the SERIES
 * block, the COPY button, the progress bar and the two tones. None is built,
 * each for a reason in ADR 0070, and an entry for an element that does not
 * exist would be a red test standing in for a decision.
 */
import generated from "./oracle/blog-post.gen.json";
import { runSheetOracle, type Oracle } from "./sheet";
import { BLOG_POST, BLOG_POST_DRAWN_WIDTHS } from "./widths";

runSheetOracle({
  oracle: generated as unknown as Oracle,
  route: BLOG_POST,
  drawnWidths: BLOG_POST_DRAWN_WIDTHS,
  // 34, and none of them carries an `on:` — the third page in a row with that
  // property, and the first where it is a property of the CONTENT rather than
  // of the page: an entry is a file in the image, so there is nothing an api
  // could fail to answer.
  minimumEntries: 34,
});
