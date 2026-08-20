# ADR 0021 — Das Kontaktformular: ein Versuch im Anfrageweg, eine Schleife dahinter, und die fünfte Antwort

**Status:** Angenommen
**Datum:** 2026-08-18
**Betrifft:** C6, C7, F1, H8, K1, L1, L7, M1, M3
**Invarianten:** 1 (keine erfundenen Zahlen — hier in der Form: keine erfundene
Zusage), 9 (nur zwei localStorage-Keys — hier sinngemäß: keine dritte Stelle,
an der dieselbe Regel steht)

> **Nachtrag 20.08.2026 (ADR 0029):** §6 nennt „OVH MX Plan" als Quelle der
> `From`-Regel. Das Postfach liegt tatsächlich auf OVHs Zimbra; die Regel gilt
> dort unverändert, und `ssl0.ovh.net:465` bleibt richtig, weil der Host ein
> Proxy vor dem Backend ist — am 19.08.2026 gemessen, nicht angenommen. Der
> Produktname bleibt als Aufzeichnung stehen. Die zweite Zusage von §6, dass
> das Relay verifiziert wird, trägt seit L1 ein Test statt eines Kommentars.

## Kontext

`POST /api/contact` ist der einzige unauthentifizierte Schreibpfad der Seite und
ihr einziger Konversionspunkt. Der Build-Plan gibt C6 in zwei Sätzen —
Validierung, Honeypot `company`, `dwellMs ≥ 3000`, Idempotenz über
`ts`+`email`+Hash, Rate-Limit 3/IP/10 min, IP nur als Hash, Origin-Prüfung,
Versand über OVH-SMTP — und ein Abnahmekriterium: *„Alle fünf Antwortpfade
(202/400/429/502/Honeypot) getestet; Rate-Limit greift vor der OVH-Quote."*

Contract und Schema stehen seit B1 und B2 und sind eingefroren. Drei Stellen im
Code zeigen ausdrücklich auf diese Phase: `00006_contact.sql:48` verlangt einen
konfigurierten Pfeffer für `ip_hash`, `middleware/cors.go:27` sagt, dass
`CORS_ALLOWED_ORIGINS` ausschließlich für diesen Endpoint existiert, und
`.env.example:77` kündigt einen zweiten Limiter an.

Zwei Umstände prägen die Phase stärker als der Plantext.

**L1 gibt es noch nicht.** Postfach und DNS-Einträge sind Phase L1, und der Plan
setzt L1 hinter Stufe D. C6 liegt davor. Es gibt zum Zeitpunkt dieser Phase kein
Postfach, an das gesendet werden könnte, und mail-tester ≥ 9/10 ist L1s Abnahme,
nicht diese hier.

**Das Abnahmekriterium verlangt mehr, als der Plantext liefert.** „Rate-Limit
greift vor der OVH-Quote" ist mit einem Limit *pro IP* grundsätzlich nicht zu
erfüllen: hundert Adressen mit je ihren erlaubten drei sind dreihundert Mails in
zehn Minuten gegen eine Quote von rund zweihundert pro Stunde.

## Entscheidung

### 1. Ein Sendeversuch im Anfrageweg, eine Schleife dahinter

Der Handler schreibt die Zeile, versucht **einmal** zu senden und antwortet.
Erfolg → `202` und `delivery_status='sent'`. SMTP-Fehler → `502`, die Zeile
bleibt `'queued'` mit `delivery_attempts=1` und einer einzeiligen `last_error`.
Ein `Dispatcher` auf einem Minutentakt holt nach, was liegen blieb.

Das ist die einzige Aufteilung, die drei Dinge gleichzeitig erfüllt. Der Contract
deklariert `502` — also muss ein Fehlschlag den Absender erreichen, was eine
reine Queue nicht kann. `00006_contact.sql` legt `delivery_status`,
`delivery_attempts`, `last_error`, `delivered_at` und `mail_message_id` an — also
muss `'queued'` ein Zustand sein, den etwas wieder verlässt, was ein reiner
Inline-Versand nicht leistet. Und der Besucher wartet: das Contact-Blatt gibt
clientseitig nach acht Sekunden auf, `REQUEST_TIMEOUT` ist 15 s.

**Kein Retry im Request.** Ein zweiter Versuch mit Backoff gehört in eine
Schleife, die niemanden warten lässt. Der Handler hat ein Zeitbudget von 7 s pro
Versuch und gibt danach die Wahrheit zurück.

