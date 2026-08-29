import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { retryLine } from "./retry.ts";

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
