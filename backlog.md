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
| 18.08.2026 | D1 | `read_only: true` + `tmpfs /tmp` für die API im Produktions-Compose. Das Image läuft nachweislich read-only mit `--cap-drop ALL` und `no-new-privileges`; die Zeilen, die das festschreiben, gehören in `compose.yaml` | D2 |
| 18.08.2026 | D1 | Der `HEALTHCHECK` liegt im Image, also erbt Compose ihn. `compose.yaml` soll ihn **nicht** wiederholen — zwei Fassungen sind eine, die driftet | D2 |

## Gefunden — Bug oder Unklarheit

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 18.08.2026 | D1 | **Das Web-Image kann nicht read-only laufen** — Next.js schreibt nach `.next/cache`. Für die API ist read-only nachgewiesen, für web braucht es ein `tmpfs` oder ein Volume auf genau diesen Pfad. Der Bauplan verlangt read-only nur für die API, es ist also kein D1-Blocker | offen, gehört nach D2 |
| 18.08.2026 | D1 | ADR-Nummern: 0024 und 0025 waren bereits vergeben (Router-Parität, Handler-Form), der Bauplan-Text kannte sie nicht. Die D1-ADR ist deshalb 0026. Vor der nächsten ADR `ls docs/adr/` statt den Plan lesen | erledigt |
| 18.08.2026 | D1 | Vier Basis-Image-Digests wollen gehoben werden, und bis E2 tut das niemand. Dependabot für Docker steht in E2 als Aufgabe — die Zeile fehlt bisher in keinem Issue | offen, hängt an E2 |

## Idee — noch nicht entschieden

| Datum | Was | Bewertung |
|---|---|---|
| 18.08.2026 | `make check-images` in die CI-Pipeline hängen, sobald E1 beide Images ohnehin baut. Heute läuft es von Hand, weil es Docker und einen Build braucht — dieselbe Begründung wie bei `make check-db`, und die hat in E1 auch ein Ende gefunden | naheliegend, gehört zu E1 |
| 18.08.2026 | Das Favicon in `web/public/` ist eine D1-Notlösung, damit `COPY public` nicht gegen ein leeres Verzeichnis geprüft wird. Die endgültige Marke gehört zu G3 | erledigen in G3 |
