# Runbook — Die Produktions-Topologie

**Leser:** ich, wenn der Stack nicht hochkommt, und ich, wenn er hochkommt und
etwas Falsches tut.

`compose.yaml` ist die Datei, die Dokploy auf dem VPS fährt. Sie ist auch die
Datei, die `make check-topology` hier fährt — dieselbe Datei, dieselben Images,
und das ist der ganze Punkt. ADR 0027 (diese Entscheidung), ADR 0026 (die
Images und der Healthcheck im Binary), ADR 0014 (`stop_grace_period` und der
Drain), ADR 0011 (die zwei Rollen), Issue #28.

Die Kette ist **`db → migrate → seed → api → web`**. Fünf Dienste, nicht die
vier, die der Bauplan zeichnet — ADR 0027 §2 sagt warum.

---

## Der Alltag

```bash
make images          # baut api und web, lokal UND unter dem ghcr-Namen
make check-topology  # die Abnahme: von Null, zweimal, plus der kaputte Fall
make prod            # denselben Stack starten und laufen lassen
make prod-down       # anhalten, Datenbank behalten
make prod-reset      # anhalten und das Volume wegwerfen
```

`make prod` und `make check-topology` rufen `require-network` selbst auf.
`prod-down` und `prod-reset` brauchen es nicht — **nachgemessen:** Compose löst
ein `external:`-Netz erst beim Anlegen von Containern auf, nicht beim Abräumen.

`make prod` braucht `IMAGE_TAG` nicht — das Makefile exportiert es. Wer `docker
compose -f compose.yaml` von Hand tippt, braucht es:

```bash
export IMAGE_TAG=sha-$(git rev-parse --short=7 HEAD)
```

Ohne die Variable verweigert Compose die Interpolation und sagt, welche fehlt.
Das ist Absicht: ein Default wie `:-latest` deployte, was zuletzt gepusht wurde.

---

## Der Stack kommt nicht hoch

**Erst nachsehen, wer wartet.** `depends_on` heißt, dass ein Fehler weiter unten
als Stille weiter oben ankommt.

```bash
docker compose -f compose.yaml ps -a
```

| Bild | Heißt |
|---|---|
| `migrate exited 1` | Die Migration ist gescheitert. Alles darüber wurde **angelegt und nie gestartet** — das ist richtig so |
| `migrate exited 0`, `seed exited 1` | Schema da, Inhalt nicht. Meist die falsche Rolle: der Seed läuft als `timseil_app` |
| `db unhealthy` | `pg_isready` antwortet nicht. Logs von `db`, nicht von `api` |
| `api created`, sonst nichts | Eine Bedingung darunter ist nie erfüllt worden. `ps -a` zeigt welche |
| `api unhealthy` | Der Prozess läuft und `/readyz` sagt 503 — siehe unten |

**„created" ist kein Fehlerzustand, sondern eine Auskunft:** Compose legt die
nachgelagerten Container an, bevor es die Bedingung auswertet, und startet sie
dann nicht. Ein `api` mit `StartedAt = 0001-01-01` hat nie einen Prozess gehabt.
Genau das prüft `make check-topology` als kaputten Fall.

---

## `migrate` ist mit 1 rausgegangen

```bash
docker compose -f compose.yaml logs migrate
```

Drei Ursachen, in der Reihenfolge, in der sie vorkommen:

1. **`MIGRATE_DATABASE_URL is empty`** — die Variable fehlt in Dokploy. Sie
   trägt `timseil_migrate`, nicht `timseil_app`, und der `api`-Dienst bekommt
   sie absichtlich nie.
2. **`cannot reach the database as timseil_migrate`** — die Rolle gibt es nicht.
   Das passiert, wenn das Volume aus einer Zeit stammt, in der
   `ops/postgres/initdb/10-roles.sh` anders aussah: das Skript läuft **nur** beim
   Anlegen eines leeren Datenverzeichnisses. In Produktion heißt das: Volume
   wegwerfen ist keine Option, also die Rolle von Hand anlegen und das Skript
   für das nächste Mal korrigieren.
3. Eine echte SQL-Fehlermeldung. Dann ist es die Migration, und
   `docs/runbooks/migrations.md` ist das richtige Blatt.

**Ein Rollback des Images rollt das Schema nicht mit zurück.** Deshalb
expand/contract, in zwei Deploys — siehe `docs/runbooks/migrations.md`.

