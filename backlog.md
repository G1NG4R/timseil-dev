# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

**Diese Datei ist öffentlich.** Was über *diesen Host* verrät, wie man ihn
angreift — Adressen, Ports, welche Härtung noch aussteht — gehört nach
`backlog.local.md`, das `.gitignore` fernhält und `check-repo` nicht ins
Repository lässt. Hier steht dann die Aufgabe, nicht der Zustand: „gegen L3
geprüft, Ergebnis nicht hier" ist eine vollständige Notiz für einen Notizblock
und eine unvollständige Wegbeschreibung für jemand anderen.

---

## Wo wir stehen — 29.08.2026, G6 in Produktion

**Zum ersten Mal sagt die Seite einen Zustand zweimal.** Ein Wort und eine Form,
und die Farbe kommt erst danach — was heißt, dass die Metaleiste jetzt ein
drittes Wort hat und `— NO DATA` ein Bauteil ist statt zweier Zeichenketten.

Gemessen an `https://timseil.dev`:

```
status ok · sha 46eb852 · v0.14.0
Merge 18:54:14Z → Deploy fertig 18:58:33Z    259 s, ok, Pipeline 33269493541
check-deployed                8 Behauptungen, 1 nicht von hier stellbar
ops                           uptime90d 100 · p95 20,5 ms · errorRate 0

Zustandszellen  / · /de · /fr   je 3      ONLINE · ONLINE · LIVE
                /about          2         die Startseitenzeile fehlt dort
Punkt           6 px in Fußzeile und Menüstreifen, 7 px auf der Seite
Puls            ts-pulse 2.6s              --d-pulse, erstmals gelesen seit G1
Stylesheet      3rf1jyfbzgp5s.css  31 154 B   byte-gleich mit dem lokalen Image
                vier Füllungen überleben den Minifier, --d-pulse bleibt Variable
.foot-dot       0 Treffer                  die alte Regel ist fort

Sieben Paletten ONLINE, Wort und Füllung und Puls unverändert
                #00E5FF · #CBA6F7 · #FFB74A · #2EE6A6 · #7AA2F7 · #7C2FD4 · #076678
Graustufen      BUILD 46eb852 · ● ONLINE · UPTIME 100.00% · api ● LIVE  lesbar

Hydration       4 Ladevorgänge, 4 Kanarienvögel, 0 Treffer, ein <main>
```

### Sieben Paletten sind der bessere Beleg als Graustufen

Das Abnahmekriterium lautet „jeder Zustand hat ein zweites Merkmal neben der
Farbe", und Graustufen prüfen davon nur die halbe Aussage: dass die Information
**ohne** Farbe ankommt. Der Fall, den ein Besucher wirklich herstellt, ist ein
anderer — er schaltet ein Theme um, und dann ist die Farbe nicht weg, sondern
**eine völlig andere**.

Über die sieben Paletten wandert ONLINE durch sieben Farben, von Cyan über
Mauve und Amber bis zu einem Petrol auf hellem Grund, und Wort, Füllung und Puls
sind in allen sieben identisch. Am lokalen Rig kam die Gegenprobe dazu, die
Produktion nicht liefern kann: unter `amber` wandert DEGRADED per Token auf Mint
(`rgb(255,176,0)` → `rgb(127,209,174)`), weil der Akzent dieser Palette selbst
Amber ist — und der Ring blieb ein Ring.

### Der Fund aus G4 ist zu, und er war zwei Zeilen groß

`FooterHealth.online: boolean \| null` hatte drei Darstellungen und zwei
erreichbare Werte. `degraded` wurde als **ONLINE** gezeigt, weil die Leiste kein
drittes Wort hatte; `OFFLINE` stand im Code für eine Antwort, die `/api/health`
nicht bilden kann. Beides ist fort, und was an seine Stelle trat, ist ein Wort
statt eines Booleschen.

**Herstellbar, nicht erfunden:** `api/internal/health/health.go` antwortet
`degraded`, wenn das eigene System nicht `live` ist. Mit
`SITE_SYSTEM_SLUG=no-such-system` am lokalen Rig sagte die Zeile auf `/` nach
zehn Sekunden DEGRADED, Fußzeile und Menüstreifen nach zwanzig — die Differenz
ist `healthCached` mit `revalidate: 60`, und wer nach fünf Sekunden misst, misst
den Cache und hält ihn für einen Defekt.

### Der Puls ist Schmuck, und das ist eine Entscheidung, keine Nachlässigkeit

`globals.css` schaltet unter `prefers-reduced-motion: reduce` **jede** Animation
ab. Ein pulsierender Punkt ist damit für einen Teil der Besucher nicht ein
schwächeres Merkmal, sondern gar keines. Er darf deshalb nur dort stehen, wo die
Füllung den Zustand schon trennt, und `lib/state/words.test.ts` weist alles
andere ab — zusammen mit der Regel, die ohne Test leise verrutscht: **die
Füllung muss zur Klasse der Antwort passen**, niemand darf einem ungemessenen
Zustand die Füllung eines gemessenen geben. Invariante 1 als Unit-Test.

`tokens.css` und `globals.css` sind unverändert. Der gefärbte Puls entsteht,
indem der Punkt `--acc-pulse` und `--acc-pulse-2` lokal neu setzt und damit das
Keyframe des Designers auf seinen eigenen Ton ausrichtet — die Datei, deren Kopf
sagt, dass kein Wert in ihr unserer ist, hat kein Zeichen verloren.

### Zwei Messfehler dieser Runde, und beide waren meine

**`grep -c` zählt Zeilen, keine Vorkommen, und ausgeliefertes HTML ist eine
Zeile.** Mit gestoppter API meldete `grep -c 'st-nodata-text'` die Zahl `2`,
während im Dokument acht standen — vier Platzhalter und vier gestreamte Werte.
Zwei Minuten lang sah es aus, als rendere die Hälfte der Zellen ihren
Ruhezustand nicht. Das ist die vierte aus derselben Familie wie die drei
G4-Fallen und die G5-Falle mit dem angehängten Schrägstrich, und die Lehre ist
wieder eine Reihenfolge: **erst nachweisen, dass die Messung misst, was sie zu
messen glaubt.**

**Und der Befehl, den ich dagegen in den Runbook geschrieben habe, war selbst
ungeprüft.** `grep -o '<span class="st" [^>]*>.*\?</span></span>'` lieferte auf
diesem Rechner das Richtige, weil GNU grep `.*\?` faul behandelte. In BRE ist
das nicht definiert; greedy gelesen zöge das Muster vom ersten Zustand bis zum
letzten `</span></span>` des Dokuments und lieferte **eine** Zeile statt drei.
Ersetzt durch ein Muster ohne `.*`, das zwei Elemente gar nicht überspannen
kann, und verbatim gegen die laufende Seite belegt. **Eine Anleitung, die nie
ausgeführt wurde, ist eine Vermutung mit Syntaxhervorhebung.**

### Die Zahl „vier Bauteile ohne Aufrufer" stimmte nicht

Es sind **fünf**. `StateWord` — das Wort ohne Punkt, für eine Tabellenspalte,
die den Zustand schon in der Überschrift führt — steht in derselben Datei wie
`StatusDot` und ist beim Zählen durchgerutscht; die Vier stand so in ADR 0048,
im PR-Text von **#228** und im ersten Entwurf dieses Abschnitts. Gefunden beim
Nachzählen mit `grep`, nicht beim dritten Lesen des eigenen Satzes.

**Der Fehler ist klein und die Sorte ist es nicht:** eine Zahl über den eigenen
Code, aus dem Kopf geschrieben statt gezählt, in einem Repository, dessen erste
Regel „keine erfundenen Zahlen" heißt. ADR 0048 ist in diesem PR korrigiert;
der PR-Text von #228 ist gemergt und bleibt stehen, mit der Korrektur hier.

### Was die Abnahme nicht behauptet

**DEGRADED und `— NO DATA` sind gegen das lokale Rig belegt, nicht gegen
Produktion.** Beide dort herzustellen hieße, den laufenden Host zu verbiegen —
`SITE_SYSTEM_SLUG` umzustellen oder die API zu stoppen. Was Produktion zeigt,
ist ONLINE und LIVE; die anderen zwei Zustände sind an einem Produktionsbau mit
demselben Stylesheet gemessen, und das Stylesheet ist byte-gleich.

**Zwei der vier Punkt-Füllungen hat noch nie jemand gesehen.** `barred`
(OFFLINE) kann `/api/health` nicht auslösen, `dash` (QUEUED) hat keinen
Aufrufer. Belegt sind sie durch `words.test.ts` und dadurch, dass sie den
Minifier überlebt haben — nicht durch ein Bild. Erster Betrachter: G7s Galerie.

**`prefers-reduced-motion` ist nicht in einem Browser mit der Einstellung
gemessen.** Die Regel steht seit G1 in `globals.css` als `animation: none
!important` auf dem Universalselektor und ist damit stärker als jede Regel
dieser Phase; belegt ist sie durch die Kaskade, nicht durch einen Lauf. Gehört
an dieselbe Stelle wie der 44px-Beleg und die Tastaturbedienung: **Playwright
vor H1.**

**`--host` ist nicht gefahren.** Dass die laufenden Container **diese** Bytes
sind, sieht nur der VPS. Acht Behauptungen von hier, die neunte nicht.

**Ein Browser, ein Rechner, eine Breite.** Die sieben Prüfbreiten sind am
lokalen Produktionsbau über einen Iframe fester Breite gemessen — 390 bis 1440,
Zelle 50 px, kein Overflow —, nicht gegen Produktion.

**Als Nächstes:** G7 — Komponenten-Galerie unter `/dev/components`, nur in
Development, jedes Bauteil × jeder Zustand. **Sie ist der erste Betrachter von
fünf Bauteilen, die G6 gebaut hat und keine Seite rendert** (`EmptyState`,
`ErrorPanel`, `LoadingLines`, `DegradedNotice`, `StateWord`), und der erste Ort,
an dem ein Zustandswechsel von Hand auslösbar ist — also die Phase, in der der
Glitch-Burst aus `lib/state/burst.ts` seine Animation bekommt. Abgenommen ist
G7, wenn alle 15 Bauteile des Handoff-Inventars mit allen dokumentierten
Zuständen sichtbar sind; aus diesem Inventar stehen heute **zwei**, `ThemeSwitch`
aus G2 und `StatusDot` aus G3 und G6.

---

## Vorher — 29.08.2026, G5 in Produktion

**Die Seite spricht zum ersten Mal mit Maschinen, und sie sagt dabei weniger,
als sie könnte.** Vier Adressen, die kein Besucher aufruft, dazu ein Ausweis im
Kopf der Startseite — und drei Stellen, an denen bewusst nichts steht: kein
`lastModified` in der Sitemap, kein Eintrag im Feed, kein `SearchAction` im
Graphen.

**Diese Abnahme misst zwei Merges.** G5 ist in zwei Hälften gebaut worden, G5a
(`4ae69c4`, `v0.12.0`, 13:58 UTC) und G5b (`cc15115`, `v0.13.0`, 15:51 UTC), und
das Abnahmekriterium des Bauplans umfasst beide. G5a hat deshalb keinen eigenen
Abnahme-PR bekommen; seine Zahlen stehen hier, zwei Stunden später als die des
Merges. Gemessen an `https://timseil.dev`:

```
status ok · sha cc15115 · v0.13.0
Merge 15:51:07Z → Deploy fertig 15:54:55Z    224 s, ok, Pipeline 33261367801
check-deployed                8 Behauptungen, 1 nicht von hier stellbar

robots.txt      65 B      Allow: / · Sitemap: …/sitemap.xml
sitemap.xml     1 201 B   3 <url>, 3 x-default        / · /de · /fr
feed.xml        427 B     0 <item>                    application/rss+xml
og.png          52 585 B  1200 × 630                  byte-gleich mit Build und Image
ld+json auf /   1 Element                             kein rohes < im Text

html lang       / en · /de de · /fr fr                die Route trägt sie
main lang       / keins · /de en · /fr en             „KEINE HALBEN SEITEN", in den Bytes
alternate       4 hrefLang + der Feed-Link            auf jeder der 21 Adressen
canonical       / → timseil.dev · /de/about → …/de/about
/en             308 → /        /en/about  308 → /about
/es /english    404                                   eine Sprache ist ein Segment
/about/         308 → /about                          angehängter Schrägstrich
noindex         / indexierbar in allen drei Sprachen  21 Adressen einzeln geprüft
                die sechs Stubs noindex in allen drei

Umschalter      /de/about → EN → /about               html de→en, main en→keins
                Tastatur: 3× ↓ → lang-option-2, Enter → /fr/about
                drei Client-Navigationen, 0 Fehler, 0 Hydration-Warnungen

Schema-Validator  0 ERRORS, 0 WARNINGS                author und publisher über @id
Rich-Results      Crawl ok · „Keine Elemente erkannt"  siehe unten
/api/health       s-maxage=60 · ETag · 372 B → 304/0 B  G4s Zahlen, unverändert
```

### Der Rich-Results-Test kann über dieses Markup nichts sagen, und das ist die Antwort

Der Bauplan schreibt in Zeile 1212 „JSON-LD (`Person`, `WebSite`)" und
„Rich-Results-Test grün" in denselben Satz. Beides zusammen geht nicht. Der Test
meldet ausschließlich Typen, die in der Suche ein *Rich Result* erzeugen —
`Article`, `FAQPage`, `BreadcrumbList`, `Product` und den Rest dieser Liste.
`Person` und `WebSite` stehen nicht darauf; sie speisen Knowledge Panel und
Sitelinks. Der Test hat über sie nichts zu sagen und sagt es: **Crawl
erfolgreich, „Keine Elemente erkannt", keine Fehler, keine Warnungen.** Die
Anzeige nannte 18:13:37 in ihrer eigenen Zeitzone, CEST, also 16:13 UTC.

Grün zu bekommen ginge nur, indem man einen Typ hinzufügt, den diese Seite nicht
hat — erfundenes Markup, um eine Prüfung zu bestehen, und damit genau das, wogegen
die erste Regel dieses Repositories geschrieben ist.

**Das Werkzeug für diese zwei Typen ist der Schema Markup Validator, und der
sagt 0 Fehler, 0 Warnungen.** Der stärkere Teil seiner Ausgabe ist nicht die
Null: `author` und `publisher` standen als `{"@id": …/#person}` im Dokument, und
er hat sie zum Person-Knoten **aufgelöst** und ausgeschrieben. Dass ein
`@graph` mit zwei Knoten, die sich über eine Kennung nennen, von einem fremden
Parser richtig zusammengesetzt wird, ist aus dem Quelltext nicht ablesbar. Nur
aus dem Verhalten.

Als **#224** angelegt, Meilenstein M6 — nicht als Korrektur des Bauplans in
diesem PR. Ein Kriterium nachträglich an sein Ergebnis anzupassen ist keine
Abnahme.

### Der Feed trägt ein Jahr, das niemand geschrieben hat

```
cache-control: s-maxage=31536000
x-nextjs-cache: HIT
```

`app/feed.xml/route.ts` begründet in Zeile 18 ausführlich, warum keine
Cache-Politik erfunden wird: „**NO `Cache-Control` EITHER.** There is no CDN in
front of this origin (ADR 0006)." Die ausgelieferten Bytes widerlegen den Satz.
Next setzt den Header selbst, wenn ein vorgerenderter Route Handler keinen setzt.

Heute ohne Wirkung — ohne CDN adressiert `s-maxage` keinen Leser. Ab H9 stünde
ein Jahr auf einem Dokument, das sich mit jedem Post ändert.

**Die drei Nachbarn sagen etwas anderes.** `robots.txt`, `sitemap.xml` und
`og.png` liefern alle `public, max-age=0, must-revalidate`; Next behandelt
Metadata-Routen anders als einen selbstgeschriebenen Handler. Der Feed bekommt
denselben Header — abgeleitet von den drei Flächen daneben, nicht gewählt, wie
ADR 0045 es für ein Cache-Fenster verlangt. Eigener `fix(web):`-PR, weil eine
Abnahme seit G1 genau eine Datei anfasst.

**Nachgetragen, gegen Produktion gemessen:** #226 ist seit `0fc863e` (`v0.13.1`,
Deploy 16:54:28Z) draußen, und die vier Flächen antworten dort jetzt alle
`public, max-age=0, must-revalidate`. Der Beleg fehlte dieser Abnahme, als sie
geschrieben wurde — sie kannte nur einen lokalen Produktionsbuild.

**Der Fund gehört dieser Abnahme und keiner Prüfung.** `make check` liest keine
Header, und `next build` auch nicht. Sichtbar wird so etwas erst, wenn jemand
die Antwort einer laufenden Maschine ansieht — und das ist die einzige Sorte
Beleg, die dieses Projekt gelten lässt.

### G5a wird hier zum ersten Mal gemessen, zwei Stunden nach seinem Merge

Der Umschalter ist das zweite Kriterium des Bauplans, und er ist der Teil, den
nur ein Browser zeigen kann: im ausgelieferten HTML steht `lang-option` **null
Mal**, die Optionen entstehen erst beim Öffnen. Von `/de/about` aus, mit dem
Kanarienvogel davor:

```
Ausgangslage   /de/about · html lang="de" · main lang="en" · canonical /de/about
Klick auf EN   /about    · html lang="en" · main lang=keins  · canonical /about
Tastatur       3× ArrowDown → aria-activedescendant lang-option-2, Enter
               /fr/about · html lang="fr" · main lang="en" · canonical /fr/about
```

`main lang` ist dabei die ganze Regel in einem Attribut. Auf `/de` und `/fr`
steht `lang="en"` am Block, weil die Wörterbücher leer sind; auf `/about`
verschwindet es, weil Route und Text dieselbe Sprache haben. „KEINE HALBEN
SEITEN" ist damit nicht erklärt, sondern nachzählbar.

**Und die Metadaten wandern bei der Client-Navigation mit** — nach dem Sprung
nach `/about` standen die vier `hrefLang`-Links **und** der Feed-Link neu im
Kopf, auf die neue Adresse gestellt. Das war keine geplante Messung; es fiel
beim Ablesen an und ist der Beleg dafür, dass `seoFor()` auch den Weg über den
Router überlebt.

Drei Client-Navigationen, **null Fehler und null Hydration-Warnungen** — und der
Kanarienvogel war vorher da, sonst bewiese die leere Konsole nur, dass niemand
zugehört hat.

### Eine Messung dieser Abnahme war zuerst falsch, und es war dieselbe Falle wie in G4

Die `noindex`-Verteilung über sieben Routen × drei Sprachen habe ich mit einem
angehängten Schrägstrich abgefragt — `/about/` statt `/about`. Alle einundzwanzig
Adressen meldeten `index`, auch die sechs Stubs, die seit G5a `noindex` tragen.
Zwei Minuten lang sah es nach einem Defekt in `lib/seo/pages.ts` aus.

Es waren Weiterleitungen. Ein angehängter Schrägstrich beantwortet Next mit
`308` auf die kanonische Form; `curl` ohne `-L` bekommt einen leeren Körper, und
ein `grep` nach `content="noindex"` findet in einem leeren Körper nichts. Ohne
Schrägstrich gemessen: `/` in allen drei Sprachen indexierbar, die sechs Stubs
in allen drei `noindex` — **genau drei indexierbare Adressen, genau drei
`<loc>` in der Sitemap.** Die Gegenprobe schließt.

Das ist die vierte aus derselben Familie wie die drei G4-Fallen, und die Lehre
ist wieder dieselbe Reihenfolge: **erst nachweisen, dass die Messung den
Zustand hat, den sie annimmt, dann messen.** Der Zusatz aus dieser Runde ist
klein und übertragbar: *eine Antwort ohne Körper enthält nie das, was man
sucht* — ein `grep -c` darauf gibt `0` und sieht aus wie eine Aussage über den
Inhalt.

Als fünfte Falle in `docs/runbooks/web.md` steht bereits die Schreibweise
`hrefLang`: ein `grep hreflang` über den Kopf findet nichts, und ich bin beim
Bauen von G5b hineingelaufen, obwohl die Warnung seit G5a im Backlog stand. Sie
stand im Abschnitt über die Sprachrouten und gesucht wurde im Abschnitt über die
SEO-Flächen. Sie steht jetzt in beiden.

### Was die Abnahme nicht behauptet

**Der Umschalter ist auf einem Browser auf einem Rechner geprüft.** Chromium,
Desktop-Breite, ein Zeigegerät. Der 44px-Beleg und die Tastaturbedienung auf
`pointer: coarse` gehören an dieselbe Stelle wie in G3 und G4 — Playwright mit
`hasTouch`, vor H1.

**`--host` ist nicht gefahren.** Dass die laufenden Container **diese** Bytes
sind, kann nur der VPS sehen; `check-deployed` sagt es selbst und nennt den
Befehl. Acht Behauptungen von hier, die neunte nicht.

**Der Feed hat null Einträge, also ist der Eintrags-Renderer in Produktion nie
gelaufen.** Maskierung und RFC-822-Datum sind unter `node --test` belegt und
sonst nirgends. Der erste echte Titel kommt in H9, und das ist die Messung, die
zählt.

**Das OG-Bild hat kein soziales Netz je abgeholt.** Gemessen ist, dass die
Adresse ein PNG in 1200 × 630 liefert und dass `og:image` mit Breite, Höhe und
Alt-Text im Kopf steht. Ob eine Vorschau daraus entsteht, sagt erst ein Dienst,
der sie baut.

**Und keine der drei Sprachen ist übersetzt.** `/de` und `/fr` liefern
englischen Text und sagen es am Blockelement. Was hier gemessen ist, ist der
Mechanismus, nicht der Inhalt; P6 füllt ihn.

**Als Nächstes:** G6 — Zustandssprache. Die Bauteile aus STATE.05 zentral:
Leerzustände, Fehlerpanels, DEGRADED, `— NO DATA`, Retry-Zähler, `StatusDot`
mit 2,6 s Puls. Abgenommen ist es, wenn **jeder Zustand ein zweites Merkmal
neben der Farbe** hat. **Zwei Sachen** nimmt G6 aus dieser Phase mit. Die erste
ist ein Bauteil, das schon existiert und noch keinen Namen hat: `— NO DATA`
steht seit G4 als Zeichenkette in `app/[lang]/page.tsx` und seit G5 zusätzlich
in der Fußzeile — G6 ist die Phase, in der daraus eines wird. Die zweite ist
eine Grenze, die G5b gezogen hat und die dort bleiben soll: **eine `.tsx` läuft
unter `node --test` nicht**, weil Node kein JSX transformiert. Jede
Verzweigung, die G6 baut, gehört deshalb nach `web/lib/`, und das Bauteil
darüber ist Markup plus ein Aufruf — die Regel aus ADR 0044, in G5b zum ersten
Mal als Preis benannt statt als Vorsatz.

---

## Vorher — 28.08.2026, G4 in Produktion

**Die Seite liest zum ersten Mal ihre eigene API.** Die drei Zellen der Fußzeile
tragen Zahlen statt `— NO DATA`, und keine davon steht im Quelltext.
`sha-040bc37`, Merge 22:42:46 UTC, Deploy 22:47:08 UTC, 259 s, `ok`, vorher
`sha-810394a`, Version `v0.11.0`. Gemessen an `https://timseil.dev`:

```
status ok · sha 040bc37 · v0.11.0
BUILD · ONLINE · UPTIME       040bc37 · ONLINE · 100.00%   drei Zellen, drei Messungen
uptime90d / p95Ms / errorRate 100 / 42.55 / 0              measuredAt 22:47:23.989Z
— NO DATA in den Bytes        6 auf /, 4 auf /about        die Hülle, vor dem Stream
Hydration-Warnungen           0             9 Ladevorgänge, 7 Routen, Kanarienvogel vorher
Fremd-Origins im Anfrageweg   []            12 Anfragen, alle same-origin
Anfragen des Browsers an /api 0             der Client-Zweig hat bis H8 keinen Aufrufer
ETag                          372 B → 0 B   auf einer 304
Cache-Control                 public, s-maxage=60, stale-while-revalidate=600
Stylesheet                    26 729 B      byte-gleich mit G3 — G4 bringt kein CSS
Uhren                         3, `--:--:--` in den Bytes, tickend im Browser
Zwillings-Fenster             22:47:17 → 22:47:39, 36 Anfragen, 36 × 200
check-deployed                8 Behauptungen, 1 nicht von hier stellbar
```

### Die Fußzeile zeigt den SHA der API, nicht den der Seite — und der Rollout hat es vorgeführt

Zweiundzwanzig Sekunden lang, von 22:47:17 bis 22:47:39, lieferte der **neue**
web-Container die Zelle `BUILD 810394a` — den SHA der **alten** API. Das ist
kein Defekt, sondern die Bauart: `BUILD` kommt aus `Health.sha`, und während des
überlappenden Starts (ADR 0035) redet das neue web mit dem api-Zwilling, der
noch der alte ist. Invariante 1 lässt keine andere Wahl — die einzige gemessene
Quelle ist die API, und der SHA des eigenen Bündels wäre über `NEXT_PUBLIC_` zu
holen, was `eslint.config.mjs` versperrt und ADR 0044 ausdrücklich als den
„ehrlich aussehenden Abkürzungsweg" verwirft.

