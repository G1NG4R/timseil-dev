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

---

## Die Secrets, die der `deploy`-Job braucht

**Nicht in `tools/github-setup.sh`, und das ist Absicht.** Das Skript setzt
Einstellungen; ein Secret, das es setzen könnte, müsste es zuerst irgendwo
lesen — und dann läge der Wert an einer dritten Stelle. Diese sechs werden von
Hand gesetzt, einmal, und hier steht wo sie herkommen.

```bash
gh secret set VPS_SSH_HOST        # die Adresse des VPS
gh secret set VPS_SSH_PORT        # der SSH-Port — NICHT 22 auf diesem Host
gh secret set VPS_SSH_USER        # ci-deploy
gh secret set VPS_SSH_KEY   < ~/.ssh/ci-deploy      # der PRIVATE Schlüssel
gh secret set VPS_KNOWN_HOSTS                        # siehe unten
gh secret set DOKPLOY_API_KEY     # Dokploy → Settings → API/CLI
gh secret set DOKPLOY_COMPOSE_ID  # steht in der URL der Compose-App
gh secret set INTERNAL_DEPLOY_TOKEN   # KOPIERT aus Dokploy, nicht neu erzeugt
```

**Der Port ist kein Geheimnis und liegt trotzdem hier.** Dieses Repository ist
öffentlich; die Zahl in `ci.yml` zu schreiben gäbe das bisschen aus der Hand,
das ein Port abseits von 22 überhaupt einbringt. Einen Vorgabewert hat er
absichtlich nicht — ein stilles Zurückfallen auf 22 würde ein fehlendes Secret
in eine Zeitüberschreitung verwandeln statt in einen Satz, der das fehlende
Secret nennt.

Den Host-Key holst du dir so — **mit `-p`**, und du **prüfst den Fingerabdruck
gegen den, den dein eigener `known_hosts` schon kennt**, sonst pinnst du, was
gerade geantwortet hat:

```bash
ssh-keyscan -p <port> -t ed25519 <host> | tee /tmp/hk
ssh-keygen -lf /tmp/hk                    # gegen ssh-keygen -F '[<host>]:<port>' vergleichen
gh secret set VPS_KNOWN_HOSTS < /tmp/hk
```

Auf einem Port abseits von 22 schreibt `ssh-keyscan` den Eintrag als
`[host]:port`. Genau diese Form braucht der Job auch, weil er mit `-p`
verbindet — ein Eintrag ohne Klammern passt dann auf nichts und der Deploy
scheitert an `Host key verification failed`.

### Wo dieselben Werte sonst noch liegen

Ein Wert an zwei Stellen ist ein Wert, den man bei der Rotation an einer Stelle
vergisst. Deshalb steht das hier als Tabelle und nicht als Nebensatz:

| Wert | GitHub | Dokploy | VPS |
|---|---|---|---|
| `INTERNAL_DEPLOY_TOKEN` | Secret | Env-Variable | — |
| `DOKPLOY_API_KEY` | Secret | Settings → API/CLI | — |
| `VPS_SSH_KEY` | Secret (privat) | — | `authorized_keys` (öffentlich) |
| `VPS_SSH_PORT` | Secret | — | `/etc/ssh/sshd_config` |

**Rotation `INTERNAL_DEPLOY_TOKEN`:** neuen Wert erzeugen → in Dokploy
eintragen → deployen → **erst dann** das GitHub-Secret setzen. In der
umgekehrten Reihenfolge meldet der nächste Deploy eine `401` und die Dauer geht
verloren, obwohl der Deploy geglückt ist.

**Rotation `VPS_SSH_KEY`:** neues Paar erzeugen → den neuen öffentlichen
Schlüssel **zusätzlich** in `authorized_keys` (mit derselben
`command=…,permitopen=…`-Zeile aus `docs/runbooks/dokploy.md` 3.4) → GitHub-Secret
setzen → einen Deploy abwarten → alten Eintrag entfernen. Nie andersherum: der
Deploy-Job ist dann der Erste, der es merkt, und er merkt es an einer roten
Produktion.

### Was der Job damit darf

