# ADR 0058 — Ein Platzhalter zeichnet den Rahmen, und der Punkt im Hero misst nichts

**Status:** Angenommen
**Datum:** 2026-09-01
**Betrifft:** H3 — Hero, Terminal-Platzhalter und Sektionsgerüst der Startseite;
schuldet H4, H5, I1, I3, J1 und J2 je einen benannten Rest
**Invarianten:** 1 (keine erfundenen Zahlen), 8 (keine Farbe, kein Radius, keine
Dauer außerhalb `tokens.css`), 9 (genau zwei localStorage-Keys — unberührt, aber
die Theme-Zeile wird angefasst)

## Kontext

`/` war seit F1b die Entwicklungs-Schale: eine Überschrift, ein Satz und eine
`<dl>` mit zwei Health-Zeilen. Es ist die einzige Route neben der Fallstudie, die
`indexable: true` trägt, und der einzige Eintrag im Sitemap — die Adresse, die
ein Fremder zuerst sieht, war die einzige ohne Inhalt.

H3 baut den oberen Teil: Hero, Verfügbarkeits-Zeile, Terminal-**Platzhalter** und
die vier leeren Marker. Vier Fragen ließen sich erst beantworten, als die
Abschnitte gebaut waren, und zwei davon hat nicht das Bauen beantwortet, sondern
ein Screenshot und ein roter Test in einer ganz anderen Datei.

## Entscheidung

### 1. Ein Bauteil einer späteren Stufe wird als Fläche gebaut, nicht als abgeschaltetes Bedienelement

Das Homepage-Blatt zeichnet an dieser Stelle ein **laufendes** Terminal: eine
Titelleiste, acht Boot-Zeilen, einen blinkenden Block und

```html
<input aria-label="terminal input — type help">
```

Der Bauplan gibt das Bauteil an Stufe J und dieser Phase den Platzhalter. Gebaut
wird deshalb der Rahmen — Ecken-Marker, Titelzeile, Scanline — **ohne jedes
Bedienelement**, und statt `TRY: HELP` steht `[SOON]`.

Drei Gründe, und keiner davon ist „einfacher":

1. **Eine Eingabe, die nichts annimmt, ist der tote Zustand, den STATE.05 einen
   Bug nennt.** „DISABLED SAGT WARUM: ‚queued' oder ‚0 treffer' statt einfach
   ausgegraut." Der Rahmen sagt stattdessen `QUEUED` und einen Satz dazu.
2. **Sie wäre ein Tab-Stopp ins Nichts** — in der Phase, deren Stufenvorspann
   „axe-core grün" verlangt.
3. **Die acht Boot-Zeilen sind vier erfundene Zahlen.** `postgres 16: accepting
   connections`, `docker compose up … 4/4 healthy`, `ci: last deploy #a41f9c2 ·
   42s`. Invariante 1 hat keine Ausnahme für ein dekoratives Log.

**Der Rahmen bleibt trotzdem, in voller Breite.** `.hero` ist oberhalb 1080
`minmax(0,1fr) 480px`; mit leerer Rail gäbe es keinen 1080-Schalter zu messen,
und die Regel behielte den leeren Konsumenten, den sie seit G1 hat.

**Mobil ist es dasselbe Element.** Das Blatt zeichnet bei 390 eine eigene Leiste
mit `TAP TO OPEN — DOCKS AS DRAWER`. In H3 öffnet sie nichts, also verliert der
Rahmen bei 720 seinen Körper und behält seine Titelzeile — ein Bauteil statt
zweier, ohne einen neuen Schalter und ohne eine Aufforderung, die niemand
einlösen kann. Die Schublade schuldet J2.

**Diese Entscheidung wird sonst viermal wieder geführt:** H5 zeichnet den
Deploy-Streifen, H6 die Filter, H10 das Spiel, J1 das Terminal selbst.

### 2. Der große Punkt im Hero ist Dekoration, `MARKS` bleibt unberührt

Zwei Belege widersprechen sich, und beide haben recht.

Der Konsistenz-Check führt **K-14** als BEHOBEN: „Punkt in der Meta-Leiste jeder
Seite, **groß im Hero nur auf der Startseite**."

`lib/state/words.ts` gibt `available` `dot: null`, und `words.test.ts` erzwingt
das als Regel: *„gives a dot to every state that makes a claim, and to no
other"* — `mark.dot === null` genau dann, wenn `mark.answer === null`. Der
einzige gefüllte Punkt wäre `solid`, und `DOT_ANSWER` liest `solid` als
`measured-good`. **Niemand misst, ob ich verfügbar bin.**

