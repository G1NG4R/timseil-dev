# ADR 0079 — Die Rolle, die der Beleg trägt, und der Mitautor, den das Verbot nie erreicht hat

**Status:** Angenommen
**Datum:** 2026-09-24
**Betrifft:** Stufe U (U0–U9), K1, K2 — und jeden Text, der eine Rolle behauptet
**Invarianten:** 1 (keine erfundenen Zahlen), 2 (Stufen werden abgeleitet),
4 (ohne Post-Mortem keine Kerbe)

## Kontext

Diese Seite hat eine Regel, und sie steht in der ersten Zeile von `CLAUDE.md`:
*„Jede Behauptung ist an einen Beleg gebunden, und der Beleg ist ein laufendes
System."* Zwei Behauptungen halten sie nicht.

**Die erste ist die Rolle.** `CLAUDE.md:3`, `README.md:3`, `site.ts:36` und
`en.ts:199` sagen seit dem ersten Tag „Backend & DevOps Engineer". Der Code
dahinter ist mit Claude Code entstanden. Die Architektur ist erklärbar — warum
es keine `tracks.state`-Spalte gibt, warum ein Tag ohne Messung `nodata` ist,
warum das Fenster 91 Tage hat. Das Schreiben ist es nicht. Im Interview ist das
kein Feinschliff, sondern die erste Nachfrage.

**Die zweite ist das Training Log.** Es trägt 22 Tracks. Ein Teil davon —
Go, SQL, TypeScript — behauptet über die Ableitung „kann ich schreiben". Ein
zweiter Teil — C, Pub/sub, Crypto, JWT, SQLite, DSA, OOP/FP — ist Lehrplan und
hat gar kein System hinter sich. Ein Log, das einen Lehrplan abbildet statt
Belege, ist genau die erfundene Zahl, die Invariante 1 verbietet, nur in
Textform.

Gleichzeitig existiert der Beleg, der beides trüge, und steht nicht auf der
Seite: `talos-prod`, ein Kubernetes-Cluster auf eigener Hardware, in einem
eigenen privaten Repository, mit Flux, SOPS, MetalLB, Traefik, cert-manager,
CloudNativePG und Velero. Das Entwurfsblatt hat die Rolle übrigens die ganze
Zeit richtig gehabt: *„Backend- oder DevOps-Rolle, **Junior**"*
(`docs/design/Content Checklist - timseil.dev.dc.html:186`).

### Und die Regel, die das Weglassen vorschrieb

`a359188` („chore: authorship is G1NG4R, never the assistant", PR #15,
17.08.2026) hat das Verbot in `CLAUDE.md` geschrieben: kein `Co-Authored-By`,
keine Session-Zeile, kein Modell- oder Werkzeugname in irgendetwas, das diese
Seite veröffentlicht. Am 24.09.2026 gegen den Baum gemessen, hielt daran
dreierlei nicht:

1. **Nichts hat es je geprüft.** `.githooks/commit-msg` liest nur die erste
   Zeile, `tools/check-repo.sh` führt keine Wortlisten, `tools/selftest.sh` hat
   keinen Fall dazu. Die Definition of Done von PR #15 sagt es selbst:
   *„Test for the broken case — n/a, this is a rule in a document, not code."*
2. **Es war trotzdem gebrochen, sechzehnmal.** GitHubs Squash-Dialog hängt
   `Co-authored-by: dependabot[bot]` an, und `main` ist gegen Force-Push
   gesperrt: **16 der 24 Dependabot-Squashes auf `main` tragen die Zeile.**
   `backlog.md:2050-2056` hat das benannt und die Wahl offen gelassen —
   *„Entweder das Häkchen beim Mergen, oder die Regel benennt die Ausnahme."*
3. **Bei dem, wofür es geschrieben war, hat es gehalten, und das war der
   Schaden.** Die einzigen zwei Commits mit einem Claude-Trailer sind `dce4110`
   und `690a835` vom 16. und 17.08.2026, beide **vor** der Regel. Seither ist
   die Historie stumm darüber, wie dieses Repository entstanden ist — und das
   ist dieselbe Lücke wie bei der Rolle, nur von der anderen Seite.

