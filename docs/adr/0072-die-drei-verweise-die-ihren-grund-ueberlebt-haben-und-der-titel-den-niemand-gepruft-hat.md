# ADR 0072 — Die drei Verweise, die ihren Grund überlebt haben, und der Titel, den niemand geprüft hat

**Status:** Angenommen
**Datum:** 2026-09-07
**Betrifft:** H9c, #298, #32, #292, #241
**Invarianten:** 1 (keine erfundenen Zahlen), 4 (ohne Post-Mortem keine Kerbe),
5 (Belege zeigen nie ins Leere), 8 (keine Farbe außerhalb `tokens.css`)

## Kontext

ADR 0071 hat den Schnitt aufgeschrieben: „H9a der Renderer, H9b der Index samt
Feed, H9c die drei hängenden Verweise (`LogRow`, `IncidentLog`/#298, der Pfeil in
`lib/work/log.ts`)." Alle drei tragen seit H5c denselben Satz — ein `<a>` auf
`/blog/<slug>` wäre eine 404, also Invariante 5 — und `lib/content/posts.ts`
nennt diese Phase namentlich: „H9c is where that pointer becomes an `<a href>`".

**Der Grund ist mit `56400fc` erloschen. Zwei der drei Verweise werden dadurch
richtig; einer nicht, und ein vierter Fall wird sogar gefährlich.** Diese Phase
ist damit weniger „drei Links bauen" als vier verschiedene Antworten auf eine
Frage, die dreimal gleich gestellt und einmal falsch beantwortet worden wäre.

Dazu ein Vorfall aus der H9b-Abnahme, dessen Prüfregel jetzt gebaut werden darf,
weil er passiert ist und ein Datum hat.

## Entscheidung

### 1. Die Log-Zeile wird ein Link, nach dem Muster von `PostCard`

Das Blatt zeichnet drei Versprechen an der Zeile: einen `→` in einer dritten
Spalte, einen Zeigerkursor und eine Hover-Füllung. H5c hat **alle drei zusammen**
zurückgehalten, und das war richtig: eine Zeile, die unter dem Zeiger aufleuchtet
und beim Klick nichts tut, ist das tote Bedienelement, das STATE.05 ablehnt — mit
einer Einladung obendrauf. Sie werden jetzt zusammen eingelöst.

**Ein `<Link>` um das Raster, und `WorkRow`s Ablehnung gilt weiter.** Was jene
Zeile abgelehnt hat, waren **drei** Bedienelemente zu einem Ziel. Eine
Log-Zeile hat genau ein Ziel und nichts anderes zum Anklicken, also ist ein
Link **ein** Tab-Stop — dieselbe Zahl, auf die `WorkRow` kommt. Der Linktext ist
der Titel, weil der Titel der Satz ist, den man anklickt; der Pfeil ist
Dekoration und sagt es (`aria-hidden`). `PostCard` hat dieselbe Entscheidung eine
Seite weiter schon getroffen, und dass die beiden Zeilen desselben Korpus
übereinstimmen, war der Grund, diese als zweite zu bauen.

**Das Raster wandert auf den Anker, nicht auf das `<li>`.** Ein Link nur um den
Titel legte den Hover auf eine Phrase und den Zeiger auf einen Streifen daneben.
Ein Raster auf dem Listenpunkt mit einem Anker in einer Zelle machte die dritte
Spalte zu etwas, wohin die ersten beiden nicht führen. Der Umzug ist gemessen
und nicht kosmetisch: die Sweep-Sonde las `.log-row`'s `display`, das seitdem
auf jeder Breite `list-item` ist — sie hätte gemeldet, der 560er-Schalter finde
nicht mehr statt. Er fand statt; die Sonde nicht.

**Bei 390 wird der Pfeil nicht gezeichnet.** Vom Blatt abgelesen, nicht
abgeleitet: das 390er-Artboard zeichnet drei gestapelte Zeilen — Datum, Titel,
Dek — und sonst nichts. Ein dritter Flex-Punkt setzte ein einzelnes `→` auf eine
vierte Zeile unter das Dek. Die Zeile bleibt der Link.

### 2. Der Post-Mortem-Verweis ist ein Link, **wenn der Eintrag existiert**

#298 verlangt die Auszeichnung, und die Auszeichnung ist bedingt. Der Grund ist
eine Messung, keine Vorsicht — am Tag, an dem der Link fällig wurde, löste **kein
einziger `post_slug` in diesem Projekt auf eine Datei auf**:

