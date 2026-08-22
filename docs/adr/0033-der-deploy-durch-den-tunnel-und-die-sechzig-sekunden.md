# ADR 0033 — Der Deploy durch den Tunnel und die sechzig Sekunden

**Status:** Angenommen
**Datum:** 2026-08-22
**Betrifft:** E4, E5, F4, L3
**Invarianten:** 1 (keine erfundenen Zahlen — auch nicht darüber, was gemessen wurde)

## Kontext

Nach E3 baute, prüfte, scannte, pushte, signierte und attestierte die Pipeline
jeden Merge auf `main`. Danach hörte sie auf. Den letzten Schritt machte ein
Mensch: `make image-tag` lesen, den Wert in der Dokploy-Oberfläche in
`IMAGE_TAG` eintragen, „Deploy" drücken, im Browser nachsehen. Der Kopf von
`ci.yml` sagte es selbst — *„There is still no deploy; nothing here talks to
Dokploy, and that is E4."*

Drei Dinge hingen an diesem Handgriff:

1. **Die Deploy-Dauer auf der Fallstudie war unbelegt.** `POST /api/internal/deploy`
   war seit der C-Stufe fertig — Handler, Tabelle `deploys`, `ops.lastDeploy`
   auf `/api/health` — und niemand rief ihn. Die Seite zeigte korrekt
   `— NO DATA`.
2. **Rollback war eine Absicht.** Das Systemhandbuch, Kapitel 26, verlangt:
   *„Liefert `/api/health` nach sechzig Sekunden kein `200`, rollt der Deploy
   zurück und der Job schlägt fehl."* Das Runbook beschrieb stattdessen einen
   Klickweg im Panel.
3. **Auf dem VPS lief der schlechteste Stand, den es gab** — `sha-3890180`, von
   einem Arbeitsplatz gepusht, unsigniert.

Der Zwang, der alles andere bestimmt hat, kommt aus einer späteren Stufe: **L3
schließt die Dokploy-Oberfläche.** Bauplan Zeile 1308 und Systemhandbuch 1106:
kein Traefik-Router, Port in der Firewall zu, Zugriff nur über
`ssh -L 3000:localhost:3000`. Jeder Deploy-Weg, der eine öffentlich erreichbare
Dokploy-API voraussetzt, wäre in L3 wieder abzureißen gewesen.

## Entscheidung

**Die Pipeline deployt durch einen SSH-Tunnel über Dokploys eigene API, und ein
Deploy, der nach sechzig Sekunden nicht antwortet, rollt sich selbst zurück.**

### 1. Der Tunnel, nicht die öffentliche API

`tools/deploy.sh` spricht mit `127.0.0.1:3000`. Actions öffnet vorher
`ssh -N -L 3000:127.0.0.1:3000`. Die Pipeline geht damit durch dieselbe Tür wie
der Mensch, und L3 muss nichts abreißen, was E4 gerade gebaut hat.

Der Schlüssel, der diese Tür öffnet, kann fast nichts. In `authorized_keys`:

```
restrict,port-forwarding,permitopen="127.0.0.1:3000",command="/bin/false" ssh-ed25519 …
```

Ein Forward auf einen Port, kein Kommando, keine Shell, kein `sudo`, keine
Docker-Gruppe. `restrict` statt einer Liste aus `no-…`, weil eine Liste nur
abdeckt, was es beim Schreiben gab, und `restrict` auch das, was OpenSSH später
dazubekommt — dieselbe Überlegung, aus der `permissions:` in jedem Workflow
`contents: read` als Decke setzt und einzeln erweitert. Die Gegenprobe steht im
Runbook: eine Beschränkung, die nie getestet wurde, ist keine.

### 2. Dokploy bleibt Eigentümer des Deploys

`IMAGE_TAG` wird über Dokploys API gesetzt, nicht über ein `docker compose` auf
dem Host. Dokploy hält die Umgebung, den Checkout und schreibt die `.env`, aus
der Compose `${IMAGE_TAG}` auflöst. Wer daran vorbei deployt, hinterlässt ein
Panel, das etwas anderes sagt als der laufende Container — und der nächste
Klick auf „Deploy" dort wäre ein stiller Rollback. ADR 0030 hat einen zweiten
Weg in dieselbe Datenbank aus demselben Grund abgelehnt.

