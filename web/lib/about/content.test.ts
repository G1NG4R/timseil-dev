// What this file is for: the About sheet is the most placeholder-dense drawing
// in the handoff — eleven bracketed strings across two artboards, in two
// languages — and the whole of this phase's content decision is "a bracket is a
// sentence this page would be making up." That decision is worth exactly as
// much as the thing that notices the next bracket being added.
//
// So the guard is asserted against the shipped constants, not against a sample.

import assert from "node:assert/strict";
import test from "node:test";

import { OPERATOR, PRINCIPLES, STACK, placeholders, stationNumber } from "./content.ts";

/** Every string this page prints out of these tables, flattened. */
function shipped(): readonly string[] {
  return [
    ...OPERATOR.flatMap((row) => [row.label, row.value]),
    ...STACK.flatMap((tile) => [tile.label, tile.title, tile.detail]),
    ...PRINCIPLES.flatMap((item) => [item.title, item.detail]),
  ];
}

void test("nothing this page prints is a bracketed placeholder", () => {
  assert.deepEqual(placeholders(shipped()), []);
});

void test("placeholders() finds what the sheet actually carries", () => {
  // The broken case, in the sheet's own words. Without this the guard above
  // could be green because the finder finds nothing anywhere.
  assert.deepEqual(
    placeholders([
      "LANGUAGES",
      "[LANGUAGES]",
      "ONE VPS · [SPEC] · ADMINISTERED BY ME",
      "[Y1]",
      "UPTIME [99.98%]",
    ]),
    ["[LANGUAGES]", "[SPEC]", "[Y1]", "[99.98%]"],
  );
});

void test("[SOON] is not a placeholder, and it is excluded by name", () => {
  // The site's own word for a named absence. lib/state/words.ts owns it and the
  // chrome has printed it since G3 — it says that nothing is there, which is
  // the opposite of standing in for something.
  assert.deepEqual(placeholders(["LINKEDIN ↗ [SOON]"]), []);
  // And the exclusion is the exact string rather than a shape: a bracket that
  // merely looks similar is still a placeholder.
  assert.deepEqual(placeholders(["[SOON-ISH]", "[soon]"]), ["[SOON-ISH]", "[soon]"]);
});

// SYS.05.02 IS THE SECTION THAT EXISTS TO PROVE RATHER THAN CLAIM — the sheet's
// own design note calls it "die About-Version der Architektur-Platte — belegt
// die Positionierung, statt sie zu behaupten" — and two of the four tiles it
// draws could not be backed:
//
//   `SERVICES · 4 containers`  compose.yaml defines ten services.
//   `WATCH · Nightly dump off the box. The restore has been tested.`
//                              The backup job is build plan L6 and the restore
//                              drill is L6 and M5. Neither has run.
//
// SCOPED TO THE TILES, on purpose. Principle 02 one section down says a public
// address "teaches you timeouts, certificates, backups, and your own blind
// spots" — that is a sentence about learning and not a claim about this host,
// and a guard broad enough to catch it would be a guard nobody could keep.
void test("no tile in WHAT I RUN claims a count or a backup", () => {
  const tiles = STACK.flatMap((tile) => [tile.title, tile.detail]).join(" ");
  assert.equal(/\d+\s+containers?/i.test(tiles), false, tiles);
  assert.equal(/backup|dump|restore/i.test(tiles), false, tiles);
});

void test("the operator card names no row twice", () => {
  const labels = OPERATOR.map((row) => row.label);
  assert.equal(new Set(labels).size, labels.length);
});

void test("exactly one operator row is the accent", () => {
  // The sheet draws `ROUTE · Self-taught` in signal and everything else in body
  // ink. Two accents would be two emphases, which is no emphasis.
  const accented = OPERATOR.filter((row) => row.accent === true);
  assert.deepEqual(
    accented.map((row) => row.label),
    ["ROUTE"],
  );
});

void test("the principle numerals are the position, two digits", () => {
  assert.deepEqual(
    PRINCIPLES.map((_, index) => stationNumber(index)),
    ["01", "02", "03", "04"],
  );
});

void test("stationNumber keeps two digits and does not truncate past nine", () => {
  assert.equal(stationNumber(0), "01");
  assert.equal(stationNumber(9), "10");
  assert.equal(stationNumber(99), "100");
});
