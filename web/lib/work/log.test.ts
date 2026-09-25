import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { padTwo } from "../api/values.ts";
import type { PostMeta } from "../content/posts.ts";

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
    assert.equal(logEntriesFor(posts, "talos-prod"), 0);
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

// THE CORPUS ITSELF IS GONE, AND THE BLOCK THAT READ IT WITH IT. It replaced a
// transcription — "all fifteen entries", asserted by a test that never opened
// the directory — with a real listing, and that was the right repair at the
// time. U2 emptied the directory (ADR 0079), and the same block would now assert
// `0 === 0` while its own guard, "has something to count in the first place",
// went red to say so. The guard did its job: it refused to be vacuous, and what
// it refused has arrived.
//
// So the count is written here again — but as the count of a LIST THIS FILE
// HOLDS, which is a different thing from a sentence about a repository nobody
// opened. Nothing here claims to know what web/content/posts/ contains.
describe("a list this file holds", () => {
  const posts = [
    post("001-a", "timseil-dev"),
    post("002-b", "timseil-dev"),
    post("003-c", null),
  ];

  it("attributes every entry it can read to this site", () => {
    // NO TYPED NUMBER ON THE LEFT. An entry whose `systemId` is missing or
    // misspelt makes this smaller than the list, which is exactly the
    // low-rather-than-wrong failure logEntriesFor is built for — `003-c` is that
    // entry, written in on purpose.
    assert.equal(logEntriesFor(posts, "timseil-dev"), 2);
    assert.equal(
      logEntriesLine(logEntriesFor(posts, "timseil-dev")),
      `${padTwo(2)} ENTRIES IN THE LOG`,
    );
  });

  it("says nothing about a system nobody has written about", () => {
    // The honest shape rather than a gap: a system with no entry drops the line
    // instead of drawing `00 ENTRIES`.
    assert.equal(logEntriesLine(logEntriesFor(posts, "talos-prod")), null);
  });

  // AND THE STATE THIS SITE IS ACTUALLY IN SINCE U2, asserted rather than
  // stumbled into: with no entries at all, the row on /work carries no line.
  it("drops the line entirely when there is no log", () => {
    assert.equal(logEntriesFor([], "timseil-dev"), 0);
    assert.equal(logEntriesLine(0), null);
  });
});
