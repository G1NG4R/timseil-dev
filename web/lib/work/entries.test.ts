import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SystemList } from "../api/systems.ts";
import type { PostMeta } from "../content/posts.ts";
import { en } from "../i18n/messages/en.ts";

import { workEntries } from "./entries.ts";

/**
 * The answer the seed produces, transcribed from api/internal/seed/seed.sql and
 * api/internal/seed/stack.gen.json.
 *
 * `metrics` is all `null` for the reason it is null in production: seed.sql
 * writes no measurements, because a measurement a seed writes is an invented
 * number (ADR 0013).
 */
const SEEDED = {
  systems: [
    {
      slug: "vat-check",
      systemNo: "01",
      name: "VAT Check API",
      state: "queued",
      source: { access: "private", reason: "internal" },
      stack: ["Python", "FastAPI", "Docker", "SQLite"],
      metrics: { uptime90d: null, p95Ms: null, errorRate: null, measuredAt: null },
    },
    {
      slug: "timseil-dev",
      systemNo: "02",
      name: "timseil.dev",
      state: "live",
      source: { access: "public", url: "https://github.com/G1NG4R/timseil-dev" },
      stack: ["Next.js 16.3", "Go 1.26", "PostgreSQL 18.6"],
      metrics: { uptime90d: null, p95Ms: null, errorRate: null, measuredAt: null },
    },
  ],
  generatedAt: "2026-09-02T00:00:00Z",
} as unknown as SystemList;

const POST: PostMeta = {
  slug: "000-x",
  title: "X",
  deck: "d",
  published: "2026-08-23",
  systemId: "timseil-dev",
  tags: ["testing"],
  summary: "One paragraph.",
  updated: null,
};

const POSTS: readonly PostMeta[] = [
  { ...POST, slug: "001-a", title: "A", published: "2026-08-23" },
  { ...POST, slug: "002-b", title: "B", published: "2026-08-24" },
];

// The broken case first: an answer that is not the answer the contract promised.
// ADR 0035's overlapping start makes every one of these reachable.
describe("an answer this build cannot fully read", () => {
  it("draws no rows at all when nothing arrived", () => {
    assert.deepEqual(workEntries(null, POSTS, en), []);
  });

  it("drops a row with no slug rather than rendering one that leads nowhere", () => {
    // `systemRows` refuses it, and this must agree: the slug decides whether
    // the row has a destination, a log count and a `YOU ARE HERE`, so a row
    // without one has nothing to draw.
    const body = { systems: [{ state: "live" }], generatedAt: "x" } as unknown as SystemList;

    assert.deepEqual(workEntries(body, POSTS, en), []);
  });

  it("keeps a row whose stack and metrics are missing", () => {
    const body = {
      systems: [{ slug: "vat-check", state: "queued" }],
      generatedAt: "x",
    } as unknown as SystemList;
    const [row] = workEntries(body, POSTS, en);

    assert.deepEqual(row.tags, []);
    assert.equal(row.figure, null);
    assert.equal(row.logLine, null);
  });

  it("takes the first of two rows sharing a slug", () => {
    // `systems.slug` is unique in the database, so a duplicate on the wire is a
    // build disagreeing with itself. Taking the first matches the order the
    // list is drawn in rather than letting the later row silently win.
    const body = {
      systems: [
        { slug: "timseil-dev", state: "live", stack: ["Go 1.26"] },
        { slug: "timseil-dev", state: "live", stack: ["Rust 1.90"] },
      ],
      generatedAt: "x",
    } as unknown as SystemList;

    assert.deepEqual(
      workEntries(body, POSTS, en)[0].tags.map((tag) => tag.key),
      ["go"],
    );
  });
});

describe("the two rows the seed produces", () => {
  const rows = workEntries(SEEDED, POSTS, en);

  it("keeps the api's order, which is the order of the numbers", () => {
    assert.deepEqual(
      rows.map((row) => row.no),
      ["01", "02"],
    );
  });

  it("links only the system that has a page", () => {
    // content/case-studies/index.ts holds the argument: a system is not a case
    // study. `/work/vat-check` is a 404, so a row that linked there would be a
    // promise the router refuses.
    assert.equal(rows[0].href, null);
    assert.equal(rows[1].href, "/work/timseil-dev");
  });

  it("marks exactly one row as the site the reader is on", () => {
    assert.deepEqual(
      rows.map((row) => row.here),
      [false, true],
    );
  });

  it("gives a figure only to the live row, and no cell to the other", () => {
    // The distinction the whole page turns on. `queued` gets no cell — nobody
    // measures the uptime of a system that is not running; `live` keeps its
    // label with an empty value, because that measurement was attempted and has
    // not arrived.
    assert.equal(rows[0].figure, null);
    assert.deepEqual(rows[1].figure, { label: "UPTIME · 91 D", value: null, unit: "%" });
  });

  it("counts log entries per system and says nothing where there are none", () => {
    assert.equal(rows[0].logLine, null);
    assert.equal(rows[1].logLine, "02 ENTRIES IN THE LOG");
  });

  it("carries the printed stack and the filter tokens side by side", () => {
    // Two jobs for one array. The line keeps its versions because the page
    // shows them; the tokens drop them because a filter keyed on `go-1-26`
    // would go stale the next time Go ships.
    assert.equal(rows[1].stack, "Next.js 16.3 · Go 1.26 · PostgreSQL 18.6");
    assert.deepEqual(
      rows[1].tags.map((tag) => tag.key),
      ["next.js", "go", "postgresql"],
    );
  });

  it("carries the blurb only for the system somebody wrote one about", () => {
    // ADR 0055: a thing nobody will ever write gets no cell, not `— NO DATA`.
    assert.equal(rows[0].blurb, null);
    assert.equal(typeof rows[1].blurb, "string");
  });
});
