# ADR 0018 — Der Training-Endpoint: Abfrageschnitt, Kopfzeilen-Zählung und die Zahl, die im Plan falsch steht

**Status:** Angenommen
**Datum:** 2026-08-18
**Betrifft:** C3, C4, C7, H4, G6
**Invarianten:** 1 (`null` → `— NO DATA`), 2 (Skill-Zustände werden abgeleitet)

## Kontext

C3 baut `GET /api/training` — den einen Endpoint, an dem Invariante 2 nach außen
sichtbar wird. Der Contract beschreibt ihn seit B1 vollständig, das Schema steht
seit B2, die Ableitung `v_track_states` seit B3, die Inhalte seit B4. Anders als
bei C2 hat der Contract hier keine Lücke: `getTraining` nimmt keinen Parameter,
den man falsch stellen kann, und deklariert genau 200, 304, 429, 500. **Der
Contract wird in dieser Phase nicht angefasst.**

Offen waren vier Fragen, die in keinem der Dokumente stehen — und eine Zahl, die
in zweien von ihnen falsch steht.

## Entscheidung

### 1. Drei Abfragen, kein Join über den Baum

Die naheliegende Fassung wäre
`tracks LEFT JOIN track_evidence LEFT JOIN systems` mit Gruppierung in Go. Sie
läuft in die Falle aus ADR 0016, und zwar an der schlimmstmöglichen Stelle: **neun
der 22 Tracks haben überhaupt keinen Beleg.** Für sie kommen `systems.slug` und
`systems.system_no` als `NULL` zurück — beide sind in ihrer Tabelle `NOT NULL`,
sqlc erzeugt also `string`, und der Scan scheitert an genau den Zeilen, für die
dieser Endpoint existiert.

Also `ListModules`, `ListTracksWithState`, `ListTrackEvidence` — jede Spalte
behält die Nullability ihrer eigenen Tabelle, und der Handler fügt die drei
Antworten über die Track-ID zusammen. Die ID verlässt den Prozess nie: der
Contract kennt kein Feld dafür.

`ListModules` bleibt eigenständig, obwohl `module_no` und `title` auch aus dem
Track-Join fielen. Ein Modul ohne Tracks verschwände sonst aus der Antwort, und
„das Modul ist leer" ist eine andere Aussage als „das Modul gibt es nicht".

Auf `v_track_states` steht ein `JOIN`, kein `LEFT JOIN`: die View gruppiert über
`tracks` und hat per Konstruktion genau eine Zeile je Track. Nachgemessen —
sqlc erzeugt dafür ein schlichtes `string`, kein `*string`, also braucht die
Abfrage **kein** `COALESCE`. Das ist der Unterschied zu `OpsDaysForSystem` aus
ADR 0017: dort kann der linke Join wirklich ins Leere greifen, hier nicht.

**Die `ORDER BY`-Klauseln sind Teil der Antwort, keine Bequemlichkeit.**
`module_no`, dann `sort_order` ist die Reihenfolge des Entwurfsblatts; eine
stabile Zeilenfolge ist zugleich das, was den ETag stabil macht. Aus demselben
Grund iteriert der Handler über die sortierten Slices und nie über die
Gruppierungs-Map: Map-Iteration in Go ist absichtlich zufällig, und ein
wandernder ETag ließe den 304-Pfad tot zurück, ohne dass irgendetwas kaputt
aussieht.

### 2. `evidenceSystems` wird in Go über die gelieferten Zeilen gezählt

Die Kopfzeile `EVIDENCE: 01 SYSTEM` ist die Anzahl distinkter Systeme hinter
mindestens einem Track. `SELECT count(DISTINCT system_id) FROM track_evidence`
wäre die vierte Abfrage und wäre die falsche Wahl: **sie ist eine zweite Quelle
für dieselbe Zahl und kann der Liste widersprechen, unter der sie steht.** Der
Handler zählt stattdessen die distinkten Slugs genau der Belegzeilen, die im
Dokument stehen — Kopfzeile und Liste können strukturell nicht auseinanderlaufen,
und es ist eine Runde weniger.

Das ist **kein** Widerspruch zu Invariante 2. Abgeleitet wird der *Zustand*, und
der bleibt in SQL, in `v_track_states`, unverändert. Gezählt wird nur, was
ohnehin ausgeliefert wird. Dieselbe Begründung trägt `trackCount`: die Zahl ist
die Länge des Baums, den der Leser nachzählen kann, nicht eine zweite Auskunft
über ihn.

### 3. `note: "self-study"` ist eine Konstante in Go

Der Contract setzt das Feld ausschließlich, wenn `evidence` leer ist, und die
Oberfläche macht daraus `NO SYSTEM YET → SELF-STUDY`. Eine Spalte `tracks.note`
trüge neunmal denselben Text und kostete eine Migration mitten in Stufe C. Die
Konstante ist lowercase, weil die API lowercase spricht und die Oberfläche
großschreibt (Handbuch §14).

Die Alternative — das Feld weglassen und die Beschriftung aus dem leeren Array
ableiten — wurde verworfen: sie verschöbe eine Aussage der API ins Frontend, und
der Contract deklariert das Feld.

### 4. „9× learning" ist veraltet — es sind 9× `queued`