Der Backoff des Dispatchers steht in der `WHERE`-Klausel, nicht in einer Spalte:
`received_at + base × (2^attempts − 1)`, also 0, 2, 6, 14, 30 Minuten. Eine
`next_attempt_at`-Spalte wäre dieselbe Tatsache ein zweites Mal, und die beiden
wären beim ersten von Hand angefassten Datensatz uneins. Das `−1` trägt an beiden
Enden: eine Zeile mit null Versuchen ist genau die, die der Handler nie versucht
hat — weil das Stundenbudget aufgebraucht war — und die soll beim nächsten Takt
raus, nicht ein Basisintervall später.

### 2. Die fünfte Antwort ist ein `202`, das nirgends hinführt

Honeypot gefüllt oder `dwellMs < 3000` → `202` mit einer wohlgeformten Quittung,
**keine Zeile, keine Mail**, eine `WARN`-Zeile mit Grund und `ip_hash`-Präfix.

Der Build-Plan zählt fünf Antwortpfade und nennt nur vier Status; der fünfte ist
also keiner davon. Und der Contract benutzt für beide Regeln dasselbe Wort:
`company` *„must be empty; anything else is discarded silently"*, `dwellMs`
*„below 3000 is discarded"*. Ein `400` verriete einem Bot, welche Regel ihn
erwischt hat, und er müsste es genau einmal erfahren.

Der `company`-Vergleich läuft **ohne Trim**. Ein Feld, das ein Mensch nie sieht,
soll exakt der leere String sein; ein Browser, der ein Leerzeichen in ein
verstecktes Feld schreibt, tut etwas Bemerkenswertes.

### 3. Das Limit wird zweimal geprüft, und die beiden Hälften schließen einander

| | zählt | Lücke |
|---|---|---|
| Token-Bucket im Prozess | **jede** Anfrage, auch die verworfenen | Neustart und zweite Instanz vergessen |
| `count(*)` über `ip_hash` | nur gespeicherte Nachrichten | Honeypot-Fluten stehen nicht in der Tabelle |

Beide antworten `429` mit `Retry-After`. Die Zählung liefert `min(received_at)`
mit, damit die Wartezeit **gemessen** ist: pauschale zehn Minuten wären für jeden
falsch, der vor neun Minuten geschrieben hat.

Der Bucket hängt an der Route (`RateLimiter.Gate`), nicht in der Kette. Drei pro
zehn Minuten gilt für einen Pfad, und die `mux`-Zeile ist dann die vollständige
Aussage über den Geltungsbereich — ein Kettenglied bräuchte einen eigenen
Pfadtest, und dann könnten Geltungsbereich und Montage auseinanderlaufen.
`NewRateLimiterPer` musste dafür entstehen: 3 pro 10 min sind als ganzzahlige
Rate pro Minute **0**, also ein Rundungsfehler, der den Konversionspunkt der
Seite abschaltet.

### 4. Ein Stundenbudget, das nicht pro irgendetwas gilt

150 Mails pro Stunde, prozessweit, geteilt von Handler und Dispatcher. Das ist
die Antwort auf „Rate-Limit greift vor der OVH-Quote", die ein IP-Limit nicht
geben kann.

Aufgebraucht ist kein Ausfall: die Zeile wird geschrieben, der Besucher bekommt
`202` — was stimmt, das heißt „zur Zustellung angenommen" — und der Dispatcher
trägt sie im nächsten Stundenbudget aus. Nachgefüllt wird kontinuierlich, nicht
zur vollen Stunde: ein Eimer, der um 13:59 leer ist und um 14:00 voll, verschickt
ein Stundenkontingent in einer Minute, und das ist genau die Form, auf die eine
Provider-Quote achtet.

### 5. Der Handler hat keinen Breaker, der Dispatcher hat einen

Ein Breaker ist ein Ein-Goroutine-Objekt (`internal/resilience` sagt das in
seinem Paketkommentar), und Request-Goroutinen sind keine. Ein geteilter Breaker
wäre ein anderes Objekt mit einem Lock und mit der Frage, wer den Zustand
besitzt.

