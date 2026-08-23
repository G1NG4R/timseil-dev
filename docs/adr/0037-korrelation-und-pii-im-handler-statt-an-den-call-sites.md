# ADR 0037 — Korrelation und PII im Handler, nicht an den Call-Sites

**Status:** Angenommen
**Datum:** 2026-08-23
**Betrifft:** F1 (F1a und F1b), F2, F3, F6, F8, F11, L7
**Invarianten:** —

## Kontext

Der Bauplan verlangt für F1 zweierlei: Request-ID und Trace-ID **in jeder Zeile**,
und kein PII im Anwendungslog — „das ist keine Kür, deine Datenschutzseite
verspricht es". Das Betriebsblatt sagt es wörtlich: *Anwendungslogs · 7 Tage ·
keine IP, keine Formularinhalte.*

Bis hierher trug die Korrelation, wer daran dachte. `middleware/logging.go`
schrieb `request_id` in die Access-Zeile, `httpx/problem.go` und acht Stellen in
`internal/contact` setzten sie von Hand. Die übrigen rund fünfzig Aufrufe hatten
sie nicht — und das sind die Fehlerpfade, also genau die Zeilen, für die man
korreliert. Eine Regel, die fünfzigmal befolgt werden muss, ist keine Regel.

Beim PII-Teil kam ein Fund dazu, der die Bauform entschieden hat. `internal/mail`
verpackt die Antwort des Relays in einen Fehler:

```go
// mail/smtp.go
return fmt.Errorf("%w: %d %s", ErrPermanent, protocol.Code, oneLine(protocol.Msg))
```

und `internal/contact` loggt diesen Fehler. Eine SMTP-Ablehnung lautet
`550 5.1.1 <jemand@example.com>: Recipient address rejected` — die Adresse steht
im Log. Über dem Aufruf stand bereits der Kommentar *„Attempt number and the
reason, never the address. F1's PII rule."* Die Absicht war richtig, und die
Zeile leckte trotzdem: die Adresse ist kein Feld, das wir gewählt haben, sondern
fremder Text in einem Fehlerwert. Disziplin an der Call-Site kann das nicht
sehen.

Zwei weitere Stellen kamen beim Durchsehen dazu: `mail/log.go` schrieb die
**vollständige** Nachricht in eine Zeile (`envelope`), und `middleware/ratelimit.go`
schrieb `r.RemoteAddr` im Klartext.

## Entscheidung

Request-ID und Trace-ID kommen über einen `slog.Handler`-Wrapper aus dem Context
auf jede Zeile, PII wird im Handler direkt vor dem Writer redigiert, und der
Schlüssel über beide Dienste ist die **Trace-ID**, nicht die Request-ID.

Die Kette, gebaut in `internal/logx`:

```
slog.Logger → ContextHandler → ScrubHandler → JSONHandler → stdout
                 heftet an       redigiert       schreibt
```

## Konsequenzen

**Der Context wird zur Pflicht.** 48 Aufrufe sind auf `InfoContext` /
`WarnContext` / `ErrorContext` umgestellt. An allen war `ctx` oder `r` bereits im
Scope — keine Signatur hat sich geändert, es ist ein Wort pro Zeile. Dafür sind
13 handgesetzte `request_id`-Attribute weggefallen: `slog`s JSON-Handler
dedupliziert nicht, zwei gleiche Schlüssel in einem Objekt sind gültiges JSON,
dessen Bedeutung vom Parser abhängt.

**`traceparent` wird von jedem Peer übernommen, `X-Request-Id` nicht.** Das ist
der Punkt, an dem `middleware/trace.go` bewusst von `middleware/requestid.go`
abweicht:

| | `X-Request-Id` | `traceparent` |
|---|---|---|
| erscheint in der Antwort | ja — Header und `requestId` im Problem-Dokument | nein |
| was ein Fremder damit erreicht | er wählt die Kennung, unter der seine Anfrage in unseren Logs steht und in unseren Antworten an Dritte | nichts — 32 Hex-Zeichen ohne Aussage |
| Zeichenvorrat | `[A-Za-z0-9_-]`, 8–64 | genau 32 bzw. 16 Kleinbuchstaben-Hex |

