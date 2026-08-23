# ADR 0038 — Das externe Ausfallprotokoll: Datei, Branch, und wer welche Zeile schreiben darf

**Status:** Angenommen
**Datum:** 2026-08-23
**Betrifft:** F4, C4, C7, E4, F10, M1
**Invarianten:** 1 (keine erfundenen Zahlen), 6 (ein Tag ohne Messung ist `nodata`)

## Kontext

Ein Host kann seinen eigenen Ausfall nicht melden. Das ist Kapitel 8 des
Handbuchs und der Grund, aus dem `POST /api/internal/probe` seit C7 überhaupt
existiert — bis F4 gab es aber niemanden, der ihn ruft. `ops roll-up … days: 0`
in jedem Log war der Beleg: das Raster stand vollständig auf `nodata`, und das
war die einzige ehrliche Anzeige.

Das Schema hat diese Phase seit C4 vorgedacht. `ops_checks` trägt `origin`
(`probe` | `backfill`), `source_ref`, das Paar `observed_at`/`recorded_at` und
`ops_checks_backfill_cites_source_ck`. Was fehlte, war die Sonde, die Datei und
der Leser — und drei Fragen, die das Schema offenlässt:

1. **Was steht in der Datei?** Ein Eintrag je fehlgeschlagener Messung wäre
   einzeln bezeugt und kostet bei einem Tagesausfall 288 Commits. Ein Eintrag je
   Zustandswechsel kostet zwei und lässt die Zeilen dazwischen abgeleitet sein.
2. **Wie kommt der Alarm heraus, wenn der Host weg ist?** Grafana läuft auf
   demselben Host und stirbt mit ihm; das ist der Grund, aus dem F10 später
   einen Dead Man's Switch bekommt.
3. **Womit schreibt die Sonde in das Repository?** Bauplan 11.4 verlangt einen
   fein granulierten Token statt „des Standard-`GITHUB_TOKEN` mit
   `contents: write` für alles".

Dazu eine Randbedingung, die den Ton vorgibt: `uptime-log.txt` liegt auf einem
öffentlichen Branch eines öffentlichen Repositories. Alles, was hineingeschrieben
wird, ist veröffentlicht — und F1a hat in `mail/smtp.go` gezeigt, wie eine
Adresse in eine Zeile gerät, über der bereits steht, dass dort keine stehen darf.

## Entscheidung

**Die Datei hält Zustandswechsel, die API expandiert sie, und jede abgeleitete
Zeile weist sich als abgeleitet aus.**

Fünf Festlegungen, die zusammen einen Satz ergeben:

**D1 — Zwei Zeilen je Ausfall.** Die Sonde committet bei einem Wechsel, nicht bei
jeder Messung. `internal/uptime` expandiert das Intervall auf `ops.ProbeInterval`,
**Erholung ausschließlich**: 09:15 → 09:40 sind fünf Zeitpunkte und damit
1500 Sekunden `down_sec`, was der Ausfall war. Jede so entstandene Zeile trägt
`origin='backfill'` und `source_ref` = der Commit, aus dem sie gelesen wurde.

**D2 — Der Alarm ist ein roter Lauf.** Der Lauf, der den Wechsel nach `down`
feststellt, endet non-zero; GitHub verschickt die Mail. Alle weiteren Läufe
desselben Ausfalls enden grün.

**D3 — Gepusht wird mit `GITHUB_TOKEN`, `contents: write` nur im Sonden-Job.**
Bewusste Abweichung von Bauplan 11.4, Begründung unten.

**D4 — „Oben" heißt: `/` antwortet 200 **und** der Bericht kommt an.** Der
Schreibpfad ist die zweite Sonde. Eine `401` oder `400` vom Endpoint ist
ausdrücklich **kein** Ausfall, sondern unsere Fehlkonfiguration: laut abbrechen,
keine Zeile, kein Zustandswechsel.

**D5 — Ein Backfill schreibt ausschließlich `up = false`.** Hart in
`BackfillOpsChecks`, nicht im Aufrufer. Die Datei ist ein *Ausfall*protokoll;
„oben" wird von einer Live-Sonde bezeugt oder von niemandem. Der leere
Anfangszustand ist `up`, also beginnt die Datei leer und ihre erste Zeile ist
der erste echte Ausfall.

