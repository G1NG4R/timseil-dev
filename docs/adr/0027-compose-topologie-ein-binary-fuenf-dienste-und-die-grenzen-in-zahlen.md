# ADR 0027 — Compose-Topologie: ein Binary, fünf Dienste und die Grenzen in Zahlen

**Status:** Angenommen
**Datum:** 2026-08-18
**Betrifft:** D2, D3, E1, E4, E5, H1, K1, L2
**Invarianten:** 1 (keine erfundenen Zahlen)

## Kontext

D1 hat zwei Images gebaut. Sie liegen da und laufen nicht: es gibt keine Datei,
die aus ihnen einen Stack macht. `compose.yaml` fehlt, und mehrere Stellen im
Repo warten namentlich darauf — `tools/check-compose.sh` scannt sie schon und
meldet „does not exist yet", `stack.yaml` trägt den Kommentar „compose.yaml
arrives in D2", und `compose.dev.yaml` reicht an vier Stellen ausdrücklich
Arbeit weiter.

Abnahme laut Bauplan Zeile 1084: **`down -v && up` reproduziert den Zustand ohne
Handgriff.** Dazu Ressourcen-Limits pro Dienst und ausschließlich Named Volumes.

## Entscheidung

### 1. Ein Binary, zwei Unterbefehle — kein zweites und kein drittes Image

`migrate` und `seed` laufen als Init-Container. Sie brauchen ihre Programme in
einem Image, und das API-Image trug nur `/api`. Drei Möglichkeiten, und die
Größen entscheiden sie. **Gemessen auf diesem Commit**, mit den Flags aus
`api/Dockerfile`:

| Binary | Größe |
|---|---|
| `api` allein | 12,06 MiB |
| `migrate` allein | 11,07 MiB |
| `seed` allein | 9,02 MiB |
| **drei getrennt, in einem Image** | **32,15 MiB** |
| **alle drei in einem Binary** | **14,87 MiB** |

Go teilt zwischen zwei Binaries nichts: Laufzeit, `crypto/tls` und pgx werden
jedes Mal neu bezahlt. Zusammengelegt fallen sie einmal an. Das fertige Image
misst **16 MiB** gegen die 20-MiB-Grenze, die `make check-images` seit D1
durchsetzt — dieselbe Grenze steht als Abnahmekriterium im Bauplan und als Zahl
im README.

Also: `api migrate up` und `api seed`, ausgewertet vor `config.Load`, genau wie
die Healthcheck-Flagge aus ADR 0026 §3. `api/cmd/migrate` und `api/cmd/seed`
entfallen; ihr Code liegt jetzt in `api/cmd/api/migrate.go` und `seed.go`.

**Die Rollentrennung bleibt unberührt.** Sie hing nie daran, in welcher Datei
der Code steht, sondern an der DSN, die ein Dienst bekommt: `migrate` trägt
`MIGRATE_DATABASE_URL`, der `api`-Dienst bekommt sie nicht, der Seed läuft als
`timseil_app` (ADR 0011, ADR 0013). Das ändert diese Entscheidung nicht.

**Ein Image hält außerdem eine Zusage, auf die Issue #28 sich stützt:** der Seed
schreibt `systems.stack` aus einem beim Bauen eingebetteten Manifest, ein
Rollback des Images rollt seine Stack-Aussagen also mit zurück. Bei einem Tag
ist das ein Mechanismus. Bei dreien wäre es eine Konvention, die jemand einhält.

### 2. Fünf Dienste, nicht vier — die Abweichung vom Bauplan

Bauplan Zeile 1084, Handbuch Kapitel 25 und `docs/architecture/c4-container.md`
zeichnen `db → migrate → api → web`. Gebaut wird
**`db → migrate → seed → api → web`.**

Der Seed gehört nach die Migration und vor den Start der Anwendung — so steht es
in `docs/runbooks/seed.md` und in Issue #28, und ADR 0013 hat ihn zum
Inhaltsträger gemacht, den ein Deploy mitbringt. Ohne ihn liefert ein frischer
Deploy eine Seite ohne Systeme und ohne Tracks, und der leere Zustand sieht aus
wie ein Fehler in dem, was zuletzt geändert wurde.

**Der Bauplan wurde überholt, nicht ignoriert.** Er ist älter als ADR 0012 und
ADR 0013. Er bleibt unverändert: den Plan an die Umsetzung anzupassen löscht die
Spur dessen, was sich geändert hat. `c4-container.md` wird korrigiert, denn das
Blatt beschreibt, was läuft, nicht was geplant war.

