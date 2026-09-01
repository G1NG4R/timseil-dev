import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { en } from "../i18n/messages/en.ts";

import {
  DOT_ANSWER,
  MARKS,
  NO_DATA,
  STATE_KEYS,
  TRACK_MARKS,
  TRACK_STATES,
  isStateKey,
  isTrackState,
  stateLabel,
  trackLabel,
  type StateKey,
} from "./words.ts";

const entries = STATE_KEYS.map((key) => [key, MARKS[key]] as const);

// THIS BLOCK IS THE ACCEPTANCE CRITERION OF PHASE G6.
//
// The build plan writes it as one sentence — "Jeder Zustand hat ein zweites
// Merkmal neben der Farbe" — and a sentence is not a gate. What follows is the
// same claim in a form that fails when someone adds an eighth state and gives
// it only a colour.
describe("no state is carried by its colour", () => {
  it("gives every state a word, and no two states the same word", () => {
    const labels = entries.map(([, mark]) => mark.label);

    for (const [key, mark] of entries) {
      assert.notEqual(mark.label, "", `${key} has no word`);
    }
    assert.equal(new Set(labels).size, labels.length, "two states share a word");
  });

  it("has fewer tones than states, so colour cannot name one", () => {
    // The load-bearing assertion of the three. If tones and states were in
    // one-to-one correspondence, the palette WOULD be the vocabulary, and every
    // claim in this file about second features would be decoration.
    const tones = new Set(entries.map(([, mark]) => mark.tone));
    assert.ok(
      tones.size < entries.length,
      `${String(tones.size)} tones for ${String(entries.length)} states`,
    );
  });

  it("never lets motion be the difference", () => {
    // globals.css turns every animation off under `prefers-reduced-motion:
    // reduce`. A pulse is therefore not a weaker mark than a border — for those
    // visitors it is no mark at all — so it may only ever decorate a state that
    // a still frame already tells apart.
    for (const [key, mark] of entries) {
      if (!mark.pulse) continue;
      assert.equal(mark.dot, "solid", `${key} pulses without a fill of its own`);
    }
  });
});

describe("the fill says which kind of answer produced the state", () => {
  it("never draws an unmeasured state as a measured one", () => {
    // Invariant 1 as a unit test. `solid` means a measurement came back and it
    // was good; giving that fill to a state nothing measured is the dot-sized
    // version of a full grid where an empty one is the honest picture.
    for (const [key, mark] of entries) {
      if (mark.dot === null) continue;
      assert.equal(DOT_ANSWER[mark.dot], mark.answer, `${key} draws the wrong class of answer`);
    }
  });

  it("gives a dot to every state that makes a claim, and to no other", () => {
    for (const [key, mark] of entries) {
      assert.equal(
        mark.dot === null,
        mark.answer === null,
        `${key} disagrees with itself about whether it measures anything`,
      );
    }
  });
});

describe("the word is prose, the value is not", () => {
  it("keeps the dictionary and the fallback labels in step", () => {
    // Two copies of six words, and this is the assertion that stops them
    // drifting — the same shape messages.test.ts uses for the nav labels, and
    // for the same reason: a table the implementation reads is not an oracle.
    for (const [key, mark] of entries) {
      if (mark.messageKey === null) continue;
      assert.equal(en[mark.messageKey], mark.label, `${key} says one thing in two files`);
    }
  });

  it("leaves ONLINE and — NO DATA out of the dictionary", () => {
    // LANG.01 names ONLINE in the set that stays English; `— NO DATA` is a
    // placeholder token like `[SOON]`, one string in all three languages since
    // design-correction #6. Everything else is prose and gets a key.
    const untranslated = entries
      .filter(([, mark]) => mark.messageKey === null)
      .map(([key]) => key);

    assert.deepEqual(untranslated, ["online", "nodata"]);
  });

  it("renders the English word for a language nobody has filled", () => {
    assert.equal(stateLabel("degraded", en), "DEGRADED");
    assert.equal(stateLabel("online", en), "ONLINE");
    assert.equal(stateLabel("nodata", en), NO_DATA);
  });
});

describe("isStateKey", () => {
  it("accepts what the table holds", () => {
    for (const key of STATE_KEYS) {
      assert.ok(isStateKey(key));
    }
  });

  it("refuses a word from the contract rather than from the interface", () => {
    // `ok` is what /api/health says. It is not a state word, and the mapping
    // between the two is lib/state/derive.ts's job — if this returned true, a
    // caller could put a raw contract value straight into a component and the
    // interface would start printing the wire format.
    assert.equal(isStateKey("ok"), false);
    assert.equal(isStateKey("LIVE"), false);
    assert.equal(isStateKey(""), false);
    assert.equal(isStateKey(null), false);
    assert.equal(isStateKey(undefined), false);
    assert.equal(isStateKey(7), false);
  });

  it("refuses a name it inherited rather than holds", () => {
    // `Object.hasOwn`, not `in`. Every object answers `true` to
    // `"toString" in obj`, and a component that trusted that would look up
    // MARKS.toString and render a function.
    assert.equal(isStateKey("toString"), false);
    assert.equal(isStateKey("constructor"), false);
  });
});

