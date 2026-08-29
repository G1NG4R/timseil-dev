# ADR 0049 — Die Galerie, die sich selbst zählt, und der Schalter, den die Messung erzwang

**Status:** Angenommen
**Datum:** 2026-08-29
**Betrifft:** G7, H1–H13, J1, J2, M2
**Invarianten:** 1 (keine erfundenen Zahlen), 8 (keine Farbe außerhalb `tokens.css`),
9 (genau zwei localStorage-Keys)

## Kontext

Der Bauplan gibt G7 eine Zeile (1217) und ein Abnahmekriterium: Route
`/dev/components`, nur in Development, jedes Bauteil × jeder Zustand — **fertig,
wenn alle 15 Bauteile des Handoff-Inventars mit allen dokumentierten Zuständen
sichtbar sind.**

Vier Stellen im Baum zeigen namentlich auf diese Phase, alle seit G6:

| Wo | Was dort steht |
|---|---|
| `web/lib/state/words.ts` | „Every key of the table, in a fixed order — **the gallery in G7 renders this**" |
| `web/lib/state/burst.ts` | „**G7 builds it**, where the gallery has a button that flips a state by hand" |
| `web/lib/state/retry.ts` | „the only place this renders is **G7's gallery**" |
| `web/styles/chrome.css` | „the backlog tracks that gap **for G7** together with the .12/.13/.20em" |

Dazu ADR 0048: fünf Bauteile aus G6 haben keinen Aufrufer, „gerendert werden sie
zuerst von G7s Galerie".

**Und die Zahl im Abnahmekriterium stimmt nicht.** Nachgezählt in
`SYS.00.04.04 KOMPONENTEN` des Handoff-Blattes: **14 Zeilen und 16 Namen** — zwei
Zeilen führen je zwei Bauteile (`SpecRail · PostCard`, `TopNav · StatusDot`). Die
15 steht nur im Bauplan und, von dort kopiert, im Backlog. Kein Blatt nennt sie.
Das ist dieselbe Sorte Fund wie „vier Bauteile ohne Aufrufer" in der
G6-Abnahme — es waren fünf —, und die Sorte ist in einem Repository, dessen erste
Regel „keine erfundenen Zahlen" heißt, keine Kleinigkeit.

## Entscheidung

**Die Galerie ist ein Register, und das Register liegt in `lib/`.** Sie zeigt
jedes gebaute Bauteil in jedem dokumentierten Zustand und sagt über jedes
ungebaute, **welche Phase es schuldet** — als `QUEUED`, in der Zustandssprache,
die sie selbst ausstellt.

Die Zahl kommt aus der Liste (`inventoryProgress()`), nie aus einem Literal.

## Konsequenzen

### Das Register ist testbar, die Seite ist es nicht

`npm test` liest `lib/**` und `styles/**`; eine `.tsx` läuft unter Node gar nicht
erst (ADR 0044, ADR 0048). Eine Galerie, deren Inventar in ihrem eigenen Markup
stünde, wäre eine Checkliste, die nichts prüft. Also liegt die Liste in
`lib/gallery/registry.ts`, und `registry.test.ts` hält sie gegen vier Dinge, die
sonst leise verrutschen:

1. die **sechzehn Namen** des Blattes, als Liste und nicht als Zahl — wer sie
   ändert, muss einer Liste widersprechen statt einer Ganzzahl, die man für
   gerundet halten könnte;
2. **`built` heißt, dass die Datei existiert** — der Test liest das Dateisystem,
   wie `styles/tailwind.test.ts` echtes CSS kompiliert. Ein Eintrag, der eine
   Datei behauptet und keine hat, ist genau die Behauptung, gegen die dieses
   Repository gebaut ist. Beim ersten Lauf war er rot, und das war der Beleg,
   dass er misst;
3. **kein Bauteil ohne Beispiel ohne Begründung** — STATE.05s „DISABLED SAGT
   WARUM" gilt für die Galerie selbst;
