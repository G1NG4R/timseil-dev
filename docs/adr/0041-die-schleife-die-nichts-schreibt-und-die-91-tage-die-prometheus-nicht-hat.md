# ADR 0041 — Die Schleife, die nichts schreibt, und die 91 Tage, die Prometheus nicht hat

**Status:** Angenommen
**Datum:** 2026-08-27
**Betrifft:** F5, F9, F10, H1, H2, H3
**Invarianten:** 1 (keine erfundenen Zahlen), 6 (ein Tag ohne Messung ist `nodata`),
7 (das Fenster ist 91 Tage)

## Kontext

Seit F3 rechnen drei Recording Rules über `traefik_service_*`, und seit B2 gibt
es `metric_snapshots`. Zwischen beiden lag nichts. `Metrics.uptime90d`,
`Metrics.p95Ms` und `Metrics.errorRate` standen auf `null`, nicht weil die
Messung fehlte, sondern weil niemand sie abholte.

ADR 0007 hat den Weg vorgezeichnet — *Prometheus misst, Postgres serviert*, die
Seite fragt Prometheus **nie** im Anfrageweg — und ADR 0040 §4 hat die Namen der
Regeln zum Vertrag erklärt. Was ADR 0040 ausdrücklich **nicht** entschieden hat,
steht in seinem eigenen Text: *„F5 entscheidet, welche der beiden `uptime90d`
füllt; §4 beansprucht es nicht."* Dazu kam eine zweite offene Stelle aus
denselben Zeilen: *„Die Zuordnung Service → System-Slug ist F5s Arbeit."*

Vier Fragen also, und die erste hat eine Antwort, die keine Abwägung ist.

## Entscheidung

### §1 · `uptime90d` kommt aus `ops_days`, nicht aus Prometheus

