# ADR 0037 — Korrelation und PII im Handler, nicht an den Call-Sites

**Status:** Angenommen
**Datum:** 2026-08-23
**Betrifft:** F1, F2, F3, F6, F8, F11, L7
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

### Was das kostet

- **48 angefasste Call-Sites.** Ein mechanischer Diff, den niemand gern liest.
- **Ein Scan pro String-Attribut.** Kein Regex: der Vorfilter ist
  `strings.ContainsAny(s, "@.:")`, und eine Zeile ohne diese drei Zeichen kehrt
  ohne Allokation zurück. IP-Kandidaten werden nicht gemustert, sondern
  ausgeschnitten und an `net/netip` gegeben — deshalb hält der Filter
  `11:19:35` und `1.2.3-rc.1` heraus, woran ein Regex scheitert.
- **Strukturen hinter `slog.Any` werden nicht durchlaufen.** Heute loggt der
  Dienst keine; täte er es, könnte ein Feld darin PII tragen. Der Ort dafür ist
  `scrubValue`, und dieser Satz ist die Notiz.
- **Der Redaktions-Marker ist Text ohne Klammern** (`redacted-email`). Weniger
  hübsch, aber notwendig: mit Klammern beendete er den Domain-Scan und ließ das
  Davorstehende wie eine gültige Domain aussehen, sodass ein zweiter Durchlauf
  mehr redigierte als der erste. Der Fuzzer hat das gefunden, nicht das Review.
- **`span_id` wird nicht geloggt.** Erzeugt wird sie, geschrieben nicht — vor F8
  liest sie niemand, und die Platte teilt sich Loki mit Postgres.
- **`Sampled` ist bis F6 konstant `true`.** Es gibt keinen Sampler; `false` hieße
  für jeden Collector „verworfen".
- **`WithGroup` ist teurer als der Normalfall.** Der Handler spielt seine
  Operationen neu auf den Basis-Handler, damit die Korrelation an der Wurzel des
  Objekts bleibt statt in der Gruppe zu landen. Heute gruppiert niemand, also
  läuft immer der Pfad ohne Zusatzkosten.

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

- Build-Plan, Stufe F, F1 · Kapitel „Die eine Sache, die technisch nicht
  verschiebbar ist"
- Design-Blatt `Operations`, Abschnitt SYS.00.09.04 — Aufbewahrung
- ADR 0009 (`requestId` im Problem-Dokument), ADR 0015 (Middleware-Kette,
  Vertrauensgrenze), ADR 0025 (Form eines Handler-Pakets)
- W3C Trace Context, Level 1 — Feldformat und die Regel für mehrfache Header
