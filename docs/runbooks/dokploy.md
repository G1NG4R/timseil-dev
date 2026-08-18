# Runbook — Dokploy, Traefik und die Platte

**Leser:** ich, wenn die Seite zum ersten Mal hochkommt, und ich, wenn sie
nicht mehr erreichbar ist und der Stack trotzdem grün aussieht.

Der VPS liegt bei OVH, verwaltet mit Dokploy (ADR 0008). Dokploy bringt Traefik
und Let's Encrypt mit — eine zweite Proxy-Instanz gibt es nicht und darf es
nicht geben, sie stritte um Port 80 und 443. ADR 0028 ist die Entscheidung,
`compose.yaml` die Datei, und dieses Blatt der Weg.

---

## Was wem gehört

Die Trennlinie ist die ganze Phase. Was links steht, versioniert dieses Repo
nicht — und was es nicht versioniert, muss hier aufgeschrieben sein, sonst ist
es nach dem nächsten Dokploy-Upgrade weg und niemand weiß, was fehlt.

| Dokploys (Host, nicht im Repo) | Unseres (`compose.yaml`) |
|---|---|
| Entrypoint-Namen und ihre Ports | `traefik.enable=true` |
| Der ACME-Certresolver, `acme.json` | `traefik.docker.network=dokploy-network` |
| Der globale HTTP→HTTPS-Redirect | Die Router: Regel, Entrypoint, TLS, Priorität |
| `tls.options` — Mindestversion, Ciphers | Die zwei `loadbalancer.server.port` |
| Der Prometheus-Metrik-Entrypoint | Die `timseil-www`-Redirect-Middleware |
| `exposedByDefault` | Die Netz-Zugehörigkeit jedes Dienstes |
| Das Netz `dokploy-network` selbst | — |

---

## Schritt 1 — Traefik lesen, bevor irgendetwas geglaubt wird

**Das ist kein optionaler Schritt.** In `compose.yaml` stehen drei Werte, die
Dokploy gehören. Stimmen sie nicht, kommt kein Zertifikat, und der Fehler sieht
aus wie ein DNS-Problem.

```bash
ssh <vps>
docker ps --format '{{.Names}}\t{{.Image}}' | grep -i traefik
cat /etc/dokploy/traefik/traefik.yml
ls -l /etc/dokploy/traefik/dynamic/
```

Drei Antworten notieren, und wenn eine abweicht, `compose.yaml` korrigieren
statt den Host:

| Frage | Steht in `compose.yaml` als |
|---|---|
| Wie heißt der TLS-Entrypoint? | `entrypoints=websecure` |
| Wie heißt der Certresolver? | `tls.certresolver=letsencrypt` |
| Leitet der HTTP-Entrypoint global auf HTTPS um? | *nichts* — wenn nein, braucht jeder Router einen zweiten auf dem HTTP-Entrypoint |

Vierte Frage, für die es keine Zeile gibt, aber eine Folge: steht
`exposedByDefault: true`, baut Traefik auch für `db`, `migrate` und `seed`
Router. Erreichbar sind sie trotzdem nicht — sie liegen nicht im Proxy-Netz —
aber es ist Rauschen. Die Korrektur gehört auf den Host, nicht in unsere Datei:
ein `traefik.enable=false` an `db` wäre ein Traefik-Label an einem geschlossenen
Dienst, und `make check-compose` weist es zu Recht ab.

Und das Netz selbst:

```bash
docker network inspect dokploy-network \
  --format '{{.Driver}} {{range .IPAM.Config}}{{.Subnet}} {{end}}'
```

Das Subnetz wird in Schritt 6 gebraucht. Ist der Treiber `overlay` statt
`bridge`, läuft Dokploy im Swarm-Modus — dann stimmen ein paar Annahmen hier
nicht mehr und das gehört als Fund in den Backlog, bevor es weitergeht.

---

## Schritt 2 — Die Images nach GHCR · **einmalig, bis E4**

