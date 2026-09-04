// The contents rail, and the one failure it can have that nothing else reports:
// a link that lands nowhere.
//
// THE ANCHOR ORACLE IS NOT HERE, AND THAT IS DELIBERATE. Asserting that
// `slugger.slug("A")` equals `slugger.slug("A")` would prove that the same
// function agrees with itself. What has to hold is that these ids equal the ones
// `rehype-slug` wrote into the rendered page, and the only place both exist at
// once is the built document — e2e/blog-post.spec.ts follows every rail link to
// an element and fails when one of them resolves to nothing.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { POSTS_DIR } from "./posts.ts";
import { TOC_MINIMUM, showsToc, toc } from "./toc.ts";

function file(body: string): string {
  return `---\ntitle: 'A'\ndeck: 'B'\npublished: 2026-09-01\n---\n\n${body}\n`;
}

describe("what is not a heading", () => {
  // THE BROKEN CASE. Seventy-nine fenced blocks, and shell prompts and comments
  // inside them start with `#`. A rail that numbered `## and then the fix` out
  // of a bash listing would link to an id no heading carries.
  it("does not read a heading out of a fenced block", () => {
    const raw = file(["## Real", "", "```sh", "## not a heading", "```", "", "Prose."].join("\n"));

    assert.deepEqual(toc(raw).map((entry) => entry.text), ["Real"]);
  });

  it("ignores h1 and h3, because the corpus and the sheet are both flat", () => {
    const raw = file(["# One", "## Two", "### Three"].join("\n"));

    assert.deepEqual(toc(raw).map((entry) => entry.text), ["Two"]);
  });

  it("does not read the frontmatter", () => {
    assert.deepEqual(toc(file("Prose only.")), []);
  });
});

describe("what a rail entry says", () => {
  it("numbers from 01, the way the sheet draws it", () => {
    const raw = file(["## One", "## Two", "## Three"].join("\n"));

    assert.deepEqual(toc(raw).map((entry) => entry.number), ["01", "02", "03"]);
  });

  it("takes the inline code marks off the words a reader sees", () => {
    // Three of the 117 headings in the corpus are written this way.
    const raw = file("## `4 containers`");

    assert.deepEqual(toc(raw), [{ number: "01", text: "4 containers", id: "4-containers" }]);
  });

  it("gives two headings with the same words two different ids", () => {
    const raw = file(["## The shape of it", "## The shape of it"].join("\n"));

    assert.deepEqual(toc(raw).map((entry) => entry.id), [
      "the-shape-of-it",
      "the-shape-of-it-1",
    ]);
  });

  it("starts counting again for the next post", () => {
    // A slugger shared between files would number the second post's headings as
    // if they were duplicates of the first post's. Three heading texts do repeat
    // across the corpus.
    const raw = file("## The shape of it");

    assert.equal(toc(raw)[0]?.id, "the-shape-of-it");
    assert.equal(toc(raw)[0]?.id, "the-shape-of-it");
  });
});

describe("whether the rail is drawn at all", () => {
  it("is Ballast below three entries, in the sheet's own word", () => {
    assert.equal(TOC_MINIMUM, 3);
    assert.equal(showsToc([]), false);
    assert.equal(showsToc(toc(file(["## One", "## Two"].join("\n")))), false);
    assert.equal(showsToc(toc(file(["## One", "## Two", "## Three"].join("\n")))), true);
  });
});

describe("every post in the repository", () => {
  const rails = readdirSync(POSTS_DIR)
    .filter((name) => name.endsWith(".mdx"))
    .map((name) => ({ name, entries: toc(readFileSync(join(POSTS_DIR, name), "utf8")) }));

  it("has headings, and none of them lost its id", () => {
    for (const { name, entries } of rails) {
      assert.ok(entries.length > 0, `${name} has no h2 at all`);
      for (const entry of entries) {
        assert.ok(entry.id.length > 0, `${name}: "${entry.text}" slugged to nothing`);
        assert.doesNotMatch(entry.text, /`/, `${name}: "${entry.text}" kept a backtick`);
      }
    }
  });

  it("has unique ids within each post", () => {
    for (const { name, entries } of rails) {
      const ids = entries.map((entry) => entry.id);
      assert.equal(new Set(ids).size, ids.length, `${name} repeats an id`);
    }
  });
});
