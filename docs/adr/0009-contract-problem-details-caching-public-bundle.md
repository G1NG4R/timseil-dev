# ADR 0009 — Der Contract: Problem Details, Cache-Header und die gefilterte öffentliche Fassung

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** B1, C1–C7, E2, G4, H8, L3, L4
**Invarianten:** 1 (`null` → `— NO DATA`), 3 (Metriken nur für `live`), 7 (91 Tage)

## Kontext

`contract/openapi.yaml` entsteht in B1 und ist ab Launch öffentlich. ADR 0004 hält
fest, warum das die Nachprüfbarkeit trägt — und was es kostet: **eine Feldumbenennung
ist ab dem ersten Tag ein Breaking Change für jeden, der `curl` in ein Skript
geschrieben hat.**

Drei Fragen ließen der Build-Plan und der Design-Handoff offen oder beantworteten sie
widersprüchlich. Alle drei sind billig zu entscheiden, solange nichts implementiert
ist, und teuer danach.

## Entscheidung

### 1. RFC 9457 gilt ausnahmslos, auch für `/api/contact`

Jede Fehlerantwort ist `application/problem+json` mit `type`, `title`, `status`, dazu
`detail`, `instance` und zwei Erweiterungen: `requestId` (immer) und `invalidParams`
(nur bei `400`). Die `type`-URIs liegen unter `https://timseil.dev/problems/`:
`validation-failed` · `not-found` · `rate-limited` · `mail-provider-unavailable` ·
`unauthorized` · `internal-error`.

**Das weicht vom Design-Handoff ab.** Der zeigt für das Kontaktformular
`{"errors": {"email": "invalid"}}`, `{"retryAfter": 600}` und
`{"code": "provider_unavailable"}` — drei Sonderformate für einen Endpoint. Der
Build-Plan nennt RFC 9457 an zwei Stellen ohne Ausnahme.

Zwei Fehlerformate in einer API sind der Sonderfall, den später jemand übersieht:
der Client, der `problem.detail` liest, bekommt bei genau einem Pfad `undefined`.
`429` trägt zusätzlich den Standard-Header `Retry-After` — der gehört ohnehin dorthin.

Das **Request**-Payload bleibt unverändert. Die TX-Spur auf der Kontaktseite rendert
den ausgehenden Request live mit; hätte sich der geändert, wäre das eine
Design-Änderung gewesen. Betroffen ist nur die Fehleranzeige in H8, die künftig aus
`status` und `invalidParams` rendert.

`detail` trägt nie einen Stacktrace und nie einen Datenbank-Fehlertext. Der
Zusammenhang zum Log läuft über `requestId`, gespiegelt im Header `X-Request-Id`.

### 2. Cache-Header stehen im Contract, nicht im Handler

| Endpoints | `Cache-Control` |
|---|---|
| `/api/health` | `public, s-maxage=60, stale-while-revalidate=600` |
| `/api/systems`, `/{slug}`, `/api/training`, `/api/badge/*` | `public, s-maxage=300, stale-while-revalidate=1800` |
| `/api/contributions`, `/api/docs`, `/api/openapi.yaml` | `public, s-maxage=3600, stale-while-revalidate=7200` |
| `POST /api/contact`, `/api/internal/*` | `no-store` |

Die 60 Sekunden für `/api/health` und die 300 für das Betriebsraster stehen so im
Design-Handoff, die Stunde für den Contribution-Graph im Build-Plan (C5). Der Rest
ist daraus abgeleitet.

Jede öffentliche GET-Antwort trägt zusätzlich ein `ETag` und beantwortet
`If-None-Match` mit `304`. Ohne CDN (ADR 0006) ist `s-maxage` vor allem eine Angabe
für die Cache Components in Next.js (G4) — das `ETag` ist die Ersparnis, die
tatsächlich auf der Leitung ankommt.

### 3. Interne Pfade stehen im Contract und nicht in `/api/docs`

Zwei Anforderungen, die sich auf den ersten Blick ausschließen:

- E2 prüft **Parität zwischen OpenAPI und Router** — ein Endpoint, der existiert, muss
  im Contract stehen. Sonst wäre `/api/internal/*` dauerhaft ein Loch in der Prüfung.
- Anhang F verlangt, dass `/api/docs` **keine** internen Endpoints dokumentiert.

