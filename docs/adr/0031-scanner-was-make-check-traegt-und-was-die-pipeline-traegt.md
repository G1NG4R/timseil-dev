# ADR 0031 — Scanner: was `make check` trägt und was die Pipeline trägt

**Status:** Angenommen
**Datum:** 2026-08-21
**Betrifft:** E2, E3, E4, F4
**Invarianten:** 1 (keine erfundenen Zahlen — auch nicht über den eigenen Code)

## Kontext

E1 hinterließ drei Jobs und einen Kopfkommentar, der benennt, was fehlt:
*„no scanners […] Static analysis, dependency and secret scanning are E2."*

Der Bauplan (Zeile 1119) misst E2 an zwei Sätzen:

> *Fertig wenn: Findings ≥ HIGH blockieren; ein absichtlich eingecheckter
> Testschlüssel wird geblockt.*

Beide waren unerfüllt, weil es keinen einzigen Scanner gab. Die Frage war
nicht, welche Werkzeuge — die nennt der Bauplan — sondern **wo jedes einzelne
hingehört**. ADR 0030 hatte dafür eine Regel aufgestellt, die hier an ihre
Grenze kommt: *was einen Merge blockiert, ist lokal derselbe Befehl.*

## Entscheidung

### 1. Der Ordnungssatz, in zwei Hälften

> **a) Deterministische Tore laufen in `make check`. Zeitabhängige Tore laufen
> nur in der Pipeline — plus einem Wochenlauf.**
>
> **b) `make check` ist die Kette ohne Docker. Was einen Container braucht,
> wird ein eigenes Target außerhalb der Kette.**

`golangci-lint` und ESLint geben auf demselben Baum dasselbe Ergebnis; sie
gehören in die Kette, die ein Mensch vor dem Push fährt. `govulncheck`,
`npm audit` und Trivy werden rot, weil jemand anders eine CVE veröffentlicht
hat. Sie dort einzuhängen hieße, dass `make check` ohne Codeänderung
kaputtgeht — und ein Tor, das grundlos rot wird, ist ein Tor, um das herum
gearbeitet wird.

`gitleaks` ist der Fall, der Hälfte b) nötig macht: **deterministisch, aber
container-pflichtig.** Es landet deshalb als `make check-secrets` neben
`check-db`, mit derselben Begründung, die im Makefile schon bei `check-images`
steht.

Damit bleibt ADR 0030 intakt: jeder Schritt in `ci.yml` ist ein `make`-Ziel,
das auf einem Laptop identisch läuft. Die Ausnahme ist benannt statt
stillschweigend.

### 2. `gosec` läuft in `golangci-lint`, nicht daneben

Abweichung vom Bauplan-Wortlaut, der beide getrennt nennt. Identische
Regelmenge, ein Werkzeug weniger zu pinnen und zu aktualisieren, und `nolint`
statt einer zweiten Unterdrückungssyntax.

Aus demselben Grund ist `G104` bei gosec abgeschaltet: es ist gosecs Nachbau
von errcheck. Eines von beiden besitzt unbehandelte Rückgabewerte, mit einer
Ausschlussliste, die jemand liest — zwei hieße zwei Listen, von denen eine
driftet.

### 3. Die Regelmenge wurde gemessen, dreimal falsch

**69 Findings** auf `744ff9d`, 44 im Produktionscode, 25 in Tests. Alle
gelesen. **Vier echte Defekte**, jeder mit einem Test, der ohne den Fix rot
ist:

| Fund | Was wirklich passierte |
|---|---|
| `DB_MAX_CONNS` > 2³² | `positive()` wies ≤0 ab; die `int32`-Konvertierung machte aus `4294967306` still eine **10**. Eine Zahl, die niemand getippt hat, akzeptiert als hätte es jemand — in einem Loader, dessen Versprechen (ADR 0014) vollständige Validierung beim Start ist |
| `totalContributions` | Untergrenze in Go geprüft, Obergrenze dem CHECK-Constraint überlassen. Ein Ausreißer kam als Treiberfehler zurück statt als benannter |
| `mail.BareAddress` | `%v` wo der Fehler in die Kette gehört — bricht `errors.Is` für jeden Aufrufer |
| CSP-Assertion in `docs_test` | `strings.Index` plus Slice. Fehlt `script-src` je, **paniert** der Test mit Slice-Bounds statt verständlich zu scheitern |

**Der wiederkehrende Fehler war die Messung selbst.** Dreimal, in derselben
Form: ein Report, der früh aufhört, sieht aus wie ein Report, der nichts mehr
gefunden hat.

