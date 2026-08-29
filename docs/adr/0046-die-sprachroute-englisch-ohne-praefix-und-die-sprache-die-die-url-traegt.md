# ADR 0046 — Die Sprachroute: Englisch ohne Präfix, und die Sprache, die die URL trägt

**Status:** Angenommen
**Datum:** 2026-08-29
**Betrifft:** G5, G6, G7, H1–H13, J1, J2, K1, P6
**Invarianten:** 1 (keine erfundenen Zahlen), 9 (genau zwei localStorage-Keys)

## Kontext

Seit G3 stehen drei Versprechen im Baum, die keine Route haben. Der Umschalter
`EN ▾` zeigt `[SOON]` neben DE und FR. `lib/chrome.ts` trägt ein
`LOCALES = ["de","fr"]` samt Test für Adressen, die es nicht gibt — mit der
Begründung, „die vier Zeilen kosten jetzt weniger als der Fehler später". Die
Fußzeile nennt `ALT /de /fr` als Text ohne Link.

Der Bauplan gibt G5 zwei Zeilen (1211–1212): `/de` und `/fr` als Routen,
`hreflang`, `<html lang>`, ein funktionsfähiger Umschalter — **nur EN
befüllt** — und die maschinenlesbaren Flächen. Abgenommen, wenn der
Rich-Results-Test grün ist und der Umschalter auch mit leeren Sprachen
funktioniert.

Die Form ist im Blatt `Language Switcher` festgelegt, Abschnitt `1g`, das sich
selbst „die verbindliche Fassung" nennt. Seine Routentabelle ist der ganze
Entwurf:

```
/     → en   <html lang="en">
/de   → de   <html lang="de">
/fr   → fr   <html lang="fr">
```

**Englisch trägt kein Präfix.** Daran hängt alles Weitere, denn Next kennt kein
präfixloses Standard-Locale: ein Segment `app/[lang]/` erzeugt `/en`, `/de`,
`/fr` — drei Präfixe, nicht zwei.

Dazu kommt eine Vorgabe aus G4, die der Backlog als Erbe notiert hat: **die
Hülle ist vorgerendert und soll es bleiben.** Ein `headers()` im Root-Layout
nähme jede Seite aus dem statischen Durchlauf (ADR 0043). `<html lang>` ist aber
genau die Stelle, an der ein Wert aus der Anfrage ins Wurzelelement will.

## Entscheidung

**Die Route trägt die Sprache, nicht der Header — und der Proxy bildet die
öffentliche Adresse auf den Baum ab.**

Der Baum liegt unter `app/[lang]/`, `<html lang>` kommt aus
`next/root-params`, und `proxy.ts` macht zwei Züge:

```
/about      wird umgeschrieben auf /en/about     die Adresse des Besuchers bleibt
/en/about   wird umgeleitet auf /about, 308      eine Seite, eine Adresse
/de/about   bleibt unangetastet                  benennt schon eine echte Route
```

Beide Züge werden allein aus dem Pfad entschieden. **`Accept-Language` wird
nirgends gelesen** — das Blatt: „KEINE AUTOMATISCHE UMLEITUNG nach
Browsersprache. Die URL ist die Wahrheit — sonst schickt ein geteilter Link
jeden woanders hin."

Die Entscheidungen selbst liegen in `web/lib/i18n/routes.ts`, wo `node --test`
sie erreicht; `proxy.ts` hält zwei Aufrufe.

## Konsequenzen

### `ts.lang` wird nicht gebaut, und die Invariante gewinnt

Das Blatt verlangt einen dritten localStorage-Eintrag: „`ts.lang` merkt nur eine
bewusste Wahl und hebt sie im Umschalter hervor." Invariante 9 nennt genau zwei
Schlüssel, die Lint-Regel in `web/eslint.config.mjs` weist einen dritten ab, und
ihre eigene Meldung sagt, was dann zu tun wäre: *„A third one is a decision, not
a detail — make it in the build plan first."*

Der Bauplan entscheidet das für uns: **„Kollidiert eine Phase mit einer
Invariante, gewinnt die Invariante."**

Und der Preis ist null. `ts.lang` hätte nur den aktiven Eintrag im Panel
hervorgehoben — was jetzt aus `usePathname()` kommt, weil die URL ohnehin die
Wahrheit ist. Ein gespeicherter Wert könnte der Adresse nur widersprechen. Als
`design-correction` in der Reihe aus Kapitel 7 notiert, abzuarbeiten in K1.

