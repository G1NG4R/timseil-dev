# ADR 0040 — Traefik kommt zu uns, zwei Ausnahmen, und drei Namen, die F5 liest

**Status:** Angenommen
**Datum:** 2026-08-26
**Betrifft:** F3, F5, F9, F10, L3, L8
**Invarianten:** 1 (keine erfundenen Zahlen), 3 (Metriken nur für `state='live'`)

## Kontext

F2 hat die Leitung gelegt: eigener Prometheus, eigener Loki, Alloy als
Collector, die Grenzen gemessen. Was durch die Leitung floss, waren drei Jobs,
und alle drei beschrieben die Leitung selbst — `prometheus`, `alloy`, `loki`.
Über die Seite sagte keiner etwas.

`Metrics` im Contract hat drei Felder, `uptime90d`, `p95Ms`, `errorRate`, und
alle drei sind bis heute `null`. Bei `p95Ms` steht wörtlich *„95th percentile
latency, **measured at the reverse proxy**"*. F5 füllt die Felder aus
Prometheus; F5 kann nur abfragen, was F3 erzeugt.

Vier Fragen standen offen, und drei davon hatte der Bauplan nicht gestellt:

1. **Wie erreicht unser Prometheus Traefik überhaupt?** Traefik lauscht im
   `dokploy-network`. `check-compose` Regel 1 und 11 verbieten `db`,
   `prometheus`, `loki` und `alloy` genau dort den Zutritt, und ADR 0039 §2
   nennt den Grund: das Netz teilt sich mit jeder App dieses Hosts.
2. **Wie kommt der Node-Exporter an die Zahlen des Hosts**, wenn Regel 3 nur
   read-only Pfade unter `./ops` zulässt?
3. **Als wer liest der Postgres-Exporter?** ADR 0011 kennt zwei Rollen: eine
   für DDL, eine für DML. Statistiken zu lesen ist weder das eine noch das
   andere.
4. **Wie heißen die Regeln**, die F5 in zwei Phasen abfragen wird?

Zwei Vorarbeiten waren die Bedingung dafür, dass Frage 1 überhaupt sinnvoll
gestellt werden konnte, und beide fielen am 25.08.2026 an: Traefiks
Metrik-Endpoint war seit D3 **nie eingeschaltet** — ein Abnahmekriterium, das
zwei Stufen lang als erfüllt galt — und `ops/host/check-traefik-metrics.sh`
fragte vom Host aus nach einer Overlay-Adresse, die im Netzwerk-Namensraum des
Hosts nicht existiert. Der zweite Fehler hatte sich hinter dem ersten versteckt:
die Prüfung scheiterte aus dem Grund, den sie nannte, und niemand sah weiter.

## Entscheidung

**§1 · Traefik kommt zu uns, wir gehen nicht zu ihm.**
Traefik wird an `observability-network` angehängt und antwortet dort auf den
Alias `timseil-traefik`. Unsere Dienste betreten `dokploy-network` nicht; Regel
1 und 11 bleiben unverändert. Der Alias ist Pflicht, nicht Kosmetik: auf einem
geteilten Netz ist `traefik` ein Name, den jeder halten kann, und die
Fehlerwirkung wäre kein leerer Job, sondern ein voller über einen fremden Proxy
— dieselbe Falle, die ADR 0039 §2 für `prometheus` gestellt hat.

**§2 · Eine zweite Bind-Mount-Ausnahme, so eng wie die erste.**
`node-exporter` darf `/proc`, `/sys` und `/` read-only mounten. Drei literale
Zeilen, ein benannter Dienst, als ganze Zeilen gematcht — dieselbe Form wie die
Socket-Ausnahme aus ADR 0039 §3. `tools/selftest.sh` beweist die Abweisung von
drei Nachbarfällen: ein vierter Pfad, einer dieser Pfade an einem anderen
Dienst, und ein schreibbarer.

**§3 · Eine dritte Postgres-Rolle.**
`timseil_metrics`, `LOGIN`, `INHERIT`, Mitglied von `pg_monitor` und von sonst
nichts. Angelegt idempotent in `ops/postgres/initdb/10-roles.sh` für jeden neuen
Cluster **und per Hand für den bestehenden**, weil `initdb` auf einem
vorhandenen Volume nicht läuft.

**§4 · Die Regelnamen sind ein Vertrag mit F5.**

```
timseil:request_duration_seconds:p95_5m   → Metrics.p95Ms
timseil:requests:error_ratio_5m           → Metrics.errorRate
timseil:service:availability_5m           → Metrics.uptime90d (F5 aggregiert)
```

Und die Regel über den Regeln: **keine liefert `0`, wenn niemand gemessen hat.**

## Konsequenzen

