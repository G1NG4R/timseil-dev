// What this file is for: the About sheet is the most placeholder-dense drawing
// in the handoff — eleven bracketed strings across two artboards, in two
// languages — and the whole of this phase's content decision is "a bracket is a
// sentence this page would be making up." That decision is worth exactly as
// much as the thing that notices the next bracket being added.
//
// So the guard is asserted against the shipped constants, not against a sample.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { OPERATOR, PRINCIPLES, STACK, placeholders, stationNumber } from "./content.ts";

/** Every string this page prints out of these tables, flattened. */
function shipped(): readonly string[] {
  return [
    ...OPERATOR.flatMap((row) => [row.label, row.value]),
    ...STACK.flatMap((tile) => [tile.label, ...tile.names]),
    ...PRINCIPLES.flatMap((item) => [item.title, item.detail]),
  ];
}

/** What `stack.yaml` says runs on the cluster, through the file make gen writes. */
function clusterComponents(): readonly string[] {
  const generated = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "api", "internal", "seed", "stack.gen.json"),
    "utf8",
  );
  // `| undefined` ON THE INDEX SIGNATURE ON PURPOSE. Without it the key lookup
  // is typed as always present, the guard below reads as dead code to the
  // linter, and a renamed system would reach `.length` as a TypeError rather
  // than as the sentence underneath. The file is generated, which makes the
  // shape predictable and not guaranteed.
  const parsed = JSON.parse(generated) as {
    systems: Record<string, readonly string[] | undefined>;
  };
  const names = parsed.systems["talos-prod"];
  // A read that silently returns nothing would make every assertion below pass
  // against an empty set, which is the failure this whole file is built to
  // refuse one level up.
  assert.ok(names !== undefined && names.length > 0, "stack.gen.json has no talos-prod");
  return names;
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
// drew could not be backed:
//
//   `SERVICES · 4 containers`  compose.yaml defines ten services.
//   `WATCH · Nightly dump off the box. The restore has been tested.`
//                              The backup job is build plan L6 and the restore
//                              drill is L6 and M5. Neither had run.
//
// U4 REPLACED THE GUARD RATHER THAN PORTING IT, because the shape it watched is
// gone. With the bodies dropped, `/\d+\s+containers?/` would run over six lists
// of component names in which the word cannot occur — green, and worth nothing.
// And `/backup|dump|restore/` guarded a premise that has expired: it existed
// because THIS VPS had no backup job, and Velero is on the cluster the tiles now
// describe. What is left is the property both halves came from, and it is
// stricter than either:
//
//   no digit    — a count is the thing that goes stale on the sixth node, and
//                 `4 containers` is the incident that says so.
//   no sentence — a tile names what runs. The moment it can end a sentence it
//                 can make a claim, and nothing here measures one.
//
// SCOPED TO THE TILES, on purpose and unchanged. Principle 02 one section down
// says a public address "teaches you timeouts, certificates, backups, and your
// own blind spots" — a sentence about learning, not a claim about a host, and a
// guard broad enough to catch it would be a guard nobody could keep.
void test("no tile in WHAT I RUN carries a count or a sentence", () => {
  const tiles = STACK.flatMap((tile) => tile.names).join(" ");
  assert.equal(/\d/.test(tiles), false, tiles);
  assert.equal(/[.!?]/.test(tiles), false, tiles);
});

// THE TILES ARE A GROUPING OF `stack.yaml`, AND THIS IS WHAT MAKES THAT TRUE.
// Without it the page holds a second copy of the cluster's component list, and
// a second copy is a list that drifts: the U3 acceptance found exactly that one
// page over, in a dev fixture calling itself "transcribed from stack.gen.json"
// that had stopped being it four version bumps earlier.
//
// BOTH DIRECTIONS, and the second one is the interesting half. "Every name on a
// tile is a real component" stops the page inventing one. "Every component
// reaches a tile" stops the opposite drift — a component added to stack.yaml,
// printed as a chip on /work, and quietly missing from the section whose whole
// job is to show what runs. It goes red the day the cluster grows, which is
// when somebody should be deciding which axis the new name belongs on.
//
// READING ACROSS THE BOUNDARY is the move lib/seo/pages.test.ts makes for
// seed.sql and lib/contact/fields.test.ts makes for the contract: the curated
// file is the one to be held against, and a transcription would be the defect
// rather than the fix. It is read in the TEST and not imported by content.ts —
// an import would pull a file from outside web/ into the Next graph.
void test("the tiles name the cluster's components, all of them and only them", () => {
  const onTiles = STACK.flatMap((tile) => tile.names);
  assert.deepEqual(
    [...onTiles].sort(),
    [...clusterComponents()].sort(),
    "the tiles and stack.yaml disagree about what runs on talos-prod",
  );
  assert.equal(new Set(onTiles).size, onTiles.length, "a component is on two tiles");
});

void test("a component that is not on the cluster fails the membership check", () => {
  // The broken case. Without it the assertion above could be green because the
  // comparison compares two things assembled the same wrong way — the failure
  // ADR 0057 names and the one the training log's left join hit in U3.
  const known = new Set(clusterComponents());
  assert.equal(known.has("Talos"), true);
  assert.equal(known.has("Forgejo"), false);
  assert.equal(known.has("Kubernetes "), false, "a stray space must not pass");
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
