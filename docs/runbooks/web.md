# Runbook — der Web-Container

Was `web` protokolliert, was es absichtlich nicht protokolliert, und wie man eine
Anfrage über beide Container verfolgt. Stand: F1b.

Für die API-Seite: [`api.md`](api.md). Für den Stack als Ganzes:
[`compose.md`](compose.md).

---

## Die Zeile

Dieselbe Form wie die der API, weil eine Abfrage beide Container lesen soll:
`time`, `level`, `msg`, dann die Attribute, dann `request_id` und `trace_id` an
der Wurzel des Objekts.

```
{"time":"2026-08-23T11:30:23.070Z","level":"INFO","msg":"upstream request",
 "method":"GET","path":"/api/health","status":200,"duration_ms":88,
 "upstream_request_id":"eff2c10b…","request_id":"dc51add8…","trace_id":"d2ad2aad…"}
```

`level` ist groß geschrieben wie bei `slog`. Der einzige ehrliche Unterschied:
Go schreibt RFC 3339 mit Nanosekunden, Node mit Millisekunden. Beides ist RFC
3339; **ab F2 muss die Alloy-Pipeline beide Präzisionen als Timestamp
durchbekommen.**

**Eine Zeile ohne Anfrage trägt die zwei Felder gar nicht** — nicht leer. Ein
leeres `request_id` ist in Loki ein Wert, den danach jede Abfrage ausschließen
muss.

## Was geschrieben wird

| `msg` | wann | Stufe |
|---|---|---|
| `upstream request` | jeder Aufruf an die API, der eine Antwort bekommt | INFO |
| `upstream request failed` | jeder Aufruf ohne Antwort — Timeout, Verbindung verweigert, DNS | ERROR |
| `upstream request has no correlation` | `serverFetch` aus einem Pfad, den `proxy.ts` nicht abdeckt | WARN |
| `request failed` | ein Fehler, den web nicht selbst gefangen hat (`onRequestError`) | ERROR |
| `shutdown requested, readiness is now 503` · `leaving` | SIGTERM | INFO |

## Was **nicht** geschrieben wird, und warum

**Keine Access-Zeile.** `proxy.ts` läuft, **bevor** die Antwort existiert, kennt
also weder Status noch Dauer — die zwei Felder, für die die Access-Zeile der API
existiert. Eine Zeile ohne sie verdoppelt Traefiks Log und sagt weniger. web
protokolliert, was web *tut*.

**Keine Adressen, keine Formularinhalte.** Der Filter sitzt in `lib/scrub.ts`,
direkt vor dem Writer, und er ist für **fremden** Text da. Der Fall, für den er
in web existiert:

```
raw   : fetch failed: connect ECONNREFUSED 127.0.0.1:9999
logged: fetch failed: connect ECONNREFUSED redacted-ip
```

ADR 0035 sagt, dass `api` in Schritt 3 jedes Rollouts kurz weg ist — ohne den
Filter schriebe **jeder Rollout** die Container-Adressen ins Log.

**Nichts von `/healthz`.** Der Pfad steht außerhalb des `matcher` in `proxy.ts`;
Traefik fragt ihn einmal pro Sekunde und pro Backend.

## Die zwei IDs

| | `X-Request-Id` | `traceparent` |
|---|---|---|
| eingehend | **nie übernommen** | übernommen, wenn er parst, und als Kind fortgesetzt |
| in der Antwort | ja | nein |
| wozu | was ein Besucher zitiert | was die zwei Container verbindet |

web steht über Traefik am offenen Netz und kennt keinen vertrauenswürdigen Peer,
also prägt es die Request-ID immer selbst — eine übernommene wäre ein Name, den
ein Fremder für seine eigene Anfrage in unserem Log wählt. ADR 0037.

**Der Schlüssel über die Dienstgrenze ist `trace_id`.** Die API übernimmt eine
eingehende `X-Request-Id` nur vom vertrauenswürdigen Peer, und
`TRUSTED_PROXY_CIDRS` ist im Dev-Stack absichtlich leer. Die von web gesendete ID
wird also **nicht** die der API — deshalb trägt die Web-Zeile
`upstream_request_id`: die ID, unter der die API dieselbe Anfrage abgelegt hat.

## Eine Anfrage über beide Container verfolgen

