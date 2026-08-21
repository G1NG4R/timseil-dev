# ADR 0032 — Die vier Prüfungen, die keine Liste von Hand führen

**Status:** Angenommen
**Datum:** 2026-08-21
**Betrifft:** E2, E3, E4, G1
**Invarianten:** 1 (keine erfundenen Zahlen — auch nicht über den eigenen Zustand)

## Kontext

E2a brachte die Scanner. Was fehlte, waren die Prüfungen aus Kapitel 12.2, die
**keinen Container brauchen** und deshalb in dieselbe Kette gehören, die ein
Mensch vor dem Push fährt — plus drei aus offenen Issues.

Von den vier Doku-Drift-Prüfungen des Bauplans waren zwei längst gebaut:
OpenAPI↔Router-Parität (C7, `router_parity_test.go`) und die
`stack.yaml`-Versionsprüfung. Offen waren der README-Quickstart und die
ADR-Referenzen.

**Alle vier neuen Prüfungen wurden vorher von Hand gefahren**, bevor eine Zeile
Skript entstand. Das Ergebnis hat den Zuschnitt zweimal geändert und ist der
Grund, warum dieser ADR über Messung spricht statt über Absicht.

## Entscheidung

### 1. Keine Prüfung führt eine Liste von Hand

Die Regel, die alle vier verbindet, und sie ist geerbt: `router_parity_test.go`
liest seine Routentabelle aus generiertem Code, statt sie aufzuzählen. Eine
Handliste ist eine zweite Kopie der Wahrheit, und die Kopie veraltet.

| Prüfung | Woraus sie ableitet |
|---|---|
| `check-env.sh` | den `Env*`-Konstantenblock in `config.go` |
| `check-adrs.sh` | die Dateinamen in `docs/adr/` |
| `check-readme.sh` | den Block unter `## Quickstart` |
| `run-quickstart.sh` | denselben Block, über `--print` |
| `handler_convention_test.go` | Reflection auf `httpx.StrictServerInterface` |

Bei der letzten zahlt sich die Regel doppelt aus. Ohne den Ausschluss
generierter Dateien qualifiziert sich `internal/store` als Handler-Paket, weil
sqlc dort zufällig Methoden namens `ListSystems` und `GetContributions`
erzeugt — ein Contract-Test für die Datenschicht, entstanden aus einer
Namensgleichheit. Und **mit** dem Ausschluss fällt auch `httpx` heraus, dessen
vierzehn Operationsmethoden alle in `gen.go` stehen. Das war nicht die Annahme:
eine Shell-Probe las die ersten drei Zeilen und übersah den Marker in Zeile
fünf, `ast.IsGenerated` benutzt dieselbe Regel wie die Toolchain und lag
richtig. Sieben Handler-Pakete, nicht acht.

`middleware` und `server` fallen von selbst heraus. **Es gibt in keiner der
Prüfungen eine Ausnahmeliste.**

### 2. Eine Prüfung darf nicht über ihr eigenes Beispiel stolpern

`check-adrs.sh` scannt `tools/`. Eine tote Nummer, hingeschrieben um die Regel
zu illustrieren, wäre ein Fund über die Illustration. Also wird sie im Selftest
zur Laufzeit aus Teilen zusammengesetzt und steht nirgends als Literal.

Dasselbe Problem hat `check-secrets.sh` mit seinem gepflanzten Schlüssel, und
es bekommt dieselbe Antwort. Das ist kein Kniff, sondern eine Eigenschaft
jeder Prüfung, die den eigenen Quelltext liest.

### 3. Der Quickstart hat zwei Hälften, weil die Frage zwei hat

`check-readme.sh` fragt, ob die genannten Targets existieren — Millisekunden,
kein Docker, gehört in die Kette. `run-quickstart.sh` führt den Block aus —
klont, installiert, baut zwei Images, startet einen Stack, und läuft deshalb
auf `main` und im Wochenlauf statt auf jedem PR. E1s Kriterium sind fünf
Minuten; ohne diesen Job liegt der Lauf bei 2:15.

**„Den Block verbatim ausführen" hat den Kontakt mit dem Block nicht
überlebt.** Zwei seiner Zeilen sind Server: `make dev` ist `compose up --build`
im Vordergrund, `make design` ist `npx serve`. Beide kehren nie zurück, und
beide sollen das nicht.

Die Regel ist deshalb allgemein statt eine Liste, welche Zeilen das sind:

```
exits 0                     → hat funktioniert, nächste Zeile
exits != 0                  → die Anleitung ist kaputt, Abbruch
läuft nach 180s noch        → ein Server, bleibt oben, nächste Zeile
```

`cd` ist die eine Ausnahme und keine Ermessensfrage: ein Shell-Builtin im
Hintergrund bewegt eine Subshell, die sofort endet.

