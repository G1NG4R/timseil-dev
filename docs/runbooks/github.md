# Runbook — GitHub: Branch Protection und wenn `main` zu ist

**Leser:** ich, an dem Tag, an dem `main` nichts mehr annimmt.

Alles hier ist in `tools/github-setup.sh` kodiert. Das Skript ist idempotent
und die einzige Quelle: **eine Änderung ist ein Commit, kein Klick.** Wer in
der Oberfläche etwas verstellt, hat es beim nächsten Lauf des Skripts wieder
verloren — und das ist Absicht.

## Was auf `main` gilt

| Regel | Wert |
|---|---|
| Pull Request nötig | ja, `required_approving_review_count: 0` |
| Erforderliche Checks | sieben, siehe unten |
| `strict` | `false` — kein Rebase-Zwang bei jedem Merge |
| Lineare Historie | erzwungen |
| Force-Push, Löschen | verboten |
| `enforce_admins` | **`true` — die Regeln gelten auch für mich** |

Die sieben Kontexte:

```
check · db · images · scan · codeql (go) · codeql (javascript-typescript) · CodeQL
```

Sechs kommen aus `.github/workflows/ci.yml`. Der siebte, `CodeQL` mit großem Q,
kommt vom Code-Scanning-Dienst und wird rot, wenn ein PR **neue Alerts**
einbringt. Ohne ihn gälte „Findings ≥ HIGH blockieren" für jeden Scanner außer
diesem einen.

**`quickstart` steht bewusst nicht in der Liste.** Der Job läuft nicht auf
Pull Requests; ihn zu fordern hieße, einen Kontext zu fordern, der dort nie
berichtet — und das sperrt `main` dauerhaft.

## `main` nimmt nichts mehr an

Der übliche Grund: ein geforderter Kontext berichtet nicht mehr. Etwa weil ein
Job umbenannt wurde, weil die Matrix eine Sprache verloren hat, oder weil Code
Scanning abgeschaltet wurde.

Erkennbar daran, dass der PR *Expected — Waiting for status to be reported*
zeigt, statt rot zu sein.

**Der Weg zurück, in dieser Reihenfolge:**

1. Nachsehen, welcher Kontext fehlt:

   ```bash
   gh pr checks <N>
   gh api repos/G1NG4R/timseil-dev/branches/main/protection \
     --jq '.required_status_checks.contexts'
   ```

2. Die Sperre für Admins kurz lösen — **nur so lange, wie die Reparatur
   dauert:**

   ```bash
   gh api -X DELETE repos/G1NG4R/timseil-dev/branches/main/protection/enforce_admins
   ```

3. Die Ursache beheben. Ist ein Job umbenannt worden, wandert der neue Name in
   `tools/github-setup.sh` — nicht in die Oberfläche.

4. Wieder scharfstellen:

   ```bash
   gh api -X POST repos/G1NG4R/timseil-dev/branches/main/protection/enforce_admins
   tools/github-setup.sh
   ```

Schritt 2 ist der einzige Handgriff in diesem Repo, der eine Sicherheitsregel
absichtlich aufhebt. Er gehört in denselben Tag zurückgenommen, an dem er
gemacht wurde.

## Was geprüft ist und was nicht

**Geprüft, am 21.08.2026:** ein PR mit rotem `check` wird abgewiesen. PR #132
trug absichtlich einen Marker ohne Issue-Referenz, `check` wurde rot, und
`gh pr merge` antwortete:

```
X Pull request #132 is not mergeable: the base branch policy prohibits the merge.
```

Der PR ist danach geschlossen worden; er sollte nie gemergt werden.

**Nicht geprüft:** ob `gh pr merge --admin` die Sperre umgeht. `enforce_admins`
steht auf `true`, also sollte es das nicht — aber die Probe hätte bedeutet, die
absichtlich kaputte Datei auf `main` zu riskieren, falls die Annahme falsch ist.
Der Satz, auf den es ankam, war schon bewiesen.

Wer das doch wissen will, prüft es an einem Wegwerf-Repository mit derselben
Konfiguration, nicht an diesem.

## Einen Kontext hinzufügen oder entfernen

`tools/github-setup.sh`, Block `required_status_checks`. Danach das Skript
laufen lassen. Zwei Bedingungen, beide schon einmal teuer gewesen:

- **Der Kontext muss auf einem Pull Request erscheinen.** Ein Job mit
  `if: github.event_name != 'pull_request'` erscheint dort nie.
- **Der Name muss exakt stimmen**, inklusive Matrix-Suffix:
  `codeql (go)`, nicht `codeql`.

## Was das Skript sonst noch setzt

Squash-only, PR-Titel wird das Commit-Subject, Branch wird beim Merge gelöscht.
Deshalb gilt beim Mergen: **ohne `--subject` und ohne `--body`.** Sonst fehlt
das `(#N)` im Verlauf — passiert bei #16, nachzulesen in CLAUDE.md.
