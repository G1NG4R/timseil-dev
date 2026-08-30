# ADR 0054 — Ein 403 ist keine Antwort der Anwendung, und ein Rollback darauf ist die falsche Richtung

**Status:** Angenommen
**Datum:** 2026-08-31
**Betrifft:** E4b — `tools/verify-deploy.sh`, `tools/deploy-gate.sh`
**Invarianten:** 1 (keine erfundenen Zahlen) — sonst keine berührt

## Kontext

Am 30.08.2026 um 21:28 hat der `deploy`-Job von `28a2c63` einen funktionierenden
Deploy zurückgerollt und danach in ein Log geschrieben, die Seite sei unten.
Beide Schlüsse waren falsch.

```
21:28:07  verify: waiting up to 60s for sha 28a2c63
21:29:07  ✗ 60s elapsed and the deploy did not come up
          last seen: /api/health answered 403
21:29:07  rollback → sha-3479024
21:30:09  ✗ 60s elapsed … last seen: 403
          ✗ THE ROLLBACK DID NOT COME UP EITHER — the site is down
```

Im selben Fenster, von hier aus gemessen: `28a2c63` ausgeliefert, vier Routen mit
den erwarteten Codes. Um 21:37 antwortete die Seite überall 200, `status ok`,
uptime 100, p95 17,9 ms. **Es gab keinen Ausfall**, und es gab auch keinen Grund
für den Rollback.

Die Ursache steht in drei Zeilen, `tools/verify-deploy.sh:151-153` in der Fassung
von damals:

```sh
else
  last="/api/health answered ${code:-nothing}"
fi
```

**Jeder Statuscode, der nicht 200 ist, landet im selben Topf**, wird sechzig
Sekunden lang wiederholt und heißt am Ende „did not come up". Ein 503 und ein 403
sind darin nicht zu unterscheiden, und sie bedeuten Gegenteiliges: das eine ist
die Anwendung, die nicht antwortet, das andere ist jemand vor ihr, der *diesen
Aufrufer* abweist. Über die Anwendung sagt das zweite nichts.

**Der Rollback ist dabei die falsche Richtung**, und der Vorfall zeigt genau,
warum: er fragt denselben Aufrufer noch einmal, bekommt dieselbe Antwort und
lässt das Werkzeug auf einen Totalausfall schließen. Zwei Fehlurteile aus einem
Statuscode, den niemand gelesen hat — und das zweite ist der lauteste Satz, den
diese Pipeline sagen kann.

**Die Ursache des konkreten 403 steht nicht hier.** Sie ist der Ist-Stand einer
Sicherheitsfrage dieses Hosts, ist untersucht und in den privaten Notizen
festgehalten. Für diese Entscheidung zählt nur, dass sie nicht systematisch war —
die Uptime-Sonde lief zehn Minuten vorher von einem Runner erfolgreich, und der
Deploy davor verifizierte sauber aus einem Runner heraus. Es traf einen Aufrufer
in einem Fenster. **Und deshalb ist die Werkzeuglücke unabhängig davon zu
schließen: sie schlägt bei jeder künftigen Abweisung wieder zu, gleich woher
diese kommt.**

## Entscheidung

### 1 · Der Verify hat drei Ausgänge, nicht zwei

| Code | Bedeutung |
|---|---|
| `0` | die verlangte Version ist live |
| `1` | sie ist es nicht — die Anwendung wurde erreicht und war es nicht |
| **`2`** | **die Antwort kam nicht von der Anwendung; das Skript kann es nicht beurteilen** |

**Bei der ersten Abweisung wird abgebrochen, nicht weiter abgefragt.** Das
Sechzig-Sekunden-Budget (ADR 0033) existiert, damit ein Container hochkommen
kann; eine Abweisung ist kein Container, der hochkommt. Weiter zu fragen macht
die Meldung später, nicht wahrer — gemessen: 0 Sekunden statt 60.

Die Meldung sagt, was sie weiß und was nicht:

```
  ! /api/health answered 403 — that is not this application's answer
    the public health route serves 200 or 304 and reports failures as RFC 9457
    documents, so a refusal came from something in front of it. Nothing here
    says whether sha 28a2c63 is running.
```

