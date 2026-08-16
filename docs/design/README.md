# Handoff: timseil.dev — Terminal-Noir Portfolio

**Stand:** 16.08.2026 · **Zielumgebung:** Next.js (App Router) · **Fidelity:** hi-fi
**Domain:** timseil.dev · **Kontakt:** contact@timseil.dev · **GitHub:** github.com/G1NG4R

---

## 1. Überblick

Persönliche Seite eines Backend- und DevOps-Entwicklers (Go, TypeScript, Linux, Docker,
Kubernetes) in Luxemburg. Die Leitidee: **die Seite ist selbst ein System und belegt das
Handwerk durch ihren eigenen Betrieb** — ein bedienbares Terminal, ein sichtbarer Trainings-Log
mit Belegen statt Selbsteinschätzung, echte Betriebsmetriken der laufenden Systeme.

Zielgruppe sind Hiring Manager und technische Leads. Der Ton ist nüchtern und protokollarisch:
Zustände werden gemeldet, nicht beworben.

## 1a. Wege zur Fallstudie

`Case Study 02` ist von vier Stellen aus erreichbar, jeweils Desktop und Mobil:
Systemliste der Homepage (`CASE STUDY →` an der timseil.dev-Zeile), Work Index (dieselbe Zeile),
LOG-Sektion der Homepage (`SYSTEM 02 · CASE STUDY →` in der Sektionskopfzeile) und Blog Index
(Rail-Kennzahl `SYSTEM · 02 CASE STUDY`). Die Blog-Einträge tragen im Markup keine
System-Zuordnung, deshalb hängt der Verweis dort an der Sektion, nicht an einer Zeile — beim Build
gehört die Zuordnung in die Daten (`post.systemId`), dann kann jeder Eintrag direkt verlinken.

## 1b. Der Kern der Seite — was sie besonders macht

Der Mechanismus, an dem alles hängt: **jede Behauptung der Seite ist an einen Beleg gebunden,
und der Beleg ist ein System, das läuft.** Wer das beim Bauen wegoptimiert, baut ein anderes
Produkt — die Seite verliert damit ihr Argument.

Drei Regeln machen ihn aus:

1. **Der Trainings-Log leitet sich aus den Systemen ab, nicht aus Selbsteinschätzung.**
   22 Tracks in fünf Modulen. Jeder Track hat einen Zustand (`CORE` / `APPLIED` / `LEARNING` /
   `QUEUED`) und darunter eine Belegzeile, die das System nennt, in dem er läuft:
   `SHIPPED IN → 02 TIMSEIL.DEV (BUILD + DEPLOY)`. Ohne System heißt die Zeile
   `NO SYSTEM YET → SELF-STUDY`. Der Zustand ist damit nicht behauptet, sondern abgeleitet.
2. **Der Log füllt sich mit jedem Projekt.** Das ist die zeitliche Achse der Seite: kommt ein
   System hinzu, wandern die Tracks, die es benutzt, von `LEARNING` auf `APPLIED`, und ihre
   Belegzeile nennt das neue System. `CORE` ist erst erreicht, wenn ein Track in
   **mindestens zwei Systemen im Betrieb** steht. Deshalb steht heute **kein Track auf CORE**.
3. **Betriebszahlen nur für Systeme, die laufen.** `live` trägt Uptime, p95 und Fehlerrate;
   `queued` und `in build` tragen `— NO DATA`. Erfundene Zahlen sind ausgeschlossen — auch in
   den Entwürfen sind Platzhalter als `[…]` markiert.

**Stand heute (Entwürfe, 16.08.2026):** 22 Tracks, davon **13× APPLIED** aus timseil.dev
(Go, TypeScript, SQL, HTTP/JSON-APIs, Webhooks, PostgreSQL, SQLite, Linux, Docker, CI/CD,
Logging & Observability, Git, AWS-S3-Backups), **9× LEARNING** ohne System (Python, C, Auth/JWT,
Pub/sub, Cryptography, Kubernetes, Caching, Datenstrukturen, OOP & funktional), **0× CORE**.
Kopfzeile: `SELF-TRACKED · 22 TRACKS · EVIDENCE: 01 SYSTEM`.

**Konsequenz für den Build:** die Belegzeilen sind kein Text, sondern eine Beziehung
(Track → System). Sie gehören in die Daten, nicht ins Markup — siehe Datenvertrag 9.4.
Und jede Stelle, die einen Stack nennt (Hero-Zeile, Terminal `stack`, Filter-Chips im
Work-Index), muss mit den Log-Zuständen übereinstimmen: als Kubernetes im Log auf `LEARNING`
stand, war es in der Hero-Zeile und als Filter-Chip zu entfernen.

## 2. Über die Design-Dateien

Die Dateien in diesem Paket sind **Design-Referenzen in HTML** — Prototypen, die Aussehen und
Verhalten zeigen. Sie sind **kein Produktionscode zum Kopieren**.

Die Aufgabe ist, diese Entwürfe in der Zielumgebung **nachzubauen** — mit ihren etablierten
Mustern, Komponenten und Bibliotheken. Konkret: Next.js App Router mit React-Komponenten,
Styling nach Wahl (Tailwind oder CSS Modules; die Entwürfe nutzen Inline-Styles, weil das
Prototyping-Umgebung ist, nicht weil es die empfohlene Produktionsform wäre).

Jede Datei öffnet direkt im Browser. `support.js` muss im selben Ordner liegen.
Mehrere Dateien zeigen Desktop (1440) und Mobile (390) nebeneinander auf einer Fläche —
zum Vergleichen, nicht als Responsive-Verhalten.

## 3. Fidelity: hi-fi

Farben, Typografie, Abstände, Zustände und Timings sind final und exakt so umzusetzen.

**Ausnahme Inhalte:** Ein Teil der Texte ist noch nicht bestätigt (siehe Abschnitt 12).
Diese Stellen sind im Entwurf mit `[KLAMMERN]` markiert. Sie dürfen **nicht** mit erfundenen
Werten gefüllt werden.

## 4. Zielumgebung

Gewählt: **Next.js, App Router.**

Recherchierter Versionsstand (Stand 15.08.2026, Quellen in Abschnitt 13):
16.x ist die aktuelle Stable-Linie, **16.3.0 LTS** wurde am 06.08.2026 veröffentlicht.
Next.js 15 verlässt den Support am 21.10.2026 — für ein neues Projekt also direkt 16.3 LTS.
Der React Compiler ist seit Next.js 16 stabil, standardmäßig aber nicht aktiv.

Empfohlener Schnitt:

```
app/
  layout.tsx              Fonts, <html lang="en">, Grid-Overlay, Tick-Rulers, Footer
  page.tsx                Homepage (SYS.01–SYS.04 + Terminal + Kontakt)
  work/page.tsx           Work Index (Filter, Live-Preview, Ops-Metriken)
  work/[slug]/page.tsx    Case Study (Vorlage: Case Study Template · gefüllt: Case Study 02 = /work/timseil-dev)
  blog/page.tsx           Blog Index (Filter + Suche)
  blog/[slug]/page.tsx    Blog Post
  about/page.tsx          About (Trajectory-Rail)
  contact/page.tsx        Kontaktformular
  (keine CV-Route)         cv.pdf liegt statisch in public/, ausgeliefert nur über den Terminal-Befehl cv
  imprint/page.tsx        Impressum
  privacy/page.tsx        Datenschutz (mit Live-Telemetrie-Block)
  not-found.tsx           404
  api/health/route.ts     Proxy/Aggregat der eigenen Ops-Metriken
  api/contact/route.ts    Annahme, Validierung, Spam-Prüfung, Übergabe an den Mail-Provider
lib/
  github.ts               Contribution-Kalender, serverseitig, gecacht
  ops.ts                  Metriken der laufenden Systeme
  mail.ts                 Provider-Client, Reply-To, Rate-Limit
content/
  work/*.mdx  blog/*.mdx  Inhalte
```

Datenladen gehört in Server Components bzw. `lib/`. Client-Komponenten sind nur:
Terminal, Work-Filter, Trajectory-Rail, Blog-Suche, Privacy-Telemetrie, Mobile-Nav.

## 4a. Container-Topologie

Vier Container auf einem Host, ein Prozess pro Container:

| Nr | Container | Inhalt | Sprache |
| --- | --- | --- | --- |
| 1 | **Proxy** | Traefik: TLS, Routing, Access-Log | Konfiguration über Labels |
| 2 | **Web** | Next.js App Router: Seiten und die Route Handler `/api/contact`, `/api/training` | TypeScript |
| 3 | **Health** | liest das Access-Log, schreibt das SQLite-Aggregat, liefert `/api/health` | Go |
| 4 | **Datenbank** | Postgres 16: Systeme, Tracks, Belege, Vorfälle, Deploys — **keine Post-Texte**, die liegen als MDX im Repo | SQL |

Der Health-Container ist der Grund, warum `Go` im Trainings-Log als belegt gilt, und warum die
Ops-Metriken ohne Prometheus auskommen. Das SQLite-Aggregat ist eine Datei, die nur er schreibt;
die Web-Schicht liest die Zahlen über `/api/health`, nie direkt.

## 4b. Betrieb — kurz

Eigener VPS, **Dokploy** (bringt Traefik und Let's Encrypt mit), Build in **GitHub Actions**,
Deploy über den Dokploy-Webhook, Image-Tag ist der Commit-SHA. Uptime misst ein **externer**
Monitor — ein Host kann seinen eigenen Ausfall nicht melden; p95 und Fehlerrate entstehen aus
dem Traefik-Access-Log und werden alle fünf Minuten nach SQLite aggregiert, `/api/health`
liest dieses Aggregat. Access-Logs 14 Tage, Anwendungslogs 7, Rate-Limit-IP nur 10 Minuten im
Speicher, Postgres-Dump nächtlich nach S3 mit 30 Tagen Aufbewahrung. DNS ohne Proxy davor,
damit die Aussage der Datenschutzseite stimmt. Vollständig mit Begründungen im Blatt
`Operations - timseil.dev.dc.html`.

## 5. Dateien in diesem Paket

### Seiten

| Datei | Screens | Inhalt |
|---|---|---|
| `Homepage - timseil.dev.dc.html` | Desktop 1440, Mobile 390 | Hero, Terminal, SYS.01 Training Log, SYS.02 Systems, SYS.03 Stack, SYS.04 LOG, Kontakt  **Abschnittsfolge (HOME.01):** Hero → SYS.01 Training Log → SYS.02 Selected Work → SYS.03 Uplink → SYS.04 Log → Fuß. Die Nummer ist die Reihenfolge; der Log steht vor der Systemliste, weil er deren Belege liefert. Kopien (Themes-Blatt) folgen der Quelle |
| `Work Index - timseil.dev.dc.html` | Desktop, Mobile | Systemliste, Filter nach Stack und Zustand, Hover-Preview, Ops-Metriken pro System |
| `Case Study Template - timseil.dev.dc.html` | Desktop, Mobile | Case-Study-**Vorlage** für alle Projektseiten (Beispielinhalt: System 02, timseil.dev) inkl. Sticky-Spec-Rail, Ausfall-Abschnitt und **Betriebsraster-Slot in `.04 OPERATIONS`** (Pflichtteil jeder Projektseite: 91 Tage Desktop, 30 mobil; nur `live` füllt es) |
| `Case Study 02 - timseil.dev.dc.html` | Desktop, Mobile | Die **gefüllte** Fallstudie zu timseil.dev, aus dem Betriebsblatt, inklusive Betriebsraster (91 Tage, Tag-1-Zustand): vier Randbedingungen, Architektur in drei Pfaden (Request, Deploy, Messung), sechs Entscheidungen mit ihrem Preis, fünf Ops-Kacheln auf `— NO DATA`, vier offene Fragen, dreizehn Belege aus dem Trainings-Log. Route `/work/timseil-dev` |
| `Blog Index - timseil.dev.dc.html` | Desktop, Mobile | Eintragsliste, Filter, Suche |
| `Blog Post - timseil.dev.dc.html` | Desktop, Mobile | Post-Template, Lesemaß 68 Zeichen  **Bausteine-Karte (LOG.01):** 5 Pflicht- und 7 optionale Blöcke mit Regel je Block — ein Eintrag entsteht durch Weglassen, nicht durch ein neues Layout. Post-Mortem ist der Regelfall: Vorfall, Ursache, Behebung, was bleibt |
| `About - timseil.dev.dc.html` | Desktop, Mobile | Operator-Profil, Trajectory-Rail (Jahres-Stepper), How I Work, Off-System |
| `404 - timseil.dev.dc.html` | Desktop, Mobile | Fehlerseite mit Router-Trace, gemounteten Routen und dem Mini-Spiel `SYS.404.01 ERROR BUDGET`. Mobil ist der Rahmen 952px hoch mit markierter Falte bei 844 — die Seite scrollt dort seit dem Spiel über eine Bildschirmhöhe hinaus |
| `Legal - timseil.dev.dc.html` | Impressum, Datenschutz, Mobile | Rechtliches; Datenschutz zeigt live, welche Daten der Browser sendet |
| `CV - timseil.dev.dc.html` | Eine Seite, A4 | Einseitiger Lebenslauf, A4, druckfertig über `doc-page` (PDF-Export ohne Zusatzarbeit). Helles Theme, weil Papier kein Bildschirm ist. Nachweis-Spalte mit vier Adressen, Zustandsleiter statt Prozente, Herkunftszeile im Fuß |
| `Contact - timseil.dev.dc.html` | Desktop, Zustände, Mobile | Kontaktformular mit echtem Versandpfad, TX-Spur, sechs Zustände, Endpoint-Vertrag |

### Referenzblätter (Bewegung und Zustände)

| Datei | Inhalt |
|---|---|
| `Boot Sequence - timseil.dev.dc.html` | Startsequenz: 6 Frames, Timing-Lineal, Spec-Tabelle, lauffähige Referenz mit Replay |
| `Scroll Choreography - timseil.dev.dc.html` | Scroll-Score über die ganze Seite, 6 Effekte, Spec inkl. Reverse-Verhalten, lauffähige Referenz |
| `State Language - timseil.dev.dc.html` | Zustandsmatrix 9 × 5, 6 Moves, 4 Systemzustände, Spec, Werkbank mit Zustandsprotokoll |
| `Handoff - timseil.dev.dc.html` | Übergabeblatt: dieselben Angaben wie dieses README als Fläche, zum Draufzeigen |
| `Homepage Themes - timseil.dev.dc.html` | Sieben Farb-Themes auf der echten Homepage, live umschaltbar, plus Palettenblatt mit gemessenen Kontrasten. **Exploration: nur die Farben sind verbindlich.** Inhalte, Zahlen und Zustände führt die Homepage; der Trainings-Log ist hier ein Auszug aus drei von fünf Modulen und zeigt die Farbstufen, nicht den Stand. |
| `Routes and Paths - timseil.dev.dc.html` | Wegeplan: Karte mit Ausgängen pro Seite, vollständige Link-Matrix (10 × 10), drei Besucherwege, die zehn nachgetragenen Querverweise mit Ort und Grund |
| `Foundations - timseil.dev.dc.html` | Fundament: Typo-Skala in echter Größe (13 Stufen statt 23), Abstands-Skala, Linien, Flächen, Form, Dauern, und die Bauteile, die in den Seiten je nur einmal vorkommen |
| `Mindmap - timseil.dev.dc.html` | Überblick in einfachen Worten: fünf Äste (Frontend, Backend, Daten, Betrieb, Außen) mit einer Erklärung pro Baustein, zwei Abläufe (Aufruf und Deploy) und ein Glossar mit zwölf Begriffen — für Leute, die keinen Fachjargon lesen wollen |
| `Operations - timseil.dev.dc.html` | Betrieb: Anfrage- und Deploy-Weg, neun Entscheidungen mit Begründung und Verworfenem, Metrik-Pipeline, Aufbewahrungsfristen, DNS/TLS/Mail, Runbook, fünf Dokploy-Stolpersteine |
| `Language Switcher - timseil.dev.dc.html` | Drei Sprachen — EN, DE, FR, live umschaltbar über Kopf, Hero und Fußzeile: Desktop-Dropdown `EN ▾` (Panel mit Sprachname und Route, Tastatur vollständig: ↓↑ umlaufend, Home/End, Enter, Esc, Klick außen), mobil ein Kopfknopf `EN ≡` zum Vollbild-Menü (Nav 25px, Sprachchips 52px, Theme-Felder 44px), Zustandsblatt (Ruhe, Hover, Fokus, Offen, Markierung), Übersetzungsmatrix mit 16 Zeilen und Entscheidung je Zeile, Routen `/` · `/de` · `/fr` mit `hreflang`, Regeln (keine automatische Umleitung, ein Umschalter pro Gerät, Befehle bleiben englisch — `lang de` schaltet dieselbe Seite, Zahlformate nach Locale, `ts.lang`). Wechsel-Feedback: Überschrift dekodiert neu, Terminal bootet in der neuen Sprache und schließt mit `lang → de  /de` |
| `Case Study Map - timseil.dev.dc.html` | Zwei Karten in einer Bildsprache: **MAP.02** der Server zur Fallstudie (Host, Laufzeit, Eingang, Steuerung, Daten, Auslieferung, Messung, Außen — jeder Baustein mit Rolle in einem Satz und Herkunft als Wort) und **MAP.00** das ganze Projekt (Design-System, Bewegung, Seiten, Inhalt, fünf Datenverträge, Technik, Recht, Übergabe, offene Punkte) |
| `Operation Grid - timseil.dev.dc.html` | Betriebsraster als Gegenstück zum Contribution-Graph: eine Zelle je Betriebstag, Kerbe je Vorfall mit Ursache, Behebung, Error-Budget und Log-Eintrag, Deploy-Streifen, fünf aus den Daten gerechnete Kennzahlen, Tag-1-Zustand, Datenvertrag pro System (Abschnitt 9.5) |
| `Intermediate Widths - timseil.dev.dc.html` | **Zwischenbreiten 900–1440 — der Bereich zwischen den beiden Entwurfsbreiten.** Neuer Breakpoint **1080**, hergeleitet aus neun Bauteilen mit fester Geometrie (je Bauteil: feste Spalte + Abstand, Mindestbreite des Inhalts, nötige Viewport-Breite). Spaltenformel `min(1160px, 100% − 80px)` ersetzt die frühere Doppelangabe. Vollständiger Media-Query-Block, drei Umsetzungsregeln (`minmax(0,1fr)`, Sticky nur mit Spalte, Media statt Container), Prüfprotokoll über sieben Breiten mit Prüfblick und Durchfall-Kriterium je Breite, interaktiver Rechner, zwei annotierte Rahmen bei 1024 (Fallstudie, Work Index) und drei Korrekturen an LAYOUT.02 und README 6 |
| `Content Checklist - timseil.dev.dc.html` | Was an Inhalt noch fehlt: 43 Einträge über elf Seiten mit Format, Zeichenlänge, Beispielsatz und Dringlichkeit (sperrt / vor dem Start / danach), dazu die vier echten Startsperren, die Schreibregeln aus den vorhandenen Texten und eine Längentabelle je Textsorte. Contact und 404 tragen keinen Platzhalter |
| `Chrome - timseil.dev.dc.html` | **Verbindliches Bauteil für Kopf, Menü und Fußzeile.** Kopf Desktop in drei Zuständen (Startseite ohne aktiven Eintrag, Unterseite mit weißem Aktiv-Zustand, Ruhe/Hover/Fokus/Aktiv nebeneinander), Kopf mobil mit einem 44 × 44-Knopf und dem Vollbild-Menü (Navigation, Sprache, Adresse, Uhr), Fußzeile in zwei Fassungen (lang mit Kontaktblock, kurz ohne) für Desktop und Mobil, Einsatzplan je Seite. Alle zehn Bildschirmseiten sind darauf gezogen |
| `Consistency Check - timseil.dev.dc.html` | Prüfbericht über 11 Seiten × 9 Achsen: Erstbefund mit 18 Abweichungen und Korrekturplan (Runde 1, historisch), Nachprüfung mit Stand je Punkt und Matrix nach der Umsetzung (Runde 2), plus die Liste dessen, was Design nicht mehr lösen kann |
| `Code Handoff - timseil.dev.dc.html` | Dieselben Werte als Code: Dateibaum, Tokens im Original, Einbau in vier Schritten, der `@supports`-Fallback für scroll-gekoppelte Moves |

Insgesamt 29 `.dc.html`-Dateien plus `doc-page.js` plus `support.js` und der Ordner `code/` mit 11 Dateien. Die 11 Seiten enthalten zusammen
23 Screens (Desktop 1440 und Mobile 390; Legal und Contact haben je drei, CV einen).

**Reihenfolge beim Bauen:** `Chrome` zuerst — Kopf, Menü und Fußzeile stecken in jeder Seite. Danach die Seiten, deren Abweichungen im `Consistency Check` mit Stand dokumentiert sind.

**Zuerst einbauen:** `code/` enthält `tokens.css`, `globals.css`, `layout.css`, `tokens.ts` und sechs
Komponenten — dieselben Werte wie das Fundament-Blatt, ausführbar. Details in `code/README.md`.

**Vor dem Bauen lesen:** `Routes and Paths` listet zehn Querverweise, die inzwischen
in den Entwürfen stehen — darunter Case Study ↔ Post-Mortem und `/contact` in der Routenliste der 404. Wer die
Seiten nacheinander baut, lässt genau diese Links weg — die Liste nennt für jeden Ort und Grund.

### Trainings-Log

`SYS.01 Training Log - evidence.dc.html` — die verwendete Form des Trainings-Logs:
Zustands-Stufen mit Projekt-Nachweis, plus der Datensatz dahinter.

**Prozentanzeigen gibt es im Projekt nicht mehr.** Die frühere Variante mit Prozentzahlen
und die erste Homepage-Fassung, die sie nutzte, sind gelöscht. `topics_done / topics_total`
bleibt nur im Datensatz und trägt intern die Balkenbreite — auf der Seite erscheint die Zahl
nie, dort steht der Zustand (CORE / APPLIED / LEARNING / QUEUED).

## 6. Design Tokens

### Farben

Alle Werte aus den Entwürfen extrahiert. Kontrastwerte gegen `#0A0E14` von mir berechnet
(WCAG 2.1 Relativluminanz); AA verlangt 4.5:1 für Text, 3:1 für großen Text ab 24px.

| Token | Hex | Rolle | Kontrast auf #0A0E14 |
|---|---|---|---|
| `bg` | `#0A0E14` | Seitenhintergrund | — |
| `panel` | `#0E141C` | Terminal, Karten, Spec-Blöcke | — |
| `ink` | `#E8EEF4` | Überschriften, Primärtext | 16.55 |
| `ink-2` | `#C6D1DB` | Fließtext | 12.47 |
| `ink-3` | `#B9C6D4` | Fließtext in dichten Modulen | 11.14 |
| `steel` | `#8B98A6` | Sekundärtext, Labels | 6.58 |
| `dim` | `#7C8996` | Meta, Einheiten, Hinweise | 5.41 |
| `cyan` | `#00E5FF` | Akzent, Live-Zustand, Fokusring | 12.57 |
| `cyan-hi` | `#9DF4FF` | Hover auf Cyan | 15.49 |
| `alert` | `#FF2D55` | Fehler, ein Moment pro Seite | 5.30 |
| `amber` | `#FFB000` | Degraded, Teilausfall | 10.56 |
| `on-cyan` | `#08131A` | Text auf cyaner Fläche | 12.21 gegen #00E5FF |

Auf `#0E141C` liegen alle Werte 0.2–0.7 niedriger, der niedrigste ist `dim` mit **5.17** —
weiterhin über AA.

**Zwei Ausreißer normalisieren:** `#121A24` (Blog Post, 2×) und `#111A24` (State Language, 1×)
sind Einzelfälle für „aktive Fläche". Auf einen Wert festlegen, Vorschlag `#121A24` als
`panel-active`.

**Neon-Budget:** Cyan belegt maximal etwa 3 % der Fläche eines Viewports. Pro Seite gibt es
genau einen Alert-Moment (404: der Fehlercode; Case Study: der Ausfall-Abschnitt).
Auf About gibt es bewusst kein Rot.

**Themes — ausgeliefert:** sieben Paletten (Terminal Noir, Catppuccin Mocha, Amber CRT,
Phosphor, Tokyo Night, Catppuccin Latte, Gruvbox Light), alle in `code/tokens.css` als
`[data-theme="…"]`-Blöcke. **Verbindlich ist Terminal Noir**; die übrigen sechs sind eine
Vorliebe des Besuchers, keine Marken-Variante. Ohne gespeicherte Wahl folgt die Seite
`prefers-color-scheme` (hell → Gruvbox Light). Die Wahl liegt in `localStorage["ts.theme"]`
und muss **vor dem ersten Paint** gesetzt werden — Snippet in `code/README.md`. Bedient wird
sie über `components/ThemeSwitch.tsx` in der **Fußzeile**, nicht in der Navigation.
Struktur, Typografie und Timings bleiben in jedem Theme identisch; in den hellen fallen
`steel` und `dim` zusammen (nur drei Textstufen über AA) und `--glow` auf `none`.

### Typografie

**Die Skala ist entschieden** (Foundations-Blatt, ausführbar in `code/tokens.css`):
Mono 9 · 10 · 11 · 12 · 13, Body 13 · 15 · 16.5, Display 26 · 34 · 52 · 62 · 108 —
dreizehn Stufen, keine halben Pixel. Der Absatz unten beschreibt den Befund, aus dem sie
entstanden ist.

| Familie | Rolle | Quelle | Lizenz |
|---|---|---|---|
| Chakra Petch | Display, Überschriften, CTA | Google Fonts | OFL |
| Geist | Fließtext | Google Fonts (von Vercel, variabel 100–900) | OFL |
| JetBrains Mono | Alles Systemhafte: Labels, Terminal, Metriken, Tabellen | Google Fonts | OFL |

In Next.js über `next/font/google` laden (self-hosted, kein Request an fonts.gstatic.com):
`Chakra_Petch` (400/500/600), `Geist` (variabel), `JetBrains_Mono` (400/500/600/700).

**Befund, ehrlich benannt:** Die Entwürfe verwenden **20 bis 23 verschiedene Schriftgrößen pro
Seite**, darunter Halb-Pixel-Werte (8.5, 9.5, 10.5, 11.5, 12.5, 13.5). Das ist gewachsen und
keine Skala. Vor der Umsetzung konsolidieren — **Vorschlag**, nicht Bestandteil des Entwurfs:

```
mono:    9 · 10 · 11 · 12 · 13        (Labels, Meta, Terminal, Tabellen)
body:    13 · 15 · 16.5              (Fließtext, Lesemaß 64–68 Zeichen)
display: 26 · 34 · 52 · 62 · 108     (H3 · H2 · CTA/H1-mobil · H1 · 404)
```

Gemessene Extreme, die erhalten bleiben müssen: 108px (404-Code), 64/62px (H1 Desktop),
52px (E-Mail-CTA), 6.5px (nur dekorative Mikro-Labels, nie inhaltstragend).

Laufweiten: Mono-Labels `letter-spacing: .1em` bis `.2em`, Display leicht negativ
(`-.005em`), Fließtext normal. Zahlen immer `font-variant-numeric: tabular-nums`.

### Layout

| Wert | Bedeutung |
|---|---|
| 1440px | Desktop-Frame der Entwürfe |
| 1160px | Inhaltsspalte (also 140px Rand links und rechts) |
| 390px | Mobile-Frame |
| 2.8 % | Deckkraft des Hintergrundrasters, 28px Zellraster |

**Breakpoints — entschieden am 16.08.2026, vollständig im Fundament-Blatt (LAYOUT.02), Bereich 1440–1080 nachgerechnet in `Intermediate Widths` (LAYOUT.03):**

| Bereich | Was passiert | Warum diese Zahl |
| --- | --- | --- |
| ≥ 1440 | Spalte steht bei 1160, Ränder wachsen mit | Entwürfe sind auf 1160 gezeichnet; breiterer Text wird unlesbar |
| 1440–1080 | Spalte ist `min(1160px, 100% − 80px)`, sonst alles wie gezeichnet | zwischen den Entwürfen wird interpoliert, nicht umgebaut |
| < 1080 | alle fünf Zweispalter lösen sich auf (Hero-Terminal, Fallstudien-Hero, Spec-Rail, Constraints, Architektur), Rails nicht mehr sticky, Vorschauspalte der Work-Zeile entfällt; Kopf bleibt vollständig | Spec-Rail 400 + Abstand 80 + Lesemaß 517 = 1077. Aufgerundet, und bewusst über 1024, damit ein iPad quer nicht im Grenzfall liegt |
| < 900 | Kopf → Menüknopf, Hero einspaltig, Terminal unter den Text, Meta-Leiste von zwei auf drei Zeilen | Nav, Umschalter und Uhr brauchen ~520px |
| < 720 | alles einspaltig, H1 auf 34, Spec-Rails über den Inhalt | darunter bleibt für die zweite Spalte < 300px |
| < 560 | Tabellenzeilen werden Karten (Work Index, Systemliste, Log), Deploy-Streifen scrollt waagerecht, Ops-Kacheln 5 → 2 | sechs Rasterspalten ergäben 60px-Spalten. Das Betriebsraster selbst ist bei 91 Tagen nur 243px breit und war hier nie betroffen |
| 390 | Referenzbreite der Mobil-Entwürfe, Rand 22px | kleinstes gezeichnetes Gerät |

Regeln dazu: Die Zahlen kommen aus dem Inhalt, nicht von Gerätenamen — sie stehen dort, wo ein
konkretes Element bricht. Dazwischen wird geflossen, nicht gesprungen. Der Breakpoint ist der Schalter, die Größe kommt von der Seite: H1 wechselt bei 720 auf 34,
oberhalb gilt die Zuordnung aus TYPE.02 — 62 auf Startseite und About, 52 auf allen übrigen.
Fließtext und Mono-Labels ändern sich nicht. Die
44px-Regel und das read-only-Terminal hängen an `pointer: coarse`, nicht an der Breite — ein
Tablet mit 1000px bekommt große Ziele, ein schmales Desktop-Fenster nicht. Getestet wird an
sieben Breiten, jeder Schalter beidseitig: 1440, 1081, 1079, 1024, 899, 719, 390 — Protokoll mit
Prüfblick und Durchfall-Kriterium je Breite in `Intermediate Widths`. Der Pin in SYS.02 entfällt unter 900 (siehe Abschnitt 7).

Abstände folgen einem 4er-Raster mit den häufigen Werten 6, 8, 10, 12, 14, 16, 20, 26, 34,
44, 56, 72, 96. Sektionsabstand Desktop 96px, Mobile 64px.

## 7. Bewegung

Vollständige Specs in den drei Referenzblättern. Kurzfassung:

**Boot (0–2400ms, einmal pro Session):** Panel-Brackets snappen (80ms, 120ms), Init-Log
7 Zeilen à 100ms, Headline dekodiert (640ms, 540ms, 40ms/Zeichen), Module kaskadieren
(1040ms, 60ms/Zeile), Graph füllt (1200ms, 12ms/Spalte), Ambient ab 1900ms.
Abbrechbar durch Klick, Taste oder Scroll. `sessionStorage`-Flag.

**Scroll:** Header-Wipes bei `entry 12%`, Row-Stagger 60ms, Graph-Fill 12ms/Spalte,
ein einziger Pin (SYS.02, 1.4 Viewports, schaltet 5 Systeme), Parallax 0.4× und 0.15×,
Sticky Spec Rail bei `top: 96px`. Scroll-gekoppelte Moves laufen rückwärts, zeitbasierte nicht.

**Umsetzungsfalle Headline-Decode:** der dekodierte Text muss der Komponente gehören, die ihn
anzeigt — State oder eigene Komponente. Teilt die Headline den Render-Zyklus mit dem Init-Log,
wird ihr Textknoten mitten im Scramble ersetzt und der Endzustand erscheint nie. Im Prototyp
ist das mit Start nach der Kaskade (1700ms) plus Neusetzen in `componentDidUpdate` umgangen;
**verbindlich bleiben die 640ms oben.**

**Zustände:** Scramble 220ms, Bracket-Expand 140ms, Glow 160ms, Row-Unhide 90ms,
Glitch-Burst ≤300ms mit 600ms Sperre, Fokusring 0ms.

### Wichtiger technischer Befund: `animation-timeline`

Die lauffähige Scroll-Referenz nutzt `animation-timeline: view()`. Recherchierter
Support-Stand (Stand 15.08.2026, Quellen in Abschnitt 13):

- Chrome und Edge 115+ (seit 18.07.2023), Chrome Android 115+, Opera 101+
- Safari 26 und Safari iOS 26 (seit 15.09.2025)
- **Firefox: nicht unterstützt**, nur hinter dem Flag `layout.css.scroll-driven-animations.enabled`
- Baseline-Status: „Limited availability" — durch Firefox seit September 2025 blockiert
- Teil von Interop 2026; laut Web-Platform-Explorer rund 4.7 % der Seitenaufrufe nutzen es

**Konsequenz für die Umsetzung:** nicht ohne Fallback einsetzen. Nicht unterstützende Browser
ignorieren die Eigenschaft; mit `animation-fill-mode: both` bleibt das Element im Endzustand.
Deshalb: Endzustand als Default definieren und die Animation in `@supports` kapseln.

```css
.reveal { opacity: 1; clip-path: inset(0); }         /* Default = Endzustand */
@supports (animation-timeline: view()) {
  .reveal { animation: wipe linear both; animation-timeline: view();
            animation-range: entry 12% entry 60%; }
}
```

Für den Pin in SYS.02 (das eine große Moment) reicht das nicht — dort in Firefox entweder
`position: sticky` plus `IntersectionObserver` als Ersatz oder die statische Liste anzeigen.
Die statische Variante ist dokumentiert: unter 900px ist genau das das Verhalten.

`prefers-reduced-motion: reduce` schaltet alle Animationen ab und zeigt Endzustände sofort;
in den Entwürfen ist die Regel bereits enthalten.

## 8. Komponenten-Inventar

| Komponente | Ort | Zustände | Hinweise |
|---|---|---|---|
| TopNav | alle Seiten | rest, hover (Scramble), focus, aktiv | Mobile: Hamburger |
| Terminal | Homepage | rest, hover, focus (Caret blinkt), degraded (read-only) | Befehle: `help whoami stack projects work blog about contact clear` + ein undokumentiertes `matrix` |
| ContributionGraph | Homepage Hero | loading (Skeleton), ok, error (Cache), no-data | 53 Wochen × 7 Tage, 5 Stufen |
| SkillRow (SYS.01) | Homepage | rest 28 %, hover 100 % + Beleg | Zustände CORE / APPLIED / LEARNING / QUEUED — abgeleitet aus Projektbelegen, keine Prozente |
| SystemRow (SYS.02) | Homepage, Work | rest, hover (Brackets + Preview), aktiv, disabled (queued) | Im Pin schaltet der aktive Index |
| MetricTile | Work, Case Study | loading, ok, no-data | `tabular-nums`, Label wird bei Hover präziser |
| FilterChip | Work, Blog | rest, hover, focus, gesetzt (invertiert), leer (0 Treffer) | Gesetzt zeigt `×` |
| SpecRail | Case Study | sticky, gelöst | `top: 96px`, keine Bewegung |
| PostCard | Blog | rest, hover | Lesemaß 68 Zeichen im Post |
| TrajectoryRail | About | Jahr aktiv, Jahr inaktiv, Tastatur ← → | Der große Moment der Seite |
| CTA (E-Mail) | Homepage, About | rest, hover (Glow), focus, active | Nur dieses Element glüht |
| ContactForm | Contact | rest, fokus, feldfehler, sending, accepted (202 + id), failed (502/429) | Client Component; TX-Spur spiegelt den Request; leert sich nach Erfolg **nicht** |
| ErrorBudgetGame | 404 | idle, running, paged | `<canvas>`, vier Spuren (API, DB, QUEUE, CACHE); A S D F oder Pfeiltasten, Pointer pro Spur; Trefferfenster ±10 % um den Handler-Balken; HUD zeichnet SERVED, live gerechnetes p95, Uptime und fünf Kästchen Error-Budget; Ende ist `PAGED` mit Incident-Zusammenfassung. Startet nie von selbst und blockiert nichts |
| OperationGrid | Homepage SYS.03 (30 Tage, reine Anzeige) · jede Case Study (91 Tage = 13 Wochen, Kerben anklickbar; in der Vorlage als Pflicht-Slot verankert) | ok · degraded · outage · nodata · selected | Zelle 15px + 4px Lücke, auf Touch 44px-Hülle. Kerbe nur mit Post-Mortem. Kennzahlen aus `days`/`deploys` gerechnet |
| StatusDot | global | live (Puls), degraded (statisch amber), offline | 2.6s Puls |

## 9. Datenverträge

### 9.0 Quellcode-Zugang je System

Jedes System trägt neben Stack und Zustand ein Feld für den Zugang zum Code. Es ist eine
eigene Achse, nicht Teil von `state` — `state` beschreibt den Betrieb, `source` den Beleg.

```json
{
  "source": {
    "access": "public",
    "url": "https://github.com/G1NG4R/timseil-dev"
  }
}
```

| Feld | Werte | Regel |
| --- | --- | --- |
| `access` | `public` · `private` | bei `public` ist `url` Pflicht |
| `url` | Repo-URL | nur bei `public`; wird zum Link auf der Zeile |
| `reason` | `nda` · `internal` | nur bei `private`, Pflicht — ohne Grund wird das Merkmal weggelassen |

Anzeige: `<> PUBLIC · github.com/…` als Link, `<> PRIVATE · NDA` als reiner Text. Der Ort ist
die Systemzeile neben dem Stack (Startseite und Work Index, Desktop und Mobil) und die
Spec-Rail der Fallstudie. **Kein Filter** — bei zwei Systemen filtert er von zwei auf zwei;
er lohnt ab etwa sechs Projekten.

Geschlossene Projekte bekommen dieselbe Fallstudien-Vorlage. Was dort fehlt, ist der Code;
was sie trägt, sind Architektur, Zahlen und Entscheidungen. Das Betriebsraster bleibt, wenn
echte Werte vorliegen.

### 9.1 Eigene Ops-Metriken

Entscheidung: **echter Endpoint**, wird selbst gebaut.

Erwartete Form (Vorschlag, weil der Endpoint noch nicht existiert):

```jsonc
// GET /api/health  → 200, Cache-Control: s-maxage=60, stale-while-revalidate=600
{
  "generatedAt": "2026-08-16T09:14:02Z",
  "systems": [
    { "slug": "timseil.dev", "state": "live",
      "uptime90d": 99.64, "p95Ms": 142, "errorRate": 0.0007,
      "lastDeploy": { "sha": "a41f9c2", "durationSec": 42, "at": "2026-08-14T09:11:00Z" } }
  ]
}
```

Regeln aus dem Entwurf: `state` ist die einzige Quelle für Zustandsanzeige. Metriken werden
**nur für Systeme mit `state: "live"` gerendert**. Fehlt ein Feld, zeigt das Tile `— NO DATA`,
nicht 0. Bei 5xx oder Timeout zeigt die Seite den letzten gültigen Wert plus Zeitstempel und
den Retry-Zähler (siehe ERROR-Panel in Referenzblatt 03); Zahlen erfinden ist ausgeschlossen.

### 9.2 Contribution-Graph

Entscheidung: **GitHub-API live, serverseitig gecacht.**

Recherchiert: Die **REST-API liefert den Contribution-Kalender nicht**. Der Weg ist die
**GraphQL-API** über `POST https://api.github.com/graphql` mit
`contributionsCollection { contributionCalendar { … } }`:

```graphql
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel color } }
      }
    }
  }
}
```

- Authentifizierung mit Personal Access Token, Scope `read:user`
- Token **niemals** an den Client geben — Aufruf in einer Server Component, Route Handler
  oder im Build; Variable ohne `NEXT_PUBLIC_`-Prefix
- `contributionLevel` liefert `NONE … FOURTH_QUARTILE`, passt 1:1 auf die 5 Stufen des Entwurfs;
  die von GitHub gelieferten `color`-Werte **nicht** verwenden — der Entwurf hat eigene
  (`rgba(0,229,255,…)` in 5 Stufen plus `rgba(232,238,244,.05)` für null)
- Serverseitig cachen (Vorschlag: `revalidate: 3600`), damit das Rate-Limit nicht am Traffic hängt
- Fällt der Abruf aus: Cache anzeigen und als „aus cache, N h alt" kennzeichnen (DEGRADED-Panel)

Im Entwurf steht am Graph noch `SOURCE: GITHUB API · [PLACEHOLDER DATA]` — die dort gezeigten
Werte sind deterministisch generiert, nicht echt. Beim Anschluss an die API entfällt der Hinweis.

### 9.3 Kontaktformular

Entscheidung: **echtes Formular statt `mailto:`.** Grund: ein `mailto:`-Link scheitert stumm auf
jedem Gerät ohne eingerichtetes Mailprogramm — Firmenlaptop, Windows mit Chrome, Handy mit
Gmail im Browser. Das ist der einzige Konversionspunkt der Seite.

```jsonc
// POST /api/contact
{
  "name":    "string  2–80",
  "email":   "string  ≤254, RFC-Form",
  "message": "string  20–4000",
  "company": "string  MUSS leer sein (Honeypot)",
  "dwellMs": "number  ≥3000",
  "ts":      "string  ISO 8601"
}
// 202 { "ok": true, "id": "msg_01K3F9QX7A" }
// 400 { "errors": { "email": "invalid" } }
// 429 { "retryAfter": 600 }   + Header Retry-After
// 502 { "code": "provider_unavailable" }
```

Regeln aus dem Entwurf: Validierung erst beim Absenden, dann pro Feld mit eigenem Wortlaut;
Timeout clientseitig 8s; Idempotenz über `ts` + `email` + Hash der Nachricht. Nach Erfolg
bleibt der Text im Feld stehen — die Message-ID ist der Beleg, den der Absender zitieren kann.
Im Fehlerfall stehen Code, Versuchszähler und die Adresse als Ausweg da; der Text geht nie verloren.

**Spam:** Honeypot-Feld `company` (per CSS versteckt, nie `display:none` auf dem Label),
Verweildauer unter 3s wird verworfen ohne Rückmeldung, Rate-Limit 3 Anfragen pro IP in
10 Minuten. Kein CAPTCHA.

**Zustellbarkeit ist die eigentliche Arbeit, nicht das Formular.** Versand über einen
Mail-Provider, SPF- und DKIM-Einträge auf der Domain, `Reply-To` auf die Absenderadresse.
Direktversand vom eigenen Server landet zuverlässig im Spam-Ordner.

**Die Kontaktadresse liegt auf der eigenen Domain: `contact@timseil.dev`** (geändert am
16.08.2026, vorher eine Fremddomain). Daraus folgt Arbeit im DNS, die vorher nicht nötig war:

| Eintrag | Wofür | Anmerkung |
| --- | --- | --- |
| `MX` | Empfang — das Postfach für `contact@timseil.dev` | Postfach-Provider frei wählbar, getrennt vom Versand |
| `SPF` (TXT) | erlaubt dem Versand-Provider, für die Domain zu senden | ein einziger `v=spf1`-Eintrag, sonst schlägt die Prüfung fehl |
| `DKIM` (TXT) | Signatur des Versand-Providers | Selector vom Provider, Schlüssel nicht selbst erfinden |
| `DMARC` (TXT) | Regel für Fälschungen, plus Berichte | mit `p=none` starten, nach zwei Wochen Berichten verschärfen |

Der Proxy-Verzicht im Anfrageweg bleibt davon unberührt — Mail-Records liegen im DNS, nicht im
Anfrageweg der Seite. Wichtig ist die Reihenfolge: **Records vor dem ersten echten Formular-Test**,
sonst landen die ersten Nachrichten im Spam und die Domain sammelt gleich zu Beginn eine
schlechte Reputation.

### 9.4 Trainings-Log (`/api/training`)

Der Log ist der Kern der Seite (Abschnitt 1b) und darf deshalb nicht im Markup stehen.

```ts
type TrackState = "core" | "applied" | "learning" | "queued";

type Track = {
  name: string;              // "CI/CD (GitHub Actions)"
  state: TrackState;
  evidence: {                // leer = "NO SYSTEM YET"
    systemId: string;        // "timseil.dev"
    systemNo: string;        // "02"
    detail?: string;         // "BUILD + DEPLOY"
  }[];
  note?: string;             // nur ohne Beleg: "SELF-STUDY"
};

type Module = { no: string; title: string; tracks: Track[] };  // 5 Module, 22 Tracks
```

Regeln, serverseitig durchsetzen — nicht im Frontend:

| Regel | Grund |
| --- | --- |
| `state` aus `evidence.length` ableiten: 0 → `learning` oder `queued`, 1 → `applied`, ≥2 → `core` | sonst driftet die Anzeige von der Wahrheit ab |
| Balkensegmente aus `state`, nie separat gesetzt | Zustand und Balken müssen dasselbe sagen |
| `evidence.systemNo` gegen `/api/systems` prüfen | ein Beleg auf ein gelöschtes System ist der Fehler, der diese Seite wertlos macht |
| Kopfzeile `EVIDENCE: n SYSTEMS` = Anzahl distinkter belegender Systeme | heute 01 |

### 9.5 Betriebsraster (`/api/health`, pro System)

Der Baustein `Operation Grid - timseil.dev.dc.html` zeigt Betrieb statt Aktivität: eine Zelle
je Tag, eine Kerbe je Vorfall, ein Balken je Deploy. Er tritt **neben** den Contribution-Graph,
ersetzt ihn nicht — der Graph misst Aktivität, das Raster Betrieb.

```ts
type DayState = "ok" | "degraded" | "outage" | "nodata";

type SystemOps = {
  slug: string;                 // "timseil.dev"
  state: "live" | "in_build" | "queued";
  days?:      { d: string; state: DayState; downSec: number; incidentId?: string }[];
  incidents?: { id: string; startedAt: string; durationSec: number;
                cause: string; fix: string; postSlug: string }[];
  deploys?:   { sha: string; durationSec: number; result: "ok" | "rollback" }[];
};
```

| Regel | Grund |
| --- | --- |
| `days`/`incidents`/`deploys` hängen **am System**, nicht am Endpoint | derselbe Baustein läuft auf der Startseite (30 Tage, die Seite selbst) und in jeder Fallstudie (91 Tage, ihr System) |
| Nur `state: "live"` liefert die drei Felder | ein `queued` System hat keinen Betrieb; es rendert `— NO DATA` statt 100 % |
| Ein Tag ohne Messung ist `nodata`, nie 100 % | eine Lücke als Lücke zeigen ist die Aussage der Seite |
| Jeder Vorfall braucht `cause`, `fix` und `postSlug` | **ohne Post-Mortem keine Kerbe** — sonst ist es eine rote Zelle ohne Erklärung |
| Uptime, MTTR, Rollback-Rate werden aus `days`/`deploys` gerechnet | getippte Kennzahlen laufen von den Daten weg |
| Keine Flottenansicht über alle Systeme vor zwei laufenden Systemen | eine Zeile ist kein Dashboard |
| **Das Fenster ist 91 Tage, nicht 90** | ein Raster mit sieben Reihen fasst nur Vielfache von sieben: 13 Wochen × 7 = 91. Kopfzeile, Uptime-Kachel, Prop-Optionen (`91`/`182`) und die Beschriftung in beiden Fallstudien nennen dieselbe Zahl, damit sie nachzählbar bleibt |
| Startseite: 30 Tage einreihig | der Streifen dort hängt nicht am Sieben-Raster und ist reine Anzeige — die anklickbaren Kerben liegen in der Fallstudie |

**Startzustand:** die Startseite trägt den 30-Tage-Streifen ab Tag 1 vollständig als `nodata`,
mit einer Zeile, die sagt, dass er sich pro Betriebstag füllt. Ab 30 Tagen wächst er auf 91.

**Wo der Baustein steht — und in welcher Ausführung:**

| Ort | Fenster | Ausführung |
| --- | --- | --- |
| Homepage `SYS.03`, unter dem Contribution-Graph | 30 Tage, einreihig | reine Anzeige, keine Klickziele. Der Graph misst Aktivität, der Streifen Betrieb — die Sektion nennt für jeden Block seine Quelle |
| `Case Study 02` (timseil.dev) | 91 Tage Desktop, 30 mobil | Kerben anklickbar: Dauer, Error-Budget, Ursache, Behebung, Log-Eintrag |
| `Case Study Template` | 91 Tage Desktop, 30 mobil | Pflicht-Slot in `.04 OPERATIONS` — jede neue Projektseite führt ihn |
| `Operation Grid` (Blatt) | 91 / 182 Tage | die lauffähige Spezifikation mit Deploy-Streifen, gerechneten Kennzahlen und Tag-1-Zustand |

Keine weitere Seite erhält den Baustein. Work Index zeigt pro System eine Betriebszahl, kein
Raster; Blog, About, Contact, Legal und 404 haben keinen Betriebsbezug.

## 10. State Management

Serverseitig, kein Client-State: Contribution-Kalender, Ops-Metriken, Inhalte.

Clientseitig, pro Komponente lokal:

| Komponente | State |
|---|---|
| Terminal | `lines[]`, `focused`, History-Index |
| Work-Filter | `activeStacks: Set`, `activeStates: Set`, `hoveredSlug` |
| Blog | `query`, `activeTags: Set` |
| TrajectoryRail | `activeYear` |
| Boot | `booted` in `sessionStorage`, `phase` |
| SYS.02-Pin | `activeIndex`, aus Scroll-Fortschritt abgeleitet |
| Privacy-Telemetrie | ausgelesene Browser-Werte, nur lokal, nie gesendet |
| ContactForm | `name`, `email`, `message`, `phase`, `errors`, `log[]`, Mount-Zeit für `dwellMs` |
| ThemeSwitch | Aktives Theme aus `document.documentElement.dataset.theme`, persistiert in `localStorage["ts.theme"]`. Kein React-Context nötig — ein Attribut am html-Element genügt |
| ErrorBudgetGame | Spielzustand liegt in Instanzfeldern, nicht im React-State (rAF-Loop, kein Re-Render pro Frame). Persistiert wird ausschließlich der Bestwert: `localStorage["ts404.best"]`, ein Schlüssel, sonst nichts |

Globaler State ist nicht nötig.

## 11. Accessibility

- **Kontrast:** alle Textfarben erreichen AA (Werte in Abschnitt 6). Die 28-%-Ruhezustände
  der Skill-Zeilen sind **dekorativ gedimmt** — der Text muss auch dort AA erfüllen oder
  darf keine tragende Information sein. Im Entwurf steht die Information zusätzlich als
  Zustandswort (CORE/APPLIED/…), nicht nur als Deckkraft.
- **Fokus:** `outline: 1px solid #00E5FF; outline-offset: 3px`, nur `:focus-visible`,
  überall dieselbe Form. Skip-Link „→ zum Inhalt" zuerst in der Tab-Reihenfolge.
- **Tab-Reihenfolge:** Leserichtung, Terminal zuletzt.
- **Terminal:** Eingabe braucht ein `aria-label`, Ausgabe eine `aria-live="polite"`-Region.
- **Zustände nie nur über Farbe:** jeder Zustand hat ein zweites Merkmal
  (Ecken, Rahmen, Unterstrich, Wortlaut).
- **Touch:** kein Hover. Auf Mobil ist der Hover-Zustand der Ruhezustand — Previews sichtbar,
  Zeilen bei 100 %, Terminal read-only mit sichtbarer Befehlsliste. Trefferflächen ≥ 44px.
- **Reduced Motion:** siehe Abschnitt 7.
- **Formular:** jedes Feld mit `<label for>` verbunden, Fehlermeldung über `aria-describedby`
  am Feld, `aria-invalid` gesetzt; der Sendestatus in einer `aria-live="polite"`-Region;
  nach fehlgeschlagener Prüfung Fokus auf das erste Fehlerfeld. Der Honeypot bekommt
  `aria-hidden="true"` und `tabindex="-1"`.
- **Theme-Wahl:** `role="radiogroup"` mit `aria-label="Farbschema"`, jeder Knopf mit
  `aria-label` (Theme-Name) und `aria-checked`. Die Auswahl ist nicht nur Farbe: der aktive
  Knopf trägt volle Deckkraft **und** den Rahmen in Akzentfarbe. Tastaturbedienbar.
- **CV auf Touch:** der Fußzeilen-Link ist im Entwurf ein `span[tabindex=0][role=link]` mit
  `aria-label`; im Build ein echtes `<a href="/cv.pdf" download>`. Trefferfläche ≥ 44px über
  Innenabstand mit negativem Außenabstand, damit die Fußzeile ihre Höhe behält. Mono 9 ist die
  Untergrenze — darunter trägt kein Element Inhalt.
- **Mini-Spiel (404):** das Canvas ist fokussierbar (`tabindex="0"`, `role="application"`,
  `aria-label`) und per Tastatur spielbar. Im Build zusätzlich nötig: das Ergebnis nach
  `PAGED` in einer `aria-live="polite"`-Region als Text ausgeben, damit der Zustand nicht nur
  im Canvas steht. Das Spiel ist reine Zugabe — kein Inhalt und kein Ausgang hängt daran, und
  bei `prefers-reduced-motion` startet es nur auf ausdrückliche Eingabe.
- `<html lang="en">` — die Seiteninhalte sind englisch (die Kommentare in den Entwürfen deutsch).

## 12. Offene Punkte

### Bestätigt

| Punkt | Wert |
|---|---|
| E-Mail | `contact@timseil.dev` (in allen Entwürfen eingesetzt) |
| GitHub | `github.com/G1NG4R` |
| Ops-Metriken | eigener `/health`-Endpoint, wird gebaut |
| Contribution-Graph | GitHub-API live, serverseitig gecacht |
| Zielumgebung | Next.js / React |
| Trajectory-Daten | 2023 Python · 2024 erster Server gemietet |
| Kontaktkanal | echtes Formular auf `/contact`, `mailto:` bleibt als sichtbarer Ausweg |

### Offen — nicht raten

| Punkt | Status |
|---|---|
| LinkedIn | existiert noch nicht. Slot bleibt, steht auf `[FOLGT]`. Zeile erst rendern, wenn eine URL existiert — kein toter Link. |
| X / Twitter | Slot steht neben LinkedIn auf Homepage und About (Desktop und Mobil) sowie im Terminal-Befehl `contact`, Wert `[FOLGT]`. Gleiche Regel: Zeile erst rendern, wenn ein Handle existiert — ein Sozialprofil ohne Inhalt schadet mehr als ein fehlendes. |
| Verfügbarkeits-Zeile | **vorläufig von mir gesetzt:** „Open to backend and infrastructure work". Ersetzen, sobald die Situation konkret ist. |
| Off-System-Absatz (About) | offen, steht als `[KURZER PERSÖNLICHER ABSATZ]` |
| Trajectory 2025/2026 | offen — aktuell nur zwei belegte Jahre |
| Blog-Einträge | noch keine. Erster echter Eintrag ist der Bau dieser Seite. |
| Kein Repository verbunden | Projekt startet von Null |
| Theme-System | entschieden: sieben Paletten über `data-theme`, Standard nach `prefers-color-scheme`, Wahl in `localStorage`, Bedienung in der Fußzeile — in der Datenschutzseite unter 07.04 dokumentiert |
| CV | einseitig A4, helles Theme, Nachweis-Spalte. **Keine CV-Seite und kein Download-Knopf:** der Terminal-Befehl `cv` lädt die Datei direkt; About, 404 und jede Fußzeile nennen diesen Weg. Offen: Telefon, 2025 in der Trajektorie, zwei Ausbildungszeilen, Sprachen, Arbeitserlaubnis, Verfügbarkeit, gesuchte Rolle — dazu Größe, sha256 und Stand beim Build |
| Aufbewahrungsfristen | entschieden: Access-Logs 14 Tage, Anwendungslogs 7, Rate-Limit-IP 10 Minuten — in der Datenschutzseite eingesetzt |
| Mail-Provider | noch nicht gewählt. Ohne Provider plus SPF/DKIM ist das Formular gebaut, aber nicht zustellbar. **Neu seit 16.08.:** die Adresse liegt auf `timseil.dev`, also brauchen auch `MX` und `DMARC` einen Wert (Details in 9.3). |
| Datenschutz-Absatz zum Formular | fehlt noch. Die Seite behauptet aktuell, praktisch keine personenbezogenen Daten zu verarbeiten — mit dem Formular stimmt das nicht mehr (Name, E-Mail, Nachricht, Zeitpunkt, IP fürs Rate-Limit, Provider als Auftragsverarbeiter). |

### Risiko, entschieden und umgesetzt (16.08.2026)

Frühere Entwürfe zeigten fünf Systeme, davon `vat-check` als **LIVE** mit Uptime, p95 und Error
Rate, und SYS.01 leitete Skill-Zustände aus diesen Projekten ab. **Diese Systeme existieren
nicht.** Erledigt: die Entwürfe führen jetzt genau zwei Systeme — `01 vat-check ○ QUEUED` ohne
Metriken und `02 timseil.dev ● LIVE` —, die drei nicht existierenden sind entfernt, der
Trainings-Log belegt nur aus timseil.dev. Würde die Seite so live gehen, behauptet sie Betriebserfahrung, die nicht
belegt ist — genau das Gegenteil ihrer eigenen Idee, und für Hiring Manager sofort prüfbar
(die Repos wären leer, die Endpoints tot).

Der Weg, der die Idee intakt hält: **timseil.dev ist das erste echte System.** Die Seite läuft
auf dem eigenen Stack, hat einen echten Deploy, echte Uptime und einen echten p95. Damit trägt
`SYS.02` beim Start genau einen Eintrag mit `state: "live"` — sich selbst — und die anderen vier
stehen sichtbar auf `PLANNED` oder `IN BUILD`, ohne Metriken. SYS.01 zeigt dann die Skills, die
diese Seite belegt (Go oder TypeScript, Docker, CI/CD, Linux, Caching), und der Rest steht auf
`LEARNING` oder `QUEUED`.

Das ist keine Design-Änderung: die Zustände, das DISABLED-Muster für `queued` und das
`— NO DATA`-Tile sind bereits Teil des Systems (Referenzblatt 03). Es ist eine
Inhaltsentscheidung, die vor dem Livegang fällt.

### Konsistenzlauf (16.08.2026)

Die elf Seiten sind über viele Runden entstanden und drifteten auseinander. Ein Prüflauf über
11 Seiten × 9 Achsen (`Consistency Check`) fand 18 Abweichungen, davon drei kritische. Alle
Muster, die in jeder Seite stecken, sind seither vereinheitlicht:

| Was | Vorher | Jetzt |
| --- | --- | --- |
| Mobile Navigation | vier Einträge à 10px nebeneinander, Trefferhöhe ~14px | ein Knopf 44 × 44, Navigation im Vollbild-Menü (`Chrome`) |
| Trefferflächen | ein Element pro Seite mit 44px | jedes Touch-Ziel ab 44 × 44, Theme-Kacheln 44 × 44 |
| Aktiv-Zustand | drei Muster, Startseite hob WORK hervor | ein Muster: aktiv weiß, Cyan bleibt Hover und Aktion, auf `/` nichts aktiv |
| Kopfzeile | zwei Seiten mit eigener Leiste ohne Logo | ein Bauteil: 66px Desktop, 52px Mobil, Logo, vier Einträge, `EN ▾`, Uhr |
| Fußzeile | Kontaktblock auf sieben Seiten unvollständig, Rechtslinks auf drei | zwei Fassungen (lang/kurz), Meta-Leiste und Rechtslinks überall |
| Überschriften | 64 · 62 · 56 · 52 · 50, mobil 36 · 34 · 32 · 30 | zwei Stufen: 62 Startseite und About, 52 sonst, mobil 34 |
| Sprachumschalter | auf keiner Seite | `EN ▾` im Kopf jeder Seite, `/de · /fr` in jeder Meta-Leiste |
| Statuspunkt | auf zwei Seiten | Meta-Leiste jeder Seite, groß im Hero nur auf der Startseite |
| Koordinaten | zwei Formate parallel | `49.6117° N · 6.1300° E` |
| Platzhalter | `[FOLGT]`, `[PLACEHOLDER DATA]`, `[DATE]`, deutsche und englische gemischt | drei englische Klassen: `[SOON]`, `[PLACEHOLDER]`, `[ASSET]` |
| Leerzustände | Blog ohne Zustand für „noch kein Eintrag“ | zwei im Index, einer im Beitrag — Wortlaut nach Referenzblatt 03 |
| Navigation | „BLOG“ im Menü gegen „SYS.04 LOG“ auf der Startseite | überall **LOG** — die Route bleibt `/blog` (Konvention, wird geteilt), die Beschriftung folgt der Stimme der Seite |
| Abschnittsfolge | nirgends festgehalten — eine Kopie geriet in die Reihenfolge 02 · 01 · 03 · 04 | in HOME.01 verbindlich: Hero → SYS.01 → 02 → 03 → 04 → Fuß, Kopien folgen der Quelle |
| Trefferflächen | erste Prüfung zählte nur `min-height:44px` — Chips mit Padding-Höhe fielen durch das Raster | jedes klickbare Element in den 390er-Rahmen nachgemessen; 17 Chips und 14 Kleinziele angehoben. Regel: messen, nicht greppen |
| Statuswörter | `ONLINE` stand im Hero (Verfügbarkeit der Person) und in der Meta-Leiste (Auslieferung der Seite) | `AVAILABLE` im Hero, `ONLINE` in der Meta-Leiste — beide in STATE.05 definiert und abgegrenzt |
| Zustands-Vokabular | `QUEUED` und `ONLINE` nirgends definiert | Nachtrag STATE.05 mit Bedeutung, Abgrenzung, Einsatzort |
| Zwischenbreiten | nur „fließen, nicht umbauen" — nachgerechnet bricht die Spec-Rail bei 1077, der Hero bei 1012 | neuer Schalter **1080**, hergeleitet aus neun Bauteilen; zwei annotierte Rahmen bei 1024; Prüfprotokoll auf sieben Breiten (LAYOUT.03) |
| Betriebsraster mobil | Regel „< 560 scrollt waagerecht" zeigte auf ein 243px breites Bauteil | Regel umgehängt auf Deploy-Streifen und Ops-Kacheln; das Raster bleibt unangetastet |

**Bewusst nicht geändert:** die deutschen Erklärabsätze in der englischen Oberfläche
(Startseite, Fallstudie 02, About, 404). Sie bleiben, bis der Sprachumschalter sie ablöst —
eine Übersetzung jetzt wäre Arbeit, die der Umschalter ohnehin ersetzt.

**Der Umschalter ist gebaut, aber leer:** er steht auf jeder Seite und ist im
`Language Switcher`-Blatt vollständig spezifiziert (Übersetzungsmatrix, Routen, Regeln,
Tastaturbedienung). Die Textquellen für DE und FR entstehen beim Umsetzen.

## 13. Quellen

Alle technischen Aussagen in diesem Dokument sind geprüft, nicht angenommen.
Abgerufen am 15.08.2026.

**Scroll-driven Animations / `animation-timeline: view()`**
- MDN, `animation-timeline` und `view()` — Baseline-Status „Limited availability",
  Stand der Seite 22.04.2026
- Web Platform Features Explorer, „Scroll-driven animations" — Chrome/Edge 115 (18.07.2023),
  Safari 26 (15.09.2025), Firefox nicht unterstützt, Baseline blockiert seit September 2025,
  Interop 2026, ~4.7 % der Seitenaufrufe
- rebeccamdeprey.com, 22.03.2026 — Firefox-Flag `layout.css.scroll-driven-animations.enabled`,
  Fallback-Verhalten und `@supports`-Muster

**GitHub Contribution-Kalender**
- GitHub Community Discussion #77967 — Struktur von `contributionsCollection`
- Praxisbeschreibungen mit vollständiger Query und Token-Scope `read:user`
  (heilcheng.github.io 07.07.2025, williamcallahan.com 22.05.2025, larocque.dev)
- Übereinstimmender Befund mehrerer Quellen: die REST-API liefert diese Daten nicht

**Fonts**
- Google Fonts: Geist (von Vercel, variabel 100–900, OFL), Chakra Petch, JetBrains Mono
- vercel.com/font, fontpair.co, fontsource.org — Lizenz OFL, Achsen und Gewichte

**Next.js**
- eosl.date/nextjs — 16.3.0 LTS am 06.08.2026, Next.js 15 End of Support 21.10.2026
- nextjs.org/blog und nextjs.org/support-policy — LTS-Modell, 16.x aktuelle Linie
- nextjs.org Upgrade-Guide v16 — React Compiler seit 16 stabil, nicht standardmäßig aktiv

**Dokploy und Betrieb**
- docs.dokploy.com — Traefik als Reverse Proxy, automatisches HTTPS über Let's Encrypt,
  Webhook-URL pro Dienst für Auto-Deploys, Container- und Server-Metriken im Panel,
  geplante Backups nach S3-kompatiblen Zielen, Traefik-Konfiguration im Panel editierbar
- Drei Erfahrungsberichte (segar.me 21.01.2026, 1vps.com 12.02.2026, mzunino.com.uy 03/2025)
  für die fünf Stolpersteine: `dokploy-network` plus `traefik.docker.network`-Label,
  expliziter Container-Port, relative `../files`-Mounts, `acme.json` mit 600,
  verwaiste Container mit Traefik-Labels

**Kontrastwerte** in Abschnitt 6 habe ich aus den Hex-Werten der Entwürfe nach
WCAG 2.1 berechnet, nicht aus einer Quelle übernommen.
