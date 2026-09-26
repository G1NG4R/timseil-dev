# ADR 0081 — Was ein System erzeugt, bleibt, und die Prosa über die eigene Arbeit hat keinen anderen Beleg als ihren Autor

**Status:** Angenommen
**Datum:** 2026-09-26
**Betrifft:** U6 — die Case Study `/work/timseil-dev`; weitet ADR 0079 §4 von
`web/content/posts/` auf `web/content/case-studies/` aus; löscht zwei Regeln,
die ADR 0065 und H2a gesetzt haben; korrigiert die Bleibt-Tabelle aus A11
**Invarianten:** 1 (keine erfundenen Zahlen), 5 (Belege zeigen nie ins Leere),
8 (keine Farbe, kein Radius, keine Dauer außerhalb `tokens.css`)

## Kontext

Die Case Study war die längste Prosa dieser Seite: 409 Zeilen in
`web/content/case-studies/timseil-dev.ts`, verteilt auf achtzehn Felder und
gezeichnet von neunzehn Bauteilen. Sie erklärte, warum ein Portfolio ein
laufendes System sein muss, welche fünf Zwänge dabei galten, welche fünf
Stationen eine Anfrage nimmt, welche vier Entscheidungen gegen welche
Alternative gefallen sind, in welcher Reihenfolge gebaut wurde, was die
Observability sammelt, was gehalten hat und was der Autor anders machen würde.

**Sie war gut, und sie war von Claude Code geschrieben.**

ADR 0079 hat für die Log-Beiträge genau daraus eine Regel gemacht — §4: *„Ein
Log, das erklärt, was jemand gelernt hat, kann nicht von etwas anderem
geschrieben sein: es ist die eine Textsorte auf dieser Seite, deren Beleg der
Autor selbst ist."* Die 25 Beiträge sind in U2 weggefallen.

**§4 nennt die Case Study nicht.** Das Wort „Prosa" kommt in ADR 0079 überhaupt
nicht vor; §4 handelt ausschließlich von `web/content/posts/`. Der Build-Plan
sagt für U6 einen Satz — *„die Prosa-Blöcke fallen weg, die Mess-Blöcke bleiben
(Live, Ops, Metriken, Incident-Log)"* —, und der Sitzungsplan sagt *„Neue Prosa
schreibt Tim"*. Was keiner von beiden sagt, ist **woran man einen Prosa-Block
erkennt**, und diese Frage ist nicht rhetorisch: von den vier Blöcken, um die
sie sich dreht, ist einer ein Generat, einer wird von einem Test gehalten, und
zwei sind getippt. Ohne eine Regel wird die Frage bei jedem künftigen
Case-Study-Umbau neu geführt — P7 gibt System 03 dieselben Felder.

### Die Regel stand schon im Repository, in einem Testkopf

`web/lib/content/pipeline.test.ts:4-13`, geschrieben in H2b, über sich selbst:

> „WHY THIS TEST EXISTS AND THE OTHER PROSE ON THE PAGE HAS NONE. Everything
> else in content/case-studies is an argument — it is right or wrong the way a
> sentence is, and a test cannot tell. The pipeline row is different: it is a
> list of NAMES that exist somewhere else. […] What this test buys is that it
> cannot stay wrong."

Der Satz war als Begründung für einen Test gemeint. Er ist die Definition, die
U6 gebraucht hat.

## Entscheidung

### 1. Das Kriterium

> **Auf einer Case Study steht, was ein System erzeugt oder was eine Prüfung
> hält. Was nur richtig oder falsch ist wie ein Satz, steht dort nicht.**

Angewandt auf die achtzehn Felder:

| Bleibt | Wer belegt es |
|---|---|
| Systemnummer, Name, Zustand | `/api/systems/{slug}` |
| `stack`, `source` | `/api/systems/{slug}`, gefüllt von `make gen` aus `go.mod`, `package.json`, `compose.yaml` |
| die fünf Metrik-Kacheln | `/api/systems/{slug}` |
| das 91-Tage-Raster, die Kerben, das Incident-Log | `/api/systems/{slug}` |
| `composeCaption` + der Block darunter | `tools/gen-compose-excerpt.mjs`, und `make check` wird rot, wenn `compose.yaml` sich bewegt und der Ausschnitt nicht |
| `stages` | `web/lib/content/pipeline.test.ts` hält jeden `job` gegen `.github/workflows/ci.yml` |