### 2 · Welche Codes — und der Contract entscheidet, nicht die Erfahrung

`/api/health` ist öffentlich; `contract/openapi.yaml:76-93` kennt für die Route
`200`, `304`, `429` und `500`, und jeder Fehler dieses Dienstes ist ein
RFC-9457-Dokument. **Ein 401, 403 oder 451 dort ist damit bauartbedingt nicht
unsere Antwort** — das ist keine Beobachtung, die ein Gegenbeispiel umstoßen
könnte, sondern eine Aussage über den Contract, und sie trägt die Regel.

| Antwort | Ausgang | Warum |
|---|---|---|
| `401` · `403` · `451` | **2** | steht nicht im Contract; kam von etwas vor der Anwendung |
| `429` | **2** | *kann* unsere sein — sagt trotzdem nichts über den Build |
| `500` · `000` · `502` · `503` · `504` | `1` | die Anwendung antwortet nicht oder ist kaputt |

**429 ist der Sonderfall, und er bekommt eine eigene Meldung.** Der Contract
kennt ihn für diese Route, und der Rate-Limiter deckt sie nachweislich ab
(`api/internal/middleware/chain_test.go:349`). Ihn „not this application's
answer" zu nennen wäre also falsch. Er endet die Schleife trotzdem: gedrosselt zu
werden sagt nichts darüber, welcher Build läuft.

`500` und der Verbindungsfehler bleiben bewusst in der Warte-Bahn. Das sind die
Fälle, für die das Budget und der Rollback gebaut wurden.

### 3 · Auf einen Exit 2 wird nicht zurückgerollt und nichts berichtet

`tools/deploy-gate.sh` liest den Ausgangscode, an **beiden** Aufrufen:

```
erster Verify    0 → report ok, exit 0
                 2 → kein Rollback, kein Report, exit 1
                 1 → Rollback, dann report ok|rollback

nach dem Rollback 0 → report rollback, exit 1
                 2 → exit 1, kein Report, und NICHT „the site is down"
                 1 → THE ROLLBACK DID NOT COME UP EITHER
```

**Kein Report bei `2`, und das ist Invariante 1 in der Pipeline.** Die Zeile in
`deploys` sagt `ok` oder `rollback`. Beides wäre hier eine Behauptung, die
niemand gemessen hat — der Gate weiß nicht, ob der Deploy oben ist. Also schreibt
er nichts, und **der fehlende Datensatz ist die ehrliche Spur.** Es ist dasselbe
Argument, das ADR 0034 für den Drill führt: Invariante 1 gilt nicht nur für
Zahlen, die niemand produziert hat, sondern auch für Zeilen, die etwas Falsches
*bedeuten*.

**Der zweite Aufruf ist keine Zugabe.** Er war das zweite Fehlurteil jener Nacht,
und die Lage kann auch für sich allein entstehen: ein Deploy, der wirklich nicht
hochkam, ein Rollback — und die Abweisung erst danach. „The site is down" darf
nur fallen, wenn die Anwendung erreicht wurde und wirklich nicht da war.

## Konsequenzen

**Der Preis des dritten Ausgangs:** ein Deploy kann jetzt scheitern, ohne dass
irgendetwas über ihn feststeht. Der Job ist rot, Produktion steht, wo sie stand,
und **welcher Stand das ist, weiß die Pipeline nicht.** Das ist keine Lücke,
sondern die Wahrheit über die Lage — aber sie verlangt einen Menschen, und der
Runbook sagt ihm in drei Schritten, wo er anfängt.

**Der Preis der fehlenden Zeile:** `deploys` hat eine Lücke, wo ein Deploy lief.
Wer später Deploys zählt, zählt zu wenige. Der Gegenwert ist, dass jede Zeile,
die dort steht, gemessen wurde — und eine Lücke ist als Lücke lesbar, ein
falsches `ok` nicht.

