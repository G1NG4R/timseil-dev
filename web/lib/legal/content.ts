// Every sentence on `/privacy`, as data.
//
// WHY IT IS DATA AND NOT MARKUP: `npm test` reads `lib/**` and cannot load a
// `.tsx`, and the single most important assertion this phase makes is about
// these strings rather than about their arrangement. lib/about/content.ts says
// the same thing one page over. content.test.ts is where it is cashed in:
// every duration in this prose is held against a file that enforces it, and a
// short list of sentences the sheet drew is banned outright.
//
// ADR 0075 PREDICTED `web/content/legal/` AND THIS IS NOT THAT. The prediction
// was made before the page had a test plan; MDX would have put the tables, the
// jump rail and the short version into markup, and put every claim in this file
// out of reach of `node --test`. ADR 0076 records the correction so it does not
// read as drift.
//
// SIX SENTENCES OF THE SHEET ARE GONE AND EACH ONE IS A FINDING, not a
// rewrite for taste. The sheet is dated 16.08.2026 and the code moved:
//
//   1. "Nothing is written to a database here" — false since H8. See 07.06.
//   2. "how long you had the form open … neither is stored" — `dwell_ms` is a
//      column. Only the honeypot is discarded.
//   3. "I count page views with [ANALYTICS TOOL]" — there is no such tool. See
//      07.03, which keeps its number and answers the question with "nobody".
//   4. The log table listed the address in the clear, the user agent and the
//      referrer. internal/middleware/logging.go writes none of the three.
//   5. "Two entries, both in local storage" over a table of three. One exists.
//   6. "no third party in the request path" — scoped in 07.05 to what this
//      application does, which is the part I can actually promise.
//
// NO BRACKET SURVIVES A MERGE, and in H12b one did. The rule and the incident
// behind it are written out where `PLACEHOLDERS` used to stand, below.
//
// THIS FILE IS `/privacy` AND NOTHING ELSE. Since H12c there is a second legal
// page in imprint.ts; the two share the block type in blocks.ts, the order in
// sections.ts and the components, and share no prose. A sentence that belongs
// on both pages belongs on one of them with a link from the other.

import type { Block } from "./blocks.ts";
import { RATE_LIMIT_MINUTES, retentionSentence } from "./retention.ts";
import { FIELD_COUNT } from "./readout.ts";

/** One line of THE SHORT VERSION. `yes` is the sheet's ✓ and `no` its ✗; the
 *  mark is a flag rather than a character, because the character is a
 *  stylesheet's business and a screen reader needs the word. */
export interface ShortLine {
  readonly yes: boolean;
  readonly text: string;
}

/**
 * THE LIST OF PERMITTED BRACKETS IS GONE, AND ITS ABSENCE IS THE RULE.
 *
 * H12b shipped with two of them — `[ADDRESS]` here and
 * `[OVH LEGAL ENTITY AND LOCATION]` in 07.06 — held as an exact set so the set
 * could only shrink on purpose. It shrank by nothing, and both went live on a
 * public, indexable page, because an exact set is green while it is exactly
 * right and no machine in this repository knew when it had to be EMPTY.
 *
 * That is the incident CLAUDE.md asks for before a new rule exists, so the rule
 * exists now and it is one sentence: no legal page carries a bracket. It is
 * held in content.test.ts over both pages at once — `/privacy` here and
 * `/imprint` in imprint.ts — and it fails until the facts only the operator has
 * are in the text.
 */

export const HERO = {
  eyebrow: "SYS.07 — PRIVACY",
  title: "What this server knows",
  // THE SHEET'S LEDE PROMISED THE WRONG THING, and correcting it made the page
  // better. It said "here is the actual record of your visit" — but most of
  // what the panel shows is NOT in the record: the user agent, the referrer and
  // the language reach the server on every request and this application writes
  // none of them down. So the panel shows what the browser is saying, 07.02
  // says what is kept, and the gap between the two is the most interesting
  // thing on the page.
  lede: "Rather than describe it in the abstract, here is what your browser is telling this server as you read this. Most of it is not written down — what is, and for how long, is 07.02.",
  sub: "No cookie was set to produce it, and nothing above was sent anywhere to produce it either.",
} as const;

