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

import { en } from "../i18n/messages/en.ts";
import { SECTIONS, subMarkerNumber } from "./sections.ts";

/** Transcribed from `docs/design/About - timseil.dev.dc.html`, lines 107, 174,
 *  210 and 235 — the four `SYS.05.NN` heads of the desktop artboard. */
const ABOUT_SHEET = [
  ["SYS.05.01", "TRAJECTORY"],
  ["SYS.05.02", "WHAT I RUN"],
  ["SYS.05.03", "HOW I WORK"],
  ["SYS.05.04", "OFF-SYSTEM"],
];

void test("the markers are the sheet's, name for name and in its order", () => {
  assert.deepEqual(
    SECTIONS.map((section) => [section.id, section.title]),
    ABOUT_SHEET,
  );
});

void test("the numbers ascend, without a gap and without a repeat", () => {
  const numbers = SECTIONS.map((section) => subMarkerNumber(section.id));
  assert.deepEqual(numbers, [1, 2, 3, 4]);
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
// page's four sections are shells on the day it ships, so the pair is load
// bearing here from the first commit rather than from a later phase.
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

void test("every reason a section names exists in the dictionary", () => {
  // A key that does not resolve renders `undefined` into an empty panel, which
  // is the one thing worse than an empty panel.
  for (const section of SECTIONS) {
    if (section.reasonKey === null) continue;
    assert.equal(typeof en[section.reasonKey], "string", `${section.id}: ${section.reasonKey}`);
    assert.notEqual(en[section.reasonKey].length, 0);
  }
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
