# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

**Letzte Triage: nach Stufe B, 17.08.2026.** 76 Zeilen → **25 Issues** (#22–#46),
**6 verworfen mit Begründung** ([#47](https://github.com/G1NG4R/timseil-dev/issues/47),
geschlossen), **40 erledigt**. Die Verwerfungen stehen dort mit ihrem Grund, damit
keine davon in vier Monaten neu durchdacht wird.

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Wann |
|---|---|---|---|
| 2026-08-17 | C1 | Generierten Router (`httpx.HandlerWithOptions`) montieren und `RegisterDocs` dabei in den Strict-Handler falten. Bis dahin registriert `internal/server` von Hand — Begründung in ADR 0016. | C7 |
| 2026-08-17 | C1 | `SHUTDOWN_DELAY`: eine Vorlaufzeit zwischen „`/readyz` sagt 503" und „Listener schließt", damit Traefik die Instanz aus dem Pool nimmt, bevor sie aufhört anzunehmen. Ohne Proxy davor heute wirkungslos. | E5 |
| 2026-08-17 | C1 | Healthcheck im Produktions-Compose: `wget` gibt es nur im Alpine-Dev-Image, `distroless` hat keine Shell. Braucht einen Selbsttest im Binary (`api -healthcheck`) oder ein anderes Mittel. | D1/D2 |
| 2026-08-17 | C1 | Im Dockerfile **kein** `COPY go.mod go.sum` + `go mod download` voranstellen: das zieht den ganzen Tool-Graphen (sqlc, oapi-codegen — 65 indirekte Module) in eine Image-Schicht. `go build ./cmd/api` lädt nur, was es braucht. ADR 0016. | D1 |
| 2026-08-17 | C1 | Dependabot für `gomod`: Verhalten für **indirekte** Tool-Abhängigkeiten festlegen, bevor die erste PR-Welle kommt. 41 der 65 indirekten Zeilen gehören sqlc und erreichen das Binary nicht. | E2 |
| 2026-08-17 | C2 | Beim Umbau auf `httpx.HandlerWithOptions` müssen **beide** Fehler-Hooks belegt werden: `ResponseErrorHandlerFunc` für `ErrNoSuchSystem`/`ErrBadWindow`, `RequestErrorHandlerFunc` für ein `window`, das nicht als Integer bindet. Beide antworten per Default `http.Error` in Klartext — das wäre ein Rückschritt hinter ADR 0009 an genau zwei Stellen, die heute richtig sind. | C7 |
| 2026-08-17 | C2 | `cacheControl` steht jetzt als Konstante in zwei Handler-Paketen. Contract-Tests halten beide gegen das Dokument, also driften sie nicht — aber ab dem dritten Paket lohnt eine gemeinsame Quelle in `httpx`, aus den `$ref`-Namen des Contracts abgeleitet. | ~~C4~~ **erledigt in C3** — `httpx.CacheControlShort/Medium/Hour/None`, ADR 0018 |
| 2026-08-18 | C3 | `track_evidence` hat keinen Index auf `system_id` — bewusst, siehe Kommentar in `00003_training.sql`. `ListTrackEvidence` joint jetzt genau darüber. Bei 13 Zeilen ist der Seq Scan richtig; die Zeile steht hier, damit beim dritten System nachgesehen wird. | beim dritten System |
| 2026-08-18 | C4 | `ops_checks.recorded_at` hat keinen Index; der Roll-up scannt die Tabelle alle fünf Minuten. Gemessen 6 ms auf 52 416 Zeilen — richtig so (`migrations.md`: notieren, nicht beheben). Derselbe Index würde später den Aufbewahrungs-Job bedienen. | beim Aufbewahrungs-Job, oder wenn der Scan gemessen weh tut |
| 2026-08-18 | C4 | `CHECK (state <> 'ok' OR incident_id IS NULL)` als Migration. Der Roll-up fasst `incident_id` nie an, also kann eine Kerbe an einem `ok`-Tag hängen bleiben — erreichbar nur durch von Hand geänderte Rohmessungen. Ein Constraint hielte ab dem ersten Auftreten den ganzen Roll-up an. Detektor steht in `docs/runbooks/ops.md`. | wenn es je einmal auftritt |
| 2026-08-18 | C4 | Eine Prüfung, die den Cron-Ausdruck der F4-Sonde gegen `probeInterval` in `api/internal/ops` hält. Die zwei sind Hälften derselben Zahl — läuft die Sonde anders als die Konstante sagt, ist jede Ausfalldauer auf der Seite falsch, und nichts merkt es. | F4 |

## Gefunden — Bug oder Unklarheit

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-08-17 | C1 | `httpx.MatchesETag` ersetzt einen `strings.Contains`-Vergleich, der `If-None-Match: *` nicht beantwortete und auf jeden Tag passte, der unseren enthielt. Betraf die drei Doku-Routen seit B1. | behoben |
| 2026-08-17 | C1 | `make check-db` braucht `-p 1`: seit `internal/store` db-getaggte Tests hat, wollen zwei Pakete dieselbe Testdatenbank gleichzeitig, und der Verlierer meldet „relation already exists" — sieht aus wie eine kaputte Migration. | behoben |
| 2026-08-17 | C1 | sqlc kennt die Nullability eines `LEFT JOIN` nicht und erzeugt für linksgejointe `NOT NULL`-Spalten einfache Typen. Betrifft jede spätere Abfrage mit optionalen Beziehungen — C2 und C4 werden darüber stolpern. | notiert in ADR 0016 |
| 2026-08-17 | C1 | `/api/badge/*` hat weiterhin keine Phase ([#27](https://github.com/G1NG4R/timseil-dev/issues/27)). Die Badges lesen `/api/health`, das es jetzt gibt — die drei Endpoints selbst fehlen noch. | offen, in C2 bewusst nicht mitgenommen (ADR 0017) |
| 2026-08-17 | C2 | `getSystem` deklarierte keine 400, obwohl `window` ein Enum mit drei Werten ist. Der Contract galt seit B1 als eingefroren; die Lücke ist hier geschlossen worden, weil jede Alternative im Handler gelogen hätte. Begründung in ADR 0017. | behoben |
| 2026-08-17 | C2 | Die `LEFT JOIN`-Falle aus ADR 0016 ist im Raster eingetreten und nicht dort, wo sie erwartet wurde: `ops_days.state` ist `NOT NULL`, linksgejoint scheitert der Scan mit `cannot scan NULL into *string`. `COALESCE(...)::text` gibt sqlc die Nullability der Abfrage zurück. Nachgemessen, indem der Cast entfernt wurde. | behoben |
| 2026-08-17 | C2 | `sqlc.arg(window)` bricht den Parser: `window` ist in Postgres ein reserviertes Wort (WINDOW-Klausel). Der Parameter heißt jetzt `window_size`. Trifft jede spätere Abfrage, die einen Parameter nach einem SQL-Schlüsselwort benennen will. | behoben |
| 2026-08-17 | C2 | Der Build-Plan schneidet C2 und C4 anders als der Contract: „Ops-Endpoints" hat gar keinen eigenen Pfad. Entschieden in ADR 0017 — C2 liefert das Raster mit, **C4 ist damit nur noch die Aggregation `ops_checks → ops_days`.** Beim Start von C4 daran denken, sonst wird es zweimal gebaut. | notiert in ADR 0017 |
| 2026-08-18 | C3 | Build-Plan (B4) und Handbuch nennen als Seed-Abnahme „13× applied, **9× learning**, 0× core". Die mittlere Zahl ist falsch: `learning` verlangt ein System in `in_build`, am Starttag gibt es keins, also sind es **9× queued**. `seed_db_test.go` hält das seit B4 fest, H4 wird dieselbe Zahl brauchen. | notiert in ADR 0018 |
| 2026-08-18 | C3 | Gegenprobe zur `LEFT JOIN`-Falle: für `v_track_states.state` — ein `CASE` über zwei linke Joins — erzeugt sqlc ein schlichtes `string`, **kein** `*string`. Ein `COALESCE` wie bei `ops_days` ist hier also falsch, nicht bloß überflüssig. Nachgemessen an der generierten Datei. | geprüft |
| 2026-08-18 | C3 | Das Abnahmekriterium von C3 („Tracks springen von `learning` auf `applied`") ist mit dem Seed nicht direkt zu beobachten, weil der Ausgangszustand `applied` ist. Der db-Test baut die Bewegung selbst (`live` → `in_build` → `live` → `queued`). Mutationsgeprüft: mit eingefrorenem `state` in der Abfrage fallen drei Tests um. | behoben |
| 2026-08-18 | C4 | `Makefile`s `GENERATED` fehlte `api/internal/store/training.sql.go`. C3 hat die Datei angelegt und die Zeile vergessen — eine generierte Datei stand eine ganze Phase lang außerhalb des Drift-Checks, ohne dass etwas es gemerkt hätte. Beide Zeilen (`training.sql.go`, `ops.sql.go`) sind jetzt drin, aus „neun Dateien" werden elf. | behoben |
| 2026-08-18 | C4 | Der Roll-up als gewöhnlicher Join ergibt einen **Merge Join**, der 4,7 Mio. Zeilen per Filter verwirft: 1,63 s für 182 Tage. Als `CROSS JOIN LATERAL` sind es 386 ms, im Alltag 27 ms. Wörtlich dieselbe Lektion wie `ListSystems` in C2 — es war nie der Index, es war die Frage. Gemessen und in `migrations.md` eingetragen. | behoben |
| 2026-08-18 | C4 | Die Staleness-Bedingung `recorded_at > computed_at` sieht richtig aus und trägt einen Lost-Update: `now()` ist in Postgres die *Transaktions*zeit, also kann eine Sonde, die vor dem Roll-up beginnt und nach ihm committet, nie aggregiert werden. Verworfen, Begründung in ADR 0019. Betrifft jede spätere Abfrage, die zwei `now()`-Zeitstempel vergleicht — C7 und F4 schreiben beide in `ops_checks`. | notiert in ADR 0019 |
| 2026-08-18 | C4 | Der Roll-up bewegt einen Tag in einen gemessenen Zustand hinein, nie wieder heraus: verschwänden alle Checks eines Tages, bliebe die Zeile stehen. Für die Aufbewahrung richtig (`ops_checks` wird irgendwann beschnitten, `ops_days` ist der dauerhafte Datensatz), für von Hand gelöschte Checks falsch. | notiert in ADR 0019 und `runbooks/ops.md` |
| 2026-08-18 | C4 | Kein Werkzeug hält `.env.example` gegen `api/internal/config/config.go`. Bei einer neuen Variablen müssen vier Dateien von Hand mitwandern (`config.go`, `config_test.go`, `.env.example`, `compose.dev.yaml`) plus die Tabelle in `runbooks/api.md`. In C4 nicht aufgefallen, weil die Phase bewusst keine anlegt. | offen |
| 2026-08-18 | C4 | Die ADR-Tabelle im README endet bei 0011 und ist um acht Einträge veraltet (0012–0019). | offen |

## Idee — noch nicht entschieden

| Datum | Was | Bewertung |
|---|---|---|
| 2026-08-17 | `RATE_LIMIT_EXEMPT_CIDRS` für das Deploy-Gate und die Badge-Abrufe, falls die alle aus einer Egress-IP kommen und sich 120/min teilen. | Heute kein Problem; erst messen, wenn E4 und die Badges laufen. |
| 2026-08-17 | Die vier Werte der Timeout-Kaskade unter Last nachmessen statt aus der Topologie abzuleiten. | Sinnvoll ab F1, wenn es Zahlen gibt. |
| 2026-08-17 | Das Raster über `generate_series` erzeugt bei `window=182` 182 Zeilen, auch wenn keine einzige gemessen ist. Bei zwei Systemen und drei Fenstern egal; falls die Detailseite je heiß wird, ist das die Stelle. | Erst messen. `s-maxage=300` deckt es heute vollständig ab. |
| 2026-08-18 | `/api/training` setzt den Baum bei jedem Abruf aus drei Abfragen zusammen. Bei 5 Modulen, 22 Tracks und 13 Belegzeilen ist das nicht messbar; falls der Log je wächst, ist die Stelle `assemble` in `internal/training`, nicht die SQL. | Erst messen. `s-maxage=300` deckt es heute vollständig ab. |
| 2026-08-18 | `down_sec` aus dem tatsächlichen Abstand zwischen zwei aufeinanderfolgenden Checks herleiten, statt es als „Fehlschläge × behauptetes Intervall" zu rechnen. Wäre ehrlicher — die Zahl käme dann aus den Daten und nicht aus einer Konstante, die zu einem Cron-Ausdruck passen muss. | Heute Überbau: es gibt keine Sonde. Wieder ansehen, wenn F4 läuft und die erste echte Kerbe im Raster steht. |
| 2026-08-18 | Der Roll-up läuft im API-Prozess. Bei zwei Instanzen (E5-Deploy) aggregieren beide; `ORDER BY` verhindert den Deadlock, `lock_timeout` kann den Verlierer trotzdem abbrechen. Ein Advisory Lock wäre die saubere Fassung. | Kostet heute einen Tick und eine Logzeile. Erst nötig, wenn ein zweiter Host dazukommt (ADR 0008). |
| 2026-08-17 | `ETag` und `window` zusammen: eine Antwort für `window=30` und eine für `window=91` haben verschiedene Tags, aber dieselbe URL ohne Query hat wieder eine eigene. Falls je ein Cache davor steht, muss der die Query in den Schlüssel nehmen — Standardverhalten, aber es steht nirgends aufgeschrieben. | Prüfen, wenn D3 Traefik-Caching berührt. |
