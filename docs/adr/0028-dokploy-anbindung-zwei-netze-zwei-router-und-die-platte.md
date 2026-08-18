# ADR 0028 — Dokploy-Anbindung: zwei Netze, zwei Router und die Platte

**Status:** Angenommen
**Datum:** 2026-08-18
**Betrifft:** D3, E1, E4, F2, F3, K1, L1, L3, L5, L6
**Invarianten:** 1 (keine erfundenen Zahlen)

## Kontext

D1 hat zwei Images gebaut, D2 sie zu einem Stack verbunden. Der Stack läuft —
aber nur hinter `make check-topology`, auf dieser Maschine. `compose.yaml` trug
kein `labels:`, keinen `networks:`-Block und keine Zeile, die einen Reverse
Proxy kennt. ADR 0027 §8 nennt den Grund und reicht drei Fakten namentlich an
D3 weiter: **den Hostnamen der Router-Regel, den Certresolver und
`TRUSTED_PROXY_CIDRS`.**

Abnahme laut Bauplan Zeile 1103: **Deploy läuft; `traefik_*`-Metriken sind
abrufbar.**

Die Trennlinie dieser Phase ist nicht technisch, sondern eine Eigentumsfrage:
Traefik gehört Dokploy, das Netz gehört Dokploy, die statische Konfiguration
liegt auf einem Host, den dieses Repo nicht versioniert. Diese ADR entscheidet,
was hier liegt, was dort liegt — und wie das, was dort liegt, trotzdem
nachprüfbar bleibt.

## Entscheidung

### 1. Zwei Netze, und warum `default` in der Liste steht

`api` und `web` liegen in `default` **und** `dokploy-network`; `db`, `migrate`
und `seed` nur in `default`.

Der Kommentar, den D2 als Naht hinterlassen hat, schlug `networks:
[dokploy-network]` vor. **So gebaut fällt der Stack auseinander:** ein Dienst,
der `networks:` schreibt, liegt *nur* in den genannten Netzen. Der API fehlte
die Datenbank, dem Web die API — und der Ausfall läse sich wie ein
Datenbankproblem, nicht wie ein Tippfehler. Die Naht wird deshalb korrigiert
statt still übernommen.

`default` bleibt implizit und wird in den zwei Dienstlisten trotzdem
ausgeschrieben. Wer zwei Einträge sieht, fragt warum; wer einen sieht, fragt
nicht.

**Der zweite Grund für zwei Netze steht in keinem Blatt:** `dokploy-network`
teilen wir mit jeder anderen App auf diesem Host. Dockers DNS löst Namen pro
Netz auf — eine zweite App mit einem Dienst namens `api` machte die interne
Auflösung mehrdeutig. `web → api` läuft deshalb über `default`, ein Namensraum,
der uns gehört. Genau deswegen ist `traefik.docker.network` auch keine
Dekoration: bei zwei Netzen muss Traefik gesagt bekommen, welche IP das Backend
ist, und die falsche ist eine Adresse, die es nicht erreicht. Das Symptom ist
ein Timeout, kein Fehler.

Kein `internal: true` auf `default`: die API spricht mit GitHubs GraphQL-API
und mit OVHs SMTP.

### 2. `external: true`, und wie D2s Abnahmekriterium überlebt

`dokploy-network` ist `external:`. Das sagt zweierlei: nichts hier legt es an,
und nichts hier darf über seine Gestalt etwas annehmen.

Ohne `external:` bricht Compose **nicht** — es legt still
`timseil_dokploy-network` an, ein echtes, gesundes Netz, auf dem Traefik nicht
ist. Der Stack käme grün hoch und wäre für den Proxy unsichtbar. Das ist die
Fehlerform, für die dieses Repo Gates baut, und `check-compose` Regel 12 weist
sie ab.

Auf jeder Maschine außer dem VPS existiert das Netz nicht und Compose verweigert
den Start. Da „`down -v && up` ohne Handgriff" D2s Abnahmekriterium ist, wandert
der Handgriff ins Makefile: `make require-network` legt ein leeres Ersatzstück
an, idempotent, als Vorbedingung von `prod` und `check-topology`. Der Beweis ist
ein Kommando — `docker network rm dokploy-network && make check-topology`, immer
noch grün.

