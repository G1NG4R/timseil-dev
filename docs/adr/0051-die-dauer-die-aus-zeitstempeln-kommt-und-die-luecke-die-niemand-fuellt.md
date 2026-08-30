# ADR 0051 — Die Dauer, die aus Zeitstempeln kommt, und die Lücke, die niemand füllt

**Status:** Angenommen
**Datum:** 2026-08-30
**Betrifft:** C4, F4, H1, H2, M1 — revidiert [ADR 0019](0019-ops-rollup-in-sql-schwelle-und-die-aggregationsschleife.md) §4
**Invarianten:** 1 (keine erfundenen Zahlen), 6 (ein Tag ohne Messung ist `nodata`)

## Kontext

ADR 0019 §4 hat seine eigene Schwäche benannt und den Satz stehen lassen:

> **Das ist die schwächste Aussage, die diese Phase ausliefert**, und sie gehört
> benannt: die Zahl auf der Seite ist nur so ehrlich wie das Intervall in
> `internal/ops`, und dessen Gegenstück ist ein Cron-Ausdruck in einem Workflow,
> den es erst in F4 gibt.

F4 kam, und die Zahl war nicht ehrlich. **Am 24.08.2026 gezählt: 41 Läufe in
23,66 Stunden, wo der Cron `3-58/5` 284 verspricht** — vierzehn Prozent der
erklärten Kadenz, ein reales Intervall von etwa 35 Minuten statt fünf. Am
27.08.2026 unabhängig wiederholt und im Runbook festgehalten: 1,23 statt 12 Läufe
je Stunde, Abstände median 36 und maximal 660 Minuten.

`down_sec` war `fehlgeschlagene Checks × ProbeInterval`, und `ProbeInterval` ist
300. Ein Ausfall von 35 Minuten, den eine einzige Sonde erwischt, stand als
**fünf**. Jede Ausfalldauer auf dem öffentlichen Raster war um etwa denselben
Faktor zu klein.

**Zwei Dinge daran machen es zu mehr als einem Rechenfehler.** Der Fehler
schmeichelt — er verkürzt unsere eigenen Ausfälle, nie die von jemand anderem.
Und nichts wurde rot: das Raster hatte die richtige Zellenzahl in der richtigen
Farbe, `tools/check-probe-cadence.sh` war grün, weil es die zwei **erklärten**
Hälften vergleicht und die gefahrene bauartbedingt nicht sehen kann.

`ProbeInterval` anzuheben wäre die falsche Reparatur. Das reale Intervall
schwankt, weil GitHub geplante Läufe verzögert und unter Last verwirft, und
beides gehört nicht uns. 2078 wäre morgen so falsch wie 300 es heute ist.

## Entscheidung

**Eine fehlgeschlagene Prüfung trägt die Spanne bis zur nächsten Prüfung
desselben Tages. `down_sec` ist die Summe dieser Spannen. Es wird nichts mit
irgendetwas multipliziert.**

Ein Check bei `T` sagt genau eines: um `T` war die Seite unten. Über `T` plus
eine Sekunde sagt er nichts. Was die Zeitstempel **doch** hergeben, ist das Paar
— der Check danach. Damit ist jede genannte Dauer gegen die zwei Instanten
nachrechenbar, die sie erzeugt haben, und das ist das Abnahmekriterium aus #180
wörtlich.

Der Parameter `probe_interval_sec` verschwindet aus `RollUpOpsDays`. Aus
`internal/ops` erreicht keine Konstante mehr eine öffentliche Dauer.

## Konsequenzen

### Der Nachfolger muss am selben Tag liegen, sonst fällt die Spanne weg

Das ist die Regel, die verhindert, dass eine Untertreibung gegen eine viel
lautere Übertreibung getauscht wird, und der Fall, der sie erzwungen hat, ist
klein: **eine fehlgeschlagene Prüfung um 00:00 an einem Tag, an dem sonst nichts
gemessen wurde.** Ihr nächster Check ist die folgende Mitternacht. Die Spanne auf
die Tagesgrenze zu klemmen hieße, **86 400 Sekunden Ausfall in eine Zelle zu
schreiben, deren eigenes `checks_total` auf 1 steht** — ein voller Tag Ausfall,
hergeleitet aus einem einzigen Blick.