Ein Vertrauens-Gate für `traceparent` **funktioniert hier auch praktisch nicht**:
`compose.dev.yaml` lässt `TRUSTED_PROXY_CIDRS` absichtlich leer (dort leitet
niemand weiter, und eine gefüllte Liste würde das Rate-Limit abschalten und
einmal pro Minute darüber klagen), und in Produktion liegen `api` und `web` auf
zwei Netzen, ohne dass festgelegt wäre, über welche Adresse die Verbindung läuft.
Ein Gate wäre dort ein Münzwurf.

**`internal/reqid` und `middleware/requestid.go` sind unverändert.** Der
Kopfkommentar von `reqid.go` versprach seit C1: *„F1 adds a trace id beside it and
touches neither."* Das ist eingehalten.

**Die Hintergrundschleifen bekommen einen Trace pro Durchlauf.** `ops.Aggregator`,
`contact.Dispatcher` und `contributions.Refresher` haben keine Anfrage und
deshalb keine Request-ID; die vier bis fünf Zeilen eines Laufs gehören trotzdem
zusammen. Ein fehlendes Feld ist die ehrliche Aussage „diese Zeile hat keine
Anfrage" — besser als ein Platzhalter, den man später von einer echten ID
unterscheiden muss.

**Zwei Zeilen sind an der Call-Site repariert, nicht im Handler.**
`mail/log.go` schreibt `envelope` nicht mehr, und `ratelimit.go` beschriftet den
Peer mit demselben Hash, den die Access-Zeile für `client` benutzt. Die
Arbeitsteilung ist scharf und nicht „sicherheitshalber beides":

| | Scrubber | Call-Site |
|---|---|---|
| zuständig für | **fremde Worte** — SMTP-Antworten, `net/http`-Fehler, Treibermeldungen | **unsere eigenen Worte** |
| warum die andere Seite es nicht kann | wir schreiben diesen Text nicht und können ihn nicht prüfen | ein Filter redigiert die Adresse in `envelope` und lässt Name und Nachrichtentext stehen — er sähe aus wie Schutz und wäre keiner |

**Eine Ausnahme nach Schlüssel, und sie stammt aus dem Betrieb.** Beim ersten
Lauf gegen den Dev-Stack kam die Zeile

```json
{"msg":"mail not sent — MAIL_TRANSPORT is log","message_id":"redacted-email", …}
```

heraus. Eine RFC-5322-Message-ID **ist** eine addr-spec (`msg_01M0PZ…@timseil.dev`),
der Filter hat sie folgerichtig ersetzt — und die Zeile behauptete damit das
Gegenteil dessen, was passiert war. `internal/logx` kennt deshalb genau einen
ausgenommenen Schlüssel, `message_id`, und die Ausnahme ist eine Aussage über den
**Wert**: diese Kennung baut `internal/contact` aus einer selbst erzeugten ID und
der eigenen Domain, kein Teil davon kommt von einem Besucher. Ein weiterer
Eintrag in dieser Liste ist dieselbe Aussage noch einmal — und gehört ins Review.

Der Fund ist auch das Argument gegen einen strengeren Filter: ein Scrubber, der
Felder frisst, für die eine Zeile existiert, wird nach zwei Wochen abgeschaltet.

**Steuerzeichen fallen weg, bevor irgendetwas anderes passiert.** CodeQL meldet
`go/log-injection` auf jeder Zeile, die einen Wert aus der Anfrage loggt — drei
davon auf Code, der älter ist als diese Phase. Die Alarme waren falsch positiv,
und das ist gemessen: ein Zeilenumbruch in `r.URL.Path` kommt als Escape
**innerhalb** des Strings heraus, die Zeile bleibt eine Zeile. Aber „der Encoder
escapt es" ist eine Zusage, die in einer anderen Datei lebt als die Werte, die
sie schützt — F2 hängt Alloy ans Ende der Röhre, F11 einen zweiten Erzeuger.
`StripControl` ersetzt jedes C0-Byte und DEL durch ein Leerzeichen (ein Byte, ein
Leerzeichen: Positionen bleiben erhalten). Das gilt auch für den ausgenommenen
Schlüssel — die Ausnahme ist eine Aussage über die *Form* des Wertes und sagt
nichts über Steuerzeichen.

### Was das kostet

