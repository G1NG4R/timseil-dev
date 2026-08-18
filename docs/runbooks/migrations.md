# Runbook — Migrationen

**Leser:** ich, wenn ich in sechs Monaten eine Spalte hinzufügen will, und ich,
wenn um 23 Uhr eine Migration in der Mitte stehen geblieben ist.

Werkzeug ist goose als Bibliothek hinter `api/cmd/migrate`, die SQL-Dateien
liegen in `api/migrations/` und sind ins Binary eingebettet. ADR 0010 (Enums),
ADR 0011 (Rollen).

---

## Der Alltag

```bash
make migrate           # alles Ausstehende anwenden
make migrate-status    # was ist angewandt, was nicht
make migrate-down      # genau einen Schritt zurück
make migrate-reset     # bis auf null zurück
make check-db          # drei Zyklen plus alle Zusicherungen
```

Alle laufen **im Docker-Netz**, nicht auf dem Host. Postgres veröffentlicht
keinen Port; goose von der eigenen Maschine aus erreicht die Datenbank nicht.
Das ist keine Unbequemlichkeit, sondern die Sicherheitsregel aus CLAUDE.md.

Eine neue Migration:

```bash
make migrate-create name=add_track_notes
```

Das `--user` im Ziel ist nicht schmückend: der Container läuft als root und
schreibt in den Bind Mount. Ohne die Zeile gehört die neue Datei root, in
deinem eigenen Arbeitsbaum — derselbe Fund wie bei `web/.next` und `api/tmp`
in A4.

---

## Nach dem B2-Merge einmal: `make dev-reset`

Die Rollen `timseil_migrate` und `timseil_app` entstehen im initdb-Skript, und
**initdb läuft nur beim allerersten Start eines leeren Datenverzeichnisses.**
Auf einem bestehenden `db-data`-Volume passiert nichts.

Das Symptom, wenn man es vergisst:

```
migrate: cannot reach the database as timseil_migrate:
         FATAL: role "timseil_migrate" does not exist
```

Die Meldung zeigt nicht auf ihre Ursache. Deshalb steht sie hier.

```bash
make dev-reset && make dev
```

Dasselbe gilt für **jede** Änderung an `ops/postgres/initdb/`.

---

## Eine Migration schreiben

Die Regeln stehen in `tools/check-migrations.sh` und laufen bei jedem
`make check`. Kurz:

- Name `00007_lower_snake.sql`, lückenlos nummeriert.
- `-- +goose Up` **und** `-- +goose Down`, und der Down tut wirklich etwas.
- Kein `CREATE TYPE … AS ENUM` (ADR 0010), kein `CREATE EXTENSION`, kein
  `CREATE ROLE` (ADR 0011).
- Kein `DROP … CASCADE`, kein `IF EXISTS` im Down. Beide verstecken eine
  falsche Reihenfolge, statt an ihr zu scheitern — und daran zu scheitern ist
  der einzige Zweck eines Down.
- `timestamptz`, nie `timestamp`. `bigint GENERATED ALWAYS AS IDENTITY`, nie
  `serial`.
- **Über jedem `CREATE INDEX` ein Kommentar, der die Query nennt.** Das ist die
  Abnahmebedingung von B2, und sie wird gegrept.
- **Keine Spalte `state` auf `tracks`.** Invariante 2, ADR 0003.
- Keine `DO $$ … $$`-Blöcke: sie erzwingen `StatementBegin/End` und sqlc
  stolpert in C1 darüber.

Danach:

```bash
make check      # der statische Teil
make check-db   # der Zyklus gegen echtes Postgres
```

---

## Die Ableitung: `v_track_states` (seit `00007`)

`tracks` hat keine Spalte `state` — der Zustand wird aus den Belegen gezählt
(Invariante 2, ADR 0003). Die View liefert pro Track `live_systems`,
`building_systems` und `state`. Drei Dinge, die im Alltag zählen:

**Nur `reset` ist verlässlich abwärts.** Die View hängt an `tracks`. Ein
einzelnes `make migrate-down` auf eine mittlere Version kann an
`DROP TABLE tracks` scheitern, solange die View noch steht. `migrate-reset`
(`down-to 0`) rollt in der richtigen Reihenfolge ab und ist der Weg, den auch
`make check-db` geht.