Build-Plan (B4) und Handbuch nennen als Abnahme des Seeds
„13× `applied`, 9× `learning`, 0× `core`". **Die mittlere Zahl stimmt nicht.**
`learning` verlangt ein System in `in_build`; am Starttag ist `vat-check`
`queued` und `timseil.dev` `live`, also gibt es keins. Ein Track ohne jeden Beleg
ist `queued` — „ich lerne das" ohne etwas, worauf man zeigen kann, ist genau die
Behauptung, gegen die diese Seite gebaut ist. `seed_db_test.go` hält das seit B4
fest; hier steht es, damit die Zahl nicht in H4 ein drittes Mal auftaucht.

Der Startzustand ist: **13× `applied` · 9× `queued` · 0× `learning` · 0× `core`
· `evidenceSystems: 1`.**

Daraus folgt die Form des Abnahmekriteriums der Phase. „Ein System auf `live`
setzen lässt Tracks von `learning` auf `applied` springen" ist mit dem Seed nicht
zu beobachten, weil der Ausgangszustand nicht `learning` ist. Der Test in
`training_db_test.go` baut die Bewegung selbst: dasselbe System durch `live` →
`in_build` → `live` → `queued`, und nach jedem Schritt wird die Abfrage gelesen.
Beobachtet wird die Abfrage, nicht die View — die View deckt der Property-Test
aus B3 ab; neu ist, dass der Lesepfad die Bewegung mitträgt und nichts dazwischen
einen Zustand zwischenspeichert.

### 5. `cacheControl` liegt ab hier in `httpx`

Nach C3 stünde die Konstante in drei Handler-Paketen. Der Backlog hatte den
Umzug für C4 vorgemerkt und C3 als Auslöser benannt („ab dem dritten Paket") — er
passiert jetzt, damit die dritte Kopie gar nicht erst entsteht.

`httpx.CacheControlShort/Medium/Hour/None` tragen die vier Werte, benannt nach
den `$ref`-Namen des Contracts, und `TestCacheDirectivesMatchTheContract` hält
jeden gegen `components/headers/<Name>/schema/const` aus dem ausgelieferten
Dokument. Die Contract-Tests der Handler-Pakete bleiben, wie sie sind: sie prüfen
weiterhin, dass *dieser Pfad* *diesen* Header sendet — eine andere Aussage als
„die Konstante stimmt". ADR 0009 eine Ebene tiefer.

## Konsequenzen

- Der Contract bleibt unverändert. `make gen` erzeugt in dieser Phase genau eine
  neue Datei, `api/internal/store/training.sql.go`.
- **Die vier Cache-Direktiven haben ab jetzt genau eine Quelle.** Der
  Backlog-Eintrag aus C2 ist damit erledigt; jedes weitere Handler-Paket wählt
  nur noch eine Konstante aus, statt einen Wert zu wiederholen.
- Der Handler entscheidet keinen Zustand. Wer in `internal/training` je eine
  Zählung von `live`-Systemen schreibt, hat Invariante 2 gebrochen, auch wenn
  das Ergebnis stimmt — die Ableitung hat einen Ort.
- H4 rendert den Baum, wie er kommt: Reihenfolge, Zustände und Belegzeilen sind
  serverseitig entschieden, die Oberfläche schreibt sie groß und sortiert nicht
  nach.
- C4 ist unberührt und bleibt, was ADR 0017 aus ihm gemacht hat: die Aggregation
  `ops_checks → ops_days` samt Lückentest.

## Verworfene Alternativen

**Ein Join über den ganzen Baum mit `json_agg` in Postgres** — spart die
Zusammensetzung in Go und macht die Antwortform zu einer SQL-Eigenschaft. Die
Nullability-Falle bliebe, die generierten Contract-Typen würden umgangen, und
eine Formänderung im Contract fiele erst zur Laufzeit auf.

**`COUNT(DISTINCT system_id)` als vierte Abfrage** — dieselbe Zahl aus einer
zweiten Quelle, und die eine Stelle, an der sie abweichen kann, ist die eine
Stelle, an der es auffällt: die Zeile über der Liste.

**Eine Spalte `tracks.state`** — steht hier nur, damit sie einmal ausdrücklich
verworfen ist. CLAUDE.md, ADR 0003 und `tools/check-migrations.sh` lehnen sie
bereits ab; C3 ist die Phase, in der sie am verführerischsten wäre, weil sie eine
Abfrage spart.

**Eine Spalte `tracks.note`** — neun identische Texte und eine Migration für eine
Beschriftung, die der Contract an eine Bedingung knüpft, die der Handler ohnehin
prüft.

**Den `cacheControl`-Umzug auf C4 verschieben**, wie der Backlog es vormerkte —
hieße, in dieser Phase eine dritte Kopie anzulegen, um sie in der nächsten wieder
einzusammeln.

## Belege

Build-Plan Zeile 1060 (C3), 1044 (B4, „9× learning"), Kapitel 4.4 ·
Handbuch §10, §11, §14 · ADR 0003 (Zustände als View), ADR 0009 (Problem
Details, Cache-Header), ADR 0016 (sqlc, `LEFT JOIN`, Strict-Form),
ADR 0017 (Fenster, Fehlerabbildung) ·
`contract/openapi.yaml` (`getTraining`, `Training`, `Track`, `Evidence`) ·
`api/migrations/00003_training.sql` („No state column, by design"),
`api/migrations/00007_track_states.sql` (die Ableitung),
`api/migrations/seed_db_test.go` Zeile 47–53 (die Korrektur der Zahl) ·
`api/internal/store/queries/training.sql`, `api/internal/training/training.go`,
`api/internal/store/training_db_test.go`, `api/internal/httpx/cache.go`.
