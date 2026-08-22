# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

**Diese Datei ist öffentlich.** Was über *diesen Host* verrät, wie man ihn
angreift — Adressen, Ports, welche Härtung noch aussteht — gehört nach
`backlog.local.md`, das `.gitignore` fernhält und `check-repo` nicht ins
Repository lässt. Hier steht dann die Aufgabe, nicht der Zustand: „gegen L3
geprüft, Ergebnis nicht hier" ist eine vollständige Notiz für einen Notizblock
und eine unvollständige Wegbeschreibung für jemand anderen.

---

## Wo wir stehen — 22.08.2026, E5b im Labor fertig

**Der Trichter ist zu, im Labor.** Drei Läufe, `110 requests, 110×200` auf `/`
und auf `/api/health`, kein Ausschlag. Grundlinie auf derselben Anlage:
13×`404` auf `/`, 8×`404` auf `/api/health`. Die Zahlen und wie sie zustande
kamen: `docs/runbooks/compose.md`, „Was am 22.08.2026 danach gemessen wurde".

**Wie es zugeht:** zwei Schattendienste (`compose.rollout.yaml`) tragen die
Router, während `api` und `web` neu angelegt werden; die vier Schritte stehen in
`tools/rollout.sh` und laufen auf dem Host in Dokploys Command-Feld, weil
`sanitizeCommand` nur `docker compose`-Glieder in einer Kette zulässt. Dazu zwei
Pausen mit einem Leser — `SHUTDOWN_DELAY` (#65) und, in `web`,
`NEXT_MANUAL_SIG_HANDLE` plus `/healthz`, gelesen von einem
`loadbalancer.healthcheck`. ADR 0035.

**Was noch aussteht:** das Command-Feld im Panel setzen (Runbook 2.3) und die
**Produktionsmessung** — Zeuge **vor** dem Merge starten,
`make witness WITNESS_UNTIL="--until-restart"`. Erst die schließt #143 und #65.

---

## Vorher — nach E5a

**E5a ist gemergt**, in zwei Teilen: [#152](https://github.com/G1NG4R/timseil-dev/pull/152)
(`9dbeae4`) bringt den Zeugen und das Labor, [#153](https://github.com/G1NG4R/timseil-dev/pull/153)
(`6f262e3`) repariert ihn. Produktion läuft `6f262e3`, Deploy 249 s, `ok`.

**Der Trichter ist gegen Produktion gemessen** — 19 Sekunden, 16×404 je Pfad,
keine einzige 5xx. Die Zahlen und die Kreuzprobe gegen die Pipeline stehen
weiter unten unter „Die Produktionsmessung von E5a".

**Das Labor trägt die Reparatur, bevor sie Produktion kostet.** `make rolling-lab`
plus `make witness` reproduziert den Trichter lokal. Dort ist auch gemessen, dass
der Zweizeiler aus dem Bauplan in beiden Hälften falsch ist und welche Folge
stattdessen trägt — `docs/runbooks/compose.md`, Abschnitt „Das rollende Labor".

**Was E5b vorfindet:** die Ausgangszahl in Produktion, die korrigierte
Drei-Schritt-Folge aus dem Labor, und einen Rest-Ausschlag je Dienst, an dem
`SHUTDOWN_DELAY` ([#65](https://github.com/G1NG4R/timseil-dev/issues/65))
bemessen wird. Offen und noch nicht entschieden ist, **wie die Folge den Host
erreicht** — Dokploy besitzt den Deploy (ADR 0033 §2), und der Pipeline-Schlüssel
kann einen Port forwarden und kein Kommando.

---

### Vorher — nach E4b

**E4b ist gemergt** ([#142](https://github.com/G1NG4R/timseil-dev/pull/142), `ae39e04`)
**und hat sich selbst deployt.** Produktion läuft `ae39e04`, `report ok … 226s`,
`make check-deployed` grün.

**Der Rollback ist provoziert** — 13:53 UTC, gegen die echte Produktion.
Deployt `sha-581f5c0`, verifiziert gegen einen Commit, den nie jemand gebaut
hat. Die sechzig Sekunden liefen ab, der Rollback griff, Exit 1, 84 s, keine
Zeile in `deploys`. Bauplan Zeile 1127 ist damit erfüllt. Transkript im
Dokploy-Runbook, Begründung in ADR 0034.

**Der erste Versuch war grün nach drei Sekunden**, und das war der wertvollste
Teil des Tages: nicht der Drill war falsch, sondern der Verify hatte eine Lücke.
Repariert als fünfte Bedingung.

**Gemessen beim ersten Merge mit `needs: [check, db, publish]`:** `db` war 77 s
vor dem Start des Deploys fertig, `check` 57 s, `publish` 3 s. Die neue
Abhängigkeit kostet **null** — jetzt an diesem Graphen gemessen statt aus E4a
übernommen.

---

**Triage nach E4b, 22.08.2026.** 27 Zeilen unter „Gefunden" →
**13 erledigt**, **7 als Issue**, **6 an bestehende Issues oder bewusst
verworfen**, **1 lokal**. Der Abschnitt ist leer.

**Die sieben neuen Issues:**

| Issue | Was |
|---|---|
| [#143](https://github.com/G1NG4R/timseil-dev/issues/143) | Jeder Container-Wechsel liefert zehn Sekunden `404` — beim Drill gemessen, trifft jeden Merge |
| [#144](https://github.com/G1NG4R/timseil-dev/issues/144) | `internal/buildinfo` hat keine Testdatei — und drei Prüfungen lesen aus ihm |
| [#145](https://github.com/G1NG4R/timseil-dev/issues/145) | ~200 alte `rejects` im Selftest können aus dem falschen Grund grün sein |
| [#146](https://github.com/G1NG4R/timseil-dev/issues/146) | „nur 22, 80, 443" stimmt nicht — Regel oder Host muss sich bewegen, vor L3 |
| [#147](https://github.com/G1NG4R/timseil-dev/issues/147) | Der Host trägt mehr als diesen Stack, F2 und ADR 0027 planen anders |
| [#148](https://github.com/G1NG4R/timseil-dev/issues/148) | Dokploy heben, bevor L3 das Panel schließt |
| [#149](https://github.com/G1NG4R/timseil-dev/issues/149) | Ein GHCR-Paket zu verknüpfen hat keinen Klickweg |

**Bewusst verworfen, mit Begründung:**

- **Zwei sachlich falsche Kommentare in `ci.yml`** (aus #112). Die Instanzen sind
  korrigiert. Als *Klasse* — Kommentare driften von dem weg, was sie beschreiben
  — ist es unbegrenzt und kein Issue: `check-adrs`, `check-readme`, `check-env`
  und `check-stack` greifen genau die Fälle, die maschinell prüfbar sind, und
  für den Rest ist ein Ticket eine Absichtserklärung.
- **`gh` kann die GHCR-Versionen nicht lesen.** Umgangen über die Registry-API
  mit anonymem Pull-Token, und die Umgehung ist besser als die direkte Lösung:
  sie misst, was ein Fremder sieht. Preis: Tags ja, Datum und Größe je Version
  nein. `tools/registry.sh` trägt es.
- **227 s stammen aus einem Wiederholungslauf** und **eine zweite Signatur auf
  demselben Digest.** Beides war Kontext, kein Fund. Die zweite Zeile hat sich
  in E4b sogar als falsch herausgestellt — es waren zwei *verschiedene* Digests,
  und daraus wurde die Waise, an der die Aufbewahrungsregel hängt.

**An bestehende Issues gegeben:** die Rotation aus
[#109](https://github.com/G1NG4R/timseil-dev/issues/109) als Kommentar dort;
[#139](https://github.com/G1NG4R/timseil-dev/issues/139) und
[#140](https://github.com/G1NG4R/timseil-dev/issues/140) trugen schon ihre
Zeilen.

**Eine Zeile ist lokal geworden**, nicht öffentlich: die laufende Panel-Version.
Bei einem Panel, das noch von außen erreichbar ist, ist sie eine Wegbeschreibung
zu den passenden Advisories. Öffentlich steht die Aufgabe (#148), der Stand in
`backlog.local.md`. Beim selben Durchgang ist aufgefallen, dass der öffentliche
Backlog die anderen Dienste der Maschine **namentlich** nannte — das ist
korrigiert, aber es steht auf `main` und damit in der Historie; ob das einen
Rewrite rechtfertigt, ist lokal notiert und noch offen.

**Offen, ohne Issue, weil es Ablauf und kein Fund ist:** die Aufbewahrung ist
unscharf. `retention` druckt montags den Plan und löscht nichts. Zwei Wochen
Trockenläufe, dann ein Beweis gegen ein Wegwerf-Paket, dann
`GHCR_PRUNE_ENABLED`. Der Lösch-Pfad ist bis heute **nie ausgeführt worden**.

Vorherige Triage: nach E2, 21.08.2026 — 15 Zeilen → 11 in der Stufe erledigt,
2 als Kommentar an bestehende Issues, 1 bewusst verworfen, 1 als Abnahme offen.

---

## Die Produktionsmessung von E5a — 22.08.2026, 17:17 UTC

Nachgeholt beim Merge von [#153](https://github.com/G1NG4R/timseil-dev/pull/153),
mit `make witness WITNESS_UNTIL="--until-restart"`, **vor** dem Merge gestartet.
Eine Anfrage je Sekunde auf `/` und `/api/health`, von außen über den
öffentlichen Namen, 317 Anfragen je Pfad.

| | `/` | `/api/health` |
|---|---|---|
| `200` | 301 | 299 |
| `404` | **16** | **16** |
| keine Verbindung | — | 2 |
| Sekunden ohne Stichprobe | 8 | 8 |

**Das Fenster: 17:17:44 bis 17:18:02 UTC — neunzehn Sekunden.** Es liegt um den
Moment, in dem der neue Prozess oben war (17:17:51,85), und endet elf Sekunden
danach. Merge 17:13:54, Deploy gemeldet 17:18:06 mit 249 s.

Damit ist der Bauplan-Satz belegt und die Zahl gemessen statt geschätzt: **keine
5xx im Fenster, sondern 404** — die Abnahme, die 5xx zählt, hätte diesen Deploy
durchgewinkt.

Der erste Versuch derselben Messung ging daneben: dreieinhalb Minuten nach dem
Merge gestartet, alles `200`, kein Deploy darin. Das ist repariert (#153) und
der Grund, warum `--until-restart` existiert.

---

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-08-21 | E3b | **`sha-3890180` ist unsigniert und läuft auf dem VPS.** Bewusst in GHCR gelassen: es ist das Rollback-Ziel des laufenden Deploys, und es ist der Beleg dafür, dass die Signatur an einem Zeitpunkt begonnen hat statt behauptet zu werden. Der README benennt es. **Fällig mit E4** — sobald die Pipeline deployt, läuft eine Version, die sie selbst gebaut und signiert hat, und dann darf der alte Tag weg. Vorher nicht. | **erledigt in E4b** — von Hand über die Paket-Oberfläche gelöscht, nicht mit `prune-registry.sh`: dessen Lösch-Pfad war nie ausgeführt worden, und sein Debüt gegen die echte Registry wäre dieselbe Wette gewesen, die der erste Drill an diesem Tag verloren hat |
| 2026-08-21 | E3b | **Vier Werkzeug-Versionen, die kein Dependabot hebt.** `.golangci-lint-version` (E2), `.cosign-image` (E3b) und die Digests von gitleaks (`check-secrets.sh`) und syft (`sbom.sh`). Das Ökosystem `docker` liest Dockerfiles und Compose-Dateien, nicht Hashes in Shell-Skripten oder Textdateien. Bei vier Stellen wäre eine Prüfung billiger als die Disziplin — `check-versions.sh` wäre der Ort. | **erledigt in E4a** — `tools/check-pins.sh`, nicht in `check-versions.sh`: das dort ist ein anderer Vergleich (deklarierte Laufzeit gegen bauendes Image). Zwei Hälften: Form in `make check`, „ist eine neuer?" wöchentlich im `scan`-Job. Die Pins werden über ihre **Form** gefunden, nicht aufgezählt — eine fünfte fällt automatisch darunter |
| 2026-08-21 | E3a | **Kein eigener ADR für diese Stufe** — die nächste freie Nummer bleibt frei. Die Regel, die E3 aufstellt — gültig ist nur eine Signatur, deren `certificate-identity` dieser Workflow auf `refs/heads/main` ist — lebt in den Kopfkommentaren von `tools/sign.sh` und `tools/verify-supply-chain.sh`, nicht in `docs/adr/`. Bewusst so entschieden; die drei ADRs vor diesem kamen jeweils mit ihrer Phase, dieser Bruch gehört benannt. Nebenbei: `check-adrs` verbietet, den Verzicht unter seiner Nummer aufzuschreiben — eine Prüfung, die eine bewusste Lücke nicht von einem toten Verweis unterscheiden kann. | offen |
| 2026-08-21 | E3a | **Sechs Schritte stehen zweimal in `ci.yml`** (`images` und `publish`). Der bezahlte Preis dafür, dass derselbe Job baut, prüft, scannt und veröffentlicht — sonst wäre das signierte Artefakt nicht das geprüfte (ADR 0026). Wird die Datei unübersichtlich, ist ein gemeinsames `make`-Ziel der Weg, keine Reusable Workflow. | bewusst |

## Gefunden — Bug oder Unklarheit

Vorherige Triage: nach E4b, 22.08.2026 — siehe oben.

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-08-22 | E5b | **`web2` erreicht die API über `http://api:8080`, und in Schritt 3 ist `api` kurz weg.** Compose gibt jedem Dienst seinen eigenen Netz-Alias, der Zwilling heißt also `api2` und deckt den Namen `api` nicht mit ab. Solange keine Seite server-seitig aus der API liest, kostet das nichts. **Ab Stufe G kostet es** — dann rendert `web2` in genau dem Fenster, in dem sein Gegenüber neu angelegt wird, und ein Deploy erzeugt 500er statt 404er | offen — **Arbeit von G**, hier nur benannt |
| 2026-08-22 | E5b | **Der Zeuge sieht im Deploy-Fenster zwei Backends und liest `.startedAt` von beiden.** Während Schritt 2 und 3 antworten alter und neuer Container abwechselnd, `--until-restart` sieht also einen Wechsel, sobald der Zwilling oben ist. Das ist hier zufällig richtig — ein neuer Prozess *antwortet* ja — aber die Begründung im Kopf von `witness.sh` beschreibt einen Fall mit genau einem Backend. Nachlesen, ob der Satz noch stimmt, bevor jemand sich darauf verlässt | offen |
| 2026-08-22 | E5b | **Traefiks Docker-Provider registriert `serversTransports`-Labels nicht.** Am Container gesetzt (`docker inspect` zeigt sie), von Traefik ignoriert: jeder Dienst, der auf sie zeigt, antwortet `servers transport not found` und der Router fällt auf 404. Damit ist `forwardingTimeouts.dialTimeout` für uns nicht erreichbar — es lebt nur im Datei- oder KV-Provider, und der gehört Dokploy und wird bei einem Upgrade überschrieben (ADR 0028). Folge: eine Anfrage, die auf die IP eines gerade entfernten Containers trifft, hängt bis zu Traefiks Vorgabe von 30 s, statt schnell zu scheitern — und `retry` kann sie nicht retten, weil sie nie scheitert | **gemessen in E5b**, Labor, 22.08.2026 · umgangen, indem das Backend den Pool verlässt, **bevor** seine IP verschwindet |
| 2026-08-22 | E5b | **Eine Middleware, die an einem Container definiert ist, verschwindet mit ihm — und reißt jeden Router mit, der auf sie zeigt.** Im Labor gesehen: `middleware "timseil-retry@docker" does not exist`, Router in Fehler, 404. Betrifft `timseil-www` seit D3 genauso: sie ist an `web` definiert, und **beide** Router zeigen auf sie. Damit war der 404-Trichter womöglich nicht nur eine Frage der Router-Labels, sondern auch dieser Verweise. Die Zwillinge decken es ab, weil sie dieselben Definitionen tragen — das ist ein zweiter Grund für sie, der beim Entwurf nicht bekannt war | offen — als Begründung in ADR 0035, aber die alte Erklärung des Trichters in #143 ist damit unvollständig |
| 2026-08-22 | E5a | **Der Trichter ist doppelt so breit wie beim Drill, und das ist nicht erklärt.** Die Produktionsmessung mit dem eigenen Werkzeug (unten) hat **19 Sekunden** ergeben, der Drill am selben Tag **9**. Kandidaten: der Drill tauschte nur den Tag, dieser Merge legt `api` und `web` neu an und fährt `migrate` und `seed` dazu; oder der Netzweg dieser Maschine; oder die Drill-Tabelle hatte unbeprobte Sekunden, die sie nicht ausgewiesen hat — die Spalte gab es damals noch nicht. **Für die Fallstudie zählt die größere Zahl**, solange die kleinere nicht erklärt ist | offen — **E5b** misst nach der Reparatur ohnehin neu |
| 2026-08-22 | E5a | **Der Zeuge meldete grün über ein Fenster, in dem kein Deploy vorkam.** Beim Merge von [#152](https://github.com/G1NG4R/timseil-dev/pull/152) um 16:59:53 UTC gestartet — der neue Prozess war seit 16:56:22 oben. `/api/health` nannte den Ziel-Commit schon bei der ersten Stichprobe, und `--until-sha` hielt das für Erfolg. **Dritter Fall derselben Form an einem Tag**, nach dem Drill, der nach drei Sekunden grün war, und nach der Wächtergrenze von heute Nachmittag. Die verpasste Produktionsmessung ist nachzuholen | **erledigt** — `.startedAt` gegen sich selbst, wie `verify-deploy.sh` Bedingung 4; dazu `--until-restart`, das ohne SHA auskommt und deshalb **vor** dem Merge gestartet werden kann |
| 2026-08-22 | E5a | **Der Zweizeiler aus dem Bauplan ist in beiden Hälften falsch — gemessen, nicht mehr vermutet.** `--scale api=2` meldet `Container timseil-api-1 Recreate`: der bestehende Container geht mit runter, der Rollout tut also genau das, was er verhindern soll. Und `--scale api=1` entfernt den **höchsten** Index, also den gerade gestarteten. Bauplan Zeile 1131–1136 und Handbuch Kapitel 26 tragen die Folge wörtlich | **gemessen in E5a**, Labor, 22.08.2026 · Korrektur der beiden Dokumente ist **E5b**, weil erst dort die Folge steht, die sie ersetzt |
| 2026-08-22 | E5a | **Die korrigierte Folge trägt — bis auf einen Ausschlag je Dienst.** `--no-recreate --scale 2` · den alten Container beim Namen entfernen · `--no-recreate --scale 1`. Drei Läufe: **kein einziges `404` mehr**, übrig bleibt eine Anfrage ohne Verbindung auf `/` und eine `502` auf `/api/health`. Das ist die Fehlerart aus [#65](https://github.com/G1NG4R/timseil-dev/issues/65) — der alte Container hört auf anzunehmen, bevor der Proxy ihn aus dem Pool genommen hat. `SHUTDOWN_DELAY` hat damit eine Messung, an der es bemessen werden kann, statt einer geschätzten Zahl | offen — **Arbeit von E5b** |
| 2026-08-22 | E5a | **Die Container-Indizes wandern bei jedem Rollout** (`api-1` → `api-2` → `api-3`). Harmlos für Traefik, das über Labels findet, aber jedes Runbook mit einem festen `timseil-api-1` darin stimmt nach dem ersten Rollout nicht mehr. `docs/runbooks/compose.md` benennt es jetzt, und das Repository ist danach durchsucht: kein Runbook und kein Skript nennt einen festen Container-Namen als Anweisung | **erledigt in E5a** |
| 2026-08-22 | E5a | **`witness.sh` meldete grün, wenn der beobachtete Commit nie erschien.** Erste Fassung: `--until-sha` lief in die Wächtergrenze, druckte eine `!`-Zeile und ging mit `0` heraus — ein Haken über einer Messung, die den falschen Zeitraum erfasst hat. Dieselbe Klasse wie der Drill, der nach drei Sekunden grün war. Beim Schreiben des Selbsttests gefunden, nicht beim Lesen des Codes | **erledigt in E5a** — die Wächtergrenze setzt jetzt Exit 1, und `selftest` beweist beide Richtungen |
| 2026-08-22 | E5a | **Das Labor braucht eine Traefik-Version, und ihre Zuordnung zum Host darf nicht ins Repository.** Ein lokales Traefik-Doppel reproduziert den 404-Trichter ohne Produktions-Merge. Welche Version dort läuft, ist eine Wegbeschreibung zu den passenden Advisories — dieselbe Überlegung wie bei der Panel-Version aus der E4b-Triage. Im Repository steht die gepinnte Version des Labors, nicht der Satz „so läuft es auf dem Host". Zuordnung in `backlog.local.md` | offen |

## Idee — noch nicht entschieden

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
