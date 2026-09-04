# SLOs und Fehlerbudget

**Ab F5 ist diese Datei die verbindliche Fassung.** Anhang A des Build-Plans und
Kapitel 28 des Handbuchs nennen dieselben Zahlen und verweisen hierher; bei
Widerspruch gilt, was hier steht.

Der Grund für ein drittes Dokument ist nicht, dass die Tabelle fehlte — sie
stand zweimal da. Es fehlte, **woraus** jede Zahl entsteht und **was sie nicht
sehen kann**. Ein SLI ohne seine Abfrage ist eine Absicht, kein Messwert, und
diese Seite behauptet von sich, den Unterschied zu kennen.

---

## Die fünf SLIs

| SLI | Quelle | Fenster | SLO | Stand |
|---|---|---|---|---|
| **Verfügbarkeit** | `ops_days`, aus der externen Sonde (F4) | 91 Tage | 99,5 % | gemessen |
| **Latenz** | `timseil:site:request_duration_seconds:p95_5m` | 5 min | p95 < 300 ms | gemessen, **auf einen Bucket genau** |
| **Fehlerrate** | `timseil:site:requests:error_ratio_5m` | 5 min | < 0,1 % | gemessen |
| **Latenz API getrennt** | — | — | p95 < 150 ms | **nicht getrennt gemessen** |
| **Zustellbarkeit** | `contact_messages.delivery_status` | 30 Tage | > 99 % | gemessen, **noch nicht gezeichnet** |

Drei davon erreichen die Seite als `Metrics.uptime90d`, `Metrics.p95Ms` und
`Metrics.errorRate`. Die vierte erreicht seit H8c die **API** als
`OpsSummary.deliverability` — gemessen, abrufbar, und von keinem Blatt
gezeichnet; der Unterschied steht unten und ist keine Nachlässigkeit, sondern
eine offene Entwurfsfrage. Die fünfte ist gar nicht getrennt gemessen.

---

## Verfügbarkeit — 99,5 %

### Woraus

```sql
sum(checks_up) / sum(checks_total) * 100   über 91 Tage aus ops_days
```

Gerechnet in `api/internal/store/queries/metrics.sql`, geschrieben von
`internal/snapshots` nach `metric_snapshots.uptime_90d`, ausgeliefert als
`Metrics.uptime90d`.

Die Zeilen in `ops_days` sind das Tagesaggregat aus `ops_checks`, und dort
schreibt die **externe Sonde**: ein GitHub-Actions-Lauf alle fünf Minuten,
`POST /api/internal/probe`, plus die Wiedereinspielung aus `uptime-log.txt`,
wenn der Host zurückkommt (F4).

### Warum nicht aus Prometheus

Zwei Gründe, und der erste beendet die Frage:

1. **Prometheus hält sieben Tage.** `--storage.tsdb.retention.time=7d`. Ein
   91-Tage-Fenster ist an diese Datenbank nicht zu stellen.
2. `timseil:service:availability_5m` ist **Request-Verfügbarkeit**: von den
   Anfragen, die ankamen, wie viele beantwortet wurden. Den Ausfall, in dem gar
   nichts ankam, kann sie nicht sehen — in dem ist dieser Prometheus selbst
   tot, er teilt sich den Host. Genau deshalb existiert die externe Sonde.

ADR 0041 §1.

### Was diese Zahl nicht sieht

- **Was zwischen zwei Sondenläufen geschah — und das ist mehr, als der Takt
  verspricht.** Hier stand zuerst „der Takt sind fünf Minuten"; das ist die
  *Konfiguration*, nicht die Wirklichkeit. Am 27.08.2026 über 100 Läufe / 81,4 h
  nachgemessen: **1,23 statt 12 Läufe je Stunde, Abstände median 36 und maximal
  660 Minuten, kein einziger unter sechs.** GitHub verwirft geplante Läufe unter
  Last. Das blinde Fenster dieses SLI ist also im Regelfall gut eine halbe
  Stunde, nicht neunzig Sekunden.

  Die Zahl altert, also hier der Weg, sie nachzurechnen, statt sie zu glauben:

  ```bash
  gh run list --workflow probe.yml --limit 100 --json createdAt \
    --jq '.[].createdAt'
  ```

  `down_sec` im Betriebsraster hing bis zum 30.08.2026 an derselben Lücke: es
  rechnete *fehlgeschlagene Prüfungen × fünf Minuten* und meldete einen
  35-Minuten-Ausfall als fünf. **Seit ADR 0051 rechnet es die Lücken, die
  wirklich zwischen zwei Prüfungen liegen**, also trägt die schwankende Kadenz
  die Dauer nicht mehr. Was sie weiter trägt, ist die **Abdeckung** — der
  nächste Punkt.
