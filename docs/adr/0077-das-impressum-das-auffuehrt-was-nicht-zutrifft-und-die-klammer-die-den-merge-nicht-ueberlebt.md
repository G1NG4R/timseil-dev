# ADR 0077 — Das Impressum, das aufführt was nicht zutrifft, und die Klammer, die den Merge nicht überlebt

**Status:** Angenommen
**Datum:** 2026-09-12
**Betrifft:** H12c, K1, M2, M4 — und jeden, der den Text von `/imprint` oder `/privacy` ändert
**Invarianten:** 1 (keine erfundenen Zahlen), 8 (Tokens)

## Kontext

H12a hat die Aufbewahrungsschleife gebaut (ADR 0075), H12b hat `/privacy`
geschrieben (ADR 0076). H12c schreibt die zweite Hälfte: `/imprint`, den
Verweis zwischen beiden Seiten, und die SEO-Freigabe für die letzte Route
dieser Seite, die noch eine Hülle war.

Zwei Vorgänge stehen dahinter, und sie haben unterschiedliches Gewicht.

**Der erste ist wie in H12b: das Blatt ist älter als der Code.** Artboard 1a ist
vom 16.08.2026 und trägt fünf Stellen, die so nicht gebaut werden konnten:

| Das Blatt sagt | Was gilt | Beleg |
|---|---|---|
| *„There is no CDN and no third party in the request path"* (`:84`) | Gilt für **diese Anwendung**. Über Netzinfrastruktur davor macht diese Seite keine Zusage — derselbe Satz, den 07.05 in H12b einschränken musste | ADR 0076 §5 |
| *„Fragen dazu gern über das Formular auf /contact →"* (`:83`) | Deutsch in einer englischen Oberfläche — dazu zwei deutsche Klammern, `:74` und `:76` | CLAUDE.md · Sprache |
| `PHONE [OPTIONAL — WEGLASSEN IST ZULÄSSIG]` (`:76`) | Ein Feld, dessen Wert sagt, dass das Feld weggelassen werden darf, ist kein Feld. Die Zeile entfällt | – |
| `[HOSTING PROVIDER, LEGAL NAME AND ADDRESS]` (`:83`), `[REGISTRAR]` (`:84`) | Eine Firma, einmal genannt. Host, DNS und Mail sind OVH; Rechtsform und Sitz hat nur der Betreiber | CLAUDE.md · Stack |
| `LAST REVISED [DATE]` in der Fußleiste (`:127`) | Steht im `main`. Das Chrome-Blatt ist die verbindliche Fassung des Footers und zeichnet die Zeile nicht | ADR 0076 §6 |

**Der zweite ist ein Vorfall, und er ist der eigentliche Anlass dieses ADR.**
H12b ist mit zwei Klammern live gegangen: `[ADDRESS]` in 07.01 und
`[OVH LEGAL ENTITY AND LOCATION]` in 07.06 standen nach dem Merge auf einer
öffentlichen, indexierbaren Seite darüber, was mit den Daten anderer Leute
passiert. Beide waren bekannt, beide waren beabsichtigt, und beide waren
**geprüft**: `content.test.ts` hielt die Klammern als exakte Menge fest, damit
sie nur absichtlich schrumpft. Der Test war grün, als der Merge-Knopf gedrückt
wurde. Er hat genau das getan, wonach er gefragt worden war.

Der Fehler lag in der Frage, nicht in der Antwort. Niemand hatte die Bedingung
aufgeschrieben, auf die es ankam — nicht „ist die Menge exakt richtig", sondern
**„ist die Menge inzwischen leer"**. Eine erlaubte Menge ist das richtige
Werkzeug, solange eine Seite entsteht, und das falsche in dem Moment, in dem sie
hinausgeht; keine Maschine dieses Repositories wusste, in welchem der beiden
Momente sie gerade war.

## Entscheidung

### 1. Keine Rechtsseite trägt eine Klammer

`lib/legal/brackets.test.ts` fegt beide Seiten und lässt jede eckige Klammer
fallen. Keine Liste, keine Ausnahme, kein Eintrag, mit dem man sich
vorbeidiskutiert — der einzige Weg daran vorbei ist, die Frage zu beantworten,
für die die Klammer steht. Dazu eine zweite Prüfung auf dieselbe Zusage in
Worten: `TBD`, `to be added`, `coming soon`, `SOON`, `TODO`.

**Der Preis ist eingeplant und nicht ein Nebeneffekt:** Die Phase, die eine
Rechtsseite schreibt, ist rot, bis die Angaben da sind, die nur der Betreiber
hat. Genau das war in H12b die fehlende Sperre.

Und es ist **kein neues `make`-Ziel**. Der Test läuft in `npm test` →
`make check-web` → `make check`, wie `retention.test.ts`; `selftest.sh` bleibt
eingefroren und die Liste der zweiundzwanzig Regeln bleibt bei zweiundzwanzig.
CLAUDE.md verlangt für eine neue Prüfregel einen Vorfall, den man benennen kann.
Der Vorfall steht oben.

