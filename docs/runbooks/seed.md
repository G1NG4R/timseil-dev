# Runbook — Seed und Stack-Manifest

**Leser:** ich, wenn die Datenbank auf dem VPS leer ist, und ich, wenn ein Track
dazukommt oder eine Belegzeile nicht mehr stimmt.

Zwei Kommandos, ein Manifest, vier Fixture-Sets. ADR 0012 (Manifest), ADR 0013
(Seed), ADR 0003 (die Ableitung, die aus dem Seed die Zustände macht).

---

## Der Alltag

```bash
make seed          # Inhalt einspielen — idempotent, so oft du willst
make check-stack   # jeder stack.yaml-Eintrag löst noch auf
make gen           # stack.gen.json neu schreiben, nachdem stack.yaml sich ändert
make check-db      # Seed- und Fixture-Tests gegen echtes Postgres
```

`make dev` fährt den Seed selbst: `db → migrate → seed → api`. Aus einem leeren
Volume kommt damit eine benutzbare Seite in einem Kommando. `make seed` ist für
danach.

Wie die Migrationen läuft alles **im Docker-Netz** — Postgres veröffentlicht
keinen Port.

---

## Die eine Trennlinie

**Der Seed trägt Inhalt. Messungen trägt er nie.**

| Der Seed schreibt | Der Seed schreibt nicht |
|---|---|
| `systems` · `modules` · `tracks` · `track_evidence` | `ops_checks` · `ops_days` · `incidents` · `deploys` · `metric_snapshots` |

`timseil-dev` ist `live` und zeigt am Tag 1 in jeder Kachel `— NO DATA`. Das
sieht nach einem Fehler aus und ist keiner: es ist am Tag 1 nichts gemessen
worden. Wer hier 91 grüne Zellen einträgt, damit es fertig aussieht, hat
Invariante 1 und 6 in einem Zug gebrochen — und zwar an der Stelle, die die Seite
als Beleg vorzeigt.

`TestSeedWritesNoMeasurements` hält das fest. Wenn dieser Test rot ist, ist nicht
der Test das Problem.

---

## Einen Track hinzufügen

1. Zeile in `api/internal/seed/seed.sql` bei den `tracks`-`VALUES` ergänzen, mit
   Modulnummer und `sort_order`.
2. `Tracks` in `seed.Expected` (`api/internal/seed/seed.go`) um eins erhöhen.
3. Gibt es einen Beleg: Zeile bei den `track_evidence`-`VALUES` ergänzen und
   `Evidence` in `seed.Expected` erhöhen.
4. `make check-db && make seed`

Schritt 2 fühlt sich doppelt an und ist der Wächter: die Belege werden über einen
JOIN auf den Tracknamen eingefügt. Wird ein Name auf nur einer Seite geändert,
fällt eine Belegzeile **lautlos** weg — der Track springt auf der Live-Seite von
`APPLIED` auf `QUEUED`, und nichts schlägt an. Deshalb wird gezählt und bei
Abweichung zurückgerollt.

Die Zustände setzt man nicht. `core` braucht zwei `live`-Systeme, `applied` eins,
`learning` ein `in_build`, sonst `queued`. Das rechnet `v_track_states`.

---

## Ein System hinzufügen

1. Zeile bei den `systems`-`VALUES` in `seed.sql`. Die Quellenachse ist
   entweder-oder: `public` **braucht** `source_url` und **darf kein**
   `source_reason` haben, `private` umgekehrt.
2. Block in `stack.yaml` unter `systems:`. Ohne ihn bricht der Seed ab — ein
   System mit leerem `stack` würde eine leere Stack-Liste rendern, und das sieht
   wie eine Entscheidung aus statt wie das Versehen, das es ist.
3. `Systems` in `seed.Expected` erhöhen.
4. `make gen && make check-db && make seed`

**Ein System löschen ist Handarbeit.** Der Seed löscht keine Systeme, weil
`ops_checks`, `ops_days`, `incidents`, `deploys` und `metric_snapshots` mit
`ON DELETE RESTRICT` auf ihre `id` zeigen. Aus `seed.sql` zu streichen reicht
nicht; die Zeile bleibt liegen und der Seed meldet sie als undeklariert. Zuerst
die Betriebsdaten entscheiden, dann `DELETE FROM systems WHERE slug = …`.

Der Trainingsbaum verhält sich umgekehrt: er wird bei jedem Lauf komplett
ersetzt. Ein Track, der aus `seed.sql` verschwindet, ist nach dem nächsten
`make seed` weg.

---

## `stack.yaml` — die eine Regel

Ein Eintrag zeigt auf eine Datei **dieses** Repos und lässt seine Version dort
lesen, oder er ist ein nackter Name ohne Version. **Eine getippte Version wird
abgelehnt.**

```yaml
- { name: "Next.js", from: "web/package.json", key: "dependencies.next" }  # ✓
- { name: "Python" }                                                       # ✓ kein Repo, keine Version
- { name: "PostgreSQL", version: "18.6" }                                  # ✗ make check-stack lehnt ab
```

