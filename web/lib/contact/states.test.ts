// The six states of the form, held against the rules the eight system states
// are held against.
//
// A SECOND TABLE NEEDS A SECOND TEST, and that is the whole reason this file
// exists. words.test.ts is the acceptance criterion of G6 written as
// assertions; nothing in it reaches this table, so a table that lives beside it
// and obeys none of it would be the state language with a hole in it.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DOT_ANSWER } from "../state/words.ts";

import { CONTACT_MARKS, CONTACT_STATE_KEYS, contactState } from "./states.ts";

const entries = CONTACT_STATE_KEYS.map((key) => [key, CONTACT_MARKS[key]] as const);

describe("no state of this form is carried by its colour", () => {
  it("draws the six the sheet draws", () => {
    // SYS.06.01 draws six cards and the Consistency Check's second round lists
    // "sechs Formzustände" as settled for this page. Five would mean one of the
    // sheet's cards has no rendering; seven would mean the page invented one.
    assert.equal(entries.length, 6);
  });

  it("gives every state a word, and no two states the same word", () => {
    const labels = entries.map(([, mark]) => mark.label);

    for (const [key, mark] of entries) {
      assert.notEqual(mark.label, "", `${key} has no word`);
    }
    assert.equal(new Set(labels).size, labels.length, "two states share a word");
  });

  it("has fewer tones than states, so colour cannot name one", () => {
    const tones = new Set(entries.map(([, mark]) => mark.tone));
    assert.ok(
      tones.size < entries.length,
      `${String(tones.size)} tones for ${String(entries.length)} states`,
    );
  });

  it("gives the fill that matches the kind of answer behind it", () => {
    // Nobody gets to give an unmeasured state a measured fill. On this page
    // that is not a hypothetical: a cyan disc under SENDING would look right
    // and would claim the page is holding a value it does not have yet.
    for (const [key, mark] of entries) {
      if (mark.dot === null) continue;
      assert.equal(DOT_ANSWER[mark.dot], mark.answer, `${key} draws the wrong fill`);
    }
  });

  it("never lets motion be the difference", () => {
    // globals.css turns every animation off under prefers-reduced-motion, so a
    // pulse is not a weaker mark for those visitors — it is no mark at all.
    for (const [key, mark] of entries) {
      if (!mark.pulse) continue;
      assert.equal(mark.dot, "solid", `${key} pulses without a fill of its own`);
    }
  });

  it("spends the alert tone exactly once", () => {
    // The sheet's own rule, one line above the six cards: "EIN ALERT-MOMENT:
    // DER FEHLSCHLAG". Two red states on one page is issue #297's shape, and
    // the fields are already red before this table gets a say.
    const alert = entries.filter(([, mark]) => mark.tone === "alert");
    assert.deepEqual(
      alert.map(([key]) => key),
      ["failed"],
    );
  });

  it("separates rest from composing by the word alone", () => {
    // ADR 0063's decision, applied a second time: neither has measured
    // anything, so DOT_ANSWER leaves them one fill, and a fifth tone to tell
    // them apart would make the palette the vocabulary.
    const { rest, composing } = CONTACT_MARKS;

    assert.equal(rest.tone, composing.tone);
    assert.equal(rest.dot, composing.dot);
    assert.equal(rest.answer, composing.answer);
    assert.notEqual(rest.label, composing.label);
  });
});

describe("which of the six the page is in", () => {
  it("tells an empty page from one somebody is typing into", () => {
    assert.equal(contactState({ phase: "rest", typed: false, invalidCount: 0 }), "rest");
    assert.equal(contactState({ phase: "rest", typed: true, invalidCount: 0 }), "composing");
  });

  it("reads the three phases that mean one thing each", () => {
    assert.equal(contactState({ phase: "sending", typed: true, invalidCount: 0 }), "sending");
    assert.equal(contactState({ phase: "accepted", typed: true, invalidCount: 0 }), "accepted");
    assert.equal(contactState({ phase: "invalid", typed: true, invalidCount: 2 }), "rejected");
  });

  it("splits the two answers that share the status 400", () => {
    // With fields, a visitor has a typo and the fields carry the alert. Without
    // fields, `writeError` refused the Origin — nobody typed anything wrong and
    // this page owes its one alert moment to that.
    assert.equal(contactState({ phase: "failed", typed: true, invalidCount: 1 }), "rejected");
    assert.equal(contactState({ phase: "failed", typed: true, invalidCount: 0 }), "failed");
  });

  it("does not fall back to rest once something has been sent", () => {
    // `typed` is about the dwell clock and says nothing after a submit. A
    // branch that consulted it here would put the badge back on COMPOSING
    // while a receipt was on the screen.
    assert.equal(contactState({ phase: "accepted", typed: false, invalidCount: 0 }), "accepted");
    assert.equal(contactState({ phase: "failed", typed: false, invalidCount: 0 }), "failed");
  });
});
