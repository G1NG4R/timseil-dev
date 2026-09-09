# ADR 0075 — Die Frist, die eine Schleife hält, und die Zeile, die niemand löschen darf

**Status:** Angenommen
**Datum:** 2026-09-09
**Betrifft:** H12, L7, M2 — und jeden späteren Leser von `contact_messages`
**Invarianten:** 1 (keine erfundenen Zahlen — hier: keine erfundene Zusage)

## Kontext

H12 schreibt `/privacy` und `/imprint`. Der Build-Plan gibt der Phase einen
einzigen Satz mit, und der ist die ganze Aufgabe: *„muss mit dem übereinstimmen,
was der Code tut. Nicht umgekehrt."* (`docs/build-plan.md:1251`)

Beim Lesen des Entwurfsblatts gegen den Code fiel der Widerspruch auf, um den
dieser ADR geht. Das Blatt behauptet an zwei Stellen:

> *„Nothing is written to a database here."*
> (`docs/design/Legal - timseil.dev.dc.html:244`, und noch einmal auf 390 in `:373`)

Der Code schreibt seit H8 Name, E-Mail, Nachricht, `dwell_ms` und einen
gepfefferten IP-Hash nach `contact_messages` (`api/internal/contact/contact.go`).
Und `00006_contact.sql` schloss mit einem Satz, der drei Phasen lang stehen
blieb:

> *„No index on received_at. The query that wants it is the retention purge from
> L7 … and that job does not exist yet. It arrives with the job, not before it."*

Damit standen drei Wege offen, und alle drei waren schlecht:

1. Die Seite nennt **keine** Frist. Unter Art. 5(1)(e) DSGVO ist das die
   schwächste Fassung — Speicherbegrenzung ist kein Feinschliff.
2. Die Seite nennt eine Frist, **L7 baut sie später**. Genau das, wovor das
   Systemhandbuch warnt: *„Eine Retention-Regel, die nur auf der
   Datenschutzseite steht und nicht in der Konfiguration, ist eine Unwahrheit
   mit Rechtsfolgen."* (`docs/systemhandbuch.md:1181`)
3. Die Seite sagt die Wahrheit: *„bleibt, bis ich sie von Hand lösche."* Ehrlich,
   und eine offene Flanke, die bis L7 auf der Seite steht.

## Entscheidung

**Der Aufbewahrungs-Job wird aus L7 vorgezogen und in H12a gebaut. Die
Datenschutzseite zitiert danach eine Schleife, keine Absicht.**

Vier Festlegungen:

1. **Dreißig Tage**, als Konstante `retentionWindow` in
   `api/internal/contact/policy.go` — im Code und nicht in der Umgebung, auf die
   Regel von ADR 0020 §7 und aus demselben zweiten Grund wie „drei in zehn
   Minuten": eine Zusage, die eine öffentliche Seite macht, gehört in einen
   Commit und nicht in ein Dokploy-Feld.
2. **Der Stundentakt** (`purgeEvery`) ist kein Leistungswert, sondern die
   Genauigkeit der Zusage. Er bestimmt, wie weit *hinter* der Frist eine Zeile
   noch leben kann; bei einer Stunde bleibt der Satz „dreißig Tage" ohne
   Sternchen wahr.
3. **`delivery_status <> 'queued'` ist Teil der Sicherheit der Anweisung**, nicht
   eine Optimierung. Siehe unten.
4. **Der Index kommt mit dem Job** — `00010_contact_retention.sql` löst ein, was
   `00006` zurückgestellt hatte.

## Konsequenzen

### Die Zeile, die niemand löschen darf

Ein `DELETE … WHERE received_at < $1` allein ist ein Datenverlust mit Ansage.
`'queued'` heißt „steht jemandem noch zu": der Dispatcher hat die Nachricht nie
ausgeliefert, und der Absender hat ein `202` bekommen, das sagt, sie sei
angenommen. Eine solche Zeile still zu löschen hieße, eine Nachricht zu
verlieren statt sie zu beantworten — und niemand flussabwärts erführe je den
Unterschied.

`'failed'` ist dagegen ein abgeschlossener Zustand: der Dispatcher hat nach fünf
Versuchen aufgegeben und es in die Zeile geschrieben. Nach dreißig Tagen ist sie
löschbar.

Bleibt eine Zeile nach Ablauf des Fensters `'queued'`, ist das ein **Defekt zum
Ansehen, keine Zeile zum Löschen**. Sie bleibt liegen, und das ist Absicht: eine
Aufbewahrungsregel, die eine kaputte Zustellung wegräumt, räumt den Beleg dafür
weg, dass sie kaputt war.

Der Beweis dafür läuft gegen echtes Postgres
(`api/internal/contact/purge_db_test.go`), gegen `store.New(pool)` statt gegen
eine Abschrift der Anweisung, und **als `timseil_app`** — `DELETE` erreicht die
Rolle über die DEFAULT PRIVILEGES aus `00001_privileges.sql`, und ein Job, dem
in Produktion das Recht fehlt, wäre ein stiller Ausfall, den kein Unit-Test je
gefunden hätte.

### Sechs Hintergrundnutzer statt fünf

