# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

**Diese Datei ist öffentlich.** Was über *diesen Host* verrät, wie man ihn
angreift — Adressen, Ports, welche Härtung noch aussteht — gehört nach
`backlog.local.md`, das `.gitignore` fernhält und `check-repo` nicht ins
Repository lässt. Hier steht dann die Aufgabe, nicht der Zustand: „gegen L3
geprüft, Ergebnis nicht hier" ist eine vollständige Notiz für einen Notizblock
und eine unvollständige Wegbeschreibung für jemand anderen.

---

## Wo wir stehen — 27.08.2026, F5 gegen Produktion abgenommen

**Die Seite misst sich selbst.** `metric_snapshots` trägt seit heute Zeilen, die
kein Mensch eingesetzt hat, und der Uptime-Badge bewegt sich zum ersten Mal.
`sha-0f41f81`, gemessen um 18:51:53 UTC:

```
uptime90d   100          p95Ms       24.25
errorRate   0            measuredAt  2026-08-27T18:51:53.505Z
badge       "100.00%"    brightgreen
```

Die `0` bei `errorRate` ist der `or … * 0`-Zweig aus F3, in Produktion bis in
die Spalte durchgezogen: **gemessen, nicht leer.** Gegenprobe um 19:00 UTC, ein
Tick weiter, `measuredAt 18:56:53.499Z` — die Schleife tickt.

### Das Abnahmekriterium hat sich selbst vorgeführt, und niemand hat es gestellt

Die vier Logzeilen der ersten zwanzig Minuten, **gekürzt auf Zeitstempel,
Zustand und Werte** — die Zeilen selbst sind JSON, und aus der ersten ist die
Adresse des DNS-Servers entfernt, weil sie Host-Zustand ist:

```
18:36:53  not measured      dial tcp: lookup timseil-prometheus on <…>: server misbehaving
18:41:53  nothing measured
18:46:53  written           p95_ms 197.5   error_rate 0
18:51:53  written           p95_ms  24.25  error_rate 0
```

*(Dass hier „gekürzt" steht, ist die Lehre aus dieser Phase: im ersten Anlauf
stand in dieser Datei ein Ausschnitt, den so kein Lauf produziert hatte, als
„mechanisch nachgeprüft" ausgegeben. Ein zurechtgeschnittener Beleg ist in
Ordnung, solange der Schnitt dabeisteht.)*

**Der erste Lauf ist im DNS gescheitert.** Die Schleife läuft absichtlich sofort
beim Start (ADR 0019 §8: ein Prozess, der öfter neu startet als der Tick, misst
sonst nie) — und traf den Alias `timseil-prometheus`, während der
Prometheus-Container gerade neu erzeugt wurde. Beide waren dreizehn Minuten alt,
als wir nachsahen; sie sind gemeinsam hochgekommen.

Was daraufhin passierte, ist wörtlich das Abnahmekriterium aus Bauplan Zeile
1174: kein Absturz, keine erfundene Null, **keine Zeile geschrieben**, eine
WARN-Zeile, geheilt beim nächsten Tick. Der zweite Lauf sagt ehrlich `nothing
measured` — das Fünf-Minuten-Fenster war wirklich leer, der Deploy-Verkehr von
18:36:24 lag knapp davor. Erst der dritte hatte Verkehr.

**Das Labor konnte diesen Fall nicht erzeugen.** `make check-snapshots` stoppt
Prometheus absichtlich; hier ist er von selbst kurz nicht auflösbar gewesen, an
einer Stelle, an die niemand gedacht hatte. Eine Abnahme, die den Fehlerfall
provoziert, prüft die Reaktion. Diese hier hat sie *beobachtet*.

**Für F10 ist das eine Vorgabe:** jeder Deploy erzeugt diese WARN-Zeile. Ein
Alarm auf `not measured` würde bei jedem Deploy feuern — er gehört an die
Burn-Rate, nicht an einen Pager.

### Die Zahl, die stimmt und zu stark klingt

`uptime90d` steht auf **100**, und das Raster daneben sagt: **5 × `ok`, 86 ×
`nodata`** von 91 Zellen.

Arithmetisch ist die 100 richtig — ein Tag ohne Messung trägt zu keiner der
beiden Summen bei, das ist Invariante 6, und die Alternative (ihn als Ausfall
zählen) wäre die schlimmere Lüge. Rhetorisch trägt sie zu dick auf: der Badge
sagt „100.00 %" über 91 Tage, und gemessen wurden fünf. **Dieselbe Form wie der
Bucket-Fund aus F3** — die Zahl stimmt und behauptet mehr, als sie weiß.
Aufgeschrieben in `docs/slo.md`, nicht weggerechnet.

### Und der Grund dafür ist gemessen worden

Die externe Sonde läuft mit **einem Zehntel ihres Takts**. Über die letzten 100
Läufe, 81,4 Stunden, 24.08. bis 27.08.:

```
konfiguriert (3-58/5)   12 Läufe/h
tatsächlich              1,23 Läufe/h   =  10 %
Abstände                 min 13 · median 36 · max 660 Minuten
Abstände unter 6 min     0 von 99
```