**Der Filter `service=~"timseil-.*"` ist nicht Kosmetik, sondern die Korrektur
eines Entwurfsfehlers, der beinahe unbemerkt geblieben wäre.** Unser Prometheus
scrapt den Traefik des **Hosts**, und der routet jede App dieser Maschine. Ohne
den Filter rechneten die Regeln einen p95 über fremden Verkehr, F5 schriebe ihn
in eine Seite, die behauptet, sich selbst gemessen zu haben — grün, plausibel,
über das falsche System. Dass die Router- und Service-Namen den Projekt-Präfix
tragen (ADR 0028), ist deshalb rückwirkend eine Sicherheitsentscheidung.

**Invariante 1 hat eine PromQL-Fassung bekommen, und sie hat zwei Richtungen.**
Fehlt die Messung, ist das Ergebnis leer oder `NaN`, nie `0`. Ist die Messung da
und das Ergebnis wirklich null Fehler, dann **muss** `0` herauskommen — sonst
verwandelt sich eine gemessene Null in eine fehlende. Der Ausdruck
`or … * 0` in `timseil:requests:error_ratio_5m` ist genau diese zweite
Richtung, und sie ist der Teil, den man beim ersten Schreiben vergisst.

**Verfügbarkeit heißt hier Request-Verfügbarkeit, und die Grenze gehört auf die
Seite, nicht in eine Fußnote.** Diese Zahl sagt: von den Anfragen, die ankamen,
wurden so viele beantwortet. Den Ausfall, in dem gar nichts ankam, kann sie
nicht sehen — in dem ist dieser Prometheus selbst tot, er teilt sich den Host.
Genau dafür existiert F4s externe Sonde, und genau deshalb sind `ops_checks`
und `metric_snapshots` zwei Tabellen. **F5 entscheidet, welche der beiden
`uptime90d` füllt; §4 beansprucht es nicht.**

**Der Rollout musste zwei Namen mehr lernen.** `node-exporter` und
`postgres-exporter` haben keinen Fürsprecher — nichts hängt von ihnen ab, mit
Absicht. Ein Rollout, der sie nicht nennt, lässt sie gestoppt, und der Stack
sieht gesund aus, während zwei von sechs Scrape-Zielen unten sind. Das ist
wörtlich der Fehler aus F2, ein zweites Mal in Reichweite.
`tools/check-rollout.sh` hält die Zeile gegen `compose.yaml` — und Dokploys
Command-Feld muss der Datei folgen, sonst ist `tools/deploy.sh` auf dem Host
rot, bevor irgendetwas deployt.

**Für F10 ist die Vorarbeit getan.** Der 70-%-Plattenalarm liest
`node_filesystem_avail_bytes`. Weil F3 die Serie schon scrapt, kommt der Alarm
mit Verlauf statt mit leerem Graphen — und er ist der ehrliche Wächter für das,
was `ops/loki/loki.yaml` offen lassen musste.

### Was das kostet

- **Eine zweite Ausnahme in Regel 3, und Ausnahmen sind eine Reihe.** Nach dem
  Socket ist dies die zweite; die dritte wird leichter zu begründen sein als
  diese, und das ist der eigentliche Preis. Gegenmittel: beide sind als ganze
  Zeilen auf benannte Dienste gematcht, und jede Abweisung ist im `selftest`
  belegt. Eine Ausnahme, die nur ihren annehmenden Fall kennt, ist eine
  Ausnahme, deren Ränder niemand gemessen hat.
- **Ein Container mehr mit Reichweite auf den Host.** `node-exporter` liest das
  Wurzeldateisystem. Read-only und distroless machen ihn enger, nicht sicher —
  dieselbe ehrliche Formulierung, die ADR 0039 §3 für den Socket gewählt hat.
- **Ein drittes Passwort und ein zweiter Handgriff auf dem Host.** Die Rolle
  entsteht in `initdb`, und `initdb` läuft dort nie wieder. Bis der Handgriff
  getan ist, steht `up{job="postgres"}` auf 0, während alles andere grün ist.
- **Fremde Kardinalität auf unserer Platte.** Traefik liefert die Serien aller
  Apps dieses Hosts, und das 2-GB-Budget ist unseres. F3 filtert in den Regeln
  (Korrektheit) und **nicht** beim Scrape (Speicher) — Letzteres erst, wenn die
  Messung sagt, dass es sich lohnt. Ein Wächter, den niemand gemessen hat, hat
  F2 den ersten grünen Lauf gekostet.
- **Ein Umbenennen der drei Regeln kostet ab jetzt zwei Phasen.**

### §5 · Was gegen Produktion gemessen wurde, und was dabei umfiel