Die Spanne fallen zu lassen sagt stattdessen das Wahre: wir haben einmal
hingesehen, es war unten, und wie lange, können wir nicht sagen. Die Zelle steht
auf `degraded` ohne Dauer, und der Beleg dafür steht daneben — `checks_total` ist
1. **#208 ist genau die Frage, diese Abdeckung auch auf die Seite zu bringen**,
und die beiden arbeiten zusammen.

Der zweite Grund ist das Schema, und er ist der härtere. Ein Tag mitten in der
Lücke hat gar keine Checks; `ops_days_nodata_iff_unmeasured_ck` macht ihn zu
`nodata`, `ops_days_nodata_has_no_downtime_ck` verbietet dort jede Ausfallzeit.
Es gibt also keine Zelle, in die die andere Hälfte einer über Mitternacht
laufenden Spanne fallen könnte. Invariante 6 entscheidet das, nicht Geschmack.

### Die Richtung des Restfehlers ist genannt: sie untertreibt

Drei Stellen, und alle drei in dieselbe Richtung:

- ein Ausfall über Mitternacht verliert seine letzte Spanne;
- ein noch offener Ausfall trägt gar nichts bei — dieselbe Weigerung, die
  `internal/uptime/expand.go` für ein abschließendes `down` schon ausspricht:
  bis `now()` hochzuzählen wäre eine Zahl, die keine Sonde erzeugt hat;
- ein wiedereingespielter Ausfall ist einen Schritt kurz (siehe unten).

**Das ist die Richtung, die dieses Repository vorzieht**, und sie ist trotzdem
nicht gratis. Sie steht hier, damit niemand sie später für Genauigkeit hält.

### Der Replay zahlt einen Schritt, und das ist eine echte Verschlechterung

`internal/uptime` dehnt einen Ausfall aus `uptime-log.txt` auf Instanten im
Abstand `ProbeInterval` aus. Vorher war das exakt **durch Konstruktion**: fünf
Instanten × 300 = die Dauer, die im Protokoll steht. Jetzt sind fünf Instanten
**vier** Spannen, weil die Erholung nicht als Zeile geschrieben wird — eine
wiedereingespielte Zeile darf nie behaupten, die Seite sei oben gewesen
([ADR 0038](0038-das-externe-ausfallprotokoll-datei-branch-und-wer-welche-zeile-schreiben-darf.md)).

Exakt würde es wieder, indem die Erholung als eigene Beobachtung geschrieben
wird. **Das ist eine Änderung an ADR 0038 und nicht an #180**, und sie wird hier
bewusst nicht gemacht: ein Fund wird nicht dadurch besser erledigt, dass man
einen zweiten Entwurf nebenbei aufmacht.

### `ProbeInterval` bleibt exportiert, aus einem anderen Grund

Die alte Begründung ist tot: es wird nichts mehr damit multipliziert. Die neue
ist kleiner und trägt trotzdem. Der Replay rekonstruiert in diesem Abstand, und
die Instanten werden zu `checks_total` und `checks_down` — den Zahlen, gegen die
`outageChecks` verglichen wird. Ein Replay im falschen Abstand ergibt die falsche
Anzahl Zellen hinter einer Farbe.

**`make check-probe-cadence` bleibt deshalb ein Gate** und bewacht ab jetzt etwas
Kleineres: die Farbe, nicht die Zahl darunter. Sein Kopfkommentar sagt das.

### `LEAST` ist unerreichbar geworden und bleibt stehen

Jede Spanne endet an einem Check innerhalb desselben Tages, also kann die Summe
einen Tag bauartbedingt nicht überschreiten — die weiteste Zelle, die diese
Anweisung je schreiben kann, ist 86 399 (Mitternacht bis 23:59:59, beide Enden
Beobachtungen). Die Klemme kostet einen Funktionsaufruf und steht gegen eine
Constraint, die die **ganze** Anweisung abbricht statt einer Zelle. Der Test dazu
heißt jetzt nach dem, was er beweist: dass die Grenze aus der Form folgt, nicht
aus der Klemme.

