# ADR 0045 — Zwei Leser, ein Endpunkt, und der Cache, der mit dem Container stirbt

**Status:** Angenommen
**Datum:** 2026-08-28
**Betrifft:** G4, G5, G6, G7, H1–H13, L4
**Invarianten:** 1 (keine erfundenen Zahlen), 3 (Metriken nur für `state='live'`)

## Kontext

G3 hat die Naht gelegt: `FooterMeta` nimmt `build`, `uptime` und `online` als
Props, sie stehen auf `null`, und `— NO DATA` ist der Zustand, den man bekommt,
wenn man nichts sagt. G4 füllt sie.

Der Bauplan verlangt dafür vier Dinge in einem Satz (Zeile 1208): Client aus den
generierten Typen, serverseitig `http://api:8080` und clientseitig `/api`, die
Request-ID durchgereicht, und Next 16 Cache Components mit vorgerenderter Hülle,
Metriken über `use cache` mit Tags, invalidiert vom Deploy. Abgenommen ist es,
wenn ein Trace den ganzen Weg zeigt und die Invalidierung getestet ist.

Der Kopfkommentar von `lib/http/serverFetch.ts` war die eigentliche
Spezifikation. Er zählte auf, was fehlt, und endete mit: *„If this file grows a
second concern before G4, that is the moment to stop and write G4 instead."*

Drei Angaben des Bauplantextes haben beim Nachmessen nicht mehr gestimmt, und
alle drei ändern den Zuschnitt der Phase.

## Entscheidung

**Ein Endpunkt, zwei Leser, und die Trennung liegt genau dort, wo die
Laufzeit sie erzwingt.** `lib/api/client.ts` transportiert und entscheidet
nichts; `lib/api/health.ts` liest ein Dokument und entscheidet, was ein
fehlender Wert bedeutet; `lib/api/readers.ts` hält die zwei Leser nebeneinander,
damit niemand einen dritten schreibt, ohne den Grund gesehen zu haben.

## Konsequenzen

### Die Request-ID kann nicht in eine gecachte Grenze, und das ist keine Meinung

Nexts eigene Dokumentation, mitgeliefert unter
`node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md`,
Zeile 196:

> Cached functions and components **cannot** access runtime APIs like
> `cookies()`, `headers()`, or `searchParams` […] On a dynamically rendered
> route this surfaces when the route runs, so it **can pass `next build` and
> fail under `next start`**.

Die ID des Besuchers lebt in `headers()`. Sie als Argument hineinzureichen wäre
nicht der Ausweg, sondern die schlimmere Hälfte: Argumente gehen in den
Cache-Key, ein Cache mit einer ID pro Besucher ist keiner, und ein Cache, der
das Argument ignoriert, servierte allen die ID des ersten. Es ist dieselbe Form,
vor der ADR 0044 für `usePathname()` gewarnt hat, eine Ebene tiefer.

Also zwei Leser:

- **`healthLive()`** liest `headers()`, reicht `X-Request-Id` und einen
  Kind-Span weiter, fragt bedingt und cacht nichts. Sie trägt den Trace-Beleg
  und lebt auf `/`, wo F1b sie hingestellt hat.
- **`healthCached()`** fasst `headers()` nicht an und teilt eine Antwort unter
  allen Besuchern. Die Zeile, die die API dafür schreibt, steht unter einer
  eigenen ID — der des Füllvorgangs, nicht der irgendeines Besuchers. Das ist
  die wahrheitsgemäße Zuordnung: **eine** Anfrage hat sechzig Sekunden Besucher
  bedient.

Der Preis ist benannt statt versteckt: die Zahlen in der Fußzeile hängen an
keinem Trace. Wer wissen will, welcher Aufruf sie erzeugt hat, findet ihn über
den Zeitstempel und die `upstream_request_id` der Füll-Zeile, nicht über seine
eigene Anfrage.