### 3. Die Grenzen, und woher die Zahlen kommen

`deploy.resources.limits` wirkt auch ohne Swarm — `make check-topology` liest
sie nach dem Start aus `docker inspect` zurück, statt es zu glauben.
`reservations.cpus` steht nicht da: das ist ein Swarm-Hinweis und täte hier
nichts, und eine Zahl, die nichts tut, gehört nicht in eine Datei.

Kapitel 10 budgetiert die Gruppe „Traefik · Next.js · Go API · PostgreSQL" auf
~600 MB. Traefik gehört Dokploy (~100 MB), also sind **die Reservierungen das
Budget und die Limits der Explosionsradius:**

| Dienst | Limit | Reservierung | Herleitung |
|---|---|---|---|
| `db` | 512M / 1,00 CPU | 256M | `shared_buffers` 128 MB (Default; Postgres leitet ihn **nicht** aus dem Limit ab) + 3 Autovacuum-Worker à 64 MB + ~25 Backends à ~8 MB. Eine ganze CPU, weil ein Vacuum oder ein Index-Build eine will |
| `api` | 256M / 0,75 | 64M | 15-MiB-Binary, Pool mit 10 Verbindungen |
| `web` | 512M / 1,00 | 160M | Next.js standalone, SSR, plus 96M tmpfs |
| `migrate`, `seed` | 128M / 0,50 | — | laufen durch; das Limit deckelt einen Amoklauf, es bemisst keinen Bedarf |

Summe der Reservierungen: 480 MB. **Das sind hergeleitete Zahlen, keine
gemessenen** — anders als die Größen oben. Sie stehen hier mit ihrer Herleitung,
damit die nächste Phase sie gegen echte `docker stats` halten kann statt gegen
eine Erinnerung.

**Zwei Zahlen, die keine Laufzeit von selbst findet**, und beide sind der
klassische OOM-Kill:

- **`GOMEMLIMIT=192MiB`** — Gos GC bemisst sich am Heap und kennt das cgroup
  nicht. 80 % von (256M Limit − 16M tmpfs). Die beiden Zahlen bewegen sich
  zusammen, und der Kommentar daneben sagt das.
- **`NODE_OPTIONS=--max-old-space-size=320`** — Node leitet seinen Old-Space aus
  dem **Gesamtspeicher der Maschine** ab, nicht aus dem cgroup. Auf 6–9 GB
  wählte es ~2 GB und würde bei 512M getötet. Diese Zeile ist keine Feinjustage,
  sie ist der Unterschied zwischen laufen und sterben.

Dazu **`shm_size: 128mb`** für `db`: Dockers Default ist 64 MB, Postgres legt
dort Parallel-Worker-Segmente ab, und der Fehler liest sich wie ein
Postgres-Bug, während er ein Docker-Default ist.

### 4. read-only, und die zwei tmpfs für `web`

`api`, `migrate` und `seed` laufen `read_only: true` mit `cap_drop: ALL` und
`no-new-privileges` — in D1 nachgemessen, hier festgeschrieben. `/tmp` als
tmpfs, 16M, `noexec,nosuid`.

**Das Web-Image kann read-only laufen, und der D1-Befund ist damit erledigt.**
Es braucht zwei beschreibbare Pfade statt einem: `/tmp` und `/app/.next/cache`,
wo `next/image` seine optimierten Bilder und der Fetch-Cache liegen.

**tmpfs und kein Named Volume**, aus drei Gründen: ein Volume würde nächtlich
nach S3 gesichert, also dafür bezahlt, einen Cache aufzuheben; die Platte ist
die knappe Ressource auf 40 GB und RAM nicht; und ein Cache, der einen
Image-Wechsel **überlebt**, ist genau der Fehler „die Seite zeigt die Zahl von
letzter Woche", gegen den diese Seite gebaut ist. tmpfs stirbt mit dem
Container, was die richtige Lebensdauer für etwas ist, das an einen Build hängt.

`db` bleibt beschreibbar und bekommt **kein** `cap_drop`: sein Entrypoint startet
als root und steigt auf `postgres` ab, und eine falsche Capability-Liste macht
die Datenbank unstartbar. `no-new-privileges` ist trotzdem gesetzt — es verbietet
das **Gewinnen** von Rechten, nicht das Abgeben. Die Capability-Liste will einen
Test und ist damit eine L2-Aufgabe.

