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

## Gefunden — Bug oder Unklarheit

| Datum | Aus Phase | Was | Status |
|---|---|---|---|

## Idee — noch nicht entschieden

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
