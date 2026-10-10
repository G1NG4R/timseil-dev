// What a case study may say in a second language, and what it may not change.
//
// WHY IT IS HERE AND NOT BESIDE THE FILE IT TESTS. `npm test` reads `lib/**`
// and `styles/**` — package.json's script, unchanged since G1 — so a test in
// `content/case-studies/` would be a file nobody runs. That is the trap U8a
// walked into with its eyes open: the bundle walker in lib/i18n/complete.test.ts
// DOES look in `content/`, so the module is registered and checked for being
// registered, and only its words would have gone unread. lib/content/ already
// holds four tests about things in `content/`, pipeline.test.ts among them.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { placeholders } from "../about/content.ts";
import { CASE_WORDS_DE } from "../../content/case-studies/timseil-dev.de.ts";
import {
  CASE_WORDS_EN,
  STAGE_TITLES,
  timseilDev,
  timseilDevFor,
} from "../../content/case-studies/timseil-dev.ts";
import { de } from "../i18n/messages/de.ts";

/** Every sentence a study prints, flattened. */
function sentences(words: typeof CASE_WORDS_EN): readonly string[] {
  return [
    words.headline,
    words.blurb,
    words.year,
    words.hosting,
    ...words.problem,
    ...words.constraints,
    words.composeCaption,
    ...STAGE_TITLES.map((title) => words.stages[title]),
    words.emptyNote.label,
    words.emptyNote.text,
  ];
}

describe("the German case study says the same things in German", () => {
  it("translates every sentence and leaves none of them empty", () => {
    const english = sentences(CASE_WORDS_EN);
    const german = sentences(CASE_WORDS_DE);

    assert.equal(german.length, english.length);

    for (const [index, line] of german.entries()) {
      assert.notEqual(line.trim(), "", `line ${String(index)} is empty`);
      assert.notEqual(line, english[index], `line ${String(index)} was not translated`);
    }
  });

  it("keeps the three paragraphs three and the five constraints five", () => {
    // `bundleShapes` says the same thing about the whole register; this says it
    // about the two lists a reader would notice losing one, in the file that is
    // about them. The German paragraph that gets dropped is the third — it is
    // the longest — and the page would simply be shorter.
    assert.equal(CASE_WORDS_DE.problem.length, 3);
    assert.equal(CASE_WORDS_DE.constraints.length, 5);
  });

  it("carries no bracketed placeholder", () => {
    assert.deepEqual(placeholders(sentences(CASE_WORDS_DE)), []);
  });

  it("keeps the blurb to one line in both languages", () => {
    // lib/home/systems.test.ts holds this for English and reads `CASE_STUDIES`,
    // which is English only. German runs longer in exactly this kind of
    // sentence, and the row it goes in has one line — SystemRow draws no second
    // one, it truncates.
    for (const words of [CASE_WORDS_EN, CASE_WORDS_DE]) {
      assert.ok(
        words.blurb.length < 120,
        `the blurb is ${String(words.blurb.length)} characters: ${words.blurb}`,
      );
    }
  });
});

describe("what a translation may not touch", () => {
  it("draws the same seven pipeline boxes, in the same order", () => {
    // Five of the seven words ARE `ci.yml` job names in capitals, and
    // pipeline.test.ts holds them against the workflow. A translated box would
    // describe a pipeline nobody runs — so the titles come from the facts and
    // the words are keyed BY them.
    const german = timseilDevFor("de").study;

    assert.deepEqual(
      german.stages.map((stage) => stage.title),
      [...STAGE_TITLES],
    );
    assert.deepEqual(
      german.stages.map((stage) => stage.job),
      timseilDev.stages.map((stage) => stage.job),
    );
  });

  it("gives every box a German sentence", () => {
    const german = timseilDevFor("de").study;

    for (const [index, stage] of german.stages.entries()) {
      assert.notEqual(stage.detail, timseilDev.stages[index].detail, stage.title);
      assert.notEqual(stage.detail.trim(), "", stage.title);
    }
  });

  it("keeps the slug and the date, which are not words", () => {
    const german = timseilDevFor("de").study;

    assert.equal(german.slug, timseilDev.slug);
    assert.equal(german.updatedAt, timseilDev.updatedAt);
  });

  it("keeps the year's digits and moves only the word beside them", () => {
    // ADR 0083, decision 6, in the one field where a datum and a word share a
    // string: `2026` is the statement, `ongoing` is language.
    assert.match(CASE_WORDS_DE.year, /2026/);
    assert.notEqual(CASE_WORDS_DE.year, CASE_WORDS_EN.year);
  });
});

// ADR 0083, DECISION 8: "was zweimal anders heißt, ist ein Fund." The rail over
// these five lines is `csConstraints`, which the catalogue translates as
// `RANDBEDINGUNGEN` — so the paragraph that refers to them has to use that word
// and not a synonym. This is the assertion that reads the catalogue rather than
// trusting the translator to have remembered it.
describe("the glossary holds between the catalogue and the prose", () => {
  it("calls a constraint what the rail over it calls one", () => {
    assert.equal(de.csConstraints, "RANDBEDINGUNGEN");

    const stem = de.csConstraints.slice(0, 8).toLowerCase();
    assert.ok(stem.length > 4);
    assert.ok(
      CASE_WORDS_DE.problem.some((line) => line.toLowerCase().includes(stem)),
      `no paragraph uses the word the rail uses: ${stem}`,
    );
  });

  it("says Verfügbarkeit for uptime and Ausfall for an outage", () => {
    const joined = sentences(CASE_WORDS_DE).join(" ");

    assert.match(joined, /Verfügbarkeit/);
    assert.match(joined, /Ausfall/);
    assert.equal(/Uptime/i.test(joined), false, "the glossary says Verfügbarkeit");
  });
});
