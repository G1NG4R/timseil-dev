# ADR 0014 — Lebenszyklus: Konfiguration, Pool-Größe, Timeout-Kaskade, Graceful Shutdown

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** C1, C2–C7, D1, D2, E5
**Invarianten:** 1 (`null` → `— NO DATA`)

## Kontext

Bis C1 war `cmd/api` ein Skelett: `http.ListenAndServe`, eine Umgebungsvariable,
ein Pool mit Standardwerten. Der Build-Plan (Zeile 1053) verlangt für diese Phase
vier Dinge, die ineinandergreifen — validierte Konfiguration, einen begründet
dimensionierten Pool mit drei Postgres-Timeouts, Graceful Shutdown auf SIGTERM,
und die Middleware-Kette (die in ADR 0015 steht).

Vier Zahlen mussten dabei entschieden werden, für die weder Build-Plan noch
Handbuch einen Wert nennen: Pool-Größe, die drei Timeouts, die Gnadenfrist beim
Herunterfahren, und die Obergrenze für eine einzelne Anfrage.

## Entscheidung

**Die Konfiguration wird einmal beim Start gelesen und vollständig validiert;
der Pool trägt seine Grenzen im Startup-Paket; das Herunterfahren entwässert,
bevor es schließt.**

### Konfiguration

`DATABASE_URL` ist die einzige Variable ohne Default. Alles andere hat einen,
und die Defaults stehen in `api/internal/config`, nicht in `compose.dev.yaml` —
ein leerer Wert im Compose bedeutet „nimm den Default", sodass die Zahlen nur an
einer Stelle existieren.

Der Loader sammelt **alle** Fehler und meldet sie zusammen. Ein Prozess, der beim
ersten fehlenden Wert stirbt, kostet einen Neustart pro Tippfehler.

Zwei Prüfungen sind mehr als Formvalidierung:

- **Der DSN wird mit `pgconn.ParseConfig` gelesen, nicht mit `net/url`.** Das ist
  derselbe Parser, den der Pool benutzt: was die Konfiguration akzeptiert, kann
  der Pool auch öffnen.
- **Ein DSN, der als `timseil_migrate` verbindet, wird abgelehnt.** ADR 0011
  trennt Schema-Eigner und Datenschreiber; solange das nur eine Compose-Konvention
  war, war es eine Bitte. Jetzt ist es eine Eigenschaft des Programms.

### Die Timeout-Kaskade

```
statement_timeout  5 s  <  REQUEST_TIMEOUT 15 s  <  SHUTDOWN_GRACE 20 s  <  stop_grace_period 30 s
```

Die ersten drei prüft `config.Load` beim Start und verweigert sonst den Start.
Nicht als Kommentar, sondern als Regel: jede Verletzung ist ein Weg, einen Server
zu bauen, der Anfragen abschneidet, und alle drei sehen im Code harmlos aus.

Das vierte Glied liegt außerhalb von Go. **Dockers Default für
`stop_grace_period` ist zehn Sekunden — kürzer als unsere Gnadenfrist.** Ohne die
30 Sekunden im Compose bleiben die Shutdown-Tests grün und die Produktion
schneidet trotzdem ab. D2 muss die Zeile wiederholen.

### Der Pool

`MaxConns = 10`, `MinConns = 2`. Die Rechnung: Postgres erlaubt 100 Verbindungen,
drei sind für Superuser reserviert, bleiben 97. Während eines E5-Deploys laufen
zwei Instanzen gleichzeitig — 20 —, dazu `migrate`, `seed` und eine psql-Sitzung,
also rund 26 in der Spitze.

Zehn ist eine **Obergrenze, kein Ziel**. Die Lesepfade sind indizierte
Einzelabfragen; ein größerer Pool verschiebt die Warteschlange nur von der
Anwendung nach Postgres und macht aus einer langsamen Abfrage hundert langsame
Abfragen. `MinConns = 2` hält zwei Verbindungen warm, damit die erste Anfrage
nach einer Leerlaufphase nicht Aufbau und Authentifizierung bezahlt.
`MaxConnLifetimeJitter` ist gesetzt, weil ein Pool, der alle Verbindungen in
derselben Sekunde erneuert, aus einem Routinevorgang eine Latenzspitze macht.

### Die drei Postgres-Timeouts

Sie gehen als `RuntimeParams` ins Startup-Paket, nicht als `SET` nach dem
Verbinden und nicht in den DSN:

| | Wert | Warum |
|---|---|---|
| `statement_timeout` | 5 s | Kein Lesepfad braucht mehr; was fünf Sekunden läuft, ist ein Fehler und darf keinen Pool-Platz halten |
| `lock_timeout` | 2 s | Die App-Rolle macht kein DDL und kann nur auf eine Zeilensperre einer laufenden Migration warten |
| `idle_in_transaction_session_timeout` | 10 s | Weit über jeder legitimen Transaktion hier, eng genug, dass eine vergessene offene Transaktion `migrate` nicht blockiert |

**RuntimeParams statt `AfterConnect`:** sie gelten vor der ersten Abfrage auf
*jeder* Verbindung, auch nach jedem Reconnect, und kosten keinen Roundtrip, der
selbst hängen könnte.

**Zuweisung nach `ParseConfig`, damit der Code gewinnt.** Der DSN ist eine
Zeichenkette, die ein Mensch in einer Deployment-Oberfläche bearbeitet; eine
Betriebsgrenze, die dort lebt, ist nicht überprüfbar und überlebt kein
Copy-Paste. Ein Test hält das fest.

