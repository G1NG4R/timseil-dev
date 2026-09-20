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
// WHICH MAKES THIS PAGE ENGLISH, and app/global-not-found.tsx already pays the
// same price for the same kind of reason ("THE SHELL IS ENGLISH, AND IT HAS TO
// BE"). Today that costs nothing a visitor can see: the German and French
// overlays are empty, so every page on this site already serves English text
// (lib/i18n/messages.ts, "KEINE HALBEN SEITEN"). When P6 fills a language it
// will cost something, and the backlog says so rather than this file pretending
// otherwise. A dictionary key that no reader could ever translate through would
// have been the dishonest version of the same limitation.
//
// WHAT IS NOT HERE, the split H10 made: `500`, `ERROR`, `DIGEST` and
// `REQUEST ID` are nomenclature (LANG.01) and lib/state/lines.ts composes the
// panel, because an error panel is a log and a log is the machine's voice.

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
