# C4 Level 2 — Container

**Leser:** wer wissen will, was auf dem Host läuft, wer mit wem spricht und
**was von außen erreichbar ist**. Für den Blick von außen siehe
[Kontext-Diagramm](c4-context.md).

**Ein Host zum Launch** — acht dauerhafte Container in einem Dokploy-Stack
(ADR 0008), dazu zwei Init-Container, die bei jedem Deploy durchlaufen und enden.
Ein zweiter Host kommt erst, wenn ein zweites Projekt ihn mitträgt.

```mermaid
flowchart TB
    visitor["Besucher / Prüfer"]
    ghactions["GitHub Actions<br/><i>Probe alle 5 min · Deploy</i>"]

    subgraph host ["OVH VPS · Dokploy"]
        direction TB

        subgraph edge ["erreichbar von außen: 22 · 80 · 443"]
            proxy["proxy — Traefik<br/><i>TLS, Routing, Rate-Limit,<br/>Prometheus-Metrik-Endpoint</i>"]
        end

        subgraph net ["nur im Docker-Netz — keine ports:, keine Traefik-Labels"]
            direction TB
            web["web — Next.js 16.3<br/><i>Seiten, MDX-Blog.<br/>Keine Datenlogik.</i>"]
            api["api — Go 1.26<br/><i>Datenmodell, Ableitungen,<br/>Contract, Mail, Snapshots</i>"]
            db[("db — PostgreSQL 18.6<br/><i>Named Volume</i>")]
            alloy["alloy<br/><i>der eine Collector</i>"]
            prom[("prometheus 3.13 LTS<br/><i>7 d + 2 GB</i>")]
            loki[("loki 3.7<br/><i>14 d + Rate-Limits</i>")]
            graf["grafana<br/><i>fremde App auf demselben Host,<br/>über observability-network</i>"]
            tempo[("tempo 3.0<br/><i>Traces — nach Launch, F8</i>")]
        end
    end

    ghapi["GitHub GraphQL API"]
    smtp["OVH SMTP"]
    s3["S3-Objektspeicher"]

    visitor -->|HTTPS| proxy
    proxy -->|"/*"| web
    proxy -->|"/api/*"| api
    proxy -->|"/api/internal/* — Token + Traefik-Block, L3<br/>siehe offene Frage unten"| api
    web -->|"generierter Client aus dem Contract"| api
    api -->|"pgx v5, Rolle timseil_app"| db

    proxy -.->|"Metriken — F3"| prom
    api -.->|"OTel — F6"| alloy
    web -.->|"Container-Logs über den Docker-Socket"| alloy
    prom -.->|"scrapt — F2: sich, alloy, loki"| alloy
    alloy --> loki
    alloy -.-> tempo
    prom --> graf
    loki --> graf
    tempo -.-> graf

    api -->|"alle 5 min PromQL → Snapshots nach Postgres"| prom
    api -->|"Contribution-Kalender, Cache 1 h"| ghapi
    api -->|"Kontaktmail, Plaintext"| smtp
    ghactions -->|"POST /api/internal/probe · Deploy-Webhook"| proxy
    db -.->|"nächtliche Volume-Sicherung"| s3

    classDef later stroke-dasharray: 5 5;
    class tempo later;
```

Gestrichelte Kanten sind der **Messweg**, durchgezogene der Anfrageweg.
`tempo` ist gestrichelt, weil es **nach dem Launch** kommt (F8) — genau wie die
Faro-Frontend-Telemetrie (F11), die kein eigener Dienst ist, sondern über
`faro.receiver` in `alloy` läuft. Ein Diagramm, das beide solid zeichnet,
behauptet einen Betrieb, den es am Launch-Tag nicht gibt.

## Die Container

| Container | Sprache · Basis | Verantwortung | Von außen |
|---|---|---|---|
| **proxy** | Traefik, von Dokploy | TLS, Routing, Rate-Limit, Metrik-Endpoint | **ja** — 80, 443 |
| **web** | Next.js 16.3, `node:24-alpine`, non-root | Seiten, Rendering, MDX-Blog. Keine Datenlogik | nein |
| **api** | Go 1.26, `distroless/static:nonroot`, read-only rootfs | Postgres, Ableitungen, Contract, Validierung, Mail, Snapshots | nein |
| **migrate**, **seed** | dasselbe api-Image, andere Unterbefehle | Init-Container: Schema (`timseil_migrate`), dann Inhalt (`timseil_app`). Laufen durch und enden | **nie** |
| **db** | PostgreSQL 18.6 | Systeme, Tracks, Belege, Vorfälle, Deploys, Snapshots | **nie** |
| **alloy** | Grafana Alloy | tailt die Container-Logs dieses Projekts über den Docker-Socket (`:ro`, ADR 0039 §3); OTLP und Faro ab F6/F11 | **nie** |
| **prometheus** | 3.13 LTS | Metriken, 7 d **und** 2 GB | **nie** |
| **loki** | 3.7 | Logs, 14 d **und** Rate-Limits an beiden Enden — ein Größen-Limit gibt es in Loki nicht, ADR 0039 §4 | **nie** |
| **grafana** | fremde App auf demselben Host | Oberfläche, kein Speicher. Angehängt über `observability-network`, Datasources zeigen auf unsere zwei | gehört ihr, nicht uns |

Startreihenfolge (`compose.yaml`, seit D2): `db` (`pg_isready`) → `migrate` als
Init-Container (Rolle `timseil_migrate`, DDL) → `seed` als Init-Container (Rolle
`timseil_app`, DML) → `api` (Healthcheck aus dem Image) → `web`.