| Fläche | `post_slug` | Datei |
|---|---|---|
| `api/internal/fixtures/incident.sql` | `001-fixture-outage` | fehlt, **absichtlich** — der Kommentar sagt es |
| Galerie, INC-001 | `011-the-migration-that-locked-the-table` | fehlt |
| Galerie, INC-002 | `012-acme-json-and-the-three-am-restart` | fehlt |
| Produktion `/api/systems/timseil-dev` | — | `incidents: []` |

Ein bedingungsloses `<a>` hätte Invariante 5 in genau der Phase gebrochen, die
sie erfüllen soll, und zwar auf der einzigen Fläche, die es zeigen kann.

`postSlug` ist ein freier String aus der API. Die Datenbank kann seine **Gestalt**
festlegen — `00004_operations.sql` tut es, mit demselben Muster, das der Leser in
`lib/content/posts.ts` kopiert — und seine **Existenz** nicht: ein Fremdschlüssel
kommt nicht in ein Verzeichnis. `postFor` ist dasselbe Tor, das `/blog/[slug]`
sich selbst vorsetzt, hier für dieselbe Frage.

**Der unaufgelöste Fall ist kein Fehler, sondern das alte Verhalten.** Der Slug
steht als das da, was er ist: der Name eines Eintrags. Ein Incident, dessen
Post-Mortem noch niemand geschrieben hat, ist immer noch ein Incident mit Ursache
und Behebung, und ihn wegzulassen wäre die schlechtere Antwort.

**Die Auflösung lebt in `lib/case/postmortem.ts` und nicht in der Komponente.**
`npm test` liest `lib/**` und `styles/**`, und Node entfernt Typen, ohne JSX zu
übersetzen — eine Entscheidung in einer `.tsx` ist eine Entscheidung, über die
nichts eine Behauptung aufstellen kann. Dieselbe Begründung wie
`lib/work/entries.ts`.

**Die Galerie zeigt beide Hälften.** INC-001 nennt jetzt einen echten Eintrag und
verlinkt ihn, INC-002 behält einen erfundenen. Eine Galerie, die beide erfunden
lässt, zeigt einen von zwei Zuständen — dieselbe Lücke, die H9bs Blog-Galerie
geschlossen hat.

### 3. Der Pfeil an der WorkRow wird nicht gebaut, und der Grund ist ein anderer

Das Blatt zeichnet `01 ENTRY IN THE LOG →` und sagt dazu: „verbindet jedes System
mit den Posts, die darüber geschrieben wurden."

**Diese URL gibt es nicht.** ADR 0071 §8 hat den Filterzustand aus der URL
gehalten, weil `searchParams` die Route dynamisch machten, und `lib/blog/filter.ts`
hat zwei Achsen — `tag` und `q` —, von denen keine ein System ist. Auf das
ungefilterte `/blog` zu zeigen wäre ein Bedienelement, das eine engere Liste
verspricht als es liefert; genau das hat ADR 0071 §7 für den `SUBSCRIBE`-Block
abgelehnt. Eine dritte Achse zu erfinden, damit der Pfeil stimmt, ist die Form,
die #292 offenhält.

**Der alte Grund erlischt, die Entscheidung bleibt.** Das ist wörtlich die Regel,
die der H9a-Backlog notiert hat: „Der Grund für eine Abwesenheit kann erlöschen,
ohne dass die Abwesenheit falsch wird." Hier wird sie angewandt statt entdeckt —
und deshalb steht sie in einem ADR und nicht nur in einem Kommentar, denn sonst
wird sie ein drittes Mal geführt.

### 4. Ein Test, der das Repository behauptet, liest es

`lib/work/log.test.ts` hieß „attributes all fifteen entries to this site" und
baute sich fünfzehn Fixtures. Der Korpus hält vierundzwanzig. Der Test war grün
und korrekt und redete über ein Verzeichnis, das er nie geöffnet hat — dieselbe
Form wie `BLOG_POST_NEWEST` in H9a, dieselbe Reparatur: `readPosts(POSTS_DIR)`,
und keine getippte Zahl auf beiden Seiten der Behauptung.

Dazu ein Fall, ohne den der neue Test auf einem leeren Verzeichnis grün wäre
(`0 === 0`, und `logEntriesLine(0)` ist `null` nach Entwurf). Dass **jede** Datei
lesbar ist, bleibt `posts.test.ts`' Behauptung — eine Behauptung, ein Besitzer.

### 5. #32 als `db`-Test, und die Fixture-Ausnahme entfällt

Der Link aus §2 hat eine Bedingung, und eine Bedingung, die nichts prüft, ist
eine Hoffnung. #32 ist seit E2 offen.