Aufgelöst wird das nicht durch einen Eintrag in `MARKS`, sondern durch die Naht,
die `state.css` ohnehin zieht: `.st-dot` ist Geometrie, `data-dot` ist die
Behauptung. Der Hero-Punkt trägt `.st-dot` **ohne** `data-dot` — ein Kreis, der
nichts sagt —, der Ton kommt aus `MARKS.available.tone` statt aus einem zweiten
Literal, und `home.css` gibt ihm die eine Deklaration, die fehlt: seine Füllung.

Beide Blätter behalten ihre Antwort, keines lügt, und `MARKS` bleibt eine
Tabelle über Messungen.

### 3. Die korrelierte Insel zieht um, statt zu sterben

Seit F1b trägt `/` den einzigen Aufruf dieser Seite, der mit der Request-ID des
Besuchers und einem Kind-Span an die API geht. Der Kopfkommentar der Datei sagt
selbst, was auf dem Spiel steht: die Fußzeilen-Zahlen kommen aus einer geteilten
`use cache`-Antwort, die per Konstruktion niemandes Request-ID trägt — geht die
Insel verloren, ist der Sprung nicht mehr auffindbar und **kein Test sagt es**.

Sie wird die erste Zeile des Terminal-Platzhalters. Das ist keine Rettung,
sondern die Definition, die der Bauplan für J1 aufschreibt: *„simulierte
Oberfläche, echte Daten."* Der Platzhalter tut in klein, was das Bauteil in groß
tun wird, und der Zustand steht dort, wo ein Leser ihn sieht.

### 4. Die Metas der vier Köpfe bleiben leer, und `cvHint` bleibt, wie es ist

Das Blatt schreibt `22 TRACKS`, `02 SYSTEMS`, `LATEST 03` und `UPDATED [DATE]`
in die Sektionsköpfe. Das sind Zahlen, die diese Phase nicht hat. H2a hat die
Regel bereits formuliert: eine Meta, die die Zeichnung statt die Seite
beschreibt, ist Nomenklatur für etwas Abwesendes. H4 und H5 tragen sie mit
gemessenen Werten nach.

`cvHint` ist derselbe Fall eine Ebene weiter. Das Blatt will in der Fußzeile auf
`/` die Kurzfassung `CV → TERMINAL cv` statt `CV → TERMINAL ON / : cv`. Beide
Fassungen behaupten bis J1 ein Terminal, das Eingaben annimmt — **die heutige
Langfassung genauso wie die Kurzfassung.** Kürzen kostete eine zweite
Client-Insel (`usePathname`) gegen 6 419 B Restbudget und machte die Zeile nicht
wahrer. Die ganze Zeile gehört zu J2, wo `cv`, die PDF und das
read-only-Terminal zusammenliegen. Als Notiz geführt, nicht stillschweigend
stehen gelassen.

### 5. Die Abstands-Ausnahme trägt den feinen Zeiger, nicht eine neue Größe

**#257:** die sieben Theme-Felder sind 44 × 44 für einen Finger und 11 × 11 für
eine Maus, auf jeder Breite. Die Projektregel ist dort richtig, wo sie gilt —
CLAUDE.md hängt 44px an `pointer: coarse` und nicht an der Breite —, aber sie
bleibt einen Schritt hinter einem Standard zurück, gegenüber dem sie sonst
strenger ist: WCAG 2.2 AA 2.5.8 verlangt 24 × 24 von **jedem** Zeigergerät.

Das Issue nennt drei Wege und sagt, die Antwort sei keine Zahl. Der vierte ist
die Ausnahme im Standard selbst: ein Ziel darf unter 24 bleiben, wenn sein
Mittelpunkt mindestens 24 von jedem benachbarten entfernt ist. Bei 11px Breite
und 8px Abstand sind es 19; bei 14 sind es 25.

**Also wird nichts umgezeichnet.** Die Felder behalten die Größe, die das
Chrome-Blatt zeichnet, und nur die Luft dazwischen wächst — die kleinste
Änderung, die die Regel erfüllt, und die einzige, die keine Design-Korrektur
ist. Grob bleibt unberührt: dort sind die Knöpfe schon 44 und ihre Mittelpunkte
52 auseinander, und ein größerer Abstand schöbe die Reihe bei 390 aus einer
346px-Spalte.

