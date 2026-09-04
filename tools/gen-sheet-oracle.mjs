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
  // H6. The Work Index draws itself at 1440 and 390, and the Intermediate
  // Widths sheet adds a third frame at 1024 — "1024 · Work Index —
  // Vorschauspalte weg, Name gewinnt 154px" — which is the one that annotates
  // the five-track rebuild. So this page has three drawings, like the case
  // study and unlike the homepage.
  workIndex: 'docs/design/Work Index - timseil.dev.dc.html',
  // H7. About draws itself at 1440 and 390 and nowhere else, and unlike the
  // homepage that is not an omission the Intermediate Widths sheet apologises
  // for — it names this page in the list of the ones with nothing to decide:
  // "Fliesstext, Blog, About, Contact und Legal fliessen, dort ist nichts zu
  // entscheiden." So two artboards, and the one switch this page's own grids
  // need was derived rather than drawn.
  about: 'docs/design/About - timseil.dev.dc.html',
  // H8. Contact draws 1440 and 390, and it is named in the same sentence About
  // is: "Fliesstext, Blog, About, Contact und Legal fliessen, dort ist nichts zu
  // entscheiden." The one fixed column this page has — the 520px TX trace — is
  // drawn at 1440 and gone below 1080, which is a switch layout.css already
  // owns rather than a frame the sheet still owes.
  contact: 'docs/design/Contact - timseil.dev.dc.html',
  // H9a. The post draws 1440 and 390, and it is named in the same sentence
  // About and Contact are: "Fliesstext, Blog, About, Contact und Legal
  // fliessen, dort ist nichts zu entscheiden." The one fixed column it has —
  // the 196px contents rail — is drawn at 1440 and gone below 1080, which is a
  // switch layout.css owns rather than a frame the sheet still owes.
  blogPost: 'docs/design/Blog Post - timseil.dev.dc.html',
};

// ONE DECISION MOVES MANY MEASUREMENTS, so the reasons are named once and
// referred to. Without this the oracle would read as twenty separate defects
// where there are three decisions.
const DIVERGENCE = {
  // ── H8 ──────────────────────────────────────────────────────────────────────
  'one-section-head':
    'The Contact artboard draws its `SYS.06 — CHANNEL` marker at 11.5px. ' +
    '`SectionHead` has drawn every section marker on this site at 12 since H1, ' +
    'and the artboards disagree with each other about this number rather than ' +
    'with the build — Case Study draws 12, the homepage 11.5. One component, ' +
    'one step: a page-local size here would be a fourth spelling of a label ' +
    'that means the same thing on four pages.',
  'one-trace-geometry':
    'The Contact sheet draws the form and its TX trace as `1fr 520px` with an ' +
    '80px gap, which is a seventh two-column geometry — layout.css already ' +
    'carries 480, 400, 380 and 420. H7b took `.cs-prob`\'s pair whole rather ' +
    'than add one for sixteen pixels, and this does NOT, which needs saying. ' +
    'The four existing pairs hold prose, a rail or a column of tiles on their ' +
    'right: content whose width is a preference. The trace holds lines whose ' +
    'width IS the content — `  "email": "anna.keller@firma.lu",` is as long as ' +
    'it is, and what does not fit scrolls inside the panel. Forty pixels of ' +
    'column and eight of gap, on the one element on this page with a minimum ' +
    'width that is not a taste.',
  'no-protocol-version':
    'The sheet writes `POST /api/contact HTTP/2`. The trace is rendered BEFORE ' +
    'the request leaves, and at that moment nothing on the page knows which ' +
    'version the connection will negotiate — Traefik and the browser decide it, ' +
    'and a local build over plain HTTP would print HTTP/2 and be wrong. A ' +
    'version this page did not observe is an invented fact, and invariant 1 has ' +
    'no exception for a detail that would look convincing.',
  'one-copy-of-the-words':
    'The mobile artboard carries a second, shorter set of words — "Geht direkt ' +
    'an mein Postfach. Lieber selbst schreiben?" against the desktop\'s two ' +
    'sentences — and draws the headline as `<h2>` at 34px. lib/i18n carries ONE ' +
    'set, for the reason `one-copy-set` gives on the case study: a second exists ' +
    'only to be forgotten when the first is corrected. The step still falls to ' +
    '34 at 720, which is K-08 and a switch layout.css already owns. This is ' +
    '#293, held open rather than settled here.',
  'a-form-is-not-a-canvas':
    'The sheet draws a DEMO-SCHALTER that forces a failure, a footer strip ' +
    'reading "KEIN TRACKING · KEIN COOKIE · KEINE SPEICHERUNG AUF DEM SERVER · ' +
    '3 EINTRÄGE LOKAL", a `BUILD v3.2.1` and an `UPTIME [99.98%]`. The switch is ' +
    'a canvas affordance and not a control of the page. The strip is FALSE on ' +
    'this page of all pages — `contact_messages` is the one table on this site ' +
    'with personal data in it — and "3 Einträge lokal" would need a third ' +
    'localStorage key, which invariant 9 does not have. The two numbers are ' +
    'invented. None of the four is built; the page carries a true notice ' +
    'instead.',
  // ── H9a ──────────────────────────────────────────────────────────────────
  'heading-scale':
    'The Blog Post sheet sets the section headings at 21px and the pull quote ' +
    'at 21px, and 21 is not a step. It is the case the Consistency Check calls ' +
    'E-01 and leaves open — "Entweder die Seiten auf die Skala ziehen oder die ' +
    'Skala um 56 erweitern" — and G1 answered it for every page on this site by ' +
    'taking the first. So 26, the display step above, and NOT rounded down the ' +
    'way `half-pixel` and `mono-scale` round: those two land inside a family ' +
    'that has a smaller step, and here the next step down is 16.5, which is the ' +
    'size of the prose the heading is supposed to open. A heading the size of ' +
    'its paragraph is not a rounding, it is the loss of a level. The FACE stays ' +
    'the sheet\'s in both cases — mono for the heading, display for the quote.',
  'half-pixel':
    'The sheets draw 9.5, 10.5, 11.5 — and, on the Contact form, 14px. ' +
    'tokens.css has thirteen steps and "keine halben Pixel" (G1); every mono ' +
    'size rounds down to the nearest one, half a pixel or a whole one. ' +
    'One decision, many places.',
  'spacing-scale':
    'The sheets draw spacing off the 4px grid (22, 24, 13, 38, 100px). ' +
    'Foundations fixes the scale and G1 made it binding, so the stylesheets read ' +
    'the nearest step. Differences of up to 8px, and no further: where the gap ' +
    'grew past that it got a class of its own rather than a wider excuse. H3 is ' +
    'where that line was drawn — see `hero-rhythm`.',
  'chips-wrap':
    'At 390 the sheet puts both chip rows in a swipe container — ' +
    '`overflow-x:auto; width:max-content; scrollbar-width:none` — and drops ' +
    'their STATUS and STACK labels. Two reasons not to. The sheet types six ' +
    'stack chips; this row draws whatever `stackTags` derives from the answer, ' +
    'which is fifteen names from three systems, so the hidden part grows with ' +
    'the data rather than being a fixed six. And a scrollbar suppressed at the ' +
    'one width where the reader cannot otherwise see there is more is the shape ' +
    '#294 already holds open against the request path. The sheet wraps its own ' +
    'stack row at 1440; both rows wrap at every width here, and the labels stay ' +
    'at both — one set of words, which is #293.',
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
  // ── H7 ──────────────────────────────────────────────────────────────────────
  'one-hero-geometry':
    'The About sheet draws its hero as `1fr 400px` with an 80px gap; the ' +
    'homepage draws `1fr 480px` with 72. layout.css carries ONE hero row and ' +
    'has since G1, and H3 deleted the second one it inherited with the ' +
    'argument that applies here in reverse: "eine Regel, die niemand erreichen ' +
    'kann, ist kein Ersatzteil, sondern die Behauptung, dass es etwas gibt." ' +
    'Adding a third two-column geometry so that one page can be eighty pixels ' +
    'different would be that claim made on purpose. The 1080 switch is the ' +
    'same switch either way, which is the thing a reader can actually see.',
  'one-panel-geometry':
    'The About sheet draws the trajectory panel `1fr 380px` with a 64px gap. ' +
    '`.cs-prob` in layout.css is `1fr 380px` with 80, and has been since G1. ' +
    'The columns already agree; a rule that existed so one page could have a ' +
    'gap sixteen pixels narrower would be the spare part H3 deleted when it ' +
    'removed `.cs-hero` — "eine Regel, die niemand erreichen kann, ist kein ' +
    'Ersatzteil, sondern die Behauptung, dass es etwas gibt." The panel takes ' +
    'the pair whole and the 1080 switch stays one switch.',
  'rail-wraps-at-720':
    'The sheet draws the rail across at 1440 and down at 390 and says nothing ' +
    'about where it turns. Measured on the built page: a caption takes three ' +
    'lines up to and including 715 and two or fewer from 716, so 720 is the ' +
    'nearest declared switch above the crossing and no width is drawn under ' +
    'the minimum. The other crossing, 1148, is where captions stop wrapping ' +
    'at all — a preference rather than a minimum, and a fifth switch.',
  // ── H3 ───────────────────────────────────────────────────────────────────
  'hero-rhythm':
    'The homepage hero is drawn with 84px above it, twelve pixels off the ' +
    'nearest step of a scale G1 made binding. `spacing-scale` covers roundings ' +
    'of up to eight and this is not one; folding it in would have turned a ' +
    'reason into a habit. The rhythm is --s-72 over --s-96, which is the same ' +
    'pair `.cs-head` uses, so the two heroes on this site breathe alike.',
  'no-link-until-h9':
    'The sheet gives the log row a third column holding a `→`, a pointer cursor ' +
    'and a hover fill — three promises about a click. `/blog/<slug>` is a 404 ' +
    'until H9 builds the renderer, and invariant 5 is that evidence never ' +
    'points into nothing. components/case/IncidentLog.tsx prints a post_slug as ' +
    'text for the same reason and lib/seo/feed.ts serves an empty feed rather ' +
    'than links to pages that do not exist. The hover goes with the arrow: a row ' +
    'that lights up and does nothing is the dead control STATE.05 refuses, with ' +
    'an invitation attached. The section keeps one link, in its head.',
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

  // ── 1440 · Homepage, artboard 1a · SYS.04 the log ────────────────────────
  //
  // NONE OF THESE CARRIES AN `on`, AND THAT IS THE FIRST TIME SINCE H3. SYS.01's
  // grid, SYS.02's rows and both of SYS.03's pictures are measured at
  // /dev/components because this rig has no api and none of them is in the
  // document on `/`. SYS.04 reads content/posts out of the repository, which the
  // rig has — so the rows are on the page, and a rule about them is checked
  // where it ships.
  {
    id: 'home-log-row-tracks',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 240,
    decl: 'grid-template-columns', says: '110px 1fr 24px',
    reading: 'a fixed date column, the text taking the rest, and a column for the arrow',
    // TWO TRACKS AND THE SHEET DRAWS THREE. The third holds a `→` to
    // /blog/<slug>, which is a 404 until H9 — invariant 5, and the decision
    // components/home/LogRow.tsx carries. The divergence is the arrow, not the
    // measure: what is left of the sheet's row is its first two tracks.
    measure: { kind: 'track-count', selector: '.log-row' }, expect: 2,
    diverges: { class: 'no-link-until-h9', sheet: '110px 1fr 24px' },
  },
  {
    id: 'home-log-date-column',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 240,
    decl: 'align-items', says: 'baseline',
    reading: 'the date, the title and the dek sit on one baseline rather than on a box',
    measure: { kind: 'computed', selector: '.log-row', prop: 'align-items' }, expect: 'baseline',
  },
  {
    id: 'home-log-date-size',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 241,
    decl: 'font', says: "400 11.5px 'JetBrains Mono',monospace",
    reading: 'the date is mono and smaller than the title it stands beside',
    measure: { kind: 'computed', selector: '.log-date', prop: 'font-size' }, expect: '11px',
    diverges: { class: 'half-pixel', sheet: '11.5px' },
  },
  {
    id: 'home-log-date-figures',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 241,
    decl: 'font-variant-numeric', says: 'tabular-nums',
    reading: 'ten characters that must not dance between three rows',
    measure: {
      kind: 'computed', selector: '.log-date', prop: 'font-variant-numeric',
    }, expect: 'tabular-nums',
  },
  {
    id: 'home-log-title-size',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 242,
    decl: 'font', says: "500 14.5px 'JetBrains Mono',monospace",
    reading: 'the title is a name, in the same face as the marker above it',
    // The mono scale is 9 · 10 · 11 · 12 · 13. There is no fourteen to round to
    // and no fifteen to round down from — the same wall the hero subline hit.
    measure: { kind: 'computed', selector: '.log-title', prop: 'font-size' }, expect: '13px',
    diverges: { class: 'mono-scale', sheet: '14.5px' },
  },
  // THE DEK HAS NO ENTRY AT 1440, and the reason is the extractor rather than
  // the drawing. The sheet puts the title and the dek in two spans on ONE line
  // (242), and `declarationsOn` reads the FIRST style attribute on a line —
  // last-one-wins within a style, not across two. So the dek's `400 13px
  // 'Geist',sans-serif` cannot be cited at this artboard. It is asserted at 390
  // below, where each part of the row has a line of its own, and its 13px at
  // 1440 is `--t-body-13` exactly in any case. Changing the extractor for one
  // entry would be a new rule without an incident.

  // ── 1440 · Homepage, artboard 1a · the foot ──────────────────────────────
  {
    id: 'home-bio-rule',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 257,
    decl: 'padding-top', says: '56px',
    reading: 'the foot opens under a hairline, a full step below the last section',
    measure: { kind: 'computed', selector: '.bio', prop: 'padding-top' }, expect: '56px',
  },
  {
    id: 'home-bio-measure',
    sheet: 'homepage', artboard: '1a', width: 1440, line: 260,
    decl: 'max-width', says: '560px',
    reading: 'the bio is prose and gets a line length rather than a column',
    measure: { kind: 'box-width', selector: '.bio-text' }, expect: 560,
  },

  // ── 390 · Homepage, artboard 1b · SYS.04 ─────────────────────────────────
  {
    id: 'home-log-row-mobile',
    sheet: 'homepage', artboard: '1b', width: 390, line: 431,
    decl: 'padding', says: '14px 0',
    reading: 'the row loses its side inset with its columns: 8px of inset belongs to a cell in a grid, and at this width there are none',
    measure: { kind: 'computed', selector: '.log-row', prop: 'padding' }, expect: '14px 0px',
  },
  {
    id: 'home-log-date-mobile',
    sheet: 'homepage', artboard: '1b', width: 390, line: 432,
    decl: 'font', says: "400 10px 'JetBrains Mono',monospace",
    reading: 'the date drops a step on a phone, and ten IS a step — nothing is rounded here',
    measure: { kind: 'computed', selector: '.log-date', prop: 'font-size' }, expect: '10px',
  },
  {
    id: 'home-log-deck-gap-mobile',
    sheet: 'homepage', artboard: '1b', width: 390, line: 434,
    decl: 'margin-top', says: '4px',
    reading: 'and the dek sits closer under the title, at a step rather than near one',
    measure: { kind: 'computed', selector: '.log-deck', prop: 'margin-top' }, expect: '4px',
  },
  {
    id: 'home-log-title-mobile',
    sheet: 'homepage', artboard: '1b', width: 390, line: 433,
    decl: 'font', says: "500 13.5px 'JetBrains Mono',monospace",
    reading: 'the title keeps its face and drops a step on a phone',
    measure: { kind: 'computed', selector: '.log-title', prop: 'font-size' }, expect: '13px',
    diverges: { class: 'half-pixel', sheet: '13.5px' },
  },
  {
    id: 'home-log-action-touch',
    sheet: 'homepage', artboard: '1b', width: 390, line: 429,
    decl: 'min-height', says: '44px',
    reading: 'the one link this section has is a touch target, and the sheet says so itself',
    // K-27's rule, and the reason `.sec-action a` is `inline-flex`: a min-height
    // does nothing to a non-replaced inline box. Measured under a coarse
    // pointer in e2e/touch-targets.coarse.spec.ts, which is where the 44 is
    // actually enforced; here it is the declaration.
    measure: { kind: 'computed', selector: '.sec-action a', prop: 'display' }, expect: 'inline-flex',
  },
  {
    id: 'home-bio-mobile',
    sheet: 'homepage', artboard: '1b', width: 390, line: 448,
    decl: 'padding', says: '40px 0 0',
    reading: 'the foot opens tighter on a phone, and the rule above it stays',
    measure: { kind: 'computed', selector: '.bio', prop: 'padding-top' }, expect: '44px',
    diverges: { class: 'spacing-scale', sheet: '40px' },
  },
];


