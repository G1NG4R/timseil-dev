import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ANY_STACK,
  type Axis,
  NO_FILTER,
  activeLabels,
  applyFilter,
  isFiltered,
  matches,
} from "./filter.ts";

/** The gallery's three systems, reduced to what the axes read. */
const ROWS = [
  { slug: "vat-check", st: "queued", sk: ["python", "fastapi", "docker", "sqlite"] },
  { slug: "timseil-dev", st: "live", sk: ["next.js", "react", "go", "postgresql"] },
  { slug: "not-a-real-system", st: "in_build", sk: ["go"] },
] as const;

const slugs = (axis: Axis) => applyFilter(ROWS, axis).map((row) => row.slug);

// THE BROKEN CASE FIRST, and for a filter it is the row this build has no word
// for. `systemStateWord` answers `null` for a state the contract gains later,
// and `statusCounts` already decided what that means: counted in `all`, claimed
// by no tile. A filter that let LIVE swallow it would be the same row making a
// claim nothing measured.
describe("a row whose state this build cannot name", () => {
  const unknown = { st: null, sk: ["go"] };

  it("survives no status chip but the sentinel", () => {
    for (const status of ["live", "in_build", "queued"] as const) {
      assert.equal(matches(unknown, { status, stack: ANY_STACK }), false);
    }
  });

  it("is still in the unfiltered list, because the api sent it", () => {
    assert.equal(matches(unknown, NO_FILTER), true);
  });

  it("is still reachable through the other axis", () => {
    // The two axes are independent. A row with no word still has a stack, and
    // dropping it from GO would be this page hiding a system it was told about.
    assert.equal(matches(unknown, { status: "all", stack: "go" }), true);
  });
});

describe("a row with nothing in its stack", () => {
  const bare = { st: "live" as const, sk: [] };

  it("survives the sentinel and no stack chip", () => {
    assert.equal(matches(bare, NO_FILTER), true);
    assert.equal(matches(bare, { status: "all", stack: "go" }), false);
  });
});

describe("the stack match is whole-token", () => {
  // stacks.ts guarantees a key holds no separator, and this is the assertion
  // that the match honours it. A substring test would make GO select SQLite's
  // neighbour and SQL select SQLITE — three of the sheet's five drawn chips
  // were already dead controls, and this is the other way to get a wrong row.
  it("does not match a key that merely starts the same", () => {
    const row = { st: "live" as const, sk: ["golang", "sqlite", "postgresql"] };

    assert.equal(matches(row, { status: "all", stack: "go" }), false);
    assert.equal(matches(row, { status: "all", stack: "sql" }), false);
    assert.equal(matches(row, { status: "all", stack: "postgres" }), false);
  });

  it("matches the key itself", () => {
    const row = { st: "live" as const, sk: ["golang"] };
    assert.equal(matches(row, { status: "all", stack: "golang" }), true);
  });
});

describe("the two axes narrow together", () => {
  it("passes everything through when neither is set", () => {
    assert.deepEqual(slugs(NO_FILTER), ["vat-check", "timseil-dev", "not-a-real-system"]);
  });

  it("keeps the answer's order rather than the filter's", () => {
    // `ListSystems` ends with ORDER BY s.system_no and the row prints that
    // number, so a filtered list that reordered would print 02 above 01.
    assert.deepEqual(slugs({ status: "all", stack: "go" }), ["timseil-dev", "not-a-real-system"]);
  });

  it("ANDs the two axes rather than ORing them", () => {
    assert.deepEqual(slugs({ status: "live", stack: "go" }), ["timseil-dev"]);
  });

  it("reaches zero on a combination neither axis reaches alone", () => {
    // THE COMBINATION THE EMPTY PANEL EXISTS FOR. Both chips select rows on
    // their own — LIVE has one, PYTHON has one — and together they have none.
    // A derived stack vocabulary can never produce an empty chip by itself, so
    // this is the only way `/work` reaches nought, and it is reachable.
    assert.equal(matches(ROWS[0], { status: "live", stack: "python" }), false);
    assert.deepEqual(slugs({ status: "live", stack: "python" }), []);
  });

  it("counts nothing out of nothing", () => {
    assert.deepEqual(applyFilter([], { status: "live", stack: "go" }), []);
  });
});

describe("isFiltered", () => {
  it("is false only when both axes are on their sentinel", () => {
    assert.equal(isFiltered(NO_FILTER), false);
    assert.equal(isFiltered({ status: "live", stack: ANY_STACK }), true);
    assert.equal(isFiltered({ status: "all", stack: "go" }), true);
    assert.equal(isFiltered({ status: "live", stack: "go" }), true);
  });
});

describe("the labels the empty panel echoes back", () => {
  const statusChips = [
    { key: "all", label: "ALL" },
    { key: "live", label: "LIVE" },
    { key: "in_build", label: "IN BUILD" },
    { key: "queued", label: "QUEUED" },
  ];
  const stackChips = [
    { key: "go", label: "Go" },
    { key: "python", label: "Python" },
  ];

  it("says nothing when nothing is narrowing", () => {
    assert.deepEqual(activeLabels(NO_FILTER, statusChips, stackChips), []);
  });

  it("names one axis when one is set", () => {
    assert.deepEqual(activeLabels({ status: "live", stack: ANY_STACK }, statusChips, stackChips), [
      "LIVE",
    ]);
    assert.deepEqual(activeLabels({ status: "all", stack: "go" }, statusChips, stackChips), ["Go"]);
  });

  it("names both, status first, because that is the order they are drawn in", () => {
    assert.deepEqual(activeLabels({ status: "live", stack: "python" }, statusChips, stackChips), [
      "LIVE",
      "Python",
    ]);
  });

  it("falls back to the key when no chip carries it", () => {
    // Not reachable from the control, which only sets keys it drew. Reachable
    // from a stale value, and a panel that named one filter instead of two
    // would be explaining the emptiness with half its cause.
    assert.deepEqual(activeLabels({ status: "all", stack: "rust" }, statusChips, stackChips), [
      "rust",
    ]);
  });

  it("reads the word off the chip rather than spelling one here", () => {
    // ADR 0063: `IN BUILD` in the tile, the chip and the legend. The sheet
    // writes BUILD in two of the three, and one word per state is what
    // words.ts exists to hold.
    assert.deepEqual(
      activeLabels({ status: "in_build", stack: ANY_STACK }, statusChips, stackChips),
      ["IN BUILD"],
    );
  });
});
