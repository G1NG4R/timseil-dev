# ADR 0067 — Die Insel, die das Rate-Limit erzwingt, und die Uhr, die erst beim Tippen anfängt

**Status:** Angenommen
**Datum:** 2026-09-03
**Betrifft:** H8, H12, L7, M2, und jeden späteren Aufrufer von `/api` aus dem Browser
**Invarianten:** 1 (keine erfundenen Zahlen — hier in zwei Formen: keine erfundene
Dauer, keine erfundene Zusage), 8 (Tokens), 9 (zwei localStorage-Keys — hier
sinngemäß: das Blatt verlangt einen dritten)

## Kontext

`POST /api/contact` steht seit C6 und ist seit L1 zustellbar (mail-tester 10/10,
20.08.2026). Was fehlte, war die Seite. `docs/runbooks/mail.md` sagt es mitten in
einer Abnahmeanleitung: *„Es gibt bis H8 kein Formular."*

Damit ist H8 die erste Phase, in der ein **Browser** dieser Site die API
anspricht. `lib/http/url.ts` hält den Zweig seit G4 offen und nennt den Aufrufer
beim Namen. Der Backlog zählt ihn seit fünf Stufen mit: *„Anfragen des Browsers
an /api: 0."*

Drei Umstände prägen die Phase stärker als der Plantext.

**Das Rate-Limit ist pro Besucher-IP.** ADR 0021 §3 zählt drei Sendungen je zehn
Minuten, und `middleware/clientip.go` glaubt `X-Forwarded-For` nur von einem
Proxy, dem es vertraut. Das entscheidet, wer die Anfrage schickt — nicht der
Geschmack.

**Der Endpoint hat eine stille Antwort.** ADR 0021 §2: Honeypot oder
`dwellMs < 3000` werden mit einem `202` beantwortet, das nirgends hinführt. Keine
Zeile, keine Mail, eine wertlose Quittung. Derselbe ADR notiert unter „Was das
kostet", wer dafür bezahlt, und wo die Reparatur hingehört: *„die Antwort ist
nicht, die Regel zu lockern, sondern das Formular so zu bauen, dass es die Zeit
ehrlich misst."* Das ist diese Phase.

**Das Blatt zeichnet vier Behauptungen.** Ein Demo-Schalter, eine Build-Nummer,
eine Uptime, und eine Fußzeile mit `KEINE SPEICHERUNG AUF DEM SERVER`. Die
letzte ist auf **dieser** Seite falsch: `contact_messages` ist die eine Tabelle
dieses Systems mit personenbezogenen Daten.

## Entscheidung

### 1. Der Browser schickt direkt, und das Limit ist der Grund

Kein Server-Action-Umweg. Schickte Next stellvertretend, käme jede Sendung aus
der Adresse des `web`-Containers, und die **ganze Site teilte sich einen Eimer
von drei je zehn Minuten**. Ein Fallback über Next müsste der API die
Besucher-IP glaubhaft machen — das ist eine Änderung an der Vertrauensgrenze aus
ADR 0015 und wäre ein eigener ADR, kein Nebeneffekt einer Seitenphase.

**Die Lücke wird benannt statt versteckt:** ohne JavaScript gibt es auf dieser
Seite kein Formular. ADR 0066 hat `/about`s Bedienelement für null Byte gebaut,
weil eine Radiogruppe „eines von sechs" nativ hält. Für eine Anfrage, die eine
**Dauer** und eine **Uhrzeit** tragen muss, gibt es kein Formularelement. Was
bleibt, ist die Adresse — serverseitig gerendert, in der Lede, über dem
Formular, dasselbe Postfach einen Schritt länger.

### 2. Die Uhr beginnt beim ersten Tastendruck, nicht beim ersten Paint

Drei Ablesungen wären möglich gewesen und zwei sind falsch:

| | Problem |
|---|---|
| im Render-Body | `performance.now()` macht den Render nicht-idempotent; React darf ihn zweimal ausführen und bekäme zwei Antworten |
| in einem Mount-Effekt | dieselbe Ablesung mit einer Hydration-Abweichung dazu — der Server rendert dieses Markup mit, und seine Uhr ist nicht diese |
| **im Change-Handler** | **gewählt** |

Die Uhr misst damit **weniger** Zeit, als die Seite offen war. Das ist die
sichere Richtung: sie kann die Wartezeit vor dem Senden nur verlängern, und die
unsichere Richtung ist eine Anfrage, die die API stillschweigend verwirft. Es
ist außerdem die engere Lesart der Regel — drei Sekunden Seite in einem
Hintergrund-Tab sind kein Beleg für einen Menschen.