`contents: read` und `actions: read`, sonst nichts — kein `packages`, kein
`id-token`, kein `attestations`. Der `deploy`-Job kann kein Image pushen und
keines signieren; `publish` kann beides und kann nicht deployen. Der
SSH-Schlüssel kann einen Tunnel auf einen Port öffnen und kein Kommando
ausführen.

### Scharfschalten

Der Job läuft erst, wenn **alle acht Secrets stehen** und die fünf API-Angaben
in `tools/deploy.sh` am laufenden Panel nachgemessen sind (ADR 0033 §8). Dann:

```bash
gh variable set DEPLOY_ENABLED --body true
gh variable list
```

Zurücknehmen geht genauso — `--body false`. Solange die Variable fehlt oder
etwas anderes als `true` enthält, zeigt Actions den Job **grau/übersprungen**.
Das ist die richtige Anzeige: nicht grün, denn es wurde nichts deployt, und
nicht rot, denn es ist nichts kaputt.

### `deploy` steht nicht in den Required Contexts

Aus demselben Grund wie `publish` und `quickstart`: er läuft nicht auf Pull
Requests. Ein geforderter Kontext, der nie meldet, sperrt `main` dauerhaft —
und dann gilt der Abschnitt „`main` nimmt nichts mehr an" weiter oben.

---

## Die Aufbewahrung in GHCR — ein Schalter, vielleicht ein Token

Seit E4b räumt der `retention`-Job in `ci.yml` montags die Registry auf: die
letzten zehn Builds je Paket bleiben, der Rest geht, und der Build, den
Produktion fährt, bleibt in jedem Fall. Die Regel selbst und ihre Begründung
stehen in `docs/runbooks/dokploy.md` 3.5; hier steht nur, was auf GitHub dafür
gesetzt sein muss.

### Erst zusehen, dann scharf schalten

Der Job hat zwei Schritte. Der erste — `make prune-registry` — druckt den Plan
und löscht nichts; er braucht kein Geheimnis und läuft ab sofort jede Woche. Der
zweite läuft nur mit:

```bash
gh variable set GHCR_PRUNE_ENABLED --body true
```

**Vorher zwei Wochen zusehen.** Der Plan muss Woche für Woche derselbe sein.
Bewegt er sich in einer Woche, in der nichts gemerged wurde, ist die Regel
falsch — und das ist der einzige Zeitpunkt, an dem man das noch feststellen
kann, bevor etwas fehlt. Zurücknehmen geht wie beim Deploy, `--body false`.

### Das Token, und warum hier eine Frage offen steht

Gelöscht wird über die Packages-API; die Registry-API kann es nicht. Der Job
trägt `packages: write` und greift auf `secrets.GHCR_PRUNE_TOKEN` zurück, sonst
auf das Token des Laufs.

**Ob das Lauf-Token reicht, ist nicht gemessen.** Die beiden Pakete liegen in
einem **Nutzer**-Namensraum, nicht in dem einer Organisation, und dafür sind die
Regeln andere als für den Push. Der Beleg dagegen ist klein, aber deutlich: ein
gewöhnlich angemeldetes `gh` kann die Versionen dieser Pakete nicht einmal
lesen — `403, You need at least read:packages scope`.

Reicht es nicht, sagt `tools/prune-registry.sh` das im Fehlertext, und der Weg
ist ein Token mit `read:packages` und `delete:packages` als
`GHCR_PRUNE_TOKEN`. Es gehört dann in dieselbe Rotation wie die acht Werte
oben — mit einer Lebensdauer, nicht ohne.

**Die erste scharfe Löschung von Hand.** Weil es ein Skript ist und kein
Workflow-Baustein, geht das:

```bash
GHCR_TOKEN=… make prune-registry-apply
```

Danach die Abnahme, die als einzige zählt: `make verify-supply-chain` für
**jeden** behaltenen Build. Signatur, SBOM-Attestierung, Provenance und der
Gegentest mit der falschen Identität müssen alle weiter durchlaufen. Die
Bündel sind ungetaggt und hängen nur am Index — wenn eine Aufräumregel etwas
kaputtmacht, dann genau das, und nur dieser Befehl merkt es.
