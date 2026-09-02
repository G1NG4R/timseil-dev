# ADR 0064 — Die Insel filtert Knoten, nicht Daten

**Status:** Angenommen
**Datum:** 2026-09-02
**Betrifft:** H6b, H9 (Blog-Index mit Filter und Suche), H7 — und jede spätere
Fläche, die eine server-gerenderte Liste unter ein Bedienelement stellt
**Invarianten:** 1 (keine erfundenen Zahlen), 8 (Werte aus `tokens.css`)

## Kontext

H6a hat `/work` gebaut und den Schnitt bewusst an der Client-Grenze gelegt: die
Seite ist vollständig aus Server Components und kostet das Startbündel null
Byte. H6b baut, was der Bauplan für H6 bestellt — „Filter, Zähler, Leerzustand
bei 0 Treffern" — und ist damit **das erste Client-Bauteil der Stufe H**.

Die Zahl, gegen die das läuft, steht in ADR 0050: 134 097 B Rahmenwerk, das wir
nicht schreiben, und **15 903 B eigener Code**, für den wir geradestehen. Davon
waren seit G7 9 178 B belegt — **6 725 B Luft**, und Stufe H baut dreizehn
Seiten, Stufe J das Terminal.

Der naheliegende Aufbau kostet den größten Teil davon in einer Phase. Bekäme die
Insel `WorkEntry[]` und zeichnete die Liste selbst, wanderten `WorkRow`,
`WorkPreview`, `StatusDot`, `NoData`, `SourceLine` und `next/link` mit ihr über
die Grenze — genau die Rechnung, die `SystemRow` und `WorkRow` in ihren eigenen
Kopfkommentaren ablehnen („NO `'use client'`, and the hover is the reason this
is worth saying").

Das Blatt schlägt einen dritten Weg vor. Sein Skript läuft über das DOM und
setzt `r.style.display = ok ? "grid" : "none"`. Das ist im Blatt richtig, weil
das Blatt kein React hat.

## Entscheidung

### 1. Die Zeilen kommen als fertige Knoten in die Insel

`WorkList` rendert jede `<WorkRow>` auf dem Server und reicht sie als Prop
weiter; die Insel entscheidet nur, welcher Knoten in den Baum kommt.

```tsx
rows={entries.map((entry) => ({
  key: entry.slug,
  st: entry.state,                      // was die Statusachse liest
  sk: entry.tags.map((tag) => tag.key), // was die Stackachse liest
  node: <WorkRow entry={entry} messages={messages} />,
}))}
```

**Das ist keine Erfindung dieser Phase, sondern die dokumentierte Naht.** Der
Leitfaden im Bild dieser Next-Version sagt es ausdrücklich: die Regel, dass die
Importe eines Client-Moduls mit ihm ins Bündel wandern, gilt *nicht* für
Server-Komponenten, die „as children or other props" hereingereicht werden —
„they are rendered on the server and passed to the Client Component as rendered
output". `FooterLeadGate` geht diesen Weg seit G3 mit `children`, `SiteHeader`
seit G3 mit `status={<Suspense>…}`; neu ist hier nur, dass es ein **Array** von
Knoten ist.

**Gemessen, nicht gehofft.** `/` bleibt bei 143 580 B, Byte für Byte. `/work`
bekommt genau einen zusätzlichen Chunk von **1 635 B gzip**. Im
Client-Manifest der Route stehen `WorkFilters` und `next/link` — `WorkRow`,
`WorkPreview`, `StatusDot` und `NoData` stehen nicht darin.

### 2. Gefiltert wird durch Nicht-Rendern, nicht durch `display: none`

Das DOM gehört React. Die Insel schreibt nicht hinein, sie gibt weniger Knoten
zurück. Der Leerzustand ist damit ein Zweig statt eines Elements, das dauerhaft
im Dokument steht und auf seine Sichtbarkeit wartet.

**Die Zeile trägt trotzdem `data-st` und `data-sk`.** Nichts im eigenen Code
liest sie — sie stehen da, damit ein Test die Behauptung eines Chips gegen das
Element halten kann, das sie trägt. Das ist die eine Aussage, die weder der
Unit-Test des Filters noch ein Bildvergleich machen kann.

### 3. Der Zustand lebt im Client, nicht in der URL

`useState`, zwei Achsen, Sentinels `all` und `any`, per UND verknüpft.

`searchParams` wäre teilbar und reload-fest und macht die Route dynamisch. Das
kostet die vorgerenderte Schale, die H6a mit Absicht gebaut hat: Legende und
Kontaktsatz stehen dort **außerhalb** des Suspense-Lochs, damit ein Leser bei
toter API immer noch das Vokabular und den Weg hinaus bekommt — die Hälfte eines
Ausfalls, an die sich diese Seite immer wieder erinnern muss.

**Der Preis steht hier, damit er nicht zweimal verhandelt wird:** ein
eingeengter Filter lässt sich nicht verlinken und überlebt keinen Reload. Bei
zwei Systemen in Produktion ist das nichts; ab etwa zehn wird es eine echte
Frage, und dann ist sie mit dieser Notiz zu stellen statt neu.

### 4. Zwei Abweichungen vom Blatt, beide notiert statt befolgt

**Der aktive Chip trägt kein `×`.** Die `FILTER CHIP`-Zeile der
State-Language-Matrix zeichnet `GO ×` für ACTIVE. Ein zweiter Weg, denselben
Chip abzuwählen, steht neben dem Sentinel `ANY`, der genau das schon tut — zwei
Tabstopps auf ein Ziel, die Rechnung, die `WorkRow` in H6a unter OpsGrids Namen
dafür abgelehnt hat („a keyboard trap dressed as thoroughness").

**Ein Chip ohne Treffer wird nicht durchgestrichen.** Dieselbe Matrix zeichnet
DISABLED als durchgestrichenes `RUST`, annotiert „0 treffer". Das gilt für ein
**festes** Vokabular. `/work`s Stack-Chips leitet `stackTags` aus der Antwort
ab, also kann ein Stack-Chip für sich genommen nie leer sein — das hat H6a
entschieden, weil drei der fünf gezeichneten Chips sonst tote Bedienelemente
gewesen wären. Leer ist hier eine Eigenschaft einer **Kombination**, und die
trägt das Panel unter der Liste, mit beiden aktiven Filtern und einem Grund.

**Und die Chips sind `<button>`.** Das Blatt zeichnet `<span onClick>` ohne
`role`, ohne `tabindex`, ohne Tastaturweg; es hat überhaupt keine
Tastaturnotiz. State Language widerspricht ohne Ausnahme — „gleiche form für
alle elemente, keine ausnahmen". ADR 0055 entscheidet solche Fälle, und ein
Canvas-Artefakt ist auf dieser Seite schon zweimal überstimmt worden.

### 5. Die Chip-Reihen brechen um, sie scrollen nicht

Das 390er-Artboard legt beide Reihen in `overflow-x:auto; width:max-content;
scrollbar-width:none` und lässt die Labels weg.

Es zeichnet sechs Stack-Chips, die es selbst getippt hat. Diese Reihe zeichnet,
was die Antwort hergibt — **fünfzehn Namen aus drei Systemen** in der
Galerie-Fixture. Der verborgene Teil wächst also mit den Daten, statt feste
sechs zu sein. Und eine unterdrückte Bildlaufleiste bei genau der Breite, bei
der ein Leser nicht sehen kann, dass da mehr ist, ist die Form, die **#294** an
der Request-Path-Zeile bereits offen führt.

Das Blatt bricht seine eigene Stack-Reihe bei 1440 um. Hier brechen beide bei
jeder Breite um, und die Labels bleiben bei beiden — ein Satz Wörter, nicht ein
zweiter kürzerer (**#293**). Im Orakel als `chips-wrap` festgehalten.

**Kein fünfter Schalter.** Der Block kippt bei **900** von „Label neben den
Chips" auf „Label darüber" — derselbe Schalter, an dem `.work-row` zur Karte
wird. `layout.css`: „Kein Bauteil bekommt seinen eigenen Wert."

## Folgen

**H9 erbt das Muster, nicht die Datei.** Der Blog-Index bekommt Filter *und*
Suche über Beiträge, die aus dem Repository gelesen werden statt aus einer
Antwort. Die Naht ist dieselbe: die Karten auf dem Server rendern, die Knoten
hereinreichen, im Client nur auswählen. Was H9 neu entscheiden muss, ist die
URL-Frage aus §3 — bei einem Blog ist ein teilbarer Filter deutlich mehr wert
als bei zwei Systemen.

**`bundle-size.sh` kann diese Phase nicht messen.** Das Werkzeug liest
`en.html` und das Client-Manifest von `app/[lang]/page` — es kennt genau eine
Route, und die Insel steht auf einer anderen. Die 1 635 B oben sind von Hand
gemessen, mit derselben Methode: jedes `<script src>` des vorgerenderten
Dokuments, ohne das `noModule`-Polyfill, je Datei gezippt. Als Aufgabe notiert;
das Werkzeug bleibt in einer Inhaltsphase unangetastet.

Dazu kommt, dass `make bundle-size` auf `main` derzeit ohnehin abbricht: der
Chunk aus H3 hält Rahmenwerk und eigenen Code zugleich, und das Skript
verweigert die Zuordnung, statt zu raten (**#301**). Die Gesamtzahl bleibt
messbar, die Aufteilung nicht.

## Belege

| | vorher (`a8e1a9c`) | nachher |
|---|---|---|
| `/` gesamt, gzip | 143 580 B, 7 Dateien | **143 580 B, 7 Dateien** |
| `/work` gesamt, gzip | 143 580 B, 7 Dateien | 145 215 B, 8 Dateien |
| die Insel | — | **1 635 B** |

`npm test` 550 (von 533) · `make e2e` 1 244 grün, 3 übersprungen (von 1 134) ·
Orakel 36 Messungen für `/work` (von 25), alle elf neuen in der Galerie.
