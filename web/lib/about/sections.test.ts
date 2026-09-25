// What this file is for: `/about` is one system with four sub-sections, and the
// order is the argument. The hero says what I do, TRAJECTORY says how I got
// here, WHAT I RUN is the evidence for both, HOW I WORK is what the evidence is
// supposed to demonstrate, and OFF-SYSTEM is the one line that is not about any
// of it. Reordered, the page argues in the wrong direction — which is the same
// defect HOME.01 names on the homepage and K-26 records as already having
// happened once.
//
// Held against a SECOND transcription of the sheet, the device sections.test.ts
// and registry.test.ts already use: the next person to reorder the page has to
// disagree with the sheet in writing.

import assert from "node:assert/strict";
import test from "node:test";

import { type Section, SECTIONS, accountedFor, subMarkerNumber } from "./sections.ts";

/** Transcribed from `docs/design/About - timseil.dev.dc.html`, lines 107, 174,
 *  210 and 235 — the four `SYS.05.NN` heads of the desktop artboard.
 *
 *  STILL FOUR AFTER U4 DROPPED ONE. The sheet is read-only and it draws what it
 *  draws; a transcription edited to match the build would stop being a
 *  transcription and start being a second copy of `SECTIONS`, which is the one
 *  thing this file exists not to be. */
const ABOUT_SHEET = [
  ["SYS.05.01", "TRAJECTORY"],
  ["SYS.05.02", "WHAT I RUN"],
  ["SYS.05.03", "HOW I WORK"],
  ["SYS.05.04", "OFF-SYSTEM"],
];

/**
 * What the build takes off the sheet, and why — the disagreement in writing.
 *
 * ADR 0079 removes `OFF-SYSTEM`: the one human line on this site is Tim's to
 * write, and a section standing empty until he does is a promise the page keeps
 * making to every visitor. H7a shipped it as a shell owed by K2; U4 stops owing
 * it. Deviating from `docs/design/` is expected in stage U, and the rule for
 * the whole stage is that the deviation is argued where a reader will meet it.
 *
 * A LIST AND NOT A SHORTER `ABOUT_SHEET`, because the two say different things:
 * one is what the drawing contains, the other is what this build decided about
 * it. Merging them would let the next removal happen silently.
 */
const DROPPED = [["SYS.05.04", "OFF-SYSTEM"]];

void test("the markers are the sheet's, name for name and in its order", () => {
  const shipped = SECTIONS.map((section) => [section.id, section.title]);
  // Every head of the sheet is accounted for: drawn, or dropped on the record.
  // A fifth marker that quietly disappeared would be in neither list.
  assert.deepEqual(
    [...shipped, ...DROPPED].sort((a, b) => a[0].localeCompare(b[0])),
    ABOUT_SHEET,
  );
  // AND IN THE SHEET'S ORDER, not merely drawn from its set. Dropping the
  // fourth head must not license 02 · 01 · 03, which is K-26 — "eine Kopie
  // geriet in die Reihenfolge 02 · 01 · 03 · 04" — and the reason this file
  // holds the page against a second transcription at all.
  const order = ABOUT_SHEET.map(([id]) => id);
  const positions = shipped.map(([id]) => order.indexOf(id));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
    "the page reorders the sheet",
  );
  assert.equal(positions.includes(-1), false, "a marker the sheet never drew");
});

void test("the record of what was dropped is a record and not a blank cheque", () => {
  // A sheet with everything struck off it has stopped being an oracle, and an
  // empty list would mean this device had quietly turned itself off.
  assert.notEqual(DROPPED.length, 0);
  assert.ok(DROPPED.length < ABOUT_SHEET.length, "nothing of the sheet is left");
});

