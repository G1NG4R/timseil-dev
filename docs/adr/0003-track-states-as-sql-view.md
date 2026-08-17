# ADR 0003 — Skill-Zustände werden abgeleitet, nicht gespeichert

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** B2, B3, C3, H4, G6
**Invarianten:** **2** (die Ableitung lebt in SQL), 3 (Metriken nur für `live`),
5 (FK ON DELETE RESTRICT)

## Kontext

Die Seite behauptet auf der Homepage, welche Fähigkeiten belegt sind: `core`,
`applied`, `learning`, `queued`. Das ist die zentrale Aussage über die Person —
und damit die Aussage, die am leichtesten zu schönen wäre.

Ein Feld `tracks.state`, das man setzt, wäre eine Behauptung. Ein Zustand, der
sich aus den Belegen ergibt, ist eine Messung. Die eine Regel des Projekts lässt
hier keine Wahl: **jede Behauptung ist an einen Beleg gebunden, und der Beleg
ist ein laufendes System.**

## Entscheidung

**Die Zustände leben als View `v_track_states` in der Datenbank. Es gibt keine
Spalte `tracks.state`.**

```sql
CASE WHEN COUNT(DISTINCT s.id) FILTER (WHERE s.state='live')     >= 2 THEN 'core'
     WHEN COUNT(DISTINCT s.id) FILTER (WHERE s.state='live')      = 1 THEN 'applied'
     WHEN COUNT(DISTINCT s.id) FILTER (WHERE s.state='in_build')  > 0 THEN 'learning'
     ELSE 'queued' END
```

Die Ableitung steht **genau einmal**, in SQL. Weder Go noch TypeScript rechnet
sie nach. `docs/design/code/tokens.ts` bringt eine `skillState()` mit — sie ist
Referenz für die Darstellung, nicht zweite Wahrheit, und wird in B3
property-based gegen die View geprüft (1000 generierte Belegkonstellationen).

## Konsequenzen

- **Die Form, wie sie in B3 gebaut wurde** (`api/migrations/00007_track_states.sql`):
  `v_track_states(track_id, live_systems, building_systems, state)`. Die zwei
  Zähler sind Teil der View, nicht Nebenprodukt — damit prüft der Test die
  Zählung getrennt von der `CASE`-Kette, und C3 kann „1 live system" anzeigen,
  ohne dieselbe Rechnung ein zweites Mal zu schreiben. Zweimal `LEFT JOIN`: mit
  einem inneren Join wäre ein Track ohne Beleg nicht `queued`, sondern
  **abwesend**. Und `WITH (security_invoker = true)`, sonst läse `timseil_app`
  die Basistabellen mit den Rechten des Eigentümers `timseil_migrate` — eine Tür
  an ADR 0011 vorbei.
- Ein System auf `live` zu setzen lässt Tracks von `learning` nach `applied`
  springen, ohne dass jemand eine Zeile pflegt. Der Test dazu ist das
  Abnahmekriterium von C3.
- Zum Launch existieren zwei Systeme, davon eins `live`. Damit gibt es
  **13× `applied`, 9× `learning`, 0× `core`** — und `core` ist nicht erreichbar,
  bis ein zweites System wirklich läuft. Das ist der Punkt, nicht ein Mangel.
- Belege dürfen nicht ins Leere zeigen: `track_evidence` → `systems` mit
  `ON DELETE RESTRICT`. Ein gelöschtes System, das einen Zustand stehen lässt,
  wäre exakt die Lüge, die diese Konstruktion verhindert.
- Die Migration darf die Spalte nicht „vorübergehend" anlegen. Wer sie anlegt,
  hat den Entwurf missverstanden — so steht es in `CLAUDE.md`, und so ist es
  gemeint.

### Was das kostet

Die View wird bei jedem Aufruf berechnet. Bei 22 Tracks und zwei Systemen ist
das messtechnisch nicht vorhanden; bei drei Größenordnungen mehr müsste man über
eine materialisierte View reden — dann aber mit einem benannten
Auffrischungszeitpunkt, nicht mit einer schreibbaren Spalte.

Zweitens: die Logik liegt in SQL und ist damit nicht mit `go test` allein
prüfbar. Deshalb der Property-Test gegen echtes Postgres 18.6 in Actions, nicht
gegen ein Mock.

## Verworfene Alternativen

**Spalte `tracks.state`, gepflegt per Trigger** — verlegt dieselbe Ableitung an
einen Ort, an dem sie unbemerkt driftet, sobald jemand die Spalte direkt
schreibt. Ein Trigger ist eine View mit Nebenwirkungen.

**Ableitung in Go** — würde bedeuten, dass eine `curl`-Antwort und ein
`SELECT` auseinanderlaufen können. Da die API öffentlich lesbar ist (ADR 0004),
wäre genau das öffentlich sichtbar.

**Ableitung im Frontend aus `tokens.ts`** — verlagert die Wahrheit in den
Browser. Die Seite würde behaupten, was der Client rechnet.

## Belege

Build-Plan Invariante 2, Kapitel 1, Phase B2, Phase B3, Phase B4 (die Zahlen),
Phase C3, `docs/design/code/tokens.ts` (`skillState`).
