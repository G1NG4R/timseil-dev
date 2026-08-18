# Runbook — Der API-Prozess

**Leser:** ich, wenn der Container startet und sofort wieder aussteigt, und ich,
wenn jemand schreibt, die API antworte mit 429 und er wisse nicht warum.

Der Prozess ist `api/cmd/api`. Konfiguration in `api/internal/config`, Pool in
`api/internal/db`, Kette in `api/internal/middleware`, Routen in
`api/internal/server`, Handler in `api/internal/health` und
`api/internal/systems`. ADR 0014 (Lebenszyklus), ADR 0015 (Kette), ADR 0016
(Zugriff und Router), ADR 0009 (Fehlermodell), ADR 0011 (Rollen),
ADR 0017 (Fenster, Rasterlücken, Fehlerabbildung der Systems-Endpoints).

---

## Die drei Pfade, die nach Gesundheit klingen

Sie beantworten drei verschiedene Fragen. Wer den falschen abfragt, bekommt eine
richtige Antwort auf etwas anderes.

| Pfad | Frage | Antwortet 503/degraded wenn |
|---|---|---|
| `/healthz` | Lebt der Prozess? | nie — auch beim Herunterfahren nicht |
| `/readyz` | Soll ich dir Arbeit schicken? | Postgres nicht erreichbar **oder** der Prozess entwässert |
| `/api/health` | Welcher Build, welche Zahlen? | `degraded`, wenn das eigene System fehlt oder nicht `live` ist |

`/healthz` und `/readyz` stehen nicht im Contract: sie gehören dem Orchestrator.
`/api/health` ist das Deploy-Gate aus E4 und die Quelle der README-Badges.

```bash
curl -s localhost:8080/api/health | jq '{status, version, sha, ops}'
```

**`sha` sagt `unknown` in der Entwicklung.** Der Bind-Mount enthält kein `.git`,
also gibt es keine VCS-Angabe zu lesen; das Produktions-Image bekommt Version und
SHA von D1 per `-ldflags`. `unknown` ist ehrlich — es ist kein Platzhalter, der
wie eine Version aussieht.

---

## Der Start bricht ab

Der Prozess validiert die ganze Umgebung, bevor er etwas tut, und meldet **alle**
Probleme auf einmal:

```
{"level":"ERROR","msg":"invalid configuration\n2 configuration problem(s):\n  - DATABASE_URL is empty — copy .env.example to .env\n  - REQUEST_TIMEOUT is \"soon\" — want a duration such as 15s or 500ms"}
```

Die Meldungen, die nicht nach einem Tippfehler aussehen:

**`DATABASE_URL connects as timseil_migrate`** — der langlebige Prozess darf keine
DDL-Zugangsdaten tragen (ADR 0011). Wahrscheinlich wurde `MIGRATE_DATABASE_URL`
kopiert. Richtig ist `timseil_app`.

**`REQUEST_TIMEOUT (30s) must be shorter than SHUTDOWN_GRACE (20s)`** — sonst
läuft eine Anfrage noch legitim, wenn die Gnadenfrist endet, und das Herunterfahren
schneidet genau sie ab. Beide Werte gehören zusammen bewegt; siehe die Kaskade
unten.

**`DB_STATEMENT_TIMEOUT (10s) must not exceed REQUEST_TIMEOUT (5s)`** — eine
Abfrage darf die Anfrage nicht überleben, die sie angefordert hat.

**`GITHUB_TOKEN is empty — a personal access token with scope read:user`** — seit
C5 die zweite Variable ohne Default. Sie steht **absichtlich nicht** in
`.env.example`: die Datei ist eingecheckt, ein Token darin wäre ein Token im
Repository. Eins bauen unter `github.com/settings/tokens`, Scope `read:user` und
sonst nichts, und in `.env` eintragen. Compose bricht schon vorher ab, wenn die
Zeile fehlt — die Meldung kommt dann von `${GITHUB_TOKEN:?}` und nicht aus dem
Container.

Warum der Prozess deswegen gar nicht erst startet: die Startseite verspricht
einen Contribution-Graph. Ein Prozess, der fröhlich läuft und ihn nie holen kann,
zeigt dauerhaft `— NO DATA` und nennt das eine Messung. Das ist Invariante 1 in
Startaufstellung.

**`GITHUB_TOKEN contains a line break`** — beim Einfügen ist ein Zeilenumbruch
mitgekommen. Der Wert geht in einen `Authorization`-Header; ein `\n` darin hängt
fremde Header an. Dieselbe Klasse wie die CRLF-Regel für Mail-Felder in C6.

### Die Kaskade

```
DB_STATEMENT_TIMEOUT  5s  <  REQUEST_TIMEOUT 15s  <  SHUTDOWN_GRACE 20s  <  stop_grace_period 30s
```

