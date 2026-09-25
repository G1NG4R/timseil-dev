# ADR 0080 — Die Stationen sind ein Weg, und die Jahreszahlen kommen nicht zurück

**Status:** Angenommen
**Datum:** 2026-09-25
**Betrifft:** U5 — die Trajectory-Rail auf `/about`; revidiert ADR 0066 §5 und §6,
korrigiert zwei Zeilen aus U4, löst die letzte offene Zusage aus H7b ein und
nimmt K2 eine Aufgabe ab
**Invarianten:** 1 (keine erfundenen Zahlen), 5 (Belege zeigen nie ins Leere),
8 (keine Farbe, kein Radius, keine Dauer außerhalb `tokens.css`)

## Kontext

ADR 0066 hat die Rail gebaut: eine Radiogruppe, sechs Stationen, null Byte
JavaScript, die Pfeiltasten beim Browser. An der Mechanik ändert diese Phase
nichts. Was sie ändert, ist alles, was die Rail sagt.

H7b konnte zum Inhalt zwei Dinge nicht, und hat beide aufgeschrieben statt sie
zu verstecken:

1. **Keine Jahreszahlen.** Das Blatt beschriftet fünf von sechs Stationen
   `[Y1]`–`[Y5]`, und seine eigene Notiz sagt, wofür die Klammern stehen:
   *„Alle Jahre [Y1–Y5] … sind Platzhalter — die Inhalte der Rail sind meine
   Struktur, deine Fakten."* Nichts im Repository trug ein Datum für eine
   Station, also wurde die Marke die Position. §5 hat dabei einen Auftrag
   weitergereicht: *„K2 tauscht Ordinale gegen Jahre, indem es eine Datei
   ändert."*
2. **Fünf von sechs Absätzen fehlten.** Die Prosa des Blatts sind geklammerte
   deutsche Briefings — genau das, was H7as Wache abweist. §6 hat `body: null`
   gesetzt und das Panel `[SOON]` mit einem Grund drucken lassen.

Beides war richtig für den Zustand, in dem es entstand, und beides beschreibt
einen anderen Menschen. Die sechs Stationen des Blatts sind *First lines of
code · Fundamentals, the hard way · First service in public · Go, and the
container habit · Own infrastructure · Platform work*, und sie liefern fünf
Systeme aus, von denen dieses Repository zwei kennt. Stufe U hat die Aufgabe,
dass die Seite sagt, was ihre Systeme belegen (ADR 0079). Bei einer Zeitleiste
heißt das nicht korrigieren, sondern ersetzen.

Dazu kommt eine Stelle, die U3 erzeugt hat, ohne dass sie jemandem auffiel:
`talos-prod` ist seit U3 System `01`, und es hat keine Case Study — ADR 0079 §2
sagt warum. Eine Station, die den Cluster ausliefert, trifft damit auf ein Gate,
das bisher nur eine Antwort kannte.

## Entscheidung

**Die Rail zeichnet Tims Weg, jede Station trägt einen Absatz, und die
Jahreszahlen sind nicht verschoben, sondern verworfen.** Fünf Festlegungen.

### 1. Die Marke bleibt die Position, und der K2-Auftrag ist zurückgezogen

§5 hat die Ordinale gewählt, weil es keine Daten für Jahre gab. Diese Begründung
ist mit dem Inhalt weggefallen: die Stationen sind ein Lebensweg, die Daten
existieren. Die Entscheidung bleibt trotzdem, aus dem stärkeren Grund.

Eine Jahreszahl wäre die einzige Zahl auf dieser Seite, hinter der kein System
steht. Die eine Regel dieses Repositories sagt, dass es eine solche Zahl nicht
gibt; eine Ausnahme dafür zu machen, weil sie im Lebenslauf ohnehin steht, wäre
die Ausnahme, mit der die Regel anfängt zu bröckeln. Und die Rail braucht sie
nicht: sie behauptet **wann** und **in welcher Reihenfolge**, und nur das zweite
ist ihr Zweck.

