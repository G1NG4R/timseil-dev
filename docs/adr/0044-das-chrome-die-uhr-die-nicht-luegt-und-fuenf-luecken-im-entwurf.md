# ADR 0044 — Das Chrome, die Uhr die nicht lügt, und fünf Lücken im Entwurf

**Status:** Angenommen
**Datum:** 2026-08-28
**Betrifft:** G3, G4, G5, G6, G7, H10, H13, alle H-Phasen
**Invarianten:** 1 (keine erfundenen Zahlen), 8 (keine Farbe außerhalb `tokens.css`), 9 (genau zwei localStorage-Keys)

## Kontext

G3 baut das eine Bauteil, das auf allen zehn Bildschirmseiten identisch steht.
Der Bauplan gibt drei Sätze und **ein** Abnahmekriterium: Kopf 66/52 px mit Logo,
vier Einträgen, `EN ▾` und Uhr; Fußzeile in zwei Fassungen; mobiles Vollbild-Menü
mit 44×44-Knopf — fertig bei **null** Hydration-Warnungen.

Das Chrome-Blatt ist als „verbindliche Fassung" markiert und ausführlicher als
jedes Blatt davor. Es schweigt trotzdem an sieben Stellen, und an drei weiteren
sagt es etwas, das gegen eine Invariante steht. Beides ist hier entschieden.

Vier Zwänge standen daneben:

1. **Ein `.tsx` läuft nicht unter `node --test`.** Node 24 entfernt TS-Typen,
   transformiert aber kein JSX, und eine DOM-Bibliothek wäre eine neue
   Abhängigkeit. Das ist keine Stilfrage, sondern die Grenze des Prüfbaren.
2. **ADR 0043 verbietet dem Wurzel-Layout jeden dynamischen Aufruf.** Ein
   `headers()` nähme jede Seite aus dem statischen Pass — genau die Hülle, die
   G4 vorrendern will.
3. **Vier Klassenhaken lagen seit G1 ungenutzt in `layout.css`** und der
   Umschalter seit G2 in `page.tsx`. Beides sind Zusagen, die diese Phase einlöst.
4. **Die Fußzeile des Blattes trägt `BUILD v3.2.1` und `UPTIME 99.98%`.** Der
   API-Client kommt in G4.

## Entscheidung

**Das Chrome entscheidet nichts in einer `.tsx`: jede Verzweigung ist eine
Funktion in `web/lib/`, jedes Bauteil ist Markup plus ein Aufruf.** Die Uhr ist
ein externer Store, kein Effekt. Die Kopf- und Fußzeilen-Hülle bleibt statisch.
Was das Blatt offen lässt, ist unten entschieden; was gegen eine Invariante
steht, weicht der Invariante.

## Konsequenzen

### Die Uhr beseitigt den Unterschied, statt ihn zu unterdrücken

Der Bauplan schreibt Platzhalter, `suppressHydrationWarning` und Befüllung im
`useEffect`. Gebaut ist `useSyncExternalStore` mit einem
`getServerSnapshot`, der **immer** den Platzhalter liefert. React rendert beim
Hydrieren `getServerSnapshot`, nicht `getSnapshot`: Server-HTML und
Hydrations-Render sind damit dieselben acht Zeichen **bauartbedingt**, und der
Live-Wert erscheint erst im Render nach dem Commit. Es gibt zu keinem Zeitpunkt
zwei Bäume.

`suppressHydrationWarning` steht deshalb auf dem einen `<span>` mit den acht
Ziffern und ist **nicht tragend**. Das steht auch so in der Datei, damit niemand
später den Store „vereinfacht" in dem Glauben, die Unterdrückung erledige das.

Drei Gründe neben der Hydration:

- **`react-hooks/set-state-in-effect`.** Der Prototyp des Blattes macht
  `tick(); setInterval(tick, 1000)`. Das sofortige `tick()` ist ein synchrones
  setState im Effekt und wird abgelehnt. Lässt man es weg, steht bis zu eine
  Sekunde `--:--:--` im Kopf — ein sichtbarer Defekt bei jedem Kaltstart.
