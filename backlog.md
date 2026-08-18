# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

**Letzte Triage: nach Stufe C, 18.08.2026.** 69 Zeilen → **15 Issues**
(#57–#71), **8 verworfen mit Begründung**
([#72](https://github.com/G1NG4R/timseil-dev/issues/72), geschlossen),
**41 erledigt**, 1 war schon gefiltert
([#40](https://github.com/G1NG4R/timseil-dev/issues/40)). Die Verwerfungen
stehen dort mit ihrem Grund, damit keine davon in vier Monaten neu durchdacht
wird; [#71](https://github.com/G1NG4R/timseil-dev/issues/71) sammelt, was an
einer Bedingung hängt statt an einer Phase.

Dabei aufgefallen und nachgeholt: **#25 und #26 waren erledigt und offen** — C6
hatte den Pepper gebaut, C7 die Systemzuordnung, und beide PRs trugen keine
`Closes`-Zeile. Die Milestones `C1`, `C6` und `C7` sind geschlossen.

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Wann |
|---|---|---|---|
| 18.08.2026 | D2 | Die vier Ressourcen-Grenzen in `compose.yaml` sind **hergeleitet, nicht gemessen** (ADR 0027 §3 sagt das auch dort). Eine Woche `docker stats` gegen sie halten, sobald etwas läuft — und dann `pids`-Limits nachziehen, für die es heute keine Zahl gibt | L2 |
| 18.08.2026 | D2 | `cap_drop` für den `db`-Container. Sein Entrypoint steigt von root auf `postgres` ab und braucht dafür Capabilities; eine falsche Liste macht die Datenbank unstartbar, also braucht das einen Test statt eines Versuchs | L2 |
| 18.08.2026 | D3 | **Der einmalige `docker push` nach GHCR muss durch die Pipeline ersetzt werden.** D3 hat ihn als Brücke von Hand gemacht, weil `make images` nur lokal taggt und es noch keine Actions gibt — ohne Image in der Registry hätte Dokploy nichts zu ziehen. Der zweite Deploy soll aus Actions kommen | E4 |
| 18.08.2026 | D3 | **Wie lange hält GHCR die alten SHA-Tags?** Der wöchentliche Prune entfernt lokale Layer älter als 7 Tage, ein Rollback dahinter ist ein `docker pull` — das gilt nur, solange die Registry den Tag noch hat. Die Retention dort ist ungeprüft | E4/E5 |

Die drei D1-Zeilen von gestern sind erledigt: `read_only` + `tmpfs` stehen in
`compose.yaml`, der `HEALTHCHECK` wird nicht wiederholt (und `make check-compose`
weist eine zweite Fassung ab), und das Web-Image läuft doch read-only — mit
`tmpfs` auf `/tmp` **und** `/app/.next/cache`.

## Gefunden — Bug oder Unklarheit

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 18.08.2026 | D1 | **Das Web-Image kann nicht read-only laufen** — Next.js schreibt nach `.next/cache` | **erledigt in D2:** `tmpfs` auf `/tmp` (32M) und `/app/.next/cache` (64M), nachgemessen in `make check-topology` |
| 18.08.2026 | D2 | **`TestCommandsDoReachTheSeed` lief grün, während es kaputt war.** Es ruft `go list` als Unterprozess auf, und Gos Test-Cache sieht solche Abhängigkeiten nicht — `make check` war grün, `make check-db` rot. Jeder Test, der ein Kommando aufruft, hat dieses Problem | offen — E1 sollte in CI ohne Cache laufen; ansonsten ist die Klasse klein und benennbar |
| 18.08.2026 | D2 | **`tools/check-dockerfiles.sh` prüft `USER` nur in der letzten Stage.** Das ist heute richtig — Build-Stages laufen absichtlich als root — und wäre falsch, sobald ein Dockerfile **zwei** ausgelieferte Stages hat. Genau das täte die in ADR 0027 verworfene Drittes-Image-Variante | offen, hängt an der Bedingung „ein zweites Ziel-Image" |
| 18.08.2026 | D2 | **`postgres` ist das einzige ungepinnte Image im System.** Es geht nicht anders, solange `stack.yaml` seine Version daraus liest: `fromCompose` nimmt alles nach dem letzten `:`, ein Digest stünde also als Version auf der Seite. Drei Zeilen in `api/internal/stack/stack.go` lösen das | offen, gehört zu E2 (dort steht Dependabot für Docker) |
| 18.08.2026 | D2 | **Der Healthcheck von `web` holt `/`.** Sobald in Stufe G eine Seite die API server-seitig liest, macht ein API-Ausfall die Seite 500, `web` unhealthy und startet es neu — aus einem Ausfall würden zwei | offen, gehört zu G4 |
| 18.08.2026 | D2 | **Bauplan Zeile ~830 zeigt `pgdata:/var/lib/postgresql/data`.** Für Postgres 18 ist das der falsche Pfad — der Container startet damit nicht. `compose.dev.yaml` und `compose.yaml` verwenden beide `/var/lib/postgresql`. Der Bauplan ist deine Datei, deshalb nur notiert | offen, eine Zeile im Bauplan |
| 18.08.2026 | D1 | ADR-Nummern: 0024 und 0025 waren bereits vergeben (Router-Parität, Handler-Form), der Bauplan-Text kannte sie nicht. Die D1-ADR ist deshalb 0026. Vor der nächsten ADR `ls docs/adr/` statt den Plan lesen | erledigt |
| 18.08.2026 | D1 | Vier Basis-Image-Digests wollen gehoben werden, und bis E2 tut das niemand. Dependabot für Docker steht in E2 als Aufgabe — die Zeile fehlt bisher in keinem Issue | offen, hängt an E2 |
| 18.08.2026 | D3 | **Die D2-Naht in `compose.yaml` war falsch.** Sie zeigte `networks: [dokploy-network]` — ein Dienst, der `networks:` schreibt, liegt aber *nur* in den genannten Netzen, der API hätte also die Datenbank gefehlt. Der Ausfall hätte sich wie ein Datenbankproblem gelesen | **erledigt in D3:** beide Netze, ADR 0028 §1, plus `check-compose` Regel 11 und eine Zusicherung in `check-topology` |
| 18.08.2026 | D3 | **`/api/internal/*` ist ab dem ersten Deploy von außen erreichbar** und trägt nur noch sein Token, wo Handbuch Kapitel 29 zwei Schichten verlangt. Folge davon, dass die Lese-API unter `/api` auf demselben Host liegt | offen, gehört zu L3 — und L3 muss dabei #40 auflösen |
| 18.08.2026 | D3 | **Ob Dokploy `traefik.yml` beim Upgrade neu schreibt, ist ungeprüft.** Wenn ja, verschwindet der Metrik-Endpoint aus Schritt 7 still, und F3 hätte nichts zu scrapen. `ops/host/check-traefik-metrics.sh` ist das, was es merken würde — aber nur, wenn jemand es aufruft | offen, gehört zu F3 |
| 18.08.2026 | D3 | **Die Skripte unter `ops/host/` haben keinen kaputten Fall in `selftest.sh`.** Sie prüfen Host-Zustand, nicht Repo-Zustand, und laufen deshalb nur auf dem VPS — die Hausregel „jede Regel hat ihren kaputten Fall" gilt für sie nicht. Das ist benannt, nicht gelöst | offen, hängt an der Bedingung „eine Umgebung, in der Host-Skripte testbar sind" |
| 18.08.2026 | D3 | **Traefik hat keine Zeile in `stack.yaml`** und kann keine haben: seine Version gehört Dokploy, es gibt keine Datei hier, aus der sie zu lesen wäre. `traefik_build_info` aus dem Metrik-Endpoint ist die ehrliche Quelle | [#84](https://github.com/G1NG4R/timseil-dev/issues/84) an F3 |
| 18.08.2026 | D3 | **Das `Operations`-Blatt widerspricht an sieben neuen Stellen**, gefunden beim Lesen für D3. Direkt als Issues abgelegt statt hier gesammelt, weil sie dasselbe Muster haben wie die neun aus A3 | [#77](https://github.com/G1NG4R/timseil-dev/issues/77) (90 statt 91 Tage — Invariante 7), [#78](https://github.com/G1NG4R/timseil-dev/issues/78) (Panel öffentlich), [#79](https://github.com/G1NG4R/timseil-dev/issues/79) (Bind-Mount bräche die Backups), [#80](https://github.com/G1NG4R/timseil-dev/issues/80) (Resend statt OVH), [#81](https://github.com/G1NG4R/timseil-dev/issues/81) (Monitor 60 s statt Probe 5 min), [#82](https://github.com/G1NG4R/timseil-dev/issues/82) (22 fehlt), [#83](https://github.com/G1NG4R/timseil-dev/issues/83) (Veraltete Rahmung). Dazu Kommentare an [#9](https://github.com/G1NG4R/timseil-dev/issues/9) und [#39](https://github.com/G1NG4R/timseil-dev/issues/39), deren Korrektur dasselbe Blatt mit betrifft |

## Idee — noch nicht entschieden

| Datum | Was | Bewertung |
|---|---|---|
| 18.08.2026 | `make check-images` in die CI-Pipeline hängen, sobald E1 beide Images ohnehin baut. Heute läuft es von Hand, weil es Docker und einen Build braucht — dieselbe Begründung wie bei `make check-db`, und die hat in E1 auch ein Ende gefunden. **`make check-topology` gehört daneben** — es braucht dieselben Voraussetzungen und ist die einzige Prüfung, die die Startreihenfolge wirklich fährt | naheliegend, gehört zu E1 |
| 18.08.2026 | Das Favicon in `web/public/` ist eine D1-Notlösung, damit `COPY public` nicht gegen ein leeres Verzeichnis geprüft wird. Die endgültige Marke gehört zu G3 | erledigen in G3 |
| 18.08.2026 | `ops/host/check-traefik-metrics.sh` neben `check-deploy`-artige Prüfungen stellen, sobald es mehr davon gibt — ein Ziel `make check-host`, das auf dem VPS alles auf einmal fährt. Heute wäre das ein Ziel mit einem Skript darin | naheliegend, wenn L3 und L6 ihre Host-Prüfungen mitbringen |
| 18.08.2026 | Läuft in Dokploy bereits eine eigene Docker-Cleanup-Aufgabe, muss eine der beiden weg. Zwei Prune-Jobs, die einander in die Quere kommen, sind schwerer zu lesen als einer — beim Einrichten prüfen und hier eintragen | beim ersten Host-Durchgang entscheiden |
