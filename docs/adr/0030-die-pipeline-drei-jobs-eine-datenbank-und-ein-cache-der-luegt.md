# ADR 0030 — Die Pipeline: drei Jobs, eine Datenbank und ein Cache, der lügt

**Status:** Angenommen
**Datum:** 2026-08-20
**Betrifft:** E1, E2, E3, E4, E5, F4
**Invarianten:** —

## Kontext

Bis E1 hatte dieses Repo keine `.github/workflows/`. Jedes Gate existierte als
`make`-Ziel und lief, wenn ein Mensch daran dachte. Die Branch Protection auf
`main` war eingerichtet — lineare Historie, keine Force-Pushes,
`enforce_admins` — führte aber **kein** `required_status_checks`, weil es keine
Prüfung gab, die sie hätte fordern können. `.githooks/pre-commit` behauptet seit
A4 im eigenen Kommentar *„The full sweep is `make check`, which CI runs"*; der
Satz war bis hierher unwahr.

Abnahme laut Bauplan Zeile 1111: **PR-Feedback unter 5 Minuten.**

Die Gates selbst waren nicht die Frage — die gibt es seit A4 und sie sind in
`tools/selftest.sh` gegen ihren kaputten Fall gehalten. Die Frage war, was eine
Maschine braucht, die sie ausführt, und wo die Zeit dabei hingeht.

## Entscheidung

**Drei parallele Jobs in einer Datei. `make check-db` läuft in CI unverändert,
statt gegen einen Actions-`services`-Block. Der Go-Test-Cache ist in CI aus und
bleibt lokal an.**

### 1. Drei Jobs, nebenläufig statt hintereinander

`check` (kein Docker) · `db` (`make check-db`) · `images` (`make images`,
`check-images`, `check-topology`).

Das Abnahmekriterium misst **Feedback-Zeit, nicht Rechenzeit** — und
Feedback-Zeit ist der langsamste Job, nicht die Summe aller. `check` braucht
keinen Container; `db` und `images` bezahlen je einen Image-Build. Beide in
einen Job zu legen ist genau das, was die fünf Minuten reißt.

Eine Datei und nicht drei: die Jobs teilen Trigger, `permissions`,
`concurrency` und dieselben Action-Pins. Drei Dateien wären dreimal dieselbe
Kopfzeile und drei Stellen, an denen ein Pin veraltet.

### 2. `make check-db` statt eines Actions-`services`-Blocks

Issue #30 hieß „gib der Pipeline einen Postgres-Service". Gebaut ist etwas
anderes: der Job kopiert `.env.example` nach `.env` und ruft `make check-db`.
Der Target startet `db` aus `compose.dev.yaml` und fährt die getaggten Tests
**im `migrate`-Container** (`-tags=db -count=1 -p 1`).

Der Grund ist nicht Bequemlichkeit, sondern dass die Alternative gar nicht
funktioniert, ohne etwas zu erfinden: `TEST_DATABASE_URL` nennt den Hostnamen
`db`, und der löst im Compose-Netz auf und sonst nirgends. Ein
Service-Container bräuchte eigene DSNs — **einen zweiten Weg in dieselbe
Datenbank, den nichts mit dem ersten in Übereinstimmung hält.** Der Weg, der
lokal geprüft ist, ist der, der in CI läuft.

### 3. Der Test-Cache ist in CI aus

`GOFLAGS: -count=1` im Job `check`. Issue #91, und es ist kein
Vorsichtsprinzip, sondern ein Fehler, der schon eingetreten ist:
`TestCommandsDoReachTheSeed` shellt nach `go list` aus. Gos Test-Cache merkt
sich die Dateien und die Umgebung, die ein Test**paket** liest — er kann nicht
sehen, was ein **Unterprozess** anfasst. Der Test lieferte einen
zwischengespeicherten Pass, während `make check-db` auf demselben Baum rot war.
`make check` war grün und das Repo war es nicht.

Lokal bleibt der Cache an. Er ist der Grund, warum `make check` schnell genug
ist, um dauernd zu laufen, und das ist mehr wert als die Wiederholung. Die
Pipeline ist die Stelle, die sich langsam und korrekt leisten kann.

