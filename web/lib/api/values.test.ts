import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { finiteNumber, nonEmpty, padTwo } from "./values.ts";

// The two guards had their assertions spread across health.test.ts and
// systems.test.ts, where each reader checked the guard through its own function.
// `padTwo` arrived in H5a with no such home — and it arrived BECAUSE two copies
// of it had already drifted, which is exactly the thing a test here holds shut.

describe("the guards refuse what is not a value", () => {
  it("reads a string, and an empty one is not an identity", () => {
    assert.equal(nonEmpty("timseil-dev"), "timseil-dev");
    for (const value of ["", null, undefined, 0, 42, {}, []]) {
      assert.equal(nonEmpty(value), null);
    }
  });

  it("reads a finite number, and puts undefined where null goes", () => {
    assert.equal(finiteNumber(0), 0, "zero is a measurement");
    assert.equal(finiteNumber(99.98), 99.98);
    for (const value of [null, undefined, NaN, Infinity, -Infinity, "42", {}]) {
      assert.equal(finiteNumber(value), null);
    }
  });
});

describe("two digits, and one copy of the rule", () => {
  it("pads a single digit and leaves the rest alone", () => {
    assert.equal(padTwo(0), "00");
    assert.equal(padTwo(2), "02");
    assert.equal(padTwo(9), "09");
    assert.equal(padTwo(10), "10");
    assert.equal(padTwo(22), "22");
  });

  // THE DRIFT THIS FUNCTION EXISTS BECAUSE OF. Before H5a merged them, the copy
  // in training.ts clamped a negative number and the one written for systems.ts
  // did not — so one produced `-1` and the other `0-1`. Neither is an ordinal;
  // the point is that the two had already stopped agreeing about the same
  // question before anyone read them side by side.
  it("does not pad a number that is not an ordinal", () => {
    assert.equal(padTwo(-1), "-1");
  });

  // It stops at two on purpose: a hundredth system is a nicer problem than a
  // mis-aligned column.
  it("stops at two rather than growing the column", () => {
    assert.equal(padTwo(100), "100");
  });
});
