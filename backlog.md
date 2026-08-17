# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

**Letzte Triage: nach Stufe B, 17.08.2026.** 76 Zeilen → **25 Issues** (#22–#46),
**6 verworfen mit Begründung** ([#47](https://github.com/G1NG4R/timseil-dev/issues/47),
geschlossen), **40 erledigt**. Die Verwerfungen stehen dort mit ihrem Grund, damit
keine davon in vier Monaten neu durchdacht wird.

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Wann |
|---|---|---|---|
| 2026-08-17 | C1 | Generierten Router (`httpx.HandlerWithOptions`) montieren und `RegisterDocs` dabei in den Strict-Handler falten. Bis dahin registriert `internal/server` von Hand — Begründung in ADR 0016. | C7 |
| 2026-08-17 | C1 | `SHUTDOWN_DELAY`: eine Vorlaufzeit zwischen „`/readyz` sagt 503" und „Listener schließt", damit Traefik die Instanz aus dem Pool nimmt, bevor sie aufhört anzunehmen. Ohne Proxy davor heute wirkungslos. | E5 |
| 2026-08-17 | C1 | Healthcheck im Produktions-Compose: `wget` gibt es nur im Alpine-Dev-Image, `distroless` hat keine Shell. Braucht einen Selbsttest im Binary (`api -healthcheck`) oder ein anderes Mittel. | D1/D2 |
| 2026-08-17 | C1 | Im Dockerfile **kein** `COPY go.mod go.sum` + `go mod download` voranstellen: das zieht den ganzen Tool-Graphen (sqlc, oapi-codegen — 65 indirekte Module) in eine Image-Schicht. `go build ./cmd/api` lädt nur, was es braucht. ADR 0016. | D1 |
| 2026-08-17 | C1 | Dependabot für `gomod`: Verhalten für **indirekte** Tool-Abhängigkeiten festlegen, bevor die erste PR-Welle kommt. 41 der 65 indirekten Zeilen gehören sqlc und erreichen das Binary nicht. | E2 |

## Gefunden — Bug oder Unklarheit

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-08-17 | C1 | `httpx.MatchesETag` ersetzt einen `strings.Contains`-Vergleich, der `If-None-Match: *` nicht beantwortete und auf jeden Tag passte, der unseren enthielt. Betraf die drei Doku-Routen seit B1. | behoben |
| 2026-08-17 | C1 | `make check-db` braucht `-p 1`: seit `internal/store` db-getaggte Tests hat, wollen zwei Pakete dieselbe Testdatenbank gleichzeitig, und der Verlierer meldet „relation already exists" — sieht aus wie eine kaputte Migration. | behoben |
| 2026-08-17 | C1 | sqlc kennt die Nullability eines `LEFT JOIN` nicht und erzeugt für linksgejointe `NOT NULL`-Spalten einfache Typen. Betrifft jede spätere Abfrage mit optionalen Beziehungen — C2 und C4 werden darüber stolpern. | notiert in ADR 0016 |
| 2026-08-17 | C1 | `/api/badge/*` hat weiterhin keine Phase ([#27](https://github.com/G1NG4R/timseil-dev/issues/27)). Die Badges lesen `/api/health`, das es jetzt gibt — die drei Endpoints selbst fehlen noch. | offen |

## Idee — noch nicht entschieden

| Datum | Was | Bewertung |
|---|---|---|
| 2026-08-17 | `RATE_LIMIT_EXEMPT_CIDRS` für das Deploy-Gate und die Badge-Abrufe, falls die alle aus einer Egress-IP kommen und sich 120/min teilen. | Heute kein Problem; erst messen, wenn E4 und die Badges laufen. |
| 2026-08-17 | Die vier Werte der Timeout-Kaskade unter Last nachmessen statt aus der Topologie abzuleiten. | Sinnvoll ab F1, wenn es Zahlen gibt. |