**Verworfen: eine `compose.local.yaml`**, die das Netz lokal als nicht-external
überschreibt. Dann führe `check-topology` nicht mehr die Datei aus, die Dokploy
fährt — und das ist die einzige Aussage, auf der ADR 0027 und der Compose-Runbook
stehen.

### 3. Zwei Router, zwei Prioritäten, ein kanonischer Host

Die Lese-API ist öffentlich (ADR 0004) und liegt unter `/api` auf demselben
Hostnamen wie die Seite. Also zwei Router:

| Router | Regel | Priorität | Port |
|---|---|---|---|
| `timseil-api` | Apex oder www **und** `PathPrefix(/api)` | 100 | 8080 |
| `timseil-web` | Apex oder www | 10 | 3000 |

**Die Prioritäten stehen ausdrücklich da.** Ohne Angabe sortiert Traefik nach
Regellänge; die API-Regel gewänne heute, weil sie länger ist. Drei Gründe, das
nicht so zu lassen: die Zahl entstünde aus der Schreibweise eines Hostnamens,
eine Umformulierung verschöbe sie unbemerkt, und der Fehler wäre **still** —
Next.js beantwortete `/api/*` mit seiner eigenen 404-Seite, während die Seite
normal aussieht. Ein Repo, dessen Regeln alle einen kaputten Fall haben, überlässt
das nicht dem Zufall. `check-compose` Regel 13 setzt es durch.

**Router-Namen tragen den Projekt-Präfix.** Traefiks Router- und Service-Namen
sind global für die Instanz, und die Instanz gehört Dokploy. Ein blankes `api`
kollidierte mit der nächsten App auf diesem Host, und die Fehlerform wäre fremder
Verkehr, der hier ankommt.

**`www` wird umgeleitet, nicht bedient** — 301 auf die Apex-Domain, über eine
`redirectregex`-Middleware, die einmal an `web` definiert und von beiden Routern
als `timseil-www@docker` referenziert wird. Eine kanonische URL: zwei ließen G5
sie mit `rel=canonical` wieder einfangen, und M6 tut später dasselbe mit
`timseil.com`.

Das `$$` in der Ersetzung ist Pflicht, nicht Geschmack. **Nachgemessen an einem
laufenden Container:** `$${1}` in der Datei kommt als `${1}` am Label an; ein
einfaches `${1}` lässt Compose mit „invalid interpolation format" abbrechen.

### 4. Der Hostname ist ein Literal, keine Variable

`Host(\`timseil.dev\`)` steht wörtlich in der Datei.

Der entscheidende Grund ist derselbe, den `compose.yaml` schon einmal benutzt:
`services.db.image` trägt einen literalen Tag, weil `stack.yaml` die **rohe**
YAML liest und eine Variable dort nur ein Variablenname wäre. `check-compose`
liest genauso — eine `${DOMAIN}` machte jede Regel über die Router-Regel blind.

Dazu: es gibt einen Host und eine Domain (ADR 0008), eine Variable modellierte
also eine Beweglichkeit, die es nicht gibt. Und ein Literal rollt mit dem Commit
zurück, während ein Wert in der Dokploy-UI es nicht tut — ein Rollback stellte
sonst alten Code gegen neues Routing.

**Der Preis, benannt:** `CORS_ALLOWED_ORIGINS` trägt dieselben Hostnamen als
Laufzeitwert und kann abdriften. Genau deshalb ist das Literal die bessere Wahl:
ein Abgleich ist nur gegen Literale möglich. Das Zuhause dafür ist **#61** (E2,
„check the environment variables against each other"), nicht diese Phase.

### 5. Fünf neue Compose-Regeln

Jede fängt einen Weg ab, auf dem Proxy und Stack einander verlieren, **ohne dass
etwas rot wird** — das ist das Kriterium, an dem sie hängen.

| Regel | Fängt ab |
|---|---|
| 9 · vollständiger Label-Satz an `api` und `web` | Halb konfigurierte Route; Stolperstein 1 des Blattes |
| 10 · `loadbalancer.server.port` ∈ `expose:` | Stolperstein 2: bei mehreren Ports rät Traefik, Symptom ist ein Timeout |
| 11 · beide Netze an den Routern, keins davon an `db` | §1, in beide Richtungen |
| 12 · benutztes `dokploy-network` ist `external: true` | §2, das still angelegte zweite Netz |
| 13 · jede Router-Regel hat eine `priority` | §3, die stille Umsortierung |

