// What the error page's words may cost, and what they may not say.
//
// THE FIRST TEST IS A BYTE TEST WEARING A TYPE TEST'S CLOTHES. This module is
// read by a client component, which is the whole reason the five sentences are
// not dictionary keys: an import of lib/i18n/messages/en.ts here would ship
// every page's words onto every route. The import list is therefore an
// assertion rather than a convention — the same guard bundle.test.ts puts on
// lib/i18n/bundle.ts, for the same budget (#237).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { de } from "../i18n/messages/de.ts";
import { resolveContent } from "../i18n/bundle.ts";

import { ERRORS, ERROR_WORDS, errorWordsFor } from "./words.ts";
import { ERROR_WORDS_DE } from "./words.de.ts";

/** The modules a file imports, read off disk with the comments taken out.
 *
 *  THE COMMENTS COME OUT FIRST, and C1 of this phase is why: the same check on
 *  bundle.ts matched a path inside the comment that warns against importing it.
 *  A test that reads source has to read the source and not the prose about it. */
function importsOf(file: string): readonly string[] {
  const source = readFileSync(join(import.meta.dirname, file), "utf8")
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/\/\/[^\n]*/g, "");

  return [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
}

describe("the words of a client component cost what they say they cost", () => {
  it("imports the bundle type and its own German, and no catalogue", () => {
    assert.deepEqual(importsOf("words.ts"), [
      "../i18n/bundle.ts",
      "../i18n/routes.ts",
      "./words.de.ts",
    ]);
  });

  it("and the German half imports nothing but the shape", () => {
    assert.deepEqual(importsOf("words.de.ts"), ["./words.ts"]);
  });
});

describe("the five sentences in German", () => {
  it("fills every one of them, and none of them with the English", () => {
    const keys = Object.keys(ERROR_WORDS) as (keyof typeof ERROR_WORDS)[];
    assert.equal(keys.length, 5);

    for (const key of keys) {
      assert.notEqual(ERROR_WORDS_DE[key].trim(), "", key);
      assert.notEqual(ERROR_WORDS_DE[key], ERROR_WORDS[key], key);
    }
  });

  // ADR 0083, DECISION 8, ACROSS A WALL THIS FILE CANNOT CLIMB. The 404's button
  // does the same thing and the catalogue has translated it since H9. The
  // catalogue is not importable from here — that is the point of the whole
  // module — so the word stands twice on disk, and this is what keeps the two
  // copies the same word.
  it("says what the 404's button says, because it is the same button", () => {
    assert.equal(ERROR_WORDS_DE.home, de.notFoundReturn);
  });

  it("keeps the second button shorter than the first", () => {
    // Two buttons share a row at 390. `ZURÜCK ZUR WURZEL` is the long one and it
    // is fixed by the catalogue, so the one this file chooses is the one that
    // has to give — `NOCH EINMAL` rather than `ERNEUT VERSUCHEN`.
    assert.ok(
      ERROR_WORDS_DE.retry.length < ERROR_WORDS_DE.home.length,
      `${ERROR_WORDS_DE.retry} is not shorter than ${ERROR_WORDS_DE.home}`,
    );
  });
});

describe("the page resolves its own language", () => {
  it("answers German on /de and English on /fr", () => {
    assert.equal(errorWordsFor("de").resolved, "de");
    assert.equal(errorWordsFor("de").value.retry, ERROR_WORDS_DE.retry);

    assert.equal(errorWordsFor("fr").resolved, "en");
    assert.equal(errorWordsFor("fr").value.retry, ERROR_WORDS.retry);
  });

  it("is the same function the register uses, on the same bundle", () => {
    // The seam this file's head is about: this page asks `resolveContent` and a
    // server-rendered page asks `languageComplete`, which reads the catalogue
    // and every bundle. They can only disagree if a registered bundle loses a
    // language — which complete.test.ts turns red. Here we hold the narrower
    // half: the function and the bundle are the ones the register knows.
    assert.deepEqual(errorWordsFor("de"), resolveContent(ERRORS, "de"));
  });
});