**Das hier ist eine Brücke, kein Verfahren.** `make images` taggt nur lokal, und
der Makefile-Kommentar sagt warum: pushen ist E4s Aufgabe und passiert in
GitHub Actions. Die Pipeline gibt es aber erst in E1/E4, und ohne ein Image in
der Registry hat Dokploy nichts zu ziehen. Also einmal von Hand, für genau
diesen einen Commit:

```bash
make images
echo "$GITHUB_PAT" | docker login ghcr.io -u G1NG4R --password-stdin
export IMAGE_TAG=sha-$(git rev-parse --short=7 HEAD)
docker push ghcr.io/g1ng4r/timseil-api:$IMAGE_TAG
docker push ghcr.io/g1ng4r/timseil-web:$IMAGE_TAG
```

Danach beide Pakete auf **public** stellen (GitHub → Packages → Package
settings → Change visibility). Das Repo ist public, also ist das konsistent —
und Dokploy braucht dann kein Registry-Credential. Nachgemessen wird es so:

```bash
docker logout ghcr.io
docker pull ghcr.io/g1ng4r/timseil-api:$IMAGE_TAG   # geht das anonym, ist es public
```

**Was diese Brücke nicht bricht:** gebaut wird weiterhin nicht auf dem VPS, und
das Artefakt, das läuft, ist dasselbe, das `make check-images` und
`make check-topology` hier geprüft haben. Nur der Weg in die Registry ist
vorläufig ein Handgriff. Der zweite Deploy kommt aus Actions.

---

## Schritt 3 — Die Compose-App anlegen

**Compose, nicht Swarm-Application.** Fünf Container mit einer Startreihenfolge
über `depends_on` mit `service_healthy` und `service_completed_successfully`
passen in eine Swarm-Application nicht hinein.

- Provider: Git, Repository `G1NG4R/timseil-dev`, Branch `main`
- Compose-Pfad: `compose.yaml`
- **Dokploys eigenes Postgres und Redis bleiben unbenutzt.** Unsere Datenbank
  steht in `compose.yaml` mit ihren Rollen, ihrem Volume und ihrem initdb-Skript.

---

## Schritt 4 — Die Umgebungsvariablen

Alle in der Dokploy-UI, keine in einer Datei auf dem Host. `compose.yaml` trägt
kein `env_file:`, und `make check-compose` weist eins ab.

`.env.example` ist die vollständige Liste mit den Begründungen. Was in
Produktion gesetzt sein **muss**:

| Variable | Anmerkung |
|---|---|
| `IMAGE_TAG` | `sha-<7 Zeichen>`. Ohne sie startet nichts, und das ist Absicht |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Bootstrap-Superuser |
| `MIGRATE_DB_PASSWORD`, `APP_DB_PASSWORD` | Die zwei Rollen aus `10-roles.sh` |
| `DATABASE_URL` | `timseil_app` — der `api`-Dienst |
| `MIGRATE_DATABASE_URL` | `timseil_migrate` — nur `migrate` und `seed` |
| `GITHUB_TOKEN` | Scope `read:user`, nur für den Contribution-Graph |
| `MAIL_TRANSPORT`, `SMTP_*`, `MAIL_TO` | OVH-SMTP. **Bis L1 gibt es kein Postfach** — solange bleibt das Formular ungetestet |
| `CONTACT_IP_PEPPER` | |
| `INTERNAL_PROBE_TOKEN`, `INTERNAL_DEPLOY_TOKEN` | |
| `CORS_ALLOWED_ORIGINS` | Muss dieselben Hostnamen nennen wie die Router-Regeln |
| `TRUSTED_PROXY_CIDRS` | **Schritt 6** — erst nach dem ersten Deploy |

**Die Dokploy-Oberfläche sieht jede dieser Variablen.** Sie ist damit das
lohnendste Ziel der Maschine, und sie zuzumachen ist L3.

---

