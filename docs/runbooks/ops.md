# Runbook — Der Ops-Roll-up

**Leser:** ich, wenn das Betriebsraster nicht mehr weiterläuft, und ich, wenn
eine Kerbe am falschen Tag hängt.

Der Roll-up ist die eine Anweisung in `api/internal/store/queries/ops.sql`,
angetrieben von der Schleife in `api/internal/ops`, gestartet und gestoppt in
`api/cmd/api/main.go`. ADR 0019 (diese Entscheidung), ADR 0017 (Fenster und
Rasterlücken auf dem Lesepfad), ADR 0013 (der Seed misst nicht),
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

**Am Tag 1 steht dort `days: 0`, und das ist richtig.** Es gibt noch keine Sonde
(C7) und kein Ausfallprotokoll (F4), also gibt es nichts zu aggregieren, also ist
das ganze Raster `nodata`. Ein volles Raster wäre an dieser Stelle die Lüge.

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
| `zuletzt_abgeleitet` frisch, `gemessene_tage = 0` | Die Schleife läuft, es gibt keine Rohdaten. Normal bis C7/F4. |
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
| `probeInterval` | 5 min | **der Kadenz der F4-Sonde** |
| `outageChecks` | 2 | nichts — die Regel dieser Seite |
| `aggregateEvery` | 5 min | `probeInterval` |
| `lookback` | 24 h | wie lange die Schleife stehen darf, ohne dass etwas verloren geht |

**Die eine Zeile, die hier wirklich wichtig ist:** `probeInterval` und der
Cron-Ausdruck des F4-Workflows sind zwei Hälften derselben Zahl. `down_sec` ist
fehlgeschlagene Checks **mal diesem Intervall** — läuft die Sonde alle zehn
Minuten, während hier fünf steht, ist jede Ausfalldauer auf der Seite halb so
groß wie die echte. Nichts prüft das heute. Wer eines von beiden anfasst, fasst
beide an; F4 soll eine Prüfung dafür mitbringen (Backlog).

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
