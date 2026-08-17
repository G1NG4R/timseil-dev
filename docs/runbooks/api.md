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

Nur `DATABASE_URL` hat keinen Default. Alle anderen stehen mit ihrem Default in
`.env.example`; ein leerer Wert bedeutet „nimm den Default", damit die Zahlen nur
an einer Stelle existieren — in `api/internal/config`.

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
