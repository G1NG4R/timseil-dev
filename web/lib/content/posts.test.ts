// The frontmatter reader, against the files it will actually be given and
// against the ones it must refuse.
//
// EVERY CASE HERE IS INVENTED, AND UNTIL U2 THAT WAS ONLY HALF THE FILE. The
// other half read web/content/posts/ and asserted that all of it parses. The
// directory is empty since U2, so that half is gone and the block where it stood
// says why — an invented case proves that the author thought of it, and a block
// over an empty directory does not even prove that.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  frontmatter,
  hasLog,
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

describe("a mark that has no renderer comes off too", () => {
  // THE BEHAVIOUR, ASSERTED WHERE IT CAN FAIL. The corpus check further down
  // holds the OUTPUT clean, which for a dek is true by construction; this holds
  // the transformation itself, so removing the call would go red here rather
  // than nowhere.
  it("takes the backticks out of a dek", () => {
    const raw = file(
      [
        "title: 'A title'",
        "deck: 'a rate-limit line as `retry in 6s`'",
        "published: 2026-09-01",
        "tags: ['api']",
        "summary: |",
        "  and `2/3` is just arithmetic.",
      ].join("\n"),
    );

    const post = postMeta("015-a-post.mdx", raw);
    if (post === null) throw new Error("the fixture did not parse");

    assert.equal(post.deck, "a rate-limit line as retry in 6s");
    assert.equal(post.summary, "and 2/3 is just arithmetic.");
  });

  // AND THE TITLE IS LEFT ALONE, which is the asymmetry worth stating. A dek and
  // a summary are prose and the marks in them are a mistake; a title written as
  // code would be an authoring decision, and the corpus test below is what would
  // put it in front of somebody rather than rewriting it in silence.
  it("leaves a title as it was written", () => {
    const raw = file(
      [
        "title: '`4 containers`'",
        "deck: 'One line.'",
        "published: 2026-09-01",
        "tags: ['api']",
        "summary: |",
        "  A paragraph.",
      ].join("\n"),
    );

    const post = postMeta("015-a-post.mdx", raw);
    if (post === null) throw new Error("the fixture did not parse");

    assert.equal(post.title, "`4 containers`");
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

// THE BLOCK THAT USED TO STAND HERE READ EVERY FILE IN web/content/posts/ AND
// ASSERTED THAT ALL OF THEM PARSE. U2 emptied that directory (ADR 0079: the log
// is Tim's to write), and a block that iterates nothing passes without checking
// anything — which is the defect
// `010-two-tests-were-green-because-nothing-was-there` was written about, now
// applied to its own deletion. What it asserted about PROSE — that two titles
// exceed the sheet's 58 characters, that no summary is half a dek — were
// measurements of files that no longer exist. What it asserted about the READER
// is below, against fixtures, where it runs.
//
// The frontmatter guard over the real directory therefore does not exist while
// the directory is empty. That is a cost and it is written down in backlog.md
// rather than papered over with a block that would report success either way.

describe("a file that could not be an entry", () => {
  function reader(files: Record<string, string>): DirReader {
    return { list: () => Object.keys(files), text: (_dir, file) => files[file] ?? "" };
  }

  // THE DIRECTORY HOLDS A README.mdx SINCE U2, and it is there so that git keeps
  // the directory, the compose mount finds a path, the tracer copies something
  // and the bundler context in app/[lang]/blog/[slug]/page.tsx resolves. It is
  // an `.mdx` because the context is scoped to `*.mdx` — and a reader that
  // called it a broken post logged a WARN, which calls `new Date()`, which under
  // Cache Components is an unstable value in a prerender. The homepage stopped
  // building over a README. `skipped` means "somebody wrote an entry and nobody
  // can see it"; a file that could never be an entry does not belong in it.
  it("is neither a post nor a file that was skipped", () => {
    const read = readPosts("posts", reader({ "README.mdx": "# The log", "015-good.mdx": GOOD }));

    assert.deepEqual(read.posts.map((post) => post.slug), ["015-good"]);
    assert.deepEqual(read.skipped, []);
  });

  it("still names an entry it cannot read", () => {
    const read = readPosts("posts", reader({ "README.mdx": "# x", "016-bad.mdx": "no block" }));

    assert.deepEqual(read.posts, []);
    assert.deepEqual(read.skipped, ["016-bad.mdx"]);
  });

  // THE FINDING H9a MADE, KEPT AS A PROPERTY OF THE READER INSTEAD OF AS A SWEEP
  // OVER PROSE — and moving it is what showed that it was never quite the
  // property it claimed. Frontmatter never reaches remark, so a backtick there
  // has no renderer, and lib/content/body.ts strips the marks at read time: from
  // `deck` and from `summary`. NOT from `title`, which `postMeta` only unquotes.
  // The old sweep asserted all three and was green because no title in the
  // corpus happened to carry one — a statement about twenty-five files, not
  // about the reader. Asserted here is what the reader does; the gap is in
  // backlog.md, because closing it is a change to what a future title renders
  // and this phase deletes posts rather than changing how one is read.
  it("strips the marks from the two strings it passes through plainText", () => {
    const meta = postMeta(
      "015-a-post.mdx",
      file(
        "title: 'A title'\ndeck: 'A `code` dek.'\npublished: 2026-09-01\n" +
          "tags: ['testing']\nsummary: |\n  A `code` paragraph.",
      ),
    );

    assert.notEqual(meta, null);
    assert.doesNotMatch(meta?.deck ?? "", /`/);
    assert.doesNotMatch(meta?.summary ?? "", /`/);
  });
});

// The gate U2 hangs on this reader: four surfaces ask it, and they must agree.
describe("whether this site has a log", () => {
  const entry = postMeta("015-a-post.mdx", GOOD);
  assert.notEqual(entry, null, "the fixture this file builds every case from stopped parsing");
  const one = { posts: entry === null ? [] : [entry], skipped: [] };

  it("says no for a directory that was read and holds nothing", () => {
    assert.equal(hasLog({ posts: [], skipped: [] }), false);
  });

  it("says yes for one entry", () => {
    assert.equal(hasLog(one), true);
  });

  // THE ONE THAT IS NOT OBVIOUS, AND THE REASON IT IS WRITTEN DOWN. `null` is a
  // directory that could not be read — an image shipped without its own content.
  // Counting it as "no log" would make the navigation entry and SYS.04 vanish on
  // a broken deploy, silently, together with the `— NO DATA` panel that exists
  // to report exactly that. The gate hides an empty truth, never a fault.
  it("says yes for a directory it could not read, so nothing hides a broken image", () => {
    assert.equal(hasLog(null), true);
  });
});
