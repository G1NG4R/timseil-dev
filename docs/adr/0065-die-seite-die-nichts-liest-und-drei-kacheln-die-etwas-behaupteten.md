# ADR 0065 — Die Seite, die nichts liest, und drei Kacheln, die etwas behaupteten

**Status:** Angenommen
**Datum:** 2026-09-03
**Betrifft:** H7a — Hero, Operator-Karte, WHAT I RUN, HOW I WORK und die zwei
Schalen von `/about`; schuldet H7b die Rail und K2 den einen menschlichen Satz
**Invarianten:** 1 (keine erfundenen Zahlen), 5 (Belege zeigen nie ins Leere),
8 (keine Farbe, kein Radius, keine Dauer außerhalb `tokens.css`)

## Kontext

`/about` war seit G3 der Stub, den das Chrome brauchte, um sich selbst zu
beweisen: `<p>ABOUT [SOON]</p>`, `indexable: false`. Sein eigener Kopfkommentar
sagte, was diese Phase damit tut.

Das Blatt ist das **platzhalterdichteste des ganzen Handoffs** — elf geklammerte
Zeichenketten über zwei Artboards, dazu deutsche Prosa in einer englischen
Oberfläche. Vier Fragen ließen sich erst beantworten, als die Abschnitte gebaut
waren, und die schärfste hat nicht das Bauen beantwortet, sondern ein Blick in
`seed.sql` und in den Bauplan.

## Entscheidung

### 1. Der Abschnitt, der belegen soll, hat drei Behauptungen aufgestellt

Die Entwurfsnotiz zu `SYS.05.02` ist der Grund, warum es den Abschnitt gibt:

> WHAT I RUN ist die About-Version der Architektur-Platte — **belegt die
> Positionierung, statt sie zu behaupten**.

Gegen dieses Repository gehalten trägt der gezeichnete Abschnitt drei Aussagen,
für die nichts hier geradestehen kann:

| Im Blatt | Was hier steht |
|---|---|
| `SERVICES · 4 containers` | `compose.yaml` definiert **zehn** Dienste. Die Zahl ist nicht gerundet falsch, sie ist eine andere — und sie ist die Sorte, die beim nächsten Dienst still veraltet. |
| `WATCH · Nightly dump off the box. The restore has been tested.` | Der Sicherungs-Job ist **L6**, der Restore-Drill ist L6 und M5. Keiner ist gelaufen. Das sind die acht erfundenen Boot-Zeilen aus ADR 0058 in einem anderen Kostüm. |
| `ONE VPS · [SPEC] · ADMINISTERED BY ME` | Die Klammer will die Größe dieses Hosts. Das ist Ist-Zustand, und CLAUDE.md hält ihn von jeder nach außen gehenden Fläche fern. |

Gebaut ist: die SERVICES-Kachel nennt die **Anordnung** statt einer Zahl, die
WATCH-Kachel nennt **Sonde, Logs und Metriken** — Stufe F, gebaut und messbar —
und die Meta liest `ONE VPS · ADMINISTERED BY ME`.

**Und die Korrektur zu (2) ist Schweigen, nicht `[SOON]`.** Überall sonst auf
dieser Seite sagt eine Abwesenheit sich selbst an und nennt die Phase, die sie
beendet — der Terminal-Rahmen, die zwei leeren Abschnitte, das
Bauteil-Inventar. Eine Kachel mit `BACKUPS [SOON]` sagte auf einer öffentlichen
Seite, dass dieser Host noch nicht gesichert ist. Genau diesen Satz verbietet
CLAUDE.md. Der Rest steht in `backlog.local.md`.

`lib/about/content.test.ts` hält beides fest, und es hält es **auf die Kacheln
begrenzt**: Prinzip 02 einen Abschnitt weiter sagt, eine öffentliche Adresse
lehre einen „timeouts, certificates, backups, and your own blind spots" — das
ist ein Satz übers Lernen und keine Behauptung über diesen Host, und eine Wache,
die ihn mitfängt, wäre eine, die niemand behält.