### Graceful Shutdown

Reihenfolge: Signal → `/readyz` sagt 503 → `Shutdown` schließt den Listener und
lässt Laufendes zu Ende → **danach** schließt der Pool.

Zwei Zeilen tragen das Ganze, und beide sehen falsch herum genauso richtig aus:

**`BaseContext` ist `context.Background`, nicht der Signal-Kontext.** Er ist der
Elternteil jedes Request-Kontexts. Wird der Signal-Kontext dort verdrahtet, bricht
SIGTERM sofort jede laufende Anfrage ab — genau der Schnitt, den diese Phase
verspricht nicht zu machen. Es liest sich wie sorgfältige Verkabelung und ist das
Gegenteil.

**Der Pool schließt nach der Entwässerung.** Ein Handler, der noch schreibt, kann
die Datenbank noch brauchen.

Eine abgelaufene Gnadenfrist wird protokolliert, ist aber **kein** Exit-Code ≠ 0:
ein Fehlschlag auf SIGTERM lässt Docker den Container als gescheitert markieren
und kann mitten in einem normalen Rolling Deploy eine Restart-Policy auslösen.

### `/healthz`, `/readyz` und `/api/health`

Drei Pfade, drei Leser, und das ist Absicht:

| Pfad | Leser | Sagt |
|---|---|---|
| `/healthz` | Docker, Traefik | Der Prozess lebt — auch während er entwässert |
| `/readyz` | Startreihenfolge, Proxy | Schick mir Arbeit — nein beim Entwässern und bei toter Datenbank |
| `/api/health` | Deploy-Gate (E4), Badges | Version, SHA, Betriebszahlen |

Die ersten beiden stehen **nicht** im Contract. Sie sind die Schnittstelle des
Orchestrators, tragen keine Daten, und sie zu veröffentlichen hieße, die Welt zum
Pollen einzuladen. Die Paritätsprüfung aus E2 braucht dafür eine Ausnahme für
genau diese zwei Pfade.

## Konsequenzen

- **E5** kann zwei Instanzen gleichzeitig fahren, ohne Anfragen zu verlieren —
  das war die Voraussetzung, die der Build-Plan in Zeile 1132 nennt.
- **D1** setzt Version und SHA per `-ldflags -X` auf `internal/buildinfo`. Ohne
  das antwortet `/api/health` ehrlich `dev` und `unknown`, nie eine erfundene
  Versionsnummer.
- **D2** muss `stop_grace_period: 30s` wiederholen. Ohne die Zeile ist der
  Graceful Shutdown Theater.
- **C2–C7** erben Pool und Timeouts; eine Abfrage, die fünf Sekunden braucht, ist
  ab jetzt ein Fehler mit einer Meldung statt einer hängenden Anfrage.
- `api/.air.toml` bekommt `send_interrupt`, weil air im Dev-Container PID 1 ist
  und den Server sonst hart tötet — der Shutdown wäre Code, der ausschließlich in
  Produktion läuft, und das heißt ungetestet.

### Was das kostet

**Vier Zahlen, die niemand gemessen hat.** Pool-Größe, die drei Timeouts und die
Gnadenfrist sind aus der Topologie abgeleitet, nicht aus Lastdaten — die gibt es
vor dem Launch nicht. Sie sind konfigurierbar, damit die Korrektur später ein
Env-Wert ist und kein Deploy.

**Die Kaskade ist eine Kopplung.** Wer `REQUEST_TIMEOUT` hochsetzt und
`SHUTDOWN_GRACE` vergisst, bekommt keinen Fehler bei der Anfrage, sondern eine
Startverweigerung. Das ist gewollt und beim ersten Mal überraschend.

**Ein vierter Wert liegt außerhalb der Prüfung.** `stop_grace_period` steht im
Compose, und kein Go-Test kann sehen, ob D2 ihn gesetzt hat.

## Verworfene Alternativen

**Timeouts im DSN** — dann stünden Betriebsgrenzen in einem Feld der
Dokploy-Oberfläche, nicht überprüfbar und nicht im Diff.

**`AfterConnect` mit `SET`** — ein Roundtrip pro Verbindung, mit einem Fehlerpfad
nach der Übergabe an den Aufrufer, und bei jedem Reconnect erneut.

**Ein größerer Pool „für alle Fälle"** — verschiebt die Warteschlange nach
Postgres, wo sie teurer ist, und verbraucht Verbindungen, die ein zweites Projekt
auf demselben Host (ADR 0008) noch brauchen wird.

**Ein Fehlschlag beim Ablauf der Gnadenfrist** — würde einen normalen Deploy in
einen gescheiterten Container verwandeln, um ein Problem zu melden, das eine
Logzeile ebenso gut meldet.

**`/healthz` und `/readyz` in den Contract aufnehmen** — sie sind kein Angebot an
den Leser, sondern an den Orchestrator, und `/api/health` beantwortet die Frage,
die ein Mensch tatsächlich stellt.

## Belege

Build-Plan Zeile 1053–1055 (Phase C1), Zeile 1132 (E5 setzt Graceful Shutdown
voraus), Zeile 178–183 (nur `net/http`) · Systemhandbuch Kapitel 27 (Deploy) und
Kapitel 28 · ADR 0005 (Container-Schnitt), ADR 0009 (Fehlermodell und
Cache-Header), ADR 0011 (Rollen) · `api/internal/config`, `api/internal/db`,
`api/cmd/api/main.go`, `api/cmd/api/shutdown_test.go`.