`cmd/api/main.go` hält jetzt sechs Schleifen und gibt acht Dinge nach dem Drain
frei. Der Purger folgt der Bauform, die dieses Binary viermal hat: Goroutine ab
Konstruktion, injizierbare Uhr und Ticks, idempotentes `Stop`, und ein Lauf, der
nie an einem Fehler stirbt.

**Ohne Breaker**, und das ist der eine Unterschied. Der Dispatcher hat einen,
weil jeder Versuch eine Zugangsdatei an ein fremdes Relay trägt. Diese Schleife
spricht mit dem Pool, den sie ohnehin hält; ein Lauf, der die Datenbank nicht
erreicht, meldet es und kommt in einer Stunde wieder — und eine Stunde ist
langsamer als jeder Breaker.

### Was L7 davon erbt

L7 bleibt zuständig für die übrigen Fristen (Access-Logs, Anwendungslogs) und
für den **Löschprozess auf Anfrage** — Art. 15 und 17 sind eine Handlung, kein
Ticker. Was L7 hier nicht mehr zu tun hat, ist die Frist für
`contact_messages`. `docs/build-plan.md:1337` ist an dieser Stelle erfüllt,
bevor die Stufe erreicht ist.

### Was das kostet

- **Go-Arbeit in einer Seitenphase.** H12 sollte zwei Textseiten sein und hat
  jetzt eine Migration, eine Query, eine Schleife und sechs Tests davor. Der
  Preis ist eine Teilphase mehr, und er wird bezahlt, weil die Reihenfolge nicht
  umkehrbar ist: der Text kann nicht vor der Schleife geschrieben werden, ohne
  falsch zu sein.
- **Dreißig Tage sind eine Entscheidung, die nichts erzwingt.** Sie ist
  hergeleitet (drei Zwecke, keiner überlebt einen Monat) und bleibt eine Wahl.
  Ein anderer Wert ist eine Zeile — und ein neuer Satz auf der Seite.
- **Die Zahl steht ab H12b an zwei Orten**: als Konstante in Go und als Wort im
  englischen Text unter `web/content/legal/`. Nichts hält sie zusammen. Das ist
  genau die Form, die dieses Repository sonst ablehnt, und sie wird hier
  bewusst in Kauf genommen: der Alternative — die Frist über den Contract
  auszuliefern und die Seite sie lesen zu lassen — steht ein Feld im
  öffentlichen API gegenüber, das nur eine Rechtsseite liest. Als Aufgabe im
  Backlog vermerkt, nicht als Absicht.
- **Eine gelöschte Zeile ist weg.** Es gibt keinen Papierkorb und keine
  Wiederherstellung außer dem nächtlichen `pg_dump` (L6), der dreißig Tage hält
  — also genauso lange. Wer eine Nachricht länger braucht, hat sie im Postfach.

## Verworfene Alternativen

**Die Frist nur auf die Seite schreiben, den Job L7 überlassen.** Die Konstruktion,
vor der `systemhandbuch.md:1181` wörtlich warnt. Ein Stichtag im Text plus ein
Issue wäre eine Zusage mit Fälligkeitsdatum, die niemand außerhalb dieses
Repositories prüfen kann.

**Die Wahrheit schreiben und den Job lassen** („bleibt, bis ich von Hand
lösche"). Ehrlich und im Ton dieser Seite — aber eine Datenschutzseite, die
unbegrenzte Aufbewahrung personenbezogener Daten einräumt, ist die schlechtere
Fassung genau dort, wo diese Seite ihr Argument macht. Und sie hätte bis L7
gestanden.

**Auch `'queued'` löschen, wenn `delivery_attempts` erschöpft ist.** Sähe
aufgeräumter aus und wäre falsch: der Dispatcher schreibt `'failed'`, wenn er
aufgibt, also ist eine alte `'queued'`-Zeile per Definition eine, bei der etwas
anderes schiefging. Sie zu löschen hieße, den einzigen Hinweis darauf zu
löschen.

**Ein `next_purge_at`-Spalte oder ein `pg_cron`-Job.** Eine Spalte wäre eine
zweite Aussage derselben Tatsache — dasselbe Argument, mit dem `contact.sql` die
Backoff-Berechnung gegen ein `next_attempt_at` verteidigt. `pg_cron` wäre eine
Erweiterung im Image und eine Zeitsteuerung außerhalb des Binaries, das sie
begründet.

**Ein Batch-Limit im `DELETE`.** Eine Vorsichtsmaßnahme gegen ein Volumen, das
dieses Formular nicht erzeugt. „Maß halten" gilt auch für Robustheit: eine
Anweisung, die in einer Stunde höchstens die Nachrichten einer Stunde löscht,
braucht keine Schleife um sich herum.

## Belege

- `docs/build-plan.md:1251` (H12), `:1337` (L7 · Datenschutz-Umsetzung)
- `docs/systemhandbuch.md:1171-1187` (Kapitel 30, Datenschutz)
- `api/migrations/00006_contact.sql:87-89` — der zurückgestellte Index
- `api/migrations/00001_privileges.sql:27-30` — DML für `timseil_app`
- ADR 0021 (Kontakt-Endpunkt, Dispatcher), ADR 0015 §3 (Rate-Limit-Schlüssel),
  ADR 0037 (PII im Handler), ADR 0067 §8 (der Datenhinweis am Formular)