Er wird nicht gebraucht: was ein Breaker während eines Ausfalls begrenzen würde —
wie oft ein Credential über die Leitung geht — begrenzt das Stundenbudget
bereits, und zwar prozessweit. Der Dispatcher, der als einziger wiederholt, hat
seinen eigenen: Schwelle 3 Läufe, Abkühlung **10 Minuten** statt der 30 aus
`internal/contributions`. Die Asymmetrie ist beabsichtigt — ein alter Kalender
ist ein kosmetisches Problem, eine unzugestellte Nachricht ist jemand, der
geschrieben und keine Antwort bekommen hat.

### 6. `From` ist keine Variable, der Relay-Host auch nicht

OVH MX Plan verlangt, dass `From:` dem authentifizierten Konto entspricht. Also
**ist** `From` = `SMTP_USERNAME`, und es gibt kein `MAIL_FROM`: eine Variable,
die man nur falsch setzen kann, wird nicht angelegt. Das Relay lehnte die
Abweichung erst ab, nachdem das Passwort schon über die Leitung ging.

`ssl0.ovh.net:465` ist einkompiliert, nach ADR 0020 §8: eine Adresse, die aus der
Umgebung kommen kann, ist eine Bearbeitung davon entfernt, aus einer Anfrage zu
kommen. Ein Anbieterwechsel ist ein Commit.

**Port 465 mit implizitem TLS, nicht 587 mit STARTTLS.** STARTTLS beginnt im
Klartext und rüstet auf Zuruf des Servers auf; ein Angreifer auf dem Pfad kann
das Angebot streichen und dem Credential zusehen. Bei 465 gibt es dieses Fenster
nicht: scheitert der Handshake, wird nichts gesendet.

### 7. Die Mail ist Klartext, und der Rumpf ist base64

Kein HTML — ein zweiter Parser ist ein zweiter Satz Möglichkeiten, falsch zu
liegen. Jeder Header-Wert wird abgelehnt, wenn er `\r`, `\n`, NUL, U+2028 oder
U+2029 enthält; jede Adresse muss eine reine `addr-spec` sein, ohne
Anzeigenamen, ohne zweiten Empfänger.

Der Rumpf ist base64, und das ist der eigentliche Kunstgriff: das eine Feld ohne
nennenswerte Längenbegrenzung wird damit **strukturell** unfähig, eine Zeile zu
enthalten. Ein `Bcc:` in der Nachricht kommt als Alphabet aus 64 Zeichen heraus,
gleichgültig, was der Filter darüber tut.

Geprüft wird an drei Stellen, und die Wiederholung ist Absicht: der Validator
schützt den Besucher vor einem Tippfehler und kann das Feld benennen,
`mail.Build` schützt die Domain vor einem Angreifer und kennt keine Felder, und
das Schema (`contact_messages_email_no_crlf_ck`) schützt die Datenbank. Eine
Verteidigung, die an genau einer Stelle steht, ist ein Refactoring davon
entfernt, nirgends zu stehen.

### 8. Der `502` heißt `mail-provider-unavailable`

Der Typ steht seit ADR 0009 im Register und hatte bis heute keinen Aufrufer.
ADR 0020 §6 nennt ihn ausdrücklich als den Grund, für GitHub **keinen** zweiten
Upstream-benannten Typ zu prägen — ein Typ pro Upstream heißt, dass ein Client
eine Liste führen muss.

Die Spannung wird hier nicht aufgelöst, sondern festgehalten: ein bereits
veröffentlichter Typ wird nicht stillschweigend zurückgezogen, und ein Client,
der „die Gegenseite ist unten" meint, kann weiterhin auf den Status 502 gehen.
Wollte man die Regel aus 0020 rückwirkend durchziehen, wäre das ein eigener ADR,
der 0009 ändert.

### 9. Fremder Origin → `400`, fehlender Origin → durchlassen

Eine Anfrage **ohne** `Origin` geht durch: `curl`, ein CI-Lauf und ein
generierter Client sind legitime Aufrufer einer öffentlichen API, und das ganze
Argument dieser Seite ist, dass ihre Zahlen ohne Nachfrage prüfbar sind. Eine
Anfrage, die einen Origin **nennt** und einen fremden nennt, ist ein Browser auf
fremder Seite — das ist der Fall, den man abweist.

`400` und nicht der stille `202` des Honeypots. Die stille Variante wäre gegen
Bots dichter und machte ein auf neuem Hostnamen deploytes Frontend zu einem
lautlosen Datengrab. Die `WARN`-Zeile ist das eigentliche Meldewerkzeug.

