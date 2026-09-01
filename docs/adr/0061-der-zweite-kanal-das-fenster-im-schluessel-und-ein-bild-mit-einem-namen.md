# ADR 0061 — Der zweite Kanal, das Fenster im Schlüssel, und ein Bild mit einem Namen

**Status:** Angenommen
**Datum:** 2026-09-01
**Betrifft:** H5b, H5c, H6, H8, H9, und jeden späteren Leser eines Endpunkts mit Query
**Invarianten:** 1 (keine erfundenen Zahlen), 7 (die Zahl muss nachzählbar bleiben), 8 (keine Farbe, kein Radius außerhalb `tokens.css`)

## Kontext

H5b füllt `SYS.03 UPLINK`: einen Contribution-Graphen aus `GET /api/contributions`
und einen 30-Tage-Betriebsstreifen aus `GET /api/systems/{slug}?window=30`. Vier
Zwänge standen dabei im Raum, und drei davon hat erst das Messen sichtbar gemacht.

**Erstens: `web/` konnte keinen Query-String bilden.** `resolvePath` in
`lib/http/url.ts` weist jeden Schlüssel ab, den das Pfad-Template nicht kennt, und
`url.test.ts` hält genau diesen Wurf fest — mit `{ slug: "a", window: "91" }` als
Beispiel. Die Fallstudie bekam ihre 91 Tage bis heute nur, weil 91 der Default des
Contracts ist.

**Zweitens: `systemCached(slug)` war auf den Slug allein geschlüsselt.** Ein
Argument ist Teil der Identität einer `use cache`-Funktion. Zwei Seiten, die
dasselbe System mit zwei Fenstern lesen, hätten sich ihre Antworten gegenseitig
serviert — und `readers.ts` hat aus einem genannten Grund keinen Unit-Test.

**Drittens: das Blatt zeichnet einen Graphen, der nicht in die Spalte passt.**
53 Spalten à 15 px mit 3 px Abstand sind 951 px; die Inhaltsspalte ist
`min(1160px, 100% - 80px)`. Ab einem Fenster von 1031 px läuft er über, bei der
Prüfbreite **1024 um sieben Pixel** — drei Schalter, bevor auf dieser Seite
irgendetwas sich bewegen darf. Das Mobil-Artboard beantwortet das anders: 26
Wochen à 11 px, beschriftet „LAST 26 WKS SHOWN".

**Viertens: `OpsGrid` gibt jeder seiner 91 Zellen einen eigenen Namen.** Der
Kalender hat 367.

## Entscheidung

**Der Query bekommt seinen eigenen Kanal, das Fenster wandert in den
Cache-Schlüssel und nicht in den Tag, der Graph zählt seine Spalten und
schrumpft, und er ist ein Bild mit einem Namen statt 367 mit je einem.**

## Konsequenzen

### `buildQuery` steht neben `resolvePath`, nicht darin

`lib/http/url.ts` bekommt eine zweite Funktion mit einer eigenen Allow-Liste für
Namen *und* Werte; `lib/api/client.ts` bekommt `GetOptions.search` neben `params`.
`resolvePath` bleibt Zeile für Zeile, wie es war. Die Datei nennt sich in ihrem
Kopf „the SSRF guard", und ein Query-Parameter ist kein Grund, den Schutz eines
Pfadsegments auszugeben.

Die beiden Listen sind bewusst verschieden. Der Pfad lässt keinen Punkt durch,
weil `.` und `..` als Segment etwas anderes bedeuten als sich selbst; der Query
lässt ihn durch, weil er dort nichts bedeutet und die erste numerische
Parameterfrage ein Komma haben wird. Der Query lässt `&`, `=`, `#`, `?`, `%`, `+`
und das Leerzeichen nicht durch — jedes Zeichen, das dieses Paar beenden und ein
anderes anfangen könnte.