### 2. Eine Klammer ist ein Satz, den die Seite erfinden würde

Gestrichen statt gezeichnet, jedes Mal mit demselben Argument wie ADR 0055 bei
den zwei Bild-Platzhaltern der Fallstudie:

- **Das Portrait im Terminal-Rahmen.** Anders als H3s Terminal hält der Rahmen
  hier nichts offen: die rechte Spalte hat mit der Operator-Karte schon einen
  Konsumenten, der 1080-Schalter bleibt also messbar. Bilder sind K2s.
- **`LANGUAGES: [LANGUAGES]`** — die Zeile entfällt, das Raster hat keine feste
  Zeilenzahl.
- **Der zweite Bio-Absatz**, eine Klammer, die um eine Stimme bittet.
- **`READING [BOOK OR PAPER]`**, **`AWAY FROM IT [ONE LINE]`** und
  **`NEXT UP — 05 Foundry`**: zwei Klammern und ein System, das es nicht gibt.
  Damit hat `SYS.05.04` nichts zu zeichnen und sagt das.

Die Wache dafür ist zweistufig, weil das Argument nur so viel wert ist wie das,
was die *nächste* Klammer bemerkt: `placeholders()` prüft die Konstanten,
`e2e/about.spec.ts` prüft das ausgelieferte Dokument. `[SOON]` ist **namentlich**
ausgenommen und nicht der Form nach — es ist das eigene Wort dieser Seite für
eine benannte Abwesenheit und damit das Gegenteil eines Platzhalters.

### 3. Zwei von vier Abschnitten sind Schalen, und sie tragen das Paar

`SYS.05.01` schuldet H7b die Rail, `SYS.05.04` schuldet K2 den einen
menschlichen Satz. Beide bekommen `reasonKey` **und** `owedBy` — das Paar aus
`lib/home/sections.ts` und `lib/gallery/registry.ts` —, und
`sections.test.ts` hält fest, dass ein Abschnitt entweder gefüllt oder
geschuldet ist, nie beides und nie keines. STATE.05: „ein toter Zustand ohne
Begründung ist ein Bug."

Die Überschrift der Schale ist **`[SOON]` und nicht `— NO DATA`**. Die zwei sind
verschiedene Sätze, und `lib/state/words.ts` besitzt beide: `— NO DATA` heißt,
eine Messung wurde versucht und kam nicht an; `[SOON]` heißt, die Sache gibt es
noch nicht. Hier wurde nichts gemessen.

### 4. Der große Punkt im Hero gehört der Startseite — entschieden von der Korrekturtabelle

Das Blatt zeichnet in der Verfügbarkeits-Zeile einen 7px-Punkt. Gebaut wurde er,
und **`e2e/home.spec.ts` ist im ersten vollen Lauf dieser Phase rot geworden** —
mit einer Zusicherung aus H3:

```ts
test("the large dot appears on this page and on no other", …)
  await page.goto("/about");
  await expect(page.locator(".hero-dot")).toHaveCount(0);
```

Nachgelesen statt geraten: der Konsistenz-Check führt **genau dieses Artboard**
als Befund K-14 — „Statuspunkt ONLINE nur auf Startseite und About, obwohl die
Übergabe TopNav · StatusDot als globales Bauteil führt" — und löst ihn in der
Nachher-Tabelle als `BEHOBEN` auf:

> Punkt in der Meta-Leiste jeder Seite, **groß im Hero nur auf der Startseite**.

Das Blatt ist die Zeichnung *vor* der Korrektur. Wo ein Canvas-Artefakt und die
Korrekturtabelle sich widersprechen, ist die Tabelle die Entscheidung — ADR
0055, zum wiederholten Mal, und diesmal hat es nicht das Lesen gefunden, sondern
ein Test aus einer Phase, deren Ziel eine ganz andere Seite war.

