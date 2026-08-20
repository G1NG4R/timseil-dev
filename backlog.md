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

**Ein vierzehntes Issue hatte keine Backlog-Zeile:**
[#113](https://github.com/G1NG4R/timseil-dev/issues/113) fiel beim Triagieren
selbst auf — nach dem Upgrade behaupteten Bauplan, vier ADR, zwei
`compose.yaml`-Kommentare und Runbook 3.3 weiterhin 6–9 GB RAM und 40 GB Platte.
Seit [#117](https://github.com/G1NG4R/timseil-dev/pull/117) sagen es nur noch die
vier ADR, und die absichtlich, mit datierter Notiz.

**Offen aus L1, ohne eigene Zeile, weil es außerhalb des Repos liegt:**
`MAIL_TRANSPORT` muss in Dokploy von `log` auf `smtp`, und die drei Variablen
`SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_TO` müssen gefüllt werden. Solange das
nicht geschehen ist, antwortet das Formular in Produktion jeder Einsendung `202`
und stellt nichts zu. Der Klickweg steht in `docs/runbooks/mail.md`, Teil 2; die
Abnahme mit mail-tester in Teil 3.

---

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 19.08.2026 | L1 | **CAA bleibt L5**, obwohl die Zone für DKIM und DMARC ohnehin offen war. Ein falscher CAA-Eintrag blockiert die Zertifikats-*Erneuerung*, und zwar unsichtbar bis zum Ablauf — derselbe Ausfallmodus, dem D3 seine zweitwichtigste Abnahmezeile gewidmet hat. Außerdem hätte eine gescheiterte L1-Abnahme dann zwei Kandidaten als Ursache | **entschieden in L1**, steht als ADR 0029 §7 und in `mail.md` §„Was hier nicht steht". Gehört zu L5 mit einem Ausstellungstest daneben |
| 19.08.2026 | L1 | **Keine Bestätigungsmail an den Absender.** Sie ginge an eine ungeprüfte Adresse — Backscatter auf genau der Domain, deren Reputation L1 aufbaut — und macht das Formular mit einer gefälschten Adresse zum Ein-Klick-Mailer auf einen Fremden. Die `202` trägt schon eine zitierbare ID | **erledigt in L1:** ADR 0029 §6, [#69](https://github.com/G1NG4R/timseil-dev/issues/69) geschlossen. Der Text des Contact-Blatts verspricht sie weiter — das ist K1 |

## Gefunden — Bug oder Unklarheit

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 19.08.2026 | L1 | **MX und SPF standen bereits korrekt in der Zone** — genau ein `v=spf1 include:mx.ovh.com ~all`, **ohne `ptr`**, und die Nameserver liegen bei OVH, DKIMs Voraussetzung ist also erfüllt. Die Warnung des Bauplans (Zeile 1295), OVHs Standard-SPF enthalte teils ein per RFC 7208 abgekündigtes `ptr`, **trifft auf diese Zone nicht zu**. Gemessen, nicht angenommen | **erledigt in L1:** ADR 0029 §3, `mail.md` §1.2, Kommentar an [#80](https://github.com/G1NG4R/timseil-dev/issues/80) |
| 19.08.2026 | L1 | **`docs/runbooks/api.md:588` sagt nicht, dass `MAIL_TO` das `RCPT TO` ist.** Das `email`-Feld aus dem Body wird nur `Reply-To`. Wer den Schnipsel wörtlich nimmt, schickt die Testnachricht an sich selbst statt an mail-tester und hält das Ergebnis für eine Messung | **erledigt in L1:** der Abschnitt sagt es jetzt, die Variablen-Tabelle auch, und `mail.md` führt es als zweite der zwei Fallen ganz oben |
| 19.08.2026 | L1 | **Der TLS-Pfad in `api/internal/mail/smtp_test.go` war ungeprüft**, und nichts sicherte den Wert `ssl0.ovh.net:465` zu — beide Behauptungen wurden von einem Kommentar getragen, weil das Relay nie erreicht worden war | **erledigt in L1:** zwei Tests, beide gegen ihren kaputten Fall gehalten (`InsecureSkipVerify: true` bzw. geändertes `endpoint`), ADR 0029 §9 |
| 19.08.2026 | L1 | **`compose.yaml` behauptete in einem Kommentar, `MAIL_TRANSPORT` werde durchgereicht und nie festgenagelt** — eine Zusicherung, die nichts geprüft hat. `log` in Produktion antwortet jeder Einsendung 202 und stellt nichts zu | **erledigt in L1:** `check-compose` Regel 14, refüsiert auch ein gepinntes `smtp`, vier Fälle in `selftest.sh`, ADR 0029 §8 |
| 19.08.2026 | #117 | **Der Kopf dieser Datei behauptete im Präsens, was #117 widerlegt hat** — „nach dem Upgrade behaupten Bauplan, vier ADR, zwei `compose.yaml`-Kommentare und Runbook 3.3 **weiterhin** 6–9 GB RAM und 40 GB Platte". Damit stand dieselbe Sorte überholter Behauptung, gegen die #113 gerichtet war, ausgerechnet in der Datei, die die Funde sammelt | **erledigt in L1:** der Absatz steht im Perfekt und nennt, was seit #117 noch offen ist |
| 19.08.2026 | L1 | **Das Postfach liegt auf OVHs Zimbra, nicht auf dem klassischen MX Plan.** Damit stand der einkompilierte Relay `ssl0.ovh.net:465` (ADR 0021, `api/internal/mail/smtp.go:30`) zur Disposition — und `TestTheRelayIsTheOneTheADRNames` hätte den Fall nicht gefangen, weil er die Konstante mit sich selbst vergleicht. Gemessen um 19:55 UTC: `220 GARM-98R002 / OVH SMTP PROXY`, `AUTH LOGIN PLAIN`, Zertifikats-SAN `ns0.ovh.net, smtp.mail.ovh.net, ssl0.ovh.net`, Hostnamen-Verifikation gegen `ServerName ssl0.ovh.net` geht auf. Der Host ist ein **Proxy** vor dem Backend, deshalb überlebt der Name die Umstellung | **erledigt in L1:** ADR 0029 §1, datierter Nachtrag an ADR 0021, und der Produktname ist in `api.md`, `systemhandbuch.md` und `c4-context.md` korrigiert |
| 19.08.2026 | L1 | **Google und Cloudflare liefern TXT-Daten in unterschiedlicher Form** — Google ohne die umschließenden Anführungszeichen, Cloudflare mit. Ein `grep -c '^"v=spf1'` über beide Resolver zählt bei Google `0` und meldet damit einen intakten SPF-Eintrag als fehlend — in genau dem Moment, in dem man dem Prüfer glauben will | **erledigt in L1** als Warnung in `mail.md`, und als Anforderung an [#118](https://github.com/G1NG4R/timseil-dev/issues/118) übergeben |
| 19.08.2026 | L1 | **DKIM war bereits aktiv, bevor L1 anfing — und liegt als CNAME, nicht als TXT.** Zwei Selektoren, `ovhmo-selector-1` und `ovhmo-selector-2`, delegieren nach `…_domainkey.<id>.du.dkim.mail.ovh.net.` (IDs 4821685/4821686). Beide lösen auf beiden Resolvern auf, beide Schlüssel **2048 Bit** (aus `p=` dekodiert, nicht vom Panel abgelesen), Negativkontrolle NXDOMAIN. Die CNAME-Form ist der Grund, warum zwanzig geratene TXT-Selektoren danebenlagen. **Damit ist die DNS-Hälfte der Phase genau ein Eintrag — DMARC — statt der vier aus dem Bauplan** | **erledigt in L1:** ADR 0029 §4, `mail.md` §1.3 („Den Selektor nachschlagen", mit dem Dekodier-Kommando), Kommentar an [#80](https://github.com/G1NG4R/timseil-dev/issues/80) |
| 19.08.2026 | L1 | **Die Zone veröffentlicht ein `AAAA` (`2001:41d0:701:1100::d3d5`), und nichts in diesem Projekt hat je geprüft, ob der Host über IPv6 antwortet.** Beim Lesen der Zone aufgefallen. Mein `curl -6` war aussagelos — dieser Rechner hat selbst kein IPv6. Trifft es nicht zu, laufen IPv6-bevorzugende Clients (die meisten Mobilfunknetze) in einen Timeout vor dem Fallback, und der Kanarienvogel dieser Phase prüft nur `A` | **Issue [#119](https://github.com/G1NG4R/timseil-dev/issues/119)** — kein L1-Thema (Web, nicht Mail), braucht eine Messung von außen |
| 19.08.2026 | L1 | **OVHs DKIM signiert `h=From` — sonst nichts.** Aus den Proton-Kopfzeilen des Rauchtests: `a=rsa-sha256; c=relaxed/relaxed; d=timseil.dev; h=From; s=ovhmo-selector-1`. Der Body ist über `bh=` gedeckt, **`Subject`, `To`, `Date` und `Message-Id` aber nicht** — ein Zwischenläufer kann sie umschreiben, und die Signatur verifiziert weiter. DMARC verlangt für die Ausrichtung nur `From`, also bleiben `dkim=pass` und `dmarc=pass` — **die Schwäche ist für beide Prüfungen unsichtbar** und wäre ohne Blick in die Rohheader nie aufgefallen. OVH signiert, nicht wir; aus dem Code ist daran nichts zu ändern | **erledigt in L1** als erster Absatz von ADR 0029 §„Was das kostet". Ob OVH den Header-Satz konfigurierbar macht, bleibt ungeprüft — bewusst kein Issue, weil daran nichts zu tun ist, solange die Antwort unbekannt ist |
| 19.08.2026 | L1 | **OVHs Subdomain-Feld hängt die Zone selbst an — und die Zonenliste zeigt die *eingegebene* Subdomain, nicht den aufgelösten Namen.** Nachdem das TXT-Formular `_dmarc` mit „invalid domain" abgelehnt hatte, wurde voll qualifiziert `_dmarc.timseil.dev` eingetragen; daraus wurde `_dmarc.timseil.dev.timseil.dev`. Der Eintrag löst sauber auf, wird aber von niemandem abgefragt, und im Panel sieht er richtig aus. Hat rund zwei Stunden Warten auf eine „Propagation" gekostet, die längst fertig war | **erledigt in L1** (Eintrag korrigiert; `_dmarc.timseil.dev` steht autoritativ und auf beiden Resolvern, der verdoppelte Name gibt NXDOMAIN — am 20.08. nachgemessen). Steht als erste der zwei Fallen ganz oben in `mail.md` und als Fehlersuche-Abschnitt |
| 19.08.2026 | L1 | **Die SOA-Seriennummer taugt bei dieser Zone nicht als Anzeichen für ein Neu-Ausrollen.** Sie stand über beide DMARC-Änderungen hinweg unverändert auf `2087170851`, obwohl die Einträge autoritativ längst beantwortet wurden. Wer auf die Seriennummer schaut, um zu prüfen, ob eine Änderung durch ist, bekommt eine falsche Antwort — **den Namen abfragen, nicht die Seriennummer** | **erledigt in L1** in `mail.md` §„Der Alltag". Am 20.08. präzisiert: sie ist nicht eingefroren, sie zieht nur nicht zeitnah nach (inzwischen `2087181690`). Als Anforderung an [#118](https://github.com/G1NG4R/timseil-dev/issues/118) übergeben |
| 20.08.2026 | L1 | **`SECURITY.md` versprach wörtlich, die Adresse zu wechseln, „when the domain mailbox exists (phase L1)".** Das Versprechen wurde mit dieser Phase fällig, stand aber in keiner Backlog-Zeile — es wäre nur aufgefallen, wenn jemand die Datei von außen liest, also im schlechtesten Moment | **erledigt in L1:** die Datei nennt `contact@timseil.dev` und sagt, dass `security.txt` in L4 dieselbe Adresse tragen wird und im Konflikt gewinnt |
| 20.08.2026 | L1 | **`api/internal/server/server_test.go` trug ein festes `ts` vom 18.08.2026 im Kontakt-Payload, und `internal/contact` weist alles ab, was weiter als `maxClockSkew` (48 h) von jetzt entfernt liegt.** Die Zeitbombe ging am 20.08. gegen 14:22 UTC hoch: `make check` wurde rot, und der Fehlertext beschuldigte den Router („want it routed to the handler") statt die Uhr. Ein zweiter Fundort war schlimmer als rot — `TestAForeignOriginIsRefusedThroughTheAssembledHandler` erwartet `400`, und ein abgelaufenes `ts` liefert ebenfalls `400`: der Test wäre grün geblieben, auch wenn die Origin-Prüfung ganz verschwunden wäre. `internal/intake` und der Fuzz-Test machen es richtig und injizieren ihre Uhr | **erledigt in L1:** `contactPayload()` erzeugt das `ts` aus `time.Now()`, beide Fundorte benutzen sie, und der Kommentar nennt das Datum, an dem die Lunte abgebrannt ist |

| 20.08.2026 | L1 | **Die Abnahme wurde als „Formular auf der laufenden Seite absenden" beschrieben — es gibt bis H8 kein Formular.** `web/app` besteht aus `layout.tsx` und `page.tsx`. `dokploy.md` sagt das seit D3 in genau so vielen Worten, und die Anweisung wurde trotzdem zweimal so geschrieben, weil „der Weg, den ein Besucher nimmt" als Formulierung zu gut klang, um sie gegen das Repo zu halten. Der Endpoint ist von außen erreichbar (`GET /api/contact` → `405`), der Test geht also per `curl` gegen `https://timseil.dev/api/contact` | **erledigt in L1:** `mail.md` Teil 3 und `api.md` tragen das Kommando samt der vier Bedingungen, die sonst still eine `202` erzeugen (`company` leer, `dwellMs` ≥ 3000, `message` ≥ 20 Zeichen, `ts` < 48 h) |

## Idee — noch nicht entschieden

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 19.08.2026 | L1 | **Die Zone maschinell prüfen** — `tools/check-mail-dns.sh` über DNS-over-HTTPS, mit einem Fixture für einen kaputten Fall in `selftest.sh` (zwei SPF-Einträge, fehlendes DMARC, kein Selektor), als manuelles `make check-mail-dns` neben `check-db`. Heute kann das Repo seine eigene Zone nicht prüfen: `make check` ist grün auf einer Domain, die nichts sendet | **Issue [#118](https://github.com/G1NG4R/timseil-dev/issues/118)** — bewusst nicht in L1 gebaut, verdoppelt die Phase. Der Fixture-Schalter heißt dort `CHECK_MAIL_DNS_FIXTURE`, nicht `MAIL_DNS_FIXTURE`: die vorhandenen Nähte heißen `CHECK_*` |
| 20.08.2026 | L1 | **DMARC von `p=none` auf `quarantine`**, frühestens am 02.09.2026 und erst nach Auswertung der `rua`-Berichte | **Issue [#120](https://github.com/G1NG4R/timseil-dev/issues/120)** — das Datum ist der Punkt: eine Uhr ohne Wecker ist keine Uhr |
