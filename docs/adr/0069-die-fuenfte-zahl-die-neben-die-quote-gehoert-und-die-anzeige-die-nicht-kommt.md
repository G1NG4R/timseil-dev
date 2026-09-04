# ADR 0069 — Die fünfte Zahl: wohin sie im Contract gehört, was neben die Quote gehört, und die Anzeige, die nicht kommt

**Status:** Angenommen
**Datum:** 2026-09-04
**Betrifft:** H8c, F9, H10, Stufe-H-Triage
**Invarianten:** 1 (keine erfundenen Zahlen), 3 (Metriken nur für `live`), 7 (die Zahl muss nachzählbar bleiben)

## Kontext

`docs/slo.md` ist seit F5 die verbindliche Fassung der SLOs und nennt fünf
Indikatoren. Vier waren gemessen. Der fünfte, die **Zustellbarkeit**, hatte seit
F5 eine Definition, eine Datenquelle und keinen Weg aus der Datenbank heraus.

Die Daten lagen vollständig. `contact_messages.delivery_status`
(`queued` · `sent` · `failed`) steht seit B2 im Schema, samt
`contact_messages_delivered_iff_sent_ck`, und der Dispatcher aus C6 schreibt
ihn. Issue #206 hat den Rest benannt und dabei richtig erkannt, dass es **kein
Ticket für eine Abfrage** war: „`Metrics` currently carries three numbers about
the proxy; deliverability is about a queue, over a different window, and it is
not obvious that it belongs in the same object."

Der Fehlerfall, um den es geht, ist real und war unsichtbar. Nach ADR 0021 §1
antwortet der Handler mit `202`, wenn das Stundenbudget aufgebraucht oder der
Breaker offen ist; die Zeile bleibt `queued`, der Dispatcher holt nach — und
gibt er nach fünf Versuchen auf, erfährt das niemand. Der Besucher hat eine
Empfangsbestätigung, die Nachricht ist weg, und das ist der einzige
Konversionspunkt dieser Seite.

Fällig war das mit H8. H8a und H8b waren Web-Phasen und haben Contract, API und
SQL nicht angefasst; die H8b-Abnahme hält fest, dass die Fälligkeit überschritten
ist.

## Entscheidung

### 1. Das Feld steht in `OpsSummary`, nicht in `Metrics`

`Metrics` ist **pro System**, wird in `System` und `SystemDetail` jedem einzelnen
System mitgegeben und hängt an `state = 'live'` — Invariante 3, geschrieben in
die `WHERE`-Klausel von `LatestMetrics`, damit ein System beim Verlassen von
`live` seine Metriken selbst leert.

Die Zustellbarkeit teilt keine dieser drei Eigenschaften. Sie ist site-global,
sie betrifft eine Warteschlange statt einen Reverse Proxy, ihr Fenster ist
dreißig Tage statt einundneunzig oder fünf Minuten — und es gibt genau **ein**
Kontaktformular. Als `Metrics`-Feld trüge jedes andere System ein dauerhaftes
`null`, das „nicht zutreffend" bedeutete und nicht „nicht gemessen". Das wäre
eine zweite Bedeutung für `null`, und Invariante 1 lebt davon, dass es nur eine
gibt.

`OpsSummary` ist bereits `allOf[Metrics, …]` plus die site-globalen Tatsachen
`systemsLive`, `systemsTotal` und `lastDeploy`. Genau dorthin gehört sie, und im
Handler steht der Aufruf entsprechend **außerhalb** des `live`-Gatters, neben
`LastDeploy`. Das Formular nimmt Nachrichten an, gleichgültig in welchem Zustand
das Selbstsystem gerade ist; eine Quote, die sich bei einem falsch aufgesetzten
Seed selbst leerte, verstellte den Blick auf die Warteschlange genau dann, wenn
jemand hinsieht.

### 2. Die Quote fährt mit ihrem Nenner

`deliverability` ist ein Objekt aus vier Feldern und keine Zahl:
`rate` · `delivered` · `accepted` · `windowDays`.

Eine nackte Prozentzahl ist der Fehler, den #208 an `uptime90d` gefunden hat:
100,00 % liest sich bei drei Nachrichten wie bei dreihundert. `coverageNote()`
und die `note`-Zeile von `MetricTile` sind die Form, in der diese Seite dieselbe
Frage schon einmal beantwortet hat — die Abdeckung steht unter der Zahl.

