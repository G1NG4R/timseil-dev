# ADR 0017 — Die Systems-Endpoints: Fenster, Rasterlücken und Fehlerabbildung

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** C2, C4, C7
**Invarianten:** 1 (`null` → `— NO DATA`), 3 (Metriken nur für `live`),
6 (ein Tag ohne Messung ist `nodata`), 7 (das Fenster ist 91 Tage)

## Kontext

C2 baut `GET /api/systems` und `GET /api/systems/{slug}` — die zwei Endpoints,
die Kapitel 4.4 des Build-Plans „den Prüfstein der These" nennt. Der Contract
beschreibt beide seit B1 vollständig, das Schema steht seit B2, die Fixtures seit
B4. Es sollte reine Umsetzung sein, und vier Fragen sind trotzdem offen, weil sie
in keinem der drei Dokumente stehen.

## Entscheidung

### 1. Das Detail liefert Raster, Incidents und Deploys schon in C2

Der Contract sagt bei `getSystem`: „`days`, `incidents` and `deploys` are present
only for `state: live`." Der Build-Plan nennt C4 „Ops-Endpoints — 91-Tage-Raster,
Incidents, Deploys", und einen eigenen `/api/ops`-Pfad gibt es nicht. Beides kann
nicht gleichzeitig gelten: `timseil-dev` ist `live`, also müsste C2 entweder die
drei Arrays liefern oder eine Antwort geben, die dem eigenen Contract
widerspricht.

**C2 liefert sie.** Die Tabellen stehen seit B2, die Fixtures `DayOne` und
`Incident` existieren seit B4 genau dafür, und der Index-Kommentar in
`00004_operations.sql` nennt „C2/C4" ausdrücklich als Verbraucher.

