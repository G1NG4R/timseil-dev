# ADR 0052 — Fünf Kacheln, eine Abdeckung und drei Zahlen, die in zwei Fassungen standen

**Status:** Angenommen
**Datum:** 2026-08-30
**Betrifft:** H1, H2, H5, H6 — schließt die offenen Punkte aus [ADR 0044](0044-das-chrome-die-uhr-die-nicht-luegt-und-fuenf-luecken-im-entwurf.md) §„Fünf Lücken"
**Invarianten:** 1 (keine erfundenen Zahlen), 6 (ein Tag ohne Messung ist `nodata`), 7 (das Fenster ist 91 Tage), 8 (keine Farbe außerhalb `tokens.css`)

## Kontext

H1 baut die erste Inhaltsseite dieser Website. Sie stößt dabei auf fünf
Entscheidungen, die keine Vorphase treffen konnte, weil sie erst entstehen, wenn
Kopf, Spec-Rail und Metriken zum ersten Mal auf derselben Seite stehen.

**Die Datenlage ist der eigentliche Kontext.** `api/internal/seed/seed.sql`
schreibt keine Messwerte — „a measurement that a seed writes is an invented
number" — also steht `timseil.dev` auf `live` und zeigt trotzdem in jeder Kachel
`— NO DATA`. Der Leerzustand ist hier nicht der Randfall, sondern der Normalfall
am ersten Betriebstag. Case Study 02 macht ihn zur Aussage statt zur Lücke.

## Entscheidung

### 1 · Fünf Kacheln, nicht drei

Beide H1-Blätter zeichnen die Metrikreihe, und sie zeichnen sie verschieden.
`Case Study Template` zeigt **drei** randlose Kacheln mit Platzhalterzahlen in
eckigen Klammern; `Case Study 02` zeigt **fünf** umrandete, alle `— NO DATA`,
unter einer Amber-Notiz, die erklärt warum.

**Fünf.** Drei Quellen gegen eine:

| Quelle | Aussage |
|---|---|
| `Case Study 02` | fünf Kacheln: `UPTIME · 91 D` · `P95` · `ERROR RATE` · `DEPLOY · MEDIAN` · `INCIDENTS` |
| `Intermediate Widths`, Register | Ops-Kacheln als `5 × 1fr`, Mindestbreite 120px je Kachel für `— NO DATA` |
| `Consistency Check` K-29 | „die fünf Ops-Kacheln brechen 5 → 3 → 2" |

Dazu ein vierter Beleg, der schon im Repository lag: `web/styles/layout.css`
trägt seit G1 `repeat(3)` unter 720 und `repeat(2)` unter 560 für `.ops-tiles` —
Umbrüche, die bei drei Kacheln nie greifen. Die Datei ist wortgleich aus dem
read-only Handoff kopiert worden, also hat der Entwurf die Fünf mitgeliefert,
bevor irgendjemand sie gezählt hat.

Die Vorlage bleibt die Quelle für die **Struktur** (Eyebrow, `h1`, Lead,
Alert-Zeile, `.01 PROBLEM`, die fünf Constraints), Case Study 02 für die
**Kachelreihe** und ihre Notiz. Der Bauplan entscheidet den Schnitt: H1 nennt
ausdrücklich „Problem-Abschnitt, Constraints", und nur die Vorlage hat einen.

### 2 · Die Abdeckung steht unter der Prozentzahl (#208)

`uptime90d` liest 100, ob fünf der einundneunzig Tage gemessen wurden oder alle.
Auf der Fallstudie steht die Zahl außerdem **ohne das Raster daneben** — das
kommt erst mit H2.

**`MetricTile` bekommt eine dritte Zeile, und die Seite zählt sie selbst:**

```
UPTIME · 91 D          UPTIME · 91 D
  — NO DATA              100.00 %
  0 of 91 days measured  8 of 91 days measured
```

`SystemDetail` liefert `days[]` mit, und ein Tag ohne Prüfung ist `nodata`
(Invariante 6). Die Zählung ist damit eine Ableitung aus vorhandenen Daten und
**kein Contract-Feld**. Die Fensterzahl kommt aus `body.window`, nie aus einer
Konstanten: Invariante 7 will, dass die 91 nachzählbar bleibt, und eine
Konstante läse weiter 91, wenn jemand `?window=30` fragt.

**Antwortet die API gar nicht, trägt die Kachel kein Fenster** — sie heißt dann
`UPTIME` statt `UPTIME · 91 D`. 91 ist der Vorgabewert des Contracts, und ihn
dort zu drucken wäre die erste erfundene Zahl auf einer Seite, die gegen
erfundene Zahlen gebaut ist.

### 3 · Die drei Chrome-Fragen aus #240

**a · Der Sticky-Offset bleibt 90px.** Zwei Fassungen:

