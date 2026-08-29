# ADR 0048 — Die Zustandssprache: das Wort, die Füllung, und der Puls, der keines ist

**Status:** Angenommen
**Datum:** 2026-08-29
**Betrifft:** G6, G7, H1–H13, P6
**Invarianten:** 1 (keine erfundenen Zahlen), 8 (keine Farbe außerhalb `tokens.css`)

## Kontext

Der Bauplan gibt G6 eine Zeile (1214) und ein Abnahmekriterium: die Bauteile aus
STATE.05 zentral — Leerzustände, Fehlerpanels, DEGRADED, `— NO DATA`,
Retry-Zähler, `StatusDot` mit 2,6 s Puls —, **fertig wenn jeder Zustand ein
zweites Merkmal neben der Farbe hat.**

Drei frühere Phasen haben diese hier namentlich angekündigt, und alle drei
Zusagen stehen als Kommentar im Baum:

| Wo | Was dort steht |
|---|---|
| `web/styles/tokens.css` | „The status dot. … **G6 extracts StatusDot and inherits this**" — `--d-pulse: 2600ms`, seit G1 deklariert und von niemandem gelesen |
| `web/styles/chrome.css` | „NEUTRAL AND NOT PULSING until G4 … **G6 extracts StatusDot** and G4 gives it something true to say" |
| `web/lib/api/health.ts` | „The meta bar has no third word for it — **DEGRADED is a G6 component**" |

Dazu ein Fund aus der G4-Abnahme, der seit dem 28.08. im Backlog liegt:
`online: false` ist unerreichbar, und `degraded` wurde als **ONLINE** angezeigt,
weil der Meta-Balken kein drittes Wort hatte. Ein Zustand, den die API
ausdrücklich meldet, war in der Oberfläche unsichtbar.

Vier Zwänge standen daneben:

1. **`prefers-reduced-motion` schaltet in `globals.css` *jede* Animation ab**
   (`*, *::before, *::after { animation: none !important }`). Was daran hängt,
   ist für einen Teil der Besucher nicht schwächer, sondern nicht vorhanden.
2. **Eine `.tsx` läuft nicht unter `node --test`.** Node 24 entfernt Typen,
   transformiert aber kein JSX, und `npm test` liest ohnehin nur `lib/**` und
   `styles/**` (ADR 0044).
3. **Zwei Blätter widersprechen sich über die Übersetzung.** LANG.01: „Übersetzt
   wird Prosa, nicht Nomenklatur", mit `ONLINE` in der Menge, die englisch
   bleibt. STATE.05: „LABEL WIRD ÜBERSETZT, DATENWERT NICHT — die Anzeige heißt
   auf Deutsch GEPLANT, der Wert in der API bleibt `queued`."
4. **`— NO DATA` stand doppelt im Baum**: als Konstante in `lib/api/health.ts`
   und als zweites Literal in `app/[lang]/page.tsx`. Zwei Kopien des Satzes, an
   dem die erste Regel dieses Repositories hängt.

## Entscheidung

**Ein Zustand wird immer zweimal gesagt — als Wort und als Form —, und die Farbe
kommt erst danach.** Das Vokabular liegt als Tabelle in `web/lib/state/words.ts`,
jede Verzweigung darüber ebenfalls in `web/lib/state/`, und jedes Bauteil in
`web/components/state/` ist Markup plus ein Aufruf.

## Konsequenzen

### Das zweite Merkmal ist das Wort, das dritte die Füllung, und der Puls ist keines

