# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

**Letzte Triage: nach L1, 20.08.2026.** 21 Zeilen → **4 Issues**
([#118](https://github.com/G1NG4R/timseil-dev/issues/118)–[#121](https://github.com/G1NG4R/timseil-dev/issues/121)),
**16 in der Phase selbst erledigt**, **1 bewusst nach L5 verschoben**, dazu ein
Kommentar an [#80](https://github.com/G1NG4R/timseil-dev/issues/80) und die
Schließung von [#69](https://github.com/G1NG4R/timseil-dev/issues/69).

L1 war zwar keine ganze Stufe, wurde aber aus Stufe L vorgezogen und als
eigenständige Phase abgeschlossen — deshalb wird hier wie an einer
Stufengrenze triagiert.

**Die 16 sind nicht verworfen, sondern umgezogen.** Sie stehen in
[ADR 0029](docs/adr/0029-mail-und-dns-ueber-ovh-die-zone-der-selektor-und-das-relay.md),
im neuen `docs/runbooks/mail.md` und in elf korrigierten Stellen quer durchs
Repo ([#122](https://github.com/G1NG4R/timseil-dev/pull/122)). Eine Notiz ist
erst dann erledigt, wenn sie an einem Ort steht, an dem jemand sie sucht.

**Die vier Issues:**

| Issue | Was offen bleibt |
|---|---|
| [#118](https://github.com/G1NG4R/timseil-dev/issues/118) | Das Repo kann seine eigene Zone nicht prüfen. `make check` ist grün auf einer Domain, über deren Records es nichts weiß |
| [#119](https://github.com/G1NG4R/timseil-dev/issues/119) | Die Zone veröffentlicht ein `AAAA`, das nie jemand getestet hat. Braucht eine Messung von außen |
| [#120](https://github.com/G1NG4R/timseil-dev/issues/120) | DMARC steht auf `p=none`. `quarantine` frühestens am **02.09.2026**, nach Auswertung der `rua`-Berichte |
| [#121](https://github.com/G1NG4R/timseil-dev/issues/121) | Dokploys `.env` verkürzt still jedes Geheimnis mit `$` oder `#`. Bei SMTP fiel es auf, weil `535` den Grund nennt — bei Postgres täte es das nicht |

**Das eine Verschobene:** CAA gehört nach L5, mit einem Ausstellungstest daneben.
Ein falscher CAA-Eintrag blockiert die Zertifikats-*Erneuerung*, unsichtbar bis
zum Ablauf. Begründung in ADR 0029 §7, Erinnerung in `mail.md` §„Was hier nicht
steht" und im Bauplan bei L5 — kein Issue nötig, weil die Phase ihn ohnehin
nennt.

**Abnahme L1:** mail-tester **10/10** am 20.08.2026 um 19:58 UTC. Die zweite
Messung acht Minuten davor ergab 7,7/10; die Differenz war restlos
`FREEMAIL_FORGED_REPLYTO`. Beide Zahlen stehen in ADR 0029 §Belege, weil eine
allein die unehrlichere Angabe wäre.

Vorherige Triage: nach dem ersten Deploy, 19.08.2026 — 24 Zeilen → 13 Issues
([#102](https://github.com/G1NG4R/timseil-dev/issues/102)–[#112](https://github.com/G1NG4R/timseil-dev/issues/112),
[#114](https://github.com/G1NG4R/timseil-dev/issues/114),
[#115](https://github.com/G1NG4R/timseil-dev/issues/115)), 9 erledigt.

---

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Status |
|---|---|---|---|

*Leer seit der Triage vom 20.08.2026.*

## Gefunden — Bug oder Unklarheit

| Datum | Aus Phase | Was | Status |
|---|---|---|---|

*Leer seit der Triage vom 20.08.2026.*

## Idee — noch nicht entschieden

| Datum | Aus Phase | Was | Status |
|---|---|---|---|

*Leer seit der Triage vom 20.08.2026.*
