# ADR 0019 — Der Ops-Roll-up: eine Anweisung in SQL, die Ausfallschwelle und die Schleife, die sie antreibt

**Status:** Angenommen
**Datum:** 2026-08-18
**Betrifft:** C4, C7, F4, E5
**Invarianten:** 1 (keine erfundenen Zahlen), 4 (ohne Post-Mortem keine Kerbe),
6 (ein Tag ohne Messung ist `nodata`), 7 (das Fenster ist 91 Tage)

## Kontext

Der Build-Plan nennt C4 „Ops-Endpoints". ADR 0017 hat gezeigt, dass es die nicht
gibt: Raster, Incidents und Deploys hängen am Detail-Endpoint, und den hat C2
geliefert. Übrig bleibt die Hälfte, die der Build-Plan im selben Satz nennt und
die niemand gebaut hat — **die Aggregation `ops_checks` → `ops_days`** — samt
ihrem Abnahmekriterium: „Lückentest — fehlende Messungen erzeugen `nodata`,
niemals `ok`."

Bis hierhin schreibt niemand `ops_days`. Die einzige Aggregation im Repo steht in
`api/internal/fixtures/incident.sql` und sagt über sich selbst, sie sei „this
fixture's own convention … **not the rule C4 has to invent**". Der
Schema-Kommentar in `00004_operations.sql` sagt dasselbe von der anderen Seite:
„C4 aggregates the outage automatically, a human writes the post-mortem
afterwards." Beide Dateien verweisen also auf eine Entscheidung, die noch
niemand getroffen hat. Diese ADR trifft sie.

Sieben Fragen waren offen. Keine davon steht in einem der Dokumente.

## Entscheidung

### 1. Der Roll-up ist eine Anweisung in SQL, keine Schleife in Go

ADR 0017 §3 hat das Fenster in SQL gelegt, damit der **Lesepfad** keine `ok`
erfinden kann. Das hier ist die andere Hälfte derselben Entscheidung: der
**Schreibpfad** kann es auch nicht.

Der Grund ist strukturell und nicht stilistisch. Die zweite Stufe der Anweisung
(`rolled`) entsteht aus einem Join gegen `ops_checks`; eine Gruppe existiert nur
dort, wo mindestens eine Messung liegt. Das `CASE` darüber hat keinen
`nodata`-Zweig und braucht keinen — **für einen ungemessenen Tag entsteht gar
keine Zeile, in keinem Zustand.** Die Lücke im Raster erzeugt `OpsDaysForSystem`
über `generate_series` und `COALESCE`, und beide Seiten können Invariante 6 damit
nicht mehr verletzen, ohne dass jemand die Form ändert.

Zwei Folgerungen, die im Code stehen sollten und dort stehen:

- `ops_days_nodata_iff_unmeasured_ck` wird von C4 **nie berührt**. Es bleibt
  Wächter gegen eine spätere Änderung des `CASE`, und es ist bereits direkt
  geprüft (`migrations/invariants_db_test.go`). Die C4-Tests duplizieren das
  nicht.
- Der Roll-up bewegt einen Tag **in** einen gemessenen Zustand hinein, nie wieder
  heraus. Würden alle Checks eines gemessenen Tages verschwinden, bliebe die
  Zeile stehen. Das ist für die Aufbewahrung richtig — `ops_checks` wächst um
  ~105 000 Zeilen pro System und Jahr und wird irgendwann beschnitten, der
  Roll-up ist der dauerhafte Datensatz. Von Hand gelöschte Checks sind der einzige
  Weg, das falsch aussehen zu lassen, und dafür gibt es eine Zeile im Runbook.

### 2. Der Scan liegt auf `recorded_at`, die Aggregation auf `observed_at`

`ops_checks` trägt beide Zeitstempel, und `00004_operations.sql` erklärt, warum:
`observed_at` ist, wann die Sonde lief, `recorded_at`, wann diese Datenbank davon
erfuhr. Für eine laufende Sonde liegen sie Sekunden auseinander, für eine aus
`uptime-log.txt` nachgespielte Zeile Stunden — „and that gap IS the statement".

Der Roll-up benutzt genau diese Trennung:

- `touched` grenzt auf `recorded_at` ein und beantwortet damit „was hat die
  Datenbank neu erfahren".
- `rolled` gruppiert auf `observed_at` und beantwortet „zu welchem Tag gehört
  das".

