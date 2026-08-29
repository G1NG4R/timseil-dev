# ADR 0050 — Der Rahmen, den wir nicht schreiben, und die Zahl, die wir verantworten

**Status:** Angenommen
**Datum:** 2026-08-29
**Betrifft:** L8, H1–H13, J1, J2, M6
**Invarianten:** 1 (keine erfundenen Zahlen)

## Kontext

Der Bauplan gibt Stufe L8 vier Budgets, und eines davon lautet
**„Initial JS < 150 KB gzip"** (Zeile 1339). Es ist die einzige Stelle, die die
Zahl nennt — und sie sagt **nicht, wie zu messen ist**: nicht welche Route, nicht
welches gzip-Verfahren, nicht ob das `noModule`-Polyfill zählt, nicht ob CSS und
Schriften mitzählen. Eine Zahl ohne Messvorschrift ist in CI ein Streit, kein
Gate.

**In G7 ist sie zum ersten Mal gemessen worden**, und das Ergebnis war nicht die
Zahl, sondern ihre Zusammensetzung:

```
framework     134097 B  5 files — watched, never budgeted
our code        9178 B  1 file
total         143275 B
```

**134 097 der 143 275 Byte sind Rahmen** — React, ReactDOM, der Scheduler, der
RSC-Client, die App-Router-Laufzeit und der Turbopack-Lader. Code, den wir nicht
schreiben und nicht kürzen können, ohne das Framework zu wechseln. Unser eigener
Anteil sind **9 178 Byte**: sieben Client-Bauteile, die das Chrome zeichnen, und
die kleinen `lib/`-Dateien, die sie mitziehen.

Zwei Dinge folgen daraus, und beide waren vorher nicht sichtbar:

**Eine Seite kostet nichts.** Die sechs Chunks sind für `/`, `/about`, `/blog`,
`/work`, `/contact`, `/imprint` und `/privacy` **identisch** — es ist
Layout-Chrome, nicht Seiten-Code. Die dreizehn Seiten der Stufe H erhöhen diese
Zahl nur insoweit, als sie **neue Client-Bauteile** mitbringen. Der erste Entwurf
von Issue #237 hat das Gegenteil behauptet und ist damit korrigiert.

**Aber der Rest ist eng.** Vom Budget bleiben nach dem Rahmen **15 903 Byte** für
allen Client-Code, den diese Seite je haben wird; 9 178 davon sind fürs Chrome
schon ausgegeben. Übrig sind **6 725 Byte** für das Terminal (J1/J2), das
404-Spiel auf Canvas (H10), den Contribution-Graph (H4), die Filter-Chips (H6),
die Trajectory-Rail (H7) und das Kontaktformular (H8).

## Entscheidung

**Das Budget wird in zwei Zahlen geteilt, und nur eine davon ist ein Gate.**

| Größe | Wert | Rolle |
|---|---|---|
| **Rahmen** | 134 097 B (heute) | **beobachtet, nie budgetiert** — gedruckt bei jedem Lauf |
| **Eigener Code** | **15 903 B** | **Budget.** Nur das wächst durch unsere Entscheidungen |
| **Summe** | **150 000 B** | bleibt die äußere Grenze, weil der Besucher sie zahlt |

**Die Messvorschrift, die bisher fehlte:** jedes `<script src>` im
vorgerenderten Dokument von `/` — das ist `en.html`, weil `proxy.ts` die Adresse
intern auf `/en` umschreibt (ADR 0046) —, **ohne** die Dateien aus
`polyfillFiles`, weil ein Browser mit Modulunterstützung sie nie holt, und **jede
Datei einzeln** gzippt, weil die Leitung sie einzeln überträgt.

`tools/bundle-size.sh` ist diese Vorschrift als ausführbare Datei, und
`make bundle-size` ist der Weg dorthin.

## Konsequenzen

### Warum zwei Zahlen und nicht eine

Eine gemeinsame Grenze ist in beide Richtungen blind. Sie geht **rot für etwas,
das niemand hier geschrieben hat** — ein Next-Release, das 20 KB zulegt, ist
unser Problem, aber nicht unsere Schuld und nicht unsere Reparatur. Und sie
bleibt **grün, während unser eigener Anteil sich verdoppelt**, solange der Rahmen
gerade schrumpft. Eine Zahl, die sich aus zwei Ursachen bewegt, sagt über keine
der beiden etwas.

Vorgeführt in genau diesem Zustand: mit `BUDGET_OWN` testweise auf 9 000 gesetzt
meldet das Werkzeug `✗ our code 9178 B of 9000 B` und **gleichzeitig**
`✓ total 143275 B of 150000 B`. Die Summe hätte den Fall nicht gefunden.

### Die 15 903 sind eine Konstante, keine Ableitung

Sie ist einmal aus `150 000 − 134 097` gerechnet und steht ab hier fest.
**Nicht** bei jedem Lauf neu abgeleitet — sonst ließe ein Next-Update unser
Budget still schrumpfen oder wachsen, und wir hätten die Kopplung wieder
eingeführt, die diese Teilung gerade beseitigt. Sie ändert sich nur durch einen
neuen ADR, so wie die 150 000 sich seit dem Bauplan nur durch diesen hier ändern
würden.

