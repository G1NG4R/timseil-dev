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

## Wo wir stehen — 31.08.2026, der Verify hat einen dritten Ausgang

**Gebaut auf `fix/deploy-gate-403`, `make check` grün, nicht gepusht.** Der
Befund von gestern ist repariert, und zwar an beiden Stellen, an denen er in
jener Nacht zugeschlagen hat.

### Was jetzt gilt

`tools/verify-deploy.sh` kennt drei Ausgänge: `0` live, `1` die Anwendung wurde
erreicht und war es nicht, **`2` die Antwort kam nicht von der Anwendung**. Bei
`401`, `403`, `451` und `429` bricht es bei der ersten Abweisung ab statt sechzig
Sekunden weiterzufragen — gemessen: 0 s statt 60. `500` und der
Verbindungsfehler bleiben in der Warte-Bahn, das ist der Fall, für den das Budget
gebaut wurde.

**Der Contract trägt die Regel, nicht die Erfahrung.** `/api/health` kennt laut
`contract/openapi.yaml` 200, 304, 429 und 500, und jeder Fehler dieses Dienstes
ist ein RFC-9457-Dokument — ein 401, 403 oder 451 dort ist bauartbedingt nicht
unsere Antwort.

`tools/deploy-gate.sh` liest den Code an **beiden** Verify-Aufrufen:

| Lage | Was passiert |
|---|---|
| Verify → 2 | kein Rollback, **keine Zeile in `deploys`**, Exit 1 |
| Verify → 1, Rollback, dann 2 | kein Report, und **nicht** „the site is down" |
| sonst | wie bisher |

Die fehlende Zeile ist Absicht: `ok` und `rollback` wären beide eine Behauptung,
die niemand gemessen hat. ADR 0054.

### Zwei Korrekturen am Plan, beide nachgemessen

- **`/api/health` kann 429 antworten** — er steht im Contract, und der
  Rate-Limiter deckt die Route ab (`chain_test.go:349`). Er endet die Schleife
  trotzdem, bekommt aber eine eigene Meldung statt „not this application's
  answer".
- **`chmod 000` erzeugt keinen 403, sondern 404.** `python3 -m http.server`
  bildet jeden `OSError` beim Öffnen auf `NOT_FOUND` ab. Die Attrappe im
  `selftest` liest den Code stattdessen aus dem Pfad — ein Server für jede Lage.

### Der kaputte Fall, und wie er vorgeführt wurde

Neun Zusicherungen: drei am echten Verify gegen einen echten Server
(403 · 429 · 503), sechs an den fünf Verzweigungen des Gates in einem Sandkasten,
in dem der echte Gate neben Attrappen für seine drei Geschwister steht — das ist
die Naht `here=$(dirname "$0")`, und sie kostet keine sechzig Sekunden.

Drei Mutationen haben belegt, dass sie greifen. **Eine davon war zu schwach und
hat es dabei selbst gezeigt:** sie suchte „the verify was refused", und der
Wortlaut steht auch in der Meldung des Rollback-Pfads — also blieb sie grün, als
die Verzweigung entfernt wurde, die sie bewachen sollte. Sie hängt jetzt an einer
Formulierung, die nur die erste Verzweigung hat.

### Offen

**Produktion steht weiter auf `3479024`, `main` auf `28a2c63`.** Der Deploy nach
dem Merge ist die Abnahme dieser Reparatur: läuft er durch, ist die Lücke zu und
Produktion in Sync. Kommt der 403 wieder, scheitert der Job in Sekunden ohne
Rollback — und das ist das eigentliche Ergebnis.

---

## Vorher — 30.08.2026, der Gate hat einen guten Deploy zurückgerollt

**Die Seite war zu keiner Sekunde unten.** Der `deploy`-Job von `28a2c63` ist
rot, hat den Deploy zurückgerollt und „the site is down" ins Log geschrieben —
und beide Schlüsse waren falsch.

### Was das Log sagt und was gleichzeitig gemessen wurde

```
21:28:07  verify: waiting up to 60s for sha 28a2c63
21:29:07  ✗ 60s elapsed and the deploy did not come up
          last seen: /api/health answered 403
21:29:07  rollback → sha-3479024
21:30:09  ✗ 60s elapsed … last seen: 403
          ✗ THE ROLLBACK DID NOT COME UP EITHER — the site is down
```

Im selben Fenster, von hier aus gemessen:

```
~21:28:5x   deployt: 28a2c63
            /  200 · /work/timseil-dev  200 · /de/…  200 · /work/vat-check  404
```

**Der Deploy war oben.** Der Gate hat ihn weggeräumt, weil *er* ihn nicht sehen
konnte, und der Rollback lief ebenfalls sauber durch, während der Gate ihn für
gescheitert erklärte. Um 21:37 antwortet die Seite auf allen Wegen 200,
`status ok`, uptime 100, p95 17,9 ms.

### Der Befund: ein Nicht-200 ist kein Beleg für einen Ausfall

`tools/verify-deploy.sh:151-153`:

```sh
else
  last="/api/health answered ${code:-nothing}"
fi
```

**Jeder Statuscode, der nicht 200 ist, landet im selben Topf** und wird sechzig
Sekunden lang wiederholt, bevor das Skript „did not come up" sagt. Ein 502 und
ein 403 sind darin nicht zu unterscheiden — und sie bedeuten Gegenteiliges:

| | |
|---|---|
| `000` · `502` · `503` | die Anwendung antwortet nicht — der Deploy ist wirklich nicht oben |
| **`403`** | **jemand vor der Anwendung weist genau diesen Aufrufer ab** — über die Anwendung sagt das nichts |

Auf einen 403 hin zurückzurollen ist die falsche Richtung: der Rollback fragt
denselben Aufrufer noch einmal, bekommt dieselbe Antwort, und das Werkzeug
schließt daraus auf einen Totalausfall. Zwei Deploys, zwei Fehlurteile, aus einem
Statuscode, den niemand gelesen hat.

**Dieselbe Klasse wie der `check-deployed`-Fund von vorhin** — ein Anspruch, der
mehr behauptet, als sein Beleg trägt. Nur kostet dieser einen guten Deploy und
schreibt einen Ausfall in ein Log, das später jemand als Beleg liest.

### Zustand

| | |
|---|---|
| Seite | oben, `3479024`, alles 200, kein Datenverlust |
| `main` | `28a2c63`, **ein Commit voraus** |
| Nicht deployt | #270 — reiner Doku-PR, nichts Sichtbares fehlt |

**Fertig, wenn:** `verify-deploy` einen 403 als eigene Lage behandelt und nicht
als Ausfall — abbrechen mit einer Meldung, die sagt, dass die Antwort nicht von
der Anwendung kam, statt einen laufenden Deploy zurückzurollen. Und der Gate
rollt nur zurück, wenn er die Anwendung wirklich erreicht hat.

**Warum die Ursache des 403 hier nicht steht:** sie ist der Ist-Stand einer
Sicherheitsfrage dieses Hosts. Sie ist untersucht und in den privaten Notizen
festgehalten; hier steht die Aufgabe.

---

## Vorher — 30.08.2026, H1b abgenommen, und die Abnahme hat den Prüfer geprüft

**`3479024`, Merge 20:52 → Deploy fertig 21:00:07Z, 242 s, ok.** Stufe H1 ist
damit vollständig: Seite gebaut, deployt, gegen Produktion abgenommen und
mechanisch gegen den Entwurf abgesichert.

### Der Fund ist diesmal am Prüfwerkzeug

`make check-deployed` meldete acht Ansprüche grün, und einer davon war es aus
dem falschen Grund:

```
  ✓ the site reports that deploy itself: ok, 290s, 2026-08-30T18:52:18Z
```

**Das ist der vorige Deploy.** Sekunden später aus derselben Antwort gelesen:

```json
"lastDeploy": { "at": "2026-08-30T21:00:07Z", "durationSec": 242, "sha": "3479024" }
```

290 s / 18:52 gegen 242 s / 21:00 — der Anspruch hat den Datensatz von #268
gedruckt und für den von #269 gehalten. Die Ursache steht in
`tools/check-deployed.sh:220-222`: gelesen werden `result`, `durationSec` und
`at`. **`sha` steht im selben Objekt und wird nicht gelesen.**

Der Wortlaut behauptet dabei genau das, was nicht geprüft wird — *„the site
reports **that deploy itself**"*. Ein Rennen macht es sichtbar: der Container
läuft, `/api/health.sha` ist schon der neue, und der Deploy-Bericht landet erst
danach. Wer in diesem Fenster misst, bekommt einen grünen Haken über einen
fremden Datensatz.

**Die Reparatur ist ein Vergleich**, und die Zeile darunter wüsste dann auch, ob
sie warten muss. Verwandt mit #243 — dieselbe Datei, dieselbe Klasse: ein
Anspruch, den niemand nachgerechnet hat. **Nicht in dieser Phase repariert**,
`check-deployed` gehört E4b; hier steht der Befund mit seinem Beleg.

### Gegen Produktion abgenommen, 30.08.2026

```
sha 3479024 · v0.16.0-2-g3479024      lastDeploy ok, 242 s, 21:00:07Z
check-deployed  8 Ansprüche, 1 von hier nicht stellbar, beide Images per Digest

e2e gegen https://timseil.dev     259/259     davon sheet + sweep 31/31
```

**Der Durchzug hält unter echten Inhalten.** Lokal misst er einen
Produktionsbuild ohne API — alle Kacheln leer, kürzeste mögliche Seite. Gegen
Produktion misst er dieselbe Seite mit fünf Zahlen, elf Stack-Einträgen und
einem längeren Fließtext, und die Kanten sind dieselben vier: **1080 · 900 ·
720 · 560**. Die Rasterarithmetik hängt nicht am Inhalt.

### Die sichtbare Hälfte, an den drei Breiten nachgemessen

H1b war kein reiner Test-PR — die Constraints-Reparatur ändert das Bild:

```
1440px  flex · JetBrains Mono 11px · rgb(198,209,219)   Platte 380 × 251
1024px  grid · JetBrains Mono 11px · rgb(198,209,219)   Platte 944 × 142
 390px  flex · JetBrains Mono 11px · rgb(198,209,219)   Platte 346 × 251
```

Platte statt nackter Liste, Mono statt Geist, Ink-2 statt Steel, 16px-Spalte für
die Ordinale, keine Haarlinien — und zweispaltig genau zwischen 1080 und 720.
Angesehen, nicht nur gemessen.

### Die Laufzeit über vier CI-Läufe

```
        e2e     check
kalt    2:36    3:50
warm    2:21    3:20
warm    1:50    2:55
warm    2:24    3:38
```

**`e2e` war in keinem Lauf der langsamste Job.** Das PR-Feedback bleibt bei
`check`; der Browser-Cache hat den Download aus der Zahl genommen, und die
vorbereitete Teilung nach Projekten wird nicht gebraucht.

### Was diese Abnahme nicht behauptet

**Der Vergleich sieht weiter keine Farbe.** Geometrie und Typografie, nicht
Malfehler.

**Er deckt eine Seite.** H3 hängt die Startseite an, H6 den Work Index.

**`check-deployed` ist nicht repariert**, nur nachgewiesen.

---

## Idee

- **Abnahmen gegen den lokalen Produktionsbuild fahren**, gegen Produktion nur
  das, was die Abnahme wirklich braucht. Eine Browser-Suite mehrfach gegen
  Produktion zu ziehen ist Verkehr, auf den eine Schutzschicht reagieren darf; ob
  das am 30.08.2026 mitgespielt hat, ist unbewiesen und steht als Verdacht in den
  privaten Notizen. Die Werkzeuglücke ist davon unabhängig und ist zu.
  *(31.08.2026, E4b)*

## Gefunden

- **`check-deployed` liest `ops.lastDeploy.sha` nicht**, obwohl der Anspruch
  „that deploy itself" es behauptet — am 30.08.2026 grün über den Datensatz des
  vorigen Deploys. Ein Vergleich repariert es; die Zeile wüsste dann auch, wann
  sie warten muss. Verwandt mit #243, gehört E4b. *(30.08.2026, H1b-Abnahme)*

---

## Vorher — 30.08.2026, H1b gebaut, und ein Satz im Blatt hat sechs Funde gemacht

**Die Prüfung, die der Bauplan „vor H1 einmalig einrichten" nennt, steht** — in
einer anderen Form als er sie beschreibt, und beide Abweichungen sind
entschieden und begründet. ADR 0053.

### Der Satz, den ich viermal gelesen und dreimal übergangen habe

Im Prüfprotokoll von `Intermediate Widths`, unter der Tabelle:

> Zwischen diesen Breiten wird zusätzlich einmal langsam durchgezogen — von 1440
> bis 390 am Fenstergriff. **Was dabei springt, ohne in dieser Tabelle zu stehen,
> ist ein Fehler.**

Das beschreibt eine Prüfung, die ein Mensch einmal macht, schlecht, und dann nie
wieder. Ein Browser macht sie in vier Sekunden: Fingerabdruck aus neun rein
diskreten Werten, alle 20 px abgetastet, jede gefundene Kante **binär auf das
Pixel eingegrenzt**. Die Kanten müssen `[1080, 900, 720, 560]` sein und sonst
nichts.

### Der erste Lauf war grün, also war er nichts wert

Drei Mutationen:

| | |
|---|---|
| fünfte Media Query bei 1000 | **rot** — Kante bei 1000 gemeldet |
| Kopfhöhen-Schalter entfernt | **rot** — 900 bewegt den Kopf nicht mehr |
| `.rail` überall `static` | **grün** ← der Fund |

**Die dritte ist der eigentliche Fund.** Die Sticky-Rail ganz zu löschen ließ die
Kantenliste unberührt, weil vier andere Bauteile bei 1080 weiter schalten. Der
Durchzug fragt **wo** sich etwas ändert, nicht **was**. Dagegen steht jetzt eine
zweite Tabelle — je Schalter, welche Schlüssel sich bewegen müssen. Sie hat die
Mutation gefangen und mich gleich mit: ich hatte für 720 drei Bauteile
aufgeschrieben, der Browser fand vier. Das vierte war eine Regel, die ich in H1a
selbst geschrieben und vergessen hatte.

### Sechs Abweichungen in einem Bauteil, plus eine bei 1024

Der Blattvergleich lief mit 19 Messungen. Achtzehn grün, eine rot:

```
docs/design/Case Study Template.dc.html:113
  says `grid-template-columns: 16px 1fr`
Expected: "16px"   Received: "26px"
```

Es gibt keinen Grund für 26. Ich habe es nicht gegen 16 entschieden, ich habe nie
nachgesehen. Danach das ganze Bauteil gegen seine drei Blattzeilen gehalten:

| Blatt | Gebaut |
|---|---|
| Platte mit Rahmen und `22px 24px` (110) | keine Platte |
| Ordinalspalte `16px`, `gap:10px` (113) | `26px`, `gap:12px` |
| Mono 11,5/1.55 (112) | Geist 13 |
| Zeilenabstand als `gap:13px` (112) | `padding-block` |
| **keine Linien zwischen den Zeilen** | Haarlinien, erfunden |
| Ink-2 (112) | Steel |
| bei 1024 zweispaltig (Widths 457) | einspaltig bei jeder Breite |

Alle sieben repariert, alle sieben als Einträge im Orakel — damit sie nicht
zurückdriften.

### Das Review hat gefunden, was die Prüfung nicht gefunden hat