**C4 bleibt die Aggregation** `ops_checks → ops_days` und ihr Lückentest. Das ist
auch die schärfere Fassung von C4: sein *Fertig wenn* („fehlende Messungen
erzeugen `nodata`, niemals `ok`") ist eine Aussage über den Roll-up, nicht über
den Lesepfad — und der Lesepfad kann sie ab hier nicht mehr verletzen, siehe
Punkt 3.

### 2. Ein `window` außerhalb des Enums ist eine 400, und die 400 kommt in den Contract

`window` ist `enum [30, 91, 182]` mit Vorgabe 91, aber `getSystem` deklarierte
keine 400. Damit gab es nur schlechte Möglichkeiten: still auf 91 zurückfallen,
oder einen Status senden, den das Dokument nicht kennt.

Still zurückfallen ist das Schlimmere. Die Antwort trägt ihr Fenster als Feld —
sie sähe vollständig korrekt aus und beschriebe einen Zeitraum, nach dem niemand
gefragt hat. Das ist genau die Sorte Zahl, gegen die diese Seite gebaut ist.

Also **`'400': $ref BadRequest` bei `getSystem`**, plus zwei Sätze in der
Beschreibung der Operation, die sagen warum. `BadRequest` gab es bereits, der
generierte Typ ebenfalls (von `/api/contact`) — die Änderung ist eine Zeile im
Contract und `make gen`.

Das ist dieselbe Regel wie bei den Cache-Headern in ADR 0009, eine Ebene höher:
**ein Handler, der einen Status erfindet, ist ein Contract-Fehler.** Die Lücke im
Contract schließt man im Contract.

`listSystems` bleibt unberührt — es hat keinen Parameter, den man falsch stellen
kann.

### 3. Das Fenster entsteht in SQL, nicht in Go

Invariante 6 sagt: ein Tag ohne Messung ist `nodata`, nie `ok`. Fehlt in
`ops_days` eine Zeile, muss trotzdem eine Zelle herauskommen. Zwei Wege:
Zeilen lesen und die Lücken in Go nachtragen, oder das Fenster erzeugen und die
Messungen dagegen joinen.

`OpsDaysForSystem` tut das zweite: `generate_series` liefert jede Zelle, ein
`LEFT JOIN` steuert die gemessenen bei, `COALESCE` benennt den Rest. Eine
Go-Schleife täte dasselbe — bis sie jemand umbaut. Hier kann der Lesepfad die
Invariante nicht mehr verletzen, unabhängig davon, was C4 später in die Tabelle
schreibt.

**Die beiden Casts sind tragend, nicht kosmetisch.** `ops_days.state` und
`down_sec` sind in ihrer Tabelle `NOT NULL`, also erzeugt sqlc `string` und
`int32` — und linksgejoint scheitert der Scan an genau dem Tag, für den die
Abfrage existiert. Das ist die Falle aus ADR 0016, diesmal auf der anderen Seite:
dort war eine Spalte fälschlich nicht-nullable, hier wird sie es durch
`COALESCE(...)::text` wieder, und zwar zu Recht. Nachgeprüft, indem der
`COALESCE` entfernt wurde: der Test meldet
`cannot scan NULL into *string`.

Ebenfalls entschieden: **„heute" ist überall `(now() AT TIME ZONE 'UTC')::date`,
nie `current_date`.** `current_date` liest die Zeitzone der Sitzung, also deckte
dieselbe Anfrage je nach Verbindungseinstellung einen anderen Zeitraum ab —
und `day-one.sql` baut sein Raster in UTC. Zwei Definitionen von „heute" sind
eine zu viel für eine Seite, deren Anspruch das Nachzählen ist.

Aus demselben Grund berechnen alle drei Ops-Abfragen ihre Grenze selbst aus
demselben `window`, statt einen fertigen Zeitpunkt aus Go zu bekommen: das
Raster, die Kerben und die Deploys können so nicht verschiedene Zeiträume
abdecken. Der Contract verlangt das ausdrücklich — Uptime, MTTR und Rollback-Rate
rechnet der Aufrufer aus `days` und `deploys`, und zwei Arrays über verschiedene
Spannen ergäben eine Rate, die dem Raster widerspricht.

### 4. 404 und 400 laufen über Sentinel-Errors, nicht über die generierten Response-Objekte

`GetSystem404ApplicationProblemPlusJSONResponse` schreibt Status und Body — und
sonst nichts. Kein `requestId`, kein `instance`, kein `Cache-Control: no-store`.
Alle drei kommen aus `httpx.writeProblem`, und alle drei verlangt ADR 0009.

Also gibt der Handler `ErrNoSuchSystem` bzw. `ErrBadWindow` zurück, und die
Abbildung auf ein Problem-Dokument passiert in der Schicht, die den Request noch
hat. Das ist zugleich der C7-taugliche Weg: `NewStrictHandlerWithOptions` nimmt
eine `ResponseErrorHandlerFunc(w, r, err)` — dieselbe Abbildung, nur an anderer
Stelle registriert. Der Tausch bleibt eine Router-Änderung, wie ADR 0016 es
verlangt.

**Ein Slug, den das Muster des Contracts nicht erfüllt, ist eine 404 ohne
Datenbankrunde.** `systems_slug_shape_ck` ist dasselbe Muster, Zeichen für
Zeichen — was es ablehnt, kann nicht in der Tabelle stehen, die Antwort ist also
schon bekannt. Nicht 400, weil die Frage „gibt es ein System mit diesem Namen"
lautet und die Antwort nein ist. Nebeneffekt: ein Pfadsegment beliebiger Größe
wird nie zu einer Abfrage.

## Konsequenzen

- Der Contract hat eine Operation mit einer 400 mehr; `contract/openapi.public.yaml`,
  das eingebettete Dokument, `gen.go` und `schema.d.ts` folgen über `make gen`.
- **C4 ist kleiner geworden** und schärfer: nur noch die Aggregation
  `ops_checks → ops_days` plus der Lückentest über den Roll-up. Der Lesepfad
  steht.
- `GENERATED` deckt eine neunte Datei ab (`api/internal/store/systems.sql.go`).
- Fünf Abfragen für das Detail statt einer geklügelten — dieselbe Entscheidung
  wie bei `/api/health`, aus demselben Grund (ADR 0016), und bei `s-maxage=300`
  kein Argument.
- Der Lesepfad trägt Invariante 3 jetzt an **zwei** Stellen: im `LEFT JOIN
  LATERAL` der Liste und in `LatestMetrics` für das Detail. Beide sind SQL, keine
  ist Go.
- **Die Liste liest `LatestMetrics` mit**, die für `/api/health` geschrieben
  wurde. Eine zweite Abfrage derselben Form wäre eine zweite Stelle, an der
  Invariante 3 vergessen werden kann.

### Was das kostet

**Der Contract ist nach B1 noch einmal angefasst worden.** Er gilt als
eingefroren, und eine 400 zu ergänzen ist die kleinste denkbare Änderung — aber
sie ist eine. Wäre die Seite schon öffentlich, wäre selbst diese Ergänzung eine
Ankündigung wert.

**`generate_series` über 182 Tage ist eine Zeile pro Tag, auch wenn nichts
gemessen wurde.** Bei drei zulässigen Fenstern und einem System ist das nichts;
es ist trotzdem Arbeit, die bei „nur die Zeilen lesen, die es gibt" nicht anfiele.

**Zwei Handler tragen dieselbe `cacheControl`-Konstante.** Der Contract-Test hält
beide gegen das Dokument, also können sie nicht auseinanderlaufen — aber es sind
zwei Kopien eines Wertes, den ADR 0009 an genau einer Stelle haben will.

## Verworfene Alternativen

**Die drei Arrays bis C4 weglassen** — der Contract erklärt sie für ein
`live`-System als vorhanden, und `timseil-dev` ist live. Die Phase wäre kleiner
gewesen und der Endpoint hätte bis C4 etwas anderes behauptet als das Dokument
daneben.

**Bei ungültigem `window` still auf 91 zurückfallen** — siehe oben: eine Antwort,
die aussieht wie eine Antwort auf die gestellte Frage und keine ist.

**Ungültiges `window` als 404** — hätte den Contract unberührt gelassen und wäre
semantisch falsch: der Slug existiert, der Parameter ist das Problem.

**Die Lücken im Raster in Go füllen** — funktioniert und hängt an einer Schleife,
die niemand als Invariante liest. Die Version in SQL ist eine Zeile länger und
kann nicht vergessen werden.

**Eine geklügelte Abfrage über `systems`, `metric_snapshots`, `ops_days`,
`incidents` und `deploys`** — spart vier Roundtrips und läuft in die
`LEFT JOIN`-Nullability aus ADR 0016, gleich fünfmal.

**Das Fenster in Go zu einem Zeitpunkt rechnen und an die drei Ops-Abfragen
übergeben** — eine zweite Definition von „heute", diesmal in einer anderen
Sprache und einer anderen Zeitzone.

**Die generierten 400-/404-Response-Objekte benutzen** — kostet `requestId`,
`instance` und `no-store`, also drei Zusagen aus ADR 0009 für etwas
Bequemlichkeit.

**`/api/badge/*` in dieser Phase mitnehmen** ([#27](https://github.com/G1NG4R/timseil-dev/issues/27)
schlägt C2 vor, weil die Daten dieselben sind) — andere Antwortform
(Shields.io-Endpoint), andere Belege, und C2 ist mit dem Golden-Test und dem
Detail-Endpoint bereits eine volle Phase. Die Zuordnung bleibt offen.

## Belege

Build-Plan Zeile 1057 (C2), 1063 (C4), Kapitel 4.4 („der Prüfstein der These") ·
Handbuch §12 (Metriken), §13 (Betriebsraster) · ADR 0009 (Problem Details,
Cache-Header), ADR 0016 (sqlc, `LEFT JOIN`, Strict-Form), ADR 0010 (Enums),
ADR 0004 (öffentliche Lese-API) ·
`contract/openapi.yaml` (`getSystem`) ·
`api/internal/store/queries/systems.sql`, `api/internal/systems/systems.go`,
`api/internal/store/systems_db_test.go` ·
`api/migrations/00004_operations.sql` („C2/C4"),
`api/migrations/00005_metrics.sql` („C2 takes the lateral form").
