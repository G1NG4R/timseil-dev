// Die drei Abschnittsköpfe von SYS.05 auf Deutsch.
//
// DREI ÜBERSCHRIFTEN UND ZWEI METAZEILEN, nicht mehr — die Marker `SYS.05.01`
// bis `03` sind die Notation des Blattes und stehen genau einmal in
// sections.ts, wie der Schlüssel, der sagt, warum ein Abschnitt leer ist.
//
// `TALOS-PROD · BARE METAL` STEHT HIER, OBWOHL ES SICH NICHT BEWEGT. Ein
// Systemname und ein Begriff, den auch das Deutsche so sagt. Es wäre billiger,
// die Zeile aus dem Bündel zu lassen und sie aus `SECTION_WORDS_EN` zu lesen —
// aber dann wäre sie die einzige Zeile dieser Seite, deren Sprache nicht
// nachlesbar ist, und `bundleShapes` könnte nicht mehr prüfen, dass beide
// Sprachen dieselbe Form haben. Dasselbe Argument, mit dem `uplink` im Katalog
// steht: eine sichtbare Entscheidung ist mehr wert als ein stilles Auslassen.
//
// `WERDEGANG` UND NICHT `TRAJEKTORIE`. Die Schiene zeigt einen beruflichen Weg
// und keine Flugbahn; das Wort, das der Operator-Karte zur Zeile `WEG` gehört,
// ist dasselbe Bild.

import type { SectionId, SectionWords } from "./sections.ts";

export const SECTION_WORDS_DE: Readonly<Record<SectionId, SectionWords>> = {
  "SYS.05.01": {
    title: "WERDEGANG",
    // Die Pfeile sind Zeichen und keine Wörter, also bleiben sie. `WECHSELT`
    // steht für `TO STEP`, weil die Tastenangabe hier sagt, was passiert, und
    // nicht, was man tun soll — und weil sie damit genauso lang bleibt wie das
    // englische Original, in einer Zeile, die rechts im Kopf steht.
    meta: "STATION WÄHLEN · ← → WECHSELT",
  },
  "SYS.05.02": {
    title: "WAS ICH BETREIBE",
    meta: "TALOS-PROD · BARE METAL",
  },
  "SYS.05.03": {
    title: "WIE ICH ARBEITE",
    meta: null,
  },
};
