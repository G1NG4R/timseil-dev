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
const SHEETS = {
  template: 'docs/design/Case Study Template - timseil.dev.dc.html',
  widths: 'docs/design/Intermediate Widths - timseil.dev.dc.html',
  // H3. The homepage draws itself at 1440 and 390 and nowhere else — the
  // Intermediate Widths sheet says so and gives the reason: "DIE STARTSEITE
  // FEHLT ABSICHTLICH: ihr Umbau ist der einfachste von allen."
  homepage: 'docs/design/Homepage - timseil.dev.dc.html',
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
    'Foundations fixes the scale and G1 made it binding, so the stylesheets read ' +
    'the nearest step. Differences of up to 8px, and no further: where the gap ' +
    'grew past that it got a class of its own rather than a wider excuse. H3 is ' +
    'where that line was drawn — see `hero-rhythm`.',
  'adr-0052':
    'Decided in ADR 0052 with its sources: Case Study 02, the Intermediate ' +
    'Widths register and Consistency Check K-29 all say five tiles; the ' +
    'template draws three.',
  'one-copy-set':
    'The sheet carries two sets of words for the architecture section — full ' +
    'sentences at 1440 and abbreviations at 390 ("Same origin, no CDN" against ' +
    '"Same origin, no CDN — nothing third-party in the path"), and it drops the ' +
    'POST-MORTEM lane on the phone. content/case-studies carries ONE set, ' +
    'because a second exists only to be forgotten when the first is corrected. ' +
    'The full sentences then need a column each below 560, where the sheet ' +
    'still draws two.',
  'divider-is-the-gap':
    'The sheet divides the pipeline with a border on each box — vertical at ' +
    '1440 (line 244), horizontal at 390 (line 511). Two rules for one picture, ' +
    'and which one applies depends on where the row wraps. case.css draws both ' +
    'with a 1px gap over the container line instead, so the divider follows the ' +
    'column count with no rule to keep in step. Built the sheet\'s way first, ' +
    'and a screenshot at 390 showed seven stages reading as one paragraph.',
  // ── H3 ───────────────────────────────────────────────────────────────────
  'hero-rhythm':
    'The homepage hero is drawn with 84px above it, twelve pixels off the ' +
    'nearest step of a scale G1 made binding. `spacing-scale` covers roundings ' +
    'of up to eight and this is not one; folding it in would have turned a ' +
    'reason into a habit. The rhythm is --s-72 over --s-96, which is the same ' +
    'pair `.cs-head` uses, so the two heroes on this site breathe alike.',
  'mono-scale':
    'The sheet sets the hero subline at 14px mono and tracks AVAILABLE at ' +
    '.18em. The mono scale has 9 · 10 · 11 · 12 · 13 and the tracking tokens ' +
    'are .14em and .16em — neither value is a step, and G1\'s "keine halben ' +
    'Pixel" applies to a scale with no fourteen just as much as to a 11.5. ' +
    'Rounded down, as `half-pixel` rounds.',
  'placeholder-height':
    'The sheet gives the terminal body 348px and a scrollbar, because there it ' +
    'is a session. Here it is a frame stage J will fill, and it is as tall as ' +
    'what it says. Built the sheet\'s way first: 348px of empty box does not ' +
    'read as a component waiting for a later phase, it reads as one that ' +
    'failed to load. `.st-wait` holds a height for two seconds; this stands ' +
    'for four phases, which is a different question with the same shape.',
  // ── H5a ──────────────────────────────────────────────────────────────────
  'stack-column-bounded':
    'The sheet gives the stack column `auto` and draws five items in it — ' +
    '"REACT ROUTER · GO · DOCKER · ACTIONS · VPS". stack.yaml answers ELEVEN ' +
    'for this system, `auto` is max-content, and max-content of eleven items ' +
    'is 618px at 1440 — taken from the `1fr` beside it, so the description ' +
    'column computed to zero and the sentence the row exists to carry was not ' +
    'drawn at all. The row stood 334px against the other row\'s 76. Bounded at ' +
    'the width the name column already uses, so no new number enters the track ' +
    'list and the stack wraps inside it. Found by measuring the page against a ' +
    'real api: this rig has none, so `/` carries no row at all and the gallery ' +
    'fixture carried three stack items where production answers eleven. Both ' +
    'were changed, and gallery.systems.spec.ts holds the case now.',
  'path-stacks':
    'At 390 the sheet keeps the request path horizontal inside a swipe ' +
    'container and captions it "REQUEST PATH — SWIPE →": five 146px boxes and ' +
    'four arrows, 898px of content behind 346px of screen. It stacks here ' +
    'instead, at the 1080 switch every other two-column row already uses — ' +
    'layout.css states the rule ("Kein Bauteil bekommt seinen eigenen Wert"), ' +
    'and a swipe hides four fifths of the argument on the one device where the ' +
    'reader cannot see there is more. Recorded as a design correction rather ' +
    'than settled here.',
  // ── H5b ──────────────────────────────────────────────────────────────────
  'graph-fits-the-column':
    'The sheet draws the calendar as 53 columns of 15px with a 3px gap, which ' +
    'is 951px, and the content column is min(1160px, 100% - 80px). It therefore ' +
    'overflows from a 1031px window down — at the checked width of 1024 by ' +
    'seven pixels, three switches before anything on this page is allowed to ' +
    'move. The mobile artboard answers with 26 weeks at 11px and the caption ' +
    '"LAST 26 WKS SHOWN"; that leaves 1024 overflowing and splits the total in ' +
    'the caption from the picture it counts. So the columns are `1fr` under a ' +
    'cap of exactly the width the sheet\'s own numbers need: 15px wherever the ' +
    'sheet drew it, smaller below, the same 53 columns and the same caption at ' +
    'every width, and no new switch in layout.css. The gap shrinks with the ' +
    'cell at the sheet\'s own 5:1, because 52 gaps of 3px is 156px of a 346px ' +
    'phone.',
  'source-is-this-api':
    'The sheet captions the calendar `SOURCE GITHUB API`, which names the ' +
    'upstream. Every other source line on this site names the endpoint a reader ' +
    'can open in a second tab — `/api/training`, `/api/systems` — and that is ' +
    'the promise the line makes. GitHub is what UPLINK and CONTRIBUTIONS ' +
    'already say. The operation strip has the same correction for a different ' +
    'reason: the sheet writes `/api/health` there, which is the container that ' +
    'served systems[].days[] before ADR 0005 split it.',
  'counted-window':
    'The sheet writes `LAST 365 DAYS` under the calendar and `365 D` on the ' +
    'phone. The answer carried 367 on 2026-09-01 — 53 weeks, the last of them ' +
    'three days — and 365 is a round number about a year rather than about this ' +
    'picture. Counted from the cells that were actually drawn, which is ' +
    'invariant 7 applied one page over from the 91 it was written for.',
  'square-corners':
    'The sheet gives the calendar cells a 2px radius and the legend swatches ' +
    'the same. `--radius` is 0 on this site and invariant 8 puts every radius ' +
    'in tokens.css, so a two here would be a value with no token behind it — ' +
    'and the operation grid, which is the same grammar at another scale, is ' +
    'square for that reason already.',
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
const CASE_MAP = [
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

  // ── 1440 · Case Study Template, artboard 1a · H2a ────────────────────────
  // `04.02 ARCHITECTURE` and `04.03 BUILD`.
  {
    id: 'arch-panel-padding',
    sheet: 'template', artboard: '1a', width: 1440, line: 131,
    decl: 'padding', says: '34px 36px 30px',
    reading: 'the request-path plate is the third bracketed surface on the page, and the roomiest of the three',
    measure: { kind: 'computed', selector: '.arch', prop: 'padding-top' }, expect: '34px',
  },
  {
    id: 'arch-arrow-track',
    sheet: 'template', artboard: '1a', width: 1440, line: 134,
    decl: 'width', says: '64px',
    reading: 'the arrow between two stations owns a 64px column, which is why the five boxes stay equal',
    measure: { kind: 'box-width', selector: '.arch-hop:nth-child(2) .arch-arrow' }, expect: 64,
  },
  {
    id: 'arch-lanes-columns',
    sheet: 'template', artboard: '1a', width: 1440, line: 144,
    decl: 'grid-template-columns', says: 'repeat(4,1fr)',
    reading: 'four columns for five lanes, so the fifth wraps — the same shape the fifth metric tile takes under 560',
    measure: { kind: 'track-count', selector: '.arch-lanes' }, expect: 4,
  },
  {
    id: 'arch-lanes-gap',
    sheet: 'template', artboard: '1a', width: 1440, line: 144,
    decl: 'gap', says: '18px',
    reading: 'and 18px between them',
    measure: { kind: 'computed', selector: '.arch-lanes', prop: 'column-gap' }, expect: '16px',
    diverges: { class: 'spacing-scale', sheet: '18px' },
  },
  {
    id: 'decision-first-column',
    sheet: 'template', artboard: '1a', width: 1440, line: 154,
    decl: 'grid-template-columns', says: '230px 1fr 1fr',
    reading: 'the decision names the row in a fixed 230px column, and the two prose columns share what is left',
    measure: { kind: 'box-width', selector: '.decision-table thead th:first-child' }, expect: 230,
  },
  {
    id: 'build-rail-width',
    sheet: 'template', artboard: '1a', width: 1440, line: 209,
    decl: 'grid-template-columns', says: '1fr 420px',
    reading: 'THE ROW `.cs-arch` WAS COPIED FOR. layout.css has carried `minmax(0,1fr) 420px` with a 60px gap since G1 under a name that says architecture, and this is the only row on the sheet with those measurements — it is the build row, around the compose block and the phases',
    measure: { kind: 'box-width', selector: '.cs-arch > .rail' }, expect: 420,
  },
  {
    id: 'build-gap',
    sheet: 'template', artboard: '1a', width: 1440, line: 209,
    decl: 'gap', says: '60px',
    reading: 'and 60px of air between them, which is narrower than the hero row above and wider than nothing else',
    measure: { kind: 'gap-x', from: '.cs-arch > div:first-child', to: '.cs-arch > .rail' },
    expect: 60,
  },
  {
    id: 'compose-size',
    sheet: 'template', artboard: '1a', width: 1440, line: 211,
    decl: 'font', says: "400 12px/1.85 'JetBrains Mono',monospace",
    reading: 'the compose block is the 12px mono step at the mono line height — the one place on this sheet where the drawn number and the token agree to the decimal',
    measure: { kind: 'computed', selector: '.compose', prop: 'font-size' }, expect: '12px',
  },
  {
    id: 'phases-gap',
    sheet: 'template', artboard: '1a', width: 1440, line: 227,
    decl: 'gap', says: '12px',
    reading: 'and 12px between a phase ordinal and its text',
    measure: { kind: 'computed', selector: '.phases li', prop: 'column-gap' }, expect: '12px',
  },

  // ── 390 · Case Study Template, artboard 1c · H2a ─────────────────────────
  // "Diagramm scrollt, Tabelle wird zu Karten". The table agrees; the diagram
  // does not, and the reason is written down rather than argued twice.
  {
    id: 'mobile-path-scrolls',
    sheet: 'template', artboard: '1c', width: 390, line: 414,
    decl: 'overflow-x', says: 'auto',
    reading: 'the sheet swipes the path sideways on a phone; it stacks here, and `path-stacks` says why',
    measure: { kind: 'track-count', selector: '.arch-path' }, expect: 1,
    diverges: { class: 'path-stacks', sheet: 'overflow-x: auto, one row' },
  },
  {
    id: 'mobile-lanes-columns',
    sheet: 'template', artboard: '1c', width: 390, line: 427,
    decl: 'grid-template-columns', says: '1fr 1fr',
    reading: 'the sheet keeps two lane columns on a phone, with its own shorter words in them',
    measure: { kind: 'track-count', selector: '.arch-lanes' }, expect: 1,
    diverges: { class: 'one-copy-set', sheet: '1fr 1fr' },
  },
  {
    id: 'mobile-decisions-stack',
    sheet: 'template', artboard: '1c', width: 390, line: 434,
    decl: 'flex-direction', says: 'column',
    reading: 'the table stops being one on a phone — "Tabelle wird zu Karten" is the artboard\'s own caption, and each decision becomes a plate carrying its own column words',
    measure: { kind: 'computed', selector: '.decision-table', prop: 'display' },
    expect: 'block',
  },
  {
    id: 'mobile-decision-card-gap',
    sheet: 'template', artboard: '1c', width: 390, line: 434,
    decl: 'gap', says: '14px',
    reading: 'with 14px between the cards',
    measure: { kind: 'computed', selector: '.decision-table tbody', prop: 'row-gap' },
    expect: '14px',
  },
  // ── 1440 · Case Study Template, artboard 1a — .04 and .05 ────────────────
  {
    id: 'ops-grid-flow',
    sheet: 'template', artboard: '1a', width: 1440, line: 288,
    decl: 'grid-auto-flow', says: 'column',
    reading: 'the operation grid fills downwards and then rightwards, so a column is a week',
    measure: { kind: 'computed', selector: '.ops-grid', prop: 'grid-auto-flow' }, expect: 'column',
  },
  {
    id: 'ops-grid-rows',
    sheet: 'template', artboard: '1a', width: 1440, line: 288,
    decl: 'grid-template-rows', says: 'repeat(7,15px)',
    reading: 'seven rows of 15px — the seven that make 91 come out even (invariant 7)',
    measure: { kind: 'computed', selector: '.ops-grid', prop: 'grid-template-rows' },
    expect: '15px 15px 15px 15px 15px 15px 15px',
  },
  {
    id: 'ops-grid-columns',
    sheet: 'template', artboard: '1a', width: 1440, line: 288,
    decl: 'grid-auto-columns', says: '15px',
    reading: 'and every column it adds is 15px wide',
    measure: { kind: 'computed', selector: '.ops-grid', prop: 'grid-auto-columns' }, expect: '15px',
  },
  {
    id: 'ops-grid-gap',
    sheet: 'template', artboard: '1a', width: 1440, line: 288,
    decl: 'gap', says: '4px',
    reading: '4px between cells — with the two above, the 243px layout.css computes for the whole grid',
    measure: { kind: 'computed', selector: '.ops-grid', prop: 'row-gap' }, expect: '4px',
  },
  {
    id: 'ops-block-margin',
    sheet: 'template', artboard: '1a', width: 1440, line: 279,
    decl: 'margin', says: '0 0 56px',
    reading: 'the grid block is followed by 56px of air before whatever comes next',
    measure: { kind: 'computed', selector: '.ops-figure', prop: 'margin-bottom' }, expect: '56px',
  },
  {
    id: 'ops-caption-size',
    sheet: 'template', artboard: '1a', width: 1440, line: 281,
    decl: 'font', says: "500 9.5px 'JetBrains Mono',monospace",
    reading: 'the caption over the grid is the smallest mono step',
    measure: { kind: 'computed', selector: '.ops-label', prop: 'font-size' }, expect: '9px',
    diverges: { class: 'half-pixel', sheet: '9.5px' },
  },
  {
    id: 'ops-legend-gap',
    sheet: 'template', artboard: '1a', width: 1440, line: 283,
    decl: 'gap', says: '7px',
    reading: 'the legend sets its swatch 7px from its word',
    measure: { kind: 'computed', selector: '.ops-legend li', prop: 'column-gap' }, expect: '6px',
    diverges: { class: 'spacing-scale', sheet: '7px' },
  },
  {
    id: 'result-columns',
    sheet: 'template', artboard: '1a', width: 1440, line: 296,
    decl: 'grid-template-columns', says: '1fr 1fr',
    reading: 'what held and what would change get equal width — the second is not a footnote',
    measure: { kind: 'track-count', selector: '.cs-result' }, expect: 2,
  },
  {
    id: 'result-gap',
    sheet: 'template', artboard: '1a', width: 1440, line: 296,
    decl: 'gap', says: '80px',
    reading: 'with 80px between them, the same air as the other two-column rows on this page',
    measure: { kind: 'computed', selector: '.cs-result', prop: 'column-gap' }, expect: '72px',
    diverges: { class: 'spacing-scale', sheet: '80px' },
  },

  // ── 390 · Case Study Template, artboard 1c — .04 ─────────────────────────
  {
    id: 'pipeline-one-column',
    sheet: 'template', artboard: '1c', width: 390, line: 511,
    decl: 'border-bottom', says: '1px solid rgba(139,152,166,.12)',
    reading:
      'on the phone the stages are stacked and divided horizontally — a bottom rule between ' +
      'boxes is only a divider if they are one above the other',
    measure: { kind: 'track-count', selector: '.pipeline' }, expect: 1,
  },
  {
    id: 'pipeline-divider',
    sheet: 'template', artboard: '1c', width: 390, line: 511,
    decl: 'padding', says: '13px 16px',
    reading: 'and each stacked stage keeps its own padding rather than collapsing to a list row',
    measure: { kind: 'computed', selector: '.pipe-stage', prop: 'padding-top' }, expect: '16px',
    diverges: { class: 'spacing-scale', sheet: '13px' },
  },

];

/**
 * The homepage's map. Build plan H3.
 *
 * TWO ARTBOARDS AND NO THIRD. `Intermediate Widths` draws the case study a
 * third time at 1024 and says in the same breath why it does not draw this
 * page: "DIE STARTSEITE FEHLT ABSICHTLICH: ihr Umbau ist der einfachste von
 * allen — Terminal unter den Hero-Text, Reihenfolge bleibt." So five of the
 * seven checked widths have no drawing here, and home.sweep.spec.ts covers
 * them with the other question.
 *
 * WHAT IS DELIBERATELY ABSENT FROM THIS MAP, because a measurement of a
 * component nobody built would throw rather than fail:
 *
 *   line 45 · 306  the 88px page raster behind every artboard. It is chrome
 *                  and not homepage — the same grid stands behind all ten
 *                  pages — and G3 built the chrome without it. `--grid` has a
 *                  token and still no consumer. Backlog.
 *   line 326       the mobile strip "TAP TO OPEN — DOCKS AS DRAWER". Nothing
 *                  opens until stage J; the frame drops its body at 720
 *                  instead, which home.spec.ts asserts. Backlog, owed by J2.
 */
const HOME_MAP = [
  // ── 1440 · Homepage, artboard 1a ─────────────────────────────────────────
  {
    id: 'home-hero-rail-width',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 64,
    decl: 'grid-template-columns', says: '1fr 480px',
    reading: 'the hero row is one flexible column and a 480px rail for the terminal',
    measure: { kind: 'box-width', selector: '.hero > .term' }, expect: 480,
  },
  {
    id: 'home-hero-gap',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 64,
    decl: 'gap', says: '72px',
    reading: 'and 72px of air between them — eight less than the case study, which is the sheet’s choice and not ours',
    measure: { kind: 'gap-x', from: '.hero-say', to: '.term' }, expect: 72,
  },
  {
    id: 'home-hero-padding',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 64,
    decl: 'padding', says: '84px 0 96px',
    reading: 'the hero stands 84px below the ruler',
    measure: { kind: 'computed', selector: '.hero-head', prop: 'padding-top' }, expect: '72px',
    diverges: { class: 'hero-rhythm', sheet: '84px' },
  },
  {
    id: 'home-eyebrow-size',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 69,
    decl: 'font', says: "500 11.5px 'JetBrains Mono',monospace",
    reading: 'the eyebrow is the 11px mono step',
    measure: { kind: 'computed', selector: '.hero-eyebrow', prop: 'font-size' }, expect: '11px',
    diverges: { class: 'half-pixel', sheet: '11.5px' },
  },
  {
    id: 'home-eyebrow-gap',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 69,
    decl: 'margin-bottom', says: '26px',
    reading: 'and stands 26px above the headline',
    measure: { kind: 'computed', selector: '.hero-eyebrow', prop: 'margin-bottom' }, expect: '26px',
  },
  {
    id: 'home-h1-size',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 70,
    decl: 'font', says: "500 62px/1.06 'Chakra Petch',sans-serif",
    reading: 'the homepage headline is the 62px display step — K-08 keeps 52 for every page but this one and About',
    measure: { kind: 'computed', selector: 'main h1', prop: 'font-size' }, expect: '62px',
  },
  {
    id: 'home-h1-measure',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 70,
    decl: 'max-width', says: '620px',
    reading: 'and it is capped at 620px, which is where the sentence breaks into two lines',
    measure: { kind: 'computed', selector: 'main h1', prop: 'max-width' }, expect: '620px',
  },
  {
    id: 'home-sub-gap',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 71,
    decl: 'margin-top', says: '26px',
    reading: 'the stack line sits 26px under the headline',
    measure: { kind: 'computed', selector: '.hero-sub', prop: 'margin-top' }, expect: '26px',
  },
  {
    id: 'home-sub-size',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 71,
    decl: 'font', says: "400 14px 'JetBrains Mono',monospace",
    reading: 'and it is mono at the top of the scale',
    measure: { kind: 'computed', selector: '.hero-sub', prop: 'font-size' }, expect: '13px',
    diverges: { class: 'mono-scale', sheet: '14px' },
  },
  {
    id: 'home-avail-gap',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 72,
    decl: 'margin-top', says: '30px',
    reading: 'the availability line stands 30px lower again — the second consumer --s-30 has ever had',
    measure: { kind: 'computed', selector: '.hero-avail', prop: 'margin-top' }, expect: '30px',
  },
  {
    id: 'home-avail-row-gap',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 72,
    decl: 'gap', says: '10px',
    reading: 'with 10px between the dot, the word and the sentence',
    measure: { kind: 'computed', selector: '.hero-avail', prop: 'column-gap' }, expect: '10px',
  },
  {
    id: 'home-avail-dot',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 73,
    decl: 'width', says: '7px',
    reading: 'the large hero dot is the state language’s own 7px — K-14 puts it on this page and no other',
    measure: { kind: 'box-width', selector: '.hero-dot' }, expect: 7,
  },
  {
    id: 'home-avail-word',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 74,
    decl: 'font', says: "600 11px 'JetBrains Mono',monospace",
    reading: 'AVAILABLE is mono 11 — and it had to be said here, because `.st-word` carries only a colour and inherits the rest',
    measure: { kind: 'computed', selector: '.hero-avail .st-word', prop: 'font-size' }, expect: '11px',
  },
  {
    id: 'home-term-bar-padding',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 80,
    decl: 'padding', says: '11px 16px',
    reading: 'the title bar of the frame is padded on the scale',
    measure: { kind: 'computed', selector: '.term-bar', prop: 'padding-top' }, expect: '12px',
    diverges: { class: 'spacing-scale', sheet: '11px' },
  },
  {
    id: 'home-term-body-padding',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 89,
    decl: 'padding', says: '16px 18px',
    reading: 'and the body inside it',
    measure: { kind: 'computed', selector: '.term-body', prop: 'padding-top' }, expect: '16px',
  },
  {
    id: 'home-term-body-scrolls',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 89,
    decl: 'overflow-y', says: 'auto',
    reading: 'the sheet scrolls a session in a fixed 348px body; the placeholder is as tall as what it says and scrolls nothing',
    measure: { kind: 'computed', selector: '.term-body', prop: 'overflow-y' }, expect: 'visible',
    diverges: { class: 'placeholder-height', sheet: 'auto' },
  },
  {
    id: 'home-section-gap',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 106,
    decl: 'margin-bottom', says: '104px',
    reading: 'the sections stand 104px apart',
    measure: { kind: 'computed', selector: '.home-section', prop: 'margin-bottom' }, expect: '96px',
    diverges: { class: 'spacing-scale', sheet: '104px' },
  },
  {
    id: 'home-sec-gap',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 107,
    decl: 'gap', says: '16px',
    reading: 'the marker and its title sit 16px apart — the same head H1 built, and this sheet is the second witness for it',
    measure: { kind: 'computed', selector: '.sec', prop: 'column-gap' }, expect: '16px',
  },
  {
    id: 'home-sec-rule',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 107,
    decl: 'padding-bottom', says: '12px',
    reading: 'standing 12px above their hairline',
    measure: { kind: 'computed', selector: '.sec', prop: 'padding-bottom' }, expect: '12px',
  },
  {
    id: 'home-sec-space',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 107,
    decl: 'margin-bottom', says: '34px',
    reading: 'with 34px of air before the section body',
    measure: { kind: 'computed', selector: '.sec', prop: 'margin-bottom' }, expect: '34px',
  },

  // ── 1440 · Homepage, artboard 1a · SYS.01 the training log ───────────────
  //
  // FIVE OF THESE ARE MEASURED IN THE GALLERY AND NOT ON `/`, which is not a
  // convenience. This rig runs a production build with no api (playwright.config
  // .ts says so), SYS.01 is then the outage panel, and the module grid is not in
  // the document at all — so an entry pointed at `/` would be asserting against
  // something that is not there. H2b hit the same wall on the operation grid and
  // gave the same answer: app/dev/components renders every component in every
  // state from data in the page. The three that CAN stand on `/` do, because the
  // scale and the section meta are drawn whether or not anything answered.
  {
    id: 'home-trn-grid-columns',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 113,
    decl: 'grid-template-columns', says: 'repeat(6,1fr)',
    reading: 'six columns, so a card can span two and three cards sit across the content width',
    measure: { kind: 'track-count', selector: '.trn-grid' }, expect: 6,
    on: '/dev/components',
  },
  {
    id: 'home-trn-grid-gap',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 113,
    decl: 'gap', says: '20px',
    reading: 'and 20px between the cards',
    measure: { kind: 'computed', selector: '.trn-grid', prop: 'column-gap' }, expect: '20px',
    on: '/dev/components',
  },
  {
    id: 'home-trn-card-span',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 114,
    decl: 'grid-column', says: 'span 2',
    reading: 'a module card is two of the six columns wide',
    measure: { kind: 'computed', selector: '.trn-mod', prop: 'grid-column-start' }, expect: 'span 2',
    on: '/dev/components',
  },
  {
    id: 'home-trn-card-pad-x',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 114,
    decl: 'padding', says: '20px 22px',
    reading: 'a card holds its rows 22px off its own edge',
    measure: { kind: 'computed', selector: '.trn-mod', prop: 'padding-left' }, expect: '20px',
    diverges: { class: 'spacing-scale', sheet: '22px' },
    on: '/dev/components',
  },
  {
    id: 'home-trn-card-marks',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 114,
    decl: 'background-size',
    says: '12px 1px,1px 12px,12px 1px,1px 12px,12px 1px,1px 12px,12px 1px,1px 12px',
    reading: 'four corner brackets 12px long, drawn as eight gradients on one box rather than as eight extra nodes',
    measure: { kind: 'computed', selector: '.trn-mod', prop: 'background-size' },
    expect: '12px 1px, 1px 12px, 12px 1px, 1px 12px, 12px 1px, 1px 12px, 12px 1px, 1px 12px',
    on: '/dev/components',
  },
  {
    id: 'home-trn-row-bleed',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 116,
    decl: 'margin', says: '0 -8px 4px',
    reading: 'a track row bleeds 8px into the card padding, so a lit row reads as a band rather than a floating rectangle',
    measure: { kind: 'computed', selector: '.trn-row', prop: 'margin-left' }, expect: '-8px',
    on: '/dev/components',
  },
  {
    id: 'home-trn-scale-space',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 157,
    decl: 'margin-top', says: '26px',
    reading: 'the scale stands 26px under the last card',
    measure: { kind: 'computed', selector: '.trn-scale', prop: 'margin-top' }, expect: '26px',
  },
  {
    id: 'home-trn-scale-rule',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 157,
    decl: 'padding-top', says: '16px',
    reading: 'over a hairline, with 16px between the rule and the words',
    measure: { kind: 'computed', selector: '.trn-scale', prop: 'padding-top' }, expect: '16px',
  },
  {
    id: 'home-trn-scale-head',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 158,
    decl: 'font', says: "500 9px 'JetBrains Mono',monospace",
    reading: 'SCALE is the smallest mono step, and the one size on this page the sheet does not draw at half a pixel',
    measure: { kind: 'computed', selector: '.trn-scale-head', prop: 'font-size' }, expect: '9px',
  },

  // ── 390 · Homepage, artboard 1b ──────────────────────────────────────────
  // ── 1440 · Homepage, artboard 1a · SYS.02 the system list ────────────────
  //
  // ALL OF THESE ARE MEASURED IN THE GALLERY, and it is the same wall SYS.01
  // hit one block up with a sharper edge. There the module grid is absent
  // because the api did not answer; here the ROW is absent for the same reason,
  // and a list has no `— NO DATA` shape of its own to leave standing the way
  // the five metric tiles do on the case study. e2e/widths.ts carries the
  // consequence for the width sweep.
  {
    id: 'home-sys-row-columns',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 173,
    decl: 'grid-template-columns', says: '52px 240px 1fr auto 108px 26px',
    reading: 'six columns: the number, the name, what it is, what it runs on, where it stands, and the way in',
    measure: { kind: 'track-count', selector: '.sys-row' }, expect: 6,
    on: '/dev/components',
  },
  {
    id: 'home-sys-stack-track',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 173,
    decl: 'grid-template-columns', says: '52px 240px 1fr auto 108px 26px',
    reading: 'the stack column is capped rather than max-content, because this system runs eleven things and the sheet drew five',
    // The cap and not the resolved track list: `1fr` resolves against whatever
    // container the measurement stands in, and this one stands in the gallery.
    // What the correction actually fixes is the ceiling on this one column.
    measure: { kind: 'box-width', selector: '.sys-meta' }, expect: 240,
    on: '/dev/components',
    diverges: { class: 'stack-column-bounded' },
  },
  {
    id: 'home-sys-row-gap',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 173,
    decl: 'gap', says: '20px',
    reading: 'with 20px between them, the same gap the module grid uses',
    measure: { kind: 'computed', selector: '.sys-row', prop: 'column-gap' }, expect: '20px',
    on: '/dev/components',
  },
  {
    id: 'home-sys-row-pad',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 173,
    decl: 'padding', says: '22px 8px',
    reading: 'a row breathes 20px above and below, and bleeds 8px sideways so a lit row reads as a band',
    measure: { kind: 'computed', selector: '.sys-row', prop: 'padding-top' }, expect: '20px',
    on: '/dev/components',
    diverges: { class: 'spacing-scale' },
  },
  {
    id: 'home-sys-no',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 174,
    decl: 'font', says: "500 12px 'JetBrains Mono',monospace",
    reading: 'the display number is the largest mono step, in the accent at its edge weight',
    measure: { kind: 'computed', selector: '.sys-no', prop: 'font-size' }, expect: '12px',
    on: '/dev/components',
  },
  {
    id: 'home-sys-name',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 175,
    decl: 'font', says: "500 19px 'Chakra Petch',sans-serif",
    reading: 'the name is 19px of the display face — a literal, because the display scale starts at 26 and there is no step under it to round to',
    measure: { kind: 'computed', selector: '.sys-name', prop: 'font-size' }, expect: '19px',
    on: '/dev/components',
  },
  {
    id: 'home-sys-blurb',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 176,
    decl: 'font', says: "400 13px 'Geist',sans-serif",
    reading: 'and the sentence beside it is the body face at 13, which is a step',
    measure: { kind: 'computed', selector: '.sys-blurb', prop: 'font-size' }, expect: '13px',
    on: '/dev/components',
  },
  {
    id: 'home-sys-meta-gap',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 177,
    decl: 'gap', says: '6px',
    reading: 'the stack and the source stand 6px apart in one column',
    measure: { kind: 'computed', selector: '.sys-meta', prop: 'row-gap' }, expect: '6px',
    on: '/dev/components',
  },
  {
    id: 'home-sys-state',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 178,
    decl: 'font', says: "600 10px 'JetBrains Mono',monospace",
    reading: 'the state word is a step smaller than the number and a step larger than the stack',
    measure: { kind: 'computed', selector: '.sys-state', prop: 'font-size' }, expect: '10px',
    on: '/dev/components',
  },
  {
    id: 'home-sys-exit',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 179,
    decl: 'font', says: "400 14px 'JetBrains Mono',monospace",
    reading: 'the arrow is drawn at 14, and the mono scale ends at 13',
    measure: { kind: 'computed', selector: '.sys-exit a', prop: 'font-size' }, expect: '13px',
    on: '/dev/components',
    diverges: { class: 'mono-scale' },
  },

  // ── 1440 · Homepage, artboard 1a · SYS.03 UPLINK ─────────────────────────
  //
  // ALL OF THESE ARE MEASURED IN THE GALLERY, for the third time and with the
  // least room for argument yet. SYS.01's grid is absent on `/` here because the
  // api did not answer and SYS.02's rows are absent for the same reason; UPLINK
  // has TWO endpoints and neither answers, so what stands on the page in this
  // rig is two outage panels and not one cell of either picture.
  {
    id: 'home-upl-graph-width',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 201,
    decl: 'gap', says: '3px',
    reading: 'the 3px gap and the 15px cell together: 53 columns and 52 gaps is 951px, which is the cap the calendar is drawn to',
    // ONE NUMBER FOR TWO, on purpose. The gap cannot be read back on its own —
    // it is a `min()` against a percentage, so `getComputedStyle` returns the
    // expression rather than a length — and the width is what the pair is FOR:
    // 53 × 15 + 52 × 3. If either moves, this moves.
    measure: { kind: 'box-width', selector: '.upl-cols' }, expect: 951,
    on: '/dev/components',
  },
  {
    id: 'home-upl-cell',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 205,
    decl: 'width', says: '15px',
    reading: 'a day is a 15px square, the same square the case study gives an operation day',
    measure: { kind: 'box-width', selector: '.upl-cell' }, expect: 15,
    on: '/dev/components',
  },
  {
    id: 'home-upl-cell-square',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 205,
    decl: 'border-radius', says: '2px',
    reading: 'and it is square, because --radius is 0 and every radius on this site comes from tokens.css',
    measure: { kind: 'computed', selector: '.upl-cell', prop: 'border-radius' }, expect: '0px',
    on: '/dev/components',
    diverges: { class: 'square-corners' },
  },
  {
    id: 'home-upl-caption-top',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 210,
    decl: 'margin-top', says: '16px',
    reading: 'the count stands 16px under the picture it counts',
    measure: { kind: 'computed', selector: '.upl-graph .upl-head', prop: 'margin-top' }, expect: '16px',
    on: '/dev/components',
  },
  {
    id: 'home-upl-caption',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 211,
    decl: 'font', says: "500 11px 'JetBrains Mono',monospace",
    reading: 'the calendar\'s count is the largest line in this section, a step over the strip\'s',
    measure: { kind: 'computed', selector: '.upl-graph .upl-label', prop: 'font-size' }, expect: '11px',
    on: '/dev/components',
  },
  {
    id: 'home-upl-scale',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 213,
    decl: 'font', says: "500 9px 'JetBrains Mono',monospace",
    reading: 'LESS and MORE are a key rather than a caption, and read a step below one',
    measure: { kind: 'computed', selector: '.upl-scale', prop: 'font-size' }, expect: '9px',
    on: '/dev/components',
  },
  {
    id: 'home-upl-step',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 214,
    decl: 'width', says: '10px',
    reading: 'ten and not fifteen: the key is not a sample of the grid, which is the call .ops-swatch already made at nine',
    measure: { kind: 'box-width', selector: '.upl-step' }, expect: 10,
    on: '/dev/components',
  },
  {
    id: 'home-upl-ops-rule',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 221,
    decl: 'margin-top', says: '26px',
    reading: 'the strip is a second block under a rule rather than a second section',
    measure: { kind: 'computed', selector: '.upl-ops', prop: 'margin-top' }, expect: '26px',
    on: '/dev/components',
  },
  {
    id: 'home-upl-ops-pad',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 221,
    decl: 'padding-top', says: '20px',
    reading: 'and 20px of air under that rule before its caption',
    measure: { kind: 'computed', selector: '.upl-ops', prop: 'padding-top' }, expect: '20px',
    on: '/dev/components',
  },
  {
    id: 'home-upl-ops-caption',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 223,
    decl: 'font', says: "500 9.5px 'JetBrains Mono',monospace",
    reading: 'the strip says what its cells mean before a reader meets them, at the key\'s size rather than the count\'s',
    measure: { kind: 'computed', selector: '.upl-ops .upl-label', prop: 'font-size' }, expect: '9px',
    on: '/dev/components',
    diverges: { class: 'half-pixel' },
  },
  {
    id: 'home-upl-strip-gap',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 227,
    decl: 'gap', says: '4px',
    reading: 'four between the operation cells and three between the calendar\'s, which is the case study\'s gap and not the graph\'s',
    measure: { kind: 'computed', selector: '.upl-strip', prop: 'column-gap' }, expect: '4px',
    on: '/dev/components',
  },

  // ── 390 · Homepage, artboard 1b · SYS.03 UPLINK ──────────────────────────
  {
    id: 'home-mobile-upl-columns',
    sheet: 'homepage', artboard: '1b', width: 390, line: 407,
    decl: 'gap', says: '2px',
    reading: 'the phone keeps all 53 columns and shrinks them AND their gap, rather than drawing the last 26 at 11px and saying so in a second caption',
    measure: { kind: 'track-count', selector: '.upl-cols' }, expect: 53,
    on: '/dev/components',
    diverges: { class: 'graph-fits-the-column' },
  },
  {
    id: 'home-mobile-upl-strip-cell',
    sheet: 'homepage', artboard: '1b', width: 390, line: 419,
    decl: 'gap', says: '4px',
    reading: 'the strip keeps its gap on a phone and wraps instead — the one block on this page that changes shape without changing size',
    measure: { kind: 'computed', selector: '.upl-strip', prop: 'column-gap' }, expect: '4px',
    on: '/dev/components',
  },

  {
    id: 'home-mobile-h1',
    sheet: 'homepage', artboard: '1b', width: 390, line: 317,
    decl: 'font', says: "500 34px/1.1 'Chakra Petch',sans-serif",
    reading: 'the display step falls to 34 on a phone. The artboard draws an h2 there; a crop is not a document outline, and this page keeps its one h1',
    measure: { kind: 'computed', selector: 'main h1', prop: 'font-size' }, expect: '34px',
  },
];

const TARGETS = [
  { map: CASE_MAP, target: 'web/e2e/oracle/case-study.gen.json' },
  { map: HOME_MAP, target: 'web/e2e/oracle/home.gen.json' },
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

/**
 * One map in, one oracle out.
 *
 * The ids are checked across BOTH maps, not within each: two pages sharing an
 * id would make a failure name a measurement from the other one.
 */
const seen = new Set();

function build(map, target) {
  const entries = [];

  for (const entry of map) {
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
      // Where to measure it, when the page that carries the component cannot
      // show it. e2e/sheet.ts carries the argument; the short version is that
      // the rig runs with no api, so a component that only exists once an
      // answer arrives has to be measured in the gallery or not at all.
      ...(entry.on === undefined ? {} : { on: entry.on }),
    });
  }

  // A map that resolved nothing is a green test that asserts nothing. The number
  // is written down so that deleting half the map is loud rather than quiet.
  if (entries.length !== map.length) {
    die(`resolved ${String(entries.length)} of ${String(map.length)} entries`);
  }

  const document = {
    comment: 'Generated from the design handoff by tools/gen-sheet-oracle.mjs — do not edit by hand.',
    // EVERY REASON IN EVERY FILE, not only the ones this page cites. A reader
    // holding one oracle should be able to see which decisions exist to be
    // pointed at, and the alternative is two files that disagree about what a
    // class means.
    divergenceReasons: DIVERGENCE,
    entries,
  };

  mkdirSync(resolve(root, dirname(target)), { recursive: true });
  writeFileSync(resolve(root, target), `${JSON.stringify(document, null, 2)}\n`);

  const diverging = entries.filter((entry) => entry.diverges !== undefined).length;
  console.error(
    `  ✓ ${target} — ${String(entries.length)} measurements, ${String(diverging)} diverging`,
  );
}

for (const { map, target } of TARGETS) {
  build(map, target);
}