**Wer die `CASE`-Kette anfasst, fasst drei Dinge an.** Die Zustände stehen im
Contract (`TrackState`), in der View und in `skillState()` im read-only
Design-Handoff. `tools/check-migrations.sh` (Regel 7) hält View und Contract
zusammen, der Property-Test in `api/migrations/track_states_db_test.go` hält
View und Handoff zusammen. Ändert sich der Handoff, muss `make gen` die
Wahrheitstabelle `api/migrations/testdata/skill_states.json` neu schreiben —
sonst ist `make check` rot, und zwar bevor jemand die Seite ansieht.

**`permission denied` beim Lesen der View zeigt auf die Basistabellen.** Die
View läuft mit `security_invoker = true`, prüft die Rechte also gegen die
aufrufende Rolle statt gegen ihren Eigentümer. Fehlt `timseil_app` ein `SELECT`
auf `tracks`, `track_evidence` oder `systems`, meldet Postgres genau das — die
Ursache liegt dann in `00001_privileges.sql`, nicht in der View.

---

## Wenn eine Migration mitten drin scheitert

goose fährt jede Datei in **einer Transaktion**. Eine gescheiterte Migration
ist also zurückgerollt, nicht halb angewandt — die Datenbank steht auf der
Version davor, und `make migrate-status` zeigt das auch so.

1. `make migrate-status` — welche Version ist wirklich erreicht?
2. Fehlermeldung lesen. Meist ist es eine Constraint, die auf bestehende Daten
   trifft, oder ein fehlendes Recht.
3. SQL reparieren, `make migrate` erneut. Es gibt nichts aufzuräumen.

**Die eine Ausnahme:** eine Migration mit `-- +goose NO TRANSACTION` (etwa für
`CREATE INDEX CONCURRENTLY`) kann halb angewandt stehen bleiben. Heute gibt es
keine, und wenn eine dazukommt, gehört ein Absatz hierher, der sagt, wie man
sie von Hand zu Ende bringt.

---

## In Produktion: erst erweitern, dann verengen

Ab D2 läuft die Migration als Init-Container vor der API. Zwischen dem
Migrationsschritt und dem Neustart der Anwendung läuft **kurz die alte Version
gegen das neue Schema** — und bei einem Rollback die alte Version dauerhaft.

Deshalb in zwei Deploys statt einem:

1. **Erweitern.** Spalte hinzufügen, nullable oder mit Default. Anwendung
   schreibt und liest beides. Deploy.
2. **Verengen.** Wenn nichts mehr auf die alte Spalte zugreift: `NOT NULL`
   setzen, alte Spalte löschen. Deploy.

Ein Deploy, der eine Spalte anlegt und die alte im selben Zug löscht, macht das
Rollback unmöglich — man kann das Image zurückdrehen, das Schema nicht.

---

## Indizes begründen: das EXPLAIN-Experiment

Ein Index, dessen Nutzen behauptet statt gemessen ist, ist genau die Sorte
Zahl, die diese Seite ablehnt. Auf einer leeren Tabelle sagt `EXPLAIN` aber
nichts. Also: synthetisches Volumen in einer **Wegwerf-Datenbank**.

Zwei Regeln dazu, und sie sind wichtiger als das Rezept:

- **Diese Zeilen verlassen `timseil_test` nie** und werden nie zu einer
  B4-Fixture. Erfundene Betriebsdaten in einer Fixture wären genau die Lüge,
  gegen die das ganze Projekt gebaut ist.
- **Wo der Plan einen Seq Scan zeigt und der richtig ist, wird das notiert,
  nicht behoben.** Ein Index auf einer Tabelle mit 40 Zeilen macht sie nicht
  schneller, nur größer.

Volumen: zwei Systeme, 91 Tage, alle fünf Minuten ein Check — 52 416 Zeilen
`ops_checks`, 182 `ops_days`, 10 002 `metric_snapshots`, 800 `deploys`,
40 `incidents`. Das ist ungefähr ein Betriebsjahr.

Gemessen am 17.08.2026 gegen Postgres 18.6:

| Query | Plan | Zeit |
|---|---|---|
| `ops_days`, 91-Tage-Fenster | Seq Scan + Sort | 0,14 ms |
| `ops_checks`, ein Tag aus 52 416 | **Bitmap Index Scan** auf `ops_checks_unique_observation` | 0,67 ms |
| `metric_snapshots`, jüngster Satz — `DISTINCT ON` | Seq Scan + Sort über alles | **8,73 ms** |
| dieselbe Frage als `LEFT JOIN LATERAL` | **Index Scan Backward** auf `metric_snapshots_unique_instant` | **0,23 ms** |
| `deploys`, letzter Deploy | **Index Scan** auf `deploys_by_system_time_idx` | 0,06 ms |
| `incidents` im Fenster | Seq Scan + Sort | 0,06 ms |
| `systems` nach Slug | Seq Scan | 0,11 ms |