`rate` ist **`null`** und nicht `0`, wenn nichts angenommen wurde. `0/0` ist
keine Null. `windowDays` steht in der Antwort, damit kein Leser dreißig annehmen
muss; die Konstante in `internal/health` füllt das Intervall der Abfrage **und**
dieses Feld, sodass die genannte Zahl nicht von der gemessenen abweichen kann
(Invariante 7, wie `systems.DefaultWindow` sie für die 91 hält).

Prozent und kein Bruch — anders als `errorRate`, wie `uptime90d`: das Ziel steht
als `> 99 %` geschrieben.

### 3. Der Nenner ist wörtlich „alle angenommenen"

`docs/slo.md` sagt: erfolgreich zugestellte geteilt durch **alle angenommenen**.
Wörtlich genommen zählt eine Zeile, die noch `queued` ist, in den Nenner und
nicht in den Zähler — sie ist noch nicht zugestellt. Der letzte Versuch des
Dispatchers liegt dreißig Minuten nach Eingang (0 · 2 · 6 · 14 · 30), so lange
kann eine frische Einsendung die Quote drücken.

Diese Richtung ist gewollt: **eine klemmende Warteschlange ist sichtbar, solange
sie klemmt**, und nicht eine halbe Stunde später. Und weil Zähler und Nenner
danebenstehen, ist die Delle lesbar statt alarmierend.

### 4. Die Division steht in Go, der Rest in SQL

Ein Bruch mit `metrics.sql`, und der Grund ist der Generator, nicht der
Geschmack. Als `CASE` mit einem `NULL`-Zweig geschrieben tippt sqlc die Spalte
`interface{}`; mit einem äußeren `::double precision` tippt es sie als
nicht-nullbares `float64`, und der Scan bräche auf genau der leeren Datenbank —
dem einen Fall, für den der `NULL`-Zweig existiert. Beide Zählwerte sind `NOT
NULL` und werden exakt abgeleitet, also liefert SQL die Zählwerte und
`internal/health` bildet den Quotienten, wo ein Test ihn ohne Postgres erreicht.

`InsertMetricSnapshot` behält seinen `CASE`: dort ist die Verfügbarkeit eine
Summe über eine andere Tabelle. Hier stehen Zähler und Nenner ohnehin in der
Antwort, und ein Quotient daneben wäre dieselbe Tatsache ein zweites Mal.

### 5. Diese Phase zeichnet nichts

Die Zahl ist über `/api/health` erreichbar und steht auf keiner Seite.

`docs/design/INDEX.md` hat kein Blatt für eine Zustellbarkeits-Anzeige, und seine
eigene Regel lautet „Fehlt deine Phase, ist die Antwort **kein Blatt**". ADR 0052
friert die Kachelreihe der Fallstudie auf fünf ein — `5 × 1fr`, der 5→3→2-Umbruch
in `layout.css`, K-29. Eine sechste Kachel wäre eine Entwurfsentscheidung ohne
Blatt, also genau das, wogegen ADR 0052 geschrieben ist.

Die Frage wird deshalb **gestellt und nicht still beantwortet**: sie steht in
`docs/slo.md` unter „Was hier nicht steht" und im Backlog als Punkt für die
Stufe-H-Triage.

## Konsequenzen

- `docs/slo.md` sagt bei diesem SLI nicht mehr „nicht gemessen", sondern
  „gemessen, noch nicht gezeichnet". Der Unterschied ist die Wahrheit über den
  Stand und keine Schönung in die eine oder andere Richtung.
- `/api/health` fährt eine fünfte Abfrage. Die Datei begründet seit C2, warum
  dieser Endpunkt mehrere Abfragen statt eines Joins fährt; das gilt weiter.
- Das öffentliche Bündel trägt die Zahl. `/api/health` ist öffentlich, also ist
  das eingehende Nachrichtenaufkommen öffentlich — siehe unten.
- `web/lib/api/schema.d.ts` kennt das Feld, und nichts in `web/` liest es. Die
  defensive Lesart in `lib/api/health.ts` (ADR 0035) bleibt der Grund, warum das
  gefahrlos ist.

### Was das kostet

**Das Aufkommen wird öffentlich.** `accepted` sagt einem Fremden, wie viele
Menschen in dreißig Tagen geschrieben haben, und diese Zahl ist heute
einstellig. Das ist der Preis für eine Quote, die man bewerten kann. Er ist
bewusst gezahlt: es ist eine Zahl über den **Betrieb dieser Seite**, keine über
die Härtung dieses Hosts — die Regel aus `CLAUDE.md` ist nicht berührt. Die
Alternative wäre eine Quote gewesen, die ihre eigene Belastbarkeit verschweigt,
und auf dieser Seite ist das der teurere Preis.

