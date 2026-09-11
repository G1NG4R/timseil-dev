# ADR 0076 — Die Seite, die den Code zitiert, und der Schlüssel, den niemand schreibt

**Status:** Angenommen
**Datum:** 2026-09-11
**Betrifft:** H12b, H12c, L7, K1, M2 — und jeden, der den Text von `/privacy` ändert
**Invarianten:** 1 (keine erfundenen Zahlen), 8 (Tokens), 9 (zwei localStorage-Keys)

## Kontext

H12a hat die Schleife gebaut, damit der Text eine Frist nennen darf (ADR 0075).
H12b schreibt den Text. Der Build-Plan gibt der Phase einen einzigen Satz mit:
*„muss mit dem übereinstimmen, was der Code tut. Nicht umgekehrt."*
(`docs/build-plan.md:1251`)

Das Entwurfsblatt ist vom 16.08.2026. Gegen den Code gelesen, ist es an **sieben**
Stellen nicht mehr wahr. Vier davon standen als Funde im Backlog, drei sind beim
Schreiben dazugekommen. Diese Liste ist der eigentliche Inhalt der Phase.

| Das Blatt sagt | Was der Code tut | Beleg |
|---|---|---|
| *„Nothing is written to a database here"* (`:244`, `:373`) | `contact_messages` hält Name, E-Mail, Nachricht, Hash, IP-Hash, `dwell_ms`, Zeiten — 30 Tage lang | `api/migrations/00006_contact.sql` |
| *„how long you had the form open … neither is stored"* (`:243`) | `dwell_ms` **ist** eine Spalte. Nur `company` wird verworfen | `contract/openapi.yaml` |
| *„I count page views with `[ANALYTICS TOOL]`"* (`:212`) | Es gibt keinen Zähler. Zehn Dienste, keiner zählt Besucher | `compose.yaml` |
| Log-Tabelle mit **IP im Klartext, User-Agent, Referrer**, sechs Felder (`:198`ff.) | Der Handler schreibt keins der drei. Adressfeld ist ein HMAC mit **prozesslokalem** Schlüssel, der beim Neustart verschwindet | `api/internal/middleware/logging.go`, `.../iphash.go` |
| *„Two entries"* über einer Tabelle mit **drei** Keys; mobil *„Three local entries"* (#221) | Genau **einer** existiert: `ts.theme` | `web/lib/theme.ts`, ADR 0046 |
| *„no third party in the request path"* (`:83`, `:229`) | Gilt für diese Anwendung. Über die Infrastruktur davor kann diese Seite nichts versprechen | siehe unten |
| Readout-Zeile `GET /privacy HTTP/2 · 200` (`:437`) | Der Browser kennt den Status der Seite nicht, die er anzeigt, und `HTTP/2` ist geraten. Gemessen sind hier `http/1.1` und `h2`, je nach Verbindung | Navigation Timing API |

## Entscheidung

### 1. Der Text lebt in `web/lib/legal/`, nicht in `web/content/legal/`

ADR 0075 hat `web/content/legal/` vorausgesagt. Diese Vorhersage wird hier
ausdrücklich korrigiert, damit sie nicht als Drift gelesen wird.

`npm test` liest `lib/**` und `styles/**` und sonst nichts. Die wichtigsten
Zusicherungen dieser Phase sind Aussagen über **diese Strings**, und MDX hätte
sie aus der Reichweite von `node --test` genommen. `lib/about/content.ts` trägt
dasselbe Argument in seinem Kopf.

Was dadurch prüfbar wird, steht in `content.test.ts`:

- **Jede Dauer im Text ist eine, die eine Datei durchsetzt.** Ein Regex sammelt
  alle `\d+ (minute|hour|day)s` aus der Prosa und hält sie gegen eine Tabelle,
  die je Zahl die Quelldatei nennt — 14 Tage gegen `ops/loki/loki.yaml`
  (`retention_period: 336h`, geteilt durch 24), 30 Tage und 10 Minuten gegen
  `api/internal/contact/policy.go`. Eine Zahl ohne Quelle ist ein Fehler. Das ist
  Invariante 1, geschrieben für eine Seite aus Fließtext.
- **Eine Sperrliste** für die sieben Sätze oben. Sie ist stumpf: das Wort
  „Umami" darf nirgends vorkommen, auch nicht in einer Aufzählung von Werkzeugen,
  die hier *nicht* laufen. Der Preis ist ein Satz ohne Produktnamen, der Gewinn
  ist eine Behauptung, die niemand versehentlich zurückschreibt.
- **Die Klammern sind eine aufgezählte Menge.** Jede andere lässt den Test
  fallen, und eine gefüllte Klammer muss aus der Liste gestrichen werden, sonst
  fällt er auch. Die Menge kann nur absichtlich schrumpfen.

### 2. Die Frist hält ein Test zusammen, kein neues `make`-Ziel

`retention.test.ts` liest `api/internal/contact/policy.go` und zieht beide
Konstanten heraus — `retentionWindow` und `RateLimitWindow`. Das läuft in
`npm test` → `make check-web` → `make check`, ohne eine Regel in einer Liste von
zweiundzwanzig. CLAUDE.md verlangt einen Vorfall, bevor eine neue Prüfregel
entsteht; dieser ist nicht passiert.

**Der Test fällt auf eine Umformulierung, nicht nur auf einen neuen Wert.** Das
ist der Punkt: der wahrscheinlichere Unfall ist nicht, dass jemand 30 zu 60
ändert — das tut man absichtlich — sondern dass jemand `720 * time.Hour`
schreibt und ein Regex, der nur Ziffern sucht, weiter grün bleibt, während die
Seite eine Zusage macht, die niemand mehr durchsetzt.

Die Gegenrichtung ist ein Kommentar an jeder der beiden Go-Konstanten, der den
TypeScript-Gegenpart und den Test namentlich nennt. Das ist die Klammer, die ADR
0075 unter „Was das kostet" als fehlend benannt hat.

### 3. Die Bewegung gehört dem Stylesheet, JavaScript besitzt nur die Ankunft

Der Mock des Blatts blendet die acht Readout-Zeilen mit
`setTimeout(…, 260 + i * 130)` ein. Hier stehen alle acht im DOM, sobald ihre
Werte existieren; die Staffelung ist `animation … both` mit `animation-delay`
aus `--d-readout`, und `--i` ist ein Zähler, den die Komponente übergibt.
Fortschreibung von ADR 0074.

**Das Keyframe ist `ts-wipe`, das seit G1 ungenutzt in `globals.css` steht.**
Eine Clip-Path-Wische von links nach rechts ist das, was eine Terminalzeile
beim Schreiben tut; ein Fade ist, was eine Karte beim Ankommen tut. Das Blatt
zeichnet ein Log. Ein Keyframe weniger als geplant.

**Und ein Satz, damit niemand eine grüne Zeile falsch liest:** ein JS-Timer
hätte `reduced-motion.spec.ts` **bestanden**, weil dieser Test nach CSS-Bewegung
sucht. Die grüne Zeile beweist die Regel nur, solange die Bewegung im
Stylesheet steht. Der Endzustand ist der Default, also bekommt ein Besucher mit
`prefers-reduced-motion` das vollständige Panel statt eines leeren.

### 4. Der Readout misst das Protokoll und behauptet keinen Status

Die Zeile `REQUEST` sagt `GET <Pfad>` und hängt das tatsächlich ausgehandelte
Protokoll an, wenn die Navigation Timing API eines nennt. Kein Statuscode: ein
Browser sieht den Status des Dokuments, das er gerade anzeigt, nicht. Auf einer
Seite, deren ganzes Argument ist, dass nichts darauf erfunden ist, ist eine zu
drei Vierteln getippte Zeile die schlechteste Stelle für eine Ausnahme.

Der Gegenbeweis ist in `legal.spec.ts` gemessen statt zugesichert: die
User-Agent-Zeile wird gegen `navigator.userAgent` gehalten, die Request-Zeile
gegen `performance.getEntriesByType("navigation")`. Beim ersten Lauf gegen den
lokalen Produktionsserver stand dort `http/1.1` — das Blatt hätte `HTTP/2`
behauptet.

### 5. Die Reichweite der Drittanbieter-Aussage wird benannt, nicht behauptet

07.05 zählt vier Dinge auf, die diesen Server nicht verlassen, und schließt mit
dem Geltungsbereich: **diese Anwendung und die Seiten, die sie ausliefert.**
Über Netzinfrastruktur, die ich nicht administriere, macht die Seite keine
Zusage. Der Satz *„no third party in the request path"* fällt damit weg.

Der Befund, der dahinter steht, gehört nicht hierher — CLAUDE.md hält den
Ist-Stand jeder Sicherheitsfrage dieses Hosts von jeder nach außen gehenden
Fläche fern, und ein ADR ist eine. Er steht in `backlog.local.md`.

Nachprüfbar bleibt die Aussage trotzdem, und das ist der Ersatz für den
stärkeren Satz: die Netzwerkspalte der Entwicklerwerkzeuge zeigt auf jeder Seite
genau einen Ursprung.

### 6. `LAST REVISED` steht auf der Seite, nicht in der Fußzeile

Das Blatt zeichnet die Zeile in der Fußleiste. `docs/design/INDEX.md` nennt das
Chrome-Blatt die **verbindliche Fassung** des Footers, und dort kommt sie nicht
vor; `FooterMeta.tsx` ist auf zehn Seiten byte-gleich und `lib/chrome.ts` ist
gegen genau diese Aussage empfindlich.

Dazu ein inhaltliches Argument: ein Revisionsdatum ist eine Aussage über
**diesen Text**. Auf `/work` wäre es falsch. `legal.spec.ts` hält beide Hälften —
die Zeile ist im `main` und nicht im `footer`.

### 7. Englisch ist die einzige Fassung, und das ist ein Issue, keine Lücke

`/de` und `/fr` liefern englischen Text mit korrektem `textLang`, wie `/about`.
Der Konsistenzlauf nennt DE/FR für Rechtstexte Pflicht (K-03), das Blatt hält es
unter „zwei offene Punkte" offen. Eine maschinelle Übersetzung eines Rechtstexts
wäre schlechter als keine. Fällig vor M6.

## Was das kostet

- **Sieben Korrekturen sind sieben Stellen, an denen Blatt und Seite auseinander
  liegen.** Wer das Blatt öffnet, findet eine Seite, die anders aussieht als die
  Zeichnung. Die Tabelle oben ist die Antwort darauf, und das Orakel
  (`web/e2e/oracle/privacy.gen.json`) trägt jede Geometrie-Abweichung einzeln
  mit Begründung — vier von dreizehn.
- **Zwei Klammern verlassen die Phase nicht.** `[ADDRESS]` und
  `[OVH LEGAL ENTITY AND LOCATION]` sind Angaben, die dieses Repository nicht
  herleiten kann. Sie müssen vor dem Merge gefüllt sein: eine Datenschutzseite,
  die mit `[ADDRESS]` online geht, ist schlechter als keine.
- **`/privacy` ist indexierbar, `/imprint` noch nicht.** Das sieht nach halber
  Arbeit aus und ist die Entscheidung, die `lib/seo/pages.ts` zweimal vorher
  getroffen hat: der Boolean ist pro Zeile, eine Fallstudie war indexierbar vor
  `/work`, die Log-Einträge vor `/blog`. Eine Datenschutzseite, die auf ein
  Impressum wartet, ist eine, die niemand findet.
- **`/privacy` verlinkt `/imprint` nicht.** Das `SEE ALSO`-Feld des Blatts kommt
  mit H12c. `lib/notfound/mounted.ts` hat dieses Urteil schon gefällt: einen
  Stub als Ausweg anzubieten ist eine zweite Sackgasse. Die Fußzeile verlinkt
  beide ohnehin auf jeder Seite.

## Verworfene Alternativen

**07.03 ersatzlos streichen.** Der Abschnitt hat sein Thema verloren, als sich
herausstellte, dass nichts zählt. Ihn zu löschen hätte die fünf darunter
umnummeriert und einen Leser, der genau nach dieser Antwort sucht, ohne eine
gelassen. Er behält seine Nummer und antwortet „niemand". Dieselbe Begründung,
mit der das Impressum aufzählt, was auf es nicht zutrifft.

**`ts404.best` trotzdem nennen, weil Invariante 9 zwei Keys nennt.** Der Key
existiert nicht — H11 liegt hinter dem Launch. Ein Schlüssel im Text, den nichts
schreibt, ist Invariante 1 mit umgekehrtem Vorzeichen: eine erfundene Zahl, die
sich als Vorsicht tarnt. Die Tabelle hat heute eine Zeile, und
`content.test.ts` hält sie darauf fest.

**Eine zweite Kopfzeilen-Komponente für die Abschnittsköpfe.** Das Blatt
zeichnet sie sentence-case und größer als `.sec`. Das sind drei CSS-Regeln, und
`legal.css` liegt nach `ui.css` in der Kaskade. Es gibt eine `SectionHead` auf
dieser Seite, und eine Rechtsseite ist nicht der Grund, zwei daraus zu machen.

**Die 52px des Blatts für die Überschrift nehmen.** Der erste Entwurf tat das,
und `legal.sweep.spec.ts` wurde in einer Zeile rot: eine Klasse mit `font-size`
schlägt `h1 { --t-disp-34 }` aus `layout.css` auf Spezifität, also fiel der
Display-Schritt bei 720 auf dieser Seite aus. Die 404 ist die eine Seite mit
einem eigenen Schritt, und `layout.css` begründet die Ausnahme an Ort und
Stelle. Als `one-display-step` im Orakel vermerkt.

**Ein `check-retention`-Ziel.** Siehe Entscheidung 2. Ein eingefrorenes
`selftest.sh` aufzutauen kostet mehr als der Test, den es ersetzen würde.

## Belege

- `docs/build-plan.md:1251` (H12), `:1337` (L7)
- `docs/design/Legal - timseil.dev.dc.html` — read-only, Artboards 1a–1d
- ADR 0044 (Markup plus ein Aufruf), 0046 (keine Sprachwahl im Speicher),
  0048 (Zustandssprache), 0055 (Tabellen unter dem Schalter),
  0074 (Bewegung gehört dem Stylesheet), 0075 (die Frist)
- `#221` (die dritte localStorage-Zeile), `#43` (die Frist auf der Seite)
