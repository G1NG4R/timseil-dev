# ADR 0020 — Der Contribution-Graph: ein Cache in Postgres, ein Breaker vor GitHub und der siebte Problem-Typ

**Status:** Angenommen
**Datum:** 2026-08-18
**Betrifft:** C5, C6, C7, E5, F6, H5
**Invarianten:** 1 (keine erfundenen Zahlen), 3 (Metriken nur für `state='live'`,
sinngemäß: eine Zahl ohne Messung gibt es nicht)

## Kontext

Der Build-Plan gibt C5 in vier Sätzen: GraphQL statt REST, Token `read:user` und
nie zum Client, Cache eine Stunde, Circuit Breaker mit Backoff und Jitter, und
GitHubs Farben werden nicht verwendet. Das Abnahmekriterium ist ein einziger
Satz — „simulierter GitHub-Ausfall liefert Cache mit korrektem Alter statt
Fehler".

Der Contract für `/api/contributions` steht seit B1 vollständig und eingefroren,
die Go-Typen sind generiert, und `httpx.CacheControlHour` trägt seit C3 einen
Kommentar, der auf diese Phase zeigt. Was nirgends steht, sind die sechs Fragen,
die man beantworten muss, bevor man eine Zeile schreibt.

C5 ist außerdem die erste Phase, die drei Dinge zum ersten Mal tut: ein
ausgehender HTTP-Aufruf (in `api/` gab es keinen einzigen — kein `http.Client`,
kein Retry, kein Breaker, keinen Cache), ein Geheimnis in der Konfiguration, und
ein Fehlerzustand, für den ADR 0009 keinen Typ kennt.

## Entscheidung

### 1. Der Cache liegt in Postgres, nicht im Prozess

Eine Tabelle `contributions_cache` mit einer Zeile pro Login. Die naheliegende
Alternative — ein `atomic.Pointer` im Go-Prozess — ist an genau einer Stelle
falsch, und die ist der ganze Punkt des Endpoints.

Ein Prozess-Cache ist nach jedem Deploy leer. Das ist der Moment, in dem ein
Besucher am wahrscheinlichsten ankommt, und es ist auch der Moment, in dem ein
GitHub-Ausfall am teuersten wäre: die Seite hätte dann keinen „letzten guten
Stand", sondern 502. Das Versprechen des Endpoints hielte genau so lange, wie
niemand deployt.

Der zweite Grund kommt aus E5. Beim Deploy ohne Ausfall laufen zwei Instanzen
gleichzeitig. Mit Prozess-Cache hätten sie zwei verschiedene Kalender, zwei
verschiedene `cacheAgeSec` und **zwei verschiedene ETags für dieselbe URL** — ein
Leser bekäme abwechselnd 200 und 304 und niemand wüsste warum.

Redis wäre die dritte Möglichkeit und steht in Kapitel 3 des Build-Plans unter
„bewusst nicht gebaut": Postgres und In-Process reichen bei diesem Verkehr.
Postgres ist bereits da.

Damit ist `contributions_cache` die einzige Tabelle im Schema, die Daten hält,
die wir nicht erzeugt haben — und damit die einzige, die man folgenlos leeren
darf. Kein Fremdschlüssel zeigt auf sie, Invariante 5 ist nicht berührt.

### 2. `cacheAgeSec` wird in SQL gerechnet, und der Handler hat keine Uhr

`GREATEST(0, EXTRACT(EPOCH FROM now() - fetched_at))::int`, in der Abfrage.

Das Alter ist die eine Zahl auf diesem Endpoint, die ein Besucher glauben soll.
„Aus dem Cache, drei Stunden alt" ist nur ehrlich, wenn beide Enden der
Subtraktion von derselben Uhr kommen — und bei zwei Instanzen ist die Datenbank
die einzige Uhr, auf die sich beide einigen können. Dieselbe Regel, die ADR 0017
über „heute" aufstellt.

Folge: `internal/contributions` hat **keine injizierte Uhr**, anders als
`internal/systems` und `internal/training`. Die beiden setzen einen eigenen
Zeitstempel in eine Antwort; dieser hier setzt nirgends eine Zeit.

