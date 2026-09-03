# Runbook — Der API-Prozess

**Leser:** ich, wenn der Container startet und sofort wieder aussteigt, ich,
wenn jemand schreibt, die API antworte mit 429 und er wisse nicht warum, und ich,
wenn jemand sagt, er habe über das Formular geschrieben und nie eine Antwort
bekommen.

Der Prozess ist `api/cmd/api`. Konfiguration in `api/internal/config`, Pool in
`api/internal/db`, Kette in `api/internal/middleware`, Routen in
`api/internal/server`, Handler in `api/internal/health` und
`api/internal/systems`. Das Kontaktformular liegt in `api/internal/contact`, der
Versand in `api/internal/mail`, Breaker und Backoff in
`api/internal/resilience`. Die drei Badges in `api/internal/badge`, die zwei
internen Endpoints in `api/internal/intake` und ihr Wächter in
`api/internal/middleware/bearer.go`. ADR 0014 (Lebenszyklus), ADR 0015 (Kette),
ADR 0016 (Zugriff und Router), ADR 0009 (Fehlermodell), ADR 0011 (Rollen),
ADR 0017 (Fenster, Rasterlücken, Fehlerabbildung der Systems-Endpoints),
ADR 0021 (Kontaktformular und Versand), ADR 0022 (Badges),
ADR 0023 (interne Endpoints).

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

**`GITHUB_TOKEN is empty — a personal access token with scope read:user`** — die
zweite Variable ohne Default, seit C5. Sie steht **absichtlich nicht** in
`.env.example`: die Datei ist eingecheckt, ein Token darin wäre ein Token im
Repository. Eins bauen unter `github.com/settings/tokens`, Scope `read:user` und
sonst nichts, und in `.env` eintragen.

Compose prüft das **nicht** vorab, und das ist Absicht: ein `${GITHUB_TOKEN:?}`
im Compose würde beim Interpolieren des ganzen Dokuments greifen und damit auch
`make check-db` und `make migrate` anhalten — zwei Ziele, die diesen Dienst nie
starten und mit GitHub nichts zu tun haben. Die Meldung sähe dann wie eine
kaputte Migration aus. Die Verweigerung gehört dem Prozess.

Warum der Prozess deswegen gar nicht erst startet: die Startseite verspricht
einen Contribution-Graph. Ein Prozess, der fröhlich läuft und ihn nie holen kann,
zeigt dauerhaft `— NO DATA` und nennt das eine Messung. Das ist Invariante 1 in
Startaufstellung.

**`GITHUB_TOKEN contains a line break`** — beim Einfügen ist ein Zeilenumbruch
mitgekommen. Der Wert geht in einen `Authorization`-Header; ein `\n` darin hängt
fremde Header an. Dieselbe Klasse wie die CRLF-Regel für Mail-Felder in C6.

**`CONTACT_IP_PEPPER is …` · `INTERNAL_PROBE_TOKEN is …` · `INTERNAL_DEPLOY_TOKEN
is …`** — die drei aus C6 und C7, und sie haben dieselbe Form: kein Default,
mindestens 32 Zeichen, kein Zeilenumbruch, und **der Wert steht in keiner
Meldung**. Ein Prozess, der gleich abbricht, druckt sonst ein Geheimnis ins
Container-Log. Alle drei mit `openssl rand -hex 32`, je einmal.

Damit sind es **fünf** ohne Default. Die Zahl wächst mit jeder Phase, und nichts
hält `.env.example`, `config.go`, `compose.dev.yaml` und die Tabelle unten
gegeneinander — das ist als Prüfung für E2 gefiltert.

### Die Kaskade

```
DB_STATEMENT_TIMEOUT  5s  <  REQUEST_TIMEOUT 15s  <  SHUTDOWN_GRACE 20s

SHUTDOWN_DELAY 3s  +  SHUTDOWN_GRACE 20s  <  stop_grace_period 30s
```