### 2. `NOT APPLICABLE` wird gezeichnet, nicht weggelassen

Vier Pflichtangaben, die es hier nicht gibt — Handelsregister, USt-IdNr.,
Aufsichtsbehörde, Streitschlichtung —, stehen als Liste auf der Seite. Das
Blatt begründet es in einer Zeile: *„damit ihr Fehlen als Entscheidung lesbar
ist, nicht als Versäumnis"*.

Es ist derselbe Zug, den 07.03 auf der anderen Seite macht: der Abschnitt, dessen
Thema sich als nicht existent herausstellte, behält seine Nummer und antwortet
„niemand". Eine **benannte** Abwesenheit ist eine Zusage, an der man mich messen
kann; eine weggeräumte ist keine.

Die Liste ist **kein Abschnitt** und steht nicht in `IMPRINT_SECTIONS`. Eine
Sprungliste, die „Dinge, die nicht zutreffen" als fünftes Ziel anbietet, ist ein
Inhaltsverzeichnis für eine Leerstelle.

### 3. Der Drittanbieter-Satz bekommt in 06.02 denselben Geltungsbereich wie in 07.05

Die Seite sagt, was sie belegen kann — eine Herkunft in der Netzwerkspalte, für
diese Anwendung und die Seiten, die sie ausliefert — und sagt ausdrücklich, dass
sie über den Weg davor nichts verspricht. `imprint.test.ts` hält **beide
Hälften**: der flache Satz darf nicht zurückkommen, und die einschränkende
Klausel muss dastehen. Nur die erste Hälfte zu prüfen hieße, das Weglassen der
Klausel grün zu bekommen — und genau durch Weglassen ist der Satz entstanden.

Der Befund, der dahinter steht, gehört nicht hierher: CLAUDE.md hält den
Ist-Stand jeder Sicherheitsfrage dieses Hosts von jeder nach außen gehenden
Fläche fern, und ein ADR ist eine. Er steht in `backlog.local.md`.

### 4. Zwei Listen in einem `sections.ts`, zwei Texte in getrennten Dateien

Was die Seiten an **Ordnung** teilen — die `Section`-Form, der abgeleitete
Anker, das Paar `reasonKey`/`owedBy` aus STATE.05, die Sprungliste — steht
einmal da. Was sie an **Prosa** teilen: nichts.

`sectionNumber()` bekommt dafür das Argument `page`. Vorher stand `^07\.` fest
im Parser, und `06.01` antwortete `null` — richtig, solange das Impressum eine
Hülle war, und eine stille Unwahrheit in dem Moment, in dem es keine mehr ist.
Die Frage, die der Test stellen will, ist „ist das einer der Marker **dieser**
Seite", und die behält so eine Antwort.

### 5. Die Sticky-Position wandert von der Sprungliste auf die Spalte

`.lg-rail` war bis hierher die ganze Spalte. Sie hat jetzt Nachbarn — die
`SEE ALSO`-Karte auf beiden Seiten, die `NOT APPLICABLE`-Liste im Impressum —,
und ein `position: sticky` an der Liste würde gegen einen Wrapper von der Höhe
seiner eigenen drei Kästen messen, also aufhören zu kleben. `.lg-aside` klebt,
`.lg-rail` nicht mehr.

Unter 1080 verschwindet weiterhin **nur** die Sprungliste. Die beiden anderen
Kästen sind Dokument und nicht Navigation, und das mobile Artboard zeichnet sie
genau so.

### 6. `/imprint` wird indexierbar, und damit ist die Tabelle vollständig

`lib/seo/pages.ts` kippt die letzte Zeile. Die beiden Rechtsrouten sind eine
Phase auseinander freigegeben worden — eine Datenschutzseite, die auf ein
Impressum wartet, ist eine, die niemand findet — und das ist dieselbe
Entscheidung, die diese Tabelle vorher zweimal getroffen hat: eine Fallstudie war
indexierbar vor `/work`, die Log-Einträge vor `/blog`.

## Konsequenzen

- Die Seite hat **keine `[SOON]`-Hülle mehr**. Jede Route in
  `lib/seo/pages.ts` sagt etwas, und die nächste, die dazukommt, fängt wieder
  bei `false` an.
- **Das mobile Artboard zeichnet `/imprint` nicht als Seite.** 1c ist ein
  390-Rahmen mit beiden Dokumenten untereinander — Datenschutz zuerst, Impressum
  hinter einer Linie, als `<h2>` in 28px und ohne Sprungliste. Gebaut sind zwei
  Routen, also ist die Überschrift ein `<h1>` und nimmt den mobilen Display-Schritt
  34. Das Orakel führt das als `imprint-drawn-as-a-section` **einmal** und nicht
  dreimal.
