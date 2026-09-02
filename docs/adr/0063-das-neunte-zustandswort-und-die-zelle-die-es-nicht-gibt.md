# ADR 0063 — Das neunte Zustandswort und die Zelle, die es nicht gibt

**Status:** Angenommen
**Datum:** 2026-09-02
**Betrifft:** H6a, H6b, H9 — und jede spätere Fläche, die einen Systemzustand
oder eine Betriebszahl zeigt
**Invarianten:** 1 (keine erfundenen Zahlen), 5 (Belege zeigen nie ins Leere)

## Kontext

H6a baut `/work`, den Work Index. Es ist die erste Seite dieser Site, auf der
**alle drei Systemzustände des Contracts nebeneinanderstehen** — und die erste,
die unter der Liste eine Legende zeichnet, die sie definiert.

Damit fallen in einer Phase zwei Entscheidungen zusammen, die von zwei Seiten
dieselbe Frage stellen: *Was darf eine Zeile über ein System sagen, das nicht
läuft?*

**Die erste Hälfte ist ein fehlendes Wort.** `SystemState` führt seit B2
`live`, `in_build` und `queued`. `lib/state/words.ts` führte sieben Wörter plus
`nodata`, und keines davon hieß „wird gebaut". `systemStateWord()` antwortete
für den dritten Wert `null`, die Zeile schrieb `— NO DATA`, und das war fünf
Phasen lang die wahre Aussage „diese Seite kann es nicht sagen". Als **#289**
notiert, mit H6 als Fälligkeit — begründet damit, dass hier zum ersten Mal alle
drei Zustände zusammen zu sehen sind.

**Die zweite Hälfte ist eine erfundene Zahl, die das Blatt bestellt.** Die
Entwurfsnotiz des Work-Index-Blatts ist die Leitidee der Seite:

> Kein längeres SYS.02: jede Zeile trägt eine **Betriebszahl**, und welche,
> hängt vom Status ab — Uptime bei LIVE, letzter Commit bei BUILD, Spec-Zustand
> bei QUEUED

`System` trägt `slug`, `systemNo`, `name`, `state`, `source`, `stack` und vier
Metriken. **Es gibt keinen Commit, kein Datum und keinen Spec-Zustand** — weder
in diesem Objekt noch irgendwo sonst im Contract.

## Entscheidung

### 1. `in_build` bekommt ein Wort, und es ist QUEUEDs Marke

`MARKS` führt einen achten Eintrag: `IN BUILD`, `messageKey: "stateInBuild"`,
`tone: "dim"`, `answer: "unmeasured"`, `dot: "dash"`, `pulse: false`.

**Das ist Zeichen für Zeichen die Marke von QUEUED, und genau das ist die
Entscheidung.** Der Contract garantiert für jedes System, das nicht `live` ist,
`null` in allen vier Metrikfeldern — in SQL, im LATERAL, nicht in Go. Beide
Zustände sind also *unmeasured*, und `DOT_ANSWER` lässt für diese Klasse genau
eine Füllung zu.

Der naheliegende Ausweg wäre ein fünfter Ton gewesen. Er ist abgelehnt, weil
`words.test.ts` seit G6 genau dagegen gebaut ist: „has fewer tones than states,
so colour cannot name one." Bei einem Ton je Zustand **ist die Palette das
Vokabular**, und jedes zweite Merkmal in dieser Datei wird zur Dekoration.

Was die beiden trennt, ist das **Wort** — und ein Wort ist ein vollständiges
Merkmal: es übersteht eine Graustufen-Aufnahme, einen Palettenwechsel und einen
Screenreader, was kein Punkt von sich behaupten kann. Der Unterschied zwischen
IN BUILD und QUEUED ist keine Messung, sondern ein Plan; nichts hat ihn
gemessen, also darf nichts an der Marke etwas anderes behaupten.

**Das Blatt widerspricht und wird notiert statt befolgt.** Seine Legende malt
BUILD in `#B9C6D4` — ein Wert, der sonst nirgends im Blatt vorkommt und in
keinem Signal-Token steht. Er steht in `tokens.css`, aber als `--ink-3`: eine
**Text**-Farbe, im Blatt wie ein Signal benutzt. Das ist die Verwechslung, die
die Vier-Ton-Tabelle verhindert. ADR 0055 entscheidet den Fall: widersprechen
sich Zeichnung und ausgeliefertes Stylesheet, hat das Stylesheet recht.

**Ein Wort, eine Schreibweise.** Das Blatt schreibt `IN BUILD` in der Kachel und
`BUILD` im Chip und in der Legende. Gebaut ist `IN BUILD` überall: ein
Bedienelement, das anders heißt als die Zeile daneben, ist die Drift, gegen die
`words.ts` existiert.

### 2. Zwei der drei Betriebszahlen werden nicht gebaut, und die Zelle entfällt

`live` bekommt `UPTIME · 91 D` mit `metrics.uptime90d`. `in_build` und `queued`
bekommen **keine Zelle** — nicht `— NO DATA` darin.

Die beiden sagen Verschiedenes, und der Unterschied ist Invariante 1 in einer
Tabellenzelle:

| | heißt |
|---|---|
| `— NO DATA` in der Zelle | eine Messung wurde versucht und ist nicht angekommen |
| keine Zelle | niemand versucht hier zu messen |

