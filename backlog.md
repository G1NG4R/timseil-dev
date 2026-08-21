# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

**Letzte Triage: nach E2, 21.08.2026.** 15 Zeilen → **11 in der Stufe selbst
erledigt**, **2 als Kommentar an bestehende Issues**, **1 bewusst verworfen**,
**1 als Abnahme dieser Phase offen**.

Stufe E2 lief über zwei Pull Requests — E2a (#126, Scanner und Lieferkette),
E2b (Doku-Drift und die Prüfungen aus den Issues) — plus einen Chore-PR (#129),
den die erste Dependabot-Welle nötig gemacht hat.

**Was die Scanner in ihrer ersten Woche gefunden haben**, weil es der Grund für
die Stufe ist und nicht als Fußnote taugt:

| Fund | Wo |
|---|---|
| `DB_MAX_CONNS` über 2³² wurde still auf **10** gekürzt statt abgelehnt | golangci-lint, ADR 0031 §3 |
| `totalContributions` prüfte Unter- und Obergrenze an zwei verschiedenen Orten | dito |
| `mail` verkettete einen Fehler mit `%v` — bricht `errors.Is` | dito |
| Eine CSP-Assertion wäre mit Slice-Bounds paniert statt zu scheitern | dito |
| **7 HIGH/CRITICAL im web-Image**, alle in npms eigenen Bundle-Abhängigkeiten | Trivy, ADR 0031 §9 |
| **21 erreichbare stdlib-Schwachstellen**, weil `go.mod` `1.26.0` sagte und das Image auf `1.26.6` baute | govulncheck, ADR 0031 §Belege |
| Dependabots erste Welle bot drei verbotene Majors an | ADR 0031 §8, PR #129 |
| `go.sum` fehlten **49** Prüfsummen | `go mod tidy -diff`, ADR 0032 §Belege |
| Ein toter ADR-Verweis, zwanzig Minuten alt, von mir | `check-adrs`, ADR 0032 §Was das kostet |

**Die zwei, die an bestehende Issues gingen:**

| Issue | Was dazukam |
|---|---|
| [#112](https://github.com/G1NG4R/timseil-dev/issues/112) | Die OCI-Labels aus E2a veröffentlichen den Backup-Tag jetzt als `image.version` auf **jedem** Image. Vorher eine API-Antwort, ab E4 ein Artefakt in GHCR — **fällig vor E4**, nicht danach |
| [#45](https://github.com/G1NG4R/timseil-dev/issues/45) | Beide Images tragen `org.opencontainers.image.licenses="NOASSERTION"`. Sobald die Lizenzfrage entschieden ist, muss dieser Wert mitwandern, sonst behauptet das Image etwas anderes als das Repo |

**Das eine Verworfene:** der Gedanke, im `db`-Job den Runner-Cache in den
`migrate`-Container zu mounten. Er stand unter der Bedingung „nur wenn der Job
das 5-Minuten-Budget bedroht" — und die Bedingung ist jetzt gemessen und
falsch: `db` läuft in 1:45, die Wall-Clock des ganzen Laufs liegt bei 2:15. Der
Preis wäre eine CI-spezifische Compose-Override-Datei, also ein zweiter Weg in
dieselbe Datenbank, wovor ADR 0030 ausdrücklich warnt.

**Das eine Offene:** der `quickstart`-Job läuft nicht auf Pull Requests und ist
deshalb erst nach dem Merge messbar. Er ist die letzte offene Abnahme dieser
Phase, kein Backlog-Eintrag.

Vorherige Triage: nach L1, 20.08.2026 — 21 Zeilen → 4 Issues (#118–#121),
16 in der Phase erledigt, 1 nach L5 verschoben.

---

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-08-21 | E3b | **`sha-3890180` ist unsigniert und läuft auf dem VPS.** Bewusst in GHCR gelassen: es ist das Rollback-Ziel des laufenden Deploys, und es ist der Beleg dafür, dass die Signatur an einem Zeitpunkt begonnen hat statt behauptet zu werden. Der README benennt es. **Fällig mit E4** — sobald die Pipeline deployt, läuft eine Version, die sie selbst gebaut und signiert hat, und dann darf der alte Tag weg. Vorher nicht. | offen |
| 2026-08-21 | E3b | **Vier Werkzeug-Versionen, die kein Dependabot hebt.** `.golangci-lint-version` (E2), `.cosign-image` (E3b) und die Digests von gitleaks (`check-secrets.sh`) und syft (`sbom.sh`). Das Ökosystem `docker` liest Dockerfiles und Compose-Dateien, nicht Hashes in Shell-Skripten oder Textdateien. Bei vier Stellen wäre eine Prüfung billiger als die Disziplin — `check-versions.sh` wäre der Ort. | offen |
| 2026-08-21 | E3a | **Kein eigener ADR für diese Stufe** — die nächste freie Nummer bleibt frei. Die Regel, die E3 aufstellt — gültig ist nur eine Signatur, deren `certificate-identity` dieser Workflow auf `refs/heads/main` ist — lebt in den Kopfkommentaren von `tools/sign.sh` und `tools/verify-supply-chain.sh`, nicht in `docs/adr/`. Bewusst so entschieden; die drei ADRs vor diesem kamen jeweils mit ihrer Phase, dieser Bruch gehört benannt. Nebenbei: `check-adrs` verbietet, den Verzicht unter seiner Nummer aufzuschreiben — eine Prüfung, die eine bewusste Lücke nicht von einem toten Verweis unterscheiden kann. | offen |
| 2026-08-21 | E3a | **Sechs Schritte stehen zweimal in `ci.yml`** (`images` und `publish`). Der bezahlte Preis dafür, dass derselbe Job baut, prüft, scannt und veröffentlicht — sonst wäre das signierte Artefakt nicht das geprüfte (ADR 0026). Wird die Datei unübersichtlich, ist ein gemeinsames `make`-Ziel der Weg, keine Reusable Workflow. | bewusst |

## Gefunden — Bug oder Unklarheit

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-08-21 | E3a | **Kein Klickweg konnte die GHCR-Paket-Verknüpfung herstellen.** Vier rote `publish`-Läufe, alle an `denied: permission_denied: write_package`. Der Job hatte `Packages: write` (im Setup-Log nachgelesen), der Login gelang, die Pakete waren public, „Manage Actions access" war gesetzt, und die API meldete danach sogar `repo=G1NG4R/timseil-dev` — abgelehnt wurde trotzdem. Geholfen hat erst: Pakete löschen, die Pipeline legt sie neu an; das `image.source`-Label aus E2a verknüpft sie beim Push von allein. Kommt je ein drittes Paket dazu, ist das die Antwort, die man nicht zweimal suchen will. | gelöst, als Klasse offen |
| 2026-08-21 | E3a | **Der syft-Digest bewegt kein Dependabot.** `.github/dependabot.yml` liest Dockerfiles und Compose-Dateien, nicht einen Hash in einer `.sh`. `tools/sbom.sh` und `tools/check-secrets.sh` tragen damit zwei Versionen, die ein Mensch heben muss — dieselbe Klasse wie `.golangci-lint-version` aus E2. Drei Stellen sind der Punkt, an dem eine Prüfung dafür billiger wäre als die Disziplin. | offen |
| 2026-08-21 | E3a | **`licenses="NOASSERTION"` steht ab jetzt auch im SBOM.** Anschluss an [#45](https://github.com/G1NG4R/timseil-dev/issues/45): das Label war eine Behauptung an einem Image, ab E3b ist es ein Feld in einem signierten Dokument, das jemand herunterladen kann. Die Lizenzfrage wird damit teurer, je später sie beantwortet wird. | als Kommentar an #45 |
| 2026-08-21 | E3a | **[#90](https://github.com/G1NG4R/timseil-dev/issues/90) ist zur Hälfte erledigt.** Der Push kommt aus der Pipeline, die Brücke im Dokploy-Runbook ist abgebaut. Offen bleibt die zweite Hälfte: die GHCR-Aufbewahrung ist ungemessen, und solange sie das ist, hat „roll back to any previous deploy" einen Horizont, den niemand kennt. Bleibt E4. | offen |
| 2026-08-21 | #112 | **`internal/buildinfo` hat keine Testdatei.** Die Rückfallwerte `dev`/`unknown`, die Reihenfolge der zwei Quellen (ldflags vor Gos VCS-Stempel) und die Kürzung auf sieben Zeichen sind ungeprüft — in einem Paket, dessen Ausgabe auf `/api/health` steht und das gerade eine falsche Angabe veröffentlicht hat. Beim Fix aufgefallen, bewusst nicht mitgenommen, um den PR eng zu halten. | offen |
| 2026-08-21 | #112 | **Zwei Kommentare in `ci.yml` waren sachlich falsch**: sie begründeten die Checkout-Tiefe 1 damit, dass geholte Tags den Backup-Tag mitbrächten — der liegt nur lokal, GitHub hat null Tags. Eine Begründung, die plausibel liest und falsch ist; keine der vier Drift-Prüfungen aus E2 fängt Prosa über Git-Verhalten. | korrigiert im selben PR — als Klasse offen |

## Idee — noch nicht entschieden

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