**Der Diff gegen `main` gelesen, wie der Bauplan es verlangt** („Code Review auch
solo"), und dabei zwei Dinge gefunden, die alle 258 Zusicherungen durchgelassen
haben:

**1 · Die Zweispalter reichten bis 390 hinunter.** Ich hatte das 1024er-Blatt
gelesen und daraus `max-width: 1079` gemacht. Das mobile Blatt zeichnet die
Constraints **einspaltig** (Template 398) — und ich hatte es nicht aufgeschlagen.
Untere Grenze ist jetzt der 720er-Schalter, und die Begründung stand längst im
Kopf von `layout.css`: „Tabellen einspaltig (zweite Spalte bliebe unter 300)".

**Das Orakel hat den Fall nicht gefangen, weil ich ihn nicht eingetragen hatte.**
Ein Vergleich prüft, was seine Karte nennt. Er findet keine Abweichung an einer
Stelle, nach der niemand gefragt hat — und das ist die Grenze dieser ganzen
Bauart, in einem Satz. Der mobile Eintrag steht jetzt drin.

**2 · Und der Fingerabdruck war an einer Stelle blind.**
`grid-template-columns` behält seinen berechneten Wert auf einem Kasten, der
kein Grid mehr ist. `.cs-constraints` deklariert `1fr 1fr` in einer
`max-width: 1079`-Query und wird bei 720 wieder `flex` — die Spurliste las
darunter weiter `1fr 1fr`, und der Schalter sah aus, als bewege er nichts. Der
Abdruck liest jetzt erst `display`. **Gefunden hat es der Test selbst**, weil die
Reparatur aus Fund 1 ihn rot machte und nicht das war, was ich erwartet hatte.

Beide nachgemutiert: Constraints unter 720 zweispaltig lassen → rot; die
Rail-Mutation von vorhin → weiter rot.

### Was dabei nebenbei korrigiert wurde

**1024 hat sehr wohl eine Zeichnung.** `case-study.spec.ts` behauptet im Kopf,
„fünf der sieben Breiten" hätten keine — das war ein Artboard zu wenig.
`Intermediate Widths` zeichnet die Fallstudie ein drittes Mal bei 1024
(`data-screen-label="Fallstudie 1024"`), und das ist genau der Rahmen mit den
Annotationen zum einspaltigen Umbau. Ohne Zeichnung sind **vier** Breiten:
1081 · 1079 · 899 · 719.

### Gemessen

```
e2e              228 → 259 Zusicherungen        make check grün
Generator        26 Messungen, 6 abweichend, 4 Abweisungen vorgeführt
Durchzug         Kanten 1080 · 900 · 720 · 560, binär auf das Pixel
sheet + sweep    31 Zusicherungen in 11 s
```

Die vier Abweisungen des Generators, vorgeführt statt behauptet: die Karte
behauptet `1fr 420px`, wo die Zeile `1fr 400px` sagt → Abbruch mit beiden Werten;
eine Eigenschaft, die die Zeile nicht trägt → Abbruch mit der Liste, die sie
trägt; eine Abweichung ohne niedergeschriebenen Grund → Abbruch; eine Zeile, die
es nicht gibt → Abbruch.

### Was diese Runde nicht behauptet

**Der Vergleich sieht keine Farbe.** Er misst Geometrie und Typografie; ein
falsch eingefärbtes Bauteil mit richtigen Maßen kommt durch. Dagegen stehen
`check-tokens`, die Zustandssprache und M2.

**Die CI-Laufzeit ist gemessen, und sie war unter meiner Schätzung.** Ich hatte
3:30–4:30 erwartet und damit gerechnet, dass `e2e` der neue kritische Pfad wird.
Erster Lauf, PR #269, **kalter Browser-Cache**:

```
  e2e     2:36        check   3:50
  images  2:10        db      1:55
  codeql  1:03 / 1:09 scan    0:29
```

**`e2e` ist nicht der langsamste Job.** Das PR-Feedback bleibt bei `check` und
damit bei 3:50 — siebzig Sekunden unter E1s Kriterium, und die zweite Zahl
kommt noch herunter, weil dieser Lauf den Chromium erst geladen hat. Die
vorbereitete Teilung nach Projekten wird nicht gebraucht.

**Der Vergleich deckt eine Seite.** Die Startseite hängt H3 an, den Work Index
H6. Generator und Projekt bleiben, jede Phase bringt ihr Blatt mit.

---

## Gefunden

- **`.sec` trägt im Blatt `margin-bottom:38px`**, gebaut ist `--s-34`. 38 liegt
  auf keiner Stufe der Skala; als `spacing-scale`-Abweichung eingetragen. Fällt
  die Skala je auf, ist das der Ort. *(30.08.2026, H1b)*
- **Der Fingerabdruck deckt neun Werte.** Was nicht darin steht, kann still
  aufhören zu schalten — `.cs-note`, `.tile`, die Fußzeile. Erweitern, wenn eine
  H-Phase ein Bauteil bringt, das an einem Schalter hängt. *(30.08.2026, H1b)*
- **`selftest` flackert an `witness.sh`, einmal in fünf Läufen.** „the witness
  accepts a window in which the process restarted (rejected, should accept)",
  einmal rot, danach viermal grün — bei einer Änderung, die nur `backlog.md`
  angefasst hat, also nicht meine. Der Fall ist ein Rennen: ein
  `( sleep 3; schreib )` im Hintergrund gegen `WITNESS_MAX_SEC=20`, und die
  Maschine trug in dem Moment einen Playwright-Lauf. **Nicht repariert, weil ich
  nur die Häufigkeit habe und nicht den Mechanismus** — eine Reparatur nach
  Gefühl an einem Test, der Zeit misst, macht ihn ruhiger und nicht richtiger.
  Kommt es wieder, ist der erste Verdacht `WITNESS_TAIL_SEC=1` gegen eine
  belastete Uhr. Verwandt mit #145, aber die andere Richtung: dort grün aus dem
  falschen Grund, hier rot ohne Grund. *(30.08.2026, H1b)*

---

## Vorher — 30.08.2026, H1a in Produktion, und die Seite war nie leer

**`62cefdb` / `v0.16.0`, Merge 18:23:34Z → Deploy fertig 18:27:55Z, 258 s, ok.**
`make check-deployed`: acht Ansprüche, einer nicht von hier zu stellen. Beide
Images aus `62cefdb`, gegen den Digest geprüft, nicht gegen den Tag.

### Die Abnahme hat das Gegenteil dessen gezeigt, wofür die Seite gebaut ist

Der ganze Entwurf dreht sich um den Leerzustand — fünf Kacheln `— NO DATA` und
eine Amber-Notiz, die erklärt warum. **In Produktion trägt jede Kachel eine
Zahl**, seit dem ersten Aufruf:

```
UPTIME · 91 D   P95      ERROR RATE   DEPLOY · MEDIAN   INCIDENTS
   100.00 %     68.1 MS     0.00 %        246 S             0
   8 of 91 days measured
```

Der Grund ist kein Fehler, sondern die Reihenfolge der Stufen: F5 hat die
Snapshot-Schleife gebaut, die Seite misst sich seit dem 27.08. selbst. Der
Leerzustand ist **der Zustand einer frischen Datenbank**, nicht der von
`timseil.dev` — und `make dev-reset` zeigt ihn jederzeit.

**Die Amber-Notiz ist folgerichtig weg**, und das ist die Zusicherung, die dabei
am meisten wert war: sie steht nur, solange höchstens eine Kachel eine Zahl
trägt. Eine Bildunterschrift, die einen vergangenen Zustand beschreibt, wäre
neben einer gemessenen Zahl gelesen worden wie eine Warnung über sie.

### #208 hat eine echte Zahl bekommen

`100.00 %` steht über `8 of 91 days measured`. Genau die Angabe, die
`docs/slo.md` seit F5 als Text führt und die niemand erreicht hat, der nur auf
die Seite sieht. Gegengeprüft gegen die API im selben Lauf: `window 91`,
`measured 8` — die Seite rechnet nicht, sie zählt.

### Gegen Produktion abgenommen, 30.08.2026

```
status ok · sha 62cefdb · v0.16.0        uptime90d 100 · p95 68,12 ms · errorRate 0

/work/timseil-dev            200     /work/vat-check      404
/de/work/timseil-dev         200     /work/nope           404
/fr/work/timseil-dev         200     /work/UPPER          404
/en/work/timseil-dev         308     /work/..%2fetc       404

api  systemNo 02 · state live · window 91 · stack 11 · days 91 · measured 8
     incidents 0 · deploys 71 · metrics alle vier gesetzt

sitemap   6 locs (/ · /de · /fr · dreimal die Fallstudie), lastmod 2026-08-30
canonical https://timseil.dev/work/timseil-dev        noindex  nein
stale     kein „React Router", kein „PostgreSQL 16"

/ · /de · /fr · /about · /blog · /contact · /privacy · /imprint   200
/healthz · /robots.txt · /feed.xml · /og.png                      200
```

**Geklickt, nicht gelesen.** Das Rig gegen `https://timseil.dev`:
`e2e/case-study.spec.ts` **84/84** über sieben Breiten, dazu axe und
`prefers-reduced-motion` über alle acht Routen **133/133**. Die Rail klebt bei
1081 und ist bei 1079 gelöst, die Kacheln brechen 5 → 3 → 2, die Brotkrume
navigiert, und nach dem Streaming steht von jedem der vier Bereiche genau einer
im Dokument.

**Der 1024er-Umbau steht auch im Bild**, gegen die laufende Seite angesehen: die
Spec-Rail wird zweispaltig statt vierzeilig und der Corner-Bracket schrumpft auf
die Marke oben links — die Annotation des Blattes, wortgleich umgesetzt.

### Was diese Abnahme nicht behauptet

**`DEPLOY · MEDIAN 246 S` über 71 Deploys ist eine Pipeline-Dauer**, nicht die
Dauer eines Deploys — #242, fällig mit H2. Die Kachel druckt, was die API
sendet, und ADR 0052 benennt den Vorbehalt.

**Der Leerzustand ist in Produktion nicht mehr beobachtbar** und war es nie. Er
ist lokal gegen einen frischen Seed abgenommen, und `e2e/case-study.spec.ts`
sichert ihn als Regel statt als Bild zu — deshalb läuft dieselbe Datei gegen die
leere und gegen die volle Seite grün.

**Der Blattvergleich fehlt weiter.** H1b.

---

## Vorher — 30.08.2026, H1a gebaut, und die Blätter waren sich uneinig

**Die erste Inhaltsseite steht.** `/work/timseil-dev`, gebaut aus
`GET /api/systems/{slug}`, und sie zeigt an fünf Stellen `— NO DATA`, weil das
der Zustand ist. Drei seit Stufe G vertagte Entscheidungen sind gefallen:
**#240**, **#208**, **#75**. ADR 0052.

### Der stärkste Fund: die Antwort lag seit sieben Phasen im Stylesheet

`Case Study Template` zeichnet **drei** Metrik-Kacheln, `Case Study 02` zeichnet
**fünf**. Beide Blätter gehören H1, beide sind read-only, und keins ist falsch.

Entschieden hat es nicht ein Quellenrang, sondern `web/styles/layout.css` — in G1
wortgleich aus dem Handoff kopiert und seitdem ausgeliefert:

```css
@media (max-width: 719px) { .ops-tiles { grid-template-columns: repeat(3, minmax(0,1fr)) } }
@media (max-width: 559px) { .ops-tiles { grid-template-columns: repeat(2, minmax(0,1fr)) } }
```

**Fünf → drei → zwei.** Diese zwei Regeln hatten bis zu dieser Phase **keinen
einzigen Konsumenten**, und für eine Dreierreihe sind sie unerreichbar: drei
Spalten auf drei Spalten ist kein Umbruch. Dazu das Register in
`Intermediate Widths` (`5 × 1fr`, 120px je Kachel gerechnet für `— NO DATA`) und
`Consistency Check` K-29. Drei Quellen gegen eine, und die vierte war
ausführbar.

**Die Regel, die daraus folgt und die vorher nicht dastand:** widersprechen sich
zwei Blätter, such das, das ausgeliefert wird. Ein Canvas ist ein Bild einer
Absicht; eine Datei unter `docs/design/code/` ist dieselbe Absicht so
geschrieben, dass ein Browser sie ausführt — und ausführbare Absicht trägt ein
Detail, das ein Bild nicht hat.

### Was der Bau gefunden hat und keine Messung vorher

**Die Route baut ohne `generateStaticParams` gar nicht.** Fünfmal
`usePathname() in a Client Component outside of <Suspense>` plus
`uncached or runtime data during prerendering`. Ohne die Liste baut Next eine
Schale für das Segment `[slug]` selbst, und der Kopf hat keinen Pfad zu lesen.
Zwei Ursachen, zwei Reparaturen: die Slug-Liste aus dem Inhaltsregister, und
vier `<Suspense>`-Grenzen um alles, was `connection()` erreicht.

**Eine gestreamte Seite trägt Fallback und Ersetzung gleichzeitig — und das gilt
für alle vier Bereiche, nicht für einen.** Zuerst bei 390 an der Brotkrume rot
gegangen und dort lokal repariert; **beim ersten Lauf ohne erreichbare API dann
an `.spec`, `.cs-eyebrow` und `.ops-tiles` gleich mit**. Kein Fehler — React
liefert die Ersetzung in einem `<div hidden>` nach und tauscht per Skript.

**Warum es der Lauf ohne API war, ist der eigentliche Punkt:** mit antwortender
API ist das Fenster Millisekunden breit und alle Tests waren grün. Ohne sie ist
es die vollen zwei Sekunden des Zeitbudgets. Ein Test, der grün ist, weil die
Antwort schnell war, prüft die Geschwindigkeit und nicht die Seite.

Jede Prüfung wartet jetzt auf denselben Satz — genau eine Brotkrume —, und
dieselbe Zeile ist die Zusicherung: bliebe eine Kopie stehen, wäre das die Form
von #256.

**Der erste E2E-Entwurf war ein Test über mein Terminal.** Er behauptete fünf
Gedankenstriche und ging rot, weil `reuseExistingServer` meinen Server mit
laufender API aufgriff. Jetzt sichert die Datei **Regeln** zu: eine Kachel ist
genau dann gestrichelt, wenn sie keine Zahl trägt.

**`UPTIME — NO DATA — NO DATA`.** Am laufenden Bild gesehen: ohne Antwort war die
Abdeckungszeile selbst ein Gedankenstrich, zwei untereinander. Jetzt trägt die
Kachel ohne bekanntes Fenster gar keine zweite Zeile — und heißt `UPTIME` statt
`UPTIME · 91 D`, weil 91 der Vorgabewert des Contracts ist und niemand ihn
gesagt hat.

### Gemessen, nicht geschätzt

Bundle, gegen `cbdd9f0` in einem zweiten Worktree gebaut:

```
                main (cbdd9f0)        phase/h1a
  framework     134 097 B, 5 Dateien  134 401 B, 6 Dateien
  our code        9 178 B, 1 Datei      9 178 B, 1 Datei
  total         143 275 B             143 579 B
```

**Die Seite kostet null Byte eigenen Code** — sie bringt kein Client-Bauteil mit,
und #237s Rechnung hält. Der Rahmen bewegt sich um **304 B** und zerfällt in
sechs statt fünf Chunks; das ist Turbopacks Aufteilung, und weiter zuzuordnen
wäre geraten.

E2E: **221 Zusicherungen** über acht Projekte statt 130, axe auf der neuen Route
an allen sieben Breiten grün. `npm test`: 318.

**Vier Suspense-Grenzen sind eine Anfrage, und das ist jetzt gemessen statt
kommentiert.** Produktionsbuild ohne erreichbare API, drei Seitenaufrufe:

```
  /work/timseil-dev   ttfb 9-10 ms   total 2,03 s
  /about              ttfb 8-12 ms   total 2,02 s
  Logzeilen:  3 x /api/systems/{slug}   (nicht 12)
```

`systemCached` wirft im Fehlerfall, speichert also nichts — und trotzdem teilen
sich die vier Grenzen **einen** Upstream-Aufruf je Aufruf der Seite. Die 2,03 s
sind das Zeitbudget des Clients, nicht die Zahl der Grenzen: `/about` mit einer
einzigen Grenze braucht dieselben zwei Sekunden. Der Zeitpunkt des ersten Bytes
zeigt, dass die Schale wirklich statisch ist.

Generator-Abweisungen vorgeführt statt behauptet: Dienst umbenannt →
`✗ compose.yaml has no service api`; `depends_on` im `api`-Block entfernt →
`✗ service api has no depends_on`; `service_healthy` → `service_started` bewegt
die Prüfsumme (`d6204a8d…` → `8789198c…`).

### Was diese Runde nicht behauptet

**Der Blattvergleich fehlt weiter.** Er ist H1b, zusammen mit den Baselines für
die fünf nicht zeichenbaren Breiten und der CI-Verdrahtung von `make e2e`.

**Die Seite ist nicht gegen Produktion abgenommen.** Alles oben ist lokal gegen
einen Produktionsbuild gemessen, teils mit und teils ohne API.

**`DEPLOY · MEDIAN` zeigt eine Zahl, deren Bedeutung offen ist** — #242, fällig
mit H2. Die Kachel druckt, was die API sendet, und ADR 0052 benennt es.

---

## Gefunden

- **`in_build` hat kein Zustandswort**, und H1 hat keins erfunden. Die
  Zustandssprache kennt acht Einträge, `IN BUILD` steht auf dem Work-Index-Blatt
  — H6 gibt ihm Ton, Punktform und Wörterbuchschlüssel. Bis dahin `null`.
  Auslöser für ein Issue in der H-Triage. *(30.08.2026, H1a)*
- **Badge und Fußzeile führen `uptime90d` weiter ohne Abdeckung**, und dort gibt
  es kein `days[]`. Contract-Feld (`Metrics.measuredDays`), das
  `/api/health`, `OpsSummary` und drei Badge-Routen mitträfe — **fällig mit H5**,
  wo die Startseite die Zahl ein zweites Mal zeigt. *(30.08.2026, H1a)*
- **Die README-Entscheidungstabelle endet weiter bei ADR 0029**, jetzt fehlen
  dreiundzwanzig. 0052 allein nachzutragen hätte die Lücke absichtlich aussehen
  lassen; das ist #205. *(30.08.2026, H1a)*
- **`.cs-hero` hat weiter keinen Konsumenten.** `layout.css` trägt zwei
  Hero-Geometrien — 420px mit `align-items: end` (Case Study 02) und 400px mit
  `start` (Vorlage). H1 baut die Vorlage. Zusammenzuführen ist es, wenn H2 die
  zweite Fassung braucht. *(30.08.2026, H1a)*

---

## Vorher — 30.08.2026, sechs PRs durch, und ein Rücklauf, den es nicht gibt

`21706c4 · c6b2f16 · 7b89a15 · ff9e076 · 84dbb3f · 9cd4f87` — #256, #181, #182,
#144, #236, #180. Mit den neun aus der Triage sind das **fünfzehn Issues**, und
die offene Liste steht bei 92 statt 105.

### Der Rücklauf war meine Erfindung, und die Messung hat sie kassiert

Ich habe dreimal geschrieben, die Historie sei nach #180 falsch und brauche einen
Lauf über die 91 Tage — im Backlog, im PR-Text und im Gespräch. **Gemessen gegen
Produktion, nach dem Deploy:**

```
91 Zellen   83 nodata · 8 ok · 0 degraded · 0 outage
Zellen mit downSec > 0:  0
```

**Es hat nie einen Ausfall gegeben.** `down_sec` ist überall null, und null ist
es unter beiden Arithmetiken. Es gab nichts nachzurechnen, und ich hätte das vor
dem ersten Vorschlag messen können statt danach — die Abfrage ist ein `curl`.

**Die Abnahme ist deshalb das Gegenteil dessen, was geplant war:** das Raster
darf sich *nicht* bewegen. Vor und nach dem Deploy dieselben 83/8/0, und
`measuredAt` liegt hinter dem Deploy, die Schleife läuft also mit dem neuen Code.
Wäre eine Zelle gewandert, hätte die neue Arithmetik dort etwas getan, wo sie
nichts zu tun hat.

**Der eigentliche Beweis steht aus und lässt sich nicht herstellen.** Ob eine
Dauer richtig gerechnet wird, zeigt der erste echte Ausfall. Einen zu erzeugen,
damit ein Haken grün wird, ist die falsche Richtung — das sagen #190 und #191
seit F4, und M1 ist der Ort, an dem es ehrlich zusammenkommt.

### Was aus #182 herausgefallen ist

93 Alarme wurden 6, und die sechs sind zum ersten Mal sichtbar statt unter 87
Zeilen Rauschen. Der `critical` darunter — `go/email-injection` im Mail-Pfad —
**ist als Fehlalarm belegt**: Header-Prüfung vor dem Encoding, Body als Base64,
also strukturell unfähig einen Header zu tragen. Die fünf `go/log-injection` hat
niemand angesehen. #264.

### Was heute gemessen wurde und nicht geschätzt

- `-race` kostet auf `main` **33 s** (3m30s gegen 2m57s), lokal 6 → 8 s. Ich
  hatte „knapp eine Minute" geschätzt; das war zu hoch.
- `durationSec` meldete über vier Deploys **238 · 270 · 263 · —** Sekunden, jedes
  Mal weit über dem `deploy`-Job. Dritte und vierte Bestätigung für #242.
- Chakra Petch 400 raus: **89 752 B statt 99 480 B** beim ersten Besuch.

---

## Vorher — 30.08.2026, der Tracker ist einmal ganz gelesen worden

**105 offene Issues, jedes gegen `main` gehalten.** Der Notizblock war seit der
G-Triage leer, also war der Tracker der ganze Zustand — und als Ganzes war er nie
geprüft. Ergebnis: **neun waren erledigt und niemand hatte sie zugemacht**, und
eine der neun war seit zwei Merges repariert.

### Neun geschlossen, und zwei davon anders als sie gestellt waren

| | Warum |
|---|---|
| #235 | in `639e39d` repariert, PR #250 trug kein `Closes` |
| #67 | `tools/check-probe-cadence.sh` läuft in `make check` |
| #115 | ADR 0039 hat es entschieden, F2 hat es gebaut |
| #102 | `ops/prometheus/prometheus.yml` scrapet `timseil-traefik:8082` |
| #94 | in F1b repariert — `web/app/healthz/route.ts` |
| #84 | **Prämisse tot:** `traefik_build_info` existiert nicht, gegen zwei Versionen gemessen |
| #90 | beide Hälften: Push im `publish`-Job, Aufbewahrung in `prune-registry.sh` gemessen |
| #68 | Auslöser trifft nicht zu — `Retry` hat zwei Aufrufer |
| #30 | CI fährt `make check-db` gegen echtes Postgres, bewusst über Compose statt `services:` |

**#30 und #84 sind anders zu als gefragt**, und das steht im Schließkommentar.
Sonst liest der nächste eine erledigte Aufgabe, die so nie erledigt wurde.

### #180 ist repariert, und der Fehler war größer als die Zahl

`down_sec` war fehlgeschlagene Checks **mal** `ProbeInterval`. Die Sonde lief mit
etwa einem Siebtel ihrer erklärten Kadenz, also war jede Ausfalldauer auf dem
öffentlichen Raster um denselben Faktor zu klein — **und zwar zu unseren
Gunsten.** Jetzt trägt eine fehlgeschlagene Prüfung die Lücke bis zur nächsten
Prüfung desselben Tages, und `down_sec` ist die Summe dieser Lücken. ADR 0051.

**Der Fall, der den Entwurf umgeworfen hat, kam beim Schreiben des Tests.** Die
erste Fassung klemmte eine Spanne auf die Tagesgrenze. Das ergibt für eine
einzige fehlgeschlagene Prüfung um 00:00 an einem sonst ungemessenen Tag
**86 400 Sekunden Ausfall in einer Zelle, deren `checks_total` auf 1 steht** —
ein voller Tag, hergeleitet aus einem Blick. Die Spanne fällt jetzt weg statt
geklemmt zu werden, und die Zelle sagt `degraded` ohne Dauer. Das ist die wahre
Aussage, und #208 ist die Frage, die Abdeckung daneben zu zeigen.

### Die Fixture konnte den Fund nicht fangen, und das musste erst auffallen

Die Incident-Fixture sondiert alle 30 Minuten und ihr Roll-up wurde mit 1800
parametrisiert — **alte und neue Arithmetik liefern für sie dieselben Zahlen.**
3600 am Ausfalltag, 1800 am degradierten, beide unverändert. Diese
Übereinstimmung ist der Beleg dafür, dass die neue Form INC-001 trifft, und
zugleich der Grund, warum diese Tests eine Regression nicht fangen könnten.

Der Property-Test war schlimmer: er **zog** die Kadenz als Query-Parameter und
schrieb die Zeilen immer im Minutenabstand. Tausend Fälle, und keiner konnte eine
gefahrene Kadenz von einer erklärten unterscheiden. Jetzt ist die gezogene Zahl
der Abstand der Zeilen selbst.

Mutationstest zum Schluss: die Konstante zurückgesetzt, **zehn Tests rot**, der
Kopf davon mit `down_sec is 300, want 2100`.

### Ein Test wurde durch die Änderung genauer, ohne dass jemand ihn anfasste

`TestALateBackfillMovesTheDayItBelongsTo` schreibt eine fehlgeschlagene Prüfung
auf `:15`, während die Fixture auf der halben Stunde sondiert. Erwartet waren
1800. Richtig sind **900** — die Prüfung um 04:15 wird von der um 04:30
geschlossen. Die alte Anweisung multiplizierte sie mit einem erklärten Intervall
und sagte dreißig Minuten, egal wo die Zeile im Tag lag.

### Gemessen, weil der Kommentar es behauptet hat

52 416 Zeilen über 182 Tage, dieselbe Form, die die Datei schon zitiert:

```
                          ein Tag        182 Tage    Index-Suchen   Sort
ohne Fensterfunktion       0,36 ms         420 ms        182         nein
mit lead()                 0,72 ms         518 ms        182         nein
```

`WindowAgg` sitzt direkt auf dem Index Scan — `ops_checks_unique_observation`
liefert den Tag bereits nach `observed_at` sortiert. Der Alltagsfall verdoppelt
sich und bleibt unter einer Millisekunde, alle fünf Minuten.

### Was diese Runde nicht behauptet

**Die Historie ist noch falsch.** Der Roll-up liest jeden berührten Tag neu, aber
alte Tage fallen nicht mehr in den `lookback`. Ein einmaliger Rücklauf über das
Fenster gehört in die Abnahme, und bis dahin trägt das Raster für alte Zellen die
alte Zahl.

**Der Replay ist einen Schritt kürzer geworden.** Fünf Instanten sind vier
Lücken, weil die Erholung keine Zeile ist (ADR 0038). Exakt würde es wieder,
indem sie eine wird — das ändert ADR 0038 und war nicht diese Aufgabe.

**Die Historie ist noch nicht nachgerechnet.** Der Rücklauf über das Fenster
gehört zur Abnahme dieser Änderung und steht als Erstes an.

### Der Tracker ist gegen die Veröffentlichungsregel gelesen worden

**Das ist der teuerste Fund der Runde, und er stand in keinem Issue, sondern
über allen.** CLAUDE.md verbietet den Ist-Stand einer Sicherheitsfrage dieses
Hosts in allem, was nach außen geht — Issues ausdrücklich eingeschlossen. Vier
Issues aus D3 taten genau das. Das Repository ist öffentlich.

**Vier neu gestellt, vier gelöscht.** #252 bis #255 tragen die Aufgabe und ihr
Abnahmekriterium; der Zustand steht in den privaten Notizen. Die Originale sind
weg, nicht überschrieben — **einen Issue-Text zu ersetzen entfernt ihn nicht**,
GitHub zeigt die Bearbeitungshistorie jedem Leser eines öffentlichen
Repositories. Das ist der Teil, den man beim ersten Hinsehen falsch macht.

Vor dem Löschen geprüft: **kein einziger Verweis** auf die vier, weder im
Repository noch in einem ADR, einem Runbook oder einer anderen Issue. Der Preis,
den diese Entscheidung zu kosten schien, war null.

Die neuen Texte sind gegen die Klasse gegrept, die sie nicht enthalten dürfen —
Pfade, Modi, Ports, Namen von Komponenten. Kein Treffer.

**Was das für die Zukunft ändert:** die Frage vor jedem Backlog-Eintrag —
*nützt das jemandem, der diese Maschine angreifen will?* — gilt wörtlich auch
für jede Issue, und niemand hat sie beim Anlegen gestellt. Sie gehört an
dieselbe Stelle wie beim Notizblock: vor das Schreiben, nicht danach.

## Vorher — 30.08.2026, das Rig hat beim ersten Lauf zwei Funde gemacht

**Das H1-Tor steht, und es hat sofort etwas gefunden, das niemand vermutet hat.**
`make e2e` ist kein `printf` mehr: 130 Zusicherungen über acht Projekte in
1,1 Minuten, Playwright plus axe-core, Chromium.

### #256 — der geschlossene Dialog lag über jeder Seite

`.menu` setzte `display: flex` in der Grundregel. Ein `<dialog>` ohne `open`
bekommt vom Browser `display: none`; das zu überschreiben ließ das
**geschlossene** Menü bei `inset: 0` über dem ganzen Viewport liegen, `z-index`
90, `opacity: 0`. **Ein Element mit Deckkraft null nimmt weiterhin Zeiger-
Ereignisse entgegen.**

```
Breite  geschlossener Dialog  Element in der Seitenmitte  Klick auf WORK
1440    display:flex          div.menu-body               BLOCKIERT
...     dasselbe an allen sieben Breiten
```

Derselbe Klick mit `dialog.menu:not([open]){display:none}` navigiert nach
`/work`. **Die Ursache ist isoliert, nicht erschlossen.** Und sie stand auf der
laufenden Seite — im ausgelieferten Stylesheet von `timseil.dev` nachgelesen.

**Warum es niemand gemerkt hat, ist der eigentliche Fund.** Jede Abnahme bisher
hat Statuscodes, Header und den Inhalt des ausgelieferten Stylesheets gemessen.
**Nichts hat je auf irgendetwas geklickt.** Genau darüber ist #236 geschrieben
worden, und es war das Erste, was aufgeschlagen ist.

`transition: display allow-discrete` stand schon in der Datei — die Reparatur
kostet die Ausblend-Animation deshalb nichts. Die Grundregel auf `flex` zu
setzen hatte den Mechanismus ausgehebelt, für den sie geschrieben war.

### #257 — 11 px für die Maus, 44 px für den Finger

axe fand `target-size` auf jeder Route: die sieben Theme-Plättchen sind
**11 × 11 px bei 8 px Abstand**. Unter `pointer: coarse` sind es **44 × 44** —
`layout.css:92` tut genau das, was CLAUDE.md verlangt.

**Die Lücke ist keine fehlende Regel, sondern eine Regel, die einen Schritt vor
dem Standard aufhört, den sie sonst übertrifft.** WCAG 2.2 AA 2.5.8 kennt keine
Zeiger-Ausnahme und will 24 px; die Abstands-Ausnahme rettet den Fall nicht, weil
sie 24 px zwischen den Mittelpunkten braucht und hier 19 liegen. Zu entscheiden
in M6, und es ist eine Entwurfsfrage, keine CSS-Zeile.

Bis dahin trägt `e2e/a11y.spec.ts` die Regel als benannte Ausnahme **mit Datum** —
dieselbe Form, die `check-vuln` für eine getragene CVE benutzt. Läuft das Datum
ab, wird die Suite von allein rot.

### Zwei Tests waren erst falsch, und beide Male war ich es

**Der Kanarienvogel.** Ein `<dialog>` ohne Stylesheet bekommt `display: none` zu
und `display: block` offen — vom Browser, umsonst. Das sieht einem bestandenen
Ergebnis zum Verwechseln ähnlich, und eine Seite ohne CSS hätte die halbe Datei
grün gemacht. Der Test liest jetzt `--d-glow` als Kanarienvogel — **und
vergleicht die Dauer, nicht die Schreibweise**, weil die erste Fassung `160ms`
festnagelte und gegen einen Build rot ging, der dasselbe als `.16s` ausliefert.

**Die Uhr.** Ich habe `header .clock` verlangt und bei 899, 719 und 390 rot
bekommen — zu Recht: unter der Umschaltbreite ist der Header 52 px aus Wortmarke
und Menüknopf, und die Uhr sitzt in der Fußzeile und im Menü. Der Test war
falsch, nicht das Chrome.

### Gegen Produktion abgenommen, 30.08.2026

`21706c4` / `v0.15.2`, und die Abnahme ist geklickt statt gelesen:

```
Breite  geschl. Dialog  Fläche  Mitte der Seite   Handlung
1440    none            0       div.foot-meta     header link → /work
1081    none            0       div.foot-meta     header link → /work
1079    none            0       div.foot-meta     header link → /work
1024    none            0       div.foot-meta     header link → /work
 899    none            0       footer.foot       menu button → dialog[open]
 719    none            0       span.foot-cell    menu button → dialog[open]
 390    none            0       div.foot-lead     menu button → dialog[open]
```

Dazu die volle Menü-Strecke gegen die laufende Seite, 11 von 11: Sperre auf und
zu, Escape nativ ohne hinterlassene Sperre, ein Link im Menü, Zurück und
Vorwärts, und die Trefferflächen.

**Die drei Zahlen, die dabei nebenbei anfielen:** `durationSec` meldete 238 s,
dann 270 s, dann 263 s — dreimal derselbe Abstand zum tatsächlichen `deploy`-Job.
Kein neuer Fund, aber die dritte Bestätigung für #242.

### Was der Lauf noch beweist

`hasTouch: true` liefert wirklich `pointer: coarse` und `hover: none` —
**gemessen, bevor irgendetwas darauf gebaut wurde.** Der Zeiger ist eine eigene
Dimension und keine Folge der Breite; ein schmales Desktop-Fenster ist kein
Telefon.

Das Rig läuft gegen einen **Produktions-Build**. `next dev` hydriert seit #235
wieder, aber `cacheComponents` hält Routen nur in Produktion montiert — die
`<Activity>`-Frage lässt sich einem Entwicklungsserver nicht stellen.

### Was diese Runde nicht behauptet

**Das Rig hängt nicht in CI.** Es lädt einen Browser und baut die Anwendung; die
Verdrahtung ist eine Entscheidung über Runner-Zeit und gehört zu H1, wo der
Blattvergleich ihr etwas zu verdienen gibt.

**Der Blattvergleich fehlt.** Der Bauplan will Playwright gegen `make design`;
solange Stufe H keine Seite gebaut hat, gäbe es nichts zu vergleichen.

**axe ist nicht M2.** Es findet einen Bruchteil dessen, was ein Audit findet.

## Vorher — 29.08.2026, das Budget hat eine Vorschrift und zwei Zahlen

**#237 ist nicht repariert worden, weil nichts kaputt war — es ist ausgerechnet
worden.** `tools/bundle-size.sh` und ADR 0050; das CI-Gate bleibt bei L8.

```
make bundle-size          gegen d70927b
  framework     134097 B  5 files — watched, never budgeted
  our code        9178 B  1 file
  ✓ our code   9178 B of 15903 B (6725 B left)
  ✓ total      143275 B of 150000 B (6725 B left)
```

### Der Bauplan sagte, wie hoch — nicht, wie zu messen

Zeile 1339 nennt „Initial JS < 150 KB gzip" und ist die einzige Stelle, die die
Zahl führt. Welche Route, welches gzip, ob das `noModule`-Polyfill zählt: nichts
davon stand irgendwo. Eine Zahl ohne Messvorschrift ist in CI ein Streit, kein
Gate. Die Vorschrift steht jetzt in ADR 0050 und ist als Datei ausführbar.

### Eine Seite kostet nichts — meine eigene Behauptung war falsch

Der erste Entwurf von #237 sagte „Stufe H baut dreizehn Seiten hinein". **Stimmt
nicht.** Die sechs Chunks sind für alle sieben Routen **identisch** — Layout-Chrome,
kein Seiten-Code. Eine Seite kostet null, solange sie kein neues Client-Bauteil
mitbringt. Der Issue ist korrigiert.

**Die richtige Zahl ist dafür unangenehmer.** 134 097 B sind Rahmen. Es bleiben
**6 725 B** für Terminal (J1/J2), 404-Spiel (H10), Contribution-Graph (H4),
Filter-Chips (H6), Trajectory-Rail (H7) und Kontaktformular (H8) — sechs deutlich
reichere Bauteile in zwei Dritteln dessen, was sieben einfache gekostet haben.
Das ist eine Schätzung und steht als solche im ADR; wenn Stufe H zeigt, dass es
nicht reicht, ist das ein Fund mit Zahlen und wird dort neu entschieden.

### Warum zwei Zahlen, und der Beleg dafür

Eine gemeinsame Grenze ist in beide Richtungen blind: sie geht rot für ein
Next-Release, das niemand hier geschrieben hat, und bleibt grün, während unser
Anteil sich verdoppelt, solange der Rahmen gerade schrumpft.

**Vorgeführt statt behauptet:** mit `BUDGET_OWN` testweise auf 9 000 meldet das
Werkzeug `✗ our code 9178 B of 9000 B` und **gleichzeitig**
`✓ total 143275 B of 150000 B`, Exit 1. Die Summe hätte den Fall nicht gefunden.

Die 15 903 sind einmal aus `150 000 − 134 097` gerechnet und **fest**, nicht bei
jedem Lauf neu abgeleitet — sonst ließe ein Next-Update unser Budget still
wachsen oder schrumpfen, also genau die Kopplung, die der Schnitt beseitigt.

### Der Fund am Werkzeug selbst

Der erste Lauf war rot: `✗ static/chunks/0wbgcnm4we8z7.js is in no manifest`.
Der Grund war nicht Next, sondern mein `sed`: der Routenschlüssel im Manifest
heißt `["/[lang]/page"]`, und seine eigenen eckigen Klammern schlagen das
naheliegende Muster. Geschnitten wird jetzt an der ersten `{`. **Ein Werkzeug,
dessen erster Lauf grün ist, hat man nicht geprüft** — dieser war rot, und zwar
aus dem richtigen Grund.

### Was #35 davon hat

Der React Compiler kostet 1 945 B gzip auf dem Initial-Bundle. Gegen die Summe
sind das 1,3 %; **gegen unseren eigenen Anteil 21 %.** Der Issue bleibt offen und
hat ab jetzt eine ablesbare Auslöseschwelle statt einer Handmessung.

### Was diese Runde nicht behauptet

**Das Gate läuft nicht in CI.** Das ist L8, unverändert; ADR 0050 entscheidet die
Zahlen und die Methode, nicht den Verdrahtungsort. `make bundle-size` hängt
bewusst nicht in `make check` — es baut, und `check` baut nicht.

**Der Rahmen bekommt keine eigene Grenze.** Er wird gedruckt, damit ein Sprung
auffällt. Eine dritte Zahl wäre ein zweites Signal für dieselbe Sache, und für
eine neue Regel fehlt der Fund, der sie erzwingt.

---

## Vorher — 29.08.2026, G7 in Produktion, Stufe G abgeschlossen

**Die Seite hat zum ersten Mal einen Ort, an dem sie sich selbst ansieht.**
`/dev/components` zeigt jedes Bauteil in jedem dokumentierten Zustand — und die
erste Handlung der Phase war, das Abnahmekriterium nachzuzählen.

### Abgenommen gegen Produktion, 29.08.2026

```
status ok · sha d70927b · v0.15.0
Merge 21:34:01Z → Deploy fertig 21:37:54Z    233 s, ok, Pipeline success
ops                           uptime90d 100 · p95 72,5 ms · errorRate 0

/ · /de · /fr · /about        200      feed · robots · sitemap · healthz  200
/dev/components               404      /en/dev/components  308 → 404
Metaleiste                    st-word 6 · st-dot 6 · data-tone 6
Galerie-Markup auf /          0 Treffer für „Component gallery", gal-, st-burst
```

**Die Abnahme dieser Phase ist kurz, und das ist die Phase, nicht die Abnahme.**
G7 ist die erste, deren Hauptartefakt in Produktion absichtlich unsichtbar ist.
Gegen `https://timseil.dev` sind genau zwei Dinge zu prüfen — dass die Galerie
404 gibt und dass die bestehenden Seiten sich nicht bewegt haben. Beides steht
oben. Alles andere ist am lokalen Produktionsbild gemessen und im Abschnitt
darunter belegt.

### Zwei Dinge, die nur das ausgelieferte Stylesheet zeigt

Das Stylesheet heißt jetzt `3svzn18n_d2z_.css` und misst **31 547 B**, gegen
31 154 B in G6 — **393 Byte mehr**. Was in diesen 393 Byte steckt und was nicht,
ist die eigentliche Abnahme der Entscheidung, `ui.css` und `gallery.css` nur vom
Galerie-Layout laden zu lassen:

| Gesucht | Treffer | |
|---|---|---|
| `ts-glitch` · `st-burst` | je **2** | Keyframe und Regel, bei jedem Besucher |
| `ts-pulse` | 2 | unverändert seit G6 |
| `gal-part` · `.btn` · `.tile` · `.field-input` · `.sec-id` | **0** | Galerie und die vier Basisbauteile sind **nicht** dabei |

**Die Nullen sind der Beleg, nicht die Zusage.** `ui.css` und `gallery.css`
erreichen die öffentliche Seite nicht — gemessen an den Bytes, die ein Besucher
wirklich bekommt, statt an einem Kommentar im Dateikopf.

**Die 393 Byte sind der Burst, und er ist für keinen Besucher auslösbar.** Das
Keyframe liegt in `state.css`, weil dort die Zustandssprache liegt, und
`state.css` lädt jede Seite. In Produktion wechselt kein Zustand, während jemand
hinsieht — der Burst ist also heute 393 Byte, die niemand sehen kann. Das ist
vertretbar und wird trotzdem hier gezählt, weil #237 gerade festgehalten hat,
dass vom Budget rund 7 KB übrig sind: die Sorte Byte, die man einzeln nicht
bemerkt und in Stufe H dreizehnmal ausgibt.

### Die Zahl im Abnahmekriterium stimmt nicht: es sind 16, nicht 15

`SYS.00.04.04` des Handoff-Blattes hat **14 Zeilen und 16 Namen**; zwei Zeilen
führen je zwei Bauteile (`SpecRail · PostCard`, `TopNav · StatusDot`). Die **15**
steht ausschließlich im Bauplan (Zeile 1218) und ist von dort in diesen Backlog
gewandert. **Kein Blatt nennt sie.**

Dieselbe Sorte wie „vier Bauteile ohne Aufrufer" aus der G6-Abnahme — es waren
fünf. Eine Zahl über den eigenen Bestand, aus dem Kopf geschrieben statt gezählt.
Das Register in `lib/gallery/registry.ts` trägt jetzt die sechzehn Namen wörtlich,
`inventoryProgress()` zählt sie, und `registry.test.ts` hält sie **als Liste**
gegen das Blatt statt als Ganzzahl — wer sie ändert, muss einer Liste
widersprechen und nicht einer Zahl, die man für gerundet halten könnte.

**Der Bauplan ist deine Datei.** Ob dort 15 in 16 korrigiert wird, entscheidest
du; hier steht die Zählung.

Gemessen am lokal gebauten Produktionsbild:

```
Riegel        /            200        /dev/components   404   (normaler Bau)
              /            200        /dev/components   200   (DEV_GALLERY=1)
Zustände      8 Wörter · 4 Füllungen  solid 2 · ring 3 · barred 1 · dash 15
              barred und dash sind zum ersten Mal zu sehen
Puls          2 Zellen, 2.6s          nur wo die Füllung solid ist
Burst         1 Wechsel → 1 Burst     ts-glitch 0.28s steps(2)
              +120 ms → 0             Zustand wechselt trotzdem
              +700 ms → 1             die 600-ms-Sperre, von außen gesehen
              reduced-motion          keine Zwischenstufe, Endwert steht sofort
Paletten      7 Farben                Wort, Füllung und Puls in allen sieben gleich
Breiten       1440…390                kein Überlauf, Zellzahlen stabil
Register      16 Namen                4 gebaut, 11 QUEUED mit schuldender Phase,
                                      TopNav gebaut ohne Beispiel (mit Grund)
```

### Der Burst war nirgends zu sehen, und das hat den Plan geändert

G6 hat die Animation mit der Begründung verschoben, G7 bringe „Auslöser **und**
Betrachter". Der Auslöser kam; der Betrachter fehlte:

- **`next dev` hydriert nicht** — der offene Fund seit G4. Im selben Server gegen
  `/` gegengeprüft: die Uhr steht auf `--:--:--`. **Damit ist er eingegrenzt: es
  liegt nicht am `[lang]`-Baum.** Die Galerie hat ein eigenes Root-Layout und
  verhält sich genauso.
- Der Produktionsbau antwortet auf der Route 404.

Der Plan dieser Phase hatte eine Env-Variable ausdrücklich abgelehnt — „ein
Schalter für einen Lauf, den niemand geschrieben hat". Die Messung hat die
Begründung widerlegt: der Lauf war die Abnahme von #230, fällig in dieser Phase.
`DEV_GALLERY=1` baut die Galerie in ein Produktionsbild, das hydriert; sie
akzeptiert **genau `1`**, damit ein `DEV_GALLERY=0` nicht das Gegenteil tut, und
`compose.yaml` setzt sie nie. Keine Sicherheitsgrenze und gibt nicht vor, eine zu
sein — wer Env setzen kann, besitzt den Container.

### Drei Dinge, die erst der Bau gezeigt hat

**Eine Seite außerhalb `[lang]` ändert den Typ von `lang()`.** `next/root-params`
gibt `string | undefined` zurück, sobald **eine** Route draußen liegt; der Bau
brach in `dictionaries.ts`. `isLocale` nimmt jetzt `unknown` statt `string`.
Alle bisherigen Nachbarn dort draußen (`healthz`, `feed.xml`, `og.png`, …) sind
Route Handler — die Galerie ist die erste **Seite**, und damit die erste, die ein
zweites Root-Layout braucht.

**`"dev"` musste in `RESERVED`.** Sonst schreibt `rewriteTarget()` die Adresse auf
`/en/dev/components` um: ein 404, dessen Ursache zwei Dateien entfernt liegt.
Belegt — ohne die Zeile wird `routes.test.ts` rot.

**Die Handoff-Fassung von `Field` kann keine Server-Komponente sein.** Sie
erzeugt ihre IDs mit `useId()`, und ein Hook macht das Bauteil client-only — also
JavaScript für Markup ohne Verhalten, ausgerechnet auf der Seite (H8), wo das Feld
in Mehrzahl steht. `name` ist jetzt Pflicht, die IDs kommen daher. Das ist der
Fund der Klasse, die ADR 0043 für diese Dateien angekündigt hat, und er ist
kleiner als der bei `ThemeSwitch`. Nebenbei ist ein Farbliteral gefallen:
`rgba(0,229,255,.4)` war Cyan in allen sieben Paletten, jetzt `--acc-line`.

### Die Laufweiten sind gezählt, und die Antwort ist kleiner als die Frage

| Wert | Vorkommen | Wo |
|---|---|---|
| `var(--ls-label)` | 7 | tokenisiert |
| `.1em` | 7 | **alle sieben in `chrome.css`** |
| `var(--ls-head)` | 5 | tokenisiert |
| `.12em` | 3 | `chrome.css` (1), `ui.css` (2) |
| `.06em` | 2 | beide in `chrome.css` |
| `.20em` · `.13em` · `.04em` · `.02em` | je 1 | Einzelfälle |

**Nur `.12em` überschreitet überhaupt eine Dateigrenze.** Der häufigste Literal
gehört vollständig einer Datei und ist damit deren lokale Konstante, kein Token.
`tokens.css` ist unberührt — ein Token dort anzulegen entscheidest du, und die
Zählung bereitet das vor, statt es zu ersetzen. Damit ist Punkt (4) des offenen
G2-Fundes beantwortet, ohne dass eine Zeile geraten wurde.

### #35 ist gegen die volle Galerie nachgemessen — und die Prämisse kippt weiter

Je drei Läufe, `rm -rf .next` davor, `next.config.ts` danach per SHA als
unverändert belegt, beide Arme in Produktionsform gebaut:

| | Bauzeit | JS in `.next/static/chunks` |
|---|---|---|
| **mit** Compiler | 21 457 · 21 588 · 22 165 ms | 598 576 B |
| **ohne** Compiler | 18 613 · 19 142 · 18 096 ms | 592 918 B |

Rund **3,0 s Bauzeit und 5 658 B JS**. In G2 waren es 510 B, in G3 rund 2 600 B.
Auf das Initial-Bundle von `/` und in gzip — die Zahl, gegen die L8 budgetiert —
sind es **1 945 B**; siehe den Abschnitt darunter.
Der Issue begründet das Behalten mit „adds no runtime weight to the bundle", und
die Zahl entfernt sich mit jeder Phase weiter davon. Zahlen an den Issue,
**nicht von mir geschlossen** — der Tracker gehört dir.

### Das Initial-Bundle steht bei 143 KB gzip, und das Budget ist 150

Nachgemessen, um #35 gegen die richtige Zahl zu stellen statt gegen rohe Bytes.
Methode: jedes `<script src>` im vorgerenderten `/`-Dokument **ohne** das
`noModule`-Polyfill (das lädt ein moderner Browser nie), jede Datei **einzeln**
gzippt — so trägt es die Leitung. Erst zusammenhängen und dann einmal gzippen
komprimiert über Dateigrenzen und schmeichelt der Summe um rund 2 KB.

| | roh | gzip |
|---|---|---|
| mit Compiler | 479 812 B | **143 101 B** |
| ohne Compiler | 475 443 B | **141 156 B** |
| Differenz | 4 369 B | **1 945 B** |

L8 budgetiert **Initial JS < 150 KB gzip**. Die Seite liegt damit heute bei
**143 KB — rund 7 KB Luft**, und `web/` hat noch **keine einzige Inhaltsseite**.
Stufe H baut dreizehn davon, Stufe J das Terminal.

**Das ist der eigentliche Fund dieser Messung, nicht die Compiler-Zahl.** Die
1 945 B des Compilers sind 1,3 % des Budgets — aber **22 % der verbliebenen
Luft**. Die knappe Größe ist nicht das Budget, es ist der Rest davon.

Kein Alarm und keine Handlung in dieser Phase: die Zahl gehört zu L8, und ein
Budget, das erst dort in CI läuft, wird nicht in G7 nachgezogen. Aber sie sollte
**vor H1** bekannt sein und nicht in L8 als Überraschung auftauchen — wer dreizehn
Seiten gegen 7 KB Luft baut, will das vorher wissen. **Next 16 mit Turbopack
druckt keine „First Load JS"-Spalte mehr**, also gibt es keine Zahl von Next
selbst, gegen die man das halten könnte; die Methode oben ist die verfügbare.

### Zwei Messfehler dieser Runde, und beide waren meine

**Ein `cd web` in einem Verzeichnis, das schon `web` war.** Die erste
#35-Messung schaltete den Compiler nie ab: `cd web && python3 …` brach am `cd` ab,
die „ohne"-Läufe liefen also **mit**. Verraten hat es die Byte-Zahl — in beiden
Armen exakt gleich. Wieder dieselbe Lehre wie in G4, G5 und G6: **erst nachweisen,
dass die Messung misst, was sie zu messen glaubt.** Eine Zahl, die sich nicht
bewegt, wo sie sich bewegen müsste, ist ein Befund über den Aufbau, nicht über
die Sache.

**`self.__next_f` aus einer Browser-Erweiterung ist kein Beleg.** Inhaltsskripte
laufen in einer isolierten Welt; was Seitenskripte an `window` hängen, ist dort
nicht sichtbar. Beide Zähler meldeten `0`, während die Seite einwandfrei
hydrierte. **Der Beleg für Hydration ist das DOM** — eine Uhr, die tickt, ein
Klick, der etwas ändert. Ich hätte daraus beinahe geschlossen, die Nutzlast fehle.

### Was die Abnahme nicht behauptet

**Nichts davon ist gegen Produktion gemessen, und das ist diesmal keine Lücke.**
G7 ist die erste Phase, deren Hauptartefakt in Produktion absichtlich nicht zu
sehen ist. Gegen `https://timseil.dev` prüfbar sind genau zwei Dinge: dass
`/dev/components` dort **404** liefert, und dass die bestehenden Seiten sich nicht
bewegt haben. Alles andere ist am lokalen Produktionsbild gemessen.

**Die Bauteile liegen trotz 404 im Image.** `grep -rl "Component gallery"
.next/server` findet sie nach einem Bau ohne Schalter in einem SSR-Chunk. Kein
Besucher lädt den Chunk, weil keine Route ihn anfordert — aber „nicht im Image"
wäre eine Behauptung über Bytes, die niemand angesehen hat.

**`prefers-reduced-motion` ist nicht in einem Browser mit der Einstellung
gemessen.** Die CSS-Hälfte ist aus dem ausgelieferten Stylesheet zitiert, die
JS-Hälfte mit überschriebenem `matchMedia` belegt. Ein echter Lauf gehört an
dieselbe Stelle wie der 44px-Beleg: **Playwright vor H1.**

**Elf der sechzehn Bauteile sind nicht zu sehen, sondern angekündigt.** Sie
stehen als `QUEUED` mit der Phase, die sie schuldet — die Galerie sagt über sich
selbst, was die Seite über ihre Systeme sagt.

**`--host` ist nicht gefahren.** Wie in G3 bis G6.

**Als Nächstes:** die **Triage der Stufe G** — sie ist die letzte Phase dieser
Stufe. Jeder Eintrag hier bekommt Issue, verworfen mit Begründung, oder erledigt.
Danach der Playwright-Aufbau vor H1, an dem vier Schulden hängen: der Dev-Modus,
der 44px-Beleg, die `<Activity>`-Messung und `prefers-reduced-motion`.

---

## Vorher — 29.08.2026, G6 in Produktion

**Zum ersten Mal sagt die Seite einen Zustand zweimal.** Ein Wort und eine Form,
und die Farbe kommt erst danach — was heißt, dass die Metaleiste jetzt ein
drittes Wort hat und `— NO DATA` ein Bauteil ist statt zweier Zeichenketten.

Gemessen an `https://timseil.dev`:

```
status ok · sha 46eb852 · v0.14.0
Merge 18:54:14Z → Deploy fertig 18:58:33Z    259 s, ok, Pipeline 33269493541
check-deployed                8 Behauptungen, 1 nicht von hier stellbar
ops                           uptime90d 100 · p95 20,5 ms · errorRate 0

Zustandszellen  / · /de · /fr   je 3      ONLINE · ONLINE · LIVE
                /about          2         die Startseitenzeile fehlt dort
Punkt           6 px in Fußzeile und Menüstreifen, 7 px auf der Seite
Puls            ts-pulse 2.6s              --d-pulse, erstmals gelesen seit G1
Stylesheet      3rf1jyfbzgp5s.css  31 154 B   byte-gleich mit dem lokalen Image
                vier Füllungen überleben den Minifier, --d-pulse bleibt Variable
.foot-dot       0 Treffer                  die alte Regel ist fort

Sieben Paletten ONLINE, Wort und Füllung und Puls unverändert
                #00E5FF · #CBA6F7 · #FFB74A · #2EE6A6 · #7AA2F7 · #7C2FD4 · #076678
Graustufen      BUILD 46eb852 · ● ONLINE · UPTIME 100.00% · api ● LIVE  lesbar

Hydration       4 Ladevorgänge, 4 Kanarienvögel, 0 Treffer, ein <main>
```

### Sieben Paletten sind der bessere Beleg als Graustufen

Das Abnahmekriterium lautet „jeder Zustand hat ein zweites Merkmal neben der
Farbe", und Graustufen prüfen davon nur die halbe Aussage: dass die Information
**ohne** Farbe ankommt. Der Fall, den ein Besucher wirklich herstellt, ist ein
anderer — er schaltet ein Theme um, und dann ist die Farbe nicht weg, sondern
**eine völlig andere**.

Über die sieben Paletten wandert ONLINE durch sieben Farben, von Cyan über
Mauve und Amber bis zu einem Petrol auf hellem Grund, und Wort, Füllung und Puls
sind in allen sieben identisch. Am lokalen Rig kam die Gegenprobe dazu, die
Produktion nicht liefern kann: unter `amber` wandert DEGRADED per Token auf Mint
(`rgb(255,176,0)` → `rgb(127,209,174)`), weil der Akzent dieser Palette selbst
Amber ist — und der Ring blieb ein Ring.

### Der Fund aus G4 ist zu, und er war zwei Zeilen groß

`FooterHealth.online: boolean \| null` hatte drei Darstellungen und zwei
erreichbare Werte. `degraded` wurde als **ONLINE** gezeigt, weil die Leiste kein
drittes Wort hatte; `OFFLINE` stand im Code für eine Antwort, die `/api/health`
nicht bilden kann. Beides ist fort, und was an seine Stelle trat, ist ein Wort
statt eines Booleschen.

**Herstellbar, nicht erfunden:** `api/internal/health/health.go` antwortet
`degraded`, wenn das eigene System nicht `live` ist. Mit
`SITE_SYSTEM_SLUG=no-such-system` am lokalen Rig sagte die Zeile auf `/` nach
zehn Sekunden DEGRADED, Fußzeile und Menüstreifen nach zwanzig — die Differenz
ist `healthCached` mit `revalidate: 60`, und wer nach fünf Sekunden misst, misst
den Cache und hält ihn für einen Defekt.

### Der Puls ist Schmuck, und das ist eine Entscheidung, keine Nachlässigkeit

`globals.css` schaltet unter `prefers-reduced-motion: reduce` **jede** Animation
ab. Ein pulsierender Punkt ist damit für einen Teil der Besucher nicht ein
schwächeres Merkmal, sondern gar keines. Er darf deshalb nur dort stehen, wo die
Füllung den Zustand schon trennt, und `lib/state/words.test.ts` weist alles
andere ab — zusammen mit der Regel, die ohne Test leise verrutscht: **die
Füllung muss zur Klasse der Antwort passen**, niemand darf einem ungemessenen
Zustand die Füllung eines gemessenen geben. Invariante 1 als Unit-Test.

`tokens.css` und `globals.css` sind unverändert. Der gefärbte Puls entsteht,
indem der Punkt `--acc-pulse` und `--acc-pulse-2` lokal neu setzt und damit das
Keyframe des Designers auf seinen eigenen Ton ausrichtet — die Datei, deren Kopf
sagt, dass kein Wert in ihr unserer ist, hat kein Zeichen verloren.

### Zwei Messfehler dieser Runde, und beide waren meine

**`grep -c` zählt Zeilen, keine Vorkommen, und ausgeliefertes HTML ist eine
Zeile.** Mit gestoppter API meldete `grep -c 'st-nodata-text'` die Zahl `2`,
während im Dokument acht standen — vier Platzhalter und vier gestreamte Werte.
Zwei Minuten lang sah es aus, als rendere die Hälfte der Zellen ihren
Ruhezustand nicht. Das ist die vierte aus derselben Familie wie die drei
G4-Fallen und die G5-Falle mit dem angehängten Schrägstrich, und die Lehre ist
wieder eine Reihenfolge: **erst nachweisen, dass die Messung misst, was sie zu
messen glaubt.**

**Und der Befehl, den ich dagegen in den Runbook geschrieben habe, war selbst
ungeprüft.** `grep -o '<span class="st" [^>]*>.*\?</span></span>'` lieferte auf
diesem Rechner das Richtige, weil GNU grep `.*\?` faul behandelte. In BRE ist
das nicht definiert; greedy gelesen zöge das Muster vom ersten Zustand bis zum
letzten `</span></span>` des Dokuments und lieferte **eine** Zeile statt drei.
Ersetzt durch ein Muster ohne `.*`, das zwei Elemente gar nicht überspannen
kann, und verbatim gegen die laufende Seite belegt. **Eine Anleitung, die nie
ausgeführt wurde, ist eine Vermutung mit Syntaxhervorhebung.**

### Die Zahl „vier Bauteile ohne Aufrufer" stimmte nicht

Es sind **fünf**. `StateWord` — das Wort ohne Punkt, für eine Tabellenspalte,
die den Zustand schon in der Überschrift führt — steht in derselben Datei wie
`StatusDot` und ist beim Zählen durchgerutscht; die Vier stand so in ADR 0048,
im PR-Text von **#228** und im ersten Entwurf dieses Abschnitts. Gefunden beim
Nachzählen mit `grep`, nicht beim dritten Lesen des eigenen Satzes.

**Der Fehler ist klein und die Sorte ist es nicht:** eine Zahl über den eigenen
Code, aus dem Kopf geschrieben statt gezählt, in einem Repository, dessen erste
Regel „keine erfundenen Zahlen" heißt. ADR 0048 ist in diesem PR korrigiert;
der PR-Text von #228 ist gemergt und bleibt stehen, mit der Korrektur hier.

### Was die Abnahme nicht behauptet

**DEGRADED und `— NO DATA` sind gegen das lokale Rig belegt, nicht gegen
Produktion.** Beide dort herzustellen hieße, den laufenden Host zu verbiegen —
`SITE_SYSTEM_SLUG` umzustellen oder die API zu stoppen. Was Produktion zeigt,
ist ONLINE und LIVE; die anderen zwei Zustände sind an einem Produktionsbau mit
demselben Stylesheet gemessen, und das Stylesheet ist byte-gleich.

**Zwei der vier Punkt-Füllungen hat noch nie jemand gesehen.** `barred`
(OFFLINE) kann `/api/health` nicht auslösen, `dash` (QUEUED) hat keinen
Aufrufer. Belegt sind sie durch `words.test.ts` und dadurch, dass sie den
Minifier überlebt haben — nicht durch ein Bild. Erster Betrachter: G7s Galerie.

**`prefers-reduced-motion` ist nicht in einem Browser mit der Einstellung
gemessen.** Die Regel steht seit G1 in `globals.css` als `animation: none
!important` auf dem Universalselektor und ist damit stärker als jede Regel
dieser Phase; belegt ist sie durch die Kaskade, nicht durch einen Lauf. Gehört
an dieselbe Stelle wie der 44px-Beleg und die Tastaturbedienung: **Playwright
vor H1.**

**`--host` ist nicht gefahren.** Dass die laufenden Container **diese** Bytes
sind, sieht nur der VPS. Acht Behauptungen von hier, die neunte nicht.

**Ein Browser, ein Rechner, eine Breite.** Die sieben Prüfbreiten sind am
lokalen Produktionsbau über einen Iframe fester Breite gemessen — 390 bis 1440,
Zelle 50 px, kein Overflow —, nicht gegen Produktion.

**Als Nächstes:** G7 — Komponenten-Galerie unter `/dev/components`, nur in
Development, jedes Bauteil × jeder Zustand. **Sie ist der erste Betrachter von
fünf Bauteilen, die G6 gebaut hat und keine Seite rendert** (`EmptyState`,
`ErrorPanel`, `LoadingLines`, `DegradedNotice`, `StateWord`), und der erste Ort,
an dem ein Zustandswechsel von Hand auslösbar ist — also die Phase, in der der
Glitch-Burst aus `lib/state/burst.ts` seine Animation bekommt. Abgenommen ist
G7, wenn alle 15 Bauteile des Handoff-Inventars mit allen dokumentierten
Zuständen sichtbar sind; aus diesem Inventar stehen heute **zwei**, `ThemeSwitch`
aus G2 und `StatusDot` aus G3 und G6.

---

## Vorher — 29.08.2026, G5 in Produktion

**Die Seite spricht zum ersten Mal mit Maschinen, und sie sagt dabei weniger,
als sie könnte.** Vier Adressen, die kein Besucher aufruft, dazu ein Ausweis im
Kopf der Startseite — und drei Stellen, an denen bewusst nichts steht: kein
`lastModified` in der Sitemap, kein Eintrag im Feed, kein `SearchAction` im
Graphen.

**Diese Abnahme misst zwei Merges.** G5 ist in zwei Hälften gebaut worden, G5a
(`4ae69c4`, `v0.12.0`, 13:58 UTC) und G5b (`cc15115`, `v0.13.0`, 15:51 UTC), und
das Abnahmekriterium des Bauplans umfasst beide. G5a hat deshalb keinen eigenen
Abnahme-PR bekommen; seine Zahlen stehen hier, zwei Stunden später als die des
Merges. Gemessen an `https://timseil.dev`:

```
status ok · sha cc15115 · v0.13.0
Merge 15:51:07Z → Deploy fertig 15:54:55Z    224 s, ok, Pipeline 33261367801
check-deployed                8 Behauptungen, 1 nicht von hier stellbar

robots.txt      65 B      Allow: / · Sitemap: …/sitemap.xml
sitemap.xml     1 201 B   3 <url>, 3 x-default        / · /de · /fr
feed.xml        427 B     0 <item>                    application/rss+xml
og.png          52 585 B  1200 × 630                  byte-gleich mit Build und Image
ld+json auf /   1 Element                             kein rohes < im Text

html lang       / en · /de de · /fr fr                die Route trägt sie
main lang       / keins · /de en · /fr en             „KEINE HALBEN SEITEN", in den Bytes
alternate       4 hrefLang + der Feed-Link            auf jeder der 21 Adressen
canonical       / → timseil.dev · /de/about → …/de/about
/en             308 → /        /en/about  308 → /about
/es /english    404                                   eine Sprache ist ein Segment
/about/         308 → /about                          angehängter Schrägstrich
noindex         / indexierbar in allen drei Sprachen  21 Adressen einzeln geprüft
                die sechs Stubs noindex in allen drei

Umschalter      /de/about → EN → /about               html de→en, main en→keins
                Tastatur: 3× ↓ → lang-option-2, Enter → /fr/about
                drei Client-Navigationen, 0 Fehler, 0 Hydration-Warnungen

Schema-Validator  0 ERRORS, 0 WARNINGS                author und publisher über @id
Rich-Results      Crawl ok · „Keine Elemente erkannt"  siehe unten
/api/health       s-maxage=60 · ETag · 372 B → 304/0 B  G4s Zahlen, unverändert
```

### Der Rich-Results-Test kann über dieses Markup nichts sagen, und das ist die Antwort

Der Bauplan schreibt in Zeile 1212 „JSON-LD (`Person`, `WebSite`)" und
„Rich-Results-Test grün" in denselben Satz. Beides zusammen geht nicht. Der Test
meldet ausschließlich Typen, die in der Suche ein *Rich Result* erzeugen —
`Article`, `FAQPage`, `BreadcrumbList`, `Product` und den Rest dieser Liste.
`Person` und `WebSite` stehen nicht darauf; sie speisen Knowledge Panel und
Sitelinks. Der Test hat über sie nichts zu sagen und sagt es: **Crawl
erfolgreich, „Keine Elemente erkannt", keine Fehler, keine Warnungen.** Die
Anzeige nannte 18:13:37 in ihrer eigenen Zeitzone, CEST, also 16:13 UTC.

Grün zu bekommen ginge nur, indem man einen Typ hinzufügt, den diese Seite nicht
hat — erfundenes Markup, um eine Prüfung zu bestehen, und damit genau das, wogegen
die erste Regel dieses Repositories geschrieben ist.

**Das Werkzeug für diese zwei Typen ist der Schema Markup Validator, und der
sagt 0 Fehler, 0 Warnungen.** Der stärkere Teil seiner Ausgabe ist nicht die
Null: `author` und `publisher` standen als `{"@id": …/#person}` im Dokument, und
er hat sie zum Person-Knoten **aufgelöst** und ausgeschrieben. Dass ein
`@graph` mit zwei Knoten, die sich über eine Kennung nennen, von einem fremden
Parser richtig zusammengesetzt wird, ist aus dem Quelltext nicht ablesbar. Nur
aus dem Verhalten.

Als **#224** angelegt, Meilenstein M6 — nicht als Korrektur des Bauplans in
diesem PR. Ein Kriterium nachträglich an sein Ergebnis anzupassen ist keine
Abnahme.

### Der Feed trägt ein Jahr, das niemand geschrieben hat

```
cache-control: s-maxage=31536000
x-nextjs-cache: HIT
```

`app/feed.xml/route.ts` begründet in Zeile 18 ausführlich, warum keine
Cache-Politik erfunden wird: „**NO `Cache-Control` EITHER.** There is no CDN in
front of this origin (ADR 0006)." Die ausgelieferten Bytes widerlegen den Satz.
Next setzt den Header selbst, wenn ein vorgerenderter Route Handler keinen setzt.

Heute ohne Wirkung — ohne CDN adressiert `s-maxage` keinen Leser. Ab H9 stünde
ein Jahr auf einem Dokument, das sich mit jedem Post ändert.

**Die drei Nachbarn sagen etwas anderes.** `robots.txt`, `sitemap.xml` und
`og.png` liefern alle `public, max-age=0, must-revalidate`; Next behandelt
Metadata-Routen anders als einen selbstgeschriebenen Handler. Der Feed bekommt
denselben Header — abgeleitet von den drei Flächen daneben, nicht gewählt, wie
ADR 0045 es für ein Cache-Fenster verlangt. Eigener `fix(web):`-PR, weil eine
Abnahme seit G1 genau eine Datei anfasst.

**Nachgetragen, gegen Produktion gemessen:** #226 ist seit `0fc863e` (`v0.13.1`,
Deploy 16:54:28Z) draußen, und die vier Flächen antworten dort jetzt alle
`public, max-age=0, must-revalidate`. Der Beleg fehlte dieser Abnahme, als sie
geschrieben wurde — sie kannte nur einen lokalen Produktionsbuild.