**Fünf Dienste, nicht vier.** Der Seed steht in der Kette, weil er den
kuratierten Inhalt trägt und ein Deploy ihn mitbringen muss (ADR 0013, Issue
#28); ohne ihn liefert ein frischer Deploy eine Seite ohne Systeme. Bauplan und
Handbuch zeichnen noch vier — sie sind älter als ADR 0013, und ADR 0027 §2 hält
die Abweichung fest.

`migrate` und `seed` laufen aus **demselben Image wie `api`**, als Unterbefehle
desselben Binaries: drei getrennt gelinkte Go-Binaries wögen 32 MiB gegen die
20-MiB-Grenze aus D1 (ADR 0027 §1).

**Alle persistenten Daten als Docker Named Volumes** — Dokploys
S3-Volume-Backups funktionieren nur damit. Einzige Ausnahme in `compose.yaml`
ist der Rollen-Bootstrap `./ops/postgres/initdb`, read-only gemountet: das ist
Konfiguration aus git, nicht Zustand, den man wiederherstellen müsste.

## Die Vertrauensgrenze

**Von außen erreichbar sind 22, 80 und 443. Sonst nichts.**

- **Keine Traefik-Labels und keine `ports:`** für `prometheus`, `loki`, `alloy`,
  `db` — nur `expose:` im Docker-Netz. Prometheus kann über seine Admin-API
  Zeitreihen löschen, Loki liefert sämtliche Logs. Solange diese Dienste hinter
  einem WireGuard-Tunnel lagen, war fehlende Authentifizierung egal; **mit der
  Zusammenlegung auf einen Host ist dieser Schutz weggefallen** und wird hier
  ersetzt.
- **Die Dokploy-Oberfläche ist nicht öffentlich.** Sie hat vollen Zugriff auf
  Host, Deploys und **alle Env-Variablen — also auf sämtliche Secrets**. Zugang
  nur über SSH-Tunnel (`ssh -L 3000:localhost:3000`), kein Traefik-Router, Port
  in der Firewall zu.
- **Grafana** ist der Grenzfall (L3): entweder derselbe Tunnel, oder öffentlich
  mit `GF_USERS_ALLOW_SIGN_UP=false`, starkem Passwort bzw. GitHub-OAuth,
  `cookie_secure` und ohne Anonymous-Zugriff.
- **`/api/internal/*`** ist token-authentifiziert **und zusätzlich am Traefik
  geblockt** — zwei Schichten, und es steht nicht in `/api/docs`.

### Offene Frage — beim Zeichnen aufgefallen

**M3 verlangt, dass `/api/internal/*` von außen `404` liefert. F4 lässt den
GitHub-Actions-Probe genau dort anklopfen — von außen.** Beides zugleich geht
nicht: entweder der Pfad ist am Traefik dicht, dann erreicht ihn der Probe nicht,
oder er ist offen, dann trägt nur noch das Token.

Auflösungen, die infrage kommen — **entschieden wird das in L3, nicht hier**:
eine IP-Allowlist für GitHubs Runner-Bereiche (die sich ändern und per Meta-API
gepflegt werden müssten), ein eigener Pfad für den Probe außerhalb von
`/api/internal/*`, oder der Probe misst nur von außen und meldet über den
Datenbranch statt über einen Endpoint. Steht als Fundstück im `backlog.md`.

**Abnahme in M3:** `nmap` von außen zeigt ausschließlich 22, 80, 443.
Dieses Diagramm ist die Vorlage für das Threat Model (STRIDE über die Container),
das **vor** L2 entsteht — davor gebaut steuert es die Härtung, danach
dokumentiert es nur, was ohnehin passiert ist.

## Das Risiko, das dieser Schnitt erzeugt

`loki`, `prometheus` und `db` liegen auf **derselben Platte**. Ein durchgedrehter
Log-Producer kann die Datenbank lahmlegen — ein selbstgebauter Ausfall, und der
wahrscheinlichste. Deshalb sind die Limits in der Tabelle oben keine Empfehlung:
**Zeit-Retention allein reicht nicht**, eine Fehlerschleife füllt in Stunden
Gigabytes und die 14-Tage-Regel greift erst in 14 Tagen.

Seit F2 steht die Decke deshalb an **beiden** Enden: Loki weist über
`per_stream_rate_limit` ab, und Alloy verwirft schon vor seinem eigenen
Write-Ahead-Log. Gemessen an 5 GB aus einem Container: mit nur der Loki-Seite
wuchs `loki-data` um 2 MB und `alloy-data` um 76 — der Rückstau war nicht weg,
er lag woanders auf derselben Platte. Mit beiden Enden: 3 MB. ADR 0039 §5.

Was keine Konfiguration abdeckt, ist der über Tage gehaltene Flood; dafür ist
der **Disk-Alert ab 70 %** aus F10 da, und er ist damit kein Extra, sondern die
zweite Hälfte dieser Zeile.

## Belege

Build-Plan Kapitel 4.1–4.3, Kapitel 10, Kapitel 11.1–11.4 ·
ADR 0005, 0007, 0008, 0039 · Phasen D1, D2, F2, L3, M3 ·
Form angelehnt an `docs/design/Case Study Map` (MAP.03 Schichtenbild).
Die **Fakten** des Blattes — SQLite, Postgres 16, Health-Container,
Access-Log-Parsing — sind überholt; es gelten ADR 0005 und ADR 0007.