1. Der erste Lauf meldete **53** statt 69 — golangci-lint zeigt je Art nur die
   ersten drei Findings. 16 waren nie gedruckt, und zwei der vier Defekte
   tauchten erst im zweiten Durchgang auf. `issues.max-*` steht deshalb auf 0.
2. `cyclop` schwieg bei Schwelle 1 über Funktionen mit 11–16 — dieselben, die
   es bei Schwelle 10 meldet.
3. `funlen` meldet nur die **erste** seiner zwei Grenzen, die eine Funktion
   reißt. `config.Load` galt als 24 Statements; die 96 Zeilen erschienen erst,
   als die Statement-Grenze abgeschaltet war.

Invariante 1 sagt, dass keine Zahl in die UI darf, die kein System produziert
hat. Diese Phase hat gezeigt, dass sie auch für Zahlen über den eigenen Code
gilt.

### 4. Komplexität: `gocognit`, nicht `cyclop`

Gemessen im Produktionscode: kognitiv **19** (`translate`), Statements **43**
(`GetHealth`, `runMigrate`), Zeilen **96** (`config.Load`), zyklomatisch **16**
(`GetHealth`).

**`cyclop` ist nicht aktiviert, und `GetHealth` ist der Grund:** zyklomatisch
16, kognitiv 13. Es ist eine lange **flache** Kette von Guard-Clauses, die je
früh zurückkehren — der Stil, den dieses Repo absichtlich wählt. Zyklomatische
Komplexität kann das nicht von sechzehn geschachtelten Zweigen unterscheiden;
eine Grenze darauf würde Handler in Richtung Schachtelung drücken, um die Zahl
zu senken. Kognitive Komplexität macht genau diese Unterscheidung.

`gocognit` steht auf 20 — ein Punkt über `translate`, hingeschrieben statt
weggerundet. `funlen` trägt die Regel auf der Statement-Achse (60); die
Zeilen-Achse ist mit 150 ein Auffangnetz, weil `config.Load` mit 96 Zeilen und
24 Statements zeigt, dass Zeilen hier messen, wie viel erklärt wurde.

Kosten der Grenzen: **kein Refactoring.** Eine Sperrklinke gegen
Verschlechterung ist die einzige Art Grenze, die einen Monat später noch an
ist.

### 5. Der Testschlüssel-Beweis läuft dauerhaft

`make check-secrets` pflanzt einen Schlüssel in ein Wegwerf-Repository und
verlangt, dass gitleaks ihn ablehnt — **bevor** es diese History scannt. Der
zweite Schritt allein könnte nie bemerken, dass die Allowlist inzwischen alles
entschuldigt: ein Scanner, der aufgehört hat zu scannen, sagt „no leaks found"
mit denselben Worten wie einer, der arbeitet.

Der Schlüssel wird **erzeugt**, nicht hingeschrieben. Ein Literal im Skript
würde von dem Scan gefunden, zu dem es gehört, und bräuchte einen eigenen
Allowlist-Eintrag — die Prüfung stolpert über ihren eigenen Test.

**Git-Modus, nie `gitleaks dir`.** `.env` und `.env.l1-backup` liegen
ungetrackt mit echten Werten im Arbeitsbaum; ein Verzeichnis-Scan läse sie und
schriebe Treffer in ein Log.

### 6. Was die History enthielt

Vierzig Commits, 4,3 MB, **fünf Funde** — alle dieselben zwei synthetischen
Tokens aus C7, über drei Testdateien. **Keine Rotation nötig.** Das war die
offene Frage vor dem ersten Lauf, und sie ist gemessen beantwortet.

Die Allowlist hat deshalb zwei Werte statt der geplanten zwölf. Alles, was sie
entschuldigen sollte — `dev_only_not_a_secret` in `.env.example`,
`github_pat_not_a_real_token_…`, `ghp_not_a_real_token`, der
`0123456789abcdef…`-Pepper — wurde nie gemeldet, weil die Standardregeln
Entropie wiegen und diese Werte fast keine haben.

Die zwei sind nur in `_test.go` entschuldigt, `condition = "AND"`: dieselbe
Zeichenkette in `api/` ist weiterhin ein Fund, und jedes **andere** Token in
einer Testdatei ebenso.

### 7. Rechte so eng wie möglich, Actions so wenige wie möglich

`permissions: contents: read` auf Workflow-Ebene. **Genau ein Job hebt das an:**
`codeql` bekommt `security-events: write`, weil der Upload sein einziger Zweck
ist. Trivy, gitleaks und govulncheck blockieren über den Exit-Code — ein
schönerer Security-Tab ist es nicht wert, drei weiteren Jobs ein Token zu
geben, das in die Sicherheitsdaten dieses Repos schreibt.

