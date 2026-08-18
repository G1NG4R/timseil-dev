# ADR 0016 — sqlc als Datenzugriff, und der Router montiert nur, was es gibt

**Status:** Angenommen · **Teil 2 (der Router) ersetzt durch ADR 0024**
**Datum:** 2026-08-17
**Betrifft:** C1, C2–C7, E2
**Invarianten:** 1 (`null` → `— NO DATA`), 3 (Metriken nur für `live`)

> **Nachtrag, 18.08.2026 (C7).** Teil 1 (sqlc) gilt unverändert. Teil 2 gilt in
> seiner Diagnose und nicht in seinem Ausweg: der Router montiert weiterhin nur,
> was es gibt — inzwischen ist das alles —, aber der hier zugesagte Umbau auf
> `httpx.HandlerWithOptions` findet nicht statt. Vier Gründe, die 2026-08-17
> noch nicht auf dem Tisch lagen, stehen in **ADR 0024**; dort steht auch, was
> stattdessen die Zusicherung trägt, um die es diesem ADR ging.

## Kontext

C1 schreibt die erste Abfrage dieser Anwendung und mountet den ersten Endpoint
aus dem Contract. Beides wirft eine Frage auf, die für alle folgenden C-Phasen
gilt und deshalb einmal entschieden gehört.

**Zum Zugriff:** Issue #23 hielt fest, dass es `api/sqlc.yaml` noch nicht gibt —
B2 hat es ausgelassen, weil sqlc ohne Abfrage nichts erzeugt und ein `make
gen`-Schritt, der still nichts tut, das grüne Nichts ist, gegen das dieses
Repository gebaut ist.

**Zum Router:** `oapi-codegen` erzeugt mit `HandlerWithOptions` einen Router für
**alle vierzehn** Operationen des Contracts. Deployt wird aber nach jeder Phase,
und zwischen C1 und C7 existieren elf davon nicht.

## Entscheidung

### 1. sqlc erzeugt den Zugriff, die Migrationen sind sein Schema

`api/sqlc.yaml` liest `api/migrations` direkt. sqlc versteht die
goose-Annotationen und ignoriert die Down-Abschnitte, also wird gegen das Schema
geprüft, das tatsächlich angewendet wird. Ein separates `schema.sql` wäre eine
zweite Wahrheit, und die erste Migration, die nur in einer von beiden landet,
erzeugte eine Funktion, die kompiliert und fehlschlägt.

`emit_pointers_for_null_types: true` ist die tragende Zeile. Ohne sie wird aus
`double precision NULL` ein `pgtype.Float8`, und jede Metrik bräuchte eine
handgeschriebene Übersetzung von `.Valid` nach Zeiger — vier pro Abfrage, und
Invariante 1 stirbt beim ersten Vergessen. Mit ihr liefert sqlc `*float64`, genau
das, was der Contract erzeugt: eine Zuweisung, keine Umwandlung.

**Die Enum-Frage aus Issue #23 beantwortet ADR 0010 bereits** und wird hier nicht
neu entschieden: „sqlc liefert in C1 `string`, nicht einen eigenen Typ. Der
Übergang zum generierten Contract-Typ passiert im Store-Paket und ist eine
Zuweisung." Das ist sicher, weil `tools/check-migrations.sh` jede `CHECK`-Liste
bei jedem `make check` gegen die `enum`-Liste des Contracts hält — die beiden
Mengen können nicht auseinanderlaufen, also kann die Umwandlung keinen Wert
erzeugen, den der Contract nicht kennt. **Der `CHECK` ist die Durchsetzung, der
Contract-Typ das Vokabular, das Store-Paket die einzige Naht.**

Eine Konsequenz, die beim Schreiben der ersten Abfrage sichtbar wurde: **sqlc
kennt die Nullability eines `LEFT JOIN` nicht.** `deploys.sha` ist in der Tabelle
`NOT NULL`, also erzeugt eine linksgejointe Spalte einen einfachen `string`, und
der erste Health-Check gegen eine Datenbank ohne Deploys scheitert beim Scannen.
Der Generator hat recht über das Schema und unrecht über die Abfrage. Deshalb
stehen dort **mehrere kleine Abfragen statt einer klugen**: jede Spalte trägt die
Nullability, die sie in ihrer eigenen Tabelle hat, und „es gibt keine Zeile"
kommt als `pgx.ErrNoRows` an — die ehrliche Form für „noch nichts gemessen".

