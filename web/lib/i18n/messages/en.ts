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
  // lib/state/words.ts holds the same English words as its fallback labels,
  // and messages.test.ts refuses the two copies drifting apart.
  stateLive: "LIVE",
  // H6 · #289. The seventh key here and the eighth word there, because ONLINE
  // and `— NO DATA` are the two the paragraph above keeps out of this file.
  // One word for one state at every size: the sheet writes `IN BUILD` in the
  // stat tile and `BUILD` in the chip and the legend, and a control that says
  // one thing while the row beside it says another is the drift this whole
  // block exists to stop.
  stateInBuild: "IN BUILD",
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
  // THE KEY LOST ITS `home` PREFIX IN H7, AND THAT IS THE POINT OF THE RENAME.
  // The About sheet draws this sentence too, word for word, beside the same dot
  // and the same state word. H2a already measured what a second, shorter set of
  // words costs — it exists only to be forgotten when the first is corrected —
  // so there is one sentence and it is no longer named after the first page
  // that happened to print it. ADR 0055 is the same move on a class name.
  availability: "Open to backend and infrastructure work",

  // The terminal frame. It says what it is instead of standing there greyed
  // out — STATE.05, and the reason it has no input at all until stage J.
  homeTerminalWhy:
    "The command register belongs to a later stage. This frame reports what " +
    "the page can already ask the API, and takes no input until it can answer " +
    "one.",

  // FOUR SHELLS, AND NOW NONE. `homeSys01Why` stood here until H4,
  // `homeSys02Why` until H5a, `homeSys03Why` until H5b, and `homeSys04Why` until
  // this phase. All four were deleted rather than kept, and the argument has not
  // changed once: a sentence that explains an absence which has ended is not
  // harmless — it compiles, it reads as current, and it is the same class of
  // quietly-false line as #284.
  //
  // WHAT THE LAST ONE SAID IS WORTH ONE LINE, because it was wrong in a way the
  // phase had to decide about rather than merely outgrow. "Entries appear once
  // the renderer that reads them exists" pointed at H9 — and H5c shows the
  // entries WITHOUT the renderer, as rows that name a post rather than link to
  // one. The sentence was a prediction about how this would be built, and it
  // predicted the other option; ADR 0062 records which was taken and why.
  //
  // What replaced each is a `homeSys0NDown` entry further on: a different claim
  // about a different emptiness. Those are about a source not answering now, not
  // about a component that does not exist yet.
  //
  // AND SYS.04 NEEDED A SECOND ONE. It is the only section whose source is this
  // repository rather than an endpoint, so its two emptinesses are not the two
  // the others have — see `homeSys04Empty` and `homeSys04Down` below.

  // SYS.01 when the api does not answer. A DIFFERENT SENTENCE FROM THE FOUR THE
  // BLOCK ABOVE BURIED, and the difference is the whole state language: those
  // said a component did not exist yet, these say one exists and its source is
  // unreachable. Saying "coming in a later phase" about a live section that is
  // briefly down would be a lie with a deploy-shaped cause.
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

  // SYS.04's two emptinesses, and they are the first pair on this page that is
  // not "the api answered" against "it did not". The log's source is a directory
  // in this repository, so the two states are: it was read and holds nothing,
  // and it could not be read at all.
  //
  // `homeSys04Empty` IS REACHABLE ONLY IN THE GALLERY TODAY, and it is written
  // for the day it is not — a repository with no post is the state this log
  // started in, and it says the honest thing about it rather than apologising:
  // the first entry arrives when something has happened that is worth the words.
  homeSys04Empty:
    "No entry has been written yet. The log starts empty and fills when " +
    "something happens here that is worth writing down, not before.",

  // AND THIS ONE NAMES A FAILURE THAT IS OURS, which is why it does not read
  // like the three above it. The others describe an endpoint that did not
  // answer — a thing that can happen to a healthy deploy. A missing directory
  // cannot: the posts are files in the image, so this sentence appears only in a
  // build that shipped without its own content, and it says so.
  homeSys04Down:
    "The entries are read from content/posts in this repository, and that " +
    "directory could not be read in this build. Nothing is shown rather than a " +
    "list assembled from somewhere else.",

  /** The accessible name of a row's arrow. The arrow itself is one glyph, and a
   *  link whose whole text is `→` tells a screen-reader user nothing about which
   *  of two rows it belongs to. */
  homeSystemsExit: "Read the case study",

  // The foot of the homepage, and the only prose on this page about the person
  // rather than the machine. THE SHEET DRAWS A BRIEF, NOT A TEXT — "[BIO — 2–3
  // lines: self-taught systems engineer in Luxembourg; what he runs, how it is
  // hosted, why it is built this way]" — so this is written to that brief, and
  // every clause in it is something the repository can be held to: one host
  // (ADR 0008), GitHub Actions as the only thing that builds and deploys
  // (compose.yaml carries no `build:`), and the rule at the top of CLAUDE.md.
  homeBio:
    "Self-taught backend and infrastructure engineer in Luxembourg. This site " +
    "and its API run on one VPS I administer myself, built and deployed by " +
    "GitHub Actions. Every claim on it is bound to a system you can check.",

  // ── H6 · /work ──────────────────────────────────────────────────────────
  //
  // WHAT IS HERE AND WHAT IS NOT, by LANG.01's rule rather than by feel. The
  // eyebrow `SYS.02 — SYSTEMS`, the stat-rail label `SYSTEMS`, the counter's
  // `SHOWING nn OF nn · FIGURES FROM /api/systems` and the three state words
  // are all absent: the first three are nomenclature, which stays English and
  // stays where it is rendered — `systemsMeta` already writes `SYSTEMS` inline
  // one page over — and the state words come from `MARKS`, which is the one
  // table allowed to spell them.
  workTitle: "Selected work",

  // THE SHEET'S DECK, ONE SET OF WORDS. Its phone artboard drops the final
  // clause ("— nothing here is a screenshot of an idea") and shortens the deck
  // to two sentences, which is #293 for the fifth time: a second, shorter copy
  // exists only to be forgotten when the first is corrected. The full sentence
  // is what ships at both widths.
  workDeck:
    "Every system below runs, ran, or is specified to run. Status and " +
    "operating figures come from the same API that serves this page — nothing " +
    "here is a screenshot of an idea.",

  // The list when /api/systems does not answer. `homeSys02Down` says the same
  // thing about the same endpoint on the homepage and is deliberately NOT
  // reused: that one explains a section of a page that has three others, this
  // one explains a page that has nothing else on it.
  workListDown:
    "The list is read from /api/systems, and that endpoint did not answer this " +
    "request. No system is shown rather than a list written by hand.",

  // The list when /api/systems answered and listed nothing. NOT `workListDown`,
  // and H6b split the two because one component was saying both: a body of
  // `{"systems": []}` is a measurement — the rail reads `00 SYSTEMS` and the
  // counter reads `SHOWING 00 OF 00` — while "the endpoint did not answer" is a
  // claim about the api that nothing observed. Three statements about one
  // answer, and the panel was the one that was wrong.
  workListNone:
    "The API answered and listed no systems. This is the answer, not a failure " +
    "to reach it.",

  // ── H6b · the two filter rows ───────────────────────────────────────────
  //
  // FOUR WORDS ARE NOT HERE, and LANG.01 is why: `STATUS`, `STACK`, `ALL` and
  // `ANY` are nomenclature on a control, the class the sheet keeps English
  // beside SYS.INIT and BUILD, and `WorkHeader` already writes `SYSTEMS` inline
  // one component over for the same reason. The state words on the status chips
  // are not here either — they come from `MARKS`, the one table allowed to
  // spell them, so a chip can never say BUILD while the row beside it says
  // IN BUILD (ADR 0063).
  //
  // NOR IS THERE AN ACCESSIBLE NAME FOR EITHER ROW. `STATUS` and `STACK` are
  // whole words standing on the page, so each chip group is named by the label
  // beside it through `aria-labelledby` — one sentence for every reader instead
  // of a second one only some of them get.

  // The panel for a combination nothing matches. The sheet draws one line —
  // "no systems match this combination — reset filters" — and State Language
  // requires more of an empty state than that: "Leer heißt: erklären, warum
  // leer, und einen Weg zurück anbieten", and sharper, "ein toter Zustand ohne
  // Begründung ist ein Bug". `EmptyState` makes the reason mandatory, so the
  // sheet's sentence becomes the heading and the reason says what the reader
  // cannot otherwise know: that the two rows narrow TOGETHER, and that nothing
  // is missing from the list itself.
  workNoMatchHead: "NO SYSTEMS MATCH THIS COMBINATION",
  workNoMatchReason:
    "The two rows narrow together, and no system carries both of these. " +
    "Nothing is missing from the list — drop one of them to see it again.",
  workReset: "RESET FILTERS",

  // THE LEGEND, AS FOUR PROSE FRAGMENTS AND NOT ONE SENTENCE. The three words
  // it defines come from `MARKS` — the component puts them in front of these —
  // so a state cannot be spelled one way in a row and another in the paragraph
  // that explains the row. The sheet's own note is the reason the block exists
  // at all: "Statuswörter sind nur so viel wert wie ihre Definition."
  workLegendKicker: "HOW TO READ THIS",
  workLegendLive: "means a public address and a health check.",
  workLegendInBuild: "means it runs, but not yet for anyone else.",
  workLegendQueued: "means specified, not written.",
  workLegendRule: "Nothing is promoted without the figure to back it.",
  workTrainingLog: "TRAINING LOG",

  // ROUTES GAP #06, AND THE SHEET CLOSED IT WITH THE WRONG TWO THINGS. The
  // Routes matrix marks `/work → /contact` as a content cross-reference that
  // EXISTS; the Work Index draws a sentence in that place that is German and
  // carries no link. Both cannot be right. What the gap asks for is "ein Satz
  // mit Link", so this is that sentence in English, and the component gives it
  // the link the drawing forgot.
  workContact:
    "Nothing here quite what you are looking for? I am happy to walk you " +
    "through how one of these systems is built.",

  // ── H7 · /about ─────────────────────────────────────────────────────────
  //
  // WHAT IS NOT HERE, and it is most of the sheet. `SYS.05`, `OPERATOR`,
  // `TRAJECTORY`, `WHAT I RUN`, `HOW I WORK`, `OFF-SYSTEM`, `NAME`, `ROLE`,
  // `BASE`, `PRIMARY`, `ROUTE`, `MAIL`, `EDGE`, `SERVICES`, `PIPELINE` and
  // `WATCH` are nomenclature — LANG.01, "Übersetzt wird Prosa, nicht
  // Nomenklatur" — and a German About page would still read SYS.05.02 WHAT I
  // RUN. So they live in lib/about/, where a test can hold their order, and the
  // prose lives here.
  //
  // `AVAILABLE` IS ABSENT FOR THE THIRD REASON THE HOMEPAGE BLOCK GIVES: it is
  // already a state word (`stateAvailable`), and a second key for one word is
  // how the two start disagreeing about what it means. The sentence beside it
  // is `availability`, one block up, and it is the SAME sentence on both pages
  // rather than a second copy — see the note there.
  aboutHeadline: "I learn systems by running them.",

  // ONE PARAGRAPH WHERE THE SHEET DRAWS TWO. The second is
  // "[BIO — 2–3 Sätze in deiner Stimme: …]", a bracket asking for a voice, and
  // ADR 0055 refused two image placeholders on the case study with the argument
  // that carries here unchanged. The first paragraph is the sheet's own English
  // and says the whole thing; a page is not improved by a second one that says
  // nothing.
  aboutLede:
    "Backend and DevOps engineer in Luxembourg, working in Go and TypeScript. " +
    "Self-taught, from systems fundamentals through to deployment — which in " +
    "practice means every service I describe here is one I also have to keep " +
    "running.",

  // ── H7b · the trajectory rail ───────────────────────────────────────────
  //
  // `PICKED UP` and `SHIPPED` are the sheet's own labels and they are
  // nomenclature, so they are not here — TrajectoryRail takes them as props
  // already resolved, for the reason WorkFilters gives about `STATUS` and
  // `STACK`: they name a group on the screen, and a second table for them is
  // how two spellings of one word start.
  //
  // THIS IS THE SENTENCE FIVE OF SIX STATIONS PRINT, and it is one sentence
  // rather than five because the absence has one cause. A station with no prose
  // is not a station that failed to load; it is one whose paragraph is written
  // in the content phase, by me, and the panel says exactly that.
  aboutStationSoon:
    "This station is a place on the path, not a paragraph yet — the words are " +
    "written in the content phase rather than guessed here.",

  // AND THIS ONE ADMITS A DIFFERENT KIND OF ABSENCE. The section above is owed
  // by a phase; this one is owed by me. The sheet draws a bracketed German
  // paragraph and three rows of which two are brackets and the third names a
  // system that does not exist — so there is nothing to render, and the honest
  // sentence says whose turn it is.
  aboutOffSystemSoon:
    "The one line on this page that is not about a system is the one line " +
    "nobody can derive. It is written in the content phase, not guessed here.",

  // The closing strip of SYS.05.02. It is the whole argument of the section in
  // two sentences, and the link beside it is the evidence.
  aboutStackNote:
    "The page you are reading is served by that stack. If it is slow, that is " +
    "on me.",
  aboutCaseStudy: "READ THE CASE STUDY",

  // ── H8 · /contact ───────────────────────────────────────────────────────
  //
  // WHAT IS NOT HERE: `SYS.06`, `CHANNEL`, `NAME`, `E-MAIL`, `MESSAGE`, `TX`,
  // `SEND`, `POST /api/contact` and the three status numbers. All nomenclature
  // — LANG.01 — and a German contact page would still read SYS.06 and still
  // print `202`. The field labels live in lib/contact/fields.ts, where a test
  // holds their order against the one the api reports errors in.
  //
  // AND ONE WORD IS ABSENT ON PURPOSE: "delivered". ADR 0021 §1 has the handler
  // try to send ONCE and hand anything it could not send to a dispatcher, so a
  // `202` means "accepted for delivery" and nothing stronger. Every sentence
  // below is written so that it stays true if the message leaves an hour later
  // — and so that it does not become a lie if it never leaves at all.
  contactHeadline: "Open a channel.",

  // The sheet's paragraph, in English, minus one clause. It draws "kein
  // Mailprogramm, kein Umweg" — no mail client, no detour — which is the
  // argument for the form and is true. What follows it in the sheet is the
  // address, and the address is the fallback rather than a footnote: without
  // JavaScript there is no form on this page, and a visitor who reads that
  // sentence has somewhere to go.
  contactLede:
    "This form posts straight to my mailbox — no mail client, no detour. If " +
    "you would rather write from your own, the address is below and it reaches " +
    "the same place.",

  // Under the address field before anything has been typed. The sheet's
  // "wohin soll die antwort?" — a question, because the field is not asking who
  // you are, it is asking where the reply goes. It becomes the `Reply-To`
  // header and nothing else.
  contactEmailHint: "where should the reply go?",

  // The one thing this page stores that a visitor cannot see, said plainly and
  // BEFORE they send rather than in a policy they will not open.
  //
  // IT IS HERE AND NOT ON /privacy BECAUSE /privacy IS A STUB UNTIL H12. A form
  // that collects a name, an address and a message while the only page that
  // could explain it says `PRIVACY [SOON]` would be this site breaking its own
  // rule on the one page where it is not a style question. H12 writes the full
  // text and L7 automates the retention; this sentence is what is true today,
  // and it is true whatever those two decide.
  contactNotice:
    "What is stored: your name, address, message, the time, and a hashed form " +
    "of your IP address for the rate limit. The message goes to my mailbox and " +
    "nowhere else. No tracking, no cookie, no third party.",

  // While the request is out. Not "sending…" with a spinner — the request is on
  // the right, being written, and the sheet is explicit that the trace is the
  // progress indicator.
  contactSending: "Sending. The request on the right is the one in flight.",

  // The `202`. ACCEPTED, NOT DELIVERED, and the second sentence says why the
  // distinction is not pedantry: the id is quotable, and it is quotable
  // precisely because it names a row that exists whether or not the mail has
  // left yet.
  contactAccepted:
    "Accepted. The id below is the receipt — it names this message, and you can " +
    "quote it back to me. Your text is still in the field; nothing was cleared.",

  // The `400`. The fields carry their own reasons, so this line says only what
  // happened and where to look.
  contactInvalid: "Nothing was sent. The fields below say what to change.",

  // A `400` THAT NAMES NO FIELD, which is a real answer and not a theoretical
  // one: `writeError` in api/internal/contact/contact.go sends exactly this for
  // a refused Origin, with `invalidParams` empty on purpose — "ADR 0009 says
  // that array is one entry per rejected *field*, and an Origin is not one".
  // The visitor typed nothing wrong, and telling them to look at the fields
  // would send them hunting for a mistake that is not theirs. In practice this
  // means the deployment's origin allowlist is wrong, which is my problem.
  contactRefused:
    "The request was refused before it reached my mailbox, and none of the " +
    "fields is at fault — this one is on me. The address below still works.",

  // The `429`. The wait is the api's measured number, from `Retry-After`, and
  // the component prints it — so this sentence must not contain one.
  contactRateLimited:
    "Too many messages from here in the last ten minutes. Your text is safe in " +
    "the field.",

  // The `502`. This is the sentence ADR 0021 warns about in "Was das kostet":
  // the sender reads "not delivered" and the dispatcher may deliver it ten
  // minutes later. So it does not say "not delivered" — it says what is true at
  // the moment it is printed and what happens next.
  contactProviderDown:
    "The mail relay did not answer. The message is stored and goes out as soon " +
    "as it does — you do not need to send it again.",

  // No answer at all: the eight seconds ran out, or the connection never
  // opened. The one failure where we genuinely do not know whether anything
  // arrived, and the sentence says so rather than guessing in either direction.
  contactNoAnswer:
    "No answer within eight seconds. I cannot tell from here whether it got " +
    "through — the address below always works.",

  based: "BASED IN LUXEMBOURG",
  privacy: "PRIVACY",
  imprint: "IMPRINT",
} as const;

/** Every key English has, with a plain string for a value. A language that
 *  offers a key English does not have is a compile error, and a lookup for a
 *  key nobody wrote is one too — which is the reason these are TypeScript
 *  modules and not JSON files. */
export type Messages = Record<keyof typeof en, string>;
