// What this file is for: HOME.01 is the one thing the build plan calls binding
// about this page, and the sheet states the whole test in a sentence — "die
// vier Marker müssen auf der Seite in aufsteigender Reihenfolge stehen."
//
// A test that only asked whether all four markers are PRESENT would pass on
// `02 · 01 · 03 · 04`, and that is not a hypothetical: K-26 is that exact
// mistake, already made once, by a copy of this page. So the order is asserted
// as an order, and against a list transcribed a second time rather than against
// the one the page reads.

import assert from "node:assert/strict";
import test from "node:test";

import { NAV } from "../chrome.ts";
import { en } from "../i18n/messages/en.ts";
import { SECTIONS, markerNumber } from "./sections.ts";

/**
 * HOME.01, transcribed from the sheet a second time and on purpose.
 *
 * The same device registry.test.ts uses on the component inventory: holding
 * SECTIONS against a list means the next person to reorder the page has to
 * disagree with the sheet in writing, rather than with a number they could
 * assume was a detail.
 *
 * The sheet's own reason for this order, which is why it is worth defending:
 * "BELEG VOR BEHAUPTUNG: der Log steht vor der Systemliste. Genau diese Folge
 * ist das Argument der Seite; dreht man sie um, wird aus Nachweis wieder
 * Selbstbeschreibung."
 */
const HOME_01 = [
  ["SYS.01", "TRAINING LOG"],
  ["SYS.02", "SELECTED WORK"],
  ["SYS.03", "UPLINK"],
  ["SYS.04", "LOG"],
];

void test("the markers are HOME.01's, name for name and in its order", () => {
  assert.deepEqual(
    SECTIONS.map((section) => [section.id, section.title]),
    HOME_01,
  );
});

void test("the numbers ascend, without a gap and without a repeat", () => {
  const numbers = SECTIONS.map((section) => markerNumber(section.id));

  // Not `.every(n => n !== null)`: a marker that does not parse has to name
  // itself, or the failure reads as "the order is wrong" when the defect is
  // that somebody wrote SYS.4.
  for (const section of SECTIONS) {
    assert.notEqual(markerNumber(section.id), null, `${section.id} is not a SYS.NN marker`);
  }

  assert.deepEqual(
    numbers,
    numbers.map((_, index) => index + 1),
    "the sheet's rule is that the number IS the order",
  );
});

void test("every section that is still empty says why, and the sentence exists", () => {
  for (const section of SECTIONS) {
    if (section.reasonKey === null) continue;
    const sentence = en[section.reasonKey];
    assert.equal(typeof sentence, "string", `${section.id} has no reason`);
    // A present-but-empty string is the same defect as a missing one, and
    // messages.ts already counts it as missing for a whole language. STATE.05:
    // a dead state without a reason is a bug.
    assert.ok(sentence.length > 0, `${section.id} has an empty reason`);
  }
});

// Not decoration: the emptiness has to have an end, and the end has to be a
// phase somebody can look up. A shell owed by H4 would be one this phase was
// supposed to fill and did not.
void test("every shell names a later phase that fills it", () => {
  for (const section of SECTIONS) {
    if (section.owedBy === null) continue;
    assert.match(section.owedBy, /^H\d+$/, `${section.id} owes itself to nothing`);
    assert.notEqual(section.owedBy, "H4", `${section.id} is owed by the phase that built it`);
  }
});

// THE PAIR, AND WHY IT IS A TEST RATHER THAN A TYPE. `reasonKey` and `owedBy`
// are independently nullable, so the compiler is happy with a section that is
// both filled and owed, or with one that is neither — and both of those are the
// same defect the gallery registry names for components: a row nobody answers
// for. H4 is the phase that made the pair possible, so it is the phase that
// closes it.
void test("a section is either filled or owed, never both and never neither", () => {
  for (const section of SECTIONS) {
    const filled = section.owedBy === null;
    assert.equal(
      section.reasonKey === null,
      filled,
      `${section.id} says one thing with owedBy and another with reasonKey`,
    );
  }
});

// The counterpart to the sheet's order test, and the reason it is written as a
// list rather than a count: it names the sections that are built, so the diff
// that builds one is the diff that has to prove it. H5b is the third such diff
// and H5c will be the last — after it the list is all four and this test has
// nothing left to say, which is when it goes.
void test("SYS.01, SYS.02 and SYS.03 are the sections built so far", () => {
  assert.deepEqual(
    SECTIONS.filter((section) => section.owedBy === null).map((section) => section.id),
    ["SYS.01", "SYS.02", "SYS.03"],
  );
});

void test("markerNumber refuses what is not a marker", () => {
  // The reason the parser exists rather than an index lookup: it has to be able
  // to say no. `SYS.4` and `SYS.001` are the two shapes a hand-written marker
  // takes when the convention is not enforced.
  for (const bad of ["SYS.4", "SYS.001", "SYS.", "sys.01", "HERO", "01", ""]) {
    assert.equal(markerNumber(bad), null, `${bad} was read as a marker`);
  }
  assert.equal(markerNumber("SYS.01"), 1);
  assert.equal(markerNumber("SYS.12"), 12);
});

// A way back that points nowhere is worse than no way back: the reader leaves
// the empty panel and lands on a 404, which is the one thing invariant 5 exists
// to prevent one table over. NAV is transcribed from the Chrome sheet, so this
// holds the shells against the navigation rather than against itself.
void test("every way back is a route the navigation knows", () => {
  // Widened on purpose. NAV's hrefs are a literal union, and a Set of that type
  // would turn a wrong path into a COMPILE error — which sounds stricter and is
  // weaker: the point of this test is to catch a path somebody typed, and a
  // typo is a string before it is a type.
  const routes = new Set<string>(NAV.map((entry) => entry.href));

  for (const section of SECTIONS) {
    if (section.exit === null) continue;
    assert.ok(
      routes.has(section.exit.path),
      `${section.id} sends a reader to ${section.exit.path}, which is not a nav route`,
    );
    assert.ok(en[section.exit.labelKey].length > 0, `${section.id}'s way back has no label`);
  }
});

// Not every shell has one, and that is the assertion rather than an omission:
// a test that only checked the two exits it expects would pass on a page where
// somebody had quietly given the training log a destination it does not have.
void test("only the two sections with somewhere to go carry a way back", () => {
  assert.deepEqual(
    SECTIONS.filter((section) => section.exit !== null).map((section) => section.id),
    ["SYS.02", "SYS.04"],
  );
});
