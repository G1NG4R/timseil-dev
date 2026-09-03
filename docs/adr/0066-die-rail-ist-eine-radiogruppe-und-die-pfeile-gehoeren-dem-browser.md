# ADR 0066 — Die Rail ist eine Radiogruppe, und die Pfeile gehören dem Browser

**Status:** Angenommen
**Datum:** 2026-09-03
**Betrifft:** H7b — die Trajectory-Rail auf `/about`; schuldet K2 fünf Absätze
und berührt ADR 0064, dessen Insel hier nicht gebraucht wurde
**Invarianten:** 1 (keine erfundenen Zahlen), 5 (Belege zeigen nie ins Leere),
8 (keine Farbe, kein Radius, keine Dauer außerhalb `tokens.css`)

## Kontext

Der Bauplan nennt die Rail „der große interaktive Moment" der Seite: Jahre
klickbar, ← → per Tastatur. ADR 0064 hat H7 vorab die Insel aus H6b zugewiesen —
server-gerenderte Knoten, ein `useState`, gefiltert wird durch Nicht-Rendern.

Das Blatt baut sie als Skript: sechs `<div tabindex="0" role="button">`, ein
`onKeyDown`, das ArrowLeft/Right/Up/Down samt Klammerung von Hand nachbaut, und
ein `paint()`, das bei jedem Wechsel sechs Farbliterale in `style.background`
schreibt.

Beides ist mehr, als die Aufgabe braucht.

## Entscheidung

### 1. Sechs Radios, sechs Labels, kein Skript

Eine native Radiogruppe gibt genau das, was das Blatt-Skript nachbaut:

| Was gebraucht wird | Woher es kommt |
|---|---|
| ← → auswählen | nativ |
| ↑ ↓ auswählen | nativ — und das braucht die senkrechte Form unter 720 |
| **ein** Tabstopp für sechs Stationen | nativ (Roving Tabindex) |
| Klick wählt | `<label for>` |
| Zustand ohne Skript | `:checked` |

**Gemessen, nicht gehofft:** `/about` bleibt **byte-gleich mit `/`** — 143 856 B
gzip über 7 Dateien, im selben Build, nach ADR 0064s Methode von Hand gemessen.
Der interaktive Moment dieser Seite kostet **null Byte**. `/work`s Insel kostet
zum Vergleich 1 626 B.

**Der schärfere Grund ist aber nicht das Budget, sondern #244.** Unter
`cacheComponents` bleibt ein Stream-Platzhalter ohne JavaScript stehen. Eine
Rail, die ohne Skript auch stünde, wäre das **zweite** Ding auf dieser Site, das
nicht funktioniert — auf der Seite, deren ganzes Argument ist, dass sie nur
sagt, was sie belegen kann. `e2e/about.spec.ts` fährt sie deshalb einmal mit
abgeschaltetem JavaScript: klicken und ← →, beides muss das Panel wechseln. Das
ist die eine Zusicherung, die ein handgeschriebener Tastatur-Handler nicht
bestehen könnte.

`components/case/OpsGrid.tsx` ist H2b denselben Weg gegangen — „a notch that
needs no script".

### 2. Der Zustandsautomat sind drei Selektoren und eine Reihenfolge

```css
.tl-item                   /* past   — der Default */
:checked ~ .tl-item        /* future */
:checked + .tl-item        /* active */
```

**„Past" ist der Default, weil der Geschwister-Kombinator nur vorwärts reicht.**
Die Labels *vor* dem gewählten sind nicht benennbar, also ist die Regel
umgedreht: benannt wird, was benennbar ist, und der Rest ist, was ein Label ist,
wenn niemand es benannt hat. Das ersetzt `paint()` samt seiner sechs Farbliterale
aus JavaScript (Invariante 8).

Die Panels hängen an `:has()`, weil sie keine Geschwister der Radios sind — die
Radios stehen in der Rail, die Panels daneben. Sechs Regeln, eine Mechanik.

### 3. Die Füllung ist Arithmetik, keine Messung

Das Blatt liest die Box des Punktes bei jedem `paint()` mit
`getBoundingClientRect()` — eine Zahl, die vor dem Laden der Anzeigeschrift
genommen und danach nie wieder korrigiert wird, weil das Blatt kein
Resize-Handling hat.

Hier ist es `(index + 0.5) / 6`, in `lib/about/trajectory.ts` unter Test, und
die sechs Regeln setzen **`--fill`**, nicht `width`. Die Rail läuft oberhalb des
Schalters quer und darunter senkrecht; eine als Breite geschriebene Füllung
bräuchte sechs weitere Regeln für die Höhe, und zwölf Regeln für einen Gedanken
sind der Weg, auf dem zwei von ihnen anfangen sich zu widersprechen.

### 4. Die Pfeile laufen um, und das Blatt klemmt — die Umlaufen bleibt

Das Blatt-Skript klemmt: `Math.max(0, Math.min(TL.length - 1, i))`. Eine native
Radiogruppe **läuft um**, und das WAI-ARIA-Muster für Radiogruppen schreibt
genau das vor.

Klemmen hieße, dem Browser die Tasten wieder abzunehmen und sie in einer
Client-Insel neu zu schreiben — also genau den Preis zu zahlen, den §1 gespart
hat, um eine Zeitleiste ein bisschen wörtlicher zu nehmen. Wer eine Radiogruppe
irgendwo anders schon bedient hat, bekommt hier das Verhalten, das er kennt.
Als Abweichung notiert und in `e2e/about.spec.ts` zugesichert, damit sie eine
bleibt.

### 5. Die Beschriftung ist die Position, weil es keine Daten gibt

