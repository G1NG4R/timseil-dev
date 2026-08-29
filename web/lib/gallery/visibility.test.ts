import assert from "node:assert/strict";
import test from "node:test";

import { galleryVisible } from "./visibility.ts";

void test("the gallery is visible while developing and testing", () => {
  assert.equal(galleryVisible("development"), true);
  assert.equal(galleryVisible("test"), true);
});

// The broken case, and the only one that matters: this is the assertion that
// stands between a development tool and a public address.
void test("a production build never shows it on its own", () => {
  assert.equal(galleryVisible("production"), false);
  assert.equal(galleryVisible("production", undefined), false);
  assert.equal(galleryVisible("production", ""), false);
});

// Fails closed. An unset or misspelled value is not a licence — every one of
// these would be a way for the route to reappear in an image by accident.
void test("anything unknown counts as production", () => {
  for (const value of [undefined, "", "Development", "prod", "PRODUCTION", "staging", " development"]) {
    assert.equal(galleryVisible(value), false, `expected ${JSON.stringify(value)} to be closed`);
  }
});

// The second door, for watching the burst against a build that hydrates.
void test("the override opens it, and only when it says exactly 1", () => {
  assert.equal(galleryVisible("production", "1"), true);
});

// THE TRAP THIS TEST EXISTS FOR: a variable set to `0` or `false` is somebody
// turning the gallery OFF. Accepting any non-empty string — the obvious
// implementation — would turn it on instead, and the person who wrote `0` would
// have no way to tell.
void test("a value that means no does not mean yes", () => {
  for (const value of ["0", "false", "no", "off", "true", "yes", " 1", "1 ", "01"]) {
    assert.equal(galleryVisible("production", value), false, `expected ${JSON.stringify(value)} to stay closed`);
  }
});
