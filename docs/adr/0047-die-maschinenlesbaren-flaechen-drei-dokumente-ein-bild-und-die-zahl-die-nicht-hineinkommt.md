# ADR 0047 — Die maschinenlesbaren Flächen: drei Dokumente, ein Bild, und die Zahl, die nicht hineinkommt

**Status:** Angenommen
**Datum:** 2026-08-29
**Betrifft:** G5, G6, G7, H1–H13, K2, L4, M6, P6
**Invarianten:** 1 (keine erfundenen Zahlen), 8 (keine Farbe außerhalb `tokens.css`)

## Kontext

Der Bauplan gibt G5 zwei Zeilen (1211–1212). G5a hat die erste Hälfte gebaut —
die Sprachroute, `hreflang`, `<html lang>`, den Umschalter (ADR 0046). Diese
Phase ist die zweite: `sitemap.ts`, `robots.ts`, RSS, OG über `next/og` und
JSON-LD.

**G5a hat die Nähte dafür schon gelegt, und zwar namentlich.** `RESERVED` in
`web/lib/i18n/routes.ts` nennt `robots.txt`, `sitemap.xml`, `feed.xml` und
`og.png`, bevor es sie gab; `routes.test.ts` prüft schon, dass der Proxy sie in
Ruhe lässt; `web/lib/site.ts` trägt `SITE_NAME` und `AUTHOR`, die nichts las,
mit dem Kommentar „Used by the JSON-LD `Person` in G5b"; die sechs Stub-Seiten
behaupten in ihren Kommentaren, `app/robots.ts` erlaube alles. Diese Phase löst
fünf Versprechen ein, die als Kommentar im Baum standen.

Dazu kommen drei Vorgaben, die nicht verhandelbar sind:

- **Invariante 1.** Keine Zahl, die kein System gemessen hat.
- **Invariante 8.** Keine Farbe außerhalb `tokens.css`; `tools/check-tokens.sh`
  liest jede `.ts` und `.tsx` unter `web/`.
- **Die Hülle bleibt vorgerendert** (ADR 0043, ADR 0045). Ein `headers()` nähme
  jede Seite aus dem statischen Durchlauf.

## Entscheidung

**Die vier Flächen liegen als Route Handler an der Wurzel von `app/`, ihre
Entscheidungen liegen in `web/lib/`, und was keine Messung hat, steht nicht
drin.**

Im Einzelnen:

```
app/robots.ts        erlaubt alles; die Verweigerung ist pro Seite
app/sitemap.ts       drei URLs — nur was indexierbar ist, × drei Sprachen
app/feed.xml/        gültiger RSS-2.0-Kanal, null Einträge bis H9
app/og.png/          1200 × 630, aus next/og, Farben aus tokens.css geparst
lib/seo/pages.ts     die eine Tabelle: welche Route sagt heute etwas
lib/seo/feed.ts      Kanal und Eintrag, escaped, unter node --test
lib/seo/jsonld.ts    Person + WebSite als ein @graph, sicher serialisiert
lib/og/tokens.ts     der :root-Block von tokens.css als Map
components/JsonLd.tsx  nonce-fähig, nicht nonce-verdrahtet
```

## Konsequenzen

### Eine Tabelle statt sieben Literale, und es ist die Umkehrung von `chrome.ts`

Bis G5a trug jede Stub-Seite `robots: { index: false }` als Literal, mit der
Begründung daneben. Das liest sich gut und hat einen Defekt: `sitemap.ts`
braucht dieselbe Antwort, und eine Sitemap, die eine `noindex`-URL nennt,
widerspricht der Seite, auf die sie zeigt. Zwei Kopien von „ist diese Seite
fertig" driften bei der ersten H-Phase, die eine Seite füllt und die zweite
Liste vergisst.

Also steht das Boolean einmal in `lib/seo/pages.ts`, und beide lesen es.