Der Build-Cache von `setup-go` ist davon nicht betroffen — Build-Cache und
Test-Cache sind zwei Dinge, und nur das zweite wird verweigert.

### 4. Vier Dinge, die der Runner braucht und ein Laptop schon hat

Alle vier durch Lesen der Prüfungen gefunden, nicht durch rote Läufe:

| | Warum |
|---|---|
| `git config core.hooksPath .githooks` | `check-repo.sh` sichert den Wert zu, weil ein frischer Klon ihn nicht setzt und die lokale Hälfte der Gates dann nie feuert. Ein CI-Checkout **ist** ein frischer Klon. |
| `setup-node` mit `node-version-file` | Ohne `node` überspringt `check-node.sh` sich selbst und endet mit 0. Ein Job ohne diesen Schritt wäre grün, ohne etwas geprüft zu haben. |
| `npm ci` in `web/` | `check-contract` ruft `make gen`, und `gen` ruft `redocly`/`openapi-typescript` mit `npx --no-install` — das holt nichts nach. |
| drei erzeugte Geheimnisse | `check-topology` startet das echte Binary. `CONTACT_IP_PEPPER`, `INTERNAL_PROBE_TOKEN`, `INTERNAL_DEPLOY_TOKEN` sind Pflicht, ≥ 32 Zeichen und in `.env.example` absichtlich leer. |

Die Hook-Zusicherung wird **im Workflow erfüllt, nicht im Skript abgeschaltet.**
Ein `if [ "$CI" = true ]` in `check-repo.sh` wäre eine Ausnahme in einem Gate,
das `selftest.sh` gegen seinen kaputten Fall hält — und die Ausnahme wäre die
eine Zeile, die dort nie geprüft würde.

`GITHUB_TOKEN` braucht die Pipeline nicht: `TOPOLOGY_ENV` setzt
`CONTRIBUTIONS_TRANSPORT=off`, was den Refresher abschaltet statt den Start.
Das ist die Antwort auf den Befund aus #56, und E1 ist ihre erste Nutzung
außerhalb einer Handprüfung.

### 5. Härtung ab der ersten Zeile

`permissions: contents: read` explizit, Actions auf Commit-SHA gepinnt mit dem
Tag als Kommentar dahinter, kein `pull_request_target`, keine
`github.event.*`-Interpolation in `run:`. Aus E2 vorgezogen, weil es für eine
nachträglich gehärtete Workflow-Datei keinen Grund gibt und ein verschobener Tag
genau der Weg war, auf dem `tj-actions` seine Nutzer erreichte.

Drei Fremd-Actions, alle von GitHub selbst. Jede weitere wäre ein weiteres
Repository, dessen Betreuer in diese Pipeline schreiben können.

## Konsequenzen

