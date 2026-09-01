# Runbook — Dokploy, Traefik und die Platte

**Leser:** ich, wenn die Seite zum ersten Mal hochkommt, und ich, wenn sie
nicht mehr erreichbar ist und der Stack trotzdem grün aussieht.

Der VPS liegt bei OVH, verwaltet mit Dokploy (ADR 0008). Dokploy bringt Traefik
und Let's Encrypt mit — eine zweite Proxy-Instanz gibt es nicht und darf es
nicht geben, sie stritte um Port 80 und 443. ADR 0028 ist die Entscheidung,
`compose.yaml` die Datei, dieses Blatt der Weg.

**Von oben nach unten durcharbeiten.** Teil 0 bis 3 sind der erste Deploy und
bauen aufeinander auf; Teil 4 ist die Abnahme, Teil 5 die Fehlersuche.

---

## Die drei Startsperren — das hier zuerst lesen

`config.Load` prüft alles beim Start und **nennt jede fehlende Variable auf
einmal** (ADR 0014). Es gibt aber drei Fälle, in denen die API absichtlich gar
nicht erst hochkommt, und alle drei treffen genau diesen ersten Deploy:

| Sperre | Warum sie jetzt zuschlägt | Was du setzt |
|---|---|---|
| `MAIL_TRANSPORT` steht per Default auf `smtp` und verlangt dann `SMTP_USERNAME`, `SMTP_PASSWORD` und `MAIL_TO` | Beim ersten Deploy gab es das OVH-Postfach noch nicht — es kam mit **L1**, direkt nach dieser Phase | `MAIL_TRANSPORT=log`, aber **nur bis L1** |
| `CONTRIBUTIONS_TRANSPORT` steht per Default auf `github` und verlangt dann `GITHUB_TOKEN` | Du hast das Token vielleicht noch nicht | Entweder ein echtes PAT mit `read:user` — **oder** `CONTRIBUTIONS_TRANSPORT=off` |
| `CONTACT_IP_PEPPER`, `INTERNAL_PROBE_TOKEN`, `INTERNAL_DEPLOY_TOKEN` sind **immer** Pflicht, mindestens 32 Zeichen | Sie stehen in keiner Datei, du erzeugst sie in Teil 0 | `openssl rand -hex 32` |

**`MAIL_TRANSPORT=log` war eine bewusste Zwischenlösung, und L1 hat sie
aufgelöst.** Unter `log` baut die API die Mail und schreibt sie ins Log, statt
sie zu versenden — das Kontaktformular antwortete also mit 202, ohne
zuzustellen. Das ist der schlimmste Fehler, den dieser Endpoint hat, weil er von
beiden Seiten wie Erfolg aussieht.

**Wer diesen Stack heute neu aufsetzt, setzt `smtp`** und füllt die drei
Variablen aus dem Postfach; `log` steht hier nur noch, weil es der Zustand des
ersten Deploys war. Der Weg zurück auf `smtp` steht in
`docs/runbooks/mail.md`, Teil 2.

**Warum er zwischen D3 und L1 vertretbar war:** es gab noch keine Seite, die auf
das Formular postet — das Frontend kommt in Stufe G/H, das Formular selbst in
H8. Der Endpoint existierte, aber niemand konnte ihn erreichen. **Ginge die
Seite mit einem sichtbaren Formular live, während `log` steht, wäre das ein
Fehler.**

---

## Teil 0 — Was du vorher brauchst

### 0.1 Zugänge

- [ ] SSH auf den VPS, mit Schlüssel
- [ ] Login in die Dokploy-Oberfläche
- [ ] Zugriff auf die OVH-DNS-Zone für `timseil.dev`
- [ ] Ein GitHub-PAT — **klassisch**, nicht fine-grained, mit **genau einem
      Scope: `read:user`**. Das wird `GITHUB_TOKEN` für den Contribution-Graph.
      github.com/settings/tokens

      **Nicht `write:packages` dazunehmen.** Dieses Token geht in 0.4 als
      Laufzeit-Variable nach Dokploy und liegt damit im `api`-Container. Ein
      Container mit Push-Rechten auf GHCR ist ein Weg von einer kompromittierten
      API zu einem manipulierten Image in genau der Registry, aus der Dokploy
      zieht — ein Lieferketten-Schritt, den dieses Projekt sonst nirgends
      zulässt. Der Push braucht seit E3 ohnehin kein Token von dir: er passiert
      im `publish`-Job mit dem `GITHUB_TOKEN` der Action, das mit dem Job
      abläuft. Issue #109.

**Läuft der Stack schon?** Dann trägt Dokploy noch das Token aus der ersten
Fassung dieser Liste, und das hatte `write:packages`. Ersetzen, nicht
umschreiben — ein Scope wegzunehmen ändert nichts daran, dass der alte Wert in
Logs, Backups und Dokploys eigener Datei stand:

1. github.com/settings/tokens → neues klassisches Token, **nur `read:user`**.
2. In Dokploy `GITHUB_TOKEN` auf den neuen Wert setzen, Anwendung neu starten.
3. `curl -s https://timseil.dev/api/systems | head` — kommt der
   Contribution-Graph zurück, hat das neue Token gereicht.
4. **Erst dann** das alte Token auf github.com/settings/tokens löschen.

Schritt 4 zuletzt, damit ein Tippfehler in Schritt 2 keinen Ausfall erzeugt.

### 0.2 Die Geheimnisse erzeugen

Sechs Werte, alle auf deiner Maschine erzeugt und **nirgends im Repo**. Jeder
`openssl`-Aufruf liefert 64 Zeichen; die Untergrenze im Code ist 32.

```bash
for k in POSTGRES_PASSWORD MIGRATE_DB_PASSWORD APP_DB_PASSWORD \
         CONTACT_IP_PEPPER INTERNAL_PROBE_TOKEN INTERNAL_DEPLOY_TOKEN; do
  printf '%s=%s\n' "$k" "$(openssl rand -hex 32)"
done
```

**In den Passwortmanager, nicht in eine Datei neben dem Repo.** Die drei
Datenbank-Passwörter brauchst du gleich zweimal: einmal als eigene Variable und
einmal eingebaut in eine DSN.

### 0.3 Die zwei DSN zusammensetzen

Aus `APP_DB_PASSWORD` und `MIGRATE_DB_PASSWORD` wird je eine Verbindungszeichen-
kette. `db` ist der Hostname im Docker-Netz, `timseil` die Datenbank.

```
DATABASE_URL=postgres://timseil_app:<APP_DB_PASSWORD>@db:5432/timseil?sslmode=disable
MIGRATE_DATABASE_URL=postgres://timseil_migrate:<MIGRATE_DB_PASSWORD>@db:5432/timseil?sslmode=disable
```

Drei Dinge, die hier schiefgehen und je eine Stunde kosten:

- **`DATABASE_URL` trägt `timseil_app`, niemals `timseil_migrate`.** Die API
  läuft als DML-only-Rolle; `config.Load` weist die Migrations-Rolle
  ausdrücklich ab (ADR 0011). Genau andersherum bei `MIGRATE_DATABASE_URL` —
  und der `api`-Dienst bekommt die nie zu sehen.
- **`sslmode=disable` ist richtig.** Die Verbindung verlässt das Docker-Netz
  nicht; Postgres veröffentlicht keinen Port.
- **Sonderzeichen im Passwort müssen URL-kodiert werden.** `openssl rand -hex`
  liefert nur `0-9a-f`, deshalb ist das hier kein Thema — aber wenn du je ein
  Passwort von Hand setzt, ist es eins.

**Und die Falle darunter, die kein Passwort URL-kodieren kann:** Dokploy schreibt
die Umgebung in eine `.env` neben die Compose-Datei, und Compose **verändert beim
Einlesen still, was darin steht**. `$xyz` wird als Variablenname gelesen und durch
nichts ersetzt; `#` leitet einen Kommentar ein und schneidet den Rest ab.

Am 20.08.2026 gemessen: von einem 25-stelligen SMTP-Passwort kamen **17 Zeichen**
im Container an. Nachgewiesen über zwei SHA-256 — der Wert, der sich am Relay
anmeldet, gegen den, den `docker inspect` im Container zeigt.

**Deshalb: Geheimnisse ohne `$`, `#`, `"`, `'`, `\`, Backtick und Leerzeichen.**
Länge statt Zeichenvielfalt. Alles aus `openssl rand -hex 32` ist zufällig immun,
alles von Hand Gewählte nicht.

Der Hash-Vergleich ist die Gegenprobe, und er zeigt kein Geheimnis:

```bash
sudo docker inspect <container> \
  --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | sed -n 's/^SMTP_PASSWORD=//p' | tr -d '\n' | sha256sum
read -rsp 'Wert: ' PW; echo; printf '%s' "$PW" | sha256sum; unset PW
```

**Warum das gefährlicher ist, als es klingt:** SMTP antwortet mit
`535 5.7.1 Authentication failed` und nennt damit den Grund. Postgres tut das
nicht — ein verstümmeltes `POSTGRES_PASSWORD` scheitert beim ersten Start mit
einer Meldung über die Verbindung, nicht über den Wert.

### 0.4 Der Zettel, den du ausfüllst

Bevor du zur Dokploy-Oberfläche gehst, sollte das hier vollständig sein:

| Variable | Woher |
|---|---|
| `IMAGE_TAG` | **einmal** beim Anlegen: `make image-tag` auf `main`, Teil 1.3. Danach setzt ihn die Pipeline bei jedem Merge (E4, ADR 0033) — ein Wert von Hand hält bis zum nächsten |
| `POSTGRES_DB` | `timseil` |
| `POSTGRES_USER` | `timseil_boot` |
| `POSTGRES_PASSWORD` | 0.2 |
| `MIGRATE_DB_PASSWORD`, `APP_DB_PASSWORD` | 0.2 |
| `DATABASE_URL`, `MIGRATE_DATABASE_URL` | 0.3 |
| `GITHUB_TOKEN` | das PAT aus 0.1, `read:user` und sonst nichts — oder leer lassen **und** die Zeile darunter setzen |
| `CONTRIBUTIONS_TRANSPORT` | nur wenn `GITHUB_TOKEN` leer bleibt: `off`. Sonst gar nicht setzen |
| `GITHUB_LOGIN` | `G1NG4R` — hat denselben Wert als Default im Code, du kannst sie auch weglassen |
| `MAIL_TRANSPORT` | `smtp`, sobald das Postfach steht — beim ersten Deploy war es `log` |
| `CONTACT_IP_PEPPER` | 0.2 |
| `INTERNAL_PROBE_TOKEN`, `INTERNAL_DEPLOY_TOKEN` | 0.2 |
| `CORS_ALLOWED_ORIGINS` | `https://timseil.dev,https://www.timseil.dev` |
| `SITE_SYSTEM_SLUG` | `timseil-dev` |
| `TRUSTED_PROXY_CIDRS` | **noch nicht** — Teil 3.1, erst nach dem ersten Deploy |

`SMTP_USERNAME`, `SMTP_PASSWORD` und `MAIL_TO` dürfen leer bleiben, solange
`MAIL_TRANSPORT=log` steht — unter `smtp` sind alle drei Pflicht und die API
kommt ohne sie nicht hoch. Alle übrigen Variablen aus `.env.example` sind
Tunables mit Defaults im Code und werden **nicht** gesetzt — ein leerer Wert
heißt „nimm den Default", und so leben die Defaults an genau einer Stelle.

---

## Teil 1 — Vorbereitung

### 1.1 Traefik lesen, bevor irgendetwas geglaubt wird

