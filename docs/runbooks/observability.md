# Runbook — Der Observability-Stack

**Leser:** ich, wenn keine Zeile mehr in Loki ankommt, wenn eine Grafana-Abfrage
ins Leere zeigt, oder wenn ich in einem halben Jahr wissen will, warum drei
Zahlen in `ops/loki/loki.yaml` so und nicht anders stehen.

Drei Container, die niemand braucht, damit die Seite läuft: `prometheus`, `loki`,
`alloy`. Sie stehen in `compose.yaml` ohne ein einziges `depends_on` in ihre
Richtung — ADR 0007 stellt Prometheus auf die messende Seite und Postgres auf die
servierende, und F5s Abnahmekriterium ist, dass ein gestoppter Prometheus die
Seite ehrlich lässt statt kaputt.

Die Entscheidungen dieser Phase stehen in **ADR 0039**, die Grenzen in
`ops/loki/loki.yaml` und `ops/prometheus/prometheus.yml` neben ihrer Herleitung.
Was hier steht, ist der Betrieb.

---

## Der Alltag

```bash
make prod                        # alle zehn Dienste, lokal
make check-observability         # kommt an, was ankommen soll
make check-observability FLOOD=1 # 5 GB, und ob die Grenze hält

make rolling-lab                 # dasselbe, mit einem Traefik davor
make load                        # k6 durch den Proxy
make check-metrics               # die drei Zahlen der Seite            (F3)
```

`check-observability` prüft sieben Dinge in einem Lauf: Grenzen angewandt, keine
veröffentlichten Ports, die Netzgrenze, alle drei Scrape-Ziele `up`, welche
Dienste Loki kennt (und **welche nicht** — ein fremder Dienst dort ist unsere
Platte für fremde Logs), und für api und web, dass der gespeicherte Zeitstempel
der aus der Zeile ist.

**Keins der drei antwortet von außen.** Kein Port, kein Traefik-Label,
`check-compose` Regel 1 weist beides ab. Wer etwas fragen will, fragt aus dem
Docker-Netz:

```bash
docker compose -f compose.yaml exec prometheus \
  wget -qO- 'http://loki:3100/loki/api/v1/label/service/values'
```

`prometheus` ist dabei der Client der Wahl, und das ist kein Zufall: **Loki hat
keine Shell und kein `wget`.** `docker exec … loki sh` scheitert mit „executable
file not found". Deshalb trägt Loki auch keinen `healthcheck:` — einer wäre
dauerhaft rot, während der Dienst jede Anfrage beantwortet. Die Aussage über
seine Gesundheit ist `up{job="loki"}` in Prometheus.

---

## Die Grafana anhängen — einmal, auf dem Host

`prometheus` und `loki` liegen in `observability-network`. Das Netz ist
`external:`, also legt es niemand aus diesem Repository an, und die fremde
Grafana-App muss von ihrer Seite hineingehängt werden. **Nicht** mit
`docker network connect` — das überlebt ihren nächsten Redeploy nicht.

1. Einmalig auf dem Host, bevor der Stack zum ersten Mal deployt wird:
   ```bash
   docker network create observability-network
   ```
   Idempotent; existiert es schon, sagt Docker das und tut nichts.
2. In Dokploy die **Grafana-App** öffnen (nicht unsere).
3. **Advanced** → **Networks** → `observability-network` hinzufügen.
4. **Redeploy** dieser App. Ohne Redeploy hängt das Netz in der Konfiguration
   und nicht am Container.
5. In Grafana **Connections → Data sources → Add data source → Prometheus**,
   URL `http://timseil-prometheus:9090`, speichern und testen.