### Route-Gruppen wären ohne Proxy ausgekommen und hätten teurer bezahlt

Die Alternative war `app/(en)/…` neben `app/(intl)/[lang]/…`: zwei
Root-Layouts, kein Rewrite, `/en` existiert gar nicht erst, also auch keine
Kanonisierung.

Sie ist verworfen, weil sie das Root-Layout dupliziert — mitsamt der
Stylesheet-Reihenfolge, deren vierte Position `chrome.css` load-bearing ist, und
mitsamt `ThemeScript`. Zwei Root-Layouts, die auseinanderlaufen können, sind
teurer als vier Zeilen im Proxy. Dazu käme jede der dreizehn H-Seiten zweimal.

### `dynamicParams = false` ist nicht erlaubt, und der Schutz liegt eine Ebene tiefer

Der erste Entwurf ließ den Router die Sprachliste erzwingen. Turbopack weist das
ab:

```
Route segment config "dynamicParams" is not compatible with
nextConfig.cacheComponents. Please remove it.
```

`generateStaticParams` bleibt also Pflicht (unter Cache Components muss ein
Root-Parameter mindestens einen Wert haben, sonst bricht der Build), ist aber
**keine vollständige Liste**. `/es/about` erreicht eine Komponente. Die erste,
die es erreicht, ist `getDictionary()`, und die ruft `notFound()`.

Gemessen gegen den laufenden Produktionsbuild: `/es` und `/es/about` antworten
mit 404, `/english` ebenfalls — die Sprache ist ein ganzes Segment, kein Präfix.

### Eine unübersetzte Sprache ist ganz unübersetzt

Das Blatt verbietet die naheliegende Implementierung: „KEINE HALBEN SEITEN:
fehlt eine Übersetzung, zeigt die Route den englischen Text mit `lang="en"` am
Element — nicht die halbe Seite auf Deutsch."

Also kein Merge Schlüssel für Schlüssel. `resolveMessages()` prüft, ob eine
Sprache **jeden** Schlüssel trägt; trägt sie ihn nicht, wird sie ganz beiseite
gelegt, Englisch ganz ausgeliefert, und `resolved` sagt `en`. Der Aufrufer setzt
daraus `lang="en"` auf den Block.

Auf Blockebene, nicht pro String: Kopf, `<main>` und Fuß. Ein `<span lang="en">`
um jeden Text wäre dieselbe Aussage mit hundertfachem DOM.

**Das Attribut löscht sich selbst.** Füllt P6 eine Sprache, wird `resolved`
gleich `locale`, `textLang` wird `undefined`, und React rendert kein Attribut.
Niemand muss daran denken.

### Die Wörterbücher sind TypeScript, nicht JSON

`Partial<Messages>` macht das leere Objekt legal und einen Tippfehler illegal:
ein Schlüssel, den Englisch nicht hat, kompiliert in `de.ts` nicht. Ein
Nachschlagen auf einen Schlüssel, den niemand geschrieben hat, ebenso wenig. Mit
JSON bräuchte beides zusätzliche Maschinerie.

### Übersetzt wird Prosa, nicht Nomenklatur

Die Matrix `LANG.01` entscheidet das pro Zeile, und die Umsetzung folgt ihr:
`BUILD`, `ONLINE`, `SYS.*`, `p95`, `sha`, die Palettennamen und die
ISO-Datumsform bleiben im Code stehen. `UPTIME`, die vier Nav-Labels, die Texte
des Panels und die Fußzeilen-Prosa liegen im Wörterbuch.

`[SOON]` bleibt ebenfalls: `design-correction` #6 hat es zu einem Token in allen
drei Sprachen vereinheitlicht, also ist es ein Platzhalter und kein Wort.

### Zahlformate nach Locale sind notiert, nicht gebaut

Das Blatt verlangt `99,98 %` und im Französischen ein schmales geschütztes
Leerzeichen (U+202F). G5 baut das **nicht**, und der Grund ist derselbe wie
oben: das Format folgt der Sprache, die den Text tatsächlich gerendert hat, und
das ist heute überall `en`. Eine Locale-Formatierung, die nie eine andere
Locale sieht, wäre Code ohne Aufrufer. **Fällig mit P6**, zusammen mit den
Texten.

### Der Umschalter navigiert, und drei andere Wege tun es ohne ihn

