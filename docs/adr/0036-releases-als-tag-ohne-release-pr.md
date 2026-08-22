# ADR 0036 — Releases als Tag, ohne Release-PR

**Status:** Angenommen
**Datum:** 2026-08-22
**Betrifft:** E5, G, N
**Invarianten:** 1 (keine erfundenen Zahlen — auch nicht darüber, wie ein Build heißt)

## Kontext

Bauplan §5.4 verlangt: *„Conventional Commits → `release-please` erzeugt
CHANGELOG und Tags · SemVer · Image-Tags `sha-<short>`, `v1.2.3`, `latest`"*.

Bis heute nennt sich jeder Build nach seinem Commit. `tools/version.sh` matcht
`v*` und fällt sonst auf die Kurz-SHA zurück — **weil es keine Tags gibt**,
dieses Repository hat auf GitHub keinen einzigen. `ci.yml` sagte es selbst:
*„E5 has to revisit this."*

### Der Zwang, den der Bauplan nicht kennt

`release-please` arbeitet über einen **Release-PR**. Ein Pull Request, den der
eingebaute `GITHUB_TOKEN` erstellt, **löst keine `pull_request`-Workflows aus**
— GitHubs Rekursionsschutz, damit ein Workflow sich nicht selbst nachlädt.

Für dieses Repository heißt das: keiner der sieben erforderlichen Kontexte aus
`tools/github-setup.sh` meldet je, und mit `enforce_admins: true` ist der
Release-PR **nicht mergebar**. Nicht schwer zu mergen — unmöglich.

Die Auswege heißen GitHub-App oder Personal Access Token: ein weiteres
langlebiges Geheimnis mit `contents: write` auf dieses Repository. Vier Tage
nachdem ein Token in ein Terminal geraten war, ist das die falsche Antwort.

## Entscheidung

**Ein Release ist ein Tag und ein GitHub-Release, erzeugt von dem Job, der das
Artefakt ohnehin baut und signiert. Es gibt keinen Release-PR und keine
`CHANGELOG.md`.**

### 1. Die Regeln stehen in `tools/release.sh`

| Commits seit dem letzten `v*`-Tag | Ergebnis |
|---|---|
| `feat:` | minor |
| `fix:` · `perf:` | patch |
| `feat!:` / `BREAKING CHANGE:` | major — **außer bei `0.x`, dort minor** |
| `docs` `chore` `ci` `test` `refactor` `style` `build` | **kein Release** |
| kein `v*`-Tag vorhanden | `v0.1.0` |

Vier Modi: `--next`, `--notes` (beide rein und testbar, über `RELEASE_DIR` gegen
ein Wegwerf-Repository), `--tag` und `--publish`.

### 2. `v0.1.0`, nicht `v1.0.0`

SemVer 1.0.0 ist die Aussage **„die öffentliche Schnittstelle steht"**. Der
Contract ist öffentlich und ändert sich in den Stufen G bis N noch. `v0.` sagt
das ehrlich, und `/api/badge/version` zeigt es jedem, der hinsieht.

Daraus folgt die Regel, die überrascht: **ein Breaking Change ist bei `0.x` ein
Minor-Sprung.** `0.y.z` verspricht keine Stabilität, also gibt es nichts zu
brechen. `v1.0.0` setzt der Launch, nicht der erste Commit, der etwas umbaut.

### 3. Der Job, der signiert, ist der Job, der benennt

Der erste Entwurf war ein eigener `release`-Job vor `publish`. Verworfen, und
der Grund ist nicht Bequemlichkeit:

**Der Tag muss existieren, bevor `make images` läuft.** Sonst trägt das Image
des Release-Commits `v0.1.0-5-gabc1234`, während das GitHub-Release denselben
Commit `v0.2.0` nennt — zwei Namen für einen Build, auf einer Seite, deren erste
Regel lautet, dass eine Zahl sagt, was sie gemessen hat.

Also tut es `publish`, in dieser Reihenfolge:

```
checkout (fetch-depth: 0)   Historie, sonst hat git describe nichts zu beschreiben
release.sh --tag            fällig? Tag lokal, nichts gepusht
make images                 VERSION ist jetzt v0.2.0
check · scan · push · sign · attest · verify
release.sh --publish        Tag pushen, Release anlegen — ZULETZT
```

**Der Tag wird als Letztes veröffentlicht.** Ein öffentlicher Name für einen
Build entsteht erst, wenn dieser Build in der Registry liegt, gescannt, signiert
und geprüft ist. Bricht der Job vorher ab, ist der Commit nirgends getaggt und
der nächste qualifizierende Merge holt das Release nach. Dieselbe Regel wie
*„nothing is pushed before the scanners have seen it"*.

### 4. Images behalten `sha-<7>` als einzigen Namen

`v1.2.3` zusätzlich am Image wäre dekorativ: `tools/deploy.sh` weist alles ab,
was nicht `sha-` plus sieben Hex ist (ADR 0033 §7), und ein Rollback zeigt auf
einen Commit, nicht auf eine Release-Nummer.