**Die Anbindung steht.** `dokploy-traefik` — ein einfacher Container, kein
Swarm-Dienst — hängt an `bridge`, `dokploy-network` und
`observability-network`, Alias `timseil-traefik`, ohne Neustart angehängt. Der
Endpoint antwortet mit 1656 `traefik_*`-Serien, davon 182 mit einem
`timseil-*`-Service. Port 8082 ist am Container nirgends veröffentlicht — die
Hälfte, die D3 behauptet hat, ist damit am Proxy selbst belegt statt an einer
Regel.

**Der Bucket-Fund gilt auch dort.** Die Voreinstellung `0.1, 0.3, 1.2, 5.0` ist
auf dem Host aktiv, und über alle `timseil-web`-Serien lagen **177 von 181**
Beobachtungen im ersten Bucket. Der p95 der Seite wäre eine Interpolation
zwischen 0 und 100 ms.

**Die Präzisierung, und sie gehört in jeden Text über diese Zahl:** die Aussage
gilt für die **aggregierte** Serie. Für `code=200` allein sind es 70 von 74, und
0,95 · 74 = 70,3 fällt knapp ins **zweite** Bucket — dort interpoliert
`histogram_quantile` zwischen 0.1 und 0.3, ebenso wertlos, aber nicht „zwischen
0 und 100 ms". Unsere Regel aggregiert `sum by (service, le)` **ohne** `code`,
liegt also im aggregierten Fall; der Randfall wird danebengestellt statt
geglättet.

**Und eine Einschränkung an der Stichprobe selbst:** 106 der 181 Anfragen waren
`404`. Der p95, um den es geht, wurde in diesem Fenster überwiegend aus
Fehlerantworten gebildet, nicht aus Nutzerverkehr. Für die Aussage über die
Buckets ist das folgenlos — für jede Aussage über „wie schnell ist die Seite"
ist es das nicht.

**Nach der Reparatur, gegen denselben Host gemessen:** dreizehn Grenzen statt
fünf, und die Masse sitzt nicht mehr am Boden.

```
le=0.005  0     le=0.05   21     ← 19 Beobachtungen in (0.01, 0.025]
le=0.01   0     le=0.075  22     ←  2 in (0.025, 0.05]
le=0.025  19    le=0.1    22     ←  1 in (0.05, 0.075]
```

Der p95 interpoliert jetzt zwischen 0.025 und 0.05 und liefert 48,4 ms — **immer
noch eine Interpolation**, das bleibt es bei Histogrammen naturgemäß, aber über
ein 25-ms-Band statt über ein 100-ms-Band und mit tatsächlichen Beobachtungen
auf beiden Seiten. Vorher lag er in einem Bucket, dessen Untergrenze 0 war und
in dem 98 % aller Beobachtungen lagen; das Ergebnis war eine Funktion der
Bucket-Wahl, nicht der Latenz. **Jetzt bewegt er sich, wenn sich die Latenz
bewegt.** Das ist der Unterschied, auf den es ankam.

**Was diese Zahl NICHT ist, und der Satz gehört neben sie:** n = 22, alles
`code=200 GET`, in wenigen Sekunden vom Host selbst erzeugt, ohne kalten Cache
und ohne Nebenlast. Das belegt, dass die Grenzen greifen und die Auflösung im
richtigen Bereich liegt. Es belegt **keine Latenz-Baseline** — die ergibt sich
erst aus Stunden Produktionsverkehr. „Auflösung bestätigt" ist die Aussage, die
diese Messung trägt, und mehr steht auch nirgends.

### §6 · `traefik_build_info` gibt es nicht

`stack.yaml` und ADR 0028 §10 nennen beide `traefik_build_info` als „die
ehrliche Quelle" für die Traefik-Version, die „mit F3 ankommt, wenn etwas sie
scrapt". **F3 hat sie gescrapt. Die Serie existiert nicht** — gegen den
laufenden Proxy gemessen (v3.6.7) und lokal gegen v3.7.11 nachgestellt: Traefik
exportiert keine Build-, Versions- oder Info-Metrik, in keiner der beiden
Versionen.

Der Satz stand seit D3 in zwei Dokumenten und war nie ausgeführt worden — und in
dieser Phase wurde er ein drittes Mal abgeschrieben, in
`ops/host/check-traefik-metrics.sh`, wo ein `grep` auf diese Serie stand, der
für immer nichts gefunden hätte. **Dieselbe Klasse wie die vier Zeilen aus
Beitrag 004**, diesmal von uns selbst reproduziert, in der Phase, deren Beitrag
von ungeprüften Zahlen handelt.

**Folge:** `stack.yaml` behält seinen leeren Traefik-Eintrag, aus einem besseren
Grund als vorher — nicht „noch nicht gemessen", sondern „es gibt nichts zu
messen". ADR 0028 §10 wird nicht umgeschrieben; dieser Absatz ist die Korrektur.
Wer die Version des laufenden Proxys braucht, liest sie am Image, nicht an einer
Metrik.