| Quelle | Wert | Rang |
|---|---|---|
| `docs/design/code/layout.css` → `web/styles/layout.css:40` | `top: 90px` | Handoff, ausführbar, read-only, seit G1 ausgeliefert |
| `docs/build-plan.md:1228` | „Spec-Rail sticky bei `top: 96px`" | Prosa des Bauplans |

CLAUDE.md: *„Form gilt, Fakten aus dem Build-Plan gewinnen."* Ein Offset ist
Form, also gewinnt das Blatt. Die 96 wird hier benannt statt still übergangen.

**Der Kopf bleibt statisch.** ADR 0044 hat das entschieden, weil kein Blatt einen
gescrollten Zustand zeichnet, und die Nachprüfung hierher verschoben. Sie ist
gemacht: `66 + 24 = 90` ist eine Herleitung, kein Satz aus einem Blatt, und die
Rail steht unter einem statischen Kopf genauso richtig — sie beginnt 90px unter
der Fensterkante und nicht 90px unter einem Kopf, der mitfährt. Ein sticky Kopf
wäre eine Erfindung mit einer Rechnung als einzigem Beleg.

**b · Der Nav-Abstand bleibt 30px.** Das Chrome-Blatt ist die verbindliche
Fassung und sagt 30; sieben von zehn Seitenblättern sagen 32. Gebaut ist 30,
`--s-30` steht bewusst außerhalb des 4px-Rasters, und `styles/tailwind.test.ts`
nagelt das von beiden Seiten fest (`p-30` löst auf, `p-32` nicht). Entschieden
nach Quellenrang; die zehn Blätter werden nicht nachgezogen, weil sie read-only
sind und die gebaute Seite die Fassung ist, die jemand ansieht.

**c · Der Statuspunkt der Fallstudie ist der kleine.** Drei Zahlen in drei
Quellen: `state.css` setzt 7px, `chrome.css` setzt 6px für Fußzeile und
Menüstreifen, das Template zeichnet im Hero-Eyebrow 5px. `Consistency Check`
K-14 entscheidet es ohne eine vierte Zahl: *„Statuspunkt in der Meta-Leiste jeder
Seite; groß im Hero nur auf der Startseite."* Die Fallstudie trägt also den
gewöhnlichen Punkt — `StatusDot` unverändert, 7px. **Nicht gemittelt**: ein
gemittelter Wert hat keinen Beleg hinter sich.

### 4 · Der Compose-Ausschnitt wird erzeugt, nicht abgetippt (#75)

Der Block gehört zu `.03 BUILD` und wird in H2 gerendert. H1 baut das, was ihn
davon abhält, falsch zu sein: `tools/gen-compose-excerpt.sh` schneidet ihn aus
dem ausgelieferten `compose.yaml`, `make gen` schreibt ihn, und die erzeugte
Datei hängt in der `GENERATED`-Liste, die `make check-contract` über Prüfsummen
vor und nach `make gen` hält.

Damit ist Drift nicht mehr eine Sache der Aufmerksamkeit, sondern ein roter
Build — dieselbe Form wie `stack.yaml`, wo seit B4 niemand mehr eine
Versionsnummer tippen kann. Die fünf Widersprüche des Blattes lösen sich dabei
von selbst auf, darunter der, der die Datei unbrauchbar machte: das
Produktionsimage ist distroless, und die `wget`-Sonde des Blattes würde **jeden
gesunden Container als krank melden**.

### 5 · Der Zustand `in_build` bekommt hier kein Wort

`lib/state/derive.ts` bildet `SystemState` ab, weil H1 den Endpunkt zuerst liest
— das ist die Regel im Kopf der Datei. Abgebildet werden `live` und `queued`;
`in_build` ergibt `null` und rendert `— NO DATA`.

Die Zustandssprache kennt acht Einträge und keiner heißt „im Bau". Das Label
`IN BUILD` steht auf dem Work-Index-Blatt, das `INDEX.md` H6 zuweist — der Phase,
in der alle drei Systemzustände nebeneinanderstehen und ein neunter Eintrag Ton,
Punktform und Wörterbuchschlüssel mit je einem Blatt dahinter bekommen kann. Der
Seed hat ein `live`- und ein `queued`-System; ein Wort für den dritten wäre ein
Zustand, den niemand gesehen hat.

## Konsequenzen

**Der Preis der fünf Kacheln:** die Vorlage zeigt an dieser Stelle etwas
anderes als die gebaute Seite, und wer beide nebeneinanderlegt, muss diesen
Abschnitt lesen, um zu verstehen warum. Der Blattvergleich in H1b prüft deshalb
Geometrie und nicht Kachelzahl.