## Entscheidung

**Die Seite nennt die Rolle, die ihre Systeme belegen, und den Mitautor, der
sie mitgebaut hat.** Fünf Festlegungen.

### 1. Junior DevOps

Die Rolle heißt ab Stufe U „Junior DevOps Engineer". Sie ist kleiner als die
alte und sie hält: Betrieb, Netz, Auslieferung, Observability und Backup dieser
Seite und des Clusters sind gebaut, laufen und sind erklärbar. „Junior" ist
dabei keine Bescheidenheitsformel, sondern die genaue Angabe — der Weg kam vom
Helpdesk, nicht aus einem Studium, und das ist im Gespräch ein Vorteil, solange
es dasteht und nicht herausgefragt werden muss.

### 2. `talos-prod` ist der Hauptbeleg — und `in_build`, nicht `live`

Der Cluster kommt als System 01 auf die Seite. **Nicht als `live`**, solange
kein öffentlicher Dienst darauf läuft, den die Sonde misst: Invariante 3 gibt
Metriken nur für `state='live'`, und ein `live` ohne Messreihe wäre die erste
erfundene Zahl dieser Seite. Er wird `live`, wenn der Cutover durch ist und die
Messung läuft, nicht wenn er sich fertig anfühlt.

Quelle `private` / `internal`. Es gibt keine Case Study dazu, also verlinkt die
Work-Zeile nicht — dieselbe Mechanik, die `vat-check` bisher zum bewussten
404-Beispiel gemacht hat.

### 3. Die KI steht in den Commits, nicht als Etikett auf der Seite

Commits, an denen Claude Code mitgeschrieben hat, tragen ab sofort genau eine
Zeile:

```
Co-Authored-By: Claude Code <noreply@anthropic.com>
```

**Werkzeugname, keine Modellversion.** Eine Modellversion wäre eine Zahl ohne
laufendes System dahinter und änderte sich mit jedem Modellwechsel; die
Historie soll über hundert Phasen dieselbe Form tragen. **Keine
`Claude-Session`-Zeile**, nirgends: eine Session-URL ist kein Beleg, sondern ein
Link, den außer dem Autor niemand öffnen kann.

Auf der Seite selbst steht kein Etikett. Stattdessen trägt das Training Log den
Track *AI-assisted engineering (Claude Code)* mit seinen Belegzeilen wie jeder
andere Track auch. Der Unterschied ist der ganze Punkt: ein Etikett ist eine
Behauptung, eine Belegzeile und ein Commit-Trailer sind nachlesbar.

Damit benennt die Regel auch die Dependabot-Ausnahme, statt sie sechzehnmal zu
verlieren: `Co-Authored-By` ist keine verbotene Zeile mehr, sondern eine
geführte. Autor bleibt in jedem Fall G1NG4R.

### 4. Log-Beiträge schreibt Tim

`web/content/posts/` ist ab jetzt ausschließlich Tims Text — auch keine
Entwürfe, auch nicht auf Zuruf; Rechtschreibung auf Bitte bleibt erlaubt. Die
25 vorhandenen Beiträge fallen in U2 weg. Ein Log, das erklärt, was jemand
gelernt hat, kann nicht von etwas anderem geschrieben sein: es ist die eine
Textsorte auf dieser Seite, deren Beleg der Autor selbst ist.

Die Folgeregel steht in `CLAUDE.md` unter „Maß halten": der stärkste Fund einer
Stufe geht nach `backlog.md` unter *Gefunden*, nicht nach `web/content/posts/`.
Der Grund für die alte Regel bleibt wahr — die Zahlen verfallen nicht, die
Erinnerung daran, *warum* jede so aussieht, schon —, nur der Ablageort war
falsch gewählt.

### 5. Das Training Log trägt nur, was ein System belegt

