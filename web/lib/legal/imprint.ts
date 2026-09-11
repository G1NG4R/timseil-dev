// Every sentence on `/imprint`, as data.
//
// WHY IT IS DATA AND NOT MARKUP: `npm test` reads `lib/**` and cannot load a
// `.tsx`. content.ts makes the argument in full one file over, and this page
// needs it for the same reason — the assertions that matter here are about
// these strings rather than about their arrangement.
//
// FIVE SENTENCES OF THE SHEET ARE GONE OR CHANGED, and as with `/privacy` each
// one is a finding rather than a rewrite for taste. Artboard 1a is dated
// 16.08.2026:
//
//   1. "There is no CDN and no third party in the request path" — the flat
//      version of the sentence 07.05 had to scope in H12b. What this
//      application does is mine to promise; what sits in front of it on the
//      network is not. ADR 0076 §5, and the same clause lands in 06.02. The
//      mobile artboard abbreviates the section and drops the claim, which is
//      the one place the sheet and the build already agreed.
//   2. "Fragen dazu gern über das Formular auf /contact →" — German in an
//      English interface. The artboard slips into it three times: that sentence
//      and two of the brackets below it.
//   3. PHONE `[OPTIONAL — WEGLASSEN IST ZULÄSSIG]` — a bracket that says a
//      field may be left out is not a field. The row is gone; the mail address
//      and the postal address are both here, which is what the section is for.
//   4. `[HOSTING PROVIDER, LEGAL NAME AND ADDRESS]` and `[REGISTRAR]` — one
//      company, named once. CLAUDE.md says host, DNS and mail are OVH; the
//      legal entity and its seat are a fact only the operator has, so they stay
//      a bracket until they are filled.
//   5. `LAST REVISED [DATE]` in the footer strip — it is on the PAGE. The
//      Chrome sheet is the binding version of the footer and draws no such
//      line, and a revision date is a statement about this text rather than
//      about the site. ADR 0076 §6, and `/privacy` already works this way.
//
// THE BRACKETS HERE DO NOT SURVIVE THE MERGE. content.test.ts holds both pages
// against one rule — no legal page carries a bracket — and it is red until the
// three facts this repository cannot derive are in the text. That rule exists
// because H12b shipped two of them onto a public page.

import type { Block } from "./blocks.ts";
import { AUTHOR } from "../site.ts";

export const HERO = {
  eyebrow: "SYS.06 — IMPRINT",
  title: "Who runs this",
  lede: "A private site, operated by one person, on infrastructure that person administers. No company behind it, nothing sold on it.",
} as const;

/**
 * The page's own furniture words. Here and not in en.ts, for the reason
 * content.ts gives: this document is English by decision, and five keys in
 * three dictionaries would be five answers German and French owe for a text
 * they do not contain.
 */
export const LABELS = {
  rail: "ON THIS PAGE",
  notApplicable: "NOT APPLICABLE",
  /** The accessible name of the operator field list. The keys beside the values
   *  are labels for the rows; this says what the rows together are. */
  operator: "Operator details",
  /** Under the last section, in the `main` rather than in the footer. A DATE
   *  AND NOT A BUILD STAMP: `git` knows when this file changed, which is a
   *  different question from when somebody last read the page against the law
   *  and the code. Only a person can set it. */
  revised: "LAST REVISED 2026-09-12",
} as const;

/** One row of the operator list: a mono label and the value beside it. */
export interface Field {
  readonly key: string;
  readonly value: string;
}

/**
 * 06.01 as a field list rather than as prose, which is the sheet's form and the
 * right one: a name, an address and a capacity are values somebody has to be
 * able to find in two seconds, not sentences to read.
 *
 * NOT A SECOND `Readout`. That component exists to show values MEASURED in the
 * visitor's browser and its whole argument is that nothing in it was typed;
 * these five rows are typed, and a component that could render both would be
 * one that proves neither.
 *
 * THE NAME AND THE MAIL ADDRESS COME FROM lib/site.ts. `AUTHOR` is the same
 * constant `/contact` and the JSON-LD `Person` read. The chrome still writes the
 * address out by hand in three places — FooterLead, MobileMenu and
 * lib/about/content.ts — and this page did not make it four.
 */
