# ADR 0015 — Die Middleware-Kette: Request-ID, Vertrauensgrenze am Proxy, CORS und ein handgeschriebenes Rate-Limit

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** C1, C6, C7, E2, F1, L5, L7
**Invarianten:** —

## Kontext

Der Build-Plan gibt die Kette vor: **Request-ID → `slog` JSON → Recovery →
Timeout → CORS → Rate-Limit**. Die Reihenfolge steht damit fest, drei Fragen
darin nicht — und zwei davon führte Issue #22 als offene Entscheidung: welche
Origins CORS erlaubt, und welche Grenzen für die Lese-Endpoints gelten.

Die dritte Frage stellte sich beim Bauen: **hinter Traefik kommt jede Anfrage vom
Proxy.** Ein Limiter auf der Peer-Adresse steckt die ganze Welt in einen Eimer;
einer, der `X-Forwarded-For` glaubt, lässt jeden Client seine Identität selbst
wählen.

## Entscheidung

### 1. Lesen ist für jeden, Schreiben für genannte Origins

Lesende Antworten unter `/api/` tragen `Access-Control-Allow-Origin: *`, ohne
`Allow-Credentials`. ADR 0004 macht die Lese-API öffentlich, damit ein Fremder die
Zahlen **ohne den Betreiber** prüfen kann — und ein Fremder mit einem Browser ist
auch ein Fremder. Eine Origin-Liste auf den Lesepfaden hieße: prüfbar mit `curl`,
nicht von einer Seite aus, und das ist eine Fußnote entfernt von „prüfbar, wenn du
nett fragst".

`CORS_ALLOWED_ORIGINS` existiert trotzdem und wird für Preflights ausgewertet.
C6 braucht sie für die Origin-Prüfung am Kontaktformular.

`Allow-Credentials` wird nirgends gesetzt. Es gibt hier keine Cookies, und die Tür
bleibt auch für den Tag zu, an dem jemand welche einbaut.

### 2. Die Vertrauensgrenze liegt am TCP-Peer

`TRUSTED_PROXY_CIDRS` ist **leer als Default**: ein Programm, das einen Proxy vor
sich annimmt, glaubt einen gefälschten Header an dem Tag, an dem es direkt
erreichbar wird. Welche Netze forwarden, ist eine Tatsache des Deployments, also
nennt sie das Deployment.

Die Regel:

- Peer **nicht** vertrauenswürdig → die Peer-Adresse gilt, `X-Forwarded-For` wird
  ignoriert.
- Peer vertrauenswürdig → die Kette wird **von rechts** gelesen, Einträge
  übersprungen, die selbst vertrauenswürdig sind. Das landet auf der ersten
  Adresse, die ein vertrauenswürdiger Hop tatsächlich gesehen hat — und damit auf
  der ersten, die ein Angreifer nicht davorschreiben konnte. Den linkesten Eintrag
  zu nehmen ist die übliche Fassung dieses Codes und das übliche Loch.
- `X-Real-IP` wird nie gelesen: ein einzelner Wert ohne Kette lässt sich nicht
  validieren.

**Peer vertrauenswürdig, aber kein brauchbarer Header: die Anfrage wird nicht
limitiert, und das Programm sagt es einmal pro Minute.** Das ist die einzige
Stelle, an der bewusst *offen* gefallen wird. Alle Anfragen dem Proxy
zuzuschreiben hieße, die Seite bei der hunderteinundzwanzigsten Anfrage pro Minute
abzuschalten, um sie zu schützen — ein Rate-Limit ist eine Höflichkeitsgrenze,
Traefik hat in L5 seine eigene, und geschlossen zu fallen nimmt die Seite vom
Netz.

`compose.dev.yaml` lässt die Liste deshalb **leer**: in der Entwicklung
forwardet nichts, der Peer ist Dockers NAT-Gateway. Sie zu füllen hieße, einen
Header zu glauben, den niemand setzt.

### 3. 120 pro Minute, Burst 60, per Hand gebaut

