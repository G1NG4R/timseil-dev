# ADR 0013 — Der Seed trägt Inhalt, keine Messungen, und läuft als `timseil_app`

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** B4, C2, C4, C7, D2, F4
**Invarianten:** **1** (keine erfundenen Zahlen), **3** (Metriken nur für `live`),
**6** (ein Tag ohne Messung ist `nodata`)

## Kontext

Die Datenbank muss zum Launch etwas enthalten: zwei Systeme, fünf Module, 22
Tracks, 13 Belege. Ohne das liefert `/api/systems` nichts und die Ableitung hat
nichts zu zählen.

Damit stehen zwei Fragen im Raum, und beide sind schnell falsch beantwortet.

**Erstens: wie viel gehört in den Seed?** Ein `live`-System mit leerem
Betriebsraster sieht nach einem Fehler aus. Die Versuchung, 91 grüne Zellen und
eine Verfügbarkeit von 99,9 % mitzuliefern, ist genau deshalb groß — es würde
„fertig" aussehen. `docs/runbooks/migrations.md` hat die Regel für die
EXPLAIN-Zeilen schon vorweggenommen: sie „werden nie zu einer B4-Fixture".

**Zweitens: mit welcher Rolle?** `timseil_migrate` läge nahe, weil der Seed
neben den Migrationen läuft und die Rolle schon eine DSN hat.

## Entscheidung

**Der Seed schreibt ausschließlich kuratierten Inhalt — `systems`, `modules`,
`tracks`, `track_evidence` — und läuft als `timseil_app` in einer Transaktion.**

Keine Zeile in `ops_checks`, `ops_days`, `incidents`, `deploys`,
`metric_snapshots`. Die kommen aus der Sonde (C7) und dem Ausfallprotokoll (F4).

## Konsequenzen

- **timseil.dev ist ab dem ersten Lauf `live` und zeigt trotzdem in jeder Kachel
  `— NO DATA`.** Das ist kein Übergangszustand, den man wegkonfiguriert, sondern
  die richtige Anzeige: am Tag 1 ist nichts gemessen worden. Nach drei Monaten
  sieht ein Wiederkehrer den Unterschied — und dass er ihn sieht, ist der Punkt.
- **Der Seed braucht kein DDL, und das wird bewiesen statt behauptet.**
  `TestSeedNeedsNoSchemaPrivileges` fährt den ganzen Seed als `timseil_app` und
  sieht danach `CREATE TABLE` scheitern. Nebeneffekt: die Rolle mit
  DDL-Rechten bleibt auf `cmd/migrate` beschränkt, was ADR 0011 wörtlich nimmt.
- **Zwei Aktualisierungsstrategien, und der Unterschied ist beabsichtigt.**
  `systems` wird upsertet, weil `ops_checks`, `ops_days`, `incidents`, `deploys`
  und `metric_snapshots` mit `ON DELETE RESTRICT` auf ihre `id` zeigen — ein
  Ersetzen würde entweder scheitern oder den Betriebsverlauf wegwerfen. Der
  Trainingsbaum wird **komplett ersetzt**, weil nichts von außen auf seine ids
  zeigt; damit steht sein Inhalt genau einmal in der Datei, statt einmal als
  Upsert-Liste und einmal als „was nicht mehr deklariert ist"-Liste, die am Tag
  auseinanderlaufen, an dem jemand nur eine Hälfte anfasst.
- **Der Seed ist autoritativ für den Trainingsbaum, nicht für Systeme.** Ein
  System, das niemand deklariert, bleibt liegen — und würde mit leerem
  `stack`-Array rendern, was wie eine Entscheidung aussieht statt wie das
  Versehen, das es ist. Deshalb bricht der Seed in diesem Fall ab und nennt den
  Slug. Aufräumen ist Handarbeit, weil ein automatisches `DELETE FROM systems`
  Betriebsdaten mitnehmen könnte.
- **Die Zahlen 2 / 5 / 22 / 13 stehen als `seed.Expected` im Code und werden vor
  dem COMMIT geprüft.** Die Belege werden über einen JOIN auf Tracknamen
  eingefügt: wird ein Track auf nur einer Seite umbenannt, fällt eine Belegzeile
  **lautlos** weg, und der betroffene Track springt auf der Live-Seite von
  `APPLIED` auf `QUEUED`. Genau die Sorte stiller Falschaussage, gegen die die
  Seite gebaut ist — also wird gezählt und zurückgerollt.
- **Fixtures sind die andere Hälfte.** `api/internal/fixtures` erfindet
  Betriebsdaten, weil Tests sie brauchen, und ist deshalb aus keinem Kommando
  erreichbar. `go list -deps` hält das fest, nicht ein Kommentar.
- **D2 braucht einen Seed-Schritt nach der Migration.** Lokal steckt er in der
  Startkette (`db → migrate → seed → api`), damit `make dev` aus dem leeren
  Zustand eine benutzbare Seite liefert.

### Was das kostet

**Die Seite sieht am Launch-Tag schwächer aus, als sie ist.** Ein Besucher, der
dreißig Sekunden bleibt, sieht eine dunkle Seite mit vielen `— NO DATA`. Das ist
die Wette des Projekts, hier konkret bezahlt: Überprüfbarkeit vor Wirkung.

**Ein zweites Kommando und ein zweiter Compose-Service.** `cmd/seed` neben
`cmd/migrate`, mit eigener DSN und eigener Startbedingung. Ein Seed als
Migration `00008` wäre ein Schritt weniger gewesen — aber dann wären Inhalt und
Schema dieselbe Versionsleiter, `tools/check-migrations.sh` würde Datenzeilen an
Migrationsregeln messen, und ein korrigierter Belegtext wäre eine neue Migration
statt einer geänderten Zeile.

**Die Zahlen stehen an zwei Stellen** — in `seed.sql` als Zeilen und in
`seed.Expected` als Summe. Ein 23. Track heißt: beide anfassen. Das ist die
Reibung, die der Wächter wert ist.

## Verworfene Alternativen

**Seed als goose-Migration `00008`** — macht Inhalt und Schema zu derselben
Versionsleiter. Ein Tippfehler in einem Belegtext bräuchte eine neue Migration,
und `api/migrations/embed.go` würde die Datei ohnehin als Migration einlesen.

**Als `timseil_migrate` laufen** — hätte funktioniert und die Frage „braucht der
Seed DDL?" unbeantwortet gelassen. Sie mit `nein` zu beantworten kostet nichts
und schließt eine Tür.

**Ein `live`-System mit gefülltem Raster ausliefern** — Invariante 1 und 6 in
einem Zug gebrochen, und zwar an der Stelle, die die Seite als Beleg vorzeigt.

**Fixtures und Seed in einem Paket** — dann entscheidet ein Funktionsargument
darüber, ob erfundene Ausfälle in die Produktionsdatenbank geschrieben werden.
Getrennte Pakete machen daraus eine Import-Grenze, die ein Test bewachen kann.

## Belege

Build-Plan Phase B4, Handbuch Kapitel 10, 12 und 13, Invarianten 1, 3 und 6,
ADR 0003 (die Ableitung), ADR 0011 (die zwei Rollen), ADR 0012 (das Manifest),
`docs/runbooks/seed.md`, `docs/runbooks/migrations.md` (Abschnitt
„Indizes begründen").