**Der Fund gehört dieser Abnahme und keiner Prüfung.** `make check` liest keine
Header, und `next build` auch nicht. Sichtbar wird so etwas erst, wenn jemand
die Antwort einer laufenden Maschine ansieht — und das ist die einzige Sorte
Beleg, die dieses Projekt gelten lässt.

### G5a wird hier zum ersten Mal gemessen, zwei Stunden nach seinem Merge

Der Umschalter ist das zweite Kriterium des Bauplans, und er ist der Teil, den
nur ein Browser zeigen kann: im ausgelieferten HTML steht `lang-option` **null
Mal**, die Optionen entstehen erst beim Öffnen. Von `/de/about` aus, mit dem
Kanarienvogel davor:

```
Ausgangslage   /de/about · html lang="de" · main lang="en" · canonical /de/about
Klick auf EN   /about    · html lang="en" · main lang=keins  · canonical /about
Tastatur       3× ArrowDown → aria-activedescendant lang-option-2, Enter
               /fr/about · html lang="fr" · main lang="en" · canonical /fr/about
```

`main lang` ist dabei die ganze Regel in einem Attribut. Auf `/de` und `/fr`
steht `lang="en"` am Block, weil die Wörterbücher leer sind; auf `/about`
verschwindet es, weil Route und Text dieselbe Sprache haben. „KEINE HALBEN
SEITEN" ist damit nicht erklärt, sondern nachzählbar.

