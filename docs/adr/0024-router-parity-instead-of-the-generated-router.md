# ADR 0024 — Der Paritätsnachweis statt des generierten Routers

**Status:** Angenommen
**Datum:** 2026-08-18
**Betrifft:** C7, E2, alle künftigen Endpoints
**Invarianten:** —
**Ersetzt:** ADR 0016, Teil 2 (der Router)

## Kontext

ADR 0016 hat in C1 entschieden, den generierten Router **nicht** zu montieren,
solange elf der vierzehn Operationen des Contracts noch nicht existieren.
`httpx.HandlerWithOptions` registriert alle vierzehn auf einmal, und jede
Antwort, die es für eine ungebaute Operation geben könnte, wäre gelogen: 500
sagt „wir sind kaputt", 501 deklariert keine Operation und ist für einen
generierten Client unlesbar, und 404 für eine dokumentierte Ressource ist nur
dann ehrlich, wenn es die Route wirklich nicht gibt — was durch Nichtregistrieren
genau erreicht wird.

Derselbe ADR hat den Ausstieg zugesagt, und zwar mit einer Begründung, die
sechs Phasen lang gestimmt hat:

> „Die Handler werden trotzdem in der Form des Strict-Servers geschrieben. […]
> Die Phase, die den letzten Handler liefert, tauscht `internal/server` auf
> `HandlerWithOptions` um. Weil jeder Handler die Form schon hat, ist das eine
> Router-Änderung und keine Neufassung."

C7 ist diese Phase. Die Zusage wurde geprüft, bevor sie eingelöst wurde, und der
letzte Satz stimmt nicht mehr.

## Entscheidung

**Der Router bleibt handgeschrieben. Ein Test beweist seine Vollständigkeit —
in beide Richtungen.**

### 1. Warum der Umbau nicht stattfindet

Vier Funde, jeder für sich teuer, zusammen entscheidend.

**Drei tote Stub-Methoden.** `httpx.RegisterDocs` liefert 304 auf
`If-None-Match`, den CSP-Header auf `/api/docs` und gzip-Aushandlung für
`scalar.js`. Der Contract erklärt für diese drei Operationen **nur** 200 und
429, also gibt es weder ein `GetDocs304Response` noch ein Header-Feld für CSP,
`Vary` oder `Content-Encoding` — die generierten Antwortobjekte können nicht
ausdrücken, was tatsächlich ausgeliefert wird. Die drei Routen müssten am Mux
ersetzt werden, und `StrictServerInterface` verlangte trotzdem drei Methoden,
die niemand je ruft. Das ist wörtlich der Einwand, mit dem ADR 0016 den 501
verworfen hat, nur auf der anderen Seite der Schnittstelle: eine Antwort, die
nie gegeben wird, ist eine Behauptung über das System, die nicht stimmt.

**Zwei Verhaltensänderungen am Draht.** `systems.ServeDetail` prüft heute
`raw != ""`, also ist `?window=` ein fehlender Parameter und die Antwort 200 mit
dem Default 91. Der generierte Binder reicht den leeren String an
`strconv.ParseInt` und antwortet 400. Ein zweiter `If-None-Match`-Header ist
heute still der erste und danach ein `TooManyValuesForParamError` → 400. Beides
trifft öffentliche Leseendpoints und liefe unter der Überschrift „nur eine
Router-Änderung".

**Mehr Code, nicht weniger.** Der Umbau ersetzte rund neunzig Zeilen getesteten
Adapter in `health`, `systems`, `training` und `contributions` durch einen
dekorierenden Mux, einen zusammengesetzten Strict-Typ, drei Fehler-Haken und
sechs Ersatz-Adapter, die die alten unter neuem Namen sind. Sechs von vierzehn
Operationen müssten den generierten Weg ohnehin umgehen — die drei Doku-Routen,
weil sie mehr liefern als der Contract erklärt, und die drei Schreibpfade, weil
der generierte Decoder **keine** Größenbegrenzung, **kein**
`DisallowUnknownFields` und **keine** Content-Type-Prüfung hat und weil der
Token vor dem Decodieren greifen muss.

**Und die gefährlichste Falle sind die Tests.** Die Prüfharnische in
`systems_test.go`, `health_test.go`, `training_test.go` und
`contributions_test.go` montieren die Adapter direkt. Bleiben die Adapter „nur
für die Tests" am Leben, prüfen rund vierhundert Zeilen der bestgetesteten
Stellen im Repo ab sofort toten Code — und nichts meldet es. Das wäre strikt
schlechter als nicht umzubauen.

### 2. Was ADR 0016 eigentlich wollte

