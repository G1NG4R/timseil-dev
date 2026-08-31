import assert from "node:assert/strict";
import { test } from "node:test";

import { composeLine, composeLines } from "./compose.ts";
import excerpt from "../../content/generated/compose-api.gen.json" with { type: "json" };

test("a key that opens a block has no value", () => {
  assert.deepEqual(composeLine("services:"), { indent: "", key: "services:", value: "" });
  assert.deepEqual(composeLine("  api:"), { indent: "  ", key: "api:", value: "" });
});

test("the key is taken from the start of the line, not from the first colon", () => {
  // The real image line. Three colons, one key — splitting on the first colon
  // found would put `ghcr.io/g1ng4r/timseil-api` in the key.
  const line = composeLine("    image: ghcr.io/g1ng4r/timseil-api:${IMAGE_TAG:?set it}");
  assert.equal(line.indent, "    ");
  assert.equal(line.key, "image:");
  assert.equal(line.value, " ghcr.io/g1ng4r/timseil-api:${IMAGE_TAG:?set it}");
});

test("indentation is kept verbatim, because it is the structure", () => {
  assert.equal(composeLine("        condition: service_healthy").indent, "        ");
});

test("a line with no key survives whole", () => {
  assert.deepEqual(composeLine("  - just a value"), {
    indent: "  ",
    key: null,
    value: "- just a value",
  });
});

test("every line of the generated excerpt round-trips", () => {
  // The broken case this guards: a tokenizer that drops a character is invisible
  // on a picture and obvious here.
  for (const raw of excerpt.lines) {
    const line = composeLine(raw);
    assert.equal(line.indent + (line.key ?? "") + line.value, raw);
  }
});

test("the generated excerpt is all keys today", () => {
  // If this ever fails, the generator started emitting something that is not a
  // mapping key and the component's two tones no longer describe the block.
  assert.ok(excerpt.lines.length > 0);
  assert.ok(composeLines(excerpt.lines).every((line) => line.key !== null));
});
