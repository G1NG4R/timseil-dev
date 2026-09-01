# ADR 0059 — Eine dritte Zustandstabelle, und der Beleg, der nicht im Hover wohnt

**Status:** Angenommen
**Datum:** 2026-09-01
**Betrifft:** H4 — SYS.01, das Trainings-Log der Startseite; berührt G6
(Zustandssprache), G7 (Galerie), H5 (SYS.02–04) und das Blatt-Orakel ab H1
**Invarianten:** 1 (keine erfundenen Zahlen), 2 (Skill-Zustände werden
abgeleitet), 8 (keine Farbe außerhalb `tokens.css` — eingehalten, ohne einen
neuen Token)

## Kontext

`GET /api/training` steht seit C3 und ADR 0018 hat entschieden, was auf dieser
Seite der Leitung übrig bleibt: *„H4 rendert den Baum, wie er kommt:
Reihenfolge, Zustände und Belegzeilen sind serverseitig entschieden, die
Oberfläche schreibt sie groß und sortiert nicht nach."* Das klingt nach einer
Phase ohne Entscheidungen. Es waren fünf, und drei davon sind Widersprüche
zwischen zwei Blättern oder zwischen einem Blatt und dem Bauplan — also genau
die Sorte, die still in die falsche Richtung aufgelöst wird, wenn sie niemand
aufschreibt.

## Entscheidung

### 1. `TRACK_MARKS` ist eine dritte Tabelle, und `queued` wird geteilt

`MARKS` in `lib/state/words.ts` sind sieben Wörter über **Systeme**, `TrackState`
sind vier über **Tracks**. `dayLabel()` hat denselben Fall eine Ebene tiefer
schon entschieden und die Begründung mitgeliefert: „A SECOND TABLE, AND IT HAS TO
BE." `core`, `applied` und `learning` gibt es in `MARKS` nicht — LIVE ist, was
ein System ist; eine Fähigkeit ist nicht live, sie wird von etwas belegt, das es
ist.

`queued` gibt es in beiden und es heißt beide Male dasselbe: geplant, nichts,
worauf man zeigen kann. **Also liest `TRACK_MARKS.queued` sein Wort aus `MARKS`
und schreibt es nicht ein zweites Mal** — dieselbe Bewegung, die `dayLabel` mit
`degraded` macht. Zwei Schreibweisen eines Wortes sind der Weg, auf dem zwei
Kopien anfangen, sich zu widersprechen; `words.test.ts` hält beide Hälften.

`steps` — wie viele der vier Balkensegmente gefüllt sind — liegt **in** der
Tabelle und nicht im Bauteil, weil es dieselbe Aufgabe hat wie `dot` in `MARKS`:
das Merkmal zu sein, das kein Farbmerkmal ist. Vier Zustände, vier verschiedene
Längen, und der Test verweigert einen fünften, der sich eine teilt.

Eine `tone`-Spalte gibt es hier **nicht**. `MARKS` trägt eine, weil ein halbes
Dutzend Bauteile `data-tone` in die gemeinsamen Regeln von `state.css` reicht;
diese vier zeichnet ein Stylesheet über `[data-track-state]`, und eine Tonspalte
wäre eine zweite Art, dasselbe zu sagen.

### 2. Die Belegzeile ist immer lesbar — „Ruhezustand 28 %" ist die verworfene Fassung

Drei Quellen, zwei Fassungen:

| Quelle | sagt |
|---|---|
| Handoff-Inventar SYS.00.04.04 (→ `registry.ts`) | `rest 28 %` · `hover 100 % + beleg` |
| `docs/build-plan.md` Z. 1234, daraus abgeschrieben | „Ruhezustand 28 %, Hover 100 %" |
| **Blatt `SYS.01 Training Log`** | „Nachweis-Zeile ist **immer voll lesbar**; beim Hover hebt sich die Zeile an" |

Das Blatt dieser Phase gewinnt, und der **nächste Satz des Bauplans gewinnt
zweimal**: *„die Information darf nie nur in der Deckkraft liegen."* Dasselbe
Blatt führt „Nachweis nur beim Hover, sonst versteckt" ausdrücklich unter den
Fassungen, die es **nicht** genommen hat.

