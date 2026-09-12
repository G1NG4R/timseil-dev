// What this file is for: the order of a legal page is not decoration. `/privacy`
// answers "who is answerable", then "what is taken", then "what is yours", then
// "what you can do" — and a reader who gets the rights section before the
// collection sections has been handed a policy that would rather be skimmed.
// `/imprint` answers "who is answerable" first for the same reason and then
// stops being about a person at all.
//
// Held against a SECOND transcription of the sheet, the device
// lib/about/sections.test.ts and lib/gallery/registry.test.ts already use: the
// next person to reorder either page has to disagree with the sheet in writing.
//
// TWO PAGES SINCE H12c, AND MOST OF THE TESTS TAKE BOTH. What is shared is the
// shape — a filled section, a rail label that fits, an anchor that is a
// fragment — and a test that only ever asked it of `/privacy` would let the
// second page arrive with none of it true.

import assert from "node:assert/strict";
import test from "node:test";

import { en } from "../i18n/messages/en.ts";
import {
  anchorFor,
  IMPRINT_SECTIONS,
  type PageMarker,
  PRIVACY_SECTIONS,
  type Section,
  sectionNumber,
} from "./sections.ts";

/** Transcribed from `docs/design/Legal - timseil.dev.dc.html`, lines 195, 198,
 *  211, 215, 225, 233 and 247 — the seven `07.NN` heads of artboard 1b. */
const PRIVACY_SHEET = [
  ["07.01", "Who is responsible"],
  ["07.02", "Server logs"],
  ["07.03", "Visitor counting"],
  ["07.04", "What is stored on your device"],
  ["07.05", "What never leaves this server"],
  ["07.06", "Form and mail"],
  ["07.07", "Your rights"],
];

/** The same, from artboard 1a: lines 70, 82, 86 and 90 — the four `06.NN` heads
 *  of `/imprint`. */
const IMPRINT_SHEET = [
  ["06.01", "Operator and responsible party"],
  ["06.02", "Where it is hosted"],
  ["06.03", "Content and links"],
  ["06.04", "Reuse"],
];

/** The two pages, each with the marker its sections carry. */
const PAGES: [string, readonly Section[], PageMarker][] = [
  ["/privacy", PRIVACY_SECTIONS, "07"],
  ["/imprint", IMPRINT_SECTIONS, "06"],
];

void test("the markers are the sheet's, name for name and in its order", () => {
  assert.deepEqual(
    PRIVACY_SECTIONS.map((section) => [section.id, section.title]),
    PRIVACY_SHEET,
  );
  assert.deepEqual(
    IMPRINT_SECTIONS.map((section) => [section.id, section.title]),
    IMPRINT_SHEET,
  );
});

// THE SECTION THAT LOST ITS SUBJECT KEEPS ITS NUMBER. 07.03 asks about visitor
// counting and the honest answer is that nothing counts them; deleting it would
// renumber the four below and leave a gap where a reader looks for exactly that
// answer. If it is ever dropped, this test says so before the page does.
void test("the numbers ascend, without a gap and without a repeat", () => {
  for (const [route, sections, page] of PAGES) {
    const numbers = sections.map((section) => sectionNumber(section.id, page));
    assert.deepEqual(
      numbers,
      sections.map((_, index) => index + 1),
      route,
    );
  }
});

void test("a marker that is not that page's parses to null", () => {
  // The page's own id, the OTHER page's markers, and three near misses. `07.00`
  // is not a section either — answering `0` for it would let a row in above the
  // first one without anybody writing one.
  //
  // THE OTHER PAGE'S MARKERS ARE THE POINT OF THE `page` ARGUMENT. Before H12c
  // this function had `07` baked in, so `06.01` answered null by accident of
  // the imprint not existing. Now both are real, and "not one of THIS page's"
  // is a question that still has to have an answer.
  assert.equal(sectionNumber("SYS.07", "07"), null);
  assert.equal(sectionNumber("06.01", "07"), null);
  assert.equal(sectionNumber("07.01", "06"), null);
  assert.equal(sectionNumber("07.00", "07"), null);
  assert.equal(sectionNumber("07.1", "07"), null);
  assert.equal(sectionNumber("07.010", "07"), null);
});

