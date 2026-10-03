# ADR 0082 — Der Ladezustand ist kein Fehler, und ein `null` hat drei Bedeutungen getragen

**Status:** Angenommen
**Datum:** 2026-09-29
**Betrifft:** U7, U8, ADR 0044, ADR 0048, ADR 0049, ADR 0057, #244
**Invarianten:** 1 (keine erfundenen Zahlen), 3 (Metriken nur für `live`)

## Kontext

Jede gestreamte Region dieser Seite hat ihre Komponente bisher mit
`body: T | null` bedient, und `null` kam aus **zwei** Richtungen: aus dem
`<Suspense>`-Fallback, der noch keine Antwort hat, und aus einem `*Now()`-Reader,
dessen Anfrage gescheitert ist. Die Komponente konnte die zwei nicht
unterscheiden, also hat sie für beide denselben Satz gezeichnet — den, der den
Endpunkt nennt und sagt, er habe nicht geantwortet.

Das war kein Randfall, sondern der Normalzustand jeder Antwort. Gemessen am
28.09.2026 gegen Produktion, `v0.44.1`, mit antwortender API:

| Seite | Status · Bytes | Im Dokument |
|---|---|---|
| `/` | 200 · 154 622 B | **6×** „…did not answer this request", **2×** die Kalender-Variante — neben 44 Zeilen echter Antwortdaten |
| `/work` | 200 · 45 649 B | **2×** `workListDown` |
| `/work/timseil-dev` | 200 · 78 133 B | **2×** `EMPTY ON PURPOSE`, also „diese fünf Kacheln füllen sich ab dem ersten Betriebstag" — neben `80,05 %` Uptime |

Je zweimal, weil ein gestreamtes Dokument den Fallback **und** seinen Ersatz
trägt: einmal als Markup, einmal in der Flight-Nutzlast.

Der Entwurf hatte die Antwort längst gegeben. STATE.05 verlangt „Kein Spinner.
Die Seite sagt, was sie holt und woher"; `components/state/LoadingLines.tsx`
setzt genau das um und liegt seit **G6** im Repository, mit
`.st-wait`/`--st-lines` in `styles/state.css` daneben — „a wait holds the height
the answer will need". Verbraucher außerhalb der Galerie: **keiner.** Elf
Suspense-Grenzen, und keine hat den Ladezustand je gezeichnet. Die
Handoff-Inventur führt `ContributionGraph` sogar mit `loading (skeleton)` als
erstem von vier Zuständen.

Der Grund dafür steht in `app/[lang]/page.tsx` und in jeder `*Live`-Datei als
Kommentar und beruft sich auf **ADR 0044**: „no answer yet" und „no answer at
all" sollten gleich aussehen, weil ein Leser beides nicht auseinanderhalten
könne. Die Naht selbst — *eine* Komponente zeichnet jeden Zustand, damit keine
zwei Layouts entstehen — ist richtig und bleibt. Ihre Folgerung war falsch: die
Seite konnte die zwei sehr wohl auseinanderhalten, sie hat sich nur für den
falschen der beiden Sätze entschieden.

Dazu ein dritter Fall, den derselbe `null` verdeckt hat.
`lib/api/systems.ts#incidentList` gibt `null` für ein System zurück, das nicht
`live` ist — „was never asked", sagt der eigene Kopf der Funktion —, und
`IncidentLog` hat `null` und `[]` in einen Zweig geschrieben. `NO INCIDENTS IN
THIS WINDOW` ist eine Behauptung über ein Fenster; drei Zustände haben sie
geteilt, und nur einer hatte eine Messung dahinter.

## Entscheidung

Eine gestreamte Region bekommt ihren Zustand als
`Read<T> = waiting | down | ok` (`lib/state/read.ts`) und zeichnet **drei**
Zweige: ein Wartezustand sagt, was er holt und von wo, ein gescheiterter Lesezug
nennt den Endpunkt, und eine Antwort ist eine Antwort. Zellen und Zähler sagen in
beiden Miss-Fällen weiter `— NO DATA`, weil sie den Unterschied nicht kennen
können.

