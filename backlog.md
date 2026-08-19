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

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 19.08.2026 | L1 | **CAA bleibt L5**, obwohl die Zone für DKIM und DMARC ohnehin offen war. Ein falscher CAA-Eintrag blockiert die Zertifikats-*Erneuerung*, und zwar unsichtbar bis zum Ablauf — derselbe Ausfallmodus, dem D3 seine zweitwichtigste Abnahmezeile gewidmet hat. Außerdem hätte eine gescheiterte L1-Abnahme dann zwei Kandidaten als Ursache | bewusst verschoben, gehört zu L5 mit einem Ausstellungstest daneben |
| 19.08.2026 | L1 | **Keine Bestätigungsmail an den Absender.** Sie ginge an eine ungeprüfte Adresse — Backscatter auf genau der Domain, deren Reputation L1 aufbaut — und macht das Formular mit einer gefälschten Adresse zum Ein-Klick-Mailer auf einen Fremden. Die `202` trägt schon eine zitierbare ID | entschieden, nicht verschoben: kommt als Abschnitt in ADR 0029, [#69](https://github.com/G1NG4R/timseil-dev/issues/69) wird geschlossen |

## Gefunden — Bug oder Unklarheit

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 19.08.2026 | L1 | **MX und SPF standen bereits korrekt in der Zone** — genau ein `v=spf1 include:mx.ovh.com ~all`, **ohne `ptr`**, und die Nameserver liegen bei OVH, DKIMs Voraussetzung ist also erfüllt. Die Warnung des Bauplans (Zeile 1295), OVHs Standard-SPF enthalte teils ein per RFC 7208 abgekündigtes `ptr`, **trifft auf diese Zone nicht zu**. Gemessen, nicht angenommen — offen sind nur DKIM und DMARC | offen, gehört als §3 in ADR 0029 und als Kommentar an [#80](https://github.com/G1NG4R/timseil-dev/issues/80) |
| 19.08.2026 | L1 | **`docs/runbooks/api.md:588` sagt nicht, dass `MAIL_TO` das `RCPT TO` ist.** Das `email`-Feld aus dem Body wird nur `Reply-To`. Wer den Schnipsel wörtlich nimmt, schickt die Testnachricht an sich selbst statt an mail-tester und hält das Ergebnis für eine Messung | offen, wird in L1 Teil F behoben |
| 19.08.2026 | L1 | **Der TLS-Pfad in `api/internal/mail/smtp_test.go` war ungeprüft**, und nichts sicherte den Wert `ssl0.ovh.net:465` zu — beide Behauptungen wurden von einem Kommentar getragen, weil das Relay nie erreicht worden war | **erledigt in L1:** zwei Tests, beide gegen ihren kaputten Fall gehalten (`InsecureSkipVerify: true` bzw. geändertes `endpoint`) |
| 19.08.2026 | L1 | **`compose.yaml` behauptete in einem Kommentar, `MAIL_TRANSPORT` werde durchgereicht und nie festgenagelt** — eine Zusicherung, die nichts geprüft hat. `log` in Produktion antwortet jeder Einsendung 202 und stellt nichts zu | **erledigt in L1:** `check-compose` Regel 14, refüsiert auch ein gepinntes `smtp`, vier Fälle in `selftest.sh` |

## Idee — noch nicht entschieden

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 19.08.2026 | L1 | **Die Zone maschinell prüfen** — `tools/check-mail-dns.sh` über DNS-over-HTTPS, mit `MAIL_DNS_FIXTURE=<datei>` für einen kaputten Fall in `selftest.sh` (zwei SPF-Einträge, fehlendes DMARC, kein Selektor), als manuelles `make check-mail-dns` neben `check-db`. Heute kann das Repo seine eigene Zone nicht prüfen: `make check` ist grün auf einer Domain, die nichts sendet | bewusst nicht in L1 gebaut — verdoppelt die Phase. Wird Issue |