**Kein optionaler Schritt.** In `compose.yaml` stehen drei Werte, die Dokploy
gehören. Stimmen sie nicht, kommt kein Zertifikat — und der Fehler sieht aus wie
ein DNS-Problem.

```bash
ssh <vps>

# Das Repo einmal auf den Host, für die Skripte unter ops/host/. Read-only
# benutzt, nichts wird von hier deployt — das tut Dokploy aus seinem eigenen
# Checkout.
git clone https://github.com/G1NG4R/timseil-dev.git ~/timseil-dev

docker ps --format '{{.Names}}\t{{.Image}}' | grep -i traefik
cat /etc/dokploy/traefik/traefik.yml
ls -l /etc/dokploy/traefik/dynamic/
```

Drei Antworten notieren. Weicht eine ab, korrigierst du **`compose.yaml`**, nicht
den Host:

| Frage | Steht in `compose.yaml` als | Zeile |
|---|---|---|
| Wie heißt der TLS-Entrypoint? | `entrypoints=websecure` | an `api` und `web` |
| Wie heißt der Certresolver? | `tls.certresolver=letsencrypt` | an `api` und `web` |
| Leitet der HTTP-Entrypoint global auf HTTPS um? | der Router `timseil-http` an `web` | am `web`-Dienst |

Zur dritten Zeile: **Dokploys Traefik hat keinen globalen Redirect** — am
18.08.2026 nachgemessen, eine Anfrage an Port 80 antwortet mit 404, und ein
Redirect auf Entrypoint-Ebene antwortete mit 301, ob ein Router passt oder
nicht. Es gibt zwar ein `redirect-to-https` in Dokploys `dynamic/middlewares.yml`,
das wird aber pro Router von Hand angehängt. Deshalb bringt `compose.yaml` mit
`timseil-http` einen eigenen Router auf dem HTTP-Entrypoint mit, samt eigener
Middleware — was der Host hält und dieses Repo nicht versioniert, ist nach dem
nächsten Dokploy-Upgrade weg.

Vierte Frage, ohne eigene Zeile: steht `exposedByDefault: true`, baut Traefik
auch für `db`, `migrate` und `seed` Router. Erreichbar sind sie nicht — sie
liegen nicht im Proxy-Netz — aber es ist Rauschen. **Auf diesem Host steht es
bei beiden Providern auf `false`**, die Frage ist also beantwortet; sie bleibt
stehen, weil ein Dokploy-Upgrade sie neu stellt. Die Korrektur gehörte auf den
Host: ein `traefik.enable=false` an `db` wäre ein Traefik-Label an einem
geschlossenen Dienst, und `make check-compose` weist es zu Recht ab.

Und das Netz:

```bash
docker network inspect dokploy-network \
  --format '{{.Driver}} {{range .IPAM.Config}}{{.Subnet}} {{end}}'
```

Das Subnetz brauchst du in Teil 3.1. Steht dort `overlay` statt `bridge`, läuft
Dokploy im Swarm-Modus — dann stimmen ein paar Annahmen hier nicht mehr, und das
gehört als Fund in den Backlog, **bevor** es weitergeht.

### 1.2 DNS bei OVH

Vor dem Deploy, nicht danach: Traefik holt das Zertifikat beim ersten Start über
eine ACME-Challenge, und **Let's Encrypt zählt Fehlversuche** (5 pro Hostname
und Stunde). Ein Deploy gegen fehlendes DNS verbrennt Versuche.

In der OVH-Zone für `timseil.dev`:

| Typ | Name | Wert |
|---|---|---|
| `A` | `timseil.dev` | IPv4 des VPS |
| `AAAA` | `timseil.dev` | IPv6 des VPS |
| `CNAME` | `www` | `timseil.dev.` |

**Kein Proxy davor** — das ist die Aussage, auf der die Datenschutzseite steht
(ADR 0006). `MX`, `SPF`, `DKIM` und `DMARC` gehören zu **L1**, `CAA` zu **L5**;
jetzt noch nicht.

Prüfen, und auf die TTL warten, statt zu deployen und zu hoffen:

```bash
dig +short timseil.dev A
dig +short timseil.dev AAAA
dig +short www.timseil.dev
```

### 1.3 Die Images nach GHCR · **die Pipeline macht das**

Seit E3 pusht der `publish`-Job in `.github/workflows/ci.yml` beide Images bei
jedem Merge auf `main` — bauen, prüfen, scannen, pushen, in dieser Reihenfolge
und in einem Job. Seit E4 **deployt** der `deploy`-Job sie direkt danach.
**Hier steht nichts mehr, was du regelmäßig tust**, und in 2.3 auch nicht.

Der Tag, falls du ihn lesen willst — nicht, weil du ihn irgendwo eintragen musst:

```bash
git checkout main && git pull
make image-tag                              # sha-<7>, aus HEAD
```

Er entsteht aus `HEAD`, nennt also genau den Commit, den der letzte grüne
`publish`-Lauf veröffentlicht hat, und `tools/deploy.sh` setzt ihn in Dokploy
ein, ohne dass ihn jemand abschreibt. Ein Wert, den du von Hand in das Feld
`IMAGE_TAG` schreibst, hält bis zum nächsten Merge.

**Einmalig, falls der Push mit 403 scheitert.** Die Pakete entstanden in D3
durch einen Push mit persönlichem Token und sind dann nicht mit dem Repo
verknüpft — `GITHUB_TOKEN` darf ohne diese Verknüpfung nicht in sie schreiben.
Für `timseil-api` und `timseil-web` je einmal:

1. github.com → Profilbild → **Your profile** → Reiter **Packages**.
2. Paket anklicken, rechts **Package settings**.
3. **Manage Actions access** → **Add Repository** → `G1NG4R/timseil-dev`,
   Rolle **Write**.
4. Weiter unten **Change visibility**: **Public**. Das Repo ist public, also
   ist das konsistent — und Dokploy braucht dann kein Registry-Credential.

Nachmessen statt annehmen:

```bash
docker logout ghcr.io
docker pull ghcr.io/g1ng4r/timseil-api:$(make -s image-tag)   # geht das anonym, ist es public
```

Bleiben die Pakete privat, hinterlegst du in Dokploy stattdessen ein
Registry-Credential (`ghcr.io`, Benutzer `G1NG4R`, ein PAT als Passwort).

**Was die Pipeline hält, was die Brücke nur behauptet hat:** gebaut wird nicht
auf dem VPS, und das laufende Artefakt ist dasselbe, das `make check-images`,
`make check-topology` und Trivy geprüft haben — weil alle vier Schritte in
demselben Job auf demselben Build laufen.

---

## Teil 2 — Der Deploy

### 2.1 Die Compose-App anlegen

**Compose, nicht Swarm-Application.** Fünf Container mit einer Startreihenfolge
über `depends_on` mit `service_healthy` und `service_completed_successfully`
passen in eine Swarm-Application nicht hinein.

In Dokploy: neues Projekt → **Compose**.

| Feld | Wert |
|---|---|
| Provider | Git |
| Repository | `G1NG4R/timseil-dev` |
| Branch | `main` |
| Compose-Pfad | `./compose.yaml` |

**Der Compose-Pfad muss aktiv gesetzt werden.** Dokploys Standard ist
`./docker-compose.yml`; bleibt er stehen, bricht der Deploy mit
`Error: Compose file not found` ab, und die Meldung nennt den erwarteten Pfad,
nicht das Feld.

**Dokploys eigenes Postgres und Redis bleiben unbenutzt.** Unsere Datenbank
steht in `compose.yaml`, mit ihren zwei Rollen, ihrem Volume und ihrem
initdb-Skript.

### 2.2 Die Umgebungsvariablen eintragen

Alle in der Dokploy-Oberfläche, keine in einer Datei auf dem Host. `compose.yaml`
trägt kein `env_file:`, und `make check-compose` weist eins ab.

Den Zettel aus 0.4 abarbeiten. **`TRUSTED_PROXY_CIDRS` bleibt noch leer.**

**Und der Schalter, ohne den nichts davon ankommt: „Create Environment File"
muss AN sein.** Er ist der einzige Weg. Dokploy schreibt daraus eine `.env`
neben die Compose-Datei, und Compose liest sie beim Auflösen von `${…}` selbst
ein. Steht er aus, wird das Environment **lautlos verworfen** — kein Schreiben,
keine Warnung, kein Log-Eintrag:

```js
// @dokploy/server .../utils/builders/compose.js:13
const envCommand = compose.createEnvFile ? getCreateEnvFileCommand(compose) : "";
```

Zwei Ersatzwege gibt es nicht. Das Kommando trägt kein `--env-file`, und
`compose.js:47` startet Docker mit `env -i`, also mit geleerter Umgebung; der
einzige Kanal, der dort noch etwas einschleusen könnte, greift nur bei
`composeType === "stack"`.

Das Fehlerbild führt in die Irre: es scheitert die **Interpolation**
(`required variable IMAGE_TAG is missing a value`), obwohl die Ursache eine nie
geschriebene Datei ist. Der Schema-Default ist `true` — steht er aus, hat ihn
jemand umgelegt.

**Die Dokploy-Oberfläche sieht jede dieser Variablen** — sie ist damit das
lohnendste Ziel der Maschine. Sie zuzumachen ist L3. Und sie landen zusätzlich
als Klartext in jener `.env`, mit Modus 0644 root:root; ein `chmod` überlebt den
nächsten Deploy nicht, weil die Datei jedes Mal neu geschrieben wird.

### 2.3 Das Command-Feld — der überlappende Start

**Seit E5b. Ohne diesen Schritt serviert jeder Deploy zehn bis zwanzig Sekunden
`404`** — die Router sind Labels an den Containern, und Dokploys Vorgabebefehl
legt `api` und `web` gleichzeitig neu an. Issue #143, ADR 0035.

Der Wert wird nicht getippt, sondern erzeugt — er steht an genau einer Stelle im
Repository, und `tools/deploy.sh` vergleicht das Panel vor jedem Deploy dagegen.

1. **Den Wert erzeugen**, im Klon, mit dem `appName` und dem Compose-Pfad dieser
   App:

   ```bash
   tools/rollout.sh --print \
     -p <appName> \
     -f compose.yaml -f compose.rollout.yaml
   ```

   Der `appName` steht in der `.env` der App als `COMPOSE_PROJECT_NAME` und im
   `-p` des Deploy-Logs. **Er gehört nicht in dieses Repository** — er ist
   Host-Zustand; der Zettel dafür ist `backlog.local.md`.

2. **Panel → die Compose-App → Tab „General"**, Feld **Command**. Einfügen,
   speichern. Das Feld **ersetzt** Dokploys Vorgabebefehl vollständig; ein
   `--build` braucht es nicht, weil `compose.yaml` kein `build:` hat und keins
   haben darf.

3. **Gegenprobe, bevor irgendetwas deployt wird.** Der Vergleich ignoriert `-p`
   und `-f`, prüft also die Form und nicht die Zuordnung zur Maschine:

   ```bash
   printf '%s' '<der eingefügte Wert>' | tools/rollout.sh --check
   ```

   Erwartet: `✓ the panel runs the four-step rollout`.

**Was Dokploy annimmt und was nicht.** `sanitizeCommand` (v0.30.0) weist
Shell-Metazeichen ab und verlangt, dass **jedes Kettenglied nach dem ersten
wörtlich mit `docker compose ` beginnt**. Ein `docker stop <container>` in der
Mitte — der naheliegende Weg — ist damit ausgeschlossen; deshalb arbeitet die
Kette über Dienstnamen und deshalb gibt es `compose.rollout.yaml`.

