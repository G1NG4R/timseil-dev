// What the design handoff draws, extracted from the sheets, for a test to hold
// the built page against.
//
// WHY THE SHEET IS PARSED AND NOT RENDERED. The build plan asks for "Playwright
// gegen `make design`", and that is one CDN outage away from a red pipeline: the
// sheets load react@18.3.1 from unpkg and their faces from Google Fonts, and
// INDEX.md states the failure mode as measured fact — "Eine schwarze Seite
// heißt: kein Netz." A comparison that needs two third parties to be up is a
// comparison that goes red for reasons that are not ours.
//
// It costs nothing, because the artboards are styled ENTIRELY INLINE. Between
// the artboard boundaries there is not one `class=` attribute; every measurement
// is a declaration in a `style` string, and `support.js` hands those to React
// unchanged. So the source says what the browser would say.
//
// AND IT IS THE METHOD THE HANDOFF USED ON ITSELF. The `Consistency Check`
// sheet, on how its own eighteen findings were made: "QUELLE STATT BILD —
// geprüft wurde der Quelltext aller elf Seiten, nicht der Screenshot."
//
// WHAT IS MACHINE AND WHAT IS JUDGEMENT, because the split is the whole design:
//
//   machine   that the sheet really says what MAP claims it says. Every entry
//             names a line and the exact declaration expected on it; a sheet
//             that says something else stops this script.
//   judgement that `grid-template-columns:1fr 400px` on the hero row means the
//             rail is 400px wide. That is a reading, it is written out in the
//             entry, and a reviewer can disagree with it.
//
// A computed value cannot be compared with an authored one — `1fr 400px`
// resolves to `680px 400px` in a browser — so the entries do not compare
// strings. They name a MEASUREMENT to take on the built page, which is what the
// sheet's numbers are about in the first place.
//
// ADDRESSED BY LINE NUMBER, which is stable here and nowhere else: `docs/design/`
// is read-only, was frozen on 2026-08-16, and INDEX.md is the only file in it
// anyone may write.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = 'web/e2e/oracle/case-study.gen.json';

const SHEETS = {
  template: 'docs/design/Case Study Template - timseil.dev.dc.html',
  widths: 'docs/design/Intermediate Widths - timseil.dev.dc.html',
};

// ONE DECISION MOVES MANY MEASUREMENTS, so the reasons are named once and
// referred to. Without this the oracle would read as twenty separate defects
// where there are three decisions.
const DIVERGENCE = {
  'half-pixel':
    'The sheets draw 9.5, 10.5 and 11.5px. tokens.css has thirteen steps and ' +
    '"keine halben Pixel" (G1) — every mono size rounds down to the nearest ' +
    'step. One decision, many places.',
  'spacing-scale':
    'The sheets draw spacing off the 4px grid (22, 24, 13, 38, 100px). ' +
    'Foundations fixes the scale and G1 made it binding, so case.css reads the ' +
    'nearest step. The largest single difference is 4px.',
  'adr-0052':
    'Decided in ADR 0052 with its sources: Case Study 02, the Intermediate ' +
    'Widths register and Consistency Check K-29 all say five tiles; the ' +
    'template draws three.',
};

/**
 * The map. Each entry: where the sheet says it, what it says there, and what to
 * measure on the built page to find out whether we did it.
 *
 * `expect` is the number the page must produce. Where it is not the sheet's own
 * number, `diverges` names which decision moved it — and a divergence with no
 * entry in DIVERGENCE stops this script, so "we differ here" can never become
 * the quiet way out of a finding.
 */