Die ersten drei erzwingt der Start. **Das vierte Glied steht im Compose und wird
von nichts geprüft** — Dockers Default sind zehn Sekunden, also kürzer als die
Gnadenfrist. Fehlt `stop_grace_period`, entwässert der Prozess höflich, bis
SIGKILL kommt, und die Tests bleiben trotzdem grün.

---

## Ein Shutdown von Hand ansehen

```bash
docker compose -f compose.dev.yaml stop api
docker compose -f compose.dev.yaml logs api | tail -4
```

Erwartet:

```
{"level":"INFO","msg":"shutdown requested, draining","grace":"20s"}
{"level":"INFO","msg":"drained cleanly"}
```

Fehlen die zwei Zeilen, hat der Prozess kein Signal bekommen. In der Entwicklung
ist `air` PID 1; `send_interrupt = true` in `api/.air.toml` ist der Grund, warum
es überhaupt ankommt.

Steht dort stattdessen `the grace period expired with requests still running`, hat
etwas länger gebraucht als `SHUTDOWN_GRACE`. Der Prozess beendet sich trotzdem mit
0 — ein Fehlschlag auf SIGTERM ließe Docker den Container als gescheitert
markieren, mitten in einem normalen Deploy.

---

## „Ich bekomme 429"

Standard: **120 Anfragen pro Minute pro Client, Burst 60.** Die Antwort ist ein
RFC-9457-Dokument mit `Retry-After` in Sekunden.

```bash
curl -si localhost:8080/api/health | head -6
```

Zum Drehen: `RATE_LIMIT_RPM` und `RATE_LIMIT_BURST` in `.env`, dann `make dev`
neu. Prozesslokal — zwei Instanzen während eines Deploys erlauben zusammen das
Doppelte, und ein Neustart vergisst alles.

### „Alle bekommen 429" oder „niemand bekommt 429"

Beides ist dieselbe Frage: **wer ist der Client?**

Hinter einem Proxy kommt jede Anfrage vom Proxy. Deshalb wird
`X-Forwarded-For` nur geglaubt, wenn der TCP-Peer in `TRUSTED_PROXY_CIDRS` liegt.
Suche im Log nach:

```
a trusted proxy sent no usable X-Forwarded-For — requests are not being rate limited
```

Diese Zeile heißt: der Peer gilt als Proxy, forwardet aber nichts. Der Prozess
limitiert dann **gar nicht** und sagt es einmal pro Minute — alle Besucher einem
Eimer zuzuschlagen hieße, die Seite abzuschalten, um sie zu schützen. Entweder
setzt der Proxy den Header nicht (dann ist er falsch konfiguriert), oder es steht
gar kein Proxy davor und `TRUSTED_PROXY_CIDRS` ist zu weit.

**In der Entwicklung ist die Liste leer, und das ist richtig so.** Der Peer ist
Dockers NAT-Gateway, kein Proxy; die Liste zu füllen hieße, einen Header zu
glauben, den niemand setzt. In Produktion setzt Dokploy sie auf das Netz, über
das Traefik die API erreicht.

Adressen liegen nur als geschlüsselter Hash im Speicher und werden nach zehn
Minuten vergessen — dieselbe Frist, die die Datenschutzseite nennt.

---

## „Ein System zeigt `— NO DATA`"

Fast immer heißt das „noch nichts gemessen", nicht „kaputt". Die vier Schritte in
der Reihenfolge, in der sie sich lohnen — die ersten beiden beantworten es fast
immer:

```bash
curl -s localhost:8080/api/systems | jq '.systems[] | {slug, state, metrics}'
```

**1 · Steht das System auf `live`?** `queued` und `in_build` tragen niemals
Metriken (Invariante 3), und das steht in der Abfrage, nicht im Go-Code. Vier
`null` bei einem System, das nicht `live` ist, sind die richtige Antwort und
nichts, was man reparieren kann, außer indem man das System live nimmt.

**2 · Gibt es überhaupt eine Messung?**

```bash
docker compose -f compose.dev.yaml exec db psql -U timseil_boot -d timseil -c \
  "SELECT s.slug, count(m.*), max(m.measured_at)
     FROM systems s LEFT JOIN metric_snapshots m ON m.system_id = s.id GROUP BY 1"
```

`0` ist der Normalzustand vor der ersten Sonde: **der Seed schreibt Inhalt,
niemals Messungen.** Erfundene Betriebsdaten in der Datenbank sind genau das,
wogegen diese Seite gebaut ist — `docs/runbooks/seed.md`.

**3 · Wie viele Rasterzellen sind gemessen?**

```bash
curl -s localhost:8080/api/systems/timseil-dev | \
  jq '{window, cells: (.days|length), byState: (.days|group_by(.state)|map({(.[0].state): length})|add)}'
```

