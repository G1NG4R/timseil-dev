# ADR 0068 — Die Seite, die die Wartezeit hält, und der Zähler, den niemand belegen kann

**Status:** Angenommen
**Datum:** 2026-09-04
**Betrifft:** H8, H13, M2, und jede spätere Fläche, die einen Formularzustand zeigt
**Invarianten:** 1 (keine erfundenen Zahlen — hier: keine erfundene Wartezeit und
kein Zähler ohne Beleg), 8 (Tokens), 9 (zwei localStorage-Keys — hier: das Blatt
verlangt einen dritten und bekommt ihn nicht)

## Kontext

H8a hat `/contact` gebaut und vier Dinge offen gelassen, die dieselbe Wurzel
haben: **die Seite kannte ihren Zustand und sagte ihn nicht in der Sprache, die
G6 dafür gebaut hat.**

`.cf-status[data-phase]` unterschied vier Zustände über `color` und über sonst
nichts. Der Punkt im TX-Kopf war `--acc` in jedem Zustand, auch im
fehlgeschlagenen — ein grünes Licht über einem roten Satz. `web/lib/state/`
lag daneben, vollständig und ungenutzt: `StatusDot` verlangt sein Wort als
Pflichtargument, `.st-log` zeichnet den Prompt, `retryLine()` hatte seit G6
keinen Aufrufer außerhalb der Galerie (#231).

Das Blatt (SYS.06.01) zeichnet sechs Zustände und schreibt die Regel darüber:
*„Kein Zustand nur über Farbe: der Rahmen wechselt, das Wort wechselt, und im
Fehlerfall stehen Code und Zeitpunkt da — wie in einem Log, nicht wie in einer
Entschuldigung."* Der `Consistency Check` führt „sechs Formzustände" seit Runde 2
als erledigt. Gerendert hat sie bis hierher nichts.

Drei Umstände prägen die Entscheidungen unten stärker als der Plantext.

**Das Protokoll ist pro Sendung, nicht pro Sitzung.** Das Laufzeit-Skript des
Blatts setzt `log: []` am Kopf jedes `send()`. Es gibt dort keine Historie
vergangener Sendungen, keine Überschrift, keinen Speicher. Der einzige Hinweis
auf Aufbewahrung ist `3 EINTRÄGE LOKAL` in einem Streifen, den ADR 0067 §7
bereits gestrichen hat — und ein dritter localStorage-Key ist genau das, was
Invariante 9 nicht hat.

**Das Blatt lässt das Protokoll drei Dinge behaupten, die der Browser nicht
beobachtet hat:** `> spam checks … ok` (die Prüfung läuft in der API),
`> handing to provider …` (die Seite sieht nie einen Provider), und
`kopie an dich unterwegs` (es gibt keine Bestätigungsmail).

**Ein `429` hat auf dieser Route zwei Absender.** Das ist der Fund, der diesen
ADR trägt, und er stand in keinem Plan.

## Entscheidung

### 1. Eine zweite Marken-Tabelle, keine neunte Systemzustand-Zeile

`lib/contact/states.ts` führt die sechs. `Tone`, `Dot`, `Answer` und
`DOT_ANSWER` kommen aus `lib/state/words.ts` — es gibt weiter vier Töne und vier
Füllungen auf dieser Site und nicht acht. Was **nicht** übernommen wird, ist
`MARKS`: dessen acht Wörter sind, was diese Site über ein *System* sagt, das sie
ausliefert. `StateKey` um `SENDING` zu erweitern hieße, ein Wort in das
Vokabular der Fußzeile zu legen, in dem die Fußzeile nie sein kann.

`states.test.ts` hält dieselben Zusicherungen wie `words.test.ts`: jedes Wort
einmal, **weniger Töne als Zustände**, Puls nur auf `solid`, Füllung passend zur
Antwortklasse. Ohne diesen Test wäre eine zweite Tabelle neben der ersten die
Zustandssprache mit einem Loch darin.

`REST` und `COMPOSING` unterscheiden sich **nur durch das Wort** — beide haben
nichts gemessen, `DOT_ANSWER` lässt beiden genau eine Füllung, und ein fünfter
Ton hätte Töne und Zustände in die Eins-zu-eins-Entsprechung gedrückt, gegen die
der ganze Test gebaut ist. Es ist die Entscheidung aus ADR 0063 ein zweites Mal.

### 2. Der Zustand wird abgeleitet, und ein `400` zerfällt dabei in zwei

Die Insel hält weiter fünf Phasen. Der sechste Zustand ist die Grenze zwischen
„nichts getippt" und „die Uhr läuft", und die zeichnet `TxTrace` seit H8a
(`body === null`). Ein sechster Wert im State neben `phase` wären zwei
Variablen, die sich widersprechen dürfen.

Und die Ableitung trennt, was der Statuscode zusammenwirft: **ein `400` mit
Feldern ist `REJECTED`, ein `400` ohne Felder ist `FAILED`.** ADR 0067 §5 hat
die beiden Sätze schon getrennt; hier trennen sie auch den Ton. Damit wird der
eine Alert-Moment, den das Blatt dieser Seite zugesteht, **genau einmal
ausgegeben**: bei Feldfehlern trägt ihn `.field-error`, das ihn seit G7 hat, und
bei allem anderen der Statussatz. Vor dieser Phase gab die Seite ihn nie aus —
beide Verweigerungen waren amber.

### 3. Die Seite hält die Wartezeit — und druckt keinen Zähler

Ein automatischer zweiter Versuch ist auf **jedem** Zweig falsch: bei `502`
liegt die Nachricht gespeichert (ADR 0021 §1), ein zweiter Versuch erzeugt eine
Dublette; bei Status `0` weiß niemand, ob sie ankam; bei `429` wären es Minuten.
ADR 0021 sagt es selbst: *„Kein Retry im Request."*

Was die Seite stattdessen tut, ist das, was #231 als Abnahme verlangt hat
(*„etwas auf der Seite wartet wirklich und versucht erneut"*): der **gemessene**
`Retry-After` läuft sichtbar ab, der Absende-Button ist gesperrt, solange er
läuft, und wird von derselben Sekunde freigegeben, die die Zeile aus dem
Protokoll nimmt. Der Besucher ist der zweite Versuch, die Seite hält die Zeit.

**Der Zähler `n/3` wird nicht gedruckt, und das ist gemessen statt entschieden.**
Zwei Begrenzer beantworten `POST /api/contact` mit einem `429`:

| | wo | was er zählt |
|---|---|---|
| Token-Bucket | `middleware/ratelimit.go`, vor jeder `/api/*`-Route | jede Anfrage; `Except` nimmt nur `/healthz` und `/readyz` aus |
| Kontakt-Boden | `contact/policy.go`, `RateLimit = 3` je 10 Minuten | Zeilen in `contact_messages` |

Beide schreiben ihn durch `httpx.WriteRateLimitProblem`. Die Dokumente tragen
denselben `type` und denselben `title`; `detail` unterscheidet sich nur in der
Sekundenzahl. **Ein `2/3` neben diesem `429` benennt, welcher der beiden
abgelehnt hat, und das sieht diese Seite nicht.**

Also wandert die Zeile ohne Zähler nach `lib/state/retry.ts` als `waitLine()` —
neben `retryLine()`, in die Datei, der beide Formen derselben Zeile gehören.
`retryLine()` bleibt ohne Aufrufer außerhalb der Galerie, und **#231 bleibt
offen mit einem gemessenen Grund statt einer Vermutung.**

### 3b. Der Countdown rechnet in Sekunden, weil die Uhr eine Sekunde grob ist

Die erste Fassung hielt die Frist in Millisekunden und verglich sie mit der Uhr,
die eine React-Komponente lesen darf: `secondSnapshot()`, also
`Math.floor(Date.now() / 1000)` — der **Anfang** der laufenden Sekunde, bis zu
999 ms in der Vergangenheit. Aufgerundet wurde daraus eine Sekunde zu viel:
**`retry in 201s` bei einem `Retry-After: 200`.**

Eine Zahl, die größer ist als die gemessene, ist eine erfundene Zahl. Invariante
1 wird nicht weicher, weil der Fehler klein ist und in die sichere Richtung
zeigt — und die Zahl steht auf der Fläche, deren ganzer Zweck Genauigkeit ist.

Gerechnet wird deshalb durchgehend in Sekunden: `deadlineSecond()` legt die
Frist in dieselbe Einheit, in der die Uhr antwortet, und `secondsLeft()` ist eine
Subtraktion. Im Moment der Antwort steht damit **exakt die Zahl der API** auf dem
Schirm.

**Was das kostet, am anderen Ende:** eine Antwort bei .999 einer Sekunde gibt den
Button bis zu eine Sekunde zu früh frei. Das ist eine Höflichkeit, die zu früh
endet, keine Durchsetzung, die versagt — die API entscheidet, und sie beantwortet
einen verfrühten Versuch mit einem frischen `429` samt frischer Messung.

**Gefunden hat das die CI, nicht der lokale Lauf.** Von sieben Prüfbreiten fiel
genau eine, weil die Sekundengrenze zufällig anders lag; lokal war derselbe Test
grün. Die Arithmetik liegt jetzt in `lib/state/retry.ts` unter `node --test`,
wo sie nicht vom Zeitpunkt eines Browserlaufs abhängt.

### 4. Das Protokoll druckt Beobachtungen, und die Dauer ist die wichtigste

```
> honeypot empty · dwell 3247ms
> POST /api/contact
< 202 accepted · 1120ms
  msg_01M1MGN4V2DX7ZPP · 14:22:07 UTC
```

Die erste Zeile nennt die zwei Dinge, für die ADR 0021 §2 eine Einsendung
verwirft, und behauptet **nicht**, dass die Prüfung bestanden ist — das
beantwortet die API zwei Zeilen weiter unten. Die dritte Zeile trägt den Titel
der API, nicht unsere Umschreibung. `accepted` steht dort, weil es der Name des
202-Schemas ist, und niemals `delivered`.

**Und `1120ms` ist die Zeile, für die diese Phase steht.** ADR 0021 §2
beantwortet Honigtopf und Dwell-Unterschreitung mit derselben wohlgeformten
Quittung wie einen echten Versand — der Statuscode kann die beiden nicht
trennen. Der Umlauf kann es: eine verworfene Einsendung schließt vor Datenbank
und SMTP kurz und kehrt in Millisekunden um. Die H8a-Abnahme musste das von Hand
messen, um ihrer eigenen `202` zu glauben, und der Weg stand danach in keiner
Anleitung. Jetzt steht die Zahl auf der Seite.

Gemessen wird sie **im Formular und nicht in `apiPost`**. Der Umlauf ist eine
Tatsache dieser Seite; `apiPost` ist das Modul, das jeder spätere
Browser-Aufrufer erbt, und eine gemeinsame Transportschicht bekommt keine
Stoppuhr, weil eine Seite eine Zahl wollte.

### 4b. Die Zeichnung wechselt auf den Rumpf, der abgefahren ist

Zwei Zahlen für dieselbe Größe, zwei Zeilen auseinander, beide sichtbar:
`"dwellMs": 6` im gezeichneten Rumpf und `dwell 7255ms` im Protokoll darunter.
Gesendet wurde 7255.

Der Widerspruch ist so alt wie H8a und stand bis hierher in keinem Blickfeld:
ADR 0067 führt ihn unter „Was das kostet" — *„Der Trace ist der Stand des
letzten Tastendrucks"* — und nichts auf der Seite zeigte die gesendete Zahl, an
der man ihn hätte messen können. Der Kopf von `TxTrace` sagt gleichzeitig, das
Panel **sei** die Anfrage: *„a trace assembled from the draft instead would be a
drawing of a request rather than the request."*

Die Zeichnung nimmt deshalb den gesendeten Rumpf, sobald er abfährt. Der Grund
aus ADR 0067 bleibt: beim Tippen tickt nichts, es gibt kein Intervall und kein
Re-Render je Sekunde. Nach dem Absenden beschreiben Satz, Quittung, Protokoll und
Rumpf **dieselbe** Sendung, bis die nächste beginnt.

**Und die Reihenfolge, in der das gefunden wurde, ist das Argument für die
Phase:** erst hat das Protokoll den Entwurf statt der Abfahrt gedruckt, dann hat
die Reparatur den älteren Widerspruch danebengestellt. Keiner der beiden war
durch Lesen zu finden — beide erschienen, als das Formular bedient wurde.

### 5. Unter 720 wird die Spur zu einer Statuszeile

Artboard `1c` heißt so: *„Mobile · 390 — TX-Spur wird eine Statuszeile."* 720 ist
der Schalter, den diese Seite ohnehin nimmt; zwischen 720 und 1079 bleibt das
gestapelte Panel lesbar. Ein eigener Wert hätte die Regel am Kopf von
`layout.css` gebrochen.

Anders als das Blatt bleibt das **Zustandswort** auf dem Telefon stehen. Neun
Zeichen gegen die Regel, dass kein Zustand nur über Farbe spricht — auf dem
einen Gerät, auf dem sonst nur die Farbe eines Punktes übrig bliebe.

### 6. `readOnly` bekommt endlich eine Regel

„Felder gesperrt, nicht ausgegraut" war seit H8a ein Satz ohne Zeile: das
Formular setzte `readOnly` und kein Stylesheet zeichnete es. Der Text behält
seine Farbe, die Fläche nimmt den Panel-Grund. Ausgrauen wäre die
naheliegende Antwort und sagte, die Nachricht werde verworfen — in dem Moment,
in dem sie gesendet wird.

## Konsequenzen

**H13** erbt die Ableitung und den Grund, warum der Zähler hier nicht steht. Ist
die Fehlerseite die, die wirklich pollt, ist sie der Aufrufer, den `retryLine()`
seit G6 sucht.

**M2** bekommt eine Seite, deren sechs Zustände jetzt alle ein Wort tragen — und
in der Galerie erstmals nebeneinander stehen, was ein Audit prüfen kann, ohne
vier Antworten der API zu erzwingen.

**Jede spätere Fläche mit eigenen Zuständen** erbt die Form: eine eigene Tabelle,
die Vokabeln aus `words.ts`, und ein Test, der dieselben vier Zusicherungen
hält. Nicht eine neunte Zeile in `MARKS`.

### Was das kostet

**Unter 720 verliert die Seite ihr stärkstes Argument.** Die gezeichnete Anfrage
ist die Fläche, auf der ein Besucher nachlesen kann, dass genau sein Text und
kein Dritter im Paket steht, und auf dem Telefon ist sie weg. Der Grund, es
trotzdem zu tun: bis zu 4000 Zeichen JSON auf einer Zeile scrollen hinter 346 px
seitwärts, an dem Gerät, an dem der Leser nicht sieht, dass da mehr ist. Das ist
die Form, die #294 gegen den Request-Path offen hält, und sie wird hier nicht
ein zweites Mal gebaut.

**Der Countdown hält den Button, und die Uhr ist die des Besuchers.** Läuft sie
gegenüber der der API nach, wartet er ein paar Sekunden zu lange; läuft sie vor,
bekommt er ein zweites `429`. Beide Richtungen sind harmlos, weil die API die
Entscheidung ohnehin selbst trifft — die Sperre ist eine Höflichkeit, keine
Durchsetzung.

**Die Insel wächst.** Sie war mit 4 873 Byte gzip schon das größte Stück
Client-Code dieser Site, von 6 725 Byte, die ADR 0050 offen lässt. Die Zahl
dieser Phase steht in der Abnahme; wächst sie über das Budget, ist das ein
Befund und keine stille Überziehung.

**Ein Zustand mehr, den nichts in Produktion auslöst.** `COMPOSING` erreicht man
durch Tippen, die anderen fünf brauchen eine bestimmte Antwort. Die Galerie ist
die einzige Fläche, auf der alle sechs zugleich existieren, und sie ist eine
Zeichnung — kein laufendes Formular.

## Verworfene Alternativen

**`StateKey` um die sechs erweitern.** Dann stünde `SENDING` in dem Vokabular,
aus dem die Fußzeile ihren Zustand nimmt, und `stateLabel()` bräuchte
Wörterbuch-Schlüssel für Wörter, die LANG.01 englisch lässt. Siehe §1.

**Den Zähler drucken und die Ungenauigkeit in eine Fußnote schreiben.** Es gibt
keine Fußnote in einer Logzeile. Siehe §3.

**Einen automatischen Versuch bei Status 0.** Der Zweig mit der geringsten
Dublettengefahr — aber nicht mit keiner: ein Deadline-Abbruch nach acht Sekunden
sagt nichts darüber, ob die API die Zeile schon geschrieben hat.

**Die Dauer in `apiPost` messen.** Siehe §4. Eine gemeinsame Transportschicht
wächst so ein Berichtswesen an, weil ein Aufrufer eine Zahl brauchte.

**Ein Sitzungs-Protokoll über mehrere Sendungen.** Das Blatt hat keins, und
`3 EINTRÄGE LOKAL` verlangte einen dritten localStorage-Key. Invariante 9.

**Die Statuszeile schon ab 1080.** Zwischen 720 und 1079 ist das gestapelte
Panel lesbar; die Zeichnung dort wegzunehmen wäre ein Verlust ohne Gegenwert.

## Belege

Build-Plan Zeile 1242 (H8), 1215 (G6s Abnahme), 1218 (G7s Galerie).
ADR 0021 §1 (angenommen ≠ zugestellt), §2 (die stille Antwort), §3
(`Retry-After` aus `min(received_at)`), ADR 0044 (die Uhr und die Hydration),
ADR 0048 (die Zustandssprache), ADR 0050 (Bündel-Budget), ADR 0063 (zwei
Zustände, die sich nur im Wort unterscheiden), ADR 0067 (die Insel, die vier
Behauptungen des Blatts, die zwei Bedeutungen eines `400`).
`api/internal/middleware/ratelimit.go` und `chain.go:Except` (der erste
Begrenzer), `api/internal/contact/policy.go:43-44` und
`api/internal/store/queries/contact.sql:88-91` (der zweite),
`api/internal/httpx/problem.go:79-92` (das Dokument, das beide schreiben).
Issues #231, #294.
Blatt `Contact`, SYS.06.01 und Artboard `1c`; `State Language` (die Retry-Zeile
in ihrer verbindlichen Reihenfolge); `Consistency Check`, Runde 2.
