# ADR 0043 — Die drei Schnitte, die sieben Paletten und das Skript vor dem ersten Paint

**Status:** Angenommen
**Datum:** 2026-08-28
**Betrifft:** G2, G3, G4, G7, L4, L8, alle H-Phasen
**Invarianten:** 8 (keine Farbe außerhalb `tokens.css`), 9 (genau zwei localStorage-Keys)

## Kontext

G1 hat die Werte geliefert und `app/layout.tsx` hat aufgeschrieben, was fehlt:
*„fonts and the anti-flash theme snippet are G2 … `--display`, `--body` and
`--mono` resolve to the fallbacks tokens.css names until next/font/google fills
them."* Die sieben Paletten lagen dabei schon vollständig in `tokens.css` — G2
baut nicht die Paletten, sondern den Weg zu ihnen.

Der Bauplan nennt für G2 drei Sätze und drei Abnahmekriterien: `next/font/google`
für die drei Familien, sieben Paletten als `[data-theme]`, Anti-Flash-Snippet im
`<head>` vor jedem CSS mit CSP-Nonce; fertig, wenn kein Request an
fonts.gstatic.com geht, nichts flackert und die CSP das Snippet nicht blockt.

Vier Zwänge standen daneben, und keiner davon steht im Bauplan:

1. **Vier Dokumente sagen etwas anderes als der Backlog.** Bauplan,
   Systemhandbuch, `docs/design/code/README.md` und das Palettenblatt sagen alle
   „ohne gespeicherte Wahl folgt die Seite `prefers-color-scheme`, hell liefert
   Gruvbox Light". Der Backlog vom 28.08.2026 sagt „immer Terminal Noir", mit
   Anlass: ein heller Rechner zeigte Gruvbox Light als ersten Eindruck.
2. **`tokens.css` ist als „verbatim" markiert**, und die Reparatur der vier
   Akzent-Literale aus dem G1-Fund geht nicht ohne sie.
3. **Es gibt keine CSP.** Sie gehört zu L4. „Mit CSP-Nonce" ist damit eine
   Anweisung ohne Gegenstück.
4. **Der Umschalter gehört in die Fußzeile**, und die Fußzeile ist G3.

## Entscheidung

**Die Schriften kommen über `next/font/google` an drei eigenen Variablen an, die
sieben Paletten hängen ausschließlich an `data-theme`, und das Attribut steht,
bevor irgendetwas gezeichnet wird.** Sechs Teile:

### 1. `--face-*`, nicht `--font-*`

`app/fonts.ts` lädt Chakra Petch 400/500/600 (keine variable Achse), Geist
variabel und JetBrains Mono variabel, und legt sie auf `--face-display`,
`--face-body`, `--face-mono`. `tokens.css` liest sie:

```css
--display: var(--face-display, 'Chakra Petch', system-ui, sans-serif);
```

**Der Name ist der Grund.** `styles/tailwind.css` deklariert im
`@theme inline`-Block bereits `--font-display: var(--display)`. Hießen die
next/font-Variablen genauso, stünden zwei Definitionen desselben Namens auf
demselben Element — `:root` aus Tailwinds erzeugtem Stylesheet, eine Klasse aus
next/fonts erzeugtem — bei gleicher Spezifität, und die Reihenfolge zweier
generierter Dateien entschiede, welche Schrift die Seite trägt.

**Warum überhaupt eine Umleitung, wo Next 16.3.2 die Familie unter ihrem echten
Namen deklariert** (nachgemessen: `@font-face{font-family:Chakra Petch;…}`, nicht
`__Chakra_Petch_hash`)? Weil der Name ein Detail der Umsetzung ist und zwischen
zwei Hauptversionen schon einmal gewechselt hat. Ginge er zurück auf einen
erzeugten Namen, träfe `'Chakra Petch'` in `tokens.css` nichts mehr, und die
Seite stünde still und ohne Fehlermeldung auf `system-ui`. Der Handoff-Stack
bleibt als Fallback hinter dem `var()` stehen, also sagt die Datei weiterhin,
welche Schrift gemeint ist.

### 2. Ohne gespeicherte Wahl ist die Seite Terminal Noir

Der `@media (prefers-color-scheme: light)`-Block entfällt aus `tokens.css`.
Hell erreicht man über den Umschalter.