Aufgelöst mit einer Quelle und zwei Fassungen: die Operationen tragen
`x-internal: true`, und `make gen` erzeugt über den `filter-out`-Decorator von Redocly
`contract/openapi.public.yaml`. Die Generatoren lesen die **volle** Fassung (C7 braucht
die Typen), die Go-API bettet die **öffentliche** ein und liefert sie unter
`/api/openapi.yaml` aus.

Der Filter entfernt nicht nur Pfade, sondern auch die dann ungenutzten Komponenten —
`ProbeReport` und `DeployReport` würden sonst die Form der internen Nutzlast
veröffentlichen, ohne dass ein Pfad sichtbar wäre.

Das Abnahmekriterium ist ein Go-Test, kein Vorsatz: die **ausgelieferte** Fassung darf
die Zeichenketten `/api/internal`, `x-internal`, `internalToken`, `ProbeReport` und
`DeployReport` nicht enthalten.

### 4. `/api/docs` liefert Scalar aus dem Binary

Das Renderer-Bundle (`@scalar/api-reference`) liegt vendored und gzip-komprimiert im
Repo und wird per `go:embed` mitgeliefert. Zwei Standardwerte sind dabei ausgeschaltet:
ohne `withDefaultFonts: false` lädt es Schriften von `fonts.scalar.com`, ohne
`proxyUrl: ''` läuft „Try it" über `proxy.scalar.com`.

Ein `<script src="https://cdn…">` wäre eine Zeile weniger Arbeit gewesen — und hätte
ausgerechnet auf der Seite, die erklärt, dass niemand zwischen Browser und Server
steht, zwei Dritte in den Anfrageweg gestellt (ADR 0006, Legal-Seite mit
Live-Readout).

## Konsequenzen

- **H8** rendert Fehler aus `status` und `invalidParams` statt aus `errors` und `code`.
  Als Design-Korrektur im Backlog für K1.
- **C1** setzt `X-Request-Id` und trägt es in jede Problem-Antwort; **F1** findet damit
  beide Dienste zu einer Anfrage.
- **C2–C7** setzen die Cache-Header aus dem Contract, statt sie zu erfinden. Weicht ein
  Handler ab, ist das ein Contract-Fehler, keine Handler-Entscheidung.
- **L3** darf `/api/internal/*` blockieren, ohne dass die Dokumentation etwas verliert.
  Zieht der Probe-Pfad dort heraus, bleibt die `operationId` gleich — der Umzug ist
  dann kein Contract-Bruch.
- **L4** braucht für `/api/docs` eine CSP, die Scalars Inline-Styles zulässt. Ohne
  externe Quellen bleibt die Ausnahme auf `style-src` beschränkt.
- **D1**: das Bundle wächst das Image um rund ein Megabyte. Gzip statt Rohtext hält es
  von 3,7 MB auf 1,0 MB und damit im 20-MB-Budget.
- Das vendored Bundle wird von Dependabot nicht erfasst. Aktualisiert wird es von Hand;
  die Version steht im Kopfkommentar von `api/internal/httpx/docs.go`.

## Verworfene Alternativen

**Zwei handgepflegte Spec-Dateien** — die öffentliche wäre eine Kopie, und eine Kopie
ist genau das, was laut Kapitel 12.2 driftet. Nach der dritten Contract-Änderung wären
sie auseinander.

**Interne Endpoints gar nicht im Contract** — dann müssten die Typen für C7 von Hand
geschrieben werden, gegen die Regel „nie einen Typ von Hand schreiben, der im Contract
steht", und die Paritätsprüfung aus E2 hätte dauerhaft eine Ausnahme.

**Nur beim Rendern ausblenden (Scalar-Option)** — die Dokumentseite sähe sauber aus,
aber das Dokument selbst bliebe abrufbar. Verstecken ist kein Filtern.

**`nullable: true` statt `type: [number, "null"]`** — in OpenAPI 3.1 nicht mehr gültig.
Die Unions werden von `oapi-codegen` v2.8 zu `*float64` und von `openapi-typescript` zu
`number | null` aufgelöst; `format: double` ist nötig, sonst fällt in Go `*float32`
heraus.

**Scalar per CDN** — siehe Punkt 4.

## Belege

Systemhandbuch Kapitel 12 und 14, Anhang A und B · Build-Plan Zeile 1029 (B1),
Kapitel 12.2 und 12.4 · ADR 0004, ADR 0005, ADR 0006 ·
`docs/architecture/c4-container.md` (offene Frage zu `/api/internal/*`, Auflösung L3).
