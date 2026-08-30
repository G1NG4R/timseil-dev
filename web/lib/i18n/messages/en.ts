// The English chrome, and the shape every other language has to fill.
//
// WHAT IS IN HERE AND WHAT IS NOT is the translation matrix's question, not a
// convenience: LANG.01 decides it per row and the rule is "Übersetzt wird
// Prosa, nicht Nomenklatur."
//
// Prose lives here. Nomenclature stays where it is rendered, because
// translating it would make it unsearchable — the sheet names the set:
// `SYS.INIT`, `ONLINE`, `BUILD`, `p95`, `sha`, `Go`, `Docker`, and the ISO
// dates. `[SOON]` stays too: design-correction #6 unified it to one token
// across all three languages, so it is a placeholder, not a word.
//
// The pages are not here either, and will not be until they exist. Six of the
// seven routes are `[SOON]` stubs; stage H fills them and brings its own keys.

export const en = {
  skip: "SKIP TO CONTENT",

  // The four nav labels. lib/chrome.ts holds the same four as the sheet's
  // CHR.01 table with their routes; messages.test.ts refuses the two of them
  // drifting apart. Transcribed rather than imported, on purpose — chrome.ts
  // says why: "a table the implementation reads is not an oracle, it is a
  // second copy of the answer."
  navWork: "WORK",
  navLog: "LOG",
  navAbout: "ABOUT",
  navContact: "CONTACT",

  langAria: "Language",
  langLabel: "LANGUAGE",
  langEsc: "ESC",
  langNote: "THE URL DECIDES · NO REDIRECT",

  menuAria: "Menu and language",
  menuCloseAria: "Close menu",
  menuClose: "CLOSE",

  channel: "OPEN A CHANNEL",
  respond: "USUALLY UNDER 24 H",

  uptime: "UPTIME",
  cvHint: "CV → TERMINAL ON / : cv",
  themeLabel: "THEME",
  themeAria: "Colour scheme",
  altLabel: "ALT",

  // The state words, and the one that is missing from this list.
  //
  // STATE.05 settles the rule these six follow: "LABEL WIRD ÜBERSETZT,
  // DATENWERT NICHT — die Anzeige heißt auf Deutsch GEPLANT, der Wert in der
  // API bleibt `queued`." So the contract keeps saying `queued` and `degraded`
  // for ever, and only what a reader sees moves.
  //
  // ONLINE IS NOT HERE, and that is the other sheet's doing: LANG.01 names it
  // in the set that stays English beside SYS.INIT, BUILD, Go and Docker. Nor is
  // `— NO DATA`, which is a placeholder token like `[SOON]` — one string across
  // all three languages since design-correction #6.
  //
  // lib/state/words.ts holds the same six English words as its fallback labels,
  // and messages.test.ts refuses the two copies drifting apart.
  stateLive: "LIVE",
  stateDegraded: "DEGRADED",
  stateOffline: "OFFLINE",
  stateEmpty: "EMPTY",
  stateQueued: "QUEUED",
  stateAvailable: "AVAILABLE",

  // H1 · case study. The rail's keys and the two section names, plus the two
  // tile labels that are ordinary words rather than identifiers.
  //
  // WHAT H1 DID NOT ADD IS THE INTERESTING HALF, and every omission is LANG.01's
  // set: `SPEC` is a section label like `SYS`, `STACK` names technologies and a
  // German page would still read "Go · Docker", `P95` is in the sheet's list
  // word for word, and `DEPLOY` is the verb this repository uses in its own
  // pipeline. `UPTIME` already had a key — it is a heading over a number, and
  // the meta bar has translated it since G5.
  csRole: "ROLE",
  csYear: "YEAR",
  csStatus: "STATUS",
  csSource: "SOURCE",
  csProblem: "PROBLEM",
  csConstraints: "CONSTRAINTS",
  csErrorRate: "ERROR RATE",
  csIncidents: "INCIDENTS",

  based: "BASED IN LUXEMBOURG",
  privacy: "PRIVACY",
  imprint: "IMPRINT",
} as const;

/** Every key English has, with a plain string for a value. A language that
 *  offers a key English does not have is a compile error, and a lookup for a
 *  key nobody wrote is one too — which is the reason these are TypeScript
 *  modules and not JSON files. */
export type Messages = Record<keyof typeof en, string>;
