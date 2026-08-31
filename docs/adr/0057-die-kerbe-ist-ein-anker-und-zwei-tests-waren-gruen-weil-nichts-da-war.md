# ADR 0057 — Die Kerbe ist ein Anker, und zwei Tests waren grün, weil nichts da war

**Status:** Angenommen
**Datum:** 2026-08-31
**Betrifft:** H2b — `.04 OPERATIONS` und `.05 RESULT` der Fallstudie; schließt den
Schnitt aus [ADR 0055](0055-die-klasse-die-ihren-namen-widerlegt-und-die-tabelle-die-keine-mehr-ist.md)
**Invarianten:** 1 (keine erfundenen Zahlen), 4 (ohne Post-Mortem keine Kerbe),
5 (Belege zeigen nie ins Leere), 6 (ein Tag ohne Messung ist `nodata`),
7 (das Fenster ist 91 Tage), 8 (keine Farbe außerhalb `tokens.css`)

## Kontext

ADR 0055 hat H2 geteilt und den Schnitt begründet: die Seite geht nach jedem
Merge live, `01 02 03` ist eine vollständige Seite, `01 02 03 05` wäre eine mit
einem Loch. H2b baut den Rest — den Anfahrtsweg eines Commits, das 91-Tage-Raster
mit seinen Kerben, den Vorfall-Log und den Schluss.

Sieben Fragen ließen sich erst beantworten, als die Abschnitte gebaut waren. Zwei
davon hat nicht das Bauen beantwortet, sondern ein Screenshot und ein
Testergebnis, das zu gut aussah.

## Entscheidung

### 1. Die Kerbe ist ein Anker, kein Client-Bauteil

Das Blatt `Operation Grid` zeichnet ein Panel, das sich beim Klick auf eine Zelle
neben dem Raster öffnet, mit `state = { sel, dep }`. Gebaut wird stattdessen ein
`<a href="#inc-001">` auf den Eintrag im Vorfall-Log darunter; `:target` markiert
den geöffneten. Vier Gründe, und keiner davon ist „einfacher":

1. **Es gibt keine Vorfälle.** Produktion antwortet `incidents: []`, seit die
   Seite existiert. Ein Panel wäre ein Bauteil, das an jeden Besucher
   ausgeliefert wird und das nichts öffnen kann.
2. **#244.** Ohne JavaScript bleibt der Suspense-Platzhalter stehen. Ein Panel,
   das JavaScript ebenfalls braucht, wäre die zweite Sache, die ohne es nicht
   funktioniert — auf der Seite, deren ganzes Argument Ehrlichkeit ist.
3. **Das Budget.** 143 581 B von 150 000 B; #237 sagt seit dem 29.08., dass die
   Luft dünn ist.
4. **Das Blatt wählt selbst per `:target` aus.** `.dv-opt:target .dv-oid` ist,
   wie seine eigenen Artboard-Links hervorheben. Der Mechanismus ist keine
   Notlösung gegen den Entwurf, er ist der des Entwurfs.

**Nur Kerben sind Links.** Die Vorlage sagt „Kerben sind hier anklickbar", nicht
jede Zelle, und 91 Tab-Stopps wären eine Tastaturfalle als Gründlichkeit
verkleidet. Heute hat das Raster null, was die ehrliche Zahl für ein Fenster ohne
Vorfälle ist.

**Jede Zelle trägt trotzdem ihren Namen** — `2026-06-12 · NO INCIDENT` als
`aria-label`, nicht in einer verborgenen Span. Dieses Repository hat keine
`.vh`-Utility, und ADR 0055 hat eine abgelehnt, **weil `<th scope>` den Namen
dort schon lieferte**. Hier liefert ihn nichts anderes, und ein Raster aus 91
namenlosen Listenelementen ist ein Bild, das ein Screenreader nicht lesen kann.
Die Ablehnung von damals bleibt gültig; sie war eine Ablehnung einer Klasse, kein
Verbot barrierefreier Namen.

**Gemessen, nicht behauptet:** das Bundle bewegt sich um **null Byte** —
134 403 B Rahmen, 9 178 B eigener Code, 143 581 B gesamt, dieselben drei Zahlen
wie bei H2a auf derselben Next-Fassung.