### 3. Sechzig Sekunden, an einer Stelle

Die Zahl steht in `tools/verify-deploy.sh` und sonst nirgends. Sie stammt aus
Handbuch Kapitel 26 und aus der Beschreibung von `GET /api/health` im Contract
— beide sagen sechzig. Ein zweites Mal in YAML geschrieben wäre sie eine Zahl,
die driftet; dasselbe Argument, das `make image-tag` überhaupt erst existieren
lässt.

### 4. Vier Bedingungen, nicht eine

Geprüft wird **von außen, über den öffentlichen Namen** — nicht durch den
Tunnel, nicht gegen eine Container-IP:

| # | Bedingung | Warum sie einzeln nötig ist |
|---|---|---|
| 1 | `/api/health` antwortet `200` | die API läuft überhaupt |
| 2 | `.status` ist `ok` | sie läuft und ist nicht `degraded` |
| 3 | `.sha` ist der Commit, der deployt wurde | es läuft der **bestellte** Build |
| 4 | `/` antwortet `200` | der web-Container kam auch hoch |

Die dritte ist die, die ein gewöhnlicher Uptime-Check nicht macht. Ein
`docker compose up` mit unveränderter `.env` ist ein erfolgreicher No-op: alle
Container gesund, die Pipeline grün, und der vorherige Build serviert weiter.
Von außen sieht das exakt wie ein guter Deploy aus, solange niemand den SHA
vergleicht. Die vierte ist da, weil zwei Images deployt werden und nur eines
einen Health-Endpunkt hat.

### 5. Ein Rollback ist ein Fehlschlag

`tools/deploy-gate.sh` geht nach einem geglückten Rollback mit `1` heraus. Der
Rollback hat funktioniert, der Deploy nicht — ein grüner Haken darüber wäre die
Pipeline, die es sich bequem macht.

### 6. Die gemessene Dauer ist der ganze Lauf

`durationSec` ist `jetzt − run_started_at`, gelesen aus der Actions-API. Das ist
die Spanne, die die Fallstudie mit `BUILD + DEPLOY` beschriftet: die sieben
Schritte vom Push bis zum Verify. Ein `date` am Anfang des `deploy`-Jobs hätte
die letzten zwei Schritte gemessen und die Antwort als alle sieben ausgegeben.
Invariante 1 gilt nicht nur dafür, **ob** etwas eine Zahl produziert hat,
sondern auch dafür, **was** sie gemessen hat.

Deshalb hat `DEPLOY_STARTED_AT` keinen Vorgabewert — weder im Makefile noch im
Skript.

### 7. Weiterhin nur `sha-<7>`

Der Bauplan nennt in der E4-Zeile auch die Tags `v1.2.3` und `latest`. Beide
kommen hier nicht. `v1.2.3` entsteht mit `release-please` in E5, und `latest`
verbietet der Rollback-Abschnitt des Dokploy-Runbooks ausdrücklich: Rollback
braucht einen Namen, der nicht umgehängt werden kann. `tools/deploy.sh` weist
jeden Tag ab, der nicht `sha-` plus sieben Hex-Zeichen ist.

### 8. Scharfgeschaltet wird mit einem Schalter, nicht mit dem Merge

Der `deploy`-Job läuft nur, wenn die Repository-Variable `DEPLOY_ENABLED` auf
`true` steht.

Ein übersprungener Job ist die ehrliche Darstellung von „noch nicht scharf" —
Actions zeigt ihn grau, nicht grün. Die Alternative wäre, den Job laufen zu
lassen, das fehlende Secret zu bemerken und mit `0` herauszugehen; das wäre ein
grüner Haken über einem Deploy, der nicht stattgefunden hat. Dieselbe bequeme
Lüge, die §5 für den Rollback ablehnt.

Der Schalter bleibt auch nach der Messung stehen, denn er beantwortet eine
zweite Frage: **läuft dieser Deploy gegen einen Host, der dafür eingerichtet
ist?** Acht Secrets, ein beschränkter Schlüssel, ein API-Key mit Organisation.
Ein Fork, ein zweiter Host oder ein wiederhergestelltes Repository hat das alles
nicht — und soll dann nicht deployen, sondern übersprungen werden.

### 9. Geschrieben wird über `saveEnvironment`, nicht über `update`

