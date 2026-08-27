# ADR 0042 — Tailwind ohne Palette, und die zwei Hälften der Invariante 8

**Status:** Angenommen
**Datum:** 2026-08-27
**Betrifft:** G1, G2, G3, G6, G7, alle H-Phasen
**Invarianten:** 8 (keine Farbe, kein Radius, keine Dauer außerhalb `tokens.css`)

## Kontext

`web/` war bis zu dieser Phase eine Seite ohne Inhalt, und `app/layout.tsx`
sagte in seinem Kommentar warum: *„There is no stylesheet import on purpose:
every colour, radius and duration lives in `tokens.css` from G1 onwards, and
until that file exists the honest number of hardcoded ones is zero."* G1 ist die
Phase, die diese Datei bekommt — und mit ihr die erste Gelegenheit, die
Invariante zu brechen.

Der Design-Handoff liefert die Werte fertig: `docs/design/code/tokens.css` (201
Zeilen, sieben Paletten), `globals.css`, `layout.css`. Der Ordner ist read-only.
Der Bauplan legt sie nach `web/styles/`, importiert sie in fester Reihenfolge
und nennt als Abnahme zwei Sätze: **`bg-blue-500` funktioniert nicht mehr, und
Lint verbietet Hex außerhalb `tokens.css`.**

Tailwind 4 liefert im Auslieferungszustand 264 Farben, eine erzeugende
Abstandsskala und fünf Breakpoints — alles Werte, die niemand für diese Seite
entschieden hat, alle in einer Zeile Klassenname erreichbar. Das ist der Zwang,
um den es hier geht: nicht ob Tailwind eingesetzt wird (Stack-Kapitel und
Bauplan G1 sagen ja), sondern woraus es zeichnen darf.

## Entscheidung

**Tailwind zeichnet aus `tokens.css` und aus nichts sonst.** Fünf Teile, alle in
`web/styles/tailwind.css` und in `tools/check-tokens.sh`:

1. **`@theme { --*: initial }`, dann eine Whitelist.** Die mitgelieferten
   Namensräume werden vollständig gelöscht, nicht überschrieben. Was danach
   steht — 23 Farben, 3 Familien, 13 Größen, 14 Abstände, Zeilenhöhen,
   Laufweiten, zwei Easings — ist genau der Bestand aus `tokens.css`.

2. **`@theme inline`, nicht `@theme`.** `inline` gibt der Utility `var(--bg)`
   statt des aufgelösten `#0A0E14`. Ohne `inline` frieren alle Utilities auf
   Terminal Noir ein, und ein Wechsel von `[data-theme]` färbt nur noch
   handgeschriebenes CSS um. Die sieben Paletten hängen an diesem einen Wort.

3. **Kein Preflight.** Eingebunden werden `theme.css` und `utilities.css`, nicht
   `tailwindcss` als Ganzes. `globals.css` bringt einen bewussten, kleinen Reset
   mit; Preflight daneben wäre eine zweite Reset-Quelle, die niemand gelesen hat
   und die mit der ersten in Übereinstimmung gehalten werden müsste.

4. **Zwei Namensräume bleiben leer.** `--radius-*`, weil die Seite einen Radius
   hat und der 0 ist — die einzige Ausnahme ist der Statuspunkt, eine
   Deklaration in einem Bauteil. Und `--breakpoint-*`, weil alle vier Schalter
   (1080 · 900 · 720 · 560) in `layout.css` stehen; ein zweiter Satz Zahlen als
   `md:` wäre die erste Stelle, die driftet.

5. **Die Invariante wird in zwei Hälften geprüft, und keine ersetzt die
   andere.** `web/styles/tailwind.test.ts` kompiliert das Stylesheet und zeigt
   am Ergebnis, dass `bg-blue-500`, `p-5`, `rounded-lg` und `md:flex` nichts
   erzeugen und `bg-bg` auf `var(--bg)` zeigt. `tools/check-tokens.sh` liest
   stattdessen den Quelltext, weil **keine Theme-Einstellung `bg-[#ff0000]`
   verhindern kann** — ein beliebiger Wert ist Teil der Utility-Syntax.

Ablage `web/styles/`, nicht `app/`: der Handoff-README sagt `app/`, der Bauplan
sagt `web/styles/`, und bei Widerspruch gewinnen die Fakten des Bauplans
(`docs/design/INDEX.md`). Reihenfolge in `app/layout.tsx`: tailwind → tokens →
globals → layout, `layout.css` zuletzt, damit seine Media Queries gewinnen.

## Konsequenzen

