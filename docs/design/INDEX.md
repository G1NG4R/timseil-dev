# Design-Ordner — Index

**Leser: Claude Code.** Dieser Ordner ist der Design-Handoff vom 16.08.2026,
**read-only**. `INDEX.md` ist die einzige Datei hier, die wir selbst schreiben —
alles andere wird gelesen, nie geändert.

**Die Regel:** Pro Phase liest du **nur die Blätter dieser Phase**. Der Ordner
umfasst 29 Blätter mit zusammen 1,38 MB HTML. Wer alles liest, hat keinen Kontext
mehr für den Code.

---

## Bevor du ein Blatt glaubst

Die Entwürfe sind älter als die Entscheidungen des Build-Plans und tragen an
neun Stellen Angaben, die nicht mehr stimmen — nachzulesen in Kapitel 7 des
Build-Plans, als Issues in A3, abgearbeitet in K1:

| Steht im Blatt | Gilt |
|---|---|
| `React Router 7` | Next.js 16 |
| `PostgreSQL 16` | PostgreSQL 18 |
| Health-Container mit SQLite | API-Container mit Postgres (ADR 0005) |
| deutsche Absätze in der Oberfläche | Oberfläche ist Englisch |
| „ohne Prometheus" | Prometheus gehört zum Stack (ADR 0007) |
| `[FOLGT]` | `[SOON]` |
| Pin „schaltet 5 Systeme" | 2 Systeme — Pin bis System 03 deaktivieren |
| `[PLACEHOLDER DATA]` am Contribution-Graph | entfällt beim API-Anschluss |
| Terminal-Inventar ohne `cv` | mit `cv` |

**Form gilt, Fakten aus dem Build-Plan gewinnen.** Nie eine Versionsnummer,
einen Stack-Namen oder eine Zahl aus einem Blatt übernehmen.

---

## Wie du ein Blatt liest

**Die Blätter sind Canvases, keine Webseiten.** Ein Blatt enthält mehrere
Artboards fester Breite nebeneinander — die Homepage etwa ein Desktop-Artboard
bei 1440 und darunter ein Mobil-Artboard bei 390. **Das Fenster kleiner ziehen
ändert nichts**, es gibt keinen Reflow. Die andere Breite steht weiter unten im
selben Blatt.

Der HTML-Quelltext ist generiert: ein `<x-dc>`-Template plus `support.js`, das
die Seite zur Laufzeit rendert. Kein Blatt hat ein `<title>` — der Dateiname
ist der Name.

| Frage | Weg |
|---|---|
| Abstände, Größen, Farben, Zustände im Bild | `make design` + Browser |
| Texte, Zustandsnamen, Reihenfolgen, Regeln | Quelltext lesen ist in Ordnung |
| Maße gegen die Umsetzung stellen | Playwright gegen `make design`, ab H1 eingerichtet |

## Betrieb

```bash
make design       # → http://localhost:4000
```

Der Server liefert diesen Ordner statisch aus. Er gibt den Blättern **eine
stabile, maschinenunabhängige URL** — daran hängt der Playwright-Vergleich ab
H1, und ein Screenshot-Lauf soll keinen absoluten Pfad deines Rechners
einbacken.

**Die Blätter brauchen Netz.** `support.js` lädt `react@18.3.1`,
`react-dom@18.3.1` und `@babel/standalone` zur Laufzeit von unpkg, dazu Google
Fonts. Nachgemessen mit blockiertem unpkg: `<x-dc>` wird nicht ersetzt, es
entsteht kein `#dc-root`, die Seite bleibt dunkel. **Eine schwarze Seite heißt:
kein Netz.**

Zwei Eigenheiten, damit niemand sie zweimal sucht:

- `serve` schneidet `.html` in der URL ab. `Homepage - timseil.dev.dc.html`
  liegt unter `/Homepage%20-%20timseil.dev.dc`.
- **`file://` funktioniert entgegen Kapitel 6.2 des Build-Plans.** Per
  Doppelklick geöffnet rendert ein Blatt vollständig — headless nachgemessen,
  DOM strukturell identisch zur `http://`-Fassung. Die CDN-Skripte kommen über
  klassische `<script src>`-Tags, die vom `file:`-Ursprung aus laden; der
  einzige `fetch()`-Pfad in `support.js` ist ein Nachlade-Zweig mit `.catch()`,
  und `x-import` benutzt kein Blatt. `make design` bleibt trotzdem der Weg —
  wegen der stabilen URL, nicht weil `file://` bricht.