Die erste Zeile erzwingt der Start. Die zweite seit E5b auch: `config.Load`
weist eine Kombination ab, bei der Verzögerung plus Gnadenfrist über
`stop_grace_period` hinausreicht — dann käme SIGKILL mitten in die Entwässerung,
und die Höflichkeit wäre ein Schnitt.

**`stop_grace_period` steht im Compose, und der Prozess kann es nicht lesen.**
Deshalb steht die Zahl als Konstante `stopGracePeriod` in `config.go` noch
einmal — eine Kopie, und Kopien driften. `make check-compose` weist die beiden
zurück, wenn sie auseinanderlaufen. Dockers Default wären zehn Sekunden, also
kürzer als die Gnadenfrist allein.

---

## Ein Shutdown von Hand ansehen

```bash
docker compose -f compose.dev.yaml stop api
docker compose -f compose.dev.yaml logs api | tail -4
```

Erwartet:

```
{"level":"INFO","msg":"shutdown requested, readiness is now 503","delay":"3s","grace":"20s"}
{"level":"INFO","msg":"draining","grace":"20s"}
{"level":"INFO","msg":"drained cleanly"}
```

**Zwischen der ersten und der zweiten Zeile liegen drei Sekunden, und das ist
kein Hänger.** `/readyz` antwortet ab der ersten Zeile 503, der Listener nimmt
aber weiter an — das ist das Fenster, in dem Traefik diesen Container aus seinem
Pool nimmt, bevor seine Adresse verschwindet. `SHUTDOWN_DELAY=0` schaltet es ab,
und ohne Proxy davor ist 0 die richtige Einstellung.

Fehlen die Zeilen, hat der Prozess kein Signal bekommen. In der Entwicklung
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

`0` ist der Normalzustand vor dem ersten Lauf: **der Seed schreibt Inhalt,
niemals Messungen.** Erfundene Betriebsdaten in der Datenbank sind genau das,
wogegen diese Seite gebaut ist — `docs/runbooks/seed.md`.

**Seit F5 füllt diese Tabelle jemand**, also lohnt bei `0` eine zweite Frage.
Die Schleife schließt jeden Lauf mit **einer** Zeile ab, und deren Zustand sagt,
wo es hakt:

```bash
docker compose -f compose.yaml logs --tail 200 api | grep '"msg":"metric snapshot"'
```

| `state` | heißt |
|---|---|
| `written` | geschrieben. Der Normalfall, alle fünf Minuten. Steht eine `value refused`-Zeile davor, trägt die Zeile in einer Spalte `null`. |
| `nothing measured` | Prometheus hat geantwortet und hatte nichts: in fünf Minuten kam keine Anfrage am Proxy an. **Kein Fehler**, und es wird bewusst keine Zeile geschrieben. |
| `not measured` | Prometheus war nicht erreichbar. `err` nennt den Grund. **Der letzte gültige Wert bleibt stehen und altert** — genau so ist es gemeint.  **Direkt nach einem Deploy ist diese Zeile der Normalfall**, keine Diagnose: die Schleife läuft sofort beim Start und trifft den Alias `timseil-prometheus`, während dessen Container gerade neu erzeugt wird — DNS antwortet dann `server misbehaving`. Der nächste Tick heilt es. Steht sie über mehrere Ticks, ist sie echt. |
| `discarded` | dieser Augenblick war schon aufgezeichnet. Nichts geschrieben, nichts verloren. Praktisch nur bei einem Rollout erreichbar, weil der Zwilling dieselbe Schleife fährt — `measured_at` ist Prometheus' Uhr auf die Millisekunde. |
| `no such system` | `SITE_SYSTEM_SLUG` benennt keine Zeile in `systems`. **Das repariert kein Warten.** |
| `value refused` | eine Zahl außerhalb dessen, was die Spalte annimmt (`±Inf`, negativ, Quote über 1). **Kein Abschluss** — der Lauf geht weiter und endet mit `written` oder `nothing measured`. Das Feld wird `null`, die andere Zahl überlebt, und **`null` ist ab dann das, was die Seite für dieses Feld zeigt**, bis der nächste Lauf es misst. |
| `system unreadable` / `not stored` | Postgres, nicht Prometheus. Unsere Seite. |

