import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BURST_LOCK_MS, canBurst, shouldBurst } from "./burst.ts";

describe("canBurst holds the 600 ms the sheet asks for", () => {
  it("lets the first one through", () => {
    assert.equal(canBurst(null, 0), true);
  });

  it("holds the lock for exactly the stated window", () => {
    assert.equal(canBurst(1000, 1000 + BURST_LOCK_MS - 1), false);
    assert.equal(canBurst(1000, 1000 + BURST_LOCK_MS), true);
  });
});

describe("what a clock may do and what it may not prove", () => {
  it("keeps the lock when the clock ran backwards", () => {
    // `performance.now()` is monotonic and cannot do this. A caller passing
    // `Date.now()` on a machine whose clock is being corrected can, and the
    // alternative to holding the lock is a burst on every frame until the clock
    // catches up.
    assert.equal(canBurst(1000, 400), false);
  });

  it("refuses to decide on a clock that is not a number", () => {
    // Both, and `Infinity` is the one worth stating: it would satisfy any
    // `>= BURST_LOCK_MS` comparison and release the lock for ever after.
    assert.equal(canBurst(1000, Number.NaN), false);
    assert.equal(canBurst(1000, Number.POSITIVE_INFINITY), false);
  });
});

describe("shouldBurst asks whether anything actually changed", () => {
  it("does not fire on the first value a component ever sees", () => {
    // Otherwise every page load glitches once, which is decoration pretending
    // to be a signal.
    assert.equal(shouldBurst(null, "degraded", null, 0), false);
  });

  it("does not fire on the same answer arriving again", () => {
    assert.equal(shouldBurst("online", "online", null, 10_000), false);
  });

  it("fires on a real transition", () => {
    assert.equal(shouldBurst("online", "degraded", null, 10_000), true);
  });

  it("still obeys the lock on a real transition", () => {
    assert.equal(shouldBurst("online", "degraded", 10_000, 10_100), false);
    assert.equal(shouldBurst("online", "degraded", 10_000, 10_600), true);
  });
});