**`autoDeploy` gehört dabei aus.** Steht der Schalter an, deployt Dokploy bei
jedem Push auf `main` von sich aus — mit dem `IMAGE_TAG`, der gerade dasteht,
also dem **alten** — und die Pipeline deployt vier Minuten später noch einmal.
Ein Merge löst dann **zwei** Deploys aus, und eine Messung über einen Merge
beschreibt zwei überlagerte Rollouts statt eines. ADR 0033 hat den Webhook als
Mechanismus verworfen; der Schalter ist davon unabhängig und will einzeln
umgelegt werden.

**Nach einem Dokploy-Upgrade nachsehen.** Wird das Feld zurückgesetzt, ist der
404-Trichter zurück. Der nächste Deploy bricht dann mit
`the panel does not run the rollout this repository defines` ab und deployt
nicht — laut statt still, aber verhindern kann die Prüfung es nicht.

### 2.4 Deployen und zusehen

**Seit E4 drückt niemand mehr.** Ein Merge auf `main` löst den `deploy`-Job aus:
er öffnet den Tunnel, setzt `IMAGE_TAG` über Dokploys API, startet den Deploy,
prüft sechzig Sekunden lang von außen, ob die Seite den bestellten Commit
ausliefert, und rollt zurück, wenn nicht. Was hier steht, ist der **Handbetrieb**
— der Weg, wenn die Pipeline nicht kann.

**Nicht zwischen 23:45 und 00:00 UTC deployen.** Dokploys `docker-cleanup` läuft
um 23:50 UTC und fährt `docker system prune --all --force`. Der Wrapper
`dockerSafeExec` wartet zwar bis zu 300 s auf einen ruhenden Docker, startet
danach aber trotzdem — ein Redeploy in diesem Fenster überschneidet sich mit dem
Prune. Volumes sind dabei sicher (siehe 3.3), gestoppte Container und nicht
referenzierte Images nicht.

`tools/deploy-gate.sh` weigert sich in diesem Fenster von selbst und misst die
Uhrzeit mit `date -u`, statt sie zu schätzen. Die Sperre gilt damit auch für
dich, wenn du von Hand deployst — sie lebt nicht mehr nur in `CLAUDE.md`.

Deploy drücken, dann auf dem VPS:

```bash
docker compose -f compose.yaml ps -a
```

Erwartet: `migrate` und `seed` mit **Exit 0**, danach `db`, `api` und `web`
**healthy**. Die Kette ist `db → migrate → seed → api → web`.

Kommt etwas nicht hoch: **Teil 5**, und für die Kette selbst
`docs/runbooks/compose.md` — dieselben Fehlerbilder, unabhängig davon, wer sie
startet.

### Was du danach im Browser siehst — und was nicht

**Seit H3 eine Startseite**, und bis dahin stand hier eine Entwicklungshülle mit
dem Satz „Development shell. The site itself is built in stage H." Sie ist weg;
`/` trägt jetzt den Hero und die vier Marker `SYS.01` bis `SYS.04`, deren Inhalte
H4 und H5 füllen.

**Das ändert an dieser Abnahme nichts.** D3 verbindet den Stack mit der Welt, und
was hier zählt, ist, dass ein Zertifikat kommt, dass `/api/health` den Commit
nennt, den du gepusht hast, und dass `/api/docs` die Contract-Oberfläche zeigt —
**das** ist die Abnahme, nicht das Aussehen der Startseite. Eine Seite, die
`— NO DATA` zeigt, ist hier ebenfalls kein Fehler: ohne erreichbare API ist das
die richtige Antwort, und die Startseite gibt sie in der `api`-Zeile ihres
Terminal-Rahmens.

### Wo du die docker-Kommandos ausführst

Dokploy checkt das Repo in sein eigenes Verzeichnis aus und startet den Stack von
dort — **nicht** aus deinem Klon in `~/timseil-dev`.

`docker compose -f compose.yaml ...` findet die laufenden Container über den
Projektnamen aus der Datei (`name: timseil`), also normalerweise auch aus deinem
Klon heraus. **Verlass dich nicht darauf:** setzt Dokploy beim Deploy einen
eigenen Projektnamen über `-p`, greifen deine Kommandos ins Leere und melden
„no such service", obwohl alles läuft.

Der Weg, der immer funktioniert, geht über die Container statt über Compose:

```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep -i timseil
docker logs <container-name> --tail 60
```

Und die Dokploy-Oberfläche hat Logs und Status ohnehin eingebaut — für den
ersten Deploy ist sie der bequemere Ort.

Beim ersten Deploy am 18.08.2026 hieß das Projekt
`timseildev-timseildev-eixe3r`, die Container also
`timseildev-timseildev-eixe3r-api-1` und so weiter. Der Name wird von Dokploy
erzeugt und steht doppelt: als `-p` im Kommando und als `COMPOSE_PROJECT_NAME`
in der `.env`. Beides sticht `name: timseil` aus `compose.yaml`. **Deshalb trägt
`db-data` dort ein explizites `name: timseil_db-data`** — sonst erbte das Volume
das generierte Suffix und hieße nach einem Neuanlegen der App anders, also: neu
und leer.

---

## Teil 3 — Nacharbeit

### 3.1 `TRUSTED_PROXY_CIDRS` nachtragen

Erst jetzt, weil das Subnetz erst existiert, wenn das Netz existiert.

```bash
docker network inspect dokploy-network \
  --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}'
```

Wert in Dokploy setzen, `api` neu starten. **Dann einmal nachmessen statt zu
schließen:** die Seite aufrufen und die Client-Adresse im Log der API lesen.

```bash
docker compose -f compose.yaml logs api --tail 50
```

Steht dort bei jedem Request **dieselbe** Adresse, ist die Variable leer oder
falsch — dann teilen sich alle Besucher einen Rate-Limit-Eimer, und der erste
Ansturm sperrt die ganze Seite aus. Die andere Richtung ist genauso still: zu
weit gefasst, und jeder Client wählt sein eigenes `X-Forwarded-For` und damit
seine eigene Identität. ADR 0015, und beide Richtungen in `.env.example`.

### 3.2 Traefik-Metriken einschalten

In Dokploys statischer Traefik-Konfiguration:

```yaml
entryPoints:
  metrics:
    address: ":8082"

metrics:
  prometheus:
    entryPoint: metrics
    addEntryPointsLabels: true
    addRoutersLabels: true
    addServicesLabels: true
    # F3, und diese Zeile ist keine Feinjustierung, sondern eine Korrektur.
    # Traefiks Voreinstellung ist 0.1, 0.3, 1.2, 5.0 Sekunden. Im Labor am
    # 25.08.2026 gemessen: 7582 von 7896 Anfragen lagen im ERSTEN Bucket, und
    # `histogram_quantile` hat dann nichts, wozwischen es interpolieren könnte,
    # außer 0 und 0.1. Der p95 war eine lineare Schätzung über diese Spanne.
    # Dieselbe Liste wie in `compose.lab.yaml` — ein Labor mit besseren Buckets
    # als die Produktion misst das Labor.
    buckets:
      - 0.005
      - 0.01
      - 0.025
      - 0.05
      - 0.075
      - 0.1
      - 0.25
      - 0.5
      - 1
      - 2.5
      - 5
      - 10
```

Traefik neu starten. Vier Dinge dazu:

- **Ein eigener Entrypoint, nicht `websecure`.** Auf 80/443 wäre der Metrikpfad
  öffentlich, sobald ein Router ihn trifft. Prometheus, Loki und Alloy tragen
  keine Authentifizierung — der Schutz ist die Netzgrenze, sonst nichts.
- **Port 8082 wird nicht auf den Host veröffentlicht.** Von außen antworten 22,
  80 und 443. Alloy scrapt ihn ab F3 von innen.
- **`addRoutersLabels` ist per Default aus**, und ohne sie gibt es keine
  `traefik_router_*`-Serien — F3 hätte für seine Routen-Panels nichts zu
  zeichnen. Bei zwei Routern ist die Kardinalität folgenlos.
- **`buckets` ist der Unterschied zwischen einer Messung und einer
  Interpolation.** Siehe der Kommentar oben; ohne die Liste zeigt die Seite eine
  Zahl, die ein laufendes System erzeugt hat und die keine Beobachtung stützt.

### 3.2a Traefik an `observability-network` hängen — F3

**Das ist die Vorbedingung von F3, und sie geht in die andere Richtung als man
denkt.** Unser Prometheus darf nicht ins `dokploy-network` — das teilt sich mit
jeder App dieses Hosts, und `check-compose` Regel 1 und 11 verbieten es. Also
kommt Traefik zu uns.

**Der Alias ist Pflicht.** Auf einem geteilten Netz ist `traefik` ein Name, den
jeder halten kann, und die Fehlerwirkung wäre kein leerer Job, sondern ein
voller über einen fremden Proxy. `ops/prometheus/prometheus.yml` scrapt
`timseil-traefik:8082`, sonst nichts. ADR 0040 §1.

1. Das Netz muss existieren (einmalig, siehe `observability.md`):
   ```bash
   docker network inspect observability-network >/dev/null ||      docker network create observability-network
   ```
2. Traefik dort hineinhängen — **so, dass es einen Neustart überlebt.**
   `docker network connect --alias timseil-traefik observability-network <container>`
   funktioniert sofort und **überlebt den nächsten Neustart des Containers
   nicht** — am 24.08.2026 an der fremden Grafana gemessen. Der haltbare Weg ist
   Dokploys eigene Definition des Traefik-Dienstes; welcher das auf diesem Host
   ist, steht in `backlog.local.md`, weil es Ist-Zustand dieser Maschine ist.
3. Prüfen — und zwar den Weg, den Prometheus wirklich geht:
   ```bash
   cd ~/timseil-dev && sh ops/host/check-traefik-metrics.sh
   ```
   Das Skript fragt `http://timseil-traefik:8082/metrics` **aus dem Netz
   heraus**, nicht vom Host: `dokploy-network` ist ein Overlay, und
   Overlay-Adressen existieren im Namensraum des Hosts nicht.
4. **Danach den Proxy einmal neu starten und Schritt 3 wiederholen.** Das ist
   die eigentliche Frage dieser Anleitung. Ist die Anbindung dann weg, ist der
   gewählte Mechanismus der falsche, und der Fallback aus ADR 0040 ist dran.

### 3.2b Das Command-Feld nachziehen — F3

`tools/rollout.sh` startet seit F3 zwei Dienste mehr:

```
up -d --no-deps --wait prometheus loki alloy node-exporter postgres-exporter
```

`tools/deploy.sh` vergleicht diese Schritte vor **jedem** Deploy mit Dokploys
Command-Feld. Wird das Feld nicht nachgezogen, ist der Deploy rot, bevor er
beginnt — was die richtige Reihenfolge ist: die Datei ist die Quelle, das Panel
die Kopie.

### 3.2c Die dritte Datenbankrolle — F3

`postgres-exporter` verbindet sich als `timseil_metrics`. Die Rolle entsteht in
`ops/postgres/initdb/10-roles.sh` — **und das läuft nur beim Anlegen eines
Clusters.** Der Produktions-Cluster existiert seit D2, also entsteht sie dort
nie von selbst. Einmalig, als Bootstrap-Rolle:

```sql
CREATE ROLE timseil_metrics LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT
  PASSWORD '<METRICS_DB_PASSWORD aus dem Dokploy-Panel>';
GRANT pg_monitor TO timseil_metrics;
GRANT CONNECT ON DATABASE timseil TO timseil_metrics;
```