**Damit ist der F4-Backfill kostenlos.** Eine Zeile mit monatealtem `observed_at`
hat `recorded_at = now()`, liegt also im Fenster, und der Roll-up bewegt den Tag,
zu dem sie gehört — nicht den, an dem sie ankam. Aus der Lücke wird eine Kerbe,
ohne dass irgendwo eine Sonderbehandlung dafür steht.

`rolled` liest den **ganzen** Tag neu, nicht nur die eben gefundenen Zeilen. Ein
Roll-up über einen Ausschnitt zählte `checks_total` zu niedrig und schriebe eine
falsche Zahl unter eine richtig aussehende Farbe.

### 3. Die zweite Stufe ist ein `LATERAL` — gemessen, nicht geraten

Als gewöhnlicher Join formuliert wählt der Planer einen **Merge Join** über
`system_id` allein und wirft anschließend 4,7 Millionen Zeilen per Join-Filter
weg: **1,63 s** für 182 Tage. Als `CROSS JOIN LATERAL` erzwingt die Abfrage einen
Indexzugriff pro berührtem Tag, und dieselbe Arbeit dauert **386 ms**; im Alltag,
wo ein oder zwei Tage im Fenster liegen, **27 ms**.

Das ist wörtlich dieselbe Lektion, die `ListSystems` in C2 gelernt hat (ADR 0016,
Runbook `migrations.md`: `DISTINCT ON` 8,73 ms → `LEFT JOIN LATERAL` 0,23 ms).
**Es war nie der Index, es war die Frage.** Die Messungen stehen in der Tabelle
im Migrations-Runbook.

Der Bereich auf `observed_at` ist dabei die halboffene Form, die
`00004_operations.sql` als „what the aggregation reads" vorschreibt; ein
berechnetes `(observed_at AT TIME ZONE 'UTC')::date = t.day` wäre nicht sargable
und würfe `ops_checks_unique_observation` weg.

### 4. `down_sec` sind fehlgeschlagene Checks mal Sondenintervall, gedeckelt

> **Revidiert am 30.08.2026 durch [ADR 0051](0051-die-dauer-die-aus-zeitstempeln-kommt-und-die-luecke-die-niemand-fuellt.md).**
> Der Absatz unten benennt seine eigene Schwäche und behält sie — F4 hat sie dann
> vorgeführt: die Sonde lief mit einem Siebtel ihrer erklärten Kadenz, und jede
> Ausfalldauer auf der Seite war um denselben Faktor zu klein. `down_sec` ist
> seither die Summe der Lücken zwischen echten Instanten; es wird nichts mehr
> multipliziert. Der Text bleibt stehen, weil er die Frage richtig gestellt hat.


Es gibt keine Messung der Ausfalldauer — es gibt nur Sonden, die geantwortet
haben, und Sonden, die es nicht taten. `down_sec` ist deshalb eine Herleitung und
keine Beobachtung: `fehlgeschlagene Checks × Intervall`, geklemmt bei 86 400.

`LEAST` ist tragend und nicht Kosmetik. `ops_days_down_sec_ck` deckelt bei einem
vollen Tag; ohne die Klemme bräche ein falsch gesetztes Intervall die **ganze**
Anweisung ab, und das Raster stünde für jedes System still, weil eine Zelle nicht
passt.

**Das ist die schwächste Aussage, die diese Phase ausliefert**, und sie gehört
benannt: die Zahl auf der Seite ist nur so ehrlich wie das Intervall in
`internal/ops`, und dessen Gegenstück ist ein Cron-Ausdruck in einem Workflow,
den es erst in F4 gibt. Solange keine Sonde läuft, ist die Frage akademisch — am
Tag 1 ist das ganze Raster `nodata`, und das ist die richtige Antwort. Ab F4 ist
es eine Zahl, die zwei Dateien gleichzeitig richtig halten müssen; das Runbook
sagt, welche zwei.

### 5. Zwei fehlgeschlagene Checks sind ein Ausfall — ab hier als Regel

Die Schwelle:

| fehlgeschlagene Checks am Tag | Zustand |
|---|---|
| 0 | `ok` |
| 1 | `degraded` |
| ≥ 2 | `outage` |

Das ist dieselbe Aufteilung, die `incident.sql` seit B4 benutzt und ausdrücklich
nur für sich selbst behauptet. **C4 übernimmt sie als Regel der Seite, und das
ist eine Entscheidung, kein Erbe.** Bei der Kadenz der Fixture (30 Minuten) hieß
„zwei Fehlschläge" eine Stunde; bei der Kadenz der Sonde (5 Minuten) heißt es
**zehn Minuten**. Die Regel wird durch den Wechsel schärfer, nicht laxer, und das
ist die richtige Richtung: ein rotes Feld soll etwas bedeuten.