- `make check`, `make check-db` und die D1/D2/D3-Abnahmen laufen ab jetzt auf
  jedem PR. Die drei Handschritte, die bisher im PR-Text behauptet wurden
  (#92), sind Läufe mit Protokoll.
- #29 wird möglich: Die Branch Protection kann drei Jobnamen fordern. Sie tut es
  erst **nach** dem ersten grünen Lauf — eine Prüfung lässt sich nicht
  verpflichtend machen, bevor sie existiert.
- E2 erbt eine Datei mit fertigem Kopf: Scanner kommen als weitere Jobs dazu,
  `permissions` und Pins sind schon entschieden.
- E4 erbt das Gegenteil einer Bremse: `images` baut beide Images bereits: der
  Push dorthin ist ein Schritt, kein Job.

### Was das kostet

**Doppelte Go-Module.** Der `db`-Job lädt die Module ein zweites Mal — die
Volumes `go-mod-cache` und `go-build-cache` aus `compose.dev.yaml` starten in
CI leer, und der Runner-Cache aus `setup-go` liegt außerhalb des Containers.
Das ist der bewusst bezahlte Preis dafür, dass es nur **einen** Weg in die
Testdatenbank gibt. Er ist der Grund für den eigenen Job.

**Der `images`-Job blockiert den Merge** — zwei Image-Builds plus
`check-topology`, das den Stack zweimal hochfährt und einmal absichtlich bricht.
Er läuft auf jedem PR: Das Repo ist öffentlich, Standard-Runner sind damit
kostenlos, und ein Check, der auf PRs schweigt, prüft den Zustand, den niemand
mehr ändert.

> **Gemessen am ersten Lauf ([#124](https://github.com/G1NG4R/timseil-dev/pull/124),
> Run 32417483117):** Dieser Absatz sagte „ist langsam" und schätzte 8–12
> Minuten. Falsch, um den Faktor sechs — `images` war mit **1:34** der
> *schnellste* der drei Jobs (`make images` 0:56, `check-topology` 0:34, alle
> neun Zusicherungen gelaufen). Die Schätzung stammte von dieser Maschine; ein
> Runner hat schnellere Platten und keine Nebenlast.
>
> **Die Entscheidung hält trotzdem, und jetzt mit einer Zahl statt einer
> Vermutung.** Gemessen: `check` 2:21 · `db` 1:50 · `images` 1:34.
> Nebenläufig ist der Lauf **2:27** — hintereinander wären es **5:45** und das
> Abnahmekriterium wäre gerissen. Der Grund für drei Jobs war die Arithmetik,
> nicht die Schätzung, und die Arithmetik stimmt.

**Drei Geheimnisse werden in CI erzeugt.** Kurzlebig und ohne Reichweite — sie
authentifizieren Container, die `check-topology` selbst wieder abräumt, und kein
Port dieses Stacks ist von außerhalb des Runners erreichbar. Trotzdem ist es
eine Stelle mehr, an der ein `openssl rand` im Klartext in ein `.env`
geschrieben wird, und wer den Job kopiert, kopiert das Muster mit.

**Die Pins veralten.** Ein SHA-Pin bekommt keine Sicherheitsupdates von selbst.
Dependabot für Actions kommt in E2; bis dahin ist der Zeilenkommentar mit dem
Tag das einzige, was einen Menschen erkennen lässt, wie alt der Hash ist.

## Verworfene Alternativen

**Ein `services: postgres:` -Block in Actions.** Schneller (kein
Container-Build, kein zweiter Modul-Download) und die übliche Antwort. Verworfen,
weil er eigene DSNs bräuchte: der Hostname `db` existiert nur im Compose-Netz.
Damit gäbe es zwei Beschreibungen derselben Testdatenbank, und die Pipeline
prüfte einen Weg, den lokal niemand fährt. Genau die Sorte Zweitpfad, gegen die
schon ADR 0027 §8 argumentiert.

**`check-repo.sh` die Hook-Prüfung unter `CI=true` überspringen lassen.** Zwei
Zeilen weniger im Workflow. Verworfen: es baut eine Ausnahme in ein Gate, und
`selftest.sh` müsste den neuen Zweig mitprüfen — sonst ist ausgerechnet die
Ausnahme der ungeprüfte Teil. Der Workflow tut stattdessen das, was
`CONTRIBUTING.md` einem Menschen nach dem Klonen sagt.

**Alles in einen Job.** Ehrlicher zu lesen, ein Protokoll statt drei. Verworfen
am Abnahmekriterium: mit Container-Build und Image-Bau in derselben Kette sind
fünf Minuten nicht zu halten, und die Zahl im Bauplan ist keine Zierde — sie ist
der Unterschied zwischen einer Prüfung, auf die man wartet, und einer, an der
man vorbeiarbeitet.

**`golangci-lint` gleich mitnehmen.** Verworfen als Phasengrenze: E1 fährt die
Gates, die es gibt. Einen Linter einzuführen heißt, seine Regeln zu wählen und
den Bestand daran anzupassen — das ist E2 und ein eigener PR.

## Belege

Build-Plan Kapitel „Stufe E — CI/CD & Supply Chain", E1.
Issues [#29](https://github.com/G1NG4R/timseil-dev/issues/29),
[#30](https://github.com/G1NG4R/timseil-dev/issues/30),
[#91](https://github.com/G1NG4R/timseil-dev/issues/91),
[#92](https://github.com/G1NG4R/timseil-dev/issues/92).
Der Befund zu `GITHUB_TOKEN` stammt aus
[#56](https://github.com/G1NG4R/timseil-dev/issues/56), die Antwort darauf aus
ADR 0027. `.github/workflows/ci.yml` trägt die Begründungen am jeweiligen
Schritt.