22 Tracks werden 14, in sechs Modulen. Es fällt weg, was keinen Beleg hat oder
den falschen führt:

- **Go, SQL, TypeScript** — die Ableitung machte daraus `applied`, und
  `applied` liest sich als „kann ich schreiben".
- **C, Pub/sub, Crypto, JWT, SQLite, DSA, OOP/FP** — Lehrplan ohne System.
- **Git, Webhooks, Caching, HTTP-Server, AWS, Linux** — Füllung, oder schon
  Teil eines anderen Tracks.

Das Schema bleibt unberührt. Invariante 2 gilt unverändert: die Stufen kommen
weiter aus `v_track_states`, und es gibt weiter keine Spalte `tracks.state`.

## Konsequenzen

### Die Seite wird kleiner, bevor sie größer wird

Mit `talos-prod` als `in_build` belegt genau ein System die Cluster-Tracks.
Nach der Ableitung stehen danach **sechs Tracks auf `learning`** — die, die nur
der Cluster trägt — und **acht auf `applied`**, dort wo timseil.dev live
mitbelegt. Kein einziger auf `core`, bis der Cutover zwei laufende Systeme unter
denselben Track stellt. Das ist kein Rückschritt, sondern die erste Fassung, die
man nachrechnen kann.

Das Log ist nach U2 leer. LOG-Navigation, die Home-Sektion SYS.04, `feed.xml`
und die Sitemap-Einträge verschwinden mit ihm und kommen mit dem ersten eigenen
Beitrag automatisch zurück.

### Invariante 4 bleibt, und wird zur Hausaufgabe

Incidents zeigen über `post_slug` auf Post-Mortems. Fallen die Posts weg, zeigt
die Case Study den Slug als Text (`web/lib/case/postmortem.ts`) — die Invariante
ist gewahrt, die Seite sieht ärmer aus, und die Post-Mortems der echten
Vorfälle sind damit fällig. Sie unter denselben Slugs neu zu schreiben ist die
erste Aufgabe, die ausschließlich Tim erledigen kann.

### Was das kostet

- **Zehn Phasen vor allem anderen.** Stufe U schiebt sich vor I, J, K, L und M.
  Das ist der Preis dafür, die Rolle jetzt zu korrigieren statt nach fünf
  weiteren Seiten, auf denen sie mitwächst.
- **Der Beleg liegt in einem Repository, das niemand aufmachen kann.** Das ist
  die Kehrseite von „privat": für `talos-prod` gibt es keine Quelle zum
  Nachlesen, nur Komponentennamen und ein Gespräch. Ein Leser, der mehr will,
  bekommt nichts — bis der Cutover den Cluster messbar macht.
- **Acht Tracks fallen auf `learning`, und die Seite sieht kleiner aus.** Wer
  22 Zeilen gegen 14 zählt, sieht einen Rückbau. Die 14 halten einer Nachfrage
  stand, die 22 nicht; der Tausch wird bewusst gemacht und nicht kommentiert.
- **`Co-Authored-By` ist von nun an Disziplin ohne Werkzeug.** Es gibt keine
  Prüfregel, und es kommt auch keine: `CLAUDE.md` verbietet unter „Maß halten"
  eine Regel ohne einen Fehler, der wirklich passiert ist. Der einzige Fehler,
  der passiert ist, ging in die andere Richtung — eine Zeile, die entstand,
  obwohl sie verboten war. Gegen eine fehlende Zeile hilft nur, sie zu
  schreiben.
- **Die Rolle steht danach an elf nutzersichtbaren Stellen falsch, bis U6
  durch ist.** Zwischen U1 und U6 ist die Seite in sich uneinheitlich. Das
  wird in Kauf genommen, weil die Alternative eine einzige Phase wäre, die
  `en.ts`, `site.ts`, den Seed, About, die Trajectory und die Case Study
  gleichzeitig anfasst.

## Verworfene Alternativen