## Was zwei Bilder und ein fremder Test entschieden haben

**Die 348 px des Blattes für den Terminal-Körper sind gebaut und wieder entfernt
worden.** Die Begründung fürs Behalten war `.st-wait`s eigene Regel — „eine
Wartefläche hält die Höhe, die die Antwort brauchen wird, damit nichts darunter
springt". Sie trägt nicht: `.st-wait` hält zwei Sekunden, dieser Rahmen steht
vier Phasen. Im Screenshot sind 348 px leerer Kasten kein wartendes Bauteil,
sondern eine Fläche, die aussieht, als sei sie nicht geladen. **Am Bild
gefunden, nicht am Quelltext.**

**`.st` trägt `white-space: nowrap`, und die Startseite hat einen Satz daneben
gestellt.** Richtig für ein Zustandswort, falsch für die Verfügbarkeits-Zeile:
bei 390 konnte sie nicht umbrechen und hat die Seite waagerecht aufgerissen,
`innerWidth` 485 gegen einen 390er Viewport. **Gemeldet hat es
`mobile-menu.coarse.spec.ts`**, deterministisch, drei Läufe von drei — eine
waagerecht überlaufende Seite verbreitert den Layout-Viewport und den Dialog mit
ihm, und der Schließen-Knopf lag bei x = 391 außerhalb der sichtbaren Breite.
Gegen `main` gegengeprüft, dort grün.

`chrome.css` hat den Nachbarfall vorhergesagt und vertagt: die Sperre fordert die
Breite einer klassischen Bildlaufleiste zurück, „unsichtbar dort, wo das Menü
lebt", weil Touch-Leisten Overlays ohne Breite sind. Im Rig sind sie es nicht,
und **bis H3 war `/` zu kurz zum Scrollen** — die Startseite ist die erste Seite,
die diese Bedingung überhaupt herstellt.

**Und `.st-word` erbt seine Type.** Das ist in der Meta-Leiste richtig, wo der
Block ringsum die Größe setzt; in einem Absatz nicht. `AVAILABLE` stand in der
Textschrift bei 15px, wo das Blatt Mono 11 zeichnet. Gefunden beim **Schreiben**
des Orakel-Eintrags für Zeile 74, nicht beim Ansehen.

## Konsequenzen

- Die Startseite hat einen Inhalt, und der Hero gibt `.hero` seinen ersten
  Konsumenten seit G1.
- **Null neue Tokens.** `--grid`, `--acc-edge`, `--scanline`, `--glow`,
  `--radius-dot`, `--st-dot`, `--s-26`, `--s-30`, `--s-96` und `--d-pulse` waren
  alle da; `--glow` bekommt am CTA seinen ersten Konsumenten überhaupt.
- **Null Byte eigenes JavaScript.** Kein `'use client'` unter `components/home/`.
- `.cs-hero` ist entfernt. Dreimal verschoben (H1a, H2a, H2b), und nach dem
  letzten Hero dieser Seite gibt es keinen Kandidaten mehr.
- `spacing-scale` hat seinen **Text korrigiert** statt seiner Reichweite: er
  behauptete „the largest single difference is 4px", H2b hatte ihn längst auf
  acht gedehnt, und das Hero-Padding liegt zwölf daneben. Drei neue Klassen
  tragen, was er nicht mehr trägt.
- Ein zweites Blatt-Orakel, 21 Messungen, sechs abweichend — und der Sweep über
  `/` erwartet **drei** Kanten statt vier: 560 bewegt hier nichts, bis H5 die
  Zeilen bringt, die es umbaut.

## Was diese Entscheidung nicht behauptet

**Das Seitenraster ist nicht gebaut.** Die Blätter zeichnen hinter jeder Seite
ein 88px-Gitter; es ist Chrome und nicht Startseite, G3 hat es ausgelassen, und
`--grid` hat weiter keinen Konsumenten.

**Der Terminal-Platzhalter ist kein Terminal.** Er beantwortet keine Eingabe, er
kennt kein Befehlsregister, und `layout.css:104` trägt weiter
`.terminal-input { pointer-events: none }` ohne Konsumenten — die Regel gehört
J2 und wartet dort.

**Die Boot-Kaskade ist nicht angefangen.** `data-decode` steht in keinem Element.
I1 besitzt diesen Textknoten, mit der Falle, die es selbst notiert hat.