### `healthCached` wirft, obwohl der Client ausdrücklich nie wirft

`lib/api/client.ts` erbt die Regel von `serverFetch`: kein Wurf, ein
Vereinigungstyp, weil die Seite auf jeden Fehlschlag dieselbe Antwort hat und
ein vergessenes `try` sonst eine 500 auf einer Seite erzeugt, deren einzige
Aufgabe das Eingeständnis war.

`healthCached` kehrt das um — über `healthOrThrow` in `lib/api/health.ts`, damit
die Entscheidung dort steht, wo ein Test sie erreicht — und zwar für genau einen
Satz: **`use cache` speichert jeden Rückgabewert, auch einen, der „keine Daten"
bedeutet.** Fiele der Füllvorgang in das Rollout-Fenster aus #157, zeigte die
Fußzeile bis zu ein Cache-Fenster lang `— NO DATA`, lange nachdem die API zurück
ist — und täte damit genau das, was `compose.yaml:583` einem Cache hier
verbietet. Der einzige Hebel, den `use cache` anbietet, um etwas *nicht* zu
speichern, ist, es nicht zurückzugeben.

**Nachgemessen, nicht angenommen** (`sha-297cb52`, Dev-Stack, kalter Cache): mit
gestoppter API bleibt die Zelle leer, und die erste Anfrage nach der Rückkehr
der API trägt die Zahl. Ein geworfener Fehler wird nicht gespeichert.

### `ONLINE` heißt Herkunft, nicht Leben

Die Zelle sagt: *diese Antwort kam von der API*. Sie sagt nicht: *die API lebt
in dieser Sekunde*. Der Unterschied ist ein Cache-Fenster breit, und er ist
gemessen — gegen `/about`, das nur die beiden gecachten Inseln rendert, mit
nachweislich beendetem `api`-Container (`Exited (0)`, Proxy antwortet 503):

```
+0s   BUILD 6e16275     ← API seit dieser Sekunde gestoppt
+40s  BUILD 6e16275
+52s  — NO DATA
```

**52 Sekunden**, und der Eintrag war beim Stoppen rund acht Sekunden alt — die
Zelle hört also innerhalb eines `revalidate`-Fensters auf, `ONLINE` zu
behaupten. Das `expire: 600` hat dabei **keine** Gnadenfrist erzeugt: sobald
`revalidate` verstrichen ist, hängt die nächste Anfrage an einer Auffrischung,
die fehlschlägt, und `healthCached` wirft. Das ist die ehrlichere der beiden
denkbaren Auslegungen und war nicht vorhergesagt — die erste Fassung dieses ADR
behauptete eine Frist von bis zu zehn Minuten, aus dem Profil abgelesen statt
gemessen.

Die Alternative — den Statuspunkt pro Anfrage ungecacht zu holen — wäre ein
Hop auf jeder der zehn Seiten für ein Wort, und sie hätte einen eigenen Fehler:
der Punkt könnte dann etwas anderes sagen als die Zahl daneben, die aus einer
älteren Antwort stammt. Ein Bauteil, dessen zwei Hälften sich widersprechen
dürfen, ist schlechter als eines, dessen Bedeutung aufgeschrieben ist.

Der Punkt pulst weiterhin nicht. Dass dieser Container läuft, sagt nichts über
die API — das war schon G3s Satz und bleibt richtig.

### Dass der Cache überhaupt greift, ist gemessen — und dreimal falsch gemessen

`/` ist die falsche Route dafür. Sie rendert **beide** Leser: die zwei gecachten
Inseln und die korrelierte auf der Seite selbst. Zehn Seitenaufrufe erzeugen dort
zehn API-Anfragen, und das sieht wie ein toter Cache aus — es ist `healthLive`,
das genau einmal pro Besucher fragt und das auch soll.

Gemessen auf `/about`, das nur die gecachten Inseln trägt, aus einem kalten
Start: **zehn Aufrufe, null API-Anfragen** nach der ersten Füllung.