### 5. Der Healthcheck steht im Image, der von `db` nicht

`compose.yaml` deklariert **keinen** `healthcheck:` für `api` und `web`. Beide
Images tragen einen, Compose erbt ihn, und `depends_on: service_healthy` ist von
einem geerbten erfüllt. Zwei Fassungen sind eine, die driftet.

`db` bekommt einen, weil `postgres:18.6-alpine` keinen mitbringt — und `migrate`
wartet auf genau diese Antwort.

`migrate` und `seed` schalten den geerbten mit `healthcheck: disable` **ab**.
Das ist keine zweite Fassung, sondern die Feststellung, dass eine Sonde für
einen Server bei einem Programm, das durchläuft und endet, nichts misst; ohne
das wartete `--wait` auf einen Port, der nie aufgehen sollte.

`stop_grace_period: 30s` steht auf `api`, weil Dockers Default 10 s kürzer ist
als `SHUTDOWN_GRACE` und **kein Go-Test die Zeile sehen kann** (ADR 0014 sagt es
zweimal). `db` bekommt 30 s für einen Checkpoint, `web` 15 s.

### 6. `:?` nur, wo es sonst still bricht

Compose interpoliert das ganze Dokument, bevor es irgendetwas tut — ein `:?` auf
einer Variablen, die nur ein Dienst braucht, bricht alle. Die Regel, die daraus
folgt:

> **`:?` nur, wo ein leerer Wert *stillschweigend* das Falsche tut oder das
> falsche Problem benennt. Überall dort, wo der Prozess selbst den Start
> verweigert und sagt warum, wird durchgereicht.**

Drei Variablen qualifizieren sich. `IMAGE_TAG`, weil leer entweder ein
Manifest-Fehler ist, der die Registry statt den Fehler nennt, oder mit einem
`:-latest` ein Deploy von irgendetwas. `POSTGRES_DB`, weil leer stillschweigend
zu `POSTGRES_USER` wird. `POSTGRES_USER`, weil leer stillschweigend `postgres`
wird — und `pg_isready -U` dann grün gegen die falsche Rolle meldet.

Alles andere wird durchgereicht. `config.Load` nennt jeden fehlenden Wert auf
einmal (ADR 0014); das hier zu wiederholen wäre ein zweiter Ort zum Driften.

**Kein `env_file:`.** Werte kommen aus der Dokploy-Oberfläche. Eine Datei auf dem
Host ist ein zweites Zuhause für Geheimnisse und eine Datei, die vor `up`
existieren muss — also der Handgriff, den diese Phase per Definition nicht hat.

**Eine Zeile unterscheidet sich absichtlich von `compose.dev.yaml`:**
`MAIL_TRANSPORT` wird durchgereicht statt auf `log` gesetzt. Der Code-Default ist
`smtp`. Ein Produktions-Compose, das leise `log` setzte, beantwortete jede
Einsendung mit 202 und lieferte nichts — der schlimmste Fehler, den dieser
Endpoint hat, weil er von beiden Seiten wie Erfolg aussieht.

### 7. Der Bind Mount, der Konfiguration ist

`ops/postgres/initdb/10-roles.sh` bleibt ein Bind Mount, `:ro`.

Die Named-Volume-Regel schützt, was man **wiederherstellen** müsste — Dokploys
S3-Sicherung sieht nur Named Volumes. Dieses Skript ist Code, es liegt in git,
git ist seine Sicherung. In einem Named Volume müsste es von Hand befüllt werden
— ein Handgriff, und einer, der still vom Repo abweicht. Eine zweite Fassung für
Produktion wäre genau die „zwei Fassungen, von denen eine driftet".

Die Ausnahme ist mechanisch statt erinnert: `tools/check-compose.sh` erlaubt in
`compose.yaml` genau eine Bauform von Host-Pfad — eine Quelle unter `./ops/` mit
`:ro` — und weist jede andere ab.

