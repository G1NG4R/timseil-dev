# Runbook — Mail, DNS und die Zustellbarkeit

**Leser:** ich, wenn eine Einsendung nie ankommt, obwohl alles grün aussieht,
und ich, wenn mail-tester Punkte abzieht und nicht sagt, welcher Eintrag schuld
ist.

Der Versand liegt in `api/internal/mail` (`smtp.go` sendet, `log.go` sendet
absichtlich nicht, `mail.go` baut die Nachricht), aufgerufen aus
`api/internal/contact`. Das Postfach ist OVHs Zimbra, der Relay `ssl0.ovh.net:465`
ist einkompiliert, und die Zone liegt bei OVH auf OVH-Nameservern.
ADR 0021 (Endpoint und Versand), ADR 0029 (Zone, Selektor, Relay), Issue #80.

**Von oben nach unten durcharbeiten.** Teil 0 und 1 sind die Zone, Teil 2 ist die
Umstellung des laufenden Stacks, Teil 3 die Abnahme, Teil 4 die Fehlersuche.
Wer nur nachsehen will, ob heute alles steht, liest „Der Alltag" und hört auf.

---

## Die zwei Fallen — das hier zuerst lesen

Beide haben in L1 zusammen einen halben Tag gekostet, beide sehen im Panel
richtig aus, und beide sind unsichtbar, wenn man sie nicht kennt.

| Falle | Was passiert | Woran man sie erkennt |
|---|---|---|
| **OVHs Subdomain-Feld hängt die Zone selbst an** | Aus `_dmarc.timseil.dev` wird `_dmarc.timseil.dev.timseil.dev`. Der Eintrag löst sauber auf — nur fragt ihn niemand ab | Die Zonenliste zeigt die **eingegebene** Subdomain, nicht den aufgelösten Namen. Also nicht die Liste lesen, sondern den Namen abfragen |
| **Der Empfänger ist `MAIL_TO`, nicht das `email`-Feld** | Das `email` aus dem Formular wird ausschließlich `Reply-To`. Wer die mail-tester-Adresse dort einträgt, schickt die Testmail an sich selbst | mail-tester zeigt weiter „waiting for your email", während im eigenen Postfach eine Nachricht liegt |

Dazu eine dritte, die nur beim Prüfen zuschlägt: **Google liefert TXT-Daten ohne
die umschließenden Anführungszeichen, Cloudflare mit.** Ein
`grep -c '^"v=spf1'` über beide Resolver zählt bei Google `0` und meldet damit
einen intakten Eintrag als fehlend — in genau dem Moment, in dem man dem Prüfer
glauben will.

---

## Der Alltag

Vier Abfragen sagen, ob die Domain heute senden darf. Sie brauchen nichts außer
`curl` und laufen von jedem Rechner, auch ohne `dig`:

```bash
doh() {                                             # $1 Name, $2 Typ
  curl -s -H 'accept: application/dns-json' \
    "https://cloudflare-dns.com/dns-query?name=$1&type=$2" \
  | python3 -c 'import sys,json;[print(a["data"]) for a in json.load(sys.stdin).get("Answer",[])]'
}

doh timseil.dev MX                                  # vier mx*.mail.ovh.net
doh timseil.dev TXT                                 # GENAU EIN v=spf1, ohne ptr
doh ovhmo-selector-1._domainkey.timseil.dev CNAME   # …4821685.du.dkim.mail.ovh.net.
doh _dmarc.timseil.dev TXT                          # v=DMARC1; p=none; rua=…
```

Der Sollzustand, gemessen am 20.08.2026:

| Name | Typ | Wert | TTL |
|---|---|---|---|
| `timseil.dev` | `MX` | `1 mx0` · `5 mx1` · `50 mx2` · `100 mx3` `.mail.ovh.net.` | — |
| `timseil.dev` | `TXT` | `"v=spf1 include:mx.ovh.com ~all"` — und **nur dieser eine** | 3600 |
| `ovhmo-selector-1._domainkey` | `CNAME` | `…_domainkey.4821685.du.dkim.mail.ovh.net.` | — |
| `ovhmo-selector-2._domainkey` | `CNAME` | `…_domainkey.4821686.du.dkim.mail.ovh.net.` | — |
| `_dmarc` | `TXT` | `"v=DMARC1; p=none; rua=mailto:contact@timseil.dev; fo=1"` | 3600 |