**Das Labor konnte das nicht zeigen.** Dort tragen beide Container immer
denselben Tag; erst ein echter Deploy stellt web und api kurz auf zwei
verschiedene Stände. Offen bleibt, ob die Zelle das sagen sollte — heute heißt
`BUILD` „der Build, der geantwortet hat", und für zweiundzwanzig Sekunden ist
das ein anderer als der, der die Seite gerendert hat.

### 36 Anfragen, 36 × 200 — und #157 hat seine Zahl gegen Produktion

Der Issue sagte voraus, ab Stufe G mache jeder Deploy aus dem Rollout-Fenster
„a burst of 500s". Eine Anfrage alle drei Sekunden quer durch den Deploy:
**sechsunddreißig Anfragen, sechsunddreißig Mal 200.** Keine 5xx, keine 404.
Genau **eine** Anfrage, 22:47:21, verlor die korrelierte Zeile auf `/` und zeigte
dort `— NO DATA`.

Der Grund ist der Entwurf dieser Phase: `lib/api/client.ts` wirft nie, also wird
aus dem Fenster kein Anwendungsfehler, sondern ein fehlender Wert. Die drei
Kandidaten des Issues sind damit entschieden — **akzeptiert und gemessen**, wie
E5b das Label-Limit akzeptiert und gemessen hat. Das Labor hatte 2 von 56
gesagt; Produktion sagt 1 von 36, und beide Male bei einem Beobachtungsraster,
das gröber ist als das Fenster.

### Der Kanarienvogel steht wieder vorn, und diesmal misst er neun Ladevorgänge

Null Hydration-Warnungen über sieben Routen, plus eine Client-Navigation, die
`<Activity>` benutzt — die Navigationsform, die Cache Components neu einführt.
Die Konsole trug am Ende genau zwei Zeilen, und beide hatte ich selbst
abgesetzt. Nach der Client-Navigation standen die drei Zellen unverändert da:
Kopf und Fußzeile leben im Root-Layout, also fasst Activity sie nicht an.

**Der Stream ist dabei die eigentliche Neuerung, und er ist in den Bytes
nachzählbar.** Auf `/` stehen sechs `— NO DATA` — drei Fußzeilen-Zellen, das
Wort in der Menü-Zeile und die zwei Zeilen der Entwicklungs-Hülle — und
*daneben*, in einem `<div hidden>` am Dokumentende, die echten Werte. Der
Platzhalter ist keine Ladeanzeige, sondern die Ruhelage dieser Leiste; genau
deshalb kostet Streaming hier keine Gestaltung.

### Drei Zahlen dieser Phase waren zuerst falsch, und das ist der teuerste Teil

Ein `grep`, das beim ersten Treffer aufhörte, fand immer den Platzhalter statt
des gestreamten Werts — zwei Minuten „der Cache hält den Fehlschlag fest", und
es war nichts. Ein `docker compose stop` scheiterte an fehlendem `IMAGE_TAG`,
dessen Fehlermeldung ich nach `/dev/null` geschickt hatte; fünfzehn Minuten
„mit gestoppter API" liefen gegen eine laufende. Und zehn Seitenaufrufe
erzeugten zehn API-Anfragen, woraus ich schloss, `use cache` greife nicht — es
war der korrelierte Leser, der auf `/` genau einmal pro Besucher fragt und das
auch soll. Sauber isoliert auf `/about`: **zehn Aufrufe, null API-Anfragen.**

Ein Commit mit falscher Begründung stand bereits geschrieben, bevor der dritte
Fehler auffiel; er ist ersetzt. Die Lehre ist eine Reihenfolge, und sie steht
jetzt als drei Mess-Fallen in `docs/runbooks/web.md`: **erst nachweisen, dass
der Aufbau den Zustand hat, den die Messung annimmt, dann messen** — und die
Fehlerausgabe eines Kommandos, dessen Wirkung man gleich behauptet, nie
unterdrücken.

Ein vierter Fall gehört dazu, und er hätte teuer werden können: das Rate-Limit
der API ist 120/min **pro Client**, und am API-Ende ist der ganze web-Container
ein Client. Seit G4 ist jede beobachtete Seitenanfrage auch eine gezählte. Zwei
Zeugen parallel liegen genau auf dem Limit; ein daraus entstehendes `429` hätte
sich als Deploy-Fenster gelesen.

### Was die Abnahme nicht behauptet

**Keine Span-Ansicht.** Es gibt keinen OTel-Exporter und keinen Tempo-Dienst;
`traceparent` ist auf beiden Seiten handgeschrieben und landet nur als
`trace_id` in Logzeilen. „Ein Trace zeigt den ganzen Weg" ist deshalb als
Log-Korrelation erbracht und **nur** als solche: eine Anfrage, eine `trace_id`,
je eine Zeile in web und api. F6 zieht das SDK ein, F8 macht es sichtbar.

**Die zweite Abnahme des Bauplans ist erbracht — von diesem Doku-Merge, nicht
erst von G5.** „Cache-Invalidierung beim Deploy getestet" heißt: ein Deploy
ersetzt eine veraltete Zahl durch eine neue. Beim Deploy von `040bc37` konnte
das nicht eintreten, weil die vorige Fassung gar keine gecachte Zahl hatte —
also stand hier zunächst, der erste Deploy, der es zeigen kann, sei der von G5.
**Der Merge dieser Abnahme war er schon.** Eine Anfrage alle drei Sekunden auf
`/about`, quer durch den Deploy von `55f8849`:

```
00:02:36 … 00:05:16   BUILD 040bc37    die gecachte Zahl der vorigen Fassung
00:05:19              — NO DATA        ein leerer Cache, in flagranti
00:05:25              BUILD 55f8849    die neue Zahl
```

**48 Anfragen, 48 × 200. Neun Sekunden** vom letzten alten Wert zum ersten
neuen, und dazwischen genau eine Anfrage mit `— NO DATA`. Das ist der Beleg,
und zwar der stärkere von zwei möglichen: der Cache lieferte nicht etwa
sechzig Sekunden lang weiter `040bc37`, sondern war leer — genau das, was
`compose.yaml:583` mit tmpfs beabsichtigt. Niemand hat `revalidateTag`
gerufen; der Container ist gestorben und hat den Cache mitgenommen.

**Keine Cache-Zählung gegen Produktion.** Dass zehn Aufrufe null API-Anfragen
erzeugen, ist im Labor gemessen, wo die Logs der API lesbar sind. Von außen ist
das nicht zählbar.

**Kein Besucher ohne JavaScript.** Die gestreamten Werte kommen in einem
`<div hidden>` und werden per Inline-Skript an ihren Platz gesetzt; ohne
JavaScript bleibt der Platzhalter stehen. Kein falscher Wert, ein fehlender —
mit M2 als Termin.

**Und das Menü unter `<Activity>` ist ein Argument, keine Messung.** Es kann
nicht im versteckten Teilbaum landen, weil `app/layout.tsx` den Kopf als
Geschwister von `{children}` rendert. Der Beleg gehört an dieselbe Stelle wie
der 44px-Beleg aus G3: Playwright mit `hasTouch`, vor H1.

**Als Nächstes:** G5 — `/de` und `/fr` als Routen, `hreflang`, `<html lang>`,
ein funktionsfähiger Umschalter mit **nur EN befüllt**, dazu `sitemap.ts`,
`robots.ts`, RSS, OG über `next/og` und JSON-LD. Abgenommen ist es, wenn der
Rich-Results-Test grün ist und der Umschalter auch mit leeren Sprachen
funktioniert. **Eine Sache** nimmt G5 aus dieser Phase mit — die Invalidierung
war die zweite und ist seit `eb8ff36` gemessen: die Hülle ist vorgerendert und
soll es bleiben. `headers()` im Root-Layout nähme jede Seite aus dem statischen
Pass (ADR 0043), und `<html lang>` ist genau die Stelle, an der ein Wert aus
einer Anfrage in das Wurzelelement will. Der Ausweg ist derselbe wie beim Theme:
die Route trägt die Sprache, nicht der Header.

---

## Vorher — 28.08.2026, G3 in Produktion

**Die Seite hat ihr Gerüst.** Kopf, Menü und Fußzeile stehen auf jeder Seite
gleich, die Uhr läuft, und die Fußzeile trägt zwei Fassungen nach Einsatzplan.
`sha-1656fd4`, Merge 18:22:30 UTC, Deploy 18:26:15 UTC, 222 s, `ok`, vorher
`sha-93dcf81`. `make check-deployed` stellt acht Behauptungen und benennt die
neunte, die es von hier aus nicht stellen kann. Gemessen an
`https://timseil.dev`, im Browser:

```
status ok · sha 1656fd4 · v0.10.0
Hydration-Warnungen             0             14 Ladevorgänge, 7 Routen, Kanarienvogel vorher
--:--:-- im ausgelieferten HTML  3            auf jeder Route, alle drei Uhren
Fremd-Origins im Anfrageweg     []            ein Ziel im Dokument, github.com, aber kein Request
Requests an gstatic/googleapis   0
woff2                            5 Dateien, 99 480 B, alle same-origin
Stylesheet                       26 729 B     vorher 17 513 — das Chrome kostet 9 216
prefers-color-scheme             0 Regeln
Kopfhöhe                        66 / 52       1440·1081·1079·1024 / 899·719·390
Ziele unter 44 px                0 von 20     coarse erzwungen, matchMedia sagt fine
Uhren                            3, gleich    ein Intervall, 18:57:09 → :10
— NO DATA in der Meta-Leiste     3 von 3      BUILD · ONLINE · UPTIME, Punkt ohne Puls
Umschalter                       Fußzeile 1, Menü 0
Konsole                          leer
```

### `--:--:--` im ausgelieferten HTML ist der bessere Beleg als eine leere Konsole

Das Abnahmekriterium des Bauplans für G3 ist eine Abwesenheit: **null**
Hydration-Warnungen. Vierzehn Ladevorgänge über sieben Routen, die Hälfte kalt,
die Hälfte mit gesetztem `ts.theme`, liefern sie — und ein `console.error`
davor beweist, dass der Kanal überhaupt spricht. Trotzdem ist das der
schwächere der beiden Belege. Ein leerer Kanal und ein stummer sehen gleich
aus, und **diese Abnahme hat selbst zwei stumme produziert**: das
`close`-Ereignis eines `<dialog>` erreicht die Erfassung nicht, auch nicht bei
einem nackten Kontroll-Dialog, und `requestAnimationFrame` steht in einem
verborgenen Tab still. Beide Male fehlte nichts, beide Male schwieg die Liste.

Der stärkere Beleg ist eine **Anwesenheit**. Im ausgelieferten HTML stehen
dreimal die acht Zeichen `--:--:--`, auf jeder Route, und ein Fremder holt sie
mit einem `curl` — ohne Browser, ohne Konsole und ohne mir zu glauben. Das ist
der Server-Snapshot. Weil `getServerSnapshot` **immer** den Platzhalter liefert,
liest der Hydrations-Render dieselben acht Zeichen: es gibt keinen zweiten Baum,
über den React sich beschweren könnte. Die Warnung bleibt nicht aus, sie ist
bauartbedingt unmöglich — `suppressHydrationWarning` steht auf dem einen `<span>`
und ließe sich löschen, ohne dass sich etwas ändert.

### Der offene G2-Fund hat einen Punkt weniger, und G3 hat ihn nebenbei geschlossen

Der Fünf-Lücken-Eintrag aus G2 führte unter (2) `accSoft`: das Blatt zählt es zu
den 20 Theme-Variablen, `tokens.css` hatte kein Äquivalent, „→ G6/H". Der Punkt
ist zu, seit `1656fd4` läuft — und nicht, weil jemand die Lücke abgearbeitet
hätte. Das Chrome-Blatt zeichnet **sechs** Alphas des Akzents für vier getönte
Flächen, auf dunklem Grund nicht unterscheidbar; sie zusammenzufassen brauchte
genau dieses Token, und so entstanden `--acc-soft` und `--acc-edge` (ADR 0044).
**Vier Lücken sind offen, fünf standen bis heute in der Tabelle.** Ein
Notizblock, an den nur angehängt wird, wirbt weiter für Arbeit, die getan ist.

### Der Fund über `instrumentation.ts` war schon gefunden, und der Tracker sagt es seit Stufe F

Die drei `Ecmascript file had an error` auf `instrumentation.ts:70,78,79` sind
gemessen und richtig — und sie stehen als **#187** im Tracker, seit Stufe F. Ich
habe sie trotzdem als frischen Fund in diesen Notizblock geschrieben, samt der
offenen Frage, „ob Turbopack hier etwas Echtes meldet oder ob die Meldung nur
Lärm ist". **#187 beantwortet sie seit D1:** Next kompiliert die Datei zusätzlich
für die Edge-Runtime, die diese Anwendung nicht hat, und warnt dort über
`process.on`; der Ausweg wäre die Teilung in eine Node- und eine Edge-Hälfte,
bewusst bis F11 zurückgestellt, mit Abnahmekriterium.

Die Regel dagegen steht in `CLAUDE.md`, und ihr Auslöser ist die F5-Abnahme:
**„Wer nur den Notizblock liest, findet Dinge ein zweites Mal und meldet sie als
neu."** Die Regel war da, die zweite Hälfte des Gedächtnisses habe ich nicht
gelesen. Die Zeile zeigt jetzt auf #187 und bleibt stehen — dass es ein zweites
Mal passiert ist, ist die Information.

Beim Nachlesen fiel die Gegenrichtung auf, und sie ist der teurere Fall:
**#94 trägt den Meilenstein G4 und beschreibt eine Reparatur, die es seit dem
23.08. gibt.** Der Notizblock und der Tracker driften in beide Richtungen, und
nur einer von beiden wird am Ende jeder Stufe triagiert.

### Was die Abnahme nicht behauptet

**Keinen Mobil-Erfolg.** `pointer: coarse` lässt sich in einem gezogenen
Desktop-Fenster nicht emulieren; `matchMedia` bleibt `fine`, gleich wie schmal
das Fenster ist. Gemessen ist deshalb nicht, dass ein Gerät die Query trifft,
sondern dass die Regel für **jedes** Ziel wirklich 44px erzeugt: den
coarse-Block ohne seine Media Query injiziert, dann alle zwanzig Ziele
nachgemessen, keins darunter. Genau dort kann sie still versagen, weil
`min-height` auf ein nicht-ersetztes Inline-Element nicht wirkt. Der Beleg für
die Query selbst kommt mit Playwright und `hasTouch`, vor H1.

**Keinen Dev-Durchgang gegen Produktion.** Die elf Ladevorgänge mit lesbaren
Meldungen und StrictModes doppeltem Aufruf sind lokal gemessen und bleiben lokal
aufgeschrieben. Produktion hat keinen Dev-Modus.

**Und keine Zahl aus dem Quelltext.** `aria-current` erscheint auf `/privacy`
dreimal in den ausgelieferten Bytes und **null**mal im DOM — die RSC-Nutzlast
trägt das Markup ein zweites Mal. Jede Zählung hier kommt aus
`querySelectorAll`; die einzige Ausnahme ist `--:--:--`, und nur weil das eine
Behauptung über die Bytes selbst ist.

### Was die Abnahme gefunden hat

**Das Chrome ist das teuerste Stylesheet der Seite.** Ausgeliefert werden
26 729 Byte CSS, in G2 waren es 17 513 — **9 216 Byte für ein Bauteil**, also
mehr als die Hälfte dessen, was vorher insgesamt da war. Kein Defekt, aber die
Zahl gehört in den Blick, bevor G6 und G7 zwanzig weitere Bauteile bringen.

**Zum ersten Mal steht ein fremder Origin im Dokument.** `FooterLead` verlinkt
`github.com/G1NG4R`. Im Anfrageweg ist er nicht — die Liste der Origins, die der
Browser wirklich holt, hat weiterhin genau einen Eintrag —, aber die G2-Zeile
„Fremd-Origins `[]`" hätte ab jetzt zwei Dinge bedeuten können, und eine Zahl,
die zwei Dinge bedeuten kann, ist keine Messung mehr. Sie steht deshalb mit
ihrem Zusatz da.

**Und die eine Hälfte des G2-Schriftfundes stimmt nicht mehr.** Die Zeile sagt,
Turbopack liefere „im `<head>` kein `<link rel="preload" as="font">`" —
nachgemessen an der laufenden Seite stehen dort **fünf**, und es sind genau die
fünf Dateien, die ein lateinischer Text holt. Die andere Hälfte steht: im
ausgelieferten Stylesheet kommen `size-adjust`, `ascent-override` und
`descent-override` **null**mal vor, der metrisch angepasste Ersatzschnitt fehlt
also wirklich — und das ist der CLS-Teil des Fundes, der zu L8 gehört.

**Als Nächstes:** G4 — API-Client aus den generierten Typen, serverseitig
`http://api:8080`, clientseitig `/api`, die Request-ID durchgereicht; dazu Next 16
Cache Components: die Hülle vorgerendert, die Metriken über `use cache` mit Tags,
und der Deploy invalidiert. Abgenommen ist es, wenn **ein Trace den ganzen Weg
zeigt** und die Invalidierung beim Deploy **getestet** ist, nicht behauptet. Die
Naht liegt schon: `FooterMeta` nimmt `build`, `uptime` und `online` und lässt sie
auf `null` — `— NO DATA` ist der Zustand, den man bekommt, wenn man nichts sagt,
und G4 füllt drei Props, statt eine Fußzeile umzubauen. Der Weg dorthin ist
`/api/health`, wo `version` bereits liegt. Und ADR 0044 hat eine Warnung
hinterlegt, die G4 zuerst liest: **Kopf und Fußzeile nicht in `use cache`
wickeln** — ein `usePathname()` in einer gecachten Grenze friert die Antwort
einer Route ein und serviert sie allen.

---

## Vorher — 28.08.2026, G2 in Produktion

**Die Seite hat ihre Schrift und ihre sieben Paletten.** Chakra Petch, Geist und
JetBrains Mono liegen self-hosted im Image, das Theme steht vor dem ersten Paint,
und ein Klick färbt die Seite um. `sha-aefa8fe`, Merge 12:18:47 UTC, Deploy
12:22:52 UTC, 268 s, `ok`, vorher `sha-3d55bb2`. Gemessen an
`https://timseil.dev`, im Browser:

```
status ok · sha aefa8fe · v0.9.0
Fremd-Origins im Anfrageweg          []        keine, nicht nur keine von Google
Requests an gstatic/googleapis        0
woff2                                 5 Dateien, 99 480 B, alle same-origin
h1                                    Chakra Petch 62px
ohne gespeicherte Wahl                kein data-theme · rgb(10,14,20) · dark
prefers-color-scheme im Stylesheet    0 Regeln
Konsole                               leer
```

### `0 Regeln` ist der bessere Beleg als ein Blick auf einen Bildschirm

Die Entscheidung vom 28.08. — ohne gespeicherte Wahl immer Terminal Noir — hätte
man auch bestätigen können, indem man auf einen dunklen Laptop schaut und nickt.
Der Zweig, der Gruvbox Light lieferte, ist stattdessen **aus dem Stylesheet
verschwunden**: null Vorkommen von `prefers-color-scheme` in den ausgelieferten
17 513 Byte. Die Voreinstellung hängt damit nachweisbar nicht mehr am System,
statt auf einem Rechner nur zufällig richtig auszusehen.

Derselbe Griff hat eine Falle des Entwurfs mitgenommen. Terminal Noir hat keine
ID — es *ist* die Abwesenheit von `data-theme` —, und der Umschalter löscht das
Attribut für ihn. Solange der Media-Zweig existierte, landete ein Klick auf
„Terminal Noir" auf einem hellen Rechner in Gruvbox Light: **der Knopf tat das
Gegenteil seiner Beschriftung.** Die Entscheidung und der Entwurfsfehler hatten
dieselbe Reparatur.

### Der offene Fund aus G1 ist zu, und er hatte einen Zwilling

Link-Unterstrich, `::selection` und die zwei Puls-Schatten standen als
`rgba(0,229,255,…)` da und blieben in sechs von sieben Paletten cyan. Sie sind
jetzt vier abgeleitete Tokens, `color-mix(in srgb, var(--acc) N%, transparent)`
— eine Definition statt vier Werte × sieben Paletten. **Nachgemessen an der
laufenden Seite** mit `ts.theme=amber`: `rgb(12,10,7)` als Fläche, und der
Unterstrich trägt `srgb 1 .718 .29 / .35`, also den Amber-Akzent.

Der Zwilling saß eine Ebene tiefer und wäre ohne den Umschalter nie aufgefallen:
`--glow` stand nur in `:root`, und **nur die zwei hellen Paletten überschrieben
es**. In Mocha, Amber, Phosphor und Tokyo leuchtete also weiter Cyan neben einem
violetten, orangen oder grünen Akzent. `check-tokens.sh` konnte das nie sehen —
`tokens.css` ist die eine Datei, die es nicht liest. Danach ist die benannte
Ausnahme `ACCENT_LITERAL` aus dem Prüfskript gelöscht: eine Ausnahme für etwas,
das es nicht mehr gibt, erlaubt genau das Literal wieder, das gerade beseitigt
wurde.

### Was die Abnahme nicht behauptet

**Die dritte Abnahme des Bauplans, „CSP blockt das Snippet nicht", ist bis L4
trivial erfüllt und wird hier nicht als Häkchen geführt.** `web` setzt heute
keinen der L4-Header. G2 hat das Snippet nonce-*fähig* geschrieben —
`ThemeScript` nimmt die Prop, niemand übergibt sie —, und der Beleg entsteht in
L4. Eine trivial erfüllte Abnahme grün zu melden ist dieselbe Sorte Zahl, gegen
die Invariante 1 steht.

Der Grund für die Reihenfolge steht in ADR 0043 und ist ein Satz, den L4 und G4
beide brauchen: **ein Anti-Flash-Skript und eine vollständig vorgerenderte
HTML-Hülle schließen sich aus, sobald die CSP nonce-basiert ist.** Ein Nonce
heißt `headers()` im Root-Layout, und das nimmt jede Seite aus dem statischen
Pass — genau die Hülle, die G4 vorrendern will.

### Zwei Dinge, die erst CI beweisen konnte

`check-lint` war lokal rot und ist es immer noch: die Installation hier ist
v2.12.2, der Pin sagt v2.13.1. In CI steht `✓ golangci-lint v2.13.1`. **Eine rote
Lampe, die von der eigenen Umgebung kommt, ist keine rote Lampe** — aber sie
kostet jedes Mal die Minute, in der man das nachprüft.

Und die Standalone-Falle ist zum ersten Mal mit echten Font-Dateien geprüft
worden: `✓ .next/static and public are in the web image`. Im Image liegen 23
`.woff2` (252 192 B, alle `unicode-range`-Schnitte); ein lateinischer Text holt
fünf davon. Die anderen achtzehn kosten Plattenplatz und keine Bandbreite.

### Was die Abnahme gefunden hat

**Der aktive Schwatch des Umschalters ist in den zwei hellen Paletten
unsichtbar** — und zwar genau der aktive. Gemessen: Fläche, Rahmen und
Seitenhintergrund alle `rgb(239,241,245)`, Kontrast **1.00**. Ich hatte das als
offene Entwurfsfrage notiert; das war falsch. Der Bauplan sagt in Anhang B
„aktiv = volle Deckkraft **und Akzentrahmen**", `docs/design/README.md`
sagt „den Rahmen in **Akzentfarbe**" — nur der Code-Ausschnitt des Handoffs
schreibt die Schwatch-Farbe, und ich hatte den Ausschnitt höher gewichtet als
die zwei Sätze. `INDEX.md` sagt, wer gewinnt: der Bauplan. Mit `var(--acc)`
steigt der Kontrast auf **5.78** (Latte) und **5.82** (Gruvbox Light).
Eigener `fix/`-Branch, weil es ein Defekt auf der laufenden Seite ist.

**Als Nächstes:** G3 — Kopf (66/52 px, Logo, vier Einträge, `EN ▾`, Uhr), Fußzeile
in zwei Fassungen, mobiles Vollbild-Menü. Die Klassenhaken dafür stehen seit G1
ungenutzt in `layout.css`: `.nav-desktop`, `.nav-button`, `.foot-meta`,
`.sys-pin`, und der Kopf schaltet bei **900**, nicht bei 1080. Der Umschalter
zieht aus `page.tsx` in die Fußzeile, wohin er gehört. Die Uhr bringt ihre eigene
Hydration-Falle mit, und die Abnahme ist **null** Hydration-Warnungen.

---

## Vorher — 28.08.2026, G1 in Produktion

**Die Seite hat ihre Werte.** `web/styles/` trägt `tokens.css`, `globals.css` und
`layout.css` aus dem Handoff, Tailwind 4.3 zeichnet ausschließlich daraus.
`sha-68b2ae5`, Deploy um 06:01:19 UTC, 222 s, `ok`. Gemessen an
`https://timseil.dev`:

