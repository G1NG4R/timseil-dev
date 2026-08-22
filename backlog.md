# Backlog

Notizblock zwischen den Sessions. Kein Ticketsystem — am Ende jeder Stufe
wird triagiert und geleert.

**Diese Datei ist öffentlich.** Was über *diesen Host* verrät, wie man ihn
angreift — Adressen, Ports, welche Härtung noch aussteht — gehört nach
`backlog.local.md`, das `.gitignore` fernhält und `check-repo` nicht ins
Repository lässt. Hier steht dann die Aufgabe, nicht der Zustand: „gegen L3
geprüft, Ergebnis nicht hier" ist eine vollständige Notiz für einen Notizblock
und eine unvollständige Wegbeschreibung für jemand anderen.

**Letzte Triage: nach E2, 21.08.2026.** 15 Zeilen → **11 in der Stufe selbst
erledigt**, **2 als Kommentar an bestehende Issues**, **1 bewusst verworfen**,
**1 als Abnahme dieser Phase offen**.

Stufe E2 lief über zwei Pull Requests — E2a (#126, Scanner und Lieferkette),
E2b (Doku-Drift und die Prüfungen aus den Issues) — plus einen Chore-PR (#129),
den die erste Dependabot-Welle nötig gemacht hat.

**Was die Scanner in ihrer ersten Woche gefunden haben**, weil es der Grund für
die Stufe ist und nicht als Fußnote taugt:

| Fund | Wo |
|---|---|
| `DB_MAX_CONNS` über 2³² wurde still auf **10** gekürzt statt abgelehnt | golangci-lint, ADR 0031 §3 |
| `totalContributions` prüfte Unter- und Obergrenze an zwei verschiedenen Orten | dito |
| `mail` verkettete einen Fehler mit `%v` — bricht `errors.Is` | dito |
| Eine CSP-Assertion wäre mit Slice-Bounds paniert statt zu scheitern | dito |
| **7 HIGH/CRITICAL im web-Image**, alle in npms eigenen Bundle-Abhängigkeiten | Trivy, ADR 0031 §9 |
| **21 erreichbare stdlib-Schwachstellen**, weil `go.mod` `1.26.0` sagte und das Image auf `1.26.6` baute | govulncheck, ADR 0031 §Belege |
| Dependabots erste Welle bot drei verbotene Majors an | ADR 0031 §8, PR #129 |
| `go.sum` fehlten **49** Prüfsummen | `go mod tidy -diff`, ADR 0032 §Belege |
| Ein toter ADR-Verweis, zwanzig Minuten alt, von mir | `check-adrs`, ADR 0032 §Was das kostet |

**Die zwei, die an bestehende Issues gingen:**

| Issue | Was dazukam |
|---|---|
| [#112](https://github.com/G1NG4R/timseil-dev/issues/112) | Die OCI-Labels aus E2a veröffentlichen den Backup-Tag jetzt als `image.version` auf **jedem** Image. Vorher eine API-Antwort, ab E4 ein Artefakt in GHCR — **fällig vor E4**, nicht danach |
| [#45](https://github.com/G1NG4R/timseil-dev/issues/45) | Beide Images tragen `org.opencontainers.image.licenses="NOASSERTION"`. Sobald die Lizenzfrage entschieden ist, muss dieser Wert mitwandern, sonst behauptet das Image etwas anderes als das Repo |

**Das eine Verworfene:** der Gedanke, im `db`-Job den Runner-Cache in den
`migrate`-Container zu mounten. Er stand unter der Bedingung „nur wenn der Job
das 5-Minuten-Budget bedroht" — und die Bedingung ist jetzt gemessen und
falsch: `db` läuft in 1:45, die Wall-Clock des ganzen Laufs liegt bei 2:15. Der
Preis wäre eine CI-spezifische Compose-Override-Datei, also ein zweiter Weg in
dieselbe Datenbank, wovor ADR 0030 ausdrücklich warnt.

**Das eine Offene:** der `quickstart`-Job läuft nicht auf Pull Requests und ist
deshalb erst nach dem Merge messbar. Er ist die letzte offene Abnahme dieser
Phase, kein Backlog-Eintrag.

Vorherige Triage: nach L1, 20.08.2026 — 21 Zeilen → 4 Issues (#118–#121),
16 in der Phase erledigt, 1 nach L5 verschoben.

---

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-08-21 | E3b | **`sha-3890180` ist unsigniert und läuft auf dem VPS.** Bewusst in GHCR gelassen: es ist das Rollback-Ziel des laufenden Deploys, und es ist der Beleg dafür, dass die Signatur an einem Zeitpunkt begonnen hat statt behauptet zu werden. Der README benennt es. **Fällig mit E4** — sobald die Pipeline deployt, läuft eine Version, die sie selbst gebaut und signiert hat, und dann darf der alte Tag weg. Vorher nicht. | **E4b** — E4a hat den Deploy gebaut, aber noch keiner ist gelaufen. Der Tag ist in Runbook 3.5 mit gemessen |
| 2026-08-21 | E3b | **Vier Werkzeug-Versionen, die kein Dependabot hebt.** `.golangci-lint-version` (E2), `.cosign-image` (E3b) und die Digests von gitleaks (`check-secrets.sh`) und syft (`sbom.sh`). Das Ökosystem `docker` liest Dockerfiles und Compose-Dateien, nicht Hashes in Shell-Skripten oder Textdateien. Bei vier Stellen wäre eine Prüfung billiger als die Disziplin — `check-versions.sh` wäre der Ort. | **erledigt in E4a** — `tools/check-pins.sh`, nicht in `check-versions.sh`: das dort ist ein anderer Vergleich (deklarierte Laufzeit gegen bauendes Image). Zwei Hälften: Form in `make check`, „ist eine neuer?" wöchentlich im `scan`-Job. Die Pins werden über ihre **Form** gefunden, nicht aufgezählt — eine fünfte fällt automatisch darunter |
| 2026-08-21 | E3a | **Kein eigener ADR für diese Stufe** — die nächste freie Nummer bleibt frei. Die Regel, die E3 aufstellt — gültig ist nur eine Signatur, deren `certificate-identity` dieser Workflow auf `refs/heads/main` ist — lebt in den Kopfkommentaren von `tools/sign.sh` und `tools/verify-supply-chain.sh`, nicht in `docs/adr/`. Bewusst so entschieden; die drei ADRs vor diesem kamen jeweils mit ihrer Phase, dieser Bruch gehört benannt. Nebenbei: `check-adrs` verbietet, den Verzicht unter seiner Nummer aufzuschreiben — eine Prüfung, die eine bewusste Lücke nicht von einem toten Verweis unterscheiden kann. | offen |
| 2026-08-21 | E3a | **Sechs Schritte stehen zweimal in `ci.yml`** (`images` und `publish`). Der bezahlte Preis dafür, dass derselbe Job baut, prüft, scannt und veröffentlicht — sonst wäre das signierte Artefakt nicht das geprüfte (ADR 0026). Wird die Datei unübersichtlich, ist ein gemeinsames `make`-Ziel der Weg, keine Reusable Workflow. | bewusst |

## Gefunden — Bug oder Unklarheit

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
| 2026-08-22 | E3 | **[#109](https://github.com/G1NG4R/timseil-dev/issues/109) im Runbook behoben, auf dem Server nicht.** `docs/runbooks/dokploy.md` verlangt jetzt ein Token mit nur `read:user`, und die Rotation steht als Verfahren daneben. Das Token, das **heute** in Dokploy liegt, trägt weiter `write:packages` — der `api`-Container hat also bis zur Rotation Push-Rechte auf GHCR. Doku und Wirklichkeit stimmen erst überein, wenn Schritt 1–4 aus 0.1 gelaufen sind. | Doku behoben, Rotation offen |
| 2026-08-21 | E3b | **Der Wochenlauf prüfte auf `push` ein Image, das es noch nicht gab.** `scan` und `publish` starten gleichzeitig, also fragte `scan` nach `sha-c738b2a`, während `publish` es eine Spalte weiter gerade hochlud — `MANIFEST_UNKNOWN`, roter Lauf, nichts kaputt. Mein Denkfehler steckte im Kommentar: ich schrieb *„same reasoning as the `quickstart` job"*, aber `quickstart` prüft den Baum und läuft deshalb auf `push`; diese Prüfung braucht ein **veröffentlichtes Artefakt** und kann das frühestens danach. Behoben: nur noch `schedule`. Als Klasse offen — ein Kommentar, der plausibel liest und falsch ist, ist genau der Fund aus #112, und keine Prüfung fängt Prosa über Nebenläufigkeit. | behoben |
| 2026-08-21 | E3a | **Kein Klickweg konnte die GHCR-Paket-Verknüpfung herstellen.** Vier rote `publish`-Läufe, alle an `denied: permission_denied: write_package`. Der Job hatte `Packages: write` (im Setup-Log nachgelesen), der Login gelang, die Pakete waren public, „Manage Actions access" war gesetzt, und die API meldete danach sogar `repo=G1NG4R/timseil-dev` — abgelehnt wurde trotzdem. Geholfen hat erst: Pakete löschen, die Pipeline legt sie neu an; das `image.source`-Label aus E2a verknüpft sie beim Push von allein. Kommt je ein drittes Paket dazu, ist das die Antwort, die man nicht zweimal suchen will. | gelöst, als Klasse offen |
| 2026-08-21 | E3a | **Der syft-Digest bewegt kein Dependabot.** `.github/dependabot.yml` liest Dockerfiles und Compose-Dateien, nicht einen Hash in einer `.sh`. `tools/sbom.sh` und `tools/check-secrets.sh` tragen damit zwei Versionen, die ein Mensch heben muss — dieselbe Klasse wie `.golangci-lint-version` aus E2. Drei Stellen sind der Punkt, an dem eine Prüfung dafür billiger wäre als die Disziplin. | **erledigt in E4a** — `tools/check-pins.sh`. Alle vier waren beim Bau aktuell, gemessen gegen die GitHub-Releases |
| 2026-08-21 | E3a | **`licenses="NOASSERTION"` steht ab jetzt auch im SBOM.** Anschluss an [#45](https://github.com/G1NG4R/timseil-dev/issues/45): das Label war eine Behauptung an einem Image, ab E3b ist es ein Feld in einem signierten Dokument, das jemand herunterladen kann. Die Lizenzfrage wird damit teurer, je später sie beantwortet wird. | als Kommentar an #45 |
| 2026-08-21 | E3a | **[#90](https://github.com/G1NG4R/timseil-dev/issues/90) ist zur Hälfte erledigt.** Der Push kommt aus der Pipeline, die Brücke im Dokploy-Runbook ist abgebaut. Offen bleibt die zweite Hälfte: die GHCR-Aufbewahrung ist ungemessen, und solange sie das ist, hat „roll back to any previous deploy" einen Horizont, den niemand kennt. Bleibt E4. | **gemessen in E4a**, Runbook 3.5: je 8 Tags, 5 Builds, nichts löscht, Wachstum 2 Tags/Merge. Die **Regel** bleibt E4b |
| 2026-08-21 | #112 | **`internal/buildinfo` hat keine Testdatei.** Die Rückfallwerte `dev`/`unknown`, die Reihenfolge der zwei Quellen (ldflags vor Gos VCS-Stempel) und die Kürzung auf sieben Zeichen sind ungeprüft — in einem Paket, dessen Ausgabe auf `/api/health` steht und das gerade eine falsche Angabe veröffentlicht hat. Beim Fix aufgefallen, bewusst nicht mitgenommen, um den PR eng zu halten. | offen |
| 2026-08-21 | #112 | **Zwei Kommentare in `ci.yml` waren sachlich falsch**: sie begründeten die Checkout-Tiefe 1 damit, dass geholte Tags den Backup-Tag mitbrächten — der liegt nur lokal, GitHub hat null Tags. Eine Begründung, die plausibel liest und falsch ist; keine der vier Drift-Prüfungen aus E2 fängt Prosa über Git-Verhalten. | korrigiert im selben PR — als Klasse offen |

| 2026-08-22 | E4a | **Die Dokploy-API war eine Erwartung und ist jetzt gemessen** — v0.30.0, 22.08.2026. Der Weg dorthin war lang und der Grund ist eine Falle, die von außen unsichtbar ist: **ein API-Key ohne `organizationId` in `metadata` ist gültig, `enabled` — und wertlos.** `validateRequest` verifiziert ihn, liest dann `organizationId` aus den Metadaten und gibt gar keine Sitzung zurück; jede Route antwortet `401 {"message":"Unauthorized"}`. Der von Hand über `POST /api/auth/api-key/create` erzeugte Key hatte `metadata: null`; Dokploys eigener Knopf hängt die Organisation an. **Zwei falsche Fährten unterwegs**, beide von mir und beide zu früh „bestätigt" genannt: `canAccessToAPI` (steht auf `f`, kommt in diesem Pfad aber gar nicht vor) und der `Host`-Header (drei Varianten, alle 401). Was schließlich half, war Dokploys Quelltext zu lesen statt Verhalten zu deuten. **Nebenertrag:** `compose.saveEnvironment` statt `compose.update` — engere Eingabe, engere Berechtigung; und `updateCompose` schreibt partiell, vor dem ersten Schreiben geprüft statt danach. | **erledigt** |
| 2026-08-22 | E4a | **`rejects` im Selftest konnte aus dem falschen Grund grün sein.** Jeder Nicht-Null-Exit erfüllt es — auch ein Skript, das gar nicht existiert. Eine gelöschte Prüfung ließ ihren eigenen Test also stehen. Behoben mit `refuses <desc> <pattern> …`, das zusätzlich die erwartete Meldung verlangt, und nachgewiesen: gegen einen erfundenen Dateinamen wird es rot, gegen das echte Skript grün. **Angewandt nur auf die neuen Fälle** — die rund 200 bestehenden `rejects` tragen die Schwäche weiter. | teilweise behoben |
| 2026-08-22 | E4a | **`gh` kann die GHCR-Versionen nicht lesen** — dem Token fehlt `read:packages`, die Packages-API antwortet `403`. Umgangen über die Registry-API mit anonymem Pull-Token, und das ist der bessere Weg: er misst, was ein Fremder sieht, und braucht überhaupt kein Geheimnis. Der Nachteil bleibt benannt: Tags ja, Datum und Größe je Version nein. Für „wie viele Rollback-Ziele gibt es" reicht es. | umgangen, bewusst |
| 2026-08-22 | E4a | **Der Bauplan nennt für E4 `latest` und `v1.2.3`, das Runbook verbietet `latest`.** Ein Widerspruch im eigenen Material, kein Fund im Code. Aufgelöst zugunsten des Runbooks (ADR 0033 §7): Rollback braucht einen Namen, der nicht umgehängt werden kann. `v1.2.3` kommt mit `release-please` in E5. Der Bauplan-Satz steht weiter da. | entschieden, Bauplan ungeändert |

| 2026-08-22 | E4a | **Die Aussage „von außen erreichbar sind 22, 80, 443" gilt für diesen Host so nicht.** Beim Einrichten des Deploy-Zugangs geprüft. `CLAUDE.md` schreibt sie als Sicherheitsregel, der Bauplan macht daraus das Abnahmekriterium von L3 (*„`nmap` von außen zeigt **ausschließlich** 22, 80, 443"*), und `docs/threat-model.md` wird sie übernehmen. **Ein Abnahmekriterium, das der Wirklichkeit widerspricht, wird bei der Abnahme angepasst statt geprüft** — die teure Sorte Drift. Zu entscheiden vor L3 ([#139](https://github.com/G1NG4R/timseil-dev/issues/139)): Regel korrigieren oder Host angleichen. Der `deploy`-Job liest den Port aus `VPS_SSH_PORT`, im Repository steht keine Zahl. | **offen — betrifft CLAUDE.md und L3** |
| 2026-08-22 | E4a | **SSH-Kontoebene gegen L5 geprüft, Ergebnis nicht hier.** L5 verlangt „SSH per Key ohne Passwort, kein Root-Login". Der Ist-Stand wurde am 22.08.2026 erhoben und gehört nicht in ein öffentliches Repository. Relevanz für E4: die Aussage aus ADR 0033, ein kompromittierter GitHub-Account koste einen Deploy und keinen Host, gilt nur für **diesen einen** Weg — sie sagt nichts über andere Wege auf den Host. [#140](https://github.com/G1NG4R/timseil-dev/issues/140). | als Issue #140 |

| 2026-08-22 | E4a | **Die Gegenprobe zum beschränkten Schlüssel war selbst wirkungslos.** Im Runbook stand `ssh -N -L 5432:…` als „muss scheitern". Tut es nicht: `-L` baut nur einen lokalen Lauschsocket, `permitopen` ist serverseitig und greift erst beim Öffnen eines Kanals — der Aufruf bleibt stehen und sieht bestanden aus, auch wenn die Regel gar nicht da wäre. Korrigiert auf `-W host:port`, das den Kanal sofort verlangt. **Dieselbe Klasse wie `rejects` im Selftest**, am selben Tag zum zweiten Mal: eine Prüfung, die im kaputten Fall genauso aussieht wie im guten. Es lohnt, bei jeder neuen Prüfung zu fragen, ob sie den kaputten Fall überhaupt sehen kann. | behoben |

| 2026-08-22 | E4a | **Der Host trägt schon fünf Compose-Apps, nicht eine.** Beim Ablesen der `composeId` mitgesehen: neben `timseil.dev` laufen dort `Grafana + Prometheus`, `CrowdSec`, `Vaultwarden` und `mailrelay`. Zwei Folgen. **F2** plant Prometheus und Loki „im selben Dokploy-Stack" — es gibt aber bereits eine getrennte Metrik-App, und der Bauplan sagt an anderer Stelle „bestehende Grafana-Instanz einbinden". Was davon gilt, gehört vor F2 entschieden, nicht währenddessen. **ADR 0008** („ein Host zum Launch") rechnet außerdem mit acht Diensten; die tatsächliche Belegung der 40-GB-Platte und des RAM ist damit eine andere als die, gegen die die Grenzen in ADR 0027 gesetzt wurden. Ungemessen. | offen, vor F2 |

| 2026-08-22 | E4a | **Panel-Zugang gegen L3 geprüft, Ergebnis nicht hier.** Handbuch 1106 nennt die Dokploy-Oberfläche „das lohnendste Ziel der ganzen Maschine" — sie kennt Host, Deploys und jede Umgebungsvariable jeder App. L3 verlangt: kein Traefik-Router, Port in der Firewall zu, Zugriff nur über `ssh -L`. Der Ist-Stand wurde am 22.08.2026 erhoben und gehört nicht in ein öffentliches Repository. **E4 verschiebt hier nichts**: die Pipeline geht durch den Tunnel, nicht über eine Domain, und ist damit schon auf den L3-Zustand gebaut. [#139](https://github.com/G1NG4R/timseil-dev/issues/139). | als Issue #139 |
| 2026-08-22 | E4a | **`canAccessToAPI` steht per Vorgabe auf `false`** — gemessen: beide `member`-Zeilen `f`. Dokploys Quelltext (`packages/server/src/db/schema/account.ts`, `services/permission.ts`) bestätigt Vorgabe und Wirkung. Ein gültiger, aktiver API-Key antwortet ohne dieses Recht mit `{"message":"Unauthorized"}`, und der Abschnitt „API/CLI" im Profil bleibt unsichtbar. Kostet drei Stunden, wenn man es nicht weiß. **Gehört ins Dokploy-Runbook**, sobald der Weg steht. | zu dokumentieren |
| 2026-08-22 | E4a | **Dokploy läuft auf v0.30.0, aktuell ist v0.30.2** (18.08.2026). Kein bekannter Bezug zu unserem Problem — der API-401 aus Issue #1757 wurde mit PR #1864 am 10.05.2025 behoben, liegt also lange vor v0.30.0. Nur als Stand notiert. | offen |

## Idee — noch nicht entschieden

| Datum | Aus Phase | Was | Status |
|---|---|---|---|