**Drei erwogene Regeln sind nicht gebaut worden**, und der Grund gehört
festgehalten: „die Router-Regel nennt `timseil.dev`" schriebe die Domain in eine
zweite Datei — das ist #61s Arbeit. „Certresolver und Entrypoints sind gesetzt"
hinge an Dokploy-Namen, die wir nicht gemessen haben, und **ein Gate darf keine
Tatsache festschreiben, die niemand nachgemessen hat.** „`acme.json` ist 600"
ist Host-Zustand, kein Datei-Zustand; er steht im Runbook.

### 6. Metriken an, Scraping später, Port zu

D3 schaltet Traefiks Prometheus-Endpoint ein: eigener Entrypoint auf `:8082`,
`addEntryPointsLabels`, `addRoutersLabels` und `addServicesLabels` auf `true`.

**Ein eigener Entrypoint, nicht `websecure`:** auf 80/443 wäre der Metrikpfad
öffentlich, sobald ein Router ihn trifft. Prometheus, Loki und Alloy tragen keine
Authentifizierung; ihr Schutz ist die Netzgrenze und sonst nichts (Handbuch
Kapitel 29). **Der Port wird nicht auf den Host veröffentlicht** — von außen
antworten 22, 80 und 443.

`addRoutersLabels` ist per Default aus und ist das, was `traefik_router_*`
überhaupt entstehen lässt. Ohne sie hätte F3 für seine Routen-Panels nichts zu
zeichnen. Bei zwei Routern ist die Kardinalität folgenlos; die Zeile jetzt zu
setzen kostet nichts, sie in F2 zu entdecken kostet einen Proxy-Neustart.

Es gibt in D3 noch keinen Prometheus — der kommt in F2. „Abrufbar" heißt deshalb
zwei Hälften, und `ops/host/check-traefik-metrics.sh` belegt beide: aus dem
Docker-Netz antwortet der Endpoint mit `traefik_*`-Serien, und der Port ist nicht
veröffentlicht.

**Es gibt kein `ops/traefik/`,** obwohl Bauplan Zeile 747 es vorsieht. Die
statische Konfiguration liegt auf einem Host, den dieses Repo nicht versioniert,
und ein leeres Verzeichnis wäre ein Platzhalter — `stack.yaml` sagt zu genau
dieser Frage „Growth, not a placeholder". Der ehrliche Ersatz ist, dass die
geänderten Zeilen im Runbook stehen, damit sie ein Dokploy-Upgrade überleben, das
sie wegräumt.

### 7. Die Platte: Retention und ein Timer aus dem Repo

Image-Retention in der Dokploy-UI auf 3–5 Stände, dazu
`docker system prune -af --filter "until=168h"` wöchentlich.

**Als systemd-Timer aus diesem Repo, nicht als Aufgabe im Panel.** Drei Gründe:
das Journal fängt die Ausgabe auf, der Lauf hinterlässt also einen Beleg;
`Persistent=true` holt einen Lauf nach, den ein Neustart verpasst hätte — und auf
40 GB ist ein übersprungener Prune genau der Fehler, für den er da ist; und der
Fehlerzustand ist abfragbar, sodass F2 einen Alarm daran hängen kann. Dieselbe
Kritik, die ADR 0014 an Konfiguration richtet, die nur in der Oberfläche existiert:
nicht im Diff, nicht überprüfbar.

**`--volumes` darf nie dazu.** Es löschte unbenutzte Named Volumes, und
`timseil_db-data` ist in den Sekunden zwischen `down` und `up` eines Redeploys
unbenutzt. Das Skript nimmt deshalb **gar keine Argumente** entgegen — die Option
lässt sich nicht durch die Unit-Datei durchreichen.

**Der Preis wird benannt, nicht verschwiegen:** `-a` entfernt auch SHA-getaggte
Images älter als sieben Tage, also die Rollback-Ziele. **Die lokale Platte ist
nicht die Aufbewahrung, GHCR ist es** — ein Rollback auf einen älteren Stand ist
danach ein `docker pull`. Der Runbook sagt den Satz, weil der Ausfall sonst liest
wie „das Panel bietet ein Rollback an, das nicht funktioniert".

Nebeneffekt, der die Entscheidung mitträgt: derselbe Prune räumt gestoppte
Container weg — Stolperstein 5 des Blattes, alte Container mit Traefik-Labels,
die Routing-Konflikte erzeugen. Ein Job, zwei Gründe.