## Schritt 5 — Der erste Deploy

DNS vorher prüfen, sonst scheitert die ACME-Challenge und Let's Encrypt zählt
den Fehlversuch gegen das Rate-Limit:

```bash
dig +short timseil.dev A
dig +short timseil.dev AAAA
dig +short www.timseil.dev
```

Dann im Panel deployen und zusehen:

```bash
docker compose -f compose.yaml ps -a
```

Erwartet: `migrate` und `seed` mit Exit 0, `db`, `api` und `web` healthy. Was
welcher Zustand bedeutet, steht in `docs/runbooks/compose.md` — dieselbe Kette,
dieselben Fehlerbilder, unabhängig davon, wer sie startet.

---

## Schritt 6 — `TRUSTED_PROXY_CIDRS` nachtragen

Erst jetzt, weil das Subnetz erst existiert, wenn das Netz existiert.

```bash
docker network inspect dokploy-network \
  --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}'
```

Wert in der Dokploy-UI setzen, `api` neu starten. **Dann einmal nachmessen statt
zu schließen:** die Seite aufrufen und die Client-Adresse im Log der API lesen.
Steht dort bei jedem Request dieselbe Adresse, ist die Variable leer oder falsch
— dann teilen sich alle Besucher einen Rate-Limit-Eimer, und der erste Ansturm
sperrt die ganze Seite aus. ADR 0015 und `.env.example` nennen beide Richtungen.

---

## Schritt 7 — Traefik-Metriken einschalten

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

Drei Dinge dazu:

- **Ein eigener Entrypoint, nicht `websecure`.** Auf 80/443 wäre der Metrikpfad
  öffentlich, sobald ein Router ihn trifft. Prometheus, Loki und Alloy haben
  keine Authentifizierung — der Schutz ist die Netzgrenze, sonst nichts.
- **Port 8082 wird nicht auf den Host veröffentlicht.** Von außen antworten 22,
  80 und 443. Alloy scrapt ihn ab F3 von innen.
- **`addRoutersLabels` ist per Default aus**, und ohne sie gibt es keine
  `traefik_router_*`-Serien — F3 hätte für seine Routen-Panels nichts zu
  zeichnen. Bei zwei Routern ist die Kardinalität folgenlos.

Prüfen:

```bash
sh ops/host/check-traefik-metrics.sh
```

**Nach jedem Dokploy-Upgrade wiederholen.** Ob Dokploy `traefik.yml`
regeneriert, ist offen — wenn ja, verschwindet diese Einstellung still, und
dieses Skript ist das, was es merkt.

---

## Schritt 8 — Die Platte

Bei 40 GB ist das keine Kür. Der schnellste Verbraucher sind **nicht die Logs**,
sondern alte Image-Layer: jeder Deploy legt eins an, Docker räumt nicht von
selbst auf, und `loki`, `prometheus` und Postgres liegen auf derselben NVMe.
Eine volle Platte ist keine langsame Seite, sondern eine Datenbank, die keine
Schreibrechte mehr hat.

**Zwei Hälften.** In der Dokploy-UI die Image-Retention auf die letzten 3–5
Stände. Und der wöchentliche Timer aus diesem Repo:

```bash
sudo sh ops/host/install.sh
systemctl start timseil-prune.service        # einmal jetzt, um die Zahlen zu sehen
journalctl -u timseil-prune -n 40 --no-pager
```

**Läuft in Dokploy schon eine eigene Docker-Cleanup-Aufgabe, wird eine der
beiden abgeschaltet.** Zwei Prune-Jobs, die einander in die Quere kommen, sind
schwerer zu lesen als einer.

### Was der Prune wegnimmt — und was nie

**Nie `--volumes`.** `docker system prune -a --volumes` löscht unbenutzte
Named Volumes, und `timseil_db-data` ist genau in den Sekunden zwischen `down`
und `up` eines Redeploys unbenutzt. Das Skript nimmt deshalb **gar keine
Argumente** entgegen.

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