```
body       rgb(10,14,20) auf --ink-2      .col        1160px
h1         62px                            oklch       0 Vorkommen
[data-theme]-Blöcke im Stylesheet: 6 + der prefers-color-scheme-Zweig
```

**Die Default-Palette ist nicht abgestellt, sondern gelöscht.**
`@theme { --*: initial }` räumt 288 `--color-*`-Werte über 28 Namen weg, dazu die
erzeugende Abstandsskala und fünf Breakpoints; was danach steht, ist der Bestand
aus `tokens.css`. Das tragende Wort ist `inline`: die Utility bekommt
`var(--bg)`, nicht `#0A0E14` — sonst frören alle Utilities auf Terminal Noir ein
und der Umschalter aus G2 färbte nur handgeschriebenes CSS um.

### Die Abnahme hat zwei Hälften, und keine ist der Test der anderen

`styles/tailwind.test.ts` kompiliert das Stylesheet: `bg-blue-500`, `p-5`,
`rounded-lg`, `md:flex` erzeugen keine Regel, `bg-bg` löst auf `var(--bg)` auf.
Ohne `--*: initial` fallen drei der vier Tests um — nachgemessen, damit sie nicht
aus Versehen grün sind.

`tools/check-tokens.sh` liest stattdessen den Quelltext, **weil keine
Theme-Einstellung `bg-[#ff0000]` verhindern kann.** Neun Selftest-Fälle, in
`make check` und damit in CI: das Protokoll des Laufs auf `main` trägt
`✓ a hex outside tokens.css rejected`.

### Der stärkste Fund kam aus einer Abnahme, die ich zuerst falsch gefahren habe

`make quickstart` klonte im ersten Anlauf **`main` statt des Branches** —
`QUICKSTART_ORIGIN` war nicht gesetzt, also holte `git clone` die veröffentlichte
Fassung. Die Abnahme „von Null durchgelaufen" war damit über den falschen Baum,
und sie stand schon als grün gemeldet da.

Richtig gefahren fiel sie durch: acht API-URLs grün, `http://localhost:3000`
mit 500 und `Cannot find module '@tailwindcss/postcss'` — während `npm ls` im
Container das Paket zeigte. **Zwei Schichten:**

1. `node_modules` ist ein anonymes Volume, `.next` ein benanntes. `up --build`
   fasst keines an; die neue Abhängigkeit erreicht das Image und nie den
   Container.
2. Der erste gescheiterte Start kompiliert sich in `.next` hinein. Deshalb liest
   sich `--renew-anon-volumes` wie ein Fehlschlag: mit erneuerten anonymen
   Volumes weiter 500, nach `docker volume rm …_web-next` sofort 200.

`make dev` stempelt jetzt die Prüfsumme des Lockfiles und weist einen Start ab,
der sie bewegt hat. Bestätigt auf einem fremden Rechner: der `quickstart`-Job
auf `main` ist grün, alle neun URLs.

**Die Lehre ist nicht die Reparatur, sondern die Reihenfolge.** Eine Abnahme, die
den falschen Baum prüft, ist nicht „fast richtig" — sie ist eine erfundene Zahl
mit einem Häkchen daneben. Dieselbe Form wie die F5-Lehre: ich hatte gemeldet,
bevor ich nachgesehen hatte, woher der Beleg kommt.

### Was G1 gefunden und nicht repariert hat

`globals.css` malt Link-Unterstrich, `::selection` und den Puls-Schein mit
`rgba(0,229,255,…)` — dem Akzent von Terminal Noir, ausgeschrieben. Gemessen: die
Linkfarbe folgt dem Theme (`#00E5FF` → Latte `#7C2FD4` → Phosphor `#2EE6A6`), der
Unterstrich bleibt in allen sieben Paletten cyan.

### Zwei Entscheidungen, getroffen am 28.08.2026

- **Ohne gespeicherte Wahl startet die Seite immer in Terminal Noir**, auch bei
  `prefers-color-scheme: light`. Hell erreicht man über den Umschalter aus G2.
  Anlass: ein heller Rechner zeigte Gruvbox Light als ersten Eindruck, und die
  verbindliche Fassung soll die sein, die zuerst zu sehen ist. Gehört in den ADR
  von G2, nicht hierher — hier steht nur, dass sie gefallen ist.
- **Die vier Akzent-Literale werden in G2 repariert**, nicht später: der
  Umschalter macht aus dem Fund einen sichtbaren Fehler.

**Als Nächstes:** G2 — Fonts über `next/font/google`, das Anti-Flash-Snippet
(nonce-fähig geschrieben; die CSP selbst gehört zu L4, Bauplan Zeile 1325) und
der Theme-Weg mit `ts.theme` als einem der beiden erlaubten localStorage-Keys.

---

## Vorher — 27.08.2026, F5 gegen Produktion abgenommen

**Die Seite misst sich selbst.** `metric_snapshots` trägt seit heute Zeilen, die
kein Mensch eingesetzt hat, und der Uptime-Badge bewegt sich zum ersten Mal.
`sha-0f41f81`, gemessen um 18:51:53 UTC:

```
uptime90d   100          p95Ms       24.25
errorRate   0            measuredAt  2026-08-27T18:51:53.505Z
badge       "100.00%"    brightgreen
```

Die `0` bei `errorRate` ist der `or … * 0`-Zweig aus F3, in Produktion bis in
die Spalte durchgezogen: **gemessen, nicht leer.** Gegenprobe um 19:00 UTC, ein
Tick weiter, `measuredAt 18:56:53.499Z` — die Schleife tickt.

### Das Abnahmekriterium hat sich selbst vorgeführt, und niemand hat es gestellt

Die vier Logzeilen der ersten zwanzig Minuten, **gekürzt auf Zeitstempel,
Zustand und Werte** — die Zeilen selbst sind JSON, und aus der ersten ist die
Adresse des DNS-Servers entfernt, weil sie Host-Zustand ist:

```
18:36:53  not measured      dial tcp: lookup timseil-prometheus on <…>: server misbehaving
18:41:53  nothing measured
18:46:53  written           p95_ms 197.5   error_rate 0
18:51:53  written           p95_ms  24.25  error_rate 0
```

*(Dass hier „gekürzt" steht, ist die Lehre aus dieser Phase: im ersten Anlauf
stand in dieser Datei ein Ausschnitt, den so kein Lauf produziert hatte, als
„mechanisch nachgeprüft" ausgegeben. Ein zurechtgeschnittener Beleg ist in
Ordnung, solange der Schnitt dabeisteht.)*

**Der erste Lauf ist im DNS gescheitert.** Die Schleife läuft absichtlich sofort
beim Start (ADR 0019 §8: ein Prozess, der öfter neu startet als der Tick, misst
sonst nie) — und traf den Alias `timseil-prometheus`, während der
Prometheus-Container gerade neu erzeugt wurde. Beide waren dreizehn Minuten alt,
als wir nachsahen; sie sind gemeinsam hochgekommen.

Was daraufhin passierte, ist wörtlich das Abnahmekriterium aus Bauplan Zeile
1174: kein Absturz, keine erfundene Null, **keine Zeile geschrieben**, eine
WARN-Zeile, geheilt beim nächsten Tick. Der zweite Lauf sagt ehrlich `nothing
measured` — das Fünf-Minuten-Fenster war wirklich leer, der Deploy-Verkehr von
18:36:24 lag knapp davor. Erst der dritte hatte Verkehr.

**Das Labor konnte diesen Fall nicht erzeugen.** `make check-snapshots` stoppt
Prometheus absichtlich; hier ist er von selbst kurz nicht auflösbar gewesen, an
einer Stelle, an die niemand gedacht hatte. Eine Abnahme, die den Fehlerfall
provoziert, prüft die Reaktion. Diese hier hat sie *beobachtet*.

**Für F10 ist das eine Vorgabe:** jeder Deploy erzeugt diese WARN-Zeile. Ein
Alarm auf `not measured` würde bei jedem Deploy feuern — er gehört an die
Burn-Rate, nicht an einen Pager.

### Die Zahl, die stimmt und zu stark klingt

`uptime90d` steht auf **100**, und das Raster daneben sagt: **5 × `ok`, 86 ×
`nodata`** von 91 Zellen.

Arithmetisch ist die 100 richtig — ein Tag ohne Messung trägt zu keiner der
beiden Summen bei, das ist Invariante 6, und die Alternative (ihn als Ausfall
zählen) wäre die schlimmere Lüge. Rhetorisch trägt sie zu dick auf: der Badge
sagt „100.00 %" über 91 Tage, und gemessen wurden fünf. **Dieselbe Form wie der
Bucket-Fund aus F3** — die Zahl stimmt und behauptet mehr, als sie weiß.
Aufgeschrieben in `docs/slo.md`, nicht weggerechnet.

### Und der Grund dafür ist gemessen worden

Die externe Sonde läuft mit **einem Zehntel ihres Takts**. Über die letzten 100
Läufe, 81,4 Stunden, 24.08. bis 27.08.:

```
konfiguriert (3-58/5)   12 Läufe/h
tatsächlich              1,23 Läufe/h   =  10 %
Abstände                 min 13 · median 36 · max 660 Minuten
Abstände unter 6 min     0 von 99
```