Dazu die Grammatik, weil sie das Sicherheitsversprechen trägt: Tab-getrennt,
`observed_at` in UTC mit ganzen Sekunden und literalem `Z`, strikt aufsteigend,
Zustände alternierend, und der Ausfallgrund aus einem **geschlossenen
Vokabular**. Der Parser weist die **ganze Datei** ab, wenn eine Zeile bricht.

## Konsequenzen

**Die Zahl im Raster bleibt nachzählbar, ohne dass jemand uns glauben muss.**
`source_ref` zeigt auf einen Commit, den ein Fremder abrufen kann; die
Expansionsregel steht in `expand.go` und in diesem ADR. Wer nachrechnen will,
braucht zwei Zeilen aus der Datei und eine Multiplikation.

**Die Multiplikation hat jetzt zwei Hälften, die zusammenpassen müssen.**
`ops.ProbeInterval` ist deshalb exportiert und wird an `uptime.New` übergeben,
statt in beiden Paketen zu stehen. Die dritte Hälfte ist der Cron-Ausdruck in
`.github/workflows/probe.yml`; `tools/check-probe-cadence.sh` hält sie zusammen.

**Die Datei wird zweimal gelesen und schadet dabei nicht.** `ON CONFLICT DO
NOTHING` gegen `ops_checks_unique_observation` macht jeden erneuten Lauf frei,
und im Rollout (ADR 0035) laufen zwei Instanzen: die zweite schreibt null Zeilen
und meldet das. `ORDER BY o.observed_at` steht aus demselben Grund im Statement,
aus dem `RollUpOpsDays` vor seinem `ON CONFLICT` sortiert.

**Der Leser braucht kein Geheimnis.** Das Repository ist öffentlich, also wird
unauthentifiziert gelesen. Es gibt keine `UPTIME_TOKEN`-Variable, und das ist die
kleinere Angriffsfläche, nicht die bequemere.

**Eine `ops_days`-Zeile mit `state='outage'` und ohne `incident_id` ist erlaubt.**
Das steht bereits in `00004_operations.sql` und bekommt hier seinen Anwendungsfall:
die Maschine trägt den Ausfall nach, der Mensch schreibt das Post-Mortem danach.
Invariante 4 gilt für die Kerbe, nicht für die Zelle.

### Was das kostet

**Die einzelnen Rasterzeilen sind abgeleitet, nicht einzeln bezeugt.** Bezeugt
sind Anfang, Ende und die Regel dazwischen. Wer die Regel für falsch hält, hält
alle Zeilen dazwischen für falsch — deshalb steht sie hier und nicht in einer
Umgebungsvariablen, wo sie sich ohne Commit ändern ließe.

**GitHubs Cron ist auf Minuten genau, nicht auf Sekunden.** `observed_at` liegt
damit nicht sauber auf einem Raster, und `down_sec` ist auf etwa fünf Minuten
genau. Die Zahl heißt „gemessen", nicht „exakt"; das Runbook sagt es auch.

**Ein Rollout kann eine rote Zelle erzeugen.** In Schritt 3 jedes Rollouts ist
`api` kurz weg (ADR 0035). Die Sonde versucht den Bericht dreimal, bevor daraus
ein `down` wird. Tritt es trotzdem auf, wird an diesem Fenster gedreht — **nicht
an der Zeile**. Ein Drill, der seine eigene Spur wegräumt, hat nicht
stattgefunden; das ist dieselbe Regel, unter der `report-deploy.sh` einen
Rollback meldet.

**Der Alarm hängt an GitHubs Zustellung**, und GitHub schaltet geplante Workflows
nach 60 Tagen Repo-Stille ab. Beides ist bewusst getragen, bis **F10** den
richtigen Alarmpfad baut.

**Die Backfill-Hälfte ist in Produktion nicht abnehmbar, ohne einen Ausfall zu
erzeugen.** Sie ist im Labor und gegen einen echten Postgres abgenommen
(`internal/store/uptime_db_test.go`) und wird in **M1** erneut geführt, wo der
Bauplan sie ohnehin bestellt.