`trajectory.test.ts` prüft deshalb nicht mehr nur die Marke, sondern **jedes
Feld einer Station** auf eine vierstellige Zahl. Solange fünf Panels leer waren,
war die Marke die einzige Stelle, an der eine Jahreszahl stehen konnte. Mit
sechs Absätzen ist der Absatz die Stelle — *„seit 2021"*, *„drei Jahre lang"* —
und er sieht dabei aus wie ein normaler Satz.

### 2. Sechs Absätze, und `body` ist kein `string | null` mehr

§6s Zahl war ehrlich und ist erledigt. Der Typ erlaubt das Fehlen nicht mehr:
eine Station ohne Prosa ist ab jetzt ein Compile-Fehler und keine gerenderte
Entschuldigung.

**Der `[SOON]`-Zweig wird gelöscht, nicht totgelegt** — und das ist die
umgekehrte Behandlung zu der, die der Sektions-Zweig eine Datei weiter oben in
`app/[lang]/about/page.tsx` bekommen hat. Dort steht seit U4 ein Zweig, den
nichts mehr erreicht, und er bleibt: `Section` führt weiterhin das Paar
`reasonKey`/`owedBy`, `sections.test.ts` weist eine Zeile ab, die nur eins von
beiden setzt, und K2 hat eine Sektion im Sinn. Der Zweig ist die Zusage, dass
die nächste leere Fläche sich meldet, statt ein Loch zu zeichnen.

Hinter dem Stationszweig steht nichts dergleichen. Er wartete auf **U5**, und
U5 hat stattgefunden. Ein Zweig, der auf eine Phase wartet, die vorbei ist, ist
kein Versprechen mehr, sondern ein Pfad, den niemand mehr liest — mit einem
Wörterbuchschlüssel, zwei CSS-Regeln und einem Testfall im Schlepptau.

### 3. Zwei Belegzellen, und nur eine ist ein Link

Seit U5 liefern zwei Stationen ein System aus, und nur eines hat eine Seite.

| Station | Zelle | Warum |
|---|---|---|
| `01` · `02` · `04` · `05` | **keine** | nichts ausgeliefert — ADR 0055s Schnitt |
| `03 Own VPS` | `02 timseil.dev`, **verlinkt** | `caseStudyFor` findet eine Seite |
| `NOW Bare-metal cluster` | `01 talos-prod`, **Text** | ADR 0079 §2: keine Case Study |

**Invariante 5 fragt, wohin ein `<a>` zeigt, und ein Name ist keiner.** Das Gate
beantwortet ab jetzt die engere Frage — nicht *„gibt es eine Zelle"*, sondern
*„gibt es etwas zu öffnen"* — und die Zelle selbst gehört dem Panel. `/work`
zeichnet die Zeile des Clusters seit U3 genauso: sie steht da und trägt keinen
Pfeil.

ADR 0055s Schnitt bleibt dort, wo er gezogen wurde: eine Station, die **nichts**
ausgeliefert hat, bekommt keine Zelle statt eines Gedankenstrichs. Eine Zelle
ohne Ziel ist kein leerer Rahmen, sondern ein Name.

**Die Galerie hat dabei ihren eigenen Pfad gebaut, und das wäre aufgefallen,
sobald es zu spät gewesen wäre.** `app/dev/components/page.tsx` setzte
`/work/${slug}` von Hand zusammen. Das war dieselbe Antwort wie die der Seite,
solange jedes ausgelieferte System eine Seite hatte — mit `01 talos-prod` wäre
es ein Link auf eine 404 geworden, in einer Galerie, deren Zweck es ist, nur
Zustände zu zeigen, die die Seite auch erzeugt. Sie stellt jetzt dieselbe Frage
wie die Seite.

### 4. Die Schreibweise der Cluster-Tags kommt aus dem Manifest

Der Entwurf schrieb `CNPG`. `stack.yaml` schreibt `CloudNativePG`, und
`StackTiles` druckt genau diesen String eine Sektion weiter oben.