- **48 angefasste Call-Sites.** Ein mechanischer Diff, den niemand gern liest.
- **Gemessen, nicht behauptet** (`BenchmarkScrub*`, `b.ReportAllocs`):

  | Fall | Kosten |
  |---|---|
  | die Zeile, die jede Anfrage schreibt (32-Hex-ID) | **104 ns, 0 Allokationen** |
  | ein gewöhnlicher Pfad | **86 ns, 0 Allokationen** |
  | eine echte Relay-Ablehnung mit Adresse | 6,9 µs, 23 Allokationen |

  Der teure Pfad läuft nur auf Zeilen, die wirklich eine Adresse tragen. Kein
  Regex: IP-Kandidaten werden ausgeschnitten und an `net/netip` gegeben, deshalb
  hält der Filter `11:19:35` und `1.2.3-rc.1` heraus, woran ein Muster scheitert.
- **Ein Kandidat ist auf 64 Zeichen begrenzt** (`maxAddrLen`). Ohne diese Grenze
  kostet ein Lauf von *n* Bytes *n* Parses an *n* Stellen — **2 700 Zeichen aus
  Doppelpunkten und Ziffern brauchten sieben Sekunden im Logger**, und
  `r.URL.Path` ist nicht längenbegrenzt. Der Filter, der das Log schützen soll,
  wäre der Weg gewesen, den Dienst anzuhalten. Gefunden hat das der Fuzzer, nicht
  das Review. Was die Grenze ausschließt, ist ein IPv6-Zonenname, der länger ist
  als die Adresse — den hat ein Container, der mit einem Container spricht, nicht.
- **Der Pfad in der Access-Zeile ist auf 256 Zeichen begrenzt.** Dieselbe
  Begründung und dieselbe Form wie `truncateOrigin` in `internal/contact`: die
  längste montierte Route liegt weit darunter, und `net/http` nimmt eine
  Anfragezeile, die viel länger ist.
- **Redigiert wird in EINEM Durchlauf, nicht in zweien.** E-Mails und dann
  Adressen zu suchen war auf jeder Eingabe richtig, die jemand sich ausdenkt, und
  falsch auf zweien, die der Fuzzer fand: `a@b.tld@c.tld` ließ die zweite Domain
  stehen, und bei `0@::0.XA` **baute** die IP-Redaktion eine E-Mail, die es nicht
  gab. Was ein Durchlauf schreibt, wird nie wieder gelesen — das schließt die
  Klasse statt der zwei Fälle.
- **Idempotenz ist keine Eigenschaft dieses Filters, und sie kann keine sein.**
  Der Marker ist entweder aus Domain-Zeichen gebaut und kann Teil einer Domain
  werden, oder er ist es nicht und kann eine Domain **beenden** — beide
  Marker-Formen sind Duale, und der Fuzzer hat beide vorgeführt. Ein zweiter
  Durchlauf darf also mehr redigieren als der erste. Die Eigenschaft, die gilt
  und geprüft wird, ist die versprochene: *was der Filter erkennt, entfernt er.*
- **`matchAddr` probiert den längsten Treffer zuerst und dann kürzere.** Nur den
  maximalen Lauf zu probieren ließ bei `::0.::0` das erste `::0` stehen — die
  einzige der Fuzz-Funde, die ein echtes Leck war. Der Lauf-Anfang-Test, der das
  linear halten sollte, war derselbe Fehler in Grün: bei `::0X%::0` beginnt der
  zweite Lauf bei `%`, `%::0` parst nicht, und das `::0` darin wurde nie probiert.
- **Strukturen hinter `slog.Any` werden nicht durchlaufen.** Heute loggt der
  Dienst keine; täte er es, könnte ein Feld darin PII tragen. Der Ort dafür ist
  `walk`, und dieser Satz ist die Notiz.
- **`span_id` wird nicht geloggt.** Erzeugt wird sie, geschrieben nicht — vor F8
  liest sie niemand, und die Platte teilt sich Loki mit Postgres.
- **`Sampled` ist bis F6 konstant `true`.** Es gibt keinen Sampler; `false` hieße
  für jeden Collector „verworfen".
- **`WithGroup` ist teurer als der Normalfall.** Der Handler spielt seine
  Operationen neu auf den Basis-Handler, damit die Korrelation an der Wurzel des
  Objekts bleibt statt in der Gruppe zu landen. Heute gruppiert niemand, also
  läuft immer der Pfad ohne Zusatzkosten.

## Die Web-Hälfte (F1b)

**Nachgetragen am 23.08.2026**, nach demselben Muster wie oben und unter
derselben Nummer: F1 ist **eine** Phase, `Betrifft` nennt sie, und ein zweiter
ADR für die zweite Hälfte wäre genau das, wovor `Maß halten` warnt. Was hier
steht, sind die vier Entscheidungen, die sonst ein zweites Mal geführt werden.

