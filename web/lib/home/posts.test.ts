import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { de } from "../i18n/messages/de.ts";
import { en } from "../i18n/messages/en.ts";

import type { PostMeta, PostRead } from "../content/posts.ts";

import { LOG_ROWS, logEntries, logMeta } from "./posts.ts";

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

const FOURTEEN: PostRead = {
  posts: Array.from({ length: 14 }, (_, i) =>
    post(`${String(14 - i).padStart(3, "0")}-post`, "2026-09-01"),
  ),
  skipped: [],
};

describe("how many rows the section draws", () => {
  it("takes the newest three out of fourteen", () => {
    const entries = logEntries(FOURTEEN);

    assert.equal(entries.length, LOG_ROWS);
    assert.deepEqual(entries.map((entry) => entry.slug), ["014-post", "013-post", "012-post"]);
  });

  it("takes what there is when there are fewer than three", () => {
    const two: PostRead = { posts: FOURTEEN.posts.slice(0, 2), skipped: [] };

    assert.equal(logEntries(two).length, 2);
  });

  it("draws nothing when the directory could not be read", () => {
    assert.deepEqual(logEntries(null), []);
  });
});

describe("the head names its count and its source", () => {
  it("counts the rows it draws, not the posts that exist", () => {
    // The failure this is about: `LATEST 14` beside three rows. The sheet writes
    // `LATEST 03` and it is right for the wrong reason — it drew three posts.
    assert.equal(logMeta(FOURTEEN, en), "LATEST 03 · SOURCE: content/posts");
  });

  it("says it in the language of the route", () => {
    assert.equal(logMeta(FOURTEEN, de), "NEUESTE 03 · QUELLE: content/posts");
  });

  it("says 00 for a directory that read and held nothing", () => {
    assert.equal(logMeta({ posts: [], skipped: [] }, en), "LATEST 00 · SOURCE: content/posts");
  });

  // Invariant 1 in a section head: the two emptinesses are different claims.
  it("says — NO DATA for a directory it could not read", () => {
    assert.equal(logMeta(null, en), "— NO DATA · SOURCE: content/posts");
  });

  it("keeps the source in every case", () => {
    for (const meta of [logMeta(FOURTEEN, en), logMeta({ posts: [], skipped: [] }, en), logMeta(null, en)]) {
      assert.match(meta, /SOURCE: content\/posts$/);
    }
  });
});
