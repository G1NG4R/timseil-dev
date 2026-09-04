// The foot of a post, and the two ends of the log where half of it is missing.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PostMeta } from "./posts.ts";
import { neighbours } from "./neighbours.ts";

function post(slug: string, published: string): PostMeta {
  return {
    slug,
    title: `Title ${slug}`,
    deck: "One line.",
    published,
    systemId: "timseil-dev",
    tags: ["testing"],
    summary: "One paragraph.",
    updated: null,
  };
}

// Newest first, which is the order readPosts returns and the order the index
// draws. Deriving one here would give the foot a different neighbour from the
// index two clicks earlier.
const POSTS = [
  post("003-newest", "2026-09-03"),
  post("002-middle", "2026-09-02"),
  post("001-oldest", "2026-09-01"),
];

describe("the two ends of the log", () => {
  // THE BROKEN CASE, AND IT IS THE ONE THE SHEET DREW A STATE FOR. The newest
  // post has nothing after it. The row still gets rendered — "ZEILE VERSCHWINDET
  // NIE" — so this has to report the absence rather than be spared the question.
  it("has no next entry at the newest, and says so with null", () => {
    assert.deepEqual(neighbours(POSTS, "003-newest"), {
      previous: POSTS[1],
      next: null,
    });
  });

  it("has no previous entry at the oldest", () => {
    assert.deepEqual(neighbours(POSTS, "001-oldest"), {
      previous: null,
      next: POSTS[1],
    });
  });

  it("has both in the middle, and previous is the OLDER one", () => {
    const { previous, next } = neighbours(POSTS, "002-middle");

    assert.equal(previous?.slug, "001-oldest");
    assert.equal(next?.slug, "003-newest");
  });
});

describe("a slug the list does not hold", () => {
  // Unreachable from a page: the route calls notFound() first. A throw here
  // would be a second gate disagreeing with the first about what a missing post
  // is, so it answers the same way the two ends do.
  it("answers with two nulls rather than throwing", () => {
    assert.deepEqual(neighbours(POSTS, "999-never-written"), { previous: null, next: null });
  });

  it("answers the same way for an empty log", () => {
    assert.deepEqual(neighbours([], "001-oldest"), { previous: null, next: null });
  });
});