`cells` ist immer gleich `window` — auch auf einer leeren Datenbank, denn das
Fenster wird in SQL erzeugt und die Messungen werden dagegen gejoint (ADR 0017).
Wären es weniger, wäre die Abfrage kaputt, nicht die Datenlage. Alles `nodata`
heißt: die Sonde aus C7/F4 läuft noch nicht.

**4 · Fehlen `days`, `incidents` oder `deploys` ganz?** Dann ist das System nicht
`live`. Die drei Felder fehlen dort, sie sind nicht leer — „dieses System hat
kein Betriebsraster" und „sein Raster ist leer" sind zwei verschiedene Aussagen,
und für ein System im Bau ist die erste die wahre.

**Was hier nie die Antwort ist:** eine `0` einzutragen. `0` ist eine Messung, und
eine gute; `null` ist keine. Wer die beiden gleich rendert, hat gelogen, ohne es
zu merken (Invariante 1).

---

## „`?window=` liefert 400"

Erlaubt sind genau `30`, `91` und `182` — der Contract sagt es, der Handler prüft
es, und alles andere ist eine 400 mit `invalidParams`:

```bash
curl -s 'localhost:8080/api/systems/timseil-dev?window=45' | jq '{status, invalidParams}'
```

Kein stiller Rückfall auf 91: die Antwort trägt ihr Fenster als Feld, ein
stillschweigend ersetzter Wert ergäbe ein Dokument, das vollständig korrekt
aussieht und einen Zeitraum beschreibt, nach dem niemand gefragt hat. Die
Begründung samt der Contract-Ergänzung steht in ADR 0017.

91 ist 13×7 — sieben Zeilen gehen nur bei Vielfachen von sieben auf, und bei 90
hätte die letzte Spalte ein Loch, das wie ein Fehler aussieht (Invariante 7).

---

## „Der Contribution-Graph ist alt"

Zuerst nachsehen, wie alt. Die Zahl steht in der Antwort und muss nicht geraten
werden:

```bash
curl -s localhost:8080/api/contributions | jq '{cacheAgeSec, fetchedAt, totalContributions}'
```

Bis **3900 Sekunden** ist alles in Ordnung: die Haltbarkeit ist eine Stunde, der
Ticker kommt alle fünf Minuten, also darf ein Kalender 1 h 5 min alt sein, bevor
irgendetwas schiefsteht. Größere Werte heißen, dass die Schleife nicht mehr
schreibt.

Die Schleife hinterlässt bei **jedem** Lauf eine Zeile, auch bei denen, die
nichts tun. Ihr Fehlen ist die Diagnose:

```bash
docker compose -f compose.dev.yaml logs api | grep 'contributions refresh'
```

| `state` | heißt |
|---|---|
| `fetched` | geholt und gespeichert. `attempts` sagt, beim wievielten Versuch. |
| `fresh` | die Zeile ist jünger als eine Stunde, es wurde nichts geholt. Der Normalfall. |
| `failed` | GitHub hat nach `attempts` Versuchen nicht geliefert. **Der Cache steht unverändert.** `err` nennt den Grund. |
| `breaker open` | nach drei gescheiterten Läufen greift der Tick nicht mehr zum Netz. Nach 30 Minuten geht genau ein Versuch durch. |
| `cache unreadable` | Postgres, nicht GitHub. Zählt bewusst nicht auf den Breaker. |
| `not stored` | GitHub hat geliefert, das Schreiben ist gescheitert. Auch das ist unsere Seite. |

**Gar keine Zeile** heißt, dass der Refresher nicht läuft — dann ist der Prozess
gerade erst gestartet (die erste Zeile kommt sofort, nicht nach fünf Minuten)
oder er ist abgestürzt.

Die häufigsten `err`-Werte:

- **`github answered with an unexpected status: 401`** — das Token ist abgelaufen
  oder wurde zurückgezogen. Neu ausstellen, Scope `read:user`, in Dokploy
  eintragen, Container neu starten.
- **`github answered with an unexpected status: 403`** — Rate-Limit oder
  fehlender `User-Agent`. Bei einem stündlichen Abruf ist das Limit nicht die
  Ursache; eher hat jemand den Header entfernt.
- **`github has no such user`** — `GITHUB_LOGIN` ist falsch. GitHub antwortet auf
  einen unbekannten Nutzer mit HTTP 200 und `data.user: null`, deshalb ist das
  ein eigener Fehler und sieht nicht wie ein Ausfall aus.
- **`github returned a calendar with no weeks`** — bewusst zurückgewiesen. Ein
  leerer Kalender überschreibt nie einen guten (Invariante 1).
