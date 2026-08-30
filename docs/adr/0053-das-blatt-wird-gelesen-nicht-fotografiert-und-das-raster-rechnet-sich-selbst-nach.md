# ADR 0053 — Das Blatt wird gelesen, nicht fotografiert, und das Raster rechnet sich selbst nach

**Status:** Angenommen
**Datum:** 2026-08-30
**Betrifft:** H1b, alle H-Phasen, E1 — revidiert Kapitel 5.1 und 6.2 des Bauplans
**Invarianten:** 8 (keine Farbe außerhalb `tokens.css`) — sonst keine berührt

## Kontext

Der Bauplan verlangt an zwei Stellen etwas, das H1b anders baut. Beide Stellen
sind älter als die Messungen, die sie widerlegen.

**Kapitel 6.2:** *„Daran hängt der Playwright-Vergleich ab H1 — ein
Screenshot-Lauf soll keinen absoluten Pfad deines Rechners einbacken."* Die
Blätter laden `react@18.3.1` von unpkg und ihre Schnitte von Google Fonts.
`INDEX.md` hält das Ergebnis als Messung fest: *„Nachgemessen mit blockiertem
unpkg: `<x-dc>` wird nicht ersetzt, es entsteht kein `#dc-root`, die Seite bleibt
dunkel. **Eine schwarze Seite heißt: kein Netz.**"* Ein Vergleich, der zwei
fremde Häuser braucht, geht rot aus Gründen, die nicht unsere sind — auf einer
Seite, deren Datenschutzargument „kein Dritter im Anfrageweg" lautet.

**Kapitel 5.1:** *„Visual Regression · Playwright Screenshots · 7 Breiten,
Kernseiten."* Vier Hindernisse, alle gemessen und keins davon behebbar ohne
einen zweiten Mechanismus:

| | |
|---|---|
| Glyphen-Rasterung ist hostabhängig | Baselines von diesem Arch-Rechner treffen `ubuntu-latest` nicht — es bräuchte den gepinnten Playwright-Container |
| Drei laufende Uhren je Seite | `Clock.tsx` rendert UTC im Kopf, in der Fußzeile und im Menü |
| Die Kacheln sehen mit und ohne API anders aus | `case-study.spec.ts` hat diesen Fund schon einmal gemacht |
| `.reveal` hängt an `animation-timeline: view()` | scroll-gekoppelt, also von der Scrollposition abhängig |

Und: **von den sieben Prüfbreiten zeichnet ein Blatt nur drei** — 1440, 1024,
390. Für 1081, 1079, 899 und 719 gibt es kein Bild, gegen das ein Bild etwas
hieße.

## Entscheidung

### 1 · Das Blatt wird geparst, nicht gerendert

`tools/gen-sheet-oracle.mjs` liest die Artboards aus der Quelle und schreibt bei
`make gen` nach `web/e2e/oracle/case-study.gen.json`; die Prüfsumme hängt in
`make check-contract`.

**Das geht, weil die Artboards zu 100 % inline gestylt sind** — nachgezählt:
zwischen den Artboard-Grenzen steht kein einziges `class=`. Jede Maßangabe ist
eine Deklaration in einem `style`-String, und `support.js` reicht sie unverändert
an React weiter. Die Quelle sagt, was der Browser sagen würde.

**Und es ist die Methode, die der Entwurf auf sich selbst angewandt hat.** Der
`Consistency Check` über seine eigenen achtzehn Befunde: *„QUELLE STATT BILD —
geprüft wurde der Quelltext aller elf Seiten, nicht der Screenshot."*

**Die Trennung von Maschine und Urteil ist der ganze Entwurf:**

- **Maschine:** dass das Blatt wirklich sagt, was die Karte behauptet. Jeder
  Eintrag nennt Zeile und exakte Deklaration; ein Blatt, das etwas anderes
  sagt, hält den Generator an.
