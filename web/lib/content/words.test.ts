// What the reading time is allowed to count, and the two things it must not.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WORDS_PER_MINUTE, minutesLabel, readingSize, wordsLabel } from "./words.ts";

function file(frontmatter: string, body: string): string {
  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

const FRONT = "title: 'A'\ndeck: 'B'\npublished: 2026-09-01";

describe("what is not prose", () => {
  // THE BROKEN CASE THIS FILE EXISTS FOR. Seventy-nine fenced blocks sit in the
  // corpus. Counted as prose they would report a longer read for the post with
  // more listings than for the post with more to say — a number that moves for
  // a reason the reader cannot see.
  it("does not count a fenced block", () => {
    const withCode = file(
      FRONT,
      ["One two three.", "", "```go", "func main() { println(\"a b c d e\") }", "```", ""].join("\n"),
    );

    assert.equal(readingSize(withCode).words, 3);
  });

  it("does not count a tilde fence either, though no post writes one", () => {
    const withCode = file(FRONT, ["One two.", "", "~~~", "a b c d e f g", "~~~"].join("\n"));

    assert.equal(readingSize(withCode).words, 2);
  });

  it("does not count the frontmatter it was handed", () => {
    // The frontmatter of a real post is longer than some of its sections. A
    // counter that read it would report the summary twice.
    assert.equal(readingSize(file(FRONT, "One two three four.")).words, 4);
  });

  it("does not count a heading's hashes or a list's dashes as words", () => {
    const raw = file(FRONT, ["## Two words", "", "- one", "- two"].join("\n"));

    assert.equal(readingSize(raw).words, 4);
  });
});

describe("the minutes are a rate applied to the words", () => {
  // The sheet prints `12 MIN · 2 480 WORDS` in one row. Two hundred a minute is
  // the divisor that reproduces it, which is why the constant is what it is.
  it("reproduces the pair the design sheet draws", () => {
    const size = { words: 2480, minutes: Math.max(1, Math.round(2480 / WORDS_PER_MINUTE)) };
    assert.equal(size.minutes, 12);
  });

  it("never reports zero minutes for a post that has words in it", () => {
    assert.equal(readingSize(file(FRONT, "One.")).minutes, 1);
  });
});

describe("the labels", () => {
  it("pads the minutes like every other number in the mono column", () => {
    assert.equal(minutesLabel({ words: 800, minutes: 4 }), "04 MIN");
    assert.equal(minutesLabel({ words: 2400, minutes: 12 }), "12 MIN");
  });

  // The separator is U+00A0, not the sheet's U+0020. words.ts says why, and this
  // asserts the codepoint rather than "a space" — the two are identical in a
  // diff, and the whole point of the choice is the one that does not break.
  it("groups thousands with a space that cannot break", () => {
    assert.equal(wordsLabel({ words: 2480, minutes: 12 }), "2\u00a0480 WORDS");
    assert.equal(wordsLabel({ words: 867, minutes: 4 }), "867 WORDS");
  });
});

// THE BLOCK THAT STOOD HERE READ EVERY FILE IN web/content/posts/. U2 emptied
// that directory (ADR 0079), and what was left of the block was the one file
// still in it — the README that keeps the directory alive — being measured as if
// it were an entry. A sweep over a corpus is worth what the corpus is worth;
// with none, it is a test that either checks nothing or checks the wrong file.
// The properties of `readingSize` itself are held against fixtures above.