**Und die Metadaten wandern bei der Client-Navigation mit** — nach dem Sprung
nach `/about` standen die vier `hrefLang`-Links **und** der Feed-Link neu im
Kopf, auf die neue Adresse gestellt. Das war keine geplante Messung; es fiel
beim Ablesen an und ist der Beleg dafür, dass `seoFor()` auch den Weg über den
Router überlebt.

Drei Client-Navigationen, **null Fehler und null Hydration-Warnungen** — und der
Kanarienvogel war vorher da, sonst bewiese die leere Konsole nur, dass niemand
zugehört hat.

### Eine Messung dieser Abnahme war zuerst falsch, und es war dieselbe Falle wie in G4

Die `noindex`-Verteilung über sieben Routen × drei Sprachen habe ich mit einem
angehängten Schrägstrich abgefragt — `/about/` statt `/about`. Alle einundzwanzig
Adressen meldeten `index`, auch die sechs Stubs, die seit G5a `noindex` tragen.
Zwei Minuten lang sah es nach einem Defekt in `lib/seo/pages.ts` aus.

Es waren Weiterleitungen. Ein angehängter Schrägstrich beantwortet Next mit
`308` auf die kanonische Form; `curl` ohne `-L` bekommt einen leeren Körper, und
ein `grep` nach `content="noindex"` findet in einem leeren Körper nichts. Ohne
Schrägstrich gemessen: `/` in allen drei Sprachen indexierbar, die sechs Stubs
in allen drei `noindex` — **genau drei indexierbare Adressen, genau drei
`<loc>` in der Sitemap.** Die Gegenprobe schließt.

Das ist die vierte aus derselben Familie wie die drei G4-Fallen, und die Lehre
ist wieder dieselbe Reihenfolge: **erst nachweisen, dass die Messung den
Zustand hat, den sie annimmt, dann messen.** Der Zusatz aus dieser Runde ist
klein und übertragbar: *eine Antwort ohne Körper enthält nie das, was man
sucht* — ein `grep -c` darauf gibt `0` und sieht aus wie eine Aussage über den
Inhalt.

Als fünfte Falle in `docs/runbooks/web.md` steht bereits die Schreibweise
`hrefLang`: ein `grep hreflang` über den Kopf findet nichts, und ich bin beim
Bauen von G5b hineingelaufen, obwohl die Warnung seit G5a im Backlog stand. Sie
stand im Abschnitt über die Sprachrouten und gesucht wurde im Abschnitt über die
SEO-Flächen. Sie steht jetzt in beiden.

### Was die Abnahme nicht behauptet

**Der Umschalter ist auf einem Browser auf einem Rechner geprüft.** Chromium,
Desktop-Breite, ein Zeigegerät. Der 44px-Beleg und die Tastaturbedienung auf
`pointer: coarse` gehören an dieselbe Stelle wie in G3 und G4 — Playwright mit
`hasTouch`, vor H1.

**`--host` ist nicht gefahren, und zum vierten Mal in Folge.** Dass die
laufenden Container **diese** Bytes sind, kann nur der VPS sehen;
`check-deployed` sagt es selbst und nennt den Befehl. Acht Behauptungen von
hier, die neunte nicht — derselbe Satz steht in G3, G4 und G5, und in Stufe F
stand noch „10 von 10". Beim Nebeneinanderlegen der beiden Abnahmetexte
aufgefallen und als eigener Fund unten notiert: eine Gewohnheit hat aufgehört,
ohne dass jemand sie beendet hat.

**Der Feed hat null Einträge, also ist der Eintrags-Renderer in Produktion nie
gelaufen.** Maskierung und RFC-822-Datum sind unter `node --test` belegt und
sonst nirgends. Der erste echte Titel kommt in H9, und das ist die Messung, die
zählt.

**Das OG-Bild hat kein soziales Netz je abgeholt.** Gemessen ist, dass die
Adresse ein PNG in 1200 × 630 liefert und dass `og:image` mit Breite, Höhe und
Alt-Text im Kopf steht. Ob eine Vorschau daraus entsteht, sagt erst ein Dienst,
der sie baut.

**Und keine der drei Sprachen ist übersetzt.** `/de` und `/fr` liefern
englischen Text und sagen es am Blockelement. Was hier gemessen ist, ist der
Mechanismus, nicht der Inhalt; P6 füllt ihn.

**Als Nächstes:** G6 — Zustandssprache. Die Bauteile aus STATE.05 zentral:
Leerzustände, Fehlerpanels, DEGRADED, `— NO DATA`, Retry-Zähler, `StatusDot`
mit 2,6 s Puls. Abgenommen ist es, wenn **jeder Zustand ein zweites Merkmal
neben der Farbe** hat. **Zwei Sachen** nimmt G6 aus dieser Phase mit. Die erste
ist ein Bauteil, das schon existiert und noch keinen Namen hat: `— NO DATA`
steht seit G4 als Zeichenkette in `app/[lang]/page.tsx` und seit G5 zusätzlich
in der Fußzeile — G6 ist die Phase, in der daraus eines wird. Die zweite ist
eine Grenze, die G5b gezogen hat und die dort bleiben soll: **eine `.tsx` läuft
unter `node --test` nicht**, weil Node kein JSX transformiert. Jede
Verzweigung, die G6 baut, gehört deshalb nach `web/lib/`, und das Bauteil
darüber ist Markup plus ein Aufruf — die Regel aus ADR 0044, in G5b zum ersten
Mal als Preis benannt statt als Vorsatz.

---

## Vorher — 28.08.2026, G4 in Produktion

**Die Seite liest zum ersten Mal ihre eigene API.** Die drei Zellen der Fußzeile
tragen Zahlen statt `— NO DATA`, und keine davon steht im Quelltext.
`sha-040bc37`, Merge 22:42:46 UTC, Deploy 22:47:08 UTC, 259 s, `ok`, vorher
`sha-810394a`, Version `v0.11.0`. Gemessen an `https://timseil.dev`:

```
status ok · sha 040bc37 · v0.11.0
BUILD · ONLINE · UPTIME       040bc37 · ONLINE · 100.00%   drei Zellen, drei Messungen
uptime90d / p95Ms / errorRate 100 / 42.55 / 0              measuredAt 22:47:23.989Z
— NO DATA in den Bytes        6 auf /, 4 auf /about        die Hülle, vor dem Stream
Hydration-Warnungen           0             9 Ladevorgänge, 7 Routen, Kanarienvogel vorher
Fremd-Origins im Anfrageweg   []            12 Anfragen, alle same-origin
Anfragen des Browsers an /api 0             der Client-Zweig hat bis H8 keinen Aufrufer
ETag                          372 B → 0 B   auf einer 304
Cache-Control                 public, s-maxage=60, stale-while-revalidate=600
Stylesheet                    26 729 B      byte-gleich mit G3 — G4 bringt kein CSS
Uhren                         3, `--:--:--` in den Bytes, tickend im Browser
Zwillings-Fenster             22:47:17 → 22:47:39, 36 Anfragen, 36 × 200
check-deployed                8 Behauptungen, 1 nicht von hier stellbar
```

### Die Fußzeile zeigt den SHA der API, nicht den der Seite — und der Rollout hat es vorgeführt

Zweiundzwanzig Sekunden lang, von 22:47:17 bis 22:47:39, lieferte der **neue**
web-Container die Zelle `BUILD 810394a` — den SHA der **alten** API. Das ist
kein Defekt, sondern die Bauart: `BUILD` kommt aus `Health.sha`, und während des
überlappenden Starts (ADR 0035) redet das neue web mit dem api-Zwilling, der
noch der alte ist. Invariante 1 lässt keine andere Wahl — die einzige gemessene
Quelle ist die API, und der SHA des eigenen Bündels wäre über `NEXT_PUBLIC_` zu
holen, was `eslint.config.mjs` versperrt und ADR 0044 ausdrücklich als den
„ehrlich aussehenden Abkürzungsweg" verwirft.

**Das Labor konnte das nicht zeigen.** Dort tragen beide Container immer
denselben Tag; erst ein echter Deploy stellt web und api kurz auf zwei
verschiedene Stände. Offen bleibt, ob die Zelle das sagen sollte — heute heißt
`BUILD` „der Build, der geantwortet hat", und für zweiundzwanzig Sekunden ist
das ein anderer als der, der die Seite gerendert hat.

### 36 Anfragen, 36 × 200 — und #157 hat seine Zahl gegen Produktion

Der Issue sagte voraus, ab Stufe G mache jeder Deploy aus dem Rollout-Fenster
„a burst of 500s". Eine Anfrage alle drei Sekunden quer durch den Deploy:
**sechsunddreißig Anfragen, sechsunddreißig Mal 200.** Keine 5xx, keine 404.
Genau **eine** Anfrage, 22:47:21, verlor die korrelierte Zeile auf `/` und zeigte
dort `— NO DATA`.

Der Grund ist der Entwurf dieser Phase: `lib/api/client.ts` wirft nie, also wird
aus dem Fenster kein Anwendungsfehler, sondern ein fehlender Wert. Die drei
Kandidaten des Issues sind damit entschieden — **akzeptiert und gemessen**, wie
E5b das Label-Limit akzeptiert und gemessen hat. Das Labor hatte 2 von 56
gesagt; Produktion sagt 1 von 36, und beide Male bei einem Beobachtungsraster,
das gröber ist als das Fenster.

### Der Kanarienvogel steht wieder vorn, und diesmal misst er neun Ladevorgänge

Null Hydration-Warnungen über sieben Routen, plus eine Client-Navigation, die
`<Activity>` benutzt — die Navigationsform, die Cache Components neu einführt.
Die Konsole trug am Ende genau zwei Zeilen, und beide hatte ich selbst
abgesetzt. Nach der Client-Navigation standen die drei Zellen unverändert da:
Kopf und Fußzeile leben im Root-Layout, also fasst Activity sie nicht an.

**Der Stream ist dabei die eigentliche Neuerung, und er ist in den Bytes
nachzählbar.** Auf `/` stehen sechs `— NO DATA` — drei Fußzeilen-Zellen, das
Wort in der Menü-Zeile und die zwei Zeilen der Entwicklungs-Hülle — und
*daneben*, in einem `<div hidden>` am Dokumentende, die echten Werte. Der
Platzhalter ist keine Ladeanzeige, sondern die Ruhelage dieser Leiste; genau
deshalb kostet Streaming hier keine Gestaltung.

### Drei Zahlen dieser Phase waren zuerst falsch, und das ist der teuerste Teil

Ein `grep`, das beim ersten Treffer aufhörte, fand immer den Platzhalter statt
des gestreamten Werts — zwei Minuten „der Cache hält den Fehlschlag fest", und
es war nichts. Ein `docker compose stop` scheiterte an fehlendem `IMAGE_TAG`,
dessen Fehlermeldung ich nach `/dev/null` geschickt hatte; fünfzehn Minuten
„mit gestoppter API" liefen gegen eine laufende. Und zehn Seitenaufrufe
erzeugten zehn API-Anfragen, woraus ich schloss, `use cache` greife nicht — es
war der korrelierte Leser, der auf `/` genau einmal pro Besucher fragt und das
auch soll. Sauber isoliert auf `/about`: **zehn Aufrufe, null API-Anfragen.**

Ein Commit mit falscher Begründung stand bereits geschrieben, bevor der dritte
Fehler auffiel; er ist ersetzt. Die Lehre ist eine Reihenfolge, und sie steht
jetzt als drei Mess-Fallen in `docs/runbooks/web.md`: **erst nachweisen, dass
der Aufbau den Zustand hat, den die Messung annimmt, dann messen** — und die
Fehlerausgabe eines Kommandos, dessen Wirkung man gleich behauptet, nie
unterdrücken.

Ein vierter Fall gehört dazu, und er hätte teuer werden können: das Rate-Limit
der API ist 120/min **pro Client**, und am API-Ende ist der ganze web-Container
ein Client. Seit G4 ist jede beobachtete Seitenanfrage auch eine gezählte. Zwei
Zeugen parallel liegen genau auf dem Limit; ein daraus entstehendes `429` hätte
sich als Deploy-Fenster gelesen.

### Was die Abnahme nicht behauptet

**Keine Span-Ansicht.** Es gibt keinen OTel-Exporter und keinen Tempo-Dienst;
`traceparent` ist auf beiden Seiten handgeschrieben und landet nur als
`trace_id` in Logzeilen. „Ein Trace zeigt den ganzen Weg" ist deshalb als
Log-Korrelation erbracht und **nur** als solche: eine Anfrage, eine `trace_id`,
je eine Zeile in web und api. F6 zieht das SDK ein, F8 macht es sichtbar.

**Die zweite Abnahme des Bauplans ist erbracht — von diesem Doku-Merge, nicht
erst von G5.** „Cache-Invalidierung beim Deploy getestet" heißt: ein Deploy
ersetzt eine veraltete Zahl durch eine neue. Beim Deploy von `040bc37` konnte
das nicht eintreten, weil die vorige Fassung gar keine gecachte Zahl hatte —
also stand hier zunächst, der erste Deploy, der es zeigen kann, sei der von G5.
**Der Merge dieser Abnahme war er schon.** Eine Anfrage alle drei Sekunden auf
`/about`, quer durch den Deploy von `55f8849`:

```
00:02:36 … 00:05:16   BUILD 040bc37    die gecachte Zahl der vorigen Fassung
00:05:19              — NO DATA        ein leerer Cache, in flagranti
00:05:25              BUILD 55f8849    die neue Zahl
```

**48 Anfragen, 48 × 200. Neun Sekunden** vom letzten alten Wert zum ersten
neuen, und dazwischen genau eine Anfrage mit `— NO DATA`. Das ist der Beleg,
und zwar der stärkere von zwei möglichen: der Cache lieferte nicht etwa
sechzig Sekunden lang weiter `040bc37`, sondern war leer — genau das, was
`compose.yaml:583` mit tmpfs beabsichtigt. Niemand hat `revalidateTag`
gerufen; der Container ist gestorben und hat den Cache mitgenommen.

**Keine Cache-Zählung gegen Produktion.** Dass zehn Aufrufe null API-Anfragen
erzeugen, ist im Labor gemessen, wo die Logs der API lesbar sind. Von außen ist
das nicht zählbar.

**Kein Besucher ohne JavaScript.** Die gestreamten Werte kommen in einem
`<div hidden>` und werden per Inline-Skript an ihren Platz gesetzt; ohne
JavaScript bleibt der Platzhalter stehen. Kein falscher Wert, ein fehlender —
mit M2 als Termin.

**Und das Menü unter `<Activity>` ist ein Argument, keine Messung.** Es kann
nicht im versteckten Teilbaum landen, weil `app/layout.tsx` den Kopf als
Geschwister von `{children}` rendert. Der Beleg gehört an dieselbe Stelle wie
der 44px-Beleg aus G3: Playwright mit `hasTouch`, vor H1.

**Als Nächstes:** G5 — `/de` und `/fr` als Routen, `hreflang`, `<html lang>`,
ein funktionsfähiger Umschalter mit **nur EN befüllt**, dazu `sitemap.ts`,
`robots.ts`, RSS, OG über `next/og` und JSON-LD. Abgenommen ist es, wenn der
Rich-Results-Test grün ist und der Umschalter auch mit leeren Sprachen
funktioniert. **Eine Sache** nimmt G5 aus dieser Phase mit — die Invalidierung
war die zweite und ist seit `eb8ff36` gemessen: die Hülle ist vorgerendert und
soll es bleiben. `headers()` im Root-Layout nähme jede Seite aus dem statischen
Pass (ADR 0043), und `<html lang>` ist genau die Stelle, an der ein Wert aus
einer Anfrage in das Wurzelelement will. Der Ausweg ist derselbe wie beim Theme:
die Route trägt die Sprache, nicht der Header.

---

## Vorher — 28.08.2026, G3 in Produktion

**Die Seite hat ihr Gerüst.** Kopf, Menü und Fußzeile stehen auf jeder Seite
gleich, die Uhr läuft, und die Fußzeile trägt zwei Fassungen nach Einsatzplan.
`sha-1656fd4`, Merge 18:22:30 UTC, Deploy 18:26:15 UTC, 222 s, `ok`, vorher
`sha-93dcf81`. `make check-deployed` stellt acht Behauptungen und benennt die
neunte, die es von hier aus nicht stellen kann. Gemessen an
`https://timseil.dev`, im Browser:

```
status ok · sha 1656fd4 · v0.10.0
Hydration-Warnungen             0             14 Ladevorgänge, 7 Routen, Kanarienvogel vorher
--:--:-- im ausgelieferten HTML  3            auf jeder Route, alle drei Uhren
Fremd-Origins im Anfrageweg     []            ein Ziel im Dokument, github.com, aber kein Request
Requests an gstatic/googleapis   0
woff2                            5 Dateien, 99 480 B, alle same-origin
Stylesheet                       26 729 B     vorher 17 513 — das Chrome kostet 9 216
prefers-color-scheme             0 Regeln
Kopfhöhe                        66 / 52       1440·1081·1079·1024 / 899·719·390
Ziele unter 44 px                0 von 20     coarse erzwungen, matchMedia sagt fine
Uhren                            3, gleich    ein Intervall, 18:57:09 → :10
— NO DATA in der Meta-Leiste     3 von 3      BUILD · ONLINE · UPTIME, Punkt ohne Puls
Umschalter                       Fußzeile 1, Menü 0
Konsole                          leer
```

### `--:--:--` im ausgelieferten HTML ist der bessere Beleg als eine leere Konsole