Erzwingbar ist die Prüfung nur, weil `Content-Type: application/json` Pflicht
ist: ein fremdes `<form>` kann `urlencoded`, `text/plain` oder `multipart`
schicken, ohne je einen Preflight auszulösen — JSON kann es nicht.

### 10. `ts` bekommt keine enge Skew-Prüfung

Nur eine weite Plausibilitätsschranke (48 h). Die Idempotenz ist eine
Doppelklick-Sperre, keine Spam-Abwehr — wer eine zweite Zeile will, ändert ein
Wort der Nachricht. Eine enge Schranke kaufte also nichts und kostete jeden
Besucher mit falsch gehender Uhr.

## Konsequenzen

**C7** montiert den generierten Router. `SubmitContact` trägt schon die
Strict-Signatur, aber der Origin und die Client-Adresse liegen im Context
(`internal/contact`, `facts`), und `ServeHTTP` füllt ihn. Der Umbau braucht dafür
eine `StrictHTTPMiddlewareFunc`, sonst ist der Context leer und die
Origin-Prüfung lässt alles durch.

**C7** erbt außerdem die rohe Decodierung: `wireBody` existiert, weil
`openapi_types.Email` beim Decodieren validiert **und normalisiert**. Der
generierte Router decodiert selbst — dort muss dieselbe Entscheidung neu
getroffen werden.

**F1** findet die PII-Regel bereits eingehalten vor: keine Logzeile in
`internal/contact` oder `internal/mail` trägt Name, Adresse oder Nachricht, nur
`id`, ein achtstelliges `ip_hash`-Präfix und einen Grund. Ausnahme ist der
`log`-Transport, der die fertige Mail schreibt — deshalb warnt er beim Start.

**F2/F5** bekommen die erste Metrik dieses Endpoints: Breaker-Zustand,
Warteschlangenlänge, Restbudget. Heute verboten, CLAUDE.md verlangt zu jeder
Metrik ein Panel.

**H8** rendert Fehler aus `status` und `invalidParams`. Der Reihenfolge der
Einträge folgt die Reihenfolge des Formulars, sodass der Fokus ohne Sortieren auf
das erste fehlerhafte Feld springen kann.

**L1** holt nach, was diese Phase nicht prüfen konnte: echte Zustellung, SPF,
DKIM, DMARC, mail-tester ≥ 9/10. `docs/runbooks/api.md` sagt, mit welchen
Befehlen.

**L7** erbt `contact_messages` als einzige Tabelle mit personenbezogenen Daten.
Der Aufbewahrungs-Job bekommt seinen Index mit — `contact_messages_ip_window_idx`
bedient beide Fragen.

**M1** hat mit „OVH-SMTP-Ausfall" bereits einen Chaos-Drill für diesen Pfad; der
502 und die Nachzustellung sind dort zu wiederholen.

### Was das kostet

**Ein Mensch, der eine vorbereitete Nachricht einfügt und in 2,5 Sekunden
abschickt, landet in einem schwarzen Loch** mit einer wertlosen Quittung. Das ist
der Preis von §2, er ist nicht klein, und die einzige Stelle, an der er sichtbar
wird, ist eine `WARN`-Zeile. Wenn das je auffällt, ist die Antwort nicht, die
Regel zu lockern, sondern das Formular so zu bauen, dass es die Zeit ehrlich
misst.

