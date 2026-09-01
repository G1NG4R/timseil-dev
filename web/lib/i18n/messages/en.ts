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

  // H4 · the three words a TRACK can be that a SYSTEM cannot. They follow
  // STATE.05's rule with the six above and are named apart from them on
  // purpose: `TRACK_MARKS` is a second table because it describes a second
  // scale, and two prefixes keep a reader from reaching for the wrong one.
  //
  // THERE IS NO `trackQueued`. QUEUED means the same thing at both scales —
  // planned, nothing to point at — so the track table reads `stateQueued`
  // rather than carrying a fourth key with an identical value. One word, one
  // key, one place to translate it.
  trackCore: "CORE",
  trackApplied: "APPLIED",
  trackLearning: "LEARNING",

  // The scale under the log. These four are the rule `v_track_states` applies,
  // written for a reader — so they are prose in the fullest sense on this page
  // and the only part of SYS.01 a translation would really have to think about.
  //
  // THEY DESCRIBE EVIDENCE, NOT EFFORT. "shipped at least once" is a fact about
  // a system; "I know this well" would be a fact about nobody's opinion, which
  // is the claim this whole section is built to replace.
  scaleCore: "running in several systems",
  scaleApplied: "shipped at least once",
  scaleLearning: "in progress",
  scaleQueued: "planned",

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

  // H2a · the two sections under the problem, and the words inside them.
  //
  // THE SAME OMISSIONS AS H1's, by the same rule. There is no key for the two
  // section metas the sheet draws — "HOP LATENCIES ARE PLACEHOLDERS" and
  // "CAPTURES ARE PLACEHOLDERS" — because neither placeholder is built and a
  // meta that described the drawing rather than the page would be nomenclature
  // for something absent. `.01 PROBLEM` carries no meta either.
  //
  // `WHY THIS ONE` is the Template's column head, not `Case Study 02`'s
  // "REJECTED — AND WHAT IT COSTS". Which sheet wins was settled in ADR 0052.
  csArchitecture: "ARCHITECTURE",
  csBuild: "BUILD",
  csSideLanes: "SIDE LANES",
  csDecisions: "DECISIONS",
  csDecision: "DECISION",
  csAlternative: "ALTERNATIVE",
  csWhyThisOne: "WHY THIS ONE",
  csPhases: "PHASES",

  // H2b · the last two sections, the grid legend, and the words a notch opens.
  //
  // THE LEGEND IS FOUR WORDS AND ONLY TWO ARE NEW. `DEGRADED` is already a state
  // word above and means the same thing about a day that it means about a
  // service, so it is read from there rather than written twice. `— NO DATA` is
  // the placeholder token and never a key. That leaves `NO INCIDENT`, which is
  // the sheet's own word for a day where nothing happened — the state vocabulary
  // has no word for it, and lib/state/derive.ts spends a paragraph on why —
  // and `OUTAGE`, which is the day, not the system: OFFLINE is what a system is,
  // an outage is something that happened to it.
  //
  // NO KEY FOR THE PIPELINE META. The sheet captions the row "STAGE TIMINGS ARE
  // PLACEHOLDERS" and there are no stage timings to place — same omission as
  // H2a's two, by the same rule.
  //
  // `DAYS` AND `WEEKS` ARE LOWERCASE HERE ON PURPOSE. They stand next to a
  // number the page counted, and the stylesheet uppercases the line; a string
  // that arrived shouting would be a second opinion about the same rule.
  csOperations: "OPERATIONS",
  csResult: "RESULT",
  csPushToLive: "PUSH TO LIVE",
  csObservability: "OBSERVABILITY",
  csOperation: "OPERATION",
  csDays: "days",
  csWeeks: "weeks",
  csOneCellOneDay: "ONE CELL IS ONE DAY",
  csNoIncident: "NO INCIDENT",
  csOutage: "OUTAGE",
  csIncidentLog: "INCIDENT LOG",
  csCause: "CAUSE",
  csFix: "FIX",
  csPostMortem: "POST-MORTEM",
  csNoIncidentsHead: "NO INCIDENTS IN THIS WINDOW",
  csNoIncidentsWhy:
    "Not a clean record — a short one. The grid above says how much of the " +
    "window was measured, and an incident here would carry its cause, its fix " +
    "and the entry that explains it.",
  csWhatHolds: "WHAT HOLDS",
  csWhatIdChange: "WHAT I WOULD CHANGE",
  csNextSystem: "NEXT SYSTEM",

  // H3 · the homepage: the hero's sentences and the four reasons a section is
  // still empty.
  //
  // WHAT IS NOT HERE IS AGAIN THE INTERESTING HALF, and every omission is
  // LANG.01's set. `SYS.INIT` is named in it word for word. `SYS.01` to
  // `SYS.04` and the four section names are nomenclature — a German homepage
  // still reads SYS.02 SELECTED WORK, and they live in lib/home/sections.ts
  // where a test can hold their order. `Go · TypeScript · Docker · Postgres`
  // names technologies, exactly the case the sheet uses to state the rule.
  // `tim@vps: ~ — ssh` is a shell prompt, not a sentence. `[SOON]` is a
  // placeholder token and has one definition in lib/state/words.ts.
  //
  // `AVAILABLE` is absent too, and for a third reason: it is already a state
  // word (`stateAvailable`), and a second key for one word is how the two
  // start disagreeing about what it means.
  //
  // ONE COPY OF EVERY SENTENCE. The mobile artboard writes a shorter eyebrow
  // ("BACKEND & DEVOPS · LUX") and breaks the subline over two lines. We carry
  // the full one at both widths: H2a already found what a second, shorter set
  // of words costs — it exists only to be forgotten when the first is
  // corrected. The abbreviation is recorded as a sheet divergence instead.
  homeEyebrow: "BACKEND & DEVOPS ENGINEER · LUXEMBOURG",
  homeHeadline: "I build the systems behind the screen.",
  homeTagline: "self-taught, self-hosted.",
  homeAvailability: "Open to backend and infrastructure work",

  // The terminal frame. It says what it is instead of standing there greyed
  // out — STATE.05, and the reason it has no input at all until stage J.
  homeTerminalWhy:
    "The command register belongs to a later stage. This frame reports what " +
    "the page can already ask the API, and takes no input until it can answer " +
    "one.",

  // TWO SHELLS, NOT FOUR. `homeSys01Why` stood here until H4 and `homeSys02Why`
  // until H5a. Both were deleted rather than kept: the first said the training
  // log's rows "arrive with the endpoint that derives them" and the second said
  // the system list "stays empty until the API answers", and both endpoints have
  // arrived. A sentence that explains an absence which has ended is not harmless
  // — it compiles, it reads as current, and it is the same class of quietly-false
  // line as #284.
  //
  // What replaced each is a `homeSys0NDown` entry further on: a different claim
  // about a different emptiness. Those are about the api not answering now, not
  // about a component that does not exist yet.
  //
  // `homeSys03Why` JOINED THEM IN H5b, for the same reason and with one more
  // thing to say for itself: its sentence was the specification. "Two blocks,
  // each naming its own source. Neither is drawn before its source has answered"
  // is why SYS.03 has two Suspense boundaries rather than one, why its head sits
  // outside both, and why the calendar and the strip each carry a source line.
  // The section was built to the sentence, and then the sentence was deleted.
  //
  // The one left says WHAT is missing and WHY it is missing rather than being
  // greyed out, which is what EmptyState requires of its caller and what
  // STATE.05 requires of the page.
  //
  // IT CARRIES NO COUNT. The sheet writes `LATEST 03` into the SYS.04 meta; that
  // is a number its phase has not been given, and a sentence that mentioned it
  // would be an invented figure on a site built to argue against them. SYS.01,
  // SYS.02 and SYS.03 now carry their counts because the answers carry them —
  // `trainingMeta`, `systemsMeta` and `contributionsMeta` in lib/api/.
  homeSys04Why:
    "The running part of this site rather than the proving part. Entries " +
    "appear once the renderer that reads them exists.",

  // SYS.01 when the api does not answer. A DIFFERENT SENTENCE FROM THE THREE
  // ABOVE, and the difference is the whole state language: there a component
  // does not exist yet, here one exists and its source is unreachable. Saying
  // "coming in a later phase" about a live section that is briefly down would
  // be a lie with a deploy-shaped cause.
  //
  // It names the endpoint rather than apologising, because the endpoint is the
  // answer to "why is this empty" — and because a reader who can see
  // /api/training in the section head can check the claim.
  homeSys01Down:
    "The log is read from /api/training, and that endpoint did not answer this " +
    "request. Nothing is shown rather than a list assembled from somewhere else.",

  // SYS.02 when the api does not answer, and a SECOND SENTENCE rather than a
  // shared one. It is a different endpoint, and the whole point of naming the
  // endpoint is that a reader can check the claim — "the api did not answer"
  // over a section whose head says /api/systems would be the vaguer of two
  // available truths.
  homeSys02Down:
    "The list is read from /api/systems, and that endpoint did not answer this " +
    "request. No system is shown rather than a list written by hand.",

  // SYS.03's two blocks when their endpoints do not answer, and TWO SENTENCES
  // rather than one, which is the third time this file makes that call. The
  // section reads two endpoints; a shared sentence over either empty block would
  // name neither, and naming the endpoint is the whole point — a reader who can
  // see it in the caption can check the claim.
  //
  // THE CALENDAR'S SENTENCE HAS A SECOND HALF THE OTHERS DO NOT NEED. Its
  // upstream is not ours: the api answers with the last good calendar and its
  // age for as long as it has one, so an empty graph is not "GitHub is slow" —
  // it is "there has never been an answer to keep". Saying that is the
  // difference between an outage and a cold start, and only one of them is
  // about us.
  homeUplinkGraphDown:
    "The calendar is read from /api/contributions, which serves the last good " +
    "answer with its age whenever it has one. Nothing is shown because there " +
    "has not been one yet.",

  homeUplinkStripDown:
    "The strip is read from /api/systems, and that endpoint did not answer this " +
    "request. No day is drawn rather than a row of cells that measured nothing.",

  /** The accessible name of a row's arrow. The arrow itself is one glyph, and a
   *  link whose whole text is `→` tells a screen-reader user nothing about which
   *  of two rows it belongs to. */
  homeSystemsExit: "Read the case study",

  based: "BASED IN LUXEMBOURG",
  privacy: "PRIVACY",
  imprint: "IMPRINT",
} as const;

/** Every key English has, with a plain string for a value. A language that
 *  offers a key English does not have is a compile error, and a lookup for a
 *  key nobody wrote is one too — which is the reason these are TypeScript
 *  modules and not JSON files. */
export type Messages = Record<keyof typeof en, string>;