Beide erreichen dieselbe Spalte. Der engere gewinnt: `compose.saveEnvironment`
nimmt als Eingabe exakt `{composeId, env}` und prüft `envVars: ["write"]`, wo
`compose.update` `service: ["create"]` verlangt. Ein Deploy hat kein Recht auf
eine Berechtigung, die Dienste anlegen kann — dieselbe Rechnung, die dem
`deploy`-Job in `ci.yml` `packages: write` verweigert.

Dass der Schreibvorgang partiell ist, wurde vor dem ersten Schreiben geprüft
und nicht danach: `updateCompose` setzt nur die übergebenen Schlüssel
(`.set({...rest})`), Branch, Domains und Netze bleiben unberührt.

`createEnvFile` wird **geprüft, nicht gesetzt**. Steht der Schalter aus,
verwirft Dokploy das Environment lautlos — kein Schreiben, keine Warnung, kein
Log-Eintrag — und der Deploy scheitert später an einer Meldung über
Interpolation, die auf etwas ganz anderes zeigt. `tools/deploy.sh` bricht
vorher ab und nennt den wahren Grund. Ihn stillschweigend umzulegen wäre eine
Pipeline, die eine Fehlkonfiguration versteckt, statt sie zu melden.

## Konsequenzen

- Ein Merge auf `main` erreicht die Produktion ohne Menschen. Der Abschnitt
  „Der Handgriff" in `docs/runbooks/dokploy.md` verschwindet; der Klickweg
  bleibt als Handbetrieb daneben stehen, weil er der Weg ist, wenn die Pipeline
  nicht kann.
- **Expand/Contract ist ab jetzt Bedingung, nicht Empfehlung.** Der Code rollt
  automatisch zurück, das Schema nicht. Eine Migration, die eine Spalte löscht,
  macht den Automatismus zu einem Ausfall. `docs/runbooks/migrations.md`.
- Sechs neue Repository-Secrets, aufgeführt in `docs/runbooks/github.md`.
- `deploy` kommt **nicht** in die Required Contexts. Er läuft nicht auf Pull
  Requests, und ein Kontext, der nie meldet, sperrt `main` dauerhaft — dieselbe
  Begründung, die `publish` und `quickstart` draußen hält.
- Die Sperre für 23:45–00:00 UTC lebt jetzt im Skript, nicht nur in `CLAUDE.md`.
  Sie gilt damit auch für einen Menschen an der Tastatur, und sie misst die
  Uhrzeit mit `date -u`, statt sie zu schätzen.

### Was das kostet

**Das komplette Produktions-Environment läuft durch den Runner.** Dokploys
`compose.update` ersetzt das Feld als Ganzes; um eine Zeile zu ändern, müssen
alle gelesen werden — also jedes Secret, das die Anwendung kennt. In
`tools/deploy.sh` heißt das: `umask 077` vor `mktemp -d`, kein `set -x`, keine
Env-Zeile nach stdout, und das Verzeichnis fällt auf jedem Ausgang. Das ist die
eine unangenehme Eigenschaft dieses Weges. Sie wird hier benannt statt
weggelassen, und sie verschwindet von selbst, sobald eine Dokploy-Version ein
partielles Update anbietet — dann wird das Skript kürzer.

**Zwei Geheimnisse mehr an einem zweiten Ort.** `INTERNAL_DEPLOY_TOKEN` liegt ab
jetzt in Dokploy **und** in GitHub. Ein Wert an zwei Stellen ist ein Wert, der
bei der Rotation an einer Stelle vergessen wird; das Runbook sagt deshalb, dass
er nicht neu erzeugt, sondern kopiert wird, und wo beide Kopien liegen.

**Ein Fremdsystem in der Kette.** Die fünf API-Angaben oben in `tools/deploy.sh`
sind am laufenden Panel gemessen — **Dokploy v0.30.0, 22.08.2026** — und gegen
Dokploys Quelltext gehalten, nicht aus dem Verhalten erraten. Mit einer
Einschränkung, die dazugehört: `compose.one` und `compose.saveEnvironment` sind
live ausgeführt (letzteres, indem das Environment **unverändert**
zurückgeschrieben wurde — ein Leerlauf, der den Weg beweist).
`compose.deploy` ist nur aus der Quelle belegt, denn es auszuführen **ist** ein
Deploy. Der erste echte Deploy ist seine Prüfung, und der Rollback aus §5 ist
das Netz darunter. Ein Upgrade kann
sie trotzdem bewegen; sie stehen deshalb in einem Block an einer Stelle, und
jede wird unten genau einmal benutzt, damit eine falsche laut an diesem einen
Aufruf scheitert statt einen halben Deploy zu hinterlassen.

