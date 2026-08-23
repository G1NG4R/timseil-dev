// The shape of the id is a promise — it goes into a response header and a JSON
// log line — and a promise with no check is a comment.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRequestId, isValidRequestId } from "./reqid.ts";

describe("createRequestId", () => {
  it("mints the same shape the api mints, so a log cannot tell them apart", () => {
    assert.match(createRequestId(), /^[0-9a-f]{32}$/);
  });

  it("does not repeat itself", () => {
    const ids = new Set(Array.from({ length: 500 }, () => createRequestId()));
    assert.equal(ids.size, 500);
  });

  it("mints a value the api would itself accept", () => {
    assert.ok(isValidRequestId(createRequestId()));
  });
});

describe("isValidRequestId refuses what would break a header or a line", () => {
  const rejected: [string, string][] = [
    ["empty", ""],
    ["seven characters", "abcdefg"],
    ["sixty-five characters", "a".repeat(65)],
    ["a dot", "abcdef.gh"],
    ["a space", "abcd efgh"],
    ["a newline", "abcdefg\n"],
    ["a carriage return", "abcdefg\r"],
    ["a colon", "abcdefg:h"],
    ["a non-ascii letter", "abcdefgü"],
  ];

  for (const [name, value] of rejected) {
    it(name, () => {
      assert.equal(isValidRequestId(value), false);
    });
  }

  it("accepts the range the api accepts", () => {
    assert.ok(isValidRequestId("a".repeat(8)));
    assert.ok(isValidRequestId("a".repeat(64)));
    assert.ok(isValidRequestId("Ab-9_zZ0"));
  });
});