**Der Scrubber steht zweimal da, in zwei Sprachen.** Es gibt keinen Weg, `Scrub`
aus Node aufzurufen, der billiger wäre als ihn zu portieren. Portiert ist die
**Form** — ein Durchlauf, Längstes-zuerst-dann-kürzer, die 64-Zeichen-Grenze —
weil jede davon ein Fehler ist, den der Fuzzer gefunden hat, und eine
Neuentwicklung aus der Beschreibung sie noch einmal finden würde.

Dass web ihn überhaupt braucht, war die Frage, die ein früherer Entwurf falsch
beantwortet hat („web loggt keine Formularinhalte"). Die Arbeitsteilung oben geht
nicht nach unseren Feldern, sondern nach **wessen Worten**, und web bekommt
fremde, sobald es fetcht:

```
TypeError: fetch failed
  cause: Error: connect ECONNREFUSED 172.18.0.3:8080
```

Gemessen im laufenden Container gegen den echten Fehlerwert:
`fetch failed: connect ECONNREFUSED redacted-ip`. ADR 0035 sagt, dass `api` in
Schritt 3 jedes Rollouts kurz weg ist — ohne Filter schreibt also **jeder
Rollout** die Container-Adressen ins Log.

Zwei Unterschiede zum Original, beide bewusst. Es gibt **keine Ausnahme nach
Schlüssel**: web schreibt kein selbst erzeugtes adressförmiges Feld, und eine
Liste für einen Fall, den es nicht gibt, ist Ballast. Und der Adress-Parser ist
**von Hand geschrieben statt `node:net`** — Next übersetzt `instrumentation.ts`
auch für die Edge-Runtime, wo das Modul nicht lädt. Der Umweg hat mehr gebracht
als einen ruhigen Build: `net.isIP` ist damit ein **unabhängiges Orakel** im
Test statt einer geteilten Abhängigkeit.

**Die IDs reisen als Header, nicht als Global.** Next' eigene Anleitung zu
`proxy.ts`: die Datei läuft getrennt vom Rendering, und Information erreicht die
Anwendung über Header, nicht über geteilte Module. `lib/drain.ts` beschreibt
dieselbe Falle von der anderen Seite — `output: "standalone"` verfolgt jeden
Einstiegspunkt einzeln. Dazu gibt es keinen Moment, in dem man einen
`AsyncLocalStorage` betreten könnte: `proxy.ts` ist fertig, bevor gerendert wird,
und `instrumentation.ts` läuft einmal pro Prozess. `lib/correlation.ts` ist die
Rückrichtung.

**web schreibt keine Access-Zeile.** `proxy.ts` läuft vor der Antwort und kennt
weder Status noch Dauer — die zwei Felder, für die die Access-Zeile der API
existiert. Eine Zeile ohne sie verdoppelt Traefiks Log und sagt weniger. web
protokolliert, was web **tut**: den Upstream-Aufruf, die Fehler über
`onRequestError`, die Lebenszyklus-Zeilen. Nebeneffekt, der die Entscheidung
mitträgt: `proxy.ts` loggt nicht und bleibt damit frei von allem, was nur unter
Node läuft.

**`upstream_request_id` ist die Brücke, `trace_id` bleibt der Schlüssel.** Die
API übernimmt eine eingehende `X-Request-Id` nur vom vertrauenswürdigen Peer, und
`TRUSTED_PROXY_CIDRS` ist im Dev-Stack absichtlich leer — die von web gesendete
ID wird also **nicht** die der API. Die Web-Zeile trägt deshalb die ID, die die
API in ihrer Antwort nennt. Damit gilt der Wortlaut des Bauplans („eine
Request-ID findet alle Zeilen aus beiden Diensten") in **einem** Sprung, und über
`trace_id` in keinem. Gemessen:

```
{"msg":"request","path":"/api/health","status":200,
 "request_id":"eff2c10b…","trace_id":"d2ad2aad…"}                        ← api
{"msg":"upstream request","path":"/api/health","status":200,
 "upstream_request_id":"eff2c10b…","request_id":"dc51add8…","trace_id":"d2ad2aad…"}  ← web
```

**Was F1b in der API geändert hat.** Der Port hat einen Fehler im Original
gefunden: `matchAddr` übersprang jeden Kandidaten, der auf einen Doppelpunkt
endet, als Satzzeichen — und `::` ist Syntax. `Scrub("peer 2001:db8:: is gone")`
gab seine Eingabe zurück. Der Fuzzer konnte das nicht finden, und **das** ist der
übertragbare Teil: `addressesIn` rescannt mit demselben `matchAddr`, die
Eigenschaft lautet also „der Filter sieht keine Adresse mehr, **die er sehen
kann**". Der Web-Test rescannt stattdessen mit `net.isIP` über jeden Teilstring
und teilt keine Zeile mit dem Matcher. Beide Seiten tragen die Reparatur
(`worthParsing`), das Korpus hat einen Eintrag mehr, und die zwei Rescans bleiben
**absichtlich verschieden**.

**Der Docker-Healthcheck fragt `/healthz` statt `/`.** Nicht wegen der Zahl
(17 280 API-Aufrufe pro Tag), sondern wegen ADR 0035: ein `/`-Check, der fetcht,
macht die Gesundheit von `web` von der Erreichbarkeit von `api` abhängig, und
`docker compose up --wait` wartet dann im Rollout auf einen Container, der genau
deshalb nie gesund wird. Aufgegeben wird damit „beweist, dass React rendert";
bewiesen wird „der Prozess bedient HTTP und ein Route-Handler läuft", und das ist
das, was `--wait` wissen muss.

### Was das kostet

- **Eine Prüfung mehr in `make check`**, und sie ist die erste ihrer Art in
  `web/`: `npm test` war bis F1b ein `echo`. `node --test` liest TypeScript
  direkt, also keine neue Abhängigkeit — der Preis ist
  `allowImportingTsExtensions` in `tsconfig.json` und die Regel, dass alles unter
  Test relativ und mit Endung importiert und nichts aus `next/*` zieht.
- **`@typescript-eslint/no-floating-promises` ist für `*.test.ts` aus.**
  `describe` und `it` geben ein Promise zurück, damit ein Runner es awaiten kann;
  eine Testdatei ist dieser Runner nicht. Achtzig `void` wären Rauschen.
- **Zeitstempel unterschiedlicher Präzision.** Go schreibt Nanosekunden, Node
  Millisekunden. Beides RFC 3339, für F1s Abnahme (`grep`) egal — ab **F2** muss
  Alloy beide als Timestamp parsen. Steht im Backlog.
- **`span_id` wird auch hier nicht geloggt**, `tracestate` nicht durchgereicht.
  Dieselben Gründe wie oben, dieselben Phasen: F8 und F6.

## Verworfene Alternativen

**Das OTel-SDK jetzt einziehen.** F6 liegt nach dem Launch, und das SDK zieht
`otelhttp`, `otelpgx`, einen Exporter und einen Collector nach. F1 braucht zwei
Hex-Strings; die 55-Zeichen-Grammatik von `traceparent` ist kleiner als der
Import. F6 kann übernehmen, was hier parst — es ist das Format der Spezifikation,
nicht unseres.

**Eine Prüfregel in `tools/`, die Call-Sites zählt.** Sie hätte den Fund, der
diese Phase trägt, nicht gefunden: die Adresse steht im Fehlertext eines Dritten,
nicht in einem Argument, das ein Skript sehen kann. Dazu sind `selftest.sh` und
`check-compose.sh` seit dem 23.08.2026 eingefroren.

**Ein eigenes `TRUSTED_REQUEST_ID_CIDRS`.** Eine siebte Umgebungsvariable für ein
Problem, das die Trace-ID umsonst löst.

**Die Korrelation über `slog.SetDefault`.** Ein globaler Logger, den ADR 0025
gerade nicht will.

**Nur `request_id`, `trace_id` erst mit F6.** Weicht vom Wortlaut des Bauplans ab
(„Request-ID **und** Trace-ID in jeder Zeile") und hätte den dienstübergreifenden
Schlüssel offen gelassen, den F1b braucht.

## Belege

- `internal/logx/scrub_test.go` — die Fuzz-Eigenschaft und das Korpus der drei
  Eingaben, die den Filter widerlegt haben
- Build-Plan, Stufe F, F1 · Kapitel „Die eine Sache, die technisch nicht
  verschiebbar ist"
- Design-Blatt `Operations`, Abschnitt SYS.00.09.04 — Aufbewahrung
- ADR 0009 (`requestId` im Problem-Dokument), ADR 0015 (Middleware-Kette,
  Vertrauensgrenze), ADR 0025 (Form eines Handler-Pakets)
- W3C Trace Context, Level 1 — Feldformat und die Regel für mehrfache Header