Warum gezählt und nicht nach Dauer: die Zahl bleibt nachzählbar. „Zwei von 288
Sonden haben nicht geantwortet" kann ein Leser gegen `checks_total` und
`checks_up` prüfen, die beide in der Tabelle stehen. Eine Schwelle in Sekunden
wäre eine Ableitung aus einer Ableitung.

Die Zahl ist ein Parameter der Abfrage und keine Konstante darin. Nicht, damit
man sie im Betrieb drehen kann (siehe 6), sondern damit der Test sie drehen kann:
eine Regel, die in der SQL eingebacken wäre, machte den Vergleich mit der Fixture
zur Tautologie.

### 6. Vier Zahlen, vier Konstanten, keine Umgebungsvariable

`probeInterval`, `outageChecks`, `aggregateEvery` und `lookback` stehen als
Konstanten in `internal/ops`. `cmd/api` gibt für seine Verbindungslimits den
ersten Grund — sie beantworten keine Frage, die sich zwischen zwei Deployments
unterscheidet. Zwei von ihnen tragen einen zweiten.

**`probeInterval` und `outageChecks` entscheiden, was eine öffentliche Zelle
behauptet.** Wer sie aus der Umgebung verschieben könnte, färbte beim nächsten
Tick Monate an Verlauf um, und die Seite sähe weiterhin korrekt aus. Zwei
Instanzen derselben Version dürfen dieselben Rohdaten nicht verschieden
einfärben. Das ist Invariante 1 mit Betriebshut auf, und die Antwort darauf ist,
dass die Werte im Repository liegen, in einem Commit, neben ihrer Begründung.

Folge: `config.go`, `.env.example`, `compose.dev.yaml` und das Runbook `api.md`
bleiben in dieser Phase unberührt.

### 7. `incident_id` bleibt unberührt, und der Roll-up filtert nicht auf `live`

**Die Kerbe fasst der Roll-up nicht an.** `00004_operations.sql` begründet, warum
es keinen Constraint „`outage` verlangt einen Incident" gibt: er hielte den
Ausfall vom Raster fern, bis der Text existiert — die Seite verschwiege ein
Versagen, um eine Regel über das Dokumentieren von Versagen zu erfüllen. Dieselbe
Logik gilt für den Schreibpfad: der Roll-up trägt den Ausfall ein, ein Mensch
schreibt das Post-Mortem, und eine Neuberechnung darf das Ergebnis dieser Arbeit
nicht überschreiben. `incident_id` steht deshalb nicht in der
`DO UPDATE`-Liste.

Ein Restfall bleibt: fiele ein Tag mit Kerbe je auf `ok` zurück, hinge die Kerbe
falsch. Erreichbar ist das nur, wenn Fehlschläge **verschwinden**, also durch
`UPDATE` oder `DELETE` auf `ops_checks` von Hand — die API hängt nur an. Ein
Constraint dagegen wäre möglich, hielte aber ab dem ersten Auftreten den ganzen
Roll-up an, für jedes System. Stattdessen: eine Suchanfrage im Runbook und eine
Zeile im Backlog, „wenn es je auftritt". Das ist die Gewohnheit, die
`migrations.md` selbst vorschreibt — wo der Befund richtig ist, wird er notiert,
nicht behoben.

**Und der Roll-up fragt nicht nach `systems.state`.** Eine Messung, die
stattgefunden hat, zu verschweigen, ist die Umkehrung davon, eine zu erfinden —
und sie wäre genauso falsch. Ob ein Raster gezeigt wird, beantwortet der Lesepfad
aus C2, der die drei Arrays nur für `state: live` mitschickt. Aufzeichnen und
Ausliefern sind zwei Fragen, und sie werden an zwei Stellen beantwortet.

### 8. Angestoßen wird der Roll-up von einer Schleife im API-Prozess

Alle fünf Minuten, gestartet nach dem Pool, gestoppt im Drain-Pfad vor ihm. Ein
Host, ein Prozess, kein zusätzliches Stück Infrastruktur — und die Phase ist
damit ohne C7 fertig **und läuft**, was die eine Regel dieses Projekts von ihr
verlangt.

Vier Details, die jeweils eine Alternative ausschließen:

- **Ein Lauf sofort beim Start**, nicht erst beim ersten Tick. Ein Prozess, der
  häufiger neu startet als der Takt lang ist, aggregierte sonst nie.
