# ADR 0070 — Der Renderer, den ADR 0002 versprochen hat: das Schema, die drei Plugins und der Rahmen ohne Farbe

**Status:** Angenommen
**Datum:** 2026-09-04
**Betrifft:** H9a, H9b, H9c, K2, #192, #246
**Invarianten:** 1 (keine erfundenen Zahlen), 5 (Belege zeigen nie ins Leere),
8 (keine Farbe außerhalb `tokens.css`)

## Kontext

`web/content/posts/` hält seit dem 23.08.2026 Beiträge, und **keiner ist je
gerendert worden.** Einundzwanzig Dateien, 001 bis 021, geschrieben nach der
Regel aus `CLAUDE.md` — „Jede Stufe schreibt ihren stärksten Fund auf, solange er
frisch ist" — und gelesen hat sie bis heute nur `git`.

Das hat sechs Phasen lang Fäden zurückgehalten, und jede hat es aufgeschrieben
statt sie zu spannen: `components/home/LogRow.tsx` nennt einen Beitrag und
verlinkt ihn nicht, `components/case/IncidentLog.tsx` druckt `post_slug` als
Text, `lib/work/log.ts` liefert einen Zähler ohne Pfeil, `lib/seo/feed.ts`
liefert einen gültigen Kanal mit null Einträgen. Alle vier nennen denselben
Grund: **Invariante 5**, ein `<a>` auf `/blog/<slug>` wäre eine 404.

ADR 0002 hat den Weg vor achtzehn Tagen entschieden — MDX im Repository, über
`@next/mdx` — und **kein einziges Paket davon war installiert.** Die Entscheidung
stand, die Umsetzung war diese Phase.

Dazu zwei fällige Issues. **#192:** „`title`, `deck`, `published`, `tags`,
`system` und `summary` on the first log post were read off the `Blog Post` design
sheet, not off a renderer. Until H9 builds one, **nothing** checks that file."
**#246:** die Typo-Skala kennt h1 bis h3 und hört auf — „H9 is the first place
that does [render long-form prose]".

## Entscheidung

### 1. `@next/mdx` mit drei Plugins, und die Plugins sind Strings

`@next/mdx` · `@mdx-js/loader` · `@mdx-js/react` · `@types/mdx` ·
`remark-frontmatter` · `remark-gfm` · `rehype-slug` · `github-slugger`, alle als
**devDependencies**. Kompiliert wird zur Bauzeit; der Rumpf kommt als React-Baum
an, nicht als HTML-String — kein `dangerouslySetInnerHTML`, kein Sanitizer, kein
Markdown-Parser im Bundle.

**Die Plugins stehen als Namen da, nicht als Funktionen**, und das ist keine
Vorliebe. Next 16 baut mit Turbopack, und der Leitfaden nennt die Grenze als
Tatsache: „remark and rehype plugins without serializable options cannot be used
yet with Turbopack, because JavaScript functions can't be passed to Rust."
Ein importiertes Plugin würde nicht laut scheitern, sondern beim Bauen.

Warum jedes, gemessen am Bestand statt an dem, was ein Blog eines Tages könnte:

| Plugin | Grund | Gezählt |
|---|---|---|
| `remark-frontmatter` | der `---`-Block ist für MDX ein Trennstrich plus Prosa | 21 von 21 Dateien |
| `remark-gfm` | Tabellen, die CommonMark nicht hat | 39 Tabellenzeilen |
| `rehype-slug` | die Inhaltsschiene verlinkt Überschriften, ein Link braucht eine `id` | 117 Überschriften |
| `github-slugger` | **dasselbe Paket**, das `rehype-slug` benutzt, damit `lib/content/toc.ts` die Regel nicht abschreibt | – |

Das achte Paket ist das interessanteste: es fügt dem Baum **keine Zeile Code**
hinzu, weil `rehype-slug` es ohnehin mitbringt. Deklariert statt aus dem Hoist
geliehen, aus dem Grund, den `next.config.ts` über `outputFileTracingIncludes`
schon aufschreibt — eine Abhängigkeit, die zufällig hält, verbindet niemand mit
dem Versionssprung, der sie bricht.

