# ADR 0034 — Was beweist, dass der Deploy geschehen ist

**Status:** Angenommen
**Datum:** 2026-08-22
**Betrifft:** E4, E5, L3
**Invarianten:** 1 (keine erfundenen Zahlen — auch nicht über das, was gemessen wurde)

## Kontext

E4a hat die Pipeline zu Ende gebaut: Merge → bauen, prüfen, scannen, pushen,
signieren → Tunnel → `IMAGE_TAG` über Dokploys API → sechzig Sekunden gegen die
öffentliche URL → Dauer an `/api/internal/deploy`. ADR 0033 trägt diese
Entscheidung. Der erste Lauf ging durch, `report ok … 227s`.

Vier Dinge blieben danach offen, und sie gehören zusammen, weil sie alle
dieselbe Frage stellen: **woher weiß jemand, dass der Deploy wirklich passiert
ist?**

1. **Der Rollback war nie ausgelöst worden.** Der Bauplan verlangt für E4
   wörtlich „Absichtlich kaputter Healthcheck löst Rollback aus — *einmal
   wirklich provozieren*". Gegen ein Double ist der Pfad gelaufen. ADR 0033 sagt
   in seinen verworfenen Alternativen selbst, warum das nicht reicht: eine
   Logik, die nur ein Merge auslösen kann, probiert man einmal.

2. **Ein grüner Lauf hatte nichts deployt.** Beim ersten Merge fehlte
   `DEPLOY_ENABLED`. Der Job wurde übersprungen, und der *Lauf* schloss mit
   `conclusion: success`. ADR 0033 §8 argumentiert „grau statt grün" — das
   stimmt für den Job und ist falsch für den Lauf, und der Lauf ist, worauf ein
   Mensch sieht. Das ist keine Lücke im Schalter. Ein Schalter kann prinzipiell
   nicht zwischen *bewusst unscharf* und *vergessen* unterscheiden.

3. **Ein Tag zeigte auf andere Bytes, als er einmal zeigte.** Commit `ae939d4`
   wurde zweimal gebaut — `sha256:8a16…` um 11:54:46 UTC, `sha256:1c43…` um
   12:08:59 UTC. Beide tragen `org.opencontainers.image.revision=ae939d4`, und
   `sha-ae939d4` benennt nur den zweiten. Produktion startete um 12:11:55 UTC,
   also auf dem zweiten. Wäre sie früher gestartet, hätte `/api/health`
   weiterhin `ae939d4` gesagt und der Tag hätte aufgelöst — jede SHA-förmige
   Prüfung wäre grün gewesen über Bytes, die unter diesem Namen nie
   veröffentlicht wurden.

4. **Die Abnahme „0 B Build-Cache" misst nichts mehr.** Sie wurde für eine
   Maschine geschrieben, auf der nur dieser Stack läuft. Sie trägt weitere
   Dienste; gemessen 50 Einträge / 782,9 MB, die ihnen gehören.
   Dieselbe Klasse wie „nur 22, 80, 443": ein Kriterium für einen Ein-Zweck-Host
   auf einer geteilten Maschine.

Dazu kommt ein Nebeneffekt von E4a, der ohne Regel gefährlich wird: seit dem
ersten automatischen Deploy wächst GHCR bei jedem Merge, und die VPS-Platte hält
Images nur einen Tag. **GHCR ist der Rollback-Speicher**, und bis hierher hat
nichts darin je etwas gelöscht.

## Entscheidung

### 1. Der Drill trennt Tag und SHA absichtlich, und das ist das schonendste Instrument

`tools/deploy-gate.sh` bekommt eine Naht: `DEPLOY_DRILL=1` deployt einen Build
und verifiziert gegen einen anderen.

Die naheliegende Alternative wäre, wirklich etwas kaputtzumachen — eine
Umgebungsvariable verbiegen, ein Image ohne Healthcheck schieben. Verworfen:
`deploy.sh` schreibt genau eine Zeile der Dokploy-Umgebung, und ein Rollback
setzt genau diese eine Zeile zurück. Eine zweite von Hand verbogene Variable
überlebt den Rollback, und dann ist die Seite unten und das Skript kann es nicht
richten.