- **Ein Fehler ist eine Logzeile und der nächste Tick.** Ein Raster, das
  veraltet, ist schlecht; eines, das nie wieder aktualisiert, weil Postgres
  einmal neu gestartet wurde, ist schlimmer.
- **`Stop()` bricht die laufende Abfrage ab, statt auf sie zu warten.** Jede
  Verbindung trägt `statement_timeout`; höfliches Warten könnte diese Zeit
  **nach** verbrauchtem `SHUTDOWN_GRACE` addieren, und die
  `stop_grace_period` des Containers beantwortet einen Überzieher mit SIGKILL.
  Ein halb gelaufener Roll-up darf verloren gehen — der nächste Tick leitet
  dieselben Tage wieder ab.
- **Ein abgebrochener Lauf ist kein Fehler.** `context.Canceled` wird
  geschluckt; eine `ERROR`-Zeile bei jedem Deploy wäre ein Wolf, den niemand mehr
  ernst nimmt.

Die Logzeile `ops roll-up` läuft auf `INFO` und bei **jedem** Lauf, auch wenn er
nichts schreibt. Sie ist der einzige Beleg, dass die Schleife lebt, und die erste
Frage des Runbooks wird durch ihr Fehlen beantwortet.

## Konsequenzen

- **Invariante 6 ist ab hier eine Eigenschaft der Form, keine Regel mehr.** Beide
  Pfade können sie nicht verletzen: der Lesepfad erzeugt die Lücke, der
  Schreibpfad kann sie nicht füllen.
- **C7 wird kleiner.** Der Probe-Endpoint muss nichts aggregieren; er hängt eine
  Zeile an `ops_checks` an, und die Schleife findet sie beim nächsten Tick. Der
  Deploy-Endpoint ebenso.
- **F4 braucht keinen Sonderweg.** Der Backfill schreibt Zeilen mit altem
  `observed_at`, und der Roll-up bewegt die richtigen Tage. Was F4 zusätzlich
  festlegen muss, ist die Kadenz seines Crons — und die muss zu `probeInterval`
  passen.
- **Der Contract ist unberührt.** C4 fügt keinen Pfad, kein Schema und keinen
  Header hinzu; ein Contract-Test entfällt in dieser Phase deshalb, und das steht
  im PR statt als leeres Häkchen in der Definition of Done.
- **`Makefile`s `GENERATED` war seit C3 unvollständig** —
  `api/internal/store/training.sql.go` fehlte, eine generierte Datei stand also
  eine ganze Phase lang außerhalb des Drift-Checks. C4 trägt sie zusammen mit
  `ops.sql.go` nach; aus „neun Dateien" werden elf.

### Was das kostet

- **Der Roll-up schreibt pro Tick ein bis zwei Zeilen umsonst neu.** Ohne die
  verworfene Staleness-Bedingung (siehe unten) wird jeder Tag im Fenster neu
  abgeleitet, auch wenn sich nichts geändert hat. Der Preis dafür ist
  konstant und klein; der Gegenwert ist, dass `computed_at` verlässlich „zuletzt
  abgeleitet" bedeutet und damit „das Raster steht still" überhaupt
  diagnostizierbar wird.
- **Der Scan auf `recorded_at` ist ein Seq Scan**, weil die Spalte keinen Index
  hat. Bei 52 416 Zeilen sind das 6 ms alle fünf Minuten. `migrations.md`
  schreibt für genau diesen Fall vor, zu notieren statt zu beheben; die Zeile
  steht im Backlog, und derselbe Index würde später auch den Aufbewahrungs-Job
  bedienen. Beim ersten von beiden wird nachgemessen.
- **`statement_timeout = 5 s` gilt auch für den Roll-up.** Gemessen liegt der
  schlimmste künstlich erzeugte Fall bei 386 ms, der Alltag bei 27 ms. Der
  Abstand ist groß, aber er ist nicht unendlich, und der Detektor dafür ist die
  `computed_at`-Zeile im Runbook.
- **Beim Deploy laufen zwei Instanzen und beide aggregieren.** `ORDER BY
  system_id, day` vor dem `ON CONFLICT` nimmt dem den Deadlock; `lock_timeout`
  kann den Verlierer trotzdem abbrechen. Das kostet einen Tick und eine Logzeile,
  und es steht im Runbook, weil ein `lock_timeout` während eines Deploys sonst
  wie ein Schemaproblem aussieht.
