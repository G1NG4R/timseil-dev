// The broken case first, because the good one is trivial: English resolves to
// English. What has to hold is what happens when a language is NOT there, and
// when it is only half there.
//
// ONE TEST IN HERE FELL IN U8 AND IT WAS SUPPOSED TO. "an empty language serves
// English and admits it" ran over `["de", "fr"]` and asserted both; German is
// translated now, so that claim is false about half its own loop. It is split
// rather than deleted — the French half is still the acceptance criterion G5
// was written for, and the German half is this phase's. The third case, a full
// catalogue with a missing bundle, lives in complete.test.ts beside the
// predicate it exercises.

import assert from "node:assert/strict";
import test from "node:test";

import { NAV } from "../chrome.ts";
import { isComplete } from "./complete.ts";
import { de } from "./messages/de.ts";
import { en, type Messages } from "./messages/en.ts";
import { fr } from "./messages/fr.ts";
import { resolveMessages } from "./messages.ts";

/** A language that has been translated in full — built from English so that a
 *  key added to en.ts cannot leave this fixture behind. */
function complete(): Partial<Messages> {
  return Object.fromEntries(Object.keys(en).map((key) => [key, `x-${key}`]));
}

// THE FRENCH HALF OF G5's CRITERION, AND IT IS STILL THE DELIVERABLE. The build
// plan: "Switcher funktioniert auch mit leeren Sprachen." French is empty on
// purpose — ADR 0083, decision 1 — so `/fr` serves English and says so, and the
// `lang="en"` on its blocks follows from this and from nothing else.
void test("French is empty, serves English and admits it", () => {
  assert.equal(isComplete(fr), false);

  const { messages, resolved } = resolveMessages("fr");
  assert.equal(resolved, "en", "fr claims to be translated and is not");
  assert.equal(messages.navWork, en.navWork);
  assert.equal(messages.based, en.based);
});

// U8's OWN CRITERION. The interesting assertion is the second one: `resolved`
// being `de` is what makes `textLang` `undefined` in getDictionary(), which is
// what takes `lang="en"` off `<main>` on /de.
void test("German is translated, serves German and carries no lang attribute", () => {
  assert.equal(isComplete(de), true);

  const { messages, resolved } = resolveMessages("de");
  assert.equal(resolved, "de");
  assert.equal(messages.navWork, de.navWork);
  assert.equal(messages.based, de.based);
  assert.notEqual(messages.navWork, en.navWork);
});

// EVERY KEY, NOT A SAMPLE OF THEM. The two assertions above name four strings;
// this one is the whole catalogue, and it is the test that would catch a German
// value that was left as its English original by accident rather than on
// purpose. The twelve that ARE identical are nomenclature and are named — a
// thirteenth has to be argued for here before it can ship.
void test("German differs from English everywhere except the named nomenclature", () => {
  const SAME = [
    "navLog",
    "langEsc",
    "altLabel",
    "stateLive",
    "stateOffline",
    "csStatus",
    "csProblem",
    "csBuild",
    "csPostMortem",
    "blogTags",
    "blogIndexFeed",
    "blogIndexSystem",
  ];

  const identical = Object.keys(en).filter(
    (key) => de[key as keyof Messages] === en[key as keyof typeof en],
  );

  assert.deepEqual(identical.sort(), [...SAME].sort());
});

void test("English resolves to English", () => {
  const { messages, resolved } = resolveMessages("en");
  assert.equal(resolved, "en");
  assert.deepEqual(messages, { ...en });
});

// "KEINE HALBEN SEITEN". The tempting implementation is a per-key merge, which
// gives a page that is German down to the first untranslated label and then
// English — and an `<html lang="de">` that is a lie about half its own text.
void test("a half-translated language is set aside, not blended", () => {
  const half = complete();
  delete half.imprint;

  assert.equal(isComplete(half), false);
  // The other keys ARE present; a merge would have used them. The rule is that
  // it must not.
  assert.equal(half.navWork, "x-navWork");
});

void test("a key that is present but empty counts as missing", () => {
  const blank = complete();
  blank.privacy = "";

  assert.equal(isComplete(blank), false);
});

void test("a language that carries every key is complete", () => {
  assert.equal(isComplete(complete()), true);
  assert.equal(isComplete({}), false);
});

// TWO COPIES OF THE SAME FOUR WORDS, ON PURPOSE — chrome.ts holds the labels
// with their routes as the sheet's CHR.01 table, en.ts holds them as prose to
// be translated. Transcription plus this test is the trade lib/chrome.ts
// already makes: "a table the implementation reads is not an oracle, it is a
// second copy of the answer." What is refused here is the two drifting.
void test("the nav labels are the same four words in both files", () => {
  assert.deepEqual(
    [en.navWork, en.navLog, en.navAbout, en.navContact],
    NAV.map((entry) => entry.label as string),
  );
});
