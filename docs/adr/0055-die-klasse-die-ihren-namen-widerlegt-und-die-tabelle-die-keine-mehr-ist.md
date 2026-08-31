# ADR 0055 — Die Klasse, die ihren Namen widerlegt, und die Tabelle, die auf dem Telefon keine mehr ist

**Status:** Angenommen
**Datum:** 2026-08-31
**Betrifft:** H2a — `.02 ARCHITECTURE` und `.03 BUILD` der Fallstudie; setzt die Blattregel aus [ADR 0052](0052-fuenf-kacheln-eine-abdeckung-und-drei-zahlen-die-in-zwei-fassungen-standen.md) fort
**Invarianten:** 1 (keine erfundenen Zahlen), 8 (keine Farbe außerhalb `tokens.css`)

## Kontext

H2 baut die vier Abschnitte unter `.01 PROBLEM`. Der Bauplan teilt an dieser
Stelle selbst — drei Blätter, rund fünfunddreißig Dateien, ein „fertig wenn",
das nicht in einen Satz passt —, also ist H2a `.02` und `.03` und H2b `.04` und
`.05`. Der Schnitt liegt dort und nicht anderswo, weil die Seite nach jedem
Merge ausgeliefert wird: `01 02 03` ist eine vollständige Seite, `01 02 03 05`
ist eine mit einem Loch.

Fünf Fragen ließen sich erst beantworten, als die Abschnitte gebaut waren.

## Entscheidung

### 1. `.cs-arch` ist die Build-Zeile, nicht die Architektur-Zeile

`layout.css:39` trägt seit G1 `minmax(0,1fr) 420px`, `gap: 60px`,
`align-items: start` unter dem Namen `.cs-arch` und hatte nie einen Aufrufer.
Der Name sagt Architektur; die Maße sagen etwas anderes. Im
`Case Study Template` steht `grid-template-columns:1fr 420px;gap:60px;
align-items:start` **genau einmal** — in `04.03 BUILD`, um den Compose-Block und
die Phasenliste. Der Architektur-Abschnitt darüber hat gar keine zweispaltige
Zeile: die Fünf-Stationen-Platte läuft über die volle Inhaltsspalte.

Also gehört `.cs-arch` zu `.03`. Das ist dieselbe Auflösung wie in H1a, wo
`layout.css` die fünf Kacheln gegen ein Blatt entschieden hat, und dieselbe
Regel: **widersprechen sich Blatt und ausgeliefertes Stylesheet, hat das
Stylesheet recht — es ist die Absicht, die schon ausgeführt wurde.**

### 2. Die Form kommt vom Blatt, die Fakten aus `docs/architecture/`

Die drei H2-Blätter zeichnen `React Router 7`, `PostgreSQL 16`, einen
Go-Container, der das Access-Log nach SQLite aggregiert, und vier Container.
Alle vier sind älter als ADR 0005 und ADR 0007. Zwei davon sind **keine
Annotationen, sondern englische UI-Texte** — „No metrics stack for one host and
three services." und die Entscheidungszeile „Rejected: Prometheus and Grafana".
Wörtlich übernommen wären das zwei veröffentlichte Falschaussagen auf einer
Seite, deren ganzes Argument ist, dass sie so etwas nicht tut.

Quelle sind stattdessen `c4-container.md` und `c4-context.md`. Sie sind
handgeschrieben, aktuell, und ihre Belege-Zeile sagt selbst „Form angelehnt an
`docs/design/Case Study Map`" — Seite und Architekturdokument teilen also die
Form und dürfen sich in den Fakten nicht widersprechen.

### 3. Die Hop-Latenzen werden weggelassen, nicht als `— NO DATA` gezeichnet

Das Blatt setzt `[—ms]` unter jeden Pfeil. Niemand misst Latenz pro Hop, und
keine Phase plant es. `— NO DATA` ist die ehrliche Abwesenheit einer Zahl, die
es geben wird; hier wäre es ein Versprechen. H1 hat dasselbe Urteil schon
gefällt: die Uptime-Kachel ohne bekanntes Fenster trägt **gar keine** zweite
Zeile statt eines zweiten Gedankenstrichs.

