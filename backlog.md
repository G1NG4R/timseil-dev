# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Wann |
|---|---|---|---|
| 2026-08-16 | A1 | `required_status_checks` in der Branch Protection nachziehen — Kontextnamen existieren erst mit der Pipeline | E1 |
| 2026-08-16 | A1 | ~~`make design` nur angelegt, nicht verifiziert~~ — in A2 belegt: Homepage und Foundations rendern sichtbar, Konsole fehlerfrei | erledigt 2026-08-16 |
| 2026-08-16 | A1 | Offene Handgriffe von Tim: `sh tools/github-setup.sh` ausführen, `git push -u origin ops-data` (Branch liegt lokal) | vor dem A1-Merge |
| 2026-08-16 | A1 | Node 26 prüfen: wird am 28.10.2026 LTS, Node 24 geht am 20.10.2026 in Maintenance. Erst dann `.nvmrc` anfassen, nicht früher | nach dem 28.10.2026 |

## Gefunden — Bug oder Unklarheit

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-08-16 | A1 | Lokal lief Node 25.1.0 — ungerade Linie, nie LTS, **EOL seit 01.06.2026**. Ursache doppelt: globaler mise-Pin auf 25.1.0 und `idiomatic_version_file_enable_tools=[]`, also las mise die `.nvmrc` gar nicht. Beides umgestellt, `.nvmrc` bleibt einzige Quelle, `make check-node` hält es fest | erledigt |
| 2026-08-16 | A1 | Systemweit liegt `/usr/bin/node` **26.4.0** (pacman `nodejs`). In nicht-interaktiven Shells ohne mise-Aktivierung gewinnt der — und CLAUDE.md verbietet 26 vor Oktober 2026. Kein Eingriff: das Paket hängt an anderer Software. `make check-node` schlägt an, falls es je durchschlägt | offen |
| 2026-08-16 | A1 | `docker compose up` in der PR-Checkliste ist vor A4 nicht erfüllbar — in A1-PRs als n/a abgehakt | offen |
| 2026-08-16 | A2 | **Kapitel 6.3 nennt eine überholte Stufe-H-Nummerierung** (Homepage als H2, Work Index als H3, Blog als H6). Teil II hat 13 H-Phasen: Homepage ist H3–H5, Work Index H6, Blog H9. `INDEX.md` folgt Teil II und sagt das dort auch. 6.3 trägt die Zuordnung nicht mehr selbst — sie lebt nur noch in `INDEX.md`, das Teil II folgt | erledigt 2026-08-17 |
| 2026-08-16 | A2 | 6.3 listete `Mindmap` nicht — mit dem Umbau von 6.3 hinfällig, `INDEX.md` führt es als Orientierungsblatt | erledigt 2026-08-17 |
| 2026-08-16 | A2 | 6.3 weist Stufe J (Terminal) kein Blatt zu. Das Befehlsregister steckt tatsächlich im `Homepage`-Blatt, das Inventar im `Handoff`-Blatt — so in `INDEX.md` eingetragen; 6.3 verweist jetzt dorthin statt eine eigene Tabelle zu führen | erledigt 2026-08-17 |
| 2026-08-16 | A2 | Blätter brauchen Netz (unpkg: React 18.3.1, Babel; Google Fonts). Ohne Netz kein Design-Review — relevant für die Playwright-Vergleiche ab H1; steht jetzt in 6.2 | erledigt 2026-08-17 |
| 2026-08-16 | A2 | Blätter sind Canvases mit **festen Artboards**, kein Reflow. Die sieben Prüfbreiten lassen sich am Blatt nicht durch Fensterresize prüfen, nur die abgebildeten Breiten (1440, 390) — die Vergleichsbasis für H1 ist also schmaler als die Prüfliste — in 6.2 festgehalten | erledigt 2026-08-17 |
| 2026-08-16 | A2 | **Kapitel 6.2 stimmt nicht: `file://` bleibt nicht schwarz.** Headless mit Chromium gegen `http://` gemessen — das Blatt rendert vollständig, DOM strukturell identisch. Die CDN-Skripte kommen über klassische `<script src>`-Tags, die vom `file:`-Ursprung laden; der einzige `fetch()`-Pfad in `support.js` ist ein Nachlade-Zweig mit `.catch()`, und `x-import` benutzt kein einziges Blatt. **Das Abnahmekriterium von A2 ruht damit auf einer falschen Prämisse.** `make design` behalten wir für die stabile, rechnerunabhängige URL (Playwright ab H1) — nicht, weil `file://` bräche. 6.2 ist neu geschrieben: Ursache ist das Netz, nicht das Protokoll | erledigt 2026-08-17 |
| 2026-08-16 | A2 | Gegenprobe zur Netz-Abhängigkeit: mit blockiertem unpkg wird `<x-dc>` nicht ersetzt, kein `#dc-root`, die Seite bleibt dunkel. **Schwarz heißt kein Netz** — diese Hälfte von 6.2 stimmt | erledigt |
| 2026-08-16 | A2 | `du -ck` überschätzte `code/` um fast das Doppelte (52K statt 27K, 4K-Blockrundung bei zehn kleinen Dateien) und die Zahl steckte in drei Summen im `INDEX.md`. Korrigiert; alle Summen werden jetzt aus `stat`-Bytes gerechnet | erledigt |

## Idee — noch nicht entschieden

| Datum | Was | Bewertung |
|---|---|---|
| 2026-08-16 | React, Babel und Fonts neben die Blätter legen, damit `make design` offline läuft | Kostet einen Eingriff in den read-only-Handoff und CDN-Artefakte im Repo. Nur aufgreifen, falls Stufe H es wirklich braucht |
