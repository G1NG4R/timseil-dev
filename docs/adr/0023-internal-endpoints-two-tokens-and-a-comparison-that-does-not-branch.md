# ADR 0023 — Interne Endpoints: zwei Tokens, ein Vergleich ohne Verzweigung, und die CHECKs vorweggenommen

**Status:** Angenommen
**Datum:** 2026-08-18
**Betrifft:** C7, E4, F4, L3, M3
**Invarianten:** 1 (keine erfundenen Zahlen), 6 (ein Tag ohne Messung ist `nodata`)

## Kontext

`POST /api/internal/probe` und `POST /api/internal/deploy` sind die zwei
Schreibpfade für Tatsachen, die dieser Host über sich selbst nicht feststellen
kann. Ein Host kann seinen eigenen Ausfall nicht melden (Handbuch Kapitel 8),
also wird die Uptime-Reihe von außen geschrieben; und die Dauer eines Deploys
weiß nur die Pipeline, die ihn ausgeführt hat. Genau darauf beruht, dass die
Zahlen auf der Fallstudie sich *gemessen* nennen dürfen und nicht *geschätzt*.

Am Ende dieser Phase gibt es **keinen einzigen echten Aufrufer**: die Sonde
kommt in F4, die Deploy-Meldung in E4. C7 baut die Empfangsseite und ihren
Beweis. Der Build-Plan nennt als Abnahme: „Falsches Token → 401 ohne
Informationsleck, ohne messbaren Timing-Unterschied."

Die Tabellen standen schon. B2 hat `ops_checks` und `deploys` mit ihren CHECKs,
ihren Unique-Constraints und der Spalte `origin` angelegt und in den Kommentaren
ausdrücklich auf C7 verwiesen. Diese Phase brauchte **keine Migration** — sie
musste nur aufhören, sich auf die Datenbank zu verlassen.

## Entscheidung

### 1. Zwei Tokens, nicht eines

`INTERNAL_PROBE_TOKEN` und `INTERNAL_DEPLOY_TOKEN`.

Die Sonde (F4, ein GitHub-Actions-Workflow alle fünf Minuten) und die Pipeline
(E4) sind verschiedene Aufrufer mit verschiedenen Lebensdauern, und die zwei
Schreibvorgänge sind verschieden viel wert. Eine erfundene Uptime-Zeile ist eine
Zelle in einem Raster aus einundneunzig. Eine erfundene Deploy-Zeile ist **die**
Zahl, auf die die Fallstudie zeigt, wenn sie sagt, die Deploy-Dauer sei gemessen
und nicht behauptet. Ein geleaktes Token darf nicht beides kaufen, und eine
Rotation nicht beide erzwingen.

Der Preis ist eine Umgebungsvariable mehr durch dieselben fünf Dateien.

### 2. Erst hashen, dann vergleichen

```go
gotSum := sha256.Sum256([]byte(got))
wantSum := sha256.Sum256([]byte(want))
return subtle.ConstantTimeCompare(gotSum[:], wantSum[:]) == 1
```

Das Hashen ist der Teil, den man weglässt. `subtle.ConstantTimeCompare` ist
konstant in der Zeit **nur über gleich lange Eingaben**; bei ungleicher Länge
kehrt es sofort mit 0 zurück, und dann verrät die Antwortzeit, wie lang das
echte Token ist. Über zwei SHA-256-Digests ist jeder Vergleich dieselben
zweiunddreißig Byte — auch der gegen den leeren String, den eine Anfrage ohne
`Authorization`-Header vorlegt.

SHA-256 ist hier kein Passwort-Hash und muss keiner sein. Die Eingabe ist ein
Zufallstoken aus `openssl rand -hex 32`, kein von Menschen gewähltes Geheimnis;
der Digest ist ein Längenausgleich, keine KDF.

**Gemessen** (`TestTheComparisonCostsTheSameWhateverItIsHanded`, 50 000
Wiederholungen, bestes von fünf):

| Eingabe | ns/op |
|---|---|
| gar nichts | 348,4 |
| das falsche Token | 349,1 |
| ein viel kürzeres | 368,1 |
| das richtige | 350,0 |
| das richtige bis auf ein Zeichen | 348,6 |
| das Präfix des richtigen | 351,9 |

Ohne das Hashen fallen dieselben Fälle auf 3,8 ns gegen 23,3 ns auseinander —
Faktor sechs, und die Trennlinie liegt genau bei der Länge. Nachgemessen, indem
das Hashen entfernt wurde.

### 3. Drei Ablehnungsgründe, eine Antwort