Drei Actions kamen dazu, alle auf Commit-SHA: `golangci-lint-action` (setzt nur
das Binary), `trivy-action`, `codeql-action`. gitleaks läuft aus einem
digest-gepinnten Image, govulncheck über `go run` — **ohne Action**, weil das
Werkzeug, das eine Lieferkette prüft, sie nicht verbreitern sollte.

`.golangci-lint-version` ist die eine Stelle, an der die Linter-Version steht;
die Action liest sie über `version-file`, `check-lint.sh` hält das installierte
Binary dagegen. `install-only: true` sorgt dafür, dass in CI wirklich
`make check` lintet und nicht eine zweite Definition derselben Prüfung in YAML.

### 8. Dependabot: `direct` auf gomod und npm

`go.mod` trägt 65 indirekte Zeilen, 41 davon `sqlc` und `oapi-codegen` —
Werkzeuge, deren Code nie ins Binary kommt. Mit Standardeinstellungen öffnet
Dependabot PRs für alle, und die Antwort auf zu viele PRs ist nie „Dependabot
später abschalten".

**Was das aufgibt, ist benannt:** eine indirekte Abhängigkeit mit CVE, über der
sich nichts Direktes bewegt hat. Diesen Fall deckt `govulncheck` ab, das den
ganzen Graphen liest und über Erreichbarkeit berichtet statt über
Versionsnummern.

`docker-compose` ist ein **eigenes** Ökosystem, gegen das veröffentlichte
Schema geprüft statt angenommen: `docker` liest nur Dockerfiles. Ohne diesen
Block wäre der Postgres-Digest aus #93 der eine Pin im System, den nie etwas
anhebt — genau die Lage, um die es in #93 ging.

### 9. Der erste Fund kam vor dem ersten Lauf

Trivy meldete sieben HIGH/CRITICAL im web-Image — npms eigene
Bundle-Abhängigkeiten im Node-Basisimage, nicht unsere. Kein Digest-Bump half
(der gepinnte *ist* der aktuelle), `--ignore-unfixed` auch nicht (jede hat eine
Fix-Version). Das Tor wäre rot angekommen und rot geblieben, und das ist der
Zustand, den ein Tor nicht überlebt.

Behebbar war etwas anderes: **einen Paketmanager in einem Produktionscontainer
auszuliefern.** Die Runner-Stage installiert nichts, kopiert den
Standalone-Baum und startet `node server.js` — npm, npx und corepack sind dort
Angriffsfläche ohne Zweck. Ohne sie: null Funde.

Das ist die Regel hinter §1 in ihrer schärfsten Form. Ein Scanner, dessen
einzige mögliche Antwort „ignorieren" gewesen wäre, hätte nichts bewiesen; hier
war die Antwort, weniger auszuliefern.

## Konsequenzen

- Die zwei Abnahmesätze aus Bauplan Zeile 1119 sind erfüllt, und der erste
  läuft bei jedem `make check-secrets` statt einmal vorgeführt worden zu sein.
- `make check` bleibt Docker-frei und wächst um `check-lint`.
- Zwei neue Targets außerhalb der Kette: `check-secrets`, `check-vuln`.
- Fünf Jobs statt drei. Die Kontexte für #29 heißen `check`, `db`, `images`,
  `scan`, `codeql`.