**Das räumt zugleich eine Falle im Entwurf weg, und beide haben dieselbe
Reparatur.** Terminal Noir hat keine ID — es ist `:root`, also die Abwesenheit
des Attributs. Der Umschalter des Handoffs *löscht* für Noir folglich
`data-theme` und den Speichereintrag. Solange der Media-Block existierte, landete
ein Klick auf „Terminal Noir" auf einem hellen Rechner damit in Gruvbox Light —
der Knopf tat das Gegenteil seiner Beschriftung. Ohne den Block ist die
Abwesenheit des Attributs wieder das, was sie verspricht. Kein achter
„SYSTEM"-Zustand, keine erfundene ID `noir`, kein zweiter Codepfad.

Nebenbei standen die Gruvbox-Light-Werte doppelt in der Datei. Jetzt einmal.

### 3. Farbe wird abgeleitet, nicht wiederholt

Die vier Literale, die G1 gefunden und nicht repariert hat, werden zu vier
Tokens in `:root`:

```css
--acc-line:   color-mix(in srgb, var(--acc) 35%, transparent);
--acc-select: color-mix(in srgb, var(--acc) 25%, transparent);
--acc-pulse:  color-mix(in srgb, var(--acc) 70%, transparent);
--acc-pulse-2:color-mix(in srgb, var(--acc) 20%, transparent);
```

`color-mix(in srgb, C p%, transparent)` ergibt exakt `C` mit Alpha `p`, die
Prozente sind also die des Handoffs. Weil `--acc` und die vier Ableitungen auf
demselben Element aufgelöst werden, folgt jede von ihnen dem `[data-theme]` von
selbst — vier Werte × sieben Paletten wären achtundzwanzig Zeilen, die einzeln
driften können.

**Derselbe Fehler saß eine Ebene tiefer, und G2 hat ihn erst dabei gefunden:**
`--glow: 0 0 28px rgba(0,229,255,.45)` stand nur in `:root`, und ausschließlich
`latte` und `gruvbox` überschrieben es mit `none`. In `mocha`, `amber`,
`phosphor` und `tokyo` leuchtete also weiter Cyan neben einem violetten, orangen
oder grünen Akzent. `check-tokens.sh` konnte das nie sehen: `tokens.css` ist die
eine Datei, die es nicht liest. Gleiche Reparatur.

Danach ist die benannte Ausnahme `ACCENT_LITERAL` in `tools/check-tokens.sh`
gelöscht. Eine Ausnahme für etwas, das es nicht mehr gibt, erlaubt genau das
Literal wieder, das gerade beseitigt wurde.

### 4. Das Snippet validiert, liegt als Konstante und steht unter Test

`lib/theme.ts` hält `THEME_KEY`, `THEME_IDS` und `THEME_SNIPPET`. Die Whitelist
im Skript wird **aus `THEME_IDS` erzeugt**, nicht daneben geschrieben: eine
zweite Liste wäre eine zweite Stelle, an der eine achte Palette einzutragen ist.
Die Vorlage des Handoffs schrieb jeden gespeicherten Wert ungeprüft ins DOM;
das ist heute folgenlos, weil ein unbekanntes `data-theme` keinen Selektor
trifft — aber „folgenlos" ist eine Eigenschaft des Stylesheets, nicht des
Skripts, und der Wert kommt aus dem Speicher des Besuchers.

`THEME_SNIPPET` ist eine Konstante und keine Funktion, weil L4 einen stabilen
Text braucht, um ein Nonce oder einen Hash daran zu hängen.

`lib/theme.test.ts` führt **die ausgelieferte Zeichenkette selbst** über
`node:vm` gegen ein gefälschtes `localStorage` und `document` aus. Ein Test, der
die Logik in TypeScript nachbaut, zeigte nur, dass zwei Fassungen sich einig
sind — dieselbe Lehre, die `lib/scrub.test.ts` schon bezahlt hat. Nachgemessen:
nimmt man die Whitelist aus dem Skript heraus, fallen zwei der fünf Tests.

### 5. Nonce-fähig, nicht nonce-verdrahtet

`components/ThemeScript.tsx` nimmt eine `nonce`-Prop, die heute niemand
übergibt; React lässt das Attribut dann weg. L4 baut die CSP und reicht den Wert
durch.

**Der Satz, den L4 und G4 beide brauchen: ein Anti-Flash-Snippet und eine
vollständig vorgerenderte HTML-Hülle schließen sich aus, sobald die CSP
nonce-basiert ist.** Ein Nonce heißt `headers()` im Root-Layout, und das nimmt
jede Seite aus dem statischen Pass — genau die Hülle, die G4 vorrendern will.
Das jetzt zu verdrahten hieße, G4 einen Rückbau zu hinterlassen; es gar nicht
vorzusehen hieße, L4 die Stelle suchen zu lassen. Also: die Stelle existiert,
ist benannt und bleibt ungebunden.