Der Drill dagegen liefert die ganze Minute lang einen echten, signierten,
funktionierenden Stand aus. Was fehlschlägt, ist **Bedingung drei aus
ADR 0033 §4** — ist der laufende SHA der Build, den wir bestellt haben. Genau
die Bedingung, die ein Uptime-Check nicht stellt und um derentwillen sie
existiert. Gefahren werden dabei alle Teile, die vorher nur gegen ein Double
liefen: das Ablaufen der sechzig Sekunden, das Merken des vorherigen Tags, der
Rollback-Deploy, die zweite Verifikation, der Exit 1.

Bedingung: das Ziel muss sich vom laufenden Stand nur in Dingen unterscheiden,
die nicht ins Image gehen. Sonst ist der Drill ein echter Versionswechsel.

### 2. Ein Drill schreibt keine Zeile in `deploys`

`report-deploy.sh` berichtet den SHA, der **deployt** wurde. Im Drill ist das
ein Build, der tadellos hochkam. Eine Zeile „dieser Build endete im Rollback"
wäre eine Tatsache, die niemand produziert hat.

Invariante 1 heißt nicht nur „keine Zahl ohne System dahinter", sondern auch
„keine Zahl, die etwas anderes bedeutet, als sie behauptet" — ADR 0033 §6
argumentiert für `DEPLOY_STARTED_AT` bereits genauso. Das Ops-Raster liest
`deploys`; ein Rollback-Balken an einem Tag ohne Rollback ist derselbe Fehler
wie eine erfundene Dauer.

Die echte Messung von Schritt sieben existiert: 22.08.2026, `report ok … 227s`.
Der Drill schuldet sie nicht zweimal. Übersprungen wird sie **laut**, nie still.

**Das Flag und die Ungleichheit bedingen einander, in beide Richtungen.** Tag ≠
SHA ohne Flag wird abgewiesen — das wären zwei Tippfehler, die einen Build
deployen und einen anderen prüfen. Flag ohne Ungleichheit wird ebenso abgewiesen
— eine vergessene Umgebungsvariable würde still den Bericht eines echten
Deploys verschlucken. Beide Hälften weisen ab, bevor irgendetwas gesendet wird,
und `tools/selftest.sh` beweist beide ohne Netz.

### 3. Geprüft wird das Ergebnis, nicht der Mechanismus

`make check-deployed` fragt nicht, ob der Job gelaufen ist. Es fragt, ob in
Produktion läuft, was auf `main` steht. Das fängt jede Ursache, auch die, an die
niemand gedacht hat — der fehlende Schalter war nur die erste.

Neun Behauptungen. Sieben lassen sich von überall machen:

| # | Behauptung |
|---|---|
| 1 | `/api/health` antwortet 200, `status` ist `ok` |
| 2 | `/` antwortet 200 — zwei Container, ein Health-Endpunkt |
| 3 | der laufende SHA ist der Kopf von `main` |
| 4 | die Seite berichtet diesen Deploy selbst (`ops.lastDeploy`, kein `rollback`) |
| 5 | `sha-<S>` löst in GHCR auf — anonym, für beide Images |
| 6 | die Bytes dahinter tragen `revision = S` |
| 7 | die Bytes sind nicht **jünger** als der laufende Prozess |
| 8–9 | der `RepoDigest` der laufenden Container ist genau dieser Digest |

**Behauptung 7 ist die, die den Fall aus dem Kontext von außen sichtbar macht.**
Sind die veröffentlichten Bytes nach `startedAt` entstanden, kann Produktion sie
nicht fahren — der Tag wurde nach dem Deploy neu geschoben. Die Aussage ist
einseitig und wird so formuliert: ältere Bytes sind *stimmig*, nicht bewiesen.