**Den Namen abfragen, nicht die SOA-Seriennummer.** Sie taugt bei dieser Zone
nicht als Anzeichen für ein Neu-Ausrollen: über beide DMARC-Änderungen am
19.08.2026 hinweg stand sie unverändert auf `2087170851`, obwohl die Einträge
autoritativ längst beantwortet wurden — sie zog erst danach nach (`2087181690`,
gemessen am 20.08.2026). Wer auf sie schaut, um zu prüfen, ob eine Änderung
durch ist, bekommt eine Antwort auf eine andere Frage.

Die Gegenprobe zum zweiten Resolver gehört dazu, sonst prüft man einen Cache:

```bash
curl -s "https://dns.google/resolve?name=_dmarc.timseil.dev&type=TXT" \
  | python3 -c 'import sys,json;[print(a["data"]) for a in json.load(sys.stdin).get("Answer",[])]'
```

---

## Teil 0 — Was vorher steht

### 0.1 Das Postfach

`contact@timseil.dev` liegt auf **OVHs Zimbra**, nicht auf dem klassischen MX
Plan. Für den Code ändert das nichts: `ssl0.ovh.net:465` ist ein **Proxy** vor
dem Backend, und sein Zertifikat trägt `ssl0.ovh.net` in der SAN-Liste
(`ns0.ovh.net, smtp.mail.ovh.net, ssl0.ovh.net`). Der Name überlebt deshalb den
Produktwechsel dahinter. ADR 0029 §1.

Der Benutzername ist die **vollständige Adresse** und zugleich das `From:` jeder
ausgehenden Nachricht — OVH verlangt, dass beide übereinstimmen, und lehnt die
Abweichung erst ab, nachdem das Passwort über die Leitung ging. Es gibt kein
`MAIL_FROM`; siehe ADR 0021 §6.

### 0.2 Die Nameserver

DKIM per Klick setzt voraus, dass die Zone auf OVH-Nameservern liegt. Prüfen:

```bash
doh timseil.dev NS                                  # dns*.ovh.net / ns*.ovh.net
```

Liegt sie woanders, ist der DKIM-Knopf im Panel wirkungslos und der Rest von
Teil 1.3 gegenstandslos.

---

## Teil 1 — Die Zone

Web Cloud → **Domains** → `timseil.dev` → **DNS-Zone**.

**Für jeden Eintrag gilt die erste Falle:** ins Feld „Subdomain" gehört der
*relative* Name (`_dmarc`), nicht der volle (`_dmarc.timseil.dev`). OVH hängt die
Zone selbst an. Lehnt das Formular den relativen Namen mit „invalid domain" ab,
ist das ein Grund, das Formular neu zu laden — kein Grund, den vollen Namen
einzutragen.

### 1.1 MX

Steht seit der Bestellung des Postfachs und wird nicht angefasst. Vier Einträge
auf `mx0`–`mx3.mail.ovh.net` mit den Prioritäten 1, 5, 50, 100.

### 1.2 SPF — genau einer

| Feld | Wert |
|---|---|
| Typ | `TXT` |
| Subdomain | *(leer — die Domain selbst)* |
| Wert | `v=spf1 include:mx.ovh.com ~all` |

**„Genau einer" ist keine Empfehlung, sondern die Regel.** Zwei `v=spf1`-Einträge
sind kein additives Ergebnis, sondern ein `permerror` nach RFC 7208 §4.5:
Prüfer, die zwei finden, werten keinen von beiden aus. Ein zweiter Eintrag —
etwa von einem Newsletter-Dienst, der „einfach diese Zeile hinzufügen" sagt —
schaltet SPF für die ganze Domain ab. Was dazukommen muss, kommt als weiteres
`include:` **in denselben** Eintrag.

Der Bauplan (Zeile 1300) warnt, OVHs Standard-SPF enthalte teils ein per
RFC 7208 abgekündigtes `ptr`. **Auf diese Zone trifft das nicht zu** — nachgesehen
am 19.08.2026, der Eintrag ist der oben, ohne `ptr`. Die Warnung bleibt für die
nächste Zone richtig.

