# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Wann |
|---|---|---|---|
| 2026-08-16 | A1 | `required_status_checks` in der Branch Protection nachziehen — Kontextnamen existieren erst mit der Pipeline | E1 |
| 2026-08-16 | A1 | ~~`make design` nur angelegt, nicht verifiziert~~ — in A2 belegt: Homepage und Foundations rendern sichtbar, Konsole fehlerfrei | erledigt 2026-08-16 |
| 2026-08-16 | A1 | ~~Offene Handgriffe von Tim: `sh tools/github-setup.sh` ausführen, `git push -u origin ops-data`~~ — in A3 nachgeprüft: Protection auf `main` ist aktiv (`enforce_admins: true`, kein Force-Push, linear history, PR erforderlich), `origin/ops-data` liegt auf GitHub | erledigt 2026-08-17 |
| 2026-08-17 | A3 | `sh tools/issues-design-corrections.sh` ausführen — legt Label, Milestones K1/M6 und zehn Issues an. Lokal gegen eine `gh`-Attrappe zweimal gelaufen, zweiter Lauf erzeugt nichts | nach dem A3-Merge |
| 2026-08-17 | A3 | Live-Badges im README sind auskommentiert, Freischaltung in M6 — hängt am Issue *docs: enable the live badges in the README* | M6 |
| 2026-08-17 | A4 | Rollenpaar `timseil_migrate` (DDL) / `timseil_app` (nur DML) und `scram-sha-256` für die Anwendungsrollen — der Dev-Compose fährt bis dahin mit einer lokalen Rolle. Ohne Schema gibt es nichts zu trennen | B2 |
| 2026-08-17 | A4 | goose-Gerüst und `api/migrations/` — bewusst nicht in A4 vorweggenommen | B2 |
| 2026-08-17 | A4 | **Kein Graceful Shutdown.** `docker compose down` wartet zehn Sekunden auf SIGTERM und schießt dann ab. Gehört zu C1 (`SIGTERM`, keine abgeschnittenen Requests) und wird dort mitgeholt, nicht hier halb gebaut | C1 |
| 2026-08-16 | A1 | Node 26 prüfen: wird am 28.10.2026 LTS, Node 24 geht am 20.10.2026 in Maintenance. Erst dann `.nvmrc` anfassen, nicht früher | nach dem 28.10.2026 |

