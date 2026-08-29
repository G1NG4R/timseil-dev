# Runbook — der Web-Container

Was `web` protokolliert, was es absichtlich nicht protokolliert, wie man eine
Anfrage über beide Container verfolgt, wo seit G2 die Schriften und das Theme
sitzen, und wie man seit G5 die Sprachrouten und die maschinenlesbaren Flächen
nachmisst. Stand: G5b.

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
`status: 0` mit derselben `trace_id`, und nichts stürzt ab. `lib/api/client.ts`
wirft nie — die Antwort der Seite ist in beiden Fällen dieselbe, und ein Wurf
hieße nur, dass jeder Aufrufer denselben `try`/`catch` schreiben muss, um zum
selben `— NO DATA` zu kommen.

**Die Fußzeile widerspricht dem, und zwar richtig.** Sie zeigt weiter
`BUILD <sha> · ONLINE`, solange die zwischengespeicherte Antwort gilt. Die Zelle
sagt „diese Antwort kam von der API", nicht „die API lebt jetzt" (ADR 0045).
Wie lange, steht unten.

## Die Zahlen der Fußzeile messen — zwei Fallen

Die drei Zellen sind seit G4 eine gestreamte Insel. Wer sie mit `grep` über die
Antwort zählt, zählt zweimal falsch:

1. **Die RSC-Nutzlast trägt das Markup ein zweites Mal.** Sie steht in
   `<script>`-Tags. Ein `grep` über die rohen Bytes zählt zwei Dokumente.
2. **Der Platzhalter steht in Dokumentreihenfolge VOR dem Wert.** React liefert
   den gestreamten Inhalt in einem `<div hidden id="S:n">` am Ende des `<body>`
   nach. Ein Muster, das beim ersten Treffer aufhört, findet immer `— NO DATA` —
   auch dann, wenn die Zahl längst da ist. Genau dieser Messfehler hat in der
   G4-Abnahme zwei Minuten lang einen Defekt vorgetäuscht, den es nicht gab.

Also Skripte entfernen und **beide** Vorkommen ansehen:

```sh
curl -sS http://127.0.0.1:3000/ | python3 -c "
import sys, re
h = re.sub(r'<script\b.*?</script>', '', sys.stdin.read(), flags=re.S)
t = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', h))
print(re.findall(r'BUILD [a-z0-9]+|BUILD —|ONLINE|OFFLINE|UPTIME [—0-9.%]+', t))
"
```

Erwartet mit laufender API: der Platzhalter **und** der Wert, in dieser
Reihenfolge. Nur der Platzhalter heißt, dass die Insel nicht aufgelöst hat.

3. **Ein `docker compose`-Aufruf gegen den Lab-Stack ohne `IMAGE_TAG` bricht ab,
   bevor er irgendetwas tut.** `compose.yaml` verlangt die Variable mit einer
   Fehlermeldung statt eines Vorgabewerts. Wer die Ausgabe nach `/dev/null`
   schickt — etwa bei einem `stop api`, dessen Wirkung er gleich messen will —
   misst gegen einen Dienst, der nie gestoppt wurde. Passiert in der G4-Abnahme,
   fünfzehn Minuten lang. Der Aufruf ist:

   ```sh
   export IMAGE_TAG=$(make -s image-tag) CONTRIBUTIONS_TRANSPORT=off
   docker compose -f compose.yaml -f compose.rollout.yaml -f compose.lab.yaml stop api
   docker ps -a --filter name=timseil-api-1 --format '{{.Status}}'   # nachsehen
   ```

**Ein Screenshot schlägt beides.** Was der Browser wirklich zeigt, steht weder
in den Bytes noch in einer DOM-Abfrage aus der Browser-Erweiterung heraus — die
hat in der G4-Abnahme dreimal `— NO DATA` gemeldet, während auf dem Bild die
Zahl stand. Dieselbe Klasse Fund wie das nicht beobachtbare `close`-Ereignis
aus G3: leere oder alte Werte aus diesem Weg beweisen nichts.

## Wie lange die Fußzeile eine tote API für lebendig hält

`next.config.ts` gibt dem Profil `health` die Zahlen aus dem `Cache-Control` des
Contracts (ADR 0009): `revalidate: 60`, `expire: 600`.

