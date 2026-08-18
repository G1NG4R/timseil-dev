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

## Idee — noch nicht entschieden

| Datum | Was | Bewertung |
|---|---|---|
| 18.08.2026 | `make check-images` in die CI-Pipeline hängen, sobald E1 beide Images ohnehin baut. Heute läuft es von Hand, weil es Docker und einen Build braucht — dieselbe Begründung wie bei `make check-db`, und die hat in E1 auch ein Ende gefunden. **`make check-topology` gehört daneben** — es braucht dieselben Voraussetzungen und ist die einzige Prüfung, die die Startreihenfolge wirklich fährt | naheliegend, gehört zu E1 |
| 18.08.2026 | Das Favicon in `web/public/` ist eine D1-Notlösung, damit `COPY public` nicht gegen ein leeres Verzeichnis geprüft wird. Die endgültige Marke gehört zu G3 | erledigen in G3 |
