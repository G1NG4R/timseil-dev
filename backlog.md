# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

**Letzte Triage: nach L1, 20.08.2026.** 21 Zeilen → **4 Issues**
([#118](https://github.com/G1NG4R/timseil-dev/issues/118)–[#121](https://github.com/G1NG4R/timseil-dev/issues/121)),
**16 in der Phase selbst erledigt**, **1 bewusst nach L5 verschoben**, dazu ein
Kommentar an [#80](https://github.com/G1NG4R/timseil-dev/issues/80) und die
Schließung von [#69](https://github.com/G1NG4R/timseil-dev/issues/69).

L1 war zwar keine ganze Stufe, wurde aber aus Stufe L vorgezogen und als
eigenständige Phase abgeschlossen — deshalb wird hier wie an einer
Stufengrenze triagiert.

**Die 16 sind nicht verworfen, sondern umgezogen.** Sie stehen in
[ADR 0029](docs/adr/0029-mail-und-dns-ueber-ovh-die-zone-der-selektor-und-das-relay.md),
im neuen `docs/runbooks/mail.md` und in elf korrigierten Stellen quer durchs
Repo ([#122](https://github.com/G1NG4R/timseil-dev/pull/122)). Eine Notiz ist
erst dann erledigt, wenn sie an einem Ort steht, an dem jemand sie sucht.

**Die vier Issues:**

| Issue | Was offen bleibt |
|---|---|
| [#118](https://github.com/G1NG4R/timseil-dev/issues/118) | Das Repo kann seine eigene Zone nicht prüfen. `make check` ist grün auf einer Domain, über deren Records es nichts weiß |
| [#119](https://github.com/G1NG4R/timseil-dev/issues/119) | Die Zone veröffentlicht ein `AAAA`, das nie jemand getestet hat. Braucht eine Messung von außen |
| [#120](https://github.com/G1NG4R/timseil-dev/issues/120) | DMARC steht auf `p=none`. `quarantine` frühestens am **02.09.2026**, nach Auswertung der `rua`-Berichte |
| [#121](https://github.com/G1NG4R/timseil-dev/issues/121) | Dokploys `.env` verkürzt still jedes Geheimnis mit `$` oder `#`. Bei SMTP fiel es auf, weil `535` den Grund nennt — bei Postgres täte es das nicht |

**Das eine Verschobene:** CAA gehört nach L5, mit einem Ausstellungstest daneben.
Ein falscher CAA-Eintrag blockiert die Zertifikats-*Erneuerung*, unsichtbar bis
zum Ablauf. Begründung in ADR 0029 §7, Erinnerung in `mail.md` §„Was hier nicht
steht" und im Bauplan bei L5 — kein Issue nötig, weil die Phase ihn ohnehin
nennt.

**Abnahme L1:** mail-tester **10/10** am 20.08.2026 um 19:58 UTC. Die zweite
Messung acht Minuten davor ergab 7,7/10; die Differenz war restlos
`FREEMAIL_FORGED_REPLYTO`. Beide Zahlen stehen in ADR 0029 §Belege, weil eine
allein die unehrlichere Angabe wäre.

Vorherige Triage: nach dem ersten Deploy, 19.08.2026 — 24 Zeilen → 13 Issues
([#102](https://github.com/G1NG4R/timseil-dev/issues/102)–[#112](https://github.com/G1NG4R/timseil-dev/issues/112),
[#114](https://github.com/G1NG4R/timseil-dev/issues/114),
[#115](https://github.com/G1NG4R/timseil-dev/issues/115)), 9 erledigt.

---

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-08-20 | E1 | `golangci-lint`, `gosec`, CodeQL, Trivy, `gitleaks`, `govulncheck`, `npm audit` und Dependabot bewusst **nicht** in E1. E1 fährt die Gates, die es gibt; einen Linter einzuführen heißt, seine Regeln zu wählen und den Bestand daran anzupassen. | nach E2, ADR 0030 §Verworfene Alternativen |
| 2026-08-20 | E1 | Branch Protection auf `main` fordert weiterhin **keine** Checks — `required_status_checks` fehlt im API-Objekt ganz. Erst nach dem ersten grünen Lauf setzbar, und nur in der GitHub-Oberfläche. | offen, [#29](https://github.com/G1NG4R/timseil-dev/issues/29) |
| 2026-08-21 | E2a | **Die golangci-lint-Version bewegt kein Dependabot.** Sie steht in `.golangci-lint-version`, und kein Ökosystem kennt diese Datei — auch `gomod` nicht, weil der Linter bewusst keine `tool`-Direktive ist. Ein Mensch muss sie heben. Der Preis für die Entscheidung, ~100 indirekte Zeilen nicht an `go.mod` zu hängen. | bewusst akzeptiert, ADR 0031 §Was das kostet |
| 2026-08-21 | E2a | Die vier Doku-Drift-Prüfungen: zwei waren schon gebaut (Router-Parität aus C7, `check-stack`), zwei fehlen weiterhin — README-Quickstart und ADR-Referenzen. Dazu `check-env` (#61), Contract-Test-Pflicht (#62), `go mod tidy` (#33) und Branch Protection (#29). | E2b, eigener Branch |

## Gefunden — Bug oder Unklarheit

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-08-20 | E1 | **Vier Stellen, an denen eine naive Pipeline auf diesem Repo scheitert** — `core.hooksPath` unset im CI-Checkout (`check-repo.sh` wird rot, bevor es eine Datei prüft), `check-node.sh` überspringt sich ohne Node lautlos mit exit 0, `check-contract` braucht `npm ci` für `npx --no-install`, und `.env.example` allein ergibt eine API, die nicht startet (drei Pflichtgeheimnisse absichtlich leer). Alle vier durch Lesen der Prüfungen gefunden, nicht durch rote Läufe. | behoben in E1, ADR 0030 §4 |
| 2026-08-20 | E1 | `https://timseil.dev/api/health` liefert `"version":"backup/pre-rewrite-2026-08-17-22-g3890180"` — der Backup-Tag **ist** die veröffentlichte Version, jetzt an der laufenden Instanz gemessen statt vermutet. Deshalb bleibt der `images`-Job auf Checkout-Tiefe 1: mit geholten Tags beschriebe `git describe` gegen denselben Tag. | offen, [#112](https://github.com/G1NG4R/timseil-dev/issues/112) — die Messung als Beleg nachtragen |
| 2026-08-20 | E1 | Dieselbe Antwort nennt `"sha":"3890180"` — das ist `chore: triage the backlog after stage D (#99)`. **Die laufende Instanz ist vier Commits hinter `main`**, u. a. ohne den kompletten L1-Stand. Kein Fehler (D3 deployt von Hand), aber die Lücke schließt erst E4, und bis dahin beschreibt die Seite einen älteren Stand als das Repo. | offen — E4 |
| 2026-08-20 | E1 | `README.md` sagt „CI will run these commands from stage E5 onwards" über den Quickstart. Laut Bauplan ist die README-Quickstart-Drift-Prüfung eine der **vier Doku-Drift-Prüfungen aus E2**, nicht E5. Nicht angefasst, um den PR eng zu halten. | offen — in E2 entscheiden und die Zeile korrigieren |
| 2026-08-21 | E2a | **Die OCI-Labels veröffentlichen #112.** `image.version` kommt aus `git describe --tags` und steht jetzt als Label auf beiden Images: `backup/pre-rewrite-2026-08-17-33-g…`. Der Backup-Tag war bisher nur in einer API-Antwort sichtbar; ab E4 steht er auf jedem gepushten Artefakt in GHCR. Mit `docker inspect` gelesen, nicht vermutet. | offen, [#112](https://github.com/G1NG4R/timseil-dev/issues/112) — **vor E4** fällig, nicht danach |
| 2026-08-21 | E2a | **Dreimal eine unvollständige Messung**, jedes Mal in derselben Form: golangci-lint meldete 53 statt 69 (nur die ersten drei Findings je Art), `cyclop` schwieg bei Schwelle 1 über Funktionen mit 11–16, und `funlen` meldet nur die erste seiner zwei Grenzen — `config.Load` galt als 24 Statements, die 96 Zeilen erschienen erst mit abgeschalteter Statement-Grenze. Zwei der vier behobenen Defekte tauchten erst im zweiten Durchgang auf. | behoben in E2a, ADR 0031 §3 — **die Regel für jeden neuen Scanner: erst die Report-Grenzen abschalten, dann zählen** |
| 2026-08-21 | E2a | Die Labels tragen `org.opencontainers.image.licenses="NOASSERTION"`, was die ehrliche SPDX-Angabe für „keine Lizenz erklärt" ist. Sobald [#45](https://github.com/G1NG4R/timseil-dev/issues/45) entschieden ist, muss dieser Wert mitwandern — sonst behauptet das Image etwas anderes als das Repo. | offen — hängt an [#45](https://github.com/G1NG4R/timseil-dev/issues/45) |

## Idee — noch nicht entschieden

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-08-20 | E1 | Der `db`-Job lädt die Go-Module ein zweites Mal: `go-mod-cache` und `go-build-cache` aus `compose.dev.yaml` starten in CI leer, der `setup-go`-Cache liegt außerhalb des Containers. Denkbar wäre, im Job den Runner-Cache in den `migrate`-Container zu mounten. Kostet eine CI-spezifische Compose-Override-Datei — also einen zweiten Weg dorthin, und genau davor warnt ADR 0030. Erst messen, ob es überhaupt weh tut. | offen — nur wenn der Job das 5-Minuten-Budget bedroht |
| 2026-08-20 | E1 | Ein `paths:`-Filter für den `images`-Job, falls er je stört. **Hinfällig nach der ersten Messung:** er war mit 1:34 der schnellste der drei Jobs, nicht der langsamste. Bleibt trotzdem notiert, weil das Argument dagegen unabhängig von der Laufzeit gilt — ein Pfadfilter ist eine Behauptung darüber, was ein Image beeinflusst, und die ist leichter falsch als eine Wartezeit. | verworfen — kein Problem, das es zu lösen gäbe |
| 2026-08-21 | E2a | CodeQL läuft vorerst auch auf Pull Requests. Ob es neben E1s gemessenen 2:27 ins 5-Minuten-Budget passt, ist offen und wird nach dem ersten Lauf entschieden — passt es nicht, verliert der Job den `pull_request`-Trigger und behält `push` und `schedule`. | offen — Messung ausstehend, Zahl gehört in ADR 0031 §Belege |
| 2026-08-21 | E2a | Ob Dependabots `docker-compose`-Ökosystem `compose.yaml` und `compose.dev.yaml` wirklich beide anfasst, ist gegen das veröffentlichte Schema geprüft, aber nicht an einem echten Lauf. Wenn nicht: der Postgres-Digest aus #93 ist der eine Pin, den nie etwas anhebt. | offen — beim ersten Dependabot-Lauf bestätigen |
