# ADR 0060 — Die Zeile, die nirgends hinführt, und die Farbe, die kein Text ist

**Status:** Angenommen
**Datum:** 2026-09-01
**Betrifft:** H5a — `SYS.02 SELECTED WORK` der Startseite; H6 erbt alle drei Entscheidungen
**Invarianten:** 1 (keine erfundenen Zahlen), 8 (keine Farbe außerhalb `tokens.css`)

## Kontext

H5 baut die drei offenen Abschnitte der Startseite. Der Bauplan schneidet die
Phase nicht selbst, aber beide Prüffragen aus Kapitel „Phasenzuschnitt" tun es:
drei eigenständige Datenquellen, ein „fertig wenn", das nicht in einen Satz
passt. H5a ist deshalb `SYS.02` allein — nach derselben Regel, mit der ADR 0055
H2 geteilt hat: die Seite wird nach jedem Merge ausgeliefert, und
`01 02 [Schale] [Schale]` ist eine vollständige Seite.

Drei Fragen ließen sich erst beantworten, als der Abschnitt gebaut war. **Alle
drei stellt H6 noch einmal**, weil der Work Index dieselben Zeilen aus derselben
Antwort zeichnet — das ist der Grund, warum sie hier stehen und nicht in einem
Kommentar.

## Entscheidung

### 1. Der Kurztext einer Zeile ist ein Feld der Fallstudie, nicht der Datenbank

`systems` hält Slug, Nummer, Name, Zustand, Quelle, Stack und Metriken —
Migration 00002 hält die Tabelle auf das, was eine Maschine schreibt. Ein Satz
darüber, *was* ein System ist, ist Prosa und gehört nach
`content/case-studies/`.

Genommen wird **nicht** `lead`: das sind vier Sätze für einen Hero, und eine
Zeile, die davon im Bauteil abschneidet, wäre #293 mit dem Zusatz, dass niemand
das Ergebnis vor der Auslieferung liest. `CaseStudy` bekommt deshalb ein
eigenes einzeiliges Feld, und ein Unit-Test hält es unter 120 Zeichen.

Daraus folgt, dass ein System ohne Fallstudie **keinen** Kurztext hat.
`vat-check` steht auf `queued`, hat kein Repository und nichts Geschriebenes.
Die Zelle bleibt leer — nicht `— NO DATA`: das behauptet, eine Messung sei
versucht worden. Um Prosa bittet niemand. ADR 0055 hat für die Hop-Latenzen
dieselbe Grenze gezogen.

### 2. Eine Zeile ohne Ziel trägt gar kein Bedienelement

Das Inventar verlangt für `SystemRow` den Zustand `disabled (queued)`. Gebaut
ist stattdessen ein **fehlender** Ausgang, und das ist STATE.05 wörtlich:
„ein toter Zustand ohne Begründung ist ein Bug". `/work/vat-check` ist ein 404 —
`caseStudyFor` ist das Tor, das die Route selbst benutzt, bevor sie die API
fragt. Ein ausgegrauter Pfeil wäre ein Bedienelement, das nichts erklärt; die
Zustandsspalte daneben sagt `QUEUED` und erklärt alles.

Und **ein Link pro Zeile**, wo das Blatt zwei zeichnet: `CASE STUDY →` in der
Stack-Spalte und `→` in der letzten, beide auf dieselbe Seite. Zwei Tab-Stopps
auf ein Ziel sind die Tastaturfalle, die `OpsGrid` in H2b unter eigenem Namen
abgelehnt hat.

### 3. `--acc-edge` ist eine Kantenfarbe und wird nicht als Text gesetzt

Das Blatt zeichnet die Systemnummer in `rgba(0,229,255,.55)`. Genau dieser Wert
liegt als `--acc-edge` in `tokens.css` — und über `--bg` gerechnet ergibt er
**4,37:1**. WCAG AA verlangt 4,5, und `tokens.css` schreibt neben `--dim` selbst
„5,41 — Untergrenze für Text". Gezeichnet wird `--acc` (12,57:1), dieselbe
Farbe, die `.sec-id` drei Zeilen darüber trägt.

**Gefunden hat das axe auf `/dev/components`, an allen sieben Breiten.** Nicht
auf `/`: dort antwortet in diesem Rig keine API, `SYS.02` ist ein Ausfall-Panel,
und keine einzige Zeile steht im Dokument.

### 4. Die Zeile ist ein Raster über 1080 und darunter eine Karte

Zwei Messungen, eine Entscheidung.

**Erstens:** das Blatt gibt der vierten Spalte `auto` und zeichnet fünf Einträge
darin. `stack.yaml` antwortet **elf**, `auto` ist max-content, und max-content
von elf Einträgen sind 618px bei 1440 — genommen vom `1fr` daneben. Die
Belegzeile rechnete auf null, die Zeile stand 334px gegen 76. Gedeckelt auf
240px, die Breite der Namensspalte.

**Zweitens, und größer:** das reparierte nur 1440. Sechs Spalten tragen 526px,
die nicht schrumpfen; unter 1080 fällt die Belegzeile auf 37px (899), auf null
(719), und bei 560 ist die Zeile 54px breiter als ihr Kasten. Die geteilte
Kartenregel steht bei 560 und kommt für diese Zeile viel zu spät.