### 2. Das DATA-SAFETY-Panel wird gestrichen, nicht als `— NO DATA` gezeichnet

Die Vorlage zeichnet neben dem Monitoring-Panel ein zweites: Backup-Ziel,
Aufbewahrung, Datum der letzten Restore-Übung, wo die Geheimnisse liegen. Das
Blatt `Operations` führt **drei dieser vier** in seiner eigenen Liste dessen, was
nicht öffentlich werden darf — „Nicht öffentlich: Backup-Ziel und -Zeitplan. Wer
weiß, wann gedumpt wird, weiß, wann die Last steigt" —, und CLAUDE.mds Regel ist
weiter: der Ist-Stand einer Sicherheitsfrage dieses Hosts geht nicht auf eine
öffentliche Seite.

Das Panel entfällt also, und es entfällt **ohne Gedankenstrich**. `— NO DATA`
sagt „eine Zahl kommt noch"; diese kommt nicht, sie wird zurückgehalten, und das
sind zwei verschiedene Sätze. Der Grund steht hier und nicht auf der Seite, denn
der Grund ist die Form der Antwort.

An seine Stelle tritt ein OBSERVABILITY-Panel mit vier Zeilen, die `.02` noch
nicht sagt — Traces, Logs, Metriken, Aufbewahrung —, **ohne Kadenz, ohne Port,
ohne Hostnamen**, dieselbe Regel, die `timseil-dev.ts` für `.02` schon
ausschreibt.

### 3. Keine Stufenzeiten, dafür ein Jobname, den ein Test hält

Das Blatt setzt `[—s]` unter sechs der sieben Pipeline-Stufen. Niemand misst eine
Stufe, keine Phase plant es: **dritte Anwendung von ADR 0055 §3** — `— NO DATA`
ist die ehrliche Abwesenheit einer Zahl, *die es geben wird*, hier wäre es ein
Versprechen.

Was an die Stelle tritt, ist etwas, das es gibt. Jede Stufe, die ein Job in
`.github/workflows/ci.yml` ist, nennt ihn, und `lib/content/pipeline.test.ts`
hält beide gegeneinander — inklusive der Reihenfolge: jede links von DEPLOY
gezeichnete Stufe muss in dessen `needs:` stehen. Der Name wird nicht angezeigt;
er ist der Griff des Tests, nicht der des Lesers. Ein umbenannter Job ist damit
ein roter Test statt einer Seite, die eine Pipeline beschreibt, die es nicht mehr
gibt.

Die Stufennamen des Blattes (`go test ./...`, `compose pull + up`) sind nicht,
was passiert, und wurden ersetzt.

### 4. Zwei Tests waren grün, weil sie nichts zu prüfen fanden

Der teuerste Fund der Phase, und er kommt nicht aus dem Bauen.

Die erste Fassung von `case-study.ops.spec.ts` stellte drei Fragen über Zellen —
wie eine gemessene aussieht, worauf eine Kerbe zeigt, ob jede einen Namen trägt —
auf einer Seite, unter der das Rig **keine API** hat. `opsGrid(null)` liefert kein
Feld, also lief bei zweien die Schleife null Mal, und beide waren grün.

**Die dritte fiel durch, und der Unterschied war eine Zeile.** Sie begann mit
`expect(shape.nodata).not.toBeNull()` — nicht aus Umsicht, sondern weil der Wert
als nullable zurückkam und der Typprüfer eine Wache wollte. Diese eine Zusicherung
machte aus einer leeren Seite einen roten Lauf, und sie ist der einzige Grund,
warum die anderen beiden überhaupt angesehen wurden.

Der Lauf: dreizehn Tests über zwei Breiten, acht Fehlschläge, achtzehn grün, vier
verschiedene Tests kaputt. Zwei der neun, die hielten, handelten von etwas, das
nicht auf der Seite war. Das ist die Form der meisten Funde dieses Repositories,
diesmal in den Tests selbst — und das Experiment dazu hat sich selbst gefahren:
dieselbe Datei, dieselbe leere Seite, innerhalb einer Stunde geschrieben, und
genau die eine mit der Anwesenheitsprüfung wurde rot.