**Das ist ausdrücklich das Gegenteil der Regel in `lib/chrome.ts`** („a table
the implementation reads is not an oracle, it is a second copy of the answer"),
und der Unterschied ist der Grund. Dort ist die Tabelle die Abschrift eines
Blattes: eine Behauptung, die gegen eine äußere Quelle geprüft werden muss, und
eine Implementierung, die ihre eigene Prüfung importiert, prüft nichts. Hier
gibt es keine äußere Quelle — niemand außerhalb dieses Repositories weiß,
welche unserer Seiten fertig sind. Der Wert ist keine Behauptung, sondern eine
Entscheidung, und eine Entscheidung gehört an eine Stelle.

### Die Metadaten mischen flach, und das kostete beinahe den Feed-Link auf allen sieben Seiten

Next mischt `metadata` aus Layout und Seite **nicht** tief. Setzt eine Seite
`alternates`, **ersetzt** das den Block des Layouts; dasselbe gilt für
`openGraph`. Die eigene Doku zeigt es an einem Beispiel, in dem eine Seite nur
`title` setzt und trotzdem das `og:title` des Layouts ausliefert
(`generate-metadata.md:1405-1418`).

Da seit G5a **jede** Seite ihren Kanonischen selbst benennt, wäre alles
Soziale, das ins Layout gewandert wäre, von allen sieben Seiten stillschweigend
verworfen worden — und im Layout hätte es vollkommen richtig ausgesehen.
`seoFor()` liefert deshalb `alternates`, `openGraph` und `twitter` in einem
Stück, und im Layout steht ein Kommentar, der sagt, warum dort nichts davon
steht.

### Die Sitemap trägt kein `lastModified`, und das ist Invariante 1

Die naheliegende Zeile ist `lastModified: new Date()`. Sie ist der Zeitpunkt,
zu dem dieser Container gebaut wurde, und nicht der Zeitpunkt, zu dem sich an
der Seite etwas geändert hat. Jeder Deploy verschöbe jedes Datum, und ein
Crawler bekäme gesagt, die ganze Seite sei neu geschrieben worden, weil eine
Abhängigkeit einen Patch-Bump hatte.

Das ist dieselbe Regel, die `— NO DATA` in die Fußzeile schreibt, nur in einer
Datei, in die niemand sieht. `changeFrequency` und `priority` fehlen aus einem
schwächeren Grund: Google sagt schriftlich, dass es beide ignoriert.

**Gemessen:** die Sitemap nennt heute drei URLs — `/`, `/de`, `/fr` — jede mit
allen vier `hreflang`-Alternativen. Sechs von sieben Routen sind Stubs und
sagen `noindex`; sie kommen dazu, wenn ihre H-Phase das Boolean kippt.

### Der Feed ist gültig und leer, weil ein Eintrag heute in eine 404 zeigte

Sechs Posts liegen in `web/content/posts/`, und nichts rendert sie: `/blog` ist
ein `[SOON]`-Stub, `/blog/<slug>` entsteht in H9. Sechs `<item>` hießen sechs
`<link>` auf sechs 404er — ein Dokument, dessen einziger Zweck es ist, von einer
Maschine gelesen zu werden, die Links folgt, ausgestattet mit Links, die
nirgendwohin führen. Ein Leser merkt sich den Eintrag und zeigt den Fehlschlag
danach bei jedem Abruf.

**Die Eintrags-Erzeugung ist trotzdem gebaut und getestet.** Sie ist der einzige
Teil, der falsch sein kann, ohne dass es auffällt: ein nicht maskiertes
Und-Zeichen in einem Titel erzeugt ein Dokument, das strenge Parser ablehnen und
milde falsch anzeigen — und der Tag, an dem H9 den ersten echten Titel einhängt,
ist der falsche Tag, das zu entdecken. Der leere Kanal ist der Zustand, der
Renderer ist die Maschine.

**Ein Feed, nicht drei.** Das Language-Switcher-Blatt: „Die Blog-Posts bleiben
einsprachig englisch."

### Das OG-Bild liest `tokens.css`, weil Satori keine Kaskade kennt

`next/og` rendert über Satori: Inline-Styles, kein Stylesheet, keine Custom
Properties. Das Bild kann also nicht `var(--bg)` schreiben, es braucht den Wert
— und Invariante 8 verbietet ein Farbliteral überall unter `web/` außer in
`tokens.css`. Die Fehlermeldung von `check-tokens.sh` nennt den einzigen
Ausweg selbst: „use a token, or add one to tokens.css".

Also liest das Bild `tokens.css`. Nicht eine erzeugte Kopie, nicht einen von
Hand gepflegten TypeScript-Zwilling — die Datei, zur Bauzeit. Die Invariante
bleibt ohne Ausnahme im Prüfskript, und wenn ein Palettenwert sich ändert,
ändert sich die Karte mit, statt die eine Fläche zu sein, die noch das Blau vom
letzten Monat zeigt.

Zwei Dinge, die dabei kostenlos waren und es nicht mussten:

- **Die Schrift.** `next/og` bringt `Geist-Regular.ttf` als Standardface mit,
  und Geist ist genau, was G2 auf `--body` gelegt hat. Kein `fonts:`-Block. Ein
  Face aus `next/font/google` wäre ohnehin nicht gegangen: das gibt einen
  Klassennamen heraus, nie einen Puffer.
- **Die Abhängigkeit.** `next/og` liegt in `next`. Keine neue Zeile in
  `package.json`, kein neuer sha256 für `package-lock.json`.

**Nur der erste `:root`-Block wird gelesen.** Darunter überschreiben sieben
`[data-theme]`-Blöcke dieselben Namen; ein Parser, der den letzten Treffer
nähme, zeichnete die Karte in Gruvbox Light. Das Bild hat kein Theme — es ist
eine Datei für alle —, also bekommt es die Palette, die gilt, wenn niemand
gewählt hat: Terminal Noir, und das ist genau `:root` (ADR 0043).

Werte mit `var()` oder `color-mix()` werden übersprungen, weil Satori sie nicht
auflöst und dann den Fallback zeichnet — bei einer Farbe ist der transparent.
Sie zurückzugeben hieße dem Aufrufer einen Wert anzubieten, der brauchbar
aussieht und es nicht ist; sie wegzulassen macht daraus einen fehlenden
Schlüssel, und `requireTokens()` macht aus einem fehlenden Schlüssel einen
stehengebliebenen Build.

### Das Bild ist angeordnet, nicht entworfen

Kein Blatt des read-only-Handoffs zeichnet eine OG-Karte. Eines zu entwerfen
wäre derselbe Übergriff, der das Favicon (#96) nach K2 verschoben hat. Alles auf
der Karte gibt es schon woanders: die Wortmarke aus `components/Wordmark.tsx`,
die zwei Sätze aus `lib/site.ts`, die Rolle aus der Zeile „Rolle" der
Übersetzungsmatrix `LANG.01`, die vier Farben aus `tokens.css`.

**Eine Karte für drei Sprachen.** Alle drei Routen zeigen heute englischen Text,
weil die deutschen und französischen Wörterbücher bis P6 leer sind; drei
identische PNGs wären drei Dinge, die auseinanderlaufen können, für keinen
sichtbaren Unterschied.

### `og.png` ist ein Route Handler, und das war schon G5as Entscheidung

Eine `opengraph-image.tsx` unter `app/[lang]/` läge hinter der kanonischen
Umleitung, die Adressen in diesem Baum umschreibt und mit 308 beantwortet.
`RESERVED` hält den Pfad frei, der Proxy-Matcher gibt ihm keine Request-Id, und
beide Listen bleiben getrennt geführt — aus dem Grund, den `proxy.ts` schon
nennt.

### JSON-LD: ein Graph, ein Serialisierer, und drei Aussagen, die fehlen

`Person` und `WebSite` stehen als **ein** `@graph` mit `@id`-Verweisen
aufeinander. Zwei getrennte Blöcke sagten dasselbe zweimal und ließen die beiden
frei, sich zu widersprechen.

Der Block steht **nur auf `/`** (also `/`, `/de`, `/fr`). Die sechs Stubs sagen
`noindex`; ein Graph auf ihnen beschriebe eine Seite, die niemand listen darf.

`inLanguage` ist **abgeleitet, nicht geschrieben**: es kommt aus `resolved` —
der Sprache, in der die Wörter tatsächlich sind —, also sagt `/de` heute `en`
und fängt am Tag, an dem P6 das Wörterbuch füllt, von selbst an, `de` zu sagen.
`de` hier hinzuschreiben hieße, eine Übersetzung zu behaupten, die die Seite
nicht hat.

Drei Angaben fehlen, und jede Lücke ist eine Behauptung, die nicht gemacht wird:

| Fehlt | Warum |
|---|---|
| `SearchAction` | Es gibt bis H9 keine Suche. Eine Query-URL, die 404 antwortet, ist die maschinenlesbare Fassung einer erfundenen Zahl |
| `image` | Es gibt kein Foto in diesem Repository |
| `address` | „BASED IN LUXEMBOURG" ist eine Fußzeile, keine Postanschrift, und `PostalAddress` will eine |

Der Serialisierer maskiert `<`, `>` und `&` als JSON-Unicode-Escapes. Ein
HTML-Parser beendet ein Script-Element an der Zeichenfolge `</script`, in einem
JSON-String genauso bereitwillig wie außerhalb; ein Wert, der sie trägt,
schließt den Block früh, und alles danach ist Markup. Heute erreicht nichts aus
einer Anfrage diese Funktion — die Werte sind Konstanten dieses Repositories.
Sie ist für den Tag geschrieben, an dem einer davon ein Post-Titel ist, denn an
dem Tag ist der Defekt im Review unsichtbar.

`JsonLd` nimmt eine `nonce`-Prop, **die niemand übergibt** — dieselbe Naht wie
`ThemeScript`, aus demselben Grund (ADR 0043). Mit einem Unterschied, der
gesagt sein will: eine nonce-basierte CSP blockte dieses Element auch ohne Nonce
**nicht**, weil `script-src` Ausführung regelt und hier nichts ausgeführt wird.
Die Prop ist da, damit eine spätere, strengere CSP etwas zum Anfassen hat, nicht
weil das heutige Fehlen ein Defekt wäre.

### Was das kostet

**Eine `.tsx` läuft unter `node --test` nicht.** Node 24 entfernt Typen,
transformiert aber kein JSX, und `npm test` liest ohnehin nur `lib/**` und
`styles/**`. Also ist `app/og.png/route.tsx` **ungetestet**. Getestet ist, was
darunter liegt — `rootTokens`, `requireTokens`, und die Zusicherung, dass
`tokens.css` die vier Namen heute wirklich trägt. Das Bild selbst wird
angesehen, nicht behauptet; der Runbook-Abschnitt sagt, wie.

**Sieben `page.tsx` wurden angefasst, um eine Zeile zu ersetzen.** Der Preis der
einen Tabelle ist ein Diff quer durch alle Routen in einer Phase, die
inhaltlich keine davon anfasst.

**`make check` baut nicht.** Keine der 21 Prüfungen ruft `next build`, und die
vier neuen Dateien sind genau die Sorte, die typecheckt und beim Bauen bricht.
Der Bauschritt bleibt `make image-web`, und ohne ihn ist die Phase nicht geprüft.

**Der Feed ist eine öffentliche Adresse ohne Inhalt.** Bis H9 kann jemand ihn
abonnieren und bekommt nie etwas. Das ist die ehrlichere von zwei Fassungen,
aber es ist nicht kostenlos.

**Ein Satz steht jetzt zweimal in den ausgelieferten Bytes.**
`SITE_DESCRIPTION` ist aus dem Layout nach `lib/site.ts` gewandert und wird an
zwei Stellen gesetzt — als `description` und als `og:description` —, weil Next
`og:title` und `og:description` **nicht** aus `title` und `description`
ableitet. Ausgelassen hieße nicht „fällt zurück", sondern „fehlt". Die Quelle
ist eine, die Ausgabe ist zwei; ein `SITE_TITLE` neben `SITE_NAME` wäre die
Wiederholung eine Ebene zu früh gewesen und ist deshalb nicht entstanden.

## Verworfene Alternativen

| Weg | Warum nicht |
|---|---|
| Die vier Farben als Literale in der OG-Route, `check-tokens.sh` um eine zweite Ausnahme erweitert | Die erste Bresche in Invariante 8, und das Prüfskript nennt in seiner eigenen Fehlermeldung den Weg, der keine braucht |
| Ein Generator, der `tokens.css` nach `lib/tokens.generated.ts` schreibt, plus Drift-Prüfung | Ein Werkzeug, das ein Werkzeug prüft, für ein einziges Bild. „Maß halten": im Zweifel Inhalt |
| Das OG-Bild wie das Favicon nach K2 verschieben | Der Bauplan nennt es in G5, `RESERVED` hält den Pfad seit G5a frei, und die Karte ordnet nur an, was der Handoff schon hergibt |
| `lib/posts.ts` jetzt bauen und den Feed mit sechs Einträgen füllen | Sechs `<link>` auf sechs 404er. Und #192: das Frontmatter-Schema ist bis H9 vorläufig |
| RSS ganz auf H9 verschieben | Der Discovery-Link und der Kanal kosten wenig und sind der Teil, den H9 sonst noch einmal entwerfen müsste |
| Alle sieben Routen in die Sitemap, `noindex` hin oder her | Die Seite forderte einen Crawler auf zu kommen und schickte ihn an der Tür wieder weg |
| `Disallow: /en/` in `robots.txt` | Die 308 ist der Weg, auf dem ein Crawler die kanonische Adresse lernt. Und `Disallow` und `noindex` sind nicht dieselbe Anweisung: eine nicht abgerufene Seite wird nie gelesen, ihr `noindex` also nie |
| `og:locale` setzen | Das Format ist `sprache_TERRITORIUM`. `en_US` wäre geraten und `en_GB` anders geraten. `hreflang` trägt den Sprachsatz ohnehin, und in der Form, auf die ein Crawler reagiert |
| `openGraph` ins Root-Layout | Wird von jeder Seite ersetzt, die `openGraph` setzt — und sähe im Layout richtig aus |
| `lastBuildDate` im Feed, `lastModified` in der Sitemap | Bauzeit ist keine Änderungszeit. Invariante 1 |
| `Cache-Control` auf Feed und Sitemap | Es gibt kein CDN vor diesem Origin (ADR 0006). Eine `s-maxage` wäre eine Anweisung an eine Maschine, die es nicht gibt |

## Belege

Gemessen gegen `next start` auf dem Produktionsbuild dieses Branches,
29.08.2026, lokal auf Port 3111. Die Zahlen gegen Produktion stehen in der
Abnahme, nicht hier.

```
make check                    21 Prüfungen grün, 205 Tests
next build                    35 Seiten; /feed.xml /og.png /robots.txt
                              /sitemap.xml alle ○ Static
sitemap.xml                   3 <url>, je 4 xhtml:link
                              x-default wird von Next durchgereicht — die
                              offene Frage des Plans, jetzt gemessen
robots.txt                    User-Agent: * · Allow: / · Sitemap: …/sitemap.xml
feed.xml                      xmllint --noout grün, 0 <item>
                              content-type: application/rss+xml; charset=utf-8
og.png                        image/png, 1200 × 630, 52 585 B
ld+json                       genau 1 Element auf /, gültiges JSON,
                              kein rohes < im ausgelieferten Text
Statuscodes                   / /de /fr /about /de/about        200
                              robots.txt sitemap.xml feed.xml og.png  200
                              /en → 308 /   ·   /en/about → 308 /about
                              /es /es/about /english            404
noindex                       / keins · /about ja
standalone                    .next/standalone/styles/tokens.css vorhanden
                              — auch OHNE outputFileTracingIncludes, weil das
                              Layout dieselbe Datei als Stylesheet importiert.
                              Die Zeile bleibt als erklärte Abhängigkeit.
```

Blätter: `Language Switcher` (`1g`, `LANG.01`), `Routes and Paths`
(„Keine Sitemap-Kosmetik: der Routen-Baum steht im README"). Vorgänger:
ADR 0043 (Nonce und die vorgerenderte Hülle), ADR 0044 (Entscheidungen liegen
in `lib/`), ADR 0045 (kein `revalidateTag`), ADR 0046 (die Sprachroute).