### §7 · Die Haltbarkeit, und sie ist genauer als „überlebt nicht"

Der Entwurf hing an einer offenen Frage: übersteht die Anbindung einen Neustart?
Die Lektion vom 24.08. an der fremden Grafana sagte nein — **das war aber ein
Redeploy, kein Neustart**, und die Unterscheidung ist der ganze Unterschied.

Gemessen am 26.08.2026 gegen den laufenden Host:

```
docker service ls --filter name=traefik   → leer
docker ps -a | grep traefik               → dokploy-traefik  traefik:v3.6.7
```

Kein Swarm-Dienst, also ein einfacher Container und kein
`docker service update --network-add`. Also `docker network connect --alias`,
und danach:

```
docker restart dokploy-traefik
→ Up 5 seconds · https://timseil.dev/ = 200
→ bridge dokploy-network observability-network
```

| Ereignis | Anbindung |
|---|---|
| `docker restart` | **bleibt** — sie steht in der Container-Config des Daemons, nicht im Startbefehl |
| Container neu erzeugt (Dokploy-Upgrade, Panel-Reload) | **weg** |

**Damit ist die Anbindung betriebsfest und nicht upgradefest**, und das ist eine
brauchbare Antwort statt einer halben. Der Wächter dafür ist
`ops/host/check-traefik-metrics.sh` plus die Runbook-Zeile „nach jedem
Dokploy-Upgrade wiederholen". Der Relay-Fallback bleibt ungebaut — er wäre erst
fällig, wenn sich Upgrades als häufig genug erweisen, und dann steht er hier.

**Eine Folge für die Reihenfolge, die nicht offensichtlich ist:** die
Bucket-Liste geht in die *statische* Konfiguration, die Traefik nur beim Start
liest. Erzeugt das Panel den Container dabei neu, ist die Netz-Anbindung wieder
weg. Der Weg ist deshalb `docker restart` in der Shell und nicht der Reload-Knopf
— das Runbook sagt es an der Stelle, an der man es braucht.

## Verworfene Alternativen

**Unsere Dienste in `dokploy-network`.** Der kürzeste Weg, und er kehrt genau
die Regel um, die `check-compose` Regel 1 seit D2 trägt. Das Netz teilt sich mit
jeder App dieses Hosts; Prometheus, Loki und Alloy tragen keine
Authentifizierung.

**`docker network connect` auf dem Host.** Ein Befehl statt eines Netzes im
Entwurf — überlebt den nächsten Neustart des Containers nicht. Am 24.08.2026 an
der fremden Grafana gemessen, und dieselbe Lektion gilt hier.

**Ein schmaler Relay-Container in beiden Netzen.** Verworfen als *erste* Wahl,
weil er etwas von uns dauerhaft ins geteilte Netz stellt, um einen Weg zu bauen,
den die Umkehrung ohne neuen Dienst bekommt. **Er wird auch nicht als Fallback
gebraucht** — §7 hat die Frage beantwortet, an der er hing.

**Traefiks `/metrics` über einen Router auf `websecure`,** abgesichert mit
IP-Allowlist oder BasicAuth. Damit läge der Metrikpfad öffentlich, sobald ein
Router ihn trifft — ADR 0028 §6 hat diesen Weg bereits ausgeschlossen, als der
eigene Entrypoint entstand.

**Ein eigener `/metrics` in der Go-API mit `client_golang`.** Neue Abhängigkeit,
und schlimmer: eine zweite Antwort auf dieselbe Frage. Der Contract sagt
„measured at the reverse proxy" — mit zwei Quellen müsste die Seite erklären,
welche gilt. Die Runtime- und Pool-Zahlen, die dabei mit abfielen, sind kein
Grund; sie sind eine Phase nach dem Launch.

**Den `@docker`-Suffix vom `service`-Label strippen.** Machte die
aufgezeichneten Serien hübscher und weniger ehrlich: ändert sich der Provider,
ändert ein gestripptes Label sich still, ein behaltenes nicht. Die Zuordnung
Service → System-Slug ist F5s Arbeit.

**`timseil:service:availability_5m` zweimal ausrechnen** statt aus der
Fehlerquote abzuleiten. Zwei Ausdrücke für eine Größe sind ein Ausdruck und eine
künftige Uneinigkeit.

## Verweise

Bauplan Zeile 1165 · ADR 0007 · ADR 0011 · ADR 0012 §Gen-Zeit · ADR 0027 §2 ·
ADR 0028 §6, §10 · ADR 0039 §1–§4 · `contract/openapi.yaml` (`Metrics`) ·
`docs/runbooks/observability.md` · `docs/runbooks/dokploy.md` §3.2