// THE PAIR, AND WHY IT IS A TEST RATHER THAN A TYPE. `reasonKey` and `owedBy`
// are independently nullable, so the compiler is happy with a section that is
// both filled and owed, or with one that is neither.
void test("a section is either filled or owed, never both and never neither", () => {
  for (const [route, sections] of PAGES) {
    for (const section of sections) {
      const filled = section.owedBy === null;
      assert.equal(
        section.reasonKey === null,
        filled,
        `${route} ${section.id} says one thing with owedBy and another with reasonKey`,
      );
    }
  }
});

// AND ON THESE PAGES THE ANSWER IS ALWAYS "FILLED". A legal text with a `[SOON]`
// in it is not a legal text: a reader cannot be told that the section about what
// is stored on their device arrives in a later phase. Every other page on this
// site is allowed to owe something; these two are not, and that is worth a test
// rather than a comment.
void test("no section of either page is owed to a later phase", () => {
  for (const [route, sections] of PAGES) {
    const owed = sections.filter((section) => section.owedBy !== null);
    assert.deepEqual(owed, [], route);
  }
});

void test("every reason a section names exists in the dictionary", () => {
  // Vacuous today by the test above, and kept because the day it stops being
  // vacuous is the day a key that resolves to `undefined` would render an empty
  // panel into a legal document.
  for (const [, sections] of PAGES) {
    for (const section of sections) {
      if (section.reasonKey === null) continue;
      assert.equal(typeof en[section.reasonKey], "string", `${section.id}: ${section.reasonKey}`);
      assert.notEqual(en[section.reasonKey].length, 0);
    }
  }
});

void test("no title and no rail label carries a bracket the sheet drew", () => {
  // The sheet leaves brackets in both pages' prose — address, mail provider,
  // hosting company — and none of them belongs in a heading or in the jump
  // rail. `[ANALYTICS TOOL]` is the one this would have caught.
  for (const [route, sections] of PAGES) {
    for (const section of sections) {
      for (const text of [section.title, section.railLabel]) {
        assert.equal(/[[\]]/.test(text), false, `${route} ${section.id}: ${text}`);
      }
    }
  }
});

void test("the rail label is never longer than the title it stands in for", () => {
  // The rail exists because "What is stored on your device" does not fit a
  // 380px column beside a 44px number. A label longer than its own title means
  // somebody pasted the title in and the column is back to wrapping.
  for (const [route, sections] of PAGES) {
    for (const section of sections) {
      assert.ok(
        section.railLabel.length <= section.title.length,
        `${route} ${section.id}: rail label "${section.railLabel}" is longer than "${section.title}"`,
      );
    }
  }
});

void test("each section has its own anchor, and the anchor is url-safe", () => {
  for (const [route, sections] of PAGES) {
    const anchors = sections.map((section) => anchorFor(section.id));
    assert.equal(new Set(anchors).size, anchors.length, route);
    for (const anchor of anchors) {
      // A dot in a fragment is legal and is a class selector in every query the
      // e2e specs write. Keeping them out is cheaper than escaping them.
      assert.match(anchor, /^[a-z0-9-]+$/);
    }
  }
});

void test("the two pages never claim the same anchor", () => {
  // They are two documents at two addresses, so a collision would break
  // nothing — and it would mean one of them had taken the other's numbering,
  // which is the mistake that ends with a jump rail pointing into the wrong
  // page's section. The markers are the sheet's precisely so this cannot happen
  // quietly.
  const privacy = new Set(PRIVACY_SECTIONS.map((section) => anchorFor(section.id)));
  for (const section of IMPRINT_SECTIONS) {
    assert.equal(privacy.has(anchorFor(section.id)), false, section.id);
  }
});