6. Dasselbe für **Loki**, URL `http://timseil-loki:3100`.
7. Gegenprobe, und sie gehört dazu: eine Abfrage je Quelle, am schnellsten in
   **Explore**.

   Metrik: **`up`** — schlicht, und das ist Absicht. Erwartet werden drei
   Reihen, `job="prometheus"`, `job="alloy"`, `job="loki"`.

   **Nicht `up{stack="timseil"}`.** Das stand hier zuerst und ist falsch:
   `external_labels` hängt Prometheus nur an Daten, die den Server *verlassen*
   — Föderation, `remote_write`, Alarme. Eine Grafana-Datasource fragt lokal,
   und lokal gibt es das Label nicht. Am 24.08.2026 nachgemessen: `up` liefert
   `__name__`, `instance`, `job` und sonst nichts, `up{stack="timseil"}` liefert
   ein leeres Ergebnis. F5 sieht das Label, weil sie über den Tunnel fragt.

   `up` ist ohnehin die bessere Gegenprobe: zeigt es `job="crowdsec"`, hängt die
   Datasource am **Nachbar-Prometheus** — der Fehler, gegen den die Aliase oben
   stehen, wird damit sichtbar statt still.

   Logzeile: **`{service="api"}`**, und **den Zeitraum auf 24 h stellen**.
   Explore steht auf einer Stunde; auf einer unbesuchten Seite schreibt `api`
   in einer Stunde nichts, und „no data" hieße dann „niemand war da", nicht
   „nichts kommt an".

**Nimm die Aliase, nicht `prometheus:9090`.** Das ist keine Kosmetik: jene
Grafana hängt an mehreren Netzen, und der Name `prometheus` existiert in mehr
als einem davon. Docker antwortet dann aus dem Netz, dessen **Name alphabetisch
zuerst kommt** — nachgemessen am 23.08.2026, gegen drei falsche Vermutungen
(Anbindungsreihenfolge, Erstellungsreihenfolge, Subnetz). `monitoring` sortiert
vor `observability-network`.

Die Folge, und sie ist der teure Teil: eine Datasource auf `prometheus:9090`
**antwortet**, zeigt aber einen anderen Server. Das Panel bleibt leer, und das
liest sich als „unser Scrape ist tot" statt als „falscher Host". ADR 0039 §2
trägt die Messung, `compose.yaml` die Begründung an der Zeile.

**Warum in ihren Einstellungen und nicht in unseren:** unser Stack kann sich
nicht selbst in ein fremdes Netz hängen, und das Netz ist der einzige Weg, auf
dem Docker-DNS `timseil-prometheus` für sie überhaupt auflöst.

---

## Wenn keine Zeile ankommt

Der Fehler dieser Pipeline ist **still**. Alloy läuft, Loki läuft, Prometheus
scrapt beide — und in Loki steht nichts. Die Reihenfolge, in der das zu prüfen
ist, geht von hinten nach vorn:

1. **Kennt Loki überhaupt Dienste?**
   ```bash
   docker compose -f compose.yaml exec prometheus \
     wget -qO- 'http://loki:3100/loki/api/v1/label/service/values'
   ```
   Leere Liste heißt: es liegt vor Loki.

2. **Was hat Alloy entdeckt?** Die Komponentenansicht sagt es genau:
   ```bash
   docker compose -f compose.yaml exec prometheus wget -qO- \
     'http://alloy:12345/api/v0/web/components/discovery.docker.containers'
   ```
   Kommen Ziele zurück, aber die falschen, ist es der Projektfilter.

3. **Stimmt der Projektfilter?** `ops/alloy/config.alloy` behält nur Container
   mit `com.docker.compose.project == COMPOSE_PROJECT`. Lokal ist das `timseil`;
   in Produktion setzt Dokploy den App-Namen. Vergleiche:
   ```bash
   docker inspect $(docker compose -f compose.yaml ps -q api) \
     --format '{{index .Config.Labels "com.docker.compose.project"}}'
   docker compose -f compose.yaml exec alloy printenv COMPOSE_PROJECT
   ```
   Zwei verschiedene Werte sind der ganze Fehler.

