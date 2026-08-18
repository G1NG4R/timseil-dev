# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

**Letzte Triage: nach Stufe D, 18.08.2026.** 22 Zeilen → **11 Issues**
(#88–#98), **4 erledigt**, 2 hatten schon eins
([#84](https://github.com/G1NG4R/timseil-dev/issues/84) und
[#77–#83](https://github.com/G1NG4R/timseil-dev/issues/77)), und eine wurde ein
Kommentar an [#40](https://github.com/G1NG4R/timseil-dev/issues/40), wo die
Entscheidung ohnehin fällt.

**Für Stufe L1 offen, aber kein Backlog-Eintrag:** `MAIL_TRANSPORT=log` steht
beim ersten Deploy in Dokploy und muss dort wieder auf `smtp`, sobald das
Postfach existiert. Es steht an drei Stellen im Runbook, weil es die eine
absichtliche Zwischenlösung dieser Stufe ist.

---

**Neu seit der Triage: die Vorbereitung des ersten Deploys, 18.08.2026.**
Der Host wurde zum ersten Mal von innen gelesen, und er ist nicht der Host, den
der Bauplan annimmt. Das meiste unten stammt aus dieser einen Runde.

## Verschoben — bewusste Entscheidung

- **Der HTTP→HTTPS-Redirect kommt erst nach dem ersten Deploy.** *(D3,
  18.08.2026)* `compose.yaml` hat keinen Router auf Entrypoint `web`, Dokploys
  Traefik hat keinen globalen Redirect — also antwortet `http://timseil.dev`
  mit 404 statt 301, und die Abnahme in Teil 4 scheitert an dieser einen Zeile.
  Der Fix ist bewusst **danach**: der Certresolver nutzt `httpChallenge` über
  genau diesen Entrypoint, und ein leerer Port 80 ist der sauberste Zustand für
  die erste Zertifikatsausstellung. Fünf Fehlversuche pro Hostname und Stunde
  sind das Budget, das man dabei nicht ausreizt. Danach als eigener PR mit
  eigener `redirectscheme`-Middleware — **nicht** Dokploys
  `redirect-to-https@file`, denn was der Host hält und das Repo nicht
  versioniert, ist nach dem nächsten Dokploy-Upgrade weg. `check-compose`
  Regel 13 verlangt am neuen Router eine explizite `priority`.

## Gefunden — Bug oder Unklarheit

- **Der Bauplan nannte 6–9 GB RAM, gemessen waren 3,7 GiB — erledigt durch
  Upgrade.** *(D3, 18.08.2026)* Beim ersten Blick von innen: `total 3.7Gi ·
  used 2.6Gi · available 1.1Gi · Swap 0B`, elf Container, davon **Dokploy allein
  879 MiB**. Unsere Limits summieren sich auf 1,25 GiB — ohne Swap ein
  OOM-Risiko, und getroffen hätte es `dokploy-postgres` und damit alle vier
  Projekte, nicht nur uns. **Noch am selben Abend auf 12 GB RAM und 100 GB Platte
  hochgerüstet**, damit gegenstandslos. 24 GB wurden erwogen und sind nicht
  nötig: ~2,6 GiB belegt, unser Stack real ~0,4 GiB, Stufe F geschätzt 2 GiB —
  das landet bei 5–6 von 12.

  **Was bleibt, ist die Lehre, nicht die Zahl:** die Ausstattung stand im
  Bauplan als Annahme und wurde nie gegen die Maschine gehalten. Swap ist
  weiterhin nicht eingerichtet — bei 12 GB kein Blocker, als Netz trotzdem
  richtig.

- **`/etc/dokploy` steht auf 0777 ohne Sticky-Bit.** *(D3, 18.08.2026)*
  `traefik/` und `dynamic/` sind darunter korrekt 0755 root — direkt
  hineinschreiben kann niemand. Aber Schreibrecht auf ein Verzeichnis erlaubt
  das Umbenennen und Löschen seiner Einträge, egal wem die gehören: ein
  beliebiger lokaler Nutzer kann `traefik/` zur Seite schieben und einen eigenen
  Baum an dessen Stelle setzen. Der laufende Bind-Mount folgt dem alten Inode,
  beim nächsten Traefik-Neustart greift der neue Pfad. Die Reparatur ist 0755,
  **nicht** das Sticky-Bit. Nicht neu, und durch unseren Deploy nicht schlimmer.

- **`crowdsecLapiKey` liegt im Klartext in einer world-readable Datei.** *(D3,
  18.08.2026)* `/etc/dokploy/traefik/dynamic/middlewares.yml` ist `-rw-r--r--`.
  Der Schlüssel ist beim Lesen in ein Sitzungstranskript gelaufen, also ist
  **Rotieren** der eigentliche Schritt; `chmod 0600` ist nur die Nachsorge.
  Traefik läuft als `uid=0` und die Datei gehört `0:0`, ein 0600 würde sie also
  lesbar lassen — ob Dokploy den Modus beim nächsten eigenen Schreibvorgang auf
  0644 zurücksetzt, ist ungeprüft. **Rotieren betrifft alle vier Projekte auf
  dem Host** (der Bouncer steht global vor `websecure`) und gehört deshalb an
  einen geplanten Termin, nicht neben einen Deploy. `acme.json` ist korrekt 0600.

- **Ein CrowdSec-Bouncer steht global auf `websecure` und in keinem Blatt.**
  *(D3, 18.08.2026)* Jede Anfrage an `timseil.dev` läuft durch `crowdsec@file`
  (Plugin `crowdsecLAPI` gegen `crowdsec:8080`). Blockt er, sieht das von außen
  aus wie ein Anwendungsfehler. Gehört in `docs/runbooks/dokploy.md` Teil 5 als
  **erster** Verdacht, und er interagiert mit unserem eigenen Rate-Limit und
  `TRUSTED_PROXY_CIDRS`.

- **Traefiks API läuft mit `insecure: true`.** *(D3, 18.08.2026)* Port 8080 ist
  nicht auf den Host veröffentlicht, also nur aus `dokploy-network` erreichbar —
  aber dort ohne jede Authentifizierung, und auf diesem Netz sitzen vier fremde
  Projekte. Kein Blocker, widerspricht aber „von außen erreichbar sind 22, 80,
  443 — sonst nichts" dem Geist nach. → **L3**.

- **Traefiks `access.log` wächst ungebremst und ist world-readable.** *(D3,
  18.08.2026)* 3,90 MB → 4,34 MB in zwei Stunden, rund **220 KB/h**, keine
  Rotation geprüft. `/`, `/var/lib/docker` und `/etc/dokploy` liegen auf
  **einer** Partition (`/dev/sda1`, 38G, 13G belegt, 26G frei) — das bestätigt
  die Annahme in CLAUDE.md, dass Loki ein GRÖSSEN-Limit braucht und nicht nur
  Zeit-Retention.

- **Unser wöchentlicher Prune ist auf diesem Host überflüssig.** *(D3,
  18.08.2026)* Dokploy v0.30.0 räumt selbst auf: `enableDockerCleanup` steht an,
  der Job `docker-cleanup` läuft nach `CLEANUP_CRON_JOB = "50 23 * * *"` täglich
  um 23:50 UTC und ruft unter anderem `docker system prune --all --force`. Auf
  Host-Ebene existiert nichts — keine Crontab bei `root` oder `ubuntu`, kein
  Docker-Timer. Dokploys Lauf ist **strikt schärfer** als unser wöchentlicher mit
  `--filter until=168h`; unserer täte nichts, was jener nicht schon tut. Die
  Einstellung bleibt an — sie ist die einzige Bremse gegen volllaufende
  Image-Layer auf einem Dateisystem, das sich `/`, `/var/lib/docker` und später
  Loki und Postgres teilen. **Schritt 7.3 des Runbooks stimmt damit nicht mehr:**
  er rät, unseren Timer zu installieren und „eine der beiden" abzuschalten. Der
  Timer gehört zur Rückfallebene, nicht zum Normalfall. Ebenso der
  Rollback-Absatz: Dokploys tägliches `docker image prune --all` entfernt den
  vorherigen Stand schon in der Nacht nach dem Deploy, nicht erst nach einer
  Woche — ein Rollback beginnt praktisch immer mit `docker pull`.

  Nebenbefund, der davon unberührt bleibt: der Riegel `[ -d /etc/dokploy ]` in
  `ops/host/prune.sh` nahm an, „der VPS" heiße „unser VPS". `docker system
  prune -a` ist hostweit und träfe auch `baskewitschlu`, `schoulbus`,
  `vaultwarden` und die Utilities. Für uns verschmerzbar, weil GHCR die
  Aufbewahrung ist; für Projekte, die als Dokploy-„Application" auf dem Host
  gebaut werden, womöglich nicht.

- **Der Volume-Prune-Knopf in Dokploys Oberfläche kostet `timseil_db-data`.**
  *(D3, 18.08.2026)* Der **automatische** Job ist nachweislich ungefährlich, und
  zwar aus demselben Grund, den wir befürchtet hatten. In
  `@dokploy/server/dist/utils/docker/utils.js` steht `volumes` in
  `excludedCleanupAllCommands`, mit dieser Begründung im Quelltext: *„during
  automatic cleanup, a volume may be deleted due to a stopped container, which
  is a dangerous situation"* — Upstream
  [Dokploy/dokploy#3267](https://github.com/Dokploy/dokploy/pull/3267). Unser
  Szenario ist also der dokumentierte Anlass, aus dem es dort herausgenommen
  wurde. Empirisch bestätigt: 14 Volumes, 11 aktiv, **3 ungenutzte liegen seit
  Tagen unangetastet da** (6,3 MB reclaimable). Auch **„Clean All" in der
  Oberfläche ist sicher** — dieselbe `cleanupAll`-Route, dieselbe Ausnahme.

  Gefährlich ist genau **ein** Knopf: der Volume-Prune in der
  Docker-Disk-Usage-Ansicht. Er ruft direkt
  `docker volume prune --all --force`, und `--all` nimmt seit Docker 23 auch
  **benannte** ungenutzte Volumes — `timseil_db-data` ist benannt und wäre von
  der alten Semantik geschützt gewesen, von dieser nicht. Das Fenster sind die
  Sekunden zwischen `down` und `up` eines Redeploys. **Keine Konfiguration
  verhindert das; nur der Satz im Runbook: Volume-Prune über die Oberfläche ist
  während eines Redeploys verboten.**

- **Kein Deploy zwischen 23:45 und 00:00 UTC.** *(D3, 18.08.2026)* Dokploys
  `docker-cleanup` läuft um 23:50 UTC und fährt `docker system prune --all
  --force` — gestoppte Container, ungenutzte Netze, alle nicht referenzierten
  Images. Der Wrapper `dockerSafeExec` wartet bis zu 300 s auf einen ruhenden
  Docker, **startet danach aber trotzdem**. Ein Redeploy in diesem Fenster
  überschneidet sich also mit dem Prune. Volumes sind dabei nicht in Gefahr,
  alles andere schon. In CEST ist das **01:45 bis 02:00**. Gehört ins Runbook,
  Teil 2.3.

- **Der Deploy-Typ ist eine Bedingung, die das Runbook nicht nennt.** *(D3,
  18.08.2026)* Docker läuft auf diesem Host im **Swarm-Modus**,
  `dokploy-network` ist `overlay` mit `attachable=true`. Dokploys Typ „Compose"
  ruft `docker compose up` auf (gewöhnliche Container, Traefiks docker-Provider,
  Labels wie geschrieben), Typ „Application" erzeugt Swarm-Services. Bei
  „Application" bräche `compose.yaml` **still**: Labels müssten unter
  `deploy.labels`, `traefik.docker.network` hieße `traefik.swarm.network`, und
  `name: timseil` würde ignoriert — keine Router, kein Fehler. Gehört als
  Bedingung ins Runbook und in ADR 0028.

- **Der Runbook-Absatz zu `exposedByDefault` ist gegenstandslos.** *(D3,
  18.08.2026)* Teil 1.1 behandelt `exposedByDefault: true` als Rauschen, das man
  hinnimmt. Auf diesem Host steht es bei **beiden** Providern auf `false`. Der
  Absatz kann weg oder muss die Prüfung anders formulieren.

- **Das Datenbank-Volume heißt nicht so, wie überall geschrieben steht.** *(D3,
  18.08.2026)* Dokploy startet mit `docker compose -p
  timseildev-timseildev-eixe3r …` und überschreibt damit `name: timseil` aus
  `compose.yaml` Zeile 45 — die `-p`-Flagge sticht das Feld in der Datei. Da
  `db-data:` ohne eigenes `name:` deklariert ist, erbt es das Projektpräfix und
  heißt real **`timseildev-timseildev-eixe3r_db-data`** — am 18.08.2026 nach dem
  ersten erfolgreichen Deploy mit `docker volume ls` bestätigt, keine Vermutung. Runbook, die Kommentare
  in `ops/host/prune.sh` und der Volume-Prune-Eintrag hier sprechen alle von
  `timseil_db-data`. Unter dem Namen findet es niemand.

  **Die Folge ist größer als ein falscher Name:** wird die Dokploy-App neu
  angelegt oder ändert sich das generierte Suffix, ist das ein *anderes* Volume
  — die Datenbank wäre leer, und die alte läge als „unbenutzt" daneben, in
  Reichweite genau des Knopfes aus dem Eintrag darüber. Die Reparatur ist eine
  Zeile: `db-data:` ein explizites `name: timseil_db-data` geben, dann ist der
  Name vom Projektnamen unabhängig.

  **Jetzt noch billig, später nicht.** Heute enthält die Datenbank nur, was
  `migrate` und `seed` bei jedem Deploy ohnehin neu herstellen — ein
  Namenswechsel kostet also nichts. Sobald echte Daten drin sind (Kontakt-
  nachrichten, Betriebsmessungen ab Stufe F), wird daraus eine Migration.

- **Dokploys Schalter „Create Environment File" verwirft das Environment
  lautlos.** *(D3, 18.08.2026)* Fünf Deploys scheiterten an
  `required variable IMAGE_TAG is missing a value`, obwohl die 16 Zeilen
  korrekt gespeichert waren (1431 Zeichen in Dokploys DB). Ursache:
  `createEnvFile` stand auf `false`.

  ```js
  // @dokploy/server .../utils/builders/compose.js:13
  const envCommand = compose.createEnvFile ? getCreateEnvFileCommand(compose) : "";
  // :47
  env -i PATH="$PATH" HOME="$HOME" ${exportEnvCommand} docker ${command…}
  ```

  Ist der Schalter aus, wird `envCommand` zum Leerstring — **kein Schreiben,
  keine Warnung, kein Log-Eintrag**. Und `env -i` löscht die Prozessumgebung bis
  auf `PATH` und `HOME`, sodass nichts nachrücken kann. Der dritte mögliche Weg,
  `getExportEnvCommand`, greift nur bei `composeType === "stack"`; unserer ist
  `docker-compose`. Ein `--env-file` baut Dokploy nicht ins Kommando. **Die
  `.env` neben der Compose-Datei ist der einzige Kanal.**

  Gehört ins Runbook, Teil 2.2, als Voraussetzung neben den Compose-Pfad: der
  Schema-Default ist `true`, alle vier anderen Stacks auf dem Host stehen auf
  `t` — bei uns war er aktiv aus. Die Option wird in der Oberfläche nur bedingt
  gerendert und ist deshalb leicht zu übersehen.

  Bemerkenswert dabei: **die drei `${VAR:?…}`-Wächter haben diesen Abend
  gerettet.** Hätten `IMAGE_TAG`, `POSTGRES_DB` und `POSTGRES_USER` Defaults,
  wäre der Stack gestartet — mit leerem `POSTGRES_PASSWORD`, leerer
  `DATABASE_URL` und leerem `CONTACT_IP_PEPPER`, weil alle übrigen Variablen die
  nachsichtige `${VAR:-}`-Form tragen. Die Datenbank wäre mit falschen Werten
  initialisiert worden, bevor irgendwer etwas gemerkt hätte.

- **Der Compose-Pfad in Dokploy steht per Default auf `./docker-compose.yml`.**
  *(D3, 18.08.2026)* Unsere Datei heißt `compose.yaml`, der erste Deploy brach
  mit `Error: Compose file not found` ab. Das Runbook nennt in Teil 2.1 zwar das
  Feld „Compose-Pfad" mit dem Wert `compose.yaml`, sagt aber nicht, dass dort ein
  abweichender Standard steht, den man aktiv überschreiben muss — und der
  Fehlertext nennt den erwarteten Pfad, nicht das Feld. Ein Satz im Runbook
  spart die Runde.

- **Dokploy legt die Geheimnisse 0644 weltlesbar ab, und das ist nicht
  abstellbar.** *(D3, 18.08.2026, nach dem ersten erfolgreichen Deploy)*
  `/etc/dokploy/compose/timseildev-timseildev-eixe3r/code/.env`, Modus
  **`-rw-r--r-- root:root`**, 1192 Bytes, 19 Schlüssel (unsere 16 plus
  `APP_NAME`, `COMPOSE_PROJECT_NAME`, `DOCKER_CONFIG` aus `compose.js:109-114`).
  Darin im Klartext: beide DB-Passwörter, das Bootstrap-Passwort, der Pepper und
  die zwei internen Tokens. Schreiben darf nur root — **lesen jeder Prozess und
  jeder Account auf dem Host.**

  Einordnung ohne Dramatik: der Pfad darüber ist 0755 root, außer root gibt es
  keinen Shell-Account, und 0644 ist das, was Dokploy für **jeden** Stack anlegt
  — wir stehen nicht schlechter da als die anderen vier. Es ist Dokploys
  Entscheidung, kein Konfigurationsfehler von uns.

  **Ein `chmod 600` hilft nicht:** die Datei wird bei jedem Deploy neu erzeugt
  (`touch` + `base64 -d >`), die Rechte fallen also zurück. Härtung geht nur
  über die Dateisystem-Ebene oder externes Secret-Management, nicht über eine
  Dokploy-Einstellung. Gehört zu **L3** und in die Prüfliste in Anhang F.

- **Erster Messpunkt für [#88](https://github.com/G1NG4R/timseil-dev/issues/88)
  (Ressourcen-Limits gegen echte Werte).** *(D3, 18.08.2026, vier Minuten nach
  dem Start, ohne Last)* `web 42,8 MiB / 512M · api 6,8 MiB / 256M ·
  db 44,0 MiB / 512M` — zusammen **unter 94 MiB**. Der Host hat 11 GiB mit
  8,9 GiB verfügbar; der größte Nachbar ist Dokploy selbst mit 1,25 GiB.

  Die ehrliche Schlussfolgerung: bei Faktor 37 Abstand zwischen Ist und Limit
  **schützt das Limit derzeit vor gar nichts** — es fängt ein Speicherleck, aber
  keine Lastspitze. Das ist genau die Frage, die #88 nach einer Woche
  `docker stats` beantworten soll. Weiterhin **kein Swap**: ein OOM träfe sofort
  und hart.

- **`/api/health` veröffentlicht einen Backup-Tag als Versionsnummer.** *(D3,
  18.08.2026, beim ersten erfolgreichen Deploy)* Der Health-Endpoint liefert
  öffentlich `"version": "backup/pre-rewrite-2026-08-17-22-g3890180"`. Ursache:
  `VERSION := $(shell git describe --tags --always --dirty)` im Makefile, und im
  Repo liegt genau **ein** Tag — `backup/pre-rewrite-2026-08-17`. `git describe`
  hängt sich daran und baut den Namen in die Ldflags des Binaries.

  Eine Seite, deren These „jede Behauptung ist an einen Beleg gebunden" lautet,
  gibt damit als Erstes eine Versionsangabe heraus, die nichts bedeutet — sie
  nennt einen lokalen Sicherungspunkt vor einem History-Rewrite. Der `sha`
  daneben stimmt und trägt die Aussage; die `version` trägt sie nicht.

  Zwei Wege: den Tag entfernen (dann liefert `git describe --always` den
  blanken SHA), oder echte Release-Tags einführen — **E5 bringt
  `release-please`** und damit `v1.2.3`, das ist die eigentliche Antwort. Bis
  dahin ist die Frage, ob ein bedeutungsloser String besser ist als gar keiner.
  Nebenaspekt: der Tag ist lokal; baut später Actions, sieht `git describe` ihn
  nur, wenn er gepusht wurde — die Version wiche also zwischen lokalem Build
  und CI-Build ab.

- **Das Laufzeit-PAT läuft ab, und nichts sagt Bescheid.** *(D3, 18.08.2026)*
  `GITHUB_TOKEN` ist ein klassisches PAT mit `read:user`, das dauerhaft im
  `api`-Container steckt und `contributionsCollection` abfragt. GitHub schlägt
  bei klassischen Tokens **30 Tage** als Standard vor. Läuft es ab, hört der
  Contribution-Kalender auf, sich zu aktualisieren — und der Cache in Postgres
  plus der Breaker aus ADR 0020 sorgen dafür, dass die Seite **weiter Zahlen
  zeigt**, nur eben alte. Das ist genau die Sorte Fehler, gegen die Invariante 1
  geschrieben ist: keine erfundenen Zahlen, `null` statt Fantasie.

  Zwei Fragen, beide offen: läuft die Kalenderantwort bei abgelaufenem Token
  wirklich in ein sichtbares `— NO DATA`, oder serviert sie still den alten
  Stand weiter? Und wo wird das Ablaufdatum überhaupt festgehalten — heute
  nirgends. Gehört spätestens zu **F** (Alert) und zur Prüfliste vor dem Launch.

- **Beide Dockerfiles setzen keine OCI-Labels — die GHCR-Pakete hängen an
  keinem Repository.** *(D3, 18.08.2026)* Weder `api/Dockerfile` noch
  `web/Dockerfile` tragen eine `LABEL`-Zeile, insbesondere kein
  `org.opencontainers.image.source`. GitHub verknüpft ein Container-Paket aber
  genau darüber mit seinem Repo: ohne das Label erscheint es nicht auf der
  Repo-Seite unter „Packages", sondern nur unter dem Profil — beim ersten
  Umstellen auf public war es deshalb nicht auffindbar. Es fehlen außerdem
  `revision` und `version`, obwohl `VERSION` und `GIT_SHA` als Build-Args schon
  ins `api`-Image gehen und dort in den Ldflags landen.

  Mehr als Kosmetik: **E3 baut auf dieser Kette auf** (SBOM, cosign, SLSA-
  Provenance). Eine Provenance-Aussage über ein Image, das auf kein Repository
  zeigt, ist die halbe Aussage. Gehört nach D1 nachgezogen — kostet zwei Zeilen
  je Dockerfile, aber einen Rebuild und einen erneuten Push.

- **Ein PAT mit `write:packages` gehört nicht in die Laufzeit-Env der API.**
  *(D3, 18.08.2026)* Runbook 0.1 verlangt **ein** klassisches PAT mit zwei
  Scopes: `write:packages` für den einmaligen Push in 1.3 und `read:user` als
  `GITHUB_TOKEN` für den Contribution-Graph. Dasselbe Token landet damit als
  Laufzeit-Variable im `api`-Container — und der hält dann Push-Rechte auf GHCR.
  Wird die API kompromittiert, ist der Weg zu einem manipulierten Image in der
  Registry offen, aus der Dokploy zieht: ein Lieferketten-Pfad, den die Seite
  sonst nirgends zulässt.

  **Zwei Token statt einem**, das kostet dreißig Sekunden: eins nur mit
  `write:packages`, einmal auf der eigenen Maschine für den Push benutzt und
  danach gelöscht — ab E4 macht Actions das ohnehin selbst; und eins nur mit
  `read:user`, das als `GITHUB_TOKEN` nach Dokploy geht. Runbook 0.1 und der
  Zettel in 0.4 müssen das trennen.

- **Zwei Commits auf `main` tragen `Co-authored-by: Claude Opus 5`.** *(gefunden
  bei der Kontrolle nach Stufe D, 18.08.2026)* `dce4110` (#2) und `690a835` (#4).
  Das Autor-Feld ist bei beiden korrekt `G1NG4R`; nur der Trailer im Body steht
  drin. Beide sind älter als #15, die Regel in CLAUDE.md ist als Reaktion darauf
  entstanden und hat seitdem gehalten. Rausbekommen nur per History-Rewrite und
  Force-Push auf `main`. **Entscheidung offen** — vertretbar ist auch, es stehen
  zu lassen: die Regel, die daraus entstand, steht im Repo und ist belegbar
  eingehalten worden.

## Idee — noch nicht entschieden

- **Eigener Beobachtbarkeits-Stack oder der, der schon läuft?** *(D3,
  18.08.2026)* ADR 0008 und CLAUDE.md planen `alloy`, `prometheus` (7d), `loki`
  (14d) und `grafana` auf diesem Host. Auf ihm laufen bereits ein `grafana`, ein
  `prometheus` und ein `victoriametrics` für die anderen Projekte, dazu
  `vaultwarden`, `mailrelay` und `crowdsec`. Portkollisionen drohen nicht — unsere
  Dienste haben nur `expose:` —, aber 3,7 GiB RAM und eine geteilte Partition
  machen „doppelt" zu einer Entscheidung statt zu einer Selbstverständlichkeit.
  Dagegen steht die These der Seite: sie läuft auf dem Stack, den sie
  beschreibt. Gehört vor **Stufe F** entschieden, vermutlich als ADR-Revision
  zu 0008.