**Ein `502` kann eine Nachricht melden, die zehn Minuten später doch ankommt.**
Der Absender liest „nicht zugestellt", der Dispatcher stellt zu. Der Text der
Antwort sagt das („stored and will be delivered"), aber es bleibt eine Antwort,
die im Moment ihres Sendens nicht die ganze Wahrheit ist. Die Alternative wäre,
den Fehlschlag zu verschweigen — dann wäre der `502` im Contract toter Code.

**Der `log`-Transport schreibt eine Besucheradresse in eine Logzeile.** In der
Entwicklung ist das folgenlos; in Produktion wäre es ein Verstoß gegen die eigene
Datenschutzseite. Geschützt ist das durch einen Default (`smtp`) und eine
`WARN`-Zeile, nicht durch etwas Strukturelles.

**Zwei Limiter für eine Regel.** Wer ein `429` erklären will, muss wissen, welche
Hälfte zugeschlagen hat. Die beiden Logzeilen unterscheiden sich (`rate limit
exceeded` aus der Middleware, `contact rate limit exceeded` aus dem Handler) —
das ist die ganze Vorkehrung.

**Der Pfeffer ist rotierbar und dabei destruktiv.** Eine Rotation verwaist jeden
vorher geschriebenen `ip_hash`; der Boden erkennt eine Adresse nicht wieder. Das
ist zugleich die einzige Art, alle auf einmal zu vergessen, und steht als solche
im Runbook.

**Zwei Indizes auf einer Tabelle, die jahrelang klein bleibt.** 456 kB zusammen,
gemessen bei 20 000 Zeilen. Die Begründung ist nicht Geschwindigkeit im Alltag,
sondern dass die Tabellengröße im Anfrageweg von jemandem bestimmt wird, der
Formulare abschickt.

**Der Dispatcher kann beim Herunterfahren eine Nachricht doppelt zustellen.**
`Stop` bricht die laufende SMTP-Unterhaltung ab; hat das Relay sie bereits
angenommen, ohne dass die Zeile markiert wurde, geht sie beim nächsten Lauf noch
einmal raus. Eine doppelte Mail ins eigene Postfach ist billiger als ein
Container, den `stop_grace_period` mitten im Drain abschießt.

**`resilience.Retry` hat weiterhin genau einen Aufrufer.** Der Breaker hat zwei —
das war die Bedingung aus `backlog.md` —, das generische Retry ist mitgewandert,
weil die beiden ein Paar sind und `internal/contributions` sonst eine private
Hälfte davon behielte. Wenn es bei F5 immer noch einen hat, gehört es zurück.

## Verworfene Alternativen

**Nur queuen, `202` immer.** Dann ist der `502` im Contract toter Code, und ein
Besucher erfährt nie, dass es klemmt — bei dem einen Element, das eine Bewerbung
auslösen könnte.

**Nur inline, kein Dispatcher.** Fünf Spalten in `00006_contact.sql` wären
Dekoration, `'queued'` ein Endzustand, den nichts verlässt, und jede
Provider-Störung von mehr als sieben Sekunden verlöre die Nachricht endgültig.

**Honeypot und Dwell als `400`.** Ehrlicher gegenüber `dwellMs: minimum 3000` im
Contract und wertlos: ein Bot braucht die Auskunft genau einmal.

**Ein `403` für den fremden Origin.** Nicht im Contract deklariert. Ein Status,
den kein generierter Client erwartet, ist schlechter als ein `400` mit einem
Satz, der es erklärt.

**Eine Mail-Bibliothek** (`go-mail` oder ähnlich). MIME, Encoding und TLS fertig
— und eine Abhängigkeit im einzigen Prozess, der eine Besucheradresse in einen
Header schreibt. `net/smtp`, `mime` und `crypto/tls` reichen; dieselbe Linie, mit
der C5 `sethvargo/go-retry` verworfen hat.

**Mailpit oder MailHog im Dev-Compose.** Näher am Original, aber ein weiterer
Container und ein Image, das sonst niemand braucht — für eine Sache, die ein
`net.Listener` im Test besser prüft, weil er die Bytes zeigt.

**Ein `next_attempt_at`-Spalte für den Backoff.** Lesbarer und eine zweite
Aussage über dieselbe Tatsache. Aus `delivery_attempts` und `received_at` ist der
Zeitpunkt jederzeit nachrechenbar.

**Eine enge Skew-Prüfung auf `ts`.** Siehe §10.

**Ein `MAIL_FROM`.** Siehe §6.

**Ein geteilter Breaker für Handler und Dispatcher.** Siehe §5.

## Belege

Build-Plan Kapitel 5.1 (Fuzz-Ziele), 11.1, 11.3, 11.4, Phase C6, Phase L1,
Anhang F. Handbuch Kapitel 16. ADR 0009 (Fehlermodell, Cache-Header),
ADR 0015 (Kette, Vertrauensgrenze, Limiter, Pfeffer), ADR 0020 (Konstanten
gegen Umgebung, Endpoint einkompiliert, siebter Problem-Typ).
`api/migrations/00006_contact.sql`, `api/migrations/00009_contact_delivery.sql`,
`docs/runbooks/migrations.md` (Messungen der beiden Indizes).
