# ADR 0083 — Eine Sprache ist vollständig, wenn jede Wortquelle sie trägt, und die URL merkt sich die Wahl schon

**Status:** Angenommen
**Datum:** 2026-10-03
**Betrifft:** U8, U8a, ADR 0046, ADR 0047, ADR 0050, #221, #237, #320
**Invarianten:** 1 (keine erfundenen Zahlen), 8 (Tokens), 9 (zwei localStorage-Keys)

## Kontext

Seit G5 hat diese Seite drei Adressen — `/`, `/de`, `/fr` — und eine Regel
dafür, was passiert, wenn eine Sprache nicht fertig ist. Das Blatt
`Language Switcher` schreibt sie als „KEINE HALBEN SEITEN": fehlt eine
Übersetzung, liefert die Route den englischen Text und setzt `lang="en"` an den
Block, statt die halbe Seite auf Deutsch zu zeigen.
`lib/i18n/messages.ts#resolveMessages` setzt das um, `getDictionary()` leitet
daraus `textLang` ab, und vier Blöcke hängen daran: der Skip-Link, `<main>`,
`<header>` und `<footer>`.

Das Prädikat dahinter heißt `isComplete` und fragt **die Schlüssel des
Katalogs** ab — 143 in `web/lib/i18n/messages/en.ts`. Das ist weniger, als der
Name behauptet. Gemessen am Baum von `b19015a`, englische Prosa auf öffentlichen
Seiten **außerhalb** des Katalogs:

| Quelle | Wörter | Seite |
|---|---|---|
| `lib/legal/*` (`content` · `imprint` · `sections` · `readout` · `retention`) | 1.842 | `/privacy`, `/imprint` |
| `lib/about/*` (`trajectory` · `content` · `sections`) | 454 | `/about` |
| `content/case-studies/timseil-dev.ts` | 395 | `/work/timseil-dev` |
| `lib/errors/words.ts` | 66 | jede Seite, im Fehlerfall |
| `lib/contact/{validate,log,trace,fields}.ts` | 83 | `/contact` |
| `lib/api/{systems,contributions,training}.ts` | ~74 | `/`, `/work`, Fallstudie |
| `lib/state/{lines,retry}.ts` · `lib/notfound/trace.ts` | 82 | überall, im Warte- und Fehlerfall |
| `lib/work/*` · `lib/blog/*` · `lib/home/posts.ts` | 45 | Zähler- und Quellzeilen |
| **Summe** | **~3.040** | |

Dazu fünf Stellen, an denen Text direkt im TSX steht: `SpecRail`, `WorkRow`,
`Log`, `BlogHeader`, `NotFoundHero`.

In der Sekunde, in der `de.ts` den 143. Schlüssel bekommt, verliert `<main>` auf
`/de` sein `lang="en"` — und jede dieser Zeichenketten behauptet danach,
Deutsch zu sein. Das ist dieselbe Sorte Aussage wie eine Zahl ohne Messung
dahinter: sie ist nicht falsch berechnet, sie ist unbelegt.

## Entscheidung

**Eine Sprache ist vollständig, wenn der Katalog sie trägt _und_ jedes
registrierte Inhaltsbündel einen Eintrag für sie hat.** `languageComplete()` in
`web/lib/i18n/complete.ts` ist ab jetzt das Prädikat, das `resolveMessages()`
und `getDictionary()` fragen; `isComplete()` beantwortet weiter nur seine
Teilfrage. Was bewusst englisch bleibt, setzt sein `lang="en"` selbst und heißt
eine Insel.

Dazu vier Entscheidungen dieser Phase und drei Abweichungen vom Blatt.

### 1 · Französisch bleibt leer

`isComplete(fr)` bleibt falsch, `/fr` liefert Englisch mit `lang="en"`. Der
Bauplan verlangt „FR nur, wenn es jemand gegenlesen kann" — eine unkorrigierte
Fassung wäre eine Behauptung ohne Beleg, also genau das, was die eine Regel
dieses Repositories verbietet. Französisch ist eine eigene Phase mit einem
Gegenleser.

### 2 · Impressum und Datenschutz bleiben englisch, als Insel

1.842 Wörter Rechtstext werden nicht in dieser Phase übersetzt. Ein übersetzter
Rechtstext ist eine rechtliche Aussage, nicht Prosa; H12 hat für diese beiden
Seiten die Regel gesetzt, dass der Text mit dem übereinstimmen muss, was der
Code tut. Beide Seiten tragen `lang="en"` am `.lg`-Wrapper, bis eine eigene
Phase sie übersetzt und gegenlesen lässt.

**Abweichung vom Plan dieser Phase:** das Attribut steht am `.lg`-Wrapper, nicht
an den `.lg-section`-Blöcken. Der Plan nannte den Abschnitt, aber Hero,
Kurzfassung, Sprungleiste, Readout-Panel und die Revisionszeile liegen
**außerhalb** jedes Abschnitts und sind genauso englisch. Eine Insel um einen
Teil eines englischen Dokuments ist eine Insel, die das Problem zur Hälfte löst.