| Fällt | Warum |
|---|---|
| `lead` | Argument |
| ~~`problem[]`, `constraints[]`~~ | **Zurückgenommen am selben Tag — siehe Nachtrag** |
| `architecture.hops[]`, `.lanes[]`, `.decisions[]` | Argument. Der Anfrageweg spiegelt `docs/architecture/c4-container.md`, aber **nichts hält die zehn Texte dagegen** — genau die Lücke, die `pipeline.test.ts` für die Pipeline geschlossen hat |
| `build.phases[]` | Argument |
| `operations.observability[]` | Argument |
| `result.holds[]`, `.change[]`, `.next` | Argument |
| `alert` | Argument, und in der einen Farbe, die diese Seite für einen Ausfall reserviert — siehe §5 |
| `role` | siehe §3 |

Zwei Felder bleiben getippt und sind kein Beleg: `headline` und `year`. §3 sagt,
warum das kein Widerspruch ist.

### 2. `composeCaption` und `stages` bleiben, obwohl der Build-Plan sie nicht nennt

Der Build-Plan zählt vier Mess-Blöcke auf: **Live, Ops, Metriken,
Incident-Log.** Der Compose-Block und die Pipeline stehen nicht darin, und sie
bleiben trotzdem. Das ist eine Abweichung von der Phasenbeschreibung, und sie
gehört benannt statt verschwiegen.

Der Grund ist, dass die Aufzählung nach der **Quelle** sortiert ist — alles
vier kommt aus der API — und das Kriterium nach der **Prüfbarkeit**. Ein
Ausschnitt, den ein Generator schreibt und ein Checksummenvergleich bewacht, ist
nicht weniger belegt als eine Zahl aus einem Endpoint; er ist nur nicht aus dem
Endpoint. Dieselbe Prüfung hätte die Aufzählung wörtlich genommen und
`tools/gen-compose-excerpt.mjs`, `web/lib/content/compose.ts`,
`web/content/generated/compose-api.gen.json` und `pipeline.test.ts` mit
gelöscht — vier Werkzeuge, deren ganzer Zweck es ist, eine Behauptung an ein
laufendes System zu binden. Das wäre die Regel dieses Repositories gegen sich
selbst gewendet.

### 3. `role` fällt, `year` und `hosting` bleiben

Die SPEC-Rail hatte fünf Zeilen: ROLE · STACK · YEAR · STATUS · SOURCE. Drei
kommen aus der API. `role` lautete *„Design, backend, infrastructure — solo"*,
`year` lautet *„2026 — ongoing"*, `hosting` lautet *„self-hosted"*.

`role` fällt, und nicht nur, weil es das Wort „backend" trug:

- **`year` und `hosting` sind Angaben über das System.** Seit wann es läuft, und
  wie es läuft. Beide sind aus dem Repository nachprüfbar, und `hosting` ist per
  Entwurf die getippte Hälfte einer halb gemessenen Zeile
  (`types.ts`: *„the qualifier after the state word"*).
- **`role` war eine Angabe über den Autor.** Und die Rolle ist genau die
  Behauptung, die ADR 0079 zurückgenommen hat, weil kein laufendes System sie
  trägt. Eine Fallstudie, die auf ihrer Messtafel eine Zeile über die Fähigkeit
  ihres Autors führt, führt sie an der einen Stelle, an der ihr niemand
  widersprechen kann.

Die Rail zeigt danach vier Zeilen. Unter 1080 ist `.spec-body`
`72px 1fr 72px 1fr` — mit fünf Zeilen blieb rechts unten eine halbe Zeile leer,
mit vier geht das Raster genau auf. Das ist keine Begründung, aber es ist der
Beleg, dass die Entscheidung nichts kaputt macht.

`headline` bleibt, weil ein Dokument eine Überschrift braucht, bevor irgendetwas
geantwortet hat, und weil `<h1>` hinter einer `<Suspense>`-Grenze bedeutet, dass
der Fallback eine Überschrift ohne Daten erfinden müsste. Es ist der eine Satz,
den diese Phase stehen lässt, und er ist über das System: *„This site is the
system it describes."*

### 4. Zwei Sektionen, neu durchnummeriert

`.01 PROBLEM`, `.02 ARCHITECTURE` und `.05 RESULT` fallen ganz. `.03 BUILD`
wird `.01`, `.04 OPERATIONS` wird `.02`.

**Die Nummern werden nachgezogen und nicht mit Lücken gelassen.** Sie stehen
sichtbar auf der Seite, und eine Seite, die mit `.03` anfängt, behauptet zwei
Sektionen, die ein Leser nicht findet — dieselbe Klasse wie ein Beleg, der ins
Leere zeigt (Invariante 5).

Verworfen: **eine** Sektion, in die der Compose-Block einwandert. Der Block
sagt, *was* der Host fährt; die Pipeline sagt, *wie* ein Commit dorthin kommt.
Das sind zwei Fragen, und `SectionHead` ist das Bauteil, das eine Frage über
einen Rumpf setzt.

### 5. `.cs-arch` und `.cs-prob` werden gelöscht, nicht aufbewahrt

`.cs-arch` (`1fr 420px`, gap 60) hielt links den Compose-Block und rechts die
Build-Phasen. Fallen die Phasen, ist die rechte Spalte leer — und *„die Seite
trägt sich ohne leere Rahmen"* ist das Abnahmekriterium dieser Phase.
`.cs-prob` (`1fr 380px`, gap 80) verliert beide Kinder.

Beide Regeln fallen, mit dem Präzedenzfall, den `layout.css` selbst führt: H3
hat `.cs-hero` gelöscht, weil *„eine Regel, die niemand erreichen kann, ist kein
Ersatzteil, sondern die Behauptung, dass es etwas gibt."*

Das 380er-Paar ist damit nicht verloren — `.lg-body` deklariert dieselben Werte,
und die vier Kommentare, die bisher `.cs-prob` als kanonische Nennung zitierten
(`layout.css` an vier Stellen, `web/e2e/widths.ts` an drei), zeigen jetzt
dorthin. Das 420er-Paar ist weg: nichts sonst auf dieser Seite stellt eine
420px-Rail neben eine Spalte, und einen Verbraucher dafür zu erfinden wäre
genau die Behauptung, die H3s Notiz ablehnt.

**Nebenwirkung: #292 löst sich auf.** Die Regel
`.decision-table { grid-template-columns: 1fr }` (`layout.css:505`) hatte seit
H2a keinen Verbraucher, weil die Karten­form unter 720 auf anderen Selektoren
steht. Sie fällt mit dem `<table>`, das sie nie erreicht hat.

**Und #297 löst sich auf.** *„Rot steht zweimal auf der Case Study"* war die
Hero-Zeile gegen die erste Ausfallzelle: die eine immer da, die andere
verdient. Mit `alert` ist die Hero-Zeile weg, und `--alert` steht auf dieser
Seite nur noch auf der Ausfallzelle, ihrer Legende und der Incident-Kennung.
Der Alert-Moment ist wieder einer, und er ist gemessen. Das Issue wird **nicht
hier geschlossen** — Stufe U triagiert nach U9.

### 6. Das Blatt-Orakel wird gefiltert, nicht geschrumpft

22 der 50 Einträge in `web/e2e/oracle/case-study.gen.json` messen Bauteile, die
diese Phase entfernt. Sie werden **nicht** aus `tools/gen-sheet-oracle.mjs`
gestrichen.

Der Grund steht in `web/e2e/sheet.ts`: `minimumEntries` *„moves up with each
phase that adds measurements; it never moves down without someone saying why"* —
die Schwelle steht bei 39 und müsste auf 28 fallen. Und `drawnWidths` wird
zugesichert, *„so a shrinking oracle is a failure rather than a quieter run"*.
Ein geschrumpftes Orakel ist die Form, in der eine Messung verschwindet, ohne
dass es jemand merkt.

Stattdessen der `applies`-Haken, den U2 für die zehn `home-log-*`-Einträge
gebaut hat: `case-study.sheet.spec.ts` benennt die 22 Kennungen in einem `Set`
und erklärt die anderen 28. Das Orakel bleibt vollzählig, die Schwelle bleibt
bei 39, und alle drei gezeichneten Breiten bleiben besetzt (1440: 18, 1024: 5,
390: 5). Am Tag, an dem Tim eine Constraints-Liste schreibt, kommen die
Einträge alle zurück, ohne dass jemand eine Zahl anhebt.

`docs/design/` wird nicht angefasst. Die Blätter zeichnen fünf Sektionen weiter;
sie sind die Zeichnung, nicht der Bau.

### 7. Die Bleibt-Tabelle aus A11 ist korrigiert

Der Sitzungsplan erwartet nach U6 *„genau die neun Zeilen"* aus seiner
Bleibt-Tabelle. Die Zahl stimmt nicht, und zwar aus einem Grund, der nichts mit
U6 zu tun hat: die Tabelle zählt sieben Dateien auf, die im Umfang des greps
gar nicht vorkommen — `web/proxy.ts`, `web/lib/drain.ts`, `web/lib/reqid.ts`,
`web/app/healthz/route.ts`, `web/app/dev/components/page.tsx`,
`web/lib/state/words.ts`, `web/components/case/SpecRail.tsx`. Eine ihrer Zeilen
(`words.ts:50`) trägt das Wort seit U1 ohnehin nicht mehr.

```
grep -rniE '\bbackend\b' web/lib/i18n/messages/en.ts web/lib/site.ts \
  web/lib/about/content.ts web/content/case-studies/timseil-dev.ts \
  api/internal/seed/seed.sql README.md
```

Vor U6 liefert er **sechs** Zeilen, nach U6 **vier**, und keine der vier
bezeichnet eine Rolle: zwei Mal `README.md` (die Schicht der Stack-Tabelle, und
was hinter dem Proxy hängt) und zwei Kommentare in `en.ts`. Die dritte
Fundstelle, die U6 räumt, liegt außerhalb dieses Umfangs — `SpecRail.tsx`
zitierte die ROLE-Zeile im Kommentar und fällt mit ihr.

## Konsequenzen

### Die Seite ist kurz, und sie sagt nichts über sich selbst

> **Korrigiert im Nachtrag vom 26.09.2026.** Die drei folgenden Abschnitte
> beschreiben den Stand, den #413 gemergt hat. Er hielt drei Stunden; `.01
> PROBLEM` steht seitdem wieder da, und die Zahlen darin sind entsprechend um
> eine Sektion, zwei Felder, zwei Wörterbuch-Schlüssel und acht Orakel-Einträge
> daneben. Sie bleiben stehen, weil ein ADR festhält, was an einem Tag
> entschieden wurde.

Fünf Sektionen werden zwei. 409 Zeilen Inhalt werden 144, neunzehn Bauteile
werden zwölf, 928 Zeilen `case.css` werden 548. Was ein Leser findet, ist eine
Messtafel: eine Überschrift, vier Spec-Zeilen, fünf Kacheln, der Compose-Block,
sieben Pipeline-Stationen, 91 Tage und ein Incident-Log. Was er nicht mehr
findet, ist ein Grund, warum das so gebaut ist.

**Das ist ein echter Verlust, und er ist befristet auf „bis Tim schreibt."** Er
wird in Kauf genommen, weil die Alternative eine Fallstudie ist, deren Argument
jemand anders formuliert hat — auf einer Seite, deren erste Regel lautet, dass
jede Behauptung einen Beleg braucht.

### Fünfzehn Wörterbuch-Schlüssel weniger, und U8 merkt es

`csRole`, `csProblem`, `csConstraints`, `csArchitecture`, `csSideLanes`,
`csDecisions`, `csDecision`, `csAlternative`, `csWhyThisOne`, `csPhases`,
`csResult`, `csObservability`, `csWhatHolds`, `csWhatIdChange`, `csNextSystem`.

`Messages` ist `Record<keyof typeof en, string>`, und `de.ts`/`fr.ts` sind leere
`Partial<Messages>`. Jeder Schlüssel in `en.ts` ist eine Zeile, die U8 einem
deutschen und einem französischen Leser schuldet. Eine Überschrift, die niemand
zeichnet, ist eine Übersetzung, die niemand prüfen kann.

### 22 gezeichnete Messungen werden nicht mehr erklärt

Das Blatt zeichnet die Constraints, den Anfrageweg, die Entscheidungstabelle,
die Phasen und das Ergebnis weiter, und der Lauf sagt zu keinem davon mehr
etwas. Das ist die Kehrseite von §6: die Einträge bleiben stehen und schweigen,
statt zu verschwinden. Die Alternative wäre eine Schwelle, die fällt, und eine
Schwelle, die fällt, ist die Zusicherung, die `sheet.ts` ausdrücklich nicht
geben will.

### `year` ist der zweite handgetippte Zeitwert

`updatedAt` ist #284 — der eine Wert auf dieser Seite, den ein Mensch pflegt,
und U6 hat ihn zum zweiten Mal von Hand bewegt. `year: "2026 — ongoing"` ist von
derselben Art, nur ohne Verbraucher, der ihn falsch anzeigen könnte. Kein Fund,
kein Vorfall, keine Regel — eine Zeile im Backlog unter *Idee*.

`hosting: "self-hosted"` wird beim Cutover mehrdeutig. Das ist U9.

## Nachtrag vom 26.09.2026 — das Kriterium war zu grob, und `.01 PROBLEM` kommt zurück

**§1 hat `problem[]` und `constraints[]` gefällt, und das war falsch.** Drei
Stunden nach dem Merge von #413 stehen beide wieder auf der Seite, als `.01`,
mit angepasstem erstem Absatz. Die übrigen Streichungen bleiben.

### Was der Fehler war

Nicht die Regel, sondern ihre Reichweite. „Ein System erzeugt es, oder eine
Prüfung hält es" ist ein gutes Kriterium **für eine Behauptung über das System** —
eine Zahl, eine Versionsangabe, ein Job-Name, eine Station im Anfrageweg. Der
Anfrageweg und die Entscheidungstabelle sind zu Recht gefallen: sie behaupten
Sachverhalte, die anderswo nachprüfbar wären, und nichts hielt sie dagegen. Das
ist ein Argument in der Form einer Messung, und genau das lehnt diese Seite ab.

`.01 PROBLEM` ist keine Behauptung über das System. Es ist die Begründung
dafür, dass es das System überhaupt gibt:

> „A portfolio that only shows screenshots asks the reader to take the
> engineering on trust."

Auf so einen Satz ist das Kriterium nicht anwendbar, und es anzuwenden hieß, ihn
mit „nichts hält ihn" zu erledigen — was wahr ist und nichts beweist. Kein
System kann erzeugen, warum jemand etwas gebaut hat. **Eine Seite, deren ganzes
Argument „jede Behauptung hat einen Beleg" lautet, schuldet dem Leser den Satz,
der das Argument ausspricht.** Ohne ihn ist die Fallstudie eine Messtafel, die
nicht sagt, wofür sie steht — und die Regel, die sie erklären sollte, steht
nirgends auf der Seite, die nach ihr gebaut ist.

Die fünf Constraints kommen mit, und bei ihnen ist der Fall sogar enger: Kapitel
3 des Build-Plans lehnt WebGL ab, indem es *„bricht Constraint 04 deiner eigenen
Fallstudie"* zurückzitiert. Ein nummerierter Satz, aus dem ein anderes Dokument
argumentiert, ist das Nächste an einer gehaltenen Aussage, was diese Datei zu
bieten hat. §1 hat ihn als „Argument" abgeräumt und dabei den Verbraucher
übersehen.

### Die geschärfte Fassung des Kriteriums

> **Was eine Sache über das System behauptet, braucht einen Beleg: ein System
> erzeugt es, oder eine Prüfung hält es. Was begründet, warum es das System
> gibt, braucht einen Autor — und der ist Tim.**

Der zweite Satz nimmt §1 nichts weg. Er sagt, worauf der erste zielt. Nach ihm
bleiben alle Streichungen von U6 bestehen außer diesen beiden.

### Was das kostet, und was es über das Vorgehen sagt

- **Ein gemergter Stand war drei Stunden lang ärmer als nötig.** Der Weg dahin
  war kein Versehen: das Kriterium wurde entschieden, aufgeschrieben, gegen 24
  Dateien angewandt und durch 2170 Tests gefahren. Es war nur an einer Stelle zu
  breit gefasst, und keine der 2170 Prüfungen konnte das melden — sie prüfen,
  ob die Seite tut, was sie soll, nicht ob sie sagen sollte, was sie sagt.
- **Der erste Absatz musste angefasst werden.** Er trug die alte Rolle
  (*„for a backend and platform role"*), eine der zwei Fundstellen, die U6
  geräumt hat, und dürfte so nicht zurückkommen. Er nennt jetzt die Rolle, die
  ADR 0079 festgelegt hat. Der Schluss-grep aus §7 bleibt bei **vier** Zeilen —
  nachgezählt, nicht angenommen, und der Kommentar an der Stelle zitiert die
  alte Formulierung bewusst **nicht**, weil der grep Zeilen zählt und ein Zitat
  die veröffentlichte Zahl bewegt hätte.
- **Die Zahlen aus U6 verschieben sich, und sie werden nachgetragen statt
  stehengelassen**: 144 Zeilen Inhalt werden 190, neun Felder werden elf, zwei
  Sektionen werden drei, das Orakel erklärt 36 statt 28 Einträge, und U8 spart
  13 statt 15 Schlüssel.

---

## Verworfene Alternativen

**Die Prosa umschreiben statt löschen.** Derselbe Vorschlag, den ADR 0079 für
die Posts verworfen hat, und dieselbe Antwort: ein umgeschriebener Text ist ein
Text, den der Autor verteidigen muss, ohne ihn formuliert zu haben. Der
Unterschied zu den Posts ist nur, dass hier weniger Zahlen darin stehen — und
die, die darin standen, sind nicht verloren: sie stehen in `backlog.md`, in den
ADRs und in den Läufen, aus denen sie kamen.

**Nur die zwei Rollen-Fundstellen räumen und die Prosa stehen lassen.** Der
billigste Weg, und er hätte das Abnahmekriterium der Phase wörtlich erfüllt.
Er lässt eine Fallstudie stehen, die erklärt, warum diese Seite jeder Behauptung
einen Beleg abverlangt, und deren eigene Erklärung keinen hat. Das ist die
Gattung Widerspruch, die ADR 0079 überhaupt erst nötig gemacht hat.

*Der Nachtrag oben gibt dieser Alternative in einem Punkt recht: für
`.01 PROBLEM` war sie die richtige Antwort, und zwar genau deshalb, weil die
Erklärung der Seite nicht dieselbe Sorte Behauptung ist wie die Zahlen darauf.
Für die übrigen sechs Blöcke bleibt sie verworfen.*

**Den Anfrageweg behalten.** Der stärkste Einzelfall: fünf Stationen, fünf
Lanes, und für ein Gespräch der nützlichste Block der Seite. Er ist auch
faktisch und nicht argumentativ. Aber ihn hält nichts — `docs/architecture/c4-container.md`
ist handgeschrieben und aktuell, und die zehn Texte daneben sind eine zweite
Kopie derselben Aussagen, die auseinanderlaufen kann, ohne dass etwas rot wird.
Genau diese Lücke hat H2b für die Pipeline geschlossen und für den Rest der
Datei offen benannt. Ein Block zu behalten, weil er nützlich ist, ist die
Ausnahme, mit der ein Kriterium aufhört, eines zu sein. Das C4-Dokument bleibt
und ist jetzt die einzige Stelle, an der das Systemdesign steht.

**`.cs-arch` behalten und den Compose-Block allein darin stehen lassen.** Zwei
Zeilen weniger Diff, und eine 420px-Spalte, in der nichts steht. Das ist
wörtlich der leere Rahmen, gegen den diese Phase gemessen wird.

## Belege

- `docs/build-plan.md` — Stufe U, U6
- `docs/adr/0079-…md` §4 — die Regel für `web/content/posts/`, die dieses ADR ausweitet
- `web/lib/content/pipeline.test.ts:4-13` — das Kriterium, vor seiner Entscheidung formuliert
- `web/e2e/sheet.ts` — `minimumEntries`, `drawnWidths`, `applies`
- `web/styles/layout.css` — die `.cs-hero`-Notiz aus H3, der Präzedenzfall für §5
- ADR 0052 (fünf Kacheln), ADR 0055 (kein `— NO DATA` für eine Zahl, die niemand misst),
  ADR 0057 (die DATA-SAFETY-Platte bleibt ungezeichnet), ADR 0065 (`.cs-spec`),
  ADR 0066 (die Rail als Radiogruppe)
- Issues: #292 und #297 lösen sich auf, #294 löst sich auf, #284 und #293 bleiben
