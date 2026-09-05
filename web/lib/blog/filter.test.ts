import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { POSTS_DIR, readPosts, type PostMeta } from "../content/posts.ts";
import { tagChips } from "./tags.ts";
import {
  ALL_TAGS,
  NO_FILTER,
  activeLabels,
  applyFilter,
  haystack,
  isFiltered,
  matches,
  normaliseQuery,
} from "./filter.ts";

function post(fields: Partial<PostMeta> = {}): PostMeta {
  return {
    slug: "001-a-slug",
    title: "A title",
    deck: "A deck",
    published: "2026-01-01",
    systemId: null,
    tags: ["go"],
    summary: "A summary nobody draws on the index",
    updated: null,
    ...fields,
  };
}

const row = (tags: readonly string[], text: string) => ({ tags, text });

// The broken case first: an axis that narrows to nothing, and the sentinel
// colliding with a subject somebody could write.
describe("an axis that matches no entry", () => {
  it("answers an empty list rather than falling back to everything", () => {
    const rows = [row(["go"], "a title")];
    assert.deepEqual(applyFilter(rows, { tag: "rust", q: "" }), []);
  });

  it("answers an empty list for a query nothing holds", () => {
    const rows = [row(["go"], "a title")];
    assert.deepEqual(applyFilter(rows, { tag: ALL_TAGS, q: "kubernetes" }), []);
  });

  it("combines the two axes with AND, so a tag cannot rescue a query", () => {
    const rows = [row(["go"], "a title")];
    assert.deepEqual(applyFilter(rows, { tag: "go", q: "kubernetes" }), []);
  });
});

describe("the sentinel is outside the tag alphabet", () => {
  it("is a string no frontmatter can produce", () => {
    // lib/content/posts.ts constrains a tag to lowercase, digits and hyphens.
    // If this ever passes, the sentinel and a subject can be the same value.
    assert.doesNotMatch(ALL_TAGS, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("does not collide with an entry filed under the sheet's word", () => {
    // The sheet's script uses `all`. An entry tagged `all` is legal frontmatter,
    // and under that sentinel it would silently turn the filter off.
    const rows = [row(["all"], "a title")];
    assert.equal(applyFilter(rows, { tag: "all", q: "" }).length, 1);
    assert.equal(applyFilter(rows, NO_FILTER).length, 1);
  });
});

describe("nothing narrowed", () => {
  it("keeps every row", () => {
    const rows = [row(["go"], "one"), row(["css"], "two")];
    assert.equal(applyFilter(rows, NO_FILTER).length, 2);
  });

  it("keeps the order it was given, because the list is already ordered", () => {
    const rows = [row(["go"], "one"), row(["css"], "two"), row(["go"], "three")];
    assert.deepEqual(
      applyFilter(rows, { tag: "go", q: "" }).map((one) => one.text),
      ["one", "three"],
    );
  });

  it("is what `isFiltered` says of the load state and of nothing else", () => {
    assert.equal(isFiltered(NO_FILTER), false);
    assert.equal(isFiltered({ tag: "go", q: "" }), true);
    assert.equal(isFiltered({ tag: ALL_TAGS, q: "witness" }), true);
  });
});

describe("a tag matches whole, and a query matches inside", () => {
  it("does not let one tag match a longer one", () => {
    // `design` may never match `design-handoff`: the tag axis is a closed set
    // of keys, and a partial match there files an entry under a subject it does
    // not carry.
    assert.equal(matches(row(["design-handoff"], "x"), { tag: "design", q: "" }), false);
    assert.equal(matches(row(["design"], "x"), { tag: "design-handoff", q: "" }), false);
  });

  it("lets a query match inside a word, because that is what typing means", () => {
    assert.equal(matches(row([], "the witness that was turned away"), { tag: ALL_TAGS, q: "witness" }), true);
    assert.equal(matches(row([], "the witness that was turned away"), { tag: ALL_TAGS, q: "ness" }), true);
  });
});

describe("what a reader typed", () => {
  it("is trimmed and lower-cased in one place", () => {
    assert.equal(normaliseQuery("  Witness  "), "witness");
    assert.equal(normaliseQuery("CSS"), "css");
  });

  it("turns whitespace-only into the axis being off", () => {
    assert.equal(normaliseQuery("   "), "");
    assert.equal(isFiltered({ tag: ALL_TAGS, q: normaliseQuery("   ") }), false);
  });
});

describe("what an entry is searchable by", () => {
  it("holds the title, the deck and the tags", () => {
    const text = haystack(post({ title: "Title", deck: "Deck", tags: ["observability"] }));
    for (const word of ["title", "deck", "observability"]) {
      assert.ok(text.includes(word), `missing ${word}`);
    }
  });

  it("does not hold the date, so a year is not a search term", () => {
    // `2026` must not return every entry when nobody searched for a year. The
    // sheet's own script matches the whole row and would.
    assert.ok(!haystack(post({ published: "2026-01-01" })).includes("2026"));
  });

  it("does not hold the summary, which this page does not draw", () => {
    const text = haystack(post({ summary: "a paragraph only the post page prints" }));
    assert.ok(!text.includes("paragraph"));
  });

  it("is lower-cased once, so the query never has to be upper-cased", () => {
    assert.equal(haystack(post({ title: "SHOUTING" })), haystack(post({ title: "shouting" })));
  });
});

describe("the echo in the empty panel", () => {
  const chips = tagChips([post({ tags: ["ci-cd"] })]);

  it("says nothing when nothing is narrowing", () => {
    assert.deepEqual(activeLabels(NO_FILTER, chips), []);
  });

  it("names its axis, because one is a subject and the other is free text", () => {
    assert.deepEqual(activeLabels({ tag: "ci-cd", q: "witness" }, chips), [
      "TAG: CI-CD",
      'SEARCH: "witness"',
    ]);
  });

  it("echoes the query as typed rather than shouting it back", () => {
    assert.deepEqual(activeLabels({ tag: ALL_TAGS, q: "witness" }, chips), ['SEARCH: "witness"']);
  });

  it("prints a tag with no chip rather than explaining half the emptiness", () => {
    assert.deepEqual(activeLabels({ tag: "rust", q: "" }, chips), ["TAG: RUST"]);
  });
});

describe("every entry in the repository", () => {
  const { posts } = readPosts(POSTS_DIR);
  const rows = posts.map((one) => ({ tags: one.tags, text: haystack(one) }));

  it("is reachable through at least one of its own tags", () => {
    for (const one of posts) {
      const tag = one.tags[0] ?? "";
      const shown = applyFilter(rows, { tag, q: "" });
      assert.ok(shown.length >= 1, `${one.slug} is filed under nothing`);
    }
  });

  it("is findable by a word from its own title", () => {
    for (const one of posts) {
      const word = one.title.toLowerCase().split(/\s+/).find((part) => part.length > 5) ?? "";
      if (word === "") continue;
      const shown = applyFilter(rows, { tag: ALL_TAGS, q: normaliseQuery(word) });
      assert.ok(shown.length >= 1, `${one.slug} cannot be found by "${word}"`);
    }
  });

  it("is not returned by a search for its year", () => {
    assert.equal(applyFilter(rows, { tag: ALL_TAGS, q: "2026" }).length, 0);
  });
});