**Und die Log-Zeile bekommt ein Feld dazu.** `path` bleibt das Template, aus dem
Kardinalitätsgrund, den `client.ts` seit G4 führt; daneben steht jetzt `query`.
Ohne das schreiben die Anfrage nach 30 Tagen und die nach 91 dieselbe Zeile, und
die Antworten haben verschiedene Form. Das Feld ist durch `buildQuery`s
Allow-Liste und durch das `window`-Enum des Contracts begrenzt, der Slug wäre es
nicht — deshalb dieses Feld und nicht jenes.

### Das Fenster ist ein Argument ohne Default

`systemCached(slug, window)`, und die fünf Aufrufstellen der Fallstudie schreiben
`OPS_WINDOW_CASE` hin, die neue der Startseite `OPS_WINDOW_HOME`. Ein Default
hätte die 91 dorthin zurückgestellt, wo sie herkam: wahr, unsichtbar und an der
Aufrufstelle nicht falsifizierbar.

Der **Tag** bleibt `systems:<slug>`. Ein Deploy, der ein System ändert, ändert
beide Fenster davon; ein Tag pro Fenster machte die Invalidierung feiner als die
Wahrheit, für die sie steht.

### Der Graph zählt seine Spalten, und die Zelle schrumpft

`--cols` kommt aus der Antwort ins Markup, die Spuren sind `1fr`, und die Breite
ist gedeckelt auf genau das, was die Zahlen des Blattes brauchen:
`min(cols × 15px + (cols − 1) × 3px, 100%)`. Oberhalb von 1031 px ist die Zelle
also **exakt die gezeichneten 15 px**, darunter stufenlos kleiner — ein DOM, eine
Bildunterschrift, dieselben 53 Spalten an jeder Breite, und **kein neuer Schalter
in `layout.css`**. Der Abstand schrumpft mit, im Verhältnis 5 : 1 des Blattes:
52 Abstände à 3 px sind 156 px, was auf einem 346 px breiten Telefon fast die
halbe Spalte wäre.

Gemessen am gebauten Produktionsbuild gegen eine laufende API:

```
1440   951px   Zelle 15,0      1024   944px   Zelle 14,9
1081   951px   Zelle 15,0       899   819px   Zelle 12,9
1079   951px   Zelle 15,0       719   639px   Zelle 10,1
                                 390   346px   Zelle  5,5
Überlauf an allen sieben Breiten: 0.
```

**Die Mobil-Fassung des Blattes ist damit abgelehnt**, und zwar mit Begründung:
26 von 53 Wochen zu zeigen trennt die Zahl in der Bildunterschrift von dem Bild,
das sie zählt, und löst den Überlauf bei 1024 nicht, weil der nichts mit 390 zu
tun hat.

### Der Streifen bricht um, statt zu scrollen oder zu schrumpfen

`repeat(auto-fill, 15px)` liefert an jeder Breite genau das, was beide Blätter
zeichnen: eine Reihe im vollen Feld, zwei auf dem Telefon. Kein `overflow-x` —
#294 ist die stehende Beschwerde über die Alternative — und keine Media Query.

### Ein Bild mit einem Namen

