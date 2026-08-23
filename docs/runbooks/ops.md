# Runbook — Der Ops-Roll-up

**Leser:** ich, wenn das Betriebsraster nicht mehr weiterläuft, und ich, wenn
eine Kerbe am falschen Tag hängt.

Der Roll-up ist die eine Anweisung in `api/internal/store/queries/ops.sql`,
angetrieben von der Schleife in `api/internal/ops`, gestartet und gestoppt in
`api/cmd/api/main.go`. Die Rohdaten kommen seit C7 aus `api/internal/intake`
und seit F4 zusätzlich aus `api/internal/uptime`.
ADR 0019 (diese Entscheidung), ADR 0017 (Fenster und Rasterlücken auf dem
Lesepfad), ADR 0013 (der Seed misst nicht), ADR 0023 (woher eine Zeile in
`ops_checks` kommt), ADR 0038 (das externe Ausfallprotokoll),
`api/migrations/00004_operations.sql` (die Tabellen und ihre Constraints).

**Das ist das erste Stück dieses Systems, das ohne Request von selbst läuft und
eine öffentliche Zahl erzeugt.** Alles darunter folgt daraus.

---

## Der Alltag

Alle fünf Minuten leitet die Schleife jeden Tag neu ab, für den in den letzten 24
Stunden eine Rohmessung eingetroffen ist. Sie schreibt nur gemessene Tage; ein
Tag ohne Check erreicht die Tabelle nie, und die leere Zelle im Raster entsteht
beim Lesen (`OpsDaysForSystem`). Das ist Invariante 6, und sie hängt an der Form
der Abfrage, nicht an einer Regel, die jemand einhält.

```
{"level":"INFO","msg":"ops roll-up","days":2}
```

Die Zeile kommt bei **jedem** Lauf, auch bei `days: 0`. Sie ist der einzige
Beleg, dass die Schleife lebt.

```bash
docker compose -f compose.dev.yaml logs api | grep 'ops roll-up' | tail -5
```

**Bis F4 stand dort `days: 0`, und das war richtig.** Seit C7 gab es den
Endpoint, der Rohdaten annimmt, aber keine Sonde, die ihn ruft — also nichts zu
aggregieren, also das ganze Raster `nodata`. Ein volles Raster wäre an dieser
Stelle die Lüge gewesen.

**Seit F4 ruft alle fünf Minuten jemand an.** `days: 0` heißt jetzt: seit 24
Stunden ist keine Messung eingetroffen. Das ist eine Frage an die Sonde, nicht
an diese Schleife — siehe „Wenn die Sonde schweigt".

---

## Woher eine Zeile in `ops_checks` kommt

Zwei Quellen, und `origin` sagt welche:

| `origin` | Wer schreibt | Wann |
|---|---|---|
| `probe` | `POST /api/internal/probe` (C7), gerufen von `tools/probe.sh` aus `.github/workflows/probe.yml` | solange der Host lebt |
| `backfill` | `api/internal/uptime` spielt `uptime-log.txt` vom Branch `ops-data` ein | beim Start und alle 15 min, also sobald der Host zurück ist |

**`source_ref` ist nur bei `backfill` gesetzt** und nennt den Commit, also ist
jede nachgetragene Zeile auf etwas öffentlich Prüfbares zurückführbar. Der
Constraint `ops_checks_backfill_cites_source_ck` erzwingt das, und
`InsertOpsCheck` schreibt `origin` fest als `'probe'` — eine Live-Sonde kann
nicht behaupten, Beleg von außerhalb der Infrastruktur zu sein (ADR 0023 §8).

Das Paar `observed_at` / `recorded_at` ist die eigentliche Aussage: bei einer
Live-Sonde liegen sie Sekunden auseinander, bei einer nachgetragenen Zeile
Stunden, und **dieser Abstand ist der Beleg** — die Aufzeichnung des Ausfalls hat
das System überlebt, das ihn hätte aufzeichnen sollen.

### „Eine Zeile ist geschrieben und das Raster ändert sich nicht"

```sql
-- Wurde sie überhaupt aufgezeichnet, und wie alt hält die Datenbank sie?
SELECT origin, observed_at, recorded_at, up
  FROM ops_checks ORDER BY id DESC LIMIT 5;
```

Ist `recorded_at` **alt**, hat jemand die Spalte von Hand gesetzt. Der Roll-up
begrenzt seinen Scan darauf (ADR 0019 §2), also fällt so eine Zeile aus dem
Lookback-Fenster und wird nie gezählt — geschrieben, unsichtbar, und nichts
meldet es. `InsertOpsCheck` lässt die Spalte deshalb weg und nimmt ihren Default;
`TestALateObservationIsStillFreshlyRecordedAndStillAggregated` hält das fest.