const MAP = [
  // ── 1440 · Case Study Template, artboard 1a ──────────────────────────────
  {
    id: 'hero-rail-width',
    sheet: 'template', artboard: '1a', width: 1440, line: 66,
    decl: 'grid-template-columns', says: '1fr 400px',
    reading: 'the hero row is one flexible column and a 400px rail',
    measure: { kind: 'box-width', selector: '.cs-spec > .rail' }, expect: 400,
  },
  {
    id: 'hero-gap',
    sheet: 'template', artboard: '1a', width: 1440, line: 66,
    decl: 'gap', says: '80px',
    reading: 'and 80px of air between them',
    measure: { kind: 'gap-x', from: '.cs-spec > div:first-child', to: '.cs-spec > .rail' },
    expect: 80,
  },
  {
    id: 'hero-h1-size',
    sheet: 'template', artboard: '1a', width: 1440, line: 74,
    decl: 'font', says: "500 52px/1.1 'Chakra Petch',sans-serif",
    reading: 'the case study headline is the 52px display step — K-08 keeps 62 for the homepage and About',
    measure: { kind: 'computed', selector: '.cs-spec h1', prop: 'font-size' }, expect: '52px',
  },
  {
    id: 'hero-h1-measure',
    sheet: 'template', artboard: '1a', width: 1440, line: 74,
    decl: 'max-width', says: '660px',
    reading: 'and it is capped so the sentence breaks where the sheet breaks it',
    measure: { kind: 'computed', selector: '.cs-spec h1', prop: 'max-width' }, expect: '660px',
  },
  {
    id: 'spec-key-column',
    sheet: 'template', artboard: '1a', width: 1440, line: 83,
    decl: 'grid-template-columns', says: '72px 1fr',
    reading: 'the spec rail sets its keys in a fixed 72px column',
    measure: { kind: 'box-width', selector: '.spec-body > dt:first-of-type' }, expect: 72,
  },
  {
    id: 'spec-row-gap',
    sheet: 'template', artboard: '1a', width: 1440, line: 83,
    decl: 'gap', says: '11px 16px',
    reading: '11px between rows',
    measure: { kind: 'computed', selector: '.spec-body', prop: 'row-gap' }, expect: '10px',
    diverges: { class: 'spacing-scale', sheet: '11px' },
  },
  {
    id: 'metric-columns',
    sheet: 'template', artboard: '1a', width: 1440, line: 93,
    decl: 'grid-template-columns', says: 'repeat(3,1fr)',
    reading: 'the template draws three metric cells',
    measure: { kind: 'track-count', selector: '.ops-tiles' }, expect: 5,
    diverges: { class: 'adr-0052', sheet: '3' },
  },
  {
    id: 'section-head-gap',
    sheet: 'template', artboard: '1a', width: 1440, line: 100,
    decl: 'gap', says: '16px',
    reading: 'the section number and its title sit 16px apart',
    measure: { kind: 'computed', selector: '.sec', prop: 'column-gap' }, expect: '16px',
  },
  {
    id: 'section-head-rule',
    sheet: 'template', artboard: '1a', width: 1440, line: 100,
    decl: 'padding-bottom', says: '12px',
    reading: 'and stand 12px above their hairline',
    measure: { kind: 'computed', selector: '.sec', prop: 'padding-bottom' }, expect: '12px',
  },
  {
    id: 'problem-rail-width',
    sheet: 'template', artboard: '1a', width: 1440, line: 104,
    decl: 'grid-template-columns', says: '1fr 380px',
    reading: 'the constraints rail is narrower than the spec rail by 20px',
    measure: { kind: 'box-width', selector: '.cs-prob > .rail' }, expect: 380,
  },
  {
    id: 'section-head-space',
    sheet: 'template', artboard: '1a', width: 1440, line: 100,
    decl: 'margin-bottom', says: '38px',
    reading: 'and 38px of air before the section body',
    measure: { kind: 'computed', selector: '.sec', prop: 'margin-bottom' }, expect: '34px',
    diverges: { class: 'spacing-scale', sheet: '38px' },
  },

  // ── the six the comparison found in one component ────────────────────────
  // Every entry below was added AFTER the run that failed, and each one is a
  // measurement the first build of `.cs-constraints` got wrong. They are here
  // so the repair cannot drift back.
  {
    id: 'constraint-number-column',
    sheet: 'template', artboard: '1a', width: 1440, line: 113,
    decl: 'grid-template-columns', says: '16px 1fr',
    reading: 'each constraint sets its ordinal in a 16px column',
    measure: { kind: 'computed', selector: '.cs-constraints li', prop: 'grid-template-columns' },
    expect: '16px',
  },
  {
    id: 'constraint-ordinal-gap',
    sheet: 'template', artboard: '1a', width: 1440, line: 113,
    decl: 'gap', says: '10px',
    reading: 'with 10px between the ordinal and its sentence',
    measure: { kind: 'computed', selector: '.cs-constraints li', prop: 'column-gap' },
    expect: '10px',
  },
  {
    id: 'constraint-row-gap',
    sheet: 'template', artboard: '1a', width: 1440, line: 112,
    decl: 'gap', says: '13px',
    reading: 'the five are spaced by a gap, not by padding, and carry no rule between them',
    measure: { kind: 'computed', selector: '.cs-constraints', prop: 'row-gap' },
    expect: '12px',
    diverges: { class: 'spacing-scale', sheet: '13px' },
  },
  {
    id: 'constraint-face',
    sheet: 'template', artboard: '1a', width: 1440, line: 112,
    decl: 'font', says: "400 11.5px/1.55 'JetBrains Mono',monospace",
    reading: 'they are set in mono, not in the body face the first build used',
    measure: { kind: 'computed', selector: '.cs-constraints', prop: 'font-size' },
    expect: '11px',
    diverges: { class: 'half-pixel', sheet: '11.5px' },
  },
  {
    id: 'constraint-panel',
    sheet: 'template', artboard: '1a', width: 1440, line: 110,
    decl: 'padding', says: '22px 24px',
    reading: 'the list sits on a plate — the first build drew none at all',
    measure: { kind: 'computed', selector: '.cs-panel', prop: 'padding-top' },
    expect: '20px',
    diverges: { class: 'spacing-scale', sheet: '22px' },
  },

  // ── 390 · Case Study Template, artboard 1c ───────────────────────────────
  {
    id: 'mobile-head-height',
    sheet: 'template', artboard: '1c', width: 390, line: 347,
    decl: 'height', says: '52px',
    reading: 'the header is 52px below the 900 switch — ADR 0044 put the switch there',
    measure: { kind: 'computed', selector: '.head', prop: 'height' }, expect: '52px',
  },
  {
    id: 'mobile-h1-size',
    sheet: 'template', artboard: '1c', width: 390, line: 364,
    decl: 'font', says: "500 34px/1.12 'Chakra Petch',sans-serif",
    reading: 'the display step falls to 34 on a phone — K-08, and layout.css owns the 720 switch',
    measure: { kind: 'computed', selector: '.cs-spec h1', prop: 'font-size' }, expect: '34px',
  },
  {
    id: 'mobile-constraints-one-column',
    sheet: 'template', artboard: '1c', width: 390, line: 398,
    decl: 'flex-direction', says: 'column',
    reading: 'and on a phone they are one column again — found in review, after the 1024 frame had been read and the mobile one had not',
    measure: { kind: 'computed', selector: '.cs-constraints', prop: 'flex-direction' },
    expect: 'column',
  },
  {
    id: 'mobile-column',
    sheet: 'template', artboard: '1c', width: 390, line: 345,
    decl: 'padding', says: '0 22px',
    reading: 'the mobile margin is 22px a side, which is the 346px column',
    measure: { kind: 'box-width', selector: 'main.col' }, expect: 346,
  },

  // ── 1024 · Intermediate Widths, artboard 1c ──────────────────────────────
  {
    id: 'tablet-head-height',
    sheet: 'widths', artboard: '1c', width: 1024, line: 387,
    decl: 'height', says: '66px',
    reading: 'at 1024 the header is still the full 66px — the sheet says "Kopf noch vollständig"',
    measure: { kind: 'computed', selector: '.head', prop: 'height' }, expect: '66px',
  },
  {
    id: 'tablet-hero-single-column',
    sheet: 'widths', artboard: '1c', width: 1024, line: 411,
    decl: 'flex-direction', says: 'column',
    reading: 'and the hero is one column, the rail underneath it',
    measure: { kind: 'computed', selector: '.cs-spec', prop: 'flex-direction' }, expect: 'column',
  },
  {
    id: 'tablet-hero-gap',
    sheet: 'widths', artboard: '1c', width: 1024, line: 411,
    decl: 'gap', says: '44px',
    reading: '44px between the text and the rail below it — the one number the sheet leaves open, and it settles it here',
    measure: { kind: 'computed', selector: '.cs-spec', prop: 'row-gap' }, expect: '44px',
  },
  {
    id: 'tablet-h1-size',
    sheet: 'widths', artboard: '1c', width: 1024, line: 414,
    decl: 'font', says: "500 52px/1.08 'Chakra Petch',sans-serif",
    reading: 'the headline stays at 52 down to the 720 switch',
    measure: { kind: 'computed', selector: '.cs-spec h1', prop: 'font-size' }, expect: '52px',
  },
  {
    id: 'tablet-constraints-two-columns',
    sheet: 'widths', artboard: '1c', width: 1024, line: 457,
    decl: 'grid-template-columns', says: '1fr 1fr',
    reading: 'below 1080 the constraints go two-up for the reason the rail does — five short lines in a full-width plate leave a stripe of nothing',
    measure: { kind: 'track-count', selector: '.cs-constraints' }, expect: 2,
  },
  {
    id: 'tablet-spec-two-pairs',
    sheet: 'widths', artboard: '1c', width: 1024, line: 426,
    decl: 'grid-template-columns', says: '72px 1fr 72px 1fr',
    reading: 'the rail grows sideways rather than downwards — the sheet annotates this frame with exactly that sentence',
    measure: { kind: 'track-count', selector: '.spec-body' }, expect: 4,
  },
];