Zwei Schreibweisen für ein Bauteil auf einer Seite sind der Fund, den die
U3-Abnahme eine Seite weiter gemacht hat — eine Fixture, die sich „transcribed
from stack.gen.json" nannte und es vier Versionssprünge lang nicht mehr war.
`trajectory.test.ts` stellt der NOW-Zeile deshalb dieselbe Frage, die
`content.test.ts` den Kacheln stellt, **aber nur in eine Richtung**: jedes Tag
ist ein Bauteil des Clusters. Die Gegenrichtung gehört den Kacheln, deren
Aufgabe es ist, vollständig zu sein; die Rail sagt, was aufgenommen wurde, und
darf weniger nennen.

**Kein Tag und kein Satz beschreibt, wie der Cluster erreicht oder geschnitten
ist.** Das ist die Grenze, die ADR 0079 schriftlich zieht, und U3 hat sie einmal
gehalten, als der Netzwerk-Track `metallb` bekam und nicht das Routing
darunter — *„a track name is a sentence on a public page. Unsure counts as yes."*

### 5. Der Galerie-Eintrag wird umbenannt, und ADR 0066 hätte das nicht getan

`registry.ts` führte für `TrajectoryRail` den Zustand `„jahr aktiv"`. ADR 0066
hat die Transkription bewusst stehen lassen: das Inventar ist eine zweite Lesung
der Übergabe und keine Beschreibung dessen, was gebaut wurde.

Das Argument trägt für einen Zustand, den es **nicht gibt**. Es trägt nicht mehr
für einen, der einer **Entscheidung widerspricht**. Solange die Jahre fehlten,
war `„jahr aktiv"` die Notiz einer Lücke; seit §1 ist es ein Wort für etwas, das
diese Seite ausdrücklich nicht will — und die einzige Lesart, die dann noch
übrig bleibt, ist, dass es jemand vergessen hat.

Die Linie liegt damit an einer Stelle, die auch der nächste Eintrag benutzen
kann: **zwei Wörter für dieselbe gezeichnete Sache bleiben stehen** — `PostCard`
heißt im Inventar Karte und ist eine Zeile, und niemand hat sich gegen Karten
entschieden. **Ein Wort für etwas, wogegen entschieden wurde, bleibt nicht.**

### 6. Das Homelab steht vor dem Helpdesk, und zwei Zeilen aus U4 ziehen mit

Jeder Entwurf dieser Phase hatte den Service Desk als Station `01` und das
Homelab in der Mitte. Das ist die Reihenfolge, die ein Lebenslauf nahelegt —
erst die Stelle, dann das Hobby — und sie war falsch herum. Der Hypervisor zu
Hause stand am Anfang und ist der Grund, warum der Service Desk überhaupt
stattgefunden hat.

**Der Fund ist nicht die Reihenfolge, sondern wo sie stand.** `aboutLede` sagte
seit U4 *„I came from the helpdesk and learned the rest by building: a VPS, a
Proxmox homelab …"* — zweimal falsch, und zwar im Hero derselben Seite, zwei
Bildschirmhöhen über der Rail. Die Zeile ist in U4 entstanden, von Tim gelesen
und freigegeben worden, und niemandem ist sie aufgefallen, weil nichts danebenstand,
das ihr widersprechen konnte. Die Rail ist genau dieses Etwas.

Beide Zeilen im Hero ziehen deshalb mit:

| | vorher | jetzt |
|---|---|---|
| `aboutLede` | „I came from the helpdesk …" | „It started with a hypervisor at home, went through a service desk …" |
| `OPERATOR · ROUTE` | `Helpdesk → self-taught` | `Self-taught, from the lab up` |

**`ROUTE` wollte zuerst ein drittes Glied, und die Messung hat es abgewiesen.**
Die naheliegende Reparatur war `Homelab → helpdesk → self-taught`. Bei 390
nimmt sie **zwei Zeilen** — als einzige der sieben Kartenzeilen und ausgerechnet
die, die als einzige in Signalfarbe steht. `Self-taught, from the lab up` sagt,
wo es anfing, und bleibt an allen gemessenen Breiten einzeilig.

