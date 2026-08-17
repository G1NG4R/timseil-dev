# ADR 0011 — Rollen aus initdb, Rechte aus der Migration

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** B2, B3, B4, C1, D2, E1, L3
**Invarianten:** mittelbar alle — sie stehen in einem Schema, das die
Anwendungsrolle nicht ändern darf

## Kontext

Das Handbuch (Kapitel 10, „Zwei Datenbankrollen statt einer") verlangt zwei
Rollen statt einer: `timseil_migrate` besitzt das Schema und darf DDL,
`timseil_app` darf nur DML. Der Grund ist konkret: eine SQL-Injection in der
API kann dann kein Schema löschen.

Daraus folgt ein Henne-Ei-Problem. goose soll als `timseil_migrate` laufen —
aber die Rolle, unter der man sich anmeldet, kann man nicht in der Migration
anlegen, die man unter ihr ausführt.

Der naheliegende Ausweg wäre, die Rollen in der ersten Migration anzulegen und
goose vorübergehend als Superuser zu starten. Der Ausweg ist eine Falle.

## Entscheidung

**Rollen und Rechte werden getrennt, weil sie unterschiedlich lange leben.**

| Was | Wo | Warum dort |
|---|---|---|
| `CREATE ROLE`, Eigentum an Datenbank und Schema, `CONNECT` | `ops/postgres/initdb/10-roles.sh` | Rollen sind **clusterweit**, nicht schemaweit |
| `REVOKE … FROM PUBLIC`, `GRANT USAGE`, `ALTER DEFAULT PRIVILEGES` | Migration `00001_privileges.sql` | Rechte gehören zum **Lebenszyklus des Schemas** |

Das Bootstrap-Skript ist eine Shell-Datei, keine `.sql`: nur Shell-Dateien in
`/docker-entrypoint-initdb.d/` sehen die Umgebung des Containers. Die Passwörter
kommen damit aus `.env` und stehen in keiner Datei dieses Repositories.

Die Migration setzt `ALTER DEFAULT PRIVILEGES` **ohne** `FOR ROLE`. Ohne die
Klausel gilt die Voreinstellung für die ausführende Rolle — also genau für
`timseil_migrate`, die anschließend jede Tabelle anlegt. Kein Superuser nötig,
und jede künftige Tabelle ist automatisch erfasst.

## Begründung

**`DROP ROLE` scheitert, solange ein Grant existiert.** Läge `CREATE ROLE` in
einer Migration, müsste das Down sie wieder löschen — und das ginge fehl,
sobald irgendein Objekt ihr gehört. Der zweite `up → down → up`-Zyklus wäre rot,
und das Abnahmekriterium der Phase ist, dass er es dreimal nicht ist.

**Voreinstellungen hängen am erzeugenden Rollennamen.** Liefe `up` einmal als
Superuser und einmal als `timseil_migrate`, bekäme `timseil_app` beim zweiten
Mal nichts, und der Fehler zeigte sich erst in Stufe C als
„permission denied for table systems" — weit weg von seiner Ursache.
`make check-db` prüft deshalb nicht „Tabelle da", sondern „App-Rolle darf
`SELECT`".

**`ALTER DEFAULT PRIVILEGES` in `00001` ist der Grund für die Nummer.**
Voreinstellungen wirken ausschließlich auf Objekte, die **danach** entstehen.
Die Reihenfolge ist keine Ordnungsliebe, sondern Bedingung.

## Konsequenzen

- **initdb läuft nur beim allerersten Start.** Auf einem bestehenden
  `db-data`-Volume passiert nichts, und `make migrate` scheitert dann mit
  „role does not exist" — einer Meldung, die nicht auf ihre Ursache zeigt.
  Nach dieser Phase und nach jeder Rollenänderung: `make dev-reset`.
  Steht im README, im Runbook und im PR-Text.
- `DATABASE_URL` zeigt auf `timseil_app`, `MIGRATE_DATABASE_URL` auf
  `timseil_migrate`. Der `api`-Dienst bekommt nur die erste; die zweite trägt
  ausschließlich der `migrate`-Dienst. Bekäme der langlebige API-Prozess beide,
  wäre die Trennung Zierat.
- **D2 und E1 müssen das Skript ebenfalls anwenden.** Es ist idempotent
  (`IF NOT EXISTS`), damit es außerhalb der Entrypoint-Konventionen laufen kann.
- Der Migrationslauf braucht ein Netz zur Datenbank. Postgres veröffentlicht
  keinen Port, also läuft goose in einem Container im selben Docker-Netz —
  vom Host aus ginge es gar nicht.
- Das Skript legt zusätzlich `timseil_test` an, damit `make check-db` beim
  Zykeln nicht die Entwicklungsdaten wegräumt.

## Verworfene Alternativen

**Alles in der Migration, goose als Superuser** — bricht den zweiten
Down-Zyklus an `DROP ROLE` und macht den Superuser zur Laufzeitabhängigkeit.
Die Sicherheitsregel sagt „kein Superuser zur Laufzeit"; eine Migration ist
Laufzeit genug.

**Alles im initdb-Skript, auch die Rechte** — dann fehlen jeder künftigen
Tabelle die Grants, weil `ALTER DEFAULT PRIVILEGES` von damals nichts über
Migrationen von morgen weiß. Man merkt es beim ersten neuen Endpoint.

**Eine Rolle, wie bisher** — bequem und genau das, was das Handbuch als
Modellierungsfehler benennt. Ohne Trennung ist eine SQL-Injection in einem
Lese-Endpoint ein `DROP TABLE`.

**Rollen per Dokploy-Konsole von Hand** — nicht versioniert, nicht
reproduzierbar, und in E1 nicht wiederholbar.

## Belege

Handbuch Kapitel 10 („Zwei Datenbankrollen statt einer") · Build-Plan Phase B2
und Sicherheitsregeln · `ops/postgres/initdb/10-roles.sh` ·
`api/migrations/00001_privileges.sql` · `api/migrations/invariants_db_test.go`
(`TestAppRoleCannotTouchTheSchema`) · `docs/runbooks/migrations.md`.