- **Nichts in `cmd/api` prüft die Drain-Reihenfolge.** `run()` hat keine Naht,
  und `serve()` sieht `onDrained` als ein undurchsichtiges `func()`. Eine
  Hilfsfunktion nur zum Testen von drei Aufrufen wäre schlechter als der
  Kommentar. Die Hälfte, die geprüft **wird**, liegt in `internal/ops`: nach
  `Stop()` läuft keine Abfrage mehr.

## Verworfene Alternativen

**Die Staleness-Bedingung `recorded_at > computed_at`**, um nur wirklich
veränderte Tage neu zu rechnen. Sie bringt fast nichts — `recorded_at` ist
`DEFAULT now()`, jede noch ungesehene Zeile ist also ohnehin frisch — und sie
trägt einen Lost-Update. `now()` ist in Postgres die **Transaktions**zeit: eine
Sonde, die bei T₁ beginnt und bei T₂ committet, ist für einen Roll-up mit
Snapshot zwischen T₁ und T₂ unsichtbar, schreibt aber `recorded_at = T₁`. Setzt
dieser Roll-up `computed_at = T₀ > T₁`, ist die Bedingung beim nächsten Tick
falsch, und **diese Messung wird nie aggregiert**. Das Fenster ist heute
Mikrosekunden breit. Es ist trotzdem genau die Fehlerklasse, gegen die diese
Seite gebaut ist: eine Zelle, die still falsch ist und richtig aussieht. Zwei
umsonst geschriebene Zeilen pro Tick sind der bessere Handel.

**Eine Go-Schleife über `ops_checks`.** Täte dasselbe — bis jemand sie ändert.
Der Satz steht schon in `queries/systems.sql` über das Fenster und gilt hier
unverändert.

**Ein Trigger auf `ops_checks`.** Machte jede Sondenmeldung teurer, den
Backfill langsam und die Herleitung unsichtbar. Und er liefe unter der Rolle des
Schreibers, nicht unter der des Aggregators.

**Eine Materialized View.** `tools/check-migrations.sh` lehnt sie ohnehin ab, und
zu Recht: `REFRESH` ist ein Roll-up mit schlechterer Kontrolle darüber, was er
anfasst.

**Auf `state = 'live'` filtern.** Siehe 7 — aufzeichnen und ausliefern sind zwei
Fragen.

**`CHECK (state <> 'ok' OR incident_id IS NULL)` samt Migration `00008`.**
Verwandelte eine von Hand erzeugte Anomalie in einen harten Abbruch des ganzen
Roll-ups. Notiert im Backlog, mit der Suchanfrage im Runbook.

**Ein Index auf `ops_checks.recorded_at`.** 6 ms alle fünf Minuten rechtfertigen
keinen Index auf einer Tabelle, die alle fünf Minuten eine Zeile bekommt.

**Vier Umgebungsvariablen.** Siehe 6.

**`POST /api/internal/probe` in dieser Phase mitnehmen**, damit „Ops-Endpoints"
seinen Namen behält. C7 ist eine Sicherheitsphase — konstantzeitiger
Token-Vergleich, 401 ohne Informationsleck, zusätzlicher Block am Traefik — und
sie im Vorbeigehen zu bauen machte sie schlechter, nicht diese hier besser.

## Belege

Build-Plan Zeile 1063–1064 (C4), 1074 (C7), 1156–1158 (F4), 329 (`rapid` für die
Ops-Aggregation), Kapitel 4.2 und 4.3 · Handbuch §8 (Ausfallprotokoll), §13
(Betriebsraster) · ADR 0009 (Problem Details, Cache), ADR 0010 (Enum-Werte),
ADR 0013 (Seed misst nicht), ADR 0016 (sqlc, `LEFT JOIN`, LATERAL),
ADR 0017 (Fenster in SQL, C4 ist die Aggregation) ·
`api/migrations/00004_operations.sql` (die beiden Zeitstempel, die
`nodata`-Äquivalenz, der fehlende Outage-Constraint, die kommentierte
Lesefform), `api/migrations/00001_privileges.sql` (INSERT/UPDATE für
`timseil_app`), `api/migrations/invariants_db_test.go`,
`api/migrations/fixtures_db_test.go` (die Verteilung 61/28/1/1) ·
`api/internal/fixtures/incident.sql` (die Konvention, die hier zur Regel wird),
`api/internal/fixtures/day-one.sql` ·
`api/internal/store/queries/ops.sql`, `api/internal/store/ops_db_test.go`,
`api/internal/store/ops_property_db_test.go`, `api/internal/ops/ops.go`,
`api/cmd/api/main.go` · `docs/runbooks/ops.md`, `docs/runbooks/migrations.md`
(die gemessenen Pläne).