```sh
# 1 — eine echte Seitenanfrage, ID aus der Antwort
id=$(curl -sS -D- -o /dev/null http://127.0.0.1:3000/ | tr -d '\r' \
       | sed -n 's/^X-Request-Id: //Ip')

# 2 — die Web-Zeile dazu, und die Trace-ID daraus
docker compose -f compose.dev.yaml logs --no-log-prefix web | grep "$id"
trace=$(docker compose -f compose.dev.yaml logs --no-log-prefix web | grep "$id" \
          | sed -n 's/.*"trace_id":"\([0-9a-f]\{32\}\)".*/\1/p' | head -1)

# 3 — dieselbe Trace-ID in BEIDEN Containern
docker compose -f compose.dev.yaml logs --no-log-prefix web api | grep "$trace"
```

Kein `jq` — auf einem frischen Klon nicht garantiert.

Einen Trace von außen **vorgeben** geht auch, und das ist der schnellere Test:

```sh
TP="00-$(openssl rand -hex 16)-$(openssl rand -hex 8)-01"
curl -sS -H "traceparent: $TP" -o /dev/null http://127.0.0.1:3000/
docker compose -f compose.dev.yaml logs --no-log-prefix web api \
  | grep "$(printf '%s' "$TP" | cut -d- -f2)"
```

## Der kaputte Fall

```sh
docker compose -f compose.dev.yaml stop api
curl -sS http://127.0.0.1:3000/
```

Erwartet: die Seite antwortet **200** und zeigt `— NO DATA`, die Web-Zeile trägt
`status: 0` mit derselben `trace_id`, und nichts stürzt ab. `serverFetch` wirft
nie — die Antwort der Seite ist in beiden Fällen dieselbe, und ein Wurf hieße nur,
dass jeder Aufrufer denselben `try`/`catch` schreiben muss, um zum selben `— NO
DATA` zu kommen.

## Die zwei Healthchecks

| | Pfad | Intervall | Frage |
|---|---|---|---|
| Docker (`web/Dockerfile`) | `/healthz` | 5 s | läuft die Anwendung? — was `docker compose up --wait` wissen muss |
| Traefik (`compose.yaml`) | `/healthz` | 1 s | soll dieser Container Verkehr bekommen? |

**Seit F1b auf demselben Pfad**, und der Grund steht in beiden Dateien: `/`
fetcht seit F1b die API, und ADR 0035 hat `api` in Schritt 3 eines Rollouts kurz
weg. Ein Docker-Check, der rendert, machte die Gesundheit von `web` von `api`
abhängig — `--wait` wartete dann auf einen Container, der nichts reparieren kann.
Aufgegeben ist damit „beweist, dass React rendert".

## Umgebungsvariablen

| Variable | Wirkung |
|---|---|
| `API_INTERNAL_URL` | wie web die API erreicht, serverseitig. Der Browser benutzt sie nie — er ruft `/api`. |
| `LOG_LEVEL` | `debug · info · warn · error`. **Die Variable der API**, nicht eine zweite mit `WEB_` davor: ein Regler mit einer Bedeutung, wie `SHUTDOWN_DELAY`. Ein unbekannter Wert fällt hier auf `info` zurück, wo die API sich weigert zu starten und den Wert nennt. |
| `SHUTDOWN_DELAY` | die Pause zwischen „schick mir nichts mehr" und „der Socket geht zu". Siehe `compose.md`. |

Kein `NEXT_PUBLIC_*`. Der Präfix schickt den Wert in den Browser; `check-env.sh`
und eine ESLint-Regel halten beide Hälften.

## Tests

`npm test` in `web/` läuft `node --test` über `lib/**/*.test.ts` — keine
zusätzliche Abhängigkeit, Node liest TypeScript direkt. Zwei Regeln, die dabei
gelten und die man beim nächsten Modul wieder braucht:

- **Alles unter Test importiert relativ und mit `.ts`-Endung** und zieht nichts
  aus `next/*`. Node löst weder den `@/`-Alias auf noch endungslose Pfade.
- **`net.isIP` ist im Test das Orakel, nicht die Implementierung.**
  `lib/scrub.ts` parst selbst. Solange beide Seiten dieselbe Funktion riefen,
  wurde nur die Suchstrategie geprüft — und genau in dieser Lücke saß der Fehler,
  den F1b in der API gefunden hat.