## Gefunden — Bug oder Unklarheit

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-08-16 | A1 | Lokal lief Node 25.1.0 — ungerade Linie, nie LTS, **EOL seit 01.06.2026**. Ursache doppelt: globaler mise-Pin auf 25.1.0 und `idiomatic_version_file_enable_tools=[]`, also las mise die `.nvmrc` gar nicht. Beides umgestellt, `.nvmrc` bleibt einzige Quelle, `make check-node` hält es fest | erledigt |
| 2026-08-16 | A1 | Systemweit liegt `/usr/bin/node` **26.4.0** (pacman `nodejs`). In nicht-interaktiven Shells ohne mise-Aktivierung gewinnt der — und CLAUDE.md verbietet 26 vor Oktober 2026. Kein Eingriff: das Paket hängt an anderer Software. `make check-node` schlägt an, falls es je durchschlägt | offen |
| 2026-08-16 | A1 | ~~`docker compose up` in der PR-Checkliste ist vor A4 nicht erfüllbar — in A1-PRs als n/a abgehakt~~ — ab A4 wörtlich erfüllbar: `make dev-reset && make dev` läuft aus dem leeren Zustand durch | erledigt 2026-08-17 |
| 2026-08-17 | A4 | **`gofmt -l .` gibt die Sünder aus und beendet trotzdem mit 0.** `check-go` hätte unformatierten Code durchgelassen, seit A1 und unbemerkt, weil bis heute kein Go im Repo lag. Auf `test -z` umgestellt; Gegenprobe mit einer absichtlich falsch eingerückten Datei ist rot | erledigt 2026-08-17 |
| 2026-08-17 | A4 | **Postgres-Images ab 18 verweigern den Start, wenn das Volume auf `/var/lib/postgresql/data` liegt.** Das Datenverzeichnis ist seit 18 ein versionsspezifisches Unterverzeichnis, damit `pg_upgrade --link` keine Mount-Grenze kreuzt. Mount gehört auf `/var/lib/postgresql`. **D2 muss denselben Pfad nehmen** — sonst startet Produktion nicht | erledigt 2026-08-17, D2 vorgemerkt |
| 2026-08-17 | A4 | Auf der Entwicklungsmaschine läuft ein eigener PostgreSQL-Dienst auf `127.0.0.1:5432` (systemd, `/var/lib/postgres/data`). Hätten wir den Container-Port gemappt, wäre es eine Kollision geworden. Dritter Grund für `expose:` statt `ports:`, neben der Sicherheitsregel | erledigt |
| 2026-08-17 | A4 | `create-next-app@16.3.1` schaltet den **React Compiler** von sich aus ein (`reactCompiler: true`, `babel-plugin-react-compiler`). Bleibt vorerst: Build-Zeit, kein Laufzeit-Ballast im Bundle. **In G1 bewusst bestätigen oder abschalten**, nicht per Vorgabe durchrutschen lassen | offen |
| 2026-08-17 | A4 | `.next/types` ist ignoriert, `LayoutProps<"/">` lebt aber dort. Auf einem frischen Klon scheitert `tsc --noEmit` ohne vorherigen Lauf — deshalb ist `typecheck` jetzt `next typegen && tsc --noEmit` | erledigt |
| 2026-08-17 | A4 | **Container laufen als root und schreiben in den Bind Mount.** `next dev` legte `web/.next` und `air` legte `api/tmp` root-eigen im eigenen Arbeitsbaum ab — `rm -rf` aus dem eigenen Konto scheiterte, Aufräumen ging nur über einen weiteren Container. Behoben, indem beide Ausgabepfade auf Named Volumes liegen (`web-next`, `api-tmp`), der Bind Mount trägt nur noch Quelltext. **D1 löst dasselbe anders** (non-root im Image) — dort nachziehen | erledigt 2026-08-17 |
| 2026-08-17 | A4 | `next dev` schreibt `web/AGENTS.md` bei jedem Start neu (`web/CLAUDE.md` verweist mit `@AGENTS.md` darauf). Bewusst mitcommittet — sonst steht in jedem Diff eine Änderung, die man nicht losbekommt | erledigt |
| 2026-08-16 | A2 | **Kapitel 6.3 nennt eine überholte Stufe-H-Nummerierung** (Homepage als H2, Work Index als H3, Blog als H6). Teil II hat 13 H-Phasen: Homepage ist H3–H5, Work Index H6, Blog H9. `INDEX.md` folgt Teil II und sagt das dort auch. 6.3 trägt die Zuordnung nicht mehr selbst — sie lebt nur noch in `INDEX.md`, das Teil II folgt | erledigt 2026-08-17 |
| 2026-08-16 | A2 | 6.3 listete `Mindmap` nicht — mit dem Umbau von 6.3 hinfällig, `INDEX.md` führt es als Orientierungsblatt | erledigt 2026-08-17 |
| 2026-08-16 | A2 | 6.3 weist Stufe J (Terminal) kein Blatt zu. Das Befehlsregister steckt tatsächlich im `Homepage`-Blatt, das Inventar im `Handoff`-Blatt — so in `INDEX.md` eingetragen; 6.3 verweist jetzt dorthin statt eine eigene Tabelle zu führen | erledigt 2026-08-17 |
| 2026-08-16 | A2 | Blätter brauchen Netz (unpkg: React 18.3.1, Babel; Google Fonts). Ohne Netz kein Design-Review — relevant für die Playwright-Vergleiche ab H1; steht jetzt in 6.2 | erledigt 2026-08-17 |
| 2026-08-16 | A2 | Blätter sind Canvases mit **festen Artboards**, kein Reflow. Die sieben Prüfbreiten lassen sich am Blatt nicht durch Fensterresize prüfen, nur die abgebildeten Breiten (1440, 390) — die Vergleichsbasis für H1 ist also schmaler als die Prüfliste — in 6.2 festgehalten | erledigt 2026-08-17 |
| 2026-08-16 | A2 | **Kapitel 6.2 stimmt nicht: `file://` bleibt nicht schwarz.** Headless mit Chromium gegen `http://` gemessen — das Blatt rendert vollständig, DOM strukturell identisch. Die CDN-Skripte kommen über klassische `<script src>`-Tags, die vom `file:`-Ursprung laden; der einzige `fetch()`-Pfad in `support.js` ist ein Nachlade-Zweig mit `.catch()`, und `x-import` benutzt kein einziges Blatt. **Das Abnahmekriterium von A2 ruht damit auf einer falschen Prämisse.** `make design` behalten wir für die stabile, rechnerunabhängige URL (Playwright ab H1) — nicht, weil `file://` bräche. 6.2 ist neu geschrieben: Ursache ist das Netz, nicht das Protokoll | erledigt 2026-08-17 |
| 2026-08-16 | A2 | Gegenprobe zur Netz-Abhängigkeit: mit blockiertem unpkg wird `<x-dc>` nicht ersetzt, kein `#dc-root`, die Seite bleibt dunkel. **Schwarz heißt kein Netz** — diese Hälfte von 6.2 stimmt | erledigt |
| 2026-08-17 | A3 | **M3 und F4 widersprechen sich bei `/api/internal/*`.** M3 nimmt ab, dass der Pfad von außen `404` liefert; F4 lässt den GitHub-Actions-Probe genau dort anklopfen — von außen. Beides zugleich geht nicht. Auflösung gehört nach **L3**: IP-Allowlist für GitHubs Runner-Bereiche (ändern sich, Meta-API), eigener Pfad außerhalb `/api/internal/*`, oder der Probe misst nur und meldet über den Datenbranch. Steht als offene Frage im Container-Diagramm | offen |
| 2026-08-17 | A3 | **Die `/api/badge/*`-Handler aus Kapitel 12.4 sind keiner Phase zugewiesen.** Stufe C hat sieben Phasen, keine nennt sie. Ohne Zuordnung (C2 oder C7) bleiben die README-Badges dauerhaft auskommentiert | offen |
| 2026-08-17 | A3 | Die Meldeadresse steht künftig an drei Orten: `SECURITY.md`, `/.well-known/security.txt` (L4) und das Postfach aus L1. **L4 muss angleichen**, sonst zeigt eine der drei ins Leere. In `SECURITY.md` steht bis dahin die Protonmail-Adresse und daneben, warum | offen |
| 2026-08-17 | A3 | ~~`.githooks/pre-push` meldet auf Deutsch, CLAUDE.md verlangt Englisch für Code und Kommentare. Zweizeiler, aber nicht in A3 — gehört in einen `chore/`-Branch~~ — auf Englisch umgeschrieben, `set -eu` und Kommentarkopf wie bei den anderen beiden Hooks nachgezogen, `selftest.sh` weiter grün | erledigt 2026-08-17 |
| 2026-08-17 | A4 | **Beim Squash-Merge von #16 habe ich `--subject` und `--body` gesetzt.** Damit fehlt dem Commit auf `main` das `(#16)`-Suffix, das GitHub sonst anhängt, und im Body steht ein `Closes #16`, das auf den PR selbst zeigt statt auf ein Issue. Nicht mehr zu korrigieren — Force-Push auf `main` ist gesperrt, und das soll er bleiben. Regel steht jetzt in CLAUDE.md unter *Git* | erledigt 2026-08-17 |
| 2026-08-17 | A3 | ~~Die Sprache der Root-Dokumente war ungeregelt. Entschieden: **Englisch** für `README.md`, `CONTRIBUTING.md`, `SECURITY.md` (Leser kommt von außen), `docs/` bleibt Deutsch. Gehört als Zeile in `CLAUDE.md`, nicht nur hierhin~~ — steht im Abschnitt *Sprache*, zusammen mit PR-Beschreibungen (Englisch) und `backlog.md` (Deutsch) | erledigt 2026-08-17 |
| 2026-08-17 | A3 | In der nicht-interaktiven Session-Shell lag `~/.local/share/mise/installs/node/25.1.0/bin` im PATH, `make check-node` schlug an. `mise current node` sagt korrekt 24.19.0, `mise exec -- make check` ist grün — der Pin aus A1 stimmt, die Shell war es. Verwandt mit dem offenen `/usr/bin/node`-Eintrag oben: **beide Male gewinnt in einer nicht-interaktiven Shell das falsche Node** | offen |
| 2026-08-16 | A2 | `du -ck` überschätzte `code/` um fast das Doppelte (52K statt 27K, 4K-Blockrundung bei zehn kleinen Dateien) und die Zahl steckte in drei Summen im `INDEX.md`. Korrigiert; alle Summen werden jetzt aus `stat`-Bytes gerechnet | erledigt |

