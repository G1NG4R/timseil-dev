// The broken case first, because the good one is trivial: English resolves to
// English. What has to hold is what happens when a language is NOT there, and
// when it is only half there.

import assert from "node:assert/strict";
import test from "node:test";

import { NAV } from "../chrome.ts";
import { en, type Messages } from "./messages/en.ts";
import { isComplete, resolveMessages } from "./messages.ts";

/** A language that has been translated in full — built from English so that a
 *  key added to en.ts cannot leave this fixture behind. */
function complete(): Partial<Messages> {
  return Object.fromEntries(Object.keys(en).map((key) => [key, `x-${key}`]));
}

// THE ACCEPTANCE CRITERION OF THIS PHASE, AS A TEST. The build plan: "Switcher
// funktioniert auch mit leeren Sprachen." Both overlays are empty today, so
// both routes serve English and say so.
void test("an empty language serves English and admits it", () => {
  for (const locale of ["de", "fr"] as const) {
    const { messages, resolved } = resolveMessages(locale);
    assert.equal(resolved, "en", `${locale} claims to be translated and is not`);
    assert.equal(messages.navWork, en.navWork);
    assert.equal(messages.based, en.based);
  }
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