- **Wie viel des Fensters überhaupt gemessen wurde.** Ein Tag ohne Messung ist
  `nodata` und trägt zu keiner der beiden Summen bei — er verdünnt nichts und
  füllt nichts (Invariante 6). Die Kehrseite: **eine Prozentzahl über 91 Tage
  sagt nichts darüber, wie viele dieser Tage gemessen sind.** 100 % können auf
  fünf Tagen ruhen und auf einundneunzig, und die Zahl sieht gleich aus. Das
  Betriebsraster ist die zweite Angabe, die dazugehört, und es zeigt die Lücken
  einzeln. Wurde im ganzen Fenster nie geprüft, ist das Ergebnis `NULL` und
  nicht `0`.
- **Teilausfälle.** Die Sonde fragt `/api/health`. Antwortet die API und ist die
  Kontaktstrecke tot, zählt der Tag als `ok`.

### Warum 99,5 % und nicht 99,9

99,9 % wären 43 Minuten Budget im Monat. Auf einem einzelnen VPS mit
Sicherheitsupdates und Deploys ist das nicht zu halten — und ein SLO, das man
reißt, ist schlimmer als keins. Die Begründung stammt aus Kapitel 28 des
Handbuchs und gilt unverändert.

### Das Fehlerbudget, nachgerechnet

**Die Zahl in Anhang A stimmt, ihre Überschrift nicht.** Dort steht
„3 h 39 min" unter „Fehlerbudget/30 d". Nachgerechnet:

| Bezugsraum | Länge | 0,5 % davon |
|---|---|---|
| genau 30 Tage | 43 200 min | **3 h 36 min** |
| Durchschnittsmonat (365,25/12 = 30,4375 d) | 43 830 min | **3 h 39 min** |
| das Fenster der Seite, 91 Tage | 131 040 min | **10 h 55 min** |

„3 h 39 min" ist der Durchschnittsmonat, nicht dreißig Tage. Beide Zahlen sind
richtig für ihre Frage; eine davon stand unter der falschen Überschrift.

**Verbindlich ist die 30-Tage-Zeile: 3 h 36 min.** Der Kalendermonat ist der
Zeitraum, in dem ein Vorfall besprochen wird, und dreißig Tage sind eine Zahl,
die man nachzählen kann.

**Achtung, zwei Fenster.** Die Seite zeigt Verfügbarkeit über **91 Tage**, das
Budget läuft über **30**. Das ist kein Fehler und es ist leicht zu verwechseln:
ein Vorfall, der das Monatsbudget vollständig verbrennt, bewegt die Zahl auf der
Seite um rund **0,16** Prozentpunkte (216 min auf 131 040 min). Mit der
Durchschnittsmonats-Zahl wären es 0,17 — sie gilt hier nicht, und die
Abweichung ist genau der Grund, warum oben eine der beiden verbindlich ist. Die Seite erzählt einen Verlauf, das Budget
verwaltet einen Monat.

---

## Latenz — p95 unter 300 ms

### Woraus

```
timseil:site:request_duration_seconds:p95_5m
```

`histogram_quantile(0.95, …)` über `traefik_service_request_duration_seconds_bucket`,
gefiltert auf `service=~"timseil-.*"`, **ohne** `by (service)`. Gemessen am
Reverse Proxy, weil das der einzige Takt ist, der `api` und `web` so sieht wie
ein Besucher — die eigene Warteschlange eingeschlossen, die die Anwendung nicht
messen kann.

`internal/snapshots` rechnet von Sekunden in Millisekunden um und schreibt
`metric_snapshots.p95_ms`.

### Wie „< 300 ms bei 99 %" zu lesen ist

Anhang A schreibt „< 300 ms bei 99 %". Gemeint ist: **in 99 % der
Fünf-Minuten-Fenster liegt der p95 unter 300 ms.** Nicht „99 % der Anfragen
unter 300 ms" — das wäre ein p99 und eine andere Regel.

### Was diese Zahl nicht ist

- **Sie ist auf einen Bucket genau, nicht auf eine Millisekunde.**
  `histogram_quantile` interpoliert linear innerhalb eines Buckets. Der Fund aus
  F3 in einem Satz: mit Traefiks Voreinstellung `0.1, 0.3, 1.2, 5.0` lagen 7582
  von 7896 Anfragen im ersten Bucket, und die Zahl war Arithmetik auf einer
  Bucket-Kante — keine einzelne Anfrage war je mit irgendeiner Dauer beobachtet
  worden, nur mit „unter 100 ms". Repariert mit Prometheus' eigenen
  Default-Buckets. Die belastbare Aussage lautet „auf einen Bucket genau, und
  hier ist welcher".
