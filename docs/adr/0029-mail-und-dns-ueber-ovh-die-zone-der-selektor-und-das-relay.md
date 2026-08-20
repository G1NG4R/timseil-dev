# ADR 0029 — Mail und DNS über OVH: eine Zone, die schon stand, ein Selektor als CNAME und ein Relay, das ein Proxy ist

**Status:** Angenommen
**Datum:** 2026-08-20
**Betrifft:** L1, C6, D3, F1, K1, L4, L5
**Invarianten:** 1 (keine erfundenen Zahlen)

## Kontext

C6 hat das Kontaktformular gebaut, ohne es je zustellen zu können: das Postfach
und die Records sind L1, und L1 kam nach Stufe D. Bis dahin lief der Endpoint
unter `MAIL_TRANSPORT=log` — er baut die Nachricht vollständig und schreibt sie
in eine Logzeile, statt sie zu senden. Das ist der schlimmste Fehler, den dieser
Endpoint hat, weil er von beiden Seiten wie Erfolg aussieht: der Besucher bekommt
`202`, das Log ist grün, und niemand liest die Nachricht.

Der Bauplan (Zeile 1297–1302) beschreibt L1 als vier neue DNS-Einträge plus ein
Postfach und nennt genau eine Abnahme: **mail-tester ≥ 9/10**. Er warnt außerdem,
OVHs Standard-SPF enthalte teils ein per RFC 7208 abgekündigtes `ptr`.

Diese Phase hat zuerst gemessen statt gebaut, und die Lage war eine andere als
beschrieben. Von den vier Einträgen standen drei bereits, einer davon in einer
Form, die zwanzig geratene Abfragen nicht gefunden hätten. Das Postfach liegt
nicht auf dem klassischen MX Plan. Und der Relay-Host, den ADR 0021 einkompiliert
hat, war bis zu dieser Phase eine Adresse, die nie jemand erreicht hatte.

## Entscheidung

### 1. Das Postfach liegt auf Zimbra, und der Relay-Name bleibt trotzdem

OVH betreibt das Postfach als Zimbra-Dienst, nicht als klassischen MX Plan. Damit
stand `ssl0.ovh.net:465` aus ADR 0021 §6 zur Disposition — ein einkompilierter
Wert für ein Produkt, das wir gar nicht gebucht haben.

Gemessen am 19.08.2026 um 19:55 UTC, statt ihn zu glauben: der Host antwortet mit
`220 GARM-98R002 / OVH SMTP PROXY`, bietet `AUTH LOGIN PLAIN`, und sein
Zertifikat trägt die SAN-Liste `ns0.ovh.net, smtp.mail.ovh.net, ssl0.ovh.net`,
die Hostnamen-Verifikation gegen `ServerName ssl0.ovh.net` geht also auf. Der
Host ist ein **Proxy** vor dem eigentlichen Backend — und genau deshalb überlebt
sein Name die Umstellung auf Zimbra. Das Postfach meldet sich dort mit
`contact@timseil.dev` an, und die erste Nachricht ging beim ersten Versuch durch.

Der Name bleibt. Er ist keine Vermutung mehr, sondern eine Messung.

### 2. `From` ist das Konto, die Besucheradresse ist `Reply-To`

Unverändert aus ADR 0021 §6, hier nur bestätigt: `From` **ist** `SMTP_USERNAME`,
es gibt kein `MAIL_FROM`, und die Adresse des Besuchers steht in `Reply-To` und
in keinem Feld des Umschlags. Der Umschlag trägt das Konto — daran hängt SPF.

Was L1 daran neu weiß: die Regel gilt beim Zimbra-Postfach genauso. Der Relay
prüft `From` gegen das authentifizierte Konto, und er tut es erst, nachdem das
Passwort über die Leitung ging.

### 3. Genau ein `v=spf1`, ohne `ptr` — und die Bauplan-Warnung trifft nicht zu

Die Zone veröffentlicht genau einen SPF-Eintrag:

```
timseil.dev.  TXT  "v=spf1 include:mx.ovh.com ~all"
```

Kein `ptr`, kein zweiter `v=spf1`, und die Nameserver liegen bei OVH. Der Eintrag
stand bereits, bevor L1 anfing. **Die Warnung des Bauplans aus Zeile 1300 trifft
auf diese Zone nicht zu** — sie bleibt als Warnung richtig und ist hier
gegenstandslos.