Die dritte Abnahme des Bauplans, „CSP blockt das Snippet nicht", ist damit bis
L4 **trivial erfüllt und wird nicht als Beleg gemeldet.**

### 6. Wo das Snippet wirklich landet — gemessen, nicht angenommen

Der Bauplan sagt „vor jedem CSS". Nachgemessen am Produktionsbuild
(Next 16.3.2, `next start`, `/`):

```
Byte  273   <link rel="stylesheet" … data-precedence="next">
Byte  970   <script>(function(){try{var t=localStorage.getItem("ts.theme") …
Byte 1244   </head>
```

**Das Skript steht hinter dem Stylesheet, und das ist in Ordnung.** Der App
Router setzt den `<head>` selbst zusammen; die Reihenfolge ist nichts, was ein
Layout bestimmt. Flimmerfrei ist es trotzdem, und zwar zwingend: das Skript ist
ein klassisches Inline-Skript, also parser-blockierend, und ein solches wartet
auf noch ausstehende Stylesheets. Die Reihenfolge ist damit *CSS geladen →
Skript → erster Paint*, denn der erste Paint kann auf das render-blockierende
Stylesheet ebenso wenig verzichten. **„Vor jedem CSS" heißt in der Umsetzung
„vor dem ersten Paint", und das ist die Eigenschaft, um die es geht.**

## Konsequenzen

`tokens.css` ist nicht mehr wörtlich die Datei aus dem Handoff. Ihr
Kopfkommentar zählt die sechs Abweichungen einzeln auf, wie `globals.css` es für
seine eine entfernte Zeile schon tat. Eine siebte kommt nicht dazu, ohne dass
dieser Absatz wächst.

**Die sieben Paletten sind ab jetzt bedienbar**, und damit ist zum ersten Mal
belegt, wofür `@theme inline` in ADR 0042 stand: ein Klick färbt die Utilities
mit, nicht nur handgeschriebenes CSS.

`web/components/` existiert. Das Verzeichnis stand seit G1 als `@source` in
`tailwind.css` und war leer.