**Kein `pageExtensions`.** Die Beiträge liegen außerhalb von `app/` und werden
importiert, nicht geroutet.

### 2. Das Schema: gezeichnet ist Pflicht, und `updated` ist die Ausnahme

#192 verlangt: „the frontmatter of every post in `web/content/posts/` is
validated by the thing that renders it." Die Regel, die das entscheidet, ist
älter als die Frage und hat sich nicht geändert — **jedes Feld, das gezeichnet
wird, ist Pflicht.** Bis H9a war die einzige Fläche eine dreizellige Zeile, also
waren es drei Schlüssel. Die Beitragsseite zeichnet zwei weitere.

| Schlüssel | Status | Wer zeichnet ihn |
|---|---|---|
| `title` · `deck` · `published` | Pflicht, seit H5c | Startseite, Index, Beitrag |
| `tags` | **Pflicht, neu** | Meta-Zeile des Beitrags, Zeile im Index |
| `summary` | **Pflicht, neu** | SUMMARY-Panel, `<description>` im Feed (H9c) |
| `systemId` | nullbar | niemand zeichnet ihn; der Work Index zählt danach |
| `updated` | **optional, neu** | Meta-Zeile, wenn er dasteht |

**`updated` steht gegen ein Blatt, das ihn als Pflicht führt** — „Zwei Daten —
PUBLISHED und UPDATED, beide ISO". Kein Beitrag dieses Repositoriums ist je
geändert worden, also müsste das Datum irgendwoher kommen: aus der Bauuhr oder
aus einer Hand. Beides ist Invariante 1, und **#284 ist genau diese Form** eine
Fallstudie weiter: „updatedAt is the last hand-typed fact on a case study, and
nothing checks it." Der Schlüssel wird gelesen, wenn er dasteht, und die Zeile
fehlt, wenn nicht. Ein `— NO DATA` wäre die falsche Auskunft: es sagt, eine Zahl
fehle, und hier hat schlicht nichts stattgefunden.

**Ein `tags`-Eintrag, der nicht zu sich selbst passt, verwirft die ganze Liste.**
Ein Tag wird ein Chip-Schlüssel, ein `data`-Attribut und eine Seite eines
Vergleichs; `Rate Limiting` mit Leerzeichen käme durch einen nachsichtigen Leser
und fände sich danach selbst nicht wieder. Halb gelesene Tags sind ein Beitrag
unter den falschen Themen.

### 3. Kein Highlighter: der Rahmen wird gebaut, die Töne nicht

Das Blatt zeichnet Code in zwei Tönen — „Keywords Signal, Kommentare Steel,
Strings Amber". Diese Phase liefert keinen.

Der Grund ist nicht die Bundle-Größe: ein Tokenizer liefe zur Bauzeit und kostete
null Client-Bytes. Er ist, dass **die ganze Ausgabe eines Tokenizers Farbe ist**
und Farbe nach Invariante 8 in `tokens.css` wohnt. `shiki` bringt Themes mit,
deren Werte an keiner Palette dieser Seite hängen; sieben Paletten × ein Theme,
das keine davon kennt, ist entweder eine achte Palette in einem Paket oder eine
Zuordnung von Hand, die niemand geprüft hat.

Gebaut ist der Rahmen, den das Blatt um die Töne zeichnet: Kopfzeile mit der
Sprache, Zeilennummern in eigener Spalte, waagerechtes Scrollen. **79 Blöcke,
37 mit Sprache und 42 ohne** — die ohne bekommen keine Kopfzeile statt einer, auf
der `TEXT` steht.

Der `COPY`-Knopf fällt aus demselben Satz: er ist die einzige Insel, die diese
Seite bräuchte, und sie wäre für eine Bequemlichkeit da, die jeder Browser über
die Auswahl schon anbietet.

### 4. h4–h6 setzen die Leiter in die Body-Stufen fort (#246)