### 1.3 DKIM — zwei CNAMEs, kein TXT

Web Cloud → **E-Mail** → Domain → das DKIM-Abzeichen. OVH legt die Einträge
selbst an, und zwar als **CNAME**, nicht als TXT:

| Selektor | Zeigt auf |
|---|---|
| `ovhmo-selector-1._domainkey` | `ovhmo-selector-1._domainkey.4821685.du.dkim.mail.ovh.net.` |
| `ovhmo-selector-2._domainkey` | `ovhmo-selector-2._domainkey.4821686.du.dkim.mail.ovh.net.` |

**Den Selektor nachschlagen, nicht raten.** In dieser Zone existiert *kein*
TXT-Selektor; zwanzig geratene Namen (`default`, `mail`, `ovh`, `selector1`, …)
liefen deshalb alle ins Leere. Der Selektor steht im Klartext in jeder
gesendeten Nachricht — `s=` in der `DKIM-Signature`-Kopfzeile. Wer ihn sucht,
schickt sich eine Mail und liest die Rohheader.

Die Schlüssellänge liest man aus dem `p=`, statt sie dem Panel zu glauben. Der
TXT-Wert am Ziel der Delegation kommt in mehreren Teilstrings und muss vorher
zusammengesetzt werden:

```bash
curl -s -H 'accept: application/dns-json' \
  "https://cloudflare-dns.com/dns-query?name=ovhmo-selector-1._domainkey.4821685.du.dkim.mail.ovh.net&type=TXT" \
 | python3 -c 'import sys,json;print("".join(a["data"] for a in json.load(sys.stdin)["Answer"]))' \
 | tr -d '" ' | sed 's/.*p=//' | base64 -d | openssl rsa -pubin -inform DER -noout -text | head -1
# Public-Key: (2048 bit)
```

Negativkontrolle, damit der Prüfer nicht alles bejaht: ein erfundener
`ovhmo-selector-3` muss NXDOMAIN geben.

### 1.4 DMARC — `p=none` und eine Uhr

| Feld | Wert |
|---|---|
| Typ | `TXT` |
| Subdomain | `_dmarc` |
| Wert | `v=DMARC1; p=none; rua=mailto:contact@timseil.dev; fo=1` |

`p=none` ist der vorgeschriebene erste Schritt: erst berichten, dann durchsetzen.
`fo=1` verlangt einen Fehlerbericht, sobald **eine** der beiden Prüfungen
scheitert, statt nur wenn beide scheitern — bei einem Absender pro Tag ist das
Menge genug zum Lesen und die einzige Chance, einen halb kaputten Pfad zu sehen.

**Die Verschärfung auf `quarantine` ist frühestens am 02.09.2026 dran**, nach
zwei Wochen Berichten (Bauplan Zeile 1472). Vorher verschärft man eine Regel,
ohne zu wissen, wer sonst noch unter diesem Namen sendet.

---

## Teil 2 — `MAIL_TRANSPORT` zurück auf `smtp`

Solange `log` steht, nimmt der Endpoint Nachrichten an, antwortet `202` und
stellt nichts zu. Das ist der schlimmste Fehler, den er hat, weil er von beiden
Seiten wie Erfolg aussieht.

1. `date -u` ausführen. **Nicht zwischen 23:45 und 00:00 UTC deployen** —
   Dokploys `docker-cleanup` läuft um 23:50 UTC mit
   `docker system prune --all --force`. Uhrzeit messen, nicht schätzen.
2. Dokploy → Projekt `timseil-dev` → Compose-Service → **Environment**.
3. `MAIL_TRANSPORT` von `log` auf `smtp` setzen.
4. Die drei Variablen füllen, die leer bleiben durften, solange `log` stand:
   `SMTP_USERNAME=contact@timseil.dev`, `SMTP_PASSWORD=<Postfach-Passwort>`,
   `MAIL_TO=contact@timseil.dev`.
5. **Save**, dann **Redeploy**.
6. Im Log nachsehen: die Startzeile
   `mail is NOT being sent — MAIL_TRANSPORT is log` darf **nicht** mehr
   erscheinen. Erscheint sie, hat Dokploy die Variable nicht durchgereicht —
   dann `docker inspect` gegen den laufenden Container, nicht raten.