Nachgetragen am 18.08.2026, gleiches Volumen, für den Roll-up aus C4:

| Query | Plan | Zeit |
|---|---|---|
| `ops_checks`, Roll-up-Fenster über `recorded_at` | Seq Scan | 6,0 ms |
| Roll-up gesamt, Alltag (ein Tag im Fenster) | Nested Loop, **Bitmap Index Scan je Tag** | 27 ms |
| Roll-up gesamt, alle 182 Tage auf einmal | derselbe Plan, 182 Schleifen | 386 ms |
| dieselbe Anweisung mit gewöhnlichem Join statt `LATERAL` | **Merge Join, 4,7 Mio. Zeilen per Filter verworfen** | **1,63 s** |

**Der Fund, der etwas ändert — und es ist derselbe wie bei `metric_snapshots`:**
Als gewöhnlicher Join formuliert verbindet der Planer die berührten Tage mit
`ops_checks` über `system_id` allein und wirft den Datumsbereich anschließend per
Join-Filter weg. Bei 182 Tagen sind das 4,7 Millionen verworfene Zeilen und
1,63 s. Als `CROSS JOIN LATERAL` macht die Abfrage einen Indexzugriff pro
berührtem Tag — 386 ms im selben Extremfall, 27 ms im Alltag.

**C4 nimmt diese Form.** Der Index bleibt, wie er ist; es war wieder nicht der
Index, es war die Frage.

Der Seq Scan über `recorded_at` bleibt und wird nicht indiziert: 6 ms alle fünf
Minuten auf einer Tabelle, die alle fünf Minuten eine Zeile bekommt, sind kein
Index wert. Die Zeile steht im Backlog, weil derselbe Index später den
Aufbewahrungs-Job bedienen würde — beim ersten von beiden wird nachgemessen.

**Der Fund, der etwas ändert:** `DISTINCT ON (system_id) … ORDER BY system_id,
measured_at DESC` benutzt den Unique-Index **nicht**. Postgres liest die ganze
Tabelle und sortiert. Bei 10 002 Zeilen sind das 8,7 ms, und die Zahl wächst
linear — `metric_snapshots` bekommt alle fünf Minuten eine Zeile, für immer.

Dieselbe Frage als Lateral-Join liegt bei 0,23 ms und bleibt dort, weil sie pro
System einen Indexzugriff macht statt einer Sortierung über alles:

```sql
SELECT s.id, m.uptime_90d, m.p95_ms, m.error_rate, m.measured_at
  FROM systems s
  LEFT JOIN LATERAL (
      SELECT uptime_90d, p95_ms, error_rate, measured_at
        FROM metric_snapshots WHERE system_id = s.id
       ORDER BY measured_at DESC LIMIT 1) m ON true;
```

**C2 nimmt diese Form.** Der Index bleibt, wie er ist — es war nie der Index,
es war die Frage.

Die drei Seq Scans in der Tabelle sind korrekt und bleiben: 182, 40 und 2
Zeilen sind für einen Indexzugriff zu wenig. Die zugehörigen Indizes existieren
trotzdem, weil sie aus Eindeutigkeit folgen, und die Kommentare in den
Migrationen sagen das auch so.

Nachgetragen am 18.08.2026 für die zwei Indizes aus C6
(`00009_contact_delivery.sql`). Anderes Volumen, weil `contact_messages` anders
wächst: 20 000 Nachrichten über 97 Absenderadressen, davon 12 noch `queued` —
also ein Postfach, in das jemand über Monate hinweg geschrieben hat, und ein
Relay, das bis auf einen kleinen Rückstand alles genommen hat.

