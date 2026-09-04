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

import {
  POSTS_DIR,
  frontmatter,
  postMeta,
  readPosts,
  tagList,
  unquote,
  type DirReader,
} from "./posts.ts";

/** A whole file, so the tests below read like the thing they describe. */
function file(body: string): string {
  return `---\n${body}\n---\n\n## Heading\n\nProse.\n`;
}

/** The two keys H9a made mandatory, appended so that a case about a MISSING
 *  title is about a missing title and not about the two keys it forgot. Before
 *  H9a these cases needed no such helper, which is the whole reason it is here
 *  and not inlined. */
function withRequired(body: string): string {
  return file(`${body}\ntags: ['testing']\nsummary: |\n  A paragraph.`);
}

const GOOD = file(
  [
    "title: 'A title'",
    "deck: 'One line about it.'",
    "published: 2026-09-01",
    "tags: ['css', 'testing']",
    "systemId: 'timseil-dev'",
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

describe("the block scalar is read, and its prose is not mistaken for keys", () => {
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
    // And the sentences are still there, as the summary they are.
    assert.equal(
      keys?.get("summary"),
      "title: this is a sentence, not a key\ndeck: and so is this one",
    );
  });

  it("dedents by the block's own indent rather than by a fixed two spaces", () => {
    const raw = file(
      [
        "title: 'A'",
        "deck: 'B'",
        "published: 2026-09-01",
        "summary: |",
        "    four spaces in,",
        "    and a second line.",
      ].join("\n"),
    );

    assert.equal(frontmatter(raw)?.get("summary"), "four spaces in,\nand a second line.");
  });

  it("keeps a blank line inside the block as a blank line", () => {
    const raw = file(
      ["title: 'A'", "deck: 'B'", "summary: |", "  one", "", "  two"].join("\n"),
    );

    assert.equal(frontmatter(raw)?.get("summary"), "one\n\ntwo");
  });

  it("stops the block at the closing fence rather than eating the post", () => {
    const raw = file(["title: 'A'", "deck: 'B'", "summary: |", "  one line"].join("\n"));

    assert.equal(frontmatter(raw)?.get("summary"), "one line");
    assert.equal(unquote(frontmatter(raw)?.get("title") ?? ""), "A");
  });
});

describe("the tag list", () => {
  it("reads the flow sequence the posts actually write", () => {
    assert.deepEqual(tagList("['api', 'rate-limiting', 'design', 'honesty']"), [
      "api",
      "rate-limiting",
      "design",
      "honesty",
    ]);
  });

  it("keeps the author's order rather than sorting it", () => {
    assert.deepEqual(tagList("['testing', 'api']"), ["testing", "api"]);
  });

  // THE BROKEN CASES. Each of these would otherwise become a chip key, a
  // `data-` attribute and one side of a filter comparison, and a tag that does
  // not match itself files a post under a subject nobody can select.
  const refused: readonly (readonly [string, string])[] = [
    ["a tag with a space", "['rate limiting']"],
    ["a capital letter", "['Testing']"],
    ["an empty item", "['api', '']"],
    ["the same tag twice", "['api', 'api']"],
    ["a block sequence, which no file writes", "\n  - api\n  - testing"],
    ["a sequence that was never opened", "'api', 'testing'"],
    ["nothing at all", ""],
  ];

  for (const [what, raw] of refused) {
    it(`refuses ${what}`, () => {
      assert.equal(tagList(raw), null);
    });
  }
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
    ["a missing title", withRequired("deck: 'One line.'\npublished: 2026-09-01")],
    ["an empty title", withRequired("title: ''\ndeck: 'One line.'\npublished: 2026-09-01")],
    ["a missing deck", withRequired("title: 'A title'\npublished: 2026-09-01")],
    ["a missing date", withRequired("title: 'A title'\ndeck: 'One line.'")],
    ["an unparsable date", withRequired("title: 'A'\ndeck: 'B'\npublished: yesterday")],
    // Date rolls this forward to March 2nd rather than refusing it, which is why
    // isDate round-trips instead of trusting the parse.
    ["a day that does not exist", withRequired("title: 'A'\ndeck: 'B'\npublished: 2026-02-30")],

    // H9a's five. The post page draws TAGS and SUMMARY and the sheet calls both
    // mandatory, so a file without them is a page with a labelled hole in it.
    ["a missing tag list", file("title: 'A'\ndeck: 'B'\npublished: 2026-09-01\nsummary: |\n  P.")],
    [
      "an empty tag list",
      file("title: 'A'\ndeck: 'B'\npublished: 2026-09-01\ntags: []\nsummary: |\n  P."),
    ],
    [
      "a missing summary",
      file("title: 'A'\ndeck: 'B'\npublished: 2026-09-01\ntags: ['testing']"),
    ],
    [
      "a summary whose block is empty",
      file("title: 'A'\ndeck: 'B'\npublished: 2026-09-01\ntags: ['testing']\nsummary: |"),
    ],
    // Present-and-broken, which is the case the optional key still has to refuse:
    // absent means "never revised", `soon` means a claim nothing can check.
    [
      "an updated date that is not a date",
      withRequired("title: 'A'\ndeck: 'B'\npublished: 2026-09-01\nupdated: soon"),
    ],
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
      withRequired(`title: 'Post ${n}'\ndeck: 'One line.'\npublished: ${date}`);

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

  // #192's acceptance, in one assertion: the thing that renders a post is the
  // thing that validates its frontmatter, and it now reaches every key.
  it("has the tags and the summary the post page draws", () => {
    for (const post of read.posts) {
      assert.ok(post.tags.length > 0, `${post.slug} has no tags`);
      assert.ok(post.summary.length > 0, `${post.slug} has no summary`);
      // A summary that fits on one line is a dek written twice. The sheet asks
      // for two to three sentences; this only refuses the degenerate case.
      assert.ok(
        post.summary.length > post.deck.length / 2,
        `${post.slug} has a summary shorter than half its dek`,
      );
    }
  });

  // NOT AN ASSERTION, A MEASUREMENT. The Blog Post sheet's Bausteine table says
  // a title is "max 58 Zeichen, sonst bricht er mobil dreizeilig", and two of
  // the titles in this repository are longer. They are published; the rule
  // arrived after they were written, and shortening a published headline to
  // satisfy a drawing is the tail wagging the dog. So the number is reported
  // and styles/blog.css carries the three-line break — but the count is held,
  // so a THIRD one is a decision somebody makes rather than a drift.
  it("has at most two titles over the sheet's 58 characters", () => {
    const long = read.posts.filter((post) => post.title.length > 58).map((post) => post.slug);
    assert.deepEqual(long, [
      "015-the-run-was-green-and-it-reused-my-own-server",
      "007-two-sheets-drew-the-same-row-differently",
    ]);
  });

  it("comes back newest first", () => {
    const dates = read.posts.map((post) => post.published);
    assert.deepEqual(dates, [...dates].sort().reverse());
  });
});
