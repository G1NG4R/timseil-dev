# ADR 0083 — Eine Sprache ist vollständig, wenn jede Wortquelle sie trägt, und die URL merkt sich die Wahl schon

**Status:** Angenommen
**Datum:** 2026-10-03
**Betrifft:** U8, U8a, ADR 0046, ADR 0047, ADR 0050, #221, #237, #320, #431
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
| constraint | Randbedingung |
| label / heading (über Inhalt) | Beschriftung |
| theme (Farbschema) | Farbe |
| latest `n` | letzte `n` |
| shipped / delivery | ausgeliefert · Auslieferung |
| trajectory (Lebensweg) | Werdegang |
| self-hosted | selbst gehostet |
| contribution (GitHub) | Contribution |
| homelab · helpdesk · edge | unverändert |

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

## Nachtrag vom 11.10.2026 — U8a, und was die Prosa über die Form entschieden hat

U8 hat die Mechanik gebaut und `BUNDLES` leer gelassen; U8a füllt sie. Fünf
Bündel, **879 Wörter** deutscher Seitenprosa (gezählt in den fünf `*.de.ts`,
Kommentare abgezogen), 968 Unit-Tests. Was unten steht, sind die Entscheidungen,
die beim Übersetzen fällig wurden und in dieser ADR noch nicht standen.

### 1 · Ein Bündel trennt Fakten von Wörtern, und ein Tupel zählt beides

Entscheidung 6 trennt Beschriftung von Datenwert. Beim Schreiben wurde daraus
eine Dateiform: **was Sprache ist, steht je Sprache; was keine ist, genau
einmal.** Die Station behält Label, Tags und die ausgelieferte Zelle; die
Fallstudie behält Slug, Datum und die sieben Stufennamen (fünf davon sind
`ci.yml`-Jobnamen in Großbuchstaben); die Operator-Karte behält `Tim Seil`,
`Luxembourg · UTC+1`, `Kubernetes · GitOps`, `Claude Code` und die Adresse.

Länge und Reihenfolge sind damit eine **Compilerfrage**: ein Tupel von
Schlüsseln, daraus eine Union, daraus `Record<Key, Prosa>`. Eine Sprache mit
fünf von sechs Absätzen kompiliert nicht. Was der Compiler nicht sieht, sieht
`bundleShapes()` — Arraylängen und Objektschlüssel, niemals Werte — und das ist
**bewusst nicht Teil von `languageComplete`**: eine fehlende Sprache ist eine
Übersetzung, die nicht passiert ist, und die ehrliche Antwort darauf ist
Englisch; eine abweichende Form ist ein Programmierfehler, und die ehrliche
Antwort darauf ist ein roter Test.

Eine Zeile, in der die Trennlinie durch den **Wert** läuft, gibt es: `WEG` auf
der Operator-Karte, weil dort ein Satz steht und kein Datum. Die Typen machen
das zur einzigen Zeile, die es sein kann — `value: string | null`, und
`bundleShapes` weist beide Verwechslungen ab, das übersetzte Datum wie den
nicht übersetzten Satz.

**Ein Commit = ein Bündel, vollständig.** Ein in `BUNDLES` registriertes Bündel
ohne `de` macht `languageComplete("de")` falsch und schickt **ganz** `/de` auf
Englisch zurück — nicht den untersetzten Teil, die ganze Seite. Der Schnitt der
Phase folgt daraus und nicht umgekehrt.

### 2 · Ganze Sätze mit Löchern, weil Deutsch dekliniert

U8 hat Zahlzeilen aus Fragmenten gebaut (`csLast` + `csDays`). Das geht auf
Deutsch nicht: *8 von 91 **Tagen** gemessen* gegen *über 367 **Tage*** ist
dasselbe Substantiv in zwei Fällen am selben Schlüssel. Also ist der Satz der
Schlüssel, mit `{name}`-Löchern — `lib/i18n/fill.ts`, `fill` und `plural`, und
es importiert **nichts**, weil es über die zwei Filter-Inseln die Client-Grenze
mitgeht.

**Der kaputte Fall wirft** (Präzedenz `lib/seo/pages.ts`): jede Aufrufstelle
prerendert, ein Build-Fehler ist früher als `{window}` auf der Seite. Und
`messages.test.ts` prüft über alle Schlüssel, dass jede deutsche Zeile die
Löcher ihres englischen Originals trägt — wer `{window}` löscht, nimmt die Seite
beim Build herunter, und dieser Test ist die billigere Stelle, das zu erfahren.

### 3 · Die Maschinenstimme, in einem Satz

> Was von einem Upstream kam oder ein Request-Feld benennt, bleibt englisch; was
> die Seite über sich selbst sagt, wird übersetzt.

Deshalb bleiben `lib/state/{lines,retry}.ts` und `lib/contact/{log,trace}.ts`,
wie sie sind — und **ihr Block sagt es selbst**: `lang="en"` auf
`ul.st-log` in `ErrorPanel` und `LoadingLines`, auf `pre.tx-body` und
`ul.st-log.tx-log` in `TxTrace`. Das Attribut sitzt auf der Liste und nicht auf
dem Panel, weil die Überschrift darüber Prosa aus dem Katalog ist.