### 2. Der Router montiert nur gebaute Operationen

`internal/server` registriert von Hand, was existiert. Die elf ungebauten
Operationen antworten mit **404**, weil sie nicht registriert sind.

Jede Alternative wäre eine Unwahrheit: `500` sagt, wir seien kaputt; `501` ist von
keiner Operation deklariert, ein generierter Client kann es also nicht lesen; und
`404` für eine dokumentierte Ressource ist nur ehrlich, wenn die Route wirklich
nicht existiert — was durch Nichtregistrieren genau erreicht wird.

Dazu kommt ein mechanischer Grund: `HandlerWithOptions` beansprucht `/api/docs`,
`/api/docs/scalar.js` und `/api/openapi.yaml`, die `RegisterDocs` schon besitzt.
Zwei Registrierungen desselben Musters lassen `ServeMux` panisch werden, und der
Ausweg hieße, drei funktionierende, getestete Handler samt ihrer ETag-, gzip- und
CSP-Behandlung neu zu schreiben, damit ein Router zufrieden ist.

**Die Handler werden trotzdem in der Form des Strict-Servers geschrieben.**
`GetHealth(ctx, request) (response, error)` ist die Signatur aus
`httpx.StrictServerInterface`, und die Antwort wird über das generierte
Response-Objekt geschrieben — das setzt `Content-Type`, `Cache-Control` und
`ETag` aus dem Contract, so wie ADR 0009 es verlangt. Ein Adapter von fünfzehn
Zeilen verbindet das mit der Route.

Die Phase, die den letzten Handler liefert, tauscht `internal/server` auf
`HandlerWithOptions` um. Weil jeder Handler die Form schon hat, ist das eine
Router-Änderung und keine Neufassung.

## Konsequenzen

- `make gen` hat einen sechsten Generator; die drei erzeugten Dateien unter
  `api/internal/store/` stehen in `GENERATED` und damit unter der Drift-Prüfung.
- sqlc kommt als `tool`-Direktive wie oapi-codegen und steht in `stack.yaml` —
  CLAUDE.md führt es im Stack, also muss seine Version aus einer Datei dieses
  Repos gelesen werden statt getippt zu sein.
- **Kein C-Compiler nötig:** sqlc benutzt den Postgres-Parser als WebAssembly.
  Das war das Risiko, das vor dem Rest der Phase geprüft wurde.
- `make check-db` läuft mit `-p 1`. Es gibt eine Testdatenbank, und seit `store`
  db-getaggte Tests hat, wollen zwei Pakete sie gleichzeitig.
- **E2** bekommt für die Paritätsprüfung eine Liste der noch nicht montierten
  Operationen zu prüfen; bis dahin ist die Prüfung „jeder registrierte Pfad steht
  im Contract" bereits erfüllt.
- Invariante 3 steht jetzt **in der Abfrage** (`AND s.state = 'live'`), nicht nur
  im Go-Code. Ein System, das `live` verlässt, leert damit seine eigenen Metriken.

### Was das kostet

**sqlc vergrößert den Abhängigkeitsgraphen um 41 Module** — einen MySQL-Treiber,
SQLite, gRPC, einen TiDB-Parser. Gemessen statt geschätzt, weil der Verdacht
sonst größer bleibt als die Sache:

| | |
|---|---|
| Module aus dem sqlc-Graphen, die `./cmd/api` bindet | **0** |
| `// indirect` in `api/go.mod` | 24 → 65 |
| Zeilen in `api/go.sum` | 219 → 304 |
| Laufzeit pro `make check`, gebaut und gecacht | 0,20 s |
| Im Produktions-Image (D1, distroless + ein statisches Binary) | nichts |

Zwei Dinge relativieren die Zahl, ohne sie kleinzureden.

**Das Muster ist geerbt, nicht neu.** 14 der 24 indirekten Zeilen, die vorher
schon dastanden, gehören oapi-codegen. Dass ein Codegenerator im api-Modul lebt,
ist in B1 entschieden worden; sqlc ist derselbe Fall, nur größer.