Ein neuer Wert kostet ab jetzt zwei Zeilen statt einer: die Deklaration in
`tokens.css` und die Abbildung in `tailwind.css`. Das ist beabsichtigt — die
zweite Zeile ist die Stelle, an der jemand fragt, ob der Wert wirklich neu ist.

`p-26` ist 26 Pixel. Weil die erzeugende Skala aus ist, ist die Zahl im
Klassennamen die Zahl in Pixeln und nicht ihr Vierfaches; die 14 Schritte sind
die 14, die im 4er-Raster gezeichnet wurden.

Responsive Arbeit läuft über `layout.css` und die dortigen Klassen (`.col`,
`.hero`, `.cs-spec`), nicht über Präfixe. Die H-Phasen erben damit die
Zweispalter, die der Entwurf schon beschreibt, statt sie pro Seite neu zu
erfinden.

`make check` hat ein neues Ziel, `check-tokens`, und `tools/selftest.sh` neun
Fälle dazu. Der Auslöser dafür ist nicht ein guter Vorsatz, sondern das
Abnahmekriterium der Phase — die Freeze-Regel aus `CLAUDE.md` verlangt genau
das.

### Was das kostet

**Der Quelltext-Prüfer ist ein Grep.** Er entfernt Kommentare und sucht dann
nach Farb-, Radius- und Dauer-Literalen. Wer eine Farbe aus zwei Zeichenketten
zusammensetzt, kommt durch. Das ist der Preis dafür, keine weitere Abhängigkeit
für eine Aufgabe zu holen, die ein Grep erledigt — und der Angreifer ist hier
die eigene Bequemlichkeit, nicht ein Gegner.

**Vier Zeilen des Handoffs verletzen die Invariante, die dieser ADR
durchsetzt.** `globals.css` malt den Link-Unterstrich, die Auswahlfarbe und den
Puls-Schein mit `rgba(0,229,255,…)` statt mit `var(--acc)` — dem Akzent von
Terminal Noir, ausgeschrieben. **In den sechs anderen Paletten bleiben diese
drei Dinge cyan.** Die Datei wurde wörtlich übernommen, also ist der Fehler
übernommen; ihn zu beheben heißt, neue Tokens in `tokens.css` anzulegen, und
das ist keine Entscheidung dieser Phase. `check-tokens.sh` nennt die vier
Zeilen als benannte Ausnahme und **druckt sie bei jedem Lauf**, statt sie
stillzulegen. Notiert in `backlog.md`.

**Ohne Preflight trägt `globals.css` allein die Verantwortung für alles, was ein
Browser sonst unterschiedlich macht.** Fällt in einer H-Phase auf, dass etwas
fehlt, gehört es dort hinein — nicht Preflight nachträglich dazu, sonst stehen
beide Resets nebeneinander und die Frage ist wieder offen.

## Verworfene Alternativen

**Stylelint statt eines Skripts.** Eine Abhängigkeit für einen Grep, und sie
löst nur die kleinere Hälfte: Stylelint liest CSS, `bg-[#ff0000]` steht aber in
einer `.tsx`. Ein Prüfer, der beide Dateiarten liest, ist billiger als zwei.

**`@theme` ohne `inline`.** Kürzer zu schreiben und still falsch: die Utilities
tragen dann feste Werte, der Theme-Wechsel wirkt nur noch auf handgeschriebenes
CSS, und der Fehler zeigt sich erst in G2, wenn der Umschalter gebaut wird.
`styles/tailwind.test.ts` prüft deshalb ausdrücklich auf `var(--bg)` und gegen
`#0a0e14`.

**Die Default-Palette stehen lassen und sich zusammenreißen.** Das ist die
Alternative, die das Abnahmekriterium des Bauplans ausdrücklich ausschließt.
Eine Palette, die da ist, wird benutzt — und die erste `bg-blue-500` in einem
Prototyp ist die, die niemand mehr findet.

**Die vier Breakpoints als Tailwind-Screens spiegeln.** Sie müssten als
`min-width` geschrieben werden, während `layout.css` sie als `max-width` führt;
zwei Sätze derselben vier Zahlen, um eins verschoben. Die Herleitung steht im
Blatt „Intermediate Widths" und gehört an eine Stelle.

## Belege

- Bauplan, Stufe G, Phase G1 — Abnahmekriterium
- `docs/design/code/README.md` — „Wer Tailwind einsetzt, mappt die Tokens in
  `@theme` und ersetzt die Styles; die Werte bleiben dieselben."
- `docs/design/INDEX.md` — Form gilt, Fakten aus dem Bauplan gewinnen
- `CLAUDE.md`, Invariante 8 und „Maß halten"
- ADR 0031 (Lint-Ebenen in `web/`), ADR 0001 (App Router)