Steht in den Logs `probe already recorded`, hat die Sonde dieselbe
`observed_at` ein zweites Mal geschickt. Ein Wiederholungsversuch nach einem
Timeout ist normal und die Zeile eine Beruhigung. Kommt sie bei **jedem** Lauf,
hängt die Sonde in einer Zeitstempel-Schleife, und dann ist das Raster zu Recht
leer.

---

## „Das Raster steht still"

Erste Frage, immer dieselbe:

```sql
SELECT max(computed_at) AS zuletzt_abgeleitet,
       count(*) FILTER (WHERE checks_total > 0) AS gemessene_tage,
       count(*) AS zeilen
  FROM ops_days;
```

`zuletzt_abgeleitet` ist älter als zwei Ticks (also älter als zehn Minuten) →
die Schleife läuft nicht oder der Roll-up scheitert. Dann nach der `ERROR`-Zeile
suchen:

```bash
docker compose -f compose.dev.yaml logs api | grep 'the ops roll-up failed'
```

**Diese Diagnose funktioniert nur, weil der Roll-up `computed_at` bedingungslos
neu setzt** — auch für Tage, an denen sich nichts geändert hat. Das kostet ein bis
zwei überflüssig geschriebene Zeilen pro Tick und ist genau dafür bezahlt
(ADR 0019).

Drei Befunde und ihre Bedeutung:

| Befund | Heißt |
|---|---|
| `zuletzt_abgeleitet` frisch, `gemessene_tage = 0` | Die Schleife läuft, es gibt keine Rohdaten. Seit F4 heißt das: die Sonde schweigt seit 24 Stunden. |
| `zuletzt_abgeleitet` alt, `zeilen > 0` | Die Schleife steht. Logzeilen prüfen. |
| gar keine Zeile | Weder Sonde noch Fixture hat je etwas geschrieben. Das Raster rendert trotzdem — 91 Zellen, alle `nodata`. |

Gegenprobe über den Lesepfad, also über das, was ein Besucher sieht:

```bash
curl -s localhost:8080/api/systems/timseil-dev | \
  jq '{window, cells: (.days|length), byState: (.days|group_by(.state)|map({(.[0].state): length})|add)}'
```

`cells` ist immer gleich `window`, auch auf einer leeren Datenbank — das Fenster
entsteht in SQL. Wären es weniger, wäre die Abfrage kaputt und nicht die
Datenlage.

---

## Wenn die Sonde schweigt

Seit F4 kommen die Rohdaten von außen: `.github/workflows/probe.yml` ruft alle
fünf Minuten `tools/probe.sh`, das misst, meldet und bei einem Zustandswechsel
eine Zeile auf den Branch `ops-data` schreibt. **Diese Schleife hier kann nichts
aggregieren, was dort nicht ankommt.**

Erste Frage: **läuft der Workflow überhaupt?**

```
github.com/G1NG4R/timseil-dev/actions  →  probe
```

| Befund | Heißt |
|---|---|
| Läufe kommen, alle grün | Die Zeilen sind unterwegs. Weiter unten in dieser Datei suchen. |
| Läufe fehlen ganz | GitHub hat den Zeitplan abgeschaltet. Siehe unten. |
| Läufe sind rot mit `401` | `INTERNAL_PROBE_TOKEN` im Repository stimmt nicht mit dem im Container überein. **Kein Ausfall** — die Sonde schreibt in diesem Fall bewusst nichts. |
| Läufe sind rot mit „stopped answering" | Der Host antwortet wirklich nicht. Das ist der Alarm, nicht der Fehler. |

**GitHub schaltet geplante Workflows nach 60 Tagen ohne Repository-Aktivität
ab.** Sie verschwinden dann leise; es kommt keine Mail, und das Raster füllt sich
einfach nicht mehr. Ein Blick auf die Actions-Seite ist die einzige Diagnose.
Wieder anschalten: **Actions → probe → Enable workflow**. Ab F10 fängt der Dead
Man's Switch genau diesen Fall.

**Von Hand nachfragen, mit demselben Skript, das der Workflow ruft:**

```bash
INTERNAL_PROBE_TOKEN=… make probe PROBE_BASE=https://timseil.dev
```

Ohne `PROBE_LOG` wird nichts angehängt — der Lauf misst, meldet und schweigt
sonst.

### Die Wiedereinspielung

