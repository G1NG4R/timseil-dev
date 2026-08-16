# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Wann |
|---|---|---|---|
| 2026-08-16 | A1 | `required_status_checks` in der Branch Protection nachziehen — Kontextnamen existieren erst mit der Pipeline | E1 |
| 2026-08-16 | A1 | `make design` nur angelegt, nicht verifiziert (Homepage muss sichtbar rendern, nicht schwarz) | A2 |
| 2026-08-16 | A1 | Offene Handgriffe von Tim: `sh tools/github-setup.sh` ausführen, `git push -u origin ops-data` (Branch liegt lokal) | vor dem A1-Merge |
| 2026-08-16 | A1 | Node 26 prüfen: wird am 28.10.2026 LTS, Node 24 geht am 20.10.2026 in Maintenance. Erst dann `.nvmrc` anfassen, nicht früher | nach dem 28.10.2026 |

## Gefunden — Bug oder Unklarheit

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-08-16 | A1 | Lokal lief Node 25.1.0 — ungerade Linie, nie LTS, **EOL seit 01.06.2026**. Ursache doppelt: globaler mise-Pin auf 25.1.0 und `idiomatic_version_file_enable_tools=[]`, also las mise die `.nvmrc` gar nicht. Beides umgestellt, `.nvmrc` bleibt einzige Quelle, `make check-node` hält es fest | erledigt |
| 2026-08-16 | A1 | Systemweit liegt `/usr/bin/node` **26.4.0** (pacman `nodejs`). In nicht-interaktiven Shells ohne mise-Aktivierung gewinnt der — und CLAUDE.md verbietet 26 vor Oktober 2026. Kein Eingriff: das Paket hängt an anderer Software. `make check-node` schlägt an, falls es je durchschlägt | offen |
| 2026-08-16 | A1 | `docker compose up` in der PR-Checkliste ist vor A4 nicht erfüllbar — in A1-PRs als n/a abgehakt | offen |

## Idee — noch nicht entschieden

| Datum | Was | Bewertung |
|---|---|---|
