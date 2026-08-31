# ADR 0056 — Eine Stichprobe ist kein Urteil, und das Budget ist da, um es zu holen

**Status:** Angenommen
**Datum:** 2026-08-31
**Betrifft:** `tools/verify-deploy.sh` — ändert die Umsetzung von [ADR 0054](0054-ein-403-ist-keine-antwort-der-anwendung.md), nicht dessen Entscheidung
**Invarianten:** 1 (keine erfundenen Zahlen)

## Kontext

ADR 0054 hat zwei Dinge zugleich getan, und nur eines davon war die Reparatur.

**Die Reparatur war das Urteil.** Am 30.08. rollte der Gate einen guten Deploy
zurück und schrieb „the site is down", weil er einen 403 in denselben Topf warf
wie einen 500. Seitdem gilt: ein 401, 403, 451 oder 429 auf `/api/health` ist
bauartbedingt nicht die Antwort dieses Dienstes — der Contract gibt der Route
200, 304, 429 und 500, und jeder Fehler ist ein RFC-9457-Dokument. Also **kein
Rollback, keine Zeile in `deploys`, Exit 2**. Das steht und wird hier nicht
angefasst.

**Die Zugabe war die Geschwindigkeit.** Dieselbe Änderung ließ den Verify bei
einer Abweisung **sofort** abbrechen, mit dem Argument: „die sechzig Sekunden
existieren, damit ein Container hochkommen kann, und eine Abweisung ist kein
hochkommender Container." Gemessen wurde das als Gewinn — 0 s statt 60.

Am 31.08. traf dieses Argument sein Gegenbeispiel, im Deploy von `499d284`:

```
14:38:04–06   verify-deploy.sh --started       → leer
14:38:07.559  dokploy accepted the deploy
14:38:07.949  /api/health answered 403         ← erste und EINZIGE Stichprobe
14:38:36.474  der neue Prozess kam hoch        ← 28 s nachdem der Gate aufgab
```

Der Gate meldete, er könne es nicht feststellen, und beendete den Job rot.
Produktion lief zu diesem Zeitpunkt und danach durchgehend gesund auf `499d284`
— von außen nachgemessen, `check-deployed` acht Ansprüche grün.

**Was dieser Lauf über die Abweisung sagt, ist: fast nichts.** Es gibt genau
eine Stichprobe, weil der Sofort-Abbruch nach der ersten zuschlug. Ob der 403
zwei Sekunden galt oder zwei Minuten, ist aus diesem Lauf **nicht ablesbar** —
und die naheliegende Vermutung „das war das Tauschfenster" ist damit ebenso
unbelegt wie ihre Gegenthese. Der `--started`-Aufruf **vor** dem Deploy kam
leer zurück, was eher gegen sie spricht; er verschluckt allerdings jeden Fehler,
also trägt auch das nichts.

**Und genau das ist das Argument.** Ein Werkzeug, das nach einer einzigen
Stichprobe aufgibt, erzeugt einen Datenpunkt, aus dem niemand etwas schließen
kann — weder der Gate im Moment noch ein Mensch hinterher. Zwanzig Stichproben
über sechzig Sekunden hätten die Frage beantwortet, die dieser Lauf offenlässt.
Das Budget ist das Instrument für „noch nicht", und es wurde nicht benutzt.

## Entscheidung

Eine Abweisung beendet die Schleife nicht mehr. Sie wird gemerkt, das Budget
läuft weiter, und das Urteil fällt am Ende:

| Lage am Ende des Budgets | Ausgang |
|---|---|
| die Anwendung hat korrekt geantwortet | `0` — eine Abweisung auf dem Weg dorthin war ein Moment |
| es wird immer noch abgewiesen | `2` — dasselbe Urteil wie bisher, nur erwartet statt geraten |
| die Anwendung antwortet, aber falsch oder gar nicht | `1` — die Ausfallbahn, unverändert |

