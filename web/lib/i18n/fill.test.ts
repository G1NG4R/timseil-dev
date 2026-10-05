// The good case is one line. The four broken ones are the file.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fill, placeholdersIn, plural } from "./fill.ts";

describe("a catalogue sentence that holds a number", () => {
  it("puts every value where the sentence asks for it", () => {
    assert.equal(
      fill("{measured} von {window} Tagen gemessen", { measured: "8", window: "91" }),
      "8 von 91 Tagen gemessen",
    );
  });

  it("names the placeholders in the order the sentence asks", () => {
    assert.deepEqual(placeholdersIn("{a} und {b} und {a}"), ["a", "b", "a"]);
    assert.deepEqual(placeholdersIn("no holes here"), []);
  });

  it("fills a sentence with no holes without complaining", () => {
    assert.equal(fill("SELF-TRACKED", {}), "SELF-TRACKED");
  });

  // THE FOUR THROWS. Each one is a line that would otherwise reach a reader.
  it("a placeholder with no value is a throw, not braces on the page", () => {
    assert.throws(() => fill("{measured} von {window}", { measured: "8" }), /no value for \{window\}/);
  });

  it("a value nobody asked for is a throw", () => {
    assert.throws(() => fill("{measured} Tage", { measured: "8", window: "91" }), /\{window\} is not in/);
  });

  it("a placeholder with no name is a throw", () => {
    assert.throws(() => fill("{} Tage", {}), /a placeholder with no name/);
  });

  it("a brace with no placeholder is a throw, and says so rather than blaming the value", () => {
    assert.throws(() => fill("{measured Tage", { measured: "8" }), /a brace with no placeholder/);
  });
});

describe("which of the two forms a count takes", () => {
  it("says the one form for exactly one and the other for everything else", () => {
    assert.equal(plural(1, "SYSTEM", "SYSTEMS"), "SYSTEM");
    assert.equal(plural(2, "SYSTEM", "SYSTEMS"), "SYSTEMS");
  });

  // NOUGHT IS `other` IN BOTH LANGUAGES THIS SITE HAS. The comment in fill.ts
  // names French as the line where that stops being true; this pins the half
  // that is true today, so the phase that fills fr.ts sees a red test and not a
  // quiet wrong plural.
  it("says the other form for nought", () => {
    assert.equal(plural(0, "ENTRY", "ENTRIES"), "ENTRIES");
  });
});
