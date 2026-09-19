import assert from "node:assert/strict";
import test from "node:test";

import { errorDigest } from "./report.ts";

void test("a digest Next produced comes through", () => {
  // The value measured on this machine, from the first drill that ever fired.
  assert.equal(errorDigest(Object.assign(new Error("boom"), { digest: "824995547" })), "824995547");
});

void test("a digest carrying an error code comes through whole", () => {
  const err = Object.assign(new Error("boom"), { digest: "824995547@E394" });
  assert.equal(errorDigest(err), "824995547@E394");
});

void test("an error without one says so by absence", () => {
  assert.equal(errorDigest(new Error("boom")), undefined);
});

// `err` is `unknown` in Next's own type because React may have replaced the
// thrown value. These are the shapes that actually arrive when it has.
void test("a thrown non-error has no digest to read", () => {
  for (const value of ["a string", 42, null, undefined, [], Symbol("s")]) {
    assert.equal(errorDigest(value), undefined, `expected ${String(value)} to yield nothing`);
  }
});

// THE BROKEN CASE. notFound() and redirect() travel as digests too, and neither
// is a failure. Logging one would file a working page under a defect — and
// /blog/kein-post takes exactly that path on this site today, so it is not a
// hypothetical shape.
void test("a control signal is not a digest", () => {
  for (const digest of ["NEXT_HTTP_ERROR_FALLBACK;404", "NEXT_REDIRECT;replace;/;307;", "NEXT_NOT_FOUND"]) {
    assert.equal(
      errorDigest(Object.assign(new Error("control"), { digest })),
      undefined,
      `expected ${digest} to be refused`,
    );
  }
});

void test("a digest whose shape somebody chose is refused", () => {
  for (const digest of ["", " 824995547", "824995547 ", "82499 5547", "abc", "8249@E", "@E394", "-1", "1.5", "0x10"]) {
    assert.equal(
      errorDigest(Object.assign(new Error("boom"), { digest })),
      undefined,
      `expected ${JSON.stringify(digest)} to be refused`,
    );
  }
});

void test("an unbounded digest does not become an unbounded log line", () => {
  const long = "9".repeat(21);
  assert.equal(errorDigest(Object.assign(new Error("boom"), { digest: long })), undefined);
  assert.equal(errorDigest(Object.assign(new Error("boom"), { digest: "9".repeat(20) })), "9".repeat(20));
});

void test("a non-string digest is not coerced into one", () => {
  for (const digest of [824995547, null, true, {}, ["824995547"]]) {
    assert.equal(errorDigest(Object.assign(new Error("boom"), { digest })), undefined);
  }
});