Die Seite hat ihre erste `'use client'`-Datei und ihren ersten
`localStorage`-Zugriff. Beides bringt eine Regel mit: `eslint.config.mjs`
verbietet über `no-restricted-syntax` jeden `localStorage`-Aufruf mit einem
Literal, das nicht `ts.theme` oder `ts404.best` heißt. Der Bauplan nennt für
Invariante 9 genau diesen Nachweis („Lint-Regel + E2E"), und G2 ist die Phase,
die den ersten Schlüssel schreibt. `ts404.best` steht von Anfang an mit drin,
damit H10 eine Funktion baut und nicht mit einem Linter streitet.

**Der Umschalter steht bis G3 auf `/`**, im selben Block, der schon „H3 REPLACES
this block" im Kopf trägt. Er gehört in die Fußzeile — ein Farbschema ist eine
Vorliebe, kein Navigationsziel.

### Was das kostet

**Der Build hängt ab jetzt an Google.** `next/font/google` lädt die Schnitte zur
Buildzeit; CI und der Docker-Build brauchen dafür Netz. Der Preis ist ein
Fremdsystem im Build-Pfad — nicht im Anfragepfad, dort ist die Seite danach
sauberer als vorher. `next/font/local` mit mitgelieferten `.woff2` ist der
Ausweg, wenn es je bricht, und kostet fünf Binärdateien plus eine Lizenzablage.

**97 KB Schrift beim ersten Besuch.** Nachgemessen an
`.next/static/media`: 23 `.woff2` liegen im Image (252 192 B, alle
unicode-range-Schnitte), aber ein lateinischer Text holt genau fünf davon —
Chakra Petch 400/500/600 mit 9 728 · 9 944 · 10 040 B, Geist variabel mit
29 288 B, JetBrains Mono variabel mit 40 480 B, zusammen **99 480 B**. Die
variable Fassung von JetBrains Mono deckt damit 400/500/600/700 in einer Datei
ab, wofür vier statische Schnitte ungefähr dasselbe gekostet hätten.

**Turbopack liefert weder eine metrisch angepasste Ersatzschrift noch
Font-Preloads.** Nachgemessen am Produktionsbuild: im ausgelieferten Stylesheet
steht kein `size-adjust`, kein `ascent-override` und keine `… Fallback`-Familie,
und im `<head>` steht kein `<link rel="preload" as="font">`. Die Werte *gäbe*
es — `getFallbackFontOverrideMetrics` rechnet sie für alle drei Familien aus
(Chakra Petch `size-adjust: 102.51%`, Geist `104.76%`, JetBrains Mono
`134.59%`) —, aber die Stelle, die daraus ein `@font-face` macht, ist
`build/webpack/loaders/next-font-loader/postcss-next-font.js`, und Next 16 baut
mit Turbopack. Mit `font-display: swap` und ohne angepassten Ersatz heißt das:
ein echter Textwechsel beim ersten Besuch, und der verschiebt Layout.
**Das ist ein CLS-Befund und gehört zu L8**, dessen Budget CLS = 0 verlangt.
Hier steht er mit Zahlen, damit L8 ihn nicht ein zweites Mal findet. G2 baut
nichts dagegen: gemessen ist die Abweichung, nicht ihre Wirkung, und eine
handgerechnete Ersatzschrift ohne eine einzige CLS-Messung wäre genau das
Werkzeug auf Vorrat, das `CLAUDE.md` unter „Maß halten" verbietet.

**`color-mix()` ist jetzt eine Voraussetzung.** Seit 2023 in allen drei Engines,
also unkritisch — aber eine Palette, die ihn nicht kennt, bekommt keinen
Unterstrich und keinen Schein, statt sie in der falschen Farbe zu bekommen.

**Der Handoff hat ein Bauteil, das der Linter zurückweist.** `ThemeSwitch`
stand als `useState('')` plus `useEffect`, der nach dem Mount korrigiert. React
19 verbietet das (`react-hooks/set-state-in-effect`), und aus dem richtigen
Grund: das Theme lebt am `<html>`-Element, also in einem externen System.
Die Fassung hier liest es über `useSyncExternalStore` — Server-Snapshot `null`,
Client-Snapshot das Attribut. Dieselbe Prüfung steht den übrigen fünf
Handoff-Komponenten in G6 und G7 noch bevor.

## Verworfene Alternativen

**Ein zweites Stylesheet statt der Änderung an `tokens.css`.** Eine Datei, die
nach `tokens.css` importiert wird und die drei Familien überschreibt, ließe die
Handoff-Datei unberührt. Sie wäre aber genau die Stelle, an der jemand die
Importreihenfolge falsch liest — und die vier Akzent-Tokens hätten trotzdem in
`tokens.css` gemusst, weil `globals.css` sie in jeder Palette braucht. Eine
Datei anfassen und es aufschreiben schlägt zwei Dateien, die sich einig sein
müssen.

**Vier Werte × sieben Paletten statt `color-mix`.** Achtundzwanzig Zeilen, in
denen niemand sieht, dass `--acc-line` und `--acc` dieselbe Farbe meinen. Der
Backlog vom 27.08. hat beide Wege nebeneinander notiert; der abgeleitete ist der,
bei dem eine achte Palette nichts kostet.

**Ein achter Zustand „SYSTEM" im Umschalter.** Wäre nötig gewesen, wenn der
`prefers-color-scheme`-Block bliebe — dann bräuchte „Terminal Noir" eine eigene
ID und „System" die leere. Beides zusammen ist ein Knopf mehr, ein Zustand mehr
und eine Erklärung mehr, für ein Verhalten, das ausdrücklich nicht mehr gewollt
ist.

**`next/script` mit `strategy="beforeInteractive"`.** Setzt das Skript ebenfalls
ins Server-HTML und wäre die dokumentierte Next-Form. Sie bringt aber eine
Client-Komponente und ihre Laufzeit für acht Zeilen mit, die vor jeder Laufzeit
stehen müssen, und ändert an der gemessenen Position im `<head>` nichts.

**Das Nonce jetzt verdrahten.** Näher am Wortlaut des Bauplans und ein Rückbau
für G4 — siehe Entscheidung 5.

**`display: "optional"` gegen den Textwechsel.** Erzwingt CLS 0, um den Preis,
dass ein Besucher mit langsamer Leitung die Schriften in dieser Sitzung nie
sieht. Bei einem Entwurf, der von seiner Typografie lebt, ist das die teurere
Hälfte des Tauschs — und die Entscheidung gehört zu L8, wo die Zahl daneben
steht.

## Belege

- Bauplan, Stufe G, Phase G2 (Z. 1201–1202) und L4 (Z. 1325)
- `backlog.md`, 28.08.2026 — die zwei Entscheidungen und „Als Nächstes"
- `docs/design/code/README.md` — Abschnitt „Themes", das Snippet, die Gewichte
- `docs/design/Homepage Themes` — „Was ein Theme darf / nicht darf", die
  gemessenen Kontraste
- ADR 0042 (Tailwind ohne Palette — `@theme inline` trägt die sieben Paletten),
  ADR 0006 (kein CDN, keine dritte Partei im Anfragepfad), ADR 0001 (App Router)
- `CLAUDE.md`, Invarianten 8 und 9, „Maß halten"