## Konsequenzen

### 1. Der Rahmen ist in allen drei Zuständen derselbe, nur die Tafel wechselt

`.trn` · `.sys` · `.upl-graph` · `.upl-ops` · `.work-count` · `.ops-live` sind
die Selektoren, an denen `e2e/streaming.ts` „die Region ist angekommen"
festmacht. Verschwände einer aus dem Fallback, würde jede Wartefunktion der
Suite stillschweigend vakuös. Sie bleiben, samt Sektionskopf, Zähler und
Bildunterschrift; ausgetauscht wird nur die Tafel, die **begründet**, warum die
Region leer ist. Das Raster der Fallstudie behält deshalb auch im Wartezustand
seine Unterschrift `OPERATION · — NO DATA` — das Tagesblatt des Entwurfs zeichnet
für den ersten Betriebstag genau die.

### 2. Die Reader bleiben unberührt

`systemNow`, `trainingNow`, `systemsNow`, `contributionsNow` geben weiter
`T | null`. Aus `null` wird `DOWN` in der `*Live`-Komponente, weil **nur diese
Schicht** weiß, dass gefragt wurde. Damit bleibt alles, was ADR 0044 und
`lib/api/readers.ts` über `use cache` festgelegt haben, wie es ist: eine
gescheiterte Antwort wird nicht gespeichert, ein Fehler verlässt den Cache durch
die Wurf-Tür, und kein Cache-Schlüssel ändert sich.

### 3. Kein Statuscode in der Tafel

`ErrorPanel` und `errorLines` könnten Code, Zeitpunkt und Retry-Zähler zeigen —
STATE.05 will sie so —, aber `*Now()` fängt den Fehler und hat keinen Status mehr
in der Hand. Eine Zahl, die dabei entstünde, hätte kein System hinter sich.
Deshalb trägt `down` keine Nutzlast, und die vier vorhandenen `…Down`-Sätze
bleiben **wörtlich unverändert**: sie waren nie falsch formuliert, sondern nur
falsch platziert.

### 4. Zwei neue Wörterbuch-Schlüssel, und U8 muss sie übersetzen

`csOpsDown` und `csMetricsDown` — die Fallstudie hatte für ihre zwei Regionen je
einen Satz für zwei Zustände. Sie nennen `/api/systems` ohne Slug, wie die vier
Sätze der Startseite; die **aufgelöste** Adresse steht im Wartezustand, wo
`loadingLines` sie haben will, und kommt aus
`lib/api/systems.ts#systemWaitSource` — Maschinenstimme, kein Wörterbuch.
U6 hat U8 fünfzehn Schlüssel erspart, U7 gibt zwei zurück.

### 5. Die Galerie ist der einzige Ort, an dem der Wartezustand stehen bleibt

Auf `/` ist er ein Moment; unter `/dev/components` ist er ein Zustand neben
seinen Geschwistern (ADR 0049). `OpsStrip`, `ContributionGraph` und `WorkList`
zeichnen dort jetzt drei Zustände statt zwei. Die Inventar-Tabelle in
`lib/gallery/registry.ts` ist eine **Transkription des Blattes** und wird dafür
nicht angefasst — ihre sechzehn Teile bleiben sechzehn, und `loading (skeleton)`
stand darin ohnehin schon.

### 6. `EMPTY_GRID` fällt weg

`{ cells: [], weeks: 0 }`, von Hand neben dem Fallback gepflegt, war eine
Transkription von `opsGrid(null)`. `OpsSection` leitet Raster und Vorfälle jetzt
selbst aus dem `Read` ab, und damit verschwindet die Stelle, an der zwei
Schreibweisen für „nichts hat geantwortet" nebeneinander lagen.

### Was das kostet

- **Ein Prop mehr in zwei Komponenten der Fallstudie.** `waitSource` wird vom
  Aufrufer aufgelöst, weil nur die Route weiß, um welches System es geht. Eine
  Adresse, die `/api/systems` hieße, schickte den Leser zur Liste statt zum
  Dokument, aus dem die Zahlen kommen — und dann wäre das Nachprüfen, das den
  Satz überhaupt rechtfertigt, ein Umweg ins Falsche.