4. **Nur die Hälfte der Dienste?** Dann ist es ein Relabel, das zu viel
   wegnimmt. Genau das ist beim ersten Lauf dieser Phase passiert: eine Regel
   behielt nur Ziele im `*_default`-Netz, und `discovery.docker` liefert **ein**
   Ziel je Container auf irgendeinem seiner Netze. Übrig blieben genau die
   Container mit nur einem Netz. Die Regel ist weg, die Messung steht als
   Kommentar in der Datei.

**Nach jeder Änderung an `ops/alloy/config.alloy` muss der Container neu
gebaut werden** — die Datei ist ein Bind Mount, und Compose sieht keinen Grund,
den Container anzufassen:

```bash
make prod-down && make prod
```

---

## Die Grenzen, und was sie nicht können

| Wo | Wert | Wogegen |
|---|---|---|
| `prometheus` Kommandozeile | `retention.time=7d` **und** `retention.size=2GB` | Beides, weil Zeit allein erst in 7 Tagen greift |
| `ops/loki/loki.yaml` | `per_stream_rate_limit: 256KB` | Ein Container, der auf einem Fehler schleift |
| `ops/loki/loki.yaml` | `ingestion_rate_mb: 1` | Derselbe Flood über mehrere Streams |
| `ops/loki/loki.yaml` | `retention_period: 336h` + Compactor | Der Dauerbetrieb |
| `ops/alloy/config.alloy` | `stage.limit`, 500 Zeilen/s je `service` | Derselbe Flood, **bevor** er das WAL kostet |

**Loki kennt keine größenbasierte Retention.** Der Bauplan verlangt eine
„Compactor-Grenze ~5 GB"; die Einstellung existiert nicht. ADR 0039 §4 hat den
ganzen Absatz. Was hier zählt: die Decke ist eine **Rate**, kein Volumen, und ein
über Tage gehaltener Flood wächst weiter. Der Wächter dafür ist der Disk-Alarm
bei 70 % aus **F10**, nicht diese Datei.

**Die zwei Rate-Limits gehören zusammen.** Eins ohne das andere ist gemessen
schlechter: mit nur der Loki-Seite lag der Rückstau nach 5 GB im WAL des
Collectors — 76 MB gegen 2 MB im Speicher, den es schützen sollte, auf derselben
Platte wie Postgres. Mit beiden: 3 MB. Wer eine der Zahlen ändert, ändert beide.

---

## Der Beleg auf dem Host

Der 5-GB-Lauf gehört **nicht** auf die Produktionsplatte — er wäre genau der
Fehler, gegen den er gebaut ist. Gemessen wird lokal, gegen dieselbe Datei, die
dort läuft; auf dem Host wird nur belegt, dass es dieselbe Datei ist:

**Nicht mit `sha256sum`, und das stand hier zuerst falsch.** `/config` gibt die
*aufgelöste* Konfiguration aus — alle Defaults ergänzt, in Lokis eigener
Schreibweise. Zwei Hashes zu vergleichen liefert deshalb garantiert einen
Unterschied und beweist nichts. Am 24.08.2026 einmal so ausgeführt, mit genau
diesem Ergebnis.

Verglichen werden die **gesetzten Schlüssel**:

```bash
grep -E 'retention_period|per_stream_rate_limit|ingestion_rate_mb' \
  ops/loki/loki.yaml                               # im Klon

docker compose -f compose.yaml exec prometheus \
  wget -qO- http://loki:3100/config \
  | grep -E 'retention_period|per_stream_rate_limit|ingestion_rate_mb'
```

**Zwei Fallen darin, beide gemessen statt vermutet:**

1. `retention_period: 336h` kommt als **`2w`** zurück. Dieselbe Dauer, andere
   Schreibweise — 336 h sind vierzehn Tage. Wer auf Zeichengleichheit prüft,
   findet hier einen Fehler, den es nicht gibt.
2. `retention_period` steht **zweimal** in der Ausgabe. Die zweite Zeile
   (`0s`) gehört einem anderen Abschnitt und ist nicht unsere.

