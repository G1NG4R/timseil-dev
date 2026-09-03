import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deadlineSecond, retryLine, secondsLeft, waitLine } from "./retry.ts";

describe("retryLine", () => {
  it("writes the line the sheet draws", () => {
    assert.equal(retryLine(30, 2, 5), "retry in 30s · 2/5");
  });

  it("floors the wait rather than rounding it", () => {
    // A promise kept early is fine; one broken by a second is not.
    assert.equal(retryLine(29.9, 1, 3), "retry in 29s · 1/3");
    assert.equal(retryLine(0, 1, 3), "retry in 0s · 1/3");
  });
});

// Every case below returns `null`, and the caller draws no line at all. An
// error panel that says less is not a worse panel; one that prints a countdown
// nothing is counting is invariant 1 broken in a monospace font.
describe("what would print a lie prints nothing", () => {
  it("refuses a countdown running backwards", () => {
    assert.equal(retryLine(-1, 1, 3), null);
    assert.equal(retryLine(Number.NaN, 1, 3), null);
    assert.equal(retryLine(Number.POSITIVE_INFINITY, 1, 3), null);
  });

  it("refuses an attempt past the last one", () => {
    // `6/5` means the retries are over. The panel then owes a final state, not
    // a counter that keeps climbing.
    assert.equal(retryLine(30, 6, 5), null);
    assert.equal(retryLine(30, 0, 5), null);
  });

  it("refuses a policy that is not one", () => {
    assert.equal(retryLine(30, 1, 0), null);
    assert.equal(retryLine(30, 1, -2), null);
  });

  it("refuses counts that are not whole", () => {
    assert.equal(retryLine(30, 1.5, 5), null);
    assert.equal(retryLine(30, 1, 5.5), null);
    assert.equal(retryLine(30, Number.NaN, 5), null);
  });
});

describe("the same line without a counter", () => {
  it("prints the wait on its own", () => {
    assert.equal(waitLine(412), "retry in 412s");
    assert.equal(waitLine(0), "retry in 0s");
  });

  it("floors rather than rounds, like the counted form", () => {
    assert.equal(waitLine(29.9), "retry in 29s");
  });

  it("prints nothing rather than a countdown that runs backwards", () => {
    assert.equal(waitLine(-1), null);
    assert.equal(waitLine(Number.NaN), null);
    assert.equal(waitLine(Number.POSITIVE_INFINITY), null);
  });
});

describe("holding a measured wait", () => {
  it("prints exactly what the api sent, at the moment it sends it", () => {
    // THE REGRESSION THIS FILE EXISTS FOR NOW. The first reading printed
    // `retry in 201s` for a `Retry-After: 200`, because the deadline was
    // milliseconds and the clock a component may read is the START of the
    // current second — up to 999ms in the past — so rounding up added one.
    // A number larger than the one the api measured is an invented number,
    // however small the error and however safe its direction.
    const answeredAt = 1_757_000_000_789;
    const now = Math.floor(answeredAt / 1000);

    assert.equal(secondsLeft(deadlineSecond(answeredAt, 200), now), 200);
  });

  it("counts down one per second and stops at zero", () => {
    const deadline = deadlineSecond(1_757_000_000_000, 3);
    const now = 1_757_000_000;

    assert.equal(secondsLeft(deadline, now), 3);
    assert.equal(secondsLeft(deadline, now + 1), 2);
    assert.equal(secondsLeft(deadline, now + 3), 0);
    // Past the deadline it stops rather than running negative — a countdown
    // that goes below zero is a countdown nobody stopped.
    assert.equal(secondsLeft(deadline, now + 9), 0);
  });

  it("does not invent a wait out of a broken number", () => {
    assert.equal(secondsLeft(Number.NaN, 10), 0);
    assert.equal(secondsLeft(10, Number.NaN), 0);
  });

  it("floors a fractional wait rather than rounding it up", () => {
    // Same direction as retryLine and waitLine: a promise kept early is fine,
    // one broken by a second is not.
    assert.equal(deadlineSecond(1_757_000_000_000, 200.9), 1_757_000_200);
  });
});
