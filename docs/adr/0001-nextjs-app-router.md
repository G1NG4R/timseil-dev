# ADR 0001 — Next.js 16 App Router statt React Router 7

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** G1–G7, alle H-Phasen, K1
**Invarianten:** 8 (Tokens), mittelbar 1 (`strictNullChecks` trägt `number | null`)

## Kontext

Der Design-Handoff vom 16.08.2026 nennt an vier Stellen **React Router 7** als
Framework: in der Spec-Rail der Fallstudie, in der Systemzeile der Homepage, im
Work Index und in der Ausgabe des Terminal-Befehls `stack`. Der Handoff ist
älter als die Stack-Entscheidungen dieses Plans.

Die Seite rendert überwiegend Inhalte, die aus einer eigenen API kommen und sich
selten ändern: Fallstudien, Blog, Betriebsraster. Was zählt, ist serverseitiges
Rendern mit engem JS-Budget, nicht Client-Routing.

## Entscheidung

**Next.js 16.3 LTS mit App Router.** Server Components sind der Default,
`'use client'` steht nur mit Begründungs-Kommentar. TypeScript `strict`.
React-Version bestimmt Next, nicht wir.

**Kein `middleware.ts`.** Next 16 hat die Datei durch **`proxy.ts`** ersetzt.
Das ist kein Detail: jedes Sprachmodell schreibt aus Gewohnheit `middleware.ts`,
und die Datei wird stillschweigend ignoriert — deshalb liegt ab G1 ein
`AGENTS.md` in `web/`, das die versionsgebundene Doku mitliefert.

## Konsequenzen

- 16.3 ist seit 03.08.2026 LTS mit monatlichen Security-Releases; Next 15 fällt
  am 21.10.2026 aus dem Support. Wir starten nicht auf einer Version, die vor
  dem Launch ausläuft.
- Routen sind in 16 typisiert — ein falscher Link bricht den Typecheck statt die
  Seite.
- MDX-Blog, Bildoptimierung und Metadata-API kommen aus dem Framework, nicht aus
  vier Bibliotheken (siehe ADR 0002).
- Der CSP-Nonce für das Theme-Snippet läuft in L4 über `proxy.ts`.
- **Die vier Nennungen von „React Router 7" in den Blättern sind falsch.** Sie
  sind Korrektur #1 aus Kapitel 7, als Issue angelegt in A3, abgearbeitet in K1.
  Kritisch, weil auf einer Seite über Prüfbarkeit eine falsche Stack-Angabe die
  These selbst beschädigt.

### Was das kostet

Next.js ist ein größeres Framework als React Router und bringt eigenes Verhalten
mit — Caching-Semantik, `output: 'standalone'` und dessen Fallen (D1: weder
`public/` noch `.next/static` liegen im Standalone-Ordner). Wir binden uns an
Vercels Release-Takt und an ein Container-Image mit Node-Laufzeit statt an ein
statisches Bundle. Der Wechsel auf ein anderes Framework wäre nach Stufe H teuer.

## Verworfene Alternativen

**React Router 7 (Framework-Modus)** — kann SSR, aber der Blog, die
Bildpipeline und die Metadata-Behandlung wären Eigenbau. Kein Gewinn, der die
Handarbeit trägt.

**Astro** — für eine Inhaltsseite stark, aber die Seite hat mit Terminal,
Boot-Sequenz und Scroll-Choreografie einen erheblichen interaktiven Anteil. Die
Insel-Architektur würde hier gegen uns arbeiten.

**Reines SPA hinter der Go-API** — bricht SEO und First Paint auf Mobilfunk,
und Constraint 04 der eigenen Fallstudie („fast on a phone on mobile data") ist
eine Zusage, keine Absichtserklärung.

## Belege

Build-Plan Kapitel 2.1 (Pin und Begründung), Kapitel 7 Korrektur #1,
Kapitel 8.2 (`AGENTS.md`), Phase G1, Phase K1.