`per_stream_rate_limit`, `ingestion_rate_mb` und
`max_global_streams_per_user` kommen dagegen wörtlich zurück.

Die Behauptung lautet „diese Konfiguration greift dort", nicht „diese Platte ist
dieselbe".

---

## Die drei Zahlen der Seite — F3

`Metrics` im Contract hat drei Felder, und alle drei kommen aus einer Recording
Rule über `traefik_service_*`. Die Namen sind ein Vertrag mit F5, kein Etikett:

| Regel | Contract-Feld |
|---|---|
| `timseil:request_duration_seconds:p95_5m` | `Metrics.p95Ms` (in Sekunden — F5 rechnet um) |
| `timseil:requests:error_ratio_5m` | `Metrics.errorRate` |
| `timseil:service:availability_5m` | `Metrics.uptime90d`, von F5 über 91 Tage aggregiert |

Die Herleitung steht in `ops/prometheus/rules/slis.yml` neben jeder Regel,
die Entscheidungen in ADR 0040.

### Was der p95 ist und was er nicht ist

**Die Abnahme, gemessen im Labor am 25.08.2026** — 10 VUs, 6 Minuten, damit das
5-Minuten-Fenster wirklich voll ist, 14 156 Anfragen, 0 % Fehler:

```
k6    http_req_duration p(95)                    72,54 ms
Regel timseil:request_duration_seconds:p95_5m    74,62 ms   (web)
```

**Zwei Millisekunden auseinander, und die Richtung ist erklärbar:** Traefik misst
weniger als k6 (kein Verbindungsaufbau) und liegt trotzdem darüber, weil
`histogram_quantile` innerhalb eines Buckets linear interpoliert. Der Fehler
wohnt an den Bucket-Kanten — 2 ms in einem 25-ms-Bucket.

**Die belastbare Aussage über diesen p95 lautet deshalb nicht „72 ms", sondern
„auf einen Bucket genau, und hier ist welcher".**

**Ein zu kurzer Lauf verschmiert zusätzlich.** Dieselbe Anlage mit 90 s statt
360 s las 98 ms gegen k6s 83 ms — nicht falsch gerechnet, sondern ein Fenster,
das zu vier Fünfteln leer war. Im Dauerbetrieb tritt das nicht auf; bei einer
Messung von Hand schon, und dann ist es der erste Verdacht.

**`api` zeigt denselben Fehler eine Etage tiefer**, und das ist die
Verallgemeinerung dieser Sache: `/api/health` antwortet in ein bis zwei
Millisekunden, also liegt alles im untersten Bucket, und die Regel liefert
`0,00475` — wieder eine Interpolation, wieder plausibel, wieder von keiner
Beobachtung gestützt. **Bucket-Wahl ist relativ zu dem, was gemessen wird**, und
für einen Dienst, der zehnmal schneller antwortet als der andere, ist dieselbe
Liste zu grob. Bewusst nicht repariert: eine zweite Bucket-Liste je Dienst gibt
es in Traefik nicht, und die Zahl, die die Seite zeigt, ist die des Proxys über
die Seite — nicht die über `/api/health`.

**Traefiks Standard-Buckets machen daraus etwas Schlimmeres als Ungenauigkeit.**
Mit `0.1, 0.3, 1.2, 5.0` liegt alles, was diese Seite tut, im ersten Bucket, und
`histogram_quantile` interpoliert linear zwischen 0 und 100 ms. Das Ergebnis ist
eine Zahl, die ein laufendes System erzeugt hat und die **keine Beobachtung
stützt** — Invariante 1 im einzigen Kostüm, das die Invariante nicht erkennt.
Die Bucket-Liste steht in `compose.lab.yaml` und in Runbook `dokploy.md` §3.2,
und sie muss auf beiden Seiten dieselbe sein.

### Gegen Produktion, 26.08.2026