void test("the numbers ascend, without a gap and without a repeat", () => {
  // THREE SINCE U4, AND NO HOLE: what was removed was the LAST head. Take one
  // out of the middle and this goes red, which is what it is for — the numbers
  // the sheet prints are the order the page argues in.
  const numbers = SECTIONS.map((section) => subMarkerNumber(section.id));
  assert.deepEqual(numbers, [1, 2, 3]);
});

void test("a marker that is not this page's parses to null", () => {
  // The page's own id, the homepage's form, and two near misses. `SYS.05` is
  // the system rather than a section, and answering `5` for it would let a
  // fifth entry into the order without anybody writing one.
  assert.equal(subMarkerNumber("SYS.05"), null);
  assert.equal(subMarkerNumber("SYS.01"), null);
  assert.equal(subMarkerNumber("SYS.05.1"), null);
  assert.equal(subMarkerNumber("sys.05.01"), null);
});

// THE PAIR, AND WHY IT IS A TEST RATHER THAN A TYPE. `reasonKey` and `owedBy`
// are independently nullable, so the compiler is happy with a section that is
// both filled and owed, or with one that is neither — the same defect the
// gallery registry names for components: a row nobody answers for. Two of this
// page's four sections were shells on the day it shipped, so the pair was load
// bearing here from the first commit.
//
// AND SINCE U4 IT BUILDS ITS OWN BROKEN CASE. No section is a shell any more,
// so a test that only walked the shipped list would be asking a question three
// rows in a row answer the same way — true today, and no longer able to tell
// anybody why. `accountedFor` moved into sections.ts so it can be asked of a
// row that does not ship.
void test("a section is either filled or owed, never both and never neither", () => {
  for (const section of SECTIONS) {
    assert.equal(
      accountedFor(section),
      true,
      `${section.id} says one thing with owedBy and another with reasonKey`,
    );
  }
});

void test("both halves of the pair are refused, and neither is refused too", () => {
  const base = { id: "SYS.05.09", title: "TEST", meta: null } as const;
  const owedAndFilled: Section = { ...base, reasonKey: "aboutHeadline", owedBy: null };
  const neither: Section = { ...base, reasonKey: null, owedBy: "K2" };
  const shell: Section = { ...base, reasonKey: "aboutHeadline", owedBy: "K2" };
  const built: Section = { ...base, reasonKey: null, owedBy: null };
  assert.equal(accountedFor(owedAndFilled), false, "a reason with nobody owing it");
  assert.equal(accountedFor(neither), false, "a debt with no reason given");
  assert.equal(accountedFor(shell), true);
  assert.equal(accountedFor(built), true);
});

// WHAT STOOD HERE UNTIL U4: "every reason a section names exists in the
// dictionary", walking `SECTIONS` and skipping any with `reasonKey === null`.
// With `OFF-SYSTEM` gone the body ran zero times and reported green — the
// vacuous form ADR 0057 names, and the one U3 caught one stage earlier when a
// training-log assertion started holding nought against nought.
//
// The fact it guarded is asserted straight instead, the way lib/home/
// sections.test.ts did when the homepage stopped having shells. A section that
// names a key nobody wrote would render `undefined` into an empty panel, which
// is worse than an empty panel — and the way that gets reintroduced is by
// adding a shell, so the assertion is that there is not one.
void test("no section on /about is owed any more", () => {
  assert.deepEqual(
    SECTIONS.filter((section) => section.owedBy !== null).map((section) => section.id),
    [],
  );
  assert.deepEqual(
    SECTIONS.filter((section) => section.reasonKey !== null).map((section) => section.id),
    [],
  );
});

void test("no section meta carries a bracket the sheet drew", () => {
  // `ONE VPS · [SPEC] · ADMINISTERED BY ME` is the line this guards. The
  // bracket wants the size of this host, and CLAUDE.md keeps the state of this
  // host off every outward surface.
  for (const section of SECTIONS) {
    if (section.meta === null) continue;
    assert.equal(/[[\]]/.test(section.meta), false, `${section.id}: ${section.meta}`);
  }
});