Das `GREATEST(0, …)` ist keine Zierde. Ein wiederhergestellter Dump, eine
zurückgestellte Uhr oder eine von Hand geänderte Zeile erzeugen ein `fetched_at`
in der Zukunft, und ein negatives Alter ist eine Zahl, die niemand gemessen hat.

### 3. Abgerufen wird auf einem Ticker, nie im Anfrageweg

Ein `Refresher` in der Form von `internal/ops` (ADR 0019 §8): einmal sofort, dann
alle fünf Minuten. Der Handler liest die Zeile und ruft GitHub nie.

Drei Dinge fallen damit weg, die man sonst lösen müsste. Kein Besucher wartet je
auf GitHub. Die Timeout-Kaskade aus ADR 0014 wird nicht berührt — der Abruf läuft
nicht in einer Anfrage, also gibt es keine Beziehung zu `REQUEST_TIMEOUT`. Und
Breaker, Backoff und Jitter leben vollständig in der Schleife, statt sich mit
einem Handler zu verschränken.

**Fünf Minuten Tick, eine Stunde Haltbarkeit — das sind zwei Zahlen und nicht
eine.** Ein stündlicher Tick hieße: ein einziges 502 kostet eine volle Stunde
Alter. Ein Tick, der eine frische Zeile findet, kostet eine indizierte Suche nach
einer Zeile.

Die Reihenfolge der drei Prüfungen in `runOnce` ist die eigentliche Entscheidung
dieser Phase:

```
Breaker offen?          → nichts berührt das Netz
Zeile jünger als 1 h?   → nichts wird abgerufen
abrufen; Fehler         → ohne Schreibzugriff zurück
```

Jeder Fehlweg endet **ohne Schreibzugriff**. Nichts in dieser Schleife leert die
Zeile, setzt sie leer oder markiert sie als ungültig. Damit ist das
Abnahmekriterium der Phase eine Eigenschaft der Form und keine Regel, an die sich
jemand erinnern muss.

### 4. Fünf Antworten von GitHub werden zurückgewiesen, keine wird verkleinert

Weil ein fehlgeschlagener Abruf den gespeicherten Kalender stehen lässt, kostet
eine Zurückweisung eine Stunde Alter — eine angenommene Halbantwort überschreibt
dagegen einen guten Kalender mit einem schlechteren, und dahin gibt es keinen
Weg zurück.

| Fall | Warum eigener Fehler |
|---|---|
| HTTP ≠ 200 | 401 heißt „Token rotieren", 502 heißt „warten". Der Status ist der einzige Teil von GitHubs Antwort, der sicher und nützlich ist. |
| `errors[]` bei HTTP 200 | **Die GraphQL-Falle.** Der Transport sagt „gut", der Körper sagt „nein". Wer nur den Status prüft, liest Nullen aus einem `null`-`data` und speichert ein ruhiges Jahr. |
| `data.user == null` | Der Login existiert nicht. Der einzige Fehler hier, den Warten nicht behebt. |
| null Wochen | Ein leerer Kalender ist kein ruhiges Jahr, sondern eine Antwort, die wir nicht bekommen haben. **Invariante 1 an der einzigen Stelle in Stufe C, an der ein Schreibzugriff sie brechen kann.** |
| Unbekannte Quartilstufe | Auf `l0` zu raten zeichnet einen ruhigen Tag, der nicht ruhig war. |

Die Abbildung ist eine `map` und kein `switch` mit `default` — damit es keinen
Ort gibt, an dem so ein Raten wohnen könnte. Ein `CHECK` steht zusätzlich auf der
Tabelle, damit die Regel auch gegen ein `INSERT` von Hand hält.

GitHubs `color` wird gar nicht erst abgefragt. Die fünf Stufen `l0`…`l4` sind die
des Entwurfs, und die API liefert den Farbwert nicht mit, statt ihn zu liefern
und die Oberfläche darauf zu verpflichten, ihn zu ignorieren.