**Behauptung 8 und 9 können nicht von hier gemacht werden.** Der laufende Digest
ist nur auf dem Host sichtbar, und der CI-Schlüssel öffnet einen Port-Forward
und führt keinen Befehl aus (ADR 0033 §1). Statt die Frage stillschweigend
fallenzulassen, benennt das Skript sie, druckt die zwei zu vergleichenden
Digests und sagt, wo man sie stellt. **Eine übersprungene Behauptung ist nie
eine stille.** Dieselbe Haltung wie ADR 0033 §8 sie für den grauen Job
beansprucht — nur diesmal auf der Ebene, auf die man wirklich sieht.

Damit ersetzt `tools/check-deployed.sh --host` die Abnahme „0 B Build-Cache" in
Bauplan Kapitel 10, Anhang C, der Risikotabelle, dem Systemhandbuch und der
D3-Abnahme im Dokploy-Runbook. Dieselbe Behauptung, direkt gemessen statt über
ein Indiz: ein auf dem Host gebautes Image trägt diesen Digest nicht — und
überhaupt keinen `RepoDigest`.

**Die Toleranz ist eine gemessene Zahl und lebt in der API.** Ein Merge, der vor
einer Minute landete, ist legitim noch nicht live. Produktion darf deshalb den
**ersten Elternteil** des Kopfes fahren — einen Schritt, nie zwei —, solange der
Kopf jünger ist als `ops.lastDeploy.durationSec`. Keine Konstante im Skript,
keine im Makefile, keine in YAML: die Pipeline hat die Dauer gemessen und
`report-deploy.sh` hat sie dorthin geschrieben. Invariante 1 zweimal erfüllt —
die Zahl kommt aus einem laufenden System, und sie misst genau das Fenster, für
das sie benutzt wird. Sie ist ausdrücklich **nicht** die sechzig Sekunden aus
`verify-deploy.sh`; das ist das Ende desselben Laufs, nicht der Lauf. Gibt es
keine Zahl, wird keine Toleranz gewährt und keine erfunden. Ein Schritt ist nur
deshalb „der vorherige Zustand von `main`", weil `main` linear ist.

**Wöchentlich, nicht bei jedem Merge.** Auf einem Push nach `main` startet
`scan` neben `publish` und `deploy` — die Prüfung würde nach einem Image fragen,
das noch nicht gepusht ist, und nach einem Deploy, der noch nicht lief. Das ist
das Rennen aus `c738b2a`. Auf einem Pull Request ist die Frage sinnlos. Und
**nicht in `make check`**: eine Prüfung, die Produktion liest, würde einen Merge
am Deploy des vorherigen scheitern lassen, und sie ist rot für jeden Fremden,
der geklont hat und keine Produktion besitzt. `make check` muss auf einem Fork
durchlaufen (ADR 0031 §1).

### 4. Die Aufbewahrungsregel rechnet über Versionen, nicht über Tags

Gemessen am 22.08.2026: **elf Tags je Paket, aber 27 Versionen.** Sechs
Build-Manifeste, ein Build ohne Namen, fünf Referrers-Indizes und **fünfzehn
ungetaggte Sigstore-Bündel** — drei je Index: Signatur, SBOM-Attestierung,
SLSA-Provenance.

Daraus folgen zwei Dinge, die die naheliegende Regel disqualifizieren:

- **`delete-only-untagged-versions`, das Standardrezept, würde jede Signatur in
  dieser Registry vernichten.** Die Bündel sind bauartbedingt ungetaggt. Eine
  Regel über Tags ist hier nicht ungenau, sie ist umgekehrt.
- **GHCRs `/v2/…/referrers/`-Endpunkt antwortet für diese Pakete nichts.** Der
  Fallback-Tag `sha256-<hex>` *ist* der Auffindeweg. Diese eine Version zu
  löschen macht `cosign verify` kaputt für einen Build, dessen Bündel alle noch
  daliegen.

Die Regel: **die letzten zehn Builds je Paket**, nach `created` aus ihrem
eigenen Config-Blob, jeweils mit ihrem Index und allen Manifesten, die er
auflistet. **Nie gelöscht** werden der Build, den Produktion fährt — aus
`/api/health` gelesen, und ohne Antwort wird gar nichts gelöscht —, und jeder
Tag, den `README.md` namentlich nennt. Letzteres wird aus der Datei gelesen
statt gepflegt: der README zeigt auf einen unsignierten Build als Beleg dafür,
dass die Signatur an einem Zeitpunkt begonnen hat, und eine Regel, die den Beleg
löscht, macht die Seite zur Lügnerin. **Zusätzlich gelöscht** wird jede Waise.