Der ausschlaggebende Grund ist aber keiner von beiden, sondern das Gerät: **ein
Finger kann nicht hovern.** Was nur ein Hover zeigt, existiert auf einem Telefon
nicht, und neun der 22 Zeilen bestehen aus nichts als ihrer Belegzeile. Damit
löst sich auch der Vorlage-Eintrag des Bauplans auf — „Skill-Zeilen-Hover auf
Touch prüfen" —, statt geprüft zu werden: hinter dem Hover liegt nichts, was zu
erreichen wäre. `gallery.training.spec.ts` hält beide Hälften, und die zweite
(„ein Hover fügt kein Wort hinzu") ist die, die die Frage schließt.

Die `states`-Spalte der Registry bleibt **unverändert**, weil sie eine
Transkription ist und keine Meinung; der Widerspruch steht in `note`.

### 3. Der Präfix ist eine Ableitung, und das Blatt schreibt einen Fall zweimal

Die API schickt `state`, `evidence[]` und `note`; das Blatt zeichnet fünf
Präfixe. Also eine Tabelle `state × (evidence leer?) → Präfix`:
`core → RUNS IN` · `applied → SHIPPED IN` · `learning → RUNNING IN` ·
`queued → PLANNED IN` · leeres `evidence` → `NO SYSTEM YET`, das über allen
vieren steht, weil „nichts, worauf man zeigen kann" die speziellere Aussage ist.

**Für `learning` schreibt das Beleg-Blatt zwei Präfixe** — `TOUCHED IN → 02 RELAY
(TOKEN SIGNING)` in einer Zeile und `RUNNING IN → 04 TIMSEIL.DEV (UPTIME
MONITOR)` in einer anderen, für denselben Zustand. `RUNNING IN` bleibt:
`TOUCHED IN` sagt etwas darüber, welchen *Anteil* des Systems der Track ausmacht,
und diese Angabe trägt keine Spalte.

Ein fünfter Präfix, `EVIDENCE`, deckt den Fall ab, den nur ADR 0035 erzeugen
kann: Belegzeilen zu einem Zustandswort, das dieser Container nicht kennt. Er
nennt die Zeilen, ohne zu behaupten, wozu sie den Track machen.

### 4. `UPDATED [DATE]` steht nicht in der Kopfzeile

Der einzige Zeitstempel im Contract ist `generatedAt`, und
`api/internal/training/training.go` füllt ihn **nach** der ETag-Berechnung — er
ist die Uhrzeit *dieser Antwort*, nicht der Stand *des Inhalts*. Als `UPDATED`
gezeigt stünde er bei jedem Neuladen anders da, während sich nichts geändert hat:
genau die Klasse von Zahl, gegen die diese Seite gebaut ist. Das Blatt meint das
`updated` seines eigenen `progress.json`-Entwurfs, und dafür gibt es keine
Spalte.

Beide Zahlen der Kopfzeile — `trackCount`, `evidenceSystems` — kommen aus der
Antwort und werden hier **nicht nachgezählt**. ADR 0018 hat das auf der anderen
Seite der Leitung entschieden und die Begründung mitgeliefert, die diese Seite
einhalten muss: die API zählt die distinkten Systeme genau der Zeilen, die sie
ausliefert, damit „Kopfzeile und Liste strukturell nicht auseinanderlaufen".
Eine zweite Zählung hier baute die zweite Quelle wieder auf, die dieses Argument
entfernt hat.

### 5. Die Modul-Reihenfolge kommt vom Server, und die Karten bekommen ihre eigene Höhe

Das Blatt zeichnet `01 · 02 · 04 · 03 · 05`. Das ist keine Information, das ist
Ausgleich: sechs Tracks neben fünf und fünf, dann drei neben drei. Die API
liefert `ORDER BY module_no`, ADR 0018 nennt die `ORDER BY`-Klauseln „Teil der
Antwort, keine Bequemlichkeit", und auf dieser Seite ist die Nummer die
Reihenfolge — dieselbe Regel, die HOME.01 für die Abschnitte darüber setzt.

**Der Preis ist sichtbar und wird sichtbar bezahlt:** in Serverreihenfolge steht
`03 DATA` mit drei Tracks neben `04 DEVOPS` mit sechs. Gestreckt sind das 200 px
leere Karte, und im Screenshot liest sich das wie die 348 px des Terminal-Körpers
in H3 — nicht als Karte mit wenig darin, sondern als Karte, die nicht geladen
hat. `align-items: start` ist die ganze Antwort: jede Karte ist so hoch wie ihre
Tracks. **Gefunden im Screenshot**, nicht im Markup; am Markup ist an
`stretch` nichts falsch.

## Konsequenzen

- Die Startseite hat ihre **zweite** Suspense-Grenze, und sie beginnt an der
  Abschnitts-Kopfzeile statt darunter: die Kopfzeile trägt die Zahlen der
  Antwort und kann nicht vor ihr gerendert werden. Der Fallback ist dasselbe
  Bauteil mit `body={null}` — ADR 0044s Regel, dass „noch keine Antwort" und
  „gar keine Antwort" nicht zwei Layouts werden dürfen.
- **`Section.reasonKey` und `Section.owedBy` sind jetzt nullbar**, als das Paar,
  das `lib/gallery/registry.ts` schon führt: genau eins von beiden ist gesetzt.
  SYS.01 ist der erste Abschnitt, der seine Begründung verliert, und eine
  Begründung, die eine beendete Abwesenheit erklärt, ist schlimmer als kein
  Feld — sie kompiliert weiter und liest sich aktuell. `homeSys01Why` ist
  gelöscht, nicht aufbewahrt.
- **Null neue Tokens, zum zweiten Mal in Folge.** Jede Farbe des Blattes rundet
  auf einen vorhandenen Token; der Zeilen-Hover findet seinen Präzedenzfall in
  `.incident:target` (`--panel-active`). Die eine Ausnahme ist der `core`-Glow
  (`0 0 6px rgba(0,229,255,.4)`), und er kostet nichts: **kein Track ist heute
  `core`**, weil das zwei live-Systeme verlangt und es eins gibt.
- **Der Achtgradienten-Ecktrick ist beim dritten Vorkommen eine Klasse
  geworden** — `.marks` in `ui.css`, mit `--mark-color` und `--mark-len` als den
  zwei Werten, über die `.spec`, `.term` und `.trn-mod` je verschiedener
  Meinung sind. Der Auslöser ist die dritte Kopie, nicht der gute Vorsatz.
  `.spec` liest dabei `background-color` statt der Kurzform, weil die Kurzform
  `background-image` zurücksetzt.
- **Das Blatt-Orakel kennt jetzt `on`.** Ohne API ist SYS.01 auf `/` das
  Ausfall-Panel, und das Modulraster steht überhaupt nicht im Dokument — ein
  Eintrag, der dorthin zeigte, prüfte gegen nichts. Das ist H2bs Fund eine
  Seite weiter, und es ist dieselbe Antwort: die Galerie. Fünf der acht neuen
  Messungen laufen dort, drei auf `/`.
- **Die Galerie lädt jetzt `home.css`.** Sie hat es nie gebraucht und ihr
  eigener Kopfkommentar hat den Fall vorhergesagt: „a preview that renders under
  a shorter cascade than the page is a preview of something else." Gefunden, weil
  eine Orakel-Messung `display: block` von einem Grid ablas.
- **Die Galerie steht jetzt unter axe** und kam mit einem eigenen Befund an:
  `document-title`, schwerwiegend, seit G7 da und nie angesehen, weil nie jemand
  hingesehen hatte.
- `ContributionGraph` schuldete in der Registry H4 und gehört zu SYS.03, also
  H5. Die `where`-Spalte („hero") bleibt — sie ist die Transkription eines
  Blattes, das älter als HOME.01 ist —, die Phase war schlicht falsch.

## Verworfene Alternativen

**`core`/`applied`/`learning` in `MARKS` aufnehmen** — hieße, sieben Wörter über
Systeme und vier über Tracks in eine Tabelle zu legen, in der `live` und
`applied` nebeneinander stünden, ohne dass irgendetwas sagt, dass sie über
verschiedene Dinge sprechen. `dayLabel` hat diese Alternative schon einmal
verworfen.

**Den Beleg im Hover verstecken, wie das Inventar es zeichnet** — spart Fläche
und kostet neun von 22 Zeilen ihren ganzen Inhalt auf jedem Touch-Gerät.

**Die Module nach Kartenhöhe sortieren, wie das Blatt sie zeichnet** — eine
zweite Meinung über eine Reihenfolge, zu der der Server schon eine hat, und ein
Widerspruch zu HOME.01s eigener Regel zwei Abschnitte höher.

**`generatedAt` als `UPDATED` zeigen** — eine Zeitangabe, die sich bei jedem
Neuladen ändert, ohne dass sich etwas geändert hat.

**Einen Token für den `core`-Glow anlegen** — eine Farbe für eine Zeile, die
niemand sehen kann, bevor das zweite System läuft.

**Die Balkenlänge im Bauteil statt in der Tabelle** — ein Urteil ohne Test, und
das ist die Form jedes Fundes, den dieses Repository bisher hatte.

## Belege

Bauplan Zeile 1234 (H4), Kapitel 8.7 (Backlog-Vorlage, „Skill-Zeilen-Hover auf
Touch prüfen") · ADR 0003 (Zustände als View), ADR 0018 (Abfrageschnitt,
Kopfzeilen-Zählung, „13× applied · 9× queued"), ADR 0035 (überlappender Start),
ADR 0044 (Fallback = dasselbe Bauteil), ADR 0048 (Zustandssprache), ADR 0058
(Platzhalter, Divergenzen) ·
`docs/design/SYS.01 Training Log - evidence.dc.html`,
`docs/design/Homepage - timseil.dev.dc.html` Z. 106–158,
`docs/design/Handoff - timseil.dev.dc.html` (SYS.00.04.04) ·
`contract/openapi.yaml` (`TrackState`, `Training`, `Track`, `Evidence`) ·
`api/internal/seed/seed.sql`, `api/internal/training/training.go` ·
`web/lib/state/words.ts`, `web/lib/api/training.ts`, `web/styles/home.css`,
`web/e2e/sheet.ts`, `web/e2e/gallery.training.spec.ts`.