**Und es ist kein Selektor, obwohl der Plan einen wollte.** Es gibt einen
vierten `.st-log` auf dieser Seite: das Terminal. Es zeichnet
`stateLabel(…, messages)` und liest auf `/de` `terminal GEPLANT` — eine Insel
dort wäre ein Attribut, das Englisch sagt, über einem deutschen Wort. Es ist der
eine Log-Block ohne Insel, und der e2e-Test ist als **Regel** geschrieben
(„jeder `ul.st-log` auf `/de` ist eine Insel, außer dem des Terminals"), damit
der nächste ohne Edit hineinfällt.

`lib/notfound/trace.ts` bekommt keine Insel und keinen Schlüssel:
`global-not-found.tsx` setzt `<html lang="en">` auf das ganze Dokument, die Seite
**ist** die Insel, und ein Katalogschlüssel dort wäre eine Übersetzung, durch
die niemand je übersetzen kann.

### 4 · Der Rückfallweg, präzisiert — und die Naht, die bleibt

Die Fehlerseite ist die eine Seite ohne Server-Eltern: Next rendert sie mit
`error` und `retry` und nichts sonst, also kann ihr niemand Wörter hineingeben.
Sie liest ihr Bündel selbst, über `lib/i18n/bundle.ts` — das Modul importiert
**einen Typ**, und deshalb kostet ein Bündel in einer Client-Komponente das
Bündel und nicht drei Kataloge. Gemessen, auf demselben Baum, `.next` beide Male
entfernt: **185.382 B → 185.650 B** gzip über neun Skripte, also **+268 B** für
die ganze deutsche Fehlerseite. (`make bundle-size` verweigert weiter, #301; die
Zahl ist jedes `<script src>` des gelieferten Dokuments, gzippt und summiert.)

**Die Naht:** jede serverseitige Seite fragt `languageComplete`, das den Katalog
**und** jedes Bündel liest; diese eine fragt `resolveContent` über das Bündel vor
ihr. Auseinanderlaufen können sie nur, wenn ein registriertes Bündel seine
Sprache verliert — und das macht `complete.test.ts` rot. Es ist also kein Code,
der die beiden zusammenhält, sondern ein Test, und das steht jetzt im Kopf von
`lib/errors/words.ts`.

**Was bei einem Budget-Riss zu tun ist, und was nicht.** Die naheliegende
Reaktion wäre, `de` aus einem Bündel zu streichen. Das ist die falsche: es macht
`languageComplete("de")` falsch und nimmt **ganz** `/de` mit. Der Weg ist, das
Bündel **nicht zu registrieren** und die Insel von Hand an seinem Block zu
setzen — und das weist der Platten-Walker in `complete.test.ts` ab, der jedes
`*.de.ts` auf der Platte gegen `BUNDLES` hält. Es braucht dann eine **benannte
Ausnahme mit `CARRIED`-Charakter**: ein Eintrag mit Begründung und Datum, wie
`e2e/de.sweep.spec.ts` ihn für die 2 px bei 720 führt. Lieber eine Ausnahme, die
man liest, als eine Sprache, die still verschwindet.

### 5 · Zwei Wörter korrigiert, eines bewusst stehengelassen

`themeLabel` las `THEMA`, weil das Blatt es so zeichnet — und U8 hatte die Zeile
schon geschrieben, die das erledigt: „es ist eine Wortwahl, keine Messung, und
die erste Zeile, die sich ändert, wenn sie auf der Seite falsch liest."
`/de/blog` filtert **nach Thema**, also heißt die Fußzeile über sieben Farben
jetzt `FARBE` — fünf Zeichen wie `THEME`, die Reihe bei 390 bleibt gemessen.
`homeLogLatest` las `NEUESTE`, während der Katalog eine Zeile weiter oben
`LETZTE {days} TAGE` sagt; jetzt `LETZTE`.

Stehen bleibt `CONTRIBUTIONS`: GitHubs Begriff für das, was es zählt, und
`Beiträge` ist in der Begriffsliste an einen **Log-Beitrag** vergeben. Der Rahmen
bewegt sich (`LETZTE 367 TAGE`, `QUELLE:`, `22M ALT`), das Zählwort nicht — und
`messages.test.ts` trägt es als begründeten Eintrag seiner `SAME`-Liste.

### 6 · Vier Funde, die diese Phase nicht erfunden hat

1. **`LÄUFT IN` war vergeben.** LANG.01 übersetzt `SHIPPED IN` genauso, und
   `LÄUFT IN` steht seit H9 auf `RUNS IN`. Drei von vier Belegpräfixen hätten
   ein Wort geteilt. Vierte benannte Abweichung vom Blatt.
2. **Der Katalog behauptete zweimal, Abschnittstitel seien Nomenklatur** — für
   die Startseite und für `/about` —, während er für zwei dieser Titel längst
   Deutsch trug, gelesen auf einer anderen Seite. Beide Kommentare korrigiert.
3. **Der Bündel-Walker konnte weder grün noch rot werden.** Er antwortet relativ
   zu der Wurzel, die man ihm übergibt; die Importzeile daneben verlor das
   `lib/`. Bei leerem Register lief die Schleife nie — die Form einer Prüfung,
   die noch nicht fehlschlagen kann.
4. **`blurb` ist im e2e-Rig nicht bezeugbar.** Die eine Fallstudienzeile, die
   auf einer anderen Seite steht; beide Listen kommen aus `/api/systems`, das
   Rig hat keine. Geprüft gegen die geseedete Antwort, gezählt in der
   Produktionsabnahme.

### 7 · Was Deutsch nicht werden konnte, und warum

**`lib/contact/validate.ts`.** `ContactForm` füllt denselben `invalid`-Zustand
mit den lokalen Ablehnungsgründen **und** mit `problem.invalidParams` aus der
Go-API, und `reasonFor()` rendert beide in denselben Slot. Deutsch wäre die eine
Hälfte und englisch die andere — für denselben Fehler im denselben Feld. Das
geht nur mit einer Contract-Änderung, also in einer eigenen Phase.

**`SITE_DESCRIPTION`.** Stand auf `/de` englisch unter `<html lang="de">`,
weil `app/[lang]/layout.tsx` `metadata` statisch exportierte und ein statischer
Export `[lang]` nicht lesen kann. Eigenes Issue statt einer stillen Lücke, und
das Issue ist **#431, erledigt** — Nachtrag unten.

**Die Rechtstexte.** 1.842 Wörter, `/de/privacy` und `/de/imprint` bleiben eine
englische Insel mit `lang="en"` auf `.lg` (Entscheidung 2). Eigene Phase, mit
Gegenleser.

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

## Nachtrag vom 12.10.2026 — #431, und warum sechs Felder vier sind

§7 oben hat `SITE_DESCRIPTION` als „sechs Metafelder" notiert. Beim Umbau waren
es **vier**, und die Differenz ist keine Zählfehler-Korrektur, sondern eine
Entscheidung:

| Feld | Folgt der Sprache |
|---|---|
| `<meta name="description">` (Layout) | ja |
| `og:description` | ja |
| `twitter:description` | ja |
| JSON-LD `WebSite.description` | ja |
| `og:image:alt`, zweimal gelesen (`seoFor`, `seoForPost`) | **nein** |
| RSS-Kanal (`lib/seo/feed.ts`) | nein, war nie im Umfang |

Die zwei `og:image:alt` sind **eine** Konstante, und sie transkribiert
`/og.png` — einen Route-Handler an der Wurzel, der den englischen Satz zur
Bauzeit als Bild zeichnet und nach ADR 0047 nie eine Sprache bekommt. Der
Kommentar daneben sagt seit U1, dass der Alt beschreibt, *was das Bild sagt*.
Ein deutscher Alt würde behaupten, das Bild sage Deutsch. Die Lösung wäre eine
Karte pro Sprache; bis dahin ist die Transkription ehrlich, und die Abweichung
steht als Kommentar in `lib/seo/pages.ts` und als eigener Test, damit sie nicht
wie ein Übersehen aussieht.

### Die Form: eine Ableitung, nicht eine zweite Regel

`siteDescription(locale)` in `lib/i18n/messages.ts`, auf `resolveMessages`
gebaut. Damit bekommt `/fr` den englischen Satz **aus derselben Ableitung**,
die `lang="en"` an seine Blöcke hängt — kein Sonderfall, keine zweite Stelle,
die jemand pflegen muss. Entscheidung 1 bleibt unangetastet: **kein
französischer Schlüssel.** Er wäre toter Code, solange `fr` unvollständig ist,
und er würde den Test „French is empty, serves English and admits it" als
Beschreibung falsch machen, während er grün bleibt.

`webSiteLd` löst innen auf, bei unveränderter Signatur. Der Kopf von
`jsonld.ts` verlangt, dass `inLanguage` abgeleitet ist; kommen Sprache und
Beschreibung aus **einem** Argument, können sie nicht auseinanderlaufen. Preis:
das Modul ist nicht mehr auf Wertebene i18n-frei.

### Der Rest-Mangel, benannt statt versteckt

Auf `/fr` steht der englische Satz unter `<html lang="fr">` — dieselbe Form von
Defekt, enger: die ganze Seite ist englisch und sagt es an vier Blöcken, und
kein `og:locale` behauptet etwas anderes. Nicht behebbar, solange Französisch
nicht existiert, und behoben ohne Edit an dem Tag, an dem es existiert. Steht
im Doc-Kommentar von `lib/site.ts`, wo der nächste Leser die Entscheidung
findet statt der Lücke.

### Was das Werkzeug nicht prüfen konnte

`npm test` liest `lib/**` und `styles/**`; `app/**` hat keinen Unit-Test. Die
Umstellung des Layouts auf `generateMetadata` ist deshalb **nur** am
ausgelieferten `<head>` zu sehen, und genau dort prüft `e2e/de.spec.ts` sie —
auf `/de` und auf `/fr`, pro Feld. Das ist der zweite Preis aus „Was das
kostet", noch einmal eingelöst: diese Lücke wird durch Lesen geschlossen, nicht
durch ein Werkzeug.