**Gar keine Zeile** heißt fast immer, dass die Schleife nicht läuft — entweder
ist der Prozess gerade erst gestartet (die erste Zeile kommt sofort, nicht nach
fünf Minuten), oder `SNAPSHOTS_TRANSPORT=off`. Der zweite Fall sagt es beim
Start:

```
{"level":"WARN","msg":"metric snapshots are NOT being taken — SNAPSHOTS_TRANSPORT is off", ...}
```

`compose.dev.yaml` setzt ihn auf `off`, weil dort kein Prometheus läuft. **In
Produktion steht er auf `prometheus`, und der Default sorgt dafür, dass eine
vergessene Variable das nicht ändert.**

**Die eine Ausnahme zu „jeder Lauf schreibt eine Zeile": der Shutdown.** Wird
eine laufende Abfrage vom Herunterfahren abgebrochen, kehrt der Lauf still
zurück — `context.Canceled` ist dieses Paket beim Beendetwerden, nicht beim
Scheitern, und eine ERROR-Zeile dafür riefe bei jedem Deploy Wolf. Fehlt die
Zeile also genau im Fenster eines Neustarts, ist das der Normalfall und keine
Diagnose.

**Und wenn `uptime90d` allein `null` ist**, während die anderen beiden Zahlen
stehen: die Verfügbarkeit kommt nicht aus Prometheus, sondern aus `ops_days` —
also aus der externen Sonde. Dann ist Schritt 3 die Frage, nicht diese hier.
ADR 0041 §1, `docs/slo.md`.

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

**Wenn `CONTRIBUTIONS_TRANSPORT=off` gilt, ist 502 der Normalzustand** und kein
Vorfall: der Refresher läuft nicht, also wird nie eine Zeile geschrieben. Beim
Start steht eine Warnung im Log, die das sagt:

```
{"level":"WARN","msg":"the contribution calendar is NOT being refreshed — CONTRIBUTIONS_TRANSPORT is off", ...}
```

Der Schalter ist da, damit ein Container ohne echten Token startbar ist — eine
Handprüfung, ein CI-Job. **In Produktion steht er auf `github`, und der Default
sorgt dafür, dass eine vergessene Variable das nicht ändert** (ADR 0026 §4).

---

## Ein Produktions-Image untersuchen, das keine Shell hat

`docker exec … sh` schlägt fehl, und das ist der Sinn des Basis-Images. Drei
Wege, die trotzdem funktionieren:

```bash
# 1. Was der Prozess sagt — er redet JSON auf stdout, das reicht meistens.
docker logs <container>

# 2. Die Bereitschaft von innen, mit dem einzigen Werkzeug, das drin liegt.
docker exec <container> /api -healthcheck; echo $?     # 0 = bereit, 1 = nicht

# 3. Was Docker selbst gesehen hat, inklusive der Exit-Codes der letzten Proben.
docker inspect --format '{{json .State.Health}}' <container>
```

Der Exit-Code aus 2 ist die ganze Antwort — die Sonde druckt nichts. Sie liest
weder die Konfiguration noch öffnet sie den Pool, also sagt eine 1 genau eine
Sache: `/readyz` hat nicht mit 200 geantwortet. Warum, steht im Log aus 1.

Braucht man wirklich ein Werkzeug im Container, ist der Weg **nicht**, eins ins
Image zu legen, sondern eins danebenzustellen:

```bash
docker run --rm -it --network container:<container> alpine sh
```

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

## „Das Formular antwortet 502"

Das heißt: die Nachricht **ist gespeichert** und das Relay hat sie nicht
genommen. Nichts ist verloren, und der Dispatcher kommt in Minuten wieder.

```bash
docker compose -f compose.dev.yaml exec db psql -U timseil_boot -d timseil -c \
  "SELECT id, delivery_status, delivery_attempts, left(last_error, 80) AS last_error
     FROM contact_messages WHERE delivery_status <> 'sent' ORDER BY received_at"
```

