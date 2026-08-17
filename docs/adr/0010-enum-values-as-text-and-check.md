# ADR 0010 — Zustandswerte als `text` mit `CHECK`, nicht als Postgres-Enum

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** B2, B3, B4, C1–C4, C6, E1
**Invarianten:** 1 (nullable Metriken), 6 (`nodata`), mittelbar 2

## Kontext

Sechs Achsen im Schema tragen eine geschlossene Werteliste: `systems.state`
(`live` · `in_build` · `queued`), `systems.source_access`, `systems.source_reason`
(`nda` · `internal`), `ops_days.state` (`ok` · `degraded` · `outage` · `nodata`),
`deploys.result` (`ok` · `rollback`) und `contact_messages.delivery_status`.

Alle sechs stehen bereits an einer anderen Stelle: in `contract/openapi.yaml`,
als `enum` in den Schemata `SystemState`, `SourceReason`, `DayState` und
`DeployResult`. Der Contract ist die einzige Wahrheit über die Schnittstelle
(ADR 0009), und aus ihm werden die Typen für beide Seiten erzeugt.

Postgres bietet für so etwas `CREATE TYPE … AS ENUM`. Das ist die
lehrbuchmäßige Antwort und hier die falsche.

## Entscheidung

**Die Werte leben als `text` mit einem benannten `CHECK`-Constraint.**

```sql
state text NOT NULL
      CONSTRAINT systems_state_ck CHECK (state IN ('live', 'in_build', 'queued')),
```

Dass die Liste damit zweimal existiert — im Contract und in der Migration —
ist der Preis. Er wird in `tools/check-migrations.sh` bezahlt: die Prüfung
liest die `enum:`-Listen aus dem Contract, die `IN (…)`-Listen aus den
Migrationen, und vergleicht sie bei jedem `make check`. Drift bricht den Build.

## Begründung

**Ein Enum-Typ erzeugt einen zweiten Go-Typ für dieselben Werte.** sqlc bildet
`system_state` auf einen eigenen Typ ab, oapi-codegen erzeugt aus dem Contract
bereits `SystemState`. Zwei Typen für eine Menge sind zwei Wahrheiten, und
CLAUDE.md verbietet genau das („nie einen Typ von Hand schreiben, der im
Contract steht"). Ein generierter Zweittyp ist schlimmer als ein
handgeschriebener, weil er sich richtig anfühlt.

**`DROP TYPE` scheitert an abhängigen Spalten.** Das Abnahmekriterium von B2
lautet „`up → down → up` läuft dreimal sauber". Enum-Typen sind die Klasse von
Objekten, an der ein zweiter Zyklus hängenbleibt: die Reihenfolge im Down muss
stimmen, und wenn sie es nicht tut, merkt man es erst beim dritten Lauf. Mit
`text` + `CHECK` verschwindet die Constraint mit der Tabelle, und die Klasse
existiert nicht mehr.

**Ein Enum-Wert lässt sich nicht zurücknehmen.** `ALTER TYPE … ADD VALUE` gibt
es, das Gegenstück nicht. Eine `CHECK`-Liste ist eine Zeile in der nächsten
Migration, in beide Richtungen.

## Konsequenzen

- Die Werte stehen an zwei Orten. Ohne den Wächter wäre das ein Rückschritt
  gegenüber einem Enum-Typ — mit ihm ist es strenger, weil ein Enum-Typ gegen
  den Contract gar nicht erst geprüft würde.
- `make check-db` beweist zusätzlich, dass jede Liste wirklich greift: jeder
  Test füttert die Spalte mit einem Wert, den sie ablehnen muss.
- sqlc liefert in C1 `string`, nicht einen eigenen Typ. Der Übergang zum
  generierten Contract-Typ passiert im Store-Paket und ist eine Zuweisung.
- Der Wächter vergleicht nur, was vorhanden ist. Dass eine Constraint
  überhaupt existiert, prüft `make check-db` — statisch wäre es raten.

## Verworfene Alternativen

**`CREATE TYPE … AS ENUM`** — sauber im Katalog, teuer im Down und Erzeuger
eines zweiten Go-Typs. Siehe oben.

**`CREATE DOMAIN` über `text`** — behält die Textrepräsentation und
zentralisiert die Liste. Scheitert an sqlc, dessen Domain-Abbildung
unzuverlässig ist; ein `interface{}` in C2 wäre teurer als drei wiederholte
`IN`-Listen.

**Referenztabellen mit Fremdschlüssel** — die normalisierte Antwort. Fügt sechs
Tabellen und sechs Joins für Werte hinzu, die sich pro Jahr null Mal ändern,
und verlegt die Liste an einen Ort, den der Contract-Vergleich nicht mehr
lesen kann.

**Gar keine Prüfung, nur der Contract** — die Datenbank würde `state = 'planned'`
annehmen (der Wert, den `docs/design/code/tokens.ts` fälschlich führt, siehe
Backlog). Eine Invariante, die nur der Handler kennt, ist eine Absprache.

## Belege

Build-Plan Phase B2 · `contract/openapi.yaml` (`SystemState`, `TrackState`,
`DayState`, `DeployResult`, `SourceReason`) · `tools/check-migrations.sh`
Regel 6 · `api/migrations/00002_systems.sql`, `00004_operations.sql`,
`00006_contact.sql` · ADR 0009.
