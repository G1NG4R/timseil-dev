import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { padTwo } from "../api/values.ts";
import { POSTS_DIR, readPosts, type PostMeta } from "../content/posts.ts";

import { logEntriesFor, logEntriesLine } from "./log.ts";

function post(slug: string, systemId: string | null): PostMeta {
  return {
    slug,
    title: `Title ${slug}`,
    deck: "One line.",
    published: "2026-09-01",
    systemId,
    tags: ["testing"],
    summary: "One paragraph.",
    updated: null,
  };
}

// The broken case first, and here it is the one the frontmatter allows: a post
// that names a system nothing answers to. `systemId` is prose in a file, not a
// foreign key — no constraint can reach a `.mdx`.
describe("a post that names no system this list holds", () => {
  it("counts a misspelt slug towards nothing rather than towards something", () => {
    // A miscounted row then reads LOW, which is recoverable, instead of
    // attaching an entry to the wrong system, which is not.
    const posts = [post("001-a", "timseil-dev"), post("002-b", "timsiel-dev")];

    assert.equal(logEntriesFor(posts, "timseil-dev"), 1);
    assert.equal(logEntriesFor(posts, "timsiel-dev"), 1);
    assert.equal(logEntriesFor(posts, "vat-check"), 0);
  });

  it("counts a post with no systemId towards nothing", () => {
    // The key is nullable in PostMeta on purpose: a post about no particular
    // system is ordinary, and requiring it would drop a readable entry off the
    // homepage over a key that page never draws.
    assert.equal(logEntriesFor([post("001-a", null)], "timseil-dev"), 0);
  });

  it("does not match on a prefix or on a different case", () => {
    // Whole-string equality. `timseil` is not `timseil-dev`, and a filter that
    // was generous here would attribute entries across systems.
    const posts = [post("001-a", "timseil"), post("002-b", "TIMSEIL-DEV")];

    assert.equal(logEntriesFor(posts, "timseil-dev"), 0);
  });

  it("counts nothing in an empty repository", () => {
    assert.equal(logEntriesFor([], "timseil-dev"), 0);
  });
});

describe("what the row says about the count", () => {
  it("says nothing at all when there is nothing to say", () => {
    // STATE.05: an empty thing owes a reason and a way back, and there is no
    // way back from a log with no entry about this system. The line is absent
    // instead — the same call the row makes about the exit it does not draw for
    // a system with no case study.
    assert.equal(logEntriesLine(0), null);
    assert.equal(logEntriesLine(-1), null);
  });

  it("says ENTRY for one and ENTRIES for the rest", () => {
    assert.equal(logEntriesLine(1), "01 ENTRY IN THE LOG");
    assert.equal(logEntriesLine(2), "02 ENTRIES IN THE LOG");
    assert.equal(logEntriesLine(15), "15 ENTRIES IN THE LOG");
  });

  it("pads to two digits and does not truncate past them", () => {
    assert.equal(logEntriesLine(9), "09 ENTRIES IN THE LOG");
    assert.equal(logEntriesLine(120), "120 ENTRIES IN THE LOG");
  });

  it("carries no arrow, because no URL expresses the list it would open", () => {
    // The assertion is the same one H5c wrote and its reason is not. Back then
    // `/blog/<slug>` answered 404. It answers now — and the arrow was never
    // pointing at ONE entry. The sheet says it opens "the posts written about
    // this system", and ADR 0071 §8 kept filter state out of the URL, so no
    // address on this site narrows the index to a system. If somebody adds an
    // arrow here, this is what says the destination is still not there.
    assert.equal(logEntriesLine(1)?.includes("→"), false);
  });
});

// THE CORPUS ITSELF, AND NOT A TRANSCRIPTION OF IT. This block used to build
// fifteen fixtures and assert fifteen, under a name that said "all fifteen
// entries" — a claim about the repository made in a place that never opened it.
// It was green and correct on the day it was written and stale nine files
// later. `BLOG_POST_NEWEST` was the same defect in H9a and got the same repair:
// read the thing, do not describe it. posts.test.ts already reads POSTS_DIR, so
// this costs one directory listing and no new capability.
describe("the count the repository actually holds today", () => {
  const read = readPosts(POSTS_DIR);
  const total = read.posts.length;

  it("attributes every entry it can read to this site", () => {
    // NO TYPED NUMBER ON EITHER SIDE. The count comes out of the directory, and
    // the assertion is that NOTHING falls out of it: an entry whose `systemId`
    // is missing or misspelt would make this smaller than the corpus, which is
    // exactly the low-rather-than-wrong failure logEntriesFor is built for.
    assert.equal(logEntriesFor(read.posts, "timseil-dev"), total);

    // The line the row draws, formatted from that same number rather than from
    // a string anybody typed.
    assert.equal(
      logEntriesLine(logEntriesFor(read.posts, "timseil-dev")),
      `${padTwo(total)} ENTRIES IN THE LOG`,
    );
  });

  it("has something to count in the first place", () => {
    // Without this the test above passes on an EMPTY directory: 0 === 0, and
    // `logEntriesLine(0)` is `null` by design, so a reader that returned nothing
    // would look like a corpus agreeing with itself. Whether every file parses
    // is posts.test.ts' assertion and stays there — one claim, one owner.
    assert.ok(total > 1, `expected a corpus, read ${String(total)} entries`);
  });

  it("says nothing about the system nobody has written about", () => {
    // The honest shape rather than a gap: `vat-check` is queued and has no
    // repository, so the row drops the line instead of drawing `00 ENTRIES`.
    assert.equal(logEntriesLine(logEntriesFor(read.posts, "vat-check")), null);
  });
});