**Was die Messung gekostet hat, gehört dazu.** Ein Dokploy-API-Key ist
wertlos, wenn seine `organizationId` fehlt — `validateRequest`
(`packages/server/src/lib/auth.ts`) verifiziert den Key, liest dann
`organizationId` aus dessen `metadata` und gibt **gar keine Sitzung** zurück,
wenn dort nichts steht. Ein von Hand über den Auth-Endpunkt erzeugter Key hat
`metadata: null`, ist in der Datenbank gültig und `enabled`, und antwortet auf
jedem Pfad `401 {"message":"Unauthorized"}`. Dokploys eigener Knopf hängt die
Organisation an; der Umweg über die Konsole nicht. Drei Stunden, ein Satz im
Runbook.

**Eine offene Flanke, die E4 nicht schließen darf.** L3 blockt `/api/internal/*`
am Traefik. Dann erreicht weder dieser Deploy-Report noch die Actions-Probe aus
F4 die API von außen. Das ist eine gemeinsame Entscheidung von E4, F4 und L3 und
wird hier **aufgeschrieben statt umgangen** — bis dahin trägt der Weg den Token
über TLS, und `tools/report-deploy.sh` nennt bei einer `404` ausdrücklich, dass
genau das später so aussehen wird.

## Verworfene Alternativen

**Dokploy-API direkt über HTTPS**, mit `x-api-key` an einem öffentlichen Router.
Weniger Bewegteile, kein SSH-Schlüssel. Verworfen an L3: die Oberfläche mit
vollem Zugriff auf Host, Deploys und sämtliche Secrets ist das lohnendste Ziel
der Maschine (Handbuch 1106). Ein Deploy-Weg, der ihre Erreichbarkeit
voraussetzt, wäre in drei Stufen wieder abzureißen — und bis dahin stünde das
Panel offen.

**SSH und `docker compose up` direkt im Dokploy-Checkout.** Kein API-Key, ein
Kommando weniger. Verworfen, weil es zwei Wege in denselben Stack schafft: die
`.env`, die Dokploy schreibt, sagte weiter den alten Tag, und der nächste
UI-Deploy wäre ein stiller Rollback gewesen. Dazu bräuchte der CI-Schlüssel eine
Shell und die Docker-Gruppe, also faktisch Root auf dem Host — statt eines
Forwards auf einen Port.

**Dokploys Auto-Deploy-Webhook** auf `push`. Er zieht den Branch und deployt mit
der Umgebung, die schon da ist — also mit einem `IMAGE_TAG`, den niemand
aktualisiert hat. Er löst genau den Teil nicht, um den es geht.

**Die Rollback-Logik als `if: failure()`-Schritte in `ci.yml`.** Kürzer zu
schreiben und im Actions-Log hübscher aufgeteilt. Verworfen, weil das
Abnahmekriterium dieser Stufe lautet, dass der Rollback **wirklich ausgelöst**
wurde: eine Logik, die nur ein Merge auf `main` auslösen kann, probiert man
einmal. Als `tools/deploy-gate.sh` läuft dieselbe Datei im Drill von einem
Laptop gegen die Produktion.

## Belege

Bauplan Kapitel 10 und Zeile 1124–1127 (E4), Zeile 1308 (L3).
Systemhandbuch Kapitel 25 und 26, Abschnitt 27 zur Dokploy-Oberfläche.
Contract: Beschreibung von `GET /api/health` und `POST /api/internal/deploy`,
Schemata `DeployReport` und `DeployResult`.
`api/internal/intake/validate.go` — die Regeln, die `tools/report-deploy.sh`
wiederholt, statt sie durch eine `400` zu erfahren.
ADR 0026 (das geprüfte Artefakt ist das laufende), ADR 0027 (Compose-Topologie),
ADR 0028 (Dokploy, Netze, Platte), ADR 0030 (kein zweiter Weg in dasselbe
System), ADR 0031 (was `make check` trägt und was die Pipeline trägt).
Issue #90 — die zweite Hälfte, die GHCR-Aufbewahrung.