Aus demselben Grund fehlen die zwei Bildplatzhalter des Blattes. Ein erfundener
Screenshot ist die Bildfassung einer erfundenen Zahl; Bilder sind K2.

### 4. Die Entscheidungstabelle bleibt eine Tabelle — bis 720

Über 720 ist sie ein `<table>` mit `<th scope>`. Darunter wird sie zu Karten,
und das ist die Bildunterschrift des Mobil-Artboards selbst: „Diagramm scrollt,
**Tabelle wird zu Karten**".

Der Preis dieses Umbaus ist, dass `display: block` die Tabellensemantik nimmt.
Sie wird nicht per ARIA nachgereicht, sondern ersetzt: jede Zelle trägt ihr
Spaltenwort als echten Text, über 720 mit `display: none` verborgen — wo `<th
scope="col">` es schon sagt —, darunter sichtbar, wo die Kopfzeile weg ist.
**Genau eine Quelle für die Spaltenwörter steht zu jeder Breite im
Accessibility-Baum**, und die Seite hört für einen Screenreader bei derselben
Breite auf, eine Tabelle zu sein, bei der sie es auch auf dem Bildschirm tut.

`layout.css:78` — `.decision-table { grid-template-columns: 1fr }` — bleibt
damit **weiterhin ohne Konsumenten**, und das wird notiert statt umgangen: die
Regel setzt ein Raster aus `<div>`s voraus, und ein solches Raster bricht nur
um, wenn seine Zeilen `display: contents` tragen — was Browser samt der Rollen
aus dem Accessibility-Baum entfernen. Vier Zeilen, deren dritte Spalte das
Verworfene ist, sind genau der Inhalt, bei dem der Verlust der Spaltenzuordnung
das Argument ist.

### 5. Ein Abschnitt bekommt einen Namen, keine Überschrift

`SectionHead` bekommt ein optionales `titleId`, und die `<section>` trägt
`aria-labelledby` darauf — rückwirkend auch `.01`. Kein Pixel ändert sich, keine
Kaskadenregel kommt dazu. Ein echtes `<h2>` wäre in `globals.css` der
34-px-Display-Schnitt gegen `.sec-title` in Mono 12, also dieselbe Kollision,
die `:where(.cs-spec) h1` in H1 auflösen musste — eine zweite Ausnahme für eine
Entscheidung, die niemand getroffen hat. Ob diese Abschnitte eine sichtbare
Gliederung verdienen, ist eine Entwurfsfrage und gehört zu M2.

## Konsequenzen

Die Seite trägt fünf Stationen, fünf Nebenspuren, vier Entscheidungen, den
generierten Compose-Auszug und vier Bauphasen. Der Auszug ist der einzige Teil,
der nicht Prosa ist: `make gen` schneidet ihn aus `compose.yaml`, `make
check-contract` vergleicht seine Prüfsumme, und `case-study.arch.spec.ts` hält
zusätzlich die **gerenderte** Fassung Zeile für Zeile gegen die Datei — ein
Bauteil, das eine Zeile verschluckt, umsortiert oder anders einrückt, kommt
durch jede Prüfung im Makefile und fällt dort durch.

**Gemessen, nicht behauptet:** das Bundle bewegt sich um **null Byte** —
134 403 B Rahmen, 9 178 B eigener Code, 143 581 B gesamt, und dieselben drei
Zahlen für `a063785` in einem zweiten Worktree auf derselben Next-Fassung. Kein
Client-Bauteil, kein neuer Upstream-Aufruf, kein zusätzlicher Suspense-Rand:
`.02` und `.03` lesen nichts Gemessenes und werden ganz vorgerendert.

Das Blatt-Orakel wächst von 26 auf **39 Messungen, 9 davon abweichend**; drei
der Abweichungen sind neu und tragen zwei neue, ausgeschriebene Gründe.

### Was das kostet