**Verloren geht nichts.** ADR 0058 §2 vorwärts gelesen: der Punkt trug `.st-dot`
**ohne** `data-dot` — ein Kreis, der nichts behauptet, weil niemand misst, ob
ich verfügbar bin. Das Wort ist der Zustand; die Dekoration war der Teil, der
ohnehin nur auf einer Seite stehen sollte. `data-tone` bleibt, weil `.st-word`
seine Farbe daraus liest.

**Und der Test taugte, weil er ging statt zu greppen.** Er lief seit H3 gegen
`/about` und konnte bis zu dieser Phase nur über ein Stylesheet fehlschlagen —
das Ziel war ein Stub. In dem Moment, in dem daraus eine Seite wurde, hat er das
gemessen, wofür er geschrieben war.

### 5. Ein Hero, nicht ein dritter

Das Blatt zeichnet `1fr 400px` mit 80px Abstand; `layout.css` trägt seit G1
`.hero` mit `1fr 480px` und 72. H3 hat die zweite Geometrie, die es geerbt
hatte, **gelöscht** — „eine Regel, die niemand erreichen kann, ist kein
Ersatzteil, sondern die Behauptung, dass es etwas gibt" — und eine dritte
anzulegen, damit eine Seite achtzig Pixel anders ist, wäre dieselbe Behauptung
mit Absicht. Der 1080-Schalter ist so oder so derselbe, und das ist das, was ein
Leser sieht. Im Orakel als `one-hero-geometry`.

Aus demselben Grund teilt sich About sechs Klassen mit der Startseite —
`.hero-eyebrow`, `.hero-init`, `.hero-avail`, `.hero-dot`, `.hero-avail-note`
und die Rhythmus-Klasse `.hero-head` —, und der Schlüssel `homeAvailability`
heißt jetzt `availability`. Beide Seiten drucken **denselben Satz**; H2a hat
gemessen, was ein zweiter, kürzerer Satz kostet. Nicht geerbt wird
`.hero-headline`, dessen 620px das Maß des Startseiten-Satzes sind.

### 6. Der Schalter dieser Seite ist 900, und er ist gerechnet, nicht gezeichnet

Das Blatt zeichnet vier Kacheln bei 1440 und zwei bei 390 und sagt nichts
darüber, wo sie tauschen. Gerechnet hat die Kachel bei drei Zeilen ihrer
längsten Detailzeile rund 194px nötig; vier davon plus drei Abstände sind eine
836px-Spalte, also ein 916px-Fenster. Bei 899 wäre eine Kachel 190px breit — die
vier Pixel, die den Schalter auf **900** legen und nicht auf 720.

Das Prinzipien-Raster hätte für sich genommen bei 720 tauschen dürfen. Es tauscht
trotzdem bei 900, und das ist eine Entscheidung: 180px Fenster, in denen die
Seite gleichzeitig vier Kacheln breit und ein Prinzip breit ist, sind eine
Zerrissenheit, die niemand bestellt hat — und bei 899 ist der Prinzip-Körper in
einer zweispaltigen Fassung 323px gegen die 222, die er braucht, also kostet der
frühere Schalter nichts, was ein Leser sehen könnte.

**Gemessen am gebauten Produktionsbuild an allen sieben Prüfbreiten**, `clientWidth`
je Zeile mitgelesen: Kachelraster 4 · 4 · 4 · 4 · 2 · 2 · 2, Prinzipienraster
2 · 2 · 2 · 2 · 1 · 1 · 1, Überlauf 0 an jeder Breite, genau eine `<h1>`.

### 7. Ein langes Meta bricht den Titel, und die Startseite hatte das zuerst