- **Sie enthält unser eigenes Monitoring.** Die Sonde aus F4 trifft
  `/api/health` alle fünf Minuten, und dieser Pfad antwortet in ein bis zwei
  Millisekunden. Das sind echte Anfragen, sie liegen in derselben
  Histogramm-Reihe, und sie ziehen den Seiten-p95 nach unten. Nichts daran ist
  erfunden — jede Beobachtung hat stattgefunden — aber es ist ein p95 über einen
  Anfragemix, der die Sonde einschließt. Wie stark, hängt vom Verkehr ab: bei
  wenig Verkehr stark, bei viel gar nicht.
- **Sie ist ein Fünf-Minuten-Fenster.** Was zwischen zwei Momentaufnahmen
  geschieht, sieht die Seite nicht (ADR 0007).

### Die getrennten Latenz-SLOs für Seiten und API

Anhang A führt zwei: Seiten < 300 ms, API < 150 ms. **Der Contract hat ein Feld.**
`Metrics.p95Ms` ist eine Zahl, und die Site-Regel misst beide Dienste zusammen.

Die Trennung ist damit nicht aufgegeben, sondern umgezogen: die drei
Regeln aus F3 tragen weiter ein `service`-Label und stehen für F9s Dashboards
bereit. Auf der Seite steht die gemeinsame Zahl.

**Und der API-Wert allein wäre heute ohnehin keiner.** `/api/health` antwortet
in ein bis zwei Millisekunden und liegt damit im untersten Bucket; die
per-Dienst-Regel liefert für `api` eine Interpolation gegen eine Untergrenze
von null. Aufgeschrieben statt repariert — Traefik nimmt eine Bucket-Liste, nicht
eine je Dienst.

---

## Fehlerrate — unter 0,1 %

### Woraus

```
timseil:site:requests:error_ratio_5m
```

`rate(traefik_service_requests_total{code=~"5.."}[5m])` über
`rate(traefik_service_requests_total[5m])`, beide gefiltert und beide über die
Seite summiert. Ergibt `metric_snapshots.error_rate` und `Metrics.errorRate`,
als Bruch zwischen 0 und 1.

### Der `or … * 0`-Zweig, und warum er kein Detail ist

Ohne ihn hätte ein Dienst, der Verkehr bediente und **nichts** davon versemmelte,
gar keine Serie — das Ergebnis wäre leer, F5 schriebe `NULL`, und die Seite
sagte „nicht gemessen" über eine Messung, die perfekt ausgefallen ist. Der
`or`-Zweig liefert für genau diese Fälle eine ausdrückliche `0`.

Ohne jeden Verkehr sind beide Seiten null, `0/0` ist `NaN`, und **das** ist
„nicht gemessen". Der Unterschied zwischen den beiden ist Invariante 1, und er
lebt in dieser einen Zeile PromQL.

### Was diese Zahl nicht sieht

- **4xx zählen nicht.** Ein 404 ist keine Störung dieses Dienstes.
- **Was der Proxy nicht sieht, sieht sie nicht.** Fällt der Container weg,
  entfernt Traefik den Router und antwortet mit seiner eigenen 404 — kein 5xx,
  und trotzdem eine kaputte Seite. Gemessen in E5b, nachzulesen dort.
- **Fehler ohne Statuscode.** Eine Antwort, die 200 sagt und Unsinn enthält,
  ist hier unsichtbar.

---

## Zustellbarkeit — über 99 %

Die Definition, unverändert seit F5: **erfolgreich zugestellte
Formularsendungen geteilt durch alle angenommenen**, über dreißig Tage. Eine
Nachricht, die angenommen und mit `202` quittiert, aber nie ausgeliefert wurde,
ist der Fehlerfall, den diese Zahl sichtbar macht — und der einzige
Konversionspunkt dieser Seite.