**Ein `db`-Test und kein Shell-Skript,** weil kein Werkzeug in `tools/` psql
spricht und `api/migrations/*_db_test.go` es tut. `compose.dev.yaml` hängt
`web/content/posts` schreibgeschützt unter **denselben Pfad**, den das
Verzeichnis auf einem Rechner hat, damit `../../web/content/posts` ein String
bleibt statt einer Fallunterscheidung „läuft das in Docker".

**#32 sagt „the job has to skip fixtures". Das ist hier nicht nötig, und das ist
besser.** `dbtest.FreshSchema` legt Migrationen an und sonst nichts, also ist die
Fixture-Zeile gar nicht da. Eine Ausnahme, die niemand schreiben muss, ist eine
Ausnahme, die niemand später weiter fassen kann.

**Und der Test sagt, was er geprüft hat.** Der Seed schreibt keine Incidents —
„those are measurements" — und Produktion antwortet `incidents: []`, also prüft
er heute null Zeilen:

```
post_slug_db_test.go:121: checked 0 incident(s) against 24 entries in ../../web/content/posts
```

Das ist die Form der vier Tests, die H2b grün fand, weil sie nichts geprüft
hatten. Die Antwort ist nicht, den Test zu lassen, sondern ihn die Zahl sagen zu
lassen — und daneben einen zweiten, der dem Finder eine falsche Zeile hinlegt und
verlangt, dass er sie meldet.

### 6. Der PR-Titel wird geprüft, indem der Hook ihn liest

Der Vorfall hat ein Datum. PR #338 hieß „H9b · The log index, and the filter
drawn against ten entries", ohne Typ. Der Squash-Merge macht den Titel zum Commit
auf `main`, `tools/release.sh` liest genau diesen Typ, fand keinen, und blieb
grün — weil „kein Release fällig" für einen typlosen Merge die richtige Antwort
ist. Kein `v0.32.0`, und `/api/badge/version` lieferte öffentlich
`v0.31.0-3-g254cd67`. `CONTRIBUTING.md` sagt es seit E5c in Worten, und Worte
sind kein Gatter.

**Eine Grammatik, eine Datei.** Der Wächter schreibt den Titel in eine Datei und
lässt `.githooks/commit-msg` darauf los — dasselbe Programm, das `git commit`
ausführt. Die 72-Zeichen-Regel kommt gratis mit, und die kaputten Fälle stehen
weiter dort, wo sie standen: in `tools/selftest.sh`, jetzt um den Titel ergänzt,
der wirklich durchgekommen ist.

**Eine eigene Workflow-Datei und kein Job in `ci.yml`.** `ci.yml` nimmt
`pull_request` mit den Vorgabe-Typen — `edited` ist nicht dabei. Ein Titel, der
nach dem grünen Lauf korrigiert wird, würde nie wieder angesehen. `types:` dort
zu ergänzen hieße, die volle Pipeline bei jeder Titel- und Textänderung neu zu
starten. `synchronize` steht trotzdem in der Liste, obwohl ein Push keinen Titel
ändert: eine Branch-Protection-Regel will die Prüfung am Kopf-Commit, und ein
neuer Kopf ohne Lauf ist ein PR, den niemand mergen kann.

**Der Titel kommt über `env` und nie über `${{ }}` in einem `run:`.** Ein
Ausdruck wird in das Skript eingesetzt, bevor die Shell es sieht; ein Titel mit
Backtick oder `$(…)` würde ausgeführt statt geschrieben. Nachgemessen mit
`feat(web): `$(touch /tmp/pwned-by-a-pr-title)` and a backtick` — angenommen als
Text, die Datei existiert nicht.

### 7. `style:` steht jetzt auch im Hook

Der H9a-Backlog hat es gefunden und es war folgenlos: `CONTRIBUTING.md` und
`tools/release.sh:29` führen `style` seit E5c als „kein Release", der Hook nicht.
Solange nur lokale Subjects gelesen wurden, warf der Squash das Ergebnis weg.
Sobald derselbe Hook den **Titel** liest, ist ein Typ, den der Leitfaden erlaubt
und der Hook ablehnt, ein Merge, den niemand abschließen kann. Zwei Kopien einer
Liste, eine veraltet — #241, wieder.

### 8. `witness.sh` behält seine Zahl und verliert seine Behauptung

Der Kommentar sagte „1800 is twice the observed lead time". Gemessen:

```
H9a  2026-09-04  22:52:34Z -> 23:08:01Z    927 s
H9b  2026-09-06  23:49:32Z -> 00:13:53Z   1461 s
```

1800 über 1461 sind **1,23×** und 339 s Rand. Der Deckel bleibt: ihn zu erhöhen
wäre eine zweite Schätzung, wo dies wenigstens eine Lesung ist, und die alten
900 hätten den H9b-Tausch um 561 s verpasst — schlimmer als der Fehlgriff, der
die Erhöhung ausgelöst hat. Was die Zeile einem Leser schuldet, ist der Rand, den
sie wirklich hat.

