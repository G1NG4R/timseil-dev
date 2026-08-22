# ADR 0035 — Der überlappende Start: Zwillinge und das Command-Feld

**Status:** Angenommen
**Datum:** 2026-08-22
**Betrifft:** E5, F2, G, L3
**Invarianten:** 1 (keine erfundenen Zahlen — auch nicht über die Dauer eines Ausfalls)

## Kontext

Seit D3 servierte **jeder Container-Wechsel dem öffentlichen Besucher ein Fenster
aus `404`**. Dreimal gemessen, mit drei verschiedenen Instrumenten:

| Wann | Wie | Ergebnis |
|---|---|---|
| E4b-Drill, 22.08.2026 | Schleife von Hand, `/` | ~10 s je Wechsel, zweimal identisch |
| E5a, Produktion, 17:17 UTC | `make witness --until-restart` | **19 s**, 16×`404` je Pfad, **keine 5xx** |
| E5a, Labor | `up -d --force-recreate` | 10–11 Stichproben `404` über 11–15 s |

Die Ursache ist die Bauweise selbst: die Router sind **Labels an den Containern**
(ADR 0028). Wird ein Container neu angelegt, verschwindet sein Router, Traefik
findet für die Regel keine Route mehr und antwortet mit seiner eigenen
Standard-404. Eine `404` ist dabei die unfreundlichere der beiden Antworten —
eine `502` lädt einen Crawler zum Wiederkommen ein, eine `404` nimmt ihm die
Adresse aus dem Index. Issue [#143](https://github.com/G1NG4R/timseil-dev/issues/143).

Der Bauplan nannte die Reparatur seit jeher als Zweizeiler. **E5a hat gemessen,
dass er in beiden Hälften falsch ist:** `--scale api=2` meldet
`Container timseil-api-1 Recreate` — der bestehende Container geht mit runter,
der Rollout tut also genau das, was er verhindern soll — und `--scale api=1`
entfernt den **höchsten** Index, also den gerade gestarteten.

Die Folge, die im Labor trug, braucht in ihrer Mitte
`docker stop <alter-container>`. Und da beginnt der Zwang dieser Entscheidung:

1. **Dokploy besitzt den Deploy** (ADR 0033 §2). Wer daran vorbei deployt,
   hinterlässt ein Panel, das etwas anderes sagt als der laufende Stack.
2. **Der Pipeline-Schlüssel kann einen Port forwarden und kein Kommando**
   (ADR 0033 §1). Es gibt keinen Weg, ein `docker stop` auf dem Host abzusetzen.
3. **Container-Indizes wandern.** Nach jedem Rollout heißt der überlebende
   Container eine Nummer höher (`api-1` → `api-2` → `api-3`). Ein fester Name
   ist nach dem ersten Durchlauf falsch.

Am Quelltext gelesen — Dokploy v0.30.0,
`packages/server/src/utils/builders/compose.ts`, nicht aus dem Verhalten
erraten: das Feld `command` einer Compose-App **ersetzt** den Vorgabebefehl
vollständig, und `sanitizeCommand` erlaubt `&&`-Ketten **unter der Bedingung,
dass jedes Glied nach dem ersten wörtlich mit `docker compose ` beginnt.**

Ein Containername ist damit ausgeschlossen. Ein **Dienstname** nicht.

## Entscheidung

**Zwei Schattendienste tragen die Router, während `api` und `web` neu angelegt
werden, und Dokploys Command-Feld führt die vier Schritte aus.**

### 1. `compose.rollout.yaml` — die Zwillinge

`api2` und `web2`, jeder nichts als ein `extends` auf sein Original. Sie
existieren nur während des Deploys. Vier Schritte, alle `docker compose`:

```
up -d --remove-orphans --wait api2      # db, migrate, seed über depends_on; der api-Zwilling
up -d --no-deps --wait web2             # der web-Zwilling
up -d --no-deps --wait api web          # der Tausch — die Zwillinge halten die Router
rm -s -f api2 web2                      # die Zwillinge gehen, nach DIENSTNAMEN
```

`tools/rollout.sh` ist die eine Stelle, an der sie stehen. `--print` erzeugt das
Command-Feld, `--run` fährt sie gegen das Labor, `--check` vergleicht ein
gefundenes Feld mit ihnen.

**Der Ruhezustand bleibt ein Container je Dienst.** Deshalb Zwillinge auf Zeit
statt dauerhaft zwei Repliken: `/api/health` behält außerhalb des Fensters genau
eine Identität, und `verify-deploy.sh` Bedingung 3 und 4, `check-deployed.sh`
und `witness.sh` lesen weiter einen Wert statt zweier, die sich abwechseln.

### 2. `extends`, und sonst nichts

Ein Zwilling, der von seinem Original abweicht, ist schlimmer als keiner: er
trägt einen veralteten Router, während jedes Deploy-Fenster echte Besucher auf
ihn verteilt, und **nichts wird dabei rot.** `make check-compose` weist deshalb
jede Zeile in dieser Datei ab, die nicht `extends`, `file` oder `service` ist.

`extends` kopiert `depends_on` mit — nachgemessen mit `docker compose config` auf
Compose 5.4.0, weil die Spezifikation das Gegenteil behauptet.

### 3. Das Command-Feld wird geprüft, nicht gesetzt

`tools/deploy.sh` liest es über `compose.one` und vergleicht es **vor** jedem
Schreibvorgang gegen `tools/rollout.sh --check`. Genau die Behandlung, die
`createEnvFile` seit E4 bekommt, und aus demselben Grund: eine Pipeline, die
eine Panel-Einstellung stillschweigend umlegt, versteckt eine Fehlkonfiguration,
statt sie zu melden.

Verglichen wird **mit gestrippten `-p` und `-f`**. Der Projektname der
Produktions-App ist Host-Zustand und gehört nicht in ein öffentliches
Repository; versioniert ist die **Form** des Rollouts, nie seine Zuordnung zu
einer Maschine.

### 4. Der Rest-Ausschlag, und er ist die Hälfte der Arbeit

Mit den Zwillingen allein verschwand der Trichter — **kein einziges `404` in
drei Läufen** —, aber je Rollout blieb eine Anfrage übrig. Sie kam nicht
abgelehnt zurück: **sie hing.** Der Container war weg, seine Adresse gehörte
niemandem mehr, und Pakete dorthin verschwinden, statt zurückgewiesen zu werden.
Traefiks `retry` kann eine Anfrage nicht retten, die nie scheitert.

Zwei Hälften, gemessen einzeln:

| | Was | Wirkung |
|---|---|---|
| `api` | `SHUTDOWN_DELAY=3s` — `/readyz` sagt 503, der Listener nimmt weiter an | Traefik nimmt das Backend aus dem Pool, **bevor** die Adresse verschwindet |
| `web` | `NEXT_MANUAL_SIG_HANDLE` plus `instrumentation.ts` und `/healthz` | dasselbe, für einen Prozess, der kein Bereitschaftsflag hatte |

**Beide brauchen einen Leser.** Traefiks Docker-Provider verwirft ein Backend
erst, wenn der Container den Laufzustand verlässt — er liest `/readyz` nicht,
solange man es ihm nicht sagt. `SHUTDOWN_DELAY` ohne
`loadbalancer.healthcheck` wäre ein Knopf ohne Wirkung, und genau deshalb hat
[#65](https://github.com/G1NG4R/timseil-dev/issues/65) in C1 nicht gebaut
werden dürfen: damals gab es den Leser nicht.

Die drei Sekunden sind kein runder Wert. Der Healthcheck läuft im Sekundentakt
mit einer Sekunde Zeitlimit; drei ist ein Intervall plus ein Zeitlimit plus eine
Sekunde Rand. Die beiden Zahlen sind gegeneinander gewählt.

**Danach: drei Läufe, `110 Anfragen je Pfad, 110×200`, kein Ausschlag.**

## Konsequenzen

- **Die Abnahme von E5 ist im Labor erfüllt** — keine Antwort, die nicht 200
  ist. Die Abnahme der Stufe bleibt ein echter Deploy.
- **Der Deploy dauert länger.** Zwei serielle Neuanlagen statt einer, plus zwei
  Pausen von drei Sekunden. Die Zahl wird in Produktion gemessen und geht so in
  die Fallstudie; geschätzt wird sie nicht.
- **`/healthz` und `/readyz` liegen nicht mehr hinter dem Rate-Limiter.** Sechzig
  Anfragen je Minute, alle auf die Adresse des Proxys gebucht, hätten die Hälfte
  von `RATE_LIMIT_RPM` verbraucht — und die `429` am Ende davon läse Traefik als
  krankes Backend. Der Limiter würde den Dienst aus dem Pool nehmen, den er
  schützen soll. `internal/middleware.Except`.
- **`stop_grace_period` steht ab jetzt zweimal**, in `compose.yaml` und als
  Konstante in `api/internal/config`, weil der Prozess die Datei nicht lesen
  kann, unter der er läuft. `make check-compose` weist ein Auseinanderlaufen ab.
- **Stufe G erbt eine offene Frage.** `web2` erreicht die API über
  `API_INTERNAL_URL=http://api:8080`, und in Schritt 3 ist `api` kurz weg.
  Solange keine Seite server-seitig liest, kostet das nichts; ab G kostet es.
  Steht als Zeile im Backlog.

### Was das kostet

**Eine Einstellung in einem fremden Panel.** Die Kette lebt in Dokploys
Command-Feld, und dieses Repository besitzt sie nicht. Ein Upgrade, das das Feld
zurücksetzt, holt den 404-Trichter zurück. Die Prüfung aus §3 macht daraus einen
gestoppten Deploy statt eines stillen Rückschritts — sie kann ihn nicht
verhindern.

**Ein Fenster gemischter Versionen** zwischen Schritt 2 und 3. Beide Builds
antworten gleichzeitig, für die Dauer von Schritt 2. Jeder überlappende Start
hat das, auch der Zweizeiler aus dem Bauplan; die Migrationen sind seit ADR 0033
ohnehin expand/contract.

**Vorübergehend doppelter Speicher.** api 256 M und web 512 M zusätzlich, für
die Dauer des Deploys, auf einem Host mit 12 GB, der bereits mehr trägt als
diesen Stack. Vor F2 nachzurechnen, nicht danach.

**`web` gibt seinen eigenen Drain auf.** Mit `NEXT_MANUAL_SIG_HANDLE` entfällt
Nexts Handler, der laufende Anfragen abwartet; nach der Pause wird beendet. Das
ist **hier** unbedenklich und nur wegen der Reihenfolge: wenn die Pause vorbei
ist, hat der Healthcheck sekundenlang 503 gesagt und Traefik schickt nichts mehr
her. Die Pause macht den harten Ausgang harmlos — ohne sie wäre der Tausch
schlecht.

**Zwei Dienste mehr, die niemand im Panel sieht.** `api2` und `web2` erscheinen
zwischen den Deploys nirgends. Wer den Stack von Hand ansieht, findet sie nur,
wenn ein Rollout unterbrochen wurde — dann räumt sie der nächste weg.

## Verworfene Alternativen

**Der Zweizeiler aus dem Bauplan.** In beiden Hälften falsch, in E5a gemessen.
Bauplan Zeile 1131–1136 und Handbuch Kapitel 26 sind mit dieser Stufe korrigiert.

**Ein Host-Skript mit erzwungenem SSH-Befehl.** `ops/host/rollout.sh`, erreicht
über einen zweiten Schlüssel mit `command="…"`, hätte die in E5a gemessene
`--scale`-Folge wörtlich ausführen können. Verworfen: das `ci-deploy`-Konto
bräuchte dafür die Docker-Gruppe, also faktisch Root auf dem Host — statt eines
Forwards auf einen Port. ADR 0033 hat denselben Weg schon einmal aus demselben
Grund verworfen, und solange #139 offen ist, wiegt er schwerer, nicht leichter.

**Dauerhaft zwei Repliken je Dienst.** Spart die Zwillinge und den letzten
Schritt. Verworfen, weil `/api/health` dann dauerhaft zwei Identitäten hat:
`.sha` und `.startedAt` wechseln je Anfrage, und drei Instrumente, die genau
diese Felder gegen sich selbst vergleichen, würden zu einem Münzwurf.

**`serversTransport` mit kurzem `dialTimeout`.** Wäre die allgemeinere
Reparatur: eine Anfrage auf eine tote Adresse scheitert schnell statt zu hängen,
und `retry` fängt sie auf. **Traefiks Docker-Provider registriert
`serversTransports`-Labels nicht** — am Container gesetzt, von Traefik ignoriert,
`servers transport not found`, Router auf 404. Der Weg lebt nur im Datei- oder
KV-Provider, und der gehört Dokploy und wird bei einem Upgrade überschrieben
(ADR 0028). Gemessen, dann verworfen.

**Nur die `retry`-Middleware.** Drei Zeilen, keine Zwillinge. Gemessen: sie
ändert nichts, weil die verlorene Anfrage nicht scheitert, sondern hängt. Sie
bleibt trotzdem drin — sie kostet nichts und deckt den Fall ab, in dem eine
Verbindung wirklich abgelehnt wird.

**Die Downtime ehrlich in die Fallstudie schreiben.** Der Bauplan sieht diesen
Ausgang ausdrücklich vor, und er wäre kein Scheitern gewesen. Er ist nicht
nötig geworden.

## Belege

Bauplan Zeile 1131–1136 (E5), Systemhandbuch Kapitel 26.
Issue [#143](https://github.com/G1NG4R/timseil-dev/issues/143) (der Trichter),
[#65](https://github.com/G1NG4R/timseil-dev/issues/65) (die Pause).
ADR 0014 (Lebenszyklus und Drain), ADR 0026 (Healthcheck im Binary),
ADR 0027 (Compose-Topologie), ADR 0028 (Traefik gehört Dokploy),
ADR 0033 (der Deploy durch den Tunnel), ADR 0034 (was einen Deploy beweist).
Messungen: `docs/runbooks/compose.md`, Abschnitt „Das rollende Labor".
Dokploy v0.30.0, `packages/server/src/utils/builders/compose.ts` —
`createCommand` und `sanitizeCommand`.