`INHERIT`, anders als die beiden anderen Rollen: das gesamte Rechtepaket kommt
über die Mitgliedschaft in `pg_monitor`, und `NOINHERIT` hieße ein Exporter, der
das Recht hat und es ohne `SET ROLE` nicht benutzen kann.

Bleibt der Schritt aus, startet der Exporter, scheitert an der Anmeldung, und
`up{job="postgres"}` steht auf 0, während alles andere grün ist.

**Nach jedem Dokploy-Upgrade wiederholen:** 3.2 und 3.2a. Ob Dokploy
`traefik.yml` regeneriert, ist ungeprüft — wenn ja, verschwindet die Einstellung
still, und `check-traefik-metrics.sh` ist das, was es merkt. Ob ein Upgrade die
Netz-Anbindung mitnimmt, ist dieselbe Frage mit derselben Antwort.

### 3.3 Die Platte

Auch bei 100 GB keine Kür. Der schnellste Verbraucher sind **nicht die Logs**, sondern
alte Image-Layer: jeder Deploy legt eins an, Docker räumt nicht von selbst auf,
und `loki`, `prometheus` und Postgres liegen auf derselben NVMe. Eine volle
Platte ist keine langsame Seite, sondern eine Datenbank ohne Schreibrechte.

**Auf diesem Host räumt Dokploy schon auf — der Timer aus diesem Repo bleibt
deshalb uninstalliert.** Nachgesehen am 18.08.2026, Dokploy v0.30.0:
`enableDockerCleanup` steht an, der Job `docker-cleanup` läuft nach
`CLEANUP_CRON_JOB = "50 23 * * *"`, also täglich um 23:50 UTC, und ruft unter
anderem `docker system prune --all --force`. Auf Host-Ebene existiert nichts:
weder `root` noch `ubuntu` haben eine Crontab, und unter den systemd-Timern
steht kein Docker-Job.

Dokploys Lauf ist damit **strikt schärfer** als unser wöchentlicher: täglich
statt sonntags, und ohne `--filter until=168h`. Unserer täte nichts, was jener
nicht schon tut — zwei Jobs wären hier keine Redundanz, sondern zwei Stellen, an
denen man dieselbe Wirkung sucht.

**Die Einstellung bleibt an.** Sie ist die einzige Bremse gegen volllaufende
Image-Layer auf einem Dateisystem, das sich `/`, `/var/lib/docker` und später
Loki und Postgres teilen.

Der Timer aus diesem Repo ist die **Rückfallebene**, nicht der Normalfall. Er
gehört installiert, wenn Dokploys Cleanup abgeschaltet wird oder der Host
gewechselt hat:

```bash
cd ~/timseil-dev && git pull        # der Klon aus 1.1
sudo sh ops/host/install.sh
systemctl start timseil-prune.service        # einmal jetzt, um die Zahlen zu sehen
journalctl -u timseil-prune -n 40 --no-pager
```

**Zweite Hälfte, unabhängig davon:** in der Dokploy-Oberfläche die
Image-Retention auf die letzten 3–5 Stände.

#### Was der Prune wegnimmt — und was nie

**Nie `--volumes`.** `docker system prune -a --volumes` löscht unbenutzte Named
Volumes, und `timseil_db-data` ist genau in den Sekunden zwischen `down` und `up`
eines Redeploys unbenutzt. Das Skript nimmt deshalb **gar keine Argumente**
entgegen — auch nicht über die Unit-Datei, auch nicht über einen Alias.

Zweite Sperre: es läuft nur, wenn `/etc/dokploy` existiert. Auf einer
Arbeitsmaschine löschte es sonst fremde Images. Ist das der VPS und der Pfad
heißt anders, **korrigierst du die Sperre, statt sie zu entfernen.**

**Der Preis, der benannt gehört:** `-a --filter until=168h` entfernt auch die
SHA-getaggten Images, die älter als sieben Tage sind — also genau die
Rollback-Ziele. Die lokale Platte ist nicht die Aufbewahrung, **GHCR ist es.**
Ein Rollback auf einen älteren Stand braucht dann erst:

```bash
docker pull ghcr.io/g1ng4r/timseil-api:sha-XXXXXXX
docker pull ghcr.io/g1ng4r/timseil-web:sha-XXXXXXX
```

**Der Prune räumt außerdem gestoppte Container weg**, und das ist der fünfte
Stolperstein des `Operations`-Blattes: alte, gestoppte Container mit
Traefik-Labels erzeugen Routing-Konflikte. Ein Job, zwei Gründe.

#### Die eine Handlung, die `timseil_db-data` kostet

**Volume-Prune über die Dokploy-Oberfläche ist während eines Redeploys
verboten.** Das ist keine Einstellung, die man absichern kann — es ist ein
Knopf, und keine Konfiguration auf diesem Host verhindert ihn.

Der **automatische** Job ist ungefährlich, und zwar aus genau dem Grund, den
dieser Abschnitt fürchtet. In `utils/docker/utils.js` steht `volumes` in
`excludedCleanupAllCommands`, mit dieser Begründung im Quelltext:

> during automatic cleanup, a volume may be deleted due to a stopped container,
> which is a dangerous situation

Dazu trägt das `docker system prune --all --force` darin **kein** `--volumes`.
Beide Wege sind zu. Am 18.08.2026 auf der Platte bestätigt: drei unbenutzte
Volumes, alle älter als eine Woche, hatten mindestens sieben Läufe überlebt.
Auch **„Clean All" in der Oberfläche ist sicher** — dieselbe `cleanupAll`-Route,
dieselbe Ausnahme.

Gefährlich ist **ein** Knopf: der Volume-Prune in der Docker-Disk-Usage-Ansicht.
Er ruft direkt

```
docker volume prune --all --force
```

und `--all` ist schärfer als das `--volumes`, vor dem oben gewarnt wird: seit
Docker 23 nimmt es **alle** unbenutzten Volumes, nicht nur die namenlosen.
`timseil_db-data` ist benannt und wäre von der alten Semantik geschützt gewesen,
von dieser nicht. Das Fenster sind die Sekunden zwischen `down` und `up` eines
Redeploys — und Dokploys `dockerSafeExec` schützt gerade dort nicht, weil in
diesen Sekunden kein Docker-Prozess läuft, auf den er warten könnte.

---

### 3.4 Der Deploy-Zugang für die Pipeline

**Kommt mit E4.** Die Pipeline deployt durch einen SSH-Tunnel auf Dokploys API
— nicht über einen öffentlichen Router, weil die Oberfläche in L3 zugemacht
wird und ein Weg, der ihre Erreichbarkeit voraussetzt, dann wieder abzureißen
wäre. Begründung vollständig in ADR 0033.

Sechs Schritte, einmal:

1. **Schlüsselpaar erzeugen**, auf deinem Rechner, nur für diesen Zweck:

   ```bash
   ssh-keygen -t ed25519 -C ci-deploy -f ~/.ssh/ci-deploy -N ''
   ```

   Kein Arbeitsplatz-Schlüssel. Dieser hier landet in GitHub.

2. **Konto auf dem VPS.** Ein eigenes, ohne `sudo` und ohne Docker-Gruppe:

   ```bash
   sudo useradd -m -s /usr/sbin/nologin ci-deploy
   sudo install -d -m 700 -o ci-deploy -g ci-deploy /home/ci-deploy/.ssh
   ```

3. **Den öffentlichen Schlüssel eintragen — mit der Beschränkung.** Das ist die
   Zeile, an der die ganze Sicherheitsaussage dieser Phase hängt:

   ```
   restrict,port-forwarding,permitopen="127.0.0.1:3000",command="/bin/false" ssh-ed25519 AAAA… ci-deploy
   ```

   Ein Forward auf einen Port. Kein Kommando, keine Shell, kein zweiter Port.
   In `/home/ci-deploy/.ssh/authorized_keys`, Modus 600, Eigentümer `ci-deploy`.

   **`restrict` zuerst, und deshalb.** Es schaltet alles ab, was ein Schlüssel
   kann — Pty, Agent- und X11-Weiterleitung, `user-rc`, Port-Weiterleitung —
   und danach wird genau eines wieder angeschaltet. Eine Liste aus `no-…`
   deckt nur ab, was es zum Zeitpunkt des Schreibens gab; `restrict` deckt auch
   ab, was OpenSSH morgen dazubekommt. Die Reihenfolge zählt: `port-forwarding`
   muss nach `restrict` stehen, sonst bleibt es aus.

   `command="/bin/false"` ist der Gürtel zum Hosenträger. Die Pipeline
   verbindet sich mit `-N`, öffnet also gar keinen Session-Kanal — der Forward
   läuft ohne Shell, weshalb auch `nologin` als Login-Shell nichts stört. Wer
   trotzdem einen Befehl anhängt, bekommt `/bin/false`.

4. **Die Beschränkung nachmessen.** Eine Beschränkung, die nie getestet wurde,
   ist keine:

   ```bash
   K="-p <port> -i ~/.ssh/ci-deploy -o BatchMode=yes"

   ssh $K ci-deploy@<host> 'id'                      # muss scheitern: command="/bin/false"
   ssh $K -W 127.0.0.1:5432 ci-deploy@<host> </dev/null   # muss scheitern: permitopen
   printf 'GET /api/health HTTP/1.0\r\n\r\n' \
     | ssh $K -W 127.0.0.1:3000 ci-deploy@<host> | head -3   # muss Dokploy zeigen
   ```

   **`-W`, nicht `-L`, und das ist kein Stilfrage.** `permitopen` ist eine
   serverseitige Regel und greift erst, wenn ein Kanal geöffnet wird. Ein
   `ssh -N -L 5432:…` baut aber nur einen **lokalen** Lauschsocket auf und
   öffnet gar keinen Kanal — es bleibt fröhlich stehen und sieht aus wie ein
   bestandener Test, obwohl nichts geprüft wurde. `-W` verlangt den Kanal
   sofort und bekommt deshalb sofort die Antwort. Eine Gegenprobe, die auch
   dann grün ist, wenn die Regel fehlt, ist keine Gegenprobe — dieselbe Sorte
   Fehler, die `refuses` in `tools/selftest.sh` behebt.

   **`<port>` ist auf diesem Host nicht 22.** Steht in
   `/etc/ssh/sshd_config`; die Zahl gehört nicht in dieses Repository, sondern
   in das Secret `VPS_SSH_PORT`.

   Antwortet auch der dritte mit `administratively prohibited`, steht in
   `/etc/ssh/sshd_config` ein `AllowTcpForwarding no`. Das gilt global und die
   Zeile oben kann nichts daran ändern.

   **Was die erste Zeile beweist und was nicht.** Sie antwortet
   `This account is currently not available.` — das ist `nologin`, die
   Login-Shell, nicht `command="/bin/false"`. Die Shell kommt zuerst dran, also
   ist von den zwei Schichten nur die äußere vorgeführt. Das ist in Ordnung und
   gehört gesagt: `command=` ist die Schicht, die noch steht, wenn jemand dem
   Konto später eine echte Shell gibt. Wer sie sehen will, setzt für einen
   Versuch `sudo chsh -s /bin/sh ci-deploy` — die Meldung fällt dann weg und
   der Exit-Code bleibt 1.

   Der Tunnel, den du danach zum Arbeiten offen lässt, ist wieder der gewohnte:
   `ssh -p <port> -i ~/.ssh/ci-deploy -N -L 3000:127.0.0.1:3000 ci-deploy@<host>`.