**Prometheus hält sieben Tage.** `--storage.tsdb.retention.time=7d` steht seit
F2 in `compose.yaml` und ist zusammen mit `retention.size=2GB` die Grenze, die
verhindert, dass die Metrikdatenbank die Platte füllt, auf der auch Postgres
liegt. Das Fenster des Contracts sind **91 Tage** (13×7, Invariante 7). Eine
91-Tage-Frage ist an eine 7-Tage-Datenbank nicht zu stellen — gleichgültig, wie
die Regel geschrieben ist. Das Mapping im Runbook
(`timseil:service:availability_5m` → `Metrics.uptime90d`, „von F5 über 91 Tage
aggregiert") beschrieb eine Abfrage, die es nicht geben kann.

**Und mit unendlicher Aufbewahrung wäre die Antwort dieselbe.** ADR 0040 §4 hat
den Grund schon aufgeschrieben: `availability_5m` ist *Request*-Verfügbarkeit —
von den Anfragen, die ankamen, wie viele beantwortet wurden. Den Ausfall, in dem
gar nichts ankam, kann sie nicht sehen, weil in dem dieser Prometheus selbst tot
ist; er teilt sich den Host. Anhang A des Bauplans definiert Verfügbarkeit
deshalb als *„externer Probe (GitHub Actions), 5-min-Takt"*, und genau die
schreibt seit F4 nach `ops_checks` und `ops_days`.

Gerechnet wird in SQL, in `queries/metrics.sql`, aus derselben Haltung heraus,
die ADR 0017 und ADR 0019 für das Betriebsraster eingenommen haben: eine
Go-Schleife über `ops_days` täte dasselbe, bis jemand sie ändert, und „heute"
hätte dann eine zweite Definition in einer zweiten Zeitzone.

```
sum(checks_up) / sum(checks_total) * 100   über 91 Tage
```

Ein Tag ohne Prüfung trägt `checks_total = 0` und damit zu keiner der beiden
Summen bei — eine Lücke im Raster verdünnt nichts (Invariante 6). Ist die Summe
über das ganze Fenster **null**, ist das Ergebnis `NULL` und nicht `0`; `0`
hieße „dieses System hat nie geantwortet", also der alarmierendste Satz, den die
Seite sagen kann, erzeugt von einer leeren Tabelle.

**`timseil:service:availability_5m` bleibt trotzdem stehen.** Sie ist der
Eingang für F10s Burn-Rate — eine kurze Fensterlänge je Dienst ist genau das,
was ein Alarm will — und sie wird von F5 nicht gelesen. Das steht als Kommentar
neben der Regel, sonst liest sie sich in einem halben Jahr wie vergessen.

### §2 · Zwei neue Site-Regeln, weil der Contract je ein Feld hat

`Metrics` hat ein `p95Ms` und ein `errorRate`. Traefik liefert zwei Serien,
`timseil-web@docker` und `timseil-api@docker`. Irgendwo muss aus zwei Zahlen
eine werden, und **wo** das geschieht, entscheidet, was die Zahl bedeutet:

| Ort | Ergebnis |
|---|---|
| in Go, das Maximum der beiden | eine obere Schranke — für eine Quote **nicht** „Anteil der 5xx an allen Anfragen", was der Contract wörtlich sagt |
| in Go, nur `web` | ein 500 aus `/api/systems` erreicht `errorRate` nie; die Seite verschweigt ihren eigenen Fehler |
| in Prometheus, über die Anfragen | request-gewichtet, also genau der Satz, den der Contract schon schreibt |

Also in Prometheus. `slis.yml` bekommt zwei Regeln dazu, die dieselben Zähler
ohne `by (service)` aggregieren:

```
timseil:site:request_duration_seconds:p95_5m   → Metrics.p95Ms   (Sekunden; F5 rechnet ×1000)
timseil:site:requests:error_ratio_5m           → Metrics.errorRate
```

Die Buckets werden **vor** dem Quantil summiert. Der Mittelwert zweier p95 wäre
ein Quantil von Quantilen und damit ein Quantil von gar nichts.

Die drei Regeln aus F3 bleiben unverändert und behalten ihr `service`-Label —
sie sind es, nach denen F9s Dashboards schneiden und F10s Alarme feuern. Die
Site-Regeln beantworten eine andere Frage, nicht dieselbe zweimal.

### §3 · Die Zuordnung Service → System-Slug ist der Regex, nicht Go-Code

Damit erledigt sich die zweite offene Stelle aus ADR 0040 von selbst: die
Site-Regeln aggregieren `service=~"timseil-.*"` weg, also trägt die Serie, die
F5 liest, **überhaupt kein `service`-Label mehr**. Der Filter *ist* die
Zuordnung, `SITE_SYSTEM_SLUG` benennt die Zeile in `systems`, und in Go steht
keine Tabelle, die zwei Traefik-Namen auf einen Slug abbildet.

### §4 · Gefragt wird `timseil-prometheus`, nicht `prometheus`

Die api hängt in `dokploy-network` und im `default`-Netz. Docker beantwortet
einen Namen, der auf mehreren Netzen eines Lesers existiert, aus dem Netz,
**dessen Name alphabetisch zuerst steht** — gemessen am 23.08.2026, aufgeschrieben
neben dem prometheus-Dienst in `compose.yaml`. `dokploy-network` steht vor
`<projekt>_default`, und dieses Netz teilt sich mit jeder anderen App dieses
Hosts.

Veröffentlicht eine davon je einen Container `prometheus`, fragte
`http://prometheus:9090` **deren** Server, und die Schleife schriebe die Latenz
eines Fremden in eine Seite, die behauptet, sich selbst gemessen zu haben. Grün,
plausibel, über das falsche System — derselbe Fehler, den ADR 0039 §2 für die
Grafana-Datasource gefunden hat, gespiegelt. Unser Prometheus bekommt den Alias
deshalb auch im `default`-Netz, und `internal/snapshots` fragt ihn.

Die Adresse steht **einkompiliert**, nicht in der Umgebung. Die Regel ist alt
(`internal/contributions`, `internal/uptime`, `config.go`), aber dies ist der
Fall, der sie konkret macht: dieser Prozess veröffentlicht, was er erfragt, als
eigene Messung. Aus der Umgebung ist eine URL eine Änderung davon entfernt, aus
einem Request zu kommen.

**Es gibt keinen Tunnel.** Bauplan Zeile 1172 sagt, F5 frage „über den Tunnel";
der Satz stammt aus der Zwei-Host-Topologie, die ADR 0008 verworfen hat.
`docs/runbooks/observability.md` trug denselben Irrtum weiter und behauptete
zusätzlich, F5 sehe `external_labels`. Beides ist korrigiert: `external_labels`
hängen an Daten, die den Server *verlassen*, und sind für eine lokale Abfrage
unsichtbar.

### §5 · Die Zeile, die nicht geschrieben wird

`00005_metrics.sql` erlaubt eine Momentaufnahme mit drei `NULL` ausdrücklich und
sagt, was sie bedeutet: „wir haben gefragt und nichts bekommen" — eine andere
Tatsache als „wir haben nie gefragt". **F5 erzeugt sie trotzdem nie**, und daran
hängt das Abnahmekriterium der Phase.

`LatestMetrics` liest `ORDER BY measured_at DESC LIMIT 1`. Eine frische
Leerzeile wäre damit die jüngste Messung und verdrängte die letzte gültige Zahl
von der Seite: `— NO DATA` in genau dem Augenblick, in dem ein echter Wert mit
ehrlichem Alter dastehen könnte. Der Bauplan verlangt das Gegenteil in einem
Satz — *„die Seite zeigt weiter den letzten gültigen Wert mit Alter, statt zu
brechen oder eine Null zu erfinden"*.

Die Regel lautet deshalb: **eine Zeile entsteht nur, wenn mindestens einer der
beiden Prometheus-Werte gemessen wurde.** Antwortet Prometheus gar nicht, oder
liefern beide Site-Regeln nichts, wird **gar nichts** geschrieben — auch nicht
die aus `ops_days` abgeleitete Verfügbarkeit, die ja vorläge. Eine Zeile ist ein
Augenblick mit drei Zahlen; eine halbe Zeile löschte die zwei Proxy-Zahlen still.

Innerhalb einer geglückten Abfrage gilt Invariante 1 in beide Richtungen, und
die drei Fälle bleiben getrennt:

| Antwort | Spalte | Logzeile |
|---|---|---|
| `NaN` | `NULL` | keine — so sagen die Regeln „niemand hat gemessen" |
| `±Inf`, negativ, Quote außerhalb 0…1 | `NULL` | WARN — etwas ist oben kaputt und sonst sagt es niemand |
| `0` bei vorhandener Serie | `0` | die gewöhnliche Erfolgszeile |

Abgewiesen und nicht geklemmt: Klemmen erfände einen Wert. Und abgewiesen statt
durchgereicht, weil `metric_snapshots_p95_range_ck` sonst das ganze `INSERT`
abbräche — und damit die *andere* Zahl derselben Zeile verlöre, die an dem
Fehler unbeteiligt war.

### §6 · Kein Breaker, kein Retry

`internal/contributions` und `internal/uptime` rufen fremde Hosts über das
Internet, einer davon mit einem Zugangsdatum. Ein Breaker verschont die
Gegenstelle vor unseren Wiederholungen während *ihres* Ausfalls. Prometheus ist
ein Container auf derselben Maschine, im selben Docker-Netz, ohne Zugangsdaten,
mit einer Antwortzeit unterhalb der Millisekunde. Es gibt keine Gegenstelle, die
zu verschonen wäre.

Der Bauplan verlangt an dieser Stelle genau das, was jetzt dasteht: kurzes
Timeout, ein Versuch, Fehler nicht fatal. `resilience.Retry` behält damit seine
zwei Aufrufer, und die Rückverlagerung nach `internal/contributions`, die
ADR 0021 für den Fall „bei F5 immer noch nur einer" vorgesehen hatte, entfällt.

### §7 · Ein Prüfwerkzeug, und der Auslöser stand vorher fest

`tools/check-rule-names.sh`: jeder Regelname, den `internal/snapshots` abfragt,
existiert als `- record:` in `slis.yml`. Eine Richtung, nicht zwei — dass eine
Regel von niemandem gelesen wird, ist heute richtig (§1).

CLAUDE.md verlangt für eine neue Prüfregel einen Fehler, den man benennen kann.
Hier ist er benannt, bevor er passiert ist, und zwar seit ADR 0040 §4: *„Ein
Umbenennen der drei Regeln kostet ab jetzt zwei Phasen."* Dieselbe Form, in der
`check-probe-cadence.sh` legitimiert wurde. Was der Fehler kostet, ist das
Argument: die Abfrage bliebe gültig, die Antwort leer, keine Zeile entstünde,
nichts würde oberhalb von INFO protokolliert — und die Seite stünde wieder auf
`— NO DATA`, ohne dass irgendetwas kaputt aussähe.

Dazu `check-observability.sh --snapshots` als vierter Modus: er stoppt
Prometheus und misst nach, was die Seite dann tut. Das Abnahmekriterium ist ein
Satz über einen toten Messteil, und die einzige Art, ihn zu beantworten, ist,
den Messteil zu töten.

## Konsequenzen

- **Die Seite hat ihre drei Zahlen.** Zum ersten Mal seit B2 trägt
  `metric_snapshots` Zeilen, und `/api/health`, `/api/systems` und der
  Uptime-Badge lesen sie, ohne dass an ihrem Verhalten etwas geändert wurde. Am
  Lesepfad steht genau eine Änderung, und sie ist keine Verhaltensänderung:
  `systems.defaultWindow` heißt jetzt `DefaultWindow`, damit das Fenster eine
  Definition behält (siehe unten).
- **`docs/slo.md` ist ab jetzt die normative Fassung der SLOs.** Anhang A des
  Bauplans und Kapitel 28 des Handbuchs verweisen darauf; der Widerspruch in
  Anhang A („in F9 festlegen") ist dort aufgelöst.
- **F9** provisioniert die Dashboards und bekommt beide Regelsätze: die drei
  per Dienst zum Schneiden, die zwei über die Seite zum Vergleich mit dem,
  was `/api/health` sagt.
- **F10** erbt `availability_5m` unangetastet und das Fehlerbudget aus
  `docs/slo.md`.
- **`systems.DefaultWindow` ist exportiert**, aus dem Grund, aus dem
  `ops.ProbeInterval` es ist: ein zweites Paket braucht dieselbe Zahl, und eine
  private Kopie wäre eine Zahl mit zwei Wahrheiten.

### Was das kostet

- **`slis.yml` wurde nach der F3-Abnahme angefasst.** Prometheus hat kein
  `--web.enable-lifecycle`, ein Regelwechsel braucht also einen
  Container-Neustart, und F3s Abnahme musste erneut laufen. Sie lief erneut und
  war grün; der Preis ist trotzdem, dass „abgenommen" jetzt einmal weniger
  „unberührt" heißt.
- **`uptime90d` altert mit, wenn Prometheus ausfällt.** Die Verfügbarkeit käme
  aus `ops_days` und wäre verfügbar, aber §5 schreibt keine halbe Zeile. Ein
  Tag Prometheus-Ausfall heißt also ein Tag alte Verfügbarkeit — sichtbar
  gemacht durch `measuredAt`, nicht versteckt.
- **Die Sondenanfragen verzerren den Seiten-p95 nach unten.** F4s Probe trifft
  `/api/health` alle fünf Minuten, und dieser Pfad antwortet in ein bis zwei
  Millisekunden. Das sind echte Anfragen und sie liegen in derselben
  Histogramm-Reihe wie die Seiten. Die Zahl ist nicht erfunden — jede
  Beobachtung darin hat stattgefunden —, aber sie ist ein p95 über einen
  Anfragemix, der unser eigenes Monitoring enthält. `docs/slo.md` sagt es
  laut, statt es wegzurunden.
- **Ein weiteres Prüfskript**, und Ausnahmen sind eine Reihe. Nach
  `check-probe-cadence.sh` ist dies das zweite Gate, das vor seinem Fehler
  gebaut wurde. Das dritte wird leichter zu begründen sein als dieses.

## Verworfene Alternativen

**`uptime90d` aus `timseil:service:availability_5m` über 91 Tage.** Nicht
abgewogen, sondern unmöglich: sieben Tage Aufbewahrung. Die Aufbewahrung zu
erhöhen ist kein Ausweg — dreizehnmal so viel TSDB liegt auf derselben Platte
wie Postgres, und das ist die Grenze, die F2 mit `retention.size=2GB` gezogen
hat. Und §1 nennt den zweiten Grund, der auch mit unendlicher Aufbewahrung
gälte.

**Den Lesepfad ändern, statt `uptime_90d` zu kopieren** — also die Verfügbarkeit
in `LatestMetrics` direkt aus `ops_days` rechnen. Sauberer im Sinne von „keine
Kopie", und es kostet die gemeinsame Zeitangabe: `measuredAt` ist **ein**
Zeitstempel für **eine** Zeile, und drei Zahlen mit drei Altern wären drei
Angaben, die die Seite einzeln erklären müsste. Dazu vier Abfragen und der Badge.

**Das Maximum der beiden Dienste in Go.** Kann nie schmeicheln und ist eine
Zeile Code, aber das Maximum zweier Quoten ist kein „Anteil der 5xx an allen
Anfragen". Der Contract-Text hätte nachgezogen werden müssen, und dann hätte die
Seite eine obere Schranke veröffentlicht, während sie eine Messung behauptet.

**Nur `timseil-web@docker` lesen.** Am einfachsten, und der `api`-p95 ist laut
Runbook ohnehin Bucket-Rauschen. Verworfen wegen `errorRate`: ein 500 aus der
API erschiene nie auf der Seite, die über sie berichtet.

**Eine Leerzeile schreiben, wenn Prometheus schweigt.** Das Schema erlaubt es
und `00005_metrics.sql` erklärt sogar, was sie bedeutete. Sie bricht aber genau
das Abnahmekriterium der Phase (§5). Der Test
`TestAnEmptySnapshotIsStillPermittedBySchema` hält fest, dass das Schema sie
weiterhin annimmt — die Entscheidung liegt bei F5, nicht in einer Migration.

**Einen Breaker mitnehmen, „weil die anderen zwei einen haben".** Symmetrie ist
kein Grund. §6.

## Belege

Bauplan Zeile 1172, Zeile 1174, Anhang A · ADR 0007 · ADR 0008 · ADR 0017 ·
ADR 0019 §6 · ADR 0020 §7 · ADR 0021 · ADR 0039 §1–§2 · ADR 0040 §4 ·
`contract/openapi.yaml` (`Metrics`) · `api/migrations/00005_metrics.sql` ·
`ops/prometheus/rules/slis.yml` · `docs/slo.md` ·
`docs/runbooks/observability.md`