## Verworfene Alternativen

**Den Post-Mortem-Verweis bedingungslos verlinken, wie #298 es formuliert.** Die
naheliegende Lesart des Issues und die einzige, die heute garantiert eine 404
ausliefert. §2 hat die Zahlen.

**`postFor` in `IncidentLog` selbst aufrufen.** Kürzer und macht die Komponente
zu etwas, das ein Verzeichnis liest — womit die Galerie sie nicht mehr rendern
könnte und die Entscheidung in eine `.tsx` wanderte, über die `npm test` nichts
sagen kann.

**Eine prerenderte Route `/blog/system/<slug>`, damit der Pfeil ein Ziel bekommt.**
Ein echtes Ziel, statisch, ohne `searchParams` — und eine Fläche, die kein Blatt
zeichnet, mit eigenem Leerzustand, Sitemap-Einträgen und JSON-LD-Frage. Die Phase
wäre doppelt so groß für ein Bedienelement, nach dem niemand gefragt hat.

**Den Pfeil auf `/blog` zeigen lassen.** Billig und unehrlich; siehe §3.

**#32 als Ausnahmeliste, die Fixtures überspringt.** Das Issue schlägt es selbst
vor, und es war für einen Job gedacht, der gegen irgendeine Datenbank läuft. Eine
Ausnahme ist eine Zeile, die jemand später weiter fasst.

**Den PR-Titel-Wächter als Job in `ci.yml` mit `types: [… edited]`.** Eine Datei
weniger, und jede Textänderung an einer PR-Beschreibung startet fünfzehn Minuten
Pipeline neu.

**Die Grammatik im Workflow noch einmal schreiben.** Ein `grep -E` in YAML wäre
die zweite Kopie eines Musters, das dieses Repository schon zweimal als #241
geführt hat — und die 72-Zeichen-Regel wäre die dritte.

## Konsequenzen

- **Von den vier Ablehnungen aus H5c ist eine übrig,** und sie steht aus einem
  anderen Grund da als die drei anderen: `LogRow` verlinkt, `IncidentLog`
  verlinkt was auflöst, der Feed trägt jeden Eintrag, und die Zeile an der
  WorkRow bleibt Text, weil ihr Ziel keine Adresse hat.
- **Die Startseite geht von drei Bedienelementen auf sechs.** Alle drei neuen
  sind Zeilen — die Form, die eine 44px-Regel zufällig erfüllt —, deshalb prüft
  `touch-targets.coarse.spec.ts` weiter eine Zahl und nicht nur eine Untergrenze.
- **Eine Abweichungsklasse geht in Rente.** `no-link-until-h9` ist aus
  `gen-sheet-oracle.mjs` und aus allen sieben Orakeln verschwunden; die
  Startseite hat eine Abweichung weniger (18 → 17), und die dritte Spur des
  Blattes wird zum ersten Mal gezeichnet.
- **Ein Merge ohne Conventional-Commit-Titel ist ab jetzt kein grüner Lauf mehr.**
  Der Wächter prüft sich beim Merge dieser Phase zum ersten Mal selbst.
- **Der `db`-Job trägt eine zweite Bindung.** `make check-db` hängt jetzt an
  `web/content/posts`; ein Umbau des Verzeichnisses lässt einen Go-Test rot
  werden, und das ist beabsichtigt.

### Was das kostet

- **Der #32-Check prüft heute null Zeilen.** Er ist ein Geländer für die erste
  echte Kerbe, keine Messung — und er sagt das in seiner eigenen Ausgabe, statt
  es einen Leser annehmen zu lassen.
- **Die Galerie hängt an einem echten Slug.** Wird der Eintrag umbenannt, fällt
  der Link auf 404 — abgefangen von `gallery.ops.spec.ts`, das die Adresse
  wirklich abruft, statt ihre Form zu prüfen.
- **Eine dritte Workflow-Datei.** Der Preis für einen Job, der auf `edited`
  laufen muss und die Pipeline nicht mitziehen darf.

## Belege

Build-Plan Phase H9. Blätter `Blog Index`, `Blog Post`, `Homepage`, `Work Index`
(read-only). Issues #298, #32, #292, #241, #322.
`ADR 0002` (MDX im Repo) · `ADR 0036` (Releases als Tag ohne Release-PR) ·
`ADR 0044` (die Naht zwischen Fallback und Antwort) · `ADR 0062` (der Log liest
das Repository) · `ADR 0070` (der Renderer und das Schema) · `ADR 0071` (der
Index, der Feed und der Schnitt H9a/b/c).