**Der Preis der Abdeckungszeile:** Badge und Fußzeile führen dieselbe
Prozentzahl weiterhin ohne sie, und dort gibt es kein `days[]`. Das ist eine
Contract-Frage (`Metrics.measuredDays`), die `/api/health`, `OpsSummary` und drei
Badge-Routen mitträfe — als Issue notiert, fällig mit H5, wo die Startseite die
Zahl ein zweites Mal zeigt. **#208 selbst ist beantwortet**, es fragte nach der
Fallstudie.

**Der Preis der 90px:** Der Bauplan behält eine Zahl, die nicht gilt. Kapitel 6.3
hat schon einmal eine zweite Kopie einer Zuordnung geführt und sie ist gedriftet;
hier steht die Korrektur in einem ADR statt in einer zweiten Tabelle.

**Der Preis von `DEPLOY · MEDIAN`:** Die Kachel zeigt eine Zahl, deren Bedeutung
offen ist. `durationSec` misst laut #242 den Pipeline-Lauf statt des Deploys —
über vier Deploys 238 · 270 · 263 Sekunden gegen einen deutlich kürzeren
`deploy`-Job. H1 druckt, was die API sendet, und benennt es hier; H2 entscheidet,
was sie senden soll. Die Alternative wäre gewesen, die Kachel leer zu lassen,
was eine gemessene Zahl versteckt hätte, oder sie kommentarlos zu zeigen, was ihr
eine Bedeutung untergeschoben hätte.

**Der Preis des unteren Medians:** Bei gerader Anzahl ist der Median hier der
untere der beiden mittleren Werte, nicht ihr Mittel. 42 und 43 haben keinen
Mittelpunkt, den ein Deploy gebraucht hat. Der Wert ist damit minimal
konservativ und immer eine Dauer, die stattgefunden hat.

**Was dazukommt:** ein Token (`--glow-alert`, aus `--alert` abgeleitet wie
`--glow` aus `--acc`), ein Stylesheet (`styles/case.css`), acht
Wörterbuchschlüssel, ein `cacheLife`-Profil und ein optionales `note` an
`MetricTile`. `styles/ui.css` zieht aus der Galerie in das Seiten-Layout — die
Datei hat sich das seit G7 selbst so aufgeschrieben.

## Verworfene Alternativen

**Drei Kacheln, nach der Vorlage.** Ließe die `5 → 3 → 2`-Umbrüche in
`layout.css` ohne Konsumenten und widerspräche dem Register, das die Zeile
rechnerisch auf fünf auslegt. Ein Blatt gegen drei.

**Ein Contract-Feld `measuredDays` sofort.** Es ist die richtige Antwort für
Badge und Fußzeile und die falsche für diese Phase: es zöge `/api/health`, den
Snapshot-Schreiber und drei Badge-Routen in eine Phase, die eine Seite baut.
`days[]` liegt hier ohnehin auf dem Tisch.

**Die Kachel unter einer Mindestabdeckung unterdrücken.** Tauscht eine
Übertreibung gegen eine andere: 100 % über acht Tage **ist** gemessen, und
`— NO DATA` wäre dort die unehrlichere Aussage.

**Den Kopf sticky bauen.** ADR 0044 hat es abgelehnt und die Ablehnung hält:
`.rail { top: 90px }` klingt nach 66px Kopf plus Luft, aber das ist eine
Herleitung aus einer Zahl, kein Satz aus einem Blatt.

**Die Prosa nach `lib/i18n/messages/`.** `resolveMessages()` verwirft eine
unvollständige Sprache ganz. Drei Absätze Fließtext dort hingen die halbe Seite
an einer Übersetzung auf, die es bis P6 nicht gibt.

**Die Prosa als MDX.** Der Renderer kommt mit H9, und #192 sagt, dass das
Frontmatter-Schema bis dahin erfunden ist. Ein getipptes Modul ist heute unter
`node --test` prüfbar.

**Slug-Prüfung gegen das Contract-Muster in `web/`.** Das Muster steht schon im
Contract und als CHECK in Migration 00002; eine dritte Kopie driftet von beiden.
`lib/http/url.ts` prüft stattdessen, was ihm allein gehört — dass nichts das
Pfadsegment verlässt —, und `content/case-studies` entscheidet, ob die Seite
gemeint war.

## Belege

Bauplan Teil II (H1, H2) · Kapitel 3, 6.2, 12.1, 12.3 · Kapitel 7 Korrekturen
#1, #2 · `docs/design/Case Study Template - timseil.dev.dc.html` ·
`docs/design/Case Study 02 - timseil.dev.dc.html` ·
`docs/design/Intermediate Widths - timseil.dev.dc.html` (Register, LAYOUT.03) ·
`docs/design/Consistency Check - timseil.dev.dc.html` (K-08, K-14, K-16, K-21,
K-29) · `docs/slo.md` („Was diese Zahl nicht sieht") · ADR 0035 · ADR 0042 ·
ADR 0043 · ADR 0044 · ADR 0048 · ADR 0049 · ADR 0051 · Issues #75, #208, #240,
#242
