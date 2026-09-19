import assert from "node:assert/strict";
import test from "node:test";

import { errorDrillOpen } from "./drill.ts";

void test("the drill is open while developing and testing", () => {
  assert.equal(errorDrillOpen("development"), true);
  assert.equal(errorDrillOpen("test"), true);
});

// THE BROKEN CASE, and it is a step worse than the gallery's. A development
// tool answering on a public address is an embarrassment; a route that throws
// on a public address is a site reporting itself broken, with a 500 in the
// operation grid to match.
void test("a production build never opens it on its own", () => {
  assert.equal(errorDrillOpen("production"), false);
  assert.equal(errorDrillOpen("production", undefined), false);
  assert.equal(errorDrillOpen("production", ""), false);
});

void test("anything unknown counts as production", () => {
  for (const value of [undefined, "", "Development", "prod", "PRODUCTION", "staging", " development"]) {
    assert.equal(errorDrillOpen(value), false, `expected ${JSON.stringify(value)} to be closed`);
  }
});

void test("the override opens it, and only when it says exactly 1", () => {
  assert.equal(errorDrillOpen("production", "1"), true);
});

// The same trap visibility.test.ts guards, and it is guarded here rather than
// assumed to carry over: two gates that answered differently to `0` would be
// two gates to remember. Somebody writing `0` means OFF.
void test("a value that means no does not mean yes", () => {
  for (const value of ["0", "false", "no", "off", "true", "yes", " 1", "1 ", "01"]) {
    assert.equal(errorDrillOpen("production", value), false, `expected ${JSON.stringify(value)} to stay closed`);
  }
});
