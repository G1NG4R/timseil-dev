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
// Imported rather than read off disk: `resolveJsonModule` is on, Playwright
// transpiles this file to CommonJS where `import.meta` does not exist, and an
// import gives the oracle a compile-time shape as a side effect — a generator
// that started emitting a different document would be a type error rather than
// a run that quietly asserted nothing.
import generated from "./oracle/case-study.gen.json";
import { runSheetOracle, type Oracle } from "./sheet";
import { settled } from "./streaming";
import { CASE_STUDY, DRAWN_WIDTHS } from "./widths";

/**
 * The ids of the 14, spelled out rather than matched by prefix.
 *
 * IT WAS 22 FOR THREE HOURS. Eight of them measure `.01 PROBLEM` — the prose
 * rail and the constraints plate — and the addendum to ADR 0081 put that section
 * back, so they measure something again and were removed from this list rather
 * than left in it. A filter that silences an entry the page DOES draw is the
 * same defect as an oracle that shrank, one level down: both end as a run that
 * asserts less and says nothing about it.
 *
 * A PREFIX WOULD BE SHORTER AND WRONG HERE. `home-log-` names one section; these
 * span six, and three of them (`mobile-`, `tablet-`) share their prefix with
 * entries that DO still apply — `mobile-h1-size` and `tablet-spec-two-pairs`
 * measure the hero and the rail, which both survived. A `startsWith` that
 * silenced those would be the filter doing the damage the filter exists to
 * avoid.
 *
 * AND IT STANDS BEFORE THE CALL, NOT AFTER IT. `runSheetOracle` invokes `applies`
 * on its first line — `oracle.entries.filter(applies)` — so a `const` declared
 * below the call is still in its temporal dead zone when the closure reads it,
 * and the whole file fails to collect with a ReferenceError rather than one test
 * going red. `home.sheet.spec.ts` never met this because `HAS_LOG` is imported.
 */
const CUT_IN_U6 = new Set([
  // `.02 ARCHITECTURE` — the request path, the side lanes, the decision table
  "arch-panel-padding",
  "arch-arrow-track",
  "arch-lanes-columns",
  "arch-lanes-gap",
  "decision-first-column",
  "mobile-path-scrolls",
  "mobile-lanes-columns",
  "mobile-decisions-stack",
  "mobile-decision-card-gap",
  // `.03 BUILD` — the phases, and the `.cs-arch` rail that held them. The compose
  // block stayed and `compose-size` with it.
  "build-rail-width",
  "build-gap",
  "phases-gap",
  // `.05 RESULT`
  "result-columns",
  "result-gap",
]);

runSheetOracle({
  oracle: generated as unknown as Oracle,
  route: CASE_STUDY,
  // WAS ONE REGION AND IS NOW ALL FIVE, which is the #279 family caught a
  // third time. This file waited on `.cs-crumb` alone, inline, while
  // streaming.ts has held every region since that fix — the five boundaries
  // are independent, each spends its own two-second budget, and a settled
  // breadcrumb says nothing about the spec rail beside it. The rig runs with
  // no api at all, which is exactly the condition that widens the race.
  ready: settled,
  drawnWidths: DRAWN_WIDTHS,
  // 26 after H1b, 39 after H2a. The floor moves up with each phase that adds
  // measurements; it never moves down without someone saying why — and U6 is the
  // phase that had a reason to want it lower and did not take it.
  minimumEntries: 39,
  //
  // FOURTEEN OF THE FIFTY DESCRIBE BLOCKS THIS PAGE NO LONGER DRAWS. U6 cut the
  // request path, the side lanes, the decision table, the build phases and the
  // result section (ADR 0081), so every entry below would be measured against an
  // element that is absent by decision rather than by accident. The problem
  // section was cut with them and restored the same day; its eight entries are
  // not in this list.
  //
  // THE ORACLE IS NOT TOUCHED, which is the whole point of doing it here instead
  // of in the generator. It is written out of `docs/design/`, which is read-only
  // and still draws all five sections; `minimumEntries` still counts all 50, so a
  // shrinking oracle is still a failure; and the three drawn widths still carry
  // entries — so `drawnWidths` still holds. Striking them from
  // `tools/gen-sheet-oracle.mjs` would have meant dropping the floor below 39,
  // and a floor that falls is the shape in which a measurement disappears
  // without anyone noticing.
  //
  // SAME MECHANISM AS U2's `home-log-*`, and the day Tim writes a constraints
  // list they all come back without anybody raising a number.
  applies: (entry) => !CUT_IN_U6.has(entry.id),
});
