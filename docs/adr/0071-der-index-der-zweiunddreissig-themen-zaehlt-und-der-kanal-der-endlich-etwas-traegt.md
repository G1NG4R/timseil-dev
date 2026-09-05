# ADR 0071 — Der Index, der zweiunddreißig Themen zählt, und der Kanal, der endlich etwas trägt

**Status:** Angenommen
**Datum:** 2026-09-05
**Betrifft:** H9b, H9c, I2, #322, #293
**Invarianten:** 1 (keine erfundenen Zahlen), 5 (Belege zeigen nie ins Leere),
8 (keine Farbe außerhalb `tokens.css`)

## Kontext

`/blog` war der letzte Stub dieser Seite, der etwas zu sagen gehabt hätte. Seit
H9a (ADR 0070) existiert `/blog/<slug>`, und dreiundzwanzig Einträge sind
indexierbar — der Index, der zu ihnen führt, war es nicht. Drei Stellen im Baum
haben diese Phase namentlich genannt und ihre Aufgabe beschrieben:
`docs/build-plan.md:1244` („MDX, Filter, Suche … **zwei Leerzustände im
Index**"), `web/lib/seo/pages.ts` („**H9b flips the one remaining row**") und die
Kopfzeile des Stubs selbst („H9 REPLACES this file").

Der Schnitt H9a/b/c stand dabei nirgends geschrieben. Er war aus ADR 0070s
`Betrifft`-Zeile, einer Backlog-Zeile und einem Codekommentar zu rekonstruieren.
**Dieses ADR schreibt ihn auf:** H9a der Renderer, H9b der Index samt Feed, H9c
die drei hängenden Verweise (`LogRow`, `IncidentLog`/#298, der Pfeil in
`lib/work/log.ts`).

## Entscheidung

### 1. Ein Tag zur Zeit — und die Entscheidung fällt zum zweiten Mal gleich

Das Blatt-Skript hält `tag = "all"`, `docs/design/README.md:610` führt
`activeTags: Set`. Der Backlog hat die Frage ausdrücklich hierher verschoben.

**Single-select**, und der Grund ist nicht das Blatt, sondern die Wiederholung:
derselbe README-Abschnitt führt für den Work-Filter genauso `activeStacks: Set,
activeStates: Set` — und **H6b hat dort gegen den README und für das
ausgeführte Blatt entschieden**. Ein zweites Mal andersherum zu entscheiden gäbe
einer Seite zwei Filterflächen, die verschieden arbeiten. Das ist die Form, die
dieses Repository als #241 führt.

`lib/blog/filter.ts` erbt damit die Gestalt von `lib/work/filter.ts`, und
`FilterChip` wird ohne eine Zeile Änderung wiederverwendet.

**Der Sentinel ist aber ein anderer.** `ANY_STACK` ist `"any"`; hier ist
`ALL_TAGS` **`"*"`**, ein String, den `posts.ts`' `TAG`-Muster niemals erzeugen
kann. Der Grund ist die Herkunft des Vokabulars: Stack-Schlüssel kommen aus einer
API-Antwort, Tags aus Prosa, die ich später schreibe. `tags: ['all']` ist
vollkommen legales Frontmatter, und an dem Tag wären Sentinel und Thema derselbe
Wert.

### 2. Die Chip-Reihe ist der Korpus, nicht eine Auswahl daraus

**Gemessen:** 32 verschiedene Tags über 23 Beiträge, **17 davon genau einmal**.
Das Blatt zeichnet 8 Chips (`ALL` + 7) über zehn erfundenen Einträgen mit sieben
erfundenen Themen.

**Alle 32 werden gezeichnet, alphabetisch nach Schlüssel, ohne Deckel.** Die
Regel dafür steht seit H6b in `lib/work/stacks.ts` und ist nicht neu: das
Vokabular wird aus den Daten abgeleitet, damit „a chip that matches nothing is
never drawn in the first place". Jeder dieser 32 trifft mindestens einen Eintrag,
also ist jeder ein lebendes Bedienelement.

Eine Schwelle „ab 3 Beiträgen" hätte heute **zufällig genau die 8 Chips des
Blattes** ergeben — testing 09 · frontend 09 · observability 06 · css 06 ·
measurement 04 · invariants 04 · design-handoff 03. Genau deshalb nicht: die
Zahl 3 hätte nichts gemessen, sie hätte ein Bild reproduziert, und sie hätte
morgen eine andere Reihe gezeichnet. **Der Unterschied 8 zu 32 ist ein Fund, kein
Fehler, den man wegrechnet.**

Sortiert nach Schlüssel und mit einem Code-Unit-Vergleich statt `localeCompare`,
aus dem Grund, den `stackTags` aufschreibt: eine Reihenfolge, die von den
ICU-Daten des laufenden Node abhängt, ist auf einer anderen Maschine eine andere
Reihe.

### 3. Die Suche liest die Felder, die die Zeile zeichnet

Das Blatt widerspricht sich hier mit sich selbst: der Platzhalter sagt
`grep titles…`, das Skript darunter matcht `r.textContent` — also die ganze
Zeile, Datum und `12 MIN` eingeschlossen.

**Weder das eine noch das andere.** Gesucht wird über **Titel, Deck und Tags** —
die Regel, mit der ADR 0070 §2 das Frontmatter-Schema entschieden hat: jedes
Feld, das gezeichnet wird. Das Datum bleibt draußen, weil `2026` sonst
zweiundzwanzig Einträge zurückgäbe, ohne dass jemand nach einem Jahr gesucht hat.
`summary` bleibt ebenfalls draußen, und das ist das einzige gezeichnete Feld, das
fehlt: der Index druckt es nicht, und ein Treffer, den der Leser auf der Seite
nicht sehen kann, ist eine Zeile ohne sichtbaren Grund.

**Der Platzhalter sagt jetzt, was der Code tut.**

### 4. Drei Zustände, zwei Vokabulare, nichts Neues erfunden

| Fall | Kopf | Fläche |
|---|---|---|
| gelesen, 0 Einträge | `ENTRIES 00` | `0 entries` + Ausweg `/work` |
| gefiltert, 0 Treffer | unverändert | Grund + gesetzte Filter + Reset |
| nicht lesbar | `— NO DATA` | `— NO DATA` |

Das Blatt zeichnet zwei; der dritte ist ADR 0062 §4s Unterscheidung für
denselben Lesevorgang auf der Startseite. `00` ist eine Messung, `— NO DATA`
heißt, dass das Image ohne seinen eigenen Inhalt ausgeliefert wurde.

**Und `LATEST` verschwindet, statt `— NO DATA` zu sagen, wenn der Log leer ist.**
Ein Strich dort behauptete, eine Zahl fehle; in Wahrheit hat nichts
stattgefunden. Das ist ADR 0070 §2s Lesart des `updated`-Schlüssels, eine Seite
weiter angewandt.

**Der Text des zweiten Panels nennt die Kombination und nicht den Tag**, gegen
das Blatt („Zu diesem Tag gibt es noch nichts."). Weil jeder Chip aus dem Korpus
abgeleitet ist und seinen Zähler trägt, **kann ein Tag allein nie null Treffer
erzeugen** — leer wird es nur über die Suche oder über eine Kombination. Einem
Leser zu sagen, sein Tag sei leer, während der Zähler daneben `06` zeigt, wäre
die Seite im Widerspruch zu sich selbst.

### 5. Die Zeile ist ein Link, und `WorkRow` ist keiner

`components/work/WorkRow.tsx` lehnt ausdrücklich ab, ein Link zu sein. Diese
Zeile ist einer, und die Abweichung ist argumentiert statt hineingerutscht.

Was `WorkRow` abgelehnt hat, waren **drei** Bedienelemente zu einem Ziel — „a
keyboard trap dressed as thoroughness". Die Zahl war das Argument, nicht die
Verschachtelung. Eine Log-Zeile hat genau ein Ziel und nichts anderes zum
Anklicken: kein Repository-Adressfeld, keinen zweiten Pfeil. Ein `<Link>` um das
Raster ist **ein** Tab-Stop, dieselbe Zahl, auf die `WorkRow` kommt, und es gibt
kein verschachteltes Bedienelement, das die Auszeichnung ungültig machen könnte.

**Und der Linktext ist der Titel**, weshalb es so herum gewickelt ist. `WorkRow`
muss für einen nackten `→` einen Namen erfinden, weil der *Name* eines Systems
kein Satz ist, den man anklickt. Der Titel eines Eintrags ist genau das. Der
Pfeil ist damit Dekoration und sagt das auch (`aria-hidden`).

### 6. Eine Liste beschreibt sich einmal, für zwei Seiten (#322)

#322 nennt den Preis des Aufschiebens selbst: „taken twice a phase apart it will
come out differently, and then the two lists disagree in a way no test will ever
catch." Also **ein** Bauteil, `collectionLd`, angewandt auf `/work` und `/blog`.

`CollectionPage` und **nicht** `Blog`: schema.org hat einen `Blog`-Typ, und der
passte auf eine der beiden Seiten. Ein Typ, der die *Gestalt* beschreibt, steht
über Systemen wie über Einträgen, ohne dass eines als das andere ausgegeben wird.
`itemListOrder` wird ausgeschrieben, weil beide Listen eine Reihenfolge haben,
die etwas bedeutet — neueste zuerst und `ORDER BY s.system_no` — und eine
`ItemList` ohne diese Angabe ist per Vorgabe ungeordnet.

**Eine Zeile ohne eigene Seite trägt einen Namen und keine `url`.** Das ist
Invariante 5 in der maschinenlesbaren Hälfte und derselbe Grund, aus dem
`WorkRow` einem `queued`-System keinen Pfeil zeichnet.

**Der Block von `/work` steht in der gestreamten Region**, weil die Liste dort
steht. Eine `ItemList` mit `numberOfItems: 0` über einem Ausfall wäre die
maschinenlesbare Behauptung, diese Seite betreibe nichts.

**`SearchAction` bleibt abwesend, und der Grund wechselt.** `jsonld.ts` führte
sie unter „deliberately absent — there is no site search until H9". Die Suche
kommt jetzt; sie ist aber ein Filter innerhalb einer vorgerenderten Seite und hat
**keine Query-URL**, weil die Achsen in `searchParams` die Route dynamisch
machten. Jede URL, die wir anbieten könnten, antwortete mit dem ungefilterten
Index.

### 7. Der Feed wird in dieser Phase gefüllt, weil diese Phase für ihn wirbt

Der Index zeichnet eine `FEED → RSS · /feed.xml ↗`-Zeile **und** einen
`SUBSCRIBE`-Block. Beides über einem gültigen, leeren Kanal zu bauen wäre
derselbe Fehler eine Schicht weiter außen: ein Bedienelement, das etwas
verspricht, was die Maschine dahinter nicht liefert — was `LogRow`,
`IncidentLog` und der Feed selbst nacheinander abgelehnt haben.

`renderFeed` war seit H9a gebaut und getestet und wurde nur mit `[]` gerufen; der
Grund dafür ist mit H9as eigenem Merge erloschen. **Damit endet der Widerspruch,
den der Backlog datiert hat** — die Sitemap führte dreiundzwanzig Einträge, der
Feed null — in derselben Phase, die ihn sichtbar macht. `FEED_CACHE_CONTROL` steht
seit G5 richtig; die `s-maxage`-Notiz brauchte nichts.

`<description>` ist `summary` und nicht `deck`. `posts.ts` hat diesen Leser
benannt, als es die beiden trennte: die Zusammenfassung ist „the only text about
a post that leaves this site".

### 8. Was gezeichnet und nicht gebaut ist

| | Grund |
|---|---|
| Pagination (`PAGE 01 / 01` · `OLDER ENTRIES →`) | 23 Einträge sind eine Seite. Der Pfeil führte nirgends hin — das tote Bedienelement, das STATE.05 ablehnt, und das dritte Mal, dass diese Seite eines nicht zeichnet |
| Serien-Marker | ADR 0070 §5 unverändert: keine Serie, kein Schlüssel |
| Jahres-Filter | Das Leerzustands-Artboard echot `JAHR: 2025 ×`, **und kein Bedienelement der Seite kann ihn setzen** — das Blatt-Skript kennt `tag` und `q`. Eine Achse aus einer Zeichnung zu erfinden ist die Form, die #292 offenhält |
| Filterzustand in der URL | `searchParams` machte die Route dynamisch. Der Preis — eine verengte Liste ist nicht verlinkbar und überlebt kein Neuladen — steht hier statt später neu entschieden zu werden |

## Konsequenzen

- **Der letzte `[SOON]`-Stub mit Inhalt ist weg.** Fünf von sieben festen Routen
  sind indexierbar; die zwei verbleibenden gehören H12.
- **Sitemap und Feed führen dieselbe Zahl.** 87 URLs, 23 Feed-Einträge.
- **Eine zweite Insel auf dieser Seite, und die Liste überquert die Grenze
  nicht.** Zeilen und Jahresüberschriften gehen als gerenderte Knoten hinein;
  `PostCard`, `next/link` und die Zustandsbauteile bleiben serverseitig.
- **`PostCard` ist gebaut, und der Name bleibt der des Inventars.** Das Blatt
  zeichnet eine Zeile („Mono-Liste, keine Karten"); ADR 0066 hat dieselbe
  Namensabweichung bei `TrajectoryRail` stehen lassen, weil die Registry eine
  zweite Lesung des Handoffs ist und keine Beschreibung des Gebauten.
- **Ein Fund im geteilten Leerpanel.** `.st-empty-filters` trennte die Echos mit
  8px Abstand. Auf `/work` sind das einzelne Wörter; hier sind es Phrasen, und
  `TAG: CSS SEARCH: "witness"` liest sich auf dem Bildschirm als ein Satz.
  Gemessen an der gebauten Seite, nicht vermutet. Repariert mit einer Linie statt
  mit einem `·` in `content`: erzeugter Text landet auf manchen Engines im
  Barrierefreiheits-Baum und auf anderen nicht.
- **Und die `<Activity>`-Falle hat genau dort zugeschlagen, wo sie angekündigt
  war.** Der H9a-Backlog nennt „H9b und J1 zuerst". Der erste Entwurf des Specs
  hat sich aus der Warnung herausargumentiert — Index und Eintrag seien doch
  *zwei verschiedene* Routen — und `main h1` löste beim ersten Lauf zu **zwei**
  Elementen auf. Die Regel handelt davon, was montiert bleibt, nicht davon, zu
  welcher Route es gehört.

### Was das kostet

- **Zweiunddreißig Chips sind eine Wand.** Am Schreibtisch brechen sie über
  mehrere Zeilen um, auf dem Telefon scrollen sie waagerecht. Das ist ehrlich und
  es ist nicht schön; die Alternative war eine getippte Zahl.
- **Der Jahres-Trenner ist heute unsichtbar.** Alle dreiundzwanzig Einträge sind
  von 2026, also zeichnet die Seite genau eine Überschrift. Die Gruppierung ist
  gebaut und ihre Wirkung nur im Test zu sehen, bis der Log ein Jahr alt wird.
- **Jeder Eintrag wird beim Bauen ein drittes Mal geöffnet.** Frontmatter für die
  Liste, die Datei für die Lesezeit. Zwanzig kleine Lesevorgänge in einem
  Prerender, aus dem Grund, den `posts.ts` nennt: eine Wortzahl in `PostMeta`
  ließe Startseite und Work-Index für eine Zahl zahlen, die keine von beiden
  zeichnet.
- **Der Feed ist ab jetzt eine Fläche, die mit jedem Beitrag falsch werden kann.**
  Ein unmaskiertes `&` in einem Titel ergibt ein Dokument, das manche Leser
  zurückweisen. `escapeXml` war seit H9a getestet, und der Kommentar dort sagte,
  er sei „written for the day one of them is a post title". Das ist dieser Tag.

## Verworfene Alternativen

**Mehrfachauswahl bei den Tags, wie `docs/design/README.md:610` sie führt.**
Näher am README und weiter weg von dem, was das Blatt ausführt — und sie hätte
eine dritte Frage aufgemacht (UND oder ODER), die niemand gestellt hat. Vor allem
hätte sie `/work` widersprochen, wo dieselbe Frage schon anders beantwortet ist.

**Eine Schwelle oder ein Deckel für die Chip-Reihe.** Reproduziert die Geometrie
des Blattes und tut es mit einer Zahl, die nichts gemessen hat. Siehe §2.

**Die Suche über die ganze Zeile, wie das Skript des Blattes.** Konsequent zu
„das Blatt-Skript ist die ausgeführte Fassung" — und macht `2026` und `12 MIN` zu
Suchbegriffen, ohne dass das jemand entschieden hätte.

**Den Feed H9c überlassen.** Der Schnitt sah es so vor. Er sah aber nicht vor,
dass der Index für den Feed *wirbt*: eine Phase lang hätte ein `SUBSCRIBE`-Knopf
einen leeren Kanal ausgeliefert, und wer dazwischen abonniert, merkt nichts.

**Den `SUBSCRIBE`-Block und die `FEED`-Zeile stattdessen zurückhalten.** Streng
nach dem Muster, das diese Seite dreimal angewandt hat — und der Preis wäre ein
ganzer Block des Blattes und eine Lücke im Kopf gewesen, für eine Phase, gegen
zwei Dateien Arbeit.

**Die Zeile nicht zum Link machen und den Pfeil zum Bedienelement, wie
`WorkRow`.** Konsistent auf den ersten Blick und schlechter beim zweiten: der
Pfeil bräuchte ein `aria-label` neben einem Titel, der der Name schon ist. Siehe
§5.

## Belege

Build-Plan Kapitel 4.6 und Phase H9. Blätter `Blog Index`, `Intermediate Widths`
und `State Language` (read-only). Issues #322, #292, #293, #241, #298.
`ADR 0002` (MDX im Repo) · `ADR 0060` (eine Lücke ist kein `— NO DATA`) ·
`ADR 0062` (der Log liest das Repository) · `ADR 0066` (das Inventar ist eine
zweite Lesung) · `ADR 0070` (der Renderer und das Schema).