| `delivery_status` | Bedeutung | Was zu tun ist |
|---|---|---|
| `queued`, `attempts` 1–4 | der Dispatcher versucht es weiter | warten, Zeitplan unten |
| `queued`, `attempts` 0 | nie versucht — Stundenbudget war leer | nichts, der nächste Takt holt sie |
| `failed` | aufgegeben, ein Mensch ist dran | Adresse aus der Zeile lesen, von Hand antworten |

Der Zeitplan der Wiederholungen ist `received_at + 2 min × (2^Versuche − 1)`,
also **0, 2, 6, 14, 30 Minuten** nach Eingang. Nach fünf Versuchen steht die
Zeile auf `failed`, und im Log steht eine `ERROR`-Zeile mit `contact message
given up on`.

Häufige `last_error`-Werte:

| Beginnt mit | Heißt | Handlung |
|---|---|---|
| `dial tcp … connection refused` | Relay nicht erreichbar | warten; wenn es bleibt, OVH-Status prüfen |
| `535 …` | Zugangsdaten abgelehnt | `SMTP_PASSWORD` in Dokploy erneuern |
| `550 …` | dauerhaft abgelehnt | `MAIL_TO` prüfen; die Zeile steht schon auf `failed` |
| `context deadline exceeded` | Relay antwortet zu langsam | warten |

**Was hier nie die Antwort ist:** die Zeile von Hand auf `sent` setzen. Dann ist
die Nachricht aus der Warteschlange und nicht zugestellt, und niemand erfährt es.
Wer sie loswerden will, setzt sie auf `failed` und beantwortet sie selbst.

---

## „Niemand bekommt Mail, aber alles ist grün"

Der wahrscheinlichste Fall zuerst:

```bash
docker compose -f compose.dev.yaml logs api | grep "MAIL_TRANSPORT is log" | head -1
```

Steht die Zeile da, sendet der Prozess **nicht** — er baut die Mail vollständig
und schreibt sie in eine Logzeile. Das ist die Entwicklungseinstellung, und sie
wird beim Start einmal laut gemeldet, weil sie sonst erst durch ein leeres
Postfach auffällt. In Produktion gehört `MAIL_TRANSPORT=smtp`; der Default ist
`smtp`, man muss sich also aktiv abmelden.

Die fertige Mail sieht man so:

```bash
docker compose -f compose.dev.yaml logs api | grep "mail not sent" | tail -1 \
  | python3 -c "import sys,json; l=sys.stdin.read(); print(json.loads(l[l.index('{\"time'):])['envelope'])"
```

Steht die Zeile **nicht** da, sendet der Prozess und die Warteschlange ist der
nächste Blick (Abschnitt oben). Ist auch die leer, sind die Nachrichten
zugestellt und das Problem liegt hinter dem Relay — Spam-Ordner, Weiterleitung,
oder `MAIL_TO` zeigt auf ein anderes Postfach als erwartet. Ab da ist
`docs/runbooks/mail.md` das richtige Blatt: Zone, Selektor und Zustellbarkeit
stehen dort.

---

## „Ich bekomme 429 auf `/api/contact`"

Drei pro Adresse in zehn Minuten, und die Regel wird **zweimal** geprüft. Welche
Hälfte zugeschlagen hat, sagt die Logzeile:

| Logzeile | Hälfte | Überlebt einen Neustart |
|---|---|---|
| `rate limit exceeded` | Token-Bucket im Prozess | nein |
| `contact rate limit exceeded` | Zählung in `contact_messages` | ja |

Die zwei ergänzen sich: der Bucket zählt **jede** Anfrage, auch die still
verworfenen, die nie in der Tabelle landen; die Zählung überlebt Neustart und
zweite Instanz. Deshalb gibt es beide.

`Retry-After` ist bei der zweiten Hälfte gemessen, nicht geraten — es ist der
Moment, in dem die älteste Nachricht dieser Adresse aus dem Fenster fällt:

```bash
docker compose -f compose.dev.yaml exec db psql -U timseil_boot -d timseil -c \
  "SELECT count(*), min(received_at) FROM contact_messages
    WHERE received_at > now() - interval '10 minutes' GROUP BY ip_hash"
```

**Der Wert lässt sich nicht auf eine Adresse zurückführen**, und das ist der
Zweck: `ip_hash` ist ein HMAC mit `CONTACT_IP_PEPPER`. Die acht Hexzeichen im
Feld `client` einer Logzeile sind das Präfix desselben Hashes — genug, um zwei
Absender in einem Log zu unterscheiden, und wertlos für jeden, der es liest.

---

## „Ist eine bestimmte Nachricht angekommen?"

Der Besucher zitiert seine Quittung (`msg_…`). Die findet Zeile **und** Mail:

```bash
docker compose -f compose.dev.yaml exec db psql -U timseil_boot -d timseil -c \
  "SELECT delivery_status, received_at, delivered_at, delivery_attempts, mail_message_id
     FROM contact_messages WHERE id = 'msg_01M09XX1PW2D6R9X'"
```

`mail_message_id` ist der `Message-ID`-Header und leitet sich aus der Quittung
ab, die Suche im Postfach ist also dieselbe Zeichenkette.

**Ohne Not nichts anderes aus dieser Tabelle lesen.** Sie ist die einzige mit
personenbezogenen Daten und die einzige, die die öffentliche API nie anfasst.

---

## `CONTACT_IP_PEPPER` wechseln

```bash
openssl rand -hex 32
```

Danach erkennt der Rate-Limit-Boden **keine** vorher gesehene Adresse wieder: die
alten Hashes sind mit dem alten Schlüssel gerechnet und passen zu nichts mehr.
Nichts bricht, die Zeilen bleiben stehen, sie zählen nur nicht mehr zusammen.
Zehn Minuten später ist das Fenster ohnehin durch.

Das ist zugleich die einzige Art, alle auf einmal zu vergessen — falls das je aus
Datenschutzgründen gefragt wird, ist die Rotation die Antwort und nicht ein
`DELETE`.

---

## „`/api/internal/*` antwortet 401"

Die Antwort sagt absichtlich nicht, was falsch war — kein Header, falsches
Schema und falsches Token sind byteweise dieselbe 401, und die Logzeile nennt
den Grund auch nicht (ADR 0023 §3). Diese Reihenfolge ersetzt den Hinweis, den
der Endpoint nicht gibt:

**1 · Das richtige der beiden Tokens?** Sie sind nicht austauschbar.
`INTERNAL_PROBE_TOKEN` gehört zu `/api/internal/probe`, `INTERNAL_DEPLOY_TOKEN`
zu `/api/internal/deploy`. Der häufigste Fall.

**2 · Ist beim Kopieren etwas mitgekommen?** Ein Zeilenumbruch am Ende wird beim
Start abgelehnt, ein Leerzeichen am Anfang nicht — das trimmt `config.Load`
weg. Aber ein Token, das durch eine Shell gegangen ist, kann Anführungszeichen
tragen, und die sind Teil des Werts:

```bash
docker compose -f compose.dev.yaml exec api printenv INTERNAL_PROBE_TOKEN | xxd | tail -2
```

**3 · Ist der Header überhaupt angekommen?** Ein Proxy, der `Authorization`
schluckt, sieht von hier aus wie ein falsches Token.

```bash
curl -i -XPOST localhost:8080/api/internal/probe \
  -H "Authorization: Bearer $INTERNAL_PROBE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","up":true,"latencyMs":1}'
```

204 heißt: das Token stimmt, der Weg dorthin ist es, der nicht stimmt.

**Was hier nie die Antwort ist:** dem Endpoint einen Hinweis beibringen, welcher
Teil falsch war. Das ist genau das Informationsleck, das der Build-Plan als
Abnahmekriterium ausschließt.