### Der Deploy invalidiert, weil der Container stirbt — nicht weil jemand ruft

Es gibt **kein** `revalidateTag` in diesem Repository. Das ist entschieden, nicht
unfertig, und der Grund stand vor dieser Phase schon in `compose.yaml:583`:

> tmpfs und nicht ein benanntes Volume […] ein Cache, der einen Image-Wechsel
> ÜBERLEBT, ist genau die „die Seite zeigt die Zahl von letzter Woche"-Störung,
> gegen die diese Seite existiert — tmpfs stirbt mit dem Container, und das ist
> die richtige Lebensdauer für etwas, das an einen Build gebunden ist.

`cacheTag("health")` steht trotzdem da. Es benennt den Eintrag für den Tag, an
dem ein zweiter web-Container oder ein geteilter Cache-Handler einen Aufruf von
außen sinnvoll macht.

**Eine Revalidate-Route in `web` wäre außerdem von außen nicht erreichbar.**
Traefik gibt `PathPrefix(/api)` mit Priorität 100 an den Go-Dienst, `web` fängt
mit Priorität 10 den Rest — ein `/api/revalidate` in Next bekäme nie eine
Anfrage. Sie bräuchte einen eigenen Pfad und ein Geheimnis, also eine neue
Schreibfläche auf dem öffentlichen Origin, für einen Cache, der beim Deploy
ohnehin leer startet.

### Das Cache-Fenster ist abgeleitet, nicht gewählt

`cacheLife: { health: { stale: 60, revalidate: 60, expire: 600 } }` in
`next.config.ts` ist der `Cache-Control`-Header aus ADR 0009 zweimal gelesen:
`public, s-maxage=60, stale-while-revalidate=600`. Bewegt sich der Contract,
bewegt sich das mit. Eine hier erfundene Zahl wäre eine zweite Quelle für eine
Frischezusage, die die API bereits macht.

### Der Trace zeigt den ganzen Weg — als Log-Korrelation, und das wird so gemeldet

Es gibt keinen OTel-Exporter und keinen Tempo-Dienst. `traceparent` ist auf
beiden Seiten handgeschrieben und landet ausschließlich als `trace_id` in
Logzeilen; das SDK ist F6, Tempo ist F8, beides „nach Launch". Die Abnahme wird
deshalb in der Form erbracht, die heute existiert, und in keiner anderen.

Gemessen im Dev-Stack, eine Anfrage auf `/`:

```
web   upstream request   status 304   request_id 75143c6887f7   trace a066183e30c7
api   request            status 304   request_id c1d2e2d507ef   trace a066183e30c7
```

Eine `trace_id`, zwei Container. Dass die Request-IDs verschieden sind, ist
richtig und dokumentiert: die API übernimmt eine fremde ID nur von einem
vertrauten Proxy, und `TRUSTED_PROXY_CIDRS` ist im Dev-Stack absichtlich leer
(ADR 0037). Die Brücke ist `upstream_request_id` in der web-Zeile.

**Eine Span-Ansicht ist damit nicht erbracht und wird nicht behauptet.**

### `connection()` ist die Zeile, ohne die die Hülle die Lüge bäckt

`next build` läuft in `docker build`. Dort gibt es kein `api:8080`. Ohne
`await connection()` vor dem Cache-Aufruf würden die Zellen zur Bauzeit
vorgerendert, `— NO DATA` würde in die statische Hülle **jeder** Route gebacken
und dort das ganze `expire`-Fenster liegen bleiben. Mit ihm bleibt die Hülle
statisch und nur die drei Zellen warten auf eine Anfrage.

Dieselbe Zeile hat `export const dynamic = "force-dynamic"` in
`app/healthz/route.ts` ersetzt, und sie sagt dort das Richtigere. Die Gefahr war
nie das Zwischenspeichern, sondern beantwortet zu werden, ohne dass eine Anfrage
angekommen ist — *„eine statisch optimierte Bereitschaftsprobe ist eine Datei
auf der Platte, die ‚ready' sagt, nachdem der Prozess aufgehört hat, bereit zu
sein"*.