Vier Quellarten: `*.json` (Punktpfad), `go.mod` (`go` oder ein Modulpfad),
`compose*.yaml` (Punktpfad, bei `.image` wird der Tag genommen), `.nvmrc`
(ganzer Inhalt). Normalisiert wird auf höchstens zwei Komponenten — `16.3.1` →
`16.3`. Gibt die Quelle nur ein Major her, bleibt es eins.

**Einen Eintrag erst anlegen, wenn seine Quelle existiert.** Traefik, Prometheus,
Loki, Grafana, Alloy und Tailwind fehlen heute genau deshalb. Landet eine davon,
hängt die betreffende Phase ihre Zeile an — die Datei wächst mit dem Stack,
statt ihn zu versprechen.

### Wenn `make check-stack` rot ist

```
  ✗ timseil-dev  Tailwind
    → web/package.json: no key "dependencies.tailwindcss"
```

Die Meldung nennt Datei und Schlüssel. Drei Ursachen, in dieser Häufigkeit:
die Abhängigkeit wurde entfernt · der Schlüsselpfad hat sich verschoben
(`dependencies` → `devDependencies`) · Tippfehler im `key`.

### Wenn `make check` „generated files are stale" sagt

`stack.yaml` oder eine Quelldatei hat sich geändert, `stack.gen.json` nicht.
`make gen` und das Ergebnis mitcommitten. Der Fall, der das rechtfertigt: jemand
zieht `next` hoch, und ohne diesen Wächter zeigt die Seite bis zum nächsten
`make gen` die alte Version — also genau den Fehler, gegen den `stack.yaml`
gebaut ist.

### Warum die Auflösung nicht zur Laufzeit passiert

Ab D2 läuft der Seed aus einem Image, in dem weder `stack.yaml` noch `go.mod`
noch `package.json` liegen. Laufzeit-Auflösung hätte lokal funktioniert und in
Produktion gefehlt. ADR 0012.

---

## Fixture-Sets

`api/internal/fixtures` liefert vier Zustände für Tests:

| Set | Was drin ist |
|---|---|
| `empty` | migriertes Schema, keine Zeile |
| `two-systems` | der echte Seed, sonst nichts |
| `day-one` | Seed + 91 Zellen, alle `nodata` |
| `incident` | 30 Tage gemessen, ein Ausfall mit Post-Mortem, ein `degraded`-Tag ohne, zwei Deploys |

Jedes Set leert zuerst und baut dann von `empty` auf, ist also unabhängig davon,
was der Test davor getan hat.

**Fixtures erreichen Produktion nicht.** `incident.sql` erfindet Sonden, einen
Ausfall und zwei Deploys — in einer Testdatenbank in Ordnung, überall sonst genau
die Lüge, gegen die das Projekt gebaut ist. `boundary_test.go` prüft mit
`go list -deps`, dass **kein** Kommando das Paket erreicht, auch nicht transitiv.
Ein Kommentar könnte das nicht halten.

Zwei Dinge, die man sonst zweimal sucht:

- **Alle Zeitstempel hängen an Mitternacht UTC**, nicht an `current_date`.
  `ops_days.day` ist ein UTC-Datum; wer die Sitzungszeitzone liest, trifft auf
  dieser Maschine und verschiebt sich auf jeder anderen um eine Zelle.
- **`post_slug` der Fixture heißt `001-fixture-outage`** und zeigt auf eine
  MDX-Datei, die es nicht gibt. Der CI-Job aus Stufe E, der Slug gegen Datei
  prüft, muss Fixtures auslassen — sonst verlangt er ein Post-Mortem für einen
  Ausfall, den es nie gab.

---

## In Produktion (ab D2)

Der Seed gehört **nach** die Migration und **vor** den Start der Anwendung, mit
derselben Bedingung wie lokal. Er ist idempotent, läuft also bei jedem Deploy
mit; ein korrigierter Belegtext ist damit ein Deploy und keine Handarbeit an der
Datenbank.

Reihenfolge zählt: der Seed setzt `systems.stack` aus dem eingebetteten Manifest,
und das Image trägt das Manifest, das beim Bauen erzeugt wurde. Ein Rollback auf
ein älteres Image spielt also auch dessen Stack-Angaben zurück — was richtig ist,
weil dieses Image auch die ältere Version läuft.

---

## Nachzählen

```bash
docker compose -f compose.dev.yaml exec db psql -U timseil_boot -d timseil \
  -c "SELECT state, count(*) FROM v_track_states GROUP BY 1 ORDER BY 1" \
  -c "SELECT count(DISTINCT system_id) FROM track_evidence" \
  -c "SELECT slug, state, array_to_string(stack, ' · ') FROM systems ORDER BY system_no" \
  -c "SELECT count(*) FROM metric_snapshots"
```

Erwartet: `applied 13` und `queued 9`, ein belegendes System, `vat-check` ohne
Versionsnummer im Stack, null Snapshots.

**Zu den 9:** Handbuch Kapitel 11, Build-Plan B4, `docs/design/README.md` und das
Homepage-Blatt sagen dort `learning`. Das ist nicht erreichbar — `learning` setzt
ein `in_build`-System voraus, und zum Launch gibt es keins. Die Begründung, warum
die Ableitung gewinnt, steht im Nachtrag von ADR 0003.