| Query | Plan | Zeit | Puffer |
|---|---|---|---|
| Rate-Limit-Boden über `ip_hash` | **Bitmap Index Scan** auf `contact_messages_ip_window_idx` | **1,17 ms** | 415 |
| dieselbe Frage ohne den Index | Seq Scan, 19 793 Zeilen per Filter verworfen | **6,48 ms** | 2 000 |
| Dispatcher-Warteschlange, nach `VACUUM` | **Index Scan** auf `contact_messages_queued_idx` | **0,08 ms** | 4 |
| dieselbe Frage ohne den Index | Seq Scan + Sort | 5,04 ms | 2 000 |
| Idempotenz-Nachschlag (Index aus B2) | **Index Scan** auf `contact_messages_idempotency_idx` | 0,07 ms | 2 |

Größen: `ip_window` 312 kB, `queued` 144 kB — zusammen ein Zwanzigstel des
Idempotenz-Index, den B2 schon hat.

**Warum hier indiziert und bei `ops_checks.recorded_at` nicht.** Die C4-Regel
oben — 6 ms alle fünf Minuten sind keinen Index wert — gilt für eine Abfrage,
deren Tabelle mit *unseren* Messungen wächst und die niemand von außen auslösen
kann. Der Rate-Limit-Boden ist das Gegenteil: er läuft im Anfrageweg des
einzigen Schreibendpoints, und wie viele Zeilen er liest, entscheidet, wer
gerade Formulare abschickt. Ein Seq Scan, den ein Angreifer verlängern kann,
ist eine andere Sache als einer, der mit dem Kalender wächst.

**Der Fund, der etwas ändert — und er betrifft den Betrieb, nicht das Schema:**
Derselbe Warteschlangen-Plan misst **2,88 ms und 1 033 Puffer**, wenn kurz
zuvor viele Zeilen von `queued` auf `sent` gewechselt sind, und **0,08 ms und
4 Puffer** nach einem `VACUUM`. Der partielle Index hält die Einträge
ausgelieferter Nachrichten als tote Verweise, bis Autovacuum sie einsammelt —
er ist also genau in dem Moment am langsamsten, in dem der Dispatcher gerade
gearbeitet hat. Bei zwölf Zeilen ist der Unterschied belanglos; er steht hier,
weil er beim ersten echten Rückstau nicht wie ein Fehler im Dispatcher aussehen
soll. Autovacuum erledigt das ohne Zutun, `VACUUM contact_messages` erzwingt es.

Nachstellen:

```bash
make dev-reset && make dev            # timseil_test entsteht mit
docker compose -f compose.dev.yaml run --rm \
  -e MIGRATE_DATABASE_URL="$TEST_DATABASE_URL" migrate up
docker compose -f compose.dev.yaml exec db \
  psql -U timseil_boot -d timseil_test -f /tmp/explain.sql
```

---

## Die zwei Rollen

| Rolle | Darf | DSN |
|---|---|---|
| `timseil_migrate` | DDL, besitzt Schema und Datenbank | `MIGRATE_DATABASE_URL` |
| `timseil_app` | `SELECT`/`INSERT`/`UPDATE`/`DELETE`, sonst nichts | `DATABASE_URL` |
| `timseil_boot` | Superuser, nur initdb und `psql` | `POSTGRES_USER` |

`timseil_app` bekommt seine Rechte über `ALTER DEFAULT PRIVILEGES` in
`00001_privileges.sql`, also automatisch auch für jede künftige Tabelle. Ein
`GRANT` von Hand am Ende einer Migration ist nicht nötig und wäre die Stelle,
die man vergisst.

Nachsehen:

```bash
docker compose -f compose.dev.yaml exec db psql -U timseil_boot -d timseil -c '\du'
docker compose -f compose.dev.yaml exec db psql -U timseil_boot -d timseil -c '\dp systems'
```

`make check-db` beweist die Trennung, statt sie zu behaupten:
`TestAppRoleCannotTouchTheSchema` lässt die App-Rolle `CREATE TABLE`,
`DROP TABLE`, `ALTER TABLE`, `CREATE INDEX` und `TRUNCATE` versuchen und
verlangt, dass alle fünf an fehlenden Rechten scheitern.

---

## Aufbewahrung

Noch nichts automatisiert. Was ansteht:

- `contact_messages` — personenbezogen, Frist gehört nach L7 entschieden und
  dann als nächtlicher Job gebaut. `received_at` ist da, der Index dafür kommt
  mit dem Job.
- `ops_checks` — wächst um ~105 000 Zeilen pro System und Jahr. Kein Problem
  auf Jahre, aber es gehört gemessen, bevor es eins wird.
- `metric_snapshots` — dieselbe Größenordnung, siehe oben.
