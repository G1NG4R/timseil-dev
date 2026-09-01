// The frontmatter reader, against the files it will actually be given and
// against the ones it must refuse.
//
// TWO HALVES, AND THE SECOND ONE IS THE POINT. The broken cases below are
// invented, and invented cases only ever prove that the author thought of them.
// The half that survives this phase is the last block: it reads every file in
// web/content/posts/ and asserts that all of them parse — so the day a
// fifteenth post is written with a quote the reader cannot take off, this goes
// red here rather than dropping a row on the homepage.
//
// lib/content/pipeline.test.ts reads a repository file from a test for the same
// reason and by the same route.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { describe, it } from "node:test";

import { POSTS_DIR, frontmatter, postMeta, readPosts, unquote, type DirReader } from "./posts.ts";

/** A whole file, so the tests below read like the thing they describe. */
function file(body: string): string {
  return `---\n${body}\n---\n\n## Heading\n\nProse.\n`;
}

const GOOD = file(
  [
    "title: 'A title'",
    "deck: 'One line about it.'",
    "published: 2026-09-01",
    "tags: ['css', 'testing']",
    "system: 'timseil-dev'",
    "summary: |",
    "  A paragraph that runs",
    "  over several lines.",
  ].join("\n"),
);

describe("a block that is not a block", () => {
  it("refuses a file with no frontmatter at all", () => {
    assert.equal(frontmatter("## Heading\n\nProse.\n"), null);
  });

  it("refuses a block that is never closed", () => {
    const raw = "---\ntitle: 'A title'\ndeck: 'One line.'\npublished: 2026-09-01\n";
    assert.equal(frontmatter(raw), null, "an unterminated block ate the whole post");
  });

  it("refuses a block that holds no key", () => {
    assert.equal(frontmatter("---\n\n---\n\nProse.\n"), null);
  });
});

describe("the block scalar is stepped over, not read", () => {
  // THE FAILURE THIS TEST IS ABOUT. A summary is prose, and prose contains
  // colons. Without anchoring at the start of the line AND skipping indented
  // runs, the sentence below wins over the real title six lines above it — and
  // the homepage would draw someone's paragraph as a headline.
  it("does not read a key out of a summary", () => {
    const raw = file(
      [
        "title: 'The real title'",
        "deck: 'One line.'",
        "published: 2026-09-01",
        "summary: |",
        "  title: this is a sentence, not a key",
        "  deck: and so is this one",
      ].join("\n"),
    );

    const keys = frontmatter(raw);
    assert.notEqual(keys, null);
    assert.equal(unquote(keys?.get("title") ?? ""), "The real title");
    assert.equal(unquote(keys?.get("deck") ?? ""), "One line.");
  });
});

describe("quotes come off, and nothing else does", () => {
  it("unescapes the doubled single quote that the posts actually use", () => {
    assert.equal(unquote("'the site''s nine stylesheets'"), "the site's nine stylesheets");
  });

  it("leaves a backslash alone, because no file writes one as an escape", () => {
    assert.equal(unquote('"a\\nb"'), "a\\nb");
  });

  it("leaves an unquoted value alone", () => {
    assert.equal(unquote("  2026-09-01  "), "2026-09-01");
  });
});

describe("a file that cannot draw an honest row", () => {
  const cases: readonly (readonly [string, string])[] = [
    ["a missing title", file("deck: 'One line.'\npublished: 2026-09-01")],
    ["an empty title", file("title: ''\ndeck: 'One line.'\npublished: 2026-09-01")],
    ["a missing deck", file("title: 'A title'\npublished: 2026-09-01")],
    ["a missing date", file("title: 'A title'\ndeck: 'One line.'")],
    ["an unparsable date", file("title: 'A title'\ndeck: 'One line.'\npublished: yesterday")],
    // Date rolls this forward to March 2nd rather than refusing it, which is why
    // isDate round-trips instead of trusting the parse.
    ["a day that does not exist", file("title: 'A'\ndeck: 'B'\npublished: 2026-02-30")],
  ];

  for (const [what, raw] of cases) {
    it(`is skipped for ${what}`, () => {
      assert.equal(postMeta("015-a-post.mdx", raw), null);
    });
  }

  it("is skipped for a filename the incidents constraint would reject", () => {
    // The shape is api/migrations/00004_operations.sql's, copied deliberately:
    // a file this accepted but that rejected could never be cited by an incident.
    for (const name of ["a-post.mdx", "15-a-post.mdx", "015_a_post.mdx", "015-A-Post.mdx"]) {
      assert.equal(postMeta(name, GOOD), null, `${name} was accepted`);
    }
    assert.notEqual(postMeta("015-a-post.mdx", GOOD), null);
  });
});

describe("reading a directory", () => {
  function reader(files: Record<string, string>): DirReader {
    return { list: () => Object.keys(files), text: (_dir, file) => files[file] ?? "" };
  }

  it("names what it could not use instead of dropping it", () => {
    const read = readPosts("posts", reader({ "015-good.mdx": GOOD, "016-bad.mdx": "no block" }));

    assert.deepEqual(read.posts.map((post) => post.slug), ["015-good"]);
    assert.deepEqual(read.skipped, ["016-bad.mdx"]);
  });

  it("reads an empty directory as no posts rather than as a failure", () => {
    const read = readPosts("posts", reader({}));

    assert.deepEqual(read.posts, []);
    assert.deepEqual(read.skipped, []);
  });

  // THE ORDER IS NOT THE DATE. Four of the real posts share 2026-09-01, so the
  // date alone leaves three homepage rows to readdir order — two builds, two
  // pages, no edit. The slug is the tiebreak and this is what holds it.
  it("breaks a tie on the same day by the number in the slug", () => {
    const day = (n: string, date: string) =>
      file(`title: 'Post ${n}'\ndeck: 'One line.'\npublished: ${date}`);

    const read = readPosts(
      "posts",
      reader({
        "011-a.mdx": day("11", "2026-09-01"),
        "013-c.mdx": day("13", "2026-09-01"),
        "012-b.mdx": day("12", "2026-09-01"),
        "010-older.mdx": day("10", "2026-08-31"),
      }),
    );

    assert.deepEqual(read.posts.map((post) => post.slug), ["013-c", "012-b", "011-a", "010-older"]);
  });
});

// The half that outlives this phase.
describe("every post in the repository", () => {
  const read = readPosts(POSTS_DIR);
  const onDisk = readdirSync(POSTS_DIR).filter((name) => name.endsWith(".mdx"));

  it("parses, with none skipped", () => {
    assert.deepEqual(read.skipped, [], "a post in the repository cannot be read");
    assert.equal(read.posts.length, onDisk.length);
  });

  it("has a title, a dek and a date in each", () => {
    for (const post of read.posts) {
      assert.ok(post.title.length > 0, `${post.slug} has no title`);
      assert.ok(post.deck.length > 0, `${post.slug} has no dek`);
      assert.match(post.published, /^\d{4}-\d{2}-\d{2}$/, `${post.slug} has no date`);
      // The quotes are off. A row that still carried them would look like a
      // rendering bug and be a parsing one.
      assert.doesNotMatch(post.title, /^['"]/, `${post.slug} kept its quotes`);
    }
  });

  it("comes back newest first", () => {
    const dates = read.posts.map((post) => post.published);
    assert.deepEqual(dates, [...dates].sort().reverse());
  });
});