/**
 * The Work Index's map. Build plan H6.
 *
 * MOST OF IT IS MEASURED IN THE GALLERY, and that share is higher here than on
 * any page so far. The rig runs a production build with no api, so `/work`
 * renders an outage panel and no `.work-row` is ever in its document — every
 * entry about a row therefore carries `on: '/dev/components'`. H5c's homepage
 * additions were the first since H3 to carry none, because SYS.04 reads files
 * out of the repository; this page reads an endpoint for everything it lists,
 * so the pendulum swings all the way back.
 *
 * WHAT IS STILL MEASURED ON THE PAGE ITSELF: the header, the counter and the
 * legend. All three are drawn whether or not an answer arrives, which is the
 * half of this page a visitor meets during an outage.
 */
const WORK_MAP = [
  // ── 1440 · Work Index, artboard 1a · the head ────────────────────────────
  {
    id: 'work-head-rail',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 62,
    decl: 'grid-template-columns', says: '1fr 420px',
    reading: 'the head is one flexible column and a 420px stat rail',
    measure: { kind: 'box-width', selector: '.work-stats' }, expect: 420,
  },
  {
    id: 'work-head-gap',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 62,
    decl: 'gap', says: '80px',
    reading: 'with 80px of air between the deck and the rail',
    measure: { kind: 'gap-x', from: '.work-intro', to: '.work-stats' }, expect: 72,
    diverges: { class: 'spacing-scale', sheet: '80px' },
  },
  {
    id: 'work-eyebrow-size',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 64,
    decl: 'font', says: "500 11.5px 'JetBrains Mono',monospace",
    reading: 'the eyebrow is mono at the step under the half pixel the sheet draws',
    measure: { kind: 'computed', selector: '.work-eyebrow', prop: 'font-size' }, expect: '11px',
    diverges: { class: 'half-pixel', sheet: '11.5px' },
  },
  {
    id: 'work-h1-size',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 65,
    decl: 'font', says: "500 52px/1.05 'Chakra Petch',sans-serif",
    reading: 'the work index headline is the 52px display step — K-08 keeps 62 for the homepage and About',
    measure: { kind: 'computed', selector: 'main h1', prop: 'font-size' }, expect: '52px',
  },
  {
    id: 'work-deck-size',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 66,
    decl: 'font', says: "400 15px/1.7 'Geist',sans-serif",
    reading: 'and the deck under it is the 15px body step',
    measure: { kind: 'computed', selector: '.work-deck', prop: 'font-size' }, expect: '15px',
  },
  {
    id: 'work-stats-columns',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 68,
    decl: 'grid-template-columns', says: 'repeat(4,1fr)',
    reading: 'four tiles, one per state the contract declares plus the total',
    measure: { kind: 'track-count', selector: '.work-stats' }, expect: 4,
    // IN THE GALLERY, because the rail on `/work` has nothing to count. With no
    // api the four tiles collapse to one — four repetitions of `— NO DATA` are
    // four statements where there is one fact, and 130px of non-wrapping mono
    // does not fit a quarter of a 346px column either.
    on: '/dev/components',
  },
  {
    id: 'work-stats-gap',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 68,
    decl: 'gap', says: '16px',
    reading: 'set 16px apart',
    measure: { kind: 'computed', selector: '.work-stats', prop: 'column-gap' }, expect: '16px',
  },
  {
    id: 'work-stat-inset',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 69,
    decl: 'padding-left', says: '14px',
    reading: 'each tile stands 14px off the rule that separates it',
    measure: { kind: 'computed', selector: '.work-stat', prop: 'padding-left' }, expect: '14px',
  },

  // ── 1440 · the two filter rows. Measured in the gallery, because `/work`
  //          draws no chip without an answer to derive one from ─────────────
  {
    id: 'work-filters-rule',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 76,
    decl: 'border-top', says: '1px solid rgba(139,152,166,.16)',
    reading: 'the filter block is fenced off above and below by the hairline',
    measure: { kind: 'computed', selector: '.work-filters', prop: 'border-top-width' },
    expect: '1px',
    on: '/dev/components',
  },
  {
    id: 'work-filters-padding',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 76,
    decl: 'padding', says: '16px 0',
    reading: 'and holds its rows 16px off both rules',
    measure: { kind: 'computed', selector: '.work-filters', prop: 'padding-top' },
    expect: '16px',
    on: '/dev/components',
  },
  {
    id: 'work-filters-label-size',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 78,
    decl: 'font', says: "600 9px 'JetBrains Mono',monospace",
    reading: 'STATUS and STACK name their rows at the smallest mono step',
    measure: { kind: 'computed', selector: '.work-filter-label', prop: 'font-size' },
    expect: '9px',
    on: '/dev/components',
  },
  {
    id: 'work-filters-label-tracking',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 78,
    decl: 'letter-spacing', says: '.16em',
    reading: 'tracked like every other label of its size',
    measure: { kind: 'computed', selector: '.work-filter-label', prop: 'letter-spacing' },
    expect: '1.44px',
    on: '/dev/components',
  },
  {
    id: 'work-chip-gap',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 79,
    decl: 'gap', says: '8px',
    reading: '8px between two chips',
    measure: { kind: 'computed', selector: '.work-chips', prop: 'column-gap' },
    expect: '8px',
    on: '/dev/components',
  },
  {
    id: 'work-chip-wrap',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 88,
    decl: 'flex-wrap', says: 'wrap',
    reading: 'and the row wraps rather than running off its column',
    measure: { kind: 'computed', selector: '.work-chips', prop: 'flex-wrap' },
    expect: 'wrap',
    on: '/dev/components',
  },
  {
    id: 'work-chip-padding',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 80,
    decl: 'padding', says: '6px 11px',
    reading: 'a chip is Foundations\' chip: 6 by 11',
    measure: { kind: 'computed', selector: '.chip', prop: 'padding-left' },
    expect: '12px',
    diverges: { class: 'spacing-scale', sheet: '11px' },
    on: '/dev/components',
  },
  {
    id: 'work-chip-size',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 80,
    decl: 'font', says: "600 9.5px 'JetBrains Mono',monospace",
    reading: 'and reads at the smallest mono step, like the label over it',
    measure: { kind: 'computed', selector: '.chip', prop: 'font-size' },
    expect: '9px',
    diverges: { class: 'half-pixel', sheet: '9.5px' },
    on: '/dev/components',
  },
  {
    id: 'work-chip-radius',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 81,
    decl: 'border', says: '1px solid rgba(139,152,166,.25)',
    reading: 'a chip at rest is a hairline box with square corners',
    measure: { kind: 'computed', selector: '.chip', prop: 'border-top-left-radius' },
    expect: '0px',
    on: '/dev/components',
  },
  {
    id: 'work-chip-set',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 80,
    decl: 'background', says: '#00E5FF',
    reading: 'and a chip that is set is inverted — the accent as a fill, not a shade of it',
    measure: {
      kind: 'computed',
      selector: '.chip[aria-pressed="true"]',
      prop: 'background-color',
    },
    expect: 'rgb(0, 229, 255)',
    on: '/dev/components',
  },
  {
    id: 'work-empty-padding',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 142,
    decl: 'padding', says: '44px 8px',
    reading: 'the panel for a combination nothing matches stands well clear of the rows',
    measure: { kind: 'computed', selector: '.st-empty-panel', prop: 'padding-top' },
    expect: '20px',
    diverges: { class: 'spacing-scale', sheet: '44px' },
    on: '/dev/components',
  },

  // ── 1440 · the counter ───────────────────────────────────────────────────
  {
    id: 'work-count-padding',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 98,
    decl: 'padding', says: '12px 0 6px',
    reading: 'the counter sits 12px under the filter block',
    measure: { kind: 'computed', selector: '.work-count', prop: 'padding-top' }, expect: '12px',
  },
  {
    id: 'work-count-size',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 98,
    decl: 'font', says: "500 9.5px 'JetBrains Mono',monospace",
    reading: 'and reads at the smallest mono step',
    measure: { kind: 'computed', selector: '.work-count', prop: 'font-size' }, expect: '9px',
    diverges: { class: 'half-pixel', sheet: '9.5px' },
  },

  // ── 1440 · the row. Every one of these is measured in the gallery ────────
  {
    id: 'work-row-tracks',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 102,
    decl: 'grid-template-columns', says: '40px 1fr 132px 104px 130px 20px',
    reading: 'six columns: number, identity, figure, state, preview, exit',
    measure: { kind: 'track-count', selector: '.work-row' }, expect: 6,
    on: '/dev/components',
  },
  {
    id: 'work-row-gap',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 102,
    decl: 'gap', says: '24px',
    reading: 'with 24px between them — the nearest step is 26',
    measure: { kind: 'computed', selector: '.work-row', prop: 'column-gap' }, expect: '26px',
    diverges: { class: 'spacing-scale', sheet: '24px' },
    on: '/dev/components',
  },
  {
    id: 'work-row-padding',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 102,
    decl: 'padding', says: '24px 8px',
    reading: 'and 24px of vertical breath, 8px of inset',
    measure: { kind: 'computed', selector: '.work-row', prop: 'padding-top' }, expect: '26px',
    diverges: { class: 'spacing-scale', sheet: '24px' },
    on: '/dev/components',
  },
  {
    id: 'work-no-size',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 103,
    decl: 'font', says: "500 12px 'JetBrains Mono',monospace",
    reading: 'the display number is the 12px mono step',
    measure: { kind: 'computed', selector: '.work-no', prop: 'font-size' }, expect: '12px',
    on: '/dev/components',
  },
  {
    id: 'work-name-size',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 105,
    decl: 'font', says: "500 20px 'Chakra Petch',sans-serif",
    reading: 'the system name is 20px display — off the scale, like every other row title on this site',
    measure: { kind: 'computed', selector: '.work-name', prop: 'font-size' }, expect: '20px',
    on: '/dev/components',
  },
  {
    id: 'work-blurb-size',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 106,
    decl: 'font', says: "400 13.5px 'Geist',sans-serif",
    reading: 'the one line about the system is body text at the step under the half pixel',
    measure: { kind: 'computed', selector: '.work-blurb', prop: 'font-size' }, expect: '13px',
    diverges: { class: 'half-pixel', sheet: '13.5px' },
    on: '/dev/components',
  },
  {
    id: 'work-stack-size',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 107,
    decl: 'font', says: "500 9.5px 'JetBrains Mono',monospace",
    reading: 'and the stack line under it is the smallest mono step',
    measure: { kind: 'computed', selector: '.work-stack', prop: 'font-size' }, expect: '9px',
    diverges: { class: 'half-pixel', sheet: '9.5px' },
    on: '/dev/components',
  },
  {
    id: 'work-figure-label-size',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 110,
    decl: 'font', says: "500 8.5px 'JetBrains Mono',monospace",
    reading: 'the figure label is drawn under the smallest step the scale has, so it rounds up rather than down',
    measure: { kind: 'computed', selector: '.work-figure-label', prop: 'font-size' }, expect: '9px',
    diverges: { class: 'half-pixel', sheet: '8.5px' },
    on: '/dev/components',
  },
  {
    id: 'work-state-size',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 111,
    decl: 'font', says: "600 10px 'JetBrains Mono',monospace",
    reading: 'the state word is the 10px mono step',
    measure: { kind: 'computed', selector: '.work-state .st-word', prop: 'font-size' }, expect: '10px',
    on: '/dev/components',
  },

  // ── 390 · Work Index, artboard 1b ────────────────────────────────────────
  //
  // ONE ENTRY, AND THE PHONE ARTBOARD OFFERS MANY MORE. Most of what it draws
  // differently is a second, shorter set of words — a deck with its last clause
  // cut, a stack line with items removed, stat labels abbreviated to `SYS` and
  // `QUEUE` — and this site has refused that four times (#293). Measuring a
  // rhythm here while refusing the copy it belongs to would be quoting half a
  // drawing. The headline step is the exception: K-08 states it as a rule for
  // every page, and layout.css already switches it.
  {
    id: 'work-h1-size-390',
    sheet: 'workIndex', artboard: '1b', width: 390, line: 193,
    decl: 'font', says: "500 34px/1.05 'Chakra Petch',sans-serif",
    reading: 'the headline drops to the 34px display step on a phone — K-08s third rung',
    measure: { kind: 'computed', selector: 'main h1', prop: 'font-size' }, expect: '34px',
  },
  {
    id: 'work-prev-height',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 112,
    decl: 'height', says: '76px',
    reading: 'the reserved preview is 76px tall — a frame, not a picture, until K2 has an image',
    measure: { kind: 'computed', selector: '.prev', prop: 'height' }, expect: '76px',
    on: '/dev/components',
  },
  {
    id: 'work-prev-rest',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 112,
    decl: 'opacity', says: '.28',
    reading: 'and it rests at 28% — decoration, so the opacity may carry the hover',
    measure: { kind: 'computed', selector: '.prev', prop: 'opacity' }, expect: '0.28',
    on: '/dev/components',
  },

  // ── 1440 · the legend ────────────────────────────────────────────────────
  {
    id: 'work-legend-rhythm',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 144,
    decl: 'margin-top', says: '72px',
    reading: 'the legend stands 72px under the last row',
    measure: { kind: 'computed', selector: '.work-legend', prop: 'margin-top' }, expect: '72px',
  },
  {
    id: 'work-legend-padding',
    sheet: 'workIndex', artboard: '1a', width: 1440, line: 144,
    decl: 'padding', says: '24px 26px',
    reading: 'and holds its text off the panel edge — 24 rounds to the 26 the other axis already uses',
    measure: { kind: 'computed', selector: '.work-legend', prop: 'padding-top' }, expect: '26px',
    diverges: { class: 'spacing-scale', sheet: '24px' },
  },

  // ── 1024 · Intermediate Widths, artboard 1d ──────────────────────────────
  {
    id: 'work-row-tracks-1024',
    sheet: 'widths', artboard: '1d', width: 1024, line: 507,
    decl: 'grid-template-columns', says: '40px minmax(0,1fr) 132px 104px 20px',
    reading: 'below 1080 the preview column is dropped, never shrunk — five tracks, not six at 60px',
    measure: { kind: 'track-count', selector: '.work-row' }, expect: 5,
    on: '/dev/components',
  },
];