5. **API-Key in Dokploy.** `/dashboard/settings/profile` → Abschnitt
   **API/CLI Keys** → **Generate**. Er wird genau einmal angezeigt.

   **Nimm diesen Knopf, und keinen anderen Weg.** Ein Key, den man selbst über
   `POST /api/auth/api-key/create` erzeugt, bekommt kein `metadata` — und ist
   damit wertlos, ohne dass irgendetwas es sagt. `validateRequest`
   (`packages/server/src/lib/auth.ts`) prüft den Key erfolgreich, liest dann
   `organizationId` aus dessen `metadata` und gibt **keine Sitzung** zurück,
   wenn das Feld leer ist. Das Ergebnis ist auf jedem Pfad
   `401 {"message":"Unauthorized"}`, während die Datenbank den Key als gültig
   und `enabled` führt. Nachsehen kann man es so:

   ```sql
   select id, name, metadata from apikey;   -- metadata darf nicht null sein
   ```

   Gemessen am 22.08.2026, Dokploy v0.30.0. Der Irrweg hat einen Nachmittag
   gekostet; er steht hier, damit er keinen zweiten kostet.

6. **Die `composeId` ablesen.** Sie steht in der URL der Compose-App im Panel.

Die **acht** Werte gehen als Repository-Secrets nach GitHub — welche, und wie sie
rotiert werden, steht in `docs/runbooks/github.md`.

**`INTERNAL_DEPLOY_TOKEN` wird nicht neu erzeugt, sondern kopiert.** Derselbe
Wert liegt ab jetzt in Dokploy *und* in GitHub; ein Wert an zwei Stellen ist
ein Wert, den man bei der Rotation an einer Stelle vergisst. Beide Kopien
stehen im github-Runbook nebeneinander, damit die Rotation beide sieht.

**Zwei Vorgaben, die dabei niemand erwähnt.** `canAccessToAPI` steht per Vorgabe
auf `false`; ohne sie antwortet jeder Pfad ablehnend, auch mit gültigem Key. Und
der Key muss über Dokploys **eigene Schaltfläche** entstehen — ein von Hand über
den Auth-Endpunkt erzeugter Key hat `metadata: null`, ist gültig und `enabled`
und antwortet trotzdem auf jedem Pfad mit `401`, weil `validateRequest` die
`organizationId` aus den Metadaten liest und ohne sie gar keine Sitzung
zurückgibt. Der Irrweg hat einen Nachmittag gekostet.

### 3.5 Was GHCR aufhebt