### 5. Der ETag hasht den Kalender, nicht die Antwort

`totalContributions` und die gespeicherten `weeks`-Bytes. **Nicht `fetchedAt`,
nicht `cacheAgeSec`.**

Das Alter bewegt sich jede Sekunde. Im Hash bekäme jede Anfrage einen neuen Tag,
`If-None-Match` träfe nie, und der 304-Pfad wäre toter Code, den nichts als
kaputt meldet — der Endpoint sähe weiter richtig aus und schickte jedem Abruf den
vollen Körper. Ein Fehler ohne Symptom, und deshalb einer, der einen Test
verdient, der ihn mutationsgeprüft festhält.

Weil Postgres `jsonb` beim Schreiben normalisiert, hat ein Kalender eine
Bytefolge: ein Refresh, der dasselbe Jahr geholt hat, lässt den Tag jedes Lesers
gültig.

### 6. Ein siebter Problem-Typ: `upstream-unavailable`

Der Contract deklariert für diesen Pfad `502`. ADR 0009 kennt sechs `type`-URIs,
und keiner heißt „die Gegenseite hat nicht geantwortet". Der Kommentar über der
Liste in `problem.go` sagt selbst, was zu tun ist: ein siebter ist eine
Contract-Entscheidung, keine Handler-Entscheidung. Hier ist sie.

Benannt nach der Form des Fehlers, nicht nach GitHub. Der eine Typ, der seinen
Upstream benennt — `mail-provider-unavailable` — ist der Grund, es nicht zu tun:
ein Typ pro Upstream heißt, dass C6, F5 und jede spätere Abhängigkeit sich einen
eigenen prägen, und ein Client, der „die Gegenseite ist unten" sagen will, führt
eine Liste.

`contract/openapi.yaml` bleibt unberührt: `Problem.type` ist dort ein freier URI,
die Aufzählung lebt im Prosatext von ADR 0009. Kein `make gen`, kein Drift.

**Der 502 ist ausschließlich der Kaltstart.** Ein gespeicherter Kalender wird mit
seinem Alter ausgeliefert, egal wie alt er ist — also heißt 502 hier „GitHub hat
geantwortet, seit es diese Datenbank gibt, noch nie", nicht „GitHub ist gerade
unten". Der Unterschied entscheidet, ob Warten hilft, und steht deshalb im
`detail`.

### 7. Zahlen als Konstanten, Token und Login als Umgebung

Derselbe Schnitt wie ADR 0019 §6. `refreshEvery`, `staleAfter`, `runTimeout`,
`attemptTimeout`, `maxAttempts`, `backoffBase`, `breakerThreshold`,
`breakerCooldown` und `maxResponseBytes` beantworten keine Frage, die sich
zwischen zwei Deployments unterscheidet — und zwei tragen einen zweiten Grund:
`staleAfter` ist die Stunde, die `s-maxage=3600` verspricht (aus der Umgebung
könnte ein Deployment sich mit seinen eigenen Headern überwerfen), und die
Breaker-Zahlen entscheiden, wie oft ein Credential während eines Ausfalls über
die Leitung geht — eine Sicherheitseigenschaft, die in einen Commit gehört.

`maxAttempts` ist aus `runTimeout` **abgeleitet**, nicht danebengestellt:
8 + 0,5 + 8 + 1 + 8 = 25,5 s unter der 30-Sekunden-Decke, damit ein Lauf den
nächsten Tick nie überlappt. Die Rechnung ist ein Test und kein Kommentar.

Token und Login sind das Gegenteil: sie unterscheiden sich zwischen Deployments,
und einer ist ein Geheimnis.

### 8. Ohne `GITHUB_TOKEN` startet der Prozess nicht

Wie `DATABASE_URL`. Die Startseite verspricht einen Contribution-Graph; ein
Prozess, der fröhlich läuft und ihn nie holen kann, zeigt dauerhaft `— NO DATA`
und nennt das eine Messung. Das ist Invariante 1 in Startaufstellung.