### 3 · Zahlen nach Locale, mit explizitem Locale-Argument

`web/lib/format/numbers.ts` hält `percent`, `millis` und `count`, alle drei mit
der Locale als **erstem** Argument. Das Blatt schreibt die Formen vor:
`99.98%` · `99,98 %` · `99,98 %`. Nie `toLocaleString()` ohne Argument und nie
`Intl.NumberFormat()` ohne Locale — die Container-Locale ist kein Beleg, sie ist
eine Umgebungsvariable, und `lib/content/words.ts` hat denselben Grund schon
einmal aufgeschrieben.

Datum bleibt ISO (LANG.01: „sortierbar, eindeutig"). `— NO DATA` bleibt ein
Token über alle drei Sprachen — Designkorrektur #6 hat das entschieden, und
Invariante 1 hängt daran, dass dieses Zeichen genau eine Bedeutung hat.

### 4 · Die Phase wird in zwei Merges geschnitten

**U8** baut das Prädikat, die Zahlen, die Inseln und den deutschen Katalog.
**U8a** übersetzt die Prosa — About, Fallstudie, die verstreuten Zeilen — und
registriert sie als Bündel. Ein Diff mit 2.000 Wörtern Übersetzung, neuer
Mechanik und neuen Tests in einem Review ist ein Diff, der nicht gelesen wird.

Der Preis steht unten unter *Was das kostet* und ist der einzige, den diese
Entscheidung nicht vermeidet.

### 5 · `ts.lang` wird nicht gebaut — Invariante 9 gewinnt

Das Blatt verlangt in `1g` einen dritten `localStorage`-Eintrag, der „nur eine
bewusste Wahl merkt und sie im Umschalter hervorhebt". Invariante 9 erlaubt
genau zwei Schlüssel: `ts.theme` und `ts404.best`. Die Invariante gewinnt, und
sie kostet nichts: **dasselbe Blatt** macht die URL zur einzigen Wahrheit
(„KEINE AUTOMATISCHE UMLEITUNG … Die URL ist die Wahrheit"), `LangMenu` liest
die aktive Zeile seit G5 aus `usePathname()`, und ein gespeicherter Wert könnte
der Adresse nur widersprechen. Ein dritter Schlüssel hätte außerdem eine Zeile
in der Datenschutzseite gebraucht — für einen Zustand, den die Adresse schon
trägt. Das ist die Antwort auf **#221**.

### 6 · Label wird übersetzt, Datenwert und Metrikname nicht

Das Blatt listet `uptime` unter „IDENTIFIER BLEIBEN" und übersetzt in seiner
eigenen DE-Tabelle `uptimeLabel` zu `VERFÜGBARKEIT`. Aufgelöst mit der Regel,
die STATE.05 schon trägt und die `en.ts` zitiert: **die Beschriftung wird
übersetzt, der Datenwert und der Metrikname nicht.** `p95`, `sha`, `SYS.01`,
`queued`, `live` bleiben; `UPTIME` ist eine Überschrift über einer Zahl und
heißt auf Deutsch `VERFÜGBARKEIT`.

### 7 · `[SOON]` bleibt ein Token, `[FOLGT]` ist veraltet

Die DE-Tabelle des Blattes schreibt `[FOLGT]`. `INDEX.md` führt genau diese
Abweichung, und Designkorrektur #6 hat `[SOON]` über alle drei Sprachen
vereinheitlicht. Ein Platzhalter ist kein Wort.

### 8 · Eine Begriffsliste, einmal festgelegt

Was zweimal anders heißt, ist ein Fund. Verbindlich für `de.ts`, für die
Bündel in U8a und für jede deutsche UI-Zeile danach:

| Englisch | Deutsch |
|---|---|
| system | System |
| state | Zustand |
| incident / outage | Kerbe · Ausfall |
| evidence | Beleg |
| measurement / measured | Messung · gemessen |
| window | Fenster |
| uptime | Verfügbarkeit |
| p95 / latency | Antwortzeit (`p95` bleibt `p95`) |
| entry (Log) | Beitrag |
| track | Spur |

## Konsequenzen

### 1 · `BUNDLES` ist eine Liste, und ein Bündel darin zu vergessen ist der Fehler

`ContentBundle<T> = { readonly en: T } & Partial<Record<Locale, T>>` macht EN zur
Pflicht und jede andere Sprache optional — damit bleibt FR legal leer und ein
Tippfehler im Sprachschlüssel ist ein Compilerfehler. `BUNDLES` in
`complete.ts` ist die **eine** Liste, die `languageComplete` abfragt. Ein Bündel,
das nicht darin steht, ist für das Prädikat unsichtbar; deshalb liest ein
Korpus-Test das Bündel-Verzeichnis und weist ein nicht registriertes Modul ab.

In U8 ist die Liste **leer**, weil kein Bündel existiert. Sie ist trotzdem jetzt
da: der Mechanismus muss grün sein, bevor die erste Übersetzung ihn benutzt.

### 2 · Ein Test fällt, und das ist richtig

`messages.test.ts` behauptete für `de` **und** `fr`, die Route liefere Englisch
und sage es. Sobald `de` vollständig ist, muss diese Behauptung fallen. Der Test
wird nicht gelöscht, sondern geteilt: `fr` leer → Englisch und sagt es; `de`
vollständig → Deutsch, `textLang` ist `undefined`; ein Fixture mit vollständigem
Katalog und **fehlendem Bündel** → Englisch, obwohl der Katalog fertig ist. Der
dritte ist der Test, der diese Entscheidung begründet.

### 3 · Die Zahlen-Aufrufer bekommen eine Locale

`uptimeText`, `uptimeValue`, `p95Value`, `errorRateValue`, `deployMedianValue`,
`incidentCountValue`, `metricTiles` und `workFigure` nehmen die Locale als
Argument. Sie stand an jeder Aufrufstelle schon zur Verfügung — `getDictionary()`
gibt sie zurück —, sie wurde nur nicht weitergegeben.

### 4 · `#237` bekommt eine Zahl, `#320` einen zweiten Grund

Das Client-Bündel wächst in U8 nicht: die fünf TSX-Zeichenketten wandern in den
Katalog, der serverseitig gelesen wird. In U8a bekommt `lib/errors/words.ts`
eine zweite Fassung, weil `app/[lang]/error.tsx` eine Client-Komponente ist —
66 Wörter, ~430 Byte je Sprache, gemessen mit `make bundle-size` vor und nach
der Änderung. Reißt das Budget, fällt die Fehlerseite auf Englisch zurück und
bekommt ihr `lang="en"` — eine Insel mehr, keine Ausnahmeregel.

`bundle-size.sh` misst eine Route (#320). `/de` ist jetzt eine zweite, die
dieselbe Route in einer anderen Sprache ist.

### Was das kostet

**Zwischen dem Merge von U8 und dem Merge von U8a zeigt `/de` die Oberfläche auf
Deutsch und ~850 Wörter Prosa auf Englisch, in einem `<main>` ohne
`lang`-Attribut.** Das ist genau der Zustand, den dieser ADR beschreibt und
abstellt — für die Dauer eines Merges, bewusst, weil die Alternative ein
ungelesener Diff ist. Die Insel-Markierung dieser Prosa für eine Zwischenzeit
wäre Arbeit, die U8a sofort wieder zurücknimmt.

Die beiden Branches gehören zusammen und werden zusammen abgenommen. Wer U8
allein mergt und U8a liegen lässt, hat die Entscheidung nicht umgesetzt, sondern
halbiert.

Zweiter Preis: `BUNDLES` ist ein Register, und ein Register ist eine Stelle, an
der man etwas vergessen kann. Der Korpus-Test fängt ein Modul, das als Bündel
geschrieben und nicht registriert wurde — er fängt **nicht** eine Prosa-Quelle,
die nie ein Bündel geworden ist. Diese Lücke bleibt offen und wird durch Lesen
geschlossen, nicht durch ein Werkzeug.

## Verworfene Alternativen

**Merge pro Schlüssel.** Die naheliegende Implementierung: nimm aus `de` was da
ist, fülle den Rest aus `en`. Ergebnis ist eine Seite, die bis zur ersten
fehlenden Beschriftung deutsch ist und danach englisch, unter einem
`<html lang="de">`, das über die Hälfte ihres Textes lügt. Das Blatt verbietet
es wörtlich, `messages.ts` begründet es seit G5, und `messages.test.ts` hält es
fest.

**Eine Insel-Liste.** Ein zweites Register neben `BUNDLES`, das aufzählt, welche
Blöcke englisch bleiben. Eine Insel ist an ihrem Block ablesbar, und was sie
beweist, beweist ein e2e-Test an der gelieferten Seite — nicht eine Liste, die
jemand pflegen muss und die als erste veraltet.

**Deutsche Routen** (`/de/arbeit`). Das Blatt nennt sie „optional, später". Sie
verdoppeln die Route-Tabelle, die Sitemap und die `hreflang`-Paare für einen
Gewinn, den niemand gemessen hat.

**`Accept-Language`-Umleitung.** Vom Blatt verboten, mit dem Grund: „sonst
schickt ein geteilter Link jeden woanders hin."

**Zahlen ohne Locale-Argument**, also `value.toLocaleString()`. Die
Container-Locale entscheidet dann, wie eine Zahl aussieht. Eine gerenderte Zahl,
die sich ohne Änderung am Code ändert, ist dieselbe Sorte Zahl wie eine
geschätzte Uhrzeit.

## Belege

Blatt `Language Switcher`, LANG.01 (Übersetzungsmatrix) und `1g`
(„Routen, Regeln, Aufwand — die verbindliche Fassung"); STATE.05 für die Regel
aus Entscheidung 6; `docs/design/INDEX.md` für die veraltete `[FOLGT]`-Zeile;
Build-Plan Kapitel U8 und „was Stufe U von K1 vorwegnimmt"; ADR 0046
(Routen ohne Präfix für EN), ADR 0047 (was nie eine Sprache bekommt), ADR 0050
(Bundle-Budget); Designkorrektur #6 (`[SOON]`, `— NO DATA`); #221, #237, #320.