Das Abnahmekriterium des Bauplans für G3 ist eine Abwesenheit: **null**
Hydration-Warnungen. Vierzehn Ladevorgänge über sieben Routen, die Hälfte kalt,
die Hälfte mit gesetztem `ts.theme`, liefern sie — und ein `console.error`
davor beweist, dass der Kanal überhaupt spricht. Trotzdem ist das der
schwächere der beiden Belege. Ein leerer Kanal und ein stummer sehen gleich
aus, und **diese Abnahme hat selbst zwei stumme produziert**: das
`close`-Ereignis eines `<dialog>` erreicht die Erfassung nicht, auch nicht bei
einem nackten Kontroll-Dialog, und `requestAnimationFrame` steht in einem
verborgenen Tab still. Beide Male fehlte nichts, beide Male schwieg die Liste.

Der stärkere Beleg ist eine **Anwesenheit**. Im ausgelieferten HTML stehen
dreimal die acht Zeichen `--:--:--`, auf jeder Route, und ein Fremder holt sie
mit einem `curl` — ohne Browser, ohne Konsole und ohne mir zu glauben. Das ist
der Server-Snapshot. Weil `getServerSnapshot` **immer** den Platzhalter liefert,
liest der Hydrations-Render dieselben acht Zeichen: es gibt keinen zweiten Baum,
über den React sich beschweren könnte. Die Warnung bleibt nicht aus, sie ist
bauartbedingt unmöglich — `suppressHydrationWarning` steht auf dem einen `<span>`
und ließe sich löschen, ohne dass sich etwas ändert.

### Der offene G2-Fund hat einen Punkt weniger, und G3 hat ihn nebenbei geschlossen

Der Fünf-Lücken-Eintrag aus G2 führte unter (2) `accSoft`: das Blatt zählt es zu
den 20 Theme-Variablen, `tokens.css` hatte kein Äquivalent, „→ G6/H". Der Punkt
ist zu, seit `1656fd4` läuft — und nicht, weil jemand die Lücke abgearbeitet
hätte. Das Chrome-Blatt zeichnet **sechs** Alphas des Akzents für vier getönte
Flächen, auf dunklem Grund nicht unterscheidbar; sie zusammenzufassen brauchte
genau dieses Token, und so entstanden `--acc-soft` und `--acc-edge` (ADR 0044).
**Vier Lücken sind offen, fünf standen bis heute in der Tabelle.** Ein
Notizblock, an den nur angehängt wird, wirbt weiter für Arbeit, die getan ist.

### Der Fund über `instrumentation.ts` war schon gefunden, und der Tracker sagt es seit Stufe F

Die drei `Ecmascript file had an error` auf `instrumentation.ts:70,78,79` sind
gemessen und richtig — und sie stehen als **#187** im Tracker, seit Stufe F. Ich
habe sie trotzdem als frischen Fund in diesen Notizblock geschrieben, samt der
offenen Frage, „ob Turbopack hier etwas Echtes meldet oder ob die Meldung nur
Lärm ist". **#187 beantwortet sie seit D1:** Next kompiliert die Datei zusätzlich
für die Edge-Runtime, die diese Anwendung nicht hat, und warnt dort über
`process.on`; der Ausweg wäre die Teilung in eine Node- und eine Edge-Hälfte,
bewusst bis F11 zurückgestellt, mit Abnahmekriterium.

Die Regel dagegen steht in `CLAUDE.md`, und ihr Auslöser ist die F5-Abnahme:
**„Wer nur den Notizblock liest, findet Dinge ein zweites Mal und meldet sie als
neu."** Die Regel war da, die zweite Hälfte des Gedächtnisses habe ich nicht
gelesen. Die Zeile zeigt jetzt auf #187 und bleibt stehen — dass es ein zweites
Mal passiert ist, ist die Information.

Beim Nachlesen fiel die Gegenrichtung auf, und sie ist der teurere Fall:
**#94 trägt den Meilenstein G4 und beschreibt eine Reparatur, die es seit dem
23.08. gibt.** Der Notizblock und der Tracker driften in beide Richtungen, und
nur einer von beiden wird am Ende jeder Stufe triagiert.

### Was die Abnahme nicht behauptet

**Keinen Mobil-Erfolg.** `pointer: coarse` lässt sich in einem gezogenen
Desktop-Fenster nicht emulieren; `matchMedia` bleibt `fine`, gleich wie schmal
das Fenster ist. Gemessen ist deshalb nicht, dass ein Gerät die Query trifft,
sondern dass die Regel für **jedes** Ziel wirklich 44px erzeugt: den
coarse-Block ohne seine Media Query injiziert, dann alle zwanzig Ziele
nachgemessen, keins darunter. Genau dort kann sie still versagen, weil
`min-height` auf ein nicht-ersetztes Inline-Element nicht wirkt. Der Beleg für
die Query selbst kommt mit Playwright und `hasTouch`, vor H1.

**Keinen Dev-Durchgang gegen Produktion.** Die elf Ladevorgänge mit lesbaren
Meldungen und StrictModes doppeltem Aufruf sind lokal gemessen und bleiben lokal
aufgeschrieben. Produktion hat keinen Dev-Modus.

**Und keine Zahl aus dem Quelltext.** `aria-current` erscheint auf `/privacy`
dreimal in den ausgelieferten Bytes und **null**mal im DOM — die RSC-Nutzlast
trägt das Markup ein zweites Mal. Jede Zählung hier kommt aus
`querySelectorAll`; die einzige Ausnahme ist `--:--:--`, und nur weil das eine
Behauptung über die Bytes selbst ist.

### Was die Abnahme gefunden hat

**Das Chrome ist das teuerste Stylesheet der Seite.** Ausgeliefert werden
26 729 Byte CSS, in G2 waren es 17 513 — **9 216 Byte für ein Bauteil**, also
mehr als die Hälfte dessen, was vorher insgesamt da war. Kein Defekt, aber die
Zahl gehört in den Blick, bevor G6 und G7 zwanzig weitere Bauteile bringen.

**Zum ersten Mal steht ein fremder Origin im Dokument.** `FooterLead` verlinkt
`github.com/G1NG4R`. Im Anfrageweg ist er nicht — die Liste der Origins, die der
Browser wirklich holt, hat weiterhin genau einen Eintrag —, aber die G2-Zeile
„Fremd-Origins `[]`" hätte ab jetzt zwei Dinge bedeuten können, und eine Zahl,
die zwei Dinge bedeuten kann, ist keine Messung mehr. Sie steht deshalb mit
ihrem Zusatz da.

**Und die eine Hälfte des G2-Schriftfundes stimmt nicht mehr.** Die Zeile sagt,
Turbopack liefere „im `<head>` kein `<link rel="preload" as="font">`" —
nachgemessen an der laufenden Seite stehen dort **fünf**, und es sind genau die
fünf Dateien, die ein lateinischer Text holt. Die andere Hälfte steht: im
ausgelieferten Stylesheet kommen `size-adjust`, `ascent-override` und
`descent-override` **null**mal vor, der metrisch angepasste Ersatzschnitt fehlt
also wirklich — und das ist der CLS-Teil des Fundes, der zu L8 gehört.

**Als Nächstes:** G4 — API-Client aus den generierten Typen, serverseitig
`http://api:8080`, clientseitig `/api`, die Request-ID durchgereicht; dazu Next 16
Cache Components: die Hülle vorgerendert, die Metriken über `use cache` mit Tags,
und der Deploy invalidiert. Abgenommen ist es, wenn **ein Trace den ganzen Weg
zeigt** und die Invalidierung beim Deploy **getestet** ist, nicht behauptet. Die
Naht liegt schon: `FooterMeta` nimmt `build`, `uptime` und `online` und lässt sie
auf `null` — `— NO DATA` ist der Zustand, den man bekommt, wenn man nichts sagt,
und G4 füllt drei Props, statt eine Fußzeile umzubauen. Der Weg dorthin ist
`/api/health`, wo `version` bereits liegt. Und ADR 0044 hat eine Warnung
hinterlegt, die G4 zuerst liest: **Kopf und Fußzeile nicht in `use cache`
wickeln** — ein `usePathname()` in einer gecachten Grenze friert die Antwort
einer Route ein und serviert sie allen.

---

## Vorher — 28.08.2026, G2 in Produktion

**Die Seite hat ihre Schrift und ihre sieben Paletten.** Chakra Petch, Geist und
JetBrains Mono liegen self-hosted im Image, das Theme steht vor dem ersten Paint,
und ein Klick färbt die Seite um. `sha-aefa8fe`, Merge 12:18:47 UTC, Deploy
12:22:52 UTC, 268 s, `ok`, vorher `sha-3d55bb2`. Gemessen an
`https://timseil.dev`, im Browser:

```
status ok · sha aefa8fe · v0.9.0
Fremd-Origins im Anfrageweg          []        keine, nicht nur keine von Google
Requests an gstatic/googleapis        0
woff2                                 5 Dateien, 99 480 B, alle same-origin
h1                                    Chakra Petch 62px
ohne gespeicherte Wahl                kein data-theme · rgb(10,14,20) · dark
prefers-color-scheme im Stylesheet    0 Regeln
Konsole                               leer
```

### `0 Regeln` ist der bessere Beleg als ein Blick auf einen Bildschirm

Die Entscheidung vom 28.08. — ohne gespeicherte Wahl immer Terminal Noir — hätte
man auch bestätigen können, indem man auf einen dunklen Laptop schaut und nickt.
Der Zweig, der Gruvbox Light lieferte, ist stattdessen **aus dem Stylesheet
verschwunden**: null Vorkommen von `prefers-color-scheme` in den ausgelieferten
17 513 Byte. Die Voreinstellung hängt damit nachweisbar nicht mehr am System,
statt auf einem Rechner nur zufällig richtig auszusehen.

Derselbe Griff hat eine Falle des Entwurfs mitgenommen. Terminal Noir hat keine
ID — es *ist* die Abwesenheit von `data-theme` —, und der Umschalter löscht das
Attribut für ihn. Solange der Media-Zweig existierte, landete ein Klick auf
„Terminal Noir" auf einem hellen Rechner in Gruvbox Light: **der Knopf tat das
Gegenteil seiner Beschriftung.** Die Entscheidung und der Entwurfsfehler hatten
dieselbe Reparatur.

### Der offene Fund aus G1 ist zu, und er hatte einen Zwilling

Link-Unterstrich, `::selection` und die zwei Puls-Schatten standen als
`rgba(0,229,255,…)` da und blieben in sechs von sieben Paletten cyan. Sie sind
jetzt vier abgeleitete Tokens, `color-mix(in srgb, var(--acc) N%, transparent)`
— eine Definition statt vier Werte × sieben Paletten. **Nachgemessen an der
laufenden Seite** mit `ts.theme=amber`: `rgb(12,10,7)` als Fläche, und der
Unterstrich trägt `srgb 1 .718 .29 / .35`, also den Amber-Akzent.

Der Zwilling saß eine Ebene tiefer und wäre ohne den Umschalter nie aufgefallen:
`--glow` stand nur in `:root`, und **nur die zwei hellen Paletten überschrieben
es**. In Mocha, Amber, Phosphor und Tokyo leuchtete also weiter Cyan neben einem
violetten, orangen oder grünen Akzent. `check-tokens.sh` konnte das nie sehen —
`tokens.css` ist die eine Datei, die es nicht liest. Danach ist die benannte
Ausnahme `ACCENT_LITERAL` aus dem Prüfskript gelöscht: eine Ausnahme für etwas,
das es nicht mehr gibt, erlaubt genau das Literal wieder, das gerade beseitigt
wurde.

### Was die Abnahme nicht behauptet

**Die dritte Abnahme des Bauplans, „CSP blockt das Snippet nicht", ist bis L4
trivial erfüllt und wird hier nicht als Häkchen geführt.** `web` setzt heute
keinen der L4-Header. G2 hat das Snippet nonce-*fähig* geschrieben —
`ThemeScript` nimmt die Prop, niemand übergibt sie —, und der Beleg entsteht in
L4. Eine trivial erfüllte Abnahme grün zu melden ist dieselbe Sorte Zahl, gegen
die Invariante 1 steht.

Der Grund für die Reihenfolge steht in ADR 0043 und ist ein Satz, den L4 und G4
beide brauchen: **ein Anti-Flash-Skript und eine vollständig vorgerenderte
HTML-Hülle schließen sich aus, sobald die CSP nonce-basiert ist.** Ein Nonce
heißt `headers()` im Root-Layout, und das nimmt jede Seite aus dem statischen
Pass — genau die Hülle, die G4 vorrendern will.

### Zwei Dinge, die erst CI beweisen konnte

`check-lint` war lokal rot und ist es immer noch: die Installation hier ist
v2.12.2, der Pin sagt v2.13.1. In CI steht `✓ golangci-lint v2.13.1`. **Eine rote
Lampe, die von der eigenen Umgebung kommt, ist keine rote Lampe** — aber sie
kostet jedes Mal die Minute, in der man das nachprüft.

Und die Standalone-Falle ist zum ersten Mal mit echten Font-Dateien geprüft
worden: `✓ .next/static and public are in the web image`. Im Image liegen 23
`.woff2` (252 192 B, alle `unicode-range`-Schnitte); ein lateinischer Text holt
fünf davon. Die anderen achtzehn kosten Plattenplatz und keine Bandbreite.

### Was die Abnahme gefunden hat

**Der aktive Schwatch des Umschalters ist in den zwei hellen Paletten
unsichtbar** — und zwar genau der aktive. Gemessen: Fläche, Rahmen und
Seitenhintergrund alle `rgb(239,241,245)`, Kontrast **1.00**. Ich hatte das als
offene Entwurfsfrage notiert; das war falsch. Der Bauplan sagt in Anhang B
„aktiv = volle Deckkraft **und Akzentrahmen**", `docs/design/README.md`
sagt „den Rahmen in **Akzentfarbe**" — nur der Code-Ausschnitt des Handoffs
schreibt die Schwatch-Farbe, und ich hatte den Ausschnitt höher gewichtet als
die zwei Sätze. `INDEX.md` sagt, wer gewinnt: der Bauplan. Mit `var(--acc)`
steigt der Kontrast auf **5.78** (Latte) und **5.82** (Gruvbox Light).
Eigener `fix/`-Branch, weil es ein Defekt auf der laufenden Seite ist.

**Als Nächstes:** G3 — Kopf (66/52 px, Logo, vier Einträge, `EN ▾`, Uhr), Fußzeile
in zwei Fassungen, mobiles Vollbild-Menü. Die Klassenhaken dafür stehen seit G1
ungenutzt in `layout.css`: `.nav-desktop`, `.nav-button`, `.foot-meta`,
`.sys-pin`, und der Kopf schaltet bei **900**, nicht bei 1080. Der Umschalter
zieht aus `page.tsx` in die Fußzeile, wohin er gehört. Die Uhr bringt ihre eigene
Hydration-Falle mit, und die Abnahme ist **null** Hydration-Warnungen.

---

## Vorher — 28.08.2026, G1 in Produktion

**Die Seite hat ihre Werte.** `web/styles/` trägt `tokens.css`, `globals.css` und
`layout.css` aus dem Handoff, Tailwind 4.3 zeichnet ausschließlich daraus.
`sha-68b2ae5`, Deploy um 06:01:19 UTC, 222 s, `ok`. Gemessen an
`https://timseil.dev`:

```
body       rgb(10,14,20) auf --ink-2      .col        1160px
h1         62px                            oklch       0 Vorkommen
[data-theme]-Blöcke im Stylesheet: 6 + der prefers-color-scheme-Zweig
```

**Die Default-Palette ist nicht abgestellt, sondern gelöscht.**
`@theme { --*: initial }` räumt 288 `--color-*`-Werte über 28 Namen weg, dazu die
erzeugende Abstandsskala und fünf Breakpoints; was danach steht, ist der Bestand
aus `tokens.css`. Das tragende Wort ist `inline`: die Utility bekommt
`var(--bg)`, nicht `#0A0E14` — sonst frören alle Utilities auf Terminal Noir ein
und der Umschalter aus G2 färbte nur handgeschriebenes CSS um.

### Die Abnahme hat zwei Hälften, und keine ist der Test der anderen

`styles/tailwind.test.ts` kompiliert das Stylesheet: `bg-blue-500`, `p-5`,
`rounded-lg`, `md:flex` erzeugen keine Regel, `bg-bg` löst auf `var(--bg)` auf.
Ohne `--*: initial` fallen drei der vier Tests um — nachgemessen, damit sie nicht
aus Versehen grün sind.

`tools/check-tokens.sh` liest stattdessen den Quelltext, **weil keine
Theme-Einstellung `bg-[#ff0000]` verhindern kann.** Neun Selftest-Fälle, in
`make check` und damit in CI: das Protokoll des Laufs auf `main` trägt
`✓ a hex outside tokens.css rejected`.

### Der stärkste Fund kam aus einer Abnahme, die ich zuerst falsch gefahren habe

`make quickstart` klonte im ersten Anlauf **`main` statt des Branches** —
`QUICKSTART_ORIGIN` war nicht gesetzt, also holte `git clone` die veröffentlichte
Fassung. Die Abnahme „von Null durchgelaufen" war damit über den falschen Baum,
und sie stand schon als grün gemeldet da.

Richtig gefahren fiel sie durch: acht API-URLs grün, `http://localhost:3000`
mit 500 und `Cannot find module '@tailwindcss/postcss'` — während `npm ls` im
Container das Paket zeigte. **Zwei Schichten:**

1. `node_modules` ist ein anonymes Volume, `.next` ein benanntes. `up --build`
   fasst keines an; die neue Abhängigkeit erreicht das Image und nie den
   Container.
2. Der erste gescheiterte Start kompiliert sich in `.next` hinein. Deshalb liest
   sich `--renew-anon-volumes` wie ein Fehlschlag: mit erneuerten anonymen
   Volumes weiter 500, nach `docker volume rm …_web-next` sofort 200.

`make dev` stempelt jetzt die Prüfsumme des Lockfiles und weist einen Start ab,
der sie bewegt hat. Bestätigt auf einem fremden Rechner: der `quickstart`-Job
auf `main` ist grün, alle neun URLs.

**Die Lehre ist nicht die Reparatur, sondern die Reihenfolge.** Eine Abnahme, die
den falschen Baum prüft, ist nicht „fast richtig" — sie ist eine erfundene Zahl
mit einem Häkchen daneben. Dieselbe Form wie die F5-Lehre: ich hatte gemeldet,
bevor ich nachgesehen hatte, woher der Beleg kommt.

### Was G1 gefunden und nicht repariert hat

`globals.css` malt Link-Unterstrich, `::selection` und den Puls-Schein mit
`rgba(0,229,255,…)` — dem Akzent von Terminal Noir, ausgeschrieben. Gemessen: die
Linkfarbe folgt dem Theme (`#00E5FF` → Latte `#7C2FD4` → Phosphor `#2EE6A6`), der
Unterstrich bleibt in allen sieben Paletten cyan.

### Zwei Entscheidungen, getroffen am 28.08.2026

- **Ohne gespeicherte Wahl startet die Seite immer in Terminal Noir**, auch bei
  `prefers-color-scheme: light`. Hell erreicht man über den Umschalter aus G2.
  Anlass: ein heller Rechner zeigte Gruvbox Light als ersten Eindruck, und die
  verbindliche Fassung soll die sein, die zuerst zu sehen ist. Gehört in den ADR
  von G2, nicht hierher — hier steht nur, dass sie gefallen ist.
- **Die vier Akzent-Literale werden in G2 repariert**, nicht später: der
  Umschalter macht aus dem Fund einen sichtbaren Fehler.

**Als Nächstes:** G2 — Fonts über `next/font/google`, das Anti-Flash-Snippet
(nonce-fähig geschrieben; die CSP selbst gehört zu L4, Bauplan Zeile 1325) und
der Theme-Weg mit `ts.theme` als einem der beiden erlaubten localStorage-Keys.

---

## Vorher — 27.08.2026, F5 gegen Produktion abgenommen

**Die Seite misst sich selbst.** `metric_snapshots` trägt seit heute Zeilen, die
kein Mensch eingesetzt hat, und der Uptime-Badge bewegt sich zum ersten Mal.
`sha-0f41f81`, gemessen um 18:51:53 UTC:

```
uptime90d   100          p95Ms       24.25
errorRate   0            measuredAt  2026-08-27T18:51:53.505Z
badge       "100.00%"    brightgreen
```

Die `0` bei `errorRate` ist der `or … * 0`-Zweig aus F3, in Produktion bis in
die Spalte durchgezogen: **gemessen, nicht leer.** Gegenprobe um 19:00 UTC, ein
Tick weiter, `measuredAt 18:56:53.499Z` — die Schleife tickt.

### Das Abnahmekriterium hat sich selbst vorgeführt, und niemand hat es gestellt

Die vier Logzeilen der ersten zwanzig Minuten, **gekürzt auf Zeitstempel,
Zustand und Werte** — die Zeilen selbst sind JSON, und aus der ersten ist die
Adresse des DNS-Servers entfernt, weil sie Host-Zustand ist:

```
18:36:53  not measured      dial tcp: lookup timseil-prometheus on <…>: server misbehaving
18:41:53  nothing measured
18:46:53  written           p95_ms 197.5   error_rate 0
18:51:53  written           p95_ms  24.25  error_rate 0
```

*(Dass hier „gekürzt" steht, ist die Lehre aus dieser Phase: im ersten Anlauf
stand in dieser Datei ein Ausschnitt, den so kein Lauf produziert hatte, als
„mechanisch nachgeprüft" ausgegeben. Ein zurechtgeschnittener Beleg ist in
Ordnung, solange der Schnitt dabeisteht.)*

**Der erste Lauf ist im DNS gescheitert.** Die Schleife läuft absichtlich sofort
beim Start (ADR 0019 §8: ein Prozess, der öfter neu startet als der Tick, misst
sonst nie) — und traf den Alias `timseil-prometheus`, während der
Prometheus-Container gerade neu erzeugt wurde. Beide waren dreizehn Minuten alt,
als wir nachsahen; sie sind gemeinsam hochgekommen.

Was daraufhin passierte, ist wörtlich das Abnahmekriterium aus Bauplan Zeile
1174: kein Absturz, keine erfundene Null, **keine Zeile geschrieben**, eine
WARN-Zeile, geheilt beim nächsten Tick. Der zweite Lauf sagt ehrlich `nothing
measured` — das Fünf-Minuten-Fenster war wirklich leer, der Deploy-Verkehr von
18:36:24 lag knapp davor. Erst der dritte hatte Verkehr.

**Das Labor konnte diesen Fall nicht erzeugen.** `make check-snapshots` stoppt
Prometheus absichtlich; hier ist er von selbst kurz nicht auflösbar gewesen, an
einer Stelle, an die niemand gedacht hatte. Eine Abnahme, die den Fehlerfall
provoziert, prüft die Reaktion. Diese hier hat sie *beobachtet*.

**Für F10 ist das eine Vorgabe:** jeder Deploy erzeugt diese WARN-Zeile. Ein
Alarm auf `not measured` würde bei jedem Deploy feuern — er gehört an die
Burn-Rate, nicht an einen Pager.

### Die Zahl, die stimmt und zu stark klingt

`uptime90d` steht auf **100**, und das Raster daneben sagt: **5 × `ok`, 86 ×
`nodata`** von 91 Zellen.

Arithmetisch ist die 100 richtig — ein Tag ohne Messung trägt zu keiner der
beiden Summen bei, das ist Invariante 6, und die Alternative (ihn als Ausfall
zählen) wäre die schlimmere Lüge. Rhetorisch trägt sie zu dick auf: der Badge
sagt „100.00 %" über 91 Tage, und gemessen wurden fünf. **Dieselbe Form wie der
Bucket-Fund aus F3** — die Zahl stimmt und behauptet mehr, als sie weiß.
Aufgeschrieben in `docs/slo.md`, nicht weggerechnet.

### Und der Grund dafür ist gemessen worden

Die externe Sonde läuft mit **einem Zehntel ihres Takts**. Über die letzten 100
Läufe, 81,4 Stunden, 24.08. bis 27.08.:

```
konfiguriert (3-58/5)   12 Läufe/h
tatsächlich              1,23 Läufe/h   =  10 %
Abstände                 min 13 · median 36 · max 660 Minuten
Abstände unter 6 min     0 von 99
```