Alle drei sind umgezogen — die zwei hohlen und die, die es gemeldet hat. Der Ort,
an dem diese Zustände existieren, ist die Galerie: G7 hat sie gebaut, um jedes
Bauteil in jedem Zustand **ohne API** zu zeichnen. `app/dev/components`
erzeugt jetzt ein Fenster mit allen vier Tagesarten und zwei Vorfällen, und
`gallery.ops.spec.ts` ist das erste Spec, das die Route benutzt — das Rig öffnet
sie mit `DEV_GALLERY=1` auf seinem eigenen Server.

**Zwei Vorfälle und nicht einer**, weil `selected` ein *Unterschied* ist und kein
Aussehen: die erste `:target`-Regel verschob drei Ränder von 10 % Stahl auf 35 %
Cyan und war neben einem nicht ausgewählten Eintrag unsichtbar. Ein Screenshot
hat das gefunden; der Test vergleicht jetzt die beiden Einträge statt die Regel
zu prüfen.

**Und die Kerbe wird geklickt, nicht gelesen.** Der Test erzeugt ein echtes
`:target` und fragt das Dokument, welcher Eintrag es trägt. Ein Umbau, der die
Auswahl in Komponenten-State verlegt, wird damit rot, statt über einen
Klassennamen hinweg grün zu bleiben.

### 5. #242 ist entschieden und halb umgesetzt: die Kachel heißt jetzt PIPELINE

Das Issue sagt „decide with H2". Die Entscheidung: **das Feld soll den Deploy
messen**, von „Dokploy hat den Deploy angenommen" bis „der neue Prozess kam hoch"
— genau die zwei Zeitstempel, die die Abnahme vom 31.08. schon von Hand
nebeneinandergelegt hat (`14:38:07.559` / `14:38:36.474`). Eine Zahl, die keine
fremde Merge-Warteschlange aufblähen kann.