4. **acht Zustandsschlüssel, acht Kacheln** — kommt in H ein neunter dazu, ohne
   dass die Galerie ihn zeigt, wird das rot statt korrekt auszusehen.

### Die Route liegt außerhalb `[lang]`, und das kostete zwei Dinge

Eine Galerie hat keine Sprache; `registry.ts` trägt die deutschen Zustandsnamen
des Blattes wörtlich, weil sie Transkription sind und nicht Text. Also liegt sie
neben `healthz`, nicht darunter — und daraus folgten zwei Dinge, die vorher
niemand gesehen hat:

**`"dev"` musste in `RESERVED`.** Sonst schreibt `rewriteTarget()` die Adresse
auf `/en/dev/components` um, das keine Route ist: ein 404, dessen Ursache zwei
Dateien entfernt liegt. `routes.test.ts` hält die Zeile.

**Sie ist die erste *Seite* außerhalb `app/[lang]/`** — alles andere dort draußen
sind Route Handler, und die brauchen kein Layout. Eine Seite braucht eins, also
gibt es `app/dev/layout.tsx` als zweites Root-Layout. Es trägt bewusst **kein**
Chrome: ein zweiter `<header>` in der Galerie wäre ein schlechteres Beispiel als
der echte, den jede andere Seite zeigt.

**Und der Typ von `lang()` hat sich dadurch geändert.** `next/root-params` gibt
`string | undefined` zurück, sobald **eine** Route außerhalb `[lang]` liegt. Der
Bau brach in `dictionaries.ts`. `isLocale` nimmt jetzt `unknown` statt `string` —
ein Wächter ist der richtige Ort, das aufzufangen, und er beantwortet dieselbe
Frage mit einer Annahme weniger.

### Der Riegel wirkt beim Bau, und das ist stärker als zur Laufzeit

`lib/gallery/visibility.ts` hält die Regel als reine Funktion und **fällt bei
allem Unbekannten zu**: ein nicht gesetztes oder falsch geschriebenes `NODE_ENV`
ist keine Erlaubnis. Der Preis eines Fehlers in die eine Richtung ist eine
ratlose Minute, in die andere ein Entwicklungswerkzeug auf einer öffentlichen
Adresse.

Die Route ist statisch, also läuft der Riegel beim Prerender: ohne Schalter
rendert `next build` einen **vorgerenderten 404**, keine Seite, die ausgeliefert
und dann verweigert wird. Gemessen: `/` 200, `/dev/components` 404.

**Was das nicht heißt, und zwar nachgemessen statt angenommen:** die Bauteile
sind trotzdem gebündelt. `grep -rl "Component gallery" .next/server` findet die
Zeichenketten nach einem Bau ohne Schalter in einem SSR-Chunk. Der Riegel ist ein
Riegel, keine Dead-Code-Elimination. Kein Besucher lädt den Chunk, weil keine
Route ihn anfordert — aber „die Markup ist nicht im Image" wäre eine Behauptung
über Bytes, die niemand angesehen hat.

`process.env.NODE_ENV` ist damit die **erste** solche Abfrage in `web/`. Vorher
gab es keine, und der Wert davon war, dass das Lokale und das Ausgelieferte
dasselbe sind. Sie bleibt auf eine Funktion mit einem Test beschränkt, statt eine
Gewohnheit zu werden.

### Der zweite Riegel, den die Messung erzwungen hat

Der Plan dieser Phase hat eine Env-Variable ausdrücklich abgelehnt: sie wäre ein
Schalter für einen Lauf, den niemand geschrieben hat — dieselbe Logik, mit der
ADR 0048 die drei ungenutzten Vertragsvokabulare abgelehnt hat.