### 3. Gewartet wird in einer Schleife, und die Zahl wird nie aufgerundet

`buildBody` meldet `Math.floor(dwellMs)` und **klemmt nicht auf 3000**. Eine
Aufrundung machte jede zu frühe Sendung legal aussehend und versteckte den
Verlust vor beiden Seiten.

Stattdessen wartet das Formular, und es wartet **wiederholt messend**:

```
for (Versuch 0..7):
    rest = 3000 − (jetzt − Beginn)
    wenn rest <= 0: fertig
    schlafe rest
```

Ein `setTimeout(2957)` darf bei 2956,8 aufwachen; die Ablesung ist dann 2999,7,
`Math.floor` macht 2999 daraus, und **2999 ist unter der Schwelle**. Genau das
ist einmal passiert, im e2e-Lauf, ein Millisekunde breit. Zu früh aufzuwachen ist
eine Eigenschaft von Timern — die Reparatur ist, nach dem Aufwachen erneut zu
messen, nicht dem Schlaf zu trauen und nicht die Zahl hinterher zu korrigieren.

### 4. `apiPost` ist ein eigenes Modul, weil `apiGet` protokolliert

`lib/api/client.ts` schreibt für jeden Upstream-Aufruf eine Logzeile. Auf einem
Server, dessen stdout Alloy einsammelt, ist das richtig. Im Browser zöge es
`lib/log.ts` und `lib/scrub.ts` in ein Bündel mit 6 725 Byte Spielraum
(ADR 0050), um eine Zeile in eine Konsole zu schreiben, die niemand liest.

`Problem` und `ApiResult` liegen jetzt in `lib/api/problem.ts` und werden aus
`client.ts` re-exportiert — kein Aufrufer hat sich geändert. Es ist derselbe
Schnitt, den `client.ts` in seinem eigenen Kopf für `next/*` gezogen hat, eine
Ebene weiter außen. **Nachgemessen:** `resolvePath`, `buildQuery`, `upstreamUrl`
und `API_INTERNAL_URL` kommen im ausgelieferten Chunk nicht vor.

### 5. Ein `400` hat zwei Bedeutungen, und nur eine handelt von einem Feld

`writeError` schickt `validation-failed` auch für einen abgelehnten Origin —
mit **leerem** `invalidParams`, ausdrücklich: *„ADR 0009 says that array is one
entry per rejected field, and an Origin is not one."*

Die Seite unterscheidet die beiden. Bei Feldern sagt sie, die Felder erklären es;
ohne Felder sagt sie, dass niemand einen Tippfehler gemacht hat und dass es an
mir liegt. Ohne diese Verzweigung schickte eine falsch gesetzte Origin-Liste
jeden Besucher auf die Suche nach einem Fehler, den es nicht gibt.

### 6. Kein `HTTP/2` in der Spur

Das Blatt zeichnet `POST /api/contact HTTP/2`. Die Spur wird gerendert, **bevor**
die Anfrage abgeht; welche Version ausgehandelt wird, entscheiden Traefik und
der Browser. Ein lokaler Build über Klartext-HTTP druckte `HTTP/2` und läge
falsch. Eine Version, die diese Seite nicht beobachtet hat, ist eine erfundene
Angabe.

### 7. Vier Behauptungen des Blatts werden nicht gebaut

Demo-Schalter, `BUILD v3.2.1`, `UPTIME [99.98%]`, und der Streifen
`KEIN TRACKING · KEIN COOKIE · KEINE SPEICHERUNG AUF DEM SERVER · 3 EINTRÄGE
LOKAL`. Der Schalter ist eine Canvas-Hilfe. Die zwei Zahlen sind erfunden. Der
Streifen ist auf dieser Seite **falsch**, und „3 Einträge lokal" verlangte einen
dritten localStorage-Key, den Invariante 9 nicht hat.

Ebenfalls gestrichen: *„kopie an dich unterwegs"*. Es gibt keine
Bestätigungsmail an den Absender; das Blatt schlägt sie selbst erst als nächsten
Schritt vor.

### 8. Der Datenhinweis steht am Formular, nicht auf `/privacy`