`StatusDot` nimmt `label: string` — **nicht optional**. Das Referenzbauteil des
Handoffs schreibt die Regel als Kommentar („Zustand nie nur über Farbe: das Wort
steht immer daneben") und lässt die Signatur zu, sie zu brechen. Hier
kompiliert ein Punkt ohne Wort nicht. Das Abnahmekriterium der Phase ist damit
ein Typ und nicht ein Vorsatz.

Die Füllung sagt, **welche Art Antwort** den Zustand erzeugt hat — genau die
Unterscheidung, um die es Invariante 1 geht:

| Füllung | Klasse | Wer |
|---|---|---|
| gefüllte Scheibe | gemessen, gut | LIVE · ONLINE |
| hohler Ring | gemessen, eingeschränkt | DEGRADED |
| Ring mit Balken | gemessen, aus | OFFLINE |
| kurzer Strich | **nichts gemessen** | QUEUED · `— NO DATA` |

Der Strich ist bewusst kein Kreis. Bei sieben Pixeln ist ein gestrichelter Kreis
Matsch, und „nicht gemessen" ist die Klasse, an der dieser Seite am meisten
liegt; er borgt sich den Gedankenstrich, der `— NO DATA` ohnehin eröffnet, statt
eine Form zu erfinden.

**Der Puls ist Schmuck.** Er darf nur dort stehen, wo die Füllung den Zustand
schon trennt, und `lib/state/words.test.ts` weist alles andere ab. Wer ihn zum
Merkmal machte, hätte für jeden Besucher mit `prefers-reduced-motion` einen
Zustand ohne Merkmal gebaut — und das fällt niemandem auf, der die Einstellung
nicht setzt.

### Der Datenwert ist Nomenklatur, das Label ist Prosa

Sechs der sieben Wörter bekommen Wörterbuchschlüssel (`stateLive`,
`stateDegraded`, `stateOffline`, `stateEmpty`, `stateQueued`, `stateAvailable`).
`ONLINE` bleibt englisch, weil LANG.01 es namentlich in der Menge führt, die
nicht übersetzt wird. `— NO DATA` bekommt keinen Schlüssel: es ist ein
Platzhalter-Token wie `[SOON]`, das Design-Korrektur #6 über alle drei Sprachen
vereinheitlicht hat.

Der Wert in der API bewegt sich nie. `queued` bleibt `queued`, `degraded` bleibt
`degraded`; nur was ein Leser sieht, wandert.

**Heute ändert sich sichtbar nichts** — `de.ts` und `fr.ts` sind leere Overlays,
und `isComplete()` lässt sie leer. P6 übersetzt, ohne ein Bauteil anzufassen.

### Abgeleitet wird nur, was `web/` heute liest

Der Vertrag führt vier Zustandsvokabulare: `Health.status`, `SystemState`,
`TrackState`, `DayState`. `web/` liest ein Dokument, `/api/health`, also bildet
`lib/state/derive.ts` genau eines ab.

**Die Regel für die anderen drei, damit H1, H4, H5 und H6 sie nicht je neu
erfinden:** ein Vertragswert wird in der Phase abgebildet, die seinen Endpunkt
zuerst liest, und die Abbildung landet in dieser Datei. Eine Tabelle für Daten,
die niemand holt, ist eine Behauptung über einen Endpunkt, den niemand gesehen
hat.

Dieselbe Antwort trägt zwei Subjekte, und deshalb zwei Funktionen:
`siteWord()` sagt ONLINE über die Auslieferung dieser Seite, `systemWord()` sagt
LIVE über die API als System. STATE.05 hält die beiden Wörter auseinander; die
Wahl fällt hier und nicht in einer `.tsx`.

### `— NO DATA` hat eine Heimat und ein Bauteil

Die Konstante steht in `lib/state/words.ts`, `lib/api/health.ts` importiert sie,
und das zweite Literal in `app/[lang]/page.tsx` ist fort. Dieselbe Seite druckte
bis hierher `body.status` — das rohe Vertragswort `ok` — direkt in die
Oberfläche; das Drahtformat ist kein Vokabular, das ein Leser hat.

### Kein neues Token, und `tokens.css` bleibt unberührt

`--d-pulse` liegt seit G1 dafür bereit. Die Farben sind `--acc`, `--amber`,
`--alert`, `--dim`, alle sieben Paletten definieren sie.

Der Puls-Schatten stand hart auf `--acc-pulse`, also auf dem Akzent. Statt einer
zweiten Variablen **setzt der Punkt `--acc-pulse` und `--acc-pulse-2` lokal neu**
— `color-mix(in srgb, var(--st-color) 70%, transparent)`, mit den Prozenten des
Handoffs — und richtet damit das Keyframe des Designers auf seinen eigenen Ton
aus, ohne `globals.css` anzufassen. Diese Datei sagt im Kopf, dass kein Wert in
ihr unserer ist.

`color-mix` ist kein Hex-, `rgb()`- oder `hsl()`-Literal; `check-tokens` lässt
es durch, so wie bei `--acc-line` und `--glow` seit ADR 0043.

### Das Wort erbt seine Type und trägt nur die Farbe

`.st-word` setzt `color` und sonst nichts. Der Meta-Balken ist 8,5 px mit
`.1em` aus dem Chrome-Blatt, und das ist dort die verbindliche Fassung; ein
Bauteil mit eigenem `font: 600 var(--t-mono-11)` hätte sie auf jeder Seite still
überschrieben. Wo ein Zustand eine eigene Größe braucht, hat der Block um ihn
herum eine.

Aus demselben Grund bleibt der Punkt in Fußzeile und Menüstreifen **6 px**,
während er überall sonst 7 px misst: das Chrome-Blatt zeichnet dort 6, das
Handoff-Bauteil überall 7, und G3 ist gegen das Blatt abgenommen worden. Zwei
Zahlen, beide belegt, keine still gemittelt — der Widerspruch steht im Backlog.

### Der Glitch-Burst: die Regel jetzt, die Bewegung in G7

`lib/state/burst.ts` hält beide Hälften der Blatt-Regel als Funktion: was als
echter Wechsel zählt, und wann der nächste feuern darf (600 ms). Die Animation
baut G7.

**Grund: heute kann sie niemand sehen.** In Produktion wechselt kein Zustand,
während jemand hinsieht; `ok`→`degraded` herzustellen verlangt eine
umkonfigurierte API, und `next dev` hydriert nicht (offener Fund, Termin H1).
Die Galerie in G7 hat einen Knopf, der einen Zustand von Hand umschaltet — der
erste Ort mit Auslöser *und* Betrachter.

Stufe I war die Alternative und ist keine: I1 ist die Boot-Sequenz, I2 die
Scroll-Choreografie, I3 Ambient. Der Burst wäre dort eine Waise.

### Der Retry-Zähler ist eine Formatierung, kein Verhalten

`lib/api/client.ts` wiederholt nichts — #157 ist mit „akzeptieren und messen"
entschieden. `retryLine()` formatiert, `ErrorPanel` nimmt die Zeile **optional**,
und wer nichts wiederholt, übergibt nichts. Ein Zähler über einer Seite, die
keinen zweiten Versuch unternimmt, wäre eine erfundene Zahl in einer
Monospace-Schrift.

Erster echter Aufrufer: H8 (Kontaktformular, 8 s Client-Timeout) oder H13.

### Das Abnahmekriterium ist ein Test

`lib/state/words.test.ts` prüft, was ein Satz im Bauplan nicht kann:

- jeder Zustand hat ein Wort, und keine zwei Zustände dasselbe;
- es gibt **weniger Töne als Zustände**, die Farbe kann also gar keine Kennung
  sein;
- `pulse` nur bei gefüllter Scheibe;
- die Füllung stimmt mit der Klasse der Antwort überein — niemand darf einem
  ungemessenen Zustand die Füllung eines gemessenen geben.

Der dritte und der vierte Punkt sind die, die ohne Test verrutschen.

### Was das kostet

**Fünf Bauteile haben in G6 keinen Aufrufer.** `EmptyState`, `ErrorPanel`,
`LoadingLines`, `DegradedNotice` und `StateWord` stehen im Baum, und gerendert
werden sie zuerst von G7s Galerie, eingesetzt von H6, H9 und H13. (Dieser Absatz
sagte zuerst „vier" — `StateWord` teilt sich eine Datei mit `StatusDot` und ist
beim Zählen durchgerutscht. Korrigiert in der Abnahme, nachgezählt mit `grep`.) Das ist der Preis dafür,
die Zustandssprache an einer Stelle zu entscheiden statt in fünf H-Phasen
nebeneinander — und er wird hier benannt, nicht versteckt.

**Sechs Wörterbuchschlüssel in drei Sprachen, eine davon gefüllt.** Wie alles
seit G5: der Mechanismus steht, der Inhalt kommt in P6.

**Ein Bauteil im Meta-Balken statt einer Zeichenkette.** `onlineText` ist fort,
`FooterHealth.online: boolean | null` ist `status: … | null` geworden, und drei
Aufrufer mussten mit. Der Gegenwert ist, dass Fußzeile, Menüstreifen und
Startseite denselben Zustand nicht mehr auf drei Arten zeichnen können.

**Nichts davon ist im Browser geprüft, bevor ein Produktionsbild läuft.**
`next dev` hydriert nicht; die Abnahme misst gegen ein lokal gebautes Image, wie
schon G5.

## Verworfene Alternativen

**Ein zweites Keyframe für den gefärbten Puls.** `@keyframes ts-pulse` in
`globals.css` umzuschreiben wäre die dritte benannte Abweichung von einer Datei
gewesen, deren Kopf sagt, dass kein Wert in ihr unserer ist. Eine Kopie daneben
hätte zwei Keyframes erzeugt, die auseinanderlaufen können. Die lokale
Neudefinition der zwei Custom Properties tut dasselbe mit null neuen Zeilen im
Original.

**Alle vier Vertragsvokabulare gleich mit abbilden.** `SystemState`,
`TrackState` und `DayState` stehen im generierten Typ und wären billig gewesen.
Sie wären auch ungeprüft gewesen: kein Aufrufer, kein Endpunkt, den `web/` je
gelesen hat, und damit eine Tabelle, die aussieht wie eine Antwort. Die Regel
steht stattdessen im Abschnitt oben.

**Den Puls als zweites Merkmal zählen.** Naheliegend, weil das Handoff-Bauteil
ihn zeichnet und der Bauplan ihn in derselben Zeile nennt wie das
Abnahmekriterium. Er fällt unter `prefers-reduced-motion` ersatzlos weg; ein
Merkmal, das eine Systemeinstellung abschaltet, ist keins.

**`— NO DATA` übersetzen.** STATE.05 verlangt Übersetzung für die Zustände, und
die Versuchung ist, das auf alles auszudehnen. `[SOON]` hat denselben Weg schon
einmal gehen müssen und ist in Design-Korrektur #6 auf ein Token über alle drei
Sprachen zusammengezogen worden; `— NO DATA` ist dieselbe Sorte Zeichenkette.

**`OFFLINE` streichen.** Es ist aus `/api/health` unerreichbar, und ein Wort
ohne Erzeuger sieht wie toter Code aus. Es bleibt, weil H1 und H6 Systeme
anschließen, die von einer Sonde gemessen werden statt von ihrer eigenen
Antwort — dort ist OFFLINE herstellbar. Was verschwunden ist, ist der *Zweig*,
der es aus einer Health-Antwort erzeugen wollte.

## Belege

Build-Plan Zeile 1214 (Phase G6) · Kapitel 8.5 (Schleife pro Phase) ·
`docs/design/State Language - timseil.dev.dc.html` (SYS.00.03, STATE.05) ·
`docs/design/Handoff - timseil.dev.dc.html` (Bauteil-Inventar) ·
ADR 0042 (Tailwind ohne Palette) · ADR 0043 (die sieben Paletten) ·
ADR 0044 (jede Verzweigung in `lib/`) · ADR 0046 (die Sprachroute) ·
`backlog.md`, 28.08.2026, G4 („`online: false` ist unerreichbar, und DEGRADED
hat kein Wort") · Issue #157
