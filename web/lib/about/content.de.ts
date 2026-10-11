// Die Wörter von SYS.05 auf Deutsch — Beschriftungen und Prosa, nichts sonst.
//
// WAS HIER FEHLT, IST ABSICHT UND STEHT IN ADR 0083, ENTSCHEIDUNG 6: „die
// Beschriftung wird übersetzt, der Datenwert und der Metrikname nicht." Also
// stehen `Tim Seil`, `Junior DevOps`, `Luxembourg · UTC+1`, `Kubernetes ·
// GitOps`, `Claude Code` und die Adresse genau einmal in content.ts — und
// `Luxembourg` bleibt `Luxembourg`, weil das Impressum es so schreibt und ein
// Ort kein Wort über diese Seite ist. Die einzige Ausnahme ist `WEG`: dort ist
// der Wert ein Satz und kein Datum, und `bundleShapes` weist eine Sprache ab,
// die das verwechselt — in beide Richtungen.
//
// `EDGE` BLEIBT `EDGE`. Fünf der sechs Achsen haben ein deutsches Wort, das in
// dieser Branche auch gesprochen wird; `RAND` ist keines. Dasselbe Argument wie
// bei `Homelab` eine Datei weiter, und es ist das einzige Wort dieser Tabelle,
// das sich nicht bewegt.
//
// DIE BEGRIFFSLISTE AUS ADR 0083 GILT HIER: `Ausfall` für outage, `Messung` für
// measurement. Das vierte Prinzip heißt deshalb nicht „Incident", obwohl der
// Code `incidents` sagt — der Schlüssel ist Nomenklatur, die Überschrift ist
// Prosa.
//
// UND SIE DUZT, wie der Katalog und wie trajectory.de.ts.

import type { AboutWords } from "./content.ts";

export const ABOUT_WORDS_DE: AboutWords = {
  operator: {
    name: { label: "NAME", value: null },
    role: { label: "ROLLE", value: null },
    base: { label: "SITZ", value: null },
    primary: { label: "SCHWERPUNKT", value: null },
    route: { label: "WEG", value: "Autodidakt, vom Labor aus" },
    tooling: { label: "WERKZEUG", value: null },
    mail: { label: "MAIL", value: null },
  },
  stack: {
    base: "BASIS",
    network: "NETZ",
    edge: "EDGE",
    delivery: "AUSLIEFERUNG",
    data: "DATEN",
    watch: "ÜBERWACHUNG",
  },
  principles: {
    source: {
      title: "Erst den Quellcode, dann die Doku",
      detail:
        "Die Doku sagt die Absicht. Der Code sagt das Verhalten. Wenn beide " +
        "sich widersprechen, folgt die Produktion dem Code.",
    },
    ship: {
      title: "Dort ausliefern, wo es kaputtgehen kann",
      detail:
        "Ein Projekt auf dem Laptop bringt dir Syntax bei. Ein Projekt unter " +
        "einer öffentlichen Adresse bringt dir Timeouts, Zertifikate, Backups " +
        "und deine eigenen blinden Flecken bei.",
    },
    measure: {
      title: "Messen, bevor man behauptet",
      detail:
        "Hinter jeder Zahl auf dieser Seite steht etwas, das sie erzeugt. Kann " +
        "ich nicht auf die Quelle zeigen, kommt die Zahl nicht auf die Seite.",
    },
    incident: {
      title: "Den Ausfall aufschreiben",
      detail:
        "Der Ausfall selbst ist nicht der interessante Teil. Die Ursache, die " +
        "Behebung und das, was ich beim nächsten Mal anders aufsetzen würde — " +
        "das ist, was bleibt.",
    },
  },
};
