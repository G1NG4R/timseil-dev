// What this file is for: every bound in fields.ts is also a bound in
// `contract/openapi.yaml`, and a copy that drifts either refuses something the
// api accepts or accepts something it refuses. The first is a visitor told they
// are wrong when they are not; the second is a wasted round trip and one of
// three sends in ten minutes.
//
// So the test reads the contract. Not a transcription of it — the file itself,
// off disk, the way lib/state/words.test.ts holds its words against the sheet.
// The next person to change a bound has to change it in the document that
// generates the types, which is the only copy that matters.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { counterFor, FIELDS, lengthOf } from "./fields.ts";

const CONTRACT = readFileSync(new URL("../../../contract/openapi.yaml", import.meta.url), "utf8");

/** The `ContactRequest` block, so a `maxLength: 80` somewhere else in a
 *  1183-line document cannot answer for this one. */
function contactRequestBlock(): string {
  const start = CONTRACT.indexOf("    ContactRequest:");
  assert.ok(start > 0, "ContactRequest is not in the contract any more");
  const end = CONTRACT.indexOf("    ContactAccepted:", start);
  assert.ok(end > start, "ContactAccepted no longer follows ContactRequest");
  return CONTRACT.slice(start, end);
}

/** The bounds the contract states for one property. */
function boundsFor(property: string): { min: number | null; max: number | null } {
  const block = contactRequestBlock();
  const start = block.indexOf(`        ${property}:`);
  assert.ok(start > 0, `${property} is not a property of ContactRequest`);
  // To the next property at the same indent, or the end of the block.
  const rest = block.slice(start + 1);
  const next = rest.search(/\n {8}\w+:/);
  const own = next === -1 ? rest : rest.slice(0, next);

  const min = /min(?:Length|imum): (\d+)/.exec(own);
  const max = /max(?:Length|imum): (\d+)/.exec(own);
  return {
    min: min === null ? null : Number.parseInt(min[1], 10),
    max: max === null ? null : Number.parseInt(max[1], 10),
  };
}

void test("the three fields are the contract's, in the order the api reports them", () => {
  // The order is the promise validate.go:53-55 makes: "The order of the
  // returned params follows the order of the form." Reordered here, the focus
  // lands on the wrong field and nothing else goes red.
  assert.deepEqual(
    FIELDS.map((field) => field.name),
    ["name", "email", "message"],
  );
});

void test("every bound matches the contract, read off the contract", () => {
  for (const field of FIELDS) {
    const stated = boundsFor(field.name);
    assert.equal(field.max, stated.max, `${field.name}: ceiling`);
    assert.equal(field.min, stated.min, `${field.name}: floor`);
  }
});

void test("email counts bytes and prose counts runes", () => {
  // The contract's asymmetry, and the reason it exists: 254 is an octet limit
  // out of RFC 5321, so `validate.go:88` uses len(); name and message use
  // utf8.RuneCountInString, because a bound on prose that counts bytes charges
  // an umlaut twice.
  assert.equal(lengthOf("Tim Seil", "runes"), 8);
  assert.equal(lengthOf("Müller", "runes"), 6);
  assert.equal(lengthOf("Müller", "bytes"), 7);
  // A code point outside the BMP is one rune and not two. `String.length` would
  // say two, which is a bound this api does not have.
  assert.equal(lengthOf("🛰", "runes"), 1);
});

void test("the counter carries the floor only where there is one", () => {
  const name = FIELDS[0];
  const message = FIELDS[2];
  assert.equal(counterFor(name, "Tim"), "3/80");
  assert.equal(counterFor(message, "x".repeat(148)), "148/4000 · MIN 20");
});

void test("the address gets a hint and not a count", () => {
  // The sheet draws "wohin soll die antwort?" under an empty address and
  // "gültig" under a good one — a sentence, not a number. A counter there would
  // be a byte budget nobody is spending.
  assert.equal(counterFor(FIELDS[1], "anna@example.lu"), null);
});
