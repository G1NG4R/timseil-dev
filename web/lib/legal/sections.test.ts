// What this file is for: the order of a privacy page is not decoration. It
// answers "who is answerable", then "what is taken", then "what is yours", then
// "what you can do" — and a reader who gets the rights section before the
// collection sections has been handed a policy that would rather be skimmed.
//
// Held against a SECOND transcription of the sheet, the device
// lib/about/sections.test.ts and lib/gallery/registry.test.ts already use: the
// next person to reorder this page has to disagree with the sheet in writing.

import assert from "node:assert/strict";
import test from "node:test";

import { en } from "../i18n/messages/en.ts";
import { anchorFor, SECTIONS, sectionNumber } from "./sections.ts";

/** Transcribed from `docs/design/Legal - timseil.dev.dc.html`, lines 195, 198,
 *  211, 215, 225, 233 and 247 — the seven `07.NN` heads of artboard 1b. */
const LEGAL_SHEET = [
  ["07.01", "Who is responsible"],
  ["07.02", "Server logs"],
  ["07.03", "Visitor counting"],
  ["07.04", "What is stored on your device"],
  ["07.05", "What never leaves this server"],
  ["07.06", "Form and mail"],
  ["07.07", "Your rights"],
];

void test("the markers are the sheet's, name for name and in its order", () => {
  assert.deepEqual(
    SECTIONS.map((section) => [section.id, section.title]),
    LEGAL_SHEET,
  );
});

// THE SECTION THAT LOST ITS SUBJECT KEEPS ITS NUMBER. 07.03 asks about visitor
// counting and the honest answer is that nothing counts them; deleting it would
// renumber the four below and leave a gap where a reader looks for exactly that
// answer. If it is ever dropped, this test says so before the page does.
void test("the numbers ascend, without a gap and without a repeat", () => {
  const numbers = SECTIONS.map((section) => sectionNumber(section.id));
  assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7]);
});

void test("a marker that is not this page's parses to null", () => {
  // The page's own id, the imprint's form, and three near misses. `07.00` is
  // not a section either — answering `0` for it would let a row in above the
  // first one without anybody writing one.
  assert.equal(sectionNumber("SYS.07"), null);
  assert.equal(sectionNumber("06.01"), null);
  assert.equal(sectionNumber("07.00"), null);
  assert.equal(sectionNumber("07.1"), null);
  assert.equal(sectionNumber("07.010"), null);
});

// THE PAIR, AND WHY IT IS A TEST RATHER THAN A TYPE. `reasonKey` and `owedBy`
// are independently nullable, so the compiler is happy with a section that is
// both filled and owed, or with one that is neither.
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

// AND ON THIS PAGE THE ANSWER IS ALWAYS "FILLED". A legal text with a `[SOON]`
// in it is not a legal text: a reader cannot be told that the section about
// what is stored on their device arrives in a later phase. Every other page on
// this site is allowed to owe something; this one is not, and that is worth a
// test rather than a comment.
void test("no section of this page is owed to a later phase", () => {
  const owed = SECTIONS.filter((section) => section.owedBy !== null);
  assert.deepEqual(owed, []);
});

void test("every reason a section names exists in the dictionary", () => {
  // Vacuous today by the test above, and kept because the day it stops being
  // vacuous is the day a key that resolves to `undefined` would render an empty
  // panel into a legal document.
  for (const section of SECTIONS) {
    if (section.reasonKey === null) continue;
    assert.equal(typeof en[section.reasonKey], "string", `${section.id}: ${section.reasonKey}`);
    assert.notEqual(en[section.reasonKey].length, 0);
  }
});

void test("no title and no rail label carries a bracket the sheet drew", () => {
  // The sheet leaves seven brackets in this page's prose — address, mail
  // provider and the rest — and none of them belongs in a heading or in the
  // jump rail. `[ANALYTICS TOOL]` is the one this would have caught.
  for (const section of SECTIONS) {
    for (const text of [section.title, section.railLabel]) {
      assert.equal(/[[\]]/.test(text), false, `${section.id}: ${text}`);
    }
  }
});

void test("the rail label is never longer than the title it stands in for", () => {
  // The rail exists because "What is stored on your device" does not fit a
  // 380px column beside a 44px number. A label longer than its own title means
  // somebody pasted the title in and the column is back to wrapping.
  for (const section of SECTIONS) {
    assert.ok(
      section.railLabel.length <= section.title.length,
      `${section.id}: rail label "${section.railLabel}" is longer than "${section.title}"`,
    );
  }
});

void test("each section has its own anchor, and the anchor is url-safe", () => {
  const anchors = SECTIONS.map((section) => anchorFor(section.id));
  assert.equal(new Set(anchors).size, anchors.length);
  for (const anchor of anchors) {
    // A dot in a fragment is legal and is a class selector in every query the
    // e2e specs write. Keeping them out is cheaper than escaping them.
    assert.match(anchor, /^[a-z0-9-]+$/);
  }
});