`refused` merkt sich die **letzte** Stichprobe, nicht die schlimmste: eine
Abweisung, auf die eine echte Antwort folgt, ist keine Abweisung mehr.

`VERIFY_BUDGET_SEC` macht das Budget überschreibbar — ausschließlich, damit
`selftest.sh` den Abweisungspfad in Sekunden statt in einer Minute vorführen
kann. Die Pipeline setzt es nicht; der Vorgabewert ist das Budget.

## Konsequenzen

`deploy-gate.sh` ändert sich **nicht**. Es liest Exit 2 an beiden
Verify-Aufrufen, und was 2 bedeutet, ist dasselbe geblieben — es wird nur später
und mit mehr Wissen gesagt.

Fünf Zusicherungen in `selftest.sh` statt drei. Die beiden alten sagen weiter,
was sie sagten (ein 403 ist kein Ausfall, ein 429 nicht die Schuld der
Anwendung); dazu kommen die zwei, die dieser Vorfall gekauft hat:

- **dass die Schleife ihr Budget behält**, während sie abgewiesen wird — mit
  20 s Budget und `timeout 1` beweist Exit 124, dass noch gesampelt wurde;
- **dass eine vorübergehende Abweisung durchgeht** — eine Attrappe antwortet
  403, bis eine Markierung erscheint, dann 200 mit dem Sha. Ob `499d284` diese
  Form hatte, ist ungeklärt; dass ein Deploy sie haben *kann* und dann grün sein
  muss, ist die Zusicherung.

Die Gegenprüfung für den 503-Pfad steht unverändert: ein Ausfall ist weiter ein
Ausfall und wartet sein Budget ab.

### Was das kostet

**Die sechzig Sekunden zurück**, im Fall einer dauerhaften Abweisung. Der Tausch
ist richtig herum: `0054`s Wortlaut „die Meldung kommt in Sekunden statt in zwei
Minuten" beschreibt einen Komfortgewinn, und ein Komfortgewinn, der Fehlschläge
erfindet, ist keiner. Ein Deploy, der wirklich hinter einer Sperre steht, meldet
das jetzt eine Minute später — und ein Deploy, der bloß mitten im Tausch gefragt
wurde, meldet gar keinen Fehlschlag mehr.

**Eine Umgebungsvariable mehr an einem Werkzeug im Deploy-Pfad.** Auf 1 gesetzt
würde sie den Verify blind machen. Sie steht deshalb im Skript kommentiert als
das, was sie ist, und nirgends in der Pipeline.

## Verworfene Alternativen

**Nach N aufeinanderfolgenden Abweisungen abbrechen.** Behielte einen Teil des
Tempos und beseitigte den Fehlalarm ebenfalls. Verworfen, weil N eine Zahl wäre,
die niemand gemessen hat — das Budget ist bereits die gemessene Zahl für „gib
dem Ding Zeit", und eine zweite daneben ist eine Zahl zu viel.

**Erst verifizieren, wenn `startedAt` sich geändert hat.** Verschöbe das Problem
auf einen Wert, den derselbe abgewiesene Aufruf lesen müsste.

**Exit 2, sobald je eine Abweisung gesehen wurde.** Wäre bequemer zu schreiben
und falsch: der Deploy von `499d284` hätte damit weiterhin rot gemeldet, obwohl
die Anwendung danach sauber antwortete.

**Die Ursache des 403 hier zu behandeln.** Sie liegt vor der Anwendung und ist
Host-Zustand; sie steht in den privaten Notizen und gehört nicht in ein
öffentliches Dokument. Dieser ADR repariert, was das Werkzeug daraus macht.

## Belege

ADR 0054 · `tools/verify-deploy.sh` · `tools/selftest.sh` (fünf Zusicherungen) ·
Deploy-Lauf `33403354378` vom 31.08.2026 · `contract/openapi.yaml`
(`/api/health`: 200, 304, 429, 500) · Issues #103, #243