**Zwei Abweichungen vom Mobil-Artboard, beide bewusst.** Das Blatt schiebt den
Anfrageweg bei 390 seitlich in einen Swipe-Container („REQUEST PATH — SWIPE →",
898 px Inhalt hinter 346 px Bildschirm) und hält die Nebenspuren zweispaltig.
Hier steht der Pfad ab 1080 untereinander — dem Schalter, den `layout.css` für
jede zweispaltige Zeile vorgibt, mit der ausgeschriebenen Regel „Kein Bauteil
bekommt seinen eigenen Wert" — und die Spuren werden unter 560 einspaltig.

Der zweite Grund ist der teurere: **das Blatt führt zwei Textfassungen**, lange
Sätze bei 1440 und Abkürzungen bei 390, und lässt auf dem Telefon eine ganze
Spur weg. `content/case-studies` führt **eine**. Eine zweite Fassung existiert
nur, um vergessen zu werden, wenn die erste korrigiert wird — und die
Korrekturen sind bei diesen Blättern der Normalfall, nicht die Ausnahme. Der
Preis dafür ist, dass die langen Sätze auf dem Telefon eine Spalte je Spur
brauchen.

**Der Compose-Block bricht um, statt zu scrollen.** Die `image`-Zeile trägt die
`${IMAGE_TAG:?…}`-Fehlermeldung, die wirklich in der Datei steht — rund
hundertzehn Zeichen —, und in einer 680-px-Spalte verbarg ein waagerechter
Rollbalken das Ende der wichtigsten Zeile des Blocks. `pre-wrap` zeigt alles und
bricht dafür die Einrückung der Fortsetzungszeile. Am gebauten Bild entschieden,
nicht am Quelltext.

**Eine Erweiterung des Orakel-Generators je Phase.** Dreizehn neue Einträge sind
dreizehn Transkriptionen, die jemand geschrieben hat; der Generator prüft, dass
das Blatt sie wirklich enthält, aber nicht, dass sie die richtigen sind.

## Verworfene Alternativen

**Ein Raster aus `<div>`s mit ARIA-Rollen für die Entscheidungstabelle.** Hätte
`layout.css:78` einen Konsumenten gegeben. Braucht `display: contents` auf den
Zeilen, und Browser entfernen damit die Rollen — ein Test wäre grün und ein
Screenreader stumm.

**Die Tabelle auf dem Telefon seitlich scrollen lassen.** Gebaut und angesehen:
Zeilen sind so hoch wie ihre höchste Zelle, also standen auf 390 zwei magere
Spalten mit 180 px Nichts dazwischen und das Argument außerhalb des Bildes. Es
las sich als kaputt, nicht als scrollbar.

**Ein `--glow-soft`-Token für die zwei eigenen Stationen.** Das Blatt zeichnet
`0 0 22px rgba(0,229,255,.05)`. Fünf Prozent über 22 px Unschärfe sind auf
keiner der sieben Paletten sichtbar, und der Signal-Rand daneben trägt dieselbe
Unterscheidung schon. `--glow-alert` hat seinen Platz in H1 bei fünfzig Prozent
auf einer 6-px-Scheibe verdient; das hier nicht.

**Eine `.vh`-Utility für verborgene Beschriftungen.** Wäre die dritte Fassung
derselben Idee gewesen. Mit `display: none` verschwindet die Beschriftung auch
aus dem Accessibility-Baum, und genau das ist über 720 richtig, weil `<th
scope="col">` sie dort schon liefert.

**Die Spaltenköpfe als Blattzitat „REJECTED — AND WHAT IT COSTS".** Das ist
`Case Study 02`; H1 hat in ADR 0052 die Vorlage zur maßgeblichen Fassung
gemacht, und diese Phase eröffnet die Frage nicht neu.

## Belege

Bauplan Teil II (H2), Phasenzuschnitt („Aufteilen, wenn …") ·
`docs/design/Case Study Template` (Artboards 1a, 1c — `04.02`, `04.03`) ·
`docs/design/Case Study Map` (MAP.02, MAP.03) · `docs/design/Operations` ·
`docs/architecture/c4-container.md` · `docs/architecture/c4-context.md` ·
ADR 0005, ADR 0007, ADR 0026, ADR 0044, ADR 0052, ADR 0053 ·
Issues #75, #205 · `web/e2e/oracle/case-study.gen.json`