/**
 * The page's own furniture words.
 *
 * HERE AND NOT IN en.ts, AND THE LINE IS WORTH DRAWING. The dictionaries carry
 * the chrome — nav, footer, state words — because those appear on every page and
 * are translated when a language is filled in. This page is English and stays
 * English by decision (ADR 0076), so five labels in three dictionaries would be
 * five keys German and French would have to answer for a document they do not
 * contain. The footer's `PRIVACY` link stays in en.ts, because the footer is
 * chrome and is on every page.
 */
export const LABELS = {
  rail: "ON THIS PAGE",
  shortVersion: "THE SHORT VERSION",
  /** Read out in place of the ✓ and ✗, which a screen reader is given neither
   *  the glyph nor the colour of. */
  yes: "Yes",
  no: "No",
  /** The accessible name of the readout's list. The card's title is a metaphor
   *  and is marked decorative; this is what the list is actually called. */
  readout: "What your browser is telling this server",
  /** Under the last section: the date this text was last gone through. It is on
   *  the PAGE and not in the footer — the Chrome sheet is the binding version of
   *  the footer and draws no such line, `FooterMeta` is byte-identical on ten
   *  pages, and a revision date is a statement about THIS text rather than about
   *  the site. ADR 0076.
   *
   *  A DATE AND NOT A BUILD STAMP: `git` knows when this file changed, and that
   *  is not the same question. This is the date somebody last read the page
   *  against the code, and only a person can set it. */
  revised: "LAST REVISED 2026-09-11",
} as const;

/**
 * The card under the jump rail that points at the other legal page.
 *
 * DRAWN ON BOTH ARTBOARDS AND BUILT IN NEITHER, until now: the sheet puts a
 * `SEE ALSO` on 1a pointing here and one on 1b pointing at the imprint, and
 * H12b built the page that had nowhere to point — ADR 0076 records that as a
 * cost of the split rather than a decision. H12c is the phase where the target
 * exists, so the field arrives on both pages in the same commit.
 *
 * THE ARROW IS NOT IN THE STRING. `components/legal/SeeAlso.tsx` draws it, the
 * way every other exit link on this site does — `CASE STUDY →`, `WORK →`. A
 * glyph in a data file is a glyph three test files then have to spell.
 *
 * AND THE PATH IS A PATH, NOT AN HREF. `/imprint` is the same string
 * lib/seo/pages.ts and e2e/widths.ts use; the page resolves it through
 * `localeHref`, because a data file has no business knowing which language is
 * reading it.
 */
export const SEE_ALSO = {
  label: "SEE ALSO",
  marker: "SYS.06 — IMPRINT",
  blurb: "Who operates the site and where it runs.",
  path: "/imprint",
} as const;

export const PANEL = {
  /** The sheet's title for the terminal card. A metaphor, and it is labelled as
   *  one in the page's markup rather than presented as a command that ran. */
  title: "tail -f access.log — your request",
  badge: "LIVE",
  /** Counted, never typed. `8 FIELDS · NOTHING ELSE` with a literal 8 beside a
   *  list is the defect lib/notfound/mounted.ts already records. */
  footer: `${String(FIELD_COUNT)} FIELDS · NOTHING ELSE`,
  /** What the panel says when it has not read anything — with scripting off, or
   *  in the moment before hydration. It must not imply a measurement, and it
   *  must not read as an error: nothing is broken, the page simply has not been
   *  told anything. */
  pending:
    "These values are read by a small script in your browser. With scripting off nothing was read — and nothing was sent here to read it.",
} as const;

/** THE SHORT VERSION, and it comes before the prose because most people read
 *  only this. Every line is a claim held by a section below it. */
export const SHORT_VERSION: readonly ShortLine[] = [
  { yes: true, text: "Server logs, 14 days, with no address in the clear" },
  { yes: false, text: "No cookies" },
  { yes: false, text: "Nothing counts your visit" },
  { yes: true, text: "One local entry: the colour scheme you picked" },
  { yes: false, text: "No third-party embeds, no CDN, no tag manager" },
  { yes: true, text: "Contact form to my mailbox, and the stored copy is deleted after 30 days" },
  { yes: false, text: "No advertising, no profiling" },
  { yes: false, text: "Nothing sold, nothing shared" },
];