describe("the seven words of STATE.05", () => {
  it("holds them, plus the one that is not a state", () => {
    // The sheet: "DAMIT SIND ES SIEBEN: LIVE · DEGRADED · OFFLINE · EMPTY ·
    // QUEUED · ONLINE · AVAILABLE". `nodata` rides along because it is what the
    // page says when it cannot tell — not a state a system is in.
    const expected: StateKey[] = [
      "live",
      "online",
      "degraded",
      "offline",
      "empty",
      "queued",
      "available",
      "nodata",
    ];
    assert.deepEqual([...STATE_KEYS].sort(), [...expected].sort());
  });
});

// ── The training log's four ─────────────────────────────────────────────────
//
// The block above is G6's acceptance for the seven words a SYSTEM can be in.
// This one asks the same question of the four a TRACK can be in, because H4 is
// the phase that put a second scale on the same page and the failure mode is
// identical: a state that can only be told apart by its colour.
describe("no track state is carried by its colour either", () => {
  const tracks = TRACK_STATES.map((state) => [state, TRACK_MARKS[state]] as const);

  it("gives every state a word, and no two states the same word", () => {
    const labels = tracks.map(([, mark]) => mark.label);

    for (const [state, mark] of tracks) {
      assert.notEqual(mark.label, "", `${state} has no word`);
    }
    assert.equal(new Set(labels).size, labels.length, "two track states share a word");
  });

  it("gives every state its own bar length", () => {
    // THE LOAD-BEARING ONE. The bar is the feature that survives a greyscale
    // screenshot and a palette swap, and it only is one while the four lengths
    // are four. Give two states the same fill and the bar stops being a second
    // feature and becomes decoration beside the word.
    const steps = tracks.map(([, mark]) => mark.steps);
    assert.equal(new Set(steps).size, steps.length, "two track states fill the bar alike");
  });

  it("orders the bar the way the evidence orders the states", () => {
    // core runs in two systems, applied in one, learning in something being
    // built, queued in nothing. The bar has to read in that order or it says
    // something the contract does not.
    assert.ok(
      TRACK_MARKS.core.steps > TRACK_MARKS.applied.steps &&
        TRACK_MARKS.applied.steps > TRACK_MARKS.learning.steps &&
        TRACK_MARKS.learning.steps > TRACK_MARKS.queued.steps,
      "the bar does not follow the evidence",
    );
  });

  it("leaves the bar empty for the state with no evidence at all", () => {
    // Not one segment short — empty. A first step would be a claim, and nine of
    // the twenty-two tracks are in this state at launch: an eighth of a bar
    // times nine is a log that looks fuller than the systems behind it.
    assert.equal(TRACK_MARKS.queued.steps, 0);
  });
});

describe("QUEUED is one word at both scales", () => {
  it("reads its label off MARKS rather than repeating it", () => {
    // The whole reason the two tables may sit in one file. `dayLabel` makes the
    // same move with `degraded`; if this ever fails, someone has written the
    // word a second time and the two copies are free to drift.
    assert.equal(TRACK_MARKS.queued.label, MARKS.queued.label);
  });

  it("shares the dictionary key too, so it is translated once", () => {
    assert.equal(TRACK_MARKS.queued.messageKey, MARKS.queued.messageKey);
    assert.equal(trackLabel("queued", en), stateLabel("queued", en));
  });
});

describe("the track word is prose, the value is not", () => {
  it("keeps the dictionary and the fallback labels in step", () => {
    for (const state of TRACK_STATES) {
      const mark = TRACK_MARKS[state];
      assert.equal(en[mark.messageKey], mark.label, `${state} says one thing in two files`);
    }
  });

  it("translates all four — none of them is in LANG.01's English set", () => {
    // `messageKey` is not nullable here, unlike StateMark's, and this is the
    // assertion that says the difference was a decision. ONLINE is the only
    // state word the sheet keeps English, and it is not one of these.
    for (const state of TRACK_STATES) {
      assert.notEqual(TRACK_MARKS[state].messageKey, null);
    }
  });
});

describe("isTrackState", () => {
  it("holds the four the contract enumerates", () => {
    // Transcribed from `TrackState` in contract/openapi.yaml. The type makes a
    // missing key a compile error; this makes an extra one a failing test.
    assert.deepEqual([...TRACK_STATES].sort(), ["applied", "core", "learning", "queued"]);

    for (const state of TRACK_STATES) {
      assert.ok(isTrackState(state));
    }
  });

  it("refuses a system's word, an uppercase label and a borrowed name", () => {
    // `live` is what a SYSTEM is. A track is never live, and a caller that got
    // true here could put a system state into a track row and the two scales
    // would start meaning each other.
    assert.equal(isTrackState("live"), false);
    assert.equal(isTrackState("CORE"), false);
    assert.equal(isTrackState("toString"), false);
    assert.equal(isTrackState(""), false);
    assert.equal(isTrackState(null), false);
    assert.equal(isTrackState(7), false);
  });
});