Ein Token-Bucket auf `map` + `sync.Mutex`, gefüllt beim Zugriff statt von einem
Ticker pro Schlüssel. Keine neue Abhängigkeit: `golang.org/x/time/rate` liefert
den Eimer und nicht die Räumung, und die Räumung ist hier die Anforderung.

- **Der Schlüssel ist ein geschlüsselter Hash der Adresse, nie die Adresse.** IPv4
  hat 2³² Werte; ein ungeschlüsselter SHA-256 wäre eine Schreibweise der Adresse,
  kein Ersatz dafür. Der Schlüssel ist pro Prozess zufällig und verlässt ihn nie —
  über einen Neustart hinweg muss nichts korreliert werden, also ist ein Wert, den
  niemand leaken kann, besser als einer, den jemand verwalten muss. Der
  gespeicherte `ip_hash` des Kontaktformulars (C6, Issue #25) ist ein anderes
  Problem: der überdauert, also braucht er einen konfigurierten Pfeffer.
- **IPv6 wird pro /64 gezählt**, IPv4 pro Adresse. Die kleinste Zuteilung eines
  Privatkunden ist ein /64; pro Adresse zu zählen schenkte einem Client
  achtzehn Trillionen Eimer.
- **Einträge werden nach zehn Minuten vergessen.** Das ist die Frist, die die
  Datenschutzseite nennt und die L7 automatisiert — hier hält der Code sie, statt
  dass der Text sie behauptet.
- `/healthz` und `/readyz` sind ausgenommen: der Healthcheck des Containers klopft
  alle paar Sekunden, und eine Liveness-Prüfung ohne Token ist ein Deploy, der
  grundlos scheitert.

### 4. Der 429 kommt in den Contract

Der Limiter läuft auf dem ganzen `/api/`-Präfix, also kann jede Operation mit 429
antworten — und bis C1 sagte das genau eine von vierzehn. Ein 429, den ein Client
nicht kommen sieht, ist ein 429, den er sofort wiederholt; ein generierter Client
behandelt den nicht deklarierten Status als Protokollfehler und tut genau das.

Es wird nichts erfunden: `TooManyRequests` und `Retry-After` gibt es seit B1. Ein
Test liest das ausgelieferte Dokument und schlägt fehl, wenn einer Operation der
429 fehlt — die Auslassung ist beim Schreiben eines Handlers unsichtbar, also wird
das Dokument gefragt statt der Autor erinnert.

### 5. Zwei Stellen in der Kette, die Erklärung brauchen

**Recovery liegt *innerhalb* des Loggings.** Die Zugriffszeile wird nach dem
Handler geschrieben und hält damit den 500 fest, den die Recovery erzeugt hat.
Umgekehrt fehlten ausgerechnet die Anfragen im Log, über die man lesen will. Der
Stacktrace geht in die Logzeile und nie in den Body.

**Der Timeout ist nicht `http.TimeoutHandler`.** Der puffert die ganze Antwort im
Speicher — für den eingebetteten Renderer ein Megabyte pro Anfrage — und schreibt
einen 503 als Klartext, wäre also der eine Fehler dieser API, der kein RFC-9457
-Dokument ist. Die eigene Fassung setzt eine Frist auf den Request-Kontext, den
pgx ohnehin respektiert, und antwortet **500**: der Contract deklariert auf diesen
Pfaden genau einen Status für „bei uns kaputt", und ein Handler, der etwas
antwortet, das der Contract nicht beschreibt, ist ein Contract-Fehler (ADR 0009).
Die Ursache steht im Log, gefunden über die Request-ID.

## Konsequenzen

- **F1** findet über eine Request-ID alle Zeilen beider Dienste; die Zugriffszeile
  trägt sie bereits und der `ReplaceAttr`-Platz für das PII-Scrubbing ist frei.
- **C6** bekommt `CORS_ALLOWED_ORIGINS` fertig und einen zweiten, strengeren
  Limiter (3 pro IP in 10 Minuten) neben diesem.
- **L5** stellt das Traefik-Limit davor; dieses hier bleibt die zweite Schicht.
- **L7** findet die Zehn-Minuten-Retention implementiert vor, nicht geplant.
- **E2** kann Router und Contract in beide Richtungen vergleichen, weil jede
  Operation ihre Statuscodes vollständig deklariert.
- Ein eingehender `X-Request-Id` wird nur von einem vertrauenswürdigen Peer
  übernommen und nur nach Formprüfung: der Wert landet in einer JSON-Logzeile und
  in einem Response-Header, wo ein Zeilenumbruch Einträge fälscht.

### Was das kostet

**`Access-Control-Allow-Origin: *` ist eine Entscheidung gegen eine Schicht.**
Jede fremde Seite darf die Lese-Endpoints aus dem Browser aufrufen. Der Preis ist
Scraping-Komfort; der Gegenwert ist die Nachprüfbarkeit, auf der die ganze Seite
steht. Ohne PII und ohne Schreibzugriff ist der Preis tragbar — mit dem Formular
in C6 wäre er es nicht, und deshalb gilt die Regel dort nicht.

**Der Fail-open-Pfad ist eine echte Lücke, solange er offen ist.** Ein
falsch konfigurierter Proxy schaltet das Limit ab, und nur eine Warnzeile sagt es.
Geschlossen zu fallen wäre die andere, schlimmere Wahl.

**Der Limiter ist prozesslokal.** Zwei Instanzen während eines Deploys erlauben
zusammen das Doppelte, und ein Neustart vergisst alles. Redis dafür steht in P3,
nach dem Launch.

**Ein handgeschriebener Limiter ist Code, den wir pflegen.** Rund hundert Zeilen,
dafür mit einer Räumung, die zu einer Zusage auf der Datenschutzseite gehört.

**Vierzehn Operationen tragen jetzt einen Status, den zwei von ihnen praktisch nie
sehen werden.** Die internen Pfade sind token-geschützt und am Proxy geblockt; sie
sind trotzdem drin, weil zwei Fehlermodelle in einer API der Sonderfall sind, den
später jemand übersieht.

## Verworfene Alternativen

**Origin-Allowlist auch beim Lesen** — macht die API mit `curl` prüfbar und aus
einem Browser nicht, und widerspricht ADR 0004.

**`golang.org/x/time/rate`** — liefert den Token-Bucket, nicht die Räumung nach
zehn Minuten; der Map-Wrapper wäre trotzdem Handarbeit gewesen.

**Den linkesten `X-Forwarded-For`-Eintrag nehmen** — die verbreitete Fassung, und
jeder Client bekäme mit einem Header pro Anfrage einen frischen Eimer.

**Bei fehlendem Forwarded-Header geschlossen fallen** — nimmt die Seite vom Netz,
um sie vor einer Fehlkonfiguration zu schützen, die eine Logzeile benennt.

**Ein konfigurierter Pfeffer für den Limiter-Hash** — eine Variable mehr, die
gesetzt, gedreht und geleakt werden kann, für Daten, die zehn Minuten im
Arbeitsspeicher liegen.

**504 statt 500 beim Timeout** — ehrlicher, kostet aber einen siebten `type`-URI
und eine Änderung an ADR 0009 für einen Fall, dessen Ursache ohnehin im Log steht.

**Einen Catch-all `/` registrieren, um 404 als Problem-Dokument zu liefern** — er
hätte auch `POST /healthz` gefangen und dort 404 statt 405 geantwortet: ein
richtiger Content-Type gegen einen falschen Status getauscht.

## Belege

Build-Plan Zeile 1053 (die Kette), 314 und 1124 (Rate-Limit in Traefik **und** in
der API), 870, 1069 (C6), 1145 (F1), 1325 (L7), 1358 (P3) · Systemhandbuch
Kapitel 29 und 30, Zeile 1142 (Rate-Limit-IP zehn Minuten) · ADR 0004, ADR 0006,
ADR 0009 · Issue #22 (mit diesem ADR entschieden), Issue #25 (C6) ·
`api/internal/middleware`, `api/internal/reqid`.