**Der konfigurierte Fünf-Minuten-Takt ist kein einziges Mal erreicht worden.**
GitHub verwirft geplante Läufe unter Last; der Workflow-Kommentar ahnt es
(„GitHub's cron queue").

**Korrigiert bei der Triage am selben Tag:** hier stand „gemessen hatte es
niemand", und das war falsch. Am 24.08. war es schon gemessen und als
[#180](https://github.com/G1NG4R/timseil-dev/issues/180) eingetragen — 41 Läufe
in 23,66 h, 14 %, echtes Intervall 35 Minuten, mitsamt derselben
`down_sec`-Folge und demselben Faktor. Ich hatte `backlog.md` gelesen, wie
CLAUDE.md es verlangt, und **nie in den Issue-Tracker gesehen** — die andere
Hälfte desselben Gedächtnisses, und genau die, in die eine Triage einräumt.

Was von der heutigen Messung bleibt, ist eine **zweite, größere Stichprobe, die
zeigt, dass es schlechter geworden ist**: 10 statt 14 %, dazu ein Extremwert von
elf Stunden und die Zeile, die es am schärfsten sagt — 0 von 99 Abständen unter
sechs Minuten. Als Kommentar an #180 angehängt, nicht als zweites Issue.

**Als Nächstes:** Stufe F triagieren (F6–F11 liegen hinter dem Launch) und die
Sondenkadenz entscheiden.

---

## Vorher — 27.08.2026, F5 gebaut und im Labor abgenommen

**Die Seite hat ihre drei Zahlen — jetzt wirklich auf der Seite.** Seit B2 gibt
es `metric_snapshots`, seit F3 rechnen die Regeln, und dazwischen lag nichts.
`internal/snapshots` schließt die Lücke: alle fünf Minuten eine Instant-Query,
eine Zeile nach Postgres, und am Verhalten des Lesepfads änderte sich nichts.
Im Labor über den Proxy abgefragt, den Weg eines Besuchers:

```
"ops": { "uptime90d": 99.65277777777779,
         "p95Ms": 63.88418079096048,
         "errorRate": 0,
         "measuredAt": "2026-08-27T17:48:38.452Z" }
```

**Zwei der drei Zahlen sind gemessen, die dritte nicht — und das gehört hierhin
und nicht achtzig Zeilen weiter unten.** `p95Ms` und `errorRate` stammen aus
Prometheus, das k6-Last durch denselben Proxy gesehen hat. `uptime90d` **kann**
im Labor nicht gemessen sein: es kommt aus `ops_days`, dort füllt die externe
Sonde, und die hat ein Labor nie geprüft. Für diese eine Abfrage habe ich zwei
`ops_days`-Zeilen von Hand eingesetzt (574 von 576 Prüfungen), nachgerechnet
(`574/576·100 = 99.65277777777779`, auf die letzte Stelle) und danach wieder
gelöscht. Der Weg ist damit belegt, der Wert nicht — den belegt erst Produktion.

Die `0` in der dritten Zeile ist dagegen gemessen und nicht leer — der
`or … * 0`-Zweig aus F3, jetzt bis in die Spalte durchgezogen.

### Der stärkste Fund — und er stand seit F3 als Vertrag im Runbook

**`uptime90d` kann nicht aus Prometheus kommen. Nicht „sollte nicht" — kann
nicht.** Das Mapping, das F3 aufgeschrieben und ADR 0040 §4 unterschrieben hat,
lautete `timseil:service:availability_5m → Metrics.uptime90d, von F5 über 91
Tage aggregiert`. Dieser Prometheus hält **sieben Tage**
(`--storage.tsdb.retention.time=7d`, seit F2, aus gutem Grund: dieselbe Platte
wie Postgres). Eine 91-Tage-Frage ist an eine 7-Tage-Datenbank nicht zu stellen.

Das Unangenehme daran ist nicht der Fehler, sondern seine Form. **Beide Zahlen
waren einzeln richtig und beide standen aufgeschrieben** — die Retention in
`compose.yaml` mit Begründung, das Fenster im Contract mit Begründung. Es gab
keinen Ort, an dem sie nebeneinander standen. Geschrieben hat ihn **eine** Phase,
in zwei Dokumenten — und die nächste hat ihn geglaubt: der Plan für F5 trug das
Mapping als Tatsache, bis die Retention nachgerechnet war. Ein Vertrag, den zwei
Dokumente tragen und eine zweite Phase übernimmt, ist keine Prüfung.

Und die Antwort wäre mit unendlicher Aufbewahrung dieselbe: `availability_5m`
ist **Request**-Verfügbarkeit und blind für den Ausfall, in dem gar nichts
ankam — in dem ist dieser Prometheus selbst tot, er teilt sich den Host.
ADR 0040 §4 hat genau das schon geschrieben und die Entscheidung offen an F5
gegeben. `uptime90d` kommt jetzt aus `ops_days`, also aus der externen Sonde aus
F4, gerechnet in SQL. ADR 0041 §1.

### Die Zeile, die nicht geschrieben wird

Das Abnahmekriterium der Phase ist ein Satz über einen toten Messteil: *„die
Seite zeigt weiter den letzten gültigen Wert mit Alter, statt zu brechen oder
eine Null zu erfinden"*. Er hängt an einer einzigen Entscheidung.

`00005_metrics.sql` **erlaubt** eine Zeile mit drei `NULL` und erklärt sogar,
was sie bedeutete. `LatestMetrics` liest aber `ORDER BY measured_at DESC LIMIT
1` — eine frische Leerzeile wäre die jüngste Messung und verdrängte die letzte
gültige Zahl von der Seite. Die Abnahme wäre grün gewesen (nichts bricht, keine
Null erfunden) und die Seite hätte trotzdem `— NO DATA` gezeigt, während ein
echter Wert danebenlag.

Also: **eine Zeile entsteht nur, wenn mindestens einer der beiden
Prometheus-Werte gemessen wurde.** Fällt Prometheus aus, wird gar nichts
geschrieben — auch nicht die Verfügbarkeit, die aus `ops_days` vorläge. ADR 0041
§5. Mechanisch nachgeprüft, `make check-snapshots`:

```
observability
  ✓ the site serves its own measurement — uptime90d=null p95Ms=63.25757575757572 errorRate=0 at 2026-08-27T17:47:43.318Z   (uptime90d comes from ops_days; a lab has no external probe)
  ✓ prometheus stopped
  ✓ the api starts and answers without prometheus
  ✓ the same values, the same measuredAt — the page ages instead of going blank
  ✓ the failed run is in the log (0 → 1)
  ✓ prometheus back up
  ✓ tools/check-observability.sh --snapshots
```

`uptime90d=null` ist hier richtig und nicht dasselbe wie oben: dieser Lauf hat
keine Zeilen von Hand bekommen. Das Skript sagt den Grund selbst dazu, statt
einen Haken zu setzen, den jemand deuten muss.

### Zwei Regelsätze statt einer Wahl in Go

Der Contract hat je ein `p95Ms` und ein `errorRate`, Traefik liefert zwei
Dienste. Wo aus zwei Zahlen eine wird, entscheidet, was die Zahl **bedeutet**:
das Maximum in Go wäre eine obere Schranke und für eine Quote nicht „Anteil der
5xx an allen Anfragen", was der Contract wörtlich sagt; nur `web` zu lesen
verschwiege einen 500 aus der eigenen API. `slis.yml` bekommt deshalb zwei
`timseil:site:*`-Regeln, die über die **Anfragen** summieren statt über die
Dienste. Die drei aus F3 bleiben unverändert — sie tragen das `service`-Label,
nach dem F9 schneidet und F10 alarmiert. ADR 0041 §2.

Nebeneffekt, und er war die zweite offene Stelle aus ADR 0040: **die Zuordnung
Service → System-Slug ist damit der Regex in der Regel.** In Go steht keine
Tabelle, die zwei Traefik-Namen auf einen Slug abbildet.

### Was das Labor nicht beweisen konnte

`uptime90d` ist im Labor `null`, und das ist richtig: dort hat nie eine externe
Sonde gemessen. Bewiesen ist deshalb der **Weg**, nicht der Wert — die
Arithmetik gegen echtes Postgres (acht `//go:build db`-Tests, darunter der
Zaunpfahl bei Tag 90 gegen Tag 91 und die gemessene Null gegen die fehlende),
und die Strecke bis auf die Seite mit den beiden Zeilen von oben.

**Offen: die Abnahme gegen Produktion.** Dort trägt `ops_days` echte
Sondenmessungen, und erst dort bewegt sich der Uptime-Badge zum ersten Mal.

### Was sonst noch dabei herausfiel

- **`docs/slo.md`** ist ab jetzt die verbindliche Fassung der SLOs — mit der
  Abfrage hinter jedem SLI, dem Fenster, und dem, was jeder *nicht* sehen kann.
  Anhang A und Handbuch-Kapitel 28 verweisen darauf.
- **Zwei Sätze im Runbook waren falsch**, beide seit F3, beide unten in
  „Gefunden".
- **`tools/check-rule-names.sh`** hält die **zwei** Namen, die der Go-Code
  abfragt, gegen `slis.yml` — und seit der Kontrolle auch die Gegenrichtung, auf
  `timseil:site:*` beschränkt: eine Site-Regel, die niemand liest, ist derselbe
  Defekt von hinten. Die drei per-Dienst-Regeln bleiben ausgenommen, sie warten
  auf F9 und F10. Zweites Gate dieser Form nach `check-probe-cadence.sh`, und
  der Auslöser stand auch hier vorher fest: ADR 0040 §4 hat einen Preis auf ein
  Umbenennen gesetzt, bevor jemand umbenannt hat.

### Und der zweitstärkste Fund war die Kontrolle selbst

**Vor dem Push lief ein zweiter Durchgang über den fertigen Diff, und er hat
einundzwanzig Sachen gefunden** — kein einziger Laufzeitfehler, aber zwei echte
Codefehler und, unangenehmer, mehrere falsche Sätze *über* richtigen Code. Die
drei, die weh tun:

1. **Im Backlog stand ein `check-snapshots`-Ausschnitt, den es so nie gab.**
   Gerundet (`p95Ms=48.70`), zwei Zeilen weggelassen, die Fußnote des Skripts
   entfernt — als „mechanisch nachgeprüft" ausgegeben. Ein von Hand geglätteter
   Beleg in einer Datei, deren erster Absatz sagt, dass jede Behauptung an einen
   Beleg gebunden ist. Ersetzt durch die wörtliche Ausgabe zweier Läufe.
2. **Die WARN-Zeile für einen unmöglichen Wert konnte den Wert nicht drucken.**
   `slog` marshalliert `float64` über `encoding/json`, und das lehnt `±Inf` ab —
   herausgekommen wäre `"value":"!ERROR:json: unsupported value: +Inf"`. Genau
   die eine Zahl, für die die Zeile existiert. Der Test daneben prüfte nur den
   Zustand und lief grün darüber hinweg. Beides repariert; der neue Test fällt
   gegen den alten Code, nachgestellt.
3. **`--snapshots` konnte beim zweiten Lauf hintereinander leer grün werden.**
   `docker compose restart` behält das Log, also erfüllte die Zeile des ersten
   Laufs die Prüfung des zweiten. Jetzt wird gezählt statt gesucht — die Ausgabe
   oben zeigt `(0 → 1)`, der Lauf direkt danach `(1 → 2)`.

Dazu ein Wettlauf im selben Skript, der im schlimmsten Fall **den Fehler
gemeldet hätte, den diese Phase verhindert**: `force_run` wartete darauf, dass
`/api/health` antwortet, nicht darauf, dass der Lauf fertig ist. Fiel das INSERT
zwischen die beiden Messungen, meldete das Skript „a failed run wrote a row and
pushed the last good measurement off the page". Jetzt wartet es auf die Logzeile
der Schleife.

Der Rest waren Zahlen und Verweise: „a month ago" für drei Tage, „zwei Phasen"
für zwei Dokumente aus einer, „neun Zeilen auseinander" für zweiundzwanzig,
0,17 Prozentpunkte statt 0,16, `Loki` statt der TSDB, und ein ADR über 91 Tage,
dessen **Dateiname `neunzig` sagte**.

**Die Lehre ist dieselbe wie der Hauptfund, eine Etage höher:** Der Text über
eine Messung driftet leichter als die Messung. Und niemand prüft ihn — es gibt
kein `make check` für einen Absatz.

### Und CI fand zwei weitere, die beide Durchgänge nicht sehen konnten

**Der lokale Linter kann hier seit Go 1.26 nicht mehr urteilen** — v2.12.2
stürzt beim Laden ab, gepinnt ist v2.13.1. Drei Runden lang hieß „`make check`
grün außer `check-lint`" deshalb *ungeprüft*, nicht *in Ordnung*. CI hat den
Unterschied bezahlt:

1. **ST1005**, an einem Fehlertext, der mit `Get "http://…` beginnt — die
   wörtliche Ausgabe von `http.Client`. Repariert nicht mit `//nolint`, sondern
   mit dem echten Typ: `&url.Error{Op: "Get", …}`. Das ist ohnehin genauer, weil
   `errors.Is` und `errors.As` sich dann verhalten wie in Produktion.
2. **Ein Wettlauf in meinem eigenen Test.** `TestTheFirstRunHappensBeforeTheFirstTick`
   wartete darauf, dass die Zeile in der Datenbank steht, und las dann das Log —
   `runOnce` schreibt aber erst die Zeile und protokolliert danach. Auf dem
   Laptop einen Tag lang grün, in CI rot. Jetzt wartet **jeder** Test dieser
   Datei auf die Logzeile, mit der ein Lauf endet, statt auf einen Zwischenstand
   plus 20 ms Schlaf. 200 Durchläufe und `-race` grün.

Der zweite ist der unangenehmere: **ein Test, der auf das falsche Ereignis
wartet, ist kein Test, sondern eine Wette** — und er hat genau die Phase
beschädigt, die davon handelt, dass eine Zahl an einen Beleg gebunden sein muss.

**Als Nächstes:** F5 gegen Produktion abnehmen, dann Stufe F triagieren — F6–F11
liegen hinter dem Launch.

---

## Vorher — 26.08.2026, F3 abgenommen: Labor und Host

**Seit heute hat die Seite ihre drei Zahlen — als Regel, noch nicht auf der
Seite.** `Metrics.p95Ms`, `Metrics.errorRate` und `Metrics.uptime90d` haben ab
jetzt je eine Recording Rule über `traefik_service_*`, und die Namen sind ein
Vertrag mit F5. Sechs Scrape-Jobs statt drei, alle mit Daten:

```
✓ all scrape jobs up — 6 jobs: alloy loki node postgres prometheus traefik
✓ timseil:request_duration_seconds:p95_5m → api=0.0975  web=0.0983
✓ timseil:requests:error_ratio_5m         → api=0       web=0
✓ timseil:service:availability_5m         → api=1       web=1
```

Die Null in der zweiten Zeile ist der Punkt: sie ist **gemessen**, nicht leer.
Der `or … * 0`-Zweig ist genau dafür da, und ohne ihn wäre „keine Fehler" als
„nicht gemessen" auf der Seite gelandet.

**Die Vorbedingung ist gelöst, auf beiden Seiten.** Nicht wir gehen ins
`dokploy-network`, Traefik kommt zu uns ins `observability-network` — unter dem
Alias `timseil-traefik`, den `prometheus.yml` scrapt. Im Labor bewiesen
(`job=traefik` up, 135 Serien) und auf dem Host angehängt.

**Die offene Haltbarkeitsfrage ist beantwortet, und die Antwort ist genauer als
die Befürchtung.** Der Proxy ist ein einfacher Container, kein Swarm-Dienst. Die
Anbindung **übersteht einen `docker restart`** — sie steht in der Container-Config
des Daemons, nicht im Startbefehl. Was sie nicht übersteht, ist ein Neuerzeugen
des Containers, also ein Dokploy-Upgrade. Die Lektion vom 24.08. war ein
*Redeploy*, kein Neustart; die Unterscheidung ist der ganze Unterschied.
Betriebsfest, nicht upgradefest — **der Relay-Fallback aus ADR 0040 bleibt
ungebaut.**

### Der stärkste Fund — und er hat die Abnahme bestanden

**Das Abnahmekriterium war erfüllt und die Zahl trotzdem keine Messung.**
Verlangt war „ein p95, der zu einem k6-Lauf passt": Regel 98 ms, k6 75 ms,
gleiche Größenordnung. Was stutzig machte, war die Richtung — Traefik misst
*weniger* als k6 und lag trotzdem höher.

Traefiks Standard-Buckets sind `0.1, 0.3, 1.2, 5.0` Sekunden. **7582 von 7896
Anfragen lagen im ersten Bucket.** `histogram_quantile` interpoliert dann linear
zwischen 0 und 100 ms — die Zahl ist Arithmetik auf einer Bucket-Kante, und
keine einzelne Anfrage wurde je mit irgendeiner Dauer beobachtet, nur mit
„unter 100".

Das ist Invariante 1 in dem einen Kostüm, das sie nicht erkennt: **kein
fehlender Wert, der sich als vorhanden ausgibt, sondern ein vorhandener, den
keine Beobachtung stützt.** Jeder Wächter im Repo sucht nach dem ersten Fall.

Repariert mit Prometheus' eigenen Default-Buckets, in `compose.lab.yaml` und im
Runbook für die statische Konfiguration des Hosts. Die Abnahme danach, 6 Minuten
Last damit das 5-Minuten-Fenster voll ist, 14 156 Anfragen, 0 % Fehler:

```
k6    http_req_duration p(95)                    72,54 ms
Regel timseil:request_duration_seconds:p95_5m    74,62 ms
```

**Zwei Millisekunden, und die Richtung ist erklärbar** — Traefik misst weniger
als k6 und liegt trotzdem darüber, weil innerhalb des Buckets interpoliert wird.
Der Fehler wohnt an den Bucket-Kanten, und die belastbare Aussage lautet „auf
einen Bucket genau", nicht „72 ms".

**Derselbe Fehler steht eine Etage tiefer noch da, bewusst:** `/api/health`
antwortet in ein bis zwei Millisekunden, liegt damit im untersten Bucket, und
die Regel liefert `0,00475` — wieder eine Interpolation. Traefik nimmt eine
Bucket-Liste, nicht eine je Dienst; die Zahl der Seite ist die des Proxys über
die Seite. Aufgeschrieben statt repariert. Ausgeschrieben in Beitrag 005.

### Und gegen Produktion, am 26.08.

**Der Fund gilt auch dort — und ist dort inzwischen repariert.** Traefik hängt
im `observability-network`, Alias `timseil-traefik`, angehängt ohne Neustart.
Vorher: Voreinstellung `0.1, 0.3, 1.2, 5.0` und **177 von 181** Beobachtungen im
ersten Bucket. Nachher, mit derselben Liste wie im Labor:

```
le=0.005  0     le=0.05   21     ← 19 Beobachtungen in (0.01, 0.025]
le=0.01   0     le=0.075  22     ←  2 in (0.025, 0.05]
le=0.025  19    le=0.1    22     ←  1 in (0.05, 0.075]
```

p95 jetzt 48,4 ms, interpoliert zwischen 0.025 und 0.05 — **immer noch eine
Interpolation**, aber über ein 25-ms-Band mit Beobachtungen auf beiden Seiten
statt über ein 100-ms-Band mit einer Untergrenze von 0. Vorher war das Ergebnis
eine Funktion der Bucket-Wahl, jetzt bewegt es sich mit der Latenz.

**Was diese Zahl nicht ist:** n = 22, alles `code=200 GET`, in Sekunden erzeugt.
Das ist „Auflösung bestätigt", keine Latenz-Baseline — die ergibt sich erst aus
Stunden echtem Verkehr.

**Die Haltbarkeitsfrage ist beantwortet.** `docker restart dokploy-traefik`, und
`observability-network` steht danach unverändert in der Netzliste, belegt an
einer frischen `StartedAt`. Betriebsfest, nicht upgradefest — der Relay-Fallback
aus ADR 0040 bleibt ungebaut.

### Abgenommen gegen Produktion, 26.08.2026, 19:56 UTC

**Sechs Jobs, alle `1`** — `prometheus alloy loki traefik node postgres`. Acht
Container laufen, die zwei neuen Exporter inklusive.

Und die Abnahme selbst, beide Richtungen der Invariante in einer Abfrage:

```
timseil-web@docker    p95 0.0246   error_ratio 0     availability 1
timseil-api@docker    p95 NaN      error_ratio NaN   availability NaN
```

**`web` ist gemessen und liefert eine echte Null** — der `or … * 0`-Zweig
greift. **`api` ist nicht gemessen und liefert `NaN`**, weil die Anfragen nur
auf `/` gingen; die Regel erfindet dafür keine Null. Genau der Unterschied, den
Invariante 1 verlangt, gegen Produktion statt gegen das Labor.

Davor stand dieselbe Abfrage dreimal auf `NaN` — der letzte Verkehr war der
Deploy-Verify, das 5-Minuten-Fenster war leer. Auch das ist die richtige
Antwort, und der Übergang `NaN → 0` ist der eigentliche Beweis.

### Zwei Dinge, die der Deploy nebenbei gelehrt hat

**Der Merge löst die Pipeline sofort aus.** „Command-Feld nach dem Merge" war
die falsche Reihenfolge — das Feld gehört zwischen den grünen PR-Lauf und den
Merge. Der `deploy`-Job scheiterte deshalb einmal mit *„the panel does not run
the rollout this repository defines"*, und das ist die Sperre bei der Arbeit:
sie hielt an, **bevor** irgendetwas lief, die Seite blieb auf dem alten Build.
Kostet einen Wiederholungslauf.

**„Deploy grün" und „die Dienste laufen" sind zwei Aussagen**, und die erste
Messung danach zeigte `node-exporter` und `postgres-exporter` als fehlend, dazu
die Zwillinge noch am Leben. Kein Fehler — die Abfrage fiel mitten in den
Rollout, `deploy.sh` verifiziert nur api und web, Schritt 4 und 5 laufen danach
weiter. Eine Minute später war alles da. **Der Reflex, den ersten Blick zu
melden, wäre der F2-Fehler mit umgekehrtem Vorzeichen gewesen.**

**Als Nächstes: F5** — SLO-Definition und die PromQL-Snapshots nach Postgres.
Erst dort verlassen die drei Zahlen Prometheus und erreichen die Seite;
`Metrics.*` steht bis dahin weiter auf `null`, und das ist so geplant.

---

## Vorher — 24.08.2026, F2 gegen Produktion abgenommen

**Der Stack läuft auf dem Host, und die Abnahme lief in Grafana statt in einem
Skript.** Beide Hälften:

```
up  →  job="prometheus"  job="alloy"  job="loki"      alle 1
{service="api"}  →  JSON-Zeilen mit level, msg, trace_id
```

**Was die zweite Hälfte nebenbei beweist, und es ist mehr als F2 versprochen
hat.** Die angezeigte Zeit `21:58:54.513` (CEST) und das Feld
`"time": "2026-08-24T19:58:54.513388797Z"` sind dieselbe Zeit — **der
gespeicherte Zeitstempel ist der aus der Zeile**, nicht der des Ingests, und
zwar in Produktion statt gegen eine Vorrichtung. Die Nanosekunden aus Go stehen
unversehrt darin. Das war der offene Punkt aus F1a, und er ist damit zweimal
belegt.

Sichtbar sind außerdem die drei Hintergrundschleifen mit ihrer Korrelation —
`contact dispatch`, `ops roll-up`, `contributions refresh`, jede mit `trace_id`.
F1s Arbeit, zum ersten Mal von außen gelesen statt behauptet.

**`job="crowdsec"` steht nicht dabei**, und das ist der eigentliche Beleg dieser
Session: die Datasource hängt über den Alias an *unserem* Prometheus. Ohne den
Alias hätte genau dort der Nachbar geantwortet.

### Was diese Abnahme gekostet hat — vier Fehler, alle im Aufgeschriebenen

Nicht einer davon war im Gebauten. Alle vier standen in Dokumenten, die
behaupteten, was gilt, und die niemand ausgeführt hatte:

1. **Der Rollout startete die drei Dienste nie.** Grün, ausgeliefert, nicht
   gelaufen. Eigener Eintrag unten, dazu `tools/check-rollout.sh`.
2. **`up{stack="timseil"}` kann nie etwas liefern** — `external_labels` hängen
   nur an Daten, die den Server verlassen.
3. **Der Config-Beleg widersprach seinem eigenen Fließtext** (zwei `sha256sum`).
4. **Die Abnahme hätte die eigenen Rollout-Zwillinge als fremd gemeldet.**

Die Gemeinsamkeit ist benennbar: **jede dieser Zeilen war geschrieben und nie
ausgeführt worden.** Der 5-GB-Lauf war gemessen, die Grenzen waren gemessen —
aber der Weg von „gemergt" zu „läuft und wird gelesen" bestand aus Sätzen. Das
ist die Lehre dieser Stufe, und sie gehört in den Beitrag zu F2.

---

## Vorher — 23.08.2026, F2 gebaut

**Seit heute hebt etwas die Zeilen auf, und die Grenze darauf ist gemessen.**
Drei Container mehr: `prometheus`, `loki`, `alloy` — keiner davon mit einem
`depends_on` in seine Richtung, weil die Seite weiterläuft, wenn alle drei weg
sind.

```
✓ prometheus scrapes itself, alloy and loki — all up
✓ loki holds alloy api db loki prometheus web
✓ api: the stored timestamp is the one in the line (2026-08-23T18:51:43.363325483Z)
✓ web: the stored timestamp is the one in the line (2026-08-23T18:51:43.398Z)
```

**Der offene Punkt aus F1a ist damit geschlossen** — Nanosekunden aus Go,
Millisekunden aus Node, beide mit *ihrer eigenen* Zeit in Loki statt mit der des
Ingests. Gemessen gegen die echten Produzenten, nicht gegen eine Vorrichtung.

### Der Fund, und er ist eine Korrektur am eigenen Plan

**Loki hat keine größenbasierte Retention.** Bauplan Kapitel 10 und ADR 0007
verlangen beide eine „Compactor-Grenze ~5 GB" — die Einstellung existiert nicht.
Lokis Retention ist ausschließlich zeitbasiert. Prometheus hat
`--storage.tsdb.retention.size`, Loki hat keine Entsprechung, und eine Zeile in
unserer Konfiguration, die so täte, wäre ein Limit, das durchgesetzt *aussieht*.

Die Decke ist deshalb eine **Rate**, kein Volumen: `per_stream_rate_limit` gegen
den Amoklauf, `ingestion_rate_mb` gegen denselben Flood über mehrere Streams,
die 14 Tage für den Dauerbetrieb. Der Bauplan bleibt unverändert (ADR 0027 §2);
korrigiert wird ADR 0039 und das Runbook, also das, was behauptet, was **gilt**.

### Der zweite Fund kam erst durch die Abnahme, und er hat den Entwurf geändert

Der erste 5-GB-Lauf war **grün und trotzdem falsch**:

| | nur das Loki-Limit | mit Limit an beiden Enden |
|---|---|---|
| `loki-data` | 2 MB | 6 MB |
| **`alloy-data`** | **76 MB** | **3 MB** |
| von Alloy gelesen | 645 022 Zeilen | 1 182 325 |
| an Loki gesendet | 2 379 | 11 606 |
| im Collector verworfen | 0 | 1 162 520 |

Loki hielt seine Grenze und wuchs um 2 MB — der Rückstau lag danach im
Write-Ahead-Log des Collectors, achtunddreißigmal so groß wie der Speicher, den
die Grenze geschützt hatte, **auf derselben Platte wie Postgres**. Ein
Rate-Limit am Ziel entfernt keinen Druck, es verschiebt ihn. Also steht dieselbe
Decke jetzt auch an der Quelle (`stage.limit`, 500 Zeilen/s je `service`,
verwerfend). Beide Zahlen bewegen sich zusammen, und beide Dateien sagen das im
Kommentar.

**Was die Abnahme nicht beweist**, und es steht bewusst hier statt als Haken:
Rate × Retention sind keine 5 GB. Der über Tage gehaltene Flood wächst weiter —
kein Loki-Schalter schließt das, der Wächter dafür ist der Disk-Alarm bei 70 %
aus **F10**.

### Ein dritter Fund, klein und übertragbar

`discovery.docker` liefert **ein** Ziel je Container, nicht eins je
Container-Netz-Paar. Die Regel, die Duplikate von api und web verhindern sollte,
behielt nur Ziele im `*_default`-Netz — und ließ damit genau die Container
durch, die **ein** Netz haben. Vier von sechs Diensten fehlten, der Stack war
grün, Loki halb leer. Die Regel ist weg; die Messung steht als Kommentar in
`ops/alloy/config.alloy`. Ein Duplikat, das man nicht gemessen hat, ist ein
Duplikat, gegen das man keinen Filter schreiben sollte.

**Der Socket ist die eine Ausnahme dieses Repositories**, und sie ist eng: ein
Dienst, ein literaler Pfad, `:ro` erzwungen, drei Selbsttests. Read-only macht
ihn enger, nicht sicher — ADR 0039 §3 sagt das, statt es zu umschreiben.

**Gegen den Host geprüft ist noch nichts.** Der 5-GB-Lauf lief lokal gegen
dieselbe Datei, die dort laufen wird; auf dem Host folgt ein Hash-Vergleich der
geladenen Konfiguration, keine zweite Messung.

**Die drei Fragen an den bestehenden Prometheus sind beantwortet, das Ergebnis
steht nicht hier.** Ausgang, soweit er die Aufgabe betrifft: die Vorbedingung
für den Host-Teil ist erfüllt, es wird nichts doppelt gescrapt, und dabei sind
drei Punkte aufgefallen, die nicht F2 sind und nicht hierher gehören.

**Als Nächstes: ein Alias, dann der Host-Teil von F2** (Netz anlegen, Grafana
anhängen, zwei Datasources, Config-Hash), dann F3, F5.

---

## Vorher — 23.08.2026, F2 ist entblockt

**Gegen [#147](https://github.com/G1NG4R/timseil-dev/issues/147) gemessen, das
Ergebnis steht nicht hier.** Es ist Ist-Stand dieses Hosts und liegt in der
lokalen Datei; öffentlich gehört die Aufgabe und ihr Ausgang, nicht der Zustand.

**Der Ausgang, in drei Sätzen:**

1. **Die Grenzen aus ADR 0027 halten.** `db`, `api` und `web` liegen alle weit
   unter ihrem Limit — nachgetragen als §3a dort, mitsamt dem, was die Messung
   *nicht* beweist: sie war Leerlauf, die Gegenprobe unter Last gehört zu L8.
2. **RAM und Platte sind kein Engpass.** Das war die Sorge, mit der #147
   aufgemacht hat, und beide Antworten sind entspannt genug für F2.
3. **Punkt 1 von #147 ist beantwortet: es gibt eine bestehende Grafana.**

**Damit ist die Entwurfsfrage entschieden, die der Bauplan offengelassen hatte.**
Er sagt an einer Stelle „Prometheus und Loki im selben Dokploy-Stack" und an
anderer „bestehende Grafana-Instanz einbinden. **F2 macht beides:** eigener
Prometheus, eigener Loki, Alloy als Collector im eigenen Stack — die bestehende
Grafana als Oberfläche, mit unseren Datasources.

Der Grund ist ADR 0027s eigene Haltung: **eine Grenze, die wir behaupten, muss
von uns durchgesetzt werden.** F2s Abnahmekriterium ist „ein künstlich erzeugtes
5-GB-Log löst das Limit aus, statt die Platte zu füllen" — das prüft nur etwas,
wenn das Limit in unserer Konfiguration steht und nicht in der eines fremden
Stacks auf derselben Maschine.

**Der Bauplan wird dabei nicht angefasst.** Kapitel 10 trägt drei Zahlen, die die
Messung widerlegt; sie bleiben stehen. ADR 0027 §2 sagt warum: „den Plan an die
Umsetzung anzupassen löscht die Spur dessen, was sich geändert hat." Korrigiert
wird das Dokument, das behauptet, was **gilt** — nicht das, was **geplant war**.

**Als Nächstes: F2a** — der Stack läuft. Dann F2b (die Grenzen sind bewiesen),
F3, F5.

---

## Vorher — 23.08.2026, F4 abgenommen

**F4 ist gemergt und in Produktion belegt.** [#169](https://github.com/G1NG4R/timseil-dev/pull/169),
`dbea559`, Release **`v0.4.0`**, Deploy `ok … 249 s`, gemeldet 14:40:48 UTC.

**`INTERNAL_PROBE_TOKEN` ist bewiesen** — die erste Benutzung überhaupt, seit
E5c als offener Punkt geführt. Der Lauf sagt beides in einer Zeile:

```
probe up https://timseil.dev 489ms
```

`up` heißt hier `GET /` → 200 **und** `POST /api/internal/probe` → 204. Ein
falscher Token hätte den Lauf mit „misconfiguration, not an outage" rot beendet
und **nichts** geschrieben.

**Die Sonde läuft von selbst.** Erster geplanter Lauf 14:56:27 UTC,
`event: schedule`, ohne dass jemand ihn angestoßen hat. **Belegt ist damit das
Anlaufen, nicht die Kadenz** — dazu unten ein offener Punkt, denn die Kadenz ist
der Faktor in `down_sec`.

**Der Beleg steht auf der Seite und ist von außen nachzählbar:**

```
GET https://timseil.dev/api/systems/timseil-dev
vorher :  byState = {"nodata": 91}
nachher:  byState = {"nodata": 90, "ok": 1}
          days[-1] = {"d":"2026-08-23","state":"ok","downSec":0}
```

90 + 1 = 91. Invariante 7 hält.

**`make check-deployed --host`: 10 von 10 Behauptungen**, darunter die zwei, die
nur der Host machen kann — die laufenden Container **sind** die veröffentlichten
Digests, für api und für web.

**Die Zeitreihe auf dem Host, und sie sagt mehr als „grün":**

```
14:40:59  uptime backfill  no log yet     ← Lauf beim Start
14:45:59  ops roll-up      days: 0
14:47:58  ← Sondenzeile (workflow_dispatch)
14:50:59  ops roll-up      days: 1        ← das Raster kippt
14:55:59  uptime backfill  no log yet     ← exakt 15 min nach dem ersten
14:56:34  ← Sondenzeile (schedule)
```

Die 15-Minuten-Kadenz aus `policy.go` ist damit gegen die Uhr belegt, nicht gegen
den Code. `ops_checks` trägt **2 Zeilen, beide `origin = probe`**, keine
`backfill` — richtig, es gab keinen Ausfall. Dass `ops_days.checks_total` bei der
Messung auf **1** stand, ist kein Fehler: der Roll-up lief 14:55:59, die zweite
Zeile kam 14:56:34. Das Raster darf bis zu fünf Minuten hinter den Daten liegen,
`aggregateEvery` ist genau dafür auf `ProbeInterval` gesetzt.

---

### **Tag 1 von 91 ist der 23.08.2026**

Das ist die Zahl, die diese Phase eigentlich liefert. Ab hier ist jede Zelle im
Betriebsraster gemessen. Der Bauplan (Zeile 1481) verlangt **≥ 7 Tage vor
Launch** — frühestes ehrliches Launch-Datum für das Raster: **30.08.2026.**

---

**Was nicht abgenommen ist, und es steht bewusst hier statt als Haken:**

- **Die Backfill-Hälfte.** Sie braucht einen echten Ausfall. Bewiesen gegen einen
  echten Postgres und gegen die Datei, die `probe.sh` selbst geschrieben hat —
  Produktionsbeweis liegt auf **M1**.
- **`source_ref`.** Entsteht erst bei einer Wiedereinspielung, also mit demselben
  Ausfall.
- **Der Uptime-Badge bewegt sich nicht.** `uptime90d` ist weiter `null`, er liest
  `metric_snapshots` — das baut **F5**.

**Als Nächstes: die Messung vor F2** ([#147](https://github.com/G1NG4R/timseil-dev/issues/147)),
dann F2, F3, F5.

---

## Vorher — 23.08.2026, F4 gebaut

**Seit heute misst etwas von außen, und das Raster hat seine erste gemessene
Zelle.** Gegen den Dev-Stack, durch einen Traefik-Ersatz, damit `/` und
`/api/*` unter einer Adresse liegen wie in Produktion:

```
probe up http://127.0.0.1:18090 38ms
{"level":"INFO","msg":"ops roll-up","days":1}

 day        | state | checks_total | checks_up | down_sec
 2026-08-23 | ok    |            1 |         1 |        0
```

`days: 0` stand dort seit C7. Das war richtig — der Endpoint nahm Rohdaten an,
und niemand rief ihn. Jetzt ruft alle fünf Minuten jemand an.

**Der Leser hat den echten Branch erreicht, ohne dass irgendetwas gepusht war:**

```
{"level":"INFO","msg":"uptime backfill","state":"no log yet"}
```

Das ist ein 404 von `raw.githubusercontent.com` auf `ops-data/uptime-log.txt`,
unauthentifiziert, als Normalzustand behandelt. Ein Host, der seit F4 nicht weg
war, hat kein Ausfallprotokoll.

**Was gebaut ist**, in fünf Commits: `api/internal/uptime` (Grammatik,
Expansion, Leser), `BackfillOpsChecks`, `tools/probe.sh`,
`.github/workflows/probe.yml`, `tools/check-probe-cadence.sh`. Dazu ADR 0038,
zwei Runbooks, `UPTIME_TRANSPORT` und der Log-Beitrag 002.

**Die fünf Entscheidungen stehen in ADR 0038**, drei davon abweichend vom
Bauplan oder darüber hinaus: kein SMTP aus dem Workflow (der rote Lauf ist der
Alarm, F10 baut den richtigen Pfad), `GITHUB_TOKEN` mit Job-Scope statt eines
langlebigen PAT, und „`401` ist kein Ausfall, sondern unser Tippfehler".

**Ein zweiter Fund kam erst beim letzten Prüflauf.** `make check-db` fährt mit
`-count=1`, `make check` nicht — und unter `-count=1` waren **meine eigenen**
Tests flakig: `waitFor` wartete auf ein Signal, das die Schleife *vor* der
Logzeile setzt, also las die Zusicherung manchmal ein leeres Log. Der Testcache
hatte das in `make check` verdeckt. Repariert, indem die Naht wegfiel: die
Zusicherungen fahren `runOnce` jetzt synchron, und die Schleife selbst hat
**einen** Test für ihre **eine** Eigenschaft (Start-Lauf, Tick, Stop). Danach die
Suite unter `-race` — das fand den Eintrag zu `internal/contact` unten.

**Der stärkste Fund ist klein und übertragbar.** `time.Parse` akzeptiert einen
Sekundenbruchteil **auch dann, wenn das Layout keinen nennt** — dokumentiert,
und die einzige Stelle, an der die Funktion großzügig ist. `09:15:00.123Z`
parste sauber und formatierte sich zu `09:15:00Z` zurück: eine Schreibweise, die
die Grammatik zu verbieten behauptet, still akzeptiert und gerundet. Die Regel
ist jetzt der Rundlauf selbst, `at.Format(layout) != feld`. Ein Formatstring
beschreibt, was man akzeptieren *will*; die Menge dessen, was ein Parser
akzeptiert, ist meistens größer.

**Was noch fehlt** — beides ist eine Aufgabe für dich, nicht für mich:

1. **`INTERNAL_PROBE_TOKEN` als Repository-Secret.** Muss **vor** dem Merge
   stehen: sobald `probe.yml` auf `main` liegt, läuft die Sonde alle fünf
   Minuten, und ohne Token läuft sie rot. Klickweg in
   `docs/runbooks/github.md`, Abschnitt „Der `probe`-Workflow".
2. **`ops-data` ist lokal einen Commit voraus** (`ec86c83`, der Branch-README
   erklärt jetzt das Dateiformat). Eigener Push, nicht Teil des PR.

**Als Nächstes: F2** — Alloy, Prometheus, Loki. Die offene Vorbedingung dazu
steht weiter unten ([#147](https://github.com/G1NG4R/timseil-dev/issues/147)).

---

## Vorher — 23.08.2026, Stufe F1 abgenommen

**F1 ist gemergt und in Produktion belegt.** [#167](https://github.com/G1NG4R/timseil-dev/pull/167),
`1f56a8c`, Release **`v0.3.0`** (Tagger G1NG4R, kein Bot), Deploy `ok … 245 s`,
gemeldet 11:56:41 UTC.

**Der Beleg steht auf der Seite selbst**, und er ist besser als jeder Log-Grep,
weil ein Fremder ihn nachvollziehen kann:

```
GET https://timseil.dev/  → 200,  x-request-id: d7ae967a…
<dl><dt>api</dt><dd>ok</dd><dt>version</dt><dd>v0.3.0</dd></dl>
```

Diese Zeichenkette ist durch die ganze Kette gelaufen — `proxy.ts` prägt die ID,
`serverFetch` trägt sie zur API, `/api/health` antwortet, der Render zeigt sie.
Und sie nennt die Release-Nummer **dieses** Merges. Dazu: `/healthz` trägt
**keine** `x-request-id` (der `matcher` schließt ihn aus, Traefik fragt ihn
einmal pro Sekunde und pro Backend), und zwei Anfragen bekommen zwei
verschiedene IDs.

**`make check-deployed --host`: 10 von 10 Behauptungen.**

| | |
|---|---|
| head of main | `1f56a8c`, 11:52:33 UTC |
| api-Image | `sha256:b52f3eb79598a96a2d3933c1020bd66de4990f491e22bc4e6f82a80cf9b1ee1a` |
| web-Image | `sha256:10f7142993738c699fbd2caa0b259fda4685a4c8c194c07bd1b4642483877de4` |
| gebaut / läuft seit | 11:53:45 / 11:56:51 UTC |

**Die zwei, die nur der Host machen kann, sind darunter:** die laufenden
Container **sind** die veröffentlichten Digests, für api und für web. Vom Klon
aus sind acht davon grün und die neunte heißt `– not asked here` — geführt wurde
sie auf dem VPS mit

```sh
cd ~/timseil-dev && git pull && sh tools/check-deployed.sh --host
```

Damit ist die Kette vom Commit bis zu den Bytes auf der Maschine geschlossen,
und **auch die Produktionsabnahme von F1a ist nachgeholt** — sie fehlte seit dem
Morgen des 23.08. und stand als Schuld in diesem Abschnitt.

**Als Nächstes: F4, nicht F2** — und die Abweichung von der Bauplan-Reihenfolge
ist bewusst. F4 ist die einzige Phase der Stufe, deren Wert vom **Startdatum**
abhängt: das 91-Tage-Betriebsraster braucht Historie, und Historie lässt sich
nicht nachbauen. Prometheus und Loki halten 7 und 14 Tage — dort kostet ein
späterer Start nichts Dauerhaftes. Dazu hat F4 keine offene Vorbedingung, F2
schon ([#147](https://github.com/G1NG4R/timseil-dev/issues/147): der Host trägt
mehr als diesen Stack), F4 benutzt als Einziges das noch unbelegte
`INTERNAL_PROBE_TOKEN`, und es ist die einzige F-Phase, die etwas erzeugt, das
auf der Seite sichtbar wird. „Im Zweifel Inhalt."

---

## Vorher — 23.08.2026, F1b gebaut

**Eine Anfrage an `/` hinterlässt jetzt eine Zeile in beiden Containern, und
eine ID findet beide.** Gemessen gegen den Dev-Stack, mit einem von außen
vorgegebenen `traceparent`:

```
{"msg":"request","path":"/api/health","status":200,
 "request_id":"eff2c10b…","trace_id":"d2ad2aad…"}                        ← api
{"msg":"upstream request","path":"/api/health","status":200,"duration_ms":88,
 "upstream_request_id":"eff2c10b…","request_id":"dc51add8…","trace_id":"d2ad2aad…"}  ← web
```

`upstream_request_id` **ist** die `request_id` der API-Zeile. Das ist die
Brücke: die API übernimmt eine eingehende `X-Request-Id` nur vom
vertrauenswürdigen Peer, also wird die von web gesendete nicht ihre — web
schreibt deshalb auf, welche es war. Der Wortlaut des Bauplans gilt damit in
einem Sprung, über `trace_id` in keinem.

**Der Fund der Phase steckte nicht im neuen Code, sondern im alten.**
`Scrub("peer 2001:db8:: is gone")` gab in der API seine Eingabe zurück:
`matchAddr` übersprang jeden Kandidaten, der auf einen Doppelpunkt endet, als
Satzzeichen — und `::` ist Syntax. Jede IPv6-Adresse, die auf ihrem Nulllauf
endet, stand seit F1a im Log eines Dienstes, dessen Datenschutzseite keine
verspricht.

**Warum der Fuzzer das nicht finden konnte, ist der übertragbare Teil.**
`FuzzScrubRemovesEveryAddressItCanSee` rescannt mit `addressesIn`, und das ruft
denselben `matchAddr` — die Eigenschaft lautet also „der Filter sieht keine
Adresse mehr, **die er sehen kann**". Ein Kandidat, den der Matcher nie ansieht,
ist einer, nach dem die Eigenschaft nie fragt. Der Web-Test rescannt stattdessen
mit `net.isIP` über jeden Teilstring und teilt keine Zeile mit dem Matcher; er
hat `bA::` in dreitausend Zufallseingaben erzeugt. Beide Seiten tragen die
Reparatur, das Korpus einen Eintrag mehr, und die zwei Rescans bleiben
**absichtlich verschieden**.

**Daraus wurde eine zweite Entscheidung.** `lib/scrub.ts` rief anfangs
`net.isIP` — dasselbe wie der Test. Rausgeflogen ist es aus einem Bauzwang
(Next übersetzt `instrumentation.ts` auch für die Edge-Runtime, wo `node:net`
nicht lädt), und der Umweg war mehr wert als der ruhige Build: seitdem ist
`isIP` ein **unabhängiges Orakel**. Gemessen über sechs Millionen erzeugte
Token: **0 verpasste** von 35 401 Adressen, **0 über-redigiert**. Der erste Lauf
stand bei 0 verpasst und **12 906** über-redigiert — alle eine Zone-Regel, die
nach `%` alles durchließ; die letzten zwei waren `0.0.0.0::`, wo eine
eingebettete IPv4 nicht das Ende der Adresse ist.

**Die PII-Gegenprobe, gegen den echten Fehlerwert im laufenden Container:**

```
raw   : fetch failed: connect ECONNREFUSED 127.0.0.1:9999
logged: fetch failed: connect ECONNREFUSED redacted-ip
```

**0 Treffer** für das Container-Subnetz im gesamten Log beider Container. Das
ist der Fall, für den der Scrubber in web überhaupt existiert — ADR 0035 hat
`api` in Schritt 3 jedes Rollouts kurz weg, ohne Filter schriebe also jeder
Rollout die Adressen mit.

**Der kaputte Fall der Seite:** `api` gestoppt, `/` abgerufen → **HTTP 200**,
`— NO DATA` in beiden Feldern, Web-Zeile mit `status: 0` unter derselben
`trace_id`, kein Absturz. `serverFetch` wirft nie.

**Zahlen der Phase:** `web/` hatte 195 Zeilen Handcode und **null Tests**; jetzt
99 Tests auf `node --test`, ohne neue Abhängigkeit. Der 2 700-Zeichen-Lauf, der
in Go sieben Sekunden kostete, braucht hier 37 ms; die reine Doppelpunkt-Variante
48 ms.

**`v0.2.0` steht auf origin und zeigt auf `26ffaf7`** — den F1a-Merge. Die
Produktionsabnahme von F1a gehört noch hierher nachgetragen, sobald
`make check-deployed --host` gegen sie gelaufen ist; die Zahlen dieser Phase
oben sind Dev-Stack, nicht Produktion.

**Als Nächstes: F2** — Alloy, Prometheus, Loki. Zwei Zeilen unten warten darauf.

---

## Vorher — 23.08.2026, F1a abgenommen

**Jede Zeile der API trägt jetzt `request_id` und `trace_id`, und keine trägt
PII.** Gemessen gegen den laufenden Dev-Stack, nicht gegen Tests:

```
{"level":"WARN","msg":"internal endpoint refused a request","path":"/api/internal/probe",
 "request_id":"c1ae68…","trace_id":"c6526a…"}
{"level":"INFO","msg":"request","method":"POST","status":401,
 "request_id":"c1ae68…","trace_id":"c6526a…"}
```

Handler-Zeile und Access-Zeile unter einer ID — vorher trug nur die zweite eine.
Ein eingehender `traceparent` von außen wurde übernommen (`4bf92f…4736`), die
eingehende `X-Request-Id` nicht: die Unterscheidung ist ADR 0037.

**Der Fund, der die Phase getragen hat, war fremder Text, nicht ein Feld.**
`mail/smtp.go` verpackt die Antwort des Relays in einen Fehler, `contact` loggt
ihn — und eine SMTP-Ablehnung lautet `550 5.1.1 <jemand@example.com>: …`. Über
dem Aufruf stand bereits *„never the address. F1's PII rule."* Die Absicht war
richtig, die Zeile leckte trotzdem. Zwei weitere Stellen kamen beim Durchsehen
dazu: `mail/log.go` schrieb die **komplette Nachricht** (`envelope`), und
`ratelimit.go` schrieb `r.RemoteAddr` im Klartext. Beide sind an der Call-Site
repariert, nicht im Filter — ein Filter hätte in `envelope` die Adresse
redigiert und Name und Text stehen lassen.

Gegenprobe: Kontaktformular mit Name, Adresse und Merksatz abgeschickt,
**0 Treffer** für alle drei im gesamten Container-Log.

**Sechs Fehler sind beim Bauen entstanden. Einen hat das Lesen gefunden, fünf
haben Maschinen gefunden — und der wichtigste war nicht der, den ich gesucht
habe.**

Vom ersten Lauf gegen den Stack:

1. `"message_id":"redacted-email"`. Eine RFC-5322-Message-ID **ist**
   adressförmig, der Filter hat folgerichtig das Feld gefressen, für das die
   Zeile existiert. Genau eine Ausnahme nach Schlüssel, und sie ist eine Aussage
   über den Wert, nicht über den Namen.

Vom Fuzzer, in dieser Reihenfolge:

2. `[redacted-email]` mit Klammern **beendete** den Domain-Scan und ließ das
   Davorstehende wie eine gültige Domain aussehen.
3. Zwei getrennte Durchläufe (erst E-Mails, dann IPs) störten einander:
   `a@b.tld@c.tld` ließ die zweite Domain stehen, und bei `0@::0.XA` **baute**
   die IP-Redaktion eine E-Mail, die es nicht gab. Jetzt ein Durchlauf — was er
   schreibt, wird nie wieder gelesen.
4. **Ein echtes Leck:** bei `::0.::0` blieb das erste `::0` stehen, weil nur der
   *maximale* Lauf probiert wurde. Und der Lauf-Anfang-Test, der das linear
   halten sollte, war derselbe Fehler noch einmal: bei `::0X%::0` beginnt der
   zweite Lauf bei `%`, `%::0` parst nicht, das `::0` darin wurde nie probiert.
5. **Der wichtigste, und er ist kein Leck, sondern eine Zeitbombe in der
   Gegenmaßnahme selbst.** Ein Lauf aus 2 700 Doppelpunkten und Ziffern brauchte
   **sieben Sekunden** im Logger — und `r.URL.Path` ist nicht längenbegrenzt. Der
   Filter, der das Log schützen soll, wäre der Weg gewesen, den Dienst
   anzuhalten. Ein Kandidat ist jetzt auf 64 Zeichen begrenzt, und der Pfad in
   der Access-Zeile auf 256 — dieselbe Antwort, die `internal/contact` einer
   Origin seit C6 gibt.

Dazu die Erkenntnis, dass **Idempotenz keine erreichbare Eigenschaft ist**: der
Marker ist entweder aus Domain-Zeichen gebaut und wird Teil einer Domain, oder
er ist es nicht und beendet eine — beide Formen sind Duale. Geprüft wird
seitdem, was tatsächlich versprochen ist: *was der Filter erkennt, entfernt er.*

Keiner dieser fünf wäre in einem Review aufgefallen. Das ist der Grund, warum
`traceparent.Parse` und `Scrub` je einen Fuzz-Test tragen und das Korpus der
widerlegenden Eingaben im Repository liegt.

**Kosten, gemessen statt behauptet:** die Zeile, die jede Anfrage schreibt,
kostet **104 ns und null Allokationen**; eine Zeile mit einer echten
Relay-Ablehnung 6,9 µs.

**Zahlen der Phase:** 48 Call-Sites auf `…Context` umgestellt, 13 handgesetzte
`request_id`-Attribute entfernt (`slog` dedupliziert nicht — zwei gleiche
Schlüssel in einem Objekt sind gültiges JSON, dessen Bedeutung vom Parser
abhängt). `internal/reqid` und `middleware/requestid.go` **unverändert**, wie es
der Kopfkommentar von `reqid.go` seit C1 versprochen hatte.

**Als Nächstes: F1b** — Web-Logger in derselben Form, `proxy.ts`, `serverFetch`,
und der Beweis über beide Container.

---

## Vorher — 23.08.2026, der erste Text vor der ersten Seite

**Zwei Entscheidungen, beide gegen die Reihenfolge des Bauplans, beide bewusst.**

1. **Der erste Log-Beitrag ist geschrieben, bevor es einen Renderer gibt** —
   `web/content/posts/001-zero-downtime-measured-not-claimed.mdx`, englisch,
   über Stufe E: der 404-Trichter, die drei Messungen, der Zweizeiler, der in
   beiden Hälften falsch war, und die Grenze, die benannt statt wegoptimiert
   wurde. Gerendert wird er in H9; bis dahin ist er Text im Repository, den
   keine Prüfung anfasst. Grund: die Zahlen verfallen nicht, die Erinnerung
   daran, **warum** jede so aussieht, schon.
2. **Eine Fallstudie, viele Beiträge.** Die Fallstudie (H1/H2) ist eine Seite
   pro System; eine zweite gibt es mit einem zweiten System (P7), nicht mit
   einer neuen Stufe. Die Stufen-Tiefe gehört nach `web/content/posts/`. Damit
   ist der E-Beitrag der CI/CD-Beitrag und nicht Kapitel 1 von sechs.

**`CLAUDE.md` hat einen Abschnitt `Maß halten`** — fünf Regeln mit Auslöser
statt gutem Vorsatz, gegen das Verhältnis, das die Zählung an diesem Tag gezeigt
hat: 9.544 Zeilen in `tools/`, `Makefile` und `ci.yml`, 36 ADRs, `ci.yml` zu
59 % Kommentar — und `web/` eine Seite ohne Inhalt. `selftest.sh` und
`check-compose.sh` sind damit eingefroren: Reparaturen ja, neue Regeln nur nach
einem Vorfall, den man benennen kann.

**An der Reihenfolge danach ändert das nichts: als Nächstes F1.**

---

## Vorher — 22.08.2026, Stufe E ist fertig

**E5c ist abgenommen, und damit die ganze Stufe E.** `v0.1.0` steht.

```
/               422 requests, 422×200
/api/health     422 requests, 422×200

  ✓ every answer was 200
```

Zeuge 22:01:12–22:08:14 UTC, **vor** dem Merge gestartet, quer über den Deploy
von `99281cf` (`report ok … 233 s`).

| Geprüft | Ergebnis |
|---|---|
| Tag auf origin | `refs/tags/v0.1.0`, annotiert, auf `99281cf` |
| GitHub-Release | 22:06:06, Changelog aus den Commits |
| Tagger | **G1NG4R** — kein Bot, kein Werkzeugname |
| `/api/health` · `/api/badge/version` | `v0.1.0` statt einer Kurz-SHA |

**Der erste Versuch ist rot geworden, und an der richtigen Stelle.** `git tag -a`
verlangt einen Tagger, ein Runner hat keinen: `fatal: empty ident name`. Der
Schritt liegt **vor** `make images`, also war nichts gebaut, nichts gepusht,
nichts signiert — nachgesehen statt angenommen: Produktion unverändert, **0**
Tags auf origin, kein Release. Die Reihenfolge, um die E5c gebaut wurde, hat bei
ihrer ersten Berührung mit der Wirklichkeit gehalten.

**Damit sind drei der vier heute rotierten Werte bewiesen** — `GITHUB_TOKEN`
(der Refresher hat GitHub erreicht), `SMTP_PASSWORD` (die Mail kam an),
`INTERNAL_DEPLOY_TOKEN` (dieser Deploy-Report). `INTERNAL_PROBE_TOKEN` erst mit
F4, dort wird er benutzt.

**Die E4-Abnahme ist nachgeholt, und sie fehlte wirklich.**
`tools/check-deployed.sh --host` stand seit E4b als Kriterium im Bauplan, im
Handbuch und in ADR 0034 — ausgeführt hatte es niemand. Am 22.08.2026 gegen
`b4bd8fa`: **10 von 10 Behauptungen**, darunter die zwei, die nur der Host
machen kann — die laufenden Container **sind** die veröffentlichten Digests.
Vorher waren acht davon vom Klon aus grün und die neunte hieß `– not asked here`.

**Als Nächstes: Stufe F**, und sie beginnt mit F1 (strukturierte Logs und
Korrelation). Die Datenbank-Rotation liegt weiter auf L5, mit Auslöser statt
Datum in der lokalen Datei.

---

## Vorher — 22.08.2026, E5b abgenommen

**Die Abnahme ist erfüllt, gegen Produktion.** 20:07:44–20:13:16 UTC,
`make witness --until-restart`, **vor** dem Merge gestartet, von außen über den
öffentlichen Namen:

```
/               333 requests, 333×200
/api/health     333 requests, 333×200

  ✓ every answer was 200
```

Der Deploy darin: `8e4e444`, `report ok … 222s`. Ein echter Tausch —
`verify-deploy` sah einen Prozess von `20:11:34.485`, `/api/health` nennt
danach `20:11:55.656`. Zwei Container haben nacheinander bedient.

**Damit ist die Kette von E5b in Produktion belegt** und nicht nur im Labor:
zwei Schattendienste tragen die Router, während `api` und `web` neu angelegt
werden; die vier Schritte laufen in Dokploys Command-Feld; `SHUTDOWN_DELAY` und
der Traefik-Healthcheck nehmen das Backend aus dem Pool, bevor seine Adresse
verschwindet.

**Was dabei zweimal schiefgegangen ist, steht unten unter „Gefunden" und bleibt
stehen:** der erste Produktions-Deploy hat die Abnahme verfehlt, und die Grenze,
die dabei sichtbar wurde, ist benannt statt weggebaut (ADR 0035).

**Für die Fallstudie:** BUILD + DEPLOY = **222 s**, und der Satz daneben lautet
nicht „Zero-Downtime", sondern „kein Besucher sieht einen Fehler, solange ein
Deploy die Routing-Labels nicht anfasst". Beide Zahlen sind gemessen.

**Die Stufe ist triagiert** und der Abschnitt „Gefunden" ist leer — 15 Zeilen →
9 erledigt, 2 als Issue ([#157](https://github.com/G1NG4R/timseil-dev/issues/157),
[#158](https://github.com/G1NG4R/timseil-dev/issues/158)), 3 bewusst verworfen,
1 als Regel in `CONTRIBUTING.md`. Der Durchgang steht unten.

**E5c ist gebaut und wartet auf seinen Merge.** Nicht mit `release-please`: es
arbeitet über einen Release-PR, und ein PR vom eingebauten `GITHUB_TOKEN` löst
keine `pull_request`-Workflows aus — kein einziger der sieben erforderlichen
Kontexte meldet, und mit `enforce_admins: true` ist so ein PR **nicht mergebar**.
Die Auswege wären eine GitHub-App oder ein PAT, also ein weiteres Dauer-Geheimnis
mit `contents: write`, vier Tage nach dem Token-Vorfall.

Stattdessen `tools/release.sh`: Tag und GitHub-Release aus den Conventional
Commits, gesetzt von `publish` selbst — **vor** dem Build, damit das Image des
Release-Commits nicht die vorherige Version trägt, und **veröffentlicht als
letzte Handlung**, wenn das Artefakt signiert ist. Keine `CHANGELOG.md`, kein
`v1.2.3` am Image, Start bei `v0.1.0`. ADR 0036.

**Die Abnahme ist der Merge selbst:** er muss `v0.1.0` erzeugen, und
`/api/health` muss danach diese Nummer nennen statt einer Kurz-SHA.

---

## Vorher — der erste Produktions-Deploy von E5b

**E5b ist gemergt** ([#154](https://github.com/G1NG4R/timseil-dev/pull/154),
`153eb80`), **und die Abnahme ist verfehlt.** Gemessen, 19:19 UTC, von außen:
10×`404` auf `/api/health`, 1× auf `/`. Gegen die E5a-Grundlinie (19 s, 16×`404`
je Pfad) eine Halbierung — und die Abnahme zählt jede Antwort, die nicht 200 ist.

**Nicht die Kette hat versagt.** `verify-deploy` sah den Zwilling um
`19:19:19.364`, `/api/health` nennt danach einen anderen Prozess
(`19:19:34.596`). Traefiks Log nennt den Grund: der alte Container und sein
Zwilling beschreiben denselben Router unter demselben Namen **verschieden**, weil
dieser Deploy acht Traefik-Labels geändert hat — und Traefik verwirft dann beide.

**Daraus ist eine gemessene Grenze geworden statt einer Behauptung:** ein Deploy,
der nur das Image tauscht, ist sauber (drei Laborläufe, `100×200` je Pfad); einer,
der ein Routing-Label ändert, kostet einen Trichter. ADR 0035 nennt sie und sagt,
warum sie nicht weggebaut wird.

**Repariert wurde ein zweiter Fall**, der heute nicht zugeschlagen hat:
`timseil-www` und `timseil-retry` waren allein an `web` definiert, während der
api-Router sie nannte — fällt web aus und api nicht, antwortet `/api` 404 bei
lauter gesunden Containern. Beide stehen jetzt an beiden Diensten,
`make check-compose` hält es.

**Was aussteht:** die Abnahme ist der nächste Deploy **ohne** Label-Änderung.
Zeuge vorher starten. #143 und #65 bleiben bis dahin offen.

---

## Vorher — E5b im Labor fertig

**Der Trichter ist zu, im Labor.** Drei Läufe, `110 requests, 110×200` auf `/`
und auf `/api/health`, kein Ausschlag. Grundlinie auf derselben Anlage:
13×`404` auf `/`, 8×`404` auf `/api/health`. Die Zahlen und wie sie zustande
kamen: `docs/runbooks/compose.md`, „Was am 22.08.2026 danach gemessen wurde".

**Wie es zugeht:** zwei Schattendienste (`compose.rollout.yaml`) tragen die
Router, während `api` und `web` neu angelegt werden; die vier Schritte stehen in
`tools/rollout.sh` und laufen auf dem Host in Dokploys Command-Feld, weil
`sanitizeCommand` nur `docker compose`-Glieder in einer Kette zulässt. Dazu zwei
Pausen mit einem Leser — `SHUTDOWN_DELAY` (#65) und, in `web`,
`NEXT_MANUAL_SIG_HANDLE` plus `/healthz`, gelesen von einem
`loadbalancer.healthcheck`. ADR 0035.

**Was noch aussteht:** das Command-Feld im Panel setzen (Runbook 2.3) und die
**Produktionsmessung** — Zeuge **vor** dem Merge starten,
`make witness WITNESS_UNTIL="--until-restart"`. Erst die schließt #143 und #65.

---

## Vorher — nach E5a

**E5a ist gemergt**, in zwei Teilen: [#152](https://github.com/G1NG4R/timseil-dev/pull/152)
(`9dbeae4`) bringt den Zeugen und das Labor, [#153](https://github.com/G1NG4R/timseil-dev/pull/153)
(`6f262e3`) repariert ihn. Produktion läuft `6f262e3`, Deploy 249 s, `ok`.

**Der Trichter ist gegen Produktion gemessen** — 19 Sekunden, 16×404 je Pfad,
keine einzige 5xx. Die Zahlen und die Kreuzprobe gegen die Pipeline stehen
weiter unten unter „Die Produktionsmessung von E5a".

**Das Labor trägt die Reparatur, bevor sie Produktion kostet.** `make rolling-lab`
plus `make witness` reproduziert den Trichter lokal. Dort ist auch gemessen, dass
der Zweizeiler aus dem Bauplan in beiden Hälften falsch ist und welche Folge
stattdessen trägt — `docs/runbooks/compose.md`, Abschnitt „Das rollende Labor".

**Was E5b vorfindet:** die Ausgangszahl in Produktion, die korrigierte
Drei-Schritt-Folge aus dem Labor, und einen Rest-Ausschlag je Dienst, an dem
`SHUTDOWN_DELAY` ([#65](https://github.com/G1NG4R/timseil-dev/issues/65))
bemessen wird. Offen und noch nicht entschieden ist, **wie die Folge den Host
erreicht** — Dokploy besitzt den Deploy (ADR 0033 §2), und der Pipeline-Schlüssel
kann einen Port forwarden und kein Kommando.

---

### Vorher — nach E4b

**E4b ist gemergt** ([#142](https://github.com/G1NG4R/timseil-dev/pull/142), `ae39e04`)
**und hat sich selbst deployt.** Produktion läuft `ae39e04`, `report ok … 226s`,
`make check-deployed` grün.

**Der Rollback ist provoziert** — 13:53 UTC, gegen die echte Produktion.
Deployt `sha-581f5c0`, verifiziert gegen einen Commit, den nie jemand gebaut
hat. Die sechzig Sekunden liefen ab, der Rollback griff, Exit 1, 84 s, keine
Zeile in `deploys`. Bauplan Zeile 1127 ist damit erfüllt. Transkript im
Dokploy-Runbook, Begründung in ADR 0034.

**Der erste Versuch war grün nach drei Sekunden**, und das war der wertvollste
Teil des Tages: nicht der Drill war falsch, sondern der Verify hatte eine Lücke.
Repariert als fünfte Bedingung.

**Gemessen beim ersten Merge mit `needs: [check, db, publish]`:** `db` war 77 s
vor dem Start des Deploys fertig, `check` 57 s, `publish` 3 s. Die neue
Abhängigkeit kostet **null** — jetzt an diesem Graphen gemessen statt aus E4a
übernommen.

---

**Triage nach E5c, 22.08.2026.** Vier Funde, **alle vier in der Stufe
erledigt**, keiner als Issue. Der Abschnitt bleibt leer.

- **`release-please` ist an diesem Repository nicht benutzbar.** Es arbeitet über
  einen Release-PR, und ein PR vom eingebauten `GITHUB_TOKEN` löst keine
  `pull_request`-Workflows aus — kein erforderlicher Kontext meldet, mit
  `enforce_admins: true` ist er nicht mergebar. Steht als Kontext in ADR 0036;
  kein Ticket, weil es nichts zu tun gibt, sondern etwas zu wissen.
- **`git tag -a` braucht einen Tagger, ein Runner hat keinen.** Lokal unsichtbar,
  weil diese Maschine eine Identität hat. Erledigt: der Tag übernimmt den Autor
  des Commits, den er benennt, und der Selbsttest schiebt `GIT_CONFIG_GLOBAL`
  und `GIT_CONFIG_SYSTEM` beiseite, damit er den Fall auch sieht.
- **Eine laufende Bewertung verschluckte den höheren Sprung.** Ein frühes `fix:`
  nagelte die Antwort auf `patch` fest, ein späteres `feat:` änderte nichts —
  ein Release, das untertreibt, was drinsteckt. Erledigt, drei Flags und eine
  Entscheidung am Ende.
- **`--publish` las den Tag neu, den `--tag` gerade gesetzt hatte.** Der Bereich
  wäre leer gewesen, der Text des allerersten Releases also blank. Erledigt: der
  Bereich ist ein Argument statt einer globalen Variablen.

Die letzten drei hat der Selbsttest gefunden, nicht das Lesen.

**Triage nach E5b, 22.08.2026.** 15 Zeilen unter „Gefunden" →
**9 erledigt**, **2 als Issue**, **3 bewusst verworfen**, **1 als Regel
aufgeschrieben**. Der Abschnitt ist leer.

**Die zwei neuen Issues:**

| Issue | Was |
|---|---|
| [#157](https://github.com/G1NG4R/timseil-dev/issues/157) | `web` erreicht die API über einen Namen, den sein Zwilling nicht mitdeckt — kostenlos bis Stufe G, danach 500er statt 404er |
| [#158](https://github.com/G1NG4R/timseil-dev/issues/158) | `witness.sh` begründet mit einem Backend und misst seit E5b zwei |

**Bewusst verworfen, mit Begründung:**

- **Ein Deploy, der ein Traefik-Label ändert, verliert den Router.** In
  Produktion gemessen und im Labor reproduziert. Wegzubauen nur, indem die
  Router-Labels `compose.yaml` verlassen — `extends` kann geerbte Labels
  überschreiben, aber nicht entfernen. Der Preis steht nicht gegen den Nutzen,
  Label-Änderungen sind selten, und die Grenze ist in ADR 0035 als **gemessen**
  benannt statt als Randnotiz. Neu aufmachen, wenn sie häufiger wird.
- **Traefiks Docker-Provider registriert `serversTransports`-Labels nicht.** Eine
  Eigenschaft von Traefik, keine Aufgabe. Sie ist gemessen, der Weg darüber ist
  verworfen, und die Umgehung — das Backend verlässt den Pool, bevor seine
  Adresse verschwindet — ist die bessere Lösung, nicht die zweitbeste.
- **19 s gegen 9 s.** Der Mechanismus, der die Zahl erzeugt hat, war
  wahrscheinlich der zweite Deploy-Weg; der ist abgeschaltet. Die Zahl beschreibt
  damit nichts mehr, was noch erreichbar wäre, und ein Ticket dafür wäre eine
  Absichtserklärung. Die Kette 9 s · 19 s · 10 s · 0 steht im Verlauf, falls sie
  je wieder gebraucht wird.

**Als Regel aufgeschrieben statt als Ticket:** `Closes #N` schließt beim Merge,
und die Abnahmen dieses Projekts werden danach gemessen. Steht jetzt in
`CONTRIBUTING.md` unter „Branches and commits", mit dem Vorfall als Begründung.

**Neun erledigt**, darunter die drei, an denen die Stufe hing: der Zweizeiler
aus dem Bauplan ist ersetzt, der Rest-Ausschlag hat mit `SHUTDOWN_DELAY` eine
gemessene Zahl, und die Middleware-Kopplung ist zu — je mit einer Prüfung, die
den kaputten Fall beweist.

**Triage nach E4b, 22.08.2026.** 27 Zeilen unter „Gefunden" →
**13 erledigt**, **7 als Issue**, **6 an bestehende Issues oder bewusst
verworfen**, **1 lokal**. Der Abschnitt ist leer.

**Die sieben neuen Issues:**

| Issue | Was |
|---|---|
| [#143](https://github.com/G1NG4R/timseil-dev/issues/143) | Jeder Container-Wechsel liefert zehn Sekunden `404` — beim Drill gemessen, trifft jeden Merge |
| [#144](https://github.com/G1NG4R/timseil-dev/issues/144) | `internal/buildinfo` hat keine Testdatei — und drei Prüfungen lesen aus ihm |
| [#145](https://github.com/G1NG4R/timseil-dev/issues/145) | ~200 alte `rejects` im Selftest können aus dem falschen Grund grün sein |
| [#146](https://github.com/G1NG4R/timseil-dev/issues/146) | „nur 22, 80, 443" stimmt nicht — Regel oder Host muss sich bewegen, vor L3 |
| [#147](https://github.com/G1NG4R/timseil-dev/issues/147) | Der Host trägt mehr als diesen Stack, F2 und ADR 0027 planen anders |
| [#148](https://github.com/G1NG4R/timseil-dev/issues/148) | Dokploy heben, bevor L3 das Panel schließt |
| [#149](https://github.com/G1NG4R/timseil-dev/issues/149) | Ein GHCR-Paket zu verknüpfen hat keinen Klickweg |

**Bewusst verworfen, mit Begründung:**

- **Zwei sachlich falsche Kommentare in `ci.yml`** (aus #112). Die Instanzen sind
  korrigiert. Als *Klasse* — Kommentare driften von dem weg, was sie beschreiben
  — ist es unbegrenzt und kein Issue: `check-adrs`, `check-readme`, `check-env`
  und `check-stack` greifen genau die Fälle, die maschinell prüfbar sind, und
  für den Rest ist ein Ticket eine Absichtserklärung.
- **`gh` kann die GHCR-Versionen nicht lesen.** Umgangen über die Registry-API
  mit anonymem Pull-Token, und die Umgehung ist besser als die direkte Lösung:
  sie misst, was ein Fremder sieht. Preis: Tags ja, Datum und Größe je Version
  nein. `tools/registry.sh` trägt es.
- **227 s stammen aus einem Wiederholungslauf** und **eine zweite Signatur auf
  demselben Digest.** Beides war Kontext, kein Fund. Die zweite Zeile hat sich
  in E4b sogar als falsch herausgestellt — es waren zwei *verschiedene* Digests,
  und daraus wurde die Waise, an der die Aufbewahrungsregel hängt.

**An bestehende Issues gegeben:** die Rotation aus
[#109](https://github.com/G1NG4R/timseil-dev/issues/109) als Kommentar dort;
[#139](https://github.com/G1NG4R/timseil-dev/issues/139) und
[#140](https://github.com/G1NG4R/timseil-dev/issues/140) trugen schon ihre
Zeilen.

**Eine Zeile ist lokal geworden**, nicht öffentlich: die laufende Panel-Version.
Bei einem Panel, das noch von außen erreichbar ist, ist sie eine Wegbeschreibung
zu den passenden Advisories. Öffentlich steht die Aufgabe (#148), der Stand in
`backlog.local.md`. Beim selben Durchgang ist aufgefallen, dass der öffentliche
Backlog die anderen Dienste der Maschine **namentlich** nannte — das ist
korrigiert, aber es steht auf `main` und damit in der Historie; ob das einen
Rewrite rechtfertigt, ist lokal notiert und noch offen.

**Offen, ohne Issue, weil es Ablauf und kein Fund ist:** die Aufbewahrung ist
unscharf. `retention` druckt montags den Plan und löscht nichts. Zwei Wochen
Trockenläufe, dann ein Beweis gegen ein Wegwerf-Paket, dann
`GHCR_PRUNE_ENABLED`. Der Lösch-Pfad ist bis heute **nie ausgeführt worden**.

Vorherige Triage: nach E2, 21.08.2026 — 15 Zeilen → 11 in der Stufe erledigt,
2 als Kommentar an bestehende Issues, 1 bewusst verworfen, 1 als Abnahme offen.

---

## Die Produktionsmessung von E5a — 22.08.2026, 17:17 UTC

Nachgeholt beim Merge von [#153](https://github.com/G1NG4R/timseil-dev/pull/153),
mit `make witness WITNESS_UNTIL="--until-restart"`, **vor** dem Merge gestartet.
Eine Anfrage je Sekunde auf `/` und `/api/health`, von außen über den
öffentlichen Namen, 317 Anfragen je Pfad.

| | `/` | `/api/health` |
|---|---|---|
| `200` | 301 | 299 |
| `404` | **16** | **16** |
| keine Verbindung | — | 2 |
| Sekunden ohne Stichprobe | 8 | 8 |

**Das Fenster: 17:17:44 bis 17:18:02 UTC — neunzehn Sekunden.** Es liegt um den
Moment, in dem der neue Prozess oben war (17:17:51,85), und endet elf Sekunden
danach. Merge 17:13:54, Deploy gemeldet 17:18:06 mit 249 s.

Damit ist der Bauplan-Satz belegt und die Zahl gemessen statt geschätzt: **keine
5xx im Fenster, sondern 404** — die Abnahme, die 5xx zählt, hätte diesen Deploy
durchgewinkt.

Der erste Versuch derselben Messung ging daneben: dreieinhalb Minuten nach dem
Merge gestartet, alles `200`, kein Deploy darin. Das ist repariert (#153) und
der Grund, warum `--until-restart` existiert.

---

## Triage nach Stufe F2 — 24.08.2026

**Der Notizblock ist geleert.** Zwanzig Einträge, jeder einzeln zugeordnet:

| | |
|---|---|
| **Issue** | 15 — [#180](https://github.com/G1NG4R/timseil-dev/issues/180)–[#194](https://github.com/G1NG4R/timseil-dev/issues/194) |
| **erledigt** | 1 — der Netz-Alias, mit #172 gemergt, nur der Status war offen geblieben |
| **bewusst verworfen** | 4 |

Die vier verworfenen, mit dem Grund, damit sie nicht als Vergessene
wiederkommen:

- **Kein eigener ADR für E3.** Die Regel dieser Stufe lebt in den
  Kopfkommentaren von `tools/sign.sh` und `verify-supply-chain.sh`. Der Bruch
  mit „ein ADR pro Phase" war bewusst und ist dort benannt; ein ADR über einen
  fehlenden ADR wäre genau die Sorte Werkzeug, vor der „Maß halten" warnt.
- **Sechs Schritte stehen zweimal in `ci.yml`.** Der bezahlte Preis dafür, dass
  derselbe Job baut, prüft, scannt und veröffentlicht — sonst wäre das signierte
  Artefakt nicht das geprüfte (ADR 0026). Wird die Datei unübersichtlich, ist
  ein gemeinsames `make`-Ziel der Weg, keine Reusable Workflow.
- **Kein dauerhafter Testaufbau für `tools/probe.sh`.** Die sechs kaputten Fälle
  sind einmal gefahren und im Commit benannt; laufend geprüft wird die Datei,
  die dabei entstand. Ein Harness wäre Werkzeug, das Werkzeug prüft.
  Wiederaufnehmen, wenn ein zweiter Fund in diesem Skript auftaucht.
- **Der Ausfall-Alarm bleibt ein roter Lauf, kein eigener Mailpfad.** ADR 0038
  sagt warum: das Mail-Passwort läge als Secret in einem Job, der alle fünf
  Minuten auf fremden Runnern läuft, für ein öffentliches Repository. F10 fängt
  beides mit dem Dead Man's Switch — das ist eine Bauplan-Phase und braucht
  keinen Zettel.

**Der stärkste Fund dieser Stufe** ist [#180](https://github.com/G1NG4R/timseil-dev/issues/180):
die Sonde läuft mit einem Siebtel ihrer behaupteten Kadenz, und `down_sec` wird
aus Anzahl **mal Konstante** gebildet. Jede Ausfalldauer auf der Seite wäre
damit rund siebenmal zu klein — Invariante 1 in Betriebskleidung.

---

## Triage — Stufe F (Launch-Pfad), 27.08.2026

F1–F5 sind gebaut und gegen Produktion abgenommen; F6–F11 liegen hinter dem
Launch. Damit ist der Auslöser erreicht, den CLAUDE.md nennt: **Issue, bewusst
verworfen mit Begründung, oder erledigt — und der Notizblock wird geleert.**

Zwanzig Zeilen unter „Gefunden", vier unter „Idee". Fünfzehn waren erledigt und
sind in ADRs, Beiträgen und Commits belegt; sie brauchen hier keine Zeile mehr.
Die übrigen neun:

### Zu Issues geworden

| Fund | Wohin |
|---|---|
| Sondenkadenz bei 10 %, `down_sec` untertreibt um Faktor 7 | **[#180](https://github.com/G1NG4R/timseil-dev/issues/180)** — existierte seit 24.08.; die größere Stichprobe hängt als Kommentar dran |
| Wettlauf in `internal/contact/dispatch_test.go`, kein `-race` in der Pipeline | **[#181](https://github.com/G1NG4R/timseil-dev/issues/181)** — existierte seit 24.08.; F5 hat ihn unabhängig wiedergefunden |
| README-Entscheidungstabelle endet bei ADR 0029 | **[#205](https://github.com/G1NG4R/timseil-dev/issues/205)** |
| Zustellbarkeit ist der einzige SLI ohne Messung, es fehlt ein Contract-Feld | **[#206](https://github.com/G1NG4R/timseil-dev/issues/206)** — fällig mit H8 |
| Traefik-Anbindung übersteht kein Neuerzeugen des Containers | **[#207](https://github.com/G1NG4R/timseil-dev/issues/207)** |
| `uptime90d` sagt nicht, über wie viel gemessenes Fenster es spricht | **[#208](https://github.com/G1NG4R/timseil-dev/issues/208)** — fällig mit H1 |

### Bewusst verworfen, mit Begründung

**Der Seiten-p95 enthält den Verkehr der eigenen Sonde.** Ausschließen ginge nur
über eine zweite Bucket-Liste je Dienst, und Traefik nimmt eine Liste, nicht eine
je Dienst. Die Verzerrung steht in `docs/slo.md` und in ADR 0041 unter „Was das
kostet". **Aufschreiben ist hier die vollständige Antwort**, nicht der billige
Ausweg: die Zahl ist nicht falsch, sie ist ein p95 über einen Anfragemix, und der
Mix gehört danebengeschrieben.

**`Stop()` ist bei vier Schleifen sequenziell idempotent, nebenläufig nicht.**
Kann nicht auslösen: `cmd/api` erreicht die Methode auf zwei Wegen, die einander
ausschließen — scheitert der Listener, wird `serve()` nie erreicht. Vier
Geschwisterpakete für einen unmöglichen Fall anzufassen ist genau das, wovor
„Maß halten" warnt, und der Diff sähe ohne Anlass aus. **Was stattdessen
passiert ist:** der Kommentar an `snapshots.Stop()` behauptete mit „idempotent"
mehr, als der Code hält, und sagt jetzt, *warum* es sicher ist — damit ein
künftiger dritter Aufrufer die Bedingung liest, statt sie zu erben.

**Das `selftest`-Flackern an `registry.sh`** („rejected, but not for 'usage'",
25.08.). In allen Läufen seit dem 25.08. nicht wiedergekehrt, das Skript direkt
aufgerufen dreimal deterministisch. Verworfen als nicht reproduzierbar; taucht es
wieder auf, ist die Kopiererei ins Temp-Verzeichnis der erste Verdacht — und
dann mit zwei Vorkommen statt einem.

### Dabei aufgefallen: zwei überfällige Issues

`#183` („decide it in F3") und `#184` („due with F3") warten auf eine Phase, die
am 26.08. abgenommen wurde. **#184 nennt drei Hintergrundschleifen; es sind
inzwischen fünf** — F4 und F5 haben je eine dazugelegt, und F5 hat dem Label
einen konkreten Leser gegeben: `docs/runbooks/api.md` schickt einen Operator zum
`grep` nach `"msg":"metric snapshot"`. Das ist ein Label-Selektor, der als
Textsuche in einem Runbook steht. Als Kommentar an #184 vermerkt.

### Die Lehre dieser Triage

**Ich habe zwei Funde als neu gemeldet, die seit drei Tagen als #180 und #181
dastanden.** `backlog.md` hatte ich gelesen, wie es die Regel verlangt; den
Issue-Tracker nicht. Der Notizblock ist die eine Hälfte des Gedächtnisses, der
Tracker die andere — und die Triage räumt genau von der einen in die andere.
Wer nur den Notizblock liest, findet zuverlässig Dinge ein zweites Mal und nennt
sie neu. CLAUDE.md hat dafür jetzt eine Zeile, mit diesem Vorfall als Auslöser.

---

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 28.08.2026 | G3 | **Der Kopf bleibt statisch, und die Frage wird in H1 neu gestellt.** Das Chrome-Blatt kennt kein `position` und keinen Scroll-Zustand; sticky wäre erfunden gewesen. Der einzige Hinweis ist `.rail { top: 90px }` — eine Herleitung aus einer Zahl, kein Satz. In H1 steht die Spec-Rail zum ersten Mal wirklich da, und dann lassen sich Kopf und Rail zusammen messen statt einzeln vermuten. ADR 0044. | verschoben |
| 28.08.2026 | G3 | **Die Uhr driftet, und das ist die Fassung des Blattes.** `setInterval(1000)` verliert auf einem beschäftigten Tab gelegentlich eine Sekunde; ein sich selbst neu stellendes `setTimeout(1000 - Date.now() % 1000)` liefe auf der Sekundengrenze und sähe merklich ruhiger aus. Das Blatt schreibt `setInterval`, also `setInterval` — die Änderung wäre eine Entwurfsentscheidung und keine Reparatur. | verschoben |
| 28.08.2026 | G3 | **Issue #96 (Favicon) trägt den Meilenstein G3 und ist nicht erledigt.** `web/public/favicon.svg` ist weiter der Platzhalter. Das Chrome-Blatt spezifiziert kein Icon; das nächstliegende Motiv wäre die Wortmarke `TS://`, aber ein Icon zu entwerfen ist eine gestalterische Handlung an einem read-only-Handoff, der keine vorsieht. **Vorschlag: auf K2 umhängen** (Blog, CV & Bilder), wo Bildmaterial ohnehin entsteht — oder du entscheidest das Motiv, dann ist es zehn Minuten. **Erledigt am 28.08.:** auf den neu angelegten Meilenstein **K2** umgehängt, mit der Begründung als Kommentar — die Prämisse des Issues war, dass das Chrome-Blatt die Marke trägt, und es zeichnet kein Icon. Der Meilenstein G3 ist damit leer. | erledigt |
| 29.08.2026 | G5b | **Der Feed ist eine öffentliche Adresse ohne Inhalt, bis H9 die Post-Routen baut.** Sechs Posts liegen in `web/content/posts/`, `/blog` ist ein `[SOON]`-Stub, und `/blog/<slug>` gibt es nicht — sechs `<item>` hießen sechs `<link>` auf sechs 404er, die ein Leser sich merkt und bei jedem Abruf erneut vorzeigt. Der Kanal ist deshalb gültig und leer, **die Eintrags-Erzeugung ist trotzdem gebaut und getestet** (Maskierung, RFC-822-Datum), weil das der Teil ist, der falsch sein kann, ohne dass es auffällt. H9 hängt die Einträge ein und braucht dafür einen Frontmatter-Leser — dessen Schema bis dahin vorläufig ist, siehe **#192**. ADR 0047. | verschoben |
| 29.08.2026 | G6 | **Vier Bauteile stehen im Baum und werden von keiner Seite gerendert.** `EmptyState`, `ErrorPanel`, `LoadingLines` und `DegradedNotice` sind gebaut, weil der Bauplan sie für G6 nennt und weil die Zustandssprache an *einer* Stelle entschieden werden soll statt nebeneinander in fünf H-Phasen. Ihr erster Betrachter ist G7s Galerie, ihr erster Einsatz H6 (Leerzustand bei 0 Treffern), H9 (zwei Leerzustände im Index, einer im Beitrag) und H13 (Fehlerseiten). Bewusst so entschieden, nicht übersehen — und deshalb hier und in ADR 0048 benannt statt still im Diff. | verschoben |
| 29.08.2026 | G6 | **Der Glitch-Burst hat seine Regel, aber noch keine Bewegung.** `lib/state/burst.ts` hält beide Hälften der Blatt-Regel als reine Funktion — was als echter Wechsel zählt, und die 600-ms-Sperre — und ist unter `node --test` belegt. Die Animation baut G7: dort hat die Galerie einen Knopf, der einen Zustand von Hand umschaltet, und das ist der erste Ort mit Auslöser *und* Betrachter. In Produktion wechselt heute kein Zustand, während jemand hinsieht; `ok`→`degraded` herzustellen verlangt eine umkonfigurierte API. Stufe I war die Alternative und ist keine — I1 ist die Boot-Sequenz, I2 die Scroll-Choreografie, I3 Ambient. Als **#230** angelegt, Meilenstein G7. | verschoben |
| 29.08.2026 | G6 | **Der Retry-Zähler formatiert einen Versuch, den niemand unternimmt.** Der Bauplan nennt ihn für G6, `lib/api/client.ts` wiederholt aber nichts — #157 ist ausdrücklich mit „akzeptieren und messen" entschieden. Gebaut ist deshalb `retryLine()` und nicht der Retry; `ErrorPanel` nimmt die Zeile **optional**, und wer nichts wiederholt, übergibt nichts. Erster echter Aufrufer: H8 (Kontaktformular, 8 s Client-Timeout) oder H13. Als **#231** angelegt, Meilenstein H8. | verschoben |
| 29.08.2026 | G6 | **Drei der vier Vertragsvokabulare sind nicht abgebildet, und das ist die Regel, nicht die Lücke.** `SystemState`, `TrackState` und `DayState` stehen im generierten Typ; `lib/state/derive.ts` bildet nur `Health.status` ab, weil `web/` nur `/api/health` liest. Die Regel steht in ADR 0048, damit H1, H4, H5 und H6 sie nicht je neu erfinden: **ein Vertragswert wird in der Phase abgebildet, die seinen Endpunkt zuerst liest, und die Abbildung landet in derselben Datei.** | verschoben |

## Gefunden — Bug oder Unklarheit

Vorherige Triage: Stufe F (Launch-Pfad), 27.08.2026 — siehe oben.

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 27.08.2026 | G1 | **`globals.css` malt drei Dinge im Akzent von Terminal Noir statt im Akzent des Themes.** Link-Unterstrich, `::selection` und der Puls-Schein von `ts-pulse` stehen als `rgba(0,229,255,…)` da — vier Zeilen, wörtlich aus dem Handoff übernommen. In den sechs anderen Paletten bleiben sie cyan; sichtbar wird es, sobald G2 den Umschalter baut. Reparatur heißt neue Tokens in `tokens.css` (drei Deckkraften × sieben Paletten oder ein `color-mix`), und das ist keine Entscheidung von G1. `check-tokens.sh` führt die vier als benannte Ausnahme und druckt sie bei jedem Lauf. **Gemessen im Browser, 27.08.2026:** Linkfarbe folgt (`#00E5FF` → Latte `#7C2FD4` → Phosphor `#2EE6A6`), Unterstrich bleibt in allen dreien `rgba(0,229,255,.35)`. **Erledigt in G2:** vier abgeleitete Tokens in `tokens.css` (`--acc-line`, `--acc-select`, `--acc-pulse`, `--acc-pulse-2`) über `color-mix(in srgb, var(--acc) N%, transparent)`, dazu `--glow`, das denselben Fehler eine Ebene tiefer trug — es stand nur in `:root`, und nur `latte` und `gruvbox` überschrieben es, also leuchtete in `mocha`, `amber`, `phosphor` und `tokyo` weiter Cyan neben einem fremden Akzent. `check-tokens.sh` hat seine benannte Ausnahme verloren. **Nachgemessen im Browser, 28.08.2026, alle sieben:** der Unterstrich trägt jetzt in jeder Palette den Akzent bei Alpha .35 — Noir `srgb 0 .898 1`, Mocha `.796 .651 .969`, Gruvbox `.027 .4 .471`. ADR 0043. | erledigt |
| 27.08.2026 | G1 | **Eine neue Web-Abhängigkeit kommt im Dev-Stack nicht an, und der Cache hält den Fehler fest.** `node_modules` (anonym) und `.next` (benannt) überleben `up --build`: das Image hat Tailwind, der Container nicht — `Cannot find module '@tailwindcss/postcss'`, jede Seite 500. Der erste gescheiterte Start kompiliert sich in `.next`, deshalb heilt `--renew-anon-volumes` **allein** nichts; gemessen: mit erneuerten anonymen Volumes weiter 500, nach `docker volume rm …_web-next` sofort 200. Gefunden, weil `make quickstart` gegen diesen Branch durchfiel. **Behoben:** `make dev` stempelt die Prüfsumme des Lockfiles und weist einen Start ab, der sie bewegt hat; `make dev-reset` räumt beides und löscht den Stempel. Runbook `web.md`. Nicht gedeckt: frischer Klon neben altem Volume. | erledigt |
| 27.08.2026 | G1 | **`check-topology` ist einmal mit `migrate` exit 1 aus einem leeren Volume gefallen** — im ersten Quickstart-Lauf gegen diesen Branch, direkt nach dem Web-Fehlschlag. Compose hatte die Logzeilen des Init-Containers geschluckt, und der Lauf war schon abgeräumt, als ich sie suchte. Danach zweimal nicht wiedergekehrt: `make check-topology` einzeln grün, der saubere Quickstart-Wiederholungslauf ohne ein einziges ✗. **Nicht reproduzierbar, Ursache unbekannt** — kommt es wieder, ist der erste Griff, die Logs des `migrate`-Containers zu sichern, bevor irgendetwas abgeräumt wird. | offen |
| 28.08.2026 | G1→G2 | **Ein GHCR-Push ist mit `unknown blob` gestorben, und der Hinweistext zeigt woandershin.** `publish` auf `main` (`365431c`): `timseil-api` ging durch, `timseil-web` brach nach der Hälfte der Layer ab — mit `Layer already exists` davor. `make push` legt daraufhin den 403-Hinweis über Paketrechte nach, und der ist hier **falsch**: derselbe Job hat Sekunden vorher mit denselben Rechten gepusht. Folge: `deploy` übersprungen, Produktion auf dem vorigen Image, `check-deployed` 2 von 6 rot — genau an der Stelle, an der die Seite ihre Nachprüfbarkeit behauptet. **Ein `rerun --failed` lief sauber durch** (deploy 09:17:05 UTC, 217 s, ok), also einmalig und nicht reproduziert. Offen: ob der Hinweistext eine zweite Zeile für den Registry-Fehler bekommt, statt nur die Rechte-Erklärung anzubieten — berührt #90. | offen |
| 28.08.2026 | G2 | **Der aktive Schwatch des Theme-Umschalters ist in den zwei hellen Paletten unsichtbar — und zwar genau der aktive.** Der Handoff zeichnet „aktiv = volle Deckkraft **und** Rahmen in der Schwatch-Farbe". Auf Latte ist die Schwatch-Farbe `#EFF1F5` und die Seitenfläche ist `#EFF1F5`; Fläche, Rahmen und Untergrund fallen zusammen. **Gemessen im Browser, 28.08.2026:** aktiver Knopf `background rgb(239,241,245)`, `border rgb(239,241,245)`, `body background rgb(239,241,245)` — Kontrast **1.00**. Gruvbox Light trägt denselben Fall mit `#FBF1C7`. Die Regel ist gegen Terminal Noir gezeichnet, wo der Schwatch ein heller Akzent auf dunklem Grund ist, und verletzt in den hellen Paletten die eigene Regel des Blattes („Zustände nie nur über Farbe"). `aria-checked` stimmt, es ist rein visuell. Eine Reparatur heißt ein zweites Merkmal für den Aktiv-Zustand und ist eine Entwurfsentscheidung, keine von G2. **Erledigt, und es war keine Entwurfsfrage.** Der Bauplan sagt in Anhang B „aktiv = volle Deckkraft **und Akzentrahmen**", `docs/design/README.md:642` sagt „den Rahmen in **Akzentfarbe**" — nur der Code-Ausschnitt des Handoffs schreibt die Schwatch-Farbe, und ich hatte den Ausschnitt höher gewichtet als die zwei Sätze. `INDEX.md` sagt, wer bei Widerspruch gewinnt: der Bauplan. Mit `var(--acc)` steigt der Kontrast gegen die Fläche von **1.00** auf **5.78** (Latte, `#7C2FD4`) und **5.82** (Gruvbox Light, `#076678`). | erledigt |
| 28.08.2026 | G2 | **Turbopack liefert weder eine metrisch angepasste Ersatzschrift noch Font-Preloads — `adjustFontFallback` wirkt nicht.** Nachgemessen am Produktionsbuild: im ausgelieferten Stylesheet steht kein `size-adjust`, kein `ascent-override` und keine `… Fallback`-Familie, im `<head>` kein `<link rel="preload" as="font">`. Die Werte gäbe es — `getFallbackFontOverrideMetrics` rechnet sie für alle drei Familien (Chakra Petch `size-adjust 102.51%`, Geist `104.76%`, JetBrains Mono `134.59%`) —, aber die Stelle, die daraus ein `@font-face` macht, ist `build/webpack/loaders/next-font-loader/postcss-next-font.js`, und Next 16 baut mit Turbopack. Mit `font-display: swap` heißt das: echter Textwechsel beim ersten Besuch, und der verschiebt Layout. **Das ist ein CLS-Befund und gehört zu L8**, dessen Budget CLS = 0 verlangt; gemessen ist bisher die Abweichung, nicht ihre Wirkung. Ausweg wäre `display: "optional"` (kostet die Schrift bei langsamer Leitung) oder drei handgeschriebene Ersatz-`@font-face`. Nicht in G2 gebaut: ein Werkzeug ohne eine einzige CLS-Messung wäre Vorrat. **Halb korrigiert in der G3-Abnahme, gegen die laufende Seite:** die Preloads gibt es sehr wohl — fünf `rel="preload" … as="font"` im `<head>`, genau die fünf Dateien, die ein lateinischer Text holt. Die andere Hälfte steht: `size-adjust`, `ascent-override` und `descent-override` kommen im ausgelieferten Stylesheet **null**mal vor, der metrisch angepasste Ersatzschnitt fehlt wirklich — und das ist der CLS-Teil, der zu L8 gehört. | offen |
| 28.08.2026 | G2 | **Der Handoff hat ein Bauteil, das React 19 nicht mehr annimmt.** `ThemeSwitch` stand als `useState('')` plus `useEffect`, der nach dem Mount korrigiert; `react-hooks/set-state-in-effect` weist das ab („Calling setState synchronously within an effect can trigger cascading renders") und hat recht: das Theme lebt am `<html>`-Element, also in einem externen System. In G2 auf `useSyncExternalStore` umgebaut — Server-Snapshot `null`, Client-Snapshot das Attribut. **Die übrigen fünf Handoff-Komponenten (`Button`, `Field`, `MetricTile`, `SectionHead`, `StatusDot`) sind noch nicht durch diesen Linter gelaufen**; wer sie in G6/G7 herüberholt, sollte mit derselben Klasse Fund rechnen. | erledigt |
| 28.08.2026 | G2 | **Fünf Lücken zwischen den G2-Blättern und `code/`, keine davon in G2 zu schließen.** (1) **Mocha `--dim`:** `tokens.css` führt `#828BB8`, das Palettenblatt misst `overlay2 #9399B2` mit 5.81 — und `#828BB8` ist zugleich der `--dim`-Wert von Tokyo Night, sieht also nach Copy-Paste aus. Selbst nachgerechnet gegen `--bg #1E1E2E`: `#828BB8` erreicht **4.95** (gegen `--panel` 5.30), `#9399B2` erreicht **5.81** (6.22). Beide über AA, aber belegt ist der Wert des Blatts. → `design-correction`-Reihe, K1. (2) **`accSoft` fehlt:** das Blatt zählt es zu den 20 Theme-Variablen (`rgba(0,229,255,.14)` u. a.), `tokens.css` hat kein Äquivalent — wer den Akzent als weiche Fläche braucht, hat kein Token. → G6/H. **Erledigt in G3, und nicht als Lücke, sondern nebenbei:** das Chrome-Blatt zeichnet sechs Alphas des Akzents für vier getönte Flächen, und sie zusammenzufassen brauchte genau dieses Token — `tokens.css` trägt seit `1656fd4` `--acc-soft` und `--acc-edge` (ADR 0044). **Vier der fünf Lücken sind noch offen, Punkt (2) nicht mehr.** (3) **Die mobile 404-Display-Stufe 58px** („108 → 58") hat weder Token noch Media Query. → H10. (4) **Laufweiten `.12em`, `.13em`, `.20em`** stehen als Literale in den Handoff-Komponenten, tokenisiert sind nur `--ls-label .14em` und `--ls-head .16em`. → G7. (5) **h4–h6 sind unspezifiziert** — weder Stufe noch Regel; unterhalb H3 läuft alles über `SectionHead` in Mono. → H9 (Blog-Fließtext ist der erste Ort, der sie braucht). | offen |
| 28.08.2026 | G2 | **Issue #35 (React Compiler) ist gemessen, statt weiter vermutet zu werden.** Der Issue trägt Meilenstein G1 und verlangt zwei Zahlen — Build-Zeit und Bundle-Wirkung. Vorher war nichts zu messen: es gab keine Client-Komponente. G2 bringt die erste. **Gemessen, je drei Läufe, `rm -rf .next` davor:** mit Compiler 7 687 · 7 721 · 7 949 ms und 568 034 B JS in `.next/static/chunks`, ohne Compiler 7 434 · 7 467 · 7 750 ms und 567 524 B. Also **rund 250 ms Build-Zeit und 510 Byte JS** — der Preis ist eine Zahl statt einer Vermutung, und bei einer einzigen Client-Komponente sagt er über den Nutzen nichts. Vorschlag: bestätigen und schließen, mit der Notiz, in G7 gegen die volle Bauteil-Galerie nachzumessen. **Nicht von mir geschlossen** — der Tracker gehört dir. **In der G3-Abnahme neu gemessen, gegen sieben Client-Bauteile statt einem** (`Clock`, `NavLinks`, `LangMenu`, `MobileMenu`, `FooterLeadGate`, `Wordmark`, `ThemeSwitch`), je drei Läufe, `rm -rf .next` davor, `next.config.ts` danach nachweislich unverändert: **mit** 16 528 · 16 354 · 16 415 ms und 601 421 B, **ohne** 14 556 · 13 078 · 12 937 ms und 598 821 B — rund **2,9 s Bauzeit und 2 600 B JS**. Das ist fünfmal die JS-Zahl aus G2 und etwa das Zwölffache der Bauzeit. **Damit kippt die Prämisse, statt sich zu bestätigen:** der Issue begründet das Behalten mit „adds no runtime weight to the bundle", und das trifft nicht mehr zu. Deshalb *nicht* geschlossen — es als bestätigt abzulegen wäre eine Entscheidung, die der Beleg nicht trägt. Zahlen als Kommentar am Issue, Entscheidung offen. | offen |
| 28.08.2026 | G2 | **97 KB Schrift beim ersten Besuch, und eine der drei Familien trägt einen Schnitt, den kein Entwurf benutzt.** Im Image liegen 23 `.woff2` (252 192 B, alle `unicode-range`-Schnitte); ein lateinischer Text holt genau fünf davon — im Browser nachgemessen, alle same-origin: Chakra Petch 400/500/600 mit 9 728 · 9 944 · 10 040 B, Geist variabel 29 288 B, JetBrains Mono variabel 40 480 B, zusammen **99 480 B**. Die variable Fassung von JetBrains Mono deckt 400/500/600/700 in einer Datei ab und kostet ungefähr so viel wie vier statische Schnitte — also kein Tausch, den man rückgängig machen sollte. **Offen ist Chakra Petch 400:** der Handoff nennt 400/500/600, aber in den Musterzeilen des Foundations-Blatts steht Chakra ausschließlich mit 500 und 600. Fällt 400 weg, sind das 9 728 Byte weniger. Vor dem Streichen einmal über alle Blätter greppen, nicht nur über das eine. | offen |
| 28.08.2026 | G3 | **`check-tokens.sh` hat die eine Form abgewiesen, die es verlangt.** Die Radius-Regel lautete `border-radius[[:space:]]*:[[:space:]]*[^v;}]` — und weil `[[:space:]]*` auch nichts treffen darf, hat `[^v;}]` das **Leerzeichen nach dem Doppelpunkt** getroffen: `border-radius: var(--radius)` wurde als hart kodierter Radius gemeldet. Aufgefallen erst jetzt, weil G3 die erste Phase ist, die `border-radius` in einem Stylesheet schreibt statt in einem `style`-Prop (dort heißt es `borderRadius` und die Regel greift gar nicht). Gebraucht wird es, weil ADR 0042 kein Preflight zulässt und der Browser Knöpfen von sich aus einen Radius gibt. **Repariert** zu `[^v[:space:];}]`; `selftest.sh` prüft jetzt beide Seiten — vorher kannte es nur den kaputten Fall, und ein Gatter, das nur seinen kaputten Fall gesehen hat, weiß nicht, dass es falsch steht. | erledigt |
| 28.08.2026 | G3 | **Der CSS-Minifier schreibt Dauern um, und wer sie zur Laufzeit liest, muss das wissen.** `tokens.css` sagt `--d-scramble: 220ms`, im Produktionsbuild kommt `.22s` heraus — zwei Zeichen kürzer, semantisch gleich. `NavLinks` liest das Token über `getComputedStyle`, damit die Dauer nur an einer Stelle steht; ein `parseInt` hätte lokal 220 geliefert und in Produktion 0, also eine Animation, die im Dev läuft und ausgeliefert tot ist. `lib/scramble.ts` hat dafür `parseMs`, und `scramble.test.ts` kennt beide Schreibweisen ausdrücklich. | erledigt |
| 28.08.2026 | G3 | **`.sys-pin` ist nicht die vierte Klasse des Chromes.** Der Backlog führte vier Haken aus `layout.css` als G3s Zusage; drei sind es — `.nav-desktop`, `.nav-button`, `.foot-meta`. `.sys-pin` hat im Chrome-Blatt kein Gegenstück, steht im Namensraum der `.sys-row`-Familie und gehört zu SYS.01/SYS.02, also H4/H5. In G3 bewusst unbenutzt gelassen. | erledigt |
| 28.08.2026 | G3 | **Der Nav-Abstand steht in zwei Fassungen, und zehn Seitenblätter tragen die andere.** Das Chrome-Blatt sagt `gap:30px` und ist als „verbindliche Fassung" markiert; sieben der zehn Seitenblätter (Homepage, Work Index, Blog Index, Blog Post, About, 404, Legal, Case Study Template) sagen 32. Gebaut ist 30, nach Quellenrang — und `--s-30` liegt damit bewusst außerhalb des 4er-Rasters, was `tailwind.test.ts` von beiden Seiten festnagelt (`p-30` liefert, `p-32` nicht). **Offen bleibt, ob die zehn Seiten in den H-Phasen nachgezogen werden** oder ob das Blatt bei der nächsten Konsistenzrunde auf 32 korrigiert wird. Der Konsistenz-Check hat es nie gesehen: er prüft Beschriftungen und Farben, Abstände nur dort, wo sie ein Bauteil tragen. **Abnahme 28.08.:** bleibt offen und bekommt in H1 einen Termin — dort stehen Kopf und Spec-Rail zum ersten Mal zusammen, und ADR 0044 hat die Sticky-Frage schon dorthin verlegt. | offen |
| 28.08.2026 | G3 | **Die Scroll-Sperre des Menüs verschiebt den Inhalt um 15px, und CSS allein kann das nicht ausgleichen.** Gemessen: ein modales `<dialog>` hält das Dokument dahinter *nicht* an, eine Sperre ist also nötig. Sie steht als `html:has(dialog.menu[open]) { overflow: hidden }` — bewusst nicht in JavaScript, weil eine Sperre, deren Fehlerfall „die Seite lässt sich nie wieder scrollen" heißt, nicht an einem Ereignis hängen darf. Der Preis: mit `overflow: hidden` gibt Chrome die Breite des klassischen Scrollbalkens frei, `clientWidth` springt von **1881 auf 1896**. `scrollbar-gutter: stable` hält sie nicht — Chrome reserviert nur für eine Box, die wirklich einen Balken zeigen kann (nachgemessen mit deklarierter Rinne). Der Rest wäre JavaScript, das die Breite misst und als Padding zurückgibt; genau das ist gerade weggeräumt worden. **Sichtbar ist es nirgends, wo das Menü lebt:** es existiert nur unter 900, und Touch-Balken sind Overlays ohne Breite. Übrig bleibt ein auf unter 900 gezogenes Desktop-Fenster. | offen |
| 28.08.2026 | G3 | **Jeder `npm run build` druckt dreimal „Ecmascript file had an error" — und das steht seit Stufe F als #187 im Tracker.** Die drei zeigen auf `instrumentation.ts:70,78,79`, die `process.on`-Registrierungen für SIGTERM und SIGINT; der Build endet mit 0 und alle Routen entstehen, `git diff main` auf die Datei ist leer. **Hier stand es zuerst als frischer Fund**, samt der offenen Frage, ob Turbopack etwas Echtes meldet oder nur Lärm — #187 beantwortet sie seit D1: Next übersetzt die Datei zusätzlich für die Edge-Runtime, die diese Anwendung nicht hat, und der Ausweg (Teilung in eine Node- und eine Edge-Hälfte) ist dort bewusst bis F11 zurückgestellt, mit Abnahmekriterium. **Nicht gelöscht, sondern korrigiert:** dass es ein zweites Mal gefunden wurde, ist die Information, und `CLAUDE.md` nennt genau diesen Fehlermodus mit der F5-Abnahme als Auslöser. Messung als Kommentar an #187. | Dublette von #187 |
| 28.08.2026 | G3 | **Das Chrome bringt sechs Schriftgrößen und drei Laufweiten außerhalb der Skala mit.** Größen 25 · 21 · 19 · 11.5 · 9 · 8.5 px, Laufweiten `.04em`, `.1em`, `.06em` — alle wörtlich aus dem Chrome-Blatt, alle als Literale in `chrome.css`. `tokens.css` führt 13 Größen („keine vierzehnte") und zwei Laufweiten (`--ls-label .14em`, `--ls-head .16em`). Bewusst nicht gerundet: dem verbindlichen Blatt zu folgen ist mehr wert als meine Improvisation, und eine vierzehnte Stufe für ein Bauteil widerspricht dem eigenen Kommentar der Datei. **Gehört zu Punkt (4) des offenen G2-Fundes** (`.12em`, `.13em`, `.20em` in den Handoff-Komponenten) und mit ihm nach G7, wo die Galerie zeigt, welche Werte wirklich mehrfach vorkommen. | offen |
| 28.08.2026 | G3→G4 | **#94 beschreibt eine Reparatur, die es seit dem 23.08. gibt.** Der Issue trägt den Meilenstein G4 und verlangt eine Probe, die nicht `/` rendert, „weil eine API-Störung sonst aus einem Ausfall zwei macht". `web/app/healthz/route.ts` kam am 22.08. mit #154, und `web/Dockerfile` prüft seit #167 am 23.08. `http://127.0.0.1:3000/healthz` — genau die Form, die der Issue beschreibt: statisch, liest nichts, 200 und ab SIGTERM 503. Gefunden beim Nachlesen des Trackers, das dieser Abnahme ohnehin gefehlt hatte, und es ist die teurere Richtung der Drift: eine Zeile im Notizblock, die zu viel behauptet, kostet einen Blick — ein Issue, das erledigte Arbeit verlangt, kostet eine Phase. **Vorschlag: gegen den Stand prüfen und schließen. Nicht von mir geschlossen — der Tracker gehört dir.** | offen |
| 28.08.2026 | G3 | **Das `close`-Ereignis eines `<dialog>` ist aus der Browser-Erweiterung heraus nicht beobachtbar** — auch nicht bei einem nackten Kontroll-`<dialog>` ohne CSS und ohne React. Ein von Hand ausgelöstes `close` erreicht Reacts `onClose` dagegen sehr wohl (`aria-expanded` kippt, die Sperre löst). Für die nächste Abnahme heißt das: leere Ereignislisten aus diesem Weg beweisen nichts, und Zustand muss am DOM abgelesen werden, nicht an Ereignissen. Aus demselben Grund steht `requestAnimationFrame` in einem verborgenen Tab still — eine leere Frame-Liste heißt dort „Tab war verborgen", nicht „Animation läuft nicht". | offen |
| 28.08.2026 | G4 | **Ohne JavaScript bleiben die drei Zellen `— NO DATA`, und vorher taten sie das nicht überall.** Cache Components verlangt für jeden Wert, der auf eine Anfrage wartet, eine `<Suspense>`-Grenze; React liefert den Inhalt danach in einem `<div hidden id="S:n">` am Ende des `<body>` nach und setzt ihn per Inline-Skript an seinen Platz. **Gemessen am Produktionsbuild** (`sha-297cb52`, über den Lab-Proxy): im ausgelieferten HTML stehen der Platzhalter *und* der Wert, der Platzhalter im Baum und der Wert im verborgenen Container. Ohne JavaScript bleibt der Platzhalter stehen. Für die Fußzeile ist das kein Rückschritt — sie sagte vor G4 allen `— NO DATA`. Für die zwei Zeilen auf `/` schon: sie waren `force-dynamic` und kamen serverseitig gerendert an. Kein falscher Wert, nur ein fehlender, und das ist die richtige Richtung — aber es ist eine Aussage weniger für einen Besucher ohne JS, und sie gehört gemessen neben M2 gelegt, wo die Zugänglichkeit geprüft wird. | offen |
| 28.08.2026 | G4 | **Der Dev-Modus hydriert nicht — und zwar auf `main` genauso, seit mindestens G3.** Gemessen: unter `next dev` bleibt die Uhr auf `--:--:--`, ein Klick auf den Theme-Umschalter bewirkt nichts, die Konsole ist leer (Kanarienvogel abgesetzt und wiedergefunden). Dieselben Commits als Produktionsbild hydrieren einwandfrei — die Uhr tickt (`20:22:41` → `20:22:47`). **Drei Kontrollversuche, weil der erste Verdacht falsch war:** (1) `make dev-reset` räumt `node_modules` und `.next` aus den Volumes — der G1-Fund war es nicht, danach steht die Uhr weiter. (2) `next dev` außerhalb des Containers, direkt auf diesem Rechner: dasselbe, also nicht der Dev-Container. (3) **`main`s `web/`-Baum, per `git archive` in ein Scratchpad ausgepackt und dort mit `next dev` gestartet: dasselbe.** Damit ist es **kein G4-Regress**, sondern ein Zustand, der schon vorher da war und niemandem aufgefallen ist, weil die G3-Abnahme gegen Produktion gemessen hat und der Dev-Modus nur für „lädt die Seite" benutzt wurde. Die gestreamten Werte erscheinen trotzdem — die Suspense-Auflösung läuft über Inline-Skripte und braucht keine Hydration, also beweist ein gefüllter Wert dort nichts. **Was das kostet:** jede Phase ab hier, die ein Client-Bauteil im Dev-Modus ausprobieren will (G6, G7, J1, J2), probiert etwas aus, das nicht läuft. Ursache unbekannt; der nächste Griff ist `proxy.ts` (sein Matcher fasst die HMR-Pfade an) und die drei `Ecmascript file had an error`-Meldungen aus #187. **Termin gesetzt am 29.08.2026 in G5: gelöst vor Stufe H1.** Dort liegen schon zwei Schulden desselben Werkzeugs — der 44px-Beleg aus G3 und die `<Activity>`-Messung aus G4, beide „Playwright mit `hasTouch`, vor H1" —, und wer den Dev-Modus repariert, richtet zugleich das Fenster ein, in dem die anderen beiden gemessen werden. G5 hat den Umschalter deshalb gegen ein lokal gebautes Produktionsbild abgenommen statt gegen `next dev`; der Weg steht jetzt in `docs/runbooks/web.md`. | offen, Termin H1 |
| 28.08.2026 | G4 | **Die ETag-Ersparnis auf dem web→api-Sprung ist 279 Byte.** ADR 0009 sagt, ohne CDN sei `s-maxage` vor allem eine Angabe für die Cache Components und „das `ETag` ist die Ersparnis, die tatsächlich auf der Leitung ankommt". Nachgemessen gegen den laufenden Lab-Stack: `GET /api/health` liefert 279 Byte Körper, dieselbe Anfrage mit `If-None-Match` liefert `304` und **null** Byte. Der bedingte Weg funktioniert und ist im Log sichtbar (`"status":304,"conditional":true`) — aber die Zahl ist klein, und sie fällt auf dem Docker-Netz an, nicht auf der Leitung zum Besucher. Sie steht hier, damit sie nicht als „spart Bandbreite" weitergereicht wird, ohne dass jemand sie gesehen hat. Beim Anschluss der größeren Endpunkte (`/api/systems`, `/api/training`) in Stufe H ist sie neu zu messen, dort ist der Körper ein Vielfaches. | offen |
| 28.08.2026 | G4 | **`online: false` ist unerreichbar, und DEGRADED hat kein Wort.** `FooterMeta` zeichnet drei Zustände — `ONLINE`, `OFFLINE`, `— NO DATA` —, aber `/api/health` kann den mittleren nicht auslösen: die Antwort kennt nur `ok` und `degraded`, beides heißt „hat geantwortet", und wenn gar nichts kam, ist der ehrliche Wert `null`. `OFFLINE` steht damit im Code und erscheint nie. Die Gegenrichtung ist der eigentliche Fund: `degraded` wird heute als `ONLINE` gezeigt, weil die Leiste kein drittes Wort hat — ein Zustand, den die API ausdrücklich meldet, ist in der Oberfläche unsichtbar. **Gehört zu G6**, wo die Zustandssprache aus STATE.05 gebaut wird und `DEGRADED` ein Bauteil bekommt; dann verschwindet auch der tote Zweig. | offen |
| 28.08.2026 | G4 | **Drei Messfehler in einer Abnahme, und alle drei sahen aus wie Befunde.** (1) Ein `grep`-Muster, das beim ersten Treffer aufhörte, fand immer den Platzhalter statt des gestreamten Werts — zwei Minuten lang „der Cache hält den Fehlschlag fest", und es war nichts. (2) `docker compose … stop api` gegen den Lab-Stack brach mit „required variable IMAGE_TAG is missing" ab; ich hatte die Ausgabe nach `/dev/null` geschickt, also lief die API weiter, und eine fünfzehnminütige Messung „mit gestoppter API" war in Wahrheit gegen eine laufende. (3) Zehn Seitenaufrufe erzeugten zehn API-Anfragen, und ich habe daraus geschlossen, `use cache` greife nicht — es war `healthLive`, der auf `/` genau einmal pro Anfrage fragt und das auch soll. Sauber isoliert auf `/about`, das nur die beiden gecachten Inseln rendert: **zehn Aufrufe, null API-Anfragen.** Ein Commit mit falscher Begründung war schon geschrieben, bevor der dritte Fehler auffiel. **Die Lehre ist eine Reihenfolge:** erst nachweisen, dass der Aufbau den Zustand hat, den die Messung annimmt (API wirklich aus? Route ohne den zweiten Leser?), dann messen. Und Fehlerausgaben eines Kommandos, dessen Wirkung man gleich behauptet, nie unterdrücken. Die zwei Mess-Fallen der gestreamten Zellen stehen jetzt in `docs/runbooks/web.md`. | erledigt |
| 28.08.2026 | G4 | **#157 hat seine Zahl, und seine Prämisse stimmt nicht mehr.** Der Issue sagt: „From G onwards `/` renders from the API. Then the same window turns every deploy into a burst of 500s." Gemessen am Lab-Rig, echter Tausch (`sha-12384bb` → `sha-rolltest`, beide Container `Recreated`), eine Anfrage je Sekunde auf `/`: **56 Anfragen, 56 × 200, davon 2 mit `— NO DATA`** in der korrelierten Zeile — 21:00:57 bis 21:01:03, rund sechs Sekunden. Keine 5xx, keine 404. Der Grund ist der Entwurf dieser Phase: `lib/api/client.ts` wirft nie, also wird aus dem Fenster kein Anwendungsfehler, sondern ein fehlender Wert. Die drei Kandidaten des Issues (über Traefik statt über den Container-Namen, ein Retry im Wrapper, oder „akzeptieren und messen") sind damit entschieden: **akzeptieren und messen**, und die Zahl steht hier. **Was die Messung nicht ist:** eine Produktionsmessung. Sie lief gegen das Lab-Rig, und `compose.lab.yaml` sagt im Kopf, was es reproduziert und was nicht. Der Gegenbeleg gegen Produktion gehört in die G4-Abnahme. | offen |
| 28.08.2026 | G4 | **#94 ist erledigt, und G4 ist die Phase, die es belegen kann.** Der Issue verlangt eine Probe, die nicht `/` rendert, „weil eine API-Störung sonst aus einem Ausfall zwei macht" — sie existiert seit dem 23.08. (`web/app/healthz/route.ts`, #154; der Healthcheck im `web/Dockerfile` seit #167). Bis jetzt war das nicht prüfbar, weil keine Seite serverseitig die API las. **Jetzt gemessen, am Produktionsimage hinter dem Lab-Proxy, mit nachweislich beendetem `api`-Container** (`Exited (0)`, Proxy antwortet 503): `GET /` → **200**, Fußzeile `— NO DATA`, `timseil-web-1` → `RestartCount 0`, `health: healthy`. Die Störung bleibt eine. **Vorschlag: schließen.** Nicht von mir geschlossen — der Tracker gehört dir. | offen |
| 28.08.2026 | G4 | **`<Activity>` und das Menü: strukturell unbedenklich, aber nicht gemessen.** `cacheComponents: true` schaltet die Navigation auf Reacts `<Activity>` — bis zu drei Routen bleiben montiert und nur versteckt. Für ein offenes `<dialog>` wäre das gefährlich: die Scroll-Sperre ist `html:has(dialog.menu[open])`, und ein in einem versteckten Teilbaum zurückgelassenes `[open]` hieße „die Seite lässt sich nie wieder scrollen" — genau der Fehlerfall, gegen den ADR 0044 die Sperre in CSS gelegt hat. **Kann hier nicht eintreten:** `app/layout.tsx` rendert `<SiteHeader />` als Geschwister von `{children}`, und Activity versteckt Routen, nicht das Layout. Das Menü ist also nie im versteckten Teilbaum. **Nicht behavioral gemessen**, und der Grund ist derselbe wie in G3: der Knopf existiert nur unter 900, und der Kachel-WM lässt das Fenster nicht schmaler ziehen; eine per CSS erzwungene Mobil-Fassung würde die Override messen und nicht die Anwendung. Der Beleg gehört an denselben Ort wie der 44px-Beleg aus G3: **Playwright mit `hasTouch`, eingerichtet vor H1.** Zu prüfen ist dort: Menü offen → Navigation über einen Link außerhalb des Dialogs bzw. über Zurück/Vorwärts → `dialog[open]` ist fort und `html` scrollt wieder. | offen |
| 28.08.2026 | G4 | **Ein Zeuge mit einer Anfrage pro Sekunde kostet ab Stufe G API-Budget, und zwei kosten zu viel.** Das Rate-Limit der API ist `RATE_LIMIT_RPM=120` mit `RATE_LIMIT_BURST=60` **pro Client** — und am API-Ende ist der ganze web-Container *ein* Client. Seit G4 rendert jede Seitenanfrage einen Aufruf an `/api/health`, also ist jede beobachtete Anfrage auch eine gezählte. `tools/witness.sh` läuft mit einer Anfrage pro Sekunde: 60/min, innerhalb des Limits, aber die Hälfte des Budgets. **In der G4-Abnahme hatte ich zwei Zeugen parallel laufen** — 120/min, genau am Limit — und hätte das entstehende `429` als Deploy-Fenster gelesen, statt als meine eigene Last. Rechtzeitig bemerkt und auf eine Anfrage alle drei Sekunden gedrosselt. **Zu entscheiden:** ob `witness.sh` einen Hinweis oder eine Vorgabe für das Intervall bekommt, jetzt wo eine beobachtete Seite auch eine gezählte API-Anfrage ist. Berührt #158, das an derselben Datei schon eine veraltete Erklärung führt. | offen |
| 29.08.2026 | G5a | **Das Blatt verlangt einen dritten localStorage-Key, und die Invariante gewinnt.** Der Sprachumschalter-Entwurf schreibt `ts.lang` vor („merkt nur eine bewusste Wahl und hebt sie im Umschalter hervor"), Invariante 9 nennt genau zwei, und die Lint-Regel in `web/eslint.config.mjs` weist einen dritten mit der Begründung ab, das sei „a decision, not a detail — make it in the build plan first". Der Bauplan entscheidet es selbst: „Kollidiert eine Phase mit einer Invariante, gewinnt die Invariante." **Der Preis ist null:** `ts.lang` hätte nur den aktiven Eintrag im Panel markiert, und der kommt jetzt aus `usePathname()`, weil die URL ohnehin die Wahrheit ist — ein gespeicherter Wert könnte der Adresse nur widersprechen. Nicht gebaut. Als `design-correction` **#221** angelegt, Meilenstein K1. ADR 0046. | erledigt |
| 29.08.2026 | G5a | **`dynamicParams = false` ist unter Cache Components verboten, und der Plan hatte damit gerechnet.** Der Entwurf wollte den Router die Sprachliste erzwingen lassen — drei Sprachen aus `generateStaticParams`, alles andere eine 404, bevor eine Komponente läuft. Turbopack weist das ab: „Route segment config 'dynamicParams' is not compatible with nextConfig.cacheComponents." `generateStaticParams` bleibt Pflicht (ohne mindestens einen Wert bricht der Build), ist aber **keine vollständige Liste**. Der Schutz liegt jetzt eine Ebene tiefer in `getDictionary()`, das `notFound()` ruft. Gemessen gegen den laufenden Produktionsbuild: `/es`, `/es/about` und `/english` antworten mit 404. **Wert des Fundes:** die Annahme stand im freigegebenen Plan und wäre als „der Router schützt uns" weitergereicht worden; der Build hat sie in einem Satz widerlegt. | erledigt |
| 29.08.2026 | G5a | **`check-adrs` durchsucht auch `web/.next/`.** Beim ersten Lauf gegen diesen Branch meldete die Prüfung einen Verweis auf ADR 0046 aus `web/.next/cache/turbopack/v16.3.2-d0ac8828/00000001.sst` — einer generierten Binärdatei neben den vier echten Quelltexttreffern. Hier war der Verweis echt und die Meldung richtig. **Der Fund ist die Gegenrichtung:** ein Treffer aus `.next/` kann nie eine Quelle sein, überlebt einen `git checkout` und erzeugt eine Meldung, die niemand reparieren kann, weil die Datei bei der nächsten Bauzeit wieder anders heißt. Andere Prüfungen in `tools/` lesen `git ls-files`; diese nicht. Nicht in G5 geändert — `selftest.sh` und die Prüfregeln sind eingefroren, und ein Vorfall ist das noch nicht. | offen |
| 29.08.2026 | G5a | **Die Entscheidungstabelle im README endet bei ADR 0029, und G5 hat den Abstand vergrößert.** #205 zählt zwölf fehlende ADRs; mit 0030–0046 sind es jetzt **siebzehn**. In G5 bewusst nicht mitrepariert: siebzehn Zeilen in einer i18n-Phase nachzutragen ist eine zweite Aufgabe im selben PR, und der Issue besteht bereits. Die Zahl im Issue stimmt allerdings nicht mehr. | offen |
| 29.08.2026 | G5a | **React schreibt `hrefLang`, nicht `hreflang`, und das ist kein Fund zum Reparieren.** Die vier alternate-Links stehen als `<link rel="alternate" hrefLang="en" …>` in den ausgelieferten Bytes. HTML-Attributnamen sind case-insensitiv, Crawler lesen es korrekt, und die Schreibweise ist Reacts Serialisierung der JSX-Prop. Aufgeschrieben, damit es beim nächsten Durchsehen der Bytes nicht als Defekt gemeldet und „korrigiert" wird — die Korrektur wäre ein `dangerouslySetInnerHTML` für vier Links. | erledigt |
| 29.08.2026 | G5b | **Next mischt `metadata` flach, und das hätte den Feed-Link auf allen sieben Seiten still verschluckt.** Setzt eine Seite `alternates`, **ersetzt** das den Block des Layouts statt ihn zu ergänzen; für `openGraph` gilt dasselbe, und die eigene Doku zeigt es an einem Beispiel, in dem eine Seite nur `title` setzt und trotzdem das `og:title` des Layouts ausliefert (`generate-metadata.md:1405-1418`). Seit G5a benennt **jede** Seite ihren Kanonischen selbst — der naheliegende Ort für den Feed-Link und die OG-Angaben, das Root-Layout, wäre also von allen sieben Routen überschrieben worden, und im Layout hätte es vollkommen richtig ausgesehen. `lib/seo/pages.ts` liefert die drei Blöcke jetzt in einem Stück, das Layout trägt einen Kommentar, der sagt warum, und `pages.test.ts` prüft den Feed-Link auf jeder Route. **Wert des Fundes:** der Defekt hätte nur in den ausgelieferten Bytes bestanden, nicht im Quelltext. | erledigt |
| 29.08.2026 | G5b | **`outputFileTracingIncludes` ändert heute nichts, und das steht jetzt im Kommentar statt einer Behauptung.** Die OG-Route liest `styles/tokens.css` mit `readFileSync`; `output: "standalone"` kopiert, was der Modulgraph erreicht, und ein `readFileSync` ist kein Import. Der Plan hatte die Zeile als notwendig geführt. **Gegenprobe gebaut:** ohne sie liegt `.next/standalone/styles/tokens.css` genauso da — `app/[lang]/layout.tsx` importiert dieselbe Datei als Stylesheet, der Tracer folgt dem Import und kopiert die Quelle mit. Die Zeile bleibt, aber als **erklärte** Abhängigkeit statt als zufällig geltende: bewegt sich dieser Import je, bräche die Route in Produktion und nur dort. Ein Commit mit der ersten Begründung wäre eine Behauptung gewesen, die eine Messung widerlegt. | erledigt |
| 29.08.2026 | G5b | **Die `hrefLang`-Falle stand seit gestern im Backlog und ich bin trotzdem hineingelaufen.** Ein `grep hreflang` über den Kopf von `/about` fand nichts, und die naheliegende Schlussfolgerung war „G5b hat die vier alternate-Links kaputtgemacht". Sie waren alle da — React serialisiert die Prop mit großem L. Der Eintrag darüber (29.08., G5a) sagt genau das, und der Runbook auch. **Die Lehre ist nicht „aufschreiben", das war es schon, sondern wo:** die Warnung stand im Abschnitt über die Sprachrouten, gesucht wurde im Abschnitt über die SEO-Flächen. Sie steht jetzt in beiden. | erledigt |
| 29.08.2026 | G5b | **Ein Kommentar aus G5a beschrieb einen Schutz, den es nie gab.** `asLocale` in `lib/i18n/routes.ts` sagte, die Funktion sei unerreichbar, „while `dynamicParams = false` stands in the root layout" — dieses Segment-Config hat Turbopack abgewiesen, was im Layout und in ADR 0046 steht. Der Schutz liegt in `getDictionary()`. Der Kommentar war eine Zeile im selben PR, der die Abweisung dokumentierte; er hat die Korrektur nur nicht mitbekommen. Beim Anfassen der Datei berichtigt. **Übertragbar:** ein Kommentar, der eine Vorbedingung nennt, veraltet stiller als Code, weil kein Test ihn liest. | erledigt |
| 29.08.2026 | G5b | **`make check` ruft `next build` nirgends auf, und die vier neuen Dateien sind genau die Sorte, die das ausnutzt.** `check-web` fährt typecheck, lint und `node --test`; eine `sitemap.ts`, die typecheckt und beim Bauen bricht, wird zuerst im `images`-Job rot. Das ist kein Defekt — die Pipeline baut auf jedem PR, und `make check` muss auf einem Fork ohne Docker durchlaufen (ADR 0031) —, aber wer lokal nur `make check` laufen lässt, hat diese Phase nicht geprüft. Als Absatz an den Anfang des neuen Runbook-Abschnitts geschrieben, nicht als neue Prüfregel: `selftest.sh` und die Prüfskripte sind eingefroren, und ein Vorfall ist das nicht. | erledigt |
| 29.08.2026 | G5-Abnahme | **Der Feed trug ein Jahr, das niemand geschrieben hat.** `app/feed.xml/route.ts` begründete in einem Absatz, warum keine Cache-Politik erfunden wird — „NO `Cache-Control` EITHER" —, und die ausgelieferten Bytes sagten `cache-control: s-maxage=31536000` bei `x-nextjs-cache: HIT`. Next setzt den Header selbst, wenn ein vorgerenderter Route Handler keinen setzt; **nichts zu setzen heißt nicht, dass keiner gesetzt wird.** Heute ohne Wirkung (kein CDN, ADR 0006), ab H9 ein Jahr auf einem Dokument, das sich mit jedem Post ändert. Repariert mit dem Wert der drei Nachbarn — `robots.txt`, `sitemap.xml` und `og.png` antworten alle `public, max-age=0, must-revalidate`, weil Next Metadata-Routen anders behandelt als einen selbstgeschriebenen Handler. Abgeleitet, nicht gewählt (ADR 0045). Die verworfene Alternative in ADR 0047 ist als widerlegt gekennzeichnet, und der Runbook prüft die vier Header jetzt nebeneinander. **Kein `make check` hätte das gefunden** — es liest keine Header, und `next build` auch nicht. | erledigt |
| 29.08.2026 | G5-Abnahme | **`ops.lastDeploy.durationSec` misst den Pipeline-Lauf, nicht den Deploy — und wartet mit.** Der Deploy von `0fc863e` meldete **511 s**, die beiden davor 224 s und 222 s. Nachgerechnet statt geschätzt: „Lauf-Start bis Deploy-Ende" trifft den gemeldeten Wert dreimal auf 2–6 s genau (226/224, 228/222, 514/511), und der `deploy`-Job selbst dauerte in allen drei Fällen 25–28 s. Die Differenz war **Warten**: der Lauf wurde 16:45:57 angelegt, sein erster Job startete 16:49:55 — `concurrency: ci-${{ github.ref }}` mit `cancel-in-progress: false` hatte ihn hinter den Lauf von `18a376c` gestellt, dessen `quickstart` bis 16:49:52 lief. Zwei Merges sieben Minuten auseinander, zum ersten Mal. **Warum es über Neugier hinausgeht:** `tools/check-deployed.sh` benutzt genau diesen Wert als Budget für seine Toleranz „einen Schritt hinter `main`" (Zeile 210). Ein aufgeblähter Wert macht die Toleranz weiter, ohne dass jemand sie erhöht hat — die Prüfung wird nachsichtiger, weil ein *fremder* Merge lange in der Schlange stand. Nicht repariert: welche Zahl richtig ist, hängt davon ab, was die Kachel auf der Fallstudie behaupten soll, und das entscheidet H2. | offen |
| 29.08.2026 | G5-Abnahme | **Ein `docs(backlog):`-Merge löst einen Deploy aus, nur keinen Release.** Ich hatte das Gegenteil behauptet, zweimal. `publish` und `deploy` hängen am Push auf `main`, nicht am Commit-Typ; was der Typ steuert, ist allein der Tag aus `tools/release.sh`. Der Merge von #225 ging deshalb um 16:42 in Produktion, mit Version `v0.13.0-1-g18a376c` — ein Commit hinter dem Tag, kein neuer Release. Aufgeschrieben, weil die Annahme „Doku deployt nicht" bequem und falsch ist und beim nächsten eiligen Doku-Merge dieselbe Überraschung erzeugt. | erledigt |

| 29.08.2026 | G6 | **`grep -c` zählt Zeilen, keine Vorkommen — und ausgeliefertes HTML ist eine Zeile.** Bei der Messung mit gestoppter API meldete `grep -c 'st-nodata-text'` die Zahl `2`, während im Dokument **acht** standen: vier Platzhalter und vier gestreamte Werte. Zwei Minuten lang sah es aus, als würden zwei der vier Zellen ihren Ruhezustand nicht rendern. Richtig gezählt wird mit `grep -o … \| wc -l` oder in Python. **Dieselbe Familie wie die drei G4-Fallen und die G5-Falle mit dem angehängten Schrägstrich**, und der Zusatz dieser Runde ist wieder klein und übertragbar: *eine Zählung, die nicht zählt, was man glaubt, sieht aus wie ein Befund.* Steht jetzt im Runbook neben den zwei bestehenden Messfallen der gestreamten Insel. | erledigt |
| 29.08.2026 | G6 | **Der Punkt misst 6 px in Fußzeile und Menüstreifen und 7 px überall sonst, und beide Zahlen sind belegt.** Das Chrome-Blatt zeichnet an diesen zwei Stellen 6, das Handoff-Bauteil `docs/design/code/components/StatusDot.tsx` überall 7. Das Blatt ist für Kopf und Fußzeile die verbindliche Fassung und G3 ist gegen es abgenommen worden, also stehen beide Zahlen — `chrome.css` setzt `--st-dot: 6px` für die zwei Kontexte. **Nicht still gemittelt**, weil eine gemittelte Zahl keinen Beleg mehr hat. Gehört zu derselben Sorte wie der offene Nav-Abstand 30 gegen 32 aus G3 und sollte mit ihm zusammen in H1 oder in der nächsten Konsistenzrunde entschieden werden. | offen |
| 29.08.2026 | G6 | **Zwei der vier Punkt-Füllungen haben heute keinen Aufrufer.** `barred` (OFFLINE) kann `/api/health` nicht auslösen — beide Vertragswörter heißen „hat geantwortet" —, und `dash` (QUEUED, `— NO DATA` als Punkt) erscheint nicht, weil die Metaleiste ohne Antwort `<NoData/>` als Text zeigt statt eines Punktes. Belegt sind beide durch `words.test.ts`, nicht durch ein Bild. Erwogen und verworfen: die Metaleiste auf `<StatusDot state="nodata">` umzustellen, damit die vierte Füllung einen Betrachter bekommt — der Punkt *ist* dort ein Gedankenstrich, und daneben stünde `— NO DATA` mit einem zweiten. Ein Bauteil zu verbiegen, damit eine Abnahme ein Bild bekommt, ist die falsche Richtung. Erster Einsatz: H1 und H6, wo eine Systemzeile QUEUED trägt. | offen |
| 29.08.2026 | G6 | **Der Fund aus G4 ist zu: `degraded` ist sichtbar, und `OFFLINE` ist aus der Health-Antwort verschwunden.** Der Eintrag vom 28.08. („`online: false` ist unerreichbar, und DEGRADED hat kein Wort") ist gemessen geschlossen. Gegen einen Produktionsbau mit `SITE_SYSTEM_SLUG=no-such-system`: `/api/health` sagt `degraded`, die Zeile auf `/` sagt nach zehn Sekunden DEGRADED, Fußzeile und Menüstreifen nach zwanzig — die Differenz ist `healthCached` mit `revalidate: 60`. Mit gestoppter API sagen alle vier Zellen `— NO DATA` nach 40–50 s, und `/` antwortet die ganze Zeit `200`. `FooterHealth.online: boolean \| null` ist `status: … \| null` geworden, `onlineText` ist fort, und der tote OFFLINE-Zweig mit ihm. | erledigt |
| 29.08.2026 | G6 | **Die Amber-Palette ist der bessere Beleg als die Graustufen.** Gemessen im Browser, während DEGRADED stand: `data-theme="amber"` schickt Wort **und** Ring von `rgb(255,176,0)` auf `rgb(127,209,174)` — Mint, weil der Akzent dieser Palette selbst Amber ist (`tokens.css`, Zeile 255). Wort und Füllung blieben unverändert. Graustufen zeigen, dass die Information ohne Farbe ankommt; die Palette zeigt, dass sie ankommt, **wenn die Farbe eine völlig andere ist** — und das ist der Fall, den ein Nutzer wirklich herstellt, indem er ein Theme umschaltet. | erledigt |
| 29.08.2026 | G6 | **`globals.css` bleibt unberührt, und der gefärbte Puls kostete dafür null Zeilen.** `@keyframes ts-pulse` steht hart auf `--acc-pulse`, also auf dem Akzent; ein Degraded-Punkt hätte in Cyan gepulst. Statt eines zweiten Keyframes setzt `.st-dot[data-pulse]` die zwei Custom Properties **lokal** neu (`color-mix(in srgb, var(--st-color) 70%, transparent)`, die Prozente des Handoffs) und richtet damit das Keyframe des Designers auf seinen eigenen Ton aus. Im Browser nachgemessen: `animationDuration` ist `2.6s` — `--d-pulse` wird zum ersten Mal gelesen, seit G1 es deklariert hat. Die Datei, deren Kopf sagt, dass kein Wert in ihr unserer ist, hat kein Zeichen verloren. | erledigt |

## Idee — noch nicht entschieden

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