---

## Die Abnahme

Das „fertig wenn" des Bauplans für D3, als Kommandos:

```bash
curl -sI  https://timseil.dev                       # 200, gültiges Zertifikat
curl -sI  https://www.timseil.dev                   # 301 → https://timseil.dev
curl -sI  http://timseil.dev                        # 301 → https
curl -s   https://timseil.dev/api/health | jq .sha  # der deployte Commit
curl -sI  https://timseil.dev/api/docs              # 200
sh ops/host/check-traefik-metrics.sh                # traefik_* innen, nichts außen
systemctl list-timers timseil-prune.timer           # scharf
docker system df                                    # 0 B Build-Cache
```

Die `jq .sha`-Zeile ist die, an der alles hängt: sie sagt, dass das, was gemergt
wurde, tatsächlich läuft. Der Build-Cache mit 0 B ist die Abnahme aus Anhang C
— steht dort etwas, wurde auf dem VPS gebaut.

---

## Rollback

Im Panel den vorherigen SHA-Tag deployen. Kein Git-Revert, kein Build — deshalb
nie `latest`. Liegt der Tag länger als eine Woche zurück, vorher die zwei
`docker pull` von oben.

**Ein Rollback des Images rollt das Schema nicht mit zurück.** Deshalb
expand/contract in zwei Deploys, `docs/runbooks/migrations.md`.

---

## Die fünf Stolpersteine

Aus dem `Operations`-Blatt, mit der Zeile, die jeden verhindert:

| # | Stolperstein | Wo er hier abgefangen ist |
|---|---|---|
| 1 | Container ohne `dokploy-network` **und** ohne `traefik.docker.network` — Proxy und Dienst finden sich nicht | `check-compose` Regeln 9 und 11, `check-topology` Zusicherung 7 |
| 2 | Container-Port nicht gesetzt; bei mehreren Ports rät Traefik falsch, das Ergebnis sind Timeouts | `check-compose` Regel 10 hält `loadbalancer.server.port` gegen `expose:` |
| 3 | „Volumes relativ als `../files/…` mounten" | **Wir folgen dem nicht.** Das ist ein Bind Mount, und Dokploys S3-Volume-Backups sehen nur Named Volumes — der Rat des Blattes bräche die Sicherung, auf die dasselbe Blatt sich stützt. `check-compose` Regel 3 weist ihn ab |
| 4 | `acme.json` braucht Modus 600, sonst legt Traefik keine Zertifikate ab | Dokploys Sache; bei „kein Zertifikat" als Erstes `ls -l` darauf |
| 5 | Alte gestoppte Container mit Traefik-Labels erzeugen Routing-Konflikte | Der wöchentliche Prune. Bei seltsamem Routing: `docker ps -a --filter label=traefik.enable=true` |

---

## Was hier nicht steht

Damit eine Lücke als Verschiebung lesbar ist und nicht als Vergessen:

| Fehlt | Phase |
|---|---|
| MX, SPF, DKIM, DMARC — und damit ein testbares Kontaktformular | **L1**, direkt nach dieser Phase (externe Uhr: DMARC braucht zwei Wochen `p=none`) |
| Dokploy-UI hinter den SSH-Tunnel, `/api/internal/*` am Traefik blocken, `nmap`-Abnahme | **L3** |
| Security-Header, HSTS, CSP | **L4** — HSTS bewusst erst, wenn die Domain final ist |
| Rate-Limit in Traefik, fail2ban, Firewall, CAA, DNSSEC | **L5** |
| Nächtlicher `pg_dump` nach S3 mit Löschschutz | **L6** |
| Prometheus, Loki, Alloy, Grafana — und das Scrapen der Metriken von Schritt 7 | **F2 / F3** |
| Die Pipeline, die baut, pusht und den Deploy-Webhook ruft (siehe Schritt 2) | **E1 / E4** |