---

## Phase → Blätter

Die Richtung, die der Session-Prompt aus 8.5 braucht. Fehlt deine Phase, ist
die Antwort **kein Blatt** — dann such nicht weiter.

| Phase | Blätter | ~KB |
|---|---|---|
| A1–A4, B*, C*, E* | **keine** — Repo, Contract, Daten, API, CI | – |
| A3 (Doku) | Case Study Map (für C4-Diagramme) | 69 |
| D3 · Dokploy | Operations | 31 |
| F1–F5 · Observability | Operations | 31 |
| G1 · Tokens & Tailwind | Foundations · `code/` · Intermediate Widths | 136 |
| G2 · Fonts & Themes | Foundations · `code/` · Homepage Themes | 119 |
| G3 · Chrome | Chrome · Consistency Check | 87 |
| G4 · API-Client | **keine** | – |
| G5 · i18n & SEO | Language Switcher · Routes and Paths | 89 |
| G6 · Zustandssprache | State Language | 66 |
| G7 · Komponenten-Galerie | Foundations · `code/` · State Language | 136 |
| H1 · Case Study Hero | Case Study Template · Case Study 02 | 160 |
| H2 · Case Study Architektur & Operations | Case Study Map · Operation Grid · Operations | 125 |
| H3 · Homepage Hero | Homepage · Chrome | 152 |
| H4 · Homepage SYS.01 | SYS.01 Training Log · Homepage | 157 |
| H5 · Homepage SYS.02–04 | Homepage · Operation Grid | 135 |
| H6 · Work Index | Work Index · Routes and Paths | 70 |
| H7 · About | About | 57 |
| H8 · Contact | Contact | 39 |
| H9 · Blog | Blog Index · Blog Post | 109 |
| H10 · 404 | 404 | 41 |
| H12 · Legal | Legal | 62 |
| H13 · 500 & Fehler | State Language | 66 |
| jede H-Phase zusätzlich | Intermediate Widths · Consistency Check | 111 |
| I1 · Boot-Sequenz | Boot Sequence | 34 |
| I2 · Scroll-Choreografie | Scroll Choreography | 51 |
| J1 · Terminal-Kern | Homepage (Befehlsregister) · Handoff (Inventar) | 181 |
| J2 · Terminal-Bedienung & CV | Homepage · CV | 121 |
| K1 · Korrekturen & EN-Fassung | Content Checklist · Kapitel 7 des Build-Plans | 19 |
| K2 · Blog, CV & Bilder | Content Checklist · CV · Blog Post | 89 |
| L4, L7 · Härtung, Datenschutz | Legal · Operations | 93 |
| M2 · A11y-Audit | State Language · Consistency Check | 111 |
| M4 · Inhalts-Endabnahme | Content Checklist | 19 |

**Woher die Zuordnungen stammen.** Die Blattauswahl folgt Kapitel 6.3 des
Build-Plans. Die Phasennummern folgen **Teil II**, weil 6.3 eine ältere
Nummerierung der Stufe H trägt (dort Homepage H2, Work Index H3, Blog H6 — in
Teil II sind es H3–H5, H6 und H9). Bei Widerspruch gilt Teil II.

Fünf Zeilen stehen in 6.3 überhaupt nicht und sind aus den Phasentexten in
Teil II abgeleitet — **meine Zuordnung, nicht die des Plans**: `A3` (Case Study
Map als Vorlage für die C4-Diagramme), `H13` (State Language für die
Fehlerzustände), `J1`/`J2` (6.3 weist Stufe J kein Blatt zu, obwohl das
Befehlsregister im Homepage-Blatt steht und das Inventar im Handoff-Blatt),
`M2` und `M4`. Die KB-Spalte ist gemessen, nicht geschätzt.

---

## Blatt → Phasen

Die Kurzbeschreibung stammt aus dem Kopf des Blattes und sagt dir, ob es die
Frage überhaupt beantwortet, bevor du es öffnest.