### Was das kostet

**Ohne JavaScript bleiben die Zellen `— NO DATA`.** Cache Components verlangt
für jeden wartenden Wert eine `<Suspense>`-Grenze; React liefert den Inhalt in
einem `<div hidden>` am Dokumentende nach und setzt ihn per Inline-Skript. Am
Produktionsbuild nachgemessen: Platzhalter im Baum, Wert im verborgenen
Container. Kein falscher Wert, ein fehlender — aber die zwei Zeilen auf `/`
kamen vorher serverseitig gerendert an. Steht im Backlog, mit M2 als Termin.

**Zwei Leser sind zwei Wege, auf denen `/api/health` gefragt wird.** Das ist
mehr Fläche als ein Weg. Der Ausgleich ist, dass beide durch dieselbe
Transportschicht gehen und dieselbe Formung benutzen, also nicht darüber
uneins werden können, was ein fehlendes Feld bedeutet.

**Die ETag-Ersparnis ist 279 Byte** und fällt auf dem Docker-Netz an. Gemessen,
weil ADR 0009 sie als „die Ersparnis, die tatsächlich auf der Leitung ankommt"
führt und eine ungemessene Ersparnis genau die Sorte Behauptung ist, gegen die
diese Seite gebaut ist.

**Die Formung liest die Antwort defensiv, obwohl der Typ generiert ist.** Ein
generierter Typ ist eine Zusage über den Contract, nicht über die Bytes: nach
ADR 0035 redet der neue web-Container während des überlappenden Starts
sekundenlang mit dem vorherigen api-Build.

## Verworfene Alternativen

**Die Request-ID als Argument in die gecachte Funktion.** Sie würde Teil des
Cache-Keys und der Cache damit wertlos; würde sie aus dem Key genommen, trüge
jede Antwort die ID des ersten Besuchers. Beides ist schlechter als der
benannte Verzicht.

**Ein `/_revalidate` in `web`, gerufen von `tools/deploy-gate.sh`.** Näher am
Wortlaut des Bauplans, aber eine neue Schreibfläche auf dem öffentlichen Origin
für einen Cache, der beim Deploy leer startet — und `/api/revalidate`, die
naheliegende Adresse, gehört Traefik zufolge dem Go-Dienst.

**Das OTel-SDK nach G4 vorziehen.** Neue Abhängigkeiten und ein neuer Dienst,
gegen die Reihenfolge des Bauplans, und Tempo teilt sich die Platte mit
Postgres (ADR 0039). Die Log-Korrelation beantwortet die Frage der Abnahme
heute; F6 und F8 machen sie sichtbar.

**`ONLINE` pro Anfrage ungecacht.** Ein Hop auf jeder Seite für ein Wort, und
der Punkt dürfte dann etwas anderes sagen als die Zahl daneben.

**Ein generisches Leser-Gerüst für alle dreizehn Endpunkte.** Zwölf davon haben
in G4 keinen Aufrufer. Die Phase, die eine Zahl anzeigt, baut ihren Leser.

## Belege

- Bauplan, Stufe G, Phase G4 (Z. 1208); Kapitel 8.5 (der `curl` auf `/api/health`)
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md:196`
- ADR 0009 (Cache-Header und ETag), ADR 0035 (Zwillinge), ADR 0037 (Korrelation),
  ADR 0043 (Nonce und statische Hülle), ADR 0044 (die Naht in `FooterMeta`)
- `compose.yaml:578–593` — warum `.next/cache` tmpfs ist
- Issue #94 (Healthcheck), #157 (der Name, den der Zwilling nicht trägt)
- `backlog.md`, 28.08.2026 — die vier Funde dieser Phase