**Die Rolle lassen und den Cluster danebenstellen.** Der bequemste Weg: nichts
zurücknehmen, nur etwas hinzufügen. Er erzeugt zwei Aussagen, von denen eine im
Interview nicht hält — und eine Seite, deren ganzes Argument „jede Behauptung
hat einen Beleg" lautet, verliert mit der einen auch die andere.

**Ein KI-Etikett auf der Seite** („built with Claude Code", als Badge oder
Fußzeile). Ehrlich gemeint und trotzdem falsch hier: ein Etikett ist eine
Behauptung ohne Messung, also genau die Form, die diese Seite sonst ablehnt.
Der Commit-Trailer leistet dasselbe mit Beleg, und der Track im Training Log
trägt es dorthin, wo jede andere Fähigkeit auch steht.

**Die Posts umschreiben statt löschen.** 25 Dateien mit richtigen Zahlen darin
wegzuwerfen tut weh, und die Zahlen sind gemessen. Aber ein umgeschriebener
Post ist ein Post, den der Autor verteidigen muss, ohne ihn erlebt zu haben —
und die Messungen selbst sind nicht verloren: sie stehen in `backlog.md`, in
den ADRs und in den Läufen, aus denen sie kamen.

**Das Verbot behalten und das Häkchen im Squash-Dialog jedes Mal wegklicken.**
Die Fassung, die `backlog.md:2050` als erste der beiden Möglichkeiten nennt.
Sie verlangt eine fehlerfreie Handbewegung bei jedem Merge, gegen eine
Oberfläche, die dieses Repository nicht kontrolliert, und `main` ist gegen
Force-Push gesperrt — ein vergessenes Häkchen ist unkorrigierbar. Sechzehnmal
vergessen ist kein Disziplinproblem, sondern ein Befund über die Regel.

## Die Grenze, die dieser ADR selbst zieht

Über `talos-prod` dürfen **Komponentennamen** stehen: Talos, Kubernetes, Flux,
SOPS, MetalLB, Traefik, cert-manager, CloudNativePG, Velero, kube-prometheus-stack.
**Nicht** stehen dürfen, in keinem Satz und in keiner Phase der Stufe U:
Router-Betriebssystem, VPN, Schutzwerkzeuge, Adressen, Ports und der
VLAN-Zuschnitt. Der Ist-Stand jeder Sicherheitsfrage gehört nach
`backlog.local.md` — die Regel steht schon in `CLAUDE.md` unter „Was du nicht
tun sollst", und Stufe U ist genau die Stufe, die sie am häufigsten streifen
wird. Unsicher zählt als ja.

## Belege

- `a359188` (PR #15, 17.08.2026) — die alte Autorenregel und ihre eigene
  Definition of Done: *„n/a, this is a rule in a document, not code"*
- `dce4110`, `690a835` (16./17.08.2026) — die einzigen zwei Commits mit einem
  Claude-Trailer, beide vor der Regel
- `backlog.md:2050-2056` — der Squash-Dialog, 16 von 24 Dependabot-Squashes auf
  `main`, und die offen gelassene Wahl, die dieser ADR trifft
- `.githooks/commit-msg`, `tools/check-repo.sh`, `tools/selftest.sh` — nichts
  davon hat die Regel je geprüft
- `docs/design/Content Checklist - timseil.dev.dc.html:186` — *„Backend- oder
  DevOps-Rolle, Junior"*, seit dem Handoff
- `web/lib/about/trajectory.ts:133-135` — die Eingrenzung „Kubernetes nicht in
  DIESES System" stand dort schon, bevor es einen Cluster gab
- `tools/release.sh:216-218`, `.github/workflows/probe.yml:106-109` — die zwei
  Kommentarblöcke, die die alte Regel wörtlich zitierten
- ADR 0003 (abgeleitete Track-Stufen, keine `state`-Spalte), ADR 0013
  (der Seed ist Inhalt, keine Messung), ADR 0008 (ein Host zum Launch — vom
  Cutover in U9 berührt)
