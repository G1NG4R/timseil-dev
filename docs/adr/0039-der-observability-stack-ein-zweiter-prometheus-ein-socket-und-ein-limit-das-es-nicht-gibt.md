# ADR 0039 — Der Observability-Stack: ein zweiter Prometheus, ein Socket, und ein Limit, das es nicht gibt

**Status:** Angenommen
**Datum:** 2026-08-23
**Betrifft:** F2, F3, F5, F9, F10, F11, L8, P0b
**Invarianten:** 1 (keine erfundenen Zahlen)

## Kontext

F1 schreibt strukturierte Zeilen, F4 misst von außen. Beides landete bis heute
ausschließlich in `docker logs` — nichts hob eine Zeile auf, keine Metrik war
abfragbar, und `ops roll-up` war die einzige Zahl, die den Weg auf die Seite
fand. F3 hat ohne Prometheus nichts zu scrapen, F5 ohne Prometheus niemanden zu
fragen.

Die Vorbedingung dieser Phase war Issue #147: Was trägt die Maschine wirklich,
bevor drei weitere Dienste mit eigenen Volumes auf dieselbe Platte kommen wie
Postgres? Gemessen am 23.08.2026, nachgetragen in ADR 0027 §3a. Die Antwort war
entspannt — und brachte einen Fund mit, der den Entwurf dieser Phase entschied:
**auf dem Host läuft bereits eine fremde Grafana samt eigenem Prometheus.**

Der Bauplan lässt hier zwei Sätze nebeneinander stehen: „Prometheus und Loki im
selben Dokploy-Stack" an einer Stelle, „bestehende Grafana-Instanz einbinden" an
anderer. Vier Fragen waren offen, und keine davon beantwortet das Schema:

1. Eigener Prometheus neben einem vorhandenen — oder den vorhandenen mitnutzen?
2. Wie liest ein Collector Container-Logs, wenn dieses Repository Bind Mounts
   verbietet?
3. Wie erreicht eine fremde Grafana Dienste, die in unserem eigenen Netz liegen?
4. Wie sieht ein Größen-Limit für Loki aus?

## Entscheidung

### 1. Eigener Prometheus, eigener Loki, geliehene Oberfläche

**Die Speicher sind unsere, die Oberfläche ist geliehen.**

Der Grund steht in ADR 0027 §2 und gilt hier wörtlich: *eine Grenze, die wir
behaupten, muss von uns durchgesetzt werden.* F2s Abnahmekriterium lautet „ein
künstlich erzeugtes 5-GB-Log löst das Limit aus, statt die Platte zu füllen" —
das prüft nur dann etwas, wenn das Limit in unserer Konfigurationsdatei steht.
In der eines Nachbarstacks wäre es eine Zusage, die jemand anders jederzeit
zurücknehmen kann, ohne es uns zu sagen.

Die **Oberfläche** trägt diese Last nicht. Grafana speichert nichts, sie fragt
— und eine zweite Grafana auf derselben Maschine wären 1,57 GB Image und
~256 MB RAM für ein zweites Login. Sie bleibt deshalb draußen, auch aus
`stack.yaml`: ihre Version gehört einer fremden App, und eine getippte Zahl wäre
eine, die kein System von uns produziert hat. Dieselbe Begründung wie bei
Traefik in ADR 0028 §10.

### 2. Ein drittes Netz, `external`, statt eines Handgriffs auf dem Host

Docker löst Namen pro Netz auf. Aus der fremden Grafana heraus existieren
`prometheus:9090` und `loki:3100` nicht, denn unser `default` gehört uns allein
— genau deswegen liegt `db` darin.

**Das Netz allein reicht aber nicht.** Der Name `prometheus` ist auf dieser
Maschine schon vergeben; hängt jene Grafana zusätzlich in
`observability-network`, existiert er für sie **zweimal**. Welcher Eintrag
antwortet, ist am 23.08.2026 gemessen worden — und die Messung hat drei
plausible Erklärungen nacheinander widerlegt:

| Vermutung | Ergebnis |
|---|---|
| Die zuerst angebundene Netzkarte gewinnt | **nein** — beide Reihenfolgen, dieselbe Antwort |
| Das zuerst angelegte Netz gewinnt | **nein** |
| Das niedrigere Subnetz gewinnt | **nein** |
| **Der alphabetisch erste Netzname gewinnt** | **ja** |

Der entscheidende Lauf ist der letzte: der Gewinner war das Netz, das *später*
angelegt wurde und das *höhere* Subnetz trug — es gewann allein über seinen
Namen. Und `monitoring` sortiert vor `observability-network`.

Deshalb tragen `prometheus` und `loki` dort einen Alias, den sonst niemand hat:
`timseil-prometheus` und `timseil-loki`. Compose hängt den Dienstnamen weiterhin
daneben und das lässt sich nicht abschalten; die Datasource nennt den Alias.
**Der Alias ist dabei nicht bloß der aktuell gewinnende Name, sondern der
einzige, der die Frage gar nicht erst stellt** — eine Lösung, die von einem
Zeichenkettenvergleich zwischen zwei Netznamen abhängt, ist keine.

Was das kostet, ist eine Zeile. Was es verhindert, ist die teurere Hälfte: eine
Datasource auf `prometheus:9090` wäre nicht ausgefallen, sondern **grün** — mit
leeren Panels vor einem fremden Server. Das ist derselbe Fehlermodus, den §4 und
§5 dieser Entscheidung schon zweimal tragen, und die Reihenfolge der Entdeckung
war jedes Mal dieselbe: erst grün, dann nachgemessen, dann falsch.

`dokploy-network` scheidet aus: es wird mit jeder App auf diesem Host geteilt,
und `check-compose` Regel 1 verbietet unseren geschlossenen Diensten den
Zutritt. Also **`observability-network`**, `external: true`, an `prometheus` und
`loki` — `alloy` bleibt draußen, weil niemand es von außen etwas fragt.

**Angehängt wird es in den Dokploy-Einstellungen der Grafana-App, nicht per
`docker network connect` auf dem Host.** Der Unterschied ist der nächste
Redeploy jener App: was in ihren Einstellungen steht, überlebt ihn, was auf dem
Host eingetippt wurde, nicht.

### 3. Der Docker-Socket, `:ro`, an genau einem Dienst

Der Daemon besitzt die stdout-Ströme. Es gibt keinen zweiten Weg, sie zu lesen,
und dieses Repository lässt sonst nur `./ops/...:ro` als Host-Pfad zu.

Die Ausnahme ist deshalb so eng wie möglich formuliert: **ein Dienst, ein
literaler Pfad, `:ro` erzwungen.** `check-compose` Regel 3 prüft die ganze
Zeile, nicht eine gelockerte Zeichenklasse, und `selftest.sh` hält drei
Antworten fest statt einer — angenommen an `alloy`, abgelehnt an jedem anderen
Dienst, abgelehnt ohne `:ro`.

**Read-only macht diesen Socket enger, nicht sicher.** Wer die Docker-API lesen
darf, sieht jede Umgebungsvariable jedes Containers auf dieser Maschine. Das ist
der Preis, er steht hier, und er ist der Grund, warum dieser Container sonst
nichts hält: `read_only`, `no-new-privileges`, ein `tmpfs` für `/tmp` und keine
weitere Berechtigung.

### 4. Loki hat keine größenbasierte Retention — die Grenze ist eine Rate

Bauplan Kapitel 10 und ADR 0007 verlangen beide eine „Compactor-Grenze ~5 GB"
neben der Zeit-Retention. **Diese Einstellung existiert nicht.** Lokis Retention
ist ausschließlich zeitbasiert; der Compactor löscht nach Alter. Prometheus hat
`--storage.tsdb.retention.size`, Loki hat keine Entsprechung — eine Zeile in
unserer Konfiguration, die so täte, wäre ein Limit, das durchgesetzt aussieht
und keins ist.