/** The prose, section by section, in SECTIONS' order. */
export const CONTENT: Readonly<Record<string, readonly Block[]>> = {
  "07.01": [
    {
      kind: "p",
      text: "Tim Seil, [ADDRESS], Luxembourg — reachable at contact@timseil.dev. There is no data protection officer: the scale of processing described below does not require one, and appointing one would not change any of it.",
    },
  ],

  "07.02": [
    {
      kind: "p",
      text: "Every request to this application is written to a log line, the way every web server on the internet does it. That record is what makes it possible to see that the site is up, to find out why a page returned an error, and to notice when somebody is looking for a way in.",
    },
    {
      kind: "table",
      head: ["FIELD", "WHY IT IS KEPT", "RETENTION"],
      rows: [
        ["Method and path", "To tell a working page from a broken one", "14 days"],
        ["Status code and size", "The same, and to spot a page that grew", "14 days"],
        ["Duration", "To find what is slow before you have to tell me", "14 days"],
        ["Request and trace id", "To follow one request through the system", "14 days"],
        ["A keyed hash of your address", "Abuse, and the rate limit in 07.06", "14 days"],
      ],
    },
    {
      kind: "p",
      // THE THREE FIELDS THE SHEET LISTED AND THE CODE DOES NOT WRITE. This is
      // the paragraph the whole correction exists for, and it is a better
      // paragraph than the one it replaces.
      text: "Three things a log usually holds are missing from this one. Your address is never written down as an address: what is stored is a keyed hash, the key is made fresh each time the process starts, and it is never written to disk — so a hash cannot be turned back into an address, and two visits either side of a restart cannot be tied to each other. The query string is never logged. And there is no user-agent or referrer column: your browser sends both on every request, as it does everywhere on the web, and this application does not keep them.",
    },
    {
      kind: "p",
      text: "Legal basis: legitimate interest in operating and securing the service, Art. 6(1)(f) GDPR. The lines are not combined with anything else, and nobody but me reads them.",
    },
  ],

  "07.03": [
    {
      kind: "p",
      // THE SECTION THAT LOST ITS SUBJECT, AND THE ANSWER IS BETTER THAN THE
      // QUESTION. The sheet wrote "I count page views with [ANALYTICS TOOL]".
      // There is no such tool on this machine and there never was.
      //
      // AND IT NAMES NO PRODUCT, which content.test.ts enforces by banning the
      // one the handbook wrongly claimed was running here. A list of tools this
      // site does not use would read as convincing and age badly; "nothing
      // counts you" is shorter, stronger and cannot be made false by somebody
      // else's release notes.
      text: "Nothing counts you. There is no analytics on this server: no counter, no pixel, no tag manager, no product bought for the purpose and nothing written for it either. I do not know how many people read this page. I find out that something was read when somebody writes to me about it.",
    },
    {
      kind: "p",
      text: "That is also why there is no consent banner. A banner is a question you are asked because the answer is worth something to the one asking; here there is nothing to ask about, and a banner would be a worse trade for you than the thing it pretends to be about.",
    },
    {
      kind: "note",
      text: "The log lines in 07.02 could in principle be counted. They are not: nothing aggregates them, no dashboard shows a visitor number, and after 14 days they are gone.",
    },
  ],

  "07.04": [
    {
      kind: "p",
      text: "One entry, in local storage, written only when you do something. No cookie, no identifier, and it is never sent back to the server — I cannot read it.",
    },
    {
      kind: "table",
      head: ["KEY", "WHAT IT HOLDS", "WHEN IT IS WRITTEN"],
      rows: [
        ["ts.theme", "Which of the seven colour schemes you picked", "When you pick one"],
      ],
    },
    {
      kind: "p",
      text: "Clearing your browser storage removes it. Without it the site still works: it follows whatever your system says about light and dark.",
    },
  ],

  "07.05": [
    {
      kind: "numbered",
      items: [
        "Fonts. Served from this domain. Your browser makes no request to a font provider.",
        "The contribution graph. Fetched server-side from the GitHub API and cached here. Your browser never talks to GitHub.",
        "No embeds. No third-party video, no comment widget, no social buttons, no tag manager.",
        "Images. From this server, not from a CDN. That costs a few milliseconds and keeps the page to a single origin.",
      ],
    },
    {
      kind: "p",
      // THE SCOPED SENTENCE. The sheet wrote "keeps the request path free of
      // third parties" flat out. This machine is reached through infrastructure
      // I do not administer, and a promise about somebody else's network is not
      // mine to make. Saying which half I can promise is the stronger sentence,
      // and it costs nothing but a clause.
      text: "You can check all four: open your browser's network panel on any page here and you will find exactly one origin. What I can promise is that scope — this application and the pages it serves reach for nothing and nobody else. What sits between your machine and this one on the way, from your own network onwards, is not mine to make promises about, and I would rather say so than write a sentence that reads better.",
    },
  ],

  "07.06": [
    {
      kind: "p",
      text: "Two ways in: the form on /contact, or plain mail to the address above. Both end in the same mailbox. The form exists because a mailto: link fails silently on any device with no mail client configured — it is convenience, not data collection.",
    },
    {
      kind: "table",
      head: ["WHAT THE FORM SENDS", "WHY", "WHERE IT IS KEPT"],
      rows: [
        ["Your name", "So I know who I am answering", "Database and mailbox"],
        ["Your email address", "The only way to reply", "Database and mailbox"],
        ["Your message", "The reason you wrote", "Database and mailbox"],
        ["The time you sent it", "Ordering, and spotting a double submission", "Database and mailbox"],
        [
          "A keyed hash of your address",
          `The rate limit: three messages per ${String(RATE_LIMIT_MINUTES)} minutes`,
          "Database",
        ],
        ["How long the form was open", "Telling a person from a bot", "Database"],
      ],
    },
    {
      kind: "p",
      // TWO CORRECTIONS IN ONE PARAGRAPH, AND THEY ARE THE REASON H12a WAS
      // BUILT BEFORE THIS PAGE COULD BE WRITTEN.
      text: "Two things here are the opposite of what a page like this usually says, so they are worth stating rather than burying. A row is written to a database: the message is stored before it is handed to the mail relay, so that a relay having a bad morning means a delayed reply instead of a lost message. And the measurement of how long the form was open is stored with it — of the two invisible fields the form sends, only the hidden one that must stay empty is thrown away on arrival.",
    },
    { kind: "p", text: retentionSentence() },
    {
      kind: "p",
      text: "The message is then handed to OVH, my mail provider at [OVH LEGAL ENTITY AND LOCATION], which delivers it and acts as a processor under Art. 28 GDPR. It then sits in my mailbox for as long as the conversation is useful to either of us. It is used to answer you and for nothing else: no newsletter, no list, no forwarding.",
    },
    {
      kind: "p",
      text: "Legal basis: Art. 6(1)(b) GDPR where your message is about work, otherwise legitimate interest under Art. 6(1)(f); the rate-limit record rests on Art. 6(1)(f). Filling the form is voluntary, and every field on it is one I need in order to answer — without an address there is no reply. If you would rather not use it, the address above works just as well.",
    },
  ],

  "07.07": [
    {
      kind: "p",
      text: "You can ask what is stored about you, ask for it to be corrected or deleted, object to the processing, or ask for a copy. Write to contact@timseil.dev or use the form. I answer within a month, and usually the same week.",
    },
    {
      kind: "p",
      // The sheet asked the reader to remember roughly when they visited, so
      // the log could be searched by time. With the hash keyed to a key that
      // does not survive a restart, that search cannot succeed — and saying so
      // is more useful than an offer that would go nowhere.
      text: "One practical note about the logs. They are keyed by a hash and a time, not by a person, and the key that made the hash is gone the next time the process starts — so there is nothing in them I could find for you even if we both wanted me to. That is what the hashing is for. What I can look up is the contact table, by the address you wrote from.",
    },
    {
      kind: "p",
      text: "If you think any of this is wrong, you can also complain to the CNPD — the Commission nationale pour la protection des données, Luxembourg.",
    },
  ],
};
