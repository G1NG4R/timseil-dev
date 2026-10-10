// Was Fallstudie 02 sagt, auf Deutsch. Rund 400 Wörter, und die längste
// zusammenhängende Prosa dieser Phase.
//
// WAS HIER NICHT STEHT: der Slug, das Datum und die sieben Wörter in den
// Pipeline-Kästen. Fünf von ihnen sind Jobnamen aus `ci.yml` in Großbuchstaben,
// und `lib/content/pipeline.test.ts` hält sie gegen diese Datei — eine
// übersetzte Kastenaufschrift wäre die Beschreibung einer Pipeline, die niemand
// ausführt. Die Sätze darunter hängen deshalb AN den Titeln: fehlt einer,
// kompiliert diese Datei nicht.
//
// DIE BEGRIFFSLISTE AUS ADR 0083, ENTSCHEIDUNG 8, UND EIN FUND DABEI. Der
// Katalog übersetzt `CONSTRAINTS` seit U8 als `RANDBEDINGUNGEN` (`csConstraints`),
// also heißt „the second constraint" im Absatz darunter `die zweite
// Randbedingung` und nicht „Vorgabe" — sonst hieße dasselbe auf einer Seite
// zweimal anders, und genau das ist der Fund, den die Entscheidung meint.
// Ebenso: `Ausfall` für outage, `Verfügbarkeit` für uptime, `Beitrag` für einen
// Log-Eintrag.
//
// `2026 — LAUFEND` UND `SELBST GEHOSTET` SIND WÖRTER, KEINE DATEN. Das Datum in
// der Jahreszeile ist `2026`; was daneben steht, ist Sprache. `self-hosted`
// qualifiziert das Zustandswort, das die API schickt, und ist nicht der Zustand
// — `LIVE` kommt weiter aus `/api/systems`.
//
// TECHNISCHE NAMEN BLEIBEN STEHEN: DNS, TLS, Reverse Proxy, Postgres, GitHub,
// Compose, `make check`, `latest`. Was von einem Upstream kam oder ein Feld
// benennt, bleibt englisch; was die Seite über sich selbst sagt, wird übersetzt.

import type { CaseWords } from "./types.ts";
import type { StageTitle } from "./timseil-dev.ts";

export const CASE_WORDS_DE: CaseWords<StageTitle> = {
  headline: "Diese Seite ist das System, das sie beschreibt.",

  blurb:
    "Diese Seite als System — gebaut, ausgeliefert und gemessen von der " +
    "Pipeline, die sie dokumentiert.",

  year: "2026 — laufend",
  hosting: "selbst gehostet",

  problem: [
    "Ein Portfolio, das nur Screenshots zeigt, verlangt vom Leser, die " +
      "Technik auf Vertrauen hin zu glauben. Für eine DevOps-Rolle ist das das " +
      "Falsche: Beurteilen lassen sich die Schnittstellen zwischen Diensten, " +
      "die Deploys, und was um drei Uhr morgens passiert, wenn ein Container " +
      "stirbt.",
    "Also musste die Seite ein laufendes System sein und keine Beschreibung " +
      "von einem. Das Frontend ist Client einer echten API. Die API hat ihre " +
      "eigene Datenbank, ihren eigenen Container, ihren eigenen Health-Check. " +
      "Die Infrastruktur ist meine, auch zum Kaputtmachen: DNS, TLS, Reverse " +
      "Proxy, Logs, Backups, Neustarts.",
    "Die zweite Randbedingung war Ehrlichkeit. Keine Zahl auf dieser Seite " +
      "darf Dekoration sein. Wird ein Wert gezeigt, muss etwas ihn erzeugen — " +
      "das Trainings-Log kommt aus Postgres über die API, der " +
      "Contribution-Graph aus der GitHub-API, und die Verfügbarkeitsreihe von " +
      "einer Sonde, die außerhalb dieses Hosts läuft, damit ein Ausfall auch " +
      "dann aufgezeichnet wird, wenn die Maschine, die ihn aufzeichnen würde, " +
      "selbst die ausgefallene ist.",
  ],

  constraints: [
    "Ein VPS. Keine gemanagte Plattform, kein Serverless.",
    "Jeder angezeigte Wert hat eine Quelle.",
    "Deploy muss ein Befehl sein und ein Rollback.",
    "Schnell auf dem Handy im Mobilfunknetz.",
    "Mit der Tastatur bedienbar, durchgehend AA-Kontrast.",
  ],

  composeCaption:
    "Diesen Block hat niemand getippt. Er wird aus der Compose-Datei " +
    "geschnitten, die der Host ausführt, von demselben Befehl, der die Typen " +
    "generiert — und der Build wird rot, wenn diese Datei sich bewegt und der " +
    "Block ihr nicht folgt.",

  stages: {
    PUSH: "Ein Squash-Merge auf main. Aus einem Branch wird nichts ausgeliefert.",
    CHECK: "Alles, was `make check` ausführt: vet, eslint, tsc, beide Unit-Suiten, jede Regel.",
    DB: "Jede Migration hoch, dann runter, gegen ein echtes Postgres.",
    E2E: "Die Browser-Suite an sieben Breiten, gegen einen Produktions-Build.",
    PUBLISH: "Zwei Images, getaggt mit dem Commit, aus dem sie gebaut wurden. Nie `latest`.",
    DEPLOY: "Der Server zieht den Tag und tauscht den Container. Er baut nie.",
    VERIFY:
      "Ein Gatter, das den neuen Container fragt, was er ausführt. Er " +
      "antwortet mit dem Commit, oder der vorherige Tag kommt zurück.",
  },

  emptyNote: {
    label: "ABSICHTLICH LEER",
    text:
      "Diese fünf Kacheln füllen sich ab dem ersten Betriebstag und bleiben " +
      "bis dahin leer. Eine Fallstudie, die Verfügbarkeit zeigt, bevor der " +
      "Server gelaufen ist, ist genau das, wogegen diese Seite argumentiert.",
  },
};