Die Grenze wird deshalb aus drei Schichten gebaut, und die erste ist die, um die
es dem Bauplan wirklich geht:

| Schicht | Wo | Wogegen |
|---|---|---|
| `per_stream_rate_limit: 256KB` | `ops/loki/loki.yaml` | Der Amoklauf. Der Bauplan sagt „füllt in **Stunden** Gigabytes" — Stunden sind die Zeitskala, auf die eine Rate antwortet |
| `ingestion_rate_mb: 1` | dieselbe Datei | Derselbe Flood, über mehrere Streams verteilt |
| `retention_period: 336h` + Compactor | dieselbe Datei | Der Dauerbetrieb |

**Was das offen lässt:** Rate × Retention sind keine 5 GB. Ein über Tage
gehaltener Flood wächst weiter, und kein Loki-Schalter schließt das. Der
ehrliche Wächter dafür ist der Disk-Alarm bei 70 %, den **F10** baut. Diese
Phase misst Schicht 1, weil Schicht 1 aus „Gigabytes in Stunden" einen Zähler
macht, der steigt.

### 5. Das Limit gehört an beide Enden — und das hat erst die Messung gezeigt

Der erste Flood-Lauf war grün und trotzdem falsch. Fünf Gigabyte aus einem
Container, 52 Sekunden:

| | erster Lauf | nach der Reparatur |
|---|---|---|
| `loki-data` | 2 MB | 6 MB |
| **`alloy-data`** | **76 MB** | **3 MB** |
| von Alloy gelesen | 645 022 Zeilen | 1 182 325 |
| an Loki gesendet | 2 379 | 11 606 |
| im Collector verworfen | 0 | 1 162 520 |

Loki hielt seine Grenze und wuchs um 2 MB. Der Rückstau lag danach im
**Write-Ahead-Log des Collectors** — 76 MB, achtunddreißigmal so viel wie der
Speicher, den die Grenze geschützt hatte, auf derselben Platte wie Postgres.

**Ein Rate-Limit am Ziel entfernt keinen Druck, es verschiebt ihn.** Also steht
dieselbe Grenze jetzt auch an der Quelle: `stage.limit` in
`ops/alloy/config.alloy`, 500 Zeilen/s **je `service`**, verwerfend statt
blockierend. Danach 3 MB. Die beiden Zahlen — 256 KB/s dort, 500 Zeilen/s hier —
beschreiben bei den ~500-Byte-Zeilen dieses Stacks dieselbe Decke von zwei
Seiten, und beide Dateien sagen einander das im Kommentar.

Dazu `max_segment_age = "5m"` am WAL: eine Stunde ungesendeter Zeilen ist keine
Wiederherstellung, sondern eine zweite Kopie eines Ausfalls.

## Konsequenzen

- **F3** bekommt ein laufendes Ziel: Traefik-Metriken, node- und
  postgres-exporter, Recording Rules. F2 hat das Rohr gebaut, nicht die
  Anschlüsse — `prometheus.yml` scrapt heute drei Dienste, alle im eigenen Netz.
- **F5** kann Snapshots ziehen. Die Seite bleibt ohne harte Laufzeitabhängigkeit:
  nichts in `compose.yaml` hat ein `depends_on` auf diese drei.
- **F9** provisioniert Dashboards — in eine Grafana, die uns nicht gehört. Das
  ist eine offene Frage dieser Entscheidung und gehört dort beantwortet.
- **F10** erbt die einzige Lücke, die hier benannt und nicht geschlossen wird:
  den über Tage gehaltenen Flood, und damit den Disk-Alarm.
- **F11** hängt `faro.receiver` an denselben Collector. Der Socket ändert daran
  nichts; ein zweiter Erzeuger schon.
- **P0b** — zieht die Observability auf einen zweiten Host, ändert sich Alloys
  Ziel und sonst nichts. Das ist die Zusage aus ADR 0007, und sie ist der Grund,
  warum der Logging-Driver unten verworfen wurde.