`api/internal/uptime` liest `uptime-log.txt` beim Start und danach alle 15
Minuten. Eine Zeile pro Lauf, und ihr Fehlen ist die Diagnose:

```bash
docker compose logs api | grep 'uptime backfill' | tail -5
```

| `state` | Heißt |
|---|---|
| `no log yet` | Auf `ops-data` liegt keine Datei. **Normalzustand**, solange der Host seit F4 nicht weg war. |
| `unchanged` | 304 — die Datei hat sich seit dem letzten Lauf nicht bewegt. Der Regelfall. |
| `replayed` | Gelesen und eingespielt. `rows_new` sind die neuen Zeilen, `checks` alle; die Differenz hatte die Datenbank schon. |
| `unreachable` | GitHub war nicht erreichbar. Kein Datenverlust — die Datei bleibt liegen, der nächste Lauf holt sie. |
| `unreadable` | Die Datei bricht die Grammatik. **Nichts wurde eingespielt, absichtlich.** Die Fehlermeldung nennt die Zeilennummer. |
| `breaker open` | Fünf Läufe in Folge fehlgeschlagen, jetzt eine halbe Stunde Ruhe. |

**`unreadable` ist der einzige, der Handarbeit braucht.** Die Grammatik steht in
ADR 0038 und in `api/internal/uptime/parse.go`; die Datei wird als **Ganzes**
abgewiesen, weil ein halb gelesenes Ausfallprotokoll ein kürzeres ist, und ein
kürzeres Ausfallprotokoll behauptet, die Seite sei oben gewesen.

### Eine rote Zelle direkt nach einem Deploy

ADR 0035 hat `api` in Schritt 3 jedes Rollouts kurz weg. Die Sonde versucht den
Bericht deshalb dreimal im Abstand von fünf Sekunden, bevor daraus ein `down`
wird. Trifft ein Rollout das Fenster trotzdem, steht ein echter Ausfall von fünf
Minuten im Raster, den kein Besucher gesehen hat.

**Die Antwort ist dann das Fenster, nicht die Zeile.** Eine Zeile zu löschen,
weil sie unangenehm ist, ist genau die Bewegung, gegen die diese Seite gebaut
ist — dieselbe Regel, unter der `report-deploy.sh` einen Rollback meldet.

---

## Einen Zeitraum von Hand neu rechnen

Der Roll-up sieht nur, was in den letzten 24 Stunden **eingetroffen** ist
(`recorded_at`), nicht, was es betrifft (`observed_at`). Wenn die Schleife länger
als einen Tag stand, muss das Fenster einmalig größer sein:

```sql
-- Der Roll-up mit einem Fenster von 30 Tagen statt 24 Stunden.
-- Die drei Zahlen sind lookback_sec, outage_checks, probe_interval_sec und
-- stehen als Konstanten in api/internal/ops/ops.go — hier müssen dieselben
-- Werte stehen, sonst rechnet die Hand anders als die Schleife.
WITH touched AS (
    SELECT DISTINCT c.system_id, (c.observed_at AT TIME ZONE 'UTC')::date AS day
      FROM ops_checks c
     WHERE c.recorded_at >= now() - (2592000 * interval '1 second')
), rolled AS (
    SELECT t.system_id, t.day, a.checks_total, a.checks_up, a.checks_down
      FROM touched t
      CROSS JOIN LATERAL (
          SELECT count(*) AS checks_total,
                 count(*) FILTER (WHERE c.up) AS checks_up,
                 count(*) FILTER (WHERE NOT c.up) AS checks_down
            FROM ops_checks c
           WHERE c.system_id = t.system_id
             AND c.observed_at >= (t.day::timestamp AT TIME ZONE 'UTC')
             AND c.observed_at <  ((t.day + 1)::timestamp AT TIME ZONE 'UTC')
      ) a
)
INSERT INTO ops_days (system_id, day, state, down_sec, checks_total, checks_up, computed_at)
SELECT system_id, day,
       CASE WHEN checks_down = 0 THEN 'ok'
            WHEN checks_down < 2 THEN 'degraded'
            ELSE 'outage' END,
       LEAST(checks_down * 300, 86400)::int,
       checks_total, checks_up, now()
  FROM rolled
 ORDER BY system_id, day
    ON CONFLICT (system_id, day) DO UPDATE SET
       state = EXCLUDED.state, down_sec = EXCLUDED.down_sec,
       checks_total = EXCLUDED.checks_total, checks_up = EXCLUDED.checks_up,
       computed_at = EXCLUDED.computed_at;
```

Idempotent: zweimal ausführen ändert nichts. Die Anweisung fasst `incident_id`
nicht an, also kann sie kein Post-Mortem verlieren.