## Idee — noch nicht entschieden

| Datum | Was | Bewertung |
|---|---|---|
| 2026-08-16 | React, Babel und Fonts neben die Blätter legen, damit `make design` offline läuft | Kostet einen Eingriff in den read-only-Handoff und CDN-Artefakte im Repo. Nur aufgreifen, falls Stufe H es wirklich braucht |
| 2026-08-17 | **Keine `LICENSE` im Repo.** Öffentlich sichtbar heißt ohne Lizenz: alle Rechte vorbehalten, niemand darf etwas übernehmen. Für ein Portfolio ist das vertretbar — aber als Entscheidung, nicht als Versäumnis | Drei Wege: bewusst ohne Lizenz lassen und das im README sagen · MIT/Apache-2.0 für den Code · getrennt: Code offen, Texte und Design vorbehalten. Entscheidung vor M6, das README nennt sie dann |
| 2026-08-17 | Mermaid-Diagramme in CI rendern lassen, statt nur in der GitHub-Vorschau zu prüfen | In A3 lokal mit `npx @mermaid-js/mermaid-cli` gegen das installierte Chromium gerendert — ging ohne Puppeteer-Download. In CI wäre es ein Job, der einen kaputten Graphen findet, bevor er im PR landet. Erst mit E1 sinnvoll |