/**
 * `/about`'s map. Build plan H7.
 *
 * NOT ONE `on:` IN THE WHOLE LIST, and it is the first page of stage H that can
 * say so. The rig runs a production build with NO api, which is why 24 of the
 * work index's 36 entries and every SYS.01 entry are measured in the gallery
 * instead of on their own page. `/about` reads nothing: every word comes out of
 * lib/about/ and lib/i18n/, so the page in the rig is the page in production
 * and there is nothing to wait for and nothing to route around.
 *
 * TWO ARTBOARDS AND SEVEN CHECKED WIDTHS. The five between them have no
 * drawing here, and about.sweep.spec.ts covers what happens across them.
 */
const ABOUT_MAP = [
  // ── 1440 · About, artboard 1a · the hero ─────────────────────────────────
  {
    id: 'about-hero-columns',
    sheet: 'about', artboard: '1a', width: 1440, line: 64,
    decl: 'grid-template-columns', says: '1fr 400px',
    reading: 'the hero is two columns, the sentence and the card',
    measure: { kind: 'track-count', selector: '.hero' }, expect: 2,
  },
  {
    id: 'about-hero-rail-width',
    sheet: 'about', artboard: '1a', width: 1440, line: 64,
    decl: 'grid-template-columns', says: '1fr 400px',
    reading: 'and the card is the rail this site already has, not a second one eighty pixels narrower',
    measure: { kind: 'box-width', selector: '.op-card' }, expect: 480,
    diverges: { class: 'one-hero-geometry', sheet: '400px' },
  },
  {
    id: 'about-hero-gap',
    sheet: 'about', artboard: '1a', width: 1440, line: 64,
    decl: 'gap', says: '80px',
    reading: 'set apart by the same gap the other hero uses',
    measure: { kind: 'computed', selector: '.hero', prop: 'column-gap' }, expect: '72px',
    diverges: { class: 'one-hero-geometry', sheet: '80px' },
  },
  {
    id: 'about-hero-padding',
    sheet: 'about', artboard: '1a', width: 1440, line: 64,
    decl: 'padding', says: '72px 0 88px',
    reading: 'seventy-two above the eyebrow, exactly as drawn and exactly as the homepage',
    measure: { kind: 'computed', selector: '.hero-head', prop: 'padding-top' }, expect: '72px',
  },
  {
    id: 'about-hero-padding-end',
    sheet: 'about', artboard: '1a', width: 1440, line: 64,
    decl: 'padding', says: '72px 0 88px',
    reading: 'and the step above 88 below it — the pair --s-72 over --s-96 that both heroes breathe on',
    measure: { kind: 'computed', selector: '.hero-head', prop: 'padding-bottom' }, expect: '96px',
    diverges: { class: 'spacing-scale', sheet: '88px' },
  },
  {
    id: 'about-eyebrow-size',
    sheet: 'about', artboard: '1a', width: 1440, line: 66,
    decl: 'font', says: "500 11.5px 'JetBrains Mono',monospace",
    reading: 'the eyebrow is mono at the step under the half pixel the sheet draws',
    measure: { kind: 'computed', selector: '.hero-eyebrow', prop: 'font-size' }, expect: '11px',
    diverges: { class: 'half-pixel', sheet: '11.5px' },
  },
  {
    id: 'about-eyebrow-gap',
    sheet: 'about', artboard: '1a', width: 1440, line: 66,
    decl: 'margin-bottom', says: '26px',
    reading: 'twenty-six under it, on the scale as drawn',
    measure: { kind: 'computed', selector: '.hero-eyebrow', prop: 'margin-bottom' }, expect: '26px',
  },
  {
    id: 'about-h1-size',
    sheet: 'about', artboard: '1a', width: 1440, line: 67,
    decl: 'font', says: "500 62px/1.06 'Chakra Petch',sans-serif",
    reading: 'the About headline is the 62px display step — K-08 gives it to exactly two pages, this one and the homepage',
    measure: { kind: 'computed', selector: 'main h1', prop: 'font-size' }, expect: '62px',
  },
  {
    id: 'about-h1-gap',
    sheet: 'about', artboard: '1a', width: 1440, line: 67,
    decl: 'margin', says: '0 0 28px',
    reading: 'and twenty-eight under it, at the nearest step',
    measure: { kind: 'computed', selector: '.about-headline', prop: 'margin-bottom' }, expect: '26px',
    diverges: { class: 'spacing-scale', sheet: '28px' },
  },
  {
    id: 'about-lede-size',
    sheet: 'about', artboard: '1a', width: 1440, line: 68,
    decl: 'font', says: "400 16.5px/1.75 'Geist',sans-serif",
    reading: 'the lede is the 16.5px body step, which is the one place this hero is not the homepage - there the subline is mono',
    measure: { kind: 'computed', selector: '.about-lede', prop: 'font-size' }, expect: '16.5px',
  },
  // THE 7px DOT ON LINE 71 HAS NO ENTRY, AND IT CANNOT HAVE ONE. This oracle
  // measures elements; it has no kind that means "and this one is absent", and
  // every measure throws on a selector that matches nothing. The dot is absent
  // on purpose — the Consistency Check files this artboard under K-14
  // ("Statuspunkt ONLINE nur auf Startseite und About") and resolves it the
  // other way, "Punkt in der Meta-Leiste jeder Seite, gross im Hero nur auf der
  // Startseite". e2e/home.spec.ts has asserted exactly that since H3, by
  // walking to this page, and it is what caught the dot being built here.
  {
    id: 'about-avail-word',
    sheet: 'about', artboard: '1a', width: 1440, line: 72,
    decl: 'font', says: "600 11px 'JetBrains Mono',monospace",
    reading: 'and the state word beside it is mono 11, which the paragraph around it would otherwise have set to the body face',
    measure: { kind: 'computed', selector: '.hero-avail .st-word', prop: 'font-size' }, expect: '11px',
  },

  // ── 1440 · the operator card ─────────────────────────────────────────────
  {
    id: 'about-card-border',
    sheet: 'about', artboard: '1a', width: 1440, line: 90,
    decl: 'border', says: '1px solid rgba(139,152,166,.12)',
    reading: 'the card is a plate with one hairline, like the spec rail on the case study',
    measure: { kind: 'computed', selector: '.op-card', prop: 'border-top-width' }, expect: '1px',
  },
  {
    id: 'about-card-padding',
    sheet: 'about', artboard: '1a', width: 1440, line: 90,
    decl: 'padding', says: '22px 24px',
    reading: 'padded to the nearest steps either way',
    measure: { kind: 'computed', selector: '.op-card', prop: 'padding-top' }, expect: '20px',
    diverges: { class: 'spacing-scale', sheet: '22px' },
  },
  {
    id: 'about-card-kicker',
    sheet: 'about', artboard: '1a', width: 1440, line: 91,
    decl: 'font', says: "600 9.5px 'JetBrains Mono',monospace",
    reading: 'OPERATOR sits at the bottom of the mono scale, under the half pixel drawn',
    measure: { kind: 'computed', selector: '.op-kicker', prop: 'font-size' }, expect: '9px',
    diverges: { class: 'half-pixel', sheet: '9.5px' },
  },
  {
    id: 'about-card-columns',
    sheet: 'about', artboard: '1a', width: 1440, line: 92,
    decl: 'grid-template-columns', says: '80px 1fr',
    reading: 'a label column and a value column — a description list, drawn as the grid it is',
    measure: { kind: 'track-count', selector: '.op-grid' }, expect: 2,
  },
  {
    id: 'about-card-gap',
    sheet: 'about', artboard: '1a', width: 1440, line: 92,
    decl: 'gap', says: '11px 16px',
    reading: 'sixteen between the two columns, exactly as drawn',
    measure: { kind: 'computed', selector: '.op-grid', prop: 'column-gap' }, expect: '16px',
  },
  {
    id: 'about-card-row-gap',
    sheet: 'about', artboard: '1a', width: 1440, line: 92,
    decl: 'gap', says: '11px 16px',
    reading: 'and eleven between rows, at the nearest step',
    measure: { kind: 'computed', selector: '.op-grid', prop: 'row-gap' }, expect: '12px',
    diverges: { class: 'spacing-scale', sheet: '11px' },
  },
  {
    id: 'about-card-size',
    sheet: 'about', artboard: '1a', width: 1440, line: 92,
    decl: 'font', says: "400 11.5px/1.55 'JetBrains Mono',monospace",
    reading: 'the card reads at the mono step under the half pixel',
    measure: { kind: 'computed', selector: '.op-grid', prop: 'font-size' }, expect: '11px',
    diverges: { class: 'half-pixel', sheet: '11.5px' },
  },

  // ── 1440 · the section heads and the rhythm between them ─────────────────
  {
    id: 'about-sec-rule',
    sheet: 'about', artboard: '1a', width: 1440, line: 173,
    decl: 'border-bottom', says: '1px solid rgba(139,152,166,.16)',
    reading: 'every section head stands on the hairline, and that head is ui.css’s rather than this page’s',
    measure: { kind: 'computed', selector: '.sec', prop: 'border-bottom-width' }, expect: '1px',
  },
  {
    id: 'about-sec-space',
    sheet: 'about', artboard: '1a', width: 1440, line: 173,
    decl: 'margin-bottom', says: '36px',
    reading: 'thirty-six between a head and what it opens',
    measure: { kind: 'computed', selector: '.sec', prop: 'margin-bottom' }, expect: '34px',
    diverges: { class: 'spacing-scale', sheet: '36px' },
  },
  {
    id: 'about-section-gap',
    sheet: 'about', artboard: '1a', width: 1440, line: 172,
    decl: 'margin-bottom', says: '104px',
    reading: 'and 104 between sections, at the step the homepage already reads for the same drawing',
    measure: { kind: 'computed', selector: '.about-section', prop: 'margin-bottom' }, expect: '96px',
    diverges: { class: 'spacing-scale', sheet: '104px' },
  },

  // ── 1440 · SYS.05.02 WHAT I RUN ──────────────────────────────────────────
  {
    id: 'about-run-columns',
    sheet: 'about', artboard: '1a', width: 1440, line: 179,
    decl: 'grid-template-columns', says: 'repeat(4,1fr)',
    reading: 'four tiles, one per axis of the machine this page is served by',
    measure: { kind: 'track-count', selector: '.run-grid' }, expect: 4,
  },
  {
    id: 'about-run-gap',
    sheet: 'about', artboard: '1a', width: 1440, line: 179,
    decl: 'gap', says: '20px',
    reading: 'set twenty apart, on the scale as drawn',
    measure: { kind: 'computed', selector: '.run-grid', prop: 'column-gap' }, expect: '20px',
  },
  {
    id: 'about-run-tile-border',
    sheet: 'about', artboard: '1a', width: 1440, line: 180,
    decl: 'border', says: '1px solid rgba(139,152,166,.16)',
    reading: 'each tile is fenced by the hairline rather than filled',
    measure: { kind: 'computed', selector: '.run-tile', prop: 'border-top-width' }, expect: '1px',
  },
  {
    id: 'about-run-tile-padding',
    sheet: 'about', artboard: '1a', width: 1440, line: 180,
    decl: 'padding', says: '18px 20px',
    reading: 'twenty inside it on the sides, exactly as drawn',
    measure: { kind: 'computed', selector: '.run-tile', prop: 'padding-left' }, expect: '20px',
  },
  {
    id: 'about-run-label-gap',
    sheet: 'about', artboard: '1a', width: 1440, line: 181,
    decl: 'gap', says: '8px',
    reading: 'the mark sits eight off its label — and it is not a .st-dot, because an axis makes no claim',
    measure: { kind: 'computed', selector: '.run-label', prop: 'column-gap' }, expect: '8px',
  },
  {
    id: 'about-run-title-size',
    sheet: 'about', artboard: '1a', width: 1440, line: 182,
    decl: 'font', says: "500 12.5px 'JetBrains Mono',monospace",
    reading: 'the tile title is mono at the step under the half pixel',
    measure: { kind: 'computed', selector: '.run-title', prop: 'font-size' }, expect: '12px',
    diverges: { class: 'half-pixel', sheet: '12.5px' },
  },
  {
    id: 'about-run-detail-size',
    sheet: 'about', artboard: '1a', width: 1440, line: 183,
    decl: 'font', says: "400 11px/1.6 'JetBrains Mono',monospace",
    reading: 'and the sentence under it is mono 11, exactly as drawn',
    measure: { kind: 'computed', selector: '.run-detail', prop: 'font-size' }, expect: '11px',
  },
  {
    id: 'about-run-note-padding',
    sheet: 'about', artboard: '1a', width: 1440, line: 201,
    decl: 'padding', says: '16px 20px',
    reading: 'the closing strip is padded as drawn, and it is the one panel fill on this page',
    measure: { kind: 'computed', selector: '.run-note', prop: 'padding-top' }, expect: '16px',
  },
  {
    id: 'about-run-note-size',
    sheet: 'about', artboard: '1a', width: 1440, line: 202,
    decl: 'font', says: "400 13.5px/1.6 'Geist',sans-serif",
    reading: 'its sentence is the 13px body step under the half pixel',
    measure: { kind: 'computed', selector: '.run-note-text', prop: 'font-size' }, expect: '13px',
    diverges: { class: 'half-pixel', sheet: '13.5px' },
  },
  {
    id: 'about-run-exit-size',
    sheet: 'about', artboard: '1a', width: 1440, line: 204,
    decl: 'font', says: "600 10.5px 'JetBrains Mono',monospace",
    reading: 'and the way to the evidence is mono 10 — a link, where the sheet draws a span with a pointer cursor',
    measure: { kind: 'computed', selector: '.run-note-exit', prop: 'font-size' }, expect: '10px',
    diverges: { class: 'half-pixel', sheet: '10.5px' },
  },

  // ── 1440 · SYS.05.03 HOW I WORK ──────────────────────────────────────────
  {
    id: 'about-prin-columns',
    sheet: 'about', artboard: '1a', width: 1440, line: 213,
    decl: 'grid-template-columns', says: 'repeat(2,1fr)',
    reading: 'four principles in two columns',
    measure: { kind: 'track-count', selector: '.prin-grid' }, expect: 2,
  },
  {
    id: 'about-prin-gap',
    sheet: 'about', artboard: '1a', width: 1440, line: 213,
    decl: 'gap', says: '44px 80px',
    reading: 'eighty between the columns — the hero’s own gap one section up, left unrounded so two grids on one page do not disagree by eight pixels',
    measure: { kind: 'computed', selector: '.prin-grid', prop: 'column-gap' }, expect: '80px',
  },
  {
    id: 'about-prin-row-gap',
    sheet: 'about', artboard: '1a', width: 1440, line: 213,
    decl: 'gap', says: '44px 80px',
    reading: 'and forty-four between the rows, on the scale as drawn',
    measure: { kind: 'computed', selector: '.prin-grid', prop: 'row-gap' }, expect: '44px',
  },
  {
    id: 'about-prin-tracks',
    sheet: 'about', artboard: '1a', width: 1440, line: 214,
    decl: 'grid-template-columns', says: '30px 1fr',
    reading: 'each one is a numeral and a body',
    measure: { kind: 'track-count', selector: '.prin' }, expect: 2,
  },
  {
    id: 'about-prin-inner-gap',
    sheet: 'about', artboard: '1a', width: 1440, line: 214,
    decl: 'gap', says: '18px',
    reading: 'eighteen between them, at the nearest step',
    measure: { kind: 'computed', selector: '.prin', prop: 'column-gap' }, expect: '16px',
    diverges: { class: 'spacing-scale', sheet: '18px' },
  },
  {
    id: 'about-prin-no-size',
    sheet: 'about', artboard: '1a', width: 1440, line: 215,
    decl: 'font', says: "600 11px 'JetBrains Mono',monospace",
    reading: 'the numeral is mono 11 as drawn, and it is the position rather than a field',
    measure: { kind: 'computed', selector: '.prin-no', prop: 'font-size' }, expect: '11px',
  },
  {
    id: 'about-prin-title-size',
    sheet: 'about', artboard: '1a', width: 1440, line: 216,
    decl: 'font', says: "500 17px 'JetBrains Mono',monospace",
    reading: 'the principle title is the top of the mono scale — the sheet draws seventeen and the scale stops at thirteen',
    measure: { kind: 'computed', selector: '.prin-title', prop: 'font-size' }, expect: '13px',
    diverges: { class: 'mono-scale', sheet: '17px' },
  },

  // ── 1440 · SYS.05.01 TRAJECTORY, built in H7b ────────────────────────────
  {
    id: 'about-rail-columns',
    sheet: 'about', artboard: '1a', width: 1440, line: 116,
    decl: 'grid-template-columns', says: 'repeat(6,1fr)',
    reading: 'six stations across, one column each',
    measure: { kind: 'track-count', selector: '.tl-rail' }, expect: 6,
  },
  {
    id: 'about-rail-space',
    sheet: 'about', artboard: '1a', width: 1440, line: 113,
    decl: 'margin-bottom', says: '40px',
    reading: 'forty under the rail before the panel it opens, at the nearest step',
    measure: { kind: 'computed', selector: '.tl-rail', prop: 'margin-bottom' }, expect: '34px',
    diverges: { class: 'spacing-scale', sheet: '40px' },
  },
  {
    id: 'about-rail-track',
    sheet: 'about', artboard: '1a', width: 1440, line: 114,
    decl: 'height', says: '1px',
    reading: 'the stations stand on a hairline, and it runs the whole width',
    measure: { kind: 'computed', selector: '.tl-track', prop: 'height' }, expect: '1px',
  },
  {
    id: 'about-rail-label',
    sheet: 'about', artboard: '1a', width: 1440, line: 118,
    decl: 'font', says: "500 10px 'JetBrains Mono',monospace",
    reading: 'the station label is mono 10, exactly as drawn — and it is the position, because no date exists to put there',
    measure: { kind: 'computed', selector: '.tl-label', prop: 'font-size' }, expect: '10px',
  },
  {
    id: 'about-rail-label-box',
    sheet: 'about', artboard: '1a', width: 1440, line: 118,
    decl: 'height', says: '28px',
    reading: 'in a box that holds the line off the track, at the nearest step',
    measure: { kind: 'computed', selector: '.tl-label', prop: 'height' }, expect: '26px',
    diverges: { class: 'spacing-scale', sheet: '28px' },
  },
  {
    id: 'about-rail-dot',
    sheet: 'about', artboard: '1a', width: 1440, line: 119,
    decl: 'width', says: '11px',
    reading: 'the station mark is eleven across — not a `.st-dot`, because a station makes no claim',
    measure: { kind: 'computed', selector: '.tl-dot', prop: 'width' }, expect: '11px',
  },
  {
    id: 'about-rail-cap-size',
    sheet: 'about', artboard: '1a', width: 1440, line: 120,
    decl: 'font', says: "400 10.5px/1.5 'JetBrains Mono',monospace",
    reading: 'the caption is mono at the step under the half pixel',
    measure: { kind: 'computed', selector: '.tl-cap', prop: 'font-size' }, expect: '10px',
    diverges: { class: 'half-pixel', sheet: '10.5px' },
  },
  {
    id: 'about-rail-cap-gap',
    sheet: 'about', artboard: '1a', width: 1440, line: 120,
    decl: 'margin-top', says: '14px',
    reading: 'fourteen under the mark, exactly as drawn',
    measure: { kind: 'computed', selector: '.tl-cap', prop: 'margin-top' }, expect: '14px',
  },

  // ── 1440 · the panel the rail opens ──────────────────────────────────────
  {
    id: 'about-panel-columns',
    sheet: 'about', artboard: '1a', width: 1440, line: 150,
    decl: 'grid-template-columns', says: '1fr 380px',
    reading: 'the panel is the prose and an aside, and it is the rail this site already has',
    // `:visible` AND NOT `.tl-panel`. Five of the six are `display: none` at
    // rest, and a computed `grid-template-columns` on a box that was never laid
    // out reads back the SPECIFIED value — `minmax(0, 1fr) 380px`, which counts
    // as three tracks rather than two. The number would have been wrong for a
    // reason that has nothing to do with the drawing.
    measure: { kind: 'track-count', selector: '.tl-panel:visible' }, expect: 2,
  },
  {
    id: 'about-panel-gap',
    sheet: 'about', artboard: '1a', width: 1440, line: 150,
    decl: 'gap', says: '64px',
    reading: 'set apart by `.cs-prob`\u2019s own gap rather than a seventh two-column rule',
    measure: { kind: 'computed', selector: '.tl-panel', prop: 'column-gap' }, expect: '80px',
    diverges: { class: 'one-panel-geometry', sheet: '64px' },
  },
  {
    id: 'about-panel-head-gap',
    sheet: 'about', artboard: '1a', width: 1440, line: 152,
    decl: 'gap', says: '14px',
    reading: 'the label sits fourteen off the title it belongs to',
    measure: { kind: 'computed', selector: '.tl-head', prop: 'column-gap' }, expect: '14px',
  },
  {
    id: 'about-panel-no',
    sheet: 'about', artboard: '1a', width: 1440, line: 153,
    decl: 'font', says: "600 11px 'JetBrains Mono',monospace",
    reading: 'the panel repeats the station label at mono 11, so a panel read on its own says which station it is',
    measure: { kind: 'computed', selector: '.tl-head-no', prop: 'font-size' }, expect: '11px',
  },
  {
    id: 'about-panel-title',
    sheet: 'about', artboard: '1a', width: 1440, line: 154,
    decl: 'font', says: "500 19px 'Chakra Petch',sans-serif",
    reading: 'and the title is the display face at the step above nineteen — the scale has 26, and no nineteen',
    measure: { kind: 'computed', selector: '.tl-head-title', prop: 'font-size' }, expect: '26px',
    diverges: { class: 'mono-scale', sheet: '19px' },
  },
  {
    id: 'about-panel-body',
    sheet: 'about', artboard: '1a', width: 1440, line: 156,
    decl: 'font', says: "400 15.5px/1.75 'Geist',sans-serif",
    reading: 'the prose is the 15px body step under the half pixel',
    measure: { kind: 'computed', selector: '.tl-body', prop: 'font-size' }, expect: '15px',
    diverges: { class: 'half-pixel', sheet: '15.5px' },
  },
  {
    id: 'about-panel-aside-label',
    sheet: 'about', artboard: '1a', width: 1440, line: 160,
    decl: 'font', says: "600 9.5px 'JetBrains Mono',monospace",
    reading: 'PICKED UP and SHIPPED sit at the bottom of the mono scale',
    measure: { kind: 'computed', selector: '.tl-aside-label', prop: 'font-size' }, expect: '9px',
    diverges: { class: 'half-pixel', sheet: '9.5px' },
  },
  {
    id: 'about-panel-tag-border',
    sheet: 'about', artboard: '1a', width: 1440, line: 163,
    decl: 'border', says: '1px solid rgba(139,152,166,.25)',
    reading: 'a tag is a word in a box, and the box is what stops three of them reading as one sentence',
    measure: { kind: 'computed', selector: '.tag', prop: 'border-top-width' }, expect: '1px',
  },
  {
    id: 'about-panel-tag-size',
    sheet: 'about', artboard: '1a', width: 1440, line: 163,
    decl: 'font', says: "500 9.5px 'JetBrains Mono',monospace",
    reading: 'at the mono step under the half pixel',
    measure: { kind: 'computed', selector: '.tag', prop: 'font-size' }, expect: '9px',
    diverges: { class: 'half-pixel', sheet: '9.5px' },
  },

  // ── 390 · the rail stands up ─────────────────────────────────────────────
  {
    id: 'about-mobile-rail-column',
    sheet: 'about', artboard: '1b', width: 390, line: 323,
    decl: 'padding-left', says: '20px',
    reading: 'the rail turns ninety degrees and leaves twenty on the left for the line the marks hang off',
    measure: { kind: 'computed', selector: '.tl-rail', prop: 'padding-left' }, expect: '20px',
  },
  {
    id: 'about-mobile-rail-tracks',
    sheet: 'about', artboard: '1b', width: 390, line: 323,
    decl: 'position', says: 'relative',
    reading: 'one column, not six — and where it turns was measured rather than drawn',
    measure: { kind: 'track-count', selector: '.tl-rail' }, expect: 1,
    diverges: { class: 'rail-wraps-at-720' },
  },
  // ── 390 · About, artboard 1b ─────────────────────────────────────────────
  {
    id: 'about-mobile-h1',
    sheet: 'about', artboard: '1b', width: 390, line: 288,
    decl: 'font', says: "500 34px/1.1 'Chakra Petch',sans-serif",
    reading: 'the display step falls to 34 on a phone. The artboard draws an h2 there; a crop is not a document outline, and this page keeps its one h1',
    measure: { kind: 'computed', selector: 'main h1', prop: 'font-size' }, expect: '34px',
  },
  {
    id: 'about-mobile-run-columns',
    sheet: 'about', artboard: '1b', width: 390, line: 380,
    decl: 'grid-template-columns', says: '1fr 1fr',
    reading: 'four tiles become two columns on a phone, which is the sheet’s own pair and the switch this phase had to derive',
    measure: { kind: 'track-count', selector: '.run-grid' }, expect: 2,
  },
  {
    id: 'about-mobile-prin-column',
    sheet: 'about', artboard: '1b', width: 390, line: 397,
    decl: 'gap', says: '26px',
    reading: 'and the principles become one column, twenty-six apart, exactly as drawn',
    measure: { kind: 'computed', selector: '.prin-grid', prop: 'row-gap' }, expect: '26px',
  },
  {
    id: 'about-mobile-prin-tracks',
    sheet: 'about', artboard: '1b', width: 390, line: 397,
    decl: 'flex-direction', says: 'column',
    reading: 'one track, not two — the same switch the tiles take, one section down',
    measure: { kind: 'track-count', selector: '.prin-grid' }, expect: 1,
  },
];