Kein Header, ein anderes Schema, ein falsches Token: derselbe Weg durch die
Funktion, dieselbe 401, **byteweise derselbe Körper**, dieselbe Laufzeit. Auch
die Logzeile nennt den Grund nicht — ein Log, das „falsches Token" neben „kein
Token" schreibt, beantwortet die Frage des Angreifers einen Grep entfernt.

Dazu `WWW-Authenticate: Bearer`, das RFC 9110 verlangt und das der Contract
seit dieser Phase als Konstante deklariert. **Ohne `realm` und ohne `error`** —
das sind die zwei Stellen, an denen die RFC Raum für einen Hinweis lässt, und
ein Hinweis ist genau das Leck, gegen das dieser Endpoint gebaut ist.

**Was hier nicht behauptet wird.** Ein vorgezogenes `return` im *Handler* — etwa
„kein Header, sofort 401" — ist **nicht** messbar und wird deshalb auch nicht
zugesichert. Das Schreiben des Problem-Dokuments kostet Mikrosekunden und
ertränkt die 350 ns des Vergleichs vollständig. Ein Wanduhr-Test gegen
`ServeHTTP` wäre grün, egal was der Vergleich täte. Die Zusicherung liegt auf
dem Vergleich, weil dort das Leck läge; die Form des Handlers ist Sorgfalt und
keine Messung.

### 4. Der Wächter hängt an der Route, nicht in der Kette

`middleware.Bearer(...)` wird an der `mux.Handle`-Zeile um die Route gelegt.
Dieselbe Begründung wie beim Contact-Limiter (ADR 0015 §3): die Route ist die
ganze Aussage über den Geltungsbereich. Ein Kettenglied bräuchte einen
Pfad-Test, und ein Pfad-Test, der vom Router abdriftet, ist ein
unauthentifizierter Schreibpfad.

### 5. Jede CHECK-Verletzung wird vorher ein 400 mit Feldnamen

Der eigentliche Inhalt der Phase. Acht Regeln, jede mit einem `invalidParams`-
Eintrag, der das Feld benennt:

`reason` bei `up = true` · `latencyMs` bei `up = false` · `latencyMs` negativ ·
`latencyMs` oder `durationSec` breiter als die Spalte · `sha` nicht
`^[0-9a-f]{7,40}$` · `result` außerhalb des Enums · `durationSec` negativ ·
`at` außerhalb des Zeitfensters.

Der Datenbank überlassen kommt jede davon als Treiberfehler und geht als **500**
hinaus — was einer Pipeline sagt, *wir* seien kaputt, während sie einen
Widerspruch geschickt hat.

Zwei Fälle wären beim Planen fast durchgerutscht:

- **Die Breite.** Der Contract sagt `type: integer`, oapi-codegen erzeugt
  daraus Gos `int` (64 Bit), und die Spalten sind Postgres `integer`. Alles
  zwischen 2³¹ und 2⁶³ decodiert anstandslos und scheitert im Treiber.
- **Das Enum.** `DeployResult` ist ein String-Typ mit einer generierten
  `Valid()`-Methode, und `encoding/json` schreibt `"banana"` klaglos hinein.
  `Valid()` muss ausdrücklich gerufen werden — dieselbe Klasse wie das
  `window`-Enum in C2.

Die Groß-/Kleinschreibung der SHA wird **abgelehnt und nicht kleingeschrieben**:
eine Pipeline, die `A41F9C2` schickt, soll das einmal erfahren, statt still
etwas anderes gespeichert zu bekommen als sie gesendet hat. Dieselbe Regel, mit
der C6 den normalisierenden Adress-Decoder abgelehnt hat.

`reason` ist im Schema unbegrenztes `text` und landet in einer Spalte, die ein
öffentliches Raster liest: gekürzt auf 200 Zeichen, Zeilenumbrüche geplättet.

### 6. `at` bekommt zwei Grenzen, und keine davon ist eine DB-Regel

**Zukunft: zwei Minuten.** `queries/health.sql` liest `LastDeploy` als
`ORDER BY deployed_at DESC LIMIT 1`. Ein einziger Deploy-Bericht mit verstellter
Uhr wird damit **dauerhaft** zum `lastDeploy` auf `/api/health` und auf dem
Version-Badge, und die API kennt keinen Weg zurück — sie schreibt nur.
`DeploysForSystem` begrenzt `deployed_at` außerdem nur nach unten, also wäre
derselbe Bericht ein Balken über einem Tag, den es nicht gibt. Zwei Minuten sind
Raum für gewöhnliche Uhrendrift zwischen einem GitHub-Runner und diesem Host.