Der Token wird zusätzlich auf `\r` und `\n` geprüft und hart abgelehnt: er geht
in einen `Authorization`-Header, und das ist dieselbe Klasse wie die CRLF-Regel
für Mail-Felder in C6 — einen Endpoint früher und gegen einen kleineren
Angreifer, aber drei Zeilen billig. Der Wert erscheint in keiner Fehlermeldung;
eine Konfigurationsmeldung wird von einem Prozess gedruckt, der gleich endet, und
landet im Container-Log.

Der Login wird ebenfalls geprüft, **nicht** gegen Injection — er reist als
JSON-Variable in einem GraphQL-Dokument und kann nicht in die Abfrage entkommen —
sondern weil ein Tippfehler still scheitert: GitHub antwortet auf einen
unbekannten Nutzer mit HTTP 200 und `data.user: null`, also sieht ein falscher
Buchstabe genau wie ein GitHub-Ausfall aus.

Die Endpoint-URL ist **nicht** konfigurierbar. Eine URL, die aus der Umgebung
kommen kann, ist eine Bearbeitung davon entfernt, aus einer Anfrage kommen zu
können; die zwei ausgehenden Ziele dieses Dienstes sind einkompiliert (SSRF-Regel
aus CLAUDE.md und Build-Plan 11.x).

## Konsequenzen

`/api/contributions` antwortet. Der Kalender überlebt Deploys, Neustarts und
einen zweiten Prozess, und ein GitHub-Ausfall ist auf der Seite als wachsende
Zahl sichtbar statt als Fehler.

Der Endpoint ist der einzige auf der Seite, bei dem Invariante 1 **nicht** in
`— NO DATA` endet. Anderswo heißt keine Messung keine Zahl. Hier gibt es eine
Messung, sie ist nur alt, und „412 Beiträge, drei Stunden alt" ist ehrlicher als
Schweigen. `cacheAgeSec` ist das Feld, das den Unterschied sichtbar macht — es
darf nie gerundet, gecacht oder geraten werden.

`internal/contributions` ist das erste Paket mit einem ausgehenden Aufruf. Retry,
Backoff, Jitter und Breaker stehen darin, handgeschrieben, ohne neue
Abhängigkeit. `sethvargo/go-retry` liegt bereits als indirekte Abhängigkeit von
goose im Modul; sie zu befördern wäre eine Entscheidung und kein Nebeneffekt —
dieselbe Begründung, mit der das Rate-Limit `x/time/rate` abgelehnt hat.

Aus elf generierten Dateien werden zwölf.

### Was das kostet

**`make dev` aus einem frischen Klon braucht ab jetzt einen echten PAT.** Das ist
der teuerste Punkt dieser ADR und berührt den DoD-Punkt „`docker compose up` von
Null durchgelaufen". Aufgefangen an drei Stellen — ein eigener Block in
`.env.example` mit Bezugsquelle und Scope, eine Fehlermeldung, die beides nennt,
und ein Abschnitt im Runbook — aber nicht wegdefiniert. Wer die Seite lokal
starten will, braucht ein GitHub-Konto.

**Der Breaker ist bei einem Fünf-Minuten-Tick ein kleines Ding.** Er verhindert
kein Hämmern, er dämpft es: ein Tagesausfall kostet etwa 48 Anfragen statt 288.
Das ist der ehrliche Wert, und er wird hier hingeschrieben, damit ihn niemand für
größer hält, als er ist. Sein zweiter Wert ist, dass die Absicht im Code steht,
bevor jemand den Tick verkürzt und den Unterschied real macht.

**Eine Zeile bleibt liegen, wenn `GITHUB_LOGIN` sich ändert.** Der Login ist der
Primärschlüssel; die alte Zeile wird nie wieder gelesen und nie gelöscht.
Harmlos bei einer Tabelle mit einer Zeile, und im Runbook notiert, damit niemand
sie für ein Leck hält.