Danach wird **jede URL geholt, die die README darunter verspricht** — aus der
README gelesen, nicht im Skript wiederholt. Ohne das bestünde `make dev` allein
dadurch, dass compose weiterläuft, und das ist nicht, was dem Leser gesagt
wurde.

### 4. Die Testdateien bleiben bei `check-env` außen vor

`config_test.go`s `base`-Map und `server_test.go`s `testConfig()` sind zwei der
sechs Dateien, die ADR 0023 aufzählt. Eine mechanische Prüfung darauf wäre
erfüllt, sobald der Name irgendwo vorkommt — ein grüner Haken für ein Fixture,
das den Wert weiterhin nicht setzt.

**Die Lücke zu benennen ist mehr wert, als sie vorzutäuschen.** Sie steht hier,
nicht nur im Skriptkommentar.

### 5. `main` fordert sieben Kontexte, `quickstart` ist nicht darunter

```
check · db · images · scan · codeql (go) · codeql (javascript-typescript) · CodeQL
```

Sechs aus `ci.yml`. Der siebte kommt vom Code-Scanning-Dienst und wird rot bei
neuen Alerts — genau so bei #126 geschehen. Ohne ihn gälte „Findings ≥ HIGH
blockieren" für jeden Scanner außer dem, der etwas gefunden hat.

`quickstart` läuft nicht auf Pull Requests. Ihn zu fordern hieße, einen Kontext
zu fordern, der dort nie berichtet — das blockt keinen schlechten Merge,
sondern jeden.

`enforce_admins` bleibt `true`. Eine Regel ohne dokumentierten Rückweg wird im
Ernstfall gelöscht, also gibt es `docs/runbooks/github.md`.

## Konsequenzen

- `make check` wächst um vier Stufen und bleibt Docker-frei.
- Ein neues Target außerhalb der Kette: `make quickstart`.
- Sieben Kontexte auf `main`; das Skript bleibt die Quelle, nicht die Oberfläche.
- Stufe E2 ist abgeschlossen: alle vier Doku-Drift-Prüfungen existieren.

### Was das kostet

- **Zwei der vier Prüfungen fanden nichts.** `check-env` fand alle 24 Variablen
  an allen drei Orten, `check-adrs` fand 32 zu 32. Das gehört so
  hingeschrieben: eine Prüfung, die als Bugfinder verkauft wird und keine Bugs
  fand, verliert beim nächsten Leser ihre Glaubwürdigkeit.
- **`check-adrs` fand allerdings sofort einen Verweis — meinen eigenen.**
  `check-env.sh`, zwanzig Minuten alt, zeigte auf diesen ADR hier, den es zu
  dem Zeitpunkt nicht gab. Genau der Fehler, für den die Prüfung gebaut wurde,
  erzeugt von der Person, die sie schrieb, in derselben Stunde.
- **`go.sum` fehlten 49 Prüfsummen.** Kein kaputter Build — der Modul-Cache hat
  die Bytes — aber ein Build, der nicht beweisen kann, dieselben Bytes geholt
  zu haben wie beim letzten Mal. E3 baut aus dieser Datei ein SBOM.
- **Der `quickstart`-Job ist der erste, der `make dev` in CI fährt.** Er kann
  nur auf `main` rot werden, dort aber sichtbar für jeden, der vorbeikommt.

## Verworfene Alternativen

**Den Quickstart-Block Zeile für Zeile mit `timeout` fahren.** Ein Server, den
`timeout` abräumt, nimmt den Stack mit, und die Prüfungen danach hätten nichts
mehr zum Anfragen.

**Eine Liste der Zeilen, die Server sind.** Eine zweite Kopie der Wahrheit
neben der README — die Sache, gegen die Kapitel 12.2 überhaupt geschrieben ist.

**`check-env` auch auf die Testdateien anwenden.** Siehe §4: eine Prüfung, die
ein Vorkommen im Kommentar akzeptiert, prüft nichts und behauptet es.

**Die Handler-Pakete aufzählen.** Acht Namen, die beim neunten Paket veralten.

## Belege

- 24 Env-Variablen, alle in `.env.example`, im Runbook und in
  `compose.dev.yaml`. Nichts fehlte.
- 32 ADRs, 32 referenzierte Nummern, keine Lücke, keine Doppelung — **nach**
  dem Entfernen des einen Vorwärtsverweises, den die Prüfung fand.
- 6 Quickstart-Targets, alle vorhanden; 9 URLs, die die README verspricht.
- 7 Handler-Pakete mit Contract-Test, gegen den kaputten Fall gehalten:
  `internal/training/contract_test.go` entfernt → der Test nennt das Paket und
  scheitert.
- `go mod tidy -diff`: `go.mod` unverändert, `go.sum` +49/−2.
- 22 neue kaputte Fälle in `tools/selftest.sh`.