Fünf der sechs Marken heißen im Blatt `[Y1]`–`[Y5]`. **Nichts in diesem
Repository trägt ein Datum für eine Station** — `seed.sql` erklärt zwei Systeme
und keines hat eines, `caseStudyPaths()` antwortet mit einem Pfad.

Eine Zeitleiste behauptet zwei Dinge: **wann** und **in welcher Reihenfolge**.
Das erste ist hier nicht belegbar, das zweite ist der ganze Zweck des Bauteils.
Also ist die Marke die Position — und das ist die Notation, die diese Seite
ohnehin spricht: `SYS.05.01`–`04` nummerieren ihre Abschnitte, `01`–`04` die
Prinzipien einen Abschnitt weiter.

**Die Kollision ist eingeplant und wird durch die Form aufgelöst.** `01` und
`02` heißen auf dieser Site auch *Systeme*. Eine nackte Zahl ist eine Station;
eine Zahl **mit Namen** ist ein System — `02 timseil.dev` in der Belegzeile, nie
ein nacktes `02`. `trajectory.test.ts` hält das auseinander.

K2 tauscht Ordinale gegen Jahre, indem es eine Datei ändert.

### 6. Genau eine Station kann etwas belegen

Fünf von sechs `body` sind `null`, und das ist die ehrliche Zahl. Die Prosa des
Blatts sind geklammerte deutsche Briefings — genau das, was H7as Wache abweist.
Die eine Station, für die dieses Repository geradestehen kann, ist die Seite
selbst, und ihre Belegzeile ist ein Link, weil `caseStudyFor` eine Seite dazu
findet. Jede andere bekommt **keine Zelle** statt eines Gedankenstrichs — ADR
0055s Schnitt, zum vierten Mal; das Blatt zeichnet `—` auf zwei von sechs.

Zwei Tags sind gestrichen: `[LANGUAGE]` ist eine Klammer, und **`AWS` nennt eine
Cloud, die in diesem Repository nicht vorkommt** — diese Site läuft auf einem
VPS bei OVH und ADR 0008 sagt warum. Das ist `4 containers` in klein.

### 7. Der Schalter ist 720, und er ist gemessen

Das Blatt zeichnet die Rail quer bei 1440 und senkrecht bei 390 und sagt nichts
über das Dazwischen. Am gebauten Build bisektiert:

```
eine Beschriftung nimmt drei Zeilen   bis einschließlich 715
zwei oder weniger                     ab 716
eine Beschriftung bricht überhaupt    bis einschließlich 1147
eine Zeile                            ab 1148
```

Zwei Zeilen sind ein umgebrochener Halbsatz; drei in einer Sechs-Spalten-Reihe
sind sechs Absätze da, wo sechs Stationen stehen sollen. **720 ist der nächste
erklärte Schalter über 716**, also wird keine Breite unter dem Minimum
gezeichnet. Die 1148 ist kein Minimum, sondern eine Vorliebe — ein Schalter
dafür wäre der fünfte.

Es ist außerdem der Schalter, den diese Seite ohnehin nimmt (K-08, 62 → 34), das
Telefon bekommt also **eine** Formänderung statt zweier.

## Folgen

**ADR 0064 hat H7 die Insel zugewiesen, und H7 hat sie nicht gebraucht.** Das
Muster dort bleibt richtig für das, wofür es geschrieben wurde — eine Liste
filtern heißt, weniger Knoten zurückzugeben, und das braucht Zustand im Client.
Eine Auswahl aus sechs festen Flächen braucht ihn nicht. Die Frage, die eine
spätere Fläche zuerst stellen sollte, ist damit nicht „Insel oder nicht", sondern
**„gibt es ein Formularelement, das diesen Zustand schon hält".**

**`.tag` hat in dieser Phase seinen ersten Zeichner bekommen.** `layout.css`
führt die Klasse seit G1 in der 44px-Regel, `chrome.css` seit G3 mit einem
Modifikator — vier Stufen lang hat dieser Modifikator nichts modifiziert. Das
erste Bauteil, das `.tag` rendert, hat drei Tags als eine Zeile Fließtext
gezeichnet. Dieselbe Form wie H6as Fund an `.work-row`: ein Wert in einem
Stylesheet ist keine Entscheidung, nur weil er in einem Stylesheet steht — und
eine Klasse, die in zwei Regeln *genannt* und in keiner *gezeichnet* wird, hat
nichts, wogegen sie falsch sein könnte. `ui.css` zeichnet sie jetzt.

## Belege

```
make check   grün
npm test     580    (von 569)
e2e          1 462 grün, 3 übersprungen, 0 rot   (von 1 359)
Orakel       61 Messungen für /about (von 42), 25 abweichend, kein einziger `on:`
Bündel       /about 143 856 B über 7 Dateien — byte-gleich mit /
```

Rail und Panel an neun Breiten gemessen, `clientWidth` je Zeile mitgelesen: der
720er-Schalter sitzt beidseitig, die Füllung steht in beiden Lagen auf 91,7 %
(= `NOW`), höchstens zwei Zeilen je Beschriftung quer, Überlauf null überall.

**K2 erbt fünf Absätze**, jeder als Station mit `[SOON]` und einem Grund, und
die Frage nach echten Jahreszahlen, die dann eine Zeile in einer Datei ist.

**Der Galerie-Eintrag trägt eine Notiz statt einer Übereinstimmung.** Das
Inventar nennt den Zustand „jahr aktiv"; es gibt keine Jahre. Und „tastatur ← →"
ist gebaut und ist trotzdem kein Bauteil-Zustand — es ist eine Radiogruppe, also
gehören die Pfeile dem Browser und es gibt keine Klasse dafür zu zeichnen. Die
Transkription bleibt, wie sie ist: das Inventar ist eine zweite Lesung der
Übergabe, keine Beschreibung dessen, was gebaut wurde.
