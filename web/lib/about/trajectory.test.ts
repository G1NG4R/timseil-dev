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
import { resolveMessages } from "../i18n/messages.ts";
import { LOCALES } from "../i18n/routes.ts";
import { placeholders } from "./content.ts";
import {
  STATIONS,
  STATION_KEYS,
  type Station,
  fillPercent,
  restingStation,
  stationsFor,
} from "./trajectory.ts";

/**
 * The rail in every language that has one.
 *
 * READ THROUGH `stationsFor` AND NOT OFF THE GERMAN MODULE, because the bundle
 * is the thing under test: a `trajectory.de.ts` that exists and is not wired to
 * `TRAJECTORY` would pass every assertion below while the page drew English.
 */
const RAILS: readonly { readonly language: string; readonly stations: readonly Station[] }[] = [
  { language: "en", stations: STATIONS },
  { language: "de", stations: stationsFor("de").stations },
];

/** Every string a station prints, flattened. */
function shipped(stations: readonly Station[]): readonly string[] {
  return stations.flatMap((station) => [
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
  // Both languages, because U8a's own precedent for this is `[FOLGT]`: a
  // translation in progress is exactly where a bracket gets parked.
  for (const rail of RAILS) {
    assert.deepEqual(placeholders(shipped(rail.stations)), [], rail.language);
  }
});

// THE REFUSAL THIS COMPONENT IS BUILT AROUND, AND SINCE U5 IT COVERS THE PROSE.
// A timeline asserts WHEN and IN WHAT ORDER; this one declines the first, and
// the label was the only place that could be broken while five of six panels
// were empty. Now there are six paragraphs, and a paragraph is where a year
// walks back in — "since 2021", "for three years" — wearing ordinary sentence
// clothes. Every field is checked rather than the one that used to be the risk.
void test("no field of any station carries a year, in any language", () => {
  for (const rail of RAILS) {
    for (const value of shipped(rail.stations)) {
      assert.equal(/\d{4}/.test(value), false, `${rail.language}: ${value}`);
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

  assert.notEqual(caseStudyFor("timseil-dev", "en"), null, "timseil.dev has a case study");
  assert.equal(
    caseStudyFor("talos-prod", "en"),
    null,
    "the cluster has none, and the cell says so",
  );
});

// U5 IS THE PHASE THAT WROTE THEM, so this replaces H7b's count of one. The
// type already refuses `null`; what it cannot refuse is an empty string, which
// renders as a panel with a heading and nothing under it.
void test("every station has prose, and none of it is empty", () => {
  for (const rail of RAILS) {
    for (const station of rail.stations) {
      for (const value of [station.caption, station.title, station.body]) {
        assert.notEqual(value.trim(), "", `${rail.language}: ${station.key}`);
      }
    }
  }
});

// THE ORDER IS THE TUPLE'S AND THE COUNT IS THE TUPLE'S. `Record<StationKey, …>`
// makes a language with five paragraphs a compile error, which is the half the
// compiler can do; what it cannot do is notice that `stationsWith` stopped
// reading `STATION_KEYS` and started reading `Object.keys` of whatever it was
// handed — at which point the rail's order would come from a translator's
// editor. Both languages, because both go through the same assembly.
void test("the rail is the key tuple, in the tuple's order", () => {
  assert.equal(STATION_KEYS.length, 6);

  for (const rail of RAILS) {
    assert.deepEqual(
      rail.stations.map((station) => station.key),
      [...STATION_KEYS],
      rail.language,
    );
  }
});

// NOMENCLATURE STANDS ONCE, AND THIS IS WHAT THAT MEANS ON THE PAGE. The label
// over the dot, the tags and the shipped cell come from `MARKS`, so a German
// rail prints the same `PROXMOX` and the same `02 timseil.dev` as the English
// one — and the three prose fields are the only ones that may differ. A
// translation that moved a tag would be a second spelling of a component name,
// which is the drift U3's acceptance found a page over.
void test("German translates the prose and nothing else", () => {
  const english = STATIONS;
  const german = stationsFor("de").stations;

  for (const [index, station] of german.entries()) {
    assert.equal(station.label, english[index].label, station.key);
    assert.deepEqual(station.tags, english[index].tags, station.key);
    assert.deepEqual(station.shipped, english[index].shipped, station.key);

    assert.notEqual(station.body, english[index].body, `${station.key} body`);
  }

  // `Homelab` and `Helpdesk` are the same word in both languages — the reason
  // is in trajectory.de.ts's head — so the captions are asserted as a set
  // rather than as six inequalities. Four of six move; the two that do not are
  // named here so a reviewer sees a decision instead of an oversight.
  const same = german.filter((station, index) => station.caption === english[index].caption);
  assert.deepEqual(
    same.map((station) => station.caption),
    ["Homelab", "Helpdesk"],
  );
});

// THE HALF `languageComplete` EXISTS FOR, READ OFF BOTH SIDES. The catalogue and
// this bundle resolve separately — one through `resolveMessages`, one through
// `resolveContent` — and the page puts their output in the same `<main>` under
// one `lang`. If they ever disagreed, `/de` would carry a German label over an
// English paragraph and claim German for both. `BUNDLES` is what ties them, and
// `/fr` is the live case: empty, so both come back English.
void test("the paragraphs and the catalogue resolve to the same language", () => {
  for (const locale of LOCALES) {
    assert.equal(
      stationsFor(locale).resolved,
      resolveMessages(locale).resolved,
      locale,
    );
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