Zehn, weil: die Platte hält einen Tag und Dokploys eigene Retention drei bis
fünf, GHCR muss strikt tiefer sein. Und weil **bei zehn der erste scharfe Lauf
ausschließlich die Waise und ihre vier Anhänge trifft** — bei fünf entspräche
das Fenster dem heutigen Bestand und der erste Lauf nähme einen echten,
signierten, referenzierten Build mit. N wird so gewählt, dass der erste Lauf
eines unumkehrbaren Werkzeugs nur Müll anfasst.

**Der Plan braucht kein Geheimnis, das Löschen schon.** Gerechnet wird aus der
öffentlichen Registry-API — ein Fremder kann es nachrechnen, und ein falscher
Plan steht eine Woche im Log, bevor etwas fehlt. Nur `--delete` liest ein Token.
Diese Trennung ist die Sicherheitseigenschaft, nicht die Vorsicht.

**Ein eigener Job mit `packages: write`, nicht ein Schritt in `scan`.** `scan`
läuft auf Pull Requests, und ein Job mit Löschrechten hat auf einem Zweig unter
Review nichts zu suchen — dieselbe Linie, die dieser Datei schon `publish` von
allem anderen trennt.

### 4a. Der Verify verlangt einen **neuen Prozess**, nicht nur den richtigen SHA

Dies ist die Entscheidung, die der Drill erzwungen hat, und sie war nicht
geplant.

Der erste Drill am 22.08.2026 verifizierte gegen den **laufenden** SHA und war
nach drei Sekunden grün, ohne dass ein Rollback stattfand. Der Grund liegt
tiefer als der Aufbau des Drills: **Dokploy antwortet, wenn es den Auftrag
angenommen hat, nicht wenn die Container gewechselt sind.** Das erste Sample von
`verify-deploy.sh` befragt also den *alten* Prozess. Solange der gesuchte SHA
ein anderer ist als der laufende, fällt das nicht auf — der alte Prozess
scheitert an Bedingung drei und die Schleife wartet weiter.

**Fällt beides zusammen, sagt das Gate ja zu einem Deploy, der nicht
stattgefunden hat.** Und das ist kein Drill-Sonderfall: **ein Redeploy desselben
Tags ist genau dieser Fall.** Ein Workflow-Re-Run schiebt `sha-<S>` auf neue
Bytes und deployt erneut; der alte Container meldet `S` beim ersten Sample; die
Pipeline meldet Erfolg, auch wenn die neuen Container nie hochkommen. Dass ein
Re-Run mit neuen Bytes real vorkommt, steht im Kontext dieses Dokuments — er
liegt als Waise in der Registry.

ADR 0033 §4 begründet Bedingung drei damit, dass ein `docker compose up` mit
unveränderter `.env` ein erfolgreicher No-op ist. Der Fall hier ist derselbe
Gedanke eine Ebene tiefer, und er war nicht abgedeckt.

**Die Reparatur vergleicht ein Feld aus einer Quelle mit sich selbst.**
`/api/health` trägt `startedAt`. `deploy-gate.sh` liest es *vor* dem Deploy —
über `verify-deploy.sh --started`, damit die Basis-URL und die Form des
Dokuments in einer Datei definiert bleiben — und der Verify verlangt danach, dass
es sich geändert hat. Kein zweiter Zeitgeber, also kein Zeitversatz, über den
man nachdenken müsste; ein `date` auf dem Runner hätte genau den mitgebracht.

Vor dem Rollback wird der Wert **neu** gelesen, denn dann ist der laufende
Prozess ein anderer.

**Fehlt der Wert, wird die Bedingung nicht gemacht — und das wird gesagt.**
`verify-deploy.sh` ohne `VERIFY_PREVIOUS_START` druckt, dass es einen Redeploy
des bereits laufenden Tags nicht von einem echten Deploy unterscheiden kann.
Stillschweigend auf vier Bedingungen zurückzufallen wäre dieselbe bequeme Lüge,
gegen die dieser ganze ADR geschrieben ist.