**Der konfigurierte Fünf-Minuten-Takt ist kein einziges Mal erreicht worden.**
GitHub verwirft geplante Läufe unter Last; der Workflow-Kommentar ahnt es
(„GitHub's cron queue").

**Korrigiert bei der Triage am selben Tag:** hier stand „gemessen hatte es
niemand", und das war falsch. Am 24.08. war es schon gemessen und als
[#180](https://github.com/G1NG4R/timseil-dev/issues/180) eingetragen — 41 Läufe
in 23,66 h, 14 %, echtes Intervall 35 Minuten, mitsamt derselben
`down_sec`-Folge und demselben Faktor. Ich hatte `backlog.md` gelesen, wie
CLAUDE.md es verlangt, und **nie in den Issue-Tracker gesehen** — die andere
Hälfte desselben Gedächtnisses, und genau die, in die eine Triage einräumt.

Was von der heutigen Messung bleibt, ist eine **zweite, größere Stichprobe, die
zeigt, dass es schlechter geworden ist**: 10 statt 14 %, dazu ein Extremwert von
elf Stunden und die Zeile, die es am schärfsten sagt — 0 von 99 Abständen unter
sechs Minuten. Als Kommentar an #180 angehängt, nicht als zweites Issue.

**Als Nächstes:** Stufe F triagieren (F6–F11 liegen hinter dem Launch) und die
Sondenkadenz entscheiden.

---

## Vorher — 27.08.2026, F5 gebaut und im Labor abgenommen

**Die Seite hat ihre drei Zahlen — jetzt wirklich auf der Seite.** Seit B2 gibt
es `metric_snapshots`, seit F3 rechnen die Regeln, und dazwischen lag nichts.
`internal/snapshots` schließt die Lücke: alle fünf Minuten eine Instant-Query,
eine Zeile nach Postgres, und am Verhalten des Lesepfads änderte sich nichts.
Im Labor über den Proxy abgefragt, den Weg eines Besuchers:

```
"ops": { "uptime90d": 99.65277777777779,
         "p95Ms": 63.88418079096048,
         "errorRate": 0,
         "measuredAt": "2026-08-27T17:48:38.452Z" }
```

**Zwei der drei Zahlen sind gemessen, die dritte nicht — und das gehört hierhin
und nicht achtzig Zeilen weiter unten.** `p95Ms` und `errorRate` stammen aus
Prometheus, das k6-Last durch denselben Proxy gesehen hat. `uptime90d` **kann**
im Labor nicht gemessen sein: es kommt aus `ops_days`, dort füllt die externe
Sonde, und die hat ein Labor nie geprüft. Für diese eine Abfrage habe ich zwei
`ops_days`-Zeilen von Hand eingesetzt (574 von 576 Prüfungen), nachgerechnet
(`574/576·100 = 99.65277777777779`, auf die letzte Stelle) und danach wieder
gelöscht. Der Weg ist damit belegt, der Wert nicht — den belegt erst Produktion.

Die `0` in der dritten Zeile ist dagegen gemessen und nicht leer — der
`or … * 0`-Zweig aus F3, jetzt bis in die Spalte durchgezogen.

### Der stärkste Fund — und er stand seit F3 als Vertrag im Runbook

**`uptime90d` kann nicht aus Prometheus kommen. Nicht „sollte nicht" — kann
nicht.** Das Mapping, das F3 aufgeschrieben und ADR 0040 §4 unterschrieben hat,
lautete `timseil:service:availability_5m → Metrics.uptime90d, von F5 über 91
Tage aggregiert`. Dieser Prometheus hält **sieben Tage**
(`--storage.tsdb.retention.time=7d`, seit F2, aus gutem Grund: dieselbe Platte
wie Postgres). Eine 91-Tage-Frage ist an eine 7-Tage-Datenbank nicht zu stellen.

Das Unangenehme daran ist nicht der Fehler, sondern seine Form. **Beide Zahlen
waren einzeln richtig und beide standen aufgeschrieben** — die Retention in
`compose.yaml` mit Begründung, das Fenster im Contract mit Begründung. Es gab
keinen Ort, an dem sie nebeneinander standen. Geschrieben hat ihn **eine** Phase,
in zwei Dokumenten — und die nächste hat ihn geglaubt: der Plan für F5 trug das
Mapping als Tatsache, bis die Retention nachgerechnet war. Ein Vertrag, den zwei
Dokumente tragen und eine zweite Phase übernimmt, ist keine Prüfung.

Und die Antwort wäre mit unendlicher Aufbewahrung dieselbe: `availability_5m`
ist **Request**-Verfügbarkeit und blind für den Ausfall, in dem gar nichts
ankam — in dem ist dieser Prometheus selbst tot, er teilt sich den Host.
ADR 0040 §4 hat genau das schon geschrieben und die Entscheidung offen an F5
gegeben. `uptime90d` kommt jetzt aus `ops_days`, also aus der externen Sonde aus
F4, gerechnet in SQL. ADR 0041 §1.

### Die Zeile, die nicht geschrieben wird

Das Abnahmekriterium der Phase ist ein Satz über einen toten Messteil: *„die
Seite zeigt weiter den letzten gültigen Wert mit Alter, statt zu brechen oder
eine Null zu erfinden"*. Er hängt an einer einzigen Entscheidung.

`00005_metrics.sql` **erlaubt** eine Zeile mit drei `NULL` und erklärt sogar,
was sie bedeutete. `LatestMetrics` liest aber `ORDER BY measured_at DESC LIMIT
1` — eine frische Leerzeile wäre die jüngste Messung und verdrängte die letzte
gültige Zahl von der Seite. Die Abnahme wäre grün gewesen (nichts bricht, keine
Null erfunden) und die Seite hätte trotzdem `— NO DATA` gezeigt, während ein
echter Wert danebenlag.

Also: **eine Zeile entsteht nur, wenn mindestens einer der beiden
Prometheus-Werte gemessen wurde.** Fällt Prometheus aus, wird gar nichts
geschrieben — auch nicht die Verfügbarkeit, die aus `ops_days` vorläge. ADR 0041
§5. Mechanisch nachgeprüft, `make check-snapshots`:

```
observability
  ✓ the site serves its own measurement — uptime90d=null p95Ms=63.25757575757572 errorRate=0 at 2026-08-27T17:47:43.318Z   (uptime90d comes from ops_days; a lab has no external probe)
  ✓ prometheus stopped
  ✓ the api starts and answers without prometheus
  ✓ the same values, the same measuredAt — the page ages instead of going blank
  ✓ the failed run is in the log (0 → 1)
  ✓ prometheus back up
  ✓ tools/check-observability.sh --snapshots
```

`uptime90d=null` ist hier richtig und nicht dasselbe wie oben: dieser Lauf hat
keine Zeilen von Hand bekommen. Das Skript sagt den Grund selbst dazu, statt
einen Haken zu setzen, den jemand deuten muss.

### Zwei Regelsätze statt einer Wahl in Go

Der Contract hat je ein `p95Ms` und ein `errorRate`, Traefik liefert zwei
Dienste. Wo aus zwei Zahlen eine wird, entscheidet, was die Zahl **bedeutet**:
das Maximum in Go wäre eine obere Schranke und für eine Quote nicht „Anteil der
5xx an allen Anfragen", was der Contract wörtlich sagt; nur `web` zu lesen
verschwiege einen 500 aus der eigenen API. `slis.yml` bekommt deshalb zwei
`timseil:site:*`-Regeln, die über die **Anfragen** summieren statt über die
Dienste. Die drei aus F3 bleiben unverändert — sie tragen das `service`-Label,
nach dem F9 schneidet und F10 alarmiert. ADR 0041 §2.

Nebeneffekt, und er war die zweite offene Stelle aus ADR 0040: **die Zuordnung
Service → System-Slug ist damit der Regex in der Regel.** In Go steht keine
Tabelle, die zwei Traefik-Namen auf einen Slug abbildet.

### Was das Labor nicht beweisen konnte

`uptime90d` ist im Labor `null`, und das ist richtig: dort hat nie eine externe
Sonde gemessen. Bewiesen ist deshalb der **Weg**, nicht der Wert — die
Arithmetik gegen echtes Postgres (acht `//go:build db`-Tests, darunter der
Zaunpfahl bei Tag 90 gegen Tag 91 und die gemessene Null gegen die fehlende),
und die Strecke bis auf die Seite mit den beiden Zeilen von oben.

**Offen: die Abnahme gegen Produktion.** Dort trägt `ops_days` echte
Sondenmessungen, und erst dort bewegt sich der Uptime-Badge zum ersten Mal.

### Was sonst noch dabei herausfiel

- **`docs/slo.md`** ist ab jetzt die verbindliche Fassung der SLOs — mit der
  Abfrage hinter jedem SLI, dem Fenster, und dem, was jeder *nicht* sehen kann.
  Anhang A und Handbuch-Kapitel 28 verweisen darauf.
- **Zwei Sätze im Runbook waren falsch**, beide seit F3, beide unten in
  „Gefunden".
- **`tools/check-rule-names.sh`** hält die **zwei** Namen, die der Go-Code
  abfragt, gegen `slis.yml` — und seit der Kontrolle auch die Gegenrichtung, auf
  `timseil:site:*` beschränkt: eine Site-Regel, die niemand liest, ist derselbe
  Defekt von hinten. Die drei per-Dienst-Regeln bleiben ausgenommen, sie warten
  auf F9 und F10. Zweites Gate dieser Form nach `check-probe-cadence.sh`, und
  der Auslöser stand auch hier vorher fest: ADR 0040 §4 hat einen Preis auf ein
  Umbenennen gesetzt, bevor jemand umbenannt hat.

### Und der zweitstärkste Fund war die Kontrolle selbst

**Vor dem Push lief ein zweiter Durchgang über den fertigen Diff, und er hat
einundzwanzig Sachen gefunden** — kein einziger Laufzeitfehler, aber zwei echte
Codefehler und, unangenehmer, mehrere falsche Sätze *über* richtigen Code. Die
drei, die weh tun:

1. **Im Backlog stand ein `check-snapshots`-Ausschnitt, den es so nie gab.**
   Gerundet (`p95Ms=48.70`), zwei Zeilen weggelassen, die Fußnote des Skripts
   entfernt — als „mechanisch nachgeprüft" ausgegeben. Ein von Hand geglätteter
   Beleg in einer Datei, deren erster Absatz sagt, dass jede Behauptung an einen
   Beleg gebunden ist. Ersetzt durch die wörtliche Ausgabe zweier Läufe.
2. **Die WARN-Zeile für einen unmöglichen Wert konnte den Wert nicht drucken.**
   `slog` marshalliert `float64` über `encoding/json`, und das lehnt `±Inf` ab —
   herausgekommen wäre `"value":"!ERROR:json: unsupported value: +Inf"`. Genau
   die eine Zahl, für die die Zeile existiert. Der Test daneben prüfte nur den
   Zustand und lief grün darüber hinweg. Beides repariert; der neue Test fällt
   gegen den alten Code, nachgestellt.
3. **`--snapshots` konnte beim zweiten Lauf hintereinander leer grün werden.**
   `docker compose restart` behält das Log, also erfüllte die Zeile des ersten
   Laufs die Prüfung des zweiten. Jetzt wird gezählt statt gesucht — die Ausgabe
   oben zeigt `(0 → 1)`, der Lauf direkt danach `(1 → 2)`.

Dazu ein Wettlauf im selben Skript, der im schlimmsten Fall **den Fehler
gemeldet hätte, den diese Phase verhindert**: `force_run` wartete darauf, dass
`/api/health` antwortet, nicht darauf, dass der Lauf fertig ist. Fiel das INSERT
zwischen die beiden Messungen, meldete das Skript „a failed run wrote a row and
pushed the last good measurement off the page". Jetzt wartet es auf die Logzeile
der Schleife.

Der Rest waren Zahlen und Verweise: „a month ago" für drei Tage, „zwei Phasen"
für zwei Dokumente aus einer, „neun Zeilen auseinander" für zweiundzwanzig,
0,17 Prozentpunkte statt 0,16, `Loki` statt der TSDB, und ein ADR über 91 Tage,
dessen **Dateiname `neunzig` sagte**.

**Die Lehre ist dieselbe wie der Hauptfund, eine Etage höher:** Der Text über
eine Messung driftet leichter als die Messung. Und niemand prüft ihn — es gibt
kein `make check` für einen Absatz.

### Und CI fand zwei weitere, die beide Durchgänge nicht sehen konnten

**Der lokale Linter kann hier seit Go 1.26 nicht mehr urteilen** — v2.12.2
stürzt beim Laden ab, gepinnt ist v2.13.1. Drei Runden lang hieß „`make check`
grün außer `check-lint`" deshalb *ungeprüft*, nicht *in Ordnung*. CI hat den
Unterschied bezahlt:

1. **ST1005**, an einem Fehlertext, der mit `Get "http://…` beginnt — die
   wörtliche Ausgabe von `http.Client`. Repariert nicht mit `//nolint`, sondern
   mit dem echten Typ: `&url.Error{Op: "Get", …}`. Das ist ohnehin genauer, weil
   `errors.Is` und `errors.As` sich dann verhalten wie in Produktion.
2. **Ein Wettlauf in meinem eigenen Test.** `TestTheFirstRunHappensBeforeTheFirstTick`
   wartete darauf, dass die Zeile in der Datenbank steht, und las dann das Log —
   `runOnce` schreibt aber erst die Zeile und protokolliert danach. Auf dem
   Laptop einen Tag lang grün, in CI rot. Jetzt wartet **jeder** Test dieser
   Datei auf die Logzeile, mit der ein Lauf endet, statt auf einen Zwischenstand
   plus 20 ms Schlaf. 200 Durchläufe und `-race` grün.

Der zweite ist der unangenehmere: **ein Test, der auf das falsche Ereignis
wartet, ist kein Test, sondern eine Wette** — und er hat genau die Phase
beschädigt, die davon handelt, dass eine Zahl an einen Beleg gebunden sein muss.

**Als Nächstes:** F5 gegen Produktion abnehmen, dann Stufe F triagieren — F6–F11
liegen hinter dem Launch.

---

## Vorher — 26.08.2026, F3 abgenommen: Labor und Host

**Seit heute hat die Seite ihre drei Zahlen — als Regel, noch nicht auf der
Seite.** `Metrics.p95Ms`, `Metrics.errorRate` und `Metrics.uptime90d` haben ab
jetzt je eine Recording Rule über `traefik_service_*`, und die Namen sind ein
Vertrag mit F5. Sechs Scrape-Jobs statt drei, alle mit Daten:

```
✓ all scrape jobs up — 6 jobs: alloy loki node postgres prometheus traefik
✓ timseil:request_duration_seconds:p95_5m → api=0.0975  web=0.0983
✓ timseil:requests:error_ratio_5m         → api=0       web=0
✓ timseil:service:availability_5m         → api=1       web=1
```

Die Null in der zweiten Zeile ist der Punkt: sie ist **gemessen**, nicht leer.
Der `or … * 0`-Zweig ist genau dafür da, und ohne ihn wäre „keine Fehler" als
„nicht gemessen" auf der Seite gelandet.

**Die Vorbedingung ist gelöst, auf beiden Seiten.** Nicht wir gehen ins
`dokploy-network`, Traefik kommt zu uns ins `observability-network` — unter dem
Alias `timseil-traefik`, den `prometheus.yml` scrapt. Im Labor bewiesen
(`job=traefik` up, 135 Serien) und auf dem Host angehängt.

**Die offene Haltbarkeitsfrage ist beantwortet, und die Antwort ist genauer als
die Befürchtung.** Der Proxy ist ein einfacher Container, kein Swarm-Dienst. Die
Anbindung **übersteht einen `docker restart`** — sie steht in der Container-Config
des Daemons, nicht im Startbefehl. Was sie nicht übersteht, ist ein Neuerzeugen
des Containers, also ein Dokploy-Upgrade. Die Lektion vom 24.08. war ein
*Redeploy*, kein Neustart; die Unterscheidung ist der ganze Unterschied.
Betriebsfest, nicht upgradefest — **der Relay-Fallback aus ADR 0040 bleibt
ungebaut.**

### Der stärkste Fund — und er hat die Abnahme bestanden

**Das Abnahmekriterium war erfüllt und die Zahl trotzdem keine Messung.**
Verlangt war „ein p95, der zu einem k6-Lauf passt": Regel 98 ms, k6 75 ms,
gleiche Größenordnung. Was stutzig machte, war die Richtung — Traefik misst
*weniger* als k6 und lag trotzdem höher.

Traefiks Standard-Buckets sind `0.1, 0.3, 1.2, 5.0` Sekunden. **7582 von 7896
Anfragen lagen im ersten Bucket.** `histogram_quantile` interpoliert dann linear
zwischen 0 und 100 ms — die Zahl ist Arithmetik auf einer Bucket-Kante, und
keine einzelne Anfrage wurde je mit irgendeiner Dauer beobachtet, nur mit
„unter 100".

Das ist Invariante 1 in dem einen Kostüm, das sie nicht erkennt: **kein
fehlender Wert, der sich als vorhanden ausgibt, sondern ein vorhandener, den
keine Beobachtung stützt.** Jeder Wächter im Repo sucht nach dem ersten Fall.

Repariert mit Prometheus' eigenen Default-Buckets, in `compose.lab.yaml` und im
Runbook für die statische Konfiguration des Hosts. Die Abnahme danach, 6 Minuten
Last damit das 5-Minuten-Fenster voll ist, 14 156 Anfragen, 0 % Fehler:

```
k6    http_req_duration p(95)                    72,54 ms
Regel timseil:request_duration_seconds:p95_5m    74,62 ms
```

**Zwei Millisekunden, und die Richtung ist erklärbar** — Traefik misst weniger
als k6 und liegt trotzdem darüber, weil innerhalb des Buckets interpoliert wird.
Der Fehler wohnt an den Bucket-Kanten, und die belastbare Aussage lautet „auf
einen Bucket genau", nicht „72 ms".

**Derselbe Fehler steht eine Etage tiefer noch da, bewusst:** `/api/health`
antwortet in ein bis zwei Millisekunden, liegt damit im untersten Bucket, und
die Regel liefert `0,00475` — wieder eine Interpolation. Traefik nimmt eine
Bucket-Liste, nicht eine je Dienst; die Zahl der Seite ist die des Proxys über
die Seite. Aufgeschrieben statt repariert. Ausgeschrieben in Beitrag 005.

### Und gegen Produktion, am 26.08.

**Der Fund gilt auch dort — und ist dort inzwischen repariert.** Traefik hängt
im `observability-network`, Alias `timseil-traefik`, angehängt ohne Neustart.
Vorher: Voreinstellung `0.1, 0.3, 1.2, 5.0` und **177 von 181** Beobachtungen im
ersten Bucket. Nachher, mit derselben Liste wie im Labor:

```
le=0.005  0     le=0.05   21     ← 19 Beobachtungen in (0.01, 0.025]
le=0.01   0     le=0.075  22     ←  2 in (0.025, 0.05]
le=0.025  19    le=0.1    22     ←  1 in (0.05, 0.075]
```

p95 jetzt 48,4 ms, interpoliert zwischen 0.025 und 0.05 — **immer noch eine
Interpolation**, aber über ein 25-ms-Band mit Beobachtungen auf beiden Seiten
statt über ein 100-ms-Band mit einer Untergrenze von 0. Vorher war das Ergebnis
eine Funktion der Bucket-Wahl, jetzt bewegt es sich mit der Latenz.

**Was diese Zahl nicht ist:** n = 22, alles `code=200 GET`, in Sekunden erzeugt.
Das ist „Auflösung bestätigt", keine Latenz-Baseline — die ergibt sich erst aus
Stunden echtem Verkehr.

**Die Haltbarkeitsfrage ist beantwortet.** `docker restart dokploy-traefik`, und
`observability-network` steht danach unverändert in der Netzliste, belegt an
einer frischen `StartedAt`. Betriebsfest, nicht upgradefest — der Relay-Fallback
aus ADR 0040 bleibt ungebaut.

### Abgenommen gegen Produktion, 26.08.2026, 19:56 UTC

**Sechs Jobs, alle `1`** — `prometheus alloy loki traefik node postgres`. Acht
Container laufen, die zwei neuen Exporter inklusive.

Und die Abnahme selbst, beide Richtungen der Invariante in einer Abfrage:

```
timseil-web@docker    p95 0.0246   error_ratio 0     availability 1
timseil-api@docker    p95 NaN      error_ratio NaN   availability NaN
```

**`web` ist gemessen und liefert eine echte Null** — der `or … * 0`-Zweig
greift. **`api` ist nicht gemessen und liefert `NaN`**, weil die Anfragen nur
auf `/` gingen; die Regel erfindet dafür keine Null. Genau der Unterschied, den
Invariante 1 verlangt, gegen Produktion statt gegen das Labor.

Davor stand dieselbe Abfrage dreimal auf `NaN` — der letzte Verkehr war der
Deploy-Verify, das 5-Minuten-Fenster war leer. Auch das ist die richtige
Antwort, und der Übergang `NaN → 0` ist der eigentliche Beweis.

### Zwei Dinge, die der Deploy nebenbei gelehrt hat

**Der Merge löst die Pipeline sofort aus.** „Command-Feld nach dem Merge" war
die falsche Reihenfolge — das Feld gehört zwischen den grünen PR-Lauf und den
Merge. Der `deploy`-Job scheiterte deshalb einmal mit *„the panel does not run
the rollout this repository defines"*, und das ist die Sperre bei der Arbeit:
sie hielt an, **bevor** irgendetwas lief, die Seite blieb auf dem alten Build.
Kostet einen Wiederholungslauf.

**„Deploy grün" und „die Dienste laufen" sind zwei Aussagen**, und die erste
Messung danach zeigte `node-exporter` und `postgres-exporter` als fehlend, dazu
die Zwillinge noch am Leben. Kein Fehler — die Abfrage fiel mitten in den
Rollout, `deploy.sh` verifiziert nur api und web, Schritt 4 und 5 laufen danach
weiter. Eine Minute später war alles da. **Der Reflex, den ersten Blick zu
melden, wäre der F2-Fehler mit umgekehrtem Vorzeichen gewesen.**

**Als Nächstes: F5** — SLO-Definition und die PromQL-Snapshots nach Postgres.
Erst dort verlassen die drei Zahlen Prometheus und erreichen die Seite;
`Metrics.*` steht bis dahin weiter auf `null`, und das ist so geplant.

---

## Vorher — 24.08.2026, F2 gegen Produktion abgenommen

**Der Stack läuft auf dem Host, und die Abnahme lief in Grafana statt in einem
Skript.** Beide Hälften:

```
up  →  job="prometheus"  job="alloy"  job="loki"      alle 1
{service="api"}  →  JSON-Zeilen mit level, msg, trace_id
```

**Was die zweite Hälfte nebenbei beweist, und es ist mehr als F2 versprochen
hat.** Die angezeigte Zeit `21:58:54.513` (CEST) und das Feld
`"time": "2026-08-24T19:58:54.513388797Z"` sind dieselbe Zeit — **der
gespeicherte Zeitstempel ist der aus der Zeile**, nicht der des Ingests, und
zwar in Produktion statt gegen eine Vorrichtung. Die Nanosekunden aus Go stehen
unversehrt darin. Das war der offene Punkt aus F1a, und er ist damit zweimal
belegt.

Sichtbar sind außerdem die drei Hintergrundschleifen mit ihrer Korrelation —
`contact dispatch`, `ops roll-up`, `contributions refresh`, jede mit `trace_id`.
F1s Arbeit, zum ersten Mal von außen gelesen statt behauptet.

**`job="crowdsec"` steht nicht dabei**, und das ist der eigentliche Beleg dieser
Session: die Datasource hängt über den Alias an *unserem* Prometheus. Ohne den
Alias hätte genau dort der Nachbar geantwortet.

### Was diese Abnahme gekostet hat — vier Fehler, alle im Aufgeschriebenen

Nicht einer davon war im Gebauten. Alle vier standen in Dokumenten, die
behaupteten, was gilt, und die niemand ausgeführt hatte:

1. **Der Rollout startete die drei Dienste nie.** Grün, ausgeliefert, nicht
   gelaufen. Eigener Eintrag unten, dazu `tools/check-rollout.sh`.
2. **`up{stack="timseil"}` kann nie etwas liefern** — `external_labels` hängen
   nur an Daten, die den Server verlassen.
3. **Der Config-Beleg widersprach seinem eigenen Fließtext** (zwei `sha256sum`).
4. **Die Abnahme hätte die eigenen Rollout-Zwillinge als fremd gemeldet.**

Die Gemeinsamkeit ist benennbar: **jede dieser Zeilen war geschrieben und nie
ausgeführt worden.** Der 5-GB-Lauf war gemessen, die Grenzen waren gemessen —
aber der Weg von „gemergt" zu „läuft und wird gelesen" bestand aus Sätzen. Das
ist die Lehre dieser Stufe, und sie gehört in den Beitrag zu F2.

---

## Vorher — 23.08.2026, F2 gebaut

**Seit heute hebt etwas die Zeilen auf, und die Grenze darauf ist gemessen.**
Drei Container mehr: `prometheus`, `loki`, `alloy` — keiner davon mit einem
`depends_on` in seine Richtung, weil die Seite weiterläuft, wenn alle drei weg
sind.

```
✓ prometheus scrapes itself, alloy and loki — all up
✓ loki holds alloy api db loki prometheus web
✓ api: the stored timestamp is the one in the line (2026-08-23T18:51:43.363325483Z)
✓ web: the stored timestamp is the one in the line (2026-08-23T18:51:43.398Z)
```

**Der offene Punkt aus F1a ist damit geschlossen** — Nanosekunden aus Go,
Millisekunden aus Node, beide mit *ihrer eigenen* Zeit in Loki statt mit der des
Ingests. Gemessen gegen die echten Produzenten, nicht gegen eine Vorrichtung.

### Der Fund, und er ist eine Korrektur am eigenen Plan

**Loki hat keine größenbasierte Retention.** Bauplan Kapitel 10 und ADR 0007
verlangen beide eine „Compactor-Grenze ~5 GB" — die Einstellung existiert nicht.
Lokis Retention ist ausschließlich zeitbasiert. Prometheus hat
`--storage.tsdb.retention.size`, Loki hat keine Entsprechung, und eine Zeile in
unserer Konfiguration, die so täte, wäre ein Limit, das durchgesetzt *aussieht*.

Die Decke ist deshalb eine **Rate**, kein Volumen: `per_stream_rate_limit` gegen
den Amoklauf, `ingestion_rate_mb` gegen denselben Flood über mehrere Streams,
die 14 Tage für den Dauerbetrieb. Der Bauplan bleibt unverändert (ADR 0027 §2);
korrigiert wird ADR 0039 und das Runbook, also das, was behauptet, was **gilt**.

### Der zweite Fund kam erst durch die Abnahme, und er hat den Entwurf geändert

Der erste 5-GB-Lauf war **grün und trotzdem falsch**:

| | nur das Loki-Limit | mit Limit an beiden Enden |
|---|---|---|
| `loki-data` | 2 MB | 6 MB |
| **`alloy-data`** | **76 MB** | **3 MB** |
| von Alloy gelesen | 645 022 Zeilen | 1 182 325 |
| an Loki gesendet | 2 379 | 11 606 |
| im Collector verworfen | 0 | 1 162 520 |

Loki hielt seine Grenze und wuchs um 2 MB — der Rückstau lag danach im
Write-Ahead-Log des Collectors, achtunddreißigmal so groß wie der Speicher, den
die Grenze geschützt hatte, **auf derselben Platte wie Postgres**. Ein
Rate-Limit am Ziel entfernt keinen Druck, es verschiebt ihn. Also steht dieselbe
Decke jetzt auch an der Quelle (`stage.limit`, 500 Zeilen/s je `service`,
verwerfend). Beide Zahlen bewegen sich zusammen, und beide Dateien sagen das im
Kommentar.

**Was die Abnahme nicht beweist**, und es steht bewusst hier statt als Haken:
Rate × Retention sind keine 5 GB. Der über Tage gehaltene Flood wächst weiter —
kein Loki-Schalter schließt das, der Wächter dafür ist der Disk-Alarm bei 70 %
aus **F10**.

### Ein dritter Fund, klein und übertragbar

`discovery.docker` liefert **ein** Ziel je Container, nicht eins je
Container-Netz-Paar. Die Regel, die Duplikate von api und web verhindern sollte,
behielt nur Ziele im `*_default`-Netz — und ließ damit genau die Container
durch, die **ein** Netz haben. Vier von sechs Diensten fehlten, der Stack war
grün, Loki halb leer. Die Regel ist weg; die Messung steht als Kommentar in
`ops/alloy/config.alloy`. Ein Duplikat, das man nicht gemessen hat, ist ein
Duplikat, gegen das man keinen Filter schreiben sollte.

**Der Socket ist die eine Ausnahme dieses Repositories**, und sie ist eng: ein
Dienst, ein literaler Pfad, `:ro` erzwungen, drei Selbsttests. Read-only macht
ihn enger, nicht sicher — ADR 0039 §3 sagt das, statt es zu umschreiben.

**Gegen den Host geprüft ist noch nichts.** Der 5-GB-Lauf lief lokal gegen
dieselbe Datei, die dort laufen wird; auf dem Host folgt ein Hash-Vergleich der
geladenen Konfiguration, keine zweite Messung.

**Die drei Fragen an den bestehenden Prometheus sind beantwortet, das Ergebnis
steht nicht hier.** Ausgang, soweit er die Aufgabe betrifft: die Vorbedingung
für den Host-Teil ist erfüllt, es wird nichts doppelt gescrapt, und dabei sind
drei Punkte aufgefallen, die nicht F2 sind und nicht hierher gehören.

**Als Nächstes: ein Alias, dann der Host-Teil von F2** (Netz anlegen, Grafana
anhängen, zwei Datasources, Config-Hash), dann F3, F5.

---

## Vorher — 23.08.2026, F2 ist entblockt

**Gegen [#147](https://github.com/G1NG4R/timseil-dev/issues/147) gemessen, das
Ergebnis steht nicht hier.** Es ist Ist-Stand dieses Hosts und liegt in der
lokalen Datei; öffentlich gehört die Aufgabe und ihr Ausgang, nicht der Zustand.

**Der Ausgang, in drei Sätzen:**

1. **Die Grenzen aus ADR 0027 halten.** `db`, `api` und `web` liegen alle weit
   unter ihrem Limit — nachgetragen als §3a dort, mitsamt dem, was die Messung
   *nicht* beweist: sie war Leerlauf, die Gegenprobe unter Last gehört zu L8.
2. **RAM und Platte sind kein Engpass.** Das war die Sorge, mit der #147
   aufgemacht hat, und beide Antworten sind entspannt genug für F2.
3. **Punkt 1 von #147 ist beantwortet: es gibt eine bestehende Grafana.**

**Damit ist die Entwurfsfrage entschieden, die der Bauplan offengelassen hatte.**
Er sagt an einer Stelle „Prometheus und Loki im selben Dokploy-Stack" und an
anderer „bestehende Grafana-Instanz einbinden. **F2 macht beides:** eigener
Prometheus, eigener Loki, Alloy als Collector im eigenen Stack — die bestehende
Grafana als Oberfläche, mit unseren Datasources.

Der Grund ist ADR 0027s eigene Haltung: **eine Grenze, die wir behaupten, muss
von uns durchgesetzt werden.** F2s Abnahmekriterium ist „ein künstlich erzeugtes
5-GB-Log löst das Limit aus, statt die Platte zu füllen" — das prüft nur etwas,
wenn das Limit in unserer Konfiguration steht und nicht in der eines fremden
Stacks auf derselben Maschine.

**Der Bauplan wird dabei nicht angefasst.** Kapitel 10 trägt drei Zahlen, die die
Messung widerlegt; sie bleiben stehen. ADR 0027 §2 sagt warum: „den Plan an die
Umsetzung anzupassen löscht die Spur dessen, was sich geändert hat." Korrigiert
wird das Dokument, das behauptet, was **gilt** — nicht das, was **geplant war**.

**Als Nächstes: F2a** — der Stack läuft. Dann F2b (die Grenzen sind bewiesen),
F3, F5.

---

## Vorher — 23.08.2026, F4 abgenommen

**F4 ist gemergt und in Produktion belegt.** [#169](https://github.com/G1NG4R/timseil-dev/pull/169),
`dbea559`, Release **`v0.4.0`**, Deploy `ok … 249 s`, gemeldet 14:40:48 UTC.

**`INTERNAL_PROBE_TOKEN` ist bewiesen** — die erste Benutzung überhaupt, seit
E5c als offener Punkt geführt. Der Lauf sagt beides in einer Zeile:

```
probe up https://timseil.dev 489ms
```

`up` heißt hier `GET /` → 200 **und** `POST /api/internal/probe` → 204. Ein
falscher Token hätte den Lauf mit „misconfiguration, not an outage" rot beendet
und **nichts** geschrieben.

**Die Sonde läuft von selbst.** Erster geplanter Lauf 14:56:27 UTC,
`event: schedule`, ohne dass jemand ihn angestoßen hat. **Belegt ist damit das
Anlaufen, nicht die Kadenz** — dazu unten ein offener Punkt, denn die Kadenz ist
der Faktor in `down_sec`.

**Der Beleg steht auf der Seite und ist von außen nachzählbar:**

```
GET https://timseil.dev/api/systems/timseil-dev
vorher :  byState = {"nodata": 91}
nachher:  byState = {"nodata": 90, "ok": 1}
          days[-1] = {"d":"2026-08-23","state":"ok","downSec":0}
```

90 + 1 = 91. Invariante 7 hält.

**`make check-deployed --host`: 10 von 10 Behauptungen**, darunter die zwei, die
nur der Host machen kann — die laufenden Container **sind** die veröffentlichten
Digests, für api und für web.

**Die Zeitreihe auf dem Host, und sie sagt mehr als „grün":**

```
14:40:59  uptime backfill  no log yet     ← Lauf beim Start
14:45:59  ops roll-up      days: 0
14:47:58  ← Sondenzeile (workflow_dispatch)
14:50:59  ops roll-up      days: 1        ← das Raster kippt
14:55:59  uptime backfill  no log yet     ← exakt 15 min nach dem ersten
14:56:34  ← Sondenzeile (schedule)
```

Die 15-Minuten-Kadenz aus `policy.go` ist damit gegen die Uhr belegt, nicht gegen
den Code. `ops_checks` trägt **2 Zeilen, beide `origin = probe`**, keine
`backfill` — richtig, es gab keinen Ausfall. Dass `ops_days.checks_total` bei der
Messung auf **1** stand, ist kein Fehler: der Roll-up lief 14:55:59, die zweite
Zeile kam 14:56:34. Das Raster darf bis zu fünf Minuten hinter den Daten liegen,
`aggregateEvery` ist genau dafür auf `ProbeInterval` gesetzt.

---

### **Tag 1 von 91 ist der 23.08.2026**

Das ist die Zahl, die diese Phase eigentlich liefert. Ab hier ist jede Zelle im
Betriebsraster gemessen. Der Bauplan (Zeile 1481) verlangt **≥ 7 Tage vor
Launch** — frühestes ehrliches Launch-Datum für das Raster: **30.08.2026.**

---

**Was nicht abgenommen ist, und es steht bewusst hier statt als Haken:**

- **Die Backfill-Hälfte.** Sie braucht einen echten Ausfall. Bewiesen gegen einen
  echten Postgres und gegen die Datei, die `probe.sh` selbst geschrieben hat —
  Produktionsbeweis liegt auf **M1**.
- **`source_ref`.** Entsteht erst bei einer Wiedereinspielung, also mit demselben
  Ausfall.
- **Der Uptime-Badge bewegt sich nicht.** `uptime90d` ist weiter `null`, er liest
  `metric_snapshots` — das baut **F5**.

**Als Nächstes: die Messung vor F2** ([#147](https://github.com/G1NG4R/timseil-dev/issues/147)),
dann F2, F3, F5.

---

## Vorher — 23.08.2026, F4 gebaut

**Seit heute misst etwas von außen, und das Raster hat seine erste gemessene
Zelle.** Gegen den Dev-Stack, durch einen Traefik-Ersatz, damit `/` und
`/api/*` unter einer Adresse liegen wie in Produktion:

```
probe up http://127.0.0.1:18090 38ms
{"level":"INFO","msg":"ops roll-up","days":1}

 day        | state | checks_total | checks_up | down_sec
 2026-08-23 | ok    |            1 |         1 |        0
```

`days: 0` stand dort seit C7. Das war richtig — der Endpoint nahm Rohdaten an,
und niemand rief ihn. Jetzt ruft alle fünf Minuten jemand an.

**Der Leser hat den echten Branch erreicht, ohne dass irgendetwas gepusht war:**

```
{"level":"INFO","msg":"uptime backfill","state":"no log yet"}
```

Das ist ein 404 von `raw.githubusercontent.com` auf `ops-data/uptime-log.txt`,
unauthentifiziert, als Normalzustand behandelt. Ein Host, der seit F4 nicht weg
war, hat kein Ausfallprotokoll.

**Was gebaut ist**, in fünf Commits: `api/internal/uptime` (Grammatik,
Expansion, Leser), `BackfillOpsChecks`, `tools/probe.sh`,
`.github/workflows/probe.yml`, `tools/check-probe-cadence.sh`. Dazu ADR 0038,
zwei Runbooks, `UPTIME_TRANSPORT` und der Log-Beitrag 002.

**Die fünf Entscheidungen stehen in ADR 0038**, drei davon abweichend vom
Bauplan oder darüber hinaus: kein SMTP aus dem Workflow (der rote Lauf ist der
Alarm, F10 baut den richtigen Pfad), `GITHUB_TOKEN` mit Job-Scope statt eines
langlebigen PAT, und „`401` ist kein Ausfall, sondern unser Tippfehler".

**Ein zweiter Fund kam erst beim letzten Prüflauf.** `make check-db` fährt mit
`-count=1`, `make check` nicht — und unter `-count=1` waren **meine eigenen**
Tests flakig: `waitFor` wartete auf ein Signal, das die Schleife *vor* der
Logzeile setzt, also las die Zusicherung manchmal ein leeres Log. Der Testcache
hatte das in `make check` verdeckt. Repariert, indem die Naht wegfiel: die
Zusicherungen fahren `runOnce` jetzt synchron, und die Schleife selbst hat
**einen** Test für ihre **eine** Eigenschaft (Start-Lauf, Tick, Stop). Danach die
Suite unter `-race` — das fand den Eintrag zu `internal/contact` unten.

**Der stärkste Fund ist klein und übertragbar.** `time.Parse` akzeptiert einen
Sekundenbruchteil **auch dann, wenn das Layout keinen nennt** — dokumentiert,
und die einzige Stelle, an der die Funktion großzügig ist. `09:15:00.123Z`
parste sauber und formatierte sich zu `09:15:00Z` zurück: eine Schreibweise, die
die Grammatik zu verbieten behauptet, still akzeptiert und gerundet. Die Regel
ist jetzt der Rundlauf selbst, `at.Format(layout) != feld`. Ein Formatstring
beschreibt, was man akzeptieren *will*; die Menge dessen, was ein Parser
akzeptiert, ist meistens größer.

**Was noch fehlt** — beides ist eine Aufgabe für dich, nicht für mich:

1. **`INTERNAL_PROBE_TOKEN` als Repository-Secret.** Muss **vor** dem Merge
   stehen: sobald `probe.yml` auf `main` liegt, läuft die Sonde alle fünf
   Minuten, und ohne Token läuft sie rot. Klickweg in
   `docs/runbooks/github.md`, Abschnitt „Der `probe`-Workflow".
2. **`ops-data` ist lokal einen Commit voraus** (`ec86c83`, der Branch-README
   erklärt jetzt das Dateiformat). Eigener Push, nicht Teil des PR.

**Als Nächstes: F2** — Alloy, Prometheus, Loki. Die offene Vorbedingung dazu
steht weiter unten ([#147](https://github.com/G1NG4R/timseil-dev/issues/147)).

---

## Vorher — 23.08.2026, Stufe F1 abgenommen

**F1 ist gemergt und in Produktion belegt.** [#167](https://github.com/G1NG4R/timseil-dev/pull/167),
`1f56a8c`, Release **`v0.3.0`** (Tagger G1NG4R, kein Bot), Deploy `ok … 245 s`,
gemeldet 11:56:41 UTC.

**Der Beleg steht auf der Seite selbst**, und er ist besser als jeder Log-Grep,
weil ein Fremder ihn nachvollziehen kann:

```
GET https://timseil.dev/  → 200,  x-request-id: d7ae967a…
<dl><dt>api</dt><dd>ok</dd><dt>version</dt><dd>v0.3.0</dd></dl>
```

Diese Zeichenkette ist durch die ganze Kette gelaufen — `proxy.ts` prägt die ID,
`serverFetch` trägt sie zur API, `/api/health` antwortet, der Render zeigt sie.
Und sie nennt die Release-Nummer **dieses** Merges. Dazu: `/healthz` trägt
**keine** `x-request-id` (der `matcher` schließt ihn aus, Traefik fragt ihn
einmal pro Sekunde und pro Backend), und zwei Anfragen bekommen zwei
verschiedene IDs.

**`make check-deployed --host`: 10 von 10 Behauptungen.**

| | |
|---|---|
| head of main | `1f56a8c`, 11:52:33 UTC |
| api-Image | `sha256:b52f3eb79598a96a2d3933c1020bd66de4990f491e22bc4e6f82a80cf9b1ee1a` |
| web-Image | `sha256:10f7142993738c699fbd2caa0b259fda4685a4c8c194c07bd1b4642483877de4` |
| gebaut / läuft seit | 11:53:45 / 11:56:51 UTC |

**Die zwei, die nur der Host machen kann, sind darunter:** die laufenden
Container **sind** die veröffentlichten Digests, für api und für web. Vom Klon
aus sind acht davon grün und die neunte heißt `– not asked here` — geführt wurde
sie auf dem VPS mit

```sh
cd ~/timseil-dev && git pull && sh tools/check-deployed.sh --host
```

Damit ist die Kette vom Commit bis zu den Bytes auf der Maschine geschlossen,
und **auch die Produktionsabnahme von F1a ist nachgeholt** — sie fehlte seit dem
Morgen des 23.08. und stand als Schuld in diesem Abschnitt.

**Als Nächstes: F4, nicht F2** — und die Abweichung von der Bauplan-Reihenfolge
ist bewusst. F4 ist die einzige Phase der Stufe, deren Wert vom **Startdatum**
abhängt: das 91-Tage-Betriebsraster braucht Historie, und Historie lässt sich
nicht nachbauen. Prometheus und Loki halten 7 und 14 Tage — dort kostet ein
späterer Start nichts Dauerhaftes. Dazu hat F4 keine offene Vorbedingung, F2
schon ([#147](https://github.com/G1NG4R/timseil-dev/issues/147): der Host trägt
mehr als diesen Stack), F4 benutzt als Einziges das noch unbelegte
`INTERNAL_PROBE_TOKEN`, und es ist die einzige F-Phase, die etwas erzeugt, das
auf der Seite sichtbar wird. „Im Zweifel Inhalt."

---

## Vorher — 23.08.2026, F1b gebaut

**Eine Anfrage an `/` hinterlässt jetzt eine Zeile in beiden Containern, und
eine ID findet beide.** Gemessen gegen den Dev-Stack, mit einem von außen
vorgegebenen `traceparent`:

```
{"msg":"request","path":"/api/health","status":200,
 "request_id":"eff2c10b…","trace_id":"d2ad2aad…"}                        ← api
{"msg":"upstream request","path":"/api/health","status":200,"duration_ms":88,
 "upstream_request_id":"eff2c10b…","request_id":"dc51add8…","trace_id":"d2ad2aad…"}  ← web
```

`upstream_request_id` **ist** die `request_id` der API-Zeile. Das ist die
Brücke: die API übernimmt eine eingehende `X-Request-Id` nur vom
vertrauenswürdigen Peer, also wird die von web gesendete nicht ihre — web
schreibt deshalb auf, welche es war. Der Wortlaut des Bauplans gilt damit in
einem Sprung, über `trace_id` in keinem.

**Der Fund der Phase steckte nicht im neuen Code, sondern im alten.**
`Scrub("peer 2001:db8:: is gone")` gab in der API seine Eingabe zurück:
`matchAddr` übersprang jeden Kandidaten, der auf einen Doppelpunkt endet, als
Satzzeichen — und `::` ist Syntax. Jede IPv6-Adresse, die auf ihrem Nulllauf
endet, stand seit F1a im Log eines Dienstes, dessen Datenschutzseite keine
verspricht.

**Warum der Fuzzer das nicht finden konnte, ist der übertragbare Teil.**
`FuzzScrubRemovesEveryAddressItCanSee` rescannt mit `addressesIn`, und das ruft
denselben `matchAddr` — die Eigenschaft lautet also „der Filter sieht keine
Adresse mehr, **die er sehen kann**". Ein Kandidat, den der Matcher nie ansieht,
ist einer, nach dem die Eigenschaft nie fragt. Der Web-Test rescannt stattdessen
mit `net.isIP` über jeden Teilstring und teilt keine Zeile mit dem Matcher; er
hat `bA::` in dreitausend Zufallseingaben erzeugt. Beide Seiten tragen die
Reparatur, das Korpus einen Eintrag mehr, und die zwei Rescans bleiben
**absichtlich verschieden**.

**Daraus wurde eine zweite Entscheidung.** `lib/scrub.ts` rief anfangs
`net.isIP` — dasselbe wie der Test. Rausgeflogen ist es aus einem Bauzwang
(Next übersetzt `instrumentation.ts` auch für die Edge-Runtime, wo `node:net`
nicht lädt), und der Umweg war mehr wert als der ruhige Build: seitdem ist
`isIP` ein **unabhängiges Orakel**. Gemessen über sechs Millionen erzeugte
Token: **0 verpasste** von 35 401 Adressen, **0 über-redigiert**. Der erste Lauf
stand bei 0 verpasst und **12 906** über-redigiert — alle eine Zone-Regel, die
nach `%` alles durchließ; die letzten zwei waren `0.0.0.0::`, wo eine
eingebettete IPv4 nicht das Ende der Adresse ist.

**Die PII-Gegenprobe, gegen den echten Fehlerwert im laufenden Container:**

```
raw   : fetch failed: connect ECONNREFUSED 127.0.0.1:9999
logged: fetch failed: connect ECONNREFUSED redacted-ip
```

**0 Treffer** für das Container-Subnetz im gesamten Log beider Container. Das
ist der Fall, für den der Scrubber in web überhaupt existiert — ADR 0035 hat
`api` in Schritt 3 jedes Rollouts kurz weg, ohne Filter schriebe also jeder
Rollout die Adressen mit.

**Der kaputte Fall der Seite:** `api` gestoppt, `/` abgerufen → **HTTP 200**,
`— NO DATA` in beiden Feldern, Web-Zeile mit `status: 0` unter derselben
`trace_id`, kein Absturz. `serverFetch` wirft nie.

**Zahlen der Phase:** `web/` hatte 195 Zeilen Handcode und **null Tests**; jetzt
99 Tests auf `node --test`, ohne neue Abhängigkeit. Der 2 700-Zeichen-Lauf, der
in Go sieben Sekunden kostete, braucht hier 37 ms; die reine Doppelpunkt-Variante
48 ms.

**`v0.2.0` steht auf origin und zeigt auf `26ffaf7`** — den F1a-Merge. Die
Produktionsabnahme von F1a gehört noch hierher nachgetragen, sobald
`make check-deployed --host` gegen sie gelaufen ist; die Zahlen dieser Phase
oben sind Dev-Stack, nicht Produktion.

**Als Nächstes: F2** — Alloy, Prometheus, Loki. Zwei Zeilen unten warten darauf.

---

## Vorher — 23.08.2026, F1a abgenommen

**Jede Zeile der API trägt jetzt `request_id` und `trace_id`, und keine trägt
PII.** Gemessen gegen den laufenden Dev-Stack, nicht gegen Tests:

```
{"level":"WARN","msg":"internal endpoint refused a request","path":"/api/internal/probe",
 "request_id":"c1ae68…","trace_id":"c6526a…"}
{"level":"INFO","msg":"request","method":"POST","status":401,
 "request_id":"c1ae68…","trace_id":"c6526a…"}
```

Handler-Zeile und Access-Zeile unter einer ID — vorher trug nur die zweite eine.
Ein eingehender `traceparent` von außen wurde übernommen (`4bf92f…4736`), die
eingehende `X-Request-Id` nicht: die Unterscheidung ist ADR 0037.

**Der Fund, der die Phase getragen hat, war fremder Text, nicht ein Feld.**
`mail/smtp.go` verpackt die Antwort des Relays in einen Fehler, `contact` loggt
ihn — und eine SMTP-Ablehnung lautet `550 5.1.1 <jemand@example.com>: …`. Über
dem Aufruf stand bereits *„never the address. F1's PII rule."* Die Absicht war
richtig, die Zeile leckte trotzdem. Zwei weitere Stellen kamen beim Durchsehen
dazu: `mail/log.go` schrieb die **komplette Nachricht** (`envelope`), und
`ratelimit.go` schrieb `r.RemoteAddr` im Klartext. Beide sind an der Call-Site
repariert, nicht im Filter — ein Filter hätte in `envelope` die Adresse
redigiert und Name und Text stehen lassen.

Gegenprobe: Kontaktformular mit Name, Adresse und Merksatz abgeschickt,
**0 Treffer** für alle drei im gesamten Container-Log.

**Sechs Fehler sind beim Bauen entstanden. Einen hat das Lesen gefunden, fünf
haben Maschinen gefunden — und der wichtigste war nicht der, den ich gesucht
habe.**

Vom ersten Lauf gegen den Stack:

1. `"message_id":"redacted-email"`. Eine RFC-5322-Message-ID **ist**
   adressförmig, der Filter hat folgerichtig das Feld gefressen, für das die
   Zeile existiert. Genau eine Ausnahme nach Schlüssel, und sie ist eine Aussage
   über den Wert, nicht über den Namen.

Vom Fuzzer, in dieser Reihenfolge:

2. `[redacted-email]` mit Klammern **beendete** den Domain-Scan und ließ das
   Davorstehende wie eine gültige Domain aussehen.
3. Zwei getrennte Durchläufe (erst E-Mails, dann IPs) störten einander:
   `a@b.tld@c.tld` ließ die zweite Domain stehen, und bei `0@::0.XA` **baute**
   die IP-Redaktion eine E-Mail, die es nicht gab. Jetzt ein Durchlauf — was er
   schreibt, wird nie wieder gelesen.
4. **Ein echtes Leck:** bei `::0.::0` blieb das erste `::0` stehen, weil nur der
   *maximale* Lauf probiert wurde. Und der Lauf-Anfang-Test, der das linear
   halten sollte, war derselbe Fehler noch einmal: bei `::0X%::0` beginnt der
   zweite Lauf bei `%`, `%::0` parst nicht, das `::0` darin wurde nie probiert.
5. **Der wichtigste, und er ist kein Leck, sondern eine Zeitbombe in der
   Gegenmaßnahme selbst.** Ein Lauf aus 2 700 Doppelpunkten und Ziffern brauchte
   **sieben Sekunden** im Logger — und `r.URL.Path` ist nicht längenbegrenzt. Der
   Filter, der das Log schützen soll, wäre der Weg gewesen, den Dienst
   anzuhalten. Ein Kandidat ist jetzt auf 64 Zeichen begrenzt, und der Pfad in
   der Access-Zeile auf 256 — dieselbe Antwort, die `internal/contact` einer
   Origin seit C6 gibt.

Dazu die Erkenntnis, dass **Idempotenz keine erreichbare Eigenschaft ist**: der
Marker ist entweder aus Domain-Zeichen gebaut und wird Teil einer Domain, oder
er ist es nicht und beendet eine — beide Formen sind Duale. Geprüft wird
seitdem, was tatsächlich versprochen ist: *was der Filter erkennt, entfernt er.*

Keiner dieser fünf wäre in einem Review aufgefallen. Das ist der Grund, warum
`traceparent.Parse` und `Scrub` je einen Fuzz-Test tragen und das Korpus der
widerlegenden Eingaben im Repository liegt.

**Kosten, gemessen statt behauptet:** die Zeile, die jede Anfrage schreibt,
kostet **104 ns und null Allokationen**; eine Zeile mit einer echten
Relay-Ablehnung 6,9 µs.

**Zahlen der Phase:** 48 Call-Sites auf `…Context` umgestellt, 13 handgesetzte
`request_id`-Attribute entfernt (`slog` dedupliziert nicht — zwei gleiche
Schlüssel in einem Objekt sind gültiges JSON, dessen Bedeutung vom Parser
abhängt). `internal/reqid` und `middleware/requestid.go` **unverändert**, wie es
der Kopfkommentar von `reqid.go` seit C1 versprochen hatte.

**Als Nächstes: F1b** — Web-Logger in derselben Form, `proxy.ts`, `serverFetch`,
und der Beweis über beide Container.

---

## Vorher — 23.08.2026, der erste Text vor der ersten Seite

**Zwei Entscheidungen, beide gegen die Reihenfolge des Bauplans, beide bewusst.**

1. **Der erste Log-Beitrag ist geschrieben, bevor es einen Renderer gibt** —
   `web/content/posts/001-zero-downtime-measured-not-claimed.mdx`, englisch,
   über Stufe E: der 404-Trichter, die drei Messungen, der Zweizeiler, der in
   beiden Hälften falsch war, und die Grenze, die benannt statt wegoptimiert
   wurde. Gerendert wird er in H9; bis dahin ist er Text im Repository, den
   keine Prüfung anfasst. Grund: die Zahlen verfallen nicht, die Erinnerung
   daran, **warum** jede so aussieht, schon.
2. **Eine Fallstudie, viele Beiträge.** Die Fallstudie (H1/H2) ist eine Seite
   pro System; eine zweite gibt es mit einem zweiten System (P7), nicht mit
   einer neuen Stufe. Die Stufen-Tiefe gehört nach `web/content/posts/`. Damit
   ist der E-Beitrag der CI/CD-Beitrag und nicht Kapitel 1 von sechs.

**`CLAUDE.md` hat einen Abschnitt `Maß halten`** — fünf Regeln mit Auslöser
statt gutem Vorsatz, gegen das Verhältnis, das die Zählung an diesem Tag gezeigt
hat: 9.544 Zeilen in `tools/`, `Makefile` und `ci.yml`, 36 ADRs, `ci.yml` zu
59 % Kommentar — und `web/` eine Seite ohne Inhalt. `selftest.sh` und
`check-compose.sh` sind damit eingefroren: Reparaturen ja, neue Regeln nur nach
einem Vorfall, den man benennen kann.

**An der Reihenfolge danach ändert das nichts: als Nächstes F1.**

---

## Vorher — 22.08.2026, Stufe E ist fertig

**E5c ist abgenommen, und damit die ganze Stufe E.** `v0.1.0` steht.

```
/               422 requests, 422×200
/api/health     422 requests, 422×200

  ✓ every answer was 200
```

Zeuge 22:01:12–22:08:14 UTC, **vor** dem Merge gestartet, quer über den Deploy
von `99281cf` (`report ok … 233 s`).

| Geprüft | Ergebnis |
|---|---|
| Tag auf origin | `refs/tags/v0.1.0`, annotiert, auf `99281cf` |
| GitHub-Release | 22:06:06, Changelog aus den Commits |
| Tagger | **G1NG4R** — kein Bot, kein Werkzeugname |
| `/api/health` · `/api/badge/version` | `v0.1.0` statt einer Kurz-SHA |

**Der erste Versuch ist rot geworden, und an der richtigen Stelle.** `git tag -a`
verlangt einen Tagger, ein Runner hat keinen: `fatal: empty ident name`. Der
Schritt liegt **vor** `make images`, also war nichts gebaut, nichts gepusht,
nichts signiert — nachgesehen statt angenommen: Produktion unverändert, **0**
Tags auf origin, kein Release. Die Reihenfolge, um die E5c gebaut wurde, hat bei
ihrer ersten Berührung mit der Wirklichkeit gehalten.

**Damit sind drei der vier heute rotierten Werte bewiesen** — `GITHUB_TOKEN`
(der Refresher hat GitHub erreicht), `SMTP_PASSWORD` (die Mail kam an),
`INTERNAL_DEPLOY_TOKEN` (dieser Deploy-Report). `INTERNAL_PROBE_TOKEN` erst mit
F4, dort wird er benutzt.

**Die E4-Abnahme ist nachgeholt, und sie fehlte wirklich.**
`tools/check-deployed.sh --host` stand seit E4b als Kriterium im Bauplan, im
Handbuch und in ADR 0034 — ausgeführt hatte es niemand. Am 22.08.2026 gegen
`b4bd8fa`: **10 von 10 Behauptungen**, darunter die zwei, die nur der Host
machen kann — die laufenden Container **sind** die veröffentlichten Digests.
Vorher waren acht davon vom Klon aus grün und die neunte hieß `– not asked here`.

**Als Nächstes: Stufe F**, und sie beginnt mit F1 (strukturierte Logs und
Korrelation). Die Datenbank-Rotation liegt weiter auf L5, mit Auslöser statt
Datum in der lokalen Datei.

---

## Vorher — 22.08.2026, E5b abgenommen

**Die Abnahme ist erfüllt, gegen Produktion.** 20:07:44–20:13:16 UTC,
`make witness --until-restart`, **vor** dem Merge gestartet, von außen über den
öffentlichen Namen:

```
/               333 requests, 333×200
/api/health     333 requests, 333×200

  ✓ every answer was 200
```

Der Deploy darin: `8e4e444`, `report ok … 222s`. Ein echter Tausch —
`verify-deploy` sah einen Prozess von `20:11:34.485`, `/api/health` nennt
danach `20:11:55.656`. Zwei Container haben nacheinander bedient.

**Damit ist die Kette von E5b in Produktion belegt** und nicht nur im Labor:
zwei Schattendienste tragen die Router, während `api` und `web` neu angelegt
werden; die vier Schritte laufen in Dokploys Command-Feld; `SHUTDOWN_DELAY` und
der Traefik-Healthcheck nehmen das Backend aus dem Pool, bevor seine Adresse
verschwindet.

**Was dabei zweimal schiefgegangen ist, steht unten unter „Gefunden" und bleibt
stehen:** der erste Produktions-Deploy hat die Abnahme verfehlt, und die Grenze,
die dabei sichtbar wurde, ist benannt statt weggebaut (ADR 0035).

**Für die Fallstudie:** BUILD + DEPLOY = **222 s**, und der Satz daneben lautet
nicht „Zero-Downtime", sondern „kein Besucher sieht einen Fehler, solange ein
Deploy die Routing-Labels nicht anfasst". Beide Zahlen sind gemessen.

**Die Stufe ist triagiert** und der Abschnitt „Gefunden" ist leer — 15 Zeilen →
9 erledigt, 2 als Issue ([#157](https://github.com/G1NG4R/timseil-dev/issues/157),
[#158](https://github.com/G1NG4R/timseil-dev/issues/158)), 3 bewusst verworfen,
1 als Regel in `CONTRIBUTING.md`. Der Durchgang steht unten.

**E5c ist gebaut und wartet auf seinen Merge.** Nicht mit `release-please`: es
arbeitet über einen Release-PR, und ein PR vom eingebauten `GITHUB_TOKEN` löst
keine `pull_request`-Workflows aus — kein einziger der sieben erforderlichen
Kontexte meldet, und mit `enforce_admins: true` ist so ein PR **nicht mergebar**.
Die Auswege wären eine GitHub-App oder ein PAT, also ein weiteres Dauer-Geheimnis
mit `contents: write`, vier Tage nach dem Token-Vorfall.

Stattdessen `tools/release.sh`: Tag und GitHub-Release aus den Conventional
Commits, gesetzt von `publish` selbst — **vor** dem Build, damit das Image des
Release-Commits nicht die vorherige Version trägt, und **veröffentlicht als
letzte Handlung**, wenn das Artefakt signiert ist. Keine `CHANGELOG.md`, kein
`v1.2.3` am Image, Start bei `v0.1.0`. ADR 0036.

**Die Abnahme ist der Merge selbst:** er muss `v0.1.0` erzeugen, und
`/api/health` muss danach diese Nummer nennen statt einer Kurz-SHA.

---

## Vorher — der erste Produktions-Deploy von E5b

**E5b ist gemergt** ([#154](https://github.com/G1NG4R/timseil-dev/pull/154),
`153eb80`), **und die Abnahme ist verfehlt.** Gemessen, 19:19 UTC, von außen:
10×`404` auf `/api/health`, 1× auf `/`. Gegen die E5a-Grundlinie (19 s, 16×`404`
je Pfad) eine Halbierung — und die Abnahme zählt jede Antwort, die nicht 200 ist.

**Nicht die Kette hat versagt.** `verify-deploy` sah den Zwilling um
`19:19:19.364`, `/api/health` nennt danach einen anderen Prozess
(`19:19:34.596`). Traefiks Log nennt den Grund: der alte Container und sein
Zwilling beschreiben denselben Router unter demselben Namen **verschieden**, weil
dieser Deploy acht Traefik-Labels geändert hat — und Traefik verwirft dann beide.

**Daraus ist eine gemessene Grenze geworden statt einer Behauptung:** ein Deploy,
der nur das Image tauscht, ist sauber (drei Laborläufe, `100×200` je Pfad); einer,
der ein Routing-Label ändert, kostet einen Trichter. ADR 0035 nennt sie und sagt,
warum sie nicht weggebaut wird.

**Repariert wurde ein zweiter Fall**, der heute nicht zugeschlagen hat:
`timseil-www` und `timseil-retry` waren allein an `web` definiert, während der
api-Router sie nannte — fällt web aus und api nicht, antwortet `/api` 404 bei
lauter gesunden Containern. Beide stehen jetzt an beiden Diensten,
`make check-compose` hält es.

**Was aussteht:** die Abnahme ist der nächste Deploy **ohne** Label-Änderung.
Zeuge vorher starten. #143 und #65 bleiben bis dahin offen.

---

## Vorher — E5b im Labor fertig

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

**Triage nach E5c, 22.08.2026.** Vier Funde, **alle vier in der Stufe
erledigt**, keiner als Issue. Der Abschnitt bleibt leer.

- **`release-please` ist an diesem Repository nicht benutzbar.** Es arbeitet über
  einen Release-PR, und ein PR vom eingebauten `GITHUB_TOKEN` löst keine
  `pull_request`-Workflows aus — kein erforderlicher Kontext meldet, mit
  `enforce_admins: true` ist er nicht mergebar. Steht als Kontext in ADR 0036;
  kein Ticket, weil es nichts zu tun gibt, sondern etwas zu wissen.
- **`git tag -a` braucht einen Tagger, ein Runner hat keinen.** Lokal unsichtbar,
  weil diese Maschine eine Identität hat. Erledigt: der Tag übernimmt den Autor
  des Commits, den er benennt, und der Selbsttest schiebt `GIT_CONFIG_GLOBAL`
  und `GIT_CONFIG_SYSTEM` beiseite, damit er den Fall auch sieht.
- **Eine laufende Bewertung verschluckte den höheren Sprung.** Ein frühes `fix:`
  nagelte die Antwort auf `patch` fest, ein späteres `feat:` änderte nichts —
  ein Release, das untertreibt, was drinsteckt. Erledigt, drei Flags und eine
  Entscheidung am Ende.
- **`--publish` las den Tag neu, den `--tag` gerade gesetzt hatte.** Der Bereich
  wäre leer gewesen, der Text des allerersten Releases also blank. Erledigt: der
  Bereich ist ein Argument statt einer globalen Variablen.

Die letzten drei hat der Selbsttest gefunden, nicht das Lesen.

**Triage nach E5b, 22.08.2026.** 15 Zeilen unter „Gefunden" →
**9 erledigt**, **2 als Issue**, **3 bewusst verworfen**, **1 als Regel
aufgeschrieben**. Der Abschnitt ist leer.

**Die zwei neuen Issues:**

| Issue | Was |
|---|---|
| [#157](https://github.com/G1NG4R/timseil-dev/issues/157) | `web` erreicht die API über einen Namen, den sein Zwilling nicht mitdeckt — kostenlos bis Stufe G, danach 500er statt 404er |
| [#158](https://github.com/G1NG4R/timseil-dev/issues/158) | `witness.sh` begründet mit einem Backend und misst seit E5b zwei |

**Bewusst verworfen, mit Begründung:**

- **Ein Deploy, der ein Traefik-Label ändert, verliert den Router.** In
  Produktion gemessen und im Labor reproduziert. Wegzubauen nur, indem die
  Router-Labels `compose.yaml` verlassen — `extends` kann geerbte Labels
  überschreiben, aber nicht entfernen. Der Preis steht nicht gegen den Nutzen,
  Label-Änderungen sind selten, und die Grenze ist in ADR 0035 als **gemessen**
  benannt statt als Randnotiz. Neu aufmachen, wenn sie häufiger wird.
- **Traefiks Docker-Provider registriert `serversTransports`-Labels nicht.** Eine
  Eigenschaft von Traefik, keine Aufgabe. Sie ist gemessen, der Weg darüber ist
  verworfen, und die Umgehung — das Backend verlässt den Pool, bevor seine
  Adresse verschwindet — ist die bessere Lösung, nicht die zweitbeste.
- **19 s gegen 9 s.** Der Mechanismus, der die Zahl erzeugt hat, war
  wahrscheinlich der zweite Deploy-Weg; der ist abgeschaltet. Die Zahl beschreibt
  damit nichts mehr, was noch erreichbar wäre, und ein Ticket dafür wäre eine
  Absichtserklärung. Die Kette 9 s · 19 s · 10 s · 0 steht im Verlauf, falls sie
  je wieder gebraucht wird.

**Als Regel aufgeschrieben statt als Ticket:** `Closes #N` schließt beim Merge,
und die Abnahmen dieses Projekts werden danach gemessen. Steht jetzt in
`CONTRIBUTING.md` unter „Branches and commits", mit dem Vorfall als Begründung.

**Neun erledigt**, darunter die drei, an denen die Stufe hing: der Zweizeiler
aus dem Bauplan ist ersetzt, der Rest-Ausschlag hat mit `SHUTDOWN_DELAY` eine
gemessene Zahl, und die Middleware-Kopplung ist zu — je mit einer Prüfung, die
den kaputten Fall beweist.

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

## Triage nach Stufe F2 — 24.08.2026

**Der Notizblock ist geleert.** Zwanzig Einträge, jeder einzeln zugeordnet:

| | |
|---|---|
| **Issue** | 15 — [#180](https://github.com/G1NG4R/timseil-dev/issues/180)–[#194](https://github.com/G1NG4R/timseil-dev/issues/194) |
| **erledigt** | 1 — der Netz-Alias, mit #172 gemergt, nur der Status war offen geblieben |
| **bewusst verworfen** | 4 |

Die vier verworfenen, mit dem Grund, damit sie nicht als Vergessene
wiederkommen:

- **Kein eigener ADR für E3.** Die Regel dieser Stufe lebt in den
  Kopfkommentaren von `tools/sign.sh` und `verify-supply-chain.sh`. Der Bruch
  mit „ein ADR pro Phase" war bewusst und ist dort benannt; ein ADR über einen
  fehlenden ADR wäre genau die Sorte Werkzeug, vor der „Maß halten" warnt.
- **Sechs Schritte stehen zweimal in `ci.yml`.** Der bezahlte Preis dafür, dass
  derselbe Job baut, prüft, scannt und veröffentlicht — sonst wäre das signierte
  Artefakt nicht das geprüfte (ADR 0026). Wird die Datei unübersichtlich, ist
  ein gemeinsames `make`-Ziel der Weg, keine Reusable Workflow.
- **Kein dauerhafter Testaufbau für `tools/probe.sh`.** Die sechs kaputten Fälle
  sind einmal gefahren und im Commit benannt; laufend geprüft wird die Datei,
  die dabei entstand. Ein Harness wäre Werkzeug, das Werkzeug prüft.
  Wiederaufnehmen, wenn ein zweiter Fund in diesem Skript auftaucht.
- **Der Ausfall-Alarm bleibt ein roter Lauf, kein eigener Mailpfad.** ADR 0038
  sagt warum: das Mail-Passwort läge als Secret in einem Job, der alle fünf
  Minuten auf fremden Runnern läuft, für ein öffentliches Repository. F10 fängt
  beides mit dem Dead Man's Switch — das ist eine Bauplan-Phase und braucht
  keinen Zettel.

**Der stärkste Fund dieser Stufe** ist [#180](https://github.com/G1NG4R/timseil-dev/issues/180):
die Sonde läuft mit einem Siebtel ihrer behaupteten Kadenz, und `down_sec` wird
aus Anzahl **mal Konstante** gebildet. Jede Ausfalldauer auf der Seite wäre
damit rund siebenmal zu klein — Invariante 1 in Betriebskleidung.

---

## Triage — Stufe F (Launch-Pfad), 27.08.2026

F1–F5 sind gebaut und gegen Produktion abgenommen; F6–F11 liegen hinter dem
Launch. Damit ist der Auslöser erreicht, den CLAUDE.md nennt: **Issue, bewusst
verworfen mit Begründung, oder erledigt — und der Notizblock wird geleert.**

Zwanzig Zeilen unter „Gefunden", vier unter „Idee". Fünfzehn waren erledigt und
sind in ADRs, Beiträgen und Commits belegt; sie brauchen hier keine Zeile mehr.
Die übrigen neun:

### Zu Issues geworden

| Fund | Wohin |
|---|---|
| Sondenkadenz bei 10 %, `down_sec` untertreibt um Faktor 7 | **[#180](https://github.com/G1NG4R/timseil-dev/issues/180)** — existierte seit 24.08.; die größere Stichprobe hängt als Kommentar dran |
| Wettlauf in `internal/contact/dispatch_test.go`, kein `-race` in der Pipeline | **[#181](https://github.com/G1NG4R/timseil-dev/issues/181)** — existierte seit 24.08.; F5 hat ihn unabhängig wiedergefunden |
| README-Entscheidungstabelle endet bei ADR 0029 | **[#205](https://github.com/G1NG4R/timseil-dev/issues/205)** |
| Zustellbarkeit ist der einzige SLI ohne Messung, es fehlt ein Contract-Feld | **[#206](https://github.com/G1NG4R/timseil-dev/issues/206)** — fällig mit H8 |
| Traefik-Anbindung übersteht kein Neuerzeugen des Containers | **[#207](https://github.com/G1NG4R/timseil-dev/issues/207)** |
| `uptime90d` sagt nicht, über wie viel gemessenes Fenster es spricht | **[#208](https://github.com/G1NG4R/timseil-dev/issues/208)** — fällig mit H1 |

### Bewusst verworfen, mit Begründung

**Der Seiten-p95 enthält den Verkehr der eigenen Sonde.** Ausschließen ginge nur
über eine zweite Bucket-Liste je Dienst, und Traefik nimmt eine Liste, nicht eine
je Dienst. Die Verzerrung steht in `docs/slo.md` und in ADR 0041 unter „Was das
kostet". **Aufschreiben ist hier die vollständige Antwort**, nicht der billige
Ausweg: die Zahl ist nicht falsch, sie ist ein p95 über einen Anfragemix, und der
Mix gehört danebengeschrieben.

**`Stop()` ist bei vier Schleifen sequenziell idempotent, nebenläufig nicht.**
Kann nicht auslösen: `cmd/api` erreicht die Methode auf zwei Wegen, die einander
ausschließen — scheitert der Listener, wird `serve()` nie erreicht. Vier
Geschwisterpakete für einen unmöglichen Fall anzufassen ist genau das, wovor
„Maß halten" warnt, und der Diff sähe ohne Anlass aus. **Was stattdessen
passiert ist:** der Kommentar an `snapshots.Stop()` behauptete mit „idempotent"
mehr, als der Code hält, und sagt jetzt, *warum* es sicher ist — damit ein
künftiger dritter Aufrufer die Bedingung liest, statt sie zu erben.

**Das `selftest`-Flackern an `registry.sh`** („rejected, but not for 'usage'",
25.08.). In allen Läufen seit dem 25.08. nicht wiedergekehrt, das Skript direkt
aufgerufen dreimal deterministisch. Verworfen als nicht reproduzierbar; taucht es
wieder auf, ist die Kopiererei ins Temp-Verzeichnis der erste Verdacht — und
dann mit zwei Vorkommen statt einem.

### Dabei aufgefallen: zwei überfällige Issues

`#183` („decide it in F3") und `#184` („due with F3") warten auf eine Phase, die
am 26.08. abgenommen wurde. **#184 nennt drei Hintergrundschleifen; es sind
inzwischen fünf** — F4 und F5 haben je eine dazugelegt, und F5 hat dem Label
einen konkreten Leser gegeben: `docs/runbooks/api.md` schickt einen Operator zum
`grep` nach `"msg":"metric snapshot"`. Das ist ein Label-Selektor, der als
Textsuche in einem Runbook steht. Als Kommentar an #184 vermerkt.

### Die Lehre dieser Triage

**Ich habe zwei Funde als neu gemeldet, die seit drei Tagen als #180 und #181
dastanden.** `backlog.md` hatte ich gelesen, wie es die Regel verlangt; den
Issue-Tracker nicht. Der Notizblock ist die eine Hälfte des Gedächtnisses, der
Tracker die andere — und die Triage räumt genau von der einen in die andere.
Wer nur den Notizblock liest, findet zuverlässig Dinge ein zweites Mal und nennt
sie neu. CLAUDE.md hat dafür jetzt eine Zeile, mit diesem Vorfall als Auslöser.

---

## Verschoben — bewusste Entscheidung

| Datum | Aus Phase | Was | Status |
|---|---|---|---|

*Leer seit der Triage der Stufe G.*

## Gefunden — Bug oder Unklarheit

Vorherige Triage: **Stufe G (Frontend-Fundament), 29.08.2026** — siehe unten.

| Datum | Aus Phase | Was | Status |
|---|---|---|---|

*Leer seit der Triage der Stufe G.*

## Idee — noch nicht entschieden

| Datum | Aus Phase | Was | Status |
|---|---|---|---|

*Leer seit der Triage der Stufe G.*

---

## Triage der Stufe G — 29.08.2026

Stufe G ist mit G7 abgeschlossen. **39 nicht erledigte Einträge** standen im
Notizblock; jeder hat genau eins bekommen — Issue, verworfen mit Begründung, oder
erledigt. Der Tracker wurde mitgelesen, wie es seit der F5-Abnahme in `CLAUDE.md`
steht, damit nichts ein zweites Mal als neu gefunden wird.

### Neu angelegt — 14 Issues

| # | Was | Fällig |
|---|---|---|
| **#235** | `next dev` hydriert nicht, und es liegt nicht am `[lang]`-Baum | vor H1 |
| **#236** | Drei Messungen warten auf ein Playwright-Rig: 44 px, `<Activity>`, `prefers-reduced-motion` | vor H1 |
| **#237** | Initial JS bei 143 KB von 150 KB Budget, bevor eine Seite existiert | L8 |
| **#238** | Turbopack liefert keinen metrischen Ersatzschnitt — die CLS-Hälfte | L8 |
| **#239** | Chakra Petch 400 ist womöglich ein Schnitt, den kein Blatt benutzt | L8 |
| **#240** | Drei Chrome-Fragen, die Stufe G für H1 offengelassen hat | H1 |
| **#241** | Das G7-Kriterium sagt fünfzehn, das Blatt hat sechzehn Namen | Doku |
| **#242** | `durationSec` misst den Pipeline-Lauf, nicht den Deploy | H2 |
| **#243** | Die neunte Behauptung von `check-deployed` wird nicht mehr gestellt | Kadenz entscheiden |
| **#244** | Ohne JavaScript bleiben drei Zellen `— NO DATA` | M2 |
| **#245** | ETag-Ersparnis neu messen, wenn die größeren Endpunkte hängen | H4 |
| **#246** | h4–h6 sind unspezifiziert | H9 |
| **#247** | Die mobile 404-Stufe 58 px hat weder Token noch Media Query | H10 |
| **#248** | Mocha `--dim` trägt Tokyo Nights Wert, das Blatt misst einen anderen | K1 |

### An bestehende Issues gehängt statt neu angelegt

- **#90** — der `unknown blob`-Push und der Hinweistext, der woandershin zeigt.
- **#158** — der Zeuge kostet seit G4 API-Budget; zwei parallel liegen am Limit.
- **#205** — die Zahl im Issue stimmt nicht mehr: nicht zwölf fehlende ADRs,
  sondern **zwanzig**.
- **#187** — die drei `Ecmascript file had an error` sind dort seit D1 erklärt;
  der G3-Fund war eine Dublette und ist als solche vermerkt.

### Verworfen, mit Begründung — 4

- **Die Uhr driftet** (G3). `setInterval(1000)` verliert auf einem beschäftigten
  Tab gelegentlich eine Sekunde. Ein sich selbst nachstellendes `setTimeout` liefe
  ruhiger — aber das Blatt schreibt `setInterval`, und die Änderung wäre eine
  Entwurfsentscheidung, keine Reparatur.
- **Die Scroll-Sperre verschiebt den Inhalt um 15 px** (G3). Sichtbar nur in einem
  auf unter 900 gezogenen Desktop-Fenster: das Menü existiert nur dort, und
  Touch-Balken sind Overlays ohne Breite. Der Ausgleich wäre JavaScript, das die
  Breite misst — und genau dessen Fehlerfall („die Seite lässt sich nie wieder
  scrollen") ist der Grund, warum die Sperre in CSS liegt.
- **`check-topology` fiel einmal mit `migrate` exit 1** (G1). Zweimal nicht
  wiedergekehrt, Ursache unbekannt, Logs waren beim Suchen schon abgeräumt. Kommt
  es wieder, ist der erste Griff, die Logs des `migrate`-Containers zu sichern,
  **bevor** irgendetwas abgeräumt wird.
- **`check-adrs` durchsucht auch `web/.next/`** (G5a). Ein Treffer von dort kann
  nie eine Quelle sein und erzeugt eine Meldung, die niemand reparieren kann.
  `selftest.sh` und die Prüfregeln sind eingefroren, und ein Vorfall ist das noch
  nicht — die Regel dafür steht in `CLAUDE.md`.

### Erledigt — der Rest

Zwölf Einträge sind durch G6 und G7 selbst erledigt: die vier Bauteile ohne
Aufrufer haben ihren Betrachter, `DEGRADED` hat sein Wort, der Burst seine
Bewegung, die zwei ungesehenen Füllungen ihr Bild, und die Laufweiten ihre
Zählung — **nur `.12em` überschreitet eine Dateigrenze**, alles andere ist die
lokale Konstante genau einer Datei, was auch die sechs Chrome-Schriftgrößen
beantwortet. Die Regel für die drei nicht abgebildeten Vertragsvokabulare steht
in ADR 0048, das leere Feed in ADR 0047 mit #192 daneben.

Drei Einträge waren Empfehlungen an den Tracker und sind als Kommentar mit Beleg
dort gelandet: **#230** (erfüllt, Vorschlag schließen), **#94** und **#157**
(beide gemessen, Vorschlag schließen). **Geschlossen wurde keiner — der Tracker
gehört dir.**

### Zwei Dinge, die die Triage selbst ergeben hat

**Die ADR-Decke der Stufe ist vollständig.** 0042 bis 0049, einer pro Phase (G5
hat zwei, weil i18n und die maschinenlesbaren Flächen zwei Entscheidungen sind).
Keine nicht-offensichtliche Entscheidung ohne ADR gefunden.

**Der Runbook hat eine dritte Falle bekommen.** Das `close`-Ereignis eines
`<dialog>` ist aus der Browser-Erweiterung nicht beobachtbar — dieselbe Familie
wie die isolierte Welt aus G7: das Werkzeug misst nicht überall, wo es hinsieht.
Sie stand nur im Notizblock und hätte das Leeren nicht überlebt.

