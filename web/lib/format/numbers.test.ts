// The broken case is a container with a trimmed ICU, and it is the reason this
// file pins codepoints instead of reading strings.
//
// `assert.equal(percent("de", 99.98), "99,98 %")` looks like it covers it and
// does not: the separator in the expected string is whatever the author typed,
// and U+00A0, U+202F and an ordinary space are three characters that look the
// same in a diff. A Node image built without the full locale data returns the
// ENGLISH form for `de` and `fr` — `99.98` — and a page labelled in German
// would print its numbers in English with nothing red anywhere. So the three
// languages are asserted to differ from each other, and every separator is
// named by its codepoint.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LOCALES } from "../i18n/routes.ts";
import { count, decimal, percent } from "./numbers.ts";

/** Every codepoint of a string, as hex. The failure message is the point: a
 *  mismatched space has to be readable in the assertion output. */
function points(value: string): string {
  // `Array.from` AND NOT A SPREAD, which lib/contact/fields.ts already explains
  // at length: both walk the string iterator and yield code points, and the
  // lint rule objects to one of the two spellings. Code points are exactly what
  // this function is for.
  return Array.from(value)
    .map((ch) => ch.codePointAt(0)?.toString(16) ?? "?")
    .join(" ");
}

describe("the locale data is actually in this container", () => {
  // THE FIRST TEST, BECAUSE EVERY OTHER ONE IS VACUOUS WITHOUT IT. A stripped
  // ICU makes all three languages agree, and agreement is indistinguishable
  // from a correct English answer.
  it("gives the three languages three different decimal forms", () => {
    const forms = LOCALES.map((locale) => decimal(locale, 99.98, 2));

    assert.deepEqual(forms, ["99.98", "99,98", "99,98"]);
    assert.notEqual(forms[0], forms[1], "de fell back to the English decimal mark");
  });

  it("gives the three languages three different thousands forms", () => {
    const forms = LOCALES.map((locale) => count(locale, 2480));

    assert.equal(new Set(forms).size, 3, `all three grouped the same way: ${forms.join(" · ")}`);
  });
});

describe("decimal", () => {
  it("keeps the digit count it was asked for", () => {
    assert.equal(decimal("en", 100, 2), "100.00");
    assert.equal(decimal("de", 100, 2), "100,00");
    assert.equal(decimal("en", 72.5, 1), "72.5");
    assert.equal(decimal("de", 72.5, 1), "72,5");
  });

  // A MEASURED ZERO IS A NUMBER AND INVARIANT 1 HANGS ON IT. The `null` check
  // belongs to the caller; what this asserts is that a zero survives the
  // formatter rather than coming out as a placeholder.
  it("prints a measured zero", () => {
    assert.equal(decimal("en", 0, 2), "0.00");
    assert.equal(decimal("de", 0, 2), "0,00");
  });

  // NO GROUPING, and the stat tiles are why: none of the three figures they
  // carry reaches four digits, so a separator here would only ever be noise.
  it("does not group", () => {
    assert.equal(decimal("de", 1234.5, 1), "1234,5");
  });
});

describe("percent", () => {
  it("writes the sheet's three forms", () => {
    assert.equal(percent("en", 99.98), "99.98%");
    assert.equal(percent("de", 99.98), "99,98 %");
    assert.equal(percent("fr", 99.98), "99,98 %");
  });

  // THE SEPARATOR BY ITS CODEPOINT. LANG.01 names U+202F for French by number;
  // German takes U+00A0 for the reason lib/content/words.ts gives about narrow
  // spaces missing from monospace faces, and English takes none at all.
  it("separates the unit with the codepoint each language asks for", () => {
    assert.equal(points(percent("en", 0)), "30 2e 30 30 25");
    assert.equal(points(percent("de", 0)), "30 2c 30 30 a0 25");
    assert.equal(points(percent("fr", 0)), "30 2c 30 30 202f 25");
  });

  it("takes a coarser reading when asked", () => {
    assert.equal(percent("de", 81.7, 1), "81,7 %");
  });
});

describe("count", () => {
  it("groups the way each language groups", () => {
    assert.equal(count("en", 2480), "2,480");
    assert.equal(count("de", 2480), "2.480");
    assert.equal(points(count("fr", 2480)), "32 202f 34 38 30");
  });

  it("leaves a number below the group boundary alone", () => {
    for (const locale of LOCALES) assert.equal(count(locale, 91), "91");
  });
});
