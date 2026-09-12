// What holds `/imprint` to the same standard `/privacy` is held to: no sentence
// on it may claim something this repository does not do, and no number may
// appear that nothing enforces.
//
// THE SHORTER PAGE IS THE EASIER ONE TO GET WRONG. `/privacy` is checked hard
// because everybody expects a privacy text to overreach; an imprint looks like
// five facts and a copyright line, and the sheet still managed to put a promise
// about somebody else's network into it — twice, once on each artboard.
//
// content.test.ts holds the other page. brackets.test.ts holds the one rule
// that spans both.

import assert from "node:assert/strict";
import test from "node:test";

import { SEE_ALSO as PRIVACY_SEE_ALSO } from "./content.ts";
import { CONTENT, NOT_APPLICABLE, OPERATOR, SEE_ALSO } from "./imprint.ts";
import { IMPRINT_SECTIONS } from "./sections.ts";
import { imprintText } from "./text.ts";
import { AUTHOR } from "../site.ts";

void test("every section has prose, and no prose belongs to a section that is gone", () => {
  const ordered = IMPRINT_SECTIONS.map((section) => section.id);
  assert.deepEqual(Object.keys(CONTENT).sort(), [...ordered].sort());
  for (const id of ordered) {
    assert.ok(CONTENT[id].length > 0, `${id} has a heading and nothing under it`);
  }
});

void test("no string on the page is empty", () => {
  for (const text of imprintText()) assert.notEqual(text.trim().length, 0);
});

// ── The sentences the sheet drew ───────────────────────────────────────────

void test("the flat third-party claim does not come back", () => {
  // The sheet writes it flat at 1440: "There is no CDN and no third party in
  // the request path". What this application does is mine to promise. What sits
  // in front of it on the network is not, and 07.05 on the other page had to
  // learn the difference in H12b. ADR 0076 §5.
  const joined = imprintText().join("\n");
  assert.doesNotMatch(joined, /no third party in the request path/i);
  assert.doesNotMatch(joined, /\bkein(e|en)? Dritt/i);
});

void test("the scope of the one-origin claim is stated rather than left open", () => {
  // The positive half of the test above. Deleting the clause would pass a
  // `doesNotMatch` and leave the page making the broad claim by omission, which
  // is the failure mode that produced the sentence in the first place.
  const hosting = CONTENT["06.02"].map((block) => (block.kind === "p" ? block.text : "")).join("\n");
  assert.match(hosting, /this application and the pages it serves/i);
  assert.match(hosting, /not mine to make promises about/i);
});

void test("no German survives in an English interface", () => {
  // The sheet slips into German three times on this artboard — "Fragen dazu
  // gern über das Formular", "[STRASSE UND HAUSNUMMER]", "[OPTIONAL —
  // WEGLASSEN IST ZULÄSSIG]". Two of the three were brackets and are gone with
  // them; the sentence was prose and had to be translated. CLAUDE.md: UI text
  // is English, and a legal page is UI text with consequences.
  const german = [/\büber\b/i, /\bgern\b/i, /\bFormular\b/i, /\bzulässig\b/i, /\bStra(ss|ß)e\b/i, /\bFragen dazu\b/i];
  const joined = imprintText().join("\n");
  for (const pattern of german) {
    assert.doesNotMatch(joined, pattern, `${String(pattern)} is German, and this interface is English`);
  }
});

// ── Every duration is one somebody enforces ────────────────────────────────

void test("no duration appears on this page at all", () => {
  // content.test.ts holds each duration on `/privacy` against the file that
  // enforces it — 14 days against ops/loki/loki.yaml, 30 days and 10 minutes
  // against api/internal/contact/policy.go. THIS page enforces nothing and
  // therefore may promise nothing: a retention or a deadline written here would
  // be a second, uncheckable copy of a number that already has one home. The
  // way to say it on this page is the link to the other one.
  for (const text of imprintText()) {
    assert.doesNotMatch(
      text,
      /\b\d+\s+(minute|hour|day|week|month|year)s?\b/,
      `a duration belongs on /privacy, where a file enforces it: ${text}`,
    );
  }
});

// ── The operator's details ─────────────────────────────────────────────────

void test("the field list names the person, and takes the name from lib/site.ts", () => {
  const byKey = new Map(OPERATOR.map((field) => [field.key, field.value]));
  assert.equal(byKey.size, OPERATOR.length, "a key appears twice in the operator list");
  assert.equal(byKey.get("NAME"), AUTHOR.name);
  assert.equal(byKey.get("EMAIL"), AUTHOR.email);
  for (const key of ["ADDRESS", "CAPACITY", "CONTENT"]) {
    assert.ok(byKey.has(key), `the operator list has no ${key} row`);
  }
});

void test("there is no phone row", () => {
  // The sheet draws one and fills it with `[OPTIONAL — WEGLASSEN IST ZULÄSSIG]`.
  // A field whose value says the field may be left out is not a field; a reader
  // who needs to reach me has an address and a mailbox, both above it.
  assert.equal(
    OPERATOR.some((field) => /phone|tel/i.test(field.key)),
    false,
  );
});

void test("the capacity says what this site is not", () => {
  // The whole reason the NOT APPLICABLE list below is allowed to be short.
  const capacity = OPERATOR.find((field) => field.key === "CAPACITY")?.value ?? "";
  assert.match(capacity, /no registered business/i);
});

// ── The absence that is listed on purpose ──────────────────────────────────

void test("four compulsory entries are listed as not applying, and each once", () => {
  assert.equal(NOT_APPLICABLE.items.length, 4);
  assert.equal(new Set(NOT_APPLICABLE.items).size, 4);
  assert.notEqual(NOT_APPLICABLE.note.trim().length, 0);
});

void test("the note says why they are listed rather than left out", () => {
  // Without this sentence the box is four things a reader cannot place. The
  // sheet's own design note is the requirement: the absence has to read as a
  // decision rather than as an oversight.
  assert.match(NOT_APPLICABLE.note, /decision|deliberate/i);
});

// ── The two pages point at each other ──────────────────────────────────────

void test("each legal page's SEE ALSO points at the other one", () => {
  // Drawn on both artboards since 16.08.2026 and built in neither until H12c:
  // the privacy page shipped with nowhere to point, because the imprint was a
  // stub, and a card pointing at a `[SOON]` shell is the second dead end
  // lib/notfound/mounted.ts already refuses. Both targets exist now, and a
  // one-directional link would be the state this test exists to prevent.
  assert.equal(SEE_ALSO.path, "/privacy");
  assert.equal(PRIVACY_SEE_ALSO.path, "/imprint");
  assert.notEqual(SEE_ALSO.path, PRIVACY_SEE_ALSO.path);
  // A path and not an href: the page resolves the locale, because `/de/imprint`
  // has to point at `/de/privacy`. e2e/imprint.spec.ts walks all three.
  for (const card of [SEE_ALSO, PRIVACY_SEE_ALSO]) {
    assert.match(card.path, /^\/[a-z]+$/);
    assert.notEqual(card.blurb.trim().length, 0);
  }
});

// ── Shape ──────────────────────────────────────────────────────────────────

void test("every table row is as wide as its head", () => {
  // Vacuous while this page has no table, and kept for the day it gets one:
  // content.test.ts carries the same check because `/privacy` has three, and a
  // page that grows a table without this would grow a ragged one.
  for (const [id, blocks] of Object.entries(CONTENT)) {
    for (const block of blocks) {
      if (block.kind !== "table") continue;
      for (const row of block.rows) {
        assert.equal(row.length, block.head.length, `${id}: ${row.join(" | ")}`);
      }
    }
  }
});