Die Display-Stufen enden bei h3: 62 · 34 · 26 und dann nichts. Darunter existieren
die Body-Stufen, und sie laufen in dieselbe Richtung — 16,5 · 15 · 13. Also läuft
die Leiter weiter, statt neu anzufangen.

**Keine neue Stufe in `tokens.css`.** Der Consistency Check bietet in E-01 beide
Wege an — „Entweder die Seiten auf die Skala ziehen oder die Skala um 56
erweitern" — und G1 hat für jede Seite dieser Site den ersten genommen. Den
zweiten hier für eine Überschriftsebene zu nehmen, die noch nichts benutzt, wäre
eine dreizehnte Stufe für einen Hypothesenfall.

**Und die Tür zu Chakra Petch 400 fällt zu.** `app/fonts.ts` hielt sie seit #239
für genau diese Stelle offen: „If they land on the display face at 400, this line
comes back." Sie landen auf 500, das ohnehin geladen ist. **9 728 B bleiben
gespart.**

### 5. Was nicht gebaut ist, und warum jedes einzelne

Die Bausteine-Tafel des Blattes führt 7 Pflicht- und 9 optionale Blöcke. Gebaut
sind alle sieben Pflichtblöcke und drei der neun optionalen.

| Nicht gebaut | Grund |
|---|---|
| `SERIES`-Marker | es gibt keine Serie und keinen Schlüssel dafür. Blattregel: „nur bei mehrteiligen Einträgen" |
| `POSTMORTEM`-Kasten · `MEASURE`-Tabelle · Terminal-Aufnahme | kein Beitrag benutzt sie. Ein Bauteil ohne Verbraucher ist die Form, die #292 offenhält |
| `COPY`-Knopf | siehe 3 |
| Fortschrittsbalken | scroll-gekoppelte Bewegung samt `@supports`-Kapselung und Firefox-Rückfall gehört I2 |
| aktiver Eintrag in der Schiene | derselbe Satz: er braucht einen Scroll-Beobachter |
| Aufklapp-Panel für CONTENTS bei 390 | entweder eine Insel oder ein `<details>`, dessen Zustand der Breite nicht folgen kann |

Das Porträt ist **ein sichtbar leerer Slot**, gestrichelt, wie das Blatt ihn
zeichnet und wie der Build-Plan es für K2 formuliert.

### 6. Die Wortzahl ist gemessen, die Minuten sind abgeleitet — und der Teiler steht im Blatt

`2 480 WORDS` ist eine Tatsache über eine Datei. `12 MIN` ist diese Tatsache
geteilt durch eine Rate, und eine Rate ist eine Konvention — also steht sie als
eine Konstante da statt in einem Ausdruck.

**Der Teiler kommt vom Blatt, nicht aus dem Internet.** Das Artboard druckt
`12 MIN · 2 480 WORDS` nebeneinander; 2 480 ÷ 12 sind 206,7. Zweihundert Wörter
pro Minute reproduzieren das Paar des Blattes exakt.

**Code wird nicht mitgezählt.** 79 Blöcke, im Schnitt 3,3 Zeilen — mitgezählt
läse sich der Beitrag mit mehr Listings länger als der mit mehr Inhalt.

## Konsequenzen

- **`/blog/<slug>` existiert, und damit ist Invariante 5 für vier Orte gelöst.**
  H9c spannt die Fäden; diese Phase hat nur den Anker gesetzt.
- **63 statisch vorgerenderte Routen mehr** (21 Beiträge × 3 Sprachen).
- **Die Beiträge werden ab jetzt zweimal gelesen**: `readFileSync` für das
  Frontmatter, Import für den Rumpf. `outputFileTracingIncludes` bleibt für die
  erste Hälfte.
- **Die Einträge sind indexierbar, `/blog` ist es nicht** — dieselbe Asymmetrie,
  die H1 zwischen der Fallstudie und `/work` hatte, aus demselben Grund: die
  Einträge haben etwas zu sagen, der Stub sagt `LOG [SOON]`.