Der Grund ist aber nicht die Zeilenzahl. Eine Karte, die die Stationen
aufzählt, ist eine zweite, kürzere Fassung der Rail eine Sektion darunter — und
genau so fangen zwei Flächen an, sich zu widersprechen. Dieselbe Phase hat
`aboutLede` dabei erwischt.

**Was bewusst stehen bleibt:** `homeBio` auf `/` sagt weiterhin *„self-taught
from the helpdesk up"*. Das ist eine Aussage über den beruflichen Weg und nicht
über den Anfang, sie steht auf einer anderen Seite, und sie hat keine Rail neben
sich, der sie widersprechen könnte. Sie wird angefasst, wenn jemand sie aus
diesem Grund anfasst — nicht, weil eine andere Seite sich bewegt hat.

## Konsequenzen

Die Rail ist ab jetzt die Stelle, an der jede spätere Phase zuerst nachsieht,
was diese Seite über ihren Autor sagt — sie ist der einzige zusammenhängende
Text auf `/about`, der nicht aus einer Tabelle kommt.

`/about` trägt **kein `[SOON]` mehr**. Damit ist das Wort auf der Seite
vollständig verschwunden, und `e2e/about.spec.ts` zählt es über das ganze `main`
statt über einen Selektor: `.tl-soon` gibt es nicht mehr, und ein Selektor für
eine gelöschte Klasse findet immer null.

Die sechs Absätze liegen in `lib/about/trajectory.ts` und nicht im Wörterbuch.
Das ist die Anordnung, die diese Seite ohnehin hat — `PRINCIPLES` und `STACK`
stehen seit H7a als englische Sätze in `lib/about/content.ts` —, aber es macht
eine Frage fällig, die U8 beantworten muss: **was `/de` mit der Prosa der
About-Seite tut.** Die Antwort ist für alle drei Tabellen dieselbe und nicht
speziell für diese.

K2 verliert zwei Posten: die fünf Stationsabsätze und die Frage nach echten
Jahreszahlen. Der erste ist erledigt, der zweite entschieden.

### Was das kostet

**Die Rail ist ab jetzt eine Stelle, an der Prosa altern kann.** Fünf leere
Panels konnten nicht falsch werden; sechs Absätze über einen Weg, der
weitergeht, können es. Die NOW-Station beschreibt einen Cluster, der `in_build`
ist — U9 setzt ihn auf `live`, und dann ist der Absatz, der sagt *„nothing
public is measured on it yet"*, eine Zeile, die jemand ändern muss. Der Satz ist
absichtlich so geschrieben, dass er dabei rot aussieht und nicht bloß alt.

**Eine Reihenfolge ist jetzt an drei Stellen behauptet** — Lede, `ROUTE` und
Rail — und keine Prüfung hält sie gegeneinander. Ein Test dafür wäre ein Test
über Prosa, und dieses Repository hat keinen; die Kopplung ist, dass alle drei
auf einer Seite stehen und dass die Rail die ausführlichste von ihnen ist. Genau
deshalb ist sie gebaut worden, und genau deshalb hat sie den Fehler gefunden.

**Die Ordinale bleiben ein Kompromiss, und einer, den ein Leser bezahlt.** Wer
wissen will, ob zwischen `01` und `NOW` drei Jahre liegen oder zehn, erfährt es
hier nicht. Das ist der Preis der Regel, und er wird bewusst gezahlt: der
Lebenslauf trägt die Daten, die Seite trägt die Belege.

**Eine Belegzelle ohne Link ist eine Zelle, die zweimal erklärt werden muss** —
einmal im Panel, einmal in der Galerie —, und sie sieht für einen flüchtigen
Blick aus wie ein kaputter Link. Die Alternative wäre gewesen, den Cluster in
der Rail nicht als System zu nennen; dann hätte die Seite die Station gezeigt
und die Verbindung zu System `01` verschwiegen, und das wäre die schlechtere
Auskunft.

## Verworfene Alternativen

**Jahreszahlen, weil sie ohnehin im Lebenslauf stehen.** Der Lebenslauf ist ein
anderes Dokument mit anderen Regeln. Auf dieser Seite wäre es die erste Zahl
ohne System dahinter, und die Rail gewinnt dadurch nichts, was sie nicht schon
hätte.