`/privacy` ist bis H12 eine `[SOON]`-Schale, der Aufbewahrungs-Job ist L7. Mit
dem Merge dieser Phase verarbeitet die Site Name, Adresse, Nachricht, Zeitpunkt
und einen IP-Hash. Ein Formular, das das tut, während die einzige Seite, die es
erklären könnte, `PRIVACY [SOON]` sagt, wäre diese Site beim Bruch ihrer eigenen
Regel — auf der einen Seite, auf der es keine Stilfrage ist. Der Satz am
Formular ist das, was heute wahr ist, und er bleibt wahr, was H12 und L7 auch
beschließen.

## Konsequenzen

**H12** schreibt den vollständigen Text und verlinkt ihn von hier. Der Satz am
Formular bleibt trotzdem stehen: er wird gelesen, eine Datenschutzseite nicht.

**L7** erbt die Zusage. Was hier steht, muss der Aufbewahrungs-Job einhalten —
`docs/build-plan.md:1337` sagt es andersherum: *„der Code muss einhalten, was die
Datenschutzseite verspricht."*

**M2** bekommt die erste Seite, deren Bedienelement ohne JavaScript fehlt. #244
zählt bereits einen Platzhalter, der ohne Skript stehen bleibt; das hier ist der
zweite Eintrag und der größere.

**Das Bündel.** Die Insel kostet **4 873 Byte gzip**, dreimal die Filterinsel von
`/work` (1 635) und das größte Stück Client-Code dieser Site. ADR 0050 ließ
6 725 Byte für sechs Bauteile; drei davon (Terminal, 404-Spiel,
Contribution-Graph) liegen auf anderen Routen, und dass das Gate das nicht sieht,
ist #320 von der anderen Seite gelesen.

**Jeder spätere Browser-Aufrufer** erbt `apiPost`, `PostResult` und die Regel,
dass ein Fehlschlag ein Union-Arm ist. Er erbt auch, dass er nicht protokolliert.

### Was das kostet

**Ohne JavaScript kein Formular.** Der Preis ist benannt, nicht bezahlt: die
Adresse steht darüber, serverseitig gerendert. Wer sie nicht sieht, hat auch die
Seite nicht gesehen.

**Die Uhr unterzählt.** Wer eine vorbereitete Nachricht einfügt und sofort
sendet, wartet volle drei Sekunden statt der Differenz. Drei Sekunden gegen eine
Nachricht, die sonst in einem schwarzen Loch landet.

**Der Trace ist der Stand des letzten Tastendrucks**, nicht der Stand von jetzt.
Eine laufende Anzeige bräuchte einen Intervall und einen Re-Render je Sekunde für
eine Zahl, die niemand abliest; was gesendet wird, wird beim Absenden frisch
gemessen.

## Verworfene Alternativen

**Server Action mit No-JS-Fallback.** Siehe §1: ein Eimer für die ganze Site,
oder eine Änderung an der Vertrauensgrenze.

**Progressive Enhancement mit beiden Pfaden.** Doppelte Tests, und der
Fallback-Pfad hat dasselbe IP-Problem.

**`dwellMs` auf 3000 klemmen.** Siehe §3. Es ist genau die erfundene Zahl, gegen
die der Rest dieser Datei gebaut ist.

**Die Felder beim Senden `disabled`.** Ein `disabled`-Feld nimmt keinen Fokus, und
der Sprung auf das erste Fehlerfeld nach einem `400` tat dann nichts. Das Blatt
wollte ohnehin etwas anderes: *„felder gesperrt, nicht ausgegraut"* — das ist
`readOnly`.

**Die `ch`-Kappen ins Orakel.** `getComputedStyle` liefert einen benutzten Wert,
also Pixel, und die Pixel hängen an der geladenen Schrift: 529,152 im Browser
mit Chakra Petch, 512 im Playwright-Rig. Eine Orakelzahl, die sich mit einer
Schriftdatei bewegt, ist keine.

## Belege

Build-Plan Zeile 1242 (H8), 1071 (C6), 1307 (L1), Anhang B (Formular-A11y).
Handbuch Kapitel 16. ADR 0009 (Fehlermodell), ADR 0015 (Kette, Vertrauensgrenze,
Limiter), ADR 0021 (der Endpoint, die fünfte Antwort, das schwarze Loch),
ADR 0029 (`From`/`Reply-To`), ADR 0050 (Bündel-Budget), ADR 0053 (das Blatt wird
gelesen), ADR 0066 (das Bedienelement ohne Skript).
`api/internal/contact/validate.go:53-55` (die Reihenfolge, auf die der Fokus
baut), `docs/runbooks/mail.md` Teil 3.