**Vergangenheit: neunzig Tage.** Ausdrücklich **keine** Aggregationsfrage:
`RollUpOpsDays` begrenzt seinen Scan auf `recorded_at` und gruppiert auf
`observed_at`, genau damit eine monatealte Beobachtung aus dem `ops-data`-Branch
noch aggregiert wird. Es ist eine Wachstumsfrage. Der Unique-Constraint auf
`(system_id, observed_at)` ist das Einzige, was begrenzt, wie viele Zeilen eine
authentifizierte, aber kaputte Sonde schreiben kann; ohne Untergrenze läuft sie
`observed_at` beliebig rückwärts.

### 7. `recorded_at` wird nicht gesetzt

Eine ausgelassene Spalte, und nichts warnt davor. Ihr Default ist `now()`, und
`now()` ist das, worauf `RollUpOpsDays` scannt. Ein vom Aufrufer geliefertes
`recorded_at` in der Vergangenheit legte eine neue Zeile außerhalb des
Lookback-Fensters ab — geschrieben, nie gezählt, Raster sagt `nodata`, niemand
meldet etwas. `TestALateObservationIsStillFreshlyRecordedAndStillAggregated`
hält es fest.

### 8. `origin` steht in der Abfrage, nicht im Body

Der CHECK erlaubt `'probe'` und `'backfill'`. `'backfill'` gehört F4s Replay von
`uptime-log.txt` und trägt ein `source_ref`, das einen öffentlichen Commit
nennt. Dürfte ein HTTP-Body zwischen beiden wählen, könnte eine Live-Sonde
behaupten, Beleg von außerhalb der Infrastruktur zu sein — die eine Behauptung,
für die diese Tabelle überhaupt existiert.

### 9. Ein Wiederholungsversuch ist 204, und ein Widerspruch wird verworfen

`ON CONFLICT DO NOTHING` auf beiden Unique-Constraints. Der Contract gibt einem
204 keinen Körper, also gibt es nichts zu unterscheiden, und die Sonde darf nach
einem Timeout blind wiederholen.