- **`github used a contribution level this service does not know`** — GitHub hat
  das Vokabular geändert. Die Abbildung steht in
  `api/internal/contributions/github.go`, die fünf Stufen im Contract unter
  `components/schemas/ContributionLevel`. Beides zusammen ändern; der
  Contract-Test hält sie aneinander.

**Was hier nie die Antwort ist:** die Zeile in `contributions_cache` von Hand zu
setzen. Sie ist ein Cache, kein Datensatz — leeren ist folgenlos, füllen wäre
eine erfundene Zahl auf der Startseite.

---

## „`/api/contributions` antwortet 502"

Das heißt **nicht** „GitHub ist unten". Ein gespeicherter Kalender wird immer
ausgeliefert, egal wie alt. 502 heißt: es gibt keine Zeile, GitHub hat also seit
dem Anlegen dieser Datenbank noch nie geantwortet.

```bash
docker compose -f compose.dev.yaml exec db \
  psql -U timseil_boot -d timseil -c 'SELECT login, total_contributions, fetched_at FROM contributions_cache'
```

Keine Zeile → im Log nach `contributions refresh` sehen, der Grund steht dort
(Abschnitt oben). Der Kaltstart ist der einzige Weg zu diesem Status; er ist
deshalb auch die einzige Lage, in der Warten *nicht* hilft.

---

## „`GITHUB_LOGIN` geändert, die Zahlen sehen falsch aus"

Der Login ist der Primärschlüssel der Cache-Zeile. Nach einer Änderung legt der
nächste Tick eine **zweite** Zeile an; die alte bleibt liegen und wird nie wieder
gelesen. Kein Leck, nur Ballast:

```bash
docker compose -f compose.dev.yaml exec db \
  psql -U timseil_app -d timseil -c "DELETE FROM contributions_cache WHERE login <> 'G1NG4R'"
```

Bis der erste Tick nach der Änderung durch ist, antwortet der Endpoint 502 — es
gibt für den neuen Login noch nichts.

---

## Eine Anfrage im Log wiederfinden

Jede Antwort trägt `X-Request-Id`, jede Fehlerantwort denselben Wert als
`requestId` im Body.

```bash
docker compose -f compose.dev.yaml logs api | grep 0a3ea5d8730791a5e0f0b02ae6e2687f
```

Ab F1 findet dieselbe ID auch die Zeilen des Web-Containers.

Was **nicht** im Log steht und auch nicht hingehört: die Query-Zeichenkette und
die Client-Adresse im Klartext. `client` ist ein Hash. Die Sondierungspfade
`/healthz` und `/readyz` protokollieren auf `debug`, sonst wären sie der größte
Teil des Logs.

---

## Die Umgebungsvariablen

**Zwei** haben keinen Default: `DATABASE_URL` und, seit C5, `GITHUB_TOKEN`. Alle
anderen stehen mit ihrem Default in `.env.example`; ein leerer Wert bedeutet
„nimm den Default", damit die Zahlen nur an einer Stelle existieren — in
`api/internal/config`.

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | — | Pflicht, Rolle `timseil_app` |
| `LOG_LEVEL` | `info` | |
| `REQUEST_TIMEOUT` | `15s` | Obergrenze pro Anfrage |
| `SHUTDOWN_GRACE` | `20s` | Entwässerungsfrist |
| `DB_MAX_CONNS` / `DB_MIN_CONNS` | `10` / `2` | Rechnung in ADR 0014 |
| `DB_STATEMENT_TIMEOUT` | `5s` | |
| `DB_LOCK_TIMEOUT` | `2s` | |
| `DB_IDLE_TX_TIMEOUT` | `10s` | |
| `RATE_LIMIT_RPM` / `RATE_LIMIT_BURST` | `120` / `60` | |
| `TRUSTED_PROXY_CIDRS` | leer | leer heißt: keinem Header glauben |
| `CORS_ALLOWED_ORIGINS` | drei Origins | erst ab C6 ausgewertet |
| `SITE_SYSTEM_SLUG` | `timseil-dev` | worüber `/api/health` berichtet |
| `GITHUB_TOKEN` | — | Pflicht, PAT mit Scope `read:user`. Das einzige Geheimnis hier. |
| `GITHUB_LOGIN` | `G1NG4R` | wessen Kalender — und der Schlüssel der Cache-Zeile |

---

## Die Pool-Timeouts nachsehen

```bash
docker compose -f compose.dev.yaml exec db \
  psql -U timseil_boot -d timseil -c \
  "SELECT application_name, state, query FROM pg_stat_activity WHERE application_name = 'timseil-api'"
```

`application_name` ist gesetzt, damit eine hängende Sitzung zuzuordnen ist. Die
drei Timeouts reisen im Startup-Paket mit; dass sie ankommen, prüft
`make check-db` (`api/internal/db/pool_db_test.go`), und zwar indem es den Server
fragt statt die Konfiguration.