**Gemessen, nicht aus dem Profil abgelesen** (G4, `/about`, API nachweislich
gestoppt): der Wert steht noch **52 Sekunden**, dann `— NO DATA`. Der Eintrag war
beim Stoppen rund acht Sekunden alt, es ist also das `revalidate`-Fenster, das
den Ausschlag gibt. `expire: 600` erzeugt **keine** Gnadenfrist — sobald
aufgefrischt werden muss und das fehlschlägt, wirft `healthCached`, und die
Zelle sagt wieder nichts. Wer die Zahl neu braucht, misst sie:

```sh
export IMAGE_TAG=$(make -s image-tag) CONTRIBUTIONS_TRANSPORT=off
docker compose -f compose.yaml -f compose.rollout.yaml -f compose.lab.yaml stop api
docker ps -a --filter name=timseil-api-1 --format '{{.Status}}'   # wirklich aus?

start=$(date +%s)
while :; do
  v=$(curl -sS http://127.0.0.1:8080/about | grep -o 'BUILD [0-9a-f]\{6,\}' | head -1)
  echo "+$(( $(date +%s) - start ))s ${v:-GONE}"
  [ -z "$v" ] && break
  sleep 10
done
```

**Nicht `/`.** Diese Route rendert zusätzlich den korrelierten Leser, der pro
Besucher fragt — jede Zählung über Anfragen an die API misst dort ihn und nicht
den Cache.

## `Cannot find module` — jede Seite 500, das Paket ist aber da

Gemessen in G1, beim ersten neuen Web-Paket seit es den Dev-Stack gibt.

```
web-1 | Error: Cannot find module '@tailwindcss/postcss'
web-1 |  GET / 500 in 41ms
```