### Die Fixture beweist die Änderung nicht, und das musste gesagt werden

Die Incident-Fixture sondiert alle 30 Minuten und ihr Roll-up wurde mit 1800
parametrisiert. Alte und neue Arithmetik liefern für sie **dieselben** Zahlen —
3600 am Ausfalltag, 1800 am degradierten. Diese Übereinstimmung ist der Beleg
dafür, dass die neue Form die erklärten Werte von INC-001 trifft, und sie ist
zugleich der Grund, warum die Fixture-Tests allein eine Regression nicht fangen
könnten. `store/ops_down_sec_db_test.go` ist der Fall, der die beiden trennt:
gefahrene 35 Minuten gegen eine erklärte Fünf, 2100 gegen 300.

Der Property-Test ist mitgezogen. Er zog die Kadenz vorher als
**Query-Parameter** und schrieb die Zeilen immer im Minutenabstand — tausend
Fälle konnten eine gefahrene Kadenz von einer erklärten nicht unterscheiden.
Jetzt ist die gezogene Zahl der **Abstand der Zeilen selbst**.

### Die Historie ist falsch berechnet und richtet sich von allein

Der Roll-up liest jeden berührten Tag **vollständig** neu. Zeilen, die vor dieser
Änderung geschrieben wurden, tragen die alte Zahl, bis ihr Tag wieder in den
`lookback` fällt — was für alte Tage nicht mehr passiert. Ein einmaliger Rücklauf
über das Fenster ist der Weg, und er gehört in die Abnahme dieser Änderung, nicht
in eine Behauptung hier.

## Verworfene Alternativen

**`ProbeInterval` auf den gemessenen Wert anheben.** Der naheliegende Griff und
der falsche: das reale Intervall schwankt zwischen 6 und 660 Minuten, gehört
GitHubs Scheduler und nicht uns, und eine Konstante, die einen Mittelwert
festhält, ist wieder eine erfundene Zahl — nur eine besser recherchierte.

**Die Spanne auf die Tagesgrenze klemmen statt sie fallen zu lassen.** Sauberer
in der Summe über mehrere Tage und in einem Fall unhaltbar: eine Beobachtung um
00:00 würde 86 400 Sekunden behaupten. Der Preis der jetzigen Regel ist die
letzte Spanne eines Tages; der Preis dieser wäre eine Zahl, die niemand
verteidigen kann.

**Die untere Schranke nehmen: letzter minus erster fehlgeschlagener Check.**
Ebenfalls konstantenfrei und sauber begrenzt, aber sie bricht die Fixture — zwei
aufeinanderfolgende Fehlschläge im Abstand von 30 Minuten ergäben 1800 statt der
3600, die INC-001 unabhängig erklärt. Eine Arithmetik, die den einzigen
unabhängig belegten Wert im Repository verfehlt, ist die falsche.

**Eine Sentinel-Zeile aus dem Folgetag holen**, damit der letzte Check eines
Tages einen Nachfolger hat. Kostet einen zweiten Index-Zugriff je berührtem Tag
und kauft eine Spanne, die diese Datei gerade erst abgelehnt hat.

**Die Erholung als Beobachtung mitschreiben**, damit der Replay exakt bleibt.
Die richtige Idee am falschen Ort — sie ändert ADR 0038, und das ist ein eigener
Entwurf mit eigener Abnahme.

## Belege

- Issue [#180](https://github.com/G1NG4R/timseil-dev/issues/180) — die Zählung vom 24.08.2026
- `docs/runbooks/ops.md` — die unabhängige Zählung vom 27.08.2026
- `api/internal/store/queries/ops.sql` — die Anweisung und ihre Begründung
- `api/internal/store/ops_down_sec_db_test.go` — die Fälle, die alte und neue Arithmetik trennen
- `api/internal/store/ops_property_db_test.go` — tausend Muster, Kadenz gezogen
- [ADR 0019](0019-ops-rollup-in-sql-schwelle-und-die-aggregationsschleife.md) §4 — der Satz, den dieser Entwurf einlöst
- [ADR 0038](0038-das-externe-ausfallprotokoll-datei-branch-und-wer-welche-zeile-schreiben-darf.md) — warum die Erholung keine Zeile ist