export const OPERATOR: readonly Field[] = [
  { key: "NAME", value: AUTHOR.name },
  { key: "ADDRESS", value: "[ADDRESS], Luxembourg" },
  { key: "EMAIL", value: AUTHOR.email },
  {
    key: "CAPACITY",
    value: "Private individual — no registered business, no commercial activity",
  },
  { key: "CONTENT", value: `${AUTHOR.name}, address as above` },
];

/**
 * The four compulsory entries this site does not have.
 *
 * LISTED RATHER THAN OMITTED, and the sheet says why in one line: "damit ihr
 * Fehlen als Entscheidung lesbar ist, nicht als Versäumnis". A reader who came
 * looking for a VAT number finds out that there is none, instead of finding
 * nothing and being left to guess whether it was left out or left off.
 *
 * It is the same move 07.03 makes on the other page — the section whose subject
 * turned out not to exist keeps its number and answers "nobody" — and the
 * reason both are worth the space is that an absence stated is a claim somebody
 * can hold me to, while an absence tidied away is not.
 */
export const NOT_APPLICABLE = {
  items: [
    "Trade register entry",
    "VAT identification number",
    "Supervisory authority",
    "Consumer dispute resolution",
  ],
  note: "None of these apply to a private site with no commercial activity. They are listed so their absence reads as a decision rather than an oversight.",
} as const;

/**
 * The card that points at the other legal page. content.ts carries the mirror
 * image of it, and H12c is the phase where both targets exist — until it, the
 * sheet drew a `SEE ALSO` on each artboard and only one of the two pages was
 * built. ADR 0076 records that as a cost rather than a decision.
 */
export const SEE_ALSO = {
  label: "SEE ALSO",
  marker: "SYS.07 — PRIVACY",
  blurb: "What the server records, and for how long.",
  path: "/privacy",
} as const;

/** The prose, section by section, in IMPRINT_SECTIONS' order. */
export const CONTENT: Readonly<Record<string, readonly Block[]>> = {
  "06.01": [
    {
      kind: "p",
      text: "The postal address is there for anything that has to reach a person rather than a mailbox — a formal notice, a request that needs a paper trail. For everything else the mail address is faster, and it is the same person at the other end.",
    },
  ],

  "06.02": [
    {
      kind: "p",
      text: "The site runs in containers on a virtual private server rented from [HOSTING PROVIDER]. The provider supplies the hardware and the network; the machine itself is configured and maintained by me, which is also why the operations pages on this site can say what they say. The domain is registered through the same company.",
    },
    {
      kind: "p",
      // THE SCOPED SENTENCE, AND IT IS THE SAME CLAUSE 07.05 CARRIES. The sheet
      // wrote "no third party in the request path" flat out on both artboards.
      // This machine is reached through infrastructure I do not administer, and
      // a promise about somebody else's network is not mine to make. Saying
      // which half I can promise is the stronger sentence and costs a clause.
      text: "Everything the site serves — pages, fonts, images — comes from that one server, with no CDN in front of it. That is a promise about this application and the pages it serves, and you can check it in a second tab: the network panel shows exactly one origin. What sits between your machine and this one on the way is not mine to make promises about, and I would rather say so than write a sentence that reads better.",
    },
    {
      kind: "note",
      text: "Questions about any of this are welcome through the form on /contact.",
    },
  ],

  "06.03": [
    {
      kind: "p",
      text: "Everything published here is written by me and reflects my own view at the time of writing. The technical pieces are accounts of what I built and how it behaved, not advice — copy anything from here into your own production system at your own risk.",
    },
    {
      kind: "p",
      text: "External links point at material I do not control. I check a link when I place it and I cannot check it afterwards, so what appears at the far end of one later is not mine and not something I am answerable for.",
    },
  ],

  "06.04": [
    {
      kind: "p",
      text: "Text and images on this site belong to me unless they are marked otherwise. Quote a paragraph with a link back and we are fine; republishing a whole piece needs a short mail first, and the answer is usually yes.",
    },
    {
      kind: "p",
      text: "Source code linked from the project pages carries its own licence in its repository. That licence governs the code, and it does not govern this text.",
    },
  ],
};
