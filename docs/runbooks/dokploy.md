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
- [ ] Ein GitHub-PAT — **klassisch**, nicht fine-grained, mit zwei Scopes:
      `write:packages` (für den einmaligen Push in Teil 1.3) und `read:user`
      (das wird `GITHUB_TOKEN` für den Contribution-Graph).
      github.com/settings/tokens

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
| `IMAGE_TAG` | `sha-` plus die ersten 7 Zeichen des Commits, Teil 1.3 |
| `POSTGRES_DB` | `timseil` |
| `POSTGRES_USER` | `timseil_boot` |
| `POSTGRES_PASSWORD` | 0.2 |
| `MIGRATE_DB_PASSWORD`, `APP_DB_PASSWORD` | 0.2 |
| `DATABASE_URL`, `MIGRATE_DATABASE_URL` | 0.3 |
| `GITHUB_TOKEN` | das PAT aus 0.1 — oder leer lassen **und** die Zeile darunter setzen |
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
und in einem Job. **Hier steht nichts mehr, was du regelmäßig tust.** Der
Handgriff, der bis D3 an dieser Stelle stand, war eine Brücke und ist abgebaut;
Issue #90 hält fest, was davon noch offen ist (die GHCR-Aufbewahrung, E4).

Was du brauchst, ist der Tag:

```bash
git checkout main && git pull
make image-tag                              # DAS ist der Wert für Dokploy
```

Er entsteht aus `HEAD`, also nennt er genau den Commit, den der letzte grüne
`publish`-Lauf veröffentlicht hat.

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

### 2.3 Deployen und zusehen

**Nicht zwischen 23:45 und 00:00 UTC deployen.** Dokploys `docker-cleanup` läuft
um 23:50 UTC und fährt `docker system prune --all --force`. Der Wrapper
`dockerSafeExec` wartet zwar bis zu 300 s auf einen ruhenden Docker, startet
danach aber trotzdem — ein Redeploy in diesem Fenster überschneidet sich mit dem
Prune. Volumes sind dabei sicher (siehe 3.3), gestoppte Container und nicht
referenzierte Images nicht.

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

**Nicht die Seite.** `web/app/page.tsx` ist heute eine Entwicklungshülle:

> **timseil.dev**
> Development shell. The site itself is built in stage H.

Das ist richtig so und kein Fehler. D3 verbindet den Stack mit der Welt; die
Seite selbst entsteht in den Stufen G und H. Was hier zählt, ist, dass ein
Zertifikat kommt, dass `/api/health` den Commit nennt, den du gepusht hast, und
dass `/api/docs` die Contract-Oberfläche zeigt — **das** ist die Abnahme, nicht
das Aussehen der Startseite.

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
```

Traefik neu starten. Drei Dinge dazu:

- **Ein eigener Entrypoint, nicht `websecure`.** Auf 80/443 wäre der Metrikpfad
  öffentlich, sobald ein Router ihn trifft. Prometheus, Loki und Alloy tragen
  keine Authentifizierung — der Schutz ist die Netzgrenze, sonst nichts.
- **Port 8082 wird nicht auf den Host veröffentlicht.** Von außen antworten 22,
  80 und 443. Alloy scrapt ihn ab F3 von innen.
- **`addRoutersLabels` ist per Default aus**, und ohne sie gibt es keine
  `traefik_router_*`-Serien — F3 hätte für seine Routen-Panels nichts zu
  zeichnen. Bei zwei Routern ist die Kardinalität folgenlos.

Prüfen:

```bash
cd ~/timseil-dev && sh ops/host/check-traefik-metrics.sh
```

**Nach jedem Dokploy-Upgrade wiederholen.** Ob Dokploy `traefik.yml`
regeneriert, ist ungeprüft — wenn ja, verschwindet diese Einstellung still, und
dieses Skript ist das, was es merkt.

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
docker system df                                    # 0 B Build-Cache
```

Die `jq .sha`-Zeile ist die, an der alles hängt: sie sagt, dass das, was gemergt
wurde, tatsächlich läuft. Sie muss die sieben Zeichen aus Teil 1.3 zeigen.

**Die `acme-challenge`-Zeile ist die zweitwichtigste, und sie ist neu.** Der
Router `timseil-http` sitzt auf demselben Entrypoint, über den der Certresolver
seine `httpChallenge` abwickelt. Antwortet dieser Pfad mit **404**, hat Traefiks
interner ACME-Router gewonnen und die Erneuerung funktioniert. Antwortet er mit
**301**, verschluckt unser Redirect die Challenge — dann erneuert sich das
Zertifikat in rund 60 Tagen nicht, und auffallen würde es erst, wenn die Seite
offline ist. Deshalb trägt der Router `priority=1`.

Der Build-Cache mit **0 B** ist die Abnahme aus Anhang C — steht dort etwas,
wurde auf dem VPS gebaut, und dann stimmt die ganze Kette nicht mehr.

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

Im Panel den vorherigen SHA-Tag deployen. Kein Git-Revert, kein Build — deshalb
nie `latest`.

**Rechne damit, dass das Image lokal nicht mehr liegt.** Dokploys
`docker-cleanup` läuft täglich um 23:50 UTC mit `docker image prune --all`, und
das entfernt jedes Image ohne laufenden Container — den vorherigen Stand also
schon in der Nacht nach dem Deploy, nicht erst nach einer Woche. Ein Rollback am
Tag darauf beginnt deshalb praktisch immer mit den zwei `docker pull` aus 3.3.
Die lokale Platte ist nicht die Aufbewahrung, **GHCR ist es.**

**Ein Rollback des Images rollt das Schema nicht mit zurück.** Deshalb
expand/contract in zwei Deploys, `docs/runbooks/migrations.md`.

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
| Prometheus, Loki, Alloy, Grafana — und das Scrapen der Metriken aus 3.2 | **F2 / F3** |
| Die Pipeline, die baut, pusht und den Deploy-Webhook ruft (siehe 1.3) | **E1 / E4** |
