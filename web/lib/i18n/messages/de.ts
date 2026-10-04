// German. U8 filled it, and the type says so.
//
// IT IS `Messages` AND NOT `Partial<Messages>`, WHICH IS THE ONE DECISION IN
// THIS FILE THAT IS NOT A WORD. French is still `Partial` because it is still
// empty; German is finished, so a key dropped out of this object is a build
// error rather than a red test. `isComplete` still asks at runtime — it has to,
// because it is also what answers for French — but nothing in this repository
// relies on a test to notice that a translated language stopped being
// translated. ADR 0083.
//
// WHERE THE WORDS COME FROM. The `Language Switcher` sheet ships a finished
// German table for about thirty chrome strings, and those are taken as drawn:
// `ARBEIT · LOG · ÜBER MICH · KONTAKT`, `SCHLIESSEN`, `SPRACHE`,
// `DIE URL ENTSCHEIDET · KEINE UMLEITUNG`, `KANAL ÖFFNEN`,
// `MEIST UNTER 24 STD.`, `MIT SITZ IN LUXEMBURG`, `DATENSCHUTZ`, `IMPRESSUM`,
// `VERFÜGBARKEIT`, `CV → TERMINAL AUF / : cv`. Its LANG.01 matrix settles six
// more: `ANGEWANDT`, `LERNEND`, `GEPLANT`, `VERFÜGBAR`, `FEHLERRATE`,
// `TRAININGS-LOG`, and `LÄUFT IN` for the evidence prefix.
//
// WHAT IS **NOT** TAKEN FROM IT IS THE FACTS. The sheet's role line and hero
// headline are the ones from before U1 — "Backend- & DevOps-Entwickler",
// "Ich baue die Systeme hinter dem Bildschirm." The role is Junior DevOps
// Engineer and the verb is `run`, not `build`; `docs/design/INDEX.md` states
// the rule as a rule: the form holds, the facts from the build plan win. Three
// more divergences from the sheet are in ADR 0083 — `[FOLGT]` (it stays
// `[SOON]`, design-correction #6), `ts.lang` (invariant 9 wins, #221), and
// `uptime` under "IDENTIFIER BLEIBEN" (the label moves, the metric name does
// not).
//
// THE TERMS ARE FIXED ONCE AND HELD. ADR 0083 carries the table; what matters
// here is that `Vorfall`, `Beleg`, `Fenster`, `Zustand`, `Messung`, `Beitrag`
// and `Verfügbarkeit` mean one thing each in this file. What is spelled two
// ways is a finding, not a style.
//
// WHAT STAYS ENGLISH IS NOT A GAP. `LIVE`, `OFFLINE`, `STATUS`, `BUILD`,
// `SYS.01`, `P95`, `FEED`, `SYSTEM`, `TAGS`, `grep`, `cv`, `ESC`, `ALT`,
// `POST-MORTEM`, the endpoint paths and the ISO dates are all nomenclature by
// LANG.01's rule, and `— NO DATA` and `[SOON]` are tokens with one spelling in
// all three languages.

import type { Messages } from "./en.ts";