**Ab L3 ist 404 die richtige Antwort von außen**, nicht 401 — der Traefik blockt
den Präfix, und ein 401 von außen verriete, dass es den Pfad gibt. Von innen
bleibt es bei 401.

---

## Die internen Tokens wechseln

```bash
openssl rand -hex 32   # je einmal pro Variable
```

Zwei Stellen pro Token, und sie müssen zusammen wandern: die Variable in Dokploy
**und** das Secret in dem GitHub-Workflow, der sie benutzt — F4 für die Sonde,
E4 für die Pipeline. Dazwischen liegt ein Fenster, in dem der Aufrufer 401
bekommt.

Für die Sonde ist das folgenlos: eine ausgefallene Messung ist eine Lücke, und
eine Lücke rendert als `nodata` und nicht als Ausfall (Invariante 6). Für die
Pipeline gilt dasselbe mit anderem Vorzeichen — ein verlorener Deploy-Bericht
ist ein Balken, der fehlt, und **nichts holt ihn nach**. Also: Token wechseln,
wenn kein Deploy läuft.

---

## Den Versand wirklich prüfen

C6 konnte es nicht — das OVH-Postfach und die DNS-Einträge waren L1. Was in C6
geprüft ist: der SMTP-Dialog gegen einen echten Listener im Test, alle fünf
Antwortpfade gegen den laufenden Stack, und die Nachzustellung nach einem
simulierten Relay-Ausfall. Was L1 dazugelegt hat, ist die Zustellbarkeit.

```bash
# 1. Der Prozess sendet wirklich
docker compose -f compose.dev.yaml logs api | grep -c "MAIL_TRANSPORT is log"   # muss 0 sein
```

**Der Empfänger ist `MAIL_TO`, nicht das `email`-Feld.** Die Adresse aus dem
Rumpf wird ausschließlich `Reply-To` — der Umschlag trägt `SMTP_USERNAME` als
`MAIL FROM` und `MAIL_TO` als `RCPT TO`, und das ist die SPF-Hälfte der
OVH-Regel. Wer die Adresse von mail-tester ins `email`-Feld schreibt, schickt die
Testnachricht **an sich selbst** und hält das Ergebnis für eine Messung.

Für eine echte Zustellbarkeitsmessung wird also `MAIL_TO` vorübergehend auf die
Adresse von mail-tester gesetzt (in Dokploy: ändern, redeployen, danach wieder
zurück), und dann eine Nachricht gegen die **öffentliche** Adresse geschickt —
`https://timseil.dev/api/contact`, nicht `localhost`, weil die Abnahme dem Weg
durch Traefik und den Container gilt. **Seit H8 gibt es dafür ein Formular** —
`https://timseil.dev/contact` —, und es ist der bessere Weg, weil ein Browser
einen `Origin` schickt und `curl` keinen: nur der erste prüft also auch
`CORS_ALLOWED_ORIGINS` der laufenden Umgebung mit. Der Ablauf steht Schritt für
Schritt in `docs/runbooks/mail.md`, Teil 3.

Abnahme ist L1s: **mail-tester ≥ 9/10**, und `SPF`, `DKIM` und `DMARC` mit
`p=none` müssen alle drei grün sein.

---

## Eine Anfrage im Log wiederfinden

Jede Antwort trägt `X-Request-Id`, jede Fehlerantwort denselben Wert als
`requestId` im Body.

```bash
docker compose -f compose.dev.yaml logs api | grep 0a3ea5d8730791a5e0f0b02ae6e2687f
```

**Seit F1a findet das nicht mehr nur die Access-Zeile, sondern alle Zeilen der
Anfrage** — `internal/logx` nimmt `request_id` und `trace_id` für jede Zeile aus
dem Context, statt sie an der Call-Site zu setzen. Eine abgewiesene interne
Anfrage sieht dann so aus:

```
{"level":"WARN","msg":"internal endpoint refused a request","path":"/api/internal/probe",
 "request_id":"c1ae68…","trace_id":"c6526a…"}
{"level":"INFO","msg":"request","method":"POST","status":401,
 "request_id":"c1ae68…","trace_id":"c6526a…"}
```