Was damit festgeschrieben ist: **ein zweiter Bericht zu demselben `observed_at`
mit anderem `up` wird verworfen, nicht angewandt.** Das ist die Regel der
Migration („a backfill never overwrites a live probe") und eine Entscheidung,
keine Nebenwirkung. Deshalb `:execrows` statt `:exec`: null betroffene Zeilen
erzeugen eine INFO-Zeile, und die ist das Einzige, woran eine Sonde erkennbar
ist, die in einer Zeitstempel-Schleife hängt. Ein `:execrows`, dessen Ergebnis
verworfen würde, wäre eine Absichtserklärung, die der Code nicht einhält.

### 10. Der Slug wird getrennt aufgelöst

`SystemIDBySlug` ist eine eigene Abfrage und einen Roundtrip wert. Zusammengelegt
zu `INSERT … SELECT id FROM systems WHERE slug = $1 … ON CONFLICT DO NOTHING`
bedeuteten null betroffene Zeilen zwei verschiedene Lagen — „kein solches
System", eine Fehlkonfiguration und ein 500, und „schon aufgezeichnet", ein 204.

### 11. `/api/internal/*` ist von CORS ausgenommen, aber nicht vom Rate-Limit

`isAPI` wird von der CORS-Middleware **und** vom Rate-Limiter benutzt, also
musste die Ausnahme in die CORS-Middleware und nicht in `isAPI` — sonst hätten
die beiden Operationen ihren im Contract deklarierten 429 verloren.

Geschlossen wird dabei nichts Ausnutzbares: eine Cross-Site-Anfrage trägt keinen
`Authorization`-Header und scheitert am Token, was CORS auch sagt. Geschlossen
wird eine **Auskunft** — ein Preflight von einem erlaubten Origin bekam
`Access-Control-Allow-Methods: GET, POST, OPTIONS` für einen Pfad, der in keinem
öffentlichen Dokument steht. Weder die Sonde noch die Pipeline ist ein Browser.

### 12. Der Contract-Test liest eine Kopie unter `testdata`

Beide Operationen sind `x-internal`, redocly streicht sie aus dem öffentlichen
Bundle, und `tools/check-contract.sh` bricht den Build, wenn eine durchkommt.
Ein Contract-Test gegen `httpx.Spec()` fände also **nichts** — und wäre grün,
weil jede Schleife leer bliebe.

Der erste Versuch, `../../../contract/openapi.yaml` zu lesen, war auf dem
Entwicklungsrechner grün und in CI kaputt: `make check-db` hängt nur `./api` in
den Container. Also schreibt `make gen` eine Kopie nach
`api/internal/intake/testdata/openapi.yaml`. `testdata` ignoriert die
Go-Toolchain, die Kopie kann also nicht neben `//go:embed assets` ins Binary
geraten, und `GENERATED` hält sie gegen das Original.

## Konsequenzen

**F4** baut die Sonde: alle fünf Minuten ein POST mit `INTERNAL_PROBE_TOKEN`,
und bei jedem Zustandswechsel zusätzlich eine Zeile auf `ops-data`. Der Cron-
Ausdruck dort und `probeInterval` in `internal/ops` sind zwei Hälften derselben
Zahl (Backlog).

**E4** meldet am Ende der Pipeline mit `INTERNAL_DEPLOY_TOKEN`. Erst danach hat
`/api/health` ein `lastDeploy` und das Version-Badge etwas zu zeigen.

**L3** blockt `/api/internal/*` zusätzlich am Traefik. Der Contract merkt an,
dass der Pfad dabei umziehen könnte, weil Sonde und Pipeline von außen rufen;
die `operationId` bleibt stabil, also wäre das ein `make gen` und keine
Router-Änderung.

**M3** prüft, dass die zwei Pfade von außen **404** geben und nicht 401.

### Was das kostet

**Zwei Pflichtvariablen mehr durch fünf Dateien.** `config.go`,
`config_test.go`, `.env.example`, `compose.dev.yaml`, `runbooks/api.md` — und
`server_test.go`s `testConfig()`, was diese Phase zu sechs macht. Kein Werkzeug
hält sie gegeneinander; die Rechnung ist jetzt dreimal bezahlt und `check-env`
in E2 überfällig.

**Ein Roundtrip mehr pro Bericht.** §10. Bei einer Anfrage alle fünf Minuten ist
das keine Zahl, die je jemand misst, und bei einer Sonde, die ausfällt, wäre die
Zweideutigkeit teurer.

**Die Validierung ist eine zweite Fassung der CHECKs.** Acht Regeln stehen jetzt
in SQL und in Go, und sie können auseinanderlaufen. Der db-Test
`TestTheDatabaseStillRefusesWhatTheHandlerRefusesFirst` fährt beide gegen einen
echten Server, damit das Auseinanderlaufen auffällt und nicht erst der Ausfall.

**Neunzig Tage Untergrenze schließen einen Wiederherstellungsfall aus.** Sollte
`ops-data` je länger als ein Quartal zurückreichen und rückwirkend eingespielt
werden müssen, geht das nicht über diesen Endpoint. Das ist richtig so — der
Backfill ist F4s Pfad mit `origin = 'backfill'` und einem `source_ref`, nicht
dieser hier.

## Verworfene Alternativen

**Ein Token für beide.** Eine Variable weniger, eine Rotation statt zwei. Siehe
§1: derselbe Schlüssel schriebe Uptime und Deploy-Dauer.

**Den Vergleich ohne Hashen.** Kürzer und sieht richtig aus. Gemessen: Faktor
sechs zwischen kurzem und langem Token, und die Trennlinie ist die Länge des
echten (§2).

**Eine Wanduhr-Zusicherung in CI** für die Timing-Eigenschaft. Sie wäre flaky,
würde irgendwann mit `t.Skip` erschlagen, und sie wäre gegen `ServeHTTP` ohnehin
bedeutungslos (§3). Stattdessen ein Verhältnistest über den Vergleich selbst,
mit einer Schranke von 2×, die weit vom Rauschen und weit vom Fehler entfernt
liegt.

**Widersprüchliche Werte normalisieren** statt abzulehnen — `reason` bei
`up = true` einfach weglassen. Verworfen: was gespeichert wird, muss sein, was
gesendet wurde, und eine Sonde, die das Falsche meldet, hat einen Fehler, den
sie erfahren soll.

**Die Slug-Auflösung beim Start.** Ein Roundtrip weniger pro Bericht, dafür eine
Datenbankabhängigkeit im Startpfad — gegen C1 — und ein Prozess, der ein später
angelegtes System nie fände.

**`origin` aus dem Body nehmen.** Siehe §8.

## Belege

Build-Plan Zeile 1073 (C7), 1122 (E4), 1156 (F4), 1305 (L3), Kapitel 11.1 ·
Handbuch Kapitel 8 (das externe Ausfallprotokoll) · ADR 0009 (Problem Details) ·
ADR 0015 §3 (Geltungsbereich an der Route) · ADR 0019 §2 und §6 (der Roll-up
scannt auf `recorded_at`; C7 aggregiert nichts) · ADR 0021 (die Body-Disziplin
des Contact-Endpoints, hier wiederholt) · `api/migrations/00004_operations.sql`
(die CHECKs und die zwei Unique-Constraints, mit ihren Kommentaren an C7) ·
`api/internal/middleware/bearer.go` · `api/internal/intake/` ·
`api/internal/store/queries/ops.sql`
