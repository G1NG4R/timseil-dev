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
  **13× `applied`, 9× `queued`, 0× `core`** — und `core` ist nicht erreichbar,
  bis ein zweites System wirklich läuft. Das ist der Punkt, nicht ein Mangel.
  Zur zweiten Zahl siehe den Abschnitt unten; sie hieß hier bis B4 `learning`.
- Belege dürfen nicht ins Leere zeigen: `track_evidence` → `systems` mit
  `ON DELETE RESTRICT`. Ein gelöschtes System, das einen Zustand stehen lässt,
  wäre exakt die Lüge, die diese Konstruktion verhindert.
- Die Migration darf die Spalte nicht „vorübergehend" anlegen. Wer sie anlegt,
  hat den Entwurf missverstanden — so steht es in `CLAUDE.md`, und so ist es
  gemeint.

## Nachtrag B4 — warum ein Track ohne Beleg `queued` ist und nicht `learning`

Beim Befüllen in B4 ist ein Widerspruch aufgefallen, der bis dahin in vier
Dokumenten stand: Handbuch Kapitel 11, Build-Plan B4, `docs/design/README.md`
und das Homepage-Blatt sagen alle **9× `LEARNING`** für die Tracks ohne System.
Die `CASE`-Kette oben liefert dort `queued`, und `skillState(0, 0)` im
read-only Handoff liefert `QUEUED` genauso.

Es ist kein Zahlendreher, sondern arithmetisch unmöglich: `learning` setzt ein
System im Zustand `in_build` voraus. Zum Launch gibt es zwei Systeme,
`vat-check` ist `queued` und `timseil-dev` ist `live` — **kein einziges
`in_build`**. `learning` ist am Launch-Tag nicht erreichbar, egal wie die Belege
liegen.

**Die Ableitung gewinnt, die vier Dokumente werden korrigiert.** Der Grund ist
nicht, dass B3 schon gemergt ist, sondern dass `queued` an dieser Stelle die
belegbare Aussage ist: „ich lerne das gerade" mit nichts, worauf man zeigen
kann, ist Selbsteinschätzung — und Invariante 2 existiert, um Selbsteinschätzung
aus dem Log zu halten. `queued` heißt „geplant, nichts zu zeigen", und genau das
ist wahr. Die Blätter sind hier die weichere, ältere Fassung.

Damit ist `learning` zum Launch ein leerer Zustand. Das ist in Ordnung und sogar
aussagekräftig: er füllt sich, sobald ein System wirklich im Bau ist, und ein
Zustand, der erst durch ein System entsteht, ist die ganze These der Seite.

Die Gegenrichtung wurde erwogen und verworfen: die View so zu ändern, dass „kein
Beleg" auf `learning` fällt und `queued` nur noch für Belege auf `queued`-Systeme
gilt. Das hätte das Blatt wörtlich getroffen, aber `skillState()` hat nur zwei
Eingaben und kann diesen Fall nicht ausdrücken. Der Parität-Test aus B3 wäre
gebrochen, und mit ihm der einzige Wächter, der View und Handoff zusammenhält —
ein Dokument zu treffen, indem man den Drift-Wächter abschaltet, ist der falsche
Handel.

Belegt durch `TestSeedIsTheAcceptanceCriterion` in
`api/migrations/seed_db_test.go`: 13 `applied`, 9 `queued`, kein `core`, kein
`learning`, ein belegendes System.

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