Niemand misst die Uptime eines Systems, das nicht läuft. **ADR 0055 hat
denselben Schnitt schon einmal gezogen** — für die Hop-Latenzen der Fallstudie —
und `lib/home/systems.ts` ein zweites Mal, für `blurb`: worüber niemand je etwas
schreiben wird, bekommt keine Zelle statt eines Gedankenstrichs.

**Das Blatt stimmt an dieser Stelle mit sich selbst nicht überein**, und die
gezeichnete Hälfte gewinnt: seine Notiz bestellt drei Zahlen, aber **beide
gezeichneten Nicht-LIVE-Zeilen tragen `— NO DATA`**, keinen Commit und keinen
Spec-Zustand. Eine Absicht ist keine Messung.

**`live` ohne Zahl behält seine Zelle**, und das ist der heutige Zustand dieser
Site: die Snapshot-Schleife hat noch nichts geschrieben, das Label steht, der
Wert ist `— NO DATA`. Beides zusammenzuwerfen hieße, genau die Unterscheidung zu
verlieren, um die es geht.

### 3. Das Fenster im Label ist das des Feldes, nicht das der Anfrage

`UPTIME_WINDOW_DAYS = 91` steht in `lib/work/figure.ts` und ist **nicht**
`OPS_WINDOW_CASE`, obwohl beide 91 sind.

`OPS_WINDOW_CASE` ist das Fenster, das diese Site vom Detail-Endpunkt
**anfordert** — Mitglied des `window`-Enums, Argument, Teil eines Cache-Keys —
und die Fallstudie beschriftet ihre Kachel mit dem, was **zurückkam**, nicht mit
dem, was sie geschickt hat. `metricTiles` sagt in eigenen Worten, warum:
`UPTIME · 91 D` ohne ein `window` aus der Antwort „wäre die erste erfundene Zahl
auf einer Seite, die gegen sie gebaut ist".

`/api/systems` nimmt keinen Parameter und sendet kein `window`. Hier ist die 91
also eine **Eigenschaft des Feldes**, festgelegt in dessen eigener Beschreibung:

> The name says 90 for historical reasons; the window is **91 days** (13 × 7)
> everywhere else in this contract and on the site.

Die beiden Zahlen sind heute gleich **aus Übereinstimmung, nicht aus
Identität**. Sie unter einer Konstante zu führen hieße, zwei verschiedene
Aussagen zu einer zu machen — und die eine würde die andere mitziehen, sobald
jemand ein Fenster ändert.

## Folgen

- `lib/state/words.ts` führt neun Schlüssel. Drei Prüfungen sind rot geworden
  und waren genau dafür geschrieben: die Literal-Liste in `registry.test.ts`
  („if a ninth key is ever added, this is what says so"), die `— NO DATA`-Zusage
  in `systems.test.ts` und die Zustandsspalte in `gallery.systems.spec.ts`.
- `systemStateWord` bildet alle drei Contract-Werte ab **und verweigert
  weiterhin**: ADR 0035s überlappender Start lässt einen vierten Wert auf die
  Leitung. Kleiner geworden ist die Menge, die dort landet, nicht der Zweig.
- Die Zustandssprache hat jetzt **drei Wörter mit demselben Ton** (`in_build`,
  `queued`, `empty`). Das ist die Tabelle, wie sie gedacht ist, und
  `words.test.ts` hält den Fall mit einer eigenen Zusicherung fest, damit der
  fünfte Ton eine Änderung an einer gelesenen Zeile kostet.
- **`/work` zeichnet die Legende, die dieses ADR nötig gemacht hat.** Eine
  Legende kann kein Wort definieren, das die Seite nicht zeichnen kann — das ist
  der Grund, warum #289 in dieser Phase fällig war und nicht in einer späteren.
- Die Betriebszahl bleibt einspaltig, solange der Contract eine Zahl trägt.
  Kommt je ein Commit oder ein Spec-Zustand dazu, ist `lib/work/figure.ts` die
  eine Stelle, die es erfährt.

## Alternativen

**Ein fünfter Ton für `in_build`.** Abgelehnt, siehe oben: er hätte Töne und
Zustände auf eine Eins-zu-eins-Zuordnung zugetrieben und damit die
Zusicherung ausgehöhlt, die seit G6 die tragende ist.

**`in_build` weiter auf `null` lassen und die Legende bei zwei Wörtern.** Wäre
ehrlich gewesen und hätte die Seite kaputt gemacht: das Blatt zeichnet drei
Zustände in der Statistikleiste, in der Filterreihe und in der Legende, und eine
Kachel `IN BUILD 00` neben einer Legende, die IN BUILD nicht erklärt, ist eine
Seite, die ihr eigenes Vokabular nicht kennt.

**`— NO DATA` in der Betriebszelle jeder Nicht-LIVE-Zeile.** Die bequeme
Variante — jede Zeile sieht gleich aus. Sie behauptet aber für zwei von drei
Zuständen eine versuchte Messung, und die Unterscheidung, die dieses Projekt
teuer bezahlt hat, wäre in genau der Spalte weg, in der sie am meisten zählt.

**„Letzter Commit" aus der GitHub-API holen.** Eine neue ausgehende Abhängigkeit
für eine Zelle, dazu ein Feld, das der Contract nicht führt, und eine Zahl, die
`/api/systems` einem fremden Leser nicht bestätigen könnte — ADR 0004s ganze
Zusage („eine Zahl auf der Seite, die die API nicht hergibt, ist ab jetzt
öffentlich als Erfindung erkennbar") wäre für eine Dekoration gebrochen.