- **Drei Uhren, ein Intervall.** Kopf, Meta-Leiste und Menü-Fußstreifen zeigen
  dieselbe Zeit. `subscribeClock` zählt Referenzen; drei Effekte gäben drei
  Intervalle außer Takt, und auf einem langsamen Frame zeigen zwei Uhren im
  selben Bild verschiedene Sekunden.
- **Ein Idiom.** `ThemeSwitch` abonniert seit G2 einen externen Store.

`clockSnapshot()` liefert einen auf die Sekunde gecachten **String**. Ein Objekt
brächte Reacts *„The result of getSnapshot should be cached to avoid an infinite
loop"* — eine Warnung, keine Fehlermeldung, und damit der zweitwahrscheinlichste
Weg, eine Abnahme zu verlieren, die auf einer leeren Konsole beruht.

### Die Seitenkonfiguration kommt über `usePathname()`, nicht über Props

`activeNav()` und `footerVariant()` sind reine Funktionen über dem Pfad; zwei
kleine Client-Bauteile rufen sie auf. `NavLinks` braucht die Client-Grenze
ohnehin, `FooterLeadGate` ist die einzige neue.

Verworfen: **Props von jeder Seite** widerspricht *„Auf jeder Seite gleich …
keine Ausnahme"* und ließe `not-found.tsx` (H10) und `global-error.tsx` (H13)
ohne Chrome. **Route-Gruppen `(long)`/`(short)`** scheitern am selben Punkt: eine
`not-found.tsx` auf Wurzelebene gehört keiner Gruppe, verlöre ihre Fußzeile und
damit den einzigen Weg zu `PRIVACY` und `IMPRINT` von einer Fehlerseite aus.

**Für G4 vorgemerkt:** Kopf und Fußzeile **nicht** in `use cache` wickeln. Ein
`usePathname()` in einer gecachten Grenze fröre die Antwort einer Route ein und
servierte sie allen.

### Fünf Lücken des Entwurfs, entschieden

| Lücke | Entscheidung | Grund |
|---|---|---|
| Kopf sticky oder statisch | **statisch** | Das Blatt zeichnet keinen anderen Zustand und kennt kein `position`. Sticky wäre erfunden. In H1 gegen die echte Spec-Rail nachprüfen. |
| Wo 66 → 52 umschlägt | **bei 900** | Die Herleitung des Schalters in `layout.css` heißt „Kopf schaltet um". Eine zweite Breite wäre ein fünfter Schalter; ADR 0042 sagt, es gibt vier. |
| Scroll-Sperre im Menü | `overflow: hidden` plus gemessene `padding-right`-Kompensation | Gemessene Länge, kein Design-Wert, also kein Token. Die Kompensation zählt: das Menü ist bis 899 erreichbar, auch in einem 800px-Fenster mit Scrollbalken. |
| Fokusfalle | **`<dialog>` + `showModal()`** | Falle, Esc, Top-Layer und Inertheit von der Plattform statt sechzig Zeilen Handarbeit, die wir nicht testen könnten. |
| Ausgangs-Animation | Spiegel des Eingangs, `--d-glow` / `--e-out`, über `@starting-style` | Nutzt ein vorhandenes Token; nur die Richtung ist neu. Kein JS-Timer, der mit einer Dauer synchron gehalten werden müsste. |

Dazu zwei Widersprüche zwischen den Blättern, nach Quellenrang entschieden:
**Nav-Abstand 30px** (Chrome-Blatt ist die verbindliche Fassung; sieben von zehn
Seitenblättern sagen 32 und werden nachgezogen) und **Puls 2,6 s** (Bauplan G6
und Handoff-Inventar sagen beide 2,6; nur das Chrome-Blatt sagt 2,4).

### Invariante 1 schlägt das Blatt

`BUILD v3.2.1` und `UPTIME 99.98%` sind keine Messungen. Die Bausteine stehen,
tragen aber `— NO DATA`, und `FooterMeta` bekommt die Naht, die G4 füllt. Der
Statuspunkt steht dabei neutral und pulst nicht: dass der web-Container läuft,
sagt nichts über die API.