Keinen Mechanismus, sondern eine Zusicherung: **keine Operation des Contracts
bleibt unmontiert, und keine montierte Route steht außerhalb.** Der ADR benennt
die Prüfung selbst — „die maschinelle Prüfung in beide Richtungen kommt mit E2"
— und `tools/check-contract.sh` nennt sie im Kopfkommentar beim Namen. C7 zieht
sie vor, statt zu montieren.

### 3. Wie der Nachweis geführt wird

`api/internal/server/router_parity_test.go`. **Keine der beiden Seiten wird
aufgeschrieben**, und das ist die ganze Konstruktion:

- Die **Vertragsseite** wird aus generiertem Code gelesen. `recorder` ist ein
  `httpx.ServeMux`, der nichts bedient und nur mitschreibt; `HandlerWithOptions`
  registriert gegen dieses Interface, also fällt die Routing-Tabelle des
  Contracts dabei ab — ohne dass irgendetwas montiert wird oder ein generierter
  Handler je läuft. Sie aktualisiert sich bei jedem `make gen`.
- Die **Montageseite** kommt aus der Registrierung selbst. `routes()` gibt
  seither eine `registry` zurück, die jedes Muster mitschreibt, das durch sie
  hindurchgeht. Eine von Hand gepflegte Routenliste wäre eine zweite Aussage
  über den Router, und die stimmte am Tag ihrer Entstehung.

Darauf fünf Zusicherungen: jede Operation ist montiert · nichts ist montiert,
was der Contract nicht kennt · die Zahlen sind gleich und es sind vierzehn ·
jedes verzeichnete Muster antwortet nicht 404 · jede Route weist die falsche
Methode mit 405 und `Allow` ab.

Die vierte ist nicht Zierde. `RegisterDocs` nimmt einen konkreten
`*http.ServeMux` und registriert seine drei Muster selbst, also werden die drei
von Hand verzeichnet — und ein von Hand verzeichnetes Muster, das niemand
registriert, würde die ersten drei Zusicherungen bestehen und 404 antworten.
Mutationsgeprüft: ein `openapi.yml` statt `openapi.yaml` bringt genau diesen
Test zu Fall.

Die fünfte hält die Methode im Muster fest. Ohne sie passt ein Muster auf jedes
Verb, und ein POST auf einen Leseendpoint würde still angenommen und ignoriert
statt mit 405 abgewiesen.

`nopStrict` erfüllt `StrictServerInterface` mit vierzehn
`panic("unreachable")`-Methoden und existiert **nur in der Testdatei**. Das ist
der Unterschied zu §1: im Test ist es Möblierung, im Binary wären es drei Lügen
mit Doc-Kommentar.

### 4. Was drei Tests bisher still nicht geprüft haben

Aus derselben Untersuchung, und deshalb in derselben Änderung:

- **Die Contact-Origin-Prüfung.** Jeder Test dafür geht über
  `contact.ServeHTTP`, und `ServeHTTP` ist die einzige Stelle, die `withFacts`
  ruft — die Tests füllen sich also den Kontext, auf den sie danach prüfen. Bei
  leerem Kontext ist `f.origin == ""`, und das behandelt der Code absichtlich
  als „curl" und lässt es durch. Die ganze Contact-Suite bliebe grün, während
  die Prüfung alles durchließe. Jetzt gibt es einen Test über den
  **zusammengebauten** Handler.
- **`TestASpentContactBudgetLeavesTheReadsAlone`** behauptete, ein Lesepfad sei
  kein 429 — was auch dann stimmt, wenn der Contact-Limiter nie angewandt wurde.
  Er belegt jetzt zuerst, dass der vierte POST wirklich 429 ist.
- **Die Doku-Routen.** 304 und gzip standen nur in `httpx/docs_test.go`, gegen
  einen Mux, den der Betrieb nie sieht. Beide werden jetzt zusätzlich durch die
  Kette geprüft.

### 5. Kein Handler gibt je ein generiertes Problem-Antwortobjekt zurück

Als Regel aufgeschrieben, weil die Typen bereitliegen und richtig aussehen. Ihr
`Visit` schreibt Status und Körper — **kein** `Cache-Control: no-store`, **kein**
`requestId`, **kein** `instance`, die ADR 0009 alle drei von jeder Fehlerantwort
verlangt. Jeder Fehler wird als `error` zurückgegeben und in einem `writeError`
des Pakets abgebildet.

## Konsequenzen

**Stufe C endet mit vierzehn von vierzehn montierten Operationen**, und das ist
belegt statt behauptet.