Die zweite Hälfte von [#90](https://github.com/G1NG4R/timseil-dev/issues/90).
Seit E4 rollt die Pipeline selbsttätig zurück — damit ist die Frage, wie viele
Stände in der Registry liegen, keine Neugier mehr, sondern die Bedingung, unter
der „roll back to any previous deploy" ein Versprechen ist.

**Gemessen am 22.08.2026, 13:23 UTC, anonym** — also so, wie ein Fremder es
sieht, ohne Token und ohne `gh`. Seit E4b ist die Messung ein Kommando statt
einer Zeile in dieser Datei, damit die Zahl unten keine Behauptung über einen
Tag bleibt:

```bash
tools/registry.sh tags timseil-api        # ein Tag pro Zeile
make prune-registry                       # der ganze Bestand, und was die Regel wegnähme
```

**Zehn Tags je Paket — aber 26 Versionen.** Der Unterschied ist der Kern dieses
Abschnitts, und er hat E4b eine falsche Regel erspart:

| Art | Anzahl | Wie sie heißt | Getaggt |
|---|---|---|---|
| Build-Manifeste | 5 | `sha-<7hex>` | ja |
| Build-Manifest ohne Namen | 1 | — | **nein** |
| Referrers-Indizes | 5 | `sha256-<64hex des Builds>` | ja |
| Sigstore-Bündel | 15 | — | **nein** |

| Tag | Was | Signiert |
|---|---|---|
| `sha-a0872c1` | erster Push aus der Pipeline (E3a) | nein |
| `sha-c738b2a` · `sha-8acdd53` · `sha-581f5c0` · `sha-ae939d4` | Pipeline, ab E3b | ja |
| 5 × `sha256-…` | der Index je signiertem Build — und der fünfte gehört zu keinem | — |

**Elf Tags waren es bis 14:05 UTC desselben Tages.** `sha-3890180`, der Handpush
aus D3, ist gelöscht, sobald die Pipeline einen Stand deployt hatte, den sie
selbst gebaut und signiert hat — von Hand über die Paket-Oberfläche, in beiden
Paketen je eine Version, ohne Index und ohne Bündel. Bewusst **nicht** als erster
scharfer Lauf des Werkzeugs unten: dessen Lösch-Pfad war zu diesem Zeitpunkt nie
ausgeführt worden, und sein Debüt gegen die echte Registry wäre dieselbe Wette
gewesen, die der erste Drill an diesem Tag verloren hat.

Drei Dinge, die aus dieser Aufstellung folgen und nirgends sonst stehen.

**Erstens: die Bündel sind ungetaggt.** Signatur, SBOM-Attestierung und
SLSA-Provenance liegen als drei namenlose Manifeste unter dem Index. Eine Regel
„lösche, was keinen Tag hat" — das Rezept, zu dem jeder zuerst greift — würde
**jede Signatur in dieser Registry vernichten**. Sie ist hier nicht ungenau,
sie ist umgekehrt.

**Zweitens: der Index *ist* der Auffindeweg.** GHCRs
`/v2/…/referrers/<digest>`-Endpunkt antwortet für diese Pakete nichts;
gefunden werden die Bündel ausschließlich über den Fallback-Tag
`sha256-<hex des Builds>`. Löscht man diese eine Version, ist `cosign verify`
für einen Build kaputt, dessen Bündel alle noch daliegen.

**Drittens: ein Build liegt da, den kein Tag mehr benennt.** Commit `ae939d4`
wurde zweimal gebaut — `sha256:8a16…` um 11:54:46 UTC, `sha256:1c43…` um
12:08:59 UTC —, beide tragen `org.opencontainers.image.revision=ae939d4`, und
`sha-ae939d4` benennt nur den zweiten. Der Re-Run hat den Tag umgehängt und die
Signatur der alten Bytes stehen lassen. Produktion startete um 12:11:55 UTC,
also auf den zweiten; wäre sie früher gestartet, hätte `/api/health` weiterhin
`ae939d4` gesagt und der Tag hätte aufgelöst — grün über Bytes, die unter
diesem Namen nie veröffentlicht wurden. **Das ist der Grund, warum
`make check-deployed` gegen den Digest prüft und nicht gegen den SHA.**

### Die Regel

**Behalten werden die letzten zehn Builds je Paket**, geordnet nach `created`
aus ihrem eigenen Config-Blob — plus zu jedem behaltenen Build sein Index und
jedes Manifest, das der Index auflistet.

**Nie gelöscht, unabhängig vom Alter:**

1. der Build, den Produktion gerade fährt — aus `/api/health` gelesen, nicht
   angenommen. Ist die Antwort nicht zu bekommen, löscht das Werkzeug nichts;
2. jeder Tag, den `README.md` namentlich nennt. Der README zeigt auf einen
   unsignierten Build als Beleg dafür, dass die Signatur an einem Zeitpunkt
   begonnen hat statt behauptet zu werden — eine Regel, die den Beleg löscht,
   macht die Seite zur Lügnerin. `tools/prune-registry.sh` liest die Namen aus
   der Datei, statt sie zu führen: so können die beiden nicht auseinanderlaufen.

**Zusätzlich gelöscht wird jede Waise** — ein Index, dessen Build kein Tag mehr
benennt, samt seinen Bündeln und dem Build-Manifest selbst.

**Gelöscht wird in dieser Reihenfolge: Index, dann seine Kinder, dann das
Build-Manifest.** Nicht als Geschmacksfrage — GHCR weigert sich, ein Manifest
zu entfernen, auf das ein Index noch zeigt, und ein halb entfernter Satz ist
der Zustand, über den hinterher niemand mehr nachdenken kann.

**Warum eine Anzahl und kein Alter.** Ein ruhiger Monat darf den Speicher nicht
leeren. Seine Aufgabe ist „N Rollback-Ziele", und das ist eine Anzahl.
Altersbasiert löscht am schnellsten genau dann, wenn nichts deployt wird — also
wenn der letzte bekannte gute Stand am meisten zählt.

**Warum zehn.** Gemessene Rate über E3/E4: fünf Builds in zwei Tagen im
Spitzenfall, sonst etwa einer am Tag. Zehn sind damit zwischen zwei Tagen und
zwei Wochen. Jeder Rollback dieses Projekts ging genau einen Schritt zurück.
3.3 setzt Dokploys eigene Image-Retention auf drei bis fünf, und GHCR muss
strikt tiefer sein als die Platte, sonst ist es nicht der Speicher. Und das
Argument, das über den Beharrungszustand hinausgeht: **bei zehn löscht der
erste scharfe Lauf ausschließlich die Waise und ihre vier Anhänge.** Bei fünf
entspräche das Fenster dem heutigen Bestand und der erste Lauf nähme einen
echten, signierten, referenzierten Build mit — der schlechtestmögliche erste
Lauf eines Werkzeugs, das nichts zurückholen kann.

**Was sich damit an einem Versprechen ändert.** Aus „roll back to any previous
deploy" (Issue #90) wird „auf jeden der letzten zehn". Wer den alten Satz
irgendwo stehen lässt, lässt eine Zusage stehen, die die Regel still gebrochen
hat.

### Das Werkzeug

```bash
make prune-registry          # der Plan. Löscht nichts, braucht kein Token.
make prune-registry-apply    # UNUMKEHRBAR. Braucht GHCR_TOKEN mit delete:packages.
```

Zwei Ziele und nicht eines mit einem Schalter, damit weder `make`- noch
Shell-Verlauf das unumkehrbare eine Taste vom harmlosen entfernt halten.

**Der Plan braucht kein Geheimnis.** Er wird aus der öffentlichen Registry-API
gerechnet — ein Fremder kann ihn nachrechnen, und ein falscher Plan steht eine
Woche lang im Log, bevor irgendetwas fehlt. Nur der zweite Befehl liest ein
Token, und nur, um die Packages-API zu rufen; die Registry-API kann nicht
löschen.

**Zum Token.** `gh` mit dem üblichen Login kann die Versionen dieses Pakets
nicht einmal *lesen* — `403, You need at least read:packages scope`. Ob das
`GITHUB_TOKEN` eines Laufs mit `packages: write` für ein Paket im
**Nutzer**-Namensraum zum Löschen reicht, ist nicht gemessen; das Werkzeug
nennt im Fehlerfall die Abhilfe, statt sie hier vorwegzunehmen. Reicht es
nicht, ist ein fein granuliertes Token in `GHCR_PRUNE_TOKEN` der Weg — siehe
`docs/runbooks/github.md`.

**Wöchentlich, und erst unscharf.** Der `retention`-Job in `ci.yml` druckt jeden
Montag den Plan. Gelöscht wird erst, wenn `GHCR_PRUNE_ENABLED` auf `true` steht
— dieselbe Form wie `DEPLOY_ENABLED`, aus demselben Grund: das Werkzeug landet
vor der Messung, die es scharf macht. Bis dahin sind die Läufe genau die
Trockenläufe, die die Abnahme verlangt: derselbe Plan, Woche für Woche
unverändert. Bewegt er sich in einer Woche ohne Merge, ist die Regel falsch —
und das sieht man, bevor etwas weg ist.

Der Unterschied zur Platte, weil er leicht verwechselt wird:

| | Horizont | Wer räumt |
|---|---|---|
| VPS-Platte | **1 Tag** | Dokploys `docker-cleanup`, täglich 23:50 UTC, `prune --all` |
| GHCR | **unbegrenzt** (heute) | niemand |

Ein Rollback auf etwas, das nicht der unmittelbar vorherige Stand ist, ist
deshalb immer ein `docker pull` — siehe 3.3.

---

## Teil 4 — Die Abnahme

Das „fertig wenn" des Bauplans für D3, als Kommandos. **Erst wenn das hier
durchläuft, ist die Phase fertig.**

Die ersten fünf gehen von überall, die letzten drei laufen auf dem VPS aus dem
Klon von 1.1 (`cd ~/timseil-dev`).

```bash
curl -sI  https://timseil.dev                       # 200, gültiges Zertifikat
curl -sI  https://www.timseil.dev                   # 301 → https://timseil.dev
curl -sI  http://timseil.dev                        # 301 → https
curl -sI  http://timseil.dev/.well-known/acme-challenge/x   # 404, NICHT 301
curl -s   https://timseil.dev/api/health | jq .sha  # der deployte Commit
curl -sI  https://timseil.dev/api/docs              # 200
sh ops/host/check-traefik-metrics.sh                # traefik_* innen, nichts außen
docker volume ls | grep timseil_db-data             # der feste Name
sh tools/check-deployed.sh --host                   # laufender Digest = veröffentlichter
```

Die `jq .sha`-Zeile ist die, an der alles hängt: sie sagt, dass das, was gemergt
wurde, tatsächlich läuft. Sie muss die sieben Zeichen aus Teil 1.3 zeigen.

**Am 22.08.2026 zum ersten Mal wirklich ausgeführt — und das war überfällig.**
`--host` steht seit E4b als Abnahmekriterium im Bauplan, im Handbuch und in ADR
0034, und niemand hatte es je laufen lassen; die neunte und zehnte Behauptung
existierten als Satz, nicht als Messung. Ergebnis, gegen `b4bd8fa`:

```
  ✓ it runs b4bd8fa — the head of main
  ✓ the site reports that deploy itself: ok, 216s, 2026-08-22T22:38:19Z
  ✓ the running timseil-api container is sha256:28a5172f… — the published digest
  ✓ the running timseil-web container is sha256:e810db71… — the published digest

  ✓ 10 claims
```

Damit ist belegt, was der Klon nur folgern kann: **die laufenden Container sind
die Bytes, die die Pipeline gebaut, gescannt und signiert hat.** Ein auf dem
Host gebautes Image hätte diesen Digest nicht — und überhaupt keinen
`RepoDigest`.

Zwei Nebenbefunde aus demselben Lauf, beide klein und beide notiert, weil sie
sonst der Nächste wieder findet:

- Der Klon auf dem Host stand noch auf `3890180`, dem D3-Stand. Er wird
  read-only für `ops/host/` benutzt und deployt nichts (Teil 1.1), also hat das
  nichts gekostet — aber wer `--host` ausführt, zieht ihn vorher.
- Die Zeile, die `check-deployed.sh` selbst zum Nachmachen druckte, scheiterte
  beim wörtlichen Befolgen: `git -C … pull && sh tools/…` bewegt nur git, das
  `sh` lief im Heimatverzeichnis und fand die Datei nicht. Korrigiert auf
  `cd ~/timseil-dev && git pull && …`.

**Die `acme-challenge`-Zeile ist die zweitwichtigste, und sie ist neu.** Der
Router `timseil-http` sitzt auf demselben Entrypoint, über den der Certresolver
seine `httpChallenge` abwickelt. Antwortet dieser Pfad mit **404**, hat Traefiks
interner ACME-Router gewonnen und die Erneuerung funktioniert. Antwortet er mit
**301**, verschluckt unser Redirect die Challenge — dann erneuert sich das
Zertifikat in rund 60 Tagen nicht, und auffallen würde es erst, wenn die Seite
offline ist. Deshalb trägt der Router `priority=1`.

**Die letzte Zeile ist seit E4b eine andere, und das ist eine Korrektur, keine
Erweiterung.** Dort stand `docker system df` mit der Abnahme „0 B Build-Cache"
(Anhang C): liegt dort etwas, wurde auf dem VPS gebaut, und dann ist das
Artefakt, das geprüft wurde, nicht das Artefakt, das läuft.

Das Kriterium wurde für eine Maschine geschrieben, auf der **nur** unser Stack
läuft. Diese Maschine trägt weitere Dienste. Gemessen am 22.08.2026: 50
Einträge, 782,9 MB — sie gehören ihnen. Aus der Zahl folgt über unseren Stack
nichts, weder im Guten noch im Schlechten. Dieselbe Klasse wie „nur 22, 80,
443": ein Kriterium für einen Ein-Zweck-Host, angewandt auf eine geteilte
Maschine.

Ersetzt wird es durch die **direkte** Messung derselben Behauptung, statt durch
einen Indizienbeweis: `tools/check-deployed.sh --host` hält den `RepoDigest` der
laufenden Container gegen den Digest, den GHCR unter demselben Tag ausliefert.
Sind sie gleich, wurde nicht hier gebaut — denn ein hier gebautes Image hat
diesen Digest nicht, und ein hier gebautes Image hat überhaupt keinen
`RepoDigest`. Das Skript sagt beides mit eigenen Worten.

**Von deinem Rechner aus fehlt genau diese eine Behauptung**, weil nur der Host
den laufenden Container sieht. `make check-deployed` macht die anderen acht und
druckt die neunte als „not asked here" samt der zwei Digests, die zu vergleichen
sind. Wöchentlich läuft dieselbe Prüfung im `scan`-Job.

Die `jq .sha`-Zeile darüber bleibt, ist aber die schwächste der neun: sie sagt
*welcher Commit*, nicht *welche Bytes*. Zwei Builds desselben Commits liegen in
dieser Registry — 3.5 erzählt, wie das kam.

---

## Teil 5 — Wenn etwas nicht geht

Nach Symptom, in der Reihenfolge, in der die Fälle vorkommen.

### `api` startet nicht, Log nennt Variablen

Das ist der Normalfall beim ersten Mal und **kein Fehler, sondern die Auskunft**:
`config.Load` nennt alle fehlenden Werte auf einmal (ADR 0014), also einmal lesen,
alle nachtragen, einmal neu starten.

```bash
docker compose -f compose.yaml logs api --tail 60
```

| Meldung | Ursache |
|---|---|
| `SMTP_USERNAME is empty …` | Die erste Startsperre. `MAIL_TRANSPORT=log` setzen |
| `GITHUB_TOKEN is empty …` | Die zweite. Echtes PAT — oder `CONTRIBUTIONS_TRANSPORT=off` |
| `CONTACT_IP_PEPPER is empty` / `… is N characters` | Mindestens 32 Zeichen, `openssl rand -hex 32` |
| `DATABASE_URL connects as timseil_migrate` | Die zwei DSN vertauscht, siehe 0.3 |
| `DATABASE_URL does not parse` | Meist ein Sonderzeichen im Passwort, unkodiert |

### `migrate` geht mit 1 raus

```bash
docker compose -f compose.yaml logs migrate
```

- `MIGRATE_DATABASE_URL is empty` — die Variable fehlt in Dokploy. Sie trägt
  `timseil_migrate`, und der `api`-Dienst bekommt sie absichtlich nie.
- `cannot reach the database as timseil_migrate` — die Rolle gibt es nicht.
  `ops/postgres/initdb/10-roles.sh` läuft **nur** beim Anlegen eines leeren
  Datenverzeichnisses. In Produktion heißt das: Volume wegwerfen ist keine
  Option, also die Rolle von Hand anlegen.
- Eine echte SQL-Meldung → `docs/runbooks/migrations.md`.

Alles über `migrate` wurde **angelegt und nie gestartet**. Das ist richtig so.

### Kein Zertifikat, Browser zeigt eine Warnung

In dieser Reihenfolge:

1. `dig +short timseil.dev A` — zeigt das auf den VPS? Ohne DNS keine Challenge.
2. `ls -l /etc/dokploy/traefik/acme.json` — **Modus muss 600 sein**, sonst legt
   Traefik nichts ab. Der vierte Stolperstein des Blattes.
3. Heißt der Certresolver wirklich so wie in `compose.yaml`? Teil 1.1.
4. Traefik-Log lesen. Bei „too many failed authorizations" hat Let's Encrypt
   dichtgemacht — eine Stunde warten, nicht weiterprobieren.

### Die Seite antwortet nicht, der Stack ist grün

Das ist die Fehlerform, für die die fünf Compose-Regeln aus D3 da sind — hier
also von außen nach innen:

```bash
docker inspect $(docker compose -f compose.yaml ps -q api) \
  --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

Steht dort `dokploy-network` nicht, findet Traefik den Dienst nicht. Dann:

```bash
docker ps -a --filter label=traefik.enable=true
```

Alte, gestoppte Container mit Traefik-Labels erzeugen Routing-Konflikte —
Stolperstein 5. `cd ~/timseil-dev && sudo sh ops/host/prune.sh` räumt sie weg.

### `/api/...` liefert die 404-Seite von Next.js

Die Router-Priorität greift nicht. `timseil-api` muss 100 haben, `timseil-web`
10 — ohne explizite Angabe sortiert Traefik nach Regellänge, und dann gewinnt
die falsche Route, sobald jemand eine Regel umformuliert.

### Alle Besucher teilen ein Rate-Limit

`TRUSTED_PROXY_CIDRS`. Siehe 3.1.

---

## Rollback

### Der Normalfall: die Pipeline hat ihn schon gemacht

Seit E4 rollt ein fehlgeschlagener Deploy sich selbst zurück. `tools/deploy-gate.sh`
merkt sich den Tag, der vor dem Deploy in Dokploy stand, prüft sechzig Sekunden
lang von außen und setzt bei Ausbleiben den alten Tag zurück, deployt erneut und
verifiziert nochmal. **Der Job wird trotzdem rot** — der Rollback hat
funktioniert, der Deploy nicht, und ein grüner Haken darüber wäre eine bequeme
Lüge.

Was du dann siehst und was es heißt:

| Im Actions-Log | Lage |
|---|---|
| `✗ sha-… did not come up; sha-… is live again` | erledigt. Die Seite läuft auf dem vorherigen Stand, die `rollback`-Zeile steht in `deploys` |
| `✗ nothing to roll back to` | der neue Tag war schon der laufende. Handbetrieb, unten |
| `✗ THE ROLLBACK DID NOT COME UP EITHER` | die Seite ist unten. Teil 5, und `docs/runbooks/compose.md` für die Kette |
| `✗ the verify was refused` | **nichts ist passiert und nichts ist bekannt.** Kein Rollback, keine Zeile in `deploys`. Unten |
| `✗ … was deployed and the verify was refused` | der Rollback lief, ob er hochkam ist offen. Derselbe Abschnitt unten |

### Der Verify wurde abgewiesen — Exit 2

Seit dem 30.08.2026 kennt `tools/verify-deploy.sh` einen dritten Ausgang. `2`
heißt: **die Antwort auf `/api/health` kam nicht von der Anwendung.** Ein 401,
403 oder 451 steht für diese Route nicht im Contract, und ein 429 kann unserer
sein oder nicht — in beiden Fällen sagt er nichts darüber, welcher Build läuft.
Der Gate bricht dann in Sekunden ab. ADR 0054.

**Was der Gate dabei *nicht* getan hat**, und beides ist Absicht:

- **Kein Rollback.** Er würde denselben Aufrufer dasselbe fragen und dieselbe
  Antwort bekommen. Genau das ist am 30.08.2026 passiert und hat einen guten
  Deploy weggeräumt.
- **Keine Zeile in `deploys`.** Sie sagt `ok` oder `rollback`; beides wäre eine
  Behauptung, die niemand gemessen hat. Die Lücke ist die ehrliche Spur.

**Was daraus folgt:** Produktion steht, wo sie stand — **welcher Stand das ist,
weiß der Gate nicht.** Der Deploy kann längst durchgelaufen sein; der Gate hat
ihn nur nicht sehen dürfen. Das ist die erste Frage, nicht die letzte.

Drei Schritte, in dieser Reihenfolge:

```bash
curl -s https://timseil.dev/api/health | jq -r '.sha'   # 1. von einem anderen Netz aus
make check-deployed                                      # 2. alle Ansprüche
```

1. **Von einem anderen Netz als dem abgewiesenen.** Zeigt es den Kopf von `main`,
   ist der Deploy oben und es fehlt nur der Datensatz — nachtragen von Hand
   kommt nicht in Frage (Invariante 1), aber es ist auch kein Vorfall.
2. Stimmen die Ansprüche, ist die Seite in Ordnung und die Frage ist eine über
   den Aufrufer, nicht über den Deploy.
3. **Erst dann am Host nachsehen.** Was dort gefunden wird, gehört nach
   `backlog.local.md` — dieses Runbook ist öffentlich.

Kommt die Abweisung wieder, ist der `deploy`-Job in Sekunden rot und richtet
nichts an. Er ist damit kein Notfall, sondern eine Aufgabe.

### Der Drill — den Rollback absichtlich auslösen

Der Bauplan verlangt für E4 wörtlich: „Absichtlich kaputter Healthcheck löst
Rollback aus — **einmal wirklich provozieren.**" Gegen ein Double ist der Pfad
gelaufen, und das zählt nicht: ein Rollback, den nur ein Merge auslösen kann,
probiert man einmal und hofft danach.

**Was der Drill tut.** Er deployt einen Build und verifiziert gegen einen
anderen. Das ist der ganze Trick, und es ist der schonendste, den es gibt: die
Seite liefert die ganze Minute lang einen echten, signierten, funktionierenden
Stand aus, und der einzige Grund, warum `verify-deploy.sh` nein sagt, ist
Bedingung drei — *ist der laufende SHA der Build, den wir bestellt haben*. Genau
die Bedingung, die ein Uptime-Check nicht stellt. Nichts wird kaputtgemacht, die
Seite geht nicht unten.

**Er schreibt nichts in `deploys`.** `report-deploy.sh` berichtet den SHA, der
*deployt* wurde, und im Drill ist das ein Build, der tadellos hochkam. Eine
Zeile „dieser Build endete im Rollback" wäre eine erfundene Tatsache —
Invariante 1 gilt auch für Zeilen, die etwas Falsches *bedeuten*. Die echte
Messung von Schritt sieben existiert bereits (22.08.2026, `report ok … 227s`);
der Drill schuldet sie nicht zweimal. `DEPLOY_DRILL=1` überspringt sie und sagt
es hin.

**Das Flag und die Ungleichheit bedingen einander**, in beide Richtungen — jede
Hälfte allein ist ein Fehler, den niemand bemerkt:

| Lage | Antwort |
|---|---|
| Tag ≠ SHA, kein `DEPLOY_DRILL` | abgewiesen. Das wären zwei Tippfehler, die einen Build deployen und einen anderen prüfen |
| `DEPLOY_DRILL=1`, Tag = SHA | abgewiesen. Eine vergessene Variable würde still den Bericht eines echten Deploys verschlucken |

#### Das Ziel wählen

**Der unmittelbar vorherige signierte Build**, nicht irgendeiner. Prüfe vorher,
dass er sich vom laufenden Stand nur in Dingen unterscheidet, die nicht im Image
landen:

```bash
git diff --name-only <ziel>..<laufend>     # kein api/, kein web/, kein contract/,
                                           # keine Migration, kein compose.yaml
```

Trifft der Diff `api/`, `web/`, `contract/`, `compose.yaml` oder
`api/migrations/`, ist es das falsche Ziel: dann ist der Drill ein echter
Versionswechsel mit echten Folgen, und `seed` schreibt zweimal etwas anderes.
Unsignierte Stände kommen ohnehin nicht in Frage — E3 hat sie abgeschafft, und
eine Minute Ausnahme ist auch eine Ausnahme.

#### Vorbedingungen, in dieser Reihenfolge

```bash
date -u                                              # 1. NICHT zwischen 23:45 und 00:00
curl -s https://timseil.dev/api/health | jq -r .sha   # 2. der Kopf von main, und nur der
make check-deployed                                   # 3. alle Behauptungen grün
```

1. **Gemessen, nicht geschätzt.** `deploy-gate.sh` weigert sich im Prune-Fenster
   von selbst, aber die Uhrzeit wird gelesen, bevor man anfängt: um 23:50 UTC
   räumt Dokploys `docker-cleanup` unreferenzierte Images weg, und während eines
   Deploys ist das Rollback-Ziel genau so eines.
2. Läuft nicht der Kopf von `main`, ist etwas anderes im Gange, und der Drill
   würde es verdecken.
3. Ist hier schon etwas rot, findet der Drill es nicht heraus, sondern
   verwirrt die Spur.

Dann der Tunnel und die zwei Werte aus 3.4:

```bash
ssh -M -S /tmp/dok.sock -N -L 3000:127.0.0.1:3000 <vps> &
export DOKPLOY_API_KEY=… DOKPLOY_COMPOSE_ID=…
```

Und in einem **zweiten Terminal** der Zeuge. Er ist kein Beiwerk: er ist der
Beleg dafür, dass der Drill keinen Ausfall gekostet hat, und das ist die Zahl,
die diesen Abschnitt trägt.

```bash
while :; do printf '%s ' "$(curl -s -o /dev/null -w '%{http_code}' https://timseil.dev/)"; sleep 1; done
```

#### Der Lauf

```bash
DEPLOY_DRILL=1 make deploy-gate \
  DEPLOY_TAG=sha-<ziel> DEPLOY_SHA=<nie-gebaut> DEPLOY_STARTED_AT=$(date +%s)
```

`DEPLOY_TAG` ist der Build, der hingeschoben wird. `DEPLOY_SHA` ist der, gegen
den geprüft wird, und **er muss ein Commit sein, den nie jemand gebaut hat** —
der Kopf des Arbeitszweigs zum Beispiel. Dass die beiden sich widersprechen,
*ist* der Drill.

> **Nicht gegen den laufenden SHA verifizieren.** Das war der erste Versuch am
> 22.08.2026, und er ist nach drei Sekunden grün geworden, ohne dass ein
> Rollback stattfand. Dokploy antwortet, wenn es den Auftrag *angenommen* hat;
> die Container wechseln danach. Der Verify fragt also zuerst den **alten**
> Prozess, und der meldete genau den SHA, auf den gewartet wurde. Danach
> deployte Dokploy in Ruhe weiter, und die Seite lief eine Viertelstunde auf dem
> falschen Stand. Seit E4b hat `verify-deploy.sh` eine fünfte Bedingung, die
> genau das abfängt — aber die Wahl des Verify-SHA bleibt die Verantwortung
> dessen, der den Drill fährt.

#### Was gemessen wurde — 22.08.2026, 13:53 UTC

Deployt `sha-581f5c0`, verifiziert gegen `21de41d` (der Kopf des Arbeitszweigs,
nie gebaut). Ungekürzt:

```
  ! DRILL — deploying sha-581f5c0 while verifying 21de41d; the verify must fail
    nothing will be reported to /api/internal/deploy. header of this file says why.

─── deploy ───────────────────────────────────────────
  ✓ both images exist in the registry
deploy sha-581f5c0
  ✓ previous sha-ae939d4
  ✓ IMAGE_TAG set to sha-581f5c0
  ✓ dokploy accepted the deploy — verify decides whether it worked

─── verify ───────────────────────────────────────────
verify https://timseil.dev
  waiting up to 60s for sha 21de41d
  and for a process that did not start at 2026-08-22T13:46:59.326415933Z
  ✗ 60s elapsed and the deploy did not come up
    last seen: status ok, running sha 581f5c0
    expected:  status ok, sha 21de41d, / 200, not started at 2026-08-22T13:46:59.326415933Z

─── rollback ─────────────────────────────────────────
  rolling back to sha-ae939d4
  ✓ both images exist in the registry
deploy sha-ae939d4
  ✓ previous sha-581f5c0
  ✓ IMAGE_TAG set to sha-ae939d4
  ✓ dokploy accepted the deploy — verify decides whether it worked
verify https://timseil.dev
  waiting up to 60s for sha ae939d4
  and for a process that did not start at 2026-08-22T13:54:17.424789126Z
  ✓ /api/health 200 · status ok · sha ae939d4
  ✓ a new process, up since 2026-08-22T13:55:21.603661784Z
  ✓ / 200

─── report ───────────────────────────────────────────
  ! drill — nothing reported to /api/internal/deploy
    21de41d would have been recorded as rollback after 84s

  ✗ sha-581f5c0 did not come up; sha-ae939d4 is live again
```

Exit-Code **1**. Wanduhr **84 s**. `deploys` hat keine neue Zeile bekommen,
`IMAGE_TAG` stand danach wieder auf `sha-ae939d4`, und `make check-deployed`
meldete alle acht Behauptungen grün.

`last seen: status ok, running sha 581f5c0` ist die Zeile, an der alles hängt:
die Seite war **gesund** und lieferte den falschen Build aus. Ein Uptime-Check
hätte grün gemeldet.

#### Was der Zeuge gefunden hat, und es war nicht geplant

73 Anfragen an `/`, eine pro Sekunde:

| Sekunde | Antwort | Was da war |
|---|---|---|
| 1–7 | `200` | der alte Stand |
| 8 | keine Verbindung | der Wechsel beginnt |
| 9–17 | **`404`** | Traefik hat keinen Backend für die Regel |
| 18–61 | `200` | `sha-581f5c0` bedient |
| 62 | keine Verbindung | der Rollback beginnt |
| 63–72 | **`404`** | dasselbe noch einmal |
| 73 | `200` | `sha-ae939d4` bedient |

**Jeder Container-Wechsel kostet rund zehn Sekunden, in denen die öffentliche
Seite 404 antwortet.** Nicht 502 — *404*. Der alte Container ist weg, der neue
noch nicht da, und Traefik fällt auf seine Standardantwort zurück. Für einen
Besucher heißt das „diese Seite gibt es nicht", für einen Crawler dasselbe.

Das trifft **jeden** Deploy, nicht nur den Drill: zwei Wechsel in drei Minuten
sind Drill-spezifisch, der einzelne Zehn-Sekunden-Trichter ist es nicht.

`verify-deploy.sh` sieht davon nichts. Es fragt `/` genau einmal, ganz am Ende,
und da steht die Seite wieder. Die Zusicherung des Gates lautet „der bestellte
Build bedient die Seite" — sie lautet **nicht** „kein Besucher hat einen Fehler
gesehen", und nach dieser Messung darf sie auch nicht so gelesen werden. Der
Backlog führt es als Fund; die Reparatur ist ein Thema für sich
(`traefik.http.services…` und ein überlappender Start), nicht für E4b.

#### Wenn der Rollback nicht hochkommt

`✗ THE ROLLBACK DID NOT COME UP EITHER` heißt: die Seite ist unten, und dieses
Skript kann es nicht mehr richten. Dann Handbetrieb, direkt darunter — der
vorherige Tag von Hand in `IMAGE_TAG`, über die API oder im Panel. Deshalb wird
ein Drill nur gefahren, solange mindestens ein weiterer funktionierender Stand
in GHCR liegt.

---

### Handbetrieb

Von deinem Rechner, durch denselben Tunnel und dieselben Skripte, die die
Pipeline fährt:

```bash
ssh -N -L 3000:127.0.0.1:3000 <vps> &          # der Tunnel aus 3.4
export DOKPLOY_API_KEY=… DOKPLOY_COMPOSE_ID=…
make deploy DEPLOY_TAG=sha-XXXXXXX             # gibt den vorherigen Tag aus
make verify-deploy DEPLOY_SHA=XXXXXXX
```

Oder im Panel den vorherigen SHA-Tag in `IMAGE_TAG` eintragen und deployen.
Kein Git-Revert, kein Build — deshalb nie `latest`; ein Tag, der umgehängt
werden kann, ist kein Rollback-Ziel. `tools/deploy.sh` weist `latest`
ausdrücklich ab.

**Rechne damit, dass das Image lokal nicht mehr liegt.** Dokploys
`docker-cleanup` läuft täglich um 23:50 UTC mit `docker image prune --all`, und
das entfernt jedes Image ohne laufenden Container — den vorherigen Stand also
schon in der Nacht nach dem Deploy, nicht erst nach einer Woche. Ein Rollback am
Tag darauf beginnt deshalb praktisch immer mit den zwei `docker pull` aus 3.3.
Die lokale Platte ist nicht die Aufbewahrung, **GHCR ist es** — und was GHCR
aufhebt, steht in 3.5.

**Ein Rollback des Images rollt das Schema nicht mit zurück.** Seit E4 ist das
keine Empfehlung mehr, sondern die Bedingung, unter der der Automatismus sicher
ist: eine Migration, die eine Spalte löscht, macht einen automatischen Rollback
zu einem Ausfall. Expand/Contract in zwei Deploys,
`docs/runbooks/migrations.md`.

---

## Der Zeuge

Die Tabelle oben entstand mit einer von Hand getippten Schleife, die mit ihrem
Terminal wieder verschwand. Seit E5a ist sie ein Befehl im Repository — Issue
[#143](https://github.com/G1NG4R/timseil-dev/issues/143) verlangt genau das:
*„whatever produces the witness is a command in the repository, not a shell loop
somebody remembers"*.

```bash
make witness WITNESS_UNTIL="--until-restart"
```

Eine Anfrage je Sekunde auf `/` **und** `/api/health`, von außen über den
öffentlichen Namen. Der Lauf endet dreißig Sekunden nachdem `/api/health` von
einem **neuen Prozess** antwortet — der Drill hat gezeigt, warum nicht früher:
der zweite Wechsel begann 44 Sekunden nach dem ersten.

### Vor dem Merge starten, nicht danach

**Das ist keine Feinheit, das ist die Bedienung.** Zwischen Merge und
Container-Wechsel liegen `check`, `db` und `publish` — gemessen 228 s und 258 s
bei den letzten beiden Deploys. Wer danach anfängt, schreibt eine Tabelle mit
lauter `200` mit, in der kein Deploy vorkommt.

Genau das ist am 22.08.2026 passiert, beim Merge der Phase, die den Zeugen
gebaut hat: gestartet um 16:59:53 UTC, der neue Prozess war seit 16:56:22 oben.
Dreieinhalb Minuten zu spät, und das Ergebnis las sich wie ein sauberer Deploy.

Deshalb gibt es `--until-restart` **ohne** SHA: den Squash-SHA gibt es erst,
wenn der Merge schon durch ist, und ein Schalter, der den Start bis dahin
aufhält, ist ein Schalter, der zu spät startet. `--until-sha` bleibt für den
Fall, dass ein bestimmter Build gemeint ist — es verlangt jetzt zusätzlich einen
neuen Prozess und wird rot, wenn der Commit schon bediente, als der Lauf begann.

### Was die Ausgabe sagt

Läufe gleicher Antwort werden zu einer Zeile zusammengefasst — dieselbe Form wie
die Drill-Tabelle oben, sonst begräbt eine Fünf-Minuten-Messung zehn Sekunden
unter dreihundert Zeilen `200`.

```
/
  1–14        200
  15          no connection
  16–25       404
  26–61       200

  ✗ / — 61 requests, 55×200, 10×404, 1×no connection
```

Drei Klassen, nicht zwei: `200`, jede andere Statuszeile, und **keine
Verbindung**. Die dritte wegzulassen wäre derselbe Fehler eine Etage tiefer, den
„null 5xx" eine Etage höher war — der Drill hat beide Fehlerarten gesehen.

### Die zwei Fälle, in denen er rot wird, ohne dass die Seite schuld ist

- **`✗ … never answered — this window is not the deploy`.** Der genannte Commit
  ist in der ganzen Zeit nie erschienen. Dann ist die Tabelle die Messung eines
  anderen Zeitraums, und grün darüber wäre ein Haken über einer Messung, die
  nicht stattgefunden hat. Meist ist der Deploy gescheitert, bevor er tauschte —
  der Actions-Lauf sagt, woran.
- **`429`.** Das wäre der Zeuge selbst: eine Anfrage je Sekunde je Pfad, davon
  eine an die API, gegen `RATE_LIMIT_RPM=120`. Erscheint sie trotzdem, hat
  jemand das Limit gesenkt oder ein zweiter Zeuge läuft mit.

Der Zeuge ist ein **zweites Instrument neben `verify-deploy.sh`**, keine sechste
Bedingung darin. Die beiden beantworten verschiedene Fragen, und das ist der
ganze Punkt: „läuft der bestellte Build" und „hat ein Besucher einen Fehler
gesehen" sind nicht dieselbe Zusage.

---

## Was wem gehört

Die Trennlinie ist die ganze Phase. Was links steht, versioniert dieses Repo
nicht — und was es nicht versioniert, muss hier stehen, sonst ist es nach dem
nächsten Dokploy-Upgrade weg und niemand weiß, was fehlt.

| Dokploys (Host, nicht im Repo) | Unseres (`compose.yaml`) |
|---|---|
| Entrypoint-Namen und ihre Ports | `traefik.enable=true` |
| Der ACME-Certresolver, `acme.json` | `traefik.docker.network=dokploy-network` |
| Der globale HTTP→HTTPS-Redirect | Die Router: Regel, Entrypoint, TLS, Priorität |
| `tls.options` — Mindestversion, Ciphers | Die zwei `loadbalancer.server.port` |
| Der Prometheus-Metrik-Entrypoint | Die `timseil-www`-Redirect-Middleware |
| `exposedByDefault` | Die Netz-Zugehörigkeit jedes Dienstes |
| Das Netz `dokploy-network` selbst | — |

### Die fünf Stolpersteine

Aus dem `Operations`-Blatt, mit der Zeile, die jeden verhindert:

| # | Stolperstein | Wo er abgefangen ist |
|---|---|---|
| 1 | Container ohne `dokploy-network` **und** ohne `traefik.docker.network` — Proxy und Dienst finden sich nicht | `check-compose` Regeln 9 und 11, `check-topology` Zusicherung 7 |
| 2 | Container-Port nicht gesetzt; bei mehreren Ports rät Traefik falsch, das Ergebnis sind Timeouts | `check-compose` Regel 10 hält `loadbalancer.server.port` gegen `expose:` |
| 3 | „Volumes relativ als `../files/…` mounten" | **Wir folgen dem nicht.** Das ist ein Bind Mount, und Dokploys S3-Volume-Backups sehen nur Named Volumes — der Rat bräche die Sicherung, auf die dasselbe Blatt sich stützt. `check-compose` Regel 3 weist ihn ab (#79) |
| 4 | `acme.json` braucht Modus 600, sonst legt Traefik keine Zertifikate ab | Dokploys Sache; bei „kein Zertifikat" als Zweites prüfen |
| 5 | Alte gestoppte Container mit Traefik-Labels erzeugen Routing-Konflikte | Der wöchentliche Prune |

---

## Danach — L1, nicht E1

**Wenn Teil 4 durchläuft, ist D3 fertig und der nächste Schritt ist L1.** Nicht
E1, obwohl E1 im Bauplan als nächste Stufe steht. *(L1 ist inzwischen gebaut —
das Blatt dazu ist `docs/runbooks/mail.md`, die Entscheidung ADR 0029. Der
Absatz bleibt stehen, weil die Begründung für die Reihenfolge nicht mit ihr
verfällt.)*

Der Grund ist eine Uhr, die außerhalb deiner Kontrolle läuft (Bauplan Anhang D,
Zeile 1472): **DMARC braucht `p=none` plus zwei Wochen Berichte**, bevor du auf
`quarantine` verschärfen darfst. Beginnt diese Uhr erst nach dem Launch,
verschärfst du die Regel erst nach dem Launch.

Zwei weitere Gewinne, die daran hängen: ohne Postfach ist das Kontaktformular aus
C6 nicht end-to-end testbar, und **`MAIL_TRANSPORT=log` aus den Startsperren muss
in L1 wieder auf `smtp`** — solange es steht, nimmt der Endpoint Nachrichten an
und stellt keine zu. Der Klickweg dafür ist `docs/runbooks/mail.md`, Teil 2.

L1 ist eine Phase: Postfach bei OVH, SMTP `ssl0.ovh.net`, `From:` muss dem
SMTP-Konto entsprechen (also `contact@timseil.dev`, Besucheradresse in
`Reply-To`), und in der DNS-Zone `MX`, **genau ein** `v=spf1` mit
`include:mx.ovh.com`, DKIM per Klick und DMARC auf `p=none`. Fertig, wenn
mail-tester ≥ 9/10.

Was L1 dann tatsächlich vorfand, weicht davon ab und steht in ADR 0029: das
Postfach liegt auf Zimbra statt auf dem klassischen MX Plan, MX und SPF standen
bereits korrekt, und DKIM war als **CNAME** aktiv, bevor die Phase anfing —
womit die DNS-Hälfte genau ein Eintrag war statt vier.

## Was hier nicht steht

Damit eine Lücke als Verschiebung lesbar ist und nicht als Vergessen:

| Fehlt | Phase |
|---|---|
| MX, SPF, DKIM, DMARC — und ein testbares Kontaktformular | **L1**, direkt nach dieser Phase → `docs/runbooks/mail.md` |
| Dokploy-UI hinter den SSH-Tunnel, `/api/internal/*` am Traefik blocken, `nmap`-Abnahme | **L3** |
| Security-Header, HSTS, CSP | **L4** — HSTS bewusst erst, wenn die Domain final ist |
| Rate-Limit in Traefik, fail2ban, Firewall, CAA, DNSSEC | **L5** |
| Nächtlicher `pg_dump` nach S3 mit Löschschutz | **L6** |
| Das Scrapen der Metriken aus 3.2, node- und postgres-exporter, Recording Rules | **F3** |
| Prometheus, Loki und Alloy — und das Netz, an dem die bestehende Grafana hängt | **F2 — gebaut** → `docs/runbooks/observability.md` |
| Die Pipeline, die baut, pusht und deployt (siehe 1.3, 2.3 und ADR 0033) | **E1 / E3 / E4 — gebaut** |