### 8. `TRUSTED_PROXY_CIDRS` wird gemessen, nicht getippt

Der Wert ist das Subnetz von `dokploy-network` und wird nach dem ersten Deploy
aus `docker network inspect` gelesen — vorher existiert er nicht. Gesetzt wird er
in der Dokploy-UI; in diesem Repo steht er nirgends.

Beide Fehlerrichtungen sind still, und beide stehen in `.env.example`: zu weit,
und jeder Client wählt sein eigenes `X-Forwarded-For` — damit seine eigene
Rate-Limit-Identität **und** seinen eigenen `ip_hash` in `contact_messages`, sodass
C6s Pepper eine vom Absender gewählte Zeichenkette hasht. Zu eng oder leer, und
alle Besucher teilen einen Eimer, sodass der erste Ansturm die Seite aussperrt.
Deshalb wird der Wert **nachgemessen** statt geschlossen: eine Anfrage stellen und
die Client-Adresse im Log lesen.

### 9. Kein Cache vor der API

Traefik ist hier Router und TLS-Terminierung, sonst nichts. Es ist keine
Cache-Middleware konfiguriert und kein Caching-Plugin geladen; `Cache-Control`
und `ETag` beantwortet allein der Browser.

Das ist die Antwort auf **#60**, und sie wird aufgeschrieben, damit die Frage
beantwortet ist statt übersehen. Für den Tag, an dem sich das ändert — ein CDN ist
raus (ADR 0006), es wäre also ein Traefik-Plugin: **der Schlüssel muss die Query
enthalten.** `?window=30`, `?window=91` und der blanke Pfad sind drei
Repräsentationen mit drei ETags (ADR 0017), und `Vary` gilt.

### 10. Traefik hat keine Zeile in `stack.yaml`

`stack.yaml` erlaubt einen Eintrag erst, wenn seine Quelldatei existiert, und
liest die Version daraus. **Für Traefik gibt es keine solche Datei** — die
Version gehört Dokploy.

Drei unehrliche Auswege, alle verworfen: eine getippte `version:` (weist
`make check-stack` per Konstruktion ab, das ist der Zweck der Datei); eine
angelegte `ops/traefik/VERSION` (eine von Hand getippte Zahl im Kostüm einer
Datei, die beim ersten Dokploy-Upgrade abdriftet, ohne dass es jemand merkt); ein
Eintrag ohne Version (zulässig, aber der `timseil-dev`-Block sagt selbst, dass
hier jede Version gelesen wird — eine namenlose Zeile neben sieben gelesenen sähe
auf der Seite wie ein Fehler aus).

Die ehrliche Quelle existiert und ist ein **laufendes System**:
`traefik_build_info` aus dem Metrik-Endpoint. Sie erreicht die Seite, wenn etwas
sie scrapt — F3. Als Issue dort festgehalten, damit die Lücke eine Verschiebung
bleibt und kein Versehen wird.

### 11. Der einmalige Push nach GHCR

`make images` taggt nur lokal; das Makefile sagt ausdrücklich, dass Pushen E4s
Aufgabe in GitHub Actions ist. Die Pipeline gibt es erst in E1/E4 — und ohne ein
Image in der Registry hat Dokploy nichts zu ziehen. **D3s Abnahme hinge damit an
einer Phase, die nach ihr kommt.**

Also einmal von Hand, für genau einen Commit, im Runbook unter einer Überschrift,
die sagt, dass es einmalig ist. **Was die Brücke nicht bricht:** gebaut wird
weiterhin nicht auf dem VPS, und das laufende Artefakt ist dasselbe, das
`make check-images` und `make check-topology` hier geprüft haben. Vorläufig ist
nur der Weg in die Registry. Der zweite Deploy kommt aus Actions.

### 12. Was D3 nicht tut

Damit eine Lücke als Verschiebung lesbar bleibt: **L1** Mail und DNS (direkt
danach, die DMARC-Uhr läuft extern) · **L3** Dokploy-UI zumachen,
`/api/internal/*` am Traefik blocken, `nmap`-Abnahme · **L4** Security-Header,
HSTS, CSP · **L5** Rate-Limit in Traefik, fail2ban, Firewall, CAA · **L6**
Backups mit Löschschutz · **F2/F3** der Observability-Stack und das Scrapen ·
**E1/E4** die Pipeline und der Deploy-Webhook.

