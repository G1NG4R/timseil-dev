import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NO_DATA } from "../state/words.ts";
import { POSTS_SOURCE, blogCount, blogEntries, blogLatest } from "./counts.ts";

// The broken case first, and here it is the one this page must never get wrong:
// telling "read, and empty" from "could not be read at all".
describe("a directory that could not be read", () => {
  it("says — NO DATA and not 00", () => {
    // `00` would report a working, empty log while the image is missing its own
    // content. ADR 0062 §4 decided this for the same read on the homepage.
    assert.equal(blogEntries(null), NO_DATA);
  });

  it("says — NO DATA for the latest entry too, so the head cannot half-claim", () => {
    assert.equal(blogLatest(null, false), NO_DATA);
    assert.equal(blogLatest("2026-09-05", false), NO_DATA);
  });
});

describe("a directory that was read and holds nothing", () => {
  it("counts it, because zero is a measurement", () => {
    assert.equal(blogEntries([]), "00");
  });

  it("draws no latest row at all rather than reporting a figure as missing", () => {
    // ADR 0070 §2, on `updated`: a — NO DATA here would say a number is
    // missing, and in truth nothing has happened yet.
    assert.equal(blogLatest(null, true), null);
  });
});

describe("the counter over the list", () => {
  it("states both numbers and its source", () => {
    assert.equal(blogCount(23, 6), `SHOWING 06 OF 23 ENTRIES · SOURCE: ${POSTS_SOURCE}`);
  });

  it("pads both numbers, because the line is drawn in tabular figures", () => {
    assert.match(blogCount(9, 1), /SHOWING 01 OF 09 ENTRIES/);
  });

  it("says 00 of 00 for a log that was read and is empty", () => {
    assert.match(blogCount(0, 0), /^SHOWING 00 OF 00 ENTRIES/);
  });

  it("names a source with no port, which changes nothing about the rule", () => {
    assert.equal(POSTS_SOURCE, "content/posts");
  });
});

describe("a log with entries", () => {
  it("counts them and pads", () => {
    assert.equal(blogEntries(new Array(23).fill(null)), "23");
    assert.equal(blogEntries(new Array(7).fill(null)), "07");
  });

  it("names the newest date it was given", () => {
    assert.equal(blogLatest("2026-09-05", true), "2026-09-05");
  });
});