### Der Rahmen bekommt kein eigenes Gate

Er ist 94 % der Summe. Ein Framework, das nennenswert zulegt, reißt die
Summengrenze ohnehin, sobald der eigene Code auch nur in der Nähe seiner eigenen
steht — was ab Stufe H der Regelfall ist. Eine dritte Zahl wäre ein zweites
Signal für dieselbe Sache, und CLAUDE.md verlangt für eine neue Regel einen Fund,
der sie erzwingt. Den gibt es nicht. Er wird gedruckt, damit ein Sprung auffällt,
und nicht gegatet.

### Das Werkzeug baut immer

Kein Schalter zum Überspringen. Ein `.next` kann älter sein als der Baum, der es
erzeugt hat, und eine leise veraltete Zahl ist hier schlimmer als zwanzig
Sekunden Wartezeit. Die Handmessungen aus G2, G3 und G7 haben genau deshalb
jedes Mal `rm -rf .next` davorgesetzt — und **zwei von drei haben trotzdem einmal
eine falsche Zahl produziert**: ein `cd web` in einem Verzeichnis, das schon
`web` war, und eine verkettete statt einzeln komprimierte Messung. Das ist der
Vorfall, für den dieses Werkzeug existiert.

### Es hängt nicht in `make check`

`check` baut nicht, und das ist im Runbook festgehalten. `bundle-size` steht
neben `witness`, `probe` und `design`. **L8 entscheidet, wo es in CI hängt** —
dieser ADR entscheidet die Zahlen und die Methode, nicht den Verdrahtungsort.

### Was das für `docs/build-plan.md` heißt

Zeile 1339 behält ihre Zahl und bekommt einen Verweis hierher. Zeile 227 lehnt
WebGL unter anderem mit „~150 KB gzip" ab und benutzt dieselbe Grenze als
Vergleichsmaß — das Argument wird durch diesen ADR **stärker**, nicht schwächer:
eine Ambient-Ebene bei 6 % Deckkraft in der Größe des gesamten Rahmens ist gegen
6 725 Byte Restluft nicht mehr diskutabel.

### Und was es für #35 heißt

Der React Compiler kostet 1 945 B gzip auf dem Initial-Bundle — **21 % unseres
eigenen Anteils**, nicht 1,3 % wie gegen die Summe gerechnet. Der Issue bleibt
offen und bekommt damit zum ersten Mal eine ablesbare Auslöseschwelle statt einer
Handmessung: `make bundle-size` sagt die verbleibende Luft, und #35s eigene
Bedingung („mehr als etwa 5 KB Luft") ist ab jetzt eine Zahl, die dort steht.

## Verworfene Alternativen

**Nur die Summe budgetieren, wie bisher.** Das ist der Zustand, aus dem dieser
ADR kommt: eine Zahl, die niemand zuordnen kann. Sie hätte den G7-Fall — unser
Anteil reißt, die Summe hält — nicht gefunden.

**Nur den eigenen Code budgetieren und die Summe beobachten.** Die ehrlichere
Zuordnung, und trotzdem falsch: der Besucher lädt die Summe, nicht unseren
Anteil. Eine Grenze, die das nicht abbildet, misst unsere Bequemlichkeit statt
seiner Leitung.

**Die 150 000 anheben, weil 134 097 davon Rahmen sind.** Naheliegend und
verworfen: die Messung zeigt keinen Fehler in der Zahl, sondern eine fehlende
Methode. Eine Grenze, die beim ersten Gegenwind angehoben wird, ist keine. Wenn
Stufe H zeigt, dass 15 903 Byte für sechs Bauteile nicht reichen, ist das ein
Fund mit Zahlen — und dann wird hier neu entschieden, mit einer Herleitung statt
auf Zuruf.

**Die Grenze für eigenen Code live aus `150 000 − Rahmen` ableiten.** Verworfen,
siehe oben: koppelt das einzige Feld, das wir beeinflussen, an eine Zahl, die wir
nicht beeinflussen.

**Brotli statt gzip, oder erst verketten und dann komprimieren.** Verworfen:
gzip je Datei ist, was tatsächlich über die Leitung geht. Die Methode jetzt zu
wechseln würde außerdem die Vergleichbarkeit mit den G2-, G3- und G7-Zahlen
zerstören, die alle so gemessen wurden.

## Belege

`make bundle-size` am 29.08.2026 gegen `d70927b`:
`framework 134097 B · our code 9178 B · total 143275 B` ·
`web/.next/build-manifest.json` (`polyfillFiles`, `rootMainFiles`) ·
`web/.next/server/app/[lang]/page_client-reference-manifest.js` (`clientModules`) ·
`docs/build-plan.md` Zeile 1339 und Zeile 227 · Issue #237 · Issue #35 ·
ADR 0046 (warum `en.html`) · `backlog.md`, 29.08.2026, G7
