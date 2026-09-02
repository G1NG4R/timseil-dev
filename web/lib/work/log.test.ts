import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PostMeta } from "../content/posts.ts";

import { logEntriesFor, logEntriesLine } from "./log.ts";

function post(slug: string, systemId: string | null): PostMeta {
  return { slug, title: `Title ${slug}`, deck: "One line.", published: "2026-09-01", systemId };
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

  it("carries no arrow, because there is nowhere to go until H9", () => {
    // Invariant 5 as an assertion rather than a comment. `/blog/<slug>` is a
    // 404 until the renderer exists, and the sheet draws an arrow anyway. If
    // somebody adds one here, this is what says the destination is still not
    // there.
    assert.equal(logEntriesLine(1)?.includes("→"), false);
  });
});

describe("the count the repository actually holds today", () => {
  it("attributes all fifteen entries to this site", () => {
    // Transcribed from web/content/posts/: fifteen files, every one of them
    // `systemId: 'timseil-dev'`. Renamed from `system` in H6 — #314, where the
    // corpus moved because docs/design/ is read-only and ADR 0002 already said
    // `systemId`.
    const posts = Array.from({ length: 15 }, (_, i) =>
      post(`${String(i + 1).padStart(3, "0")}-post`, "timseil-dev"),
    );

    assert.equal(logEntriesFor(posts, "timseil-dev"), 15);
    assert.equal(logEntriesLine(logEntriesFor(posts, "timseil-dev")), "15 ENTRIES IN THE LOG");

    // And nothing has been written about the other system, which is the honest
    // shape rather than a gap: `vat-check` is queued and has no repository.
    assert.equal(logEntriesLine(logEntriesFor(posts, "vat-check")), null);
  });
});
