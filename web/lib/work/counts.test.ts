import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SystemList } from "../api/systems.ts";

import { listed, statusCounts, workCount, workMeta } from "./counts.ts";

/** The two rows the seed produces, in the answer's order. */
const SEEDED = {
  systems: [
    { slug: "vat-check", systemNo: "01", name: "VAT Check API", state: "queued" },
    { slug: "timseil-dev", systemNo: "02", name: "timseil.dev", state: "live" },
  ],
  generatedAt: "2026-09-02T00:00:00Z",
} as unknown as SystemList;

// The broken case first, and for a counter it is the one where a zero would be
// a lie rather than a measurement.
describe("a body that never said how many systems there are", () => {
  it("refuses to count an answer that did not arrive", () => {
    assert.equal(workMeta(null), "— NO DATA · FIGURES FROM /api/systems");
  });

  it("refuses to count an answer whose list is missing or not a list", () => {
    // ADR 0035's overlapping start: the shape on the wire can be a build this
    // one does not know. `SHOWING 00 OF 00` here would claim the api answered
    // and there are no systems, which is not what happened.
    for (const systems of [undefined, null, "two", 2, {}]) {
      assert.equal(
        workMeta({ systems, generatedAt: "x" } as unknown as SystemList),
        "— NO DATA · FIGURES FROM /api/systems",
      );
    }
  });

  it("counts an empty list as a measurement, because it is one", () => {
    // THE THIRD CASE, and the one that separates this from the two above. The
    // api answered and said there are none.
    assert.equal(
      workMeta({ systems: [], generatedAt: "x" }),
      "SHOWING 00 OF 00 · FIGURES FROM /api/systems",
    );
  });

  it("keeps naming its source even when it cannot count", () => {
    // The head that is still waiting names what it is waiting for — the reason
    // the counter is inside the streamed region at all.
    assert.match(workMeta(null), /FIGURES FROM \/api\/systems$/);
  });
});

describe("the counter counts the rows and not the array", () => {
  it("reads the seed as two of two", () => {
    assert.equal(workMeta(SEEDED), "SHOWING 02 OF 02 · FIGURES FROM /api/systems");
  });

  it("drops a row with no slug from both numbers", () => {
    // `systemRows` refuses a row whose slug is missing — the slug is what
    // decides whether the row leads anywhere. The counter has to agree with the
    // list under it, so it counts what was rendered rather than what arrived.
    const body = {
      systems: [{ slug: "timseil-dev", state: "live" }, { state: "live" }],
      generatedAt: "x",
    } as unknown as SystemList;

    assert.equal(workMeta(body), "SHOWING 01 OF 01 · FIGURES FROM /api/systems");
  });

  it("pads to two digits, as every number on this page does", () => {
    assert.match(workMeta({ systems: [], generatedAt: "x" }), /SHOWING 00 OF 00/);
  });
});

describe("the counter line the island writes", () => {
  // H6b. `workCount` is the same sentence from two numbers instead of from an
  // answer, because the island has the rows and no body. Both callers going
  // through it is what stops `FIGURES FROM` becoming `SOURCE:` on one of them.
  it("narrows the first number and keeps the second", () => {
    assert.equal(workCount(2, 1), "SHOWING 01 OF 02 · FIGURES FROM /api/systems");
  });

  it("says nought without saying nothing", () => {
    // A filter that matched nothing is a measurement over an answer that
    // exists — which is why this is a different sentence from `— NO DATA`.
    assert.equal(workCount(2, 0), "SHOWING 00 OF 02 · FIGURES FROM /api/systems");
  });

  it("pads both numbers past nine", () => {
    assert.equal(workCount(12, 10), "SHOWING 10 OF 12 · FIGURES FROM /api/systems");
  });
});

describe("the tiles and the counter make one claim, not two", () => {
  // THE BUG THIS GUARDS AGAINST WAS SHIPPED AND SEEN. With no api the stat rail
  // read `00 SYSTEMS` while the counter under it read `— NO DATA` — the same
  // answer described twice, once honestly. `00` is a measurement; the tiles had
  // not made one.
  it("agrees with workMeta about whether anything countable arrived", () => {
    for (const body of [null, { generatedAt: "x" }, { systems: "two", generatedAt: "x" }]) {
      const answered = listed(body as unknown as SystemList);

      assert.equal(answered, false);
      assert.match(workMeta(body as unknown as SystemList), /^— NO DATA/);
    }
  });

  it("calls an empty list an answer, because it is one", () => {
    assert.equal(listed({ systems: [], generatedAt: "x" }), true);
    assert.match(workMeta({ systems: [], generatedAt: "x" }), /^SHOWING 00 OF 00/);
  });
});

describe("the stat rail tallies the states the contract declares", () => {
  it("reads the seed as two systems, one live, none building, one queued", () => {
    assert.deepEqual(statusCounts([{ state: "queued" }, { state: "live" }]), {
      all: 2,
      live: 1,
      in_build: 0,
      queued: 1,
    });
  });

  it("keeps a zero for a state nothing is in", () => {
    // `IN BUILD 00` is a tile and a chip on purpose: `SystemState` declares the
    // value for ever, so the possibility is stated whether or not a row
    // occupies it today. lib/work/stacks.ts makes the opposite call for a
    // vocabulary that has no enum behind it.
    assert.equal(statusCounts([{ state: "live" }]).in_build, 0);
  });

  it("counts a row this build has no word for in the total and nowhere else", () => {
    // The four numbers are then not required to add up, and that is a true
    // statement about the answer rather than an arithmetic bug: the row exists
    // and this build cannot say what it is.
    const counts = statusCounts([{ state: "live" }, { state: null }]);

    assert.equal(counts.all, 2);
    assert.equal(counts.live + counts.in_build + counts.queued, 1);
  });

  it("is all zeroes for an empty list, without dividing by anything", () => {
    assert.deepEqual(statusCounts([]), { all: 0, live: 0, in_build: 0, queued: 0 });
  });
});