`compose.yaml` selbst nagelt den Wert nie fest, in keine Richtung: Regel 14 in
`tools/check-compose.sh` verlangt exakt `${MAIL_TRANSPORT:-}` und weist auch ein
gepinntes `smtp` ab. Der Default lebt in `api/internal/config` und nirgends
sonst. ADR 0029 §8.

---

## Teil 3 — Die Abnahme

Das „fertig wenn" des Bauplans für L1: **mail-tester ≥ 9/10**, und `SPF`, `DKIM`
und `DMARC` müssen einzeln grün sein.

1. `mail-tester.com` öffnen und die Wegwerf-Adresse notieren
   (`web-…@srv1.mail-tester.com`). Sie verfällt.
2. In Dokploy **nur `MAIL_TO`** auf diese Adresse setzen → **Redeploy**.
   Nicht das `email`-Feld im Formular — siehe die zweite Falle oben.
3. Eine Nachricht abschicken. **Es gibt bis H8 kein Formular** — `web/app` hat
   zwei Dateien, und der Endpoint ist trotzdem von außen erreichbar. Also
   `curl` gegen die **öffentliche** Adresse, nicht gegen `localhost`: die
   Abnahme gilt dem Weg durch Traefik und den Container.

   ```bash
   curl -i -sS https://timseil.dev/api/contact \
     -H 'content-type: application/json' \
     -d "{\"name\":\"Tim Seil\",\"email\":\"<eine Adresse, die du liest>\",
          \"message\":\"Zustellbarkeitstest — diese Nachricht prueft SPF, DKIM und DMARC.\",
          \"company\":\"\",\"dwellMs\":4200,\"ts\":\"$(date -u +%FT%TZ)\"}"
   ```

   Vier Felder haben eine Bedingung, und jede davon antwortet mit `202`, wenn
   man sie verletzt — die fünfte Antwort ist absichtlich nicht von Erfolg zu
   unterscheiden: `company` muss **leer** sein (Honeypot), `dwellMs` ≥ 3000,
   `message` ≥ 20 Zeichen, `ts` innerhalb von 48 Stunden. Deshalb wird `ts`
   erzeugt und nicht getippt. Ein `Origin`-Header fehlt bewusst — der Handler
   lässt Anfragen ohne Origin durch, genau für diesen Fall.

   Erwartet: `202` mit einer `id` im Rumpf, und im Log die Zeile
   `contact message delivered`. **Das Rate-Limit ist drei pro Adresse in zehn
   Minuten**, jeder Versuch zählt mit.
4. Auf mail-tester „Then check your score" drücken und den Wert ablesen.
5. `MAIL_TO` zurück auf `contact@timseil.dev` → **Redeploy**. Gegenprobe: eine
   zweite Einsendung landet wieder im eigenen Postfach.

**Die Zahl notieren, mit Datum.** Sie ist der einzige quantitative Beleg dieser
Phase, und ein Punktwert ohne Zeitpunkt ist in drei Monaten wertlos.

Zwei Abzüge sind erwartbar und keine Fehler auf unserer Seite: ein fehlender
rDNS/PTR-Eintrag gehört OVHs Relay, nicht uns, und ein fehlender
`List-Unsubscribe`-Header ist bei einer Transaktionsmail richtig so. Jeder andere
Abzug ist ein Fund und gehört in den Backlog.

---

## Teil 4 — Wenn etwas nicht geht

### „Der Eintrag steht im Panel und löst nicht auf"

Erste Vermutung ist immer die Subdomain-Falle. Den **aufgelösten** Namen abfragen,
nicht die Panel-Liste lesen:

```bash
doh _dmarc.timseil.dev TXT                          # das ist der Name, den Prüfer abfragen
doh _dmarc.timseil.dev.timseil.dev TXT              # muss NXDOMAIN sein
```

Antwortet die zweite Zeile, liegt der Eintrag unter dem verdoppelten Namen. Der
ist nicht kaputt, er ist nur unsichtbar für jeden, der danach sucht — löschen und
mit dem *relativen* Namen neu anlegen.

### „Die Änderung ist durch, aber die Zone sagt noch das Alte"