**E2** findet seine Prüfung gebaut vor. Was dort bleibt, ist die Richtung, die
dieser Test nicht abdeckt: dass die *Antworten* zum Contract passen, nicht nur
die Pfade.

**Jeder künftige Endpoint** wird von diesem Test eingefordert, sobald er im
Contract steht. Eine Operation zu ergänzen und den Handler zu vergessen ist ab
jetzt ein roter Build und kein 404 in vier Monaten.

**Der Umbau bleibt möglich.** Nichts hier verbaut ihn; die Handler behalten die
Form des Strict-Servers. Er müsste nur die vier Posten aus §1 bezahlen, und der
teuerste ist, die vier Adapter im selben Commit zu löschen, in dem er montiert.

### Was das kostet

**Die Handregistrierung bleibt Handarbeit.** Jede neue Route ist weiterhin eine
Zeile, die jemand schreibt. Sie ist nur nicht mehr unbewacht.

**Der Test beweist, dass montiert wurde, nicht dass der generierte Weg genommen
wird.** Ein Handler, der den Pfad des Contracts bedient und etwas anderes
antwortet, als der Contract sagt, fällt hier nicht auf. Dafür gibt es die
Contract-Tests je Paket — und die sind eine Konvention, keine Zusicherung: ein
neues Paket ohne `contract_test.go` merkt niemand. Das ist die echte Lücke,
die bleibt, und sie gehört E2.

**Eine Zusage aus C1 wird nicht eingelöst.** Vier Backlog-Zeilen und drei
Kommentare im Code haben sechs Phasen lang auf diesen Umbau gezeigt. Wer sie
liest, findet jetzt einen Verweis statt einer Erfüllung, und das ist ein
Vertrauensverlust in die eigenen Notizen, den nur diese Datei ausgleicht.

**`routes()` gibt keinen `*http.ServeMux` mehr zurück**, sondern eine
`registry`. Eine Indirektion, die es ohne den Test nicht gäbe — Testbedarf, der
in Produktionscode sichtbar wird. Vertretbar, weil die Alternative eine zweite
Routenliste wäre und damit genau die Drift, gegen die der Test gebaut ist.

## Verworfene Alternativen

**Den generierten Router mit einem dekorierenden Mux montieren.** War der Plan
und ist mechanisch tragfähig: `HandlerWithOptions` nimmt `BaseRouter` als
Interface mit zwei Methoden, also kann ein eigener Mux Muster beim Registrieren
nachschlagen und einzelne Routen umhüllen oder ersetzen. Verworfen an §1 —
nicht daran, dass es nicht ginge, sondern daran, was es kostet und mitnimmt.

**Den Router montieren und die Adapter „für die Tests" behalten.** Der
naheliegende Weg, um vierhundert Zeilen Testcode nicht anfassen zu müssen, und
der schlechteste: die bestgetesteten Stellen des Repos prüften ab sofort Code,
den niemand ausführt.

**Den Contract für die drei Doku-Routen nachziehen** — 304, `If-None-Match`,
CSP, `Vary`, `Content-Encoding` deklarieren — und sie dann sauber über den
Strict-Handler bedienen. Das ist die ehrlichere Fassung und hat mit ADR 0017
einen Präzedenzfall. Sie gehört aber nicht in dieselbe Phase wie ein
Router-Umbau, und ohne sie ist der Umbau nicht ehrlich. Steht als Backlog-Zeile.

**Nur auf `tools/check-contract.sh` warten (E2).** Dann bliebe die Lücke, die
ADR 0016 in Kauf genommen hat, noch eine ganze Stufe offen — und C7 ist die
Phase, in der die letzte Operation entsteht, also die Phase, in der sich die
Vollständigkeit zum ersten Mal überhaupt behaupten lässt.

**Eine Routenliste von Hand im Test.** Der erste Entwurf. Eine zweite Aussage
über den Router, die am Tag ihrer Entstehung stimmt, und deren Ausfallmodus
lautet: „dieser Endpoint war nie montiert."

## Belege

ADR 0016 §2 (die Entscheidung, die dies ablöst, samt ihrer Zusage) · ADR 0009
(warum ein generiertes Problem-Antwortobjekt nicht reicht) · ADR 0015 §3 (der
Geltungsbereich gehört an die Route) · ADR 0017 (Präzedenz für eine
Contract-Ergänzung) · ADR 0021 (die Body-Disziplin, die der generierte Decoder
nicht hat) · `tools/check-contract.sh` Kopfkommentar („E2 checks router parity
against it") · `api/internal/server/router_parity_test.go` ·
`api/internal/httpx/gen.go` (`ServeMux`, `HandlerWithOptions`,
`StrictServerInterface`)