- **Der Wartezustand reserviert keine Höhe.** `--st-lines` hält die Höhe einer
  Antwort, die aus Zeilen besteht; hier sind die Antworten ein Kartenraster, eine
  Liste und ein Kalender. Eine Zeilenzahl dafür wäre eine Zahl, die nichts
  gemessen hat, also bleibt der Standard bei zwei Zeilen und der Umbruch beim
  Swap ist genau so groß wie vor dieser Phase. Kein Gewinn an CLS, aber auch kein
  Verlust.
- **Eine Ungenauigkeit bleibt und ist benannt:** eine Antwort mit **null**
  Einträgen erreicht dieselbe Tafel wie ein gescheiterter Lesezug, sagt also
  „der Endpunkt hat nicht geantwortet", obwohl er mit nichts geantwortet hat.
  `/work` und `/blog` haben für diesen Fall je einen eigenen Satz, die vier
  Regionen der Startseite nicht. Ohne kaputten Seed ist er nicht erreichbar, und
  er braucht vier Sätze statt einer Verzweigung. Notiert in `backlog.md`, nicht
  hier geraten.
- **129 px leeres Raster bleiben.** Eine Region ohne Zellen zeichnet einen leeren
  Rahmen; das ist ein Rahmen und keine Behauptung, und diese Phase fasst ihn
  nicht an.

## Verworfene Alternativen

**Ein Spinner.** Sagt weniger als zwei Zeilen und kostet mehr. STATE.05 verbietet
ihn, und der Grund ist der Satz, der diese Seite trägt: `source: ops-api
/api/training` ist eine Behauptung, die ein Leser nachsehen kann.

**Die `…Down`-Sätze löschen und nur noch warten lassen.** Dann wäre eine
Region, deren Endpunkt tot ist, stumm — und die Seite hätte den einen Zustand
verloren, über den sie am meisten zu sagen hat.

**`DegradedNotice` einmal pro Seite.** Es liegt seit G6 ohne Verbraucher da und
passt der Form nach: „Teilausfall ist kein Totalausfall", mit einer Liste dessen,
was abgeschaltet ist. Verworfen, weil jede Region ihren **eigenen** Endpunkt
nennt und das die überprüfbarere Aussage ist. Es bleibt ungenutzt, und das ist
nach dieser Phase eine Entscheidung statt eines Versehens.

**Den Status durch `*Now()` hindurchführen**, damit die Tafel `503` zeigen kann.
Das hätte die Reader, ihre `use cache`-Argumentation und ihre Fehlerbehandlung
angefasst, um eine Zahl zu gewinnen, die auf dieser Seite niemand braucht. §3.

**Ein `Read` auch für die fünf Zell-Regionen** — Brotkrume, Eyebrow, Spec-Rail,
Terminal-Rahmen, Meta-Leiste. Sie zeigen `— NO DATA` in einer Zelle, deren Label
schon sagt, was fehlt. Ein Wartesatz in einer Zelle wäre ein Log in einer
Tabelle, und `— NO DATA` ist dort in beiden Miss-Fällen die wahre Aussage.

## Belege

- Produktion am 28.09.2026: `curl -s https://timseil.dev/ | grep -c "did not
  answer this request"` → **6**; `/work` → 2; `/work/timseil-dev` →
  `EMPTY ON PURPOSE` 2×.
- Dev-Stack von Null am 29.09.2026, mit antwortender API: dieselben `grep`s →
  **0**, und `fetching ` 12× auf `/`, 3× auf `/work`, 6× auf der Fallstudie.
- `e2e/loading.spec.ts`: die Wartezeilen stehen in den Bytes jeder der sieben
  Tafeln, der gesetzte Zustand trägt den `…Down`-Satz, `.st-wait` ist nach dem
  Swap nicht mehr im Dokument, und die Galerie zeichnet beide nebeneinander.
- `make check` grün, `make e2e` 2248 Tests grün.
