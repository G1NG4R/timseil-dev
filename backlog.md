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
| 19.08.2026 | #117 | **Der Kopf dieser Datei behauptet im Präsens, was #117 widerlegt hat** — „nach dem Upgrade behaupten Bauplan, vier ADR, zwei `compose.yaml`-Kommentare und Runbook 3.3 **weiterhin** 6–9 GB RAM und 40 GB Platte" (Zeile 19–22). Drei der vier Klauseln stimmen seit [#117](https://github.com/G1NG4R/timseil-dev/pull/117) nicht mehr; nur die vier ADR sagen es noch, und die absichtlich, mit datierter Notiz. Damit steht dieselbe Sorte überholter Behauptung, gegen die #113 gerichtet war, ausgerechnet in der Datei, die die Funde sammelt | offen, wird in L1 Teil F behoben — entschieden am 19.08.2026 statt eines eigenen chore-PR |

| 19.08.2026 | L1 | **Das Postfach liegt auf OVHs Zimbra, nicht auf dem klassischen MX Plan.** Damit stand der einkompilierte Relay `ssl0.ovh.net:465` (ADR 0021, `api/internal/mail/smtp.go:30`) zur Disposition — und `TestTheRelayIsTheOneTheADRNames` hätte den Fall nicht gefangen, weil er die Konstante mit sich selbst vergleicht. Gemessen um 19:55 UTC: `220 GARM-98R002 / OVH SMTP PROXY`, `AUTH LOGIN PLAIN`, Zertifikats-SAN `ns0.ovh.net, smtp.mail.ovh.net, ssl0.ovh.net`, Hostnamen-Verifikation gegen `ServerName ssl0.ovh.net` geht auf. Der Host ist ein **Proxy** vor dem Backend, deshalb überlebt der Name die Umstellung | offen, gehört als Absatz in ADR 0029 §Belege. **Die offene Hälfte hat Teil C beantwortet:** das Zimbra-Postfach meldet sich dort an, `smtp.auth=contact@timseil.dev`, Zustellung beim ersten Versuch |
| 19.08.2026 | L1 | **Google und Cloudflare liefern TXT-Daten in unterschiedlicher Form** — Google ohne die umschließenden Anführungszeichen, Cloudflare mit. Ein `grep -c '^"v=spf1'` über beide Resolver zählt bei Google `0` und meldet damit einen intakten SPF-Eintrag als fehlend — in genau dem Moment, in dem man dem Prüfer glauben will. Beim Bauen des Propagations-Prüfers aufgefallen, nicht in der Theorie | offen, gehört als Kommentar an das Zonen-Prüfer-Issue: `check-mail-dns.sh` muss beide Formen strippen, und der Fixture-Modus muss diesen Fall enthalten |

| 19.08.2026 | L1 | **DKIM war bereits aktiv, bevor L1 anfing — und liegt als CNAME, nicht als TXT.** Zwei Selektoren, `ovhmo-selector-1` und `ovhmo-selector-2`, delegieren nach `…_domainkey.<id>.du.dkim.mail.ovh.net.` (IDs 4821685/4821686). Beide lösen auf beiden Resolvern auf, beide Schlüssel **2048 Bit** (aus `p=` dekodiert, nicht vom Panel abgelesen), Negativkontrolle NXDOMAIN. Die CNAME-Form ist der Grund, warum zwanzig geratene TXT-Selektoren danebenlagen. **Damit ist die DNS-Hälfte der Phase genau ein Eintrag — DMARC — statt der vier aus dem Bauplan** | offen, gehört als §4 in ADR 0029, ins Runbook („Den Selektor nachschlagen") und als Kommentar an [#80](https://github.com/G1NG4R/timseil-dev/issues/80) |
| 19.08.2026 | L1 | **Die Zone veröffentlicht ein `AAAA` (`2001:41d0:701:1100::d3d5`), und nichts in diesem Projekt hat je geprüft, ob der Host über IPv6 antwortet.** Beim Lesen der Zone aufgefallen. Mein `curl -6` war aussagelos — dieser Rechner hat selbst kein IPv6. Trifft es nicht zu, laufen IPv6-bevorzugende Clients (die meisten Mobilfunknetze) in einen Timeout vor dem Fallback, und der Kanarienvogel dieser Phase prüft nur `A` | offen, **kein L1-Thema** (Web, nicht Mail) — braucht eine Messung von außen, wird Issue |

| 19.08.2026 | L1 | **OVHs DKIM signiert `h=From` — sonst nichts.** Aus den Proton-Kopfzeilen des Rauchtests: `a=rsa-sha256; c=relaxed/relaxed; d=timseil.dev; h=From; s=ovhmo-selector-1`. Der Body ist über `bh=` gedeckt, **`Subject`, `To`, `Date` und `Message-Id` aber nicht** — ein Zwischenläufer kann sie umschreiben, und die Signatur verifiziert weiter. DMARC verlangt für die Ausrichtung nur `From`, also bleiben `dkim=pass` und `dmarc=pass` — **die Schwäche ist für beide Prüfungen unsichtbar** und wäre ohne Blick in die Rohheader nie aufgefallen. OVH signiert, nicht wir; aus dem Code ist daran nichts zu ändern | offen, gehört als `### Was das kostet`-Absatz in ADR 0029 und ins Runbook. Ob OVH den Header-Satz konfigurierbar macht, ist ungeprüft |

| 19.08.2026 | L1 | **OVHs Subdomain-Feld hängt die Zone selbst an — und die Zonenliste zeigt die *eingegebene* Subdomain, nicht den aufgelösten Namen.** Nachdem das TXT-Formular `_dmarc` mit „invalid domain" abgelehnt hatte, wurde voll qualifiziert `_dmarc.timseil.dev` eingetragen; daraus wurde `_dmarc.timseil.dev.timseil.dev`. Der Eintrag löst sauber auf, wird aber von niemandem abgefragt, und im Panel sieht er richtig aus. Hat rund zwei Stunden Warten auf eine „Propagation" gekostet, die längst fertig war | **erledigt in L1** (Eintrag korrigiert, `_dmarc.timseil.dev` steht autoritativ und auf beiden Resolvern) — gehört als Warnung ins Runbook `mail.md` §„Die Zone verlieren" |
| 19.08.2026 | L1 | **Die SOA-Seriennummer taugt bei dieser Zone nicht als Anzeichen für ein Neu-Ausrollen.** Sie stand über beide DMARC-Änderungen hinweg unverändert auf `2087170851`, obwohl die Einträge autoritativ längst beantwortet wurden. Wer auf die Seriennummer schaut, um zu prüfen, ob eine Änderung durch ist, bekommt eine falsche Antwort — **den Namen abfragen, nicht die Seriennummer** | offen, gehört als Satz ins Runbook `mail.md` §„Der Alltag" |

## Idee — noch nicht entschieden

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 19.08.2026 | L1 | **Die Zone maschinell prüfen** — `tools/check-mail-dns.sh` über DNS-over-HTTPS, mit `MAIL_DNS_FIXTURE=<datei>` für einen kaputten Fall in `selftest.sh` (zwei SPF-Einträge, fehlendes DMARC, kein Selektor), als manuelles `make check-mail-dns` neben `check-db`. Heute kann das Repo seine eigene Zone nicht prüfen: `make check` ist grün auf einer Domain, die nichts sendet | bewusst nicht in L1 gebaut — verdoppelt die Phase. Wird Issue |