- Beide Images tragen OCI-Labels (#111); E3 und E4 finden eine Kette vor, die
  von einem veröffentlichten Artefakt zum Commit zurückführt.

### Was das kostet

- **Die Linter-Version bewegt kein Dependabot.** Sie steht in
  `.golangci-lint-version`, und kein Ökosystem kennt diese Datei. Ein Mensch
  muss sie heben. Benannt statt versteckt.
- **CodeQL gegen das 5-Minuten-Budget.** E1 lag bei 2:27. Ob CodeQL danebenpasst,
  entscheidet die Messung nach dem ersten Lauf; passt es nicht, verliert der
  Job den `pull_request`-Trigger und behält `push` und `schedule`.
- **Dependabot-Erstwelle.** Vier Basis-Digests, die Actions und der
  Postgres-Digest wollen einmal durchgesehen werden.
- **ESLint strict misst heute fast nichts.** `web/` sind zwei Dateien. Die
  Regeln sind da, um dem Code aus Stufe G zu begegnen, nicht umgekehrt — das
  gehört gesagt, damit es später nicht wie eine Messung aussieht.
- **Die generierten Contract-Typen werden nicht gelintet.** Der Streit wäre mit
  `openapi-typescript` zu führen, und `check-contract` beweist ohnehin, dass
  die Datei nicht veraltet ist.

## Verworfene Alternativen

**`golangci-lint` als `tool`-Direktive in `api/go.mod`.** Ein Weg für alle
Werkzeuge, kein separater Installationsschritt. Verworfen: ~100 neue
`// indirect`-Zeilen an einem Modul mit elf direkten Abhängigkeiten, genau das
Rauschen, das #63 vermeiden will, und ein SBOM in E3, das Lint-Abhängigkeiten
als Programmabhängigkeiten führt.

**Ein eigener `lint`-Job.** Verworfen, als `install-only` gefunden war: der Job
hätte den Linter über die Action gefahren und damit dieselbe Prüfung ein
zweites Mal definiert, in YAML.

**SARIF-Upload für alle Scanner.** Schönere Oberfläche, aber
`security-events: write` für vier Jobs statt für einen.

**`gitleaks-action`.** Verlangt für Organisationen einen Lizenzschlüssel. Das
Image tut dasselbe und folgt der Digest-Regel, die dieses Repo ohnehin
erzwingt.

**`golang/govulncheck-action`.** Eine Fremd-Action mehr für etwas, das
`go run pkg@version` ohne Weiteres tut — und ohne `go.mod` anzufassen.

**`gitleaks dir` zusätzlich zum Git-Modus.** Fände ein Geheimnis, bevor es ein
Commit wird. Verworfen: es läse ungetrackte `.env`-Dateien mit echten Werten
und schriebe Treffer in Logs.

## Belege

- 69 Findings, gemessen auf `744ff9d` mit abgeschalteten Report-Grenzen;
  44 Produktion, 25 Tests. Vier Defekte behoben, jeder mit rotem Test ohne Fix.
- Fünf gitleaks-Funde über 40 Commits, alle synthetische Test-Fixtures,
  keine Rotation.
- `govulncheck`: lokal sauber, **im ersten CI-Lauf rot** — und zu Recht.
  `api/go.mod` deklarierte `go 1.26.0`, `setup-go` liest diese Datei und pinnt
  die Toolchain mit `GOTOOLCHAIN=local`, also lief CI auf einer stdlib mit
  **21 erreichbaren** Schwachstellen (Symbol Results mit Aufruf-Traces, nicht
  bloß „required"). Das ausgelieferte Binary war nie betroffen: `api/Dockerfile`
  baut aus `golang:1.26-alpine`, dessen gepinnter Digest go1.26.6 ist.
  **Der Defekt war die Drift** — die Pipeline prüfte sechs Patch-Releases
  neben dem, was das Image baut. Auf einem Laptop unsichtbar, weil dort schon
  1.26.6 lief. Behoben mit einer Zeile; die fehlende Prüfung zwischen `go.mod`
  und dem Build-Image steht im Backlog für E2b.
- `npm audit --omit=dev`: sauber.
- OCI-Labels an beiden Images mit `docker inspect` gelesen, nicht behauptet.
  Dabei fiel auf, dass `image.version` den Backup-Tag aus #112 veröffentlicht.
- `actionlint` über `ci.yml`: keine Findings.
- **Trivy fand sieben HIGH/CRITICAL im web-Image, bevor die Pipeline ein
  einziges Mal gelaufen war** — alle in npms eigenen Bundle-Abhängigkeiten
  (`tar`, `undici`, `ip-address`, `brace-expansion`) im Node-Basisimage. Weder
  durch einen Digest-Bump behebbar (der gepinnte Digest *ist* der aktuelle)
  noch durch `--ignore-unfixed` (jede hat eine Fix-Version). Behoben, indem die
  Runner-Stage npm, npx und corepack nicht mehr ausliefert: sieben Funde
  vorher, null nachher, beide Zahlen gemessen. Das api-Image war von Anfang an
  sauber.
- **Job-Laufzeiten, Run 32493542206** (PR #126, erster vollständig grüner Lauf
  der fünf Jobs):

  | Job | Dauer |
  |---|---|
  | `check` | 2:14 |
  | `images` | 2:00 |
  | `db` | 1:45 |
  | `codeql (go)` | 1:29 |
  | `codeql (javascript-typescript)` | 1:10 |
  | `scan` | 0:42 |

  **Wall-Clock 2:15.** E1s Kriterium ist PR-Feedback unter 5 Minuten und lag
  bei gemessenen 2:27 mit drei Jobs. Fünf Scanner später ist die Zahl
  unverändert — nicht weil sie nichts kosten, sondern weil die
  Feedback-Zeit der langsamste Job ist und keiner der neuen ihn überholt.

- **Die CodeQL-Frage ist entschieden: es bleibt auf `pull_request`.** Beide
  Sprachen liegen unter dem `images`-Job und tragen deshalb null zur
  Wall-Clock bei. Der im Workflow beschriebene Rückzug auf `push` +
  `schedule` tritt nicht ein — die Begründung ist eine gemessene Zahl, so wie
  es dort steht.