**Seit F1b gilt dasselbe für den Web-Container** — gleiche Zeilenform, gleiche
zwei Felder. Was er schreibt und was er absichtlich nicht schreibt, steht in
[`web.md`](web.md); dort steht auch der Grep, der einen Trace über beide
Container verfolgt.

**`trace_id` ist der Schlüssel über Dienstgrenzen, nicht `request_id`.** Die API
übernimmt einen eingehenden `traceparent` von jedem Peer, weil er nirgendwo
hinausgeht und streng geparst wird; eine eingehende `X-Request-Id` nur vom
vertrauenswürdigen Proxy, weil sie in jeder Antwort steht. ADR 0037.

Zeilen ohne Anfrage tragen **kein** leeres `request_id`, sondern gar keins. Die
Hintergrundschleifen (`ops roll-up`, `contact dispatch`, `contributions refresh`,
`uptime backfill`, `metric snapshot`) bekommen stattdessen einen eigenen Trace
pro Durchlauf — alle Zeilen eines Laufs
unter einer `trace_id`, und der Lauf davor unter einer anderen.

**`upstream_request_id` in einer Web-Zeile ist die `request_id` einer
API-Zeile.** web sendet seine eigene ID mit, die API übernimmt sie nicht — kein
vertrauenswürdiger Peer — und prägt ihre eigene; web schreibt deshalb auf, welche
das war. Eine zitierte Web-ID führt damit in **einem** Sprung auf die API-Zeilen,
und über `trace_id` in keinem.

Was **nicht** im Log steht und auch nicht hingehört: die Query-Zeichenkette, die
Client-Adresse im Klartext (`client` ist ein Hash, `peer` in der
Rate-Limit-Warnung seit F1a auch), E-Mail-Adressen und Formularinhalte. Die
letzten beiden fallen nicht der Disziplin zum Opfer, sondern einem Filter im
Handler: fremder Text — eine SMTP-Ablehnung, ein `net/http`-Fehler — wird auf dem
Weg zum Writer redigiert und erscheint als `redacted-email` bzw. `redacted-ip`.
Der Dev-Mail-Transport schreibt seit F1a nur noch Kennung und Bytezahl, nicht
mehr die Nachricht. Die Sondierungspfade `/healthz` und `/readyz` protokollieren
auf `debug`, sonst wären sie der größte Teil des Logs.

---

## Die Umgebungsvariablen

