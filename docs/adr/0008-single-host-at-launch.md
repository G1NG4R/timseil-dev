# ADR 0008 — Ein Host zum Launch, Ausfallprotokoll außerhalb

**Status:** Angenommen
**Datum:** 2026-08-17
**Betrifft:** D2, D3, F2, F4, L5, L6
**Invarianten:** 6 (ein Tag ohne Messung ist `nodata`), 7 (91 Tage)

## Kontext

Der ursprüngliche Entwurf sah zwei VPS vor: einen für die Anwendung, einen für
Observability, verbunden über WireGuard. Für **eine** Portfolioseite ist das ein
Host zu viel — Kosten und Betriebsaufwand ohne Gegenwert.

Die Zusammenlegung erzeugt aber zwei Risiken, und das zweite ist das ernstere:

1. **Volle Platte legt die Datenbank lahm.** Loki und Prometheus liegen auf
   derselben Platte wie Postgres.
2. **Stirbt der Host, stirbt die Aufzeichnung mit.** Fällt der Host aus, notiert
   niemand den Ausfall — die Uptime-Zeile zeigt hinterher eine **Lücke** statt
   eines Ausfalls. Auf einer Seite, die Betriebsehrlichkeit zum Argument macht,
   ist das die falsche Art von Lücke.

Dieser ADR trägt beide Hälften, weil sie zusammengehören: die Zusammenlegung
schafft das Problem, das Ausfallprotokoll außerhalb ist die Antwort darauf.

## Entscheidung

**Ein OVH-VPS mit Dokploy zum Launch.** Acht Container in einem Stack:
`proxy`, `web`, `api`, `db`, `alloy`, `prometheus`, `loki`, `grafana`.

**Ein zweiter Host kommt erst, wenn ein zweites Projekt ihn mitträgt.** Dann
trägt er drei Projekte statt eins und wird einmal ordentlich gebaut statt zweimal
halb. Alloy ist schon der Collector — beim Umzug ändert sich nur sein Ziel von
`localhost` auf `remote_write` über den Tunnel.

**Das Ausfallprotokoll lebt außerhalb der eigenen Infrastruktur.** Ein
GitHub-Actions-Probe prüft alle fünf Minuten:

- Host lebt → `POST /api/internal/probe`
- **Zustandswechsel** → ein Commit in `uptime-log.txt` auf dem Datenbranch
  **`ops-data`**

```
2026-09-14T03:11:00Z  down  connect timeout
2026-09-14T03:26:00Z  up    200 in 142ms
```

Nur bei Wechseln — ein paar Zeilen im Monat, nicht 288 Commits am Tag. Kommt der
Host zurück, liest die API die Datei und füllt `ops_checks` rückwirkend auf.

**Warum `ops-data` und nicht `main`:** Branch Protection verbietet Direkt-Commits
auf `main`. Eine Ausnahme für Automatik wäre ein Loch im Riegel. Der Datenbranch
braucht keine.

## Konsequenzen

- **Der Ausfall wird aufgezeichnet, obwohl das aufzeichnende System tot war.**
  Die Aufzeichnung liegt versioniert in Git und ist damit öffentlich prüfbar —
  exakt die These der Seite. Und es braucht keinen dritten Anbieter.
- Abnahme in F4: Host abschalten → Mail kommt an, der Zustandswechsel steht im
  Repo, und nach dem Hochfahren erscheint der Ausfall als **Kerbe im
  Betriebsraster**, nicht als Lücke.
- Der Schreibzugriff des Workflows läuft über einen fein granulierten Token,
  begrenzt auf diese eine Datei — nicht über den Standard-`GITHUB_TOKEN` mit
  `contents: write` für alles.
- Gegen Risiko 1: harte Retention **und** Größen-Limits (ADR 0007),
  Disk-Alert ab 70 %, eigene Volumes für Observability-Daten. Alle persistenten
  Daten als **Docker Named Volumes** — Dokploys Volume-Backups nach S3
  funktionieren nur damit.
- `ops-data` hat **keine gemeinsame Historie** mit `main` und wird nie in beide
  Richtungen gemerged. Das steht im README des Branches.

### Was das kostet

**Der Host ist ein Single Point of Failure, und das bleibt er.** Stirbt er,
ist die Seite weg — nur der Ausfall ist dann sauber dokumentiert. Das ist
ehrlicher, aber nicht verfügbarer.

**Der Actions-Cron ist unter Last ungenau.** Fünf Minuten sind der Anspruch,
nicht die Zusage; GitHub verschiebt Läufe. Die Einschränkung gehört in die
Fallstudie, nicht unter den Teppich.

**Die Auflösung ist grob.** Ein Ausfall unter fünf Minuten wird nicht gesehen.
Bei einem 91-Tage-Raster mit Tagesauflösung ist das vertretbar — aber es ist
eine Aussage über die Messung, keine über die Verfügbarkeit.

## Verworfene Alternativen

**Zwei Hosts von Anfang an** — doppelte Kosten und ein WireGuard-Tunnel zu
betreiben, bevor irgendetwas ihn rechtfertigt. YAGNI korrekt angewendet heißt
nicht „brauche ich nie", sondern „brauche ich noch nicht, und später besser".

**Externer Uptime-Dienst** — löst dasselbe, kostet ein weiteres Konto und
liefert eine Zahl, die niemand prüfen kann. Der Commit in Git kann jeder lesen.

**Probe committet auf `main`** — bräuchte eine Ausnahme in der Branch
Protection und würde die Historie mit Automatik-Commits fluten.

**Kubernetes / k3s** — vier Anwendungscontainer auf einem Host. Kapitel 3.

## Belege

Build-Plan Kapitel 4.1, Kapitel 4.2, Kapitel 8.9, Kapitel 10, Kapitel 11.4,
Phase D2, Phase D3, Phase F4, Anhang D (externe Uhr: F4 braucht ≥ 7 Tage
Vorlauf vor dem Launch).