---

## „Eine Kerbe hängt am falschen Tag"

Der Roll-up trägt den Ausfall ein, ein Mensch schreibt das Post-Mortem, und die
Neuberechnung fasst die Verknüpfung nie an (ADR 0019). Fällt ein Tag mit Kerbe je
auf `ok` zurück, bleibt die Kerbe hängen — der Detektor:

```sql
SELECT system_id, day, state, incident_id
  FROM ops_days
 WHERE incident_id IS NOT NULL
   AND state NOT IN ('degraded', 'outage');
```

Erwartet: null Zeilen. **Erreichbar ist das nur, wenn jemand Rohmessungen von
Hand geändert oder gelöscht hat** — die API hängt an `ops_checks` nur an. Wenn es
auftritt: die Zeile von Hand korrigieren, der Roll-up tut es nicht. Und dann die
Backlog-Zeile hervorholen, die einen Constraint dafür vorschlägt: einmal ist ein
Vorfall, zweimal ist eine Regel.

Der umgekehrte Fall — ein `outage` **ohne** Kerbe — ist kein Fehler, sondern der
Normalzustand zwischen dem Ausfall und dem Post-Mortem. Das Schema erzwingt hier
mit Absicht nichts: ein Constraint hielte den Ausfall vom Raster fern, bis der
Text existiert, und die Seite verschwiege damit ein Versagen, um eine Regel über
das Dokumentieren von Versagen zu erfüllen.

```sql
-- Was noch ein Post-Mortem braucht.
SELECT system_id, day, down_sec FROM ops_days
 WHERE state = 'outage' AND incident_id IS NULL ORDER BY day DESC;
```

---

## Die vier Zahlen

Sie stehen als Konstanten in `api/internal/ops/ops.go`, nicht in der Umgebung.
Der Grund steht in ADR 0019 §6: zwei von ihnen entscheiden, was eine öffentliche
Zelle behauptet, und wer sie zur Laufzeit drehen könnte, färbte Monate an Verlauf
um, ohne dass die Seite falsch aussähe.

| Konstante | Wert | Wovon sie abhängt |
|---|---|---|
| `ProbeInterval` | 5 min | **dem Cron in `.github/workflows/probe.yml`** |
| `outageChecks` | 2 | nichts — die Regel dieser Seite |
| `aggregateEvery` | 5 min | `ProbeInterval` |
| `lookback` | 24 h | wie lange die Schleife stehen darf, ohne dass etwas verloren geht |

**Die eine Zeile, die hier wirklich wichtig ist:** `ProbeInterval` und der
Cron-Ausdruck in `.github/workflows/probe.yml` sind zwei Hälften derselben Zahl.
`down_sec` ist fehlgeschlagene Checks **mal diesem Intervall** — läuft die Sonde
alle zehn Minuten, während hier fünf steht, ist jede Ausfalldauer auf der Seite
halb so groß wie die echte, bei richtiger Zellenzahl und richtiger Farbe.

**Seit F4 prüft `make check-probe-cadence` das**, und `ProbeInterval` ist
deshalb exportiert: `api/internal/uptime` bekommt den Wert übergeben, statt eine
zweite Kopie zu halten. Drei Stellen, eine Zahl.

---

## Zwei Instanzen beim Deploy

E5 fährt beim Rollout zwei Instanzen dieses Binaries gleichzeitig, und beide
aggregieren. Das ist in Ordnung: der Roll-up ist idempotent, und `ORDER BY
system_id, day` vor dem `ON CONFLICT` sorgt dafür, dass beide die Zeilen in
derselben Reihenfolge sperren — sonst wäre es der Lehrbuch-Deadlock.

Was trotzdem passieren kann: der Verlierer läuft in `lock_timeout` (2 s) und
bricht ab. Das kostet einen Tick und erzeugt eine `ERROR`-Zeile.

> **Eine `lock_timeout`-Meldung des Roll-ups während eines Deploys ist normal.**
> Sie sieht aus wie ein Schemaproblem und ist keins. Kommt sie außerhalb eines
> Deploys, ist sie eins.

---

## Was hier nie die Antwort ist

Eine Zeile in `ops_days` von Hand auf `ok` zu setzen, weil das Raster hässlich
aussieht. `checks_total` und `checks_up` stehen daneben und sind der Beleg für
die Farbe; eine Farbe ohne Beleg ist genau die Zahl, gegen die diese Seite
gebaut ist. Das Schema wehrt sich auch dagegen — `checks_total = 0` und ein
Zustand ungleich `nodata` sind zusammen nicht speicherbar.