**Die Testdatenbank entsteht in Produktion nicht.** `10-roles.sh` legt
`${POSTGRES_DB}_test` nur an, wenn `POSTGRES_CREATE_TEST_DB` gesetzt ist;
`compose.dev.yaml` setzt sie, `compose.yaml` nicht. Der Default ist **aus** —
vergessen in Produktion bleibt sie sauber, vergessen in der Entwicklung fällt
`make check-db` laut aus und nennt die Variable. Dieselbe Richtungsentscheidung
wie bei `CONTRIBUTIONS_TRANSPORT` in ADR 0026 §4. Nachgemessen: Produktion hat
`timseil`, Entwicklung `timseil` und `timseil_test`.

### 8. Traefik gehört D3

`compose.yaml` trägt keine Traefik-Label und kein `dokploy-network`. Vier
Gründe, einer davon entscheidet:

**Das Netz ist `external:` und existiert auf keiner Maschine außer dem VPS.**
`docker compose up` bräche daran, und „`down -v && up` ohne Handgriff" ist das
Abnahmekriterium dieser Phase. D3 fügt den Block hinzu — und im selben Commit
`docker network create dokploy-network` in den Runbook.

Dazu: Traefik gehört Dokploy (Bauplan D3), das `Operations`-Blatt ist nach
`docs/design/INDEX.md` ein D3-Blatt, und die Label tragen Fakten, die es noch
nicht gibt — den Hostnamen der Router-Regel, den Certresolver und
`TRUSTED_PROXY_CIDRS`. An den beiden Stellen, wo der Block hingehört, steht ein
Kommentar, der D3 nennt.

### 9. Der Ausschnitt in der Fallstudie

Der Bauplan verlangt, `compose.yaml` müsse „mit dem Compose-Ausschnitt in Case
Study 02 wörtlich übereinstimmen". Nachgeprüft:

1. `Case Study 02 - timseil.dev.dc.html` enthält **keinen einzigen Codeblock**.
   Es gibt dort nichts, womit übereinzustimmen wäre.
2. Der Ausschnitt steht in `Case Study Template`, das laut `INDEX.md` zu **H1**
   gehört, nicht zu D2.
3. Er widerspricht fünf getroffenen Entscheidungen: `${TAG}` statt
   `${IMAGE_TAG}` · `ghcr.io/[HANDLE]/` statt `ghcr.io/g1ng4r/` · `env_file:
   .env.prod` statt Dokploy · **`wget -qO-` in einem Image ohne Shell und ohne
   wget** (ADR 0026 §3) · `/healthz` statt `/readyz`.
4. `docs/design/` ist read-only.

Wörtlich zu folgen hieße, vier Entscheidungen zu brechen und eine
Unmöglichkeit zu bauen — der `wget`-Healthcheck meldete jeden gesunden
distroless-Container als unhealthy, und D2 hängt seine Startreihenfolge an genau
diese Antwort.

**Also dreht sich die Richtung um: die Datei ist die Quelle, und die Seite
zitiert sie.** Das ist kein Sonderfall, sondern das Muster, das
`tools/issues-design-corrections.sh` schon für neun andere Stellen beschreibt —
im Entwurf stehen gebliebene Angaben werden in der Umsetzung nicht übernommen
und in K1 geschlossen. Dies ist die zehnte. Ein K1-Issue hält den Widerspruch
fest, ein H1-Issue verlangt, dass der Ausschnitt auf der Seite ein echter
Schnitt aus der ausgelieferten `compose.yaml` wird — generiert, nicht getippt.

**Keine Schnittmarken in `compose.yaml`.** H1 weiß noch nicht, welche Zeilen es
zeigen will, eine Betriebsdatei sollte keine Darstellungs-Anker tragen, und eine
Marke, die sechs Phasen lang niemand liest, wird als Rauschen gelöscht.

## Konsequenzen

- **`api/cmd/migrate` und `api/cmd/seed` gibt es nicht mehr.** Wer `go run
  ./cmd/migrate` tippt, bekommt einen Fehler; der Weg ist `make migrate`, und
  der hat sich nicht geändert. Der Verb sitzt im `entrypoint` von
  `compose.dev.yaml`, damit jedes Makefile-Ziel unverändert bleibt.
- **Das API-Image ist von 14 auf 16 MiB gewachsen.** Die Grenze liegt bei 20,
  der Abstand ist 4 MiB. Wächst der Migrations- oder Seed-Pfad deutlich, ist das
  ein drittes Image wert — die verworfene Alternative unten steht bereit.