---

## `api` bleibt unhealthy

Der Healthcheck steht **im Image**, nicht in `compose.yaml`, und er fragt
`/readyz`. Es gibt keine Shell im Container, aber das Binary beantwortet die
Frage selbst:

```bash
docker compose -f compose.yaml exec api /api -healthcheck; echo $?
docker inspect $(docker compose -f compose.yaml ps -q api) \
  --format '{{json .State.Health}}'
```

`/readyz` antwortet 503, wenn Postgres nicht erreichbar ist **und** während der
Prozess entwässert. Ersteres steht im Log des Prozesses, einmal, statt alle fünf
Sekunden — dort nachsehen, nicht in der Healthcheck-Ausgabe, die absichtlich
leer ist.

**Wenn der Container immer wieder neu startet:** `restart: unless-stopped` plus
ein Healthcheck, der nie grün wird, sieht aus wie eine Schleife. Der Grund steht
in den ersten zwanzig Zeilen nach jedem Start, meist aus `config.Load`.

---

## `web` bleibt unhealthy

Der Healthcheck holt `/`. Solange keine Seite die API server-seitig liest, ist
ein `web unhealthy` also ein Problem von `web` allein.

**Das ändert sich in Stufe G**, und dann ist es eine Frage: ein API-Ausfall
würde die Seite 500 werfen lassen, `web` als unhealthy markieren und neu starten
— aus einem Ausfall würden zwei. Steht als Zeile im Backlog.

`web` läuft read-only mit zwei tmpfs (`/tmp` und `/app/.next/cache`). Wenn es
mit einem Schreibfehler auf einen dritten Pfad stirbt: den Pfad notieren, hier
eintragen, und die ehrliche Zwischenlösung ist `read_only` für `web` zu
entfernen — der Bauplan verlangt read-only nur für die API.

---

## psql in Produktion

Postgres veröffentlicht keinen Port. Der Weg führt durch den Container:

```bash
docker compose -f compose.yaml exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

`$POSTGRES_USER` ist `timseil_boot`, der Bootstrap-Superuser. Für alles, was kein
Notfall ist, sind `timseil_migrate` und `timseil_app` die richtigen Rollen.

**`timseil_test` gibt es hier nicht**, und das ist Absicht: die Testdatenbank
entsteht nur, wenn `POSTGRES_CREATE_TEST_DB` gesetzt ist, und das tut allein
`compose.dev.yaml`. Wer sie in Produktion findet, hat ein Volume aus einer
älteren Fassung des Skripts vor sich.

---

## Die Grenzen nachsehen

Geschrieben steht das in `compose.yaml`. Angewendet ist etwas anderes:

```bash
for s in db api web; do
  docker inspect $(docker compose -f compose.yaml ps -q $s) --format \
    '{{.Name}} mem={{.HostConfig.Memory}} cpu={{.HostConfig.NanoCpus}} ro={{.HostConfig.ReadonlyRootfs}}'