- **Ein Fund, der schon in Produktion stand.** Ein `deck` und fünf `summary`
  schreiben Inline-Code mit Backticks, und die Startseite zeichnet einen davon
  seit H5c **mit den Zeichen darin**. Frontmatter erreicht `remark` nie, also hat
  eine Auszeichnung dort keinen Renderer. Sie wird beim Lesen entfernt, an einer
  Stelle, damit die drei Flächen sich nicht widersprechen können.
- **Und eine Zahl des Blattes, die sich selbst widerspricht.** Das Blatt zeichnet
  die Spalte 700px breit und nennt als Lesemaß 68 Zeichen. Gemessen im Rig lösen
  68ch bei 16,5px Geist zu **748px** auf. Die Spalte gewinnt, eine Zeile trägt
  also rund **64 Zeichen statt 68** — schmaler als die Angabe, nie breiter.

### Was das kostet

- **Acht Pakete für eine Seite.** Alle acht sind `devDependencies` und laufen zur
  Bauzeit, aber sie sind acht Supply-Chain-Kanten mehr, die `check-vuln` und
  Dependabot ab jetzt tragen. Der Preis ist bewusst gezahlt: die Alternative war
  ein eigener Markdown-Parser für 79 Code-Fences, 39 Tabellenzeilen und
  Blockquotes — und damit eine zweite Meinung darüber, was auf der Seite steht.
- **Der Bau dauert länger.** 110 statische Seiten statt 47.
- **Ein Beitrag erfordert einen Deploy**, und ab jetzt merkt man es. ADR 0002 hat
  den Preis benannt; H9a ist die Phase, in der er fällig wird.
- **Zwei Titel überschreiten die 58 Zeichen, die das Blatt setzt** (68 und 63).
  Sie sind veröffentlicht. Die Regel kam nach ihnen, und eine gedruckte
  Überschrift nachträglich zu kürzen, damit eine Zeichnung recht behält, ist die
  falsche Richtung. Die Zahl wird gemessen und festgehalten — ein **dritter**
  Titel ist damit eine Entscheidung und keine Drift.

## Verworfene Alternativen

**Ein eigener Markdown→JSX-Renderer, null Pakete.** Widerspricht ADR 0002 und
müsste 79 Code-Fences, 39 Tabellenzeilen, Blockquotes, Listen und Fußnoten selbst
tragen. Das ist ein Parser, und ein Parser ist die eine Sorte Code, bei der „fast
richtig" wie ein Rendering-Fehler aussieht.

**`next-mdx-remote`.** Kompiliert zur Laufzeit. Für Inhalt, der im selben
Repository liegt und mit demselben Deploy ausgeliefert wird, ist das ein
Compiler, der bei jedem Aufruf dieselbe Antwort neu ausrechnet.

**`@shikijs/rehype` zur Bauzeit.** Null Client-Bytes und echte Tokenisierung —
und sieben Paletten, die kein Theme dieses Pakets kennt. Siehe 3.

**Die Skala um eine 21er-Stufe erweitern.** E-01 bietet das an. Es wäre die
dreizehnte Stufe für eine Seite, und G1 hat für alle anderen anders entschieden.

**`updated` aus `git log` beziehen.** Das Datum wäre echt und stünde im Bild
richtig. Es ist im Container aber nicht vorhanden: das Produktions-Image trägt
kein `.git`, und ein Wert, der beim Bauen eingebacken wird, ist beim nächsten
Deploy ein anderer, ohne dass jemand den Text geändert hat.

## Belege

Build-Plan Kapitel 4.6 und Phase H9. Blätter `Blog Post` und
`Intermediate Widths` (read-only). Issues #192, #246, #239, #284, #292, #237.
`ADR 0002` (MDX im Repo) · `ADR 0043` (Farben folgen der Palette) ·
`ADR 0046` (die Sprachroute) · `ADR 0060` (eine Lücke ist kein `— NO DATA`) ·
`ADR 0062` (die Zeile, die nirgends hinführt).