Ein zweiter `v=spf1` wäre kein additiver Eintrag, sondern ein `permerror` nach
RFC 7208 §4.5: Prüfer, die zwei finden, werten keinen von beiden aus. Deshalb ist
„genau ein" die Formulierung und nicht „mindestens ein".

### 4. DKIM liegt als CNAME, mit zwei Selektoren, und war schon aktiv

Der Eintrag, den der Bauplan als vierten neuen erwartet, existierte bereits — und
zwar in einer Form, die keine TXT-Abfrage findet:

```
ovhmo-selector-1._domainkey.timseil.dev.  CNAME  ovhmo-selector-1._domainkey.4821685.du.dkim.mail.ovh.net.
ovhmo-selector-2._domainkey.timseil.dev.  CNAME  ovhmo-selector-2._domainkey.4821686.du.dkim.mail.ovh.net.
```

OVH delegiert den Schlüssel, statt ihn in die Zone zu legen. Beide Selektoren
lösen auf beiden Resolvern auf, beide Schlüssel sind **2048 Bit** — aus dem
`p=`-Parameter dekodiert, nicht vom Panel abgelesen. Negativkontrolle: ein
erfundener dritter Selektor gibt NXDOMAIN.

Die CNAME-Form ist der Grund, warum zwanzig geratene TXT-Selektoren danebenlagen.
**Damit war die DNS-Hälfte dieser Phase genau ein Eintrag — DMARC — statt der
vier aus dem Bauplan.**

Die Delegation bleibt, wie sie ist. Ein selbst gepflegter TXT-Schlüssel wäre ein
Geheimnis mehr auf unserer Seite und eine Rotation, die niemand terminiert.

### 5. DMARC steht auf `p=none`, und die Uhr läuft seit dem 19.08.2026

```
_dmarc.timseil.dev.  TXT  "v=DMARC1; p=none; rua=mailto:contact@timseil.dev; fo=1"
```

`p=none` ist keine Schwäche, sondern der vorgeschriebene erste Schritt: erst
berichten, dann durchsetzen. `rua` sammelt die Aggregatberichte, `fo=1` verlangt
einen Fehlerbericht, sobald **eine** der beiden Prüfungen scheitert, statt nur
wenn beide scheitern — bei einem Absender pro Tag ist das Menge genug zum Lesen
und die einzige Chance, einen halb kaputten Pfad zu sehen.

Die Verschärfung auf `quarantine` ist **frühestens am 02.09.2026** dran, nach
zwei Wochen Berichten (Bauplan Zeile 1472). Das Datum steht in einem Issue, weil
eine Uhr ohne Wecker keine Uhr ist.

### 6. Keine Bestätigungsmail an den Absender

Das Design-Blatt verspricht dem Absender „Kopie an dich unterwegs". Sie wird
nicht gebaut, und das ist eine Entscheidung, keine Verschiebung — #69 schließt
mit diesem Abschnitt.

Die Kopie ginge an eine Adresse, die niemand geprüft hat. Damit ist sie
**Backscatter auf genau der Domain, deren Reputation diese Phase aufbaut**, und
das Formular wird mit einer gefälschten Absenderadresse zum Ein-Klick-Mailer auf
einen Fremden. Sie verdoppelt außerdem den Verbrauch am OVH-Kontingent je
Einsendung.

Der Gegengrund — der Besucher hat sonst keinen Beleg — trägt nicht: die `202`
führt bereits eine zitierbare ID mit sich, und wer eine Antwort will, bekommt sie
von einem Menschen.

### 7. CAA gehört nicht in diese Phase

Die Zone war für DKIM und DMARC ohnehin offen, ein CAA-Eintrag wäre zwei Minuten
gewesen. Er kommt trotzdem erst in L5.

Ein falscher CAA-Eintrag blockiert nicht die Ausstellung, sondern die
**Erneuerung** — und zwar unsichtbar, bis das Zertifikat abläuft. Das ist
derselbe Ausfallmodus, dem D3 seine zweitwichtigste Abnahmezeile gewidmet hat. In
L5 steht ein Ausstellungstest daneben. Hier hätte eine gescheiterte Abnahme
außerdem zwei Kandidaten als Ursache gehabt.

### 8. `MAIL_TRANSPORT` wird durchgereicht und nie festgenagelt

`compose.yaml` schreibt `MAIL_TRANSPORT: ${MAIL_TRANSPORT:-}` und sonst nichts.
Regel 14 in `tools/check-compose.sh` erzwingt das, mit vier Fällen in
`tools/selftest.sh`.