- **Urteil:** dass `grid-template-columns:1fr 400px` in der Hero-Zeile heißt,
  die Rail ist 400px breit. Das ist eine Lesart, sie steht im Eintrag, und ein
  Leser kann ihr widersprechen.

Verglichen werden **Messungen**, keine Zeichenketten: `1fr 400px` löst im Browser
zu `680px 400px` auf, und die Zahl des Blattes ist ohnehin eine über Geometrie.

**Adressiert wird über die Zeilennummer.** Anderswo fragil, hier die stabilste
Adresse, die es gibt: `docs/design/` ist read-only, am 16.08.2026 eingefroren,
und `INDEX.md` ist die einzige Datei darin, die jemand schreiben darf.

### 2 · Geometrie statt Pixel für die Breiten ohne Zeichnung

`web/e2e/layout.sweep.spec.ts` prüft die Seite gegen **die Arithmetik ihres
eigenen Rasters**, und auch das ist keine Erfindung: das
`Intermediate Widths`-Blatt schreibt es als einzigen Satz vor.

> Zwischen diesen Breiten wird zusätzlich einmal langsam durchgezogen — von 1440
> bis 390 am Fenstergriff. **Was dabei springt, ohne in dieser Tabelle zu stehen,
> ist ein Fehler.**

Zwei Hälften: die Spaltentabelle des Blattes an ihren sieben Punkten **und an
jeder Breite dazwischen** gegen `min(1160, 100% − 80)`; dazu ein Fingerabdruck
aus rein diskreten Werten, grob abgetastet und **binär auf das Pixel
eingegrenzt**. Jede gefundene Kante muss auf 1080 · 900 · 720 · 560 liegen.

**Ein Screenshot sagt, dass zwei Bilder sich unterscheiden. Das hier sagt, bei
welchem Pixel es umschlägt und ob dort ein Schalter stehen darf** — und es sagt
es auf diesem Rechner und auf einem CI-Runner gleich, weil es Zahlen vergleicht
und keine Glyphen.

### 3 · `make e2e` ist ein Tor im PR, nicht daneben

Eigener Job neben `check`, auf jedem Pull Request, in `deploy.needs`.

`quickstart` ist der Präzedenzfall für einen teuren Job außerhalb der PRs und
trifft nicht zu: es klont von GitHub und braucht 11:35, dieser braucht Minuten.
E1s Kriterium ist PR-Feedback unter fünf Minuten, und Feedback ist der
**langsamste** Job — `check` setzt ihn heute auf etwa 3:35, und alle Jobs starten
gleichzeitig.

**Reißt die Messung die fünf Minuten, wird nach Projekten geteilt** — nicht auf
`main` verschoben. Ein Tor neben dem Deploy statt davor meldet, statt zu
schließen, und der erste Fund des Browsers hier — ein geschlossener Dialog, der
unsichtbar über jeder Seite lag, #256 — stand da schon Wochen in Produktion.

## Konsequenzen

**Der Preis des Parsens:** Farbe und Malfehler fallen nicht auf. Der Vergleich
sieht Geometrie und Typografie; ein falsch eingefärbtes Bauteil mit richtigen
Maßen kommt durch. Dagegen stehen `check-tokens`, die Zustandssprache und M2.

**Der Preis der Zeilennummer:** verschiebt sich ein Blatt doch einmal, zeigt jeder
Eintrag daneben — und der Generator sagt es sofort und genau, statt still das
Falsche zu messen. Vorgeführt: vier Abweisungen, jede mit der Zeile im Text.

**Der Preis des Fingerabdrucks:** er findet, **wo** sich etwas ändert, nicht
**was**. Eine Mutation hat das bewiesen — `.rail` überall auf `static` gesetzt
ließ die Kantenliste unberührt, weil vier andere Bauteile bei 1080 weiter
schalten. Deshalb trägt die Datei eine zweite Tabelle, die je Schalter nennt,
**welche** Schlüssel sich bewegen müssen. Werte stehen dort keine; die gehören
`case-study.spec.ts`, und zwei Kopien einer Zahl sind der Anfang ihrer
Uneinigkeit.