**Die Quote dellt sich sichtbar.** Bei einstelligem Nenner kostet eine Nachricht
in Flug bis zu dreißig Minuten lang zweistellige Prozentpunkte. Wer die Zahl
liest, ohne `accepted` daneben zu lesen, liest sie falsch. Das ist der Grund,
warum `accepted` kein optionales Feld ist.

**Ein sequenzieller Scan bei jeder Antwort.** Kein Index, und das ist
`00006_contact.sql`s eigene Regel: der `received_at`-Index kommt „mit dem Job,
nicht davor". Die Tabelle wächst mit Einsendungen, nicht mit Messungen, und
`accepted` in eben dieser Antwort ist das Instrument, das sagen wird, wann der
Scan einen Index verdient hat.

**Eine Zahl ohne Panel.** `CLAUDE.md` verlangt zu jeder Metrik ein
Dashboard-Panel. Ihre Quelle ist Postgres und keine Recording Rule, also kann
`check-rule-names.sh` sie nicht prüfen, und das Panel gehört nach F9 zu den
anderen vier. `docs/slo.md` führt das als Zeile, damit es nicht als Versprechen
durchgeht.

## Verworfene Alternativen

**`deliverability30d` als Feld auf `Metrics`.** Der kleinste Diff und die
falsche Aussage: jedes andere System trüge ein `null`, das „nicht zutreffend"
heißt. Siehe §1.

**Ein eigener Endpunkt `/api/deliverability`.** Eine fünfte öffentliche Route mit
eigenem Cache-Header und eigenem Contract-Test für eine Zahl, die auf dem Weg
mitfahren kann, den die Fußzeile ohnehin schon abfragt.

**Nur die Quote, ohne Zählwerte.** Hätte das Aufkommen geheim gehalten und
#208 ein zweites Mal gebaut. Und die Delle aus §3 wäre unsichtbar und damit
gefährlich geworden, statt lesbar zu sein.

**Nur entschiedene Zeilen im Nenner** — also alles ausschließen, was jünger ist
als der Wiederholungshorizont. Keine Delle, aber eine zweite Konstante, die aus
zwei anderen abgeleitet ist, und ein blinder Schwanz von dreißig Minuten an
genau dem Ende, an dem man hinsieht.

**Die Zahl in `metric_snapshots` schreiben.** Die Tabelle ist pro System und pro
Messzeitpunkt; diese Zahl ist keins von beidem. Sie käme aus derselben Datenbank,
die sie serviert — die sieben Tage Aufbewahrung, die ADR 0041 §1 für die
Verfügbarkeit zwingend machen, gibt es hier nicht.

**Eine sechste Kachel auf der Fallstudie.** Siehe §5 und ADR 0052.

## Belege

Issue #206 (die Contract-Frage, gestellt in der Stufe-F-Triage am 27.08.2026),
#208 (die Quote ohne ihre Abdeckung), #290 (dieselbe Frage an drei Badge-Routen).
`docs/slo.md` (die verbindliche Definition seit F5, ADR 0041 §1),
ADR 0021 §1 (ein Versuch im Anfrageweg, eine Schleife dahinter; `202` ≠ zugestellt),
ADR 0022 (der Vorgang, ein fehlendes Feld in den Contract zu bringen),
ADR 0009 (Contract, Problem Details, das öffentliche Bündel),
ADR 0035 (die defensive Lesart während des überlappenden Starts),
ADR 0041 §1 (warum die Verfügbarkeit nicht aus Prometheus kommt),
ADR 0052 (fünf Kacheln, eine Abdeckung),
ADR 0068 (die H8b-Notiz: die Antwortdauer belegt den Umlauf, nicht die Ankunft).
`api/migrations/00006_contact.sql:57-69` (die Spalten und der Kreuz-Check),
`api/migrations/00009_contact_delivery.sql` (der partielle Index des Dispatchers),
`api/internal/contact/policy.go:103-104` (Basis und Höchstzahl der Versuche),
`api/internal/store/queries/health.sql` (die Abfrage),
`api/internal/health/health.go` (die Konstante, das Gatter, die Division).
Build-Plan Zeile 1242 (H8), Anhang A Zeile 1381 (die fünf SLIs).