Die Regel refüsiert beide Richtungen. `log` in einer Produktionsdatei ist der
Fehler aus dem Kontext: 202 ohne Zustellung. Ein gepinntes `smtp` wäre kein
Fehler, aber eine zweite Stelle, an der der Default steht — und eine zweite
Stelle, an der er falsch stehen kann. Der Default lebt in
`api/internal/config`, und der Vergleich in der Regel ist deshalb ein
Gleichheitstest gegen `${MAIL_TRANSPORT:-}` und keine Suche nach dem Wort `log`.
`compose.dev.yaml` pinnt `log` mit Absicht und ist keine Produktionsdatei.

Vorher trug ein Kommentar diese Zusicherung. Ein Kommentar prüft nichts.

### 9. Der Relay ist einkompiliert — und beide Behauptungen darüber sind getestet

`api/internal/mail/smtp.go` nennt `ssl0.ovh.net:465` und `dialTLS` verifiziert
das Zertifikat. Beide Aussagen wurden von Kommentaren getragen, solange der Relay
eine Adresse war, die niemand erreicht hatte. L1 macht sie tragend, also hängen
jetzt zwei Tests daran:

- `TestTheRelayIsTheOneTheADRNames` hält den Wert fest. Er steht bewusst als
  letzter in der Datei: ein Test darüber, der seine Listener-Adresse leckt, fällt
  hier mit um.
- `TestARelayWhoseCertificateDoesNotVerifyIsNotTalkedTo` zeigt `dialTLS` auf
  einen `httptest.NewTLSServer` und verlangt einen Fehler, der sich per
  `errors.As` als `*tls.CertificateVerificationError` ausweist. Nicht bloß „ein
  Fehler": ein Timeout oder ein abgelehnter Verbindungsversuch würde über die
  Verifikation nichts beweisen.

Port 465 mit implizitem TLS bleibt, aus dem Grund in ADR 0021 §6: STARTTLS auf
587 beginnt im Klartext und rüstet auf Zuruf des Servers auf.

## Konsequenzen

**C6** ist damit end-to-end geprüft, und zwar zum ersten Mal auf dem Weg, den ein
Besucher nimmt: Formular → Container → Relay → Postfach. Was der C6-Test konnte,
war der SMTP-Dialog gegen einen Listener im Test; was er nicht konnte, war die
Zustellbarkeit.

**D3** verliert seine letzte offene Startsperre. `MAIL_TRANSPORT=log` war die eine
bewusste Zwischenlösung des ersten Deploys und steht ab jetzt auf `smtp`.

**F1** erbt eine Sorge weniger: der Log-Transport schrieb eine Besucheradresse in
eine Logzeile, was in Loki nichts zu suchen hat. Unter `smtp` entsteht die Zeile
nicht mehr.

**L4** erbt zwei Punkte, die hier absichtlich liegen bleiben: `security.txt` nach
RFC 9116 und die Frage, welche Adresse dort steht. `SECURITY.md` nennt ab jetzt
`contact@timseil.dev`; wenn die Datei und die ausgelieferte `security.txt` je
widersprechen, gewinnt die ausgelieferte.

**L5** erbt CAA und DNSSEC (§7) und die Kontoebene, an der Domain, DNS, Host und
Mail gemeinsam hängen.

