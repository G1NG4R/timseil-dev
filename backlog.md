# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

**Letzte Triage: nach dem ersten Deploy, 19.08.2026.** 24 Zeilen → **13 Issues**
([#102](https://github.com/G1NG4R/timseil-dev/issues/102)–[#112](https://github.com/G1NG4R/timseil-dev/issues/112),
[#114](https://github.com/G1NG4R/timseil-dev/issues/114),
[#115](https://github.com/G1NG4R/timseil-dev/issues/115)), **9 erledigt**, und
2 wurden Kommentare an [#88](https://github.com/G1NG4R/timseil-dev/issues/88)
und [#97](https://github.com/G1NG4R/timseil-dev/issues/97), wo die Frage ohnehin
entschieden wird.

Die neun erledigten sind nicht verworfen, sondern eingebaut: acht stehen seit
[#100](https://github.com/G1NG4R/timseil-dev/pull/100) im Runbook oder in
`compose.yaml`, der neunte war die RAM-Messung, die noch am selben Abend das
Host-Upgrade auf 12 GB und 100 GB ausgelöst hat.

**Ein vierzehntes Issue hat keine Backlog-Zeile:**
[#113](https://github.com/G1NG4R/timseil-dev/issues/113) fiel beim Triagieren
selbst auf — nach dem Upgrade behaupten Bauplan, vier ADR, zwei
`compose.yaml`-Kommentare und Runbook 3.3 weiterhin 6–9 GB RAM und 40 GB Platte.

**Für Stufe L1 offen, aber kein Backlog-Eintrag:** `MAIL_TRANSPORT=log` steht
beim ersten Deploy in Dokploy und muss dort wieder auf `smtp`, sobald das
Postfach existiert. Es steht an drei Stellen im Runbook, weil es die eine
absichtliche Zwischenlösung dieser Stufe ist.

---

## Verschoben — bewusste Entscheidung

## Gefunden — Bug oder Unklarheit

## Idee — noch nicht entschieden