- **Der internetseitige Container trägt jetzt das DDL-Werkzeug**, wenn auch
  nicht dessen Zugangsdaten. Das ist der Preis dieser Entscheidung und er wird
  hier genannt statt verschwiegen: Schutz ist die DSN, nicht die Abwesenheit des
  Programms. Ein drittes Image wäre hier strenger und kostete drei Tags im
  Gleichschritt und einen dritten Build in E1, Scan in E2 und Signatur in E3.
- **`make check-topology` ist neu und läuft nicht in `make check`** — es braucht
  Docker und einen Build, dieselbe Begründung wie bei `check-db` und
  `check-images`.
- **`tools/check-compose.sh` kann sechs Regeln mehr**, jede mit ihrem kaputten
  Fall in `tools/selftest.sh`. Was diese ADR behauptet, weist die Datei ab.
- **`stack.yaml` liest die Postgres-Version jetzt aus `compose.yaml`** (Issue
  #28). Damit `postgres:18.6-alpine` als Version lesbar bleibt, darf dieses
  Image **nicht** per Digest gepinnt werden: `fromCompose` nimmt alles nach dem
  letzten `:`, und die Seite zeigte einen sha256. Das Pinnen gehört zu E2,
  zusammen mit der Dependabot-Regel, die es dann bewegt.
- **E5 muss `--no-deps` benutzen.** `docker compose up -d --scale api=2` ohne das
  würde `service_completed_successfully` neu auswerten und die Migration erneut
  fahren.
- **Ein Neustart des Hosts läuft nicht über diese Reihenfolge.** Dockers
  Restart-Policy kennt `depends_on` nicht. Das ist tragbar, weil der API-Prozess
  ohne Postgres startet und `/readyz` mit 503 antwortet, bis die Datenbank da
  ist (ADR 0014) — die Topologie ist der Deploy-Weg, der Lebenszyklus des
  Prozesses der Neustart-Weg.

## Verworfene Alternativen

**Drei getrennte Binaries im API-Image.** 32,15 MiB gegen eine 20-MiB-Grenze.
Die Grenze anzuheben, damit ein Entwurf hineinpasst, wäre auf einer Seite, deren
These „alles ist nachgemessen" lautet, die falsche Reparatur.

**Ein drittes Image `timseil-tools`.** Das stärkere Argument dagegen ist nicht
die Größe, sondern Issue #28: bei zwei Tags wird aus „ein Rollback rollt die
Stack-Aussagen mit zurück" eine Konvention. Dazu ein dritter Build in E1, ein
dritter Scan in E2, eine dritte Signatur in E3 und ein dritter Tag, der in E4 im
Gleichschritt bleiben muss. **Die Alternative bleibt richtig, wenn das Image die
20 MiB reißt** — dann ist sie der Weg, nicht das Anheben der Grenze.

**Ein `/bootstrap`-Binary statt `10-roles.sh`.** Es entfernte den Bind Mount ganz
und liefe gegen jedes Postgres. Es schreibt aber B2s Bootstrap neu und berührt
`make check-db`, `.env.example` und ADR 0011 — und kauft nichts, solange die
Datenbank auf demselben Host liegt. Der richtige Moment ist der Tag, an dem sie
das nicht mehr tut.

**Ein zweites initdb-Verzeichnis für Produktion.** Zwei Fassungen desselben
Rollen-Bootstraps, von denen eine driftet — dieselbe Falle, die beim Healthcheck
vermieden wird.

**`env_file: .env.prod`,** wie das Entwurfsblatt es zeigt. Siehe §6.

**Ein Named Volume für `.next/cache`.** Es würde nächtlich gesichert und
überlebte einen Image-Wechsel. Siehe §4.

## Belege

Bauplan Zeile 826 (Named Volumes), 1084 (D2), 1088 (D3), 1129 (E5),
Kapitel 10 (Speicher- und Plattenbudget), Kapitel 25 des Handbuchs ·
ADR 0011 (die zwei Rollen) · ADR 0012 (`stack.yaml`) · ADR 0013 (der Seed) ·
ADR 0014 (`stop_grace_period`, `/readyz`, der Drain) · ADR 0015
(`TRUSTED_PROXY_CIDRS`) · ADR 0026 (die Images, der Healthcheck im Binary,
die Richtung eines Defaults) · Issue #28 ·
`compose.yaml` · `compose.dev.yaml` · `api/cmd/api/subcommands.go` ·
`tools/check-compose.sh` · `tools/selftest.sh` · `Makefile` (`check-topology`)