**Der Preis der zwei neuen Actions:** `ci.yml` sagt, jede zusätzliche Action sei
ein weiteres Repository, dessen Betreuer in diese Pipeline schreiben können.
Beide sind erstpartei und beide auf Commit-SHA gepinnt. `actions/cache` ist der
**erste im Repo** und kauft 20–45 s in einem Budget mit knapp einer Minute Luft;
`actions/upload-artifact` sammelt die Traces ein, die `retain-on-failure` seit
dem Rig schreibt und die bisher niemand abgeholt hat.

**Was dazukommt:** ein Generator, ein erzeugtes Orakel, zwei Specs, zwei
Playwright-Projekte, ein CI-Job. Und ein Bauteil ist repariert — siehe unten.

## Was die Entscheidung sofort eingebracht hat

**Sechs Abweichungen in `.cs-constraints`, in einem Bauteil, in einem Lauf.**
Das erste Build war aus der Form des Abschnitts geschrieben, nicht aus seinen
Maßen: keine Platte, wo das Blatt eine zeichnet (Zeile 110); 26px
Ordinalspalte gegen 16 (113); Geist 13 gegen Mono 11,5 (112); Abstand aus
`padding` statt aus dem `gap`, den das Blatt benutzt; Haarlinien zwischen den
Zeilen, die das Blatt **gar nicht zeichnet**; und Steel gegen Ink-2.

Dazu **eine siebte bei 1024**: das Blatt zeichnet die Constraints dort
zweispaltig (`Intermediate Widths` 457), gebaut war einspaltig bei jeder Breite.

Alle sieben sind repariert und stehen als Einträge im Orakel, damit sie nicht
zurückdriften.

## Verworfene Alternativen

**Playwright gegen `make design`, wie 6.2 es schreibt.** Zieht unpkg und Google
Fonts in die Pipeline. `make design` bleibt, wofür es gebaut ist: damit ein
Mensch das Blatt ansieht.

**Pixel-Baselines, wie 5.1 es schreibt.** Vier ungelöste Probleme vor dem ersten
grünen Bild, und für vier der sieben Breiten gäbe es ohnehin nichts zu
vergleichen. Der Bauplan nennt den Preis selbst: *„Baselines für alle Seiten × 7
Breiten sind ein Wartungsklotz."* Bleibt für M2/M6, falls je ein Vorfall sie
erzwingt.

**Die Maße von Hand in die Spec abschreiben**, wie `lib/chrome.test.ts` es mit
CHR.01 macht. Dort ist es richtig, weil das Orakel sonst die Implementierung
läse. Hier ist das Blatt eine unabhängige Quelle, und ein Abschreibfehler wäre
unsichtbar — der Generator prüft die Transkription gegen die Zeile.

**Den Durchzug Pixel für Pixel fahren.** 1051 Größenänderungen je Lauf. Grob
abtasten und binär eingrenzen gibt dieselbe Antwort auf dasselbe Pixel in
Sekunden.

**Eine Abweichung ohne Grund zulassen.** Der Generator weist sie ab. Sonst wird
„weicht ab" der stille Ausweg aus jedem Fund, den der Vergleich je macht.

## Belege

Bauplan Kapitel 5.1, 6.2, Teil II (E1, H1) ·
`docs/design/Case Study Template - timseil.dev.dc.html` (44, 66, 74, 83, 93, 100,
104, 110, 112, 113, 345, 347, 364) ·
`docs/design/Intermediate Widths - timseil.dev.dc.html` (LAYOUT.03, das
Prüfprotokoll, 387, 411, 414, 426, 457) ·
`docs/design/Consistency Check - timseil.dev.dc.html` (Methode, K-28, K-29) ·
`docs/design/INDEX.md` · ADR 0031 · ADR 0044 · ADR 0052 · Issues #236, #256
