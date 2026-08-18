# ADR 0022 — Die drei Badges: `— NO DATA` gegen 500, und die Antwort, die im Contract fehlte

**Status:** Angenommen
**Datum:** 2026-08-18
**Betrifft:** C7, F1, M6, K1
**Invarianten:** 1 (keine erfundenen Zahlen), 3 (Metriken nur für `live`), 8 (Farben nur in `tokens.css`)

## Kontext

`/api/badge/uptime`, `/api/badge/version` und `/api/badge/systems` stehen seit
B1 im Contract und sind seit sieben Phasen ohne Heimat. Issue #27 hält das fest
und schlägt C2 vor, verwirft C7 ausdrücklich („those are the internal
endpoints"). C2 ist vorbei, und die Stufe hat keine achte Phase.

Zwei Dinge haben die Entscheidung dann erzwungen. Erstens: der Paritätsnachweis
aus ADR 0024 kann nicht grün werden, solange drei dokumentierte Routen 404
antworten — und ein Vollständigkeitstest mit drei eingebauten Ausnahmen ist
keiner. Zweitens, und das ist der eigentliche Fund dieser Phase: die drei
Operationen deklarierten **nur 200 und 429**. Ein Badge, dessen Abfrage
scheitert, hatte damit keine erlaubte Antwort.

Das ist wörtlich der Einwand, mit dem ADR 0016 den 501 für ungebaute
Operationen verworfen hat: ein Status, den keine Operation deklariert, ist für
einen generierten Client nicht lesbar. Der Unterschied ist nur, dass es hier
nicht um eine hypothetische Antwort geht, sondern um die, die ein Ausfall der
Datenbank tatsächlich erzeugt.

## Entscheidung

### 1. Die Badges werden in C7 gebaut

Gegen die Empfehlung in Issue #27. Der Grund dort — „C7 sind die internen
Endpoints" — beschreibt das Thema der Phase richtig und übersieht die
Abhängigkeit: ohne die drei Handler gibt es keinen Paritätsnachweis, und ohne
den bleibt Stufe C mit einer offenen Zusage aus ADR 0016 stehen.

### 2. Fehlende Messung ist `— NO DATA`, unerreichbare Datenbank ist ein 500

Die eine Unterscheidung, die dieses Paket überall trägt.

`LatestMetrics` antwortet `pgx.ErrNoRows`, wenn es keine Momentaufnahme gibt
**oder** das System nicht `live` ist — die Abfrage trägt Invariante 3 in ihrer
`WHERE`-Klausel. Beides ist kein Fehler: am ersten Tag ist es die richtige
Antwort, und sie bleibt richtig, bis die Sonde gelaufen ist. Dazu der zweite
Fall, der leicht durchrutscht: eine Zeile kann existieren und `uptime_90d`
trotzdem `NULL` sein, weil `metric_snapshots` bewusst nullable ist.

Ein Treiberfehler dagegen ist ein Ausfall. Ihn als `— NO DATA` auszuliefern
hieße, einen Ausfall hinter Invariante 1 zu verstecken — die Umkehrung dessen,
wofür Invariante 1 gebaut ist.

### 3. Der Contract bekommt seinen 500

```yaml
        '500':
          $ref: '#/components/responses/InternalError'
```

an alle drei Operationen, plus einen Absatz in der Beschreibung des
Uptime-Badges, der die Unterscheidung benennt. Präzedenzfall ist ADR 0017: C2
hat dem eingefrorenen Contract eine fehlende 400 nachgetragen, weil jede
Alternative im Handler gelogen hätte. Hier ist es dieselbe Lage.

Das Version-Badge deklariert damit einen 500, den es nie erzeugen kann — es
liest den Build-Stempel und nie die Datenbank. Die drei Operationen teilen sich
einen Antwortsatz, und den für eine einzige Antwort dreizuteilen wäre teurer als
die kleine Unwahrheit, dass ein Badge einen Status deklariert, den es nicht
braucht. `TestTheVersionBadgeNeverNeedsItsFiveHundred` hält fest, dass das eine
Entscheidung ist und kein Versehen.

### 4. `isError` bleibt falsch, auch bei `— NO DATA`

Shields malt `isError` rot, und Rot sagt „dieses System ist kaputt". Eine
fehlende Messung ist eine andere Aussage. Farbe in dem Fall `lightgrey`.

### 5. `cacheSeconds` wird aus dem Header gelesen, nicht danebengeschrieben

Ein Shields-Payload trägt seine eigene Haltbarkeit im Körper, direkt neben dem
`Cache-Control`-Header, der dasselbe sagt. Zwei Stellen für eine Zahl stimmen an
dem Tag überein, an dem sie geschrieben werden, und danach nicht mehr. Deshalb
`httpx.SharedMaxAge`, das die `s-maxage` aus genau der Zeichenkette liest, die
auch gesendet wird.

Eine Direktive ohne `s-maxage` (`CacheControlNone`) hat keine geteilte
Haltbarkeit. Der zweite Rückgabewert ist dann `false` und das Feld entfällt —
nicht `0`, denn null Sekunden ist eine echte Anweisung an einen Cache und „nicht
speichern" eine andere.

### 6. Die Shields-Farbnamen sind keine Token

`brightgreen`, `yellow`, `red`, `lightgrey`, `blue` sind das Vokabular von
Shields und werden auf Shields' Servern aufgelöst. `tokens.css` hat darauf
keinen Zugriff, also ist Invariante 8 hier nicht berührt. Die zwei Schwellen
(99 % und 95 %) stehen als Konstanten im Paket, aus demselben Grund, den ADR
0019 §6 für die vier Zahlen des Roll-ups nennt: wer sie zur Laufzeit drehen
könnte, färbte dieselbe Messung um, ohne dass die Seite falsch aussähe.

### 7. Null laufende Systeme ist eine Messung, kein Fehlen

`0/2 live` ist der Zustand, in dem diese Seite elf Phasen lang war. Die Zahl ist
bekannt und sie ist null — das ist etwas anderes als „niemand hat nachgesehen",
und deshalb ist das Badge gelb und nicht grau.

## Konsequenzen

**C7** kann den Paritätsnachweis aus ADR 0024 grün bekommen: vierzehn von
vierzehn Operationen sind montiert.

**M6** schaltet die Badges im README an. Der Kommentarblock dort nennt seit
dieser Phase nur noch einen der ursprünglich zwei Gründe — die Endpoints gibt
es, die Domain nicht.

**F1** bekommt mit Prometheus echte Messreihen. Bis dahin ist `— NO DATA` die
korrekte und einzige Antwort des Uptime-Badges, und das ist kein Mangel, den man
beheben kann, außer indem man misst.

### Was das kostet

**Ein Badge deklariert einen Status, den es nicht erreichen kann.** Siehe §3.
Der Preis ist eine Zeile im Contract, die für `/api/badge/version` unwahr ist,
und ein Test, der das ausspricht.

**Die zwei Uptime-Schwellen sind eine Behauptung.** 99 % ist grün, weil das
üblich ist, nicht weil es hier gemessen wurde. Sobald F1 eine Reihe hat, gehört
die Zahl gegen die eigene Historie geprüft — sonst ist Grün eine Farbe, die von
niemandem verdient wurde.

**`httpx.SharedMaxAge` ist Maschinerie für vier Zeichenketten.** Dieselbe
Kritik, die der Kommentar über den vier Cache-Konstanten an einem Generator übt.
Sie ist hier trotzdem richtig, weil das Badge die Zahl als Datum ausliefert und
nicht nur als Header — es sind zwei Aussagen über eine Tatsache, und genau die
brauchen eine Quelle.

## Verworfene Alternativen

**Den DB-Fehler als `— NO DATA` ausliefern.** Der Contract bliebe unberührt und
das Badge antwortete immer 200. Verworfen: ein Leser sähe nicht, dass etwas
kaputt ist. Ein Ausfall, der wie fehlende Daten aussieht, ist genau die eine
Verwechslung, gegen die Invariante 1 geschrieben wurde — nur in die andere
Richtung als üblich.

**Die Badges in einen `fix/`-Branch nach Stufe C.** Dann wäre C7 kleiner. Aber
der Paritätsnachweis müsste drei Ausnahmen kennen, und ein
Vollständigkeitstest, der Ausnahmen kennt, prüft nicht mehr Vollständigkeit.

**Die Farbschwellen in die Umgebung.** Siehe §6. Zwei Variablen, mit denen sich
jede Vergangenheit grün färben ließe.

**Ein eigener Antwortsatz je Badge**, damit `/api/badge/version` keinen 500
deklariert. Drei fast gleiche Blöcke im Contract, um eine Zeile Unwahrheit zu
sparen, die ein Test ohnehin benennt.

## Belege

Build-Plan Kapitel 12.4 · Issue #27 · ADR 0009 (Problem Details, Cache-Header
im Contract) · ADR 0016 §2 (warum ein undeklarierter Status unbrauchbar ist) ·
ADR 0017 (Präzedenz: den Contract ergänzen, statt den Handler lügen zu lassen) ·
ADR 0019 §6 (Konstanten statt Umgebung für Zahlen, die öffentliche Aussagen
färben) · `contract/openapi.yaml` `/api/badge/*` ·
`api/internal/badge/` · `api/internal/httpx/cache.go` (`SharedMaxAge`)