**Und `govulncheck` blockiert daran nicht.** Es analysiert im Standardmodus
erreichbaren Code; was von `./cmd/api` aus nicht erreichbar ist — und das ist der
gesamte Tool-Graph — erscheint in der informativen Liste „Module, die du benötigst,
aber nicht aufrufst", nicht im blockierenden Teil. Was der größere Graph
tatsächlich kostet, ist Aufmerksamkeit: Dependabot-Rauschen (E2 muss das Verhalten
für indirekte Tool-Abhängigkeiten festlegen) und ein `go mod download` im
Docker-Build, das den ganzen Graphen in eine Image-Schicht zieht, wenn D1 das
übliche `COPY go.mod go.sum` voranstellt.

**Drei Abfragen statt einer** für `/api/health`. Auf einem Endpoint mit
`s-maxage=60` sind zwei zusätzliche indizierte Roundtrips kein Argument, aber es
ist eine bewusste Entscheidung gegen die kompaktere Fassung.

**Der Router ist bis C7 handgeschrieben.** Bis dahin gilt „jede Route steht im
Contract" nur, weil jemand sie einträgt — die maschinelle Prüfung in beide
Richtungen kommt mit E2.

**Elf dokumentierte Operationen antworten 404.** Wer den Contract liest und
sofort ausprobiert, findet sie nicht. Das ist der ehrlichste der drei möglichen
Fehlschläge, aber es ist einer.

## Verworfene Alternativen

**Spaltentypen in `sqlc.yaml` auf die Contract-Typen überschreiben** — dann
importierte die Datenschicht den Contract, was die Richtung umkehrt, auf der
dieses Repository aufgebaut ist. Außerdem hat `contact_messages.delivery_status`
gar kein Contract-Enum, und ein Override ist String-Matching auf Spaltennamen:
eine Umbenennung schaltet ihn still ab.

**`string` überall und `Valid()` am Rand** — verschiebt eine Frage, die die
Datenbank per `CHECK` schon beantwortet, in eine Code-Review.

**Ein handgeschriebener Zugriff mit pgx** — spart 41 Module und kostet die
Prüfung gegen das Schema; C2 bis C7 schreiben deutlich mehr SQL als C1.

**sqlc per `go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0` im Makefile** — die
naheliegende Fassung, um `go.mod` sauber zu halten, und die schlechtere. Sie
entfernt die Abhängigkeit nicht, sie entfernt sie aus dem Diff: die
`tool`-Direktive hasht jedes dieser Module in `go.sum`, ein `@version`-Aufruf tut
das nicht. Die 85 zusätzlichen `go.sum`-Zeilen sind nicht der Preis, sie sind der
Gegenwert. Dazu stünde die Version als Literal im Makefile — genau das, was
`stack.yaml` und ADR 0012 verbieten.

**Ein eigenes `tools/go.mod`** — hielte den Graphen des api-Moduls klein, und der
Stack-Resolver käme damit zurecht (`fromGoMod` matcht auf den Dateinamen, also
löst `from: "tools/go.mod"` auf). Konsequent wäre aber nur, oapi-codegen
mitzuverschieben, also ein Umbau an einem funktionierenden `make gen` — und sqlc
löst die Pfade in `sqlc.yaml` relativ zum Arbeitsverzeichnis auf, das über eine
Modulgrenze hinweg nicht mehr `api/` ist. Aufwand und ein neuer Stolperstein für
einen Graphen, der das Artefakt nicht erreicht.

**Den generierten Router jetzt montieren, mit 501 für die ungebauten** — ein
Status, den keine Operation deklariert, in einem Repository, dessen Client aus
dem Contract erzeugt wird.

**Ein `schema.sql` für sqlc erzeugen** — eine zweite Fassung des Schemas, also
genau die Kopie, die laut Kapitel 12.2 driftet.

## Belege

Build-Plan Zeile 1053 (C1), Kapitel 12.2 (Doku-Drift) · ADR 0009 (Cache-Header
gehören in den Contract), ADR 0010 (Enums als `text` mit `CHECK`; beantwortet die
Typfrage aus Issue #23), ADR 0004 · Issue #23 · `api/migrations/embed.go`
(„sqlc (C1) reads this directory as its schema input") ·
`api/sqlc.yaml`, `api/internal/store/queries/health.sql`,
`api/internal/server/server.go`.