- **Die Zeitstempel-Frage aus F1a ist geschlossen.** `stage.timestamp` mit
  `RFC3339Nano` nimmt beide Präzisionen; gemessen gegen die echten Produzenten,
  api `…363325483Z` und web `…398Z`, beide mit ihrer eigenen Zeit in Loki statt
  mit der des Ingests.

### Was das kostet

- **Ein root-äquivalenter Socket in einem Container**, benannt in §3. Ein
  Socket-Proxy mit Allowlist bleibt die Nachrüstung, wenn L3 sie verlangt.
- **Drei Container, ~480 MB reserviert, ~1,25 GB Limit-Summe.** Die Maschine
  trägt das (ADR 0027 §3a), aber es ist die Hälfte dessen, was unsere fünf
  bisherigen Dienste zusammen reservieren.
- **Ein Netz, das dieses Repository nicht anlegt**, und damit ein zweiter
  Handgriff in `make require-network` — und eine Einstellung in einer fremden
  App, die niemand hier versioniert. Sie steht im Runbook, wie Traefiks
  statische Konfiguration.
- **Die 5-GB-Abnahme lief lokal**, nicht auf dem Host. Auf der Produktionsplatte
  wäre sie derselbe Fehler, gegen den sie gebaut ist. Der Host-Beleg ist ein
  Hash-Vergleich der geladenen Konfiguration, keine zweite Messung — was dort
  gilt, gilt, weil es dieselbe Datei ist, nicht weil es dieselbe Platte ist.
- **Zwei Prometheus auf einer Maschine** sind zwei TSDBs, zwei Scrape-Läufe und
  zwei Retentionen. Was der fremde scrapt, ist nicht unsere Sache — dass er
  nicht dieselben Ziele doppelt nimmt, schon.

## Verworfene Alternativen

**Den bestehenden Prometheus mitbenutzen** — siehe §1. Es hätte drei Container
gespart und das Abnahmekriterium dieser Phase entwertet.

**Loki-Logging-Driver statt Socket** — ein Docker-Plugin auf dem Host, `logging:
driver: loki` je Dienst. Kein Socket, und das ist der einzige Vorteil. Es
verschiebt die Konfiguration in jeden einzelnen Dienst und bricht damit ADR 0007s
Zusage, dass ein Umzug nur Alloys Ziel ändert: er änderte dann acht `logging:`-
Blöcke. Dazu ein Plugin, das auf dem Host installiert sein muss, bevor `up`
funktioniert — genau der Handgriff, den D2s Abnahme ausschließt.

**Nur OTLP aus der Anwendung** — api und web schicken ihre Logs selbst. Kein
Socket, kein Plugin, und `db`, `migrate`, `seed` sowie der Proxy hätten
überhaupt keine Zeile in Loki. Dazu zieht es F6/F7-Arbeit in eine Phase, deren
Aufgabe die Infrastruktur ist.

**`docker network connect` für die Grafana** — ein Befehl statt eines Netzes im
Diff. Er überlebt den nächsten Redeploy jener App nicht, und der Ausfall wäre
still: Dashboards, die „no data" zeigen, während beide Dienste laufen.

**Ein Größen-Limit für Loki erfinden** — etwa das `loki-data`-Volume auf einem
größenbeschränkten Dateisystem. Möglich mit tmpfs (RAM statt Platte) oder einem
Loop-Device (ein Handgriff auf dem Host, der bei jedem Neustart wiederholt
werden will). Beides tauscht ein benanntes Restrisiko gegen einen unbenannten
Handgriff.

## Belege

Build-Plan Zeile 1160 (F2), Kapitel 10, Kapitel 4.3 · ADR 0007 · ADR 0008 ·
ADR 0027 §2 und §3a · ADR 0028 §1, §2, §6 · ADR 0037 · Issue #147 ·
`tools/check-observability.sh` · `docs/runbooks/observability.md`