### 5. `deploy` hängt an `check` und `db`

`publish` hat kein `needs:` — es baut, prüft, scannt, signiert und pusht in
einem Job (ADR 0026: was geprüft wurde, läuft). Auf einem Push nach `main`
startet es also neben `check` und `db`, und `deploy` hing nur an `publish`. Mit
`strict: false` im Branch-Schutz — bewusst, sonst rebasiert jeder Pull Request
vor dem Merge — trägt der Squash-Commit einen Baum, den `check` in dieser
Zusammensetzung nie gesehen hat. Vor E4 kostete das ein rotes Abzeichen auf
`main`; seit E4 wird es automatisch deployt.

Gemessen kostet die Änderung nichts: `deploy` wartet ohnehin rund drei Minuten
auf `publish`, `check` ist nach 2:16 fertig.

**Die bewusste Folge:** ein rotes `check` auf `main` blockiert ab jetzt den
Deploy. Das ist der Zweck, kein Fehler.

## Konsequenzen

- Der Rollback-Pfad ist gegen die echte Produktion belegt, nicht behauptet. Der
  Beleg ist das Transkript im Dokploy-Runbook, nicht dieser Absatz.
- `make check-deployed` kann rot werden, ohne dass jemand etwas angefasst hat.
  Das ist die Absicht, und es ist der Grund, warum es nicht in `make check` ist.
- Ein Deploy und ein Drill sind ab jetzt zwei unterscheidbare Vorgänge. Wer
  `deploy-gate.sh` liest, sieht in den ersten dreißig Zeilen, welcher gemeint
  ist.
- **Das Versprechen „roll back to any previous deploy" (Issue #90) wird zu „auf
  jeden der letzten zehn".** Wer den alten Satz stehen lässt, lässt eine Zusage
  stehen, die die Regel still gebrochen hat.
- Eine Löschautomatik existiert. Sie ist unscharf, bis `GHCR_PRUNE_ENABLED`
  gesetzt ist, und bis dahin druckt sie jeden Montag denselben Plan. Bewegt der
  sich in einer Woche ohne Merge, ist die Regel falsch — und das sieht man,
  bevor etwas weg ist.
- **`deploys` bleibt die Tabelle, in der jede Zeile ein echter Deploy ist.** Das
  ist die Bedingung, unter der das Ops-Raster überhaupt etwas aussagt.

## Verworfene Alternativen

**Den Digest in `compose.yaml` pinnen** — `IMAGE_DIGEST_API` und
`IMAGE_DIGEST_WEB` neben `IMAGE_TAG`. Damit wäre „laufende Bytes = veröffentlichte
Bytes" strukturell wahr statt geprüft: Docker kann unter einer Digest-Referenz
keine anderen Bytes starten. Verworfen für E4b, nicht grundsätzlich. Es macht
aus der Dokploy-Umgebung drei Zeilen statt einer und bricht damit die Zusicherung
„genau eine `IMAGE_TAG`-Zeile", auf der `deploy-env.sh` steht; und der
Handbetrieb im Runbook würde eine Zwei-Werte-Operation. Ein Issue wert, keine
Stufe.

**Die Signatur in `check-deployed` noch einmal prüfen.** Verworfen:
`make verify-supply-chain` macht diese Behauptung, im selben wöchentlichen Job,
einen Schritt darüber. Zweimal wären zwei Definitionen derselben
Identitätszeichenkette und dreißig Sekunden für eine Antwort, die schon im Log
steht.