Es wäre außerdem eine Falle. `tools/prune-registry.sh` betrachtet ausschließlich
Tags der Form `sha-<7hex>`; ein v-getaggtes Image fällt nach zehn Builds
trotzdem aus der Registry, und das GitHub-Release zeigte danach ins Leere. Wer
den v-Tag will, baut zuerst die Aufbewahrung um.

`latest` bleibt verboten, unverändert seit ADR 0033 §7.

## Konsequenzen

- **`/api/health` und `/api/badge/version` nennen ab jetzt eine Release-Nummer**
  — `v0.2.0` auf einem Release-Commit, `v0.2.0-3-gabc1234` dazwischen. Die
  zweite Form ist kein Makel, sondern die genauere Auskunft: drei Commits nach
  v0.2.0.
- **Der Changelog lebt auf GitHub**, nicht im Klon. Wer ihn offline braucht,
  liest `git log`; die Commits sind die Quelle, aus der beides entsteht.
- **`tools/version.sh`, `deploy.sh`, `verify-deploy.sh` und
  `prune-registry.sh` bleiben unverändert.** Das ist das Maß dafür, dass die
  Entscheidung an der richtigen Stelle sitzt.
- **Ein `feat:`-Merge veröffentlicht eine Minor-Version.** Wer das nicht will,
  schreibt `chore:` — und `CONTRIBUTING.md` sagt, dass das eine Entscheidung ist
  und keine Formalie.

### Was das kostet

**`publish` bekommt `contents: write`.** Der Job darf damit in dieses Repository
schreiben. `main` bleibt durch `enforce_admins: true` geschützt, ein Tag ist es
nicht — ein kompromittierter Schritt in diesem Job könnte also Tags setzen. Er
könnte allerdings ohnehin Images unter unserem Namen signieren und
Attestierungen ausstellen (`id-token: write`); wer hier hereinkommt, hat größere
Möglichkeiten als einen Tag. Die Alternative — ein eigener Job mit dieser
Berechtigung allein, so wie `codeql` `security-events: write` allein hält —
bezahlt mit dem Widerspruch aus §3 und wurde deshalb verworfen. Benannt statt
weggelassen.

**Eine Abweichung vom Bauplan an drei Stellen**, und keine davon ist eine
Verbesserung im Sinne von „schöner": kein `release-please`, keine
`CHANGELOG.md`, kein `v1.2.3` am Image. Der Bauplan ist entsprechend korrigiert,
nicht stillschweigend übergangen.

**`fetch-depth: 0` in `publish`.** Die volle Historie bei jedem Merge auf `main`.
Heute vernachlässigbar, bei zehntausend Commits nicht mehr — dann ist
`fetch-tags` plus eine ausreichende Tiefe die Reparatur, und nicht der Verzicht
auf die Version.

## Verworfene Alternativen

**`release-please` mit einer GitHub-App.** Bauplan-treu, CHANGELOG im Repo, und
der Release-PR durchliefe dieselben sieben Prüfungen wie jeder andere. Verworfen
wegen des Preises: App-ID und privater Schlüssel als zwei weitere
Repository-Secrets mit `contents: write` und `pull-requests: write` — vier Tage
nach einem Token-Vorfall zwei neue Dauer-Geheimnisse für einen Automatismus, den
ein Skript von neunzig Zeilen ohne sie erledigt.

**Ein eigener `release`-Job vor `publish`.** Geringere Rechte je Job, aber die
Wettlaufsituation aus §3 — und `publish` hat absichtlich kein `needs:`, damit es
neben `check` und `db` läuft statt danach.

**`CHANGELOG.md` zusätzlich pflegen.** Bräuchte einen Commit auf `main`, und
Direkt-Commits auf `main` sind ausgeschlossen. Über einen PR wäre man wieder bei
dem Problem, das diesen ADR ausgelöst hat.

**Bei `v1.0.0` anfangen.** Die API steht seit Stufe C im Contract und wird
versioniert geändert. Verworfen, weil dann jede Contract-Änderung bis zum Launch
formal ein Major-Sprung wäre — oder die Regel gebeugt würde, und eine gebeugte
Regel ist schlechter als eine ehrliche `0`.

## Belege

Bauplan §5.4 und die E5-Zeile. Systemhandbuch Kapitel 26.
ADR 0026 (das geprüfte Artefakt ist das laufende), ADR 0033 §7 (`latest`
verboten, Rollback braucht einen unverschiebbaren Namen), ADR 0031 (was `make
check` trägt).
Issue [#112](https://github.com/G1NG4R/timseil-dev/issues/112) — der Backup-Tag,
der als Version in Produktion stand, und der Grund für `--match 'v*'`.
GitHub: *„events triggered by the GITHUB_TOKEN will not create a new workflow
run"* — der Blocker aus dem Kontext.