- **Eine Client-Navigation lässt die verlassene Seite im Dokument stehen**,
  versteckt. Nach dem Klick auf `SEE ALSO` hält `main` zwei `.lg`-Bäume: den
  angezeigten und den, der es war — mitmontiert, damit der Rückweg sofort da
  ist. Kein Mangel: `display: none` nimmt den alten Baum aus dem
  Accessibility-Baum und aus der Tab-Reihenfolge. Aber eine Regel für jeden
  Test dieser Seite, der von einer Seite auf eine andere klickt: **ein globaler
  Selektor trifft nach einer Navigation auch die Seite, die man verlassen hat.**
  Gefunden als Strict-Mode-Verstoß über zwei `main h1`.
- `track-count` im Orakel misst nur dort etwas, wo noch ein Grid steht.
  `getComputedStyle().gridTemplateColumns` löst auf einem `display: block`
  nicht auf, sondern gibt den angegebenen Wert zurück — `150px minmax(0px, 1fr)`
  zählt als drei Spuren. Die 390-Messung der Feldliste fragt deshalb nach
  `display`.

### Was das kostet

- **Ein roter Test als Zustand der Phase.** `brackets.test.ts` ist rot, solange
  Anschrift und Rechtsträger fehlen, und damit ist `make check` rot. Wer die
  Phase in diesem Zustand übernimmt, muss wissen, dass das die Sperre ist und
  nicht der Fehler. Der Preis der Alternative ist in H12b gemessen: zwei
  Klammern auf einer öffentlichen Seite.
- **Eine dritte Form für gelabelte Werte.** Die Seite hat jetzt `Readout`
  (gemessen), `Fields` (getippt) und die Tabellen. Eine Komponente, die
  gemessene und getippte Werte kann, würde von beidem nichts beweisen — aber es
  sind drei Bauteile für eine Grammatik, und das ist eins mehr als ein Blatt
  vermuten lässt.
- **`lib/legal/text.ts` ist Code, den niemand rendert.** Er existiert, damit drei
  Testdateien dieselbe Antwort auf „alles, was auf der Seite steht" benutzen.
  Der Preis ist ein Modul, das man pflegen muss: **eine neue Zeichenkette auf
  einer der beiden Seiten ist für jede Prüfung in diesem Verzeichnis unsichtbar,
  bis sie dort auftaucht.**
- **Die juristische Vollständigkeit prüft hier weiterhin keine Maschine.** Das
  Blatt sagt es selbst — *„Kein Rechtsrat"* —, und M4 ist die Stelle dafür.
- **DE/FR bleibt offen.** `/de` und `/fr` liefern englischen Text mit korrektem
  `textLang`, wie `/about` und wie `/privacy` seit H12b. Der Konsistenzlauf nennt
  K-03 Pflicht, fällig vor M6. Eine maschinelle Übersetzung eines Rechtstexts
  wäre schlechter als keine (ADR 0076 §7).

## Verworfene Alternativen

**Die erlaubte Klammermenge behalten und zusätzlich prüfen, dass sie vor dem
Merge leer ist.** Das wäre zwei Regeln, von denen eine die andere aufhebt, und
die Frage „welche gilt heute" wäre wieder eine, die ein Mensch beantwortet.
Genau diese Frage hat H12b falsch beantwortet.

**Die Klammern durch Beispieldaten ersetzen, bis die echten kommen.** Eine
plausible Adresse auf einer Rechtsseite ist schlechter als eine sichtbare
Lücke: Die Lücke erkennt jeder Leser, die erfundene Adresse niemand. Invariante
1 mit umgekehrtem Vorzeichen, dieselbe Begründung, mit der `ts404.best` in H12b
nicht in die Tabelle kam.

**06.03 und 06.04 auf dem Telefon zusammenziehen**, wie 1c es zeichnet. Ein
Rechtstext, der auf kleinen Geräten weniger sagt, ist ein zweites Dokument, das
niemand pflegt — dieselbe Begründung, mit der `/privacy` alle sieben Abschnitte
an jeder Breite rendert, obwohl das mobile Artboard fünf zeigt.

**Eine eigene `imprint.css`.** Die beiden Seiten sind ein Blatt und eine
Grammatik: dieselben Abschnittsköpfe, dieselben Tabellen, dieselbe Sprungliste,
dasselbe Lesemaß. Was sich unterscheidet, sind fünf Regeln.

**Die Kartenpolsterung auf dem Telefon nachziehen** (`16px 18px` statt
`20px 22px`). Vier Pixel in einem 346px breiten Kasten, dafür ein zweiter Wert,
der in Schritt gehalten werden muss. „Kein Bauteil bekommt seinen eigenen Wert"
gilt auch für einen Wert, den niemand sieht. Im Orakel als `one-card-padding`.

## Belege

- `docs/build-plan.md:1251` (H12), `:1337` (L7)
- `docs/design/Legal - timseil.dev.dc.html` — read-only, Artboards 1a und 1c
- ADR 0044 (Markup plus ein Aufruf), 0048 (Zustandssprache), 0055 (Tabellen
  unter dem Schalter), 0065 (kein Bauteil bekommt seinen eigenen Wert),
  0075 (die Frist), 0076 (die Seite, die den Code zitiert)
- `#221` (die dritte localStorage-Zeile), `#43` (die Frist auf der Seite)