**Einen zweiten beschränkten SSH-Schlüssel für CI**, der `docker inspect` darf,
damit auch der wöchentliche Lauf Behauptung 8 und 9 machen kann. Verworfen für
diese Stufe: eine neue Host-Berechtigung, während [#139](https://github.com/G1NG4R/timseil-dev/issues/139)
offen ist, sind zwei Sicherheitsänderungen, die einander verdecken.

**`actions/delete-package-versions`** statt eines eigenen Skripts. Verworfen auf
Fähigkeit, nicht auf Geschmack: sein Auswahlmodell kennt „die neuesten N",
„ungetaggte" und einen Tag-Ausdruck. Es kann nicht ausdrücken „behalte diesen
getaggten Index und diese drei ungetaggten Kinder, weil sie zu einem behaltenen
Build gehören". Seine zwei nächstliegenden Einstellungen sind hier aktiv
schädlich, siehe Entscheidung 4. Dazu die Regel dieser Datei seit E1: nichts in
YAML, was kein Mensch tippen kann — was hier auch heißt, dass die erste scharfe
Löschung von einem Menschen ausgeführt werden kann, der zusieht.

**Den Rollback über `if: failure()`-Schritte in `ci.yml`.** Schon in ADR 0033
verworfen; E4b ist der Beleg dafür, dass die Begründung trug: als Skript ließ
sich der Drill von einem Laptop gegen die Produktion fahren.

## Belege

**Der Drill ist gelaufen — 22.08.2026, 13:53 UTC, gegen die echte Produktion.**
Deployt `sha-581f5c0`, verifiziert gegen `21de41d` (Kopf des Arbeitszweigs, nie
gebaut, nie in GHCR). Die sechzig Sekunden liefen ab, der Rollback auf
`sha-ae939d4` griff, die zweite Verifikation bestätigte einen **neuen** Prozess,
Exit-Code 1, Wanduhr 84 s. `deploys` bekam keine Zeile. Das ungekürzte Transkript
steht in `docs/runbooks/dokploy.md` unter „Der Drill"; hier steht es nicht ein
zweites Mal.

Damit ist Bauplan Zeile 1127 erfüllt: einmal wirklich provoziert.

**Zwei Dinge hat der Drill gefunden, die nicht auf der Liste standen.** Das erste
ist der No-op im Verify, und es ist oben zur Entscheidung 4a geworden. Das
zweite ist eine Messung: ein mitlaufender Zeuge, eine Anfrage je Sekunde auf `/`,
zeigte **je Container-Wechsel rund zehn Sekunden mit `404`** — 19 von 73
Anfragen über beide Wechsel. Nicht 502: der alte Container ist weg, der neue
noch nicht da, und Traefik fällt auf seine Standardantwort zurück. Das trifft
jeden Deploy, nicht nur den Drill.

`verify-deploy.sh` sieht davon nichts, weil es `/` einmal am Ende fragt. **Die
Zusicherung des Gates lautet „der bestellte Build bedient die Seite" und nicht
„kein Besucher hat einen Fehler gesehen".** Nach dieser Messung darf sie auch
nicht so gelesen werden. Die Reparatur — überlappender Start statt Austausch —
ist ein eigenes Thema und gehört nicht in diese Stufe; sie steht im Backlog.

- `tools/deploy-gate.sh` — die Naht, mit der Begründung im Kopf
- `tools/check-deployed.sh`, `tools/registry.sh` — die neun Behauptungen
- `tools/prune-registry.sh` — Plan ohne Geheimnis, Löschen mit
- `tools/verify-deploy.sh` — die fünfte Bedingung und `--started`
- `tools/selftest.sh` — beide Richtungen des Drill-Wächters, die
  Argumentprüfung von `check-deployed`, die Mengenrechnung der
  Aufbewahrungsregel gegen Inventar-Fixtures, und der No-op gegen einen
  Server auf Loopback: derselbe Prozess wird abgelehnt, ein neuer angenommen
- `docs/runbooks/dokploy.md` — 3.5 (die Regel und die gemessenen Zahlen),
  Teil 4 (die ersetzte Abnahme), „Der Drill" unter Rollback (das Transkript)
- ADR 0033 — der Deploy selbst; §8 wird hier korrigiert, nicht zurückgenommen
- Bauplan Zeile 1124–1127 (E4), Kapitel 10, Anhang C; Systemhandbuch Kapitel 25
  und 26
- Issue [#90](https://github.com/G1NG4R/timseil-dev/issues/90) — die zweite
  Hälfte, die GHCR-Aufbewahrung
