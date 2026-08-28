// The four ways this animation can be wrong while looking plausible: it never
// lands on the label, it changes width, it settles from the wrong end, or it is
// different every time it runs.
//
// All four are invisible in a screenshot and three of them are invisible in a
// slow-motion recording too.

import assert from "node:assert/strict";
import test from "node:test";

import { SCRAMBLE_GLYPHS, SCRAMBLE_PASSES, scrambleFrame } from "./scramble.ts";

const LABELS = ["WORK", "LOG", "ABOUT", "CONTACT"];
const SEEDS = [0, 1, 7, 1234, 65535];

/** How many characters at the end of `frame` already match `label`. */
function settledSuffix(frame: string, label: string): number {
  let n = 0;
  while (n < label.length && frame[label.length - 1 - n] === label[label.length - 1 - n]) {
    n += 1;
  }
  return n;
}

// THE ONE THAT MATTERS MOST. An animation that ends one pass short leaves a nav
// entry reading ﾂ0ｹﾄ until the pointer moves away, and every intermediate frame
// looks correct while it does.
void test("the last frame is the label, for every label and every seed", () => {
  for (const label of LABELS) {
    for (const seed of SEEDS) {
      assert.equal(scrambleFrame(label, 1, seed), label, `${label} @ ${String(seed)}`);
      // And past the end, in case a timer overshoots.
      assert.equal(scrambleFrame(label, 1.4, seed), label);
    }
  }
});

void test("the width never changes", () => {
  for (const label of LABELS) {
    for (let pass = 0; pass <= SCRAMBLE_PASSES; pass++) {
      const frame = scrambleFrame(label, pass / SCRAMBLE_PASSES, 42);
      assert.equal(frame.length, label.length, `${label} @ pass ${String(pass)}: "${frame}"`);
    }
    // Off-grid progress too — a rAF loop does not land on quarters.
    for (const p of [0, 0.13, 0.5, 0.77, 0.99]) {
      assert.equal(scrambleFrame(label, p, 42).length, label.length);
    }
  }
});

// THE DIRECTION. Locking from the left passes both tests above and is the wrong
// animation — the label would resolve into nonsense instead of out of it.
//
// The check works because SCRAMBLE_GLYPHS shares no character with any of the
// four labels: a settled cell can be told from a scrambled one without knowing
// which glyph the hash picked.
void test("the label settles from the right", () => {
  for (const label of LABELS) {
    let previous = 0;
    for (let pass = 0; pass <= SCRAMBLE_PASSES; pass++) {
      const progress = pass / SCRAMBLE_PASSES;
      const frame = scrambleFrame(label, progress, 7);
      const locked = Math.floor(label.length * progress);

      assert.equal(
        frame.slice(label.length - locked),
        label.slice(label.length - locked),
        `${label} @ pass ${String(pass)}: the settled end is not the right-hand one`,
      );
      // Everything before it is still a glyph, not a leftover of the label.
      for (const ch of frame.slice(0, label.length - locked)) {
        assert.ok(SCRAMBLE_GLYPHS.includes(ch), `"${ch}" is not one of the glyphs`);
      }

      const settled = settledSuffix(frame, label);
      assert.ok(settled >= previous, `${label}: the settled suffix shrank`);
      previous = settled;
    }
  }
});

void test("the same frame is the same string, every time", () => {
  for (const label of LABELS) {
    for (const p of [0, 0.25, 0.5, 0.75]) {
      assert.equal(scrambleFrame(label, p, 3), scrambleFrame(label, p, 3));
    }
  }

  // And two different seeds do not produce the same animation, or the seed is
  // decoration and the frames are a constant.
  const differs = SEEDS.some((seed) => scrambleFrame("CONTACT", 0.25, seed) !== scrambleFrame("CONTACT", 0.25, 0));
  assert.ok(differs, "the seed changes nothing");
});

void test("a space survives as a space", () => {
  // No label has one today. One will: the sheet's own inventory grows, and a
  // space turned into a katakana reads as the word getting longer.
  const frame = scrambleFrame("A B", 0, 5);
  assert.equal(frame.length, 3);
  assert.equal(frame[1], " ");
});