**Vier** haben keinen Default: `DATABASE_URL`, seit C6 `CONTACT_IP_PEPPER` und
seit C7 `INTERNAL_PROBE_TOKEN` und `INTERNAL_DEPLOY_TOKEN`. Dazu vier bedingte:
`SMTP_USERNAME`, `SMTP_PASSWORD` und `MAIL_TO` sind Pflicht, sobald
`MAIL_TRANSPORT=smtp` gilt, und `GITHUB_TOKEN` ist Pflicht, solange
`CONTRIBUTIONS_TRANSPORT` auf `github` steht — also im Normalfall. Alle anderen
stehen mit ihrem Default in `.env.example`; ein leerer Wert bedeutet „nimm den
Default", damit die Zahlen nur an einer Stelle existieren — in
`api/internal/config`.

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | — | Pflicht, Rolle `timseil_app` |
| `LOG_LEVEL` | `info` | |
| `REQUEST_TIMEOUT` | `15s` | Obergrenze pro Anfrage |
| `SHUTDOWN_GRACE` | `20s` | Entwässerungsfrist |
| `SHUTDOWN_DELAY` | `3s` | Pause zwischen 503 und schließendem Listener · `0` schaltet ab |
| `DB_MAX_CONNS` / `DB_MIN_CONNS` | `10` / `2` | Rechnung in ADR 0014 |
| `DB_STATEMENT_TIMEOUT` | `5s` | |
| `DB_LOCK_TIMEOUT` | `2s` | |
| `DB_IDLE_TX_TIMEOUT` | `10s` | |
| `RATE_LIMIT_RPM` / `RATE_LIMIT_BURST` | `120` / `60` | |
| `TRUSTED_PROXY_CIDRS` | leer | leer heißt: keinem Header glauben |
| `CORS_ALLOWED_ORIGINS` | drei Origins | nur der Schreibpfad prüft sie — `POST /api/contact` |
| `SITE_SYSTEM_SLUG` | `timseil-dev` | worüber `/api/health` berichtet |
| `CONTRIBUTIONS_TRANSPORT` | `github` | `github` \| `off`. `off` startet den Refresher nie |
| `GITHUB_TOKEN` | — | Pflicht bei `github`, PAT mit Scope `read:user` |
| `GITHUB_LOGIN` | `G1NG4R` | wessen Kalender — und der Schlüssel der Cache-Zeile |
| `MAIL_TRANSPORT` | `smtp` | `smtp` \| `log`. `log` baut die Mail und sendet nicht |
| `SMTP_USERNAME` | — | Pflicht bei `smtp`. Volle Adresse, **und zugleich das `From:`** |
| `SMTP_PASSWORD` | — | Pflicht bei `smtp`. Geheimnis |
| `MAIL_TO` | — | Pflicht bei `smtp`. Das Postfach, in dem die Nachrichten landen — **und zugleich das `RCPT TO`** |
| `CONTACT_IP_PEPPER` | — | Pflicht, ≥ 32 Zeichen. Schlüsselt den gespeicherten `ip_hash` |
| `INTERNAL_PROBE_TOKEN` | — | Pflicht, ≥ 32 Zeichen. Nur `POST /api/internal/probe` |
| `INTERNAL_DEPLOY_TOKEN` | — | Pflicht, ≥ 32 Zeichen. Nur `POST /api/internal/deploy` |
| `UPTIME_TRANSPORT` | `github` | `github` \| `off`. `off` startet die Wiedereinspielung des Ausfallprotokolls nie — **kein Token dazu**, der Branch ist öffentlich |
| `SNAPSHOTS_TRANSPORT` | `prometheus` | `prometheus` \| `off`. `off` startet die Snapshot-Schleife nie — **keine URL dazu**, die Adresse ist einkompiliert (F5) |

**Zwei interne Tokens und nicht eines.** Sie sind nicht austauschbar: das
Sonden-Token wird an `/api/internal/deploy` mit einer 401 abgewiesen und
umgekehrt. Der Grund steht in ADR 0023 §1 — eine erfundene Uptime-Zeile ist eine
Zelle von einundneunzig, eine erfundene Deploy-Zeile ist die eine Zahl, die die
Fallstudie gemessen nennt.

**Es gibt kein `MAIL_FROM`.** OVH verlangt, dass `From:` dem authentifizierten
Konto entspricht — `From` **ist** `SMTP_USERNAME`, und eine eigene Variable
dafür könnte nur falsch gesetzt werden. Das Relay lehnte die Abweichung erst ab,
nachdem das Passwort schon über die Leitung ging. Die Regel gilt beim
Zimbra-Postfach genauso wie beim MX Plan, gegen den sie ursprünglich formuliert
wurde (ADR 0029 §1 und §2).

**Es gibt auch keinen SMTP-Host.** `ssl0.ovh.net:465` ist einkompiliert, aus
demselben Grund wie GitHubs Endpoint (ADR 0020 §8): eine Adresse, die aus der
Umgebung kommen kann, ist eine Bearbeitung davon entfernt, aus einer Anfrage zu
kommen. Ein Anbieterwechsel ist ein Commit.

**`CONTACT_IP_PEPPER` rotieren** verwaist jeden vorher geschriebenen Hash: der
Rate-Limit-Boden erkennt eine Adresse nicht wieder, die er schon gesehen hat.
Das ist gewollt und es ist zugleich die einzige Art, alle auf einmal zu
vergessen. Nichts bricht dabei — die Zeilen bleiben stehen, sie zählen nur
nicht mehr zusammen.

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
