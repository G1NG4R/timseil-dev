import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Incident } from "../api/systems.ts";
import { POSTS_DIR, readPosts, type PostMeta } from "../content/posts.ts";

import { postMortemHrefs } from "./postmortem.ts";

function incident(id: string, postSlug: string): Incident {
  return {
    id,
    startedAt: "2026-08-25T02:14:00Z",
    durationSec: 2520,
    cause: "the migration held a lock the api was already waiting on",
    fix: "lock_timeout on the migration role, and the deploy rolled back",
    postSlug,
  };
}

function meta(slug: string): PostMeta {
  return {
    slug,
    title: `Title ${slug}`,
    deck: "One line.",
    published: "2026-09-01",
    systemId: "timseil-dev",
    tags: ["testing"],
    summary: "One paragraph.",
    updated: null,
  };
}

/** A corpus of exactly the slugs named, and nothing else. */
function corpus(...slugs: readonly string[]) {
  const held = new Set(slugs);
  return (slug: string): PostMeta | null => (held.has(slug) ? meta(slug) : null);
}

// THE BROKEN CASE FIRST, and here it is not hypothetical: every post_slug this
// project can produce today names a file that is not there. The fixture says so
// in its own comment, and it is the row a developer sees.
describe("a post-mortem the repository has never held", () => {
  it("is absent from the map rather than present and wrong", () => {
    const hrefs = postMortemHrefs([incident("INC-001", "001-fixture-outage")], "en", corpus());

    assert.equal(hrefs.size, 0);
    assert.equal(hrefs.get("001-fixture-outage"), undefined);
  });

  it("does not take the resolvable ones down with it", () => {
    // The half that matters on a page with more than one notch: one unwritten
    // post-mortem must not cost the other its link.
    const hrefs = postMortemHrefs(
      [incident("INC-001", "001-fixture-outage"), incident("INC-002", "011-a-real-entry")],
      "en",
      corpus("011-a-real-entry"),
    );

    assert.deepEqual([...hrefs.keys()], ["011-a-real-entry"]);
  });

  it("survives a system that was never asked", () => {
    // `null` is "no answer came back", which is not the same as an empty window
    // — lib/api/systems.ts keeps the two apart and so does this.
    assert.equal(postMortemHrefs(null, "en", corpus("011-a-real-entry")).size, 0);
    assert.equal(postMortemHrefs([], "en", corpus("011-a-real-entry")).size, 0);
  });
});

describe("a post-mortem that is in the repository", () => {
  it("gets the address the entry itself answers to", () => {
    const hrefs = postMortemHrefs([incident("INC-001", "011-a-real-entry")], "en", corpus("011-a-real-entry"));

    // Built out of `postPath`, which is the one place on this site that decides
    // what a post's address is. English carries no prefix.
    assert.equal(hrefs.get("011-a-real-entry"), "/blog/011-a-real-entry");
  });

  it("carries the locale of the page that asked", () => {
    const hrefs = postMortemHrefs([incident("INC-001", "011-a-real-entry")], "de", corpus("011-a-real-entry"));

    assert.equal(hrefs.get("011-a-real-entry"), "/de/blog/011-a-real-entry");
  });

  it("looks a repeated slug up once and answers it twice", () => {
    // Two notches can cite one post-mortem. The map is keyed by slug so that
    // stays one answer, and the reader is not opened a second time for it.
    let reads = 0;
    const held = corpus("011-a-real-entry");
    const counted = (slug: string) => {
      reads += 1;
      return held(slug);
    };

    const hrefs = postMortemHrefs(
      [incident("INC-001", "011-a-real-entry"), incident("INC-002", "011-a-real-entry")],
      "en",
      counted,
    );

    assert.equal(reads, 1);
    assert.equal(hrefs.size, 1);
  });
});

// The half that outlives this phase, and the reason the default argument is
// `postFor` rather than something a caller must remember to pass.
describe("the reader the page actually uses", () => {
  it("resolves an entry this repository holds right now", () => {
    const posts = readPosts(POSTS_DIR).posts;
    assert.ok(posts.length > 0, "the corpus is empty");

    const newest = posts[0];
    const hrefs = postMortemHrefs([incident("INC-001", newest.slug)], "en");
    assert.equal(hrefs.get(newest.slug), `/blog/${newest.slug}`);
  });
});