**Die Messung hat diese Begründung widerlegt.** Der Burst (#230) braucht einen
Betrachter, und es gab keinen:

- `next dev` **hydriert nicht** — der offene Fund seit G4, hier gegen `/` im
  selben Server gegengeprüft: die Uhr steht auf `--:--:--`, ein Klick bewirkt
  nichts, die Konsole ist leer. Er liegt also **nicht** am `[lang]`-Baum; die
  Galerie hat ein eigenes Root-Layout und verhält sich genauso.
- Der Produktionsbau antwortet auf der Route 404.

Zwischen beidem war kein Ort, an dem die Bewegung zu sehen ist. Eine Animation,
die niemand gesehen hat, ist kein Merkmal, sondern eine Spezifikation mit
Compilerlauf — und G6 hat den Burst genau deshalb verschoben.

Also gibt es `DEV_GALLERY`. Sie ist aus, wenn niemand sie setzt, `compose.yaml`
setzt sie nie, und sie akzeptiert **genau `"1"`** — nicht „true", nicht jede
nichtleere Zeichenkette, damit ein `DEV_GALLERY=0` nicht das Gegenteil dessen
tut, was der Schreibende meinte. Der Test dafür steht, bevor der Fall eintritt.

Sie ist **keine Sicherheitsgrenze und gibt nicht vor, eine zu sein**: wer auf dem
Host Umgebungsvariablen setzen kann, besitzt den Container ohnehin. Sie ist der
Unterschied zwischen einer gemessenen und einer erhofften Animation.

### Der Burst, gemessen

Gegen ein lokal gebautes Produktionsbild, das hydriert:

| | |
|---|---|
| ein Wechsel | genau **ein** Burst, `ts-glitch`, `0.28s`, `steps(2)` |
| zweiter Wechsel nach 120 ms | **kein** Burst — der Zustand wechselt trotzdem |
| dritter nach 700 ms | wieder einer |
| Wort unterwegs | `ﾇ12ﾃｽE` → `ONLINE`, gleiche Länge, kein Reflow |
| `prefers-reduced-motion` erzwungen | **keine** Zwischenstufe, Endwert steht sofort |

Der letzte Punkt ist zweigeteilt und beide Hälften sind belegt: `globals.css`
schaltet über den Universalselektor jede Animation ab (aus dem ausgelieferten
Stylesheet zitiert), und der rAF-Zweig fragt `matchMedia` selbst, weil kein
Stylesheet eine Schleife anhalten kann.

### Vier Bauteile aus dem Foundations-Blatt kommen mit, und eines passte nicht

`Button`, `Field`, `MetricTile` und `SectionHead` sind datenfrei und stehen als
Referenz unter `docs/design/code/components/`. Sie kommen in dieser Phase in den
Baum, weil der offene Laufweiten-Fund genau auf ihren Literalen sitzt und ohne
sie nicht zu schließen ist.

**`Field` ließ sich nicht übernehmen, wie es dasteht.** Die Handoff-Fassung
erzeugt ihre IDs mit `useId()`, und ein Hook macht das Bauteil client-only — also
JavaScript für Markup ohne Verhalten, ausgerechnet auf der Seite (H8), wo das
Feld in Mehrzahl auftritt. `name` ist jetzt Pflicht und die IDs kommen daher: ein
Formularfeld hat ohnehin einen Namen, und `email` ist in einem Fehlerbericht
lesbar, `«r3»` nicht. Das ist der Fund der Klasse, die ADR 0043 für diese
Dateien angekündigt hat — kleiner als der bei `ThemeSwitch`.

Und ein Farbliteral ist dabei ein Token geworden: `Field` zeichnete seinen
gefüllten Rand als `rgba(0,229,255,.4)` — Cyan, in allen sieben Paletten. Es liest
`--acc-line`, derselbe Defekt, den ADR 0043 aus `globals.css` entfernt hat.

### Die Laufweiten sind gezählt, und die Antwort ist kleiner als die Frage

| Wert | Vorkommen | Wo |
|---|---|---|
| `var(--ls-label)` | 7 | tokenisiert |
| `.1em` | 7 | **alle sieben in `chrome.css`** |
| `var(--ls-head)` | 5 | tokenisiert |
| `.12em` | 3 | `chrome.css` (1), `ui.css` (2) |
| `.06em` | 2 | beide in `chrome.css` |
| `.20em` · `.13em` · `.04em` · `.02em` | je 1 | Einzelfälle |

**Nur ein einziger Wert überschreitet überhaupt eine Dateigrenze: `.12em`.** Der
häufigste Literal — `.1em`, siebenmal — gehört vollständig einer Datei und ist
damit deren lokale Konstante, kein Token. `chrome.css` hat die Regel selbst
formuliert: „the token scale is the spacing scale, not a dictionary of every
number."

`tokens.css` bleibt in dieser Phase unberührt. Ein Token dort anzulegen ist eine
Entscheidung, die nicht nebenbei fällt (CLAUDE.md), und die Zählung ist das,
was sie vorbereitet — nicht ersetzt.

### `ui.css` liegt noch nicht im Seiten-Layout

Keine Seite rendert die vier, also lädt nur die Galerie das Stylesheet. Die erste
H-Phase, die eines benutzt, zieht den Import nach `app/[lang]/layout.tsx` — H1 für
`MetricTile` und `SectionHead`, H8 für `Field`. Die öffentliche Seite bekommt in
dieser Phase kein Byte CSS für Markup, das niemand erreicht.

## Verworfene Alternativen

**Die Route dynamisch machen, damit der Schalter zur Laufzeit greift.**
Ausprobiert und in derselben Stunde verworfen: `connection()` verlangt unter
Cache Components eine Suspense-Grenze darüber, und die Hülle, die von dort
streamt, antwortet **200**, bevor der Riegel gelaufen ist. Eine Route, deren
erstes Byte 200 ist, ist nicht „nur in Development".

**Alle 16 Bauteile in G7 bauen.** `Terminal` gehört zu Stufe J, das 404-Spiel zu
H10, `ContributionGraph` und `OperationGrid` an Endpunkte, die `web/` nicht liest.
Sie vorzuziehen widerspräche der Phasenzuteilung und ADR 0048s Regel, ein
Vokabular erst dort abzubilden, wo sein Endpunkt gelesen wird.

**`TopNav` aus dem Register nehmen**, weil es zu G3 gehört und die Galerie es
nicht zeigt. Es steht drin, gebaut, mit dem Grund für das fehlende Beispiel — das
Inventar ist das des Blattes und nicht das, was uns gerade passt. Eine Liste, aus
der man Zeilen entfernt, die man nicht erfüllen kann, ist keine Liste mehr.

**Den Dev-Modus in dieser Phase reparieren.** Der Fund blockiert seit G4 vier
Phasen und hat Termin H1; ihn hier aufzumachen hieße, eine Phase mit unbekannter
Tiefe in eine Phase mit bekanntem Zuschnitt zu legen. Was diese Phase beiträgt,
ist eine Eingrenzung: es liegt nicht am `[lang]`-Baum.

## Belege

Bauplan Zeile 1217 (Phase G7) · Kapitel 8.5 ·
`docs/design/Handoff - timseil.dev.dc.html` (SYS.00.04.04) ·
`docs/design/Foundations - timseil.dev.dc.html` (SYS.00.07.04) ·
`docs/design/State Language - timseil.dev.dc.html` (Move M5) ·
ADR 0042 (Tailwind ohne Palette) · ADR 0043 (die sieben Paletten, der
Linter-Fund) · ADR 0044 (jede Verzweigung in `lib/`) · ADR 0046 (die Sprachroute)
· ADR 0048 (die Zustandssprache) · Issue #230 · Issue #35 ·
`backlog.md`, 28.08.2026, G4 („Der Dev-Modus hydriert nicht")