**Der Kalender kann bis zu einer Stunde und fünf Minuten alt sein**, obwohl der
Header eine Stunde verspricht: `s-maxage` läuft ab, der Tick kommt bis zu fünf
Minuten später. Das ist der Grund, `cacheAgeSec` überhaupt auszuliefern — die
Zahl sagt, wie alt es wirklich ist, statt es aus dem Header abzuleiten.

**Kein Messwert, nur Logzeilen.** Breaker-Zustand und Cache-Alter wären
natürliche Metriken, und CLAUDE.md verbietet eine Metrik ohne Dashboard-Panel;
Prometheus gibt es erst in Stufe F. Bis dahin ist die INFO-Zeile bei jedem Lauf
der einzige Beleg, dass die Schleife lebt — und ihr Fehlen die erste Antwort des
Runbooks.

**Der 502-Pfad ist im Alltag unerreichbar.** Nach dem ersten erfolgreichen Abruf
gibt es immer eine Zeile. Er ist trotzdem gebaut und getestet, weil der Contract
ihn deklariert und weil ein Kaltstart bei gleichzeitigem GitHub-Ausfall genau der
Tag ist, an dem niemand raten will, was passiert.

## Verworfene Alternativen

**Cache im Prozess (`atomic.Pointer`).** Keine Migration, kein SQL, weniger Code.
Verworfen an §1: leer nach jedem Deploy, und zwei Instanzen liefern zwei ETags
für eine URL. Das Abnahmekriterium wäre in einem Test grün und in Produktion an
dem einen Tag falsch, an dem es zählt.

**Abruf beim Request, mit Single-Flight.** Keine Hintergrund-Goroutine, kein
`Stop()` in der Shutdown-Ordnung. Verworfen, weil dann ein Besucher pro Stunde
die GitHub-Latenz zahlt, der Ausfallpfad mitten im Handler steckt und der Abruf
plötzlich unter `REQUEST_TIMEOUT` passen muss — drei Probleme, die §3 dadurch
löst, dass es sie nicht gibt.

**Rohantwort speichern und beim Lesen übersetzen.** Hätte den Vorteil, dass eine
korrigierte Abbildung sofort auf alte Zeilen wirkt. Verworfen: der Lesepfad wäre
dann eine Übersetzung pro Anfrage statt eines Durchreichens, die Tabelle trüge
GitHubs Vokabular, und der Gewinn ist eine Stunde Wartezeit, die man ohnehin hat.

**`github-unavailable` als Typ-Name.** Konkreter im Wortlaut. Verworfen an §6:
der nächste Upstream bräuchte wieder einen eigenen.

**Ein `CHECK` auf die Stufen im `jsonb`.** Wäre die Kopplung an das
Contract-Enum in der Datenbank. Verworfen, weil sie dort eine zweite Kopie der
Aufzählung wäre, die nichts mit dem Contract verbindet — genau der Drift, den ADR
0010 mit `check-migrations.sh` bezahlt statt hinzunehmen. Die Kopplung sitzt im
Contract-Test, der das ausgelieferte Dokument liest.

**`sethvargo/go-retry` befördern.** Liegt schon im Modul. Verworfen: eine direkte
Abhängigkeit ist eine Entscheidung, und der Backoff sind zwölf Zeilen.

**Breaker-Zustand als Prometheus-Metrik.** Verworfen für diese Phase, nicht für
immer — CLAUDE.md verlangt ein Panel dazu, und das gibt es erst in F. Steht im
Backlog.

## Belege

- `api/migrations/00008_contributions.sql` — die Tabelle und ihre vier Regeln
- `api/internal/store/queries/contributions.sql` — das Alter in SQL
- `api/internal/contributions/` — Handler, Abruf, Breaker, Schleife
- `api/internal/contributions/contract_test.go` — die fünf Stufen gegen das
  ausgelieferte Dokument, und die Stunde gegen `s-maxage`
- `api/internal/httpx/problem.go` — der siebte Typ
- `docs/runbooks/api.md` — was zu tun ist, wenn der Graph altert
- Handbuch Kap. 15 · Build-Plan C5 (Zeile 1066) · ADR 0009, 0014, 0016, 0017, 0019
