# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Wann |
|---|---|---|---|
| 2026-08-16 | A1 | `required_status_checks` in der Branch Protection nachziehen — Kontextnamen existieren erst mit der Pipeline | E1 |
| 2026-08-16 | A1 | `make design` nur angelegt, nicht verifiziert (Homepage muss sichtbar rendern, nicht schwarz) | A2 |

## Gefunden — Bug oder Unklarheit

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-08-16 | A1 | Lokal läuft Node 25.1.0 (mise), `.nvmrc` sagt 24 — Plan verbietet >24 vor Oktober 2026. Muss vor G1 auf 24 stehen, sonst baut CI etwas anderes als lokal. Offen: gehört zusätzlich eine `mise.toml` ins Repo? | offen |
| 2026-08-16 | A1 | `docker compose up` in der PR-Checkliste ist vor A4 nicht erfüllbar — in A1-PRs als n/a abgehakt | offen |

## Idee — noch nicht entschieden

| Datum | Was | Bewertung |
|---|---|---|
