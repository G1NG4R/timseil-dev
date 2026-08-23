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
make prod                        # alle acht Dienste, lokal
make check-observability         # kommt an, was ankommen soll
make check-observability FLOOD=1 # 5 GB, und ob die Grenze hält
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
   URL `http://prometheus:9090`, speichern und testen.
6. Dasselbe für **Loki**, URL `http://loki:3100`.
7. Gegenprobe, und sie gehört dazu: ein Panel je Quelle. Metrik
   `up{stack="timseil"}`, Logzeile `{service="api"}`. Zeigt eins von beiden „no
   data", während beide Container laufen, fehlt Schritt 4.

**Warum in ihren Einstellungen und nicht in unseren:** unser Stack kann sich
nicht selbst in ein fremdes Netz hängen, und das Netz ist der einzige Weg, auf
dem Docker-DNS `prometheus` für sie auflöst.

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

```bash
sha256sum ops/loki/loki.yaml                       # im Klon
docker compose -f compose.yaml exec prometheus \
  wget -qO- http://loki:3100/config | sha256sum    # auf dem Host
```

Die Hashes unterscheiden sich, wenn Loki Defaults ergänzt hat — verglichen wird
deshalb, was `/config` für die gesetzten Schlüssel ausgibt, nicht die Datei Byte
für Byte. Die Behauptung lautet „diese Konfiguration greift dort", nicht „diese
Platte ist dieselbe".

---

## Was hier nicht steht

| Fehlt | Phase |
|---|---|
| Traefik-Metriken scrapen, node- und postgres-exporter, Recording Rules | **F3** |
| PromQL-Snapshots nach Postgres, SLO-Definition | **F5** |
| Dashboards als Code, provisionierte Datasources | **F9** |
| Burn-Rate-Alerts, **Disk-Alarm bei 70 %**, Dead Man's Switch | **F10** |
| `faro.receiver` und Frontend-Telemetrie | **F11** |
| Loki-Chunks nach S3 | **P0b**, zusammen mit dem zweiten Host |
