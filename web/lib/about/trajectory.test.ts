// What this file is for: the rail is a timeline, and a timeline is the easiest
// component on this site to put a claim into by accident. A year typed into a
// label, a bare system number, a bracket in a tag, a component spelled the way
// the draft spelled it rather than the way the manifest does — each one is one
// character of work and none of them turns anything else red.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    station.body,
    ...station.tags,
    station.shipped?.label ?? "",
  ]);
}

/** What `stack.yaml` says runs on the cluster, through the file make gen writes. */
function clusterComponents(): readonly string[] {
  const generated = readFileSync(
    join(import.meta.dirname, "..", "..", "..", "api", "internal", "seed", "stack.gen.json"),
    "utf8",
  );
  const parsed = JSON.parse(generated) as {
    systems: Record<string, readonly string[] | undefined>;
  };
  const names = parsed.systems["talos-prod"];
  assert.ok(names !== undefined && names.length > 0, "stack.gen.json has no talos-prod");
  return names;
}

void test("nothing the rail prints is a bracketed placeholder", () => {
  // The sheet carries `[Y1]`–`[Y5]` in the labels and `[LANGUAGE]` in a tag row.
  assert.deepEqual(placeholders(shipped()), []);
});

// THE REFUSAL THIS COMPONENT IS BUILT AROUND, AND SINCE U5 IT COVERS THE PROSE.
// A timeline asserts WHEN and IN WHAT ORDER; this one declines the first, and
// the label was the only place that could be broken while five of six panels
// were empty. Now there are six paragraphs, and a paragraph is where a year
// walks back in — "since 2021", "for three years" — wearing ordinary sentence
// clothes. Every field is checked rather than the one that used to be the risk.
void test("no field of any station carries a year", () => {
  for (const station of STATIONS) {
    for (const value of [
      station.label,
      station.caption,
      station.title,
      station.body,
      ...station.tags,
      station.shipped?.label ?? "",
    ]) {
      assert.equal(/\d{4}/.test(value), false, `${station.key}: ${value}`);
    }
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
// two rows up — and since U5 both numbers are in play at once, because the
// cluster is system `01` and there is a station `01`.
void test("a shipped system carries its name, never a bare number", () => {
  for (const station of STATIONS) {
    if (station.shipped === null) continue;
    assert.match(station.shipped.label, /^\d{2} \S/, station.shipped.label);
  }
});

// INVARIANT 5 IS ABOUT WHERE A LINK POINTS, AND SINCE U5 THAT IS THE WHOLE
// DISTINCTION. Two stations ship a system; `caseStudyFor` is the same gate
// `/work/[slug]` puts in front of a page, and it answers for exactly one of
// them. The other is `talos-prod`, which ADR 0079 §2 gives no case study — its
// cell prints the name and draws no `<a>`. Asserting that it does NOT resolve
// is the half that matters: the day someone writes that case study, this goes
// red and the decision gets made deliberately rather than by a link appearing.
void test("two stations shipped a system, and exactly one has a page", () => {
  const shippedStations = STATIONS.filter((station) => station.shipped !== null);
  assert.deepEqual(
    shippedStations.map((station) => station.shipped?.slug),
    ["timseil-dev", "talos-prod"],
  );

  assert.notEqual(caseStudyFor("timseil-dev"), null, "timseil.dev has a case study");
  assert.equal(caseStudyFor("talos-prod"), null, "the cluster has none, and the cell says so");
});

// U5 IS THE PHASE THAT WROTE THEM, so this replaces H7b's count of one. The
// type already refuses `null`; what it cannot refuse is an empty string, which
// renders as a panel with a heading and nothing under it.
void test("every station has prose, and none of it is empty", () => {
  for (const station of STATIONS) {
    assert.notEqual(station.body.trim(), "", station.key);
  }
});

// A STATION WITH NO TAGS DRAWS `PICKED UP` OVER AN EMPTY ROW, which is the dead
// state STATE.05 calls a bug: a label for a list that is not there.
void test("every station names at least one thing it picked up", () => {
  for (const station of STATIONS) {
    assert.ok(station.tags.length > 0, `${station.key} picked up nothing`);
    for (const tag of station.tags) {
      assert.equal(tag.trim(), tag, `${station.key}: padded tag ${tag}`);
      assert.notEqual(tag, "", `${station.key}: empty tag`);
    }
  }
});

// ONE DIRECTION ONLY, AND THAT IS THE DIFFERENCE FROM THE TILES. content.test.ts
// asks both — every tile name is a component AND every component reaches a tile
// — because the tiles' job is to show what runs. The rail's job is to say what
// was picked up, so it may name fewer; what it may not do is name one of them
// differently. `CNPG` for `CloudNativePG` is how a page ends up with two words
// for one thing, which is the drift the U3 acceptance found a page over.
void test("the cluster's tags are spelled the way stack.yaml spells them", () => {
  const components = clusterComponents().map((name) => name.toUpperCase());
  const now = STATIONS[STATIONS.length - 1];

  for (const tag of now.tags) {
    assert.ok(components.includes(tag), `${tag} is not a component of talos-prod`);
  }
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
// pointing at. The six numbers are also what styles/about.css writes out by
// hand, so this is the pair that keeps the stylesheet honest.
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