## Konsequenzen

- **`/api/internal/*` ist ab diesem Deploy von außen erreichbar** und trägt genau
  eine Verteidigung, sein Token, wo Handbuch Kapitel 29 zwei verlangt. Das ist
  der Preis dafür, dass die Lese-API unter `/api` auf demselben Host liegt, und
  er wird hier genannt statt verschwiegen. L3 zieht die zweite Schicht ein und
  muss dabei **#40** auflösen: M3 will den Pfad von außen als `404`, F4s Probe
  klopft von außen an. D3 entscheidet das nicht.
- **Ein lokaler Lauf braucht `dokploy-network`.** `make prod` und
  `make check-topology` legen es selbst an; wer `docker compose -f compose.yaml`
  von Hand tippt, braucht `make require-network` davor.
- **Die Datei trägt jetzt drei Werte, die Dokploy gehören** — Entrypoint,
  Certresolver und die Annahme über den globalen HTTP-Redirect. Sie werden vor
  dem ersten Deploy vom Host gelesen; ein geratener Certresolver ist ein
  Zertifikat, das nie kommt. Schritt 1 des Runbooks ist genau das.
- **Ein Rollback, das älter als eine Woche ist, braucht erst ein `docker pull`.**
  Siehe §7.

## Verworfene Alternativen

**Eine zweite Traefik-Instanz**, eigene, im Stack. Sie stritte mit Dokploys um
Port 80 und 443 — das `Operations`-Blatt sagt es selbst, und es ist der einzige
Punkt, an dem das Blatt und der Bauplan sich einig sind.

**`networks: [dokploy-network]`,** wie die D2-Naht es zeigt. Siehe §1.

**`compose.local.yaml`** als Override für das externe Netz. Siehe §2.

**`${DOMAIN}` statt eines Literals.** Siehe §4. Zusätzlich: `${DOMAIN:?}` bräche
`make check-topology` auf jedem Rechner, und `${DOMAIN:-}` ergäbe ``Host(``)`` —
eine Regel, die auf nichts passt und dabei nicht scheitert.

**Dokploys eigenes Postgres und Redis mitbenutzen.** Unsere Datenbank trägt zwei
Rollen, ein initdb-Skript und ein Volume, das gesichert werden soll; Redis
brauchen wir nicht (Kapitel 3).

**Volumes relativ als `../files/…`,** wie Stolperstein 3 des `Operations`-Blattes
empfiehlt. Das ist ein Bind Mount, und Dokploys S3-Volume-Backups sehen nur Named
Volumes — der Rat bräche die Sicherung, auf die dasselbe Blatt sich stützt. Als
K1-Korrektur festgehalten.

**Der Prune in Dokploys Scheduler** statt als Timer aus dem Repo. Siehe §7.

**Eine getippte Traefik-Version in `stack.yaml`.** Siehe §10.

**`make deploy` oder ein VPS-Ziel im Makefile.** Ein Ziel, das auf jeder Maschine
außer einer scheitert, ist kein Ziel; `require-images` hat den Präzedenzfall
gesetzt, stattdessen das Wahre zu sagen. Der Weg auf den Host ist ein Runbook.

## Belege

Bauplan Zeile 747 (`ops/`), 793–794 und Kapitel 10 (die Platte), 826 (Named
Volumes), 1088–1103 (D3), 1101 (Registry-Credential), 1123 (E4), 1153 (F3),
1305 (L3), 1472 und Anhang D (die externe Uhr) · Handbuch Kapitel 29
(Angriffsfläche) · ADR 0004 (öffentliche Lese-API) · ADR 0006 (kein CDN) ·
ADR 0008 (ein Host) · ADR 0014 (Konfiguration, die nur im Panel existiert) ·
ADR 0015 (`TRUSTED_PROXY_CIDRS`) · ADR 0017 (Fenster und ETag) · ADR 0027 §8
(Traefik gehört D3) · Issues #40, #60, #61 ·
`docs/design/Operations - timseil.dev.dc.html` (Form; die Fakten gewinnt der
Bauplan) · `compose.yaml` · `tools/check-compose.sh` · `tools/selftest.sh` ·
`Makefile` (`require-network`, `check-topology`) · `ops/host/` ·
`docs/runbooks/dokploy.md`