TTL ist 3600 Sekunden. Innerhalb dieser Stunde antworten Resolver aus dem Cache,
und beide öffentlichen Resolver haben eigene. Was hilft: den autoritativen Server
direkt fragen, statt zu warten.

```bash
doh timseil.dev NS                                  # z. B. dns106.ovh.net
dig @dns106.ovh.net _dmarc.timseil.dev TXT +short   # wenn dig zur Hand ist
```

**Was hier nie die Antwort ist:** auf die SOA-Seriennummer schauen. Siehe „Der
Alltag".

### „mail-tester zieht Punkte ab und sagt nicht wofür"

Der Bericht ist aufklappbar; jeder Abzug nennt seine Prüfung. Die Reihenfolge,
in der sich das lohnt:

| Abzug | Heißt | Handlung |
|---|---|---|
| `SPF` rot | Der Umschlag trägt nicht das Konto, oder es gibt zwei `v=spf1` | Teil 1.2. Der Umschlag ist `SMTP_USERNAME`, nie die Besucheradresse |
| `DKIM` rot | Signatur fehlt oder verifiziert nicht | Selektor aus der Rohkopfzeile lesen (Teil 1.3), dann den CNAME prüfen |
| `DMARC` rot | Eintrag fehlt, oder er steht unter dem verdoppelten Namen | Erste Falle |
| „not listed in DNSWL" | Kein Fehler | Eine kostenpflichtige Whitelist, kein Mangel der Zone |
| rDNS / PTR | Gehört OVHs Relay | Nicht unsere Seite |
| `List-Unsubscribe` | Bei Transaktionsmail richtig so | Nichts tun |

### „Niemand bekommt Mail, aber alles ist grün"

Das ist die Symptomseite des API-Prozesses und steht in
`docs/runbooks/api.md` — zuerst die Warteschlange (`contact_delivery`), dann die
`MAIL_TRANSPORT`-Zeile im Log. Erst wenn dort nichts hängt, ist die Zone dran.

### „Das Formular antwortet 502"

`mail-provider-unavailable`: der Relay war im Anfrageweg nicht erreichbar. Die
Nachricht ist **nicht** verloren — sie steht in der Warteschlange und wird
nachgestellt. ADR 0021 §8, Details in `docs/runbooks/api.md`.

---

## Was hier nie die Antwort ist

- **Einen zweiten `v=spf1` anlegen.** Er addiert nicht, er schaltet SPF ab.
- **Ein `MAIL_FROM` einführen**, damit das Formular „im Namen des Besuchers"
  sendet. Der Relay lehnt es ab, und SPF und DMARC lehnen es zu Recht ab. Die
  Besucheradresse gehört in `Reply-To`, sonst nirgendwohin.
- **`p=quarantine` sofort setzen**, weil es strenger klingt. Ohne zwei Wochen
  Berichte verschärft man blind.
- **Den vollen Namen ins Subdomain-Feld schreiben**, weil das Formular den
  relativen abgelehnt hat.
- **Die SOA-Seriennummer als Fortschrittsanzeige lesen.**
- **`MAIL_TRANSPORT` in `compose.yaml` festnageln**, damit Produktion nie wieder
  unter `log` läuft. Das verlegt den Default an eine zweite Stelle; die
  Zusicherung gehört in `check-compose`, nicht in die Datei.

---

## Was hier nicht steht

Damit eine Lücke als Verschiebung lesbar ist und nicht als Vergessen:

| Fehlt | Phase |
|---|---|
| CAA und DNSSEC — ein falscher CAA blockiert die *Erneuerung*, unsichtbar bis zum Ablauf | **L5**, mit einem Ausstellungstest daneben (ADR 0029 §7) |
| `security.txt` nach RFC 9116, und welche Adresse dort steht | **L4** |
| DMARC von `p=none` auf `quarantine` | frühestens **02.09.2026**, nach Auswertung der `rua`-Berichte |
| Eine maschinelle Prüfung dieser Zone (`make check-mail-dns` über DNS-over-HTTPS, mit Fixture für den kaputten Fall) | Issue — bewusst nicht in L1, sie verdoppelt die Phase |
| Ob der Host über das veröffentlichte `AAAA` antwortet | Issue — Web, nicht Mail, und braucht eine Messung von außen |