// ---------------------------------------------------------------- extraction

/** The `style` attribute of one line, as a map of declaration → value. */
function declarationsOn(text, file, line) {
  const source = text.split('\n')[line - 1];
  if (source === undefined) {
    die(`${file}:${String(line)} does not exist`);
  }

  const style = /\sstyle="([^"]*)"/.exec(source);
  if (style === null) {
    die(`${file}:${String(line)} carries no style attribute`);
  }

  const found = new Map();
  for (const part of style[1].split(';')) {
    const at = part.indexOf(':');
    if (at === -1) continue;
    // Last one wins, as the cascade does and as support.js's cssToObj does.
    found.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
  }
  return found;
}

function die(message) {
  console.error(`  ✗ ${message}`);
  process.exit(1);
}

const sources = {};
for (const [key, path] of Object.entries(SHEETS)) {
  sources[key] = readFileSync(resolve(root, path), 'utf8');
}

const entries = [];
const seen = new Set();

for (const entry of MAP) {
  if (seen.has(entry.id)) die(`two entries share the id ${entry.id}`);
  seen.add(entry.id);

  const file = SHEETS[entry.sheet];
  if (file === undefined) die(`${entry.id}: no sheet named ${entry.sheet}`);

  const declarations = declarationsOn(sources[entry.sheet], file, entry.line);
  const actual = declarations.get(entry.decl);

  if (actual === undefined) {
    die(
      `${entry.id}: ${file}:${String(entry.line)} has no \`${entry.decl}\` — it has ` +
        `${[...declarations.keys()].join(', ')}`,
    );
  }

  // THE ONE THING THIS SCRIPT PROVES. Everything else in an entry is a reading;
  // this is the transcription, and a transcription that is not checked is the
  // defect the whole file exists to avoid.
  if (actual !== entry.says) {
    die(`${entry.id}: ${file}:${String(entry.line)} says \`${actual}\`, the map claims \`${entry.says}\``);
  }

  if (entry.diverges !== undefined && DIVERGENCE[entry.diverges.class] === undefined) {
    die(`${entry.id}: diverges as "${entry.diverges.class}", which has no reason written down`);
  }

  entries.push({
    id: entry.id,
    sheet: file,
    artboard: entry.artboard,
    line: entry.line,
    width: entry.width,
    says: `${entry.decl}: ${entry.says}`,
    reading: entry.reading,
    measure: entry.measure,
    expect: entry.expect,
    ...(entry.diverges === undefined ? {} : { diverges: entry.diverges }),
  });
}

// A map that resolved nothing is a green test that asserts nothing. The number
// is written down so that deleting half the map is loud rather than quiet.
if (entries.length !== MAP.length) {
  die(`resolved ${String(entries.length)} of ${String(MAP.length)} entries`);
}

const document = {
  comment: 'Generated from the design handoff by tools/gen-sheet-oracle.mjs — do not edit by hand.',
  divergenceReasons: DIVERGENCE,
  entries,
};

mkdirSync(resolve(root, dirname(target)), { recursive: true });
writeFileSync(resolve(root, target), `${JSON.stringify(document, null, 2)}\n`);

const diverging = entries.filter((entry) => entry.diverges !== undefined).length;
console.error(
  `  ✓ ${target} — ${String(entries.length)} measurements, ${String(diverging)} diverging`,
);