Bis H8c stand hier „nicht gemessen". Es fehlten die Abfrage und ein Feld im
Contract; beide gibt es jetzt (Issue #206, ADR 0069).

### Woraus

```sql
SELECT count(*)                                          AS accepted,
       count(*) FILTER (WHERE delivery_status = 'sent')  AS delivered
  FROM contact_messages
 WHERE received_at > now() - $1::interval        -- $1 = 30 Tage
```

`api/internal/store/queries/health.sql`, gelesen bei jeder Antwort von
`/api/health` und ausgeliefert als `OpsSummary.deliverability` mit vier Feldern:
`rate`, `delivered`, `accepted`, `windowDays`.

Das Fenster ist ein Argument und keine Literale, aus dem Grund, den
`InsertMetricSnapshot` für die 91 nennt: die Zahl steht an genau einer Stelle
(`deliverabilityWindowDays` in `internal/health`), und dieselbe Konstante füllt
das Intervall **und** das Feld `windowDays` der Antwort. Zwei Kopien einer Zahl
sind der Weg, auf dem sie aufhört, nachzählbar zu sein.

**Zwei Zählwerte und der Quotient erst in Go.** Als `CASE` geschrieben tippt
sqlc die Spalte `interface{}`; mit einem äußeren Cast tippt es sie als
nicht-nullbares `float64`, und der Scan bräche genau auf der leeren Datenbank —
dem einen Fall, für den der `NULL`-Zweig existiert. Die Division steht deshalb
in `internal/health`, wo ein Test sie ohne Postgres erreicht.

**`rate` ist `null` und nicht `0`, wenn nichts angenommen wurde.** `0/0` ist
keine Null. Ein Formular, das noch niemand benutzt hat, ist kein Formular, das
Nachrichten verliert — und `0,00 %` am einzigen Konversionspunkt wäre die
lauteste erfundene Zahl, die diese Seite drucken könnte (Invariante 1).

**Prozent, kein Bruch** — anders als `errorRate` und wie `uptime90d`, weil das
Ziel hier als `> 99 %` geschrieben steht.

**Der Zähler steht mit seinem Nenner da.** Das ist der Fund aus #208, auf eine
zweite Quote angewandt: 100,00 % liest sich bei drei Nachrichten wie bei
dreihundert. Wer die Quote bewerten will, braucht `accepted` daneben.

### Was diese Zahl nicht sieht

- **`sent` heißt, das Relay hat angenommen — nicht, dass die Nachricht im
  Postfach liegt.** Die Antwortdauer belegt den SMTP-Umlauf, nicht die Ankunft;
  aufgeschrieben in der H8b-Abnahme und hier an seinem Platz. Ein Relay, das
  eine angenommene Nachricht danach still verwirft, bleibt für diese Zahl
  unsichtbar.
- **Der Honeypot-Pfad kommt nicht vor.** Eine Einsendung, die an Honeypot oder
  Verweildauer scheitert, bekommt eine `202` und **keine Zeile**
  (`internal/contact/contact.go`). Sie fehlt im Nenner, und das ist richtig: sie
  ist nie angenommen worden, sie ist stillgelegt worden.
- **Ein `502` kommt nicht vor.** Scheitert der Versand im Anfrageweg, erfährt es
  der Absender (ADR 0021 §1). Diese Zahl misst, was **nach** einer `202`
  passiert — also genau den Fehler, den sonst niemand bemerkt.
- **Eine Nachricht in Flug drückt die Quote.** Eine Zeile, die noch `queued`
  ist, zählt in den Nenner und nicht in den Zähler — sie *ist* noch nicht
  zugestellt. Der letzte Versuch des Dispatchers liegt 30 Minuten nach Eingang
  (0 · 2 · 6 · 14 · 30, `internal/contact/policy.go`), so lange kann die Delle
  stehen. Die Richtung ist gewollt: eine klemmende Warteschlange ist sichtbar,
  solange sie klemmt, und nicht eine halbe Stunde später. Bei einem
  einstelligen Nenner ist die Delle groß — deshalb steht der Nenner daneben.
- **Sie steht auf keiner Seite.** Sie ist über `/api/health` erreichbar und
  wird nirgends gezeichnet. Kein Blatt zeigt sie, und die Kachelreihe der
  Fallstudie ist durch ADR 0052 auf fünf festgelegt. Das ist eine offene
  Entwurfsfrage, keine vergessene Zeile — siehe unten.

---

## Was hier nicht steht

| Fehlt | Phase |
|---|---|
| Burn-Rate-Alerts (1 h/14,4× sofort · 6 h/6× Ticket), Runbook je Alert | **F10** |
| Dashboards, die diese SLIs zeigen | **F9** |
| Die Zustellbarkeit **auf einer Seite** — welches Blatt, welche Stelle | offen, Stufe-H-Triage |
| Ein Panel für die Zustellbarkeit — ihre Quelle ist Postgres, keine Recording Rule | **F9**, wie die anderen vier |
| Das Fehlerbudget im HUD der 404-Seite | **H10** |

**Ein Alert ohne erprobtes Runbook zählt nicht.** Um drei Uhr nachts nützt eine
Meldung ohne Anleitung nichts — die Regel gehört zu F10 und steht hier, damit
F10 sie nicht neu beschließen muss.