**`[SOON]` stehen lassen und den Zweig totlegen**, wie der Sektions-Zweig eine
Datei weiter oben. Verworfen, weil die Begründung dort eine Zusage ist und hier
keine wäre — §2.

**Die NOW-Station ohne `shipped`.** Der kleinste Diff: Panel, Galerie und beide
Tests wären unberührt geblieben. Verworfen, weil die Rail dann den Cluster als
Station nennt und als System verschweigt, obwohl er seit U3 System `01` ist.

**Die Absätze als Wörterbuchschlüssel.** Übersetzbar, aber getrennt von den
Tags und dem System, über die sie sprechen — und damit frei, von ihnen
wegzudriften. Die Frage nach `/de` wird dadurch nicht gelöst, sondern nur für
eine von drei Tabellen anders beantwortet.

## Belege

```
npm test     882    (von 880)
tsc          sauber
eslint       sauber auf den berührten Dateien
e2e          207 grün, 0 rot   — about × 7 Breiten, Galerie, Orakel, Sweep
Orakel       61 Messungen für /about, unverändert; minimumEntries steht
```

```
Breite  client  ROUTE   Beschriftungen         Rail    breitestes Tag
1440    1440    1 Z.    [1,1,1,1,1,1]          6 Sp.   −1 px
1081    1081    1 Z.    [1,1,1,1,1,1]          6 Sp.   −1 px
1079    1079    1 Z.    [1,1,1,1,1,1]          6 Sp.   −1 px
1024    1024    1 Z.    [1,1,1,1,1,1]          6 Sp.   −1 px
 899     899    1 Z.    [1,1,1,1,1,1]          6 Sp.   −1 px
 760     760    1 Z.    [1,1,1,1,1,2]          6 Sp.   −1 px
 720     720    1 Z.    [1,1,1,1,1,2]          6 Sp.   −1 px
 719     719    1 Z.    [1,1,1,1,1,1]          1 Sp.   −1 px
 700     700    1 Z.    [1,1,1,1,1,1]          1 Sp.   −1 px
 390     390    1 Z.    [1,1,1,1,1,1]          1 Sp.   −1 px
```

**Jede der sechs Stationen einzeln geöffnet, und das ist der Grund für die
letzte Spalte.** Fünf von sechs Panels stehen auf `display: none`, und eine
verborgene Box trägt nichts zu `scrollWidth` bei — der Überlauf-Test auf der
Seite sieht also immer nur das offene Panel. Ein Tag, das zu breit für seine
Spalte ist, wäre in fünf von sechs Stationen unsichtbar geblieben und hätte auf
den Tag gewartet, an dem jemand die falsche anklickt. Gemessen ist das
breiteste Tag jeder Station an jeder Breite mindestens 1 px schmaler als seine
Reihe.

**Der 720er-Schalter hat sich nicht bewegt, und das war die offene Frage.** Die
neuen Beschriftungen sind durchweg kürzer als die alten — `Bare-metal cluster`
gegen `Fundamentals, the hard way` —, aber kürzer ist keine Messung.
`about.sweep.spec.ts` fährt jede Kante zwischen 1440 und 390 ab und hält sie
gegen die drei erklärten Schalter: grün, also hat keine Beschriftung einen
vierten erzeugt. Die Messung oben zeigt ihn beidseitig — sechs Spalten bis 720,
eine ab 719 — und `Bare-metal cluster` nimmt bei 760 und 720 zwei Zeilen, was
ADR 0066 §7 als umgebrochenen Halbsatz führt und nicht als Befund. `about-mobile-rail-tracks` trägt weiterhin die Abweichung
`rail-wraps-at-720`, die ADR 0066 §7 am gebauten Build bisektiert hat.

Das Orakel hat sich ebenfalls nicht bewegt, und das ist kein Zufall: von 61
Messungen berührt genau eine die Rail (`about-panel-title`), und sie misst eine
Schriftgröße. Ein Textwechsel konnte sie nicht erreichen.

Build-Plan Kapitel „Stufe U — Umbau", Phase U5.