Die Zeilen des Panels bleiben `<li role="option">` und werden keine Anker: das
Blatt gibt dem Widget genau eine Tab-Station („TAB erreicht den Knopf, nicht die
drei Zeilen"), und drei Anker wären drei weitere. Die Zeile navigiert per
`router.push(switchLocale(...))`, und `Enter` auf der markierten Zeile tut seit
G5 dasselbe — vorher schloss es nur, weil es nichts zu übernehmen gab.

Auffindbar sind die anderen Sprachen deshalb an drei Stellen, die kein
JavaScript brauchen: die `ALT`-Zelle der Fußzeile trägt echte Anker, das mobile
Menü drei, und jede Seite sendet `hreflang` für alle drei Sprachen. Das Blatt
verlangt genau das: „Die Fußzeile nennt die Alternativen als Links, damit sie
auch ohne Panel auffindbar sind."

Sichtbarer Text und `href` sind in der `ALT`-Zelle dieselbe Zeichenkette, damit
die Zelle nicht eine Adresse nennt und zu einer anderen führt.

### Was die Phase nicht anfasst

Kein Stylesheet. Die drei Sprach-Chips im mobilen Menü wurden von `<li>` zu
`<a>`, und dafür wurde der Container von `<ul>` zu `<nav>` — `.menu-lang` ist
das Flex-Kind mit `flex: 1` und der 52-px-Kachel, und ein `<li>` dazwischen
hätte die Breitenverteilung auf ein Element verschoben, das `chrome.css` nicht
kennt.

Keine Abhängigkeit. Next 16 bringt `[lang]`, `next/root-params` und die
Metadata-Konventionen mit.

Übersetzte Slugs (`/de/arbeit`, `/fr/travaux`) bleiben aus — das Blatt selbst
sagt „optional, später". Der Terminalbefehl `lang de` gehört zu Stufe J, die
Dekodier-Animation beim Wechsel zu H3/I2.

## Verworfene Alternativen

| Weg | Warum nicht |
|---|---|
| Zwei Root-Layouts über Route-Gruppen | Dupliziert `<html>`, die Stylesheet-Reihenfolge und `ThemeScript`, dazu jede H-Seite zweimal |
| `rewrites()` in `next.config.ts` | `afterFiles` greift nicht, weil `/about` als `[lang]="about"` bereits matcht; `beforeFiles` bräuchte eine Negativ-Liste der Sprachen im Pfadmuster — dieselbe Logik, aber ungetestet und in einer Konfigurationsdatei |
| Sprachwahl aus `Accept-Language` | Das Blatt verbietet es; ein geteilter Link führt sonst jeden woanders hin |
| `ts.lang` als dritter localStorage-Key | Invariante 9, und der Nutzen ist null, seit der aktive Eintrag aus dem Pfad kommt |
| Merge der Wörterbücher Schlüssel für Schlüssel | „KEINE HALBEN SEITEN"; ergäbe ein `<html lang="de">` über halb englischem Text |
| DE/FR aus dem Blatt vorbefüllen | Der Bauplan sagt „nur EN befüllt" und hängt die Inhalte an P6; die Abnahme verlangt ausdrücklich den Beweis mit **leeren** Sprachen |

## Belege

Gemessen gegen `next start` auf dem Produktionsbuild dieses Branches,
29.08.2026:

```
<html lang>      /  en · /de  de · /fr  fr · /about  en · /de/about  de · /fr/work  fr
hreflang         en → https://timseil.dev · de → /de · fr → /fr · x-default → /
canonical        /  https://timseil.dev · /de/about  https://timseil.dev/de/about
/en              308 → /            /en/about  308 → /about
/english         404               kein Präfix-Treffer
/es · /es/about  404               notFound() aus getDictionary()
noindex          / keins · /about ja · /de/work ja
lang="en"        /de: header, main, footer, skip   /  keins
ALT-Zelle        / → /de /fr    ·   /de → / /fr     echte Anker, hrefLang gesetzt
Nav auf /de      /de/work /de/blog /de/about /de/contact · /de/privacy /de/imprint
X-Request-Id     auf dem umgeschriebenen UND auf dem umgeleiteten Weg gesetzt
Routen           21, alle ◐ partiell vorgerendert — die Hülle ist noch statisch
```

Die Blätter: `Language Switcher - timseil.dev.dc.html` (`1g`, Routen und Regeln;
`LANG.01`, Übersetzungsmatrix) und `Routes and Paths - timseil.dev.dc.html`
(„der Routen-Baum steht im README").