/**
 * `/contact`'s map. Build plan H8.
 *
 * THE SHEET THIS PAGE IS MEASURED AGAINST IS ALSO THE SHEET IT DISAGREES WITH
 * MOST, and the disagreements are not about pixels. Four things it draws are
 * claims rather than geometry — a demo switch, a footer strip that says nothing
 * is stored on the server, a build number and an uptime — and one of them is
 * false on this page specifically, because `contact_messages` is the one table
 * on this site that holds personal data. `a-form-is-not-a-canvas` carries that
 * argument; what is left below is the drawing.
 *
 * THE FORM IS AN ISLAND, SO EVERY MEASUREMENT IS TAKEN WHERE A VISITOR MEETS
 * IT. There is no `on:` in this file. `/work` has to take two thirds of its
 * readings in the gallery because the rig has no api and no row stands on the
 * page; this page reads nothing, and the form is on it whether or not anything
 * answers.
 */
const CONTACT_MAP = [
  // ── 1440 · Contact, artboard 1a · the two columns ────────────────────────
  {
    id: 'contact-columns',
    sheet: 'contact', artboard: '1a', width: 1440, line: 66,
    decl: 'grid-template-columns', says: '1fr 520px',
    reading: 'the form stands beside the request it is about to send',
    measure: { kind: 'track-count', selector: '.cf' }, expect: 2,
  },
  {
    id: 'contact-trace-width',
    sheet: 'contact', artboard: '1a', width: 1440, line: 66,
    decl: 'grid-template-columns', says: '1fr 520px',
    reading: 'and the trace is 520 wide, the one fixed column on this page',
    measure: { kind: 'box-width', selector: '.tx' }, expect: 520,
  },
  {
    id: 'contact-columns-gap',
    sheet: 'contact', artboard: '1a', width: 1440, line: 66,
    decl: 'gap', says: '80px',
    reading: 'eighty between them, the gap every two-column row on this site uses',
    measure: { kind: 'computed', selector: '.cf', prop: 'column-gap' }, expect: '80px',
  },
  {
    id: 'contact-section-padding',
    sheet: 'contact', artboard: '1a', width: 1440, line: 66,
    decl: 'padding', says: '72px 0 40px',
    reading: 'seventy-two above the marker, the step both other pages open on',
    measure: { kind: 'computed', selector: '.contact', prop: 'padding-top' }, expect: '72px',
  },
  // ── the words ────────────────────────────────────────────────────────────
  {
    id: 'contact-marker-size',
    sheet: 'contact', artboard: '1a', width: 1440, line: 69,
    decl: 'font', says: "500 11.5px 'JetBrains Mono',monospace",
    reading: 'SYS.06 is the section marker this site already has, at the step it already uses',
    measure: { kind: 'computed', selector: '.sec-id', prop: 'font-size' }, expect: '12px',
    diverges: { class: 'one-section-head', sheet: '11.5px' },
  },
  {
    id: 'contact-headline-size',
    sheet: 'contact', artboard: '1a', width: 1440, line: 70,
    decl: 'font', says: "500 52px/1.06 'Chakra Petch',sans-serif",
    reading: 'the shortest headline on this site is at the 52 step, like every other page head',
    measure: { kind: 'computed', selector: '.contact-headline', prop: 'font-size' }, expect: '52px',
  },
  {
    id: 'contact-lede-size',
    sheet: 'contact', artboard: '1a', width: 1440, line: 71,
    decl: 'font', says: "400 15.5px/1.75 'Geist',sans-serif",
    reading: 'the paragraph under it is body text at the step under the half pixel',
    measure: { kind: 'computed', selector: '.contact-lede', prop: 'font-size' }, expect: '15px',
    diverges: { class: 'half-pixel', sheet: '15.5px' },
  },
  // THE TWO `ch` CAPS ARE NOT IN THIS MAP, and that is a property of the unit
  // rather than an omission. The sheet caps the headline at `16ch` and the lede
  // at `56ch`; `getComputedStyle` returns a USED value, so a `ch` comes back as
  // pixels — and the pixels depend on which font actually loaded. Measured:
  // 529.152px in a browser with Chakra Petch and 512px in the Playwright rig,
  // seventeen pixels apart for one declaration nobody changed. An oracle number
  // that moves with a font file is not an oracle number.
  //
  // What the caps are FOR is asserted in e2e/contact.spec.ts instead: the
  // headline sets on one line at both drawn widths, and the lede stays inside a
  // reading measure. Those are the requirements; `16ch` is one spelling of one
  // of them.

  // ── the form ─────────────────────────────────────────────────────────────
  {
    id: 'contact-form-width',
    sheet: 'contact', artboard: '1a', width: 1440, line: 73,
    decl: 'max-width', says: '640px',
    reading: 'the fields stop at 640 rather than running the width of the column',
    measure: { kind: 'computed', selector: '.cf-form', prop: 'max-width' }, expect: '640px',
  },
  {
    id: 'contact-field-gap',
    sheet: 'contact', artboard: '1a', width: 1440, line: 73,
    decl: 'gap', says: '22px',
    reading: 'twenty between the fields, on the scale',
    measure: { kind: 'computed', selector: '.cf-form', prop: 'row-gap' }, expect: '20px',
    diverges: { class: 'spacing-scale', sheet: '22px' },
  },
  {
    id: 'contact-label-size',
    sheet: 'contact', artboard: '1a', width: 1440, line: 77,
    decl: 'font', says: "500 10px 'JetBrains Mono',monospace",
    reading: 'a field label is mono at the smallest step, and it is a label rather than a placeholder',
    measure: { kind: 'computed', selector: '.field-label', prop: 'font-size' }, expect: '10px',
  },
  {
    id: 'contact-label-tracking',
    sheet: 'contact', artboard: '1a', width: 1440, line: 77,
    decl: 'letter-spacing', says: '.14em',
    reading: 'tracked out at the label step this site uses everywhere',
    measure: { kind: 'computed', selector: '.field-label', prop: 'letter-spacing' }, expect: '1.4px',
  },
  {
    id: 'contact-input-padding',
    sheet: 'contact', artboard: '1a', width: 1440, line: 81,
    decl: 'padding', says: '13px 15px',
    reading: 'the box a visitor types into, and ui.css has drawn it since G7 at exactly this padding',
    measure: { kind: 'computed', selector: '#name', prop: 'padding-top' }, expect: '13px',
  },
  {
    id: 'contact-input-font',
    sheet: 'contact', artboard: '1a', width: 1440, line: 81,
    decl: 'font', says: "400 14px 'JetBrains Mono',monospace",
    reading: 'and what is typed is mono, because the trace beside it is the same string',
    measure: { kind: 'computed', selector: '#name', prop: 'font-size' }, expect: '13px',
    diverges: { class: 'half-pixel', sheet: '14px' },
  },
  {
    id: 'contact-button-tracking',
    sheet: 'contact', artboard: '1a', width: 1440, line: 112,
    decl: 'letter-spacing', says: '.14em',
    reading: 'the send button is a button of this site, tracked like every other',
    measure: { kind: 'computed', selector: '.cf-actions .btn', prop: 'letter-spacing' }, expect: '1.43px',
  },
  // ── the trace ────────────────────────────────────────────────────────────
  {
    id: 'contact-trace-head-gap',
    sheet: 'contact', artboard: '1a', width: 1440, line: 125,
    decl: 'gap', says: '9px',
    reading: 'the dot, the name and the state sit ten apart, on the scale',
    measure: { kind: 'computed', selector: '.tx-head', prop: 'column-gap' }, expect: '10px',
    diverges: { class: 'spacing-scale', sheet: '9px' },
  },
  {
    id: 'contact-trace-head-padding',
    sheet: 'contact', artboard: '1a', width: 1440, line: 125,
    decl: 'padding', says: '11px 16px',
    reading: 'sixteen in from the panel edge, exactly as drawn',
    measure: { kind: 'computed', selector: '.tx-head', prop: 'padding-left' }, expect: '16px',
  },
  {
    id: 'contact-trace-name-size',
    sheet: 'contact', artboard: '1a', width: 1440, line: 127,
    decl: 'font', says: "600 10px 'JetBrains Mono',monospace",
    reading: 'TX is a label at the smallest mono step',
    measure: { kind: 'computed', selector: '.tx-name', prop: 'font-size' }, expect: '10px',
  },
  {
    id: 'contact-trace-bytes-size',
    sheet: 'contact', artboard: '1a', width: 1440, line: 130,
    decl: 'font', says: "400 9.5px 'JetBrains Mono',monospace",
    reading: 'and the byte count beside it at the step under the half pixel',
    measure: { kind: 'computed', selector: '.tx-bytes', prop: 'font-size' }, expect: '9px',
    diverges: { class: 'half-pixel', sheet: '9.5px' },
  },
  // ── 390 · Contact, artboard 1c ───────────────────────────────────────────
  {
    id: 'contact-columns-390',
    sheet: 'contact', artboard: '1c', width: 390, line: 350,
    decl: 'width', says: '390px',
    reading: 'on the phone the trace falls under the form, one column',
    measure: { kind: 'track-count', selector: '.cf' }, expect: 1,
  },
  {
    id: 'contact-headline-390',
    sheet: 'contact', artboard: '1c', width: 390, line: 361,
    decl: 'font', says: "500 34px/1.1 'Chakra Petch',sans-serif",
    reading: 'the display step falls to 34, which is K-08 and a switch layout.css owns',
    measure: { kind: 'computed', selector: '.contact-headline', prop: 'font-size' }, expect: '34px',
  },
  {
    id: 'contact-headline-tag-390',
    sheet: 'contact', artboard: '1c', width: 390, line: 361,
    decl: 'font', says: "500 34px/1.1 'Chakra Petch',sans-serif",
    reading: 'and it is still the page\'s one h1, where the artboard writes h2',
    measure: { kind: 'computed', selector: 'h1.contact-headline', prop: 'font-size' }, expect: '34px',
    diverges: { class: 'one-copy-of-the-words', sheet: '<h2>' },
  },
  {
    id: 'contact-field-gap-390',
    sheet: 'contact', artboard: '1c', width: 390, line: 365,
    decl: 'gap', says: '18px',
    reading: 'the fields keep one rhythm at both widths rather than tightening by two pixels',
    measure: { kind: 'computed', selector: '.cf-form', prop: 'row-gap' }, expect: '20px',
    diverges: { class: 'spacing-scale', sheet: '18px' },
  },
];