export const de: Messages = {
  skip: "ZUM INHALT SPRINGEN",

  navWork: "ARBEIT",
  // LOG BLEIBT LOG, and the sheet draws it that way in its German nav. The
  // German word would be `Protokoll`, which is what a machine writes; this is
  // the section where a person writes about what happened, and `workTrainingLog`
  // below keeps the same word for the same reason.
  navLog: "LOG",
  navAbout: "ÜBER MICH",
  navContact: "KONTAKT",

  langAria: "Sprache",
  langLabel: "SPRACHE",
  langEsc: "ESC",
  langNote: "DIE URL ENTSCHEIDET · KEINE UMLEITUNG",

  menuAria: "Menü und Sprache",
  menuCloseAria: "Menü schließen",
  // UPPERCASE ß IS SS. The row is set in capitals by the stylesheet and the
  // string arrives in capitals, so it is written out rather than left to a
  // browser's `text-transform` — which renders `ß` as `ß` in some faces and
  // `SS` in others. The sheet writes `SCHLIESSEN` too.
  menuClose: "SCHLIESSEN",

  channel: "KANAL ÖFFNEN",
  respond: "MEIST UNTER 24 STD.",

  uptime: "VERFÜGBARKEIT",
  cvHint: "CV → TERMINAL AUF / : cv",
  // THE SHEET'S WORD, AND IT IS THE ONE WORD IN THIS FILE WORTH A SECOND LOOK.
  // `THEMA` is what the German table draws over the seven swatches; read on its
  // own it is the German for "topic" rather than for a colour scheme, which is
  // why `themeAria` beside it says `Farbschema` in full. The drawing wins here
  // because the row is three characters wide in the footer and the sheet is the
  // authority on its own chrome — but it is a wording call, not a measurement,
  // and it is the first line to change if it reads wrong on the page.
  themeLabel: "THEMA",
  themeAria: "Farbschema",
  altLabel: "ALT",

  // STATE.05's rule, applied: the label is German and the data value in the api
  // stays `live`, `in_build`, `queued`. `LIVE` and `OFFLINE` are the two words a
  // German operator says in English anyway, and LANG.01 names `ONLINE` in the
  // set that does not move; translating these two would make them unsearchable
  // in exactly the way the rule warns about.
  stateLive: "LIVE",
  stateInBuild: "IM BAU",
  stateDegraded: "EINGESCHRÄNKT",
  stateOffline: "OFFLINE",
  stateEmpty: "LEER",
  stateQueued: "GEPLANT",
  stateAvailable: "VERFÜGBAR",

  trackCore: "KERN",
  trackApplied: "ANGEWANDT",
  trackLearning: "LERNEND",

  // The four rules `v_track_states` applies, written for a reader. They stay
  // lowercase because the English ones are: they are sentence fragments under a
  // heading, not labels.
  scaleCore: "läuft in mehreren Systemen",
  scaleApplied: "mindestens einmal ausgeliefert",
  scaleLearning: "in Arbeit",
  scaleQueued: "geplant",

  csYear: "JAHR",
  csStatus: "STATUS",
  csSource: "QUELLE",
  csProblem: "PROBLEM",
  csConstraints: "RANDBEDINGUNGEN",
  csErrorRate: "FEHLERRATE",
  // VORFALL, NICHT KERBE. The German docs in this repository call an incident a
  // `Kerbe` — invariant 4 is written that way — and that is Tim's word for his
  // own notebook, not a word a visitor knows. The UI says `Vorfall`, and
  // `Ausfall` is reserved for the day rather than the system, which is the
  // distinction `csOutage` already draws in English.
  csIncidents: "VORFÄLLE",
  csNoLink: "kein Link, dafür ein Grund",
  csBuild: "BUILD",
  csOperations: "BETRIEB",
  csPushToLive: "VOM PUSH IN DEN BETRIEB",
  // The same word as `csOperations`, because in English they are the same word
  // in two numbers. German has one form for both, so both keys carry it rather
  // than one of them reaching for a synonym nobody asked for.
  csOperation: "BETRIEB",
  // Lowercase for en.ts's reason: the stylesheet shouts the line, and
  // `OpsStrip` uppercases this one itself.
  csDays: "Tage",
  csWeeks: "Wochen",
  csLast: "LETZTE",
  csOneCellOneDay: "EINE ZELLE IST EIN TAG",
  csNoIncident: "KEIN VORFALL",
  csOutage: "AUSFALL",
  csIncidentLog: "VORFALL-LOG",
  csCause: "URSACHE",
  csFix: "BEHEBUNG",
  csPostMortem: "POST-MORTEM",
  csNoIncidentsHead: "KEINE VORFÄLLE IN DIESEM FENSTER",
  csNoIncidentsWhy:
    "Keine saubere Bilanz — eine kurze. Das Raster darüber sagt, wie viel des " +
    "Fensters gemessen wurde, und ein Vorfall hier trüge seine Ursache, seine " +
    "Behebung und den Beitrag, der ihn erklärt.",

  csOpsDown:
    "Raster und Log werden aus /api/systems gelesen, und dieser Endpunkt hat " +
    "diese Anfrage nicht beantwortet. Es wird kein Tag gezeichnet und kein " +
    "Vorfall aufgeführt, statt ein Fenster aus anderer Quelle zusammenzusetzen.",

  csMetricsDown:
    "Die fünf Kacheln werden aus /api/systems gelesen, und dieser Endpunkt hat " +
    "diese Anfrage nicht beantwortet. Sie bleiben leer, statt eine Zahl von " +
    "woanders zu tragen — und das ist nicht die Leere des ersten Tages, die der " +
    "Hinweis daneben erklärt.",

  // THE ROLE AND THE HEADLINE ARE U1's, NOT THE SHEET'S. See the head of this
  // file. `JUNIOR-DEVOPS-ENGINEER` carries the German hyphens CLAUDE.md itself
  // writes it with; the words inside it are a job title and stay as they are.
  homeEyebrow: "JUNIOR-DEVOPS-ENGINEER · LUXEMBURG",
  homeHeadline: "Ich betreibe die Systeme hinter dem Bildschirm.",
  homeTagline: "selbst gelernt, selbst gehostet.",
  availability: "Offen für Junior-Stellen in DevOps und Platform Engineering",

  homeTerminalWhy:
    "Das Befehlsregister gehört in eine spätere Stufe. Dieser Rahmen berichtet, " +
    "was die Seite die API schon fragen kann, und nimmt keine Eingabe an, " +
    "solange er keine beantworten kann.",

  // THE FOUR `…Down` SENTENCES NAME THEIR ENDPOINT AND THE PATH DOES NOT MOVE.
  // That is the whole point of them: a reader can go and ask the same address.
  homeSys01Down:
    "Das Log wird aus /api/training gelesen, und dieser Endpunkt hat diese " +
    "Anfrage nicht beantwortet. Es wird nichts gezeigt, statt eine Liste aus " +
    "anderer Quelle zusammenzusetzen.",
  homeSys02Down:
    "Die Liste wird aus /api/systems gelesen, und dieser Endpunkt hat diese " +
    "Anfrage nicht beantwortet. Es wird kein System gezeigt, statt eine Liste " +
    "von Hand zu schreiben.",
  homeUplinkGraphDown:
    "Der Kalender wird aus /api/contributions gelesen, der die letzte gute " +
    "Antwort samt ihrem Alter ausliefert, sobald er eine hat. Es wird nichts " +
    "gezeigt, weil es noch keine gegeben hat.",
  homeUplinkStripDown:
    "Der Streifen wird aus /api/systems gelesen, und dieser Endpunkt hat diese " +
    "Anfrage nicht beantwortet. Es wird kein Tag gezeichnet, statt einer Reihe " +
    "Zellen, die nichts gemessen haben.",
  homeSys04Empty:
    "Es wurde noch kein Beitrag geschrieben. Das Log beginnt leer und füllt " +
    "sich, wenn hier etwas passiert, das aufzuschreiben lohnt — nicht vorher.",
  homeSys04Down:
    "Die Beiträge werden aus content/posts in diesem Repository gelesen, und " +
    "dieses Verzeichnis war in diesem Build nicht lesbar. Es wird nichts " +
    "gezeigt, statt eine Liste aus anderer Quelle zusammenzusetzen.",

  homeSystemsExit: "Fallstudie lesen",
  caseStudyExit: "FALLSTUDIE",

  homeBio:
    "Junior-DevOps-Engineer in Luxemburg, autodidaktisch vom Helpdesk aufwärts. " +
    "Ich betreibe zu Hause einen Kubernetes-Cluster auf eigener Hardware — " +
    "Talos, GitOps mit Flux — und diese Seite auf einem VPS, den ich selbst " +
    "administriere. Ich baue mit Claude Code, und jede Behauptung hier hängt an " +
    "einem System, das du prüfen kannst.",

  workTitle: "Ausgewählte Arbeiten",
  workDeck:
    "Jedes System hier unten läuft, lief oder ist dafür spezifiziert. Zustand " +
    "und Betriebszahlen kommen aus derselben API, die diese Seite ausliefert — " +
    "nichts hier ist der Screenshot einer Idee.",
  workListDown:
    "Die Liste wird aus /api/systems gelesen, und dieser Endpunkt hat diese " +
    "Anfrage nicht beantwortet. Es wird kein System gezeigt, statt eine Liste " +
    "von Hand zu schreiben.",
  workListNone:
    "Die API hat geantwortet und kein System aufgeführt. Das ist die Antwort — " +
    "nicht ein Scheitern daran, sie zu bekommen.",
  workNoMatchHead: "KEIN SYSTEM PASST ZU DIESER KOMBINATION",
  workNoMatchReason:
    "Die beiden Reihen schränken gemeinsam ein, und kein System trägt beides. " +
    "Nichts fehlt in der Liste — lass eine davon weg, um sie wieder zu sehen.",
  workReset: "FILTER ZURÜCKSETZEN",
  workLegendKicker: "WIE DAS ZU LESEN IST",
  // The three fragments stand behind a state word the component puts in front
  // of them, so each one has to read as the continuation of `LIVE heißt: …`.
  // German needs the colon that English does without.
  // `Health-Check` RATHER THAN `Gesundheitsprüfung`. It is the name of the thing
  // the pipeline runs, and LANG.01's rule is that a tool's name does not move.
  // `Gesundheitsprüfung` is what a doctor does.
  workLegendLive: "heißt: eine öffentliche Adresse und ein Health-Check.",
  workLegendInBuild: "heißt: läuft, aber noch nicht für andere.",
  workLegendQueued: "heißt: spezifiziert, nicht geschrieben.",
  workLegendRule: "Nichts wird hochgestuft ohne die Zahl, die es belegt.",
  workTrainingLog: "TRAININGS-LOG",
  workContact:
    "Nichts hier genau das, was du suchst? Ich erkläre dir gern, wie eines " +
    "dieser Systeme gebaut ist.",
  workHere: "DU BIST HIER",

  aboutHeadline: "Ich lerne Systeme, indem ich sie betreibe.",
  aboutLede:
    "Angefangen hat es mit einem Hypervisor zu Hause, es ging weiter über " +
    "einen Service-Desk und dann durchs Bauen: ein VPS, und jetzt ein " +
    "Kubernetes-Cluster auf eigener Hardware. Ich arbeite mit Claude Code, als " +
    "Werkzeug und als Lehrer — und was ich betreibe, kann ich erklären.",

  contactHeadline: "Kanal öffnen.",
  contactLede:
    "Dieses Formular geht direkt in mein Postfach — kein Mailprogramm, kein " +
    "Umweg. Wenn du lieber aus deinem eigenen schreibst: die Adresse steht " +
    "unten und landet am selben Ort.",
  contactEmailHint: "wohin soll die Antwort gehen?",
  contactNotice:
    "Was gespeichert wird: dein Name, deine Adresse, die Nachricht, die Zeit " +
    "und eine gehashte Form deiner IP-Adresse für das Ratenlimit. Die Nachricht " +
    "geht in mein Postfach und nirgendwo anders. Kein Tracking, kein Cookie, " +
    "kein Dritter.",
  contactSending: "Wird gesendet. Die Anfrage rechts ist die, die unterwegs ist.",
  contactAccepted:
    "Angenommen. Die Kennung unten ist die Quittung — sie benennt diese " +
    "Nachricht, und du kannst sie mir gegenüber angeben. Dein Text steht noch " +
    "im Feld; nichts wurde geleert.",
  contactInvalid: "Es wurde nichts gesendet. Die Felder unten sagen, was zu ändern ist.",
  contactRefused:
    "Die Anfrage wurde abgewiesen, bevor sie mein Postfach erreicht hat, und " +
    "keines der Felder ist schuld — das liegt an mir. Die Adresse unten " +
    "funktioniert weiter.",
  contactRateLimited:
    "Zu viele Nachrichten von hier in den letzten zehn Minuten. Dein Text ist " +
    "im Feld sicher.",
  contactProviderDown:
    "Das Mail-Relay hat nicht geantwortet. Die Nachricht ist gespeichert und " +
    "geht raus, sobald es wieder antwortet — du musst sie nicht erneut senden.",
  contactNoAnswer:
    "Es kam keine Antwort zurück, und ich kann von hier nicht sagen, ob die " +
    "Nachricht durchgekommen ist. Die Adresse unten funktioniert immer.",
  contactUnexpected: "Die Antwort war keine, die diese Seite lesen kann",

  blogEntry: "BEITRAG",
  blogPublished: "VERÖFFENTLICHT",
  blogUpdated: "AKTUALISIERT",
  blogTags: "TAGS",
  // The label over `12 MIN`, so it names the quantity rather than the verb.
  blogRead: "LESEZEIT",
  blogContents: "INHALT",
  blogSummary: "ZUSAMMENFASSUNG",
  blogRunsIn: "LÄUFT IN",
  blogEditSource: "AUF GITHUB BEARBEITEN",
  // THE TWO FOOT LABELS ARE SYMMETRIC IN GERMAN AND ASYMMETRIC IN ENGLISH, and
  // that is grammar rather than a liberty: `PREVIOUS` is a complete label in
  // English and `VORHERIGER` is a comparative adjective waiting for its noun.
  blogPrevious: "VORHERIGER BEITRAG",
  blogNext: "NÄCHSTER BEITRAG",
  blogAllEntries: "ALLE BEITRÄGE",
  blogReply: "PER E-MAIL ANTWORTEN",
  blogNoNeighbour: "— noch keiner",
  blogNoNextWhy:
    "Dies ist der neueste Beitrag, danach kommt also noch nichts. Die Zeile " +
    "bleibt und sagt das, statt zu verschwinden.",
  blogNoPreviousWhy:
    "Dies ist der erste Beitrag im Log, davor gibt es also nichts. Die Zeile " +
    "bleibt und sagt das, statt zu verschwinden.",
  // `Writing` AS A NOUN, WHICH GERMAN HAS TO CHOOSE. `Schreiben` is the act,
  // `Geschriebenes` is what came of it — and this page lists what came of it.
  // The nav still says `LOG`, which is the route's own word.
  blogIndexTitle: "Geschriebenes",
  blogIndexDeck:
    "Notizen vom Bauen und Betreiben eigener Systeme: wie der Fehler aussah, " +
    "was die Behebung war und was ich anders machen würde. Keine Anleitungen, " +
    "die ich nicht in Produktion gefahren habe.",
  blogIndexEntries: "BEITRÄGE",
  // The `<dd>` under this one is a DATE, so the label names a time and not a
  // thing: `NEUESTER` would be an adjective with nothing to agree with.
  blogIndexLatest: "ZULETZT",
  blogIndexFeed: "FEED",
  blogIndexSystem: "SYSTEM",
  // `grep` IS THE COMMAND AND STAYS. What it searches is named in German; the
  // name of the tool is nomenclature, the same way `cv` is in `cvHint`.
  blogSearchPlaceholder: "grep Titel, Vorspann, Tags…",
  blogNoEntriesReason:
    "Das Log beginnt leer. Der erste Beitrag kommt, wenn das erste System etwas " +
    "getan hat, das aufzuschreiben lohnt — nicht vorher.",
  blogListDown:
    "Die Beiträge sind Dateien in diesem Image, und dieses Verzeichnis war " +
    "nicht lesbar. Es wird kein Beitrag gezeigt, statt eine Liste von Hand zu " +
    "schreiben.",
  blogNoMatchHead: "KEIN BEITRAG PASST ZU DIESER KOMBINATION",
  blogNoMatchReason:
    "Jeder Tag trägt die Anzahl daneben, ein Tag allein hat also immer etwas " +
    "dahinter. Nichts fehlt im Log — lass die Suche oder den Tag weg, um es " +
    "wieder zu sehen.",
  blogReset: "FILTER ZURÜCKSETZEN",
  blogViewSystems: "SYSTEME ANSEHEN",
  blogSubscribeHead: "ABONNIEREN",
  blogSubscribeBody:
    "Kein Newsletter, kein Tracking. Der Feed ist eine einfache RSS-Datei, " +
    "ausgeliefert vom selben Container wie jede Seite hier.",

  notFoundStatus: "ROUTE NICHT AUFGELÖST",
  notFoundLede:
    "Diese Route löst nicht auf. Die Anfrage hat den Server erreicht; unter " +
    "diesem Pfad ist einfach nichts eingehängt.",
  notFoundRouteHome: "Terminal, Trainings-Log, Systeme",
  notFoundRouteWork: "Ausgewählte Arbeiten",
  notFoundRouteBlog: "Geschriebenes",
  notFoundRouteAbout: "Über mich",
  notFoundRouteContact: "Kanal öffnen",
  notFoundCvHint: "Der CV ist keine Route — tippe cv im Terminal auf /.",
  notFoundReturn: "ZURÜCK ZUR WURZEL",
  notFoundSelectedWork: "AUSGEWÄHLTE ARBEITEN",
  notFoundReplay: "GLITCH WIEDERHOLEN",
  notFoundBudgetLede: "Solange du hier bist — beantworte die Anfragen.",

  based: "MIT SITZ IN LUXEMBURG",
  privacy: "DATENSCHUTZ",
  imprint: "IMPRESSUM",
};
