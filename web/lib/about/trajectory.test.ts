// What this file is for: the rail is a timeline drawn for a set of facts this
// repository does not have, so almost every decision in trajectory.ts is a
// refusal. A refusal is only worth what notices the next thing that walks past
// it — a year typed into a label, a bare system number, a bracket in a tag.

import assert from "node:assert/strict";
import test from "node:test";

import { caseStudyFor } from "../../content/case-studies/index.ts";
import { placeholders } from "./content.ts";
import { STATIONS, fillPercent, restingStation } from "./trajectory.ts";

/** Every string a station prints, flattened. */
function shipped(): readonly string[] {
  return STATIONS.flatMap((station) => [
    station.label,
    station.caption,
    station.title,
    station.body ?? "",
    ...station.tags,
    station.shipped?.label ?? "",
  ]);
}

void test("nothing the rail prints is a bracketed placeholder", () => {
  // The sheet carries `[Y1]`–`[Y5]` in the labels and `[LANGUAGE]` in a tag row.
  assert.deepEqual(placeholders(shipped()), []);
});

// THE REFUSAL THIS COMPONENT IS BUILT AROUND. A timeline asserts WHEN and IN
// WHAT ORDER; nothing here can back the first. A four-digit number in a label
// is the shape that claim takes, so that is the shape this refuses.
void test("no label is a year", () => {
  for (const station of STATIONS) {
    assert.equal(/\d{4}/.test(station.label), false, `${station.key}: ${station.label}`);
  }
});

void test("the labels are the positions, and the last one is NOW", () => {
  assert.deepEqual(
    STATIONS.map((station) => station.label),
    ["01", "02", "03", "04", "05", "NOW"],
  );
});

// THE COLLISION, HELD APART BY SHAPE. `01` and `02` also name systems on this
// site. A station label is a bare number; a system is a number WITH a name. A
// shipped cell reading `02` alone would be indistinguishable from the station
// two rows up.
void test("a shipped system carries its name, never a bare number", () => {
  for (const station of STATIONS) {
    if (station.shipped === null) continue;
    assert.match(station.shipped.label, /^\d{2} \S/, station.shipped.label);
  }
});

// Invariant 5: evidence never points into nothing. `caseStudyFor` is the gate in
// front of `/work/[slug]`, so asking it here is the same question the route asks.
void test("every shipped station points at a case study that exists", () => {
  const shippedStations = STATIONS.filter((station) => station.shipped !== null);

  assert.equal(shippedStations.length, 1, "exactly one station has shipped a system");
  for (const station of shippedStations) {
    assert.notEqual(caseStudyFor(station.shipped?.slug ?? ""), null, station.key);
  }
});

// The count is the honest one rather than a gap in the work, and it is asserted
// so that filling one in K2 is a diff that has to change this line too.
void test("exactly one station has a body, and the rest say so by being null", () => {
  const written = STATIONS.filter((station) => station.body !== null);

  assert.deepEqual(
    written.map((station) => station.key),
    ["s5"],
  );
});

void test("no tag names a technology this repository does not use", () => {
  // `AWS` is the one the sheet drew and this does not: the site runs on one VPS
  // at OVH, ADR 0008 says why, and the string appears nowhere else in the tree.
  const tags = STATIONS.flatMap((station) => station.tags);
  assert.equal(tags.includes("AWS"), false);
});

void test("no key is used twice", () => {
  const keys = STATIONS.map((station) => station.key);
  assert.equal(new Set(keys).size, keys.length);
});

void test("the rail rests on NOW", () => {
  assert.equal(restingStation(), STATIONS.length - 1);
  assert.equal(STATIONS[restingStation()].label, "NOW");
});

// THE FILL IS ARITHMETIC AND NOT SIX TYPED WIDTHS, which is the whole reason it
// is a function. The first dot sits half a column in, the last half a column
// short of the end — a fill that ran to 100% would end past the mark it is
// pointing at.
void test("the fill reaches the centre of the chosen dot", () => {
  assert.deepEqual(
    STATIONS.map((_, index) => Number(fillPercent(index).toFixed(4))),
    [8.3333, 25, 41.6667, 58.3333, 75, 91.6667],
  );
});

void test("the fill never runs to either end", () => {
  for (const [index] of STATIONS.entries()) {
    const percent = fillPercent(index);
    assert.ok(percent > 0 && percent < 100, `${String(index)}: ${String(percent)}`);
  }
});