**K1** muss das Ops-Blatt korrigieren: es nennt einen transaktionalen Anbieter
mit `resend._domainkey` und einen `MAIL_API_KEY`. Beides gibt es hier nicht, und
der Selektor ist zusätzlich in der falschen Record-Form beschrieben (#80).

### Was das kostet

**OVH signiert `h=From` — sonst nichts.** Aus den Rohkopfzeilen des Rauchtests:
`a=rsa-sha256; c=relaxed/relaxed; d=timseil.dev; h=From; s=ovhmo-selector-1`. Der
Rumpf ist über `bh=` gedeckt, **`Subject`, `To`, `Date` und `Message-Id` aber
nicht**. Ein Zwischenläufer kann sie umschreiben, und die Signatur verifiziert
weiter. DMARC verlangt für die Ausrichtung nur `From`, also bleiben `dkim=pass`
und `dmarc=pass` — **die Schwäche ist für beide Prüfungen unsichtbar** und wäre
ohne einen Blick in die Rohheader nie aufgefallen. OVH signiert, nicht wir; aus
dem Code dieses Projekts ist daran nichts zu ändern. Ob OVH den Header-Satz
konfigurierbar macht, ist ungeprüft.

**`p=none` heißt zwei Wochen ohne Durchsetzung.** Bis zum 02.09.2026 wird eine
gefälschte Absenderadresse auf dieser Domain gemeldet, aber nicht abgewiesen.
Früher zu verschärfen hieße, die Regel zu verschärfen, bevor irgendjemand weiß,
wer außer uns unter diesem Namen sendet.

**Die Zone ist von Hand gepflegt, und das Repo kann sie nicht prüfen.**
`make check` ist grün auf einer Domain, über deren Records es nichts weiß — und
ein einziger versehentlich zweiter `v=spf1` macht aus einem grünen Build eine
Domain, die nichts mehr zugestellt bekommt. Ein Prüfer über DNS-over-HTTPS ist
notiert und bewusst nicht in dieser Phase gebaut: er verdoppelt sie.

**Der Relay ist ein Proxy, und wir sehen sein Backend nicht.** Der Name überlebt
einen Wechsel dahinter — das ist der Gewinn aus §1 — aber derselbe Umstand heißt,
dass ein Wechsel für uns unsichtbar ist. Bricht die Zustellung, ist die erste
Frage nicht der Code.

**Zwei Redeploys je Zustellbarkeitsmessung.** Der Empfänger ist `MAIL_TO`, also
kostet jede Messung gegen mail-tester ein Umsetzen der Variable und ein
Zurücksetzen danach. Ein zweiter Empfänger als Variable wäre eine Variable, die
man vergisst zurückzusetzen.

## Verworfene Alternativen

**Eine Bestätigungsmail an den Absender.** Siehe §6.

**DKIM selbst pflegen, als TXT in der Zone.** Der Schlüssel wäre unser Geheimnis,
die Rotation unser Termin, und die Zone hätte einen Eintrag mehr, den ein
Kopierfehler unbrauchbar macht. Die Delegation per CNAME ist genau die Aufgabe,
die man einem Postfachanbieter überlässt.

**CAA jetzt mitnehmen, weil die Zone offen war.** Siehe §7.

**`MAIL_TRANSPORT` in `compose.yaml` auf `smtp` festnageln**, damit die
Produktion nie wieder unter `log` läuft. Siehe §8: es verlegt den Default an eine
zweite Stelle. Die Zusicherung gehört in eine Regel, nicht in eine Datei.

**Ein `MAIL_FROM`.** Siehe §2 und ADR 0021 §6.

**Die SOA-Seriennummer als Fortschrittsanzeige der Zone.** Sie stand über beide
DMARC-Änderungen hinweg unverändert auf `2087170851`, obwohl die Einträge
autoritativ längst beantwortet wurden. Wer auf sie schaut, um zu prüfen, ob eine
Änderung durch ist, bekommt eine falsche Antwort. Den Namen abfragen, nicht die
Seriennummer.

**Die Abnahme lokal messen**, mit echten Zugangsdaten in `compose.dev.yaml`. Der
Relay und damit SPF, DKIM und DMARC wären dieselben, der Punktwert also auch —
aber der Beleg sagte dann nichts über den Container aus, der die Nachricht in
Produktion baut.

## Belege

Bauplan Zeile 1297–1302 (Phase L1 und ihre Abnahme), 1300 (die `ptr`-Warnung,
hier widerlegt), 1416, 1472 (die DMARC-Uhr) · ADR 0020 §8 (Konstanten gegen
Umgebung) · ADR 0021 §6 (`From`, Relay, 465 statt 587), §7 (Klartext und CRLF),
§8 (`mail-provider-unavailable`) · ADR 0028 §10 (was D3 offen ließ) ·
Issues #69 (geschlossen mit §6), #80 (Ops-Blatt nennt den falschen Anbieter) ·
Messung des Relays am 19.08.2026, 19:55 UTC · Rohkopfzeilen des Rauchtests vom
19.08.2026 (die `h=From`-Signatur) · Zonenabfrage über Google und Cloudflare am
20.08.2026 · `api/internal/mail/smtp.go`, `api/internal/mail/smtp_test.go`
(§9) · `tools/check-compose.sh` Regel 14, `tools/selftest.sh` (§8) ·
`docs/runbooks/mail.md` (die Klickwege und die Fallen) ·
`docs/runbooks/api.md` (der Endpoint von der Symptomseite)
