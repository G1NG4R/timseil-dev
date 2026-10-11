// The sentences the error boundary prints.
//
// WHY THEY ARE NOT IN THE DICTIONARY, and it is the bundle rather than a
// preference. ContactForm.tsx states the rule this repository works by: the
// words are "passed in rather than imported", because importing
// lib/i18n/messages/en.ts into a client component "would ship the whole
// dictionary — every page's". An error boundary has nobody to pass them in:
// Next renders it with two props of its own, `error` and `retry`, and there is
// no server parent between it and the router.
//
// So the choice was between shipping 806 lines of dictionary onto every route
// in the app, or holding this page's five sentences where only this page reads
// them. This is the second one, and it costs about 400 bytes.
//
// THAT MADE THIS PAGE ENGLISH UNTIL U8a, and the note it carried said what the
// bill would be: "When P6 fills a language it will cost something, and the
// backlog says so rather than this file pretending otherwise." U8 filled German
// and the bill arrived. It is paid here rather than in the dictionary — the
// five sentences get a second language the same way the About page's prose
// does, as a bundle, and `lib/i18n/bundle.ts` exists precisely so that a client
// component can resolve one without importing a catalogue.
//
// THIS PAGE RESOLVES ON ITS OWN, AND THAT IS THE ONE SEAM WORTH KNOWING ABOUT.
// Every server-rendered page asks `languageComplete`, which reads the catalogue
// AND every registered bundle; this one can only ask `resolveContent` about the
// bundle in front of it. The two could disagree — a German that is complete
// here and incomplete there — and what keeps them together is not code but a
// test: complete.test.ts asserts `languageComplete("de")` is true, so a bundle
// that lost its German is a red suite rather than a page in two languages. The
// day somebody takes a bundle out of `BUNDLES` to save bytes, this is the file
// that goes quietly wrong, and the addendum to ADR 0083 says so.
//
// WHAT IS NOT HERE, the split H10 made: `500`, `ERROR`, `DIGEST` and
// `REQUEST ID` are nomenclature (LANG.01) and lib/state/lines.ts composes the
// panel, because an error panel is a log and a log is the machine's voice.

import { type ContentBundle, type ResolvedContent, resolveContent } from "../i18n/bundle.ts";
import type { Locale } from "../i18n/routes.ts";

import { ERROR_WORDS_DE } from "./words.de.ts";

export const ERROR_WORDS = {
  // THE LEDE SAYS WHERE THE DAMAGE STOPS, and it may say that because it was
  // measured rather than hoped: a failure on this site lands inside a Suspense
  // hole, the shell around it has already been sent, and the header and footer
  // survive it. "Something went wrong" would tell a visitor less than the page
  // in front of them is already showing.
  lede:
    "A section of this page failed while rendering. Everything around it is " +
    "intact — what follows is the part that did not arrive.",

  // The honest limit of the identifier, on the page rather than only in the
  // ADR. The digest is a hash of the message and the stack, so it names the
  // FAULT and not the visit.
  digestNote:
    "The digest names the fault, not this visit — two people who hit the same " +
    "one read the same identifier.",

  // Invariant 1, applied to identifiers. The request id and the trace id exist
  // and are in the log; this component cannot see them, so it says so instead
  // of printing something that would lead to the wrong line.
  correlationNote:
    "The request and trace ids are in the server log. This page renders in " +
    "your browser, which cannot read its own response headers.",

  // Verbs, so they are strings rather than nomenclature — the same test that
  // made REPLAY GLITCH a message and left STATUS 404 out of one.
  retry: "TRY AGAIN",
  home: "RETURN TO ROOT",
} as const;

/** The five sentences, as a shape a second language has to fill. */
export type ErrorWords = { readonly [K in keyof typeof ERROR_WORDS]: string };

/** The error page's words, per language. Registered in lib/i18n/complete.ts. */
export const ERRORS: ContentBundle<ErrorWords> = { en: ERROR_WORDS, de: ERROR_WORDS_DE };

/**
 * The words for a route, and the language they came back in.
 *
 * THE SECOND HALF IS WHAT THE BLOCK PUTS IN ITS `lang`. On `/fr` these are
 * English sentences inside a French document, and an attribute is the only
 * honest way to say so — the same one `getDictionary` hangs on `<main>`, set
 * here by the one page that has no server parent to set it.
 */
export function errorWordsFor(locale: Locale): ResolvedContent<ErrorWords> {
  return resolveContent(ERRORS, locale);
}