| Blatt | Phasen | ~KB | Was drinsteht |
|---|---|---|---|
| `README.md` | **alle, zuerst** | 52 | Der Handoff selbst: Leitidee, Wege, Regeln |
| `Handoff` | alle · J1 | 71 | Übergabeblatt, alles geprüft, nichts behauptet |
| `Code Handoff` | alle · G1 | 20 | Dieselben Werte ausführbar — die 9 Dateien unter `code/` |
| `code/` | G1 · G2 · G7 | 27 | `tokens.css`, `globals.css`, `layout.css`, `tokens.ts`, 6 Komponenten |
| `Mindmap` | Orientierung, optional | 19 | Die ganze Seite auf einem Blatt, in einfachen Worten |
| `Foundations` | G1 · G2 · G7 | 43 | Typo-Skala, Abstände, Linien, Bauteile — in echter Größe |
| `Intermediate Widths` | G1 · alle H | 66 | Was zwischen 900 und 1440 passiert, zwei Rahmen bei 1024 |
| `Chrome` | G3 · H3 | 42 | Kopf, Menü, Fußzeile als ein Bauteil — verbindliche Fassung |
| `State Language` | G6 · H13 · M2 | 66 | Zustands-Matrix, Moves, Systemzustände |
| `Consistency Check` | G3 · alle H · M2 | 45 | Nachprüfung nach der Umsetzung, alle zehn Seiten |
| `Language Switcher` | G5 | 59 | Dropdown, Vollbild-Menü, Übersetzungsmatrix |
| `Routes and Paths` | G5 · H6 | 30 | Wie die Seiten zusammenhängen: Karte, Matrix, drei Wege |
| `Case Study Template` | H1 | 90 | Vorlage für alle Projektseiten |
| `Case Study 02` | H1 · H2 | 70 | Die gefüllte Fallstudie, Zahlen bleiben leer bis sie existieren |
| `Case Study Map` | A3 · H2 | 69 | Systemdesign in der Tiefe: vorne, hinten, Datenlage |
| `Operation Grid` | H2 · H5 | 25 | Betriebsraster neben dem Contribution-Graph, Kerben anklickbar |
| `Operations` | D3 · F1–F5 · H2 · L4 | 31 | VPS, Dokploy, Traefik, Metriken, Aufbewahrung |
| `Homepage` | H3 · H4 · H5 · J1 · J2 | 110 | SYS.01 mit Projekt-Nachweis, desktop + mobil, Terminal-Register |
| `Homepage Themes` | G2 | 49 | Die Homepage in sieben Themes, umschaltbar |
| `SYS.01 Training Log` | H4 | 47 | Zustands-Stufen mit Projekt-Nachweis |
| `Work Index` | H6 | 40 | `/work` — Filter, Zähler, Hover-Vorschau |
| `About` | H7 | 57 | Trajectory-Rail, Jahre klick- und tastaturbedienbar |
| `Contact` | H8 | 39 | Formular mit Live-TX-Spur |
| `Blog Index` | H9 | 50 | `SYS.04 LOG`, Filter und Suche |
| `Blog Post` | H9 · K2 | 59 | Post-Template, Lesemaß 68 Zeichen |
| `404` | H10 | 41 | Router-Trace, montierte Routen, der eine Alert-Rot-Moment |
| `Legal` | H12 · L7 | 62 | Imprint + Privacy, Live-Readout aus dem Browser |
| `Boot Sequence` | I1 | 34 | Storyboard und lauffähige Referenz, 0–2400 ms |
| `Scroll Choreography` | I2 | 51 | Score, Effektkatalog, Spec — ein Pin pro Seite |
| `CV` | J2 · K2 | 11 | Eine Seite, druckbar — nur über den Terminal-Befehl `cv` |
| `Content Checklist` | K1 · K2 · M4 | 19 | Jeder Platzhalter mit Format, Länge und Beispiel |

`support.js` und `doc-page.js` sind die Laufzeit der Blätter, keine
Spezifikation — nie lesen, nie ändern, nur mit ausliefern.

**`Mindmap` steht nicht in Kapitel 6.3.** Bis das entschieden ist, führen wir es
hier als Orientierungsblatt: es erklärt die Seite, spezifiziert aber nichts.