## Verworfene Alternativen

**Eine Zeile je fehlgeschlagenem Lauf.** Jede `ops_checks`-Zeile wäre einzeln
bezeugt, und nichts wäre abgeleitet. Preis: bis zu 288 Commits am Tag auf
`ops-data` während eines Ausfalls, also ein Datenbranch, dessen Historie
unlesbar wird, und eine Sonde, die während einer Störung im Minutentakt gegen
GitHubs API schreibt. Der Gewinn wäre Bezeugung von Zeilen, die zwischen zwei
bezeugten Punkten ohnehin nur einen Wert haben können.

**SMTP direkt aus dem Workflow**, was der Bauplan wörtlich sagt. Verworfen: das
Mail-Passwort läge als Repo-Secret in einem Job, der alle fünf Minuten auf einem
fremden Runner läuft, für ein öffentliches Repository — und der Gewinn wäre eine
Mail mit unserem Wortlaut statt GitHubs. F10 baut den Pfad, der das verdient.

**Ein fein granulierter PAT für `ops-data`**, wie in Bauplan 11.4. Verworfen,
und die Begründung ist die Begründung des Bauplans selbst zu Ende gelesen: dort
steht „nicht der Standard-`GITHUB_TOKEN` mit `contents: write` **für alles**".
Eine Job-scope-Permission leistet genau das — der übrige Workflow steht auf
`contents: read`. GitHubs feine Tokens lassen sich zudem **nicht** auf Branch
oder Datei eingrenzen, dürften also dasselbe wie der eingebaute Token, nur
langlebig und mit einem Ablaufdatum, das jemand im Kalender führen muss. Die
Grenze, die diesen Token einhegt, ist die Branch Protection auf `main`, nicht
sein Scope.

**Den Ausfallgrund aus dem `curl`-Fehlertext übernehmen.** Verworfen aus einem
Vorfall, nicht aus einem Prinzip: `connect to 203.0.113.7 port 443 failed` ist
ein Fehlertext mit einer Adresse darin, und die Datei ist öffentlich. Der Grund
wird deshalb aus dem Exit-Code **abgebildet**, und der Parser kennt dieselbe
Liste — was aus dem Versprechen etwas macht, das von dieser Seite prüfbar ist,
statt von der anderen geglaubt zu werden.

**Die Blob-SHA aus der Contents-API statt des Commits.** Sie wäre in einer
Anfrage statt in zweien zu haben und inhaltsadressiert. Verworfen, weil
`00004_operations.sql` „source_ref then names the commit" sagt und ein Blob
keinen Commit benennt: man kann ihn abrufen, aber nicht datieren und nicht
einordnen.

**Ein offenes `down` bis „jetzt" hochrechnen.** Das würde eine laufende Störung
sofort im Raster zeigen. Verworfen: es wäre eine Zahl, die keine Messung erzeugt
hat, und damit Invariante 1 mit einer Uhr daran. Der nächste Lauf findet die
Erholung und trägt alles nach.

## Belege

- Bauplan Kapitel 8.9 (`ops-data` statt einer Ausnahme in der Branch Protection),
  11.4 (Schreibrechte der Sonde), Zeile 1168 (der Auftrag von F4),
  Zeile 1346 (M1 führt die Backfill-Abnahme erneut), Zeile 1481 (≥ 7 Tage vor Launch)
- Handbuch Kapitel 8 — ein Host kann seinen eigenen Ausfall nicht melden
- ADR 0017 (das 91-Tage-Fenster in SQL), ADR 0019 §6 (die vier Zahlen leben in
  einem Commit), ADR 0023 §8 (`origin` ist keine Angabe des Aufrufers),
  ADR 0035 (zwei Instanzen im Rollout)
- `api/migrations/00004_operations.sql` — `origin`, `source_ref`, das Paar
  `observed_at`/`recorded_at`, `ops_checks_backfill_cites_source_ck`
- `docs/runbooks/ops.md` — woher eine Zeile in `ops_checks` kommt, und die vier Zahlen
