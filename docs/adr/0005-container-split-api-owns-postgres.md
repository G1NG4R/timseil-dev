# ADR 0005 — Go besitzt die Daten, Next.js rendert

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** B1–B4, C1–C7, D1, D2, G4
**Invarianten:** 1, 2, 3 — alle drei leben auf der Go-Seite

## Kontext

Der Design-Handoff (Blatt `Handoff`, Abschnitt 4a) sah einen **Go-Container vor,
der Access-Logs parst**, während Next.js-Route-Handler die eigentlichen Daten
liefern — mit **SQLite** als Ablage.

Das erklärte Ziel der Seite ist, Backend- und Betriebsfähigkeit zu belegen. Ein
Log-Parser neben einem TypeScript-Backend belegt das Gegenteil: Datenmodell,
Ableitungen und Contract lägen in TypeScript, und der Go-Anteil wäre eine
Randnotiz.

## Entscheidung

**Der Schnitt läuft entlang der Datenhoheit:**

| Container | Verantwortung |
|---|---|
| **api** (Go) | Postgres, Datenmodell, Ableitungen, Contract, Validierung, Rate-Limit, Mail, Metrik-Snapshots |
| **web** (Next.js) | Seiten, Rendering, MDX-Blog. **Keine Datenlogik.** |
| **db** | PostgreSQL 18.6 — **kein SQLite** |

Next.js spricht mit der API über einen **generierten** Client (`web/lib/api/`),
dessen Typen aus `contract/openapi.yaml` stammen. Kein Typ, der im Contract
steht, wird von Hand geschrieben.

## Konsequenzen

- Die drei Zahleninvarianten haben genau einen Ort, an dem sie durchgesetzt
  werden. `*float64` in Go, `number | null` in TS — und der Übergang dazwischen
  ist generiert, nicht getippt.
- Der Contract ist die Grenze zwischen den Containern und damit prüfbar: E5
  hält OpenAPI und Router in Parität, Contract-Tests laufen beidseitig.
- Next.js braucht keine Datenbank-Zugangsdaten. Ein kompromittierter
  Web-Container kommt an keine Verbindung, nur an die API — die ohnehin
  öffentlich lesbar ist (ADR 0004).
- Postgres statt SQLite ist Voraussetzung für Invariante 2: die Ableitung lebt
  als View mit `FILTER`-Aggregaten (ADR 0003), und für die Belege gilt
  `ON DELETE RESTRICT`.
- **Der Handoff ist an dieser Stelle überholt.** Korrektur #3 aus Kapitel 7,
  Issue in A3, abgearbeitet in K1.

### Was das kostet

Vier Container statt zwei, zwei Sprachen statt einer, ein Contract-Schritt
zwischen jeder Änderung am Datenmodell und ihrer Anzeige. Ein Feld hinzufügen
heißt: Migration, Query, Contract, `make gen`, Handler, Komponente. Das ist
spürbar mehr Weg als ein Route Handler, der direkt `SELECT`t.

Der Weg ist der Punkt — aber er ist ehrlich zu benennen: bei einer Seite ohne
Beleganspruch wäre er nicht zu rechtfertigen.

## Verworfene Alternativen

**Next.js Route Handler mit direktem DB-Zugriff** — spart den Contract und
kostet die Nachprüfbarkeit: `curl` und Seite könnten auseinanderlaufen, und der
Go-Beleg entfiele.

**Go als reiner Log-Parser (der Handoff-Entwurf)** — siehe Kontext. Zusätzlich:
Dokploy trunkiert Container-Logs nächtlich, ein Parser müsste Offsets verwalten
und würde trotzdem Lücken produzieren. ADR 0007 löst dasselbe Problem sauberer.

**SQLite statt Postgres** — kein `FILTER`-Aggregat-Komfort, kein sauberer
Rollen-Split (`timseil_migrate` / `timseil_app`, Kapitel 11.3), und eine Datei
auf einer Platte, die ohnehin das knappe Gut ist. Der Betriebsbeleg wäre
schwächer, nicht schlanker.

## Belege

Build-Plan Kapitel 4.1, Kapitel 4.4, Kapitel 7 Korrektur #3, Kapitel 11.3,
Phase B1, Phase D2, Phase G4, Phase K1.