Der ehrlich aussehende Abkürzungsweg — den SHA über eine `NEXT_PUBLIC_`-Variable
lesen — ist durch die `no-restricted-syntax`-Regel in `eslint.config.mjs`
versperrt, solange der Name nicht in `PUBLIC_ENV` steht. `/api/health` liefert
`version` bereits; G4s Client ist der vorgesehene Weg.

### Neun Tokens, zwei Flächen und ein Schatten

`tokens.css` bekommt einen umrandeten G3-Block: `--head-h`/`--head-h-sm`,
`--s-30`, `--d-pulse`, `--rule-major`/`--rule-minor`/`--overlay`/`--scanline`,
`--z-head`/`--z-menu`, dazu `--acc-edge`/`--acc-soft` und `--shadow-panel`.

Zwei Punkte daran sind Fortsetzungen von ADR 0043 und keine neuen Ideen. Das
5px-Lineal und die Scanline stehen im Blatt als `rgba(139,152,166,…)` und
`rgba(255,255,255,.02)` — **Terminal-Noir-Literale**, dieselbe Sorte Defekt, die
G2 für `--acc-line` und `--glow` beseitigt hat; sie sind abgeleitet, und die
Scanline aus `--ink` statt aus Weiß, weil eine weiße Linie auf Latte und Gruvbox
Light gar nicht da ist. Und das Blatt zeichnet **sechs** Alphas des Akzents —
`.55` für Rahmen und Ziffern, dann `.06`/`.08`/`.09`/`.12` für vier getönte
Flächen. Auf dunklem Grund sind die vier nicht unterscheidbar, und die Blätter
sind sich über sie uneins; sie werden zu `--acc-soft` zusammengefasst. Die
Zustände bleiben unterscheidbar, weil sie nie an der Füllung allein hingen —
jeder trägt zusätzlich einen Rahmen in `--acc-edge` und eine Textfarbe.

`--head-h` und `--head-h-sm` sind **zwei Tokens statt eines, das eine Media Query
umschreibt**: Werte leben in `tokens.css`, Media Queries in `layout.css`, und ein
`@media { :root { --head-h: 52px } }` bräche, welche der beiden Regeln man
zuletzt gelesen hat.

`--s-30` liegt bewusst außerhalb des 4er-Rasters. 30 ist keine Rasterstufe,
sondern das Maß eines Bauteils; 32 wäre auf dem Raster und stünde in den
Seitenblättern, aber das Chrome-Blatt ist die verbindliche Fassung. Beide Werte
fehlten im Raster, „steht schon da" schied also als Argument aus.

### `chrome.css` ist die fünfte Datei und wird als vierte importiert

Reihenfolge: `tailwind → tokens → globals → chrome → layout`. Die Position trägt:
`chrome.css` gibt `.nav-desktop` und `.nav-button` ihre Desktop-Werte, und
`layout.css`' `@media (max-width: 899px)` muss weiter gewinnen. Chrome nach
Layout kehrte den 900er-Schalter um, ohne dass irgendetwas rot würde.

`.nav-desktop` ist dabei die **ganze rechte Gruppe** — vier Einträge, zwei
Haarlinien, `EN ▾` und Uhr —, weil das Blatt sie als eine Flex-Reihe mit
`gap: 30` zeichnet und weil unter 900 alle zusammen verschwinden: der mobile Kopf
trägt Logo und Knopf, sonst nichts.

Ob das ein Muster wird, ist **nicht** hier entschieden. Das Chrome ist das
einzige Bauteil, das die Wurzel importiert und auf jeder Seite steht; G6 und G7
bringen zwanzig weitere und beantworten die Frage für sie.

### Sechs Route-Stubs, damit die Phase sich selbst belegen kann

`/work`, `/blog`, `/about`, `/contact`, `/privacy`, `/imprint` — je acht Zeilen,
statisch, mit einem Kommentar, welche H-Phase sie ersetzt. Ohne echte Routen sind
„aktiver Eintrag weiß", „auf `/` nichts aktiv" und „Fußzeile in zwei Fassungen
nach Einsatzplan" nicht beobachtbar, weil jeder Klick in Nexts eingebauter
404-Seite landet, die kein Chrome trägt.

### Vier bewusste Abweichungen vom read-only-Blatt

