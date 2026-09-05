import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { POSTS_DIR, readPosts, type PostMeta } from "../content/posts.ts";
import { byYear, latestPublished, yearOf } from "./entries.ts";

function post(published: string, slug = "001-a-slug"): PostMeta {
  return {
    slug,
    title: "A title",
    deck: "A deck",
    published,
    systemId: null,
    tags: ["go"],
    summary: "A summary",
    updated: null,
  };
}

// The broken case first: nothing to group, and a year that holds one entry —
// the case where drawing no separator would move the entry into the year above.
describe("a log with nothing in it", () => {
  it("has no groups", () => {
    assert.deepEqual(byYear([]), []);
  });

  it("has no latest entry, and says so with nothing rather than a dash", () => {
    // The caller owns the word for an absence: the head has one for "read and
    // empty" and another for "could not be read", and this file knows neither.
    assert.equal(latestPublished([]), null);
  });
});

describe("a year that holds one entry", () => {
  it("is still a group, so the entry is not read as part of the year above", () => {
    const groups = byYear([post("2026-01-05"), post("2025-12-01")]);
    assert.deepEqual(
      groups.map((group) => `${group.year} ${group.count}`),
      ["2026 01", "2025 01"],
    );
  });
});

describe("the year of an entry", () => {
  it("is read off the string and not parsed", () => {
    // Constructing a Date to read four characters back off it would put this at
    // the mercy of the running process's timezone for no gain.
    assert.equal(yearOf(post("2026-09-05")), "2026");
    assert.equal(yearOf(post("2025-01-01")), "2025");
  });
});

describe("grouping", () => {
  const posts = [
    post("2026-09-05", "023-c"),
    post("2026-01-02", "010-b"),
    post("2025-12-12", "009-a"),
    post("2025-01-01", "001-z"),
  ];

  it("keeps the order it was given and never re-sorts", () => {
    // readPosts already ties on the slug, and lib/content/posts.ts explains why
    // the date alone is not a total order. A sort here would be a second
    // opinion about sequence.
    assert.deepEqual(
      byYear(posts).flatMap((group) => group.posts.map((one) => one.slug)),
      ["023-c", "010-b", "009-a", "001-z"],
    );
  });

  it("counts each year and pads the number", () => {
    assert.deepEqual(
      byYear(posts).map((group) => group.count),
      ["02", "02"],
    );
  });

  it("loses no entry", () => {
    const total = byYear(posts).reduce((sum, group) => sum + group.posts.length, 0);
    assert.equal(total, posts.length);
  });

  it("does not merge two runs of one year that arrive apart", () => {
    // An unordered input must look broken rather than be repaired: a map keyed
    // on the year would silently glue these together and hide it.
    const groups = byYear([post("2026-01-01"), post("2025-01-01"), post("2026-02-02")]);
    assert.deepEqual(
      groups.map((group) => group.year),
      ["2026", "2025", "2026"],
    );
  });
});

describe("the whole log", () => {
  const { posts } = readPosts(POSTS_DIR);

  it("groups into years that descend, without anything sorting them", () => {
    const years = byYear(posts).map((group) => group.year);
    assert.deepEqual(years, [...years].sort().reverse());
  });

  it("names its newest entry as the date the first row carries", () => {
    assert.equal(latestPublished(posts), posts[0]?.published);
  });

  it("puts every entry in exactly one group", () => {
    const grouped = byYear(posts).flatMap((group) => group.posts.map((one) => one.slug));
    assert.deepEqual(grouped, posts.map((one) => one.slug));
  });
});