```sh
docker compose -f compose.dev.yaml exec web npm ls @tailwindcss/postcss
# web@0.1.0 /app
# `-- @tailwindcss/postcss@4.3.3        ← liegt da. Trotzdem 500.
```

**Zwei Schichten, und die zweite ist der Grund, warum die naheliegende Reparatur
wie ein Fehlschlag aussieht.**

1. `node_modules` ist ein anonymes Volume (damit der Bind-Mount es nicht
   verdeckt), `.next` ein benanntes. `docker compose up --build` fasst keines
   von beiden an — anonyme Volumes übernimmt Compose in den neuen Container,
   benannte bleiben ohnehin. Die neue Abhängigkeit erreicht also das **Image**
   und nie den **Container**.
2. Der erste gescheiterte Start kompiliert sich in `.next` hinein. Danach wirft
   der Cache weiter, auch wenn `node_modules` längst stimmt — deshalb ändert
   `--renew-anon-volumes` **allein** nichts, und man sucht an der falschen
   Stelle weiter.

```sh
make dev-reset && make dev      # räumt beide Schichten, die DB wird neu geseedet
```

**`make dev` weist den Fall seit G1 vorher ab.** Es merkt sich die Prüfsumme von
`web/package-lock.json` in `.make/dev-lockfile.sha256` und hält an, wenn sie sich
seit dem letzten Start bewegt hat. Der Stempel liegt im Arbeitsverzeichnis, nicht
im Volume: **ein frischer Klon neben einem alten Volume ist damit nicht gedeckt**
— dieselbe Meldung, dieselbe Reparatur.

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

## Schriften und Theme

Seit G2. Beides ist im Betrieb unauffällig und genau deshalb hier aufgeschrieben
— wer nachsehen will, ob es noch stimmt, hat sonst keinen Anhaltspunkt.

### Die Schnitte liegen im Image, nicht bei Google

`next/font/google` lädt die drei Familien **zur Buildzeit** herunter und legt
sie unter `.next/static/media/*.woff2`. Zur Laufzeit geht kein Request an
fonts.gstatic.com — das ist ein Abnahmekriterium der Phase und die Bedingung
dafür, dass die Datenschutzseite stimmt, wenn sie sagt, dass keine dritte Partei
im Anfrageweg steht (ADR 0006).

**Die Standalone-Falle greift hier.** `.next/standalone` enthält `.next/static`
nicht; die zweite `COPY`-Zeile in `web/Dockerfile` trägt die Schriften ins
Image. Fehlt sie, rendert die Seite in `system-ui` und niemand bekommt einen
Fehler zu sehen.

```sh
# 1 — im Build: kommt irgendwo eine Google-Adresse vor?
cd web && npm run build
grep -rl 'fonts\.gstatic\.com\|fonts\.googleapis\.com' .next/static .next/standalone
#   nichts = richtig. Treffer unter .next/dev/ sind Dev-Artefakte und gehen
#   nicht ins Image.

# 2 — was ein lateinischer Text wirklich holt: die fünf Dateien mit `.p.` im Namen
ls -l .next/static/media/*.p.*.woff2
#   Chakra Petch 400/500/600, Geist variabel, JetBrains Mono variabel
#   zusammen rund 97 KB (gemessen 99 480 B, 28.08.2026)

# 3 — im Browser gegengeprüft, weil ein Grep nicht beweist, was das Netz tut
#   performance.getEntriesByType('resource').filter(e => /gstatic|googleapis/.test(e.name))   → []
#   performance.getEntriesByType('resource').filter(e => /\.woff2$/.test(e.name))            → alle same-origin
```

Die 23 Dateien im Verzeichnis sind kein Fehler: Google liefert je Familie
mehrere `unicode-range`-Schnitte, der Browser holt nur den, den der Text
braucht.

### Das Theme steht vor dem ersten Paint

Die Wahl liegt in `localStorage["ts.theme"]` — einer der zwei Schlüssel, die
Invariante 9 erlaubt; eine ESLint-Regel hält die Zahl. Gesetzt wird das Attribut
von einem Inline-Script im `<head>` (`lib/theme.ts` → `components/ThemeScript.tsx`),
bevor irgendetwas gezeichnet wird.

**Ohne gespeicherte Wahl ist die Seite Terminal Noir**, auch auf einem hellen
Rechner. Das ist eine Entscheidung, kein Versehen — ADR 0043.

```sh
# Steht das Script im ausgelieferten HTML, und ohne async/defer?
curl -s https://timseil.dev/ | grep -o '<script>[^<]*ts\.theme[^<]*</script>'
```

Es steht **hinter** dem Stylesheet-Link, und das ist richtig so: ein klassisches
Inline-Script ist parser-blockierend und wartet auf ausstehende Stylesheets, der
erste Paint wartet auf dasselbe. Steht es dort mit `async` oder `defer`, ist das
ein Fehler — dann flackert die Seite.

Fehlersuche, wenn ein Besucher „das Theme springt beim Laden" meldet:

| Beobachtung | Ursache |
|---|---|
| kurz dunkel, dann hell | das Script läuft nicht — im HTML nachsehen, ob es da ist |
| bleibt immer Noir | `localStorage` ist blockiert (Private Mode). Der `try` fängt es, die Erinnerung fehlt — kein Defekt |
| Theme wechselt, Unterstrich bleibt cyan | ein Akzent-Literal ist zurückgekommen. `make check-tokens` |
| helle Palette, dunkle Scrollleiste | `color-scheme` fehlt im `[data-theme]`-Block |

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

- **Ein `.tsx` läuft nicht unter `node --test`.** Node 24 entfernt TS-Typen,
  transformiert aber kein JSX, und eine DOM-Bibliothek wäre eine neue
  Abhängigkeit. Deshalb liegt seit G3 jede Verzweigung des Chromes als Funktion
  in `lib/` und jedes Bauteil ist Markup plus ein Aufruf. Die Regel ist eine
  Disziplin, keine erzwungene Schranke — sie gilt, bis Playwright vor H1 kommt.

## Das Chrome abnehmen — Hydration und 44 × 44

Die Abnahme von G3 ist **null Hydration-Warnungen in der Konsole**. Das ist
nichts, was `make check` sehen kann, und nichts, was ein einzelner Seitenaufruf
beweist. Der Ablauf:

```bash
cd web && npm run build && PORT=3100 npm run start   # Produktion
cd web && PORT=3101 npm run dev                       # Dev, unminifiziert
```

Beide Modi fahren, sie scheitern verschieden: Produktion zeigt die echte Hülle
mit minifizierten Meldungen, Dev die lesbare Differenz und StrictModes doppelten
Aufruf.

**Zuerst den Kanarienvogel.** Ein `console.error('CANARY')` absetzen und
nachsehen, dass er in der Konsolenerfassung ankommt. Eine leere Konsole ist ohne
diesen Schritt keine Aussage, sondern nur ein stiller Kanal — derselbe Grund, aus
dem `clock.test.ts` seinen `TZ=UTC`-Lauf neben den Kathmandu-Lauf stellt.

**Dann mindestens ein Dutzend Ladevorgänge**, über mehrere Routen, einmal kalt
ohne `localStorage` und einmal mit `ts.theme` gesetzt. Wäre der Uhren-Store
falsch, ist der Unterschied ein **Rennen**: er erscheint nur, wenn eine
Sekundengrenze zwischen Server-Render und Hydration fällt. Ein Aufruf trifft das
selten, zwölf meistens.

Bestanden ist kein Eintrag auf:

```
/hydrat|did not match|Text content does not match|server-rendered HTML|getSnapshot should be cached/i
```

Der letzte ausdrücklich mit dabei — er ist eine *Warnung*, kein Fehler, und die
Form, die `useSyncExternalStore` einführt, sobald `clockSnapshot` aufhört, ein
Primitiv zu liefern.

Im selben Durchgang mitprüfen: genau ein `<main>`, und ein `Tab` aus dem
Kaltstart landet auf `.skip`.

### Breiten messen, nicht schätzen

Das Fenster zu ziehen ist unzuverlässig (hier meldete `resize_window` Erfolg und
`window.outerWidth` blieb 0). Ein Iframe fester Breite wertet dieselben Media
Queries gegen seinen eigenen Viewport und ist reproduzierbar:

```js
frame.style.width = "899px";  // dann 900, dann die übrigen fünf
getComputedStyle(d.querySelector(".head")).height   // 52 bzw. 66
```

Erwartet: **66** bei 1440 · 1081 · 1079 · 1024, **52** bei 899 · 719 · 390, und
`.ruler` sowie `.nav-desktop` verschwinden genau dort, wo `.nav-button`
erscheint. Eine im Iframe gemessene Spaltenbreite ist um die Scrollbalkenbreite
schmaler als auf einem Gerät ohne klassischen Balken — bei 390 also 331 statt
346. Das ist der Balken, nicht die Formel.

### 44 × 44 — gemessen, nicht gegrept

Die Lehre aus `K-27`: der erste Konsistenzlauf grepte nach `min-height:44px` und
übersah 17 Chips.

```js
[...d.querySelectorAll('a,button,[role="button"],[role="option"],summary,[tabindex]')]
  .filter(el => el.getBoundingClientRect().width > 0)
  .map(el => { const r = el.getBoundingClientRect();
               return { t: el.textContent.trim().slice(0,20),
                        b: [Math.round(r.width), Math.round(r.height)] }; })
  .filter(x => x.b[0] < 44 || x.b[1] < 44)
```

**Und daneben immer `matchMedia('(pointer: coarse)').matches` ausgeben.** Die
44px-Regel in `layout.css` hängt am Zeiger, nicht an der Breite. Ein
Desktop-Chrome auf 390px gezogen bleibt `fine`, die Regel feuert nie, und der
Bericht kommt voll mit 11px-Punkten zurück, die auf diesem Gerät *korrekt* 11px
sind. Ist `coarse` falsch, sagen die Zahlen nichts über mobil — **so
aufschreiben, keinen Mobil-Erfolg behaupten**, bis Playwright `hasTouch` setzen
kann.

Was sich trotzdem messen lässt, ist die Regel selbst: den coarse-Block ohne seine
Media Query in die Seite injizieren und neu messen. Das beweist nicht, dass die
Query auf einem Gerät greift, aber dass sie für jedes Ziel wirklich 44px
erzeugt — und genau dort kann sie still versagen, weil `min-height` auf ein
nicht-ersetztes Inline-Element **nicht** wirkt. Gemessen: 20 Ziele, keins darunter.

### Zwei Fallen, die diese Abnahme gefunden hat

- **Der CSS-Minifier schreibt Dauern um.** `tokens.css` sagt `--d-scramble: 220ms`,
  ausgeliefert wird `.22s`. Wer den Wert zur Laufzeit liest, muss beide Formen
  können; ein `parseInt` liefert lokal 220 und in Produktion 0. `lib/scramble.ts`
  hat dafür `parseMs`, und der Test kennt beide Schreibweisen.
- **`requestAnimationFrame` steht in einem Hintergrund-Tab still.** Wird eine
  Messung getrieben, ohne dass das Fenster vorn ist, bleibt der Scramble in der
  Schleife hängen und `data-busy` gesetzt. Kein Defekt — die Schleife läuft
  weiter, sobald der Tab sichtbar wird —, aber eine leere Frame-Liste heißt dort
  „Tab war verborgen", nicht „Animation läuft nicht".

## Die Sprachrouten nachmessen

Drei Sprachen, und **Englisch trägt kein Präfix** — daran hängt alles, was
schiefgehen kann. Der Baum liegt unter `app/[lang]/`, `proxy.ts` schreibt
`/about` intern auf `/en/about` um und leitet `/en/about` mit 308 nach `/about`
zurück. ADR 0046.

**Gegen ein Produktionsbild, nicht gegen `next dev`.** Der Dev-Server hydriert
auf diesem Baum nicht (Backlog, 28.08.2026, G4) — die Uhr steht, der
Theme-Umschalter tut nichts, und der Sprachumschalter täte es dort ebenso wenig.
Wer den Umschalter im Dev-Modus probiert, probiert etwas, das nicht läuft.

```bash
cd web && npm run build && npx next start -p 3111
B=http://127.0.0.1:3111
```

### Was aus den Bytes zu holen ist

```bash
# 1 — die Sprache steht am Wurzelelement, und zwar die der ROUTE
for p in / /de /fr /about /de/about /fr/work; do
  printf '%-12s %s\n' "$p" "$(curl -s $B$p | grep -o '<html lang="[a-z]*"' | head -1)"
done

# 2 — vier alternate-Links, x-default zeigt auf die englische Fassung
curl -s $B/ | grep -o '<link rel="alternate" hrefLang="[^"]*" href="[^"]*"/>'
#   React schreibt das Attribut als hrefLang; HTML-Attributnamen sind
#   case-insensitiv, das ist kein Fund.

# 3 — /en ist keine Adresse
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' $B/en/about   # 308 -> /about

# 4 — DIE FALLE, die die ganze Logik trägt: eine Sprache ist ein ganzes
#     Segment, kein Präfix. Ein Treffer hier heißt, /design und /french-toast
#     werden in der falschen Sprache ausgeliefert.
curl -s -o /dev/null -w '%{http_code}\n' $B/english     # 404
curl -s -o /dev/null -w '%{http_code}\n' $B/es/about    # 404

# 5 — der unübersetzte Block sagt es selbst
curl -s $B/de | grep -o '<\(header\|main\|footer\)[^>]*lang="[a-z]*"'
curl -s $B/  | grep -c 'lang="en"'      # 1 — nur <html>, sonst keine Marke
```

### Was nur der Browser zeigt

Der Umschalter navigiert clientseitig, also ist die Frage nicht „steht das
richtige im HTML", sondern „ändert sich das Wurzelelement bei einer Navigation,
die keinen Seitenaufbau macht". **Zustand vom DOM lesen, nicht aus
Ereignislisten** — ein `close`-Event ist über die Browser-Erweiterung nicht
beobachtbar (Backlog, 28.08.2026, G3).

```js
// auf /de/about, in der Konsole
const en = [...document.querySelectorAll(".lang-option")].find(li => li.textContent.startsWith("EN"));
document.querySelector(".lang-button").click();
en.click();
await new Promise(r => setTimeout(r, 1200));
({ url: location.pathname,                                   // /about
   htmlLang: document.documentElement.lang,                  // en
   mainLang: document.querySelector("main").getAttribute("lang"),   // null
   canonical: document.querySelector('link[rel=canonical]').href })
```

Der Tastaturweg dazu: `.lang-button` fokussieren, dreimal `ArrowDown`
(öffnet, dann zweimal weiter), `aria-activedescendant` lesen — muss
`lang-option-2` sein —, dann `Enter`. Gemessen am 29.08.2026: `/fr/about`.

**Und der Kanarienvogel zuerst.** Vor jeder Aussage „null Hydration-Warnungen"
eine eigene Meldung absetzen und wiederfinden; sonst beweist eine leere Konsole
nur, dass niemand zugehört hat.

## Die maschinenlesbaren Flächen nachmessen

Vier Adressen, die kein Besucher aufruft und die trotzdem falsch sein können:
`/robots.txt`, `/sitemap.xml`, `/feed.xml`, `/og.png`. Dazu der JSON-LD-Block
auf `/`. ADR 0047.

**Zwei Dinge, bevor irgendetwas gemessen wird.**

`make check` **baut nicht**. Keine der 21 Prüfungen ruft `next build`, und diese
vier Dateien sind genau die Sorte, die typecheckt und beim Bauen bricht. Wer sie
angefasst hat und nur `make check` laufen lässt, hat sie nicht geprüft.

Und wieder: **gegen ein Produktionsbild, nicht gegen `next dev`.** Beim OG-Bild
hat das einen eigenen Grund — der Dev-Server hat das ganze Projekt auf der
Platte, das Image nur, was der Tracer kopiert hat. Ein `readFileSync`, das
lokal geht und im Container fehlschlägt, ist in `next dev` unsichtbar.

```bash
cd web && npm run build && npx next start -p 3111
B=http://127.0.0.1:3111
```

### Was aus den Bytes zu holen ist

```bash
# 1 — die vier Dateien antworten, und keine davon bekommt eine Sprache
for p in /robots.txt /sitemap.xml /feed.xml /og.png; do
  printf '%-14s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' $B$p)"
done
#   Alle vier 200. Ein 404 heißt: der Pfad fehlt in RESERVED
#   (lib/i18n/routes.ts) und proxy.ts hat ihn nach /en/... umgeschrieben.

# 2 — die Sitemap nennt nur, was indexierbar ist
curl -s $B/sitemap.xml | xmllint --format - | grep -c '<url>'      # 3
curl -s $B/sitemap.xml | grep -c 'x-default'                       # 3
#   Drei URLs sind / /de /fr. Sechs Routen sind Stubs und sagen noindex;
#   sie kommen dazu, wenn ihre H-Phase das Boolean in lib/seo/pages.ts kippt.
#   Erscheint /about hier, WÄHREND es noch noindex trägt, widersprechen sich
#   die Seite und die Sitemap — dann sind die zwei Listen wieder zwei.

# 3 — die beiden XML-Dokumente sind wohlgeformt
curl -s $B/sitemap.xml | xmllint --noout - && echo "sitemap ok"
curl -s $B/feed.xml    | xmllint --noout - && echo "feed ok"

# 4 — der Feed ist absichtlich leer, und das ist der Zustand, nicht ein Defekt
curl -s $B/feed.xml | grep -c '<item>'                             # 0
#   H9 hängt die Einträge ein. Bis dahin hätte jedes <item> ein <link> auf
#   eine 404, weil /blog/<slug> noch keine Route ist.

# 4b — und der Feed trägt den Header seiner drei Nachbarn
for p in /robots.txt /sitemap.xml /og.png /feed.xml; do
  printf '%-14s %s\n' "$p" "$(curl -sI $B$p | grep -i '^cache-control' | tr -d '\r')"
done
#   Alle vier: public, max-age=0, must-revalidate.
#   Sagt der Feed stattdessen `s-maxage=31536000`, ist die Zeile in
#   app/feed.xml/route.ts verlorengegangen und Next setzt wieder seinen
#   eigenen Wert — ein Jahr auf einem Dokument, das sich ändert. Gefunden in
#   der G5-Abnahme, weil `make check` keine Header liest und `next build`
#   auch nicht.

# 5 — der Ausweis: genau EIN ld+json-Block, und kein rohes < darin
curl -s $B/ | python3 -c '
import re, sys, json
blocks = re.findall(r"<script type=\"application/ld\+json\">(.*?)</script>", sys.stdin.read(), re.S)
print("blocks:", len(blocks))
for b in blocks:
    print("raw < im Text:", "<" in b)          # muss False sein
    print(json.dumps(json.loads(b))[:120])
'
#   DIE FALLE HIER IST DIE RSC-NUTZLAST. Sie trägt das Markup ein zweites Mal
#   in <script>-Tags; ein grep über die rohen Bytes zählt zwei Dokumente.
#   Der Block oben liest das Element, nicht die Datei.

# 6 — das Bild ist ein Bild, und zwar in der Größe, die im Kopf steht
curl -s $B/og.png -o /tmp/og.png
python3 -c "
import struct
d = open('/tmp/og.png','rb').read()
assert d[:4] == b'\x89PNG', 'not a PNG at all'
print(len(d), 'bytes,', *struct.unpack('>II', d[16:24]))"    # ... 1200 630
curl -s $B/ | grep -o 'og:image:width" content="[0-9]*"'     # muss 1200 sagen
```

### Die Falle, in die diese Messung selbst gelaufen ist

**`hrefLang`, nicht `hreflang`.** Ein `grep hreflang` über den Kopf findet
**nichts**, und die naheliegende Schlussfolgerung — „G5b hat die vier Links
kaputtgemacht" — ist falsch. React serialisiert die JSX-Prop mit großem L;
HTML-Attributnamen sind case-insensitiv, Crawler lesen es korrekt. Steht schon
weiter oben in diesem Runbook, und ist beim Bauen von G5b trotzdem genau einmal
passiert.

```bash
curl -s $B/about | grep -o 'rel="alternate"[^>]*'
#   fünf Zeilen: vier hrefLang plus der Feed-Link
```

### Was nur das Bild zeigt

**Ein Screenshot schlägt die Bytes.** `content-type: image/png` und 1200 × 630
sagen nichts darüber, ob auf der Karte etwas steht — ein Satori-Baum, in dem ein
Wert `undefined` ist, rendert sauber und leer.

```bash
curl -s $B/og.png -o /tmp/og.png && xdg-open /tmp/og.png
```

Zu sehen sein müssen: die Wortmarke mit cyanfarbenem `://`, ein cyanfarbener
Strich, der Beschreibungssatz in Hellgrau, unten Name und Rolle in Grau — auf
fast schwarzem Grund. **Ist der Grund durchsichtig oder das Bild leer**, hat
`requireTokens()` nicht zugeschlagen, wo es sollte: dann fehlt ein Token in
`tokens.css` und das Bild zeichnet Fallbacks.

### Und im Container, nicht nur im Projektordner

Der einzige Weg, die standalone-Falle für `og.png` wirklich auszuschließen:

```bash
make image-web
docker run -d --rm --name og-probe -p 3222:3000 \
  -e API_INTERNAL_URL=http://127.0.0.1:9 \
  ghcr.io/g1ng4r/timseil-web:$(make -s image-tag)
curl -sI http://127.0.0.1:3222/og.png | grep -i content-type    # image/png
docker stop og-probe
```

Antwortet die Route hier mit 500, während sie unter `npx next start` ein Bild
lieferte, fehlt `styles/tokens.css` im Image — `outputFileTracingIncludes` in
`next.config.ts` ist die Zeile, die es hineinlegt.

## Die Zustandssprache abnehmen

Das Abnahmekriterium von G6 ist ein Satz — *jeder Zustand hat ein zweites
Merkmal neben der Farbe* — und er zerfällt in zwei Prüfungen, die verschiedene
Werkzeuge brauchen. ADR 0048.

**Die Tabelle prüft `make check`.** `web/lib/state/words.test.ts` hält vier
Regeln fest, und zwei davon sind die, die ohne Test verrutschen: es gibt weniger
Töne als Zustände (die Farbe kann also gar keine Kennung sein), und die Füllung
des Punktes stimmt mit der Klasse der Antwort überein — niemand darf einem
ungemessenen Zustand die Füllung eines gemessenen geben.

**Den Rest sieht nur ein Browser**, und zwar an einem Produktionsbau. `next dev`
hydriert nicht (Backlog, 28.08.2026, G4).

### Das Rig

```bash
docker compose -f compose.dev.yaml up -d --wait db migrate seed api
cd web && npm run build
API_INTERNAL_URL=http://127.0.0.1:8080 npx next start -p 3111
```

`API_INTERNAL_URL` ist der ganze Trick: `lib/http/url.ts` fällt sonst auf
`http://api:8080` zurück, den Namen im Docker-Netz, den ein Prozess auf dem Host
nicht auflöst.

### DEGRADED ist herstellbar, nicht zu erfinden

`api/internal/health/health.go` antwortet `degraded`, wenn das eigene System
nicht `live` ist — „A missing self system is `degraded`, not a 500." Also einen
Slug setzen, den es nicht gibt:

```bash
SITE_SYSTEM_SLUG=no-such-system \
  docker compose -f compose.dev.yaml up -d --wait --force-recreate api
curl -sS http://127.0.0.1:8080/api/health | python3 -c 'import sys,json;print(json.load(sys.stdin)["status"])'
```

**Und dann warten.** Die Startseite kippt sofort — `healthLive` ist unkorreliert
mit keinem Cache —, die Fußzeile und der Menüstreifen hängen an `healthCached`
mit `revalidate: 60`. Gemessen am 29.08.2026: die Zeile auf `/` sagte nach zehn
Sekunden DEGRADED, die beiden anderen nach zwanzig. Wer nach fünf Sekunden
misst, misst den Cache und hält ihn für einen Defekt.

`— NO DATA` geht denselben Weg mit `docker compose … stop api`, und dort dauert
es länger: gemessen 40–50 s, bis die zwei gecachten Zellen nachziehen. `/`
antwortet die ganze Zeit `200` — die Störung bleibt eine (#94).

### Was aus den Bytes zu holen ist

```sh
curl -sS http://127.0.0.1:3111/ \
  | grep -oE '<span class="st" data-tone="[a-z]+"><span class="st-dot"[^>]*></span><span class="st-word">[^<]+' \
  | sed -E 's/.*data-tone="([a-z]+)".*data-dot="([a-z]+)".*st-word">(.*)/\3  tone=\1  dot=\2/'
```

Ausgabe pro Zustandszelle eine Zeile: `ONLINE  tone=acc  dot=solid`.
`data-pulse` steht nur bei `solid` und lässt sich mit demselben Aufruf
gegenzählen.

**Kein `.*` in dem Muster, und das ist Absicht.** Die erste Fassung dieses
Befehls stand als `grep -o '<span class="st" [^>]*>.*\?</span></span>'` da und
lieferte auf diesem Rechner das Richtige — GNU grep behandelte `.*\?` faul.
Verlassen kann man sich darauf nicht: in BRE ist `\?` hinter einem `*` nicht
definiert, und greedy gelesen zöge das Muster vom ersten Zustand bis zum letzten
`</span></span>` des Dokuments durch, also **eine** Trefferzeile statt drei. Das
Muster oben kann zwei Elemente gar nicht überspannen.

**Und hier gilt die G4-Falle unverändert**, weil die drei Zellen gestreamte
Inseln sind: der Platzhalter steht in Dokumentreihenfolge **vor** dem Wert, und
die RSC-Nutzlast trägt beides ein zweites Mal in `<script>`-Tags. Ein Muster,
das beim ersten Treffer aufhört, findet immer den Ruhezustand.

**Dazu eine dritte, in G6 gefunden: `grep -c` zählt Zeilen, keine Vorkommen.**
Das ausgelieferte HTML ist *eine* Zeile. `grep -c 'st-nodata-text'` meldete
`2`, während im Dokument acht standen — vier Platzhalter und vier Werte. Die
Zahl sah aus wie eine Aussage über den Inhalt und war eine über Zeilenumbrüche.
Richtig gezählt wird mit `grep -o … | wc -l` oder in Python.

### Was nur das Bild zeigt

Zwei Aufnahmen, und die zweite ist die eigentliche Abnahme:

1. **Graustufen.** `document.documentElement.style.filter = 'grayscale(1)'`,
   dann in die Metaleiste zoomen. Bleiben ONLINE, DEGRADED und `— NO DATA`
   unterscheidbar, trägt die Farbe die Information nicht.
2. **Die Amber-Palette.** `document.documentElement.dataset.theme = 'amber'`
   während DEGRADED steht. `tokens.css` schickt Degraded dort auf Mint —
   gemessen am 29.08.2026 wanderte Wort und Ring von `rgb(255,176,0)` auf
   `rgb(127,209,174)`, und Wort und Füllung blieben, was sie waren. **Das ist
   der stärkere Beleg als die Graustufen:** die Farbe hat vollständig
   gewechselt, und der Zustand war weiterhin derselbe abzulesen.

Am Punkt selbst nachmessen, nicht am Stylesheet:

```js
const d = document.querySelector('.st-dot');
({ dot: d.dataset.dot, anim: getComputedStyle(d).animationDuration,   // 2.6s
   ring: getComputedStyle(d).boxShadow, size: getComputedStyle(d).width })
```

`animationDuration` ist der Beleg dafür, dass `--d-pulse` gelesen wird — das
Token lag seit G1 unbenutzt da. **6px in Fußzeile und Menüstreifen, 7px sonst**,
und das ist Absicht: das Chrome-Blatt ist an diesen zwei Stellen die verbindliche
Fassung, das Handoff-Bauteil überall sonst.

### Zwei Füllungen haben heute keinen Aufrufer

`barred` (OFFLINE) und `dash` (QUEUED, `— NO DATA` als Punkt) stehen in der
Tabelle und werden von keiner Seite gezeichnet: OFFLINE kann `/api/health` nicht
melden, und die Metaleiste zeigt ohne Antwort `<NoData/>` als Text statt eines
Punktes. Belegt sind sie durch `words.test.ts`, nicht durch ein Bild. Der erste
Betrachter ist G7s Galerie, der erste Einsatz H1 und H6.