Der Kalender ist ein `role="img"` mit einem `aria-label` („652 contributions over
367 days, 2025-08-31 to 2026-09-01"), die Zellen sind `aria-hidden`. Bei 91 Zellen
ist eine Liste eine Liste; bei 367 ist sie eine Wand, und was ein Hörer aus dem
Graphen mitnehmen soll, ist die Summe über die Spanne. Der **Streifen** behält
dagegen einen Namen pro Zelle — 30 sind hörbar, und dort ist der einzelne Tag die
Aussage.

### Das Alter steht immer da, und es hat keine Schwelle

`cacheAgeSec` steht bei jeder Antwort in der Bildunterschrift. Der Endpunkt liefert
von Bauart her aus einem Cache — der Contract sagt `s-maxage=3600`, und
`api/internal/contributions/policy.go` hält dieselbe Stunde für veraltet — also
wäre eine Summe ohne ihr Alter eine Zahl, deren Beleg ein Moment ist, den niemand
nennt. **Eine Schwelle wäre zusätzlich falsch:** der Refresher tickt alle fünf
Minuten gegen eine Stunde, ein gesunder Kalender kreuzt jede stundenförmige Linie
also regelmäßig, und eine Zahl, die das vermeidet, wäre hier erfunden.

Der kalte `502` bleibt davon getrennt: er ist der einzige Fall, in dem GitHub
**nie** geantwortet hat, und nur er zeichnet `— NO DATA`.

### Was das kostet

- **Zwei Cache-Einträge statt einem** für das eigene System. Bei zwei Fenstern
  sind das zwei; die Form bleibt richtig, wenn ein drittes dazukommt.
- **Der wahrscheinlichste Fehler dieser Phase hat keinen Test.** `readers.ts` ist
  aus dem in seinem Kopf genannten Grund nicht unit-getestet, und das e2e-Rig hat
  keine API — dass 30 und 91 verschiedene Einträge sind, ist von Hand gemessen
  worden, in einer Sitzung über beide Seiten und in beiden Reihenfolgen. Das ist
  aufgeschrieben und nicht wegargumentiert.
- **Die Zelle ist bei 390 fünfeinhalb Pixel groß.** Das ist Dichte und keine
  Liste; wer einen einzelnen Tag ablesen will, kann es dort nicht. Der Name der
  Figur trägt die Aussage, die das Bild dann nicht mehr trägt.
- **Vier Blattabweichungen mehr** im Orakel (`graph-fits-the-column`,
  `source-is-this-api`, `counted-window`, `square-corners`), und eine davon —
  `SOURCE /api/health` am Streifen — ist eine echte Blattkorrektur mit eigenem
  Issue.

## Verworfene Alternativen

**Den Query in `resolvePath` durchlassen.** `resolvePath("/api/systems/{slug}?window=30", { slug })`
funktioniert heute schon: die Template-Regex ersetzt nur `{…}`, `assertPath` lässt
das `?` durch, und ein Test hält fest, dass `upstreamUrl` einen Query erhält. Der
typisierte Client schlägt aber `GetBody<"/api/systems/{slug}">` über dem
**Literal** nach — ein Pfad mit angehängtem Query ist ein anderer Literal, der im
generierten `paths` nicht vorkommt, und die Antwort verlöre ihren Typ. `any` ist
verboten.

**`params` für beides öffnen.** Dieselbe Funktion für Pfadsegmente und
Query-Werte hieße eine Allow-Liste für zwei Fragen, und die weitere der beiden
gewinnt. Der Punkt, den der Query braucht, ist genau das Zeichen, das der Pfad
nicht haben darf.

**Ein Default-Fenster in `systemCached`.** Siehe oben: es wäre die alte Lage mit
einer Signatur davor.

**Ein Cache-Tag pro Fenster.** Feiner als die Wahrheit, für die er steht.

**Seitliches Scrollen unter 1080.** Die verwaiste Zeile `.deploy-strip {
overflow-x: auto }` in `layout.css` lädt dazu ein, und #294 hält an einer anderen
Fläche fest, was daran falsch ist: „wischt seitlich und versteckt vier Fünftel von
sich" auf dem einen Gerät, auf dem der Leser nicht sieht, dass es mehr gibt.

**26 Wochen auf dem Telefon, wie das Blatt.** Braucht versteckte DOM-Knoten und
eine zweite Textfassung — die Kopie, die nur existiert, um vergessen zu werden
(#293) — und lässt 1024 überlaufen.

**367 benannte Zellen.** Kein Hörer hält das; und was er halten soll, steht in der
Bildunterschrift.

**Den Kalender ganz `aria-hidden`.** Dann verschwände er für Hörer vollständig,
und die Aussage mit ihm.