**Der konfigurierte Fünf-Minuten-Takt ist kein einziges Mal erreicht worden.**
GitHub verwirft geplante Läufe unter Last; der Workflow-Kommentar ahnt es
(„GitHub's cron queue").

**Korrigiert bei der Triage am selben Tag:** hier stand „gemessen hatte es
niemand", und das war falsch. Am 24.08. war es schon gemessen und als
[#180](https://github.com/G1NG4R/timseil-dev/issues/180) eingetragen — 41 Läufe
in 23,66 h, 14 %, echtes Intervall 35 Minuten, mitsamt derselben
`down_sec`-Folge und demselben Faktor. Ich hatte `backlog.md` gelesen, wie
CLAUDE.md es verlangt, und **nie in den Issue-Tracker gesehen** — die andere
Hälfte desselben Gedächtnisses, und genau die, in die eine Triage einräumt.

Was von der heutigen Messung bleibt, ist eine **zweite, größere Stichprobe, die
zeigt, dass es schlechter geworden ist**: 10 statt 14 %, dazu ein Extremwert von
elf Stunden und die Zeile, die es am schärfsten sagt — 0 von 99 Abständen unter
sechs Minuten. Als Kommentar an #180 angehängt, nicht als zweites Issue.

**Als Nächstes:** Stufe F triagieren (F6–F11 liegen hinter dem Launch) und die
Sondenkadenz entscheiden.

---

## Vorher — 27.08.2026, F5 gebaut und im Labor abgenommen

**Die Seite hat ihre drei Zahlen — jetzt wirklich auf der Seite.** Seit B2 gibt
es `metric_snapshots`, seit F3 rechnen die Regeln, und dazwischen lag nichts.
`internal/snapshots` schließt die Lücke: alle fünf Minuten eine Instant-Query,
eine Zeile nach Postgres, und am Verhalten des Lesepfads änderte sich nichts.
Im Labor über den Proxy abgefragt, den Weg eines Besuchers:

```
"ops": { "uptime90d": 99.65277777777779,
         "p95Ms": 63.88418079096048,
         "errorRate": 0,
         "measuredAt": "2026-08-27T17:48:38.452Z" }
```

**Zwei der drei Zahlen sind gemessen, die dritte nicht — und das gehört hierhin
und nicht achtzig Zeilen weiter unten.** `p95Ms` und `errorRate` stammen aus
Prometheus, das k6-Last durch denselben Proxy gesehen hat. `uptime90d` **kann**
im Labor nicht gemessen sein: es kommt aus `ops_days`, dort füllt die externe
Sonde, und die hat ein Labor nie geprüft. Für diese eine Abfrage habe ich zwei
`ops_days`-Zeilen von Hand eingesetzt (574 von 576 Prüfungen), nachgerechnet
(`574/576·100 = 99.65277777777779`, auf die letzte Stelle) und danach wieder
gelöscht. Der Weg ist damit belegt, der Wert nicht — den belegt erst Produktion.

Die `0` in der dritten Zeile ist dagegen gemessen und nicht leer — der
`or … * 0`-Zweig aus F3, jetzt bis in die Spalte durchgezogen.

### Der stärkste Fund — und er stand seit F3 als Vertrag im Runbook

**`uptime90d` kann nicht aus Prometheus kommen. Nicht „sollte nicht" — kann
nicht.** Das Mapping, das F3 aufgeschrieben und ADR 0040 §4 unterschrieben hat,
lautete `timseil:service:availability_5m → Metrics.uptime90d, von F5 über 91
Tage aggregiert`. Dieser Prometheus hält **sieben Tage**
(`--storage.tsdb.retention.time=7d`, seit F2, aus gutem Grund: dieselbe Platte
wie Postgres). Eine 91-Tage-Frage ist an eine 7-Tage-Datenbank nicht zu stellen.

Das Unangenehme daran ist nicht der Fehler, sondern seine Form. **Beide Zahlen
waren einzeln richtig und beide standen aufgeschrieben** — die Retention in
`compose.yaml` mit Begründung, das Fenster im Contract mit Begründung. Es gab
keinen Ort, an dem sie nebeneinander standen. Geschrieben hat ihn **eine** Phase,
in zwei Dokumenten — und die nächste hat ihn geglaubt: der Plan für F5 trug das
Mapping als Tatsache, bis die Retention nachgerechnet war. Ein Vertrag, den zwei
Dokumente tragen und eine zweite Phase übernimmt, ist keine Prüfung.

Und die Antwort wäre mit unendlicher Aufbewahrung dieselbe: `availability_5m`
ist **Request**-Verfügbarkeit und blind für den Ausfall, in dem gar nichts
ankam — in dem ist dieser Prometheus selbst tot, er teilt sich den Host.
ADR 0040 §4 hat genau das schon geschrieben und die Entscheidung offen an F5
gegeben. `uptime90d` kommt jetzt aus `ops_days`, also aus der externen Sonde aus
F4, gerechnet in SQL. ADR 0041 §1.

### Die Zeile, die nicht geschrieben wird

Das Abnahmekriterium der Phase ist ein Satz über einen toten Messteil: *„die
Seite zeigt weiter den letzten gültigen Wert mit Alter, statt zu brechen oder
eine Null zu erfinden"*. Er hängt an einer einzigen Entscheidung.

`00005_metrics.sql` **erlaubt** eine Zeile mit drei `NULL` und erklärt sogar,
was sie bedeutete. `LatestMetrics` liest aber `ORDER BY measured_at DESC LIMIT
1` — eine frische Leerzeile wäre die jüngste Messung und verdrängte die letzte
gültige Zahl von der Seite. Die Abnahme wäre grün gewesen (nichts bricht, keine
Null erfunden) und die Seite hätte trotzdem `— NO DATA` gezeigt, während ein
echter Wert danebenlag.

Also: **eine Zeile entsteht nur, wenn mindestens einer der beiden
Prometheus-Werte gemessen wurde.** Fällt Prometheus aus, wird gar nichts
geschrieben — auch nicht die Verfügbarkeit, die aus `ops_days` vorläge. ADR 0041
§5. Mechanisch nachgeprüft, `make check-snapshots`:

```
observability
  ✓ the site serves its own measurement — uptime90d=null p95Ms=63.25757575757572 errorRate=0 at 2026-08-27T17:47:43.318Z   (uptime90d comes from ops_days; a lab has no external probe)
  ✓ prometheus stopped
  ✓ the api starts and answers without prometheus
  ✓ the same values, the same measuredAt — the page ages instead of going blank
  ✓ the failed run is in the log (0 → 1)
  ✓ prometheus back up
  ✓ tools/check-observability.sh --snapshots
```

`uptime90d=null` ist hier richtig und nicht dasselbe wie oben: dieser Lauf hat
keine Zeilen von Hand bekommen. Das Skript sagt den Grund selbst dazu, statt
einen Haken zu setzen, den jemand deuten muss.

### Zwei Regelsätze statt einer Wahl in Go

Der Contract hat je ein `p95Ms` und ein `errorRate`, Traefik liefert zwei
Dienste. Wo aus zwei Zahlen eine wird, entscheidet, was die Zahl **bedeutet**:
das Maximum in Go wäre eine obere Schranke und für eine Quote nicht „Anteil der
5xx an allen Anfragen", was der Contract wörtlich sagt; nur `web` zu lesen
verschwiege einen 500 aus der eigenen API. `slis.yml` bekommt deshalb zwei
`timseil:site:*`-Regeln, die über die **Anfragen** summieren statt über die
Dienste. Die drei aus F3 bleiben unverändert — sie tragen das `service`-Label,
nach dem F9 schneidet und F10 alarmiert. ADR 0041 §2.

Nebeneffekt, und er war die zweite offene Stelle aus ADR 0040: **die Zuordnung
Service → System-Slug ist damit der Regex in der Regel.** In Go steht keine
Tabelle, die zwei Traefik-Namen auf einen Slug abbildet.

### Was das Labor nicht beweisen konnte

`uptime90d` ist im Labor `null`, und das ist richtig: dort hat nie eine externe
Sonde gemessen. Bewiesen ist deshalb der **Weg**, nicht der Wert — die
Arithmetik gegen echtes Postgres (acht `//go:build db`-Tests, darunter der
Zaunpfahl bei Tag 90 gegen Tag 91 und die gemessene Null gegen die fehlende),
und die Strecke bis auf die Seite mit den beiden Zeilen von oben.

**Offen: die Abnahme gegen Produktion.** Dort trägt `ops_days` echte
Sondenmessungen, und erst dort bewegt sich der Uptime-Badge zum ersten Mal.

### Was sonst noch dabei herausfiel

- **`docs/slo.md`** ist ab jetzt die verbindliche Fassung der SLOs — mit der
  Abfrage hinter jedem SLI, dem Fenster, und dem, was jeder *nicht* sehen kann.
  Anhang A und Handbuch-Kapitel 28 verweisen darauf.
- **Zwei Sätze im Runbook waren falsch**, beide seit F3, beide unten in
  „Gefunden".
- **`tools/check-rule-names.sh`** hält die **zwei** Namen, die der Go-Code
  abfragt, gegen `slis.yml` — und seit der Kontrolle auch die Gegenrichtung, auf
  `timseil:site:*` beschränkt: eine Site-Regel, die niemand liest, ist derselbe
  Defekt von hinten. Die drei per-Dienst-Regeln bleiben ausgenommen, sie warten
  auf F9 und F10. Zweites Gate dieser Form nach `check-probe-cadence.sh`, und
  der Auslöser stand auch hier vorher fest: ADR 0040 §4 hat einen Preis auf ein
  Umbenennen gesetzt, bevor jemand umbenannt hat.

### Und der zweitstärkste Fund war die Kontrolle selbst

**Vor dem Push lief ein zweiter Durchgang über den fertigen Diff, und er hat
einundzwanzig Sachen gefunden** — kein einziger Laufzeitfehler, aber zwei echte
Codefehler und, unangenehmer, mehrere falsche Sätze *über* richtigen Code. Die
drei, die weh tun:

1. **Im Backlog stand ein `check-snapshots`-Ausschnitt, den es so nie gab.**
   Gerundet (`p95Ms=48.70`), zwei Zeilen weggelassen, die Fußnote des Skripts
   entfernt — als „mechanisch nachgeprüft" ausgegeben. Ein von Hand geglätteter
   Beleg in einer Datei, deren erster Absatz sagt, dass jede Behauptung an einen
   Beleg gebunden ist. Ersetzt durch die wörtliche Ausgabe zweier Läufe.
2. **Die WARN-Zeile für einen unmöglichen Wert konnte den Wert nicht drucken.**
   `slog` marshalliert `float64` über `encoding/json`, und das lehnt `±Inf` ab —
   herausgekommen wäre `"value":"!ERROR:json: unsupported value: +Inf"`. Genau
   die eine Zahl, für die die Zeile existiert. Der Test daneben prüfte nur den
   Zustand und lief grün darüber hinweg. Beides repariert; der neue Test fällt
   gegen den alten Code, nachgestellt.
3. **`--snapshots` konnte beim zweiten Lauf hintereinander leer grün werden.**
   `docker compose restart` behält das Log, also erfüllte die Zeile des ersten
   Laufs die Prüfung des zweiten. Jetzt wird gezählt statt gesucht — die Ausgabe
   oben zeigt `(0 → 1)`, der Lauf direkt danach `(1 → 2)`.

Dazu ein Wettlauf im selben Skript, der im schlimmsten Fall **den Fehler
gemeldet hätte, den diese Phase verhindert**: `force_run` wartete darauf, dass
`/api/health` antwortet, nicht darauf, dass der Lauf fertig ist. Fiel das INSERT
zwischen die beiden Messungen, meldete das Skript „a failed run wrote a row and
pushed the last good measurement off the page". Jetzt wartet es auf die Logzeile
der Schleife.

Der Rest waren Zahlen und Verweise: „a month ago" für drei Tage, „zwei Phasen"
für zwei Dokumente aus einer, „neun Zeilen auseinander" für zweiundzwanzig,
0,17 Prozentpunkte statt 0,16, `Loki` statt der TSDB, und ein ADR über 91 Tage,
dessen **Dateiname `neunzig` sagte**.

**Die Lehre ist dieselbe wie der Hauptfund, eine Etage höher:** Der Text über
eine Messung driftet leichter als die Messung. Und niemand prüft ihn — es gibt
kein `make check` für einen Absatz.

### Und CI fand zwei weitere, die beide Durchgänge nicht sehen konnten

**Der lokale Linter kann hier seit Go 1.26 nicht mehr urteilen** — v2.12.2
stürzt beim Laden ab, gepinnt ist v2.13.1. Drei Runden lang hieß „`make check`
grün außer `check-lint`" deshalb *ungeprüft*, nicht *in Ordnung*. CI hat den
Unterschied bezahlt:

1. **ST1005**, an einem Fehlertext, der mit `Get "http://…` beginnt — die
   wörtliche Ausgabe von `http.Client`. Repariert nicht mit `//nolint`, sondern
   mit dem echten Typ: `&url.Error{Op: "Get", …}`. Das ist ohnehin genauer, weil
   `errors.Is` und `errors.As` sich dann verhalten wie in Produktion.
2. **Ein Wettlauf in meinem eigenen Test.** `TestTheFirstRunHappensBeforeTheFirstTick`
   wartete darauf, dass die Zeile in der Datenbank steht, und las dann das Log —
   `runOnce` schreibt aber erst die Zeile und protokolliert danach. Auf dem
   Laptop einen Tag lang grün, in CI rot. Jetzt wartet **jeder** Test dieser
   Datei auf die Logzeile, mit der ein Lauf endet, statt auf einen Zwischenstand
   plus 20 ms Schlaf. 200 Durchläufe und `-race` grün.

Der zweite ist der unangenehmere: **ein Test, der auf das falsche Ereignis
wartet, ist kein Test, sondern eine Wette** — und er hat genau die Phase
beschädigt, die davon handelt, dass eine Zahl an einen Beleg gebunden sein muss.

**Als Nächstes:** F5 gegen Produktion abnehmen, dann Stufe F triagieren — F6–F11
liegen hinter dem Launch.

---

## Vorher — 26.08.2026, F3 abgenommen: Labor und Host

**Seit heute hat die Seite ihre drei Zahlen — als Regel, noch nicht auf der
Seite.** `Metrics.p95Ms`, `Metrics.errorRate` und `Metrics.uptime90d` haben ab
jetzt je eine Recording Rule über `traefik_service_*`, und die Namen sind ein
Vertrag mit F5. Sechs Scrape-Jobs statt drei, alle mit Daten:

```
✓ all scrape jobs up — 6 jobs: alloy loki node postgres prometheus traefik
✓ timseil:request_duration_seconds:p95_5m → api=0.0975  web=0.0983
✓ timseil:requests:error_ratio_5m         → api=0       web=0
✓ timseil:service:availability_5m         → api=1       web=1
```

Die Null in der zweiten Zeile ist der Punkt: sie ist **gemessen**, nicht leer.
Der `or … * 0`-Zweig ist genau dafür da, und ohne ihn wäre „keine Fehler" als
„nicht gemessen" auf der Seite gelandet.

**Die Vorbedingung ist gelöst, auf beiden Seiten.** Nicht wir gehen ins
`dokploy-network`, Traefik kommt zu uns ins `observability-network` — unter dem
Alias `timseil-traefik`, den `prometheus.yml` scrapt. Im Labor bewiesen
(`job=traefik` up, 135 Serien) und auf dem Host angehängt.

**Die offene Haltbarkeitsfrage ist beantwortet, und die Antwort ist genauer als
die Befürchtung.** Der Proxy ist ein einfacher Container, kein Swarm-Dienst. Die
Anbindung **übersteht einen `docker restart`** — sie steht in der Container-Config
des Daemons, nicht im Startbefehl. Was sie nicht übersteht, ist ein Neuerzeugen
des Containers, also ein Dokploy-Upgrade. Die Lektion vom 24.08. war ein
*Redeploy*, kein Neustart; die Unterscheidung ist der ganze Unterschied.
Betriebsfest, nicht upgradefest — **der Relay-Fallback aus ADR 0040 bleibt
ungebaut.**

### Der stärkste Fund — und er hat die Abnahme bestanden

**Das Abnahmekriterium war erfüllt und die Zahl trotzdem keine Messung.**
Verlangt war „ein p95, der zu einem k6-Lauf passt": Regel 98 ms, k6 75 ms,
gleiche Größenordnung. Was stutzig machte, war die Richtung — Traefik misst
*weniger* als k6 und lag trotzdem höher.

Traefiks Standard-Buckets sind `0.1, 0.3, 1.2, 5.0` Sekunden. **7582 von 7896
Anfragen lagen im ersten Bucket.** `histogram_quantile` interpoliert dann linear
zwischen 0 und 100 ms — die Zahl ist Arithmetik auf einer Bucket-Kante, und
keine einzelne Anfrage wurde je mit irgendeiner Dauer beobachtet, nur mit
„unter 100".

Das ist Invariante 1 in dem einen Kostüm, das sie nicht erkennt: **kein
fehlender Wert, der sich als vorhanden ausgibt, sondern ein vorhandener, den
keine Beobachtung stützt.** Jeder Wächter im Repo sucht nach dem ersten Fall.

Repariert mit Prometheus' eigenen Default-Buckets, in `compose.lab.yaml` und im
Runbook für die statische Konfiguration des Hosts. Die Abnahme danach, 6 Minuten
Last damit das 5-Minuten-Fenster voll ist, 14 156 Anfragen, 0 % Fehler:

```
k6    http_req_duration p(95)                    72,54 ms
Regel timseil:request_duration_seconds:p95_5m    74,62 ms
```

**Zwei Millisekunden, und die Richtung ist erklärbar** — Traefik misst weniger
als k6 und liegt trotzdem darüber, weil innerhalb des Buckets interpoliert wird.
Der Fehler wohnt an den Bucket-Kanten, und die belastbare Aussage lautet „auf
einen Bucket genau", nicht „72 ms".

**Derselbe Fehler steht eine Etage tiefer noch da, bewusst:** `/api/health`
antwortet in ein bis zwei Millisekunden, liegt damit im untersten Bucket, und
die Regel liefert `0,00475` — wieder eine Interpolation. Traefik nimmt eine
Bucket-Liste, nicht eine je Dienst; die Zahl der Seite ist die des Proxys über
die Seite. Aufgeschrieben statt repariert. Ausgeschrieben in Beitrag 005.

### Und gegen Produktion, am 26.08.

**Der Fund gilt auch dort — und ist dort inzwischen repariert.** Traefik hängt
im `observability-network`, Alias `timseil-traefik`, angehängt ohne Neustart.
Vorher: Voreinstellung `0.1, 0.3, 1.2, 5.0` und **177 von 181** Beobachtungen im
ersten Bucket. Nachher, mit derselben Liste wie im Labor:

```
le=0.005  0     le=0.05   21     ← 19 Beobachtungen in (0.01, 0.025]
le=0.01   0     le=0.075  22     ←  2 in (0.025, 0.05]
le=0.025  19    le=0.1    22     ←  1 in (0.05, 0.075]
```

p95 jetzt 48,4 ms, interpoliert zwischen 0.025 und 0.05 — **immer noch eine
Interpolation**, aber über ein 25-ms-Band mit Beobachtungen auf beiden Seiten
statt über ein 100-ms-Band mit einer Untergrenze von 0. Vorher war das Ergebnis
eine Funktion der Bucket-Wahl, jetzt bewegt es sich mit der Latenz.

**Was diese Zahl nicht ist:** n = 22, alles `code=200 GET`, in Sekunden erzeugt.
Das ist „Auflösung bestätigt", keine Latenz-Baseline — die ergibt sich erst aus
Stunden echtem Verkehr.

**Die Haltbarkeitsfrage ist beantwortet.** `docker restart dokploy-traefik`, und
`observability-network` steht danach unverändert in der Netzliste, belegt an
einer frischen `StartedAt`. Betriebsfest, nicht upgradefest — der Relay-Fallback
aus ADR 0040 bleibt ungebaut.

### Abgenommen gegen Produktion, 26.08.2026, 19:56 UTC

**Sechs Jobs, alle `1`** — `prometheus alloy loki traefik node postgres`. Acht
Container laufen, die zwei neuen Exporter inklusive.

Und die Abnahme selbst, beide Richtungen der Invariante in einer Abfrage:

```
timseil-web@docker    p95 0.0246   error_ratio 0     availability 1
timseil-api@docker    p95 NaN      error_ratio NaN   availability NaN
```

**`web` ist gemessen und liefert eine echte Null** — der `or … * 0`-Zweig
greift. **`api` ist nicht gemessen und liefert `NaN`**, weil die Anfragen nur
auf `/` gingen; die Regel erfindet dafür keine Null. Genau der Unterschied, den
Invariante 1 verlangt, gegen Produktion statt gegen das Labor.

Davor stand dieselbe Abfrage dreimal auf `NaN` — der letzte Verkehr war der
Deploy-Verify, das 5-Minuten-Fenster war leer. Auch das ist die richtige
Antwort, und der Übergang `NaN → 0` ist der eigentliche Beweis.

### Zwei Dinge, die der Deploy nebenbei gelehrt hat

**Der Merge löst die Pipeline sofort aus.** „Command-Feld nach dem Merge" war
die falsche Reihenfolge — das Feld gehört zwischen den grünen PR-Lauf und den
Merge. Der `deploy`-Job scheiterte deshalb einmal mit *„the panel does not run
the rollout this repository defines"*, und das ist die Sperre bei der Arbeit:
sie hielt an, **bevor** irgendetwas lief, die Seite blieb auf dem alten Build.
Kostet einen Wiederholungslauf.

**„Deploy grün" und „die Dienste laufen" sind zwei Aussagen**, und die erste
Messung danach zeigte `node-exporter` und `postgres-exporter` als fehlend, dazu
die Zwillinge noch am Leben. Kein Fehler — die Abfrage fiel mitten in den
Rollout, `deploy.sh` verifiziert nur api und web, Schritt 4 und 5 laufen danach
weiter. Eine Minute später war alles da. **Der Reflex, den ersten Blick zu
melden, wäre der F2-Fehler mit umgekehrtem Vorzeichen gewesen.**

**Als Nächstes: F5** — SLO-Definition und die PromQL-Snapshots nach Postgres.
Erst dort verlassen die drei Zahlen Prometheus und erreichen die Seite;
`Metrics.*` steht bis dahin weiter auf `null`, und das ist so geplant.

---

## Vorher — 24.08.2026, F2 gegen Produktion abgenommen

**Der Stack läuft auf dem Host, und die Abnahme lief in Grafana statt in einem
Skript.** Beide Hälften:

```
up  →  job="prometheus"  job="alloy"  job="loki"      alle 1
{service="api"}  →  JSON-Zeilen mit level, msg, trace_id
```

**Was die zweite Hälfte nebenbei beweist, und es ist mehr als F2 versprochen
hat.** Die angezeigte Zeit `21:58:54.513` (CEST) und das Feld
`"time": "2026-08-24T19:58:54.513388797Z"` sind dieselbe Zeit — **der
gespeicherte Zeitstempel ist der aus der Zeile**, nicht der des Ingests, und
zwar in Produktion statt gegen eine Vorrichtung. Die Nanosekunden aus Go stehen
unversehrt darin. Das war der offene Punkt aus F1a, und er ist damit zweimal
belegt.

Sichtbar sind außerdem die drei Hintergrundschleifen mit ihrer Korrelation —
`contact dispatch`, `ops roll-up`, `contributions refresh`, jede mit `trace_id`.
F1s Arbeit, zum ersten Mal von außen gelesen statt behauptet.

**`job="crowdsec"` steht nicht dabei**, und das ist der eigentliche Beleg dieser
Session: die Datasource hängt über den Alias an *unserem* Prometheus. Ohne den
Alias hätte genau dort der Nachbar geantwortet.

### Was diese Abnahme gekostet hat — vier Fehler, alle im Aufgeschriebenen

Nicht einer davon war im Gebauten. Alle vier standen in Dokumenten, die
behaupteten, was gilt, und die niemand ausgeführt hatte:

1. **Der Rollout startete die drei Dienste nie.** Grün, ausgeliefert, nicht
   gelaufen. Eigener Eintrag unten, dazu `tools/check-rollout.sh`.
2. **`up{stack="timseil"}` kann nie etwas liefern** — `external_labels` hängen
   nur an Daten, die den Server verlassen.
3. **Der Config-Beleg widersprach seinem eigenen Fließtext** (zwei `sha256sum`).
4. **Die Abnahme hätte die eigenen Rollout-Zwillinge als fremd gemeldet.**

Die Gemeinsamkeit ist benennbar: **jede dieser Zeilen war geschrieben und nie
ausgeführt worden.** Der 5-GB-Lauf war gemessen, die Grenzen waren gemessen —
aber der Weg von „gemergt" zu „läuft und wird gelesen" bestand aus Sätzen. Das
ist die Lehre dieser Stufe, und sie gehört in den Beitrag zu F2.

---

## Vorher — 23.08.2026, F2 gebaut

**Seit heute hebt etwas die Zeilen auf, und die Grenze darauf ist gemessen.**
Drei Container mehr: `prometheus`, `loki`, `alloy` — keiner davon mit einem
`depends_on` in seine Richtung, weil die Seite weiterläuft, wenn alle drei weg
sind.

```
✓ prometheus scrapes itself, alloy and loki — all up
✓ loki holds alloy api db loki prometheus web
✓ api: the stored timestamp is the one in the line (2026-08-23T18:51:43.363325483Z)
✓ web: the stored timestamp is the one in the line (2026-08-23T18:51:43.398Z)
```

**Der offene Punkt aus F1a ist damit geschlossen** — Nanosekunden aus Go,
Millisekunden aus Node, beide mit *ihrer eigenen* Zeit in Loki statt mit der des
Ingests. Gemessen gegen die echten Produzenten, nicht gegen eine Vorrichtung.

### Der Fund, und er ist eine Korrektur am eigenen Plan

**Loki hat keine größenbasierte Retention.** Bauplan Kapitel 10 und ADR 0007
verlangen beide eine „Compactor-Grenze ~5 GB" — die Einstellung existiert nicht.
Lokis Retention ist ausschließlich zeitbasiert. Prometheus hat
`--storage.tsdb.retention.size`, Loki hat keine Entsprechung, und eine Zeile in
unserer Konfiguration, die so täte, wäre ein Limit, das durchgesetzt *aussieht*.

Die Decke ist deshalb eine **Rate**, kein Volumen: `per_stream_rate_limit` gegen
den Amoklauf, `ingestion_rate_mb` gegen denselben Flood über mehrere Streams,
die 14 Tage für den Dauerbetrieb. Der Bauplan bleibt unverändert (ADR 0027 §2);
korrigiert wird ADR 0039 und das Runbook, also das, was behauptet, was **gilt**.

### Der zweite Fund kam erst durch die Abnahme, und er hat den Entwurf geändert

Der erste 5-GB-Lauf war **grün und trotzdem falsch**:

| | nur das Loki-Limit | mit Limit an beiden Enden |
|---|---|---|
| `loki-data` | 2 MB | 6 MB |
| **`alloy-data`** | **76 MB** | **3 MB** |
| von Alloy gelesen | 645 022 Zeilen | 1 182 325 |
| an Loki gesendet | 2 379 | 11 606 |
| im Collector verworfen | 0 | 1 162 520 |

Loki hielt seine Grenze und wuchs um 2 MB — der Rückstau lag danach im
Write-Ahead-Log des Collectors, achtunddreißigmal so groß wie der Speicher, den
die Grenze geschützt hatte, **auf derselben Platte wie Postgres**. Ein
Rate-Limit am Ziel entfernt keinen Druck, es verschiebt ihn. Also steht dieselbe
Decke jetzt auch an der Quelle (`stage.limit`, 500 Zeilen/s je `service`,
verwerfend). Beide Zahlen bewegen sich zusammen, und beide Dateien sagen das im
Kommentar.

**Was die Abnahme nicht beweist**, und es steht bewusst hier statt als Haken:
Rate × Retention sind keine 5 GB. Der über Tage gehaltene Flood wächst weiter —
kein Loki-Schalter schließt das, der Wächter dafür ist der Disk-Alarm bei 70 %
aus **F10**.

### Ein dritter Fund, klein und übertragbar

`discovery.docker` liefert **ein** Ziel je Container, nicht eins je
Container-Netz-Paar. Die Regel, die Duplikate von api und web verhindern sollte,
behielt nur Ziele im `*_default`-Netz — und ließ damit genau die Container
durch, die **ein** Netz haben. Vier von sechs Diensten fehlten, der Stack war
grün, Loki halb leer. Die Regel ist weg; die Messung steht als Kommentar in
`ops/alloy/config.alloy`. Ein Duplikat, das man nicht gemessen hat, ist ein
Duplikat, gegen das man keinen Filter schreiben sollte.

**Der Socket ist die eine Ausnahme dieses Repositories**, und sie ist eng: ein
Dienst, ein literaler Pfad, `:ro` erzwungen, drei Selbsttests. Read-only macht
ihn enger, nicht sicher — ADR 0039 §3 sagt das, statt es zu umschreiben.

**Gegen den Host geprüft ist noch nichts.** Der 5-GB-Lauf lief lokal gegen
dieselbe Datei, die dort laufen wird; auf dem Host folgt ein Hash-Vergleich der
geladenen Konfiguration, keine zweite Messung.

**Die drei Fragen an den bestehenden Prometheus sind beantwortet, das Ergebnis
steht nicht hier.** Ausgang, soweit er die Aufgabe betrifft: die Vorbedingung
für den Host-Teil ist erfüllt, es wird nichts doppelt gescrapt, und dabei sind
drei Punkte aufgefallen, die nicht F2 sind und nicht hierher gehören.

**Als Nächstes: ein Alias, dann der Host-Teil von F2** (Netz anlegen, Grafana
anhängen, zwei Datasources, Config-Hash), dann F3, F5.

---

## Vorher — 23.08.2026, F2 ist entblockt

**Gegen [#147](https://github.com/G1NG4R/timseil-dev/issues/147) gemessen, das
Ergebnis steht nicht hier.** Es ist Ist-Stand dieses Hosts und liegt in der
lokalen Datei; öffentlich gehört die Aufgabe und ihr Ausgang, nicht der Zustand.

**Der Ausgang, in drei Sätzen:**

1. **Die Grenzen aus ADR 0027 halten.** `db`, `api` und `web` liegen alle weit
   unter ihrem Limit — nachgetragen als §3a dort, mitsamt dem, was die Messung
   *nicht* beweist: sie war Leerlauf, die Gegenprobe unter Last gehört zu L8.
2. **RAM und Platte sind kein Engpass.** Das war die Sorge, mit der #147
   aufgemacht hat, und beide Antworten sind entspannt genug für F2.
3. **Punkt 1 von #147 ist beantwortet: es gibt eine bestehende Grafana.**

**Damit ist die Entwurfsfrage entschieden, die der Bauplan offengelassen hatte.**
Er sagt an einer Stelle „Prometheus und Loki im selben Dokploy-Stack" und an
anderer „bestehende Grafana-Instanz einbinden. **F2 macht beides:** eigener
Prometheus, eigener Loki, Alloy als Collector im eigenen Stack — die bestehende
Grafana als Oberfläche, mit unseren Datasources.

Der Grund ist ADR 0027s eigene Haltung: **eine Grenze, die wir behaupten, muss
von uns durchgesetzt werden.** F2s Abnahmekriterium ist „ein künstlich erzeugtes
5-GB-Log löst das Limit aus, statt die Platte zu füllen" — das prüft nur etwas,
wenn das Limit in unserer Konfiguration steht und nicht in der eines fremden
Stacks auf derselben Maschine.

**Der Bauplan wird dabei nicht angefasst.** Kapitel 10 trägt drei Zahlen, die die
Messung widerlegt; sie bleiben stehen. ADR 0027 §2 sagt warum: „den Plan an die
Umsetzung anzupassen löscht die Spur dessen, was sich geändert hat." Korrigiert
wird das Dokument, das behauptet, was **gilt** — nicht das, was **geplant war**.

**Als Nächstes: F2a** — der Stack läuft. Dann F2b (die Grenzen sind bewiesen),
F3, F5.

---

## Vorher — 23.08.2026, F4 abgenommen

**F4 ist gemergt und in Produktion belegt.** [#169](https://github.com/G1NG4R/timseil-dev/pull/169),
`dbea559`, Release **`v0.4.0`**, Deploy `ok … 249 s`, gemeldet 14:40:48 UTC.

**`INTERNAL_PROBE_TOKEN` ist bewiesen** — die erste Benutzung überhaupt, seit
E5c als offener Punkt geführt. Der Lauf sagt beides in einer Zeile:

```
probe up https://timseil.dev 489ms
```

`up` heißt hier `GET /` → 200 **und** `POST /api/internal/probe` → 204. Ein
falscher Token hätte den Lauf mit „misconfiguration, not an outage" rot beendet
und **nichts** geschrieben.

**Die Sonde läuft von selbst.** Erster geplanter Lauf 14:56:27 UTC,
`event: schedule`, ohne dass jemand ihn angestoßen hat. **Belegt ist damit das
Anlaufen, nicht die Kadenz** — dazu unten ein offener Punkt, denn die Kadenz ist
der Faktor in `down_sec`.

**Der Beleg steht auf der Seite und ist von außen nachzählbar:**

```
GET https://timseil.dev/api/systems/timseil-dev
vorher :  byState = {"nodata": 91}
nachher:  byState = {"nodata": 90, "ok": 1}
          days[-1] = {"d":"2026-08-23","state":"ok","downSec":0}
```

90 + 1 = 91. Invariante 7 hält.

**`make check-deployed --host`: 10 von 10 Behauptungen**, darunter die zwei, die
nur der Host machen kann — die laufenden Container **sind** die veröffentlichten
Digests, für api und für web.

**Die Zeitreihe auf dem Host, und sie sagt mehr als „grün":**

```
14:40:59  uptime backfill  no log yet     ← Lauf beim Start
14:45:59  ops roll-up      days: 0
14:47:58  ← Sondenzeile (workflow_dispatch)
14:50:59  ops roll-up      days: 1        ← das Raster kippt
14:55:59  uptime backfill  no log yet     ← exakt 15 min nach dem ersten
14:56:34  ← Sondenzeile (schedule)
```

Die 15-Minuten-Kadenz aus `policy.go` ist damit gegen die Uhr belegt, nicht gegen
den Code. `ops_checks` trägt **2 Zeilen, beide `origin = probe`**, keine
`backfill` — richtig, es gab keinen Ausfall. Dass `ops_days.checks_total` bei der
Messung auf **1** stand, ist kein Fehler: der Roll-up lief 14:55:59, die zweite
Zeile kam 14:56:34. Das Raster darf bis zu fünf Minuten hinter den Daten liegen,
`aggregateEvery` ist genau dafür auf `ProbeInterval` gesetzt.

---

### **Tag 1 von 91 ist der 23.08.2026**

Das ist die Zahl, die diese Phase eigentlich liefert. Ab hier ist jede Zelle im
Betriebsraster gemessen. Der Bauplan (Zeile 1481) verlangt **≥ 7 Tage vor
Launch** — frühestes ehrliches Launch-Datum für das Raster: **30.08.2026.**

---

**Was nicht abgenommen ist, und es steht bewusst hier statt als Haken:**

- **Die Backfill-Hälfte.** Sie braucht einen echten Ausfall. Bewiesen gegen einen
  echten Postgres und gegen die Datei, die `probe.sh` selbst geschrieben hat —
  Produktionsbeweis liegt auf **M1**.
- **`source_ref`.** Entsteht erst bei einer Wiedereinspielung, also mit demselben
  Ausfall.
- **Der Uptime-Badge bewegt sich nicht.** `uptime90d` ist weiter `null`, er liest
  `metric_snapshots` — das baut **F5**.

**Als Nächstes: die Messung vor F2** ([#147](https://github.com/G1NG4R/timseil-dev/issues/147)),
dann F2, F3, F5.

---

## Vorher — 23.08.2026, F4 gebaut

**Seit heute misst etwas von außen, und das Raster hat seine erste gemessene
Zelle.** Gegen den Dev-Stack, durch einen Traefik-Ersatz, damit `/` und
`/api/*` unter einer Adresse liegen wie in Produktion:

```
probe up http://127.0.0.1:18090 38ms
{"level":"INFO","msg":"ops roll-up","days":1}

 day        | state | checks_total | checks_up | down_sec
 2026-08-23 | ok    |            1 |         1 |        0
```

`days: 0` stand dort seit C7. Das war richtig — der Endpoint nahm Rohdaten an,
und niemand rief ihn. Jetzt ruft alle fünf Minuten jemand an.

**Der Leser hat den echten Branch erreicht, ohne dass irgendetwas gepusht war:**

```
{"level":"INFO","msg":"uptime backfill","state":"no log yet"}
```

Das ist ein 404 von `raw.githubusercontent.com` auf `ops-data/uptime-log.txt`,
unauthentifiziert, als Normalzustand behandelt. Ein Host, der seit F4 nicht weg
war, hat kein Ausfallprotokoll.

**Was gebaut ist**, in fünf Commits: `api/internal/uptime` (Grammatik,
Expansion, Leser), `BackfillOpsChecks`, `tools/probe.sh`,
`.github/workflows/probe.yml`, `tools/check-probe-cadence.sh`. Dazu ADR 0038,
zwei Runbooks, `UPTIME_TRANSPORT` und der Log-Beitrag 002.

**Die fünf Entscheidungen stehen in ADR 0038**, drei davon abweichend vom
Bauplan oder darüber hinaus: kein SMTP aus dem Workflow (der rote Lauf ist der
Alarm, F10 baut den richtigen Pfad), `GITHUB_TOKEN` mit Job-Scope statt eines
langlebigen PAT, und „`401` ist kein Ausfall, sondern unser Tippfehler".

**Ein zweiter Fund kam erst beim letzten Prüflauf.** `make check-db` fährt mit
`-count=1`, `make check` nicht — und unter `-count=1` waren **meine eigenen**
Tests flakig: `waitFor` wartete auf ein Signal, das die Schleife *vor* der
Logzeile setzt, also las die Zusicherung manchmal ein leeres Log. Der Testcache
hatte das in `make check` verdeckt. Repariert, indem die Naht wegfiel: die
Zusicherungen fahren `runOnce` jetzt synchron, und die Schleife selbst hat
**einen** Test für ihre **eine** Eigenschaft (Start-Lauf, Tick, Stop). Danach die
Suite unter `-race` — das fand den Eintrag zu `internal/contact` unten.

**Der stärkste Fund ist klein und übertragbar.** `time.Parse` akzeptiert einen
Sekundenbruchteil **auch dann, wenn das Layout keinen nennt** — dokumentiert,
und die einzige Stelle, an der die Funktion großzügig ist. `09:15:00.123Z`
parste sauber und formatierte sich zu `09:15:00Z` zurück: eine Schreibweise, die
die Grammatik zu verbieten behauptet, still akzeptiert und gerundet. Die Regel
ist jetzt der Rundlauf selbst, `at.Format(layout) != feld`. Ein Formatstring
beschreibt, was man akzeptieren *will*; die Menge dessen, was ein Parser
akzeptiert, ist meistens größer.

**Was noch fehlt** — beides ist eine Aufgabe für dich, nicht für mich:

1. **`INTERNAL_PROBE_TOKEN` als Repository-Secret.** Muss **vor** dem Merge
   stehen: sobald `probe.yml` auf `main` liegt, läuft die Sonde alle fünf
   Minuten, und ohne Token läuft sie rot. Klickweg in
   `docs/runbooks/github.md`, Abschnitt „Der `probe`-Workflow".
2. **`ops-data` ist lokal einen Commit voraus** (`ec86c83`, der Branch-README
   erklärt jetzt das Dateiformat). Eigener Push, nicht Teil des PR.

**Als Nächstes: F2** — Alloy, Prometheus, Loki. Die offene Vorbedingung dazu
steht weiter unten ([#147](https://github.com/G1NG4R/timseil-dev/issues/147)).

---

## Vorher — 23.08.2026, Stufe F1 abgenommen

**F1 ist gemergt und in Produktion belegt.** [#167](https://github.com/G1NG4R/timseil-dev/pull/167),
`1f56a8c`, Release **`v0.3.0`** (Tagger G1NG4R, kein Bot), Deploy `ok … 245 s`,
gemeldet 11:56:41 UTC.

**Der Beleg steht auf der Seite selbst**, und er ist besser als jeder Log-Grep,
weil ein Fremder ihn nachvollziehen kann:

```
GET https://timseil.dev/  → 200,  x-request-id: d7ae967a…
<dl><dt>api</dt><dd>ok</dd><dt>version</dt><dd>v0.3.0</dd></dl>
```

Diese Zeichenkette ist durch die ganze Kette gelaufen — `proxy.ts` prägt die ID,
`serverFetch` trägt sie zur API, `/api/health` antwortet, der Render zeigt sie.
Und sie nennt die Release-Nummer **dieses** Merges. Dazu: `/healthz` trägt
**keine** `x-request-id` (der `matcher` schließt ihn aus, Traefik fragt ihn
einmal pro Sekunde und pro Backend), und zwei Anfragen bekommen zwei
verschiedene IDs.

**`make check-deployed --host`: 10 von 10 Behauptungen.**

| | |
|---|---|
| head of main | `1f56a8c`, 11:52:33 UTC |
| api-Image | `sha256:b52f3eb79598a96a2d3933c1020bd66de4990f491e22bc4e6f82a80cf9b1ee1a` |
| web-Image | `sha256:10f7142993738c699fbd2caa0b259fda4685a4c8c194c07bd1b4642483877de4` |
| gebaut / läuft seit | 11:53:45 / 11:56:51 UTC |

**Die zwei, die nur der Host machen kann, sind darunter:** die laufenden
Container **sind** die veröffentlichten Digests, für api und für web. Vom Klon
aus sind acht davon grün und die neunte heißt `– not asked here` — geführt wurde
sie auf dem VPS mit

```sh
cd ~/timseil-dev && git pull && sh tools/check-deployed.sh --host
```

Damit ist die Kette vom Commit bis zu den Bytes auf der Maschine geschlossen,
und **auch die Produktionsabnahme von F1a ist nachgeholt** — sie fehlte seit dem
Morgen des 23.08. und stand als Schuld in diesem Abschnitt.

**Als Nächstes: F4, nicht F2** — und die Abweichung von der Bauplan-Reihenfolge
ist bewusst. F4 ist die einzige Phase der Stufe, deren Wert vom **Startdatum**
abhängt: das 91-Tage-Betriebsraster braucht Historie, und Historie lässt sich
nicht nachbauen. Prometheus und Loki halten 7 und 14 Tage — dort kostet ein
späterer Start nichts Dauerhaftes. Dazu hat F4 keine offene Vorbedingung, F2
schon ([#147](https://github.com/G1NG4R/timseil-dev/issues/147): der Host trägt
mehr als diesen Stack), F4 benutzt als Einziges das noch unbelegte
`INTERNAL_PROBE_TOKEN`, und es ist die einzige F-Phase, die etwas erzeugt, das
auf der Seite sichtbar wird. „Im Zweifel Inhalt."

---

## Vorher — 23.08.2026, F1b gebaut

**Eine Anfrage an `/` hinterlässt jetzt eine Zeile in beiden Containern, und
eine ID findet beide.** Gemessen gegen den Dev-Stack, mit einem von außen
vorgegebenen `traceparent`:

```
{"msg":"request","path":"/api/health","status":200,
 "request_id":"eff2c10b…","trace_id":"d2ad2aad…"}                        ← api
{"msg":"upstream request","path":"/api/health","status":200,"duration_ms":88,
 "upstream_request_id":"eff2c10b…","request_id":"dc51add8…","trace_id":"d2ad2aad…"}  ← web
```

`upstream_request_id` **ist** die `request_id` der API-Zeile. Das ist die
Brücke: die API übernimmt eine eingehende `X-Request-Id` nur vom
vertrauenswürdigen Peer, also wird die von web gesendete nicht ihre — web
schreibt deshalb auf, welche es war. Der Wortlaut des Bauplans gilt damit in
einem Sprung, über `trace_id` in keinem.

**Der Fund der Phase steckte nicht im neuen Code, sondern im alten.**
`Scrub("peer 2001:db8:: is gone")` gab in der API seine Eingabe zurück:
`matchAddr` übersprang jeden Kandidaten, der auf einen Doppelpunkt endet, als
Satzzeichen — und `::` ist Syntax. Jede IPv6-Adresse, die auf ihrem Nulllauf
endet, stand seit F1a im Log eines Dienstes, dessen Datenschutzseite keine
verspricht.

**Warum der Fuzzer das nicht finden konnte, ist der übertragbare Teil.**
`FuzzScrubRemovesEveryAddressItCanSee` rescannt mit `addressesIn`, und das ruft
denselben `matchAddr` — die Eigenschaft lautet also „der Filter sieht keine
Adresse mehr, **die er sehen kann**". Ein Kandidat, den der Matcher nie ansieht,
ist einer, nach dem die Eigenschaft nie fragt. Der Web-Test rescannt stattdessen
mit `net.isIP` über jeden Teilstring und teilt keine Zeile mit dem Matcher; er
hat `bA::` in dreitausend Zufallseingaben erzeugt. Beide Seiten tragen die
Reparatur, das Korpus einen Eintrag mehr, und die zwei Rescans bleiben
**absichtlich verschieden**.

**Daraus wurde eine zweite Entscheidung.** `lib/scrub.ts` rief anfangs
`net.isIP` — dasselbe wie der Test. Rausgeflogen ist es aus einem Bauzwang
(Next übersetzt `instrumentation.ts` auch für die Edge-Runtime, wo `node:net`
nicht lädt), und der Umweg war mehr wert als der ruhige Build: seitdem ist
`isIP` ein **unabhängiges Orakel**. Gemessen über sechs Millionen erzeugte
Token: **0 verpasste** von 35 401 Adressen, **0 über-redigiert**. Der erste Lauf
stand bei 0 verpasst und **12 906** über-redigiert — alle eine Zone-Regel, die
nach `%` alles durchließ; die letzten zwei waren `0.0.0.0::`, wo eine
eingebettete IPv4 nicht das Ende der Adresse ist.

**Die PII-Gegenprobe, gegen den echten Fehlerwert im laufenden Container:**

```
raw   : fetch failed: connect ECONNREFUSED 127.0.0.1:9999
logged: fetch failed: connect ECONNREFUSED redacted-ip
```

**0 Treffer** für das Container-Subnetz im gesamten Log beider Container. Das
ist der Fall, für den der Scrubber in web überhaupt existiert — ADR 0035 hat
`api` in Schritt 3 jedes Rollouts kurz weg, ohne Filter schriebe also jeder
Rollout die Adressen mit.

**Der kaputte Fall der Seite:** `api` gestoppt, `/` abgerufen → **HTTP 200**,
`— NO DATA` in beiden Feldern, Web-Zeile mit `status: 0` unter derselben
`trace_id`, kein Absturz. `serverFetch` wirft nie.

**Zahlen der Phase:** `web/` hatte 195 Zeilen Handcode und **null Tests**; jetzt
99 Tests auf `node --test`, ohne neue Abhängigkeit. Der 2 700-Zeichen-Lauf, der
in Go sieben Sekunden kostete, braucht hier 37 ms; die reine Doppelpunkt-Variante
48 ms.

**`v0.2.0` steht auf origin und zeigt auf `26ffaf7`** — den F1a-Merge. Die
Produktionsabnahme von F1a gehört noch hierher nachgetragen, sobald
`make check-deployed --host` gegen sie gelaufen ist; die Zahlen dieser Phase
oben sind Dev-Stack, nicht Produktion.

**Als Nächstes: F2** — Alloy, Prometheus, Loki. Zwei Zeilen unten warten darauf.

---

## Vorher — 23.08.2026, F1a abgenommen

**Jede Zeile der API trägt jetzt `request_id` und `trace_id`, und keine trägt
PII.** Gemessen gegen den laufenden Dev-Stack, nicht gegen Tests:

```
{"level":"WARN","msg":"internal endpoint refused a request","path":"/api/internal/probe",
 "request_id":"c1ae68…","trace_id":"c6526a…"}
{"level":"INFO","msg":"request","method":"POST","status":401,
 "request_id":"c1ae68…","trace_id":"c6526a…"}
```

Handler-Zeile und Access-Zeile unter einer ID — vorher trug nur die zweite eine.
Ein eingehender `traceparent` von außen wurde übernommen (`4bf92f…4736`), die
eingehende `X-Request-Id` nicht: die Unterscheidung ist ADR 0037.

**Der Fund, der die Phase getragen hat, war fremder Text, nicht ein Feld.**
`mail/smtp.go` verpackt die Antwort des Relays in einen Fehler, `contact` loggt
ihn — und eine SMTP-Ablehnung lautet `550 5.1.1 <jemand@example.com>: …`. Über
dem Aufruf stand bereits *„never the address. F1's PII rule."* Die Absicht war
richtig, die Zeile leckte trotzdem. Zwei weitere Stellen kamen beim Durchsehen
dazu: `mail/log.go` schrieb die **komplette Nachricht** (`envelope`), und
`ratelimit.go` schrieb `r.RemoteAddr` im Klartext. Beide sind an der Call-Site
repariert, nicht im Filter — ein Filter hätte in `envelope` die Adresse
redigiert und Name und Text stehen lassen.

Gegenprobe: Kontaktformular mit Name, Adresse und Merksatz abgeschickt,
**0 Treffer** für alle drei im gesamten Container-Log.

**Sechs Fehler sind beim Bauen entstanden. Einen hat das Lesen gefunden, fünf
haben Maschinen gefunden — und der wichtigste war nicht der, den ich gesucht
habe.**

Vom ersten Lauf gegen den Stack:

1. `"message_id":"redacted-email"`. Eine RFC-5322-Message-ID **ist**
   adressförmig, der Filter hat folgerichtig das Feld gefressen, für das die
   Zeile existiert. Genau eine Ausnahme nach Schlüssel, und sie ist eine Aussage
   über den Wert, nicht über den Namen.

Vom Fuzzer, in dieser Reihenfolge:

2. `[redacted-email]` mit Klammern **beendete** den Domain-Scan und ließ das
   Davorstehende wie eine gültige Domain aussehen.
3. Zwei getrennte Durchläufe (erst E-Mails, dann IPs) störten einander:
   `a@b.tld@c.tld` ließ die zweite Domain stehen, und bei `0@::0.XA` **baute**
   die IP-Redaktion eine E-Mail, die es nicht gab. Jetzt ein Durchlauf — was er
   schreibt, wird nie wieder gelesen.
4. **Ein echtes Leck:** bei `::0.::0` blieb das erste `::0` stehen, weil nur der
   *maximale* Lauf probiert wurde. Und der Lauf-Anfang-Test, der das linear
   halten sollte, war derselbe Fehler noch einmal: bei `::0X%::0` beginnt der
   zweite Lauf bei `%`, `%::0` parst nicht, das `::0` darin wurde nie probiert.
5. **Der wichtigste, und er ist kein Leck, sondern eine Zeitbombe in der
   Gegenmaßnahme selbst.** Ein Lauf aus 2 700 Doppelpunkten und Ziffern brauchte
   **sieben Sekunden** im Logger — und `r.URL.Path` ist nicht längenbegrenzt. Der
   Filter, der das Log schützen soll, wäre der Weg gewesen, den Dienst
   anzuhalten. Ein Kandidat ist jetzt auf 64 Zeichen begrenzt, und der Pfad in
   der Access-Zeile auf 256 — dieselbe Antwort, die `internal/contact` einer
   Origin seit C6 gibt.

Dazu die Erkenntnis, dass **Idempotenz keine erreichbare Eigenschaft ist**: der
Marker ist entweder aus Domain-Zeichen gebaut und wird Teil einer Domain, oder
er ist es nicht und beendet eine — beide Formen sind Duale. Geprüft wird
seitdem, was tatsächlich versprochen ist: *was der Filter erkennt, entfernt er.*

Keiner dieser fünf wäre in einem Review aufgefallen. Das ist der Grund, warum
`traceparent.Parse` und `Scrub` je einen Fuzz-Test tragen und das Korpus der
widerlegenden Eingaben im Repository liegt.

**Kosten, gemessen statt behauptet:** die Zeile, die jede Anfrage schreibt,
kostet **104 ns und null Allokationen**; eine Zeile mit einer echten
Relay-Ablehnung 6,9 µs.

**Zahlen der Phase:** 48 Call-Sites auf `…Context` umgestellt, 13 handgesetzte
`request_id`-Attribute entfernt (`slog` dedupliziert nicht — zwei gleiche
Schlüssel in einem Objekt sind gültiges JSON, dessen Bedeutung vom Parser
abhängt). `internal/reqid` und `middleware/requestid.go` **unverändert**, wie es
der Kopfkommentar von `reqid.go` seit C1 versprochen hatte.

**Als Nächstes: F1b** — Web-Logger in derselben Form, `proxy.ts`, `serverFetch`,
und der Beweis über beide Container.

---

## Vorher — 23.08.2026, der erste Text vor der ersten Seite

**Zwei Entscheidungen, beide gegen die Reihenfolge des Bauplans, beide bewusst.**

1. **Der erste Log-Beitrag ist geschrieben, bevor es einen Renderer gibt** —
   `web/content/posts/001-zero-downtime-measured-not-claimed.mdx`, englisch,
   über Stufe E: der 404-Trichter, die drei Messungen, der Zweizeiler, der in
   beiden Hälften falsch war, und die Grenze, die benannt statt wegoptimiert
   wurde. Gerendert wird er in H9; bis dahin ist er Text im Repository, den
   keine Prüfung anfasst. Grund: die Zahlen verfallen nicht, die Erinnerung
   daran, **warum** jede so aussieht, schon.
2. **Eine Fallstudie, viele Beiträge.** Die Fallstudie (H1/H2) ist eine Seite
   pro System; eine zweite gibt es mit einem zweiten System (P7), nicht mit
   einer neuen Stufe. Die Stufen-Tiefe gehört nach `web/content/posts/`. Damit
   ist der E-Beitrag der CI/CD-Beitrag und nicht Kapitel 1 von sechs.

**`CLAUDE.md` hat einen Abschnitt `Maß halten`** — fünf Regeln mit Auslöser
statt gutem Vorsatz, gegen das Verhältnis, das die Zählung an diesem Tag gezeigt
hat: 9.544 Zeilen in `tools/`, `Makefile` und `ci.yml`, 36 ADRs, `ci.yml` zu
59 % Kommentar — und `web/` eine Seite ohne Inhalt. `selftest.sh` und
`check-compose.sh` sind damit eingefroren: Reparaturen ja, neue Regeln nur nach
einem Vorfall, den man benennen kann.

**An der Reihenfolge danach ändert das nichts: als Nächstes F1.**

---

## Vorher — 22.08.2026, Stufe E ist fertig

**E5c ist abgenommen, und damit die ganze Stufe E.** `v0.1.0` steht.

```
/               422 requests, 422×200
/api/health     422 requests, 422×200

  ✓ every answer was 200
```

Zeuge 22:01:12–22:08:14 UTC, **vor** dem Merge gestartet, quer über den Deploy
von `99281cf` (`report ok … 233 s`).

| Geprüft | Ergebnis |
|---|---|
| Tag auf origin | `refs/tags/v0.1.0`, annotiert, auf `99281cf` |
| GitHub-Release | 22:06:06, Changelog aus den Commits |
| Tagger | **G1NG4R** — kein Bot, kein Werkzeugname |
| `/api/health` · `/api/badge/version` | `v0.1.0` statt einer Kurz-SHA |

**Der erste Versuch ist rot geworden, und an der richtigen Stelle.** `git tag -a`
verlangt einen Tagger, ein Runner hat keinen: `fatal: empty ident name`. Der
Schritt liegt **vor** `make images`, also war nichts gebaut, nichts gepusht,
nichts signiert — nachgesehen statt angenommen: Produktion unverändert, **0**
Tags auf origin, kein Release. Die Reihenfolge, um die E5c gebaut wurde, hat bei
ihrer ersten Berührung mit der Wirklichkeit gehalten.

**Damit sind drei der vier heute rotierten Werte bewiesen** — `GITHUB_TOKEN`
(der Refresher hat GitHub erreicht), `SMTP_PASSWORD` (die Mail kam an),
`INTERNAL_DEPLOY_TOKEN` (dieser Deploy-Report). `INTERNAL_PROBE_TOKEN` erst mit
F4, dort wird er benutzt.

**Die E4-Abnahme ist nachgeholt, und sie fehlte wirklich.**
`tools/check-deployed.sh --host` stand seit E4b als Kriterium im Bauplan, im
Handbuch und in ADR 0034 — ausgeführt hatte es niemand. Am 22.08.2026 gegen
`b4bd8fa`: **10 von 10 Behauptungen**, darunter die zwei, die nur der Host
machen kann — die laufenden Container **sind** die veröffentlichten Digests.
Vorher waren acht davon vom Klon aus grün und die neunte hieß `– not asked here`.

**Als Nächstes: Stufe F**, und sie beginnt mit F1 (strukturierte Logs und
Korrelation). Die Datenbank-Rotation liegt weiter auf L5, mit Auslöser statt
Datum in der lokalen Datei.

---

## Vorher — 22.08.2026, E5b abgenommen

**Die Abnahme ist erfüllt, gegen Produktion.** 20:07:44–20:13:16 UTC,
`make witness --until-restart`, **vor** dem Merge gestartet, von außen über den
öffentlichen Namen:

```
/               333 requests, 333×200
/api/health     333 requests, 333×200

  ✓ every answer was 200
```

Der Deploy darin: `8e4e444`, `report ok … 222s`. Ein echter Tausch —
`verify-deploy` sah einen Prozess von `20:11:34.485`, `/api/health` nennt
danach `20:11:55.656`. Zwei Container haben nacheinander bedient.

**Damit ist die Kette von E5b in Produktion belegt** und nicht nur im Labor:
zwei Schattendienste tragen die Router, während `api` und `web` neu angelegt
werden; die vier Schritte laufen in Dokploys Command-Feld; `SHUTDOWN_DELAY` und
der Traefik-Healthcheck nehmen das Backend aus dem Pool, bevor seine Adresse
verschwindet.

**Was dabei zweimal schiefgegangen ist, steht unten unter „Gefunden" und bleibt
stehen:** der erste Produktions-Deploy hat die Abnahme verfehlt, und die Grenze,
die dabei sichtbar wurde, ist benannt statt weggebaut (ADR 0035).

**Für die Fallstudie:** BUILD + DEPLOY = **222 s**, und der Satz daneben lautet
nicht „Zero-Downtime", sondern „kein Besucher sieht einen Fehler, solange ein
Deploy die Routing-Labels nicht anfasst". Beide Zahlen sind gemessen.

**Die Stufe ist triagiert** und der Abschnitt „Gefunden" ist leer — 15 Zeilen →
9 erledigt, 2 als Issue ([#157](https://github.com/G1NG4R/timseil-dev/issues/157),
[#158](https://github.com/G1NG4R/timseil-dev/issues/158)), 3 bewusst verworfen,
1 als Regel in `CONTRIBUTING.md`. Der Durchgang steht unten.

**E5c ist gebaut und wartet auf seinen Merge.** Nicht mit `release-please`: es
arbeitet über einen Release-PR, und ein PR vom eingebauten `GITHUB_TOKEN` löst
keine `pull_request`-Workflows aus — kein einziger der sieben erforderlichen
Kontexte meldet, und mit `enforce_admins: true` ist so ein PR **nicht mergebar**.
Die Auswege wären eine GitHub-App oder ein PAT, also ein weiteres Dauer-Geheimnis
mit `contents: write`, vier Tage nach dem Token-Vorfall.

Stattdessen `tools/release.sh`: Tag und GitHub-Release aus den Conventional
Commits, gesetzt von `publish` selbst — **vor** dem Build, damit das Image des
Release-Commits nicht die vorherige Version trägt, und **veröffentlicht als
letzte Handlung**, wenn das Artefakt signiert ist. Keine `CHANGELOG.md`, kein
`v1.2.3` am Image, Start bei `v0.1.0`. ADR 0036.

**Die Abnahme ist der Merge selbst:** er muss `v0.1.0` erzeugen, und
`/api/health` muss danach diese Nummer nennen statt einer Kurz-SHA.

---

## Vorher — der erste Produktions-Deploy von E5b

**E5b ist gemergt** ([#154](https://github.com/G1NG4R/timseil-dev/pull/154),
`153eb80`), **und die Abnahme ist verfehlt.** Gemessen, 19:19 UTC, von außen:
10×`404` auf `/api/health`, 1× auf `/`. Gegen die E5a-Grundlinie (19 s, 16×`404`
je Pfad) eine Halbierung — und die Abnahme zählt jede Antwort, die nicht 200 ist.

**Nicht die Kette hat versagt.** `verify-deploy` sah den Zwilling um
`19:19:19.364`, `/api/health` nennt danach einen anderen Prozess
(`19:19:34.596`). Traefiks Log nennt den Grund: der alte Container und sein
Zwilling beschreiben denselben Router unter demselben Namen **verschieden**, weil
dieser Deploy acht Traefik-Labels geändert hat — und Traefik verwirft dann beide.

**Daraus ist eine gemessene Grenze geworden statt einer Behauptung:** ein Deploy,
der nur das Image tauscht, ist sauber (drei Laborläufe, `100×200` je Pfad); einer,
der ein Routing-Label ändert, kostet einen Trichter. ADR 0035 nennt sie und sagt,
warum sie nicht weggebaut wird.

**Repariert wurde ein zweiter Fall**, der heute nicht zugeschlagen hat:
`timseil-www` und `timseil-retry` waren allein an `web` definiert, während der
api-Router sie nannte — fällt web aus und api nicht, antwortet `/api` 404 bei
lauter gesunden Containern. Beide stehen jetzt an beiden Diensten,
`make check-compose` hält es.

**Was aussteht:** die Abnahme ist der nächste Deploy **ohne** Label-Änderung.
Zeuge vorher starten. #143 und #65 bleiben bis dahin offen.

---

## Vorher — E5b im Labor fertig

**Der Trichter ist zu, im Labor.** Drei Läufe, `110 requests, 110×200` auf `/`
und auf `/api/health`, kein Ausschlag. Grundlinie auf derselben Anlage:
13×`404` auf `/`, 8×`404` auf `/api/health`. Die Zahlen und wie sie zustande
kamen: `docs/runbooks/compose.md`, „Was am 22.08.2026 danach gemessen wurde".

**Wie es zugeht:** zwei Schattendienste (`compose.rollout.yaml`) tragen die
Router, während `api` und `web` neu angelegt werden; die vier Schritte stehen in
`tools/rollout.sh` und laufen auf dem Host in Dokploys Command-Feld, weil
`sanitizeCommand` nur `docker compose`-Glieder in einer Kette zulässt. Dazu zwei
Pausen mit einem Leser — `SHUTDOWN_DELAY` (#65) und, in `web`,
`NEXT_MANUAL_SIG_HANDLE` plus `/healthz`, gelesen von einem
`loadbalancer.healthcheck`. ADR 0035.

**Was noch aussteht:** das Command-Feld im Panel setzen (Runbook 2.3) und die
**Produktionsmessung** — Zeuge **vor** dem Merge starten,
`make witness WITNESS_UNTIL="--until-restart"`. Erst die schließt #143 und #65.

---

## Vorher — nach E5a

**E5a ist gemergt**, in zwei Teilen: [#152](https://github.com/G1NG4R/timseil-dev/pull/152)
(`9dbeae4`) bringt den Zeugen und das Labor, [#153](https://github.com/G1NG4R/timseil-dev/pull/153)
(`6f262e3`) repariert ihn. Produktion läuft `6f262e3`, Deploy 249 s, `ok`.

**Der Trichter ist gegen Produktion gemessen** — 19 Sekunden, 16×404 je Pfad,
keine einzige 5xx. Die Zahlen und die Kreuzprobe gegen die Pipeline stehen
weiter unten unter „Die Produktionsmessung von E5a".

**Das Labor trägt die Reparatur, bevor sie Produktion kostet.** `make rolling-lab`
plus `make witness` reproduziert den Trichter lokal. Dort ist auch gemessen, dass
der Zweizeiler aus dem Bauplan in beiden Hälften falsch ist und welche Folge
stattdessen trägt — `docs/runbooks/compose.md`, Abschnitt „Das rollende Labor".

**Was E5b vorfindet:** die Ausgangszahl in Produktion, die korrigierte
Drei-Schritt-Folge aus dem Labor, und einen Rest-Ausschlag je Dienst, an dem
`SHUTDOWN_DELAY` ([#65](https://github.com/G1NG4R/timseil-dev/issues/65))
bemessen wird. Offen und noch nicht entschieden ist, **wie die Folge den Host
erreicht** — Dokploy besitzt den Deploy (ADR 0033 §2), und der Pipeline-Schlüssel
kann einen Port forwarden und kein Kommando.

---

### Vorher — nach E4b

**E4b ist gemergt** ([#142](https://github.com/G1NG4R/timseil-dev/pull/142), `ae39e04`)
**und hat sich selbst deployt.** Produktion läuft `ae39e04`, `report ok … 226s`,
`make check-deployed` grün.

**Der Rollback ist provoziert** — 13:53 UTC, gegen die echte Produktion.
Deployt `sha-581f5c0`, verifiziert gegen einen Commit, den nie jemand gebaut
hat. Die sechzig Sekunden liefen ab, der Rollback griff, Exit 1, 84 s, keine
Zeile in `deploys`. Bauplan Zeile 1127 ist damit erfüllt. Transkript im
Dokploy-Runbook, Begründung in ADR 0034.

**Der erste Versuch war grün nach drei Sekunden**, und das war der wertvollste
Teil des Tages: nicht der Drill war falsch, sondern der Verify hatte eine Lücke.
Repariert als fünfte Bedingung.

**Gemessen beim ersten Merge mit `needs: [check, db, publish]`:** `db` war 77 s
vor dem Start des Deploys fertig, `check` 57 s, `publish` 3 s. Die neue
Abhängigkeit kostet **null** — jetzt an diesem Graphen gemessen statt aus E4a
übernommen.

---

**Triage nach E5c, 22.08.2026.** Vier Funde, **alle vier in der Stufe
erledigt**, keiner als Issue. Der Abschnitt bleibt leer.

- **`release-please` ist an diesem Repository nicht benutzbar.** Es arbeitet über
  einen Release-PR, und ein PR vom eingebauten `GITHUB_TOKEN` löst keine
  `pull_request`-Workflows aus — kein erforderlicher Kontext meldet, mit
  `enforce_admins: true` ist er nicht mergebar. Steht als Kontext in ADR 0036;
  kein Ticket, weil es nichts zu tun gibt, sondern etwas zu wissen.
- **`git tag -a` braucht einen Tagger, ein Runner hat keinen.** Lokal unsichtbar,
  weil diese Maschine eine Identität hat. Erledigt: der Tag übernimmt den Autor
  des Commits, den er benennt, und der Selbsttest schiebt `GIT_CONFIG_GLOBAL`
  und `GIT_CONFIG_SYSTEM` beiseite, damit er den Fall auch sieht.
- **Eine laufende Bewertung verschluckte den höheren Sprung.** Ein frühes `fix:`
  nagelte die Antwort auf `patch` fest, ein späteres `feat:` änderte nichts —
  ein Release, das untertreibt, was drinsteckt. Erledigt, drei Flags und eine
  Entscheidung am Ende.
- **`--publish` las den Tag neu, den `--tag` gerade gesetzt hatte.** Der Bereich
  wäre leer gewesen, der Text des allerersten Releases also blank. Erledigt: der
  Bereich ist ein Argument statt einer globalen Variablen.

Die letzten drei hat der Selbsttest gefunden, nicht das Lesen.

**Triage nach E5b, 22.08.2026.** 15 Zeilen unter „Gefunden" →
**9 erledigt**, **2 als Issue**, **3 bewusst verworfen**, **1 als Regel
aufgeschrieben**. Der Abschnitt ist leer.

**Die zwei neuen Issues:**

| Issue | Was |
|---|---|
| [#157](https://github.com/G1NG4R/timseil-dev/issues/157) | `web` erreicht die API über einen Namen, den sein Zwilling nicht mitdeckt — kostenlos bis Stufe G, danach 500er statt 404er |
| [#158](https://github.com/G1NG4R/timseil-dev/issues/158) | `witness.sh` begründet mit einem Backend und misst seit E5b zwei |

**Bewusst verworfen, mit Begründung:**

- **Ein Deploy, der ein Traefik-Label ändert, verliert den Router.** In
  Produktion gemessen und im Labor reproduziert. Wegzubauen nur, indem die
  Router-Labels `compose.yaml` verlassen — `extends` kann geerbte Labels
  überschreiben, aber nicht entfernen. Der Preis steht nicht gegen den Nutzen,
  Label-Änderungen sind selten, und die Grenze ist in ADR 0035 als **gemessen**
  benannt statt als Randnotiz. Neu aufmachen, wenn sie häufiger wird.
- **Traefiks Docker-Provider registriert `serversTransports`-Labels nicht.** Eine
  Eigenschaft von Traefik, keine Aufgabe. Sie ist gemessen, der Weg darüber ist
  verworfen, und die Umgehung — das Backend verlässt den Pool, bevor seine
  Adresse verschwindet — ist die bessere Lösung, nicht die zweitbeste.
- **19 s gegen 9 s.** Der Mechanismus, der die Zahl erzeugt hat, war
  wahrscheinlich der zweite Deploy-Weg; der ist abgeschaltet. Die Zahl beschreibt
  damit nichts mehr, was noch erreichbar wäre, und ein Ticket dafür wäre eine
  Absichtserklärung. Die Kette 9 s · 19 s · 10 s · 0 steht im Verlauf, falls sie
  je wieder gebraucht wird.

**Als Regel aufgeschrieben statt als Ticket:** `Closes #N` schließt beim Merge,
und die Abnahmen dieses Projekts werden danach gemessen. Steht jetzt in
`CONTRIBUTING.md` unter „Branches and commits", mit dem Vorfall als Begründung.

**Neun erledigt**, darunter die drei, an denen die Stufe hing: der Zweizeiler
aus dem Bauplan ist ersetzt, der Rest-Ausschlag hat mit `SHUTDOWN_DELAY` eine
gemessene Zahl, und die Middleware-Kopplung ist zu — je mit einer Prüfung, die
den kaputten Fall beweist.

**Triage nach E4b, 22.08.2026.** 27 Zeilen unter „Gefunden" →
**13 erledigt**, **7 als Issue**, **6 an bestehende Issues oder bewusst
verworfen**, **1 lokal**. Der Abschnitt ist leer.

**Die sieben neuen Issues:**

| Issue | Was |
|---|---|
| [#143](https://github.com/G1NG4R/timseil-dev/issues/143) | Jeder Container-Wechsel liefert zehn Sekunden `404` — beim Drill gemessen, trifft jeden Merge |
| [#144](https://github.com/G1NG4R/timseil-dev/issues/144) | `internal/buildinfo` hat keine Testdatei — und drei Prüfungen lesen aus ihm |
| [#145](https://github.com/G1NG4R/timseil-dev/issues/145) | ~200 alte `rejects` im Selftest können aus dem falschen Grund grün sein |
| [#146](https://github.com/G1NG4R/timseil-dev/issues/146) | „nur 22, 80, 443" stimmt nicht — Regel oder Host muss sich bewegen, vor L3 |
| [#147](https://github.com/G1NG4R/timseil-dev/issues/147) | Der Host trägt mehr als diesen Stack, F2 und ADR 0027 planen anders |
| [#148](https://github.com/G1NG4R/timseil-dev/issues/148) | Dokploy heben, bevor L3 das Panel schließt |
| [#149](https://github.com/G1NG4R/timseil-dev/issues/149) | Ein GHCR-Paket zu verknüpfen hat keinen Klickweg |

**Bewusst verworfen, mit Begründung:**

- **Zwei sachlich falsche Kommentare in `ci.yml`** (aus #112). Die Instanzen sind
  korrigiert. Als *Klasse* — Kommentare driften von dem weg, was sie beschreiben
  — ist es unbegrenzt und kein Issue: `check-adrs`, `check-readme`, `check-env`
  und `check-stack` greifen genau die Fälle, die maschinell prüfbar sind, und
  für den Rest ist ein Ticket eine Absichtserklärung.
- **`gh` kann die GHCR-Versionen nicht lesen.** Umgangen über die Registry-API
  mit anonymem Pull-Token, und die Umgehung ist besser als die direkte Lösung:
  sie misst, was ein Fremder sieht. Preis: Tags ja, Datum und Größe je Version
  nein. `tools/registry.sh` trägt es.
- **227 s stammen aus einem Wiederholungslauf** und **eine zweite Signatur auf
  demselben Digest.** Beides war Kontext, kein Fund. Die zweite Zeile hat sich
  in E4b sogar als falsch herausgestellt — es waren zwei *verschiedene* Digests,
  und daraus wurde die Waise, an der die Aufbewahrungsregel hängt.

**An bestehende Issues gegeben:** die Rotation aus
[#109](https://github.com/G1NG4R/timseil-dev/issues/109) als Kommentar dort;
[#139](https://github.com/G1NG4R/timseil-dev/issues/139) und
[#140](https://github.com/G1NG4R/timseil-dev/issues/140) trugen schon ihre
Zeilen.

**Eine Zeile ist lokal geworden**, nicht öffentlich: die laufende Panel-Version.
Bei einem Panel, das noch von außen erreichbar ist, ist sie eine Wegbeschreibung
zu den passenden Advisories. Öffentlich steht die Aufgabe (#148), der Stand in
`backlog.local.md`. Beim selben Durchgang ist aufgefallen, dass der öffentliche
Backlog die anderen Dienste der Maschine **namentlich** nannte — das ist
korrigiert, aber es steht auf `main` und damit in der Historie; ob das einen
Rewrite rechtfertigt, ist lokal notiert und noch offen.

**Offen, ohne Issue, weil es Ablauf und kein Fund ist:** die Aufbewahrung ist
unscharf. `retention` druckt montags den Plan und löscht nichts. Zwei Wochen
Trockenläufe, dann ein Beweis gegen ein Wegwerf-Paket, dann
`GHCR_PRUNE_ENABLED`. Der Lösch-Pfad ist bis heute **nie ausgeführt worden**.

Vorherige Triage: nach E2, 21.08.2026 — 15 Zeilen → 11 in der Stufe erledigt,
2 als Kommentar an bestehende Issues, 1 bewusst verworfen, 1 als Abnahme offen.

---

## Die Produktionsmessung von E5a — 22.08.2026, 17:17 UTC

Nachgeholt beim Merge von [#153](https://github.com/G1NG4R/timseil-dev/pull/153),
mit `make witness WITNESS_UNTIL="--until-restart"`, **vor** dem Merge gestartet.
Eine Anfrage je Sekunde auf `/` und `/api/health`, von außen über den
öffentlichen Namen, 317 Anfragen je Pfad.

| | `/` | `/api/health` |
|---|---|---|
| `200` | 301 | 299 |
| `404` | **16** | **16** |
| keine Verbindung | — | 2 |
| Sekunden ohne Stichprobe | 8 | 8 |

**Das Fenster: 17:17:44 bis 17:18:02 UTC — neunzehn Sekunden.** Es liegt um den
Moment, in dem der neue Prozess oben war (17:17:51,85), und endet elf Sekunden
danach. Merge 17:13:54, Deploy gemeldet 17:18:06 mit 249 s.

Damit ist der Bauplan-Satz belegt und die Zahl gemessen statt geschätzt: **keine
5xx im Fenster, sondern 404** — die Abnahme, die 5xx zählt, hätte diesen Deploy
durchgewinkt.

Der erste Versuch derselben Messung ging daneben: dreieinhalb Minuten nach dem
Merge gestartet, alles `200`, kein Deploy darin. Das ist repariert (#153) und
der Grund, warum `--until-restart` existiert.

---

## Triage nach Stufe F2 — 24.08.2026

**Der Notizblock ist geleert.** Zwanzig Einträge, jeder einzeln zugeordnet:

| | |
|---|---|
| **Issue** | 15 — [#180](https://github.com/G1NG4R/timseil-dev/issues/180)–[#194](https://github.com/G1NG4R/timseil-dev/issues/194) |
| **erledigt** | 1 — der Netz-Alias, mit #172 gemergt, nur der Status war offen geblieben |
| **bewusst verworfen** | 4 |

Die vier verworfenen, mit dem Grund, damit sie nicht als Vergessene
wiederkommen:

- **Kein eigener ADR für E3.** Die Regel dieser Stufe lebt in den
  Kopfkommentaren von `tools/sign.sh` und `verify-supply-chain.sh`. Der Bruch
  mit „ein ADR pro Phase" war bewusst und ist dort benannt; ein ADR über einen
  fehlenden ADR wäre genau die Sorte Werkzeug, vor der „Maß halten" warnt.
- **Sechs Schritte stehen zweimal in `ci.yml`.** Der bezahlte Preis dafür, dass
  derselbe Job baut, prüft, scannt und veröffentlicht — sonst wäre das signierte
  Artefakt nicht das geprüfte (ADR 0026). Wird die Datei unübersichtlich, ist
  ein gemeinsames `make`-Ziel der Weg, keine Reusable Workflow.
- **Kein dauerhafter Testaufbau für `tools/probe.sh`.** Die sechs kaputten Fälle
  sind einmal gefahren und im Commit benannt; laufend geprüft wird die Datei,
  die dabei entstand. Ein Harness wäre Werkzeug, das Werkzeug prüft.
  Wiederaufnehmen, wenn ein zweiter Fund in diesem Skript auftaucht.
- **Der Ausfall-Alarm bleibt ein roter Lauf, kein eigener Mailpfad.** ADR 0038
  sagt warum: das Mail-Passwort läge als Secret in einem Job, der alle fünf
  Minuten auf fremden Runnern läuft, für ein öffentliches Repository. F10 fängt
  beides mit dem Dead Man's Switch — das ist eine Bauplan-Phase und braucht
  keinen Zettel.

**Der stärkste Fund dieser Stufe** ist [#180](https://github.com/G1NG4R/timseil-dev/issues/180):
die Sonde läuft mit einem Siebtel ihrer behaupteten Kadenz, und `down_sec` wird
aus Anzahl **mal Konstante** gebildet. Jede Ausfalldauer auf der Seite wäre
damit rund siebenmal zu klein — Invariante 1 in Betriebskleidung.

---

## Triage — Stufe F (Launch-Pfad), 27.08.2026

F1–F5 sind gebaut und gegen Produktion abgenommen; F6–F11 liegen hinter dem
Launch. Damit ist der Auslöser erreicht, den CLAUDE.md nennt: **Issue, bewusst
verworfen mit Begründung, oder erledigt — und der Notizblock wird geleert.**

Zwanzig Zeilen unter „Gefunden", vier unter „Idee". Fünfzehn waren erledigt und
sind in ADRs, Beiträgen und Commits belegt; sie brauchen hier keine Zeile mehr.
Die übrigen neun:

### Zu Issues geworden

| Fund | Wohin |
|---|---|
| Sondenkadenz bei 10 %, `down_sec` untertreibt um Faktor 7 | **[#180](https://github.com/G1NG4R/timseil-dev/issues/180)** — existierte seit 24.08.; die größere Stichprobe hängt als Kommentar dran |
| Wettlauf in `internal/contact/dispatch_test.go`, kein `-race` in der Pipeline | **[#181](https://github.com/G1NG4R/timseil-dev/issues/181)** — existierte seit 24.08.; F5 hat ihn unabhängig wiedergefunden |
| README-Entscheidungstabelle endet bei ADR 0029 | **[#205](https://github.com/G1NG4R/timseil-dev/issues/205)** |
| Zustellbarkeit ist der einzige SLI ohne Messung, es fehlt ein Contract-Feld | **[#206](https://github.com/G1NG4R/timseil-dev/issues/206)** — fällig mit H8 |
| Traefik-Anbindung übersteht kein Neuerzeugen des Containers | **[#207](https://github.com/G1NG4R/timseil-dev/issues/207)** |
| `uptime90d` sagt nicht, über wie viel gemessenes Fenster es spricht | **[#208](https://github.com/G1NG4R/timseil-dev/issues/208)** — fällig mit H1 |

### Bewusst verworfen, mit Begründung

**Der Seiten-p95 enthält den Verkehr der eigenen Sonde.** Ausschließen ginge nur
über eine zweite Bucket-Liste je Dienst, und Traefik nimmt eine Liste, nicht eine
je Dienst. Die Verzerrung steht in `docs/slo.md` und in ADR 0041 unter „Was das
kostet". **Aufschreiben ist hier die vollständige Antwort**, nicht der billige
Ausweg: die Zahl ist nicht falsch, sie ist ein p95 über einen Anfragemix, und der
Mix gehört danebengeschrieben.

**`Stop()` ist bei vier Schleifen sequenziell idempotent, nebenläufig nicht.**
Kann nicht auslösen: `cmd/api` erreicht die Methode auf zwei Wegen, die einander
ausschließen — scheitert der Listener, wird `serve()` nie erreicht. Vier
Geschwisterpakete für einen unmöglichen Fall anzufassen ist genau das, wovor
„Maß halten" warnt, und der Diff sähe ohne Anlass aus. **Was stattdessen
passiert ist:** der Kommentar an `snapshots.Stop()` behauptete mit „idempotent"
mehr, als der Code hält, und sagt jetzt, *warum* es sicher ist — damit ein
künftiger dritter Aufrufer die Bedingung liest, statt sie zu erben.

**Das `selftest`-Flackern an `registry.sh`** („rejected, but not for 'usage'",
25.08.). In allen Läufen seit dem 25.08. nicht wiedergekehrt, das Skript direkt
aufgerufen dreimal deterministisch. Verworfen als nicht reproduzierbar; taucht es
wieder auf, ist die Kopiererei ins Temp-Verzeichnis der erste Verdacht — und
dann mit zwei Vorkommen statt einem.

### Dabei aufgefallen: zwei überfällige Issues

`#183` („decide it in F3") und `#184` („due with F3") warten auf eine Phase, die
am 26.08. abgenommen wurde. **#184 nennt drei Hintergrundschleifen; es sind
inzwischen fünf** — F4 und F5 haben je eine dazugelegt, und F5 hat dem Label
einen konkreten Leser gegeben: `docs/runbooks/api.md` schickt einen Operator zum
`grep` nach `"msg":"metric snapshot"`. Das ist ein Label-Selektor, der als
Textsuche in einem Runbook steht. Als Kommentar an #184 vermerkt.

### Die Lehre dieser Triage

**Ich habe zwei Funde als neu gemeldet, die seit drei Tagen als #180 und #181
dastanden.** `backlog.md` hatte ich gelesen, wie es die Regel verlangt; den
Issue-Tracker nicht. Der Notizblock ist die eine Hälfte des Gedächtnisses, der
Tracker die andere — und die Triage räumt genau von der einen in die andere.
Wer nur den Notizblock liest, findet zuverlässig Dinge ein zweites Mal und nennt
sie neu. CLAUDE.md hat dafür jetzt eine Zeile, mit diesem Vorfall als Auslöser.

---

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Status |
|---|---|---|---|

## Gefunden — Bug oder Unklarheit

Vorherige Triage: Stufe F (Launch-Pfad), 27.08.2026 — siehe oben.

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 27.08.2026 | G1 | **`globals.css` malt drei Dinge im Akzent von Terminal Noir statt im Akzent des Themes.** Link-Unterstrich, `::selection` und der Puls-Schein von `ts-pulse` stehen als `rgba(0,229,255,…)` da — vier Zeilen, wörtlich aus dem Handoff übernommen. In den sechs anderen Paletten bleiben sie cyan; sichtbar wird es, sobald G2 den Umschalter baut. Reparatur heißt neue Tokens in `tokens.css` (drei Deckkraften × sieben Paletten oder ein `color-mix`), und das ist keine Entscheidung von G1. `check-tokens.sh` führt die vier als benannte Ausnahme und druckt sie bei jedem Lauf. **Gemessen im Browser, 27.08.2026:** Linkfarbe folgt (`#00E5FF` → Latte `#7C2FD4` → Phosphor `#2EE6A6`), Unterstrich bleibt in allen dreien `rgba(0,229,255,.35)`. | offen |
| 27.08.2026 | G1 | **Eine neue Web-Abhängigkeit kommt im Dev-Stack nicht an, und der Cache hält den Fehler fest.** `node_modules` (anonym) und `.next` (benannt) überleben `up --build`: das Image hat Tailwind, der Container nicht — `Cannot find module '@tailwindcss/postcss'`, jede Seite 500. Der erste gescheiterte Start kompiliert sich in `.next`, deshalb heilt `--renew-anon-volumes` **allein** nichts; gemessen: mit erneuerten anonymen Volumes weiter 500, nach `docker volume rm …_web-next` sofort 200. Gefunden, weil `make quickstart` gegen diesen Branch durchfiel. **Behoben:** `make dev` stempelt die Prüfsumme des Lockfiles und weist einen Start ab, der sie bewegt hat; `make dev-reset` räumt beides und löscht den Stempel. Runbook `web.md`. Nicht gedeckt: frischer Klon neben altem Volume. | erledigt |

## Idee — noch nicht entschieden

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