`.sys-row` löst sich deshalb bei **1080** auf — dem Schalter, den jeder andere
Mehrspalter dieser Site benutzt, und damit kein neuer Wert. Die Karte behält
alle sechs Zellen; `.work-row` lässt am selben Schalter ihre Vorschau weg, was
für Dekoration richtig ist und für eine Zeile, in der jede Zelle eine Behauptung
ist, falsch wäre.

**Gefunden hat beides keine Prüfung, sondern eine Messung gegen den lokalen
Produktionsbuild mit laufender API** — im Rig steht ohne API keine Zeile im
Dokument, und auch die Überlaufprüfung der Seite sieht sie nicht. Das zweite
kam obendrein aus einem Test, den ich **falsch** geschrieben hatte: die feste
Schwelle „> 200px" galt nur bei 1440 und wurde an drei Breiten rot.

## Konsequenzen

**Für H6.** Der Work Index zeichnet dieselben Zeilen. Er erbt das Feld aus (1),
die fehlende statt der toten Bedienung aus (2) und die Farbe aus (3), und keine
der drei Fragen wird ein zweites Mal geführt.

**Für die Prüfbarkeit.** Der Anteil des Startseiten-Orakels, der in der Galerie
steht statt auf der Seite, wächst mit jedem Abschnitt, der an die API geht: fünf
von acht in H4, neun von neun in H5a. Das ist kein Ausweichen, sondern die
Bedingung des Rigs — und die vierte Sweep-Kante bei 560 zieht aus demselben
Grund mit um: `.sys-row` existiert auf `/` nicht, weil keine API antwortet.
H3 hatte den Grund noch anders notiert („bis H5 SYS.02 und SYS.04 füllt"); der
war falsch, und `e2e/widths.ts` trägt jetzt den gemessenen.

### Was das kostet

- **Ein zweites Feld pro Fallstudie**, das gepflegt werden will. Es ist ein
  Satz, es hat einen Test auf Länge, und es ist die kleinere Hälfte des Preises
  gegenüber zwei Wortfassungen (#293).
- **Das Blatt und die Seite weichen an drei Stellen ab** — der zweite Link, die
  Nummernfarbe, der fehlende statt des ausgegrauten Pfeils. Jede Abweichung
  kostet eine Zeile im Orakel oder im Inventar; keine darf still bleiben.
- **Die 560er-Kante steht nicht mehr im Seiten-Sweep.** Wer nur
  `home.sweep.spec.ts` liest, sieht drei Schalter und muss
  `gallery.systems.spec.ts` finden, um den vierten zu sehen. Der Kommentar in
  `e2e/widths.ts` ist der Wegweiser dorthin und trägt allein diese Last.
- **`--acc-edge` steht weiterhin als Textfarbe in `chrome.css`** (`.menu-link
  .index`, seit G3). Axe sieht es nicht, weil das mobile Menü geschlossen ist.
  Dieser ADR benennt die Stelle, repariert sie nicht, und der Backlog trägt sie.
- **Die Galerie-Vorlage muss die echten Daten tragen, nicht handliche.** Der
  gedeckelte Stack war unsichtbar, solange die Vorlage drei Einträge hatte statt
  elf. Jede weitere Vorlage dort erbt diese Pflicht, und niemand prüft sie.
- **Die Systemliste sieht zwischen 1080 und 900 aus wie auf dem Telefon.** Das
  Blatt zeichnet für die Startseite nur 1440 und 390 und sagt dazu, ihr Umbau
  sei „der einfachste von allen" — für eine sechsspaltige Zeile stimmt das
  nicht. Wer eine Zwischenfassung will, zeichnet sie; bis dahin ist die Karte
  die gezeichnete Fassung.

## Verworfene Alternativen

- **Eine `description`-Spalte in `systems`.** Das hieße, Prosa in eine Tabelle
  zu schreiben, die die Regel hat, nur Maschinengeschriebenes zu halten — und
  ein Feld anzulegen, das der Seed füllen müsste, also erfinden.
- **`lead` kürzen und im Bauteil abschneiden.** Eine zweite, kürzere Wortfassung,
  die niemand liest, bevor sie ausgeliefert ist. #293 ist genau dieser Fall.
- **Den ausgegrauten Pfeil bauen, weil das Inventar ihn nennt.** Die
  Transkription wird nicht umgeschrieben, damit sie uns recht gibt — sie steht
  im Register, und `note` trägt den Widerspruch. Dasselbe Verfahren wie bei
  `SkillRow` in H4.
- **Die Nummer bei `.55` lassen und die Regel tragen.** Eine getragene
  axe-Regel braucht `{rule, issue, until, why}` und ein Datum, an dem jemand
  entscheidet. Für eine Farbe, die einen Token entfernt richtig ist, wäre das
  Buchführung statt Reparatur.
- **`HOME_SWITCHES` auf vier setzen und die rote Zeile hinnehmen.** Sie meldete
  nicht „ein Schalter fehlt", sondern „in diesem Rig gibt es keine API" — wahr,
  längst aufgeschrieben, und nicht das, wofür ein Breiten-Sweep da ist.
