// Die fünf Sätze der Fehlerseite auf Deutsch.
//
// VIER VON FÜNF SIND PROSA, DER FÜNFTE STEHT SCHON IM KATALOG. `RETURN TO ROOT`
// heißt auf der 404 seit H9 `ZURÜCK ZUR WURZEL` (`notFoundReturn`) — dieselbe
// Handlung, dieselbe Schaltfläche, also dasselbe Wort. ADR 0083, Entscheidung 8:
// was zweimal anders heißt, ist ein Fund. Der Katalog ist hier nicht
// importierbar — das ist der ganze Grund, warum diese Datei existiert — also
// steht das Wort zweimal auf der Platte, und dieser Satz ist der Grund, warum
// das kein Versehen ist.
//
// `NOCH EINMAL` UND NICHT `ERNEUT VERSUCHEN`. Zwei Schaltflächen stehen
// nebeneinander, und bei 390 ist die zweite `ZURÜCK ZUR WURZEL` mit 17 Zeichen;
// `ERNEUT VERSUCHEN` daneben sind 16 statt 9 wie im Englischen. Gemessen, nicht
// geraten: e2e/error.spec.ts prüft die Zeile.
//
// DER DIGEST, DIE REQUEST-ID UND DIE TRACE-ID BLEIBEN, WIE SIE HEISSEN. Es sind
// Feldnamen aus dem Log, keine Wörter über diese Seite — und der Satz daneben
// erklärt genau, was sie nicht sind.
//
// UND SIE DUZT, wie der Katalog und wie die anderen Bündel.

import type { ErrorWords } from "./words.ts";

export const ERROR_WORDS_DE: ErrorWords = {
  lede:
    "Ein Abschnitt dieser Seite ist beim Rendern fehlgeschlagen. Alles darum " +
    "herum ist intakt — was folgt, ist der Teil, der nicht angekommen ist.",

  digestNote:
    "Der Digest benennt den Fehler, nicht diesen Besuch — zwei Menschen, die " +
    "auf denselben stoßen, lesen dieselbe Kennung.",

  correlationNote:
    "Request-ID und Trace-ID stehen im Server-Log. Diese Seite wird in deinem " +
    "Browser gerendert, und der kann die eigenen Response-Header nicht lesen.",

  retry: "NOCH EINMAL",
  home: "ZURÜCK ZUR WURZEL",
};