done
docker stats --no-stream
```

**Zwei Zahlenpaare bewegen sich zusammen** und keine Laufzeit merkt es von
selbst, wenn nur eine davon wandert:

| Wenn du änderst | Ändere mit |
|---|---|
| `api` → `limits.memory` | `GOMEMLIMIT` (80 % davon, minus tmpfs) |
| `web` → `limits.memory` | `NODE_OPTIONS=--max-old-space-size` |

Ein OOM-Kill sieht in den Logs nach nichts aus: der Container ist einfach weg.
`docker inspect ... --format '{{.State.OOMKilled}}'` ist die Frage, die es sagt.

---

## Warum hier kein `healthcheck:` steht

Für `api` und `web`: weil er im Image steht und Compose ihn erbt. Zwei Fassungen
sind eine, die driftet — `make check-compose` weist eine zweite ab.

Für `db`: er steht da, weil `postgres:18.6-alpine` keinen mitbringt.

Für `migrate` und `seed`: `healthcheck: disable`. Der geerbte fragt einen Server,
und diese beiden sind keiner; ohne das Abschalten wartete `--wait` auf einen
Port, der nie aufgehen sollte.

---

## Was diese Datei nicht darf

`make check-compose` weist jedes davon ab, mit der Zeilennummer:

- ein `build:` — gebaut wird in Actions, nie auf dem VPS
- ein `ports:` oder ein Traefik-Label an `db`
- ein Bind Mount, der nicht `./ops/…:ro` ist
- ein Dienst ohne Memory-Limit
- ein `env_file:`
- ein `ghcr.io`-Image ohne `${IMAGE_TAG}`
- ein `healthcheck:` an `api` oder `web`
- ein Postgres-Tag, das von `compose.dev.yaml` abweicht

Dazu die fünf aus D3 — alle fünf sind Wege, auf denen Proxy und Stack einander
verlieren, **ohne dass etwas rot wird**:

- `api` oder `web` ohne vollständigen Label-Satz: `traefik.enable`,
  `traefik.docker.network`, eine Router-Regel und ein
  `loadbalancer.server.port`
- ein `loadbalancer.server.port`, den der Dienst nicht per `expose:` anbietet
- `api` oder `web` ohne **beide** Netze — oder `db` **mit** dem Proxy-Netz
- ein benutztes `dokploy-network` ohne `external: true`
- eine Router-Regel ohne explizite `priority`

Jede dieser Regeln hat ihren kaputten Fall in `tools/selftest.sh`. Wer eine
ändert, ändert den Fall mit — sonst prüft sie nichts mehr.

---

## Die zwei Netze

Seit D3 liegen `api` und `web` in **zwei** Netzen, die anderen drei in einem.

| Dienst | Netze | Warum |
|---|---|---|
| `db`, `migrate`, `seed` | `default` | Sie sprechen niemanden außerhalb des Stacks an. Die Sicherheitsregel wird hier durch **Abwesenheit** durchgesetzt, nicht durch ein Label |
| `api`, `web` | `default` **und** `dokploy-network` | `default`, um `db` bzw. `api` zu erreichen · `dokploy-network`, damit Traefik sie erreicht |

**Die Falle:** Ein Dienst, der `networks:` schreibt, liegt **nur** in den
genannten Netzen. `networks: [dokploy-network]` allein nähme der API also die
Datenbank weg — und der Ausfall sähe aus wie ein Datenbankproblem, nicht wie ein
Tippfehler. `make check-compose` weist beide Hälften ab, und
`make check-topology` misst sie am laufenden Container statt sie zu glauben.

`dokploy-network` ist `external:` — auf dem VPS gehört es Dokploy, und nichts
hier legt es an oder räumt es weg. Auf jeder anderen Maschine existiert es
nicht, und Compose verweigert dann den Start. Deshalb:

```bash
make require-network   # legt lokal ein leeres Ersatzstück an, idempotent
```

`make prod` und `make check-topology` rufen es selbst auf. Der Beweis, dass D3
D2s Abnahmekriterium nicht kaputtgemacht hat, ist ein Kommando:

```bash
docker network rm dokploy-network && make check-topology
```

Immer noch grün, immer noch von Null.

---

## Traefik

Die Router stehen als Labels an `api` und `web`. Was **nicht** hier steht,
gehört Dokploys Traefik auf dem Host: Entrypoint-Namen, Certresolver, TLS-Optionen,
der globale HTTP→HTTPS-Redirect und der Metrik-Endpoint.
`docs/runbooks/dokploy.md` ist das Blatt dafür.

| Router | Regel | Priorität |
|---|---|---|
| `timseil-api` | Apex oder www **und** `PathPrefix(/api)` | 100 |
| `timseil-web` | Apex oder www | 10 |

Die Prioritäten stehen ausdrücklich da. Ohne Angabe sortiert Traefik nach
**Regellänge** — die API-Regel gewänne heute zufällig und hörte damit auf, sobald
jemand die Regel umformuliert. Der Fehler wäre still: Next.js beantwortete
`/api/*` mit seiner eigenen 404-Seite, während die Seite selbst normal aussieht.

`www` bekommt einen 301 auf die Apex-Domain, über die Middleware
`timseil-www@docker`. Sie ist **einmal** an `web` definiert und wird von beiden
Routern referenziert; der Docker-Provider registriert Middlewares global.

**Das `$$` in der Ersetzung ist kein Tippfehler.** Compose interpoliert `$` und
äße `${1}` auf, bevor Traefik es sieht. Nachgemessen am laufenden Container:
`$${1}` in der Datei kommt als `${1}` am Label an.

**Was bis L3 offen ist, und es steht hier, damit es niemand übersieht:**
`PathPrefix(/api)` routet auch `/api/internal/probe` und `/api/internal/deploy`.
Beide sind von außen erreichbar und tragen genau **eine** Verteidigung, ihr
Token — Kapitel 29 des Handbuchs verlangt zwei. L3 zieht die zweite ein und muss
dabei #40 auflösen.

---

## Das rollende Labor

`compose.lab.yaml` legt ein eigenes Traefik vor denselben Stack, auf
`127.0.0.1:8080`, damit der Zehn-Sekunden-404-Trichter aus
[#143](https://github.com/G1NG4R/timseil-dev/issues/143) reproduzierbar ist,
ohne dafür jedes Mal einen Merge und einen öffentlichen Ausfall auszugeben.

```bash
make images          # IMAGE_TAG folgt HEAD, ein neuer Commit braucht einen neuen Build
make rolling-lab
make witness WITNESS_UNTIL="--seconds 60" WITNESS_BASE=http://127.0.0.1:8080
make rollout         # die vier Schritte, die auch Dokploy fährt
make rolling-lab-down
```

**Ein Rollout braucht einen anderen Tag als den laufenden**, sonst legt Compose
nichts neu an und die Messung zeigt einen Deploy, den es nicht gab — dieselbe
Falle wie beim Zeugen, der das falsche Fenster erwischt. Im Labor reicht ein
zweiter Name für dasselbe Image:

```bash
docker tag ghcr.io/g1ng4r/timseil-api:sha-$(git rev-parse --short=7 HEAD) \
           ghcr.io/g1ng4r/timseil-api:sha-labbbb1
docker tag ghcr.io/g1ng4r/timseil-web:sha-$(git rev-parse --short=7 HEAD) \
           ghcr.io/g1ng4r/timseil-web:sha-labbbb1
IMAGE_TAG=sha-labbbb1 tools/rollout.sh --run \
  -f compose.yaml -f compose.rollout.yaml -f compose.lab.yaml
```

**Was das Labor beweist, ist genau eine Sache:** Traefiks Docker-Provider liest
Router von Container-Labels, und ein Router verschwindet, solange sein Container
neu angelegt wird. Was es nicht nachbildet — TLS, ACME, die Host-Regeln, der
www-Redirect, Dokploys eigene Traefik-Konfiguration — steht im Kopf der Datei.
Eine hier gemessene Zahl ist eine Zahl über Compose und den Provider, nicht über
die Produktion.

### Was am 22.08.2026 gemessen wurde

**Der Ist-Zustand**, `up -d --force-recreate`, drei Läufe: `/` verliert 10–11
Stichproben an `404`, dazu eine ohne Verbindung, über ein Fenster von 11–15
Sekunden. Gleiche Größenordnung und **dieselbe Antwort** wie die zehn Sekunden,
die der Drill gegen Produktion gesehen hat. Das Labor bildet den Fehler ab.

**Der Zweizeiler aus dem Bauplan ist in beiden Hälften falsch**, und beides ist
jetzt gemessen statt vermutet:

```bash
docker compose up -d --no-deps --scale api=2 --wait api   # legt den ALTEN Container neu an
docker compose up -d --no-deps --scale api=1 --wait api   # entfernt den NEUEN, höchster Index
```

Die erste Zeile meldet `Container timseil-api-1 Recreate` — der bestehende
Container geht mit runter, statt stehen zu bleiben. Damit tut der Rollout genau
das, was er verhindern soll. Die zweite entfernt `api-2`, also den gerade
gestarteten.

**Die Folge, die trägt** — drei Schritte statt zwei:

```bash
docker compose up -d --no-deps --no-recreate --scale api=2 --wait api
docker stop <alter-container> && docker rm <alter-container>
docker compose up -d --no-deps --no-recreate --scale api=1 --wait api
```

`--no-recreate` ist der ganze Unterschied im ersten Schritt: der neue Container
kommt dazu, der alte bleibt stehen und trägt weiter seinen Router. Der zweite
Schritt muss den alten Container **beim Namen** entfernen, weil Compose sonst
den falschen wegnimmt. Der dritte fasst nichts mehr an — nachgemessen: `Container
timseil-api-2 Running`, kein Neuanlegen, keine Neunummerierung.

**Ergebnis, drei Läufe, identisch:** kein einziges `404` mehr. Übrig bleibt je
Dienst **ein** Ausschlag — eine Anfrage ohne Verbindung auf `/`, eine `502` auf
`/api/health`.

Das ist kein Rest-Rauschen, sondern die Fehlerart aus
[#65](https://github.com/G1NG4R/timseil-dev/issues/65): der alte Container hört
auf anzunehmen, bevor Traefik ihn aus dem Pool genommen hat. **Damit hat
`SHUTDOWN_DELAY` eine Messung, an der es bemessen werden kann** — das war der
Grund, es aus C1 nach E5 zu verschieben. Ob `--rm -f` oder ein sauberes
`docker stop` verwendet wird, ändert nichts daran; beides gemessen.

### Was am 22.08.2026 danach gemessen wurde — die Reparatur

Dieselbe Anlage, dieselbe Methode, ein Tag-Wechsel statt eines `--force-recreate`,
damit gemessen wird, was ein Deploy tut und nicht was ein Neustart tut.

**Die Grundlinie auf dieser Anlage**, `up -d --remove-orphans` mit neuem Tag —
also das, was Dokploy von sich aus tut:

| | `/` | `/api/health` |
|---|---|---|
| `200` | 56 | 62 |
| `404` | **13** | **8** |
| `502` | 1 | — |

**Die Vier-Glieder-Kette** (`tools/rollout.sh`), drei Läufe:
**kein einziges `404` mehr.** Übrig blieb je Lauf **eine** Anfrage, und sie kam
nicht abgelehnt zurück — **sie hing.** Die Lückenzeile des Zeugen sagt es: um
die verlorene Stichprobe herum tragen drei bis vier Sekunden gar keine Probe,
also lief die Anfrage in ihr Zeitlimit. Der Container war weg, seine Adresse
gehörte niemandem mehr, und Pakete dorthin verschwinden, statt zurückgewiesen zu
werden.

Das ist die Fehlerart aus [#65](https://github.com/G1NG4R/timseil-dev/issues/65),
und **`retry` kann sie nicht auffangen**: Traefik wiederholt eine Anfrage, die
scheitert, nicht eine, die hängt. Nachgemessen, mit `retry` an beiden Routern —
zwei verlorene Stichproben statt einer, also keine Änderung.

**Was sie auffängt, sind zwei Pausen und ihr Leser:**

| Hälfte | Was | Wirkung |
|---|---|---|
| `api` | `SHUTDOWN_DELAY=3s` | `/readyz` sagt 503, der Listener nimmt weiter an |
| `web` | `NEXT_MANUAL_SIG_HANDLE` + `/healthz` | dasselbe für einen Prozess, der kein Bereitschaftsflag hatte |
| beide | `loadbalancer.healthcheck`, 1 s | **der Leser.** Ohne ihn ist die Pause ein Knopf ohne Wirkung |

Die Reihenfolge ist an einem Container einzeln nachgeprüft, nicht aus dem
Ergebnis geschlossen — eine Sekunde nach `docker compose stop web`:

```
HTTP/1.1 503 Service Unavailable        ← /healthz, direkt im Container
{"level":"INFO","msg":"shutdown requested, readiness is now 503","delay":"3000ms"}
{"level":"INFO","msg":"leaving","signal":"SIGTERM"}
```

Der Listener hat also geantwortet, während er schon 503 sagte. Genau das ist das
Fenster.

**Ergebnis, drei Läufe, identisch:**

```
/               110 requests, 110×200
/api/health     110 requests, 110×200

  ✓ every answer was 200
```

**Die Zahlen gelten für Compose und den Docker-Provider auf dieser Maschine.**
Die Abnahme der Stufe ist ein echter Deploy, und die steht oben im Kopf von
`compose.lab.yaml`, damit sie niemand mit dieser hier verwechselt.

**Nebenbefund:** die Indizes wandern. Nach jedem Durchlauf heißt der überlebende
Container eine Nummer höher (`api-1` → `api-2` → `api-3`). Harmlos — Compose
findet ihn über das Label, nicht über die Nummer — aber wer `docker logs
timseil-api-1` in ein Runbook schreibt, schreibt etwas, das nach dem ersten
Rollout nicht mehr stimmt. Das ist derselbe Grund, aus dem oben schon
`docker ps | grep` statt eines festen Namens steht.