**Umgesetzt wird das hier nicht.** Es fasst `report-deploy.sh`, `deploy.sh`, die
Toleranz in `check-deployed.sh:210` und die Contract-Beschreibung an — anderer
Radius, andere Reviewer-Frage. Was diese Phase schließen kann, ist die andere
Hälfte des Abnahmekriteriums („the case study tile says which"): die Kachel heißt
`PIPELINE · MEDIAN` statt `DEPLOY · MEDIAN`, weil das die Zahl ist, die dort
steht — der ganze Lauf, Wartezeit inklusive. Eine Zeile, heute wahr. ADR 0052
hatte den Preis dieser Kachel schon notiert; hier wird er bezahlt, statt ihn
weiterzuschieben.

`.05` sagt dasselbe im Präsens und ohne Reparatur zu behaupten — die erste
Fassung dieses Absatzes stand im Imperfekt („It **was** measuring") und hätte
eine Korrektur veröffentlicht, die es nicht gibt. Beim Lesen des eigenen Diffs
gefunden.

### 6. Der Trenner der Pipeline ist die Lücke, nicht der Rand

Am Bild gefunden. Mit `border-inline-end` je Kasten und keinem am letzten ist die
Zeile bei 1440 geteilt und bei 390 **eine einzige ungeteilte Spalte** — sieben
Stufen, die sich als ein Absatz lesen. Wo umgebrochen wird, weiß nur das Raster;
eine Media Query müsste die Spaltenzahl an einer dritten Stelle wiederholen.

Ein Pixel `gap` über der Linie des Containers zeichnet den Trenner in beide
Richtungen, bei jeder Spaltenzahl, ohne eine Regel, die nachgeführt werden muss.
Das Mobil-Artboard bestätigt die Absicht: dort trägt jede Stufe ein
`border-bottom` — dieselbe Trennung, andere Achse.

### 7. Das Raster rechnet seine Spalten, statt sie zu nennen

`91 days (13 weeks)` in der Kopfzeile sind `cells.length` und
`Math.ceil(cells / 7)` aus `lib/api/systems.ts`. Invariante 7 will, dass das
Fenster nachzählbar bleibt, und eine getippte Beschriftung wäre die erste Stelle,
an der es das nicht mehr ist. Ein Fenster ohne Tage ist **kein Fenster aus null
Tagen**: die Kopfzeile trägt dann den Platzhalter statt „0 days (0 weeks)".

## Konsequenzen

Die Seite trägt fünf Abschnitte, sieben Pipeline-Stufen, vier
Observability-Zeilen, 91 Tageszellen in 13 Spalten und zwei Ergebnislisten.
Der Anfahrtsweg und das Raster sind die einzigen Teile, die nicht Prosa sind:
den einen prüft `pipeline.test.ts` gegen `ci.yml`, das andere `opsGrid` gegen die
Antwort.

**Zwei Invarianten werden dort durchgesetzt, wo die Bytes ankommen, nicht nur im
Schema.** `incidentList` verwirft einen Vorfall ohne `cause`, `fix` oder
`postSlug` (Invariante 4 — die Spalten sind NOT NULL, aber dieser Code liest
Bytes und nicht das Schema), und `opsGrid` löst die `incidentId` eines Tages
gegen die Liste auf, statt sie zu kopieren: die Kerbe bleibt ein Ausfall und hört
auf, ein Link zu sein (Invariante 5). ADR 0035s überlappender Start ist der Fall,
in dem beides auseinandergeht.

**`DayState` ist der vierte und letzte Wortschatz des Contracts**, und
`derive.ts` schuldete ihn seit G6. Er wird geprüft und nicht übersetzt, und das
ist die Unterscheidung: die drei Funktionen daneben machen aus einem
Contract-Wert eines der sieben Wörter aus `words.ts`; ein Tag kann diesen Weg
nicht gehen, weil `ok` „hier ist nichts passiert" heißt und der Wortschatz dafür
kein Wort hat. LIVE ist, was ein System ist; ein Dienstag ist nicht live. Die
Legendenwörter bekamen deshalb eine eigene Tabelle — `dayLabel` — neben dem
Wortschatz, zu dem sie nicht gehören.

**Gemessen, nicht behauptet:** `make check` grün · `npm test` **347** (von 327) ·
e2e **479 grün, 0 rot** über zehn Projekte · Blatt-Orakel **50 Messungen, 13
abweichend** (von 39/9) · Bundle **143 581 B**, Byte für Byte wie H2a.

Am gebauten Bild an sieben Breiten nachgemessen: **kein waagerechter Überlauf**,
Abschnittsrhythmus **96/96/96/96** und keine Lücke null, 91 Zellen in 13 Spalten
zu 15 px an jeder Breite.

### Was das kostet

**Die Galerie ist jetzt Teil des Testlaufs.** `DEV_GALLERY=1` steht in
`playwright.config.ts`. Das ist keine Sicherheitsentscheidung —
`lib/gallery/visibility.ts` sagt selbst, dass die Fahne keine Grenze ist und
`compose.yaml` sie nie setzt —, aber es ist eine Route mehr, die ein Testlauf
offen hält, und das gehört benannt statt bemerkt.

**Eine Zusicherung aus H2a musste eingegrenzt werden.** `.04`s
Observability-Panel benutzt dieselbe Spuren-Zeile wie `.02` — vier Spalten,
dieselben drei Schalter, „Kein Bauteil bekommt seinen eigenen Wert" —, und der
Test „die fünf Nebenspuren brechen 4 zu 2 zu 1 um" zählte seitenweit und fand
neun. Er ist jetzt auf `sec-02` eingegrenzt, was er von Anfang an hätte sein
sollen; das Umbruchverhalten gilt weiter für beide.

**Der Post-Mortem-Eintrag ist ein Name, kein Link.** `postSlug` zeigt auf
`content/posts`, und H9 baut den Renderer. Ein `<a>` heute wäre ein 404 — genau
das, was Invariante 5 verbietet.

**Zwei Zahlen weichen um mehr als vier Pixel ab.** Der Abstand zwischen den
Ergebnisspalten ist 72 statt 80, die Stufen-Polsterung 16 statt 13; beide sind
`spacing-scale`. Die bisher größte Einzelabweichung des Orakels waren vier Pixel,
jetzt sind es acht.

**Rot steht zum zweiten Mal auf dieser Seite.** Die Vorlage notiert „Ein
Alert-Moment: die rote Zeile im Hero", das `Operation Grid`-Blatt verlangt „Rot
nur für einen echten Ausfall". Mit `incidents: []` gilt die erste Regel heute
durch Arithmetik statt durch Konstruktion — beim ersten Ausfall stehen zwei rote
Stellen auf der Seite, und das ist dann eine Entwurfsfrage und keine
Überraschung.

## Verworfene Alternativen

**Das Panel des Blattes mit Komponenten-State.** Der Preis steht oben: ein
Bauteil, das ausgeliefert wird und heute nichts öffnen kann, plus
Tastaturbedienung, Fokusverwaltung und `aria-live` dafür. Der Nutzen wäre eine
Auswahl, die `:target` schon liefert.

**Jede Zelle anklickbar, wie das `Operation Grid`-Blatt es zeichnet.** Das ist
die Startseiten-Fassung; die Vorlage sagt „Kerben". 91 Tab-Stopps.

**Eine eigene Kachelreihe in `.04`** mit UPTIME, INCIDENTS, MTTR, DEPLOYS und
ROLLBACK RATE, wie `Operation Grid` 1a sie zeichnet. Drei der fünf stehen seit
H1 oben auf derselben Seite, und die Vorlage zeichnet in `.04` keine. Dieselbe
Auflösung wie ADR 0055 §5: die Vorlage ist die maßgebliche Fassung, und diese
Phase eröffnet die Frage nicht neu. MTTR und Rollback-Rate gehören damit zu H5.

**Ein Deploy-Balken neben dem Raster.** `.deploy-strip` liegt seit G1 in
`layout.css` ohne Aufrufer, und das bleibt so: das Blatt zeichnet ihn unter
SYS.03 der Startseite, nicht in `.04` der Vorlage. Dritte Anwendung der
H1a-Regel, diesmal mit dem Ergebnis, dass die Regel *keinen* Konsumenten
zuweist — H5 bekommt ihn.

**Die Legende ohne den Gedankenstrich.** Das Blatt schreibt „NO DATA", die Seite
schreibt `— NO DATA`. Ein zweiter String für dieselbe Abwesenheit ist genau das,
was das eine Token verhindert; die Legende benennt Kategorien, und die Kategorie
heißt hier so, wie der Wert überall sonst heißt.

**Eine Kerben-Animation.** Das Blatt lässt sie mit `og-notch` 2,6 s pulsieren.
`words.ts` hat die Regel schon geschrieben — „DECORATION, NEVER A DISTINGUISHING
FEATURE", weil `prefers-reduced-motion` sie für einen Teil der Leser ganz
abschaltet —, sie hätte ein neues Dauer-Token in `tokens.css` gekostet, und sie
hätte heute nichts zu animieren.

**Die Karte am Fuß von `.05` an `/api/systems` hängen.** Nummer, Name und Zustand
des nächsten Systems stehen in `systems`. Sie zu lesen wäre ein fünfter
Suspense-Rand und ein zweiter Endpoint auf einer Seite mit einem Upstream-Aufruf
— für eine Karte. Sie verlinkt den Work-Index, und H6 gibt ihr ihre Quelle.

## Belege

Bauplan Teil II (H2) · `docs/design/Case Study Template` (Artboards 1a, 1c —
`04.04`, `04.05`, Zeilen 243, 279, 281, 283, 288, 296, 511) ·
`docs/design/Operation Grid` (Regeln, Datenvertrag) · `docs/design/Operations`
(„Was davon öffentlich darf") · `docs/slo.md` · `.github/workflows/ci.yml` ·
ADR 0035, ADR 0044, ADR 0048, ADR 0049, ADR 0052, ADR 0055 ·
Issues #208, #230, #237, #242, #244 · `web/e2e/oracle/case-study.gen.json`