`.sec` ist eine Flex-Zeile — Marker, Titel, Abstandhalter, Meta — und hat fünf
Köpfe getragen, ohne sich zu beschweren, weil ein Meta normalerweise zwei oder
drei Wörter hat. `SYS.05.02` hat sieben, und bei 390 wurde der Titel `WHAT I
RUN` von 94px auf 84 gedrückt und brach über zwei Zeilen. **Bisektiert am
gebauten Build: bricht bis einschließlich 418, eine Zeile ab 419.**

Für sich genommen wäre der Schalter damit 560 gewesen. Das Nachmessen hat aber
denselben Fehler auf einer Seite gefunden, die diese Phase nicht angefasst hat:

```
/     SYS.01 TRAINING LOG    bricht 560 … 744    eine Zeile ab 745
```

**185 Pixel Fensterbreite, in Produktion seit H4.** Niemand hat es gesehen, weil
kein Test die Zeilenzahl eines Kopfes liest — und wenn ein Titel umbricht,
bewegt sich sonst nichts in der Zeile: kein Überlauf, kein veränderter Schalter,
kein roter Sweep.

**Der Schalter ist deshalb 900 und nicht 720.** 720 ließe vierundzwanzig Pixel
stehen, in denen der Kopf der Startseite weiter unter seinem eigenen Minimum
gezeichnet wird — der Zustand, den H5a für `.sys-row` und H6 für `.work-row` in
denselben Worten abgelehnt haben. Kein fünfter Wert.

Die Regel steht auf `.sec` und nicht auf den Köpfen dieser Seite: der Fehler
gehört dem Bauteil, nicht der Route, die das erste lange Meta geschrieben hat —
und die Startseite ist der Beleg dafür, weil sie ihn zuerst hatte. Beide Seiten
haben jetzt eine Zusicherung über die Zeilenzahl, weil eine Reparatur ohne
Wächter eine Reparatur ist, die die nächste Phase rückgängig macht.

Gemessen an neun Breiten (die sieben plus 560 und 559), nach der Reparatur:
**jeder Kopf beider Seiten einzeilig, Überlauf null.**

## Folgen

**Die Seite kostet das Startbündel null Byte, und das ist gemessen.** Nach ADR
0064s Methode, im selben Build: `/` und `/about` sind **byte-gleich**, 143 856 B
gzip über sieben Dateien; `/work` trägt seine Insel mit 145 482 B über acht.
H7b hat damit das ganze verbliebene Budget für die Rail.

**Das Orakel dieser Seite trägt keinen einzigen `on:`-Eintrag**, zum ersten Mal
seit H3. Die drei Seiten davor mussten Messungen in die Galerie verlegen, weil
das Rig keine API hat; `/about` liest nichts, also ist die Seite im Rig die
Seite in Produktion. `runSheetOracle` bekommt aus demselben Grund kein `ready` —
das Feld ist seit dieser Phase optional, und die Abwesenheit ist eine Aussage
über die Seite und keine Voreinstellung.

**H7b erbt zwei Dinge und keine Datei.** Den Schnitt an der Bedien-Grenze, und
die Frage, ob die Rail die Insel aus ADR 0064 braucht — beantwortet wird sie
dort mit gemessenen Bytes.

**K2 erbt einen benannten Rest:** der eine menschliche Satz in `SYS.05.04`, und
er steht als Schale mit Begründung da, bis er geschrieben ist.

## Belege

```
make check   grün
npm test     569    (von 550)
e2e          1 359 grün, 3 übersprungen, 0 rot   (von 1 244)
Orakel       42 Messungen für /about, 16 abweichend, kein einziger `on:`
Bündel       /about 143 856 B über 7 Dateien — byte-gleich mit /
Sitemap      12 Einträge (von 9)
```

Geometrie an den sieben Prüfbreiten, `clientWidth` je Zeile mitgelesen, plus
560 und 559 für die Kopfzeilen: jeder Kopf einzeilig auf `/about`, `/` und der
Fallstudie, Überlauf null überall, genau eine `<h1>`.