1. **ARIA-Labels und Oberflächentexte sind Englisch** (`"Menu and language"`,
   `"Close menu"`, `[SOON]` statt `IM BAU`, `THE URL DECIDES · NO REDIRECT`).
   `CLAUDE.md` sagt Englisch; das Blatt schreibt Deutsch.
2. **`role="listbox"` sitzt auf einer `<ul>`,** nicht auf dem Panel-`<div>`, das
   auch die Überschrift und die Fußnote trägt. Eine Listbox darf nur Optionen
   enthalten.
3. **`EN ▾` ist `role="combobox"`,** nicht `role="button"`. Ein Button
   unterstützt `aria-activedescendant` nicht, und ohne das bewegen die Pfeiltasten
   eine Markierung, die kein Screenreader ansagt. Es ist die Select-Only-Combobox
   aus ARIA 1.2 — genau dieses Widget.
4. **Der Menüknopf ist ein echter `<button>`,** nicht ein `<span role="button">`.
   Die `pointer: coarse`-Regel in `layout.css` zielt bereits auf `button`.

### Was das kostet

**Der Scramble schreibt `textContent` an React vorbei.** Das tut das Blatt, es
vermeidet fünfzehn setStates pro Sekunde pro Label und umgeht
`set-state-in-effect` ganz — aber `reactCompiler: true` ist an, und eine
rAF-Schleife mutiert DOM, den React zu besitzen glaubt. Sicher ist es *hier*,
weil das Label eine Konstante ist, React den Textknoten nie mit einem anderen
Wert neu rendert und die Schleife immer mit dem Label endet. Das ist ein
Argument, keine Garantie, und es ist dieselbe Form wie I1s dokumentierte Falle.

**`FooterLeadGate` ist subtil.** Ein Server-Bauteil als `children` an ein
Client-Bauteil zu geben hält `FooterLead` aus dem Client-Bundle — echt, aber
nicht offensichtlich, und Subtilität kostet in einem Repo, das alles
dokumentiert. Der Preis der Alternative wäre „jemand muss daran denken", und eine
vergessene Fußzeile ist eine still falsche Seite, die kein Test sieht. Dazu trägt
der RSC-Payload auf einer Kurz-Fußzeilen-Seite `FooterLead` mit und verwirft ihn:
ein paar hundert Byte.

**Kein Test dieser Phase berührt eine `.tsx`.** Die Gegenmaßnahme ist baulich —
Bauteile enthalten Markup und je einen Aufruf —, aber sie ist eine Disziplin, die
niemand erzwingt. Sie gilt, bis Playwright vor H1 kommt.

**Ein neuer Wert kostet weiterhin zwei Zeilen** (ADR 0042). Vier der neuen
Farbtokens werden nie als Utility erreicht und sind trotzdem abgebildet: die
Abbildung ist die Stelle, an der jemand fragt, ob der Wert wirklich neu ist.

## Verworfene Alternativen

**`useState` plus `useEffect` für die Uhr** — der Bauplan skizziert es. Es
liefert heute dasselbe Ergebnis, aber nur wegen des Werts *eines Arguments*, den
jedes Refactoring verlieren kann, ohne dass ein Test rot wird.

**Eine eigene Fokusfalle im Menü.** Sechzig Zeilen, die auf einer Plattform, die
`<dialog>` mitbringt, nur schlechter sein können — und ohne DOM-Bibliothek nicht
prüfbar.

**Den Kopf sticky bauen.** `.rail { top: 90px }` klingt nach 66px Kopf plus Luft,
aber das ist eine Herleitung aus einer Zahl, kein Satz aus einem Blatt.

**Die vier Nav-Einträge als `<span>` ohne `href`,** wie das Blatt sie zeichnet.
Sie wären nicht fokussierbar, obwohl das Blatt einen Fokus-Zustand vorschreibt,
und der aktive Zustand bliebe unprüfbar.

## Belege

Build-Plan Kapitel 6.3 und Teil II (G3) · `docs/design/Chrome - timseil.dev.dc.html`
(`CHR.01 EINSATZPLAN`) · `docs/design/Consistency Check - timseil.dev.dc.html`
(`K-01` bis `K-27`, `E-04`) · ADR 0042 · ADR 0043 · `docs/runbooks/web.md`