// ── H9a · Blog Post ────────────────────────────────────────────────────────
//
// TWO ARTBOARDS, LIKE ABOUT AND CONTACT. The Intermediate Widths sheet names
// this page in its list of the ones with nothing to decide at 1024, so there is
// no third frame and nothing was derived to stand in for one.
//
// WHAT IS NOT IN THIS MAP, and it is more than usual: the POSTMORTEM box, the
// MEASURE table, the terminal capture, the SERIES block, the COPY button, the
// reading-progress bar and the two-tone code. None of them is built, each for a
// reason ADR 0070 gives, and an oracle entry for an element that does not exist
// would be a red test standing in for a decision — which is what the backlog
// and the ADR are for.
//
// THE `ch` CAPS ARE MEASURED AS PIXELS, NOT AS `ch`, for the reason CONTACT_MAP
// gives one map up: `getComputedStyle` returns a used value and a `ch` resolves
// against whichever font actually loaded. What the prose entry asserts instead
// is the thing that surprised this phase — 68ch resolves to 748px at 16.5px
// Geist and the column the sheet draws is 700, so the COLUMN is the binding
// measure and a line holds about 64 characters rather than 68. Narrower than
// the sheet's number, never wider, and worth having written down.
const BLOG_POST_MAP = [
  // ── 1440 · artboard 1a · the two columns ─────────────────────────────────
  {
    id: 'post-columns',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 85,
    decl: 'grid-template-columns', says: '196px 700px',
    reading: 'the contents rail stands beside the prose, and it stands on the left',
    measure: { kind: 'track-count', selector: '.post-body-grid' }, expect: 2,
  },
  {
    id: 'post-rail-width',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 85,
    decl: 'grid-template-columns', says: '196px 700px',
    reading: 'the rail is 196 wide, the first fixed column on this site that comes first',
    measure: { kind: 'box-width', selector: '.post-rail' }, expect: 196,
  },
  {
    id: 'post-column-width',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 85,
    decl: 'grid-template-columns', says: '196px 700px',
    reading: 'and the reading column is 700 — fixed, not the rest of the row',
    measure: { kind: 'box-width', selector: '.post-column' }, expect: 700,
  },
  {
    id: 'post-columns-gap',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 85,
    decl: 'gap', says: '64px',
    reading: 'seventy-two between them, the step every other two-column row on this site uses',
    measure: { kind: 'computed', selector: '.post-body-grid', prop: 'column-gap' }, expect: '72px',
    diverges: { class: 'spacing-scale', sheet: '64px' },
  },
  // ── the header ───────────────────────────────────────────────────────────
  {
    id: 'post-head-padding',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 66,
    decl: 'padding', says: '34px 0 48px',
    reading: 'thirty-four above the title, a step on the scale',
    measure: { kind: 'computed', selector: '.post-head', prop: 'padding-top' }, expect: '34px',
  },
  {
    id: 'post-head-rule',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 66,
    decl: 'margin-bottom', says: '56px',
    reading: 'and fifty-six under the hairline that closes it',
    measure: { kind: 'computed', selector: '.post-head', prop: 'margin-bottom' }, expect: '56px',
  },
  {
    id: 'post-h1-size',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 73,
    decl: 'font', says: "500 52px/1.1 'Chakra Petch',sans-serif",
    reading: 'the entry title is at the 52 step, like every page head that is not the homepage',
    measure: { kind: 'computed', selector: 'main h1', prop: 'font-size' }, expect: '52px',
  },
  {
    id: 'post-deck-size',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 74,
    decl: 'font', says: "400 17.5px/1.65 'Geist',sans-serif",
    reading: 'the dek under it is the largest body step',
    measure: { kind: 'computed', selector: '.post-deck', prop: 'font-size' }, expect: '16.5px',
    diverges: { class: 'half-pixel', sheet: '17.5px' },
  },
  {
    id: 'post-meta-size',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 75,
    decl: 'font', says: "500 10.5px 'JetBrains Mono',monospace",
    reading: 'the meta row is mono at the second-smallest step',
    measure: { kind: 'computed', selector: '.post-meta dt', prop: 'font-size' }, expect: '10px',
    diverges: { class: 'half-pixel', sheet: '10.5px' },
  },
  {
    id: 'post-meta-gap',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 75,
    decl: 'gap', says: '26px',
    reading: 'twenty-six between the pairs, a step on the scale',
    measure: { kind: 'computed', selector: '.post-meta', prop: 'column-gap' }, expect: '26px',
  },
  {
    id: 'post-crumb-size',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 62,
    decl: 'font', says: "500 10.5px 'JetBrains Mono',monospace",
    reading: 'the crumb is the same mono step as the meta row under it',
    measure: { kind: 'computed', selector: '.post-crumb', prop: 'font-size' }, expect: '10px',
    diverges: { class: 'half-pixel', sheet: '10.5px' },
  },
  // ── the rail ─────────────────────────────────────────────────────────────
  {
    id: 'post-toc-entry-columns',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 95,
    decl: 'grid-template-columns', says: '22px 1fr',
    reading: 'a contents line is a number and a title, in two columns',
    measure: { kind: 'track-count', selector: '.post-toc li' }, expect: 2,
  },
  {
    id: 'post-toc-entry-gap',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 95,
    decl: 'gap', says: '8px',
    reading: 'eight between the number and the words',
    measure: { kind: 'computed', selector: '.post-toc li', prop: 'column-gap' }, expect: '8px',
  },
  // ── the summary ──────────────────────────────────────────────────────────
  {
    id: 'post-summary-edge',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 113,
    decl: 'border-left', says: '2px solid #00E5FF',
    reading: 'the summary carries the accent on its edge — the panel is not the alert moment',
    measure: { kind: 'computed', selector: '.post-summary', prop: 'border-left-width' },
    expect: '2px',
  },
  {
    id: 'post-summary-padding',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 113,
    decl: 'padding', says: '22px 26px',
    reading: 'twenty above, on the scale',
    measure: { kind: 'computed', selector: '.post-summary', prop: 'padding-top' }, expect: '20px',
    diverges: { class: 'spacing-scale', sheet: '22px' },
  },
  {
    id: 'post-summary-label-size',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 114,
    decl: 'font', says: "600 9.5px 'JetBrains Mono',monospace",
    reading: 'SUMMARY is a rail label at the smallest mono step',
    measure: { kind: 'computed', selector: '#post-summary-label', prop: 'font-size' },
    expect: '10px',
    diverges: { class: 'half-pixel', sheet: '9.5px' },
  },
  // ── the prose ────────────────────────────────────────────────────────────
  {
    id: 'post-h2-size',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 118,
    decl: 'font', says: "500 21px 'JetBrains Mono',monospace",
    reading: 'a section heading is mono, at the 26 step',
    measure: { kind: 'computed', selector: '.post-body h2', prop: 'font-size' }, expect: '26px',
    diverges: { class: 'heading-scale', sheet: '21px' },
  },
  {
    id: 'post-prose-size',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 119,
    decl: 'font', says: "400 16.5px/1.8 'Geist',sans-serif",
    reading: 'the prose is the largest body step, and this one needs no rounding',
    measure: { kind: 'computed', selector: '.post-body p', prop: 'font-size' }, expect: '16.5px',
  },
  {
    id: 'post-prose-measure',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 119,
    decl: 'max-width', says: '68ch',
    reading: 'the column is 700 and 68ch resolves to 748, so the column is the measure and a line holds about 64 characters',
    measure: { kind: 'box-width', selector: '.post-body p' }, expect: 700,
  },
  {
    id: 'post-quote-size',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 162,
    decl: 'font', says: "400 21px/1.55 'Chakra Petch',sans-serif",
    reading: 'the pull quote is the second and last place display is allowed, at the 26 step',
    measure: { kind: 'computed', selector: '.post-body blockquote', prop: 'font-size' },
    expect: '26px',
    diverges: { class: 'heading-scale', sheet: '21px' },
  },
  // ── the code block ───────────────────────────────────────────────────────
  {
    id: 'post-code-columns',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 137,
    decl: 'grid-template-columns', says: '44px 1fr',
    reading: 'the line numbers stand in a column of their own, so a long line scrolls under them',
    measure: { kind: 'track-count', selector: '.post-code-body' }, expect: 2,
  },
  {
    id: 'post-code-gutter-width',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 137,
    decl: 'grid-template-columns', says: '44px 1fr',
    reading: 'and that column is 44 wide',
    measure: { kind: 'box-width', selector: '.post-code-gutter' }, expect: 44,
  },
  {
    id: 'post-code-size',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 139,
    decl: 'font', says: "400 12.5px/1.85 'JetBrains Mono',monospace",
    reading: 'code is mono at the largest step under the half pixel',
    measure: { kind: 'computed', selector: '.post-pre', prop: 'font-size' }, expect: '12px',
    diverges: { class: 'half-pixel', sheet: '12.5px' },
  },
  {
    id: 'post-code-padding',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 139,
    decl: 'padding', says: '18px 20px',
    reading: 'sixteen above the first line, on the scale',
    measure: { kind: 'computed', selector: '.post-pre', prop: 'padding-top' }, expect: '16px',
    diverges: { class: 'spacing-scale', sheet: '18px' },
  },
  // ── the author line and the foot ─────────────────────────────────────────
  {
    id: 'post-portrait-size',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 202,
    decl: 'width', says: '56px',
    reading: 'the portrait slot is 56 square and visibly empty, because there is no photograph in this repository',
    measure: { kind: 'box-width', selector: '.post-portrait' }, expect: 56,
  },
  {
    id: 'post-author-name-size',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 204,
    decl: 'font', says: "500 12.5px 'JetBrains Mono',monospace",
    reading: 'the byline is mono at the largest step under the half pixel',
    measure: { kind: 'computed', selector: '.post-author-name', prop: 'font-size' }, expect: '12px',
    diverges: { class: 'half-pixel', sheet: '12.5px' },
  },
  {
    id: 'post-foot-columns',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 210,
    decl: 'grid-template-columns', says: '1fr 1fr',
    reading: 'previous and next stand side by side, and both cells are drawn whether or not there is an entry in them',
    measure: { kind: 'track-count', selector: '.post-foot' }, expect: 2,
  },
  {
    id: 'post-foot-gap',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 210,
    decl: 'gap', says: '20px',
    reading: 'twenty between the two cards, a step on the scale',
    measure: { kind: 'computed', selector: '.post-foot', prop: 'column-gap' }, expect: '20px',
  },
  {
    id: 'post-neighbour-padding',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 211,
    decl: 'padding', says: '20px 22px',
    reading: 'twenty inside a card, on the scale in both directions',
    measure: { kind: 'computed', selector: '.post-neighbour', prop: 'padding-top' }, expect: '20px',
  },
  {
    id: 'post-neighbour-label-size',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 212,
    decl: 'font', says: "500 9.5px 'JetBrains Mono',monospace",
    reading: 'the card label is mono at the smallest step',
    measure: { kind: 'computed', selector: '.post-neighbour-label', prop: 'font-size' },
    expect: '9px',
    diverges: { class: 'half-pixel', sheet: '9.5px' },
  },
  {
    id: 'post-neighbour-meta-size',
    sheet: 'blogPost', artboard: '1a', width: 1440, line: 214,
    decl: 'font', says: "400 10.5px 'JetBrains Mono',monospace",
    reading: 'the date and the read time under a card title, one step up from the label',
    measure: { kind: 'computed', selector: '.post-neighbour-meta', prop: 'font-size' },
    expect: '10px',
    diverges: { class: 'half-pixel', sheet: '10.5px' },
  },
  // ── 390 · artboard 1b ────────────────────────────────────────────────────
  {
    id: 'post-h1-mobile',
    sheet: 'blogPost', artboard: '1b', width: 390, line: 274,
    decl: 'font', says: "500 34px/1.14 'Chakra Petch',sans-serif",
    reading: 'the title falls to 34, which is K-08 and a switch layout.css already owns',
    measure: { kind: 'computed', selector: 'main h1', prop: 'font-size' }, expect: '34px',
  },
  {
    id: 'post-summary-edge-mobile',
    sheet: 'blogPost', artboard: '1b', width: 390, line: 292,
    decl: 'border-left', says: '2px solid #00E5FF',
    reading: 'the summary keeps its accent edge on a phone',
    measure: { kind: 'computed', selector: '.post-summary', prop: 'border-left-width' },
    expect: '2px',
  },
  {
    id: 'post-columns-mobile',
    sheet: 'blogPost', artboard: '1b', width: 390, line: 292,
    decl: 'margin-bottom', says: '30px',
    reading: 'and the rail is above the prose rather than beside it — one column, and the entry that follows is the whole width',
    measure: { kind: 'track-count', selector: '.post-body-grid' }, expect: 1,
  },
];

const TARGETS = [
  { map: CASE_MAP, target: 'web/e2e/oracle/case-study.gen.json' },
  { map: HOME_MAP, target: 'web/e2e/oracle/home.gen.json' },
  { map: WORK_MAP, target: 'web/e2e/oracle/work.gen.json' },
  { map: ABOUT_MAP, target: 'web/e2e/oracle/about.gen.json' },
  { map: BLOG_POST_MAP, target: 'web/e2e/oracle/blog-post.gen.json' },
  { map: CONTACT_MAP, target: 'web/e2e/oracle/contact.gen.json' },
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