Dieselbe Liste, derselbe Effekt. Vorher trug der Host die Voreinstellung, und
**177 von 181** `timseil-web`-Beobachtungen lagen im ersten Bucket. Nach dem
Eintrag und **einem** `docker restart dokploy-traefik`:

```
le=0.005  0     le=0.05   21     ← 19 Beobachtungen in (0.01, 0.025]
le=0.01   0     le=0.075  22     ←  2 in (0.025, 0.05]
le=0.025  19    le=0.1    22     ←  1 in (0.05, 0.075]
```

p95 48,4 ms, interpoliert zwischen 0.025 und 0.05. Die beiden untersten Grenzen
stehen auf 0 — die Verteilung klebt weder am Boden noch an der Decke.

**Diese Zahl ist „Auflösung bestätigt", keine Latenz-Baseline.** n = 22, alles
`code=200 GET`, in Sekunden erzeugt. Die Baseline ergibt sich aus Stunden echtem
Verkehr, nicht hieraus — wer sie als Latenz zitiert, zitiert die Stichprobe.

**`docker restart`, nie der Reload-Knopf im Panel.** Der Shell-Befehl behält
Traefiks Anbindung an `observability-network`, ein Neuerzeugen des Containers
wirft sie weg. Genau deshalb steht die Bucket-Änderung und die Netz-Anbindung in
derselben Wartung: erst anhängen, dann Buckets samt Neustart — und der Neustart
belegt beides auf einmal.

### Der Traefik-Job

Prometheus scrapt `timseil-traefik:8082`. **Der Alias ist die ganze Sicherheit
an dieser Zeile** — `observability-network` ist geteilt, und ein blankes
`traefik` würde nicht ins Leere zeigen, sondern auf einen fremden Proxy
antworten. Wie Traefik überhaupt in unser Netz kommt, steht in `dokploy.md`
§3.2a; hier steht nur, woran man merkt, dass es weg ist:

```bash
sh ops/host/check-traefik-metrics.sh     # auf dem Host
```

**Ein weiterer Filter, und er ist Korrektheit statt Kosmetik:** die Regeln
filtern auf `service=~"timseil-.*"`. Unser Prometheus scrapt den Traefik des
Hosts, und der routet **jede** App dieser Maschine. Ohne den Filter rechnete die
Seite einen p95 über fremden Verkehr.

### Was F3 offen lässt

- **Traefiks Version erreicht die Seite nicht — und wird es nicht.**
  `stack.yaml` und ADR 0028 §10 nennen beide `traefik_build_info` als „die
  ehrliche Quelle", die „mit F3 ankommt, wenn etwas sie scrapt". F3 hat sie
  gescrapt: **die Serie existiert nicht.** Gegen den laufenden Proxy gemessen
  (v3.6.7) und lokal gegen v3.7.11 nachgestellt — Traefik exportiert überhaupt
  keine Build-, Versions- oder Info-Metrik. Korrigiert in ADR 0040 §5. Der
  Eintrag in `stack.yaml` bleibt damit leer, aus einem besseren Grund als
  vorher: nicht „noch nicht gemessen", sondern „es gibt nichts zu messen".
- **Fremde Kardinalität liegt auf unserer Platte.** Traefik liefert die Serien
  aller Apps dieses Hosts. Gefiltert wird in den Regeln, nicht beim Scrape —
  Letzteres erst, wenn eine Messung sagt, dass es sich am 2-GB-Budget lohnt.

---

## Was hier nicht steht

| Fehlt | Phase |
|---|---|
| PromQL-Snapshots nach Postgres, SLO-Definition | **F5** |
| Dashboards als Code, provisionierte Datasources | **F9** |
| Burn-Rate-Alerts, **Disk-Alarm bei 70 %**, Dead Man's Switch | **F10** |
| `faro.receiver` und Frontend-Telemetrie | **F11** |
| Loki-Chunks nach S3 | **P0b**, zusammen mit dem zweiten Host |