**Der Preis der Attrappen im `selftest`:** die Fuge zwischen den beiden Skripten
trägt keine Zusicherung. Der echte Verify wird gegen einen echten Server geprüft
(403 · 429 · 503), die fünf Verzweigungen des Gates gegen einen Sandkasten, in
dem der echte Gate neben Attrappen für seine drei Geschwister steht. Beides
zusammen zu fahren würde eine Zeile mehr belegen und zwei Läufe à sechzig
Sekunden im ersten Ziel von `make check` kosten. Der ungeprüfte Rest ist
`|| verdict=$?`.

**Was `selftest.sh` dazubekommt:** neun Zusicherungen und ein zweiter
Fixture-Server. Die Datei ist eingefroren — „neue Regeln nur mit einem Vorfall,
den man benennen kann". Dies ist der Vorfall, mit Zeitstempel, Log und
Gegenmessung.

Drei Mutationen haben vorgeführt, dass sie nicht ins Leere greifen: Verify ohne
den dritten Ausgang macht die 403- und die 429-Zusicherung rot; Gate ohne die
erste Verzweigung macht die zwei über den ausbleibenden Rollback rot; Gate ohne
die zweite macht die über den Rollback-Pfad rot. Die übrigen drei sind
Gegenproben — 503, der geglückte Deploy, der echte Ausfall — und bleiben dabei
absichtlich grün. **Die erste Fassung einer davon war zu schwach**: sie suchte
„the verify was refused", und dieser Wortlaut steht auch in der Meldung des
Rollback-Pfads, also blieb sie unter der Mutation grün. Sie hängt jetzt an einer
Formulierung, die nur die erste Verzweigung hat.

## Verworfene Alternativen

**Eine Ausnahme für die Adressen der Runner.** Das wäre eine Änderung an der
Schutzschicht dieses Hosts, auf Verdacht, ohne dass jemand nachgesehen hätte, ob
es dort überhaupt eine Entscheidung gab. Erst messen. Und selbst wenn sie richtig
wäre: die Werkzeuglücke bliebe, und die nächste Abweisung käme von woanders.

**Ein Wiederholungsversuch im Gate.** Ein zweiter Anlauf gegen eine Abweisung ist
derselbe Fehler eine Ebene höher. Der Rollback war schon der Wiederholungsversuch.

**429 als Exit 1 behandeln**, weil der Contract ihn für diese Route kennt. Dann
rollt der Gate zurück, weil er gedrosselt wurde — derselbe Fehlschluss eine
Klasse weiter, und die Drosselung träfe den Rollback genauso.

**`BUDGET_SEC` per Umgebungsvariable kürzbar machen**, damit der 503-Fall am Gate
in Sekunden statt in einer Minute prüfbar wird. Die Sechzig leben in genau einer
Datei (ADR 0033), und ein zweiter Ort, an dem sie stehen kann, ist ein Ort, an
dem sie auseinanderlaufen. Der Sandkasten löst dasselbe Problem ohne zweite
Definition.

**Den 403 im `selftest` mit `chmod 000` erzeugen.** Nachgemessen: das gibt 404.
`python3 -m http.server` bildet jeden `OSError` beim Öffnen auf `NOT_FOUND` ab
(`http/server.py`, `send_head`). Ein Fixture, das 404 misst und 403 behauptet,
wäre dieselbe Sorte Fehler wie der, den dieser ADR repariert.

**`tools/check-deployed.sh` mitreparieren.** Der Geschwisterfund vom 30.08.2026 —
es liest `ops.lastDeploy.sha` nicht und war deshalb grün über den Datensatz des
vorigen Deploys — ist dieselbe Klasse, aber eine andere Datei, und er hat nichts
kaputtgemacht. Er steht im Backlog und gehört E4b.

## Belege

Bauplan Kapitel 26 · ADR 0033 (das Budget, und Exit 1 nach geglücktem Rollback) ·
ADR 0034 (warum der Drill nichts berichtet — dasselbe Argument) ·
`contract/openapi.yaml` (76-93) ·
`api/internal/middleware/chain_test.go` (349) ·
`tools/verify-deploy.sh` · `tools/deploy-gate.sh` · `tools/selftest.sh` ·
`docs/runbooks/dokploy.md`, Abschnitt Rollback ·
der `deploy`-Job von `28a2c63`, 30.08.2026, 21:28:07-21:30:09 UTC, und die
Gegenmessung um 21:37
