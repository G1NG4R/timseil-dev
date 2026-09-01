# ADR 0062 — Der Log liest das Repository, und die Zeile führt nirgends hin

**Status:** Angenommen
**Datum:** 2026-09-02
**Betrifft:** H5c, H6, H9, K2 — und jede spätere Fläche, die Repository-Inhalt zeigt
**Invarianten:** 1 (keine erfundenen Zahlen), 5 (Belege zeigen nie ins Leere)

## Kontext

H5c füllt `SYS.04 LOG`, den letzten der vier Marker, und baut den Bio-Block
darunter. Damit ist die Startseite die erste vollständige Seite dieser Site.

Vier Zwänge standen im Raum, und drei davon hat erst das Messen sichtbar gemacht.

**Erstens: es gibt keinen Endpunkt.** `contract/openapi.yaml` führt 13
Operationen, alle implementiert; ein `/api/posts` ist nicht darunter, und das ist
ADR 0002s Entscheidung statt einer Lücke. Die Beiträge sind 14 MDX-Dateien in
`web/content/posts/`. Bis heute liest sie nichts: `app/feed.xml/route.ts` liefert
einen leeren Feed („Empty until H9"), `/blog` ist ein `[SOON]`-Stub, und
`components/case/IncidentLog.tsx` druckt `post_slug` als Text.

**Zweitens: das Blatt zeichnet drei Zeilen, die irgendwohin führen** — eine
dritte Rasterspalte mit `→`, `cursor: pointer` und eine Hover-Füllung über die
ganze Zeile. `/blog/<slug>` ist bis H9 ein 404.

**Drittens: `output: "standalone"` kopiert, was der Modulgraph erreicht.** Ein
`readFileSync` ist kein Import. Ein Verzeichnis, das nur gelesen wird, kann in
`next build`, in `next start`, im e2e-Rig und im Orakel vorhanden sein und im
Container fehlen — jeder dieser vier Läufe hat das ganze Projekt auf der Platte.

**Viertens: der Kopf des Blattes trägt zwei Zahlen, die niemand gemessen hat** —
`LATEST 03 · PLACEHOLDER TOPICS` und `SYSTEM 02 · CASE STUDY →`. Die drei
Beitragstitel darunter sind erfunden, und der Fuß trägt einen 92×92-Kasten
`[PORTRAIT]`.

## Entscheidung

**Der Log liest das Repository statt einer API, die Kopplung wird deklariert
statt geerbt, die Zeile führt bis H9 nirgends hin, und der Kopf trägt nur die
Zahl, die er gezählt hat.**

### 1 · Die Quelle ist ein Verzeichnis, und der Leser ist von Hand geschrieben

`lib/content/posts.ts` liest `content/posts/*.mdx` als **Text**, nicht als YAML:
`lib/content/pipeline.test.ts` hat dieselbe Entscheidung für `ci.yml` getroffen
und begründet — ein Parser läge auf der falschen Seite des Bundle-Budgets
(#237: 143 581 B von 150 000 B), und die Fragen sind klein und geschlossen. Vier
Schlüssel auf eigenen Zeilen, ein Blockskalar, über den gestiegen wird.

**Drei von sechs Schlüsseln.** `title`, `deck`, `published`, dazu der Slug aus
dem Dateinamen. `tags`, `system` und `summary` werden übersprungen. **#192 bleibt
offen:** H5c liest das Schema, es entscheidet es nicht.

**Kein `use cache` und kein `cacheLife`-Profil.** Jeder Eintrag in
`next.config.ts` ist aus einem `Cache-Control`-Header des Contracts abgeleitet,
und die Datei sagt selbst, dass eine dort erfundene Zahl eine zweite Quelle der
Wahrheit wäre. Diese Quelle deklariert nichts: die Dateien liegen im Image, sie
können sich nicht ändern, solange der Prozess lebt, und ein neuer Beitrag ist ein
neuer Container. Der Lesevorgang fällt damit in den Prerender und landet in der
statischen Schale — was `app/og.png/route.tsx` mit `tokens.css` seit G4 tut.

**Der Slug hat die Form, die die Datenbank verlangt.**
`incidents.post_slug` trägt `CHECK (post_slug ~ '^[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$')`
und der Kommentar daneben sagt, dass die Spalte auf eine Datei in diesem
Verzeichnis zeigt. Eine Datei, die dieser Leser annimmt und jener Constraint
abweist, wäre eine, die kein Vorfall je zitieren könnte. Die Kopie liegt in der
Hälfte, die einen Test haben kann.

**Sortiert wird nach Datum *und* Slug.** Vier der vierzehn Beiträge tragen
`published: 2026-09-01`. Eine Sortierung allein nach dem Datum überließe die
Reihenfolge der drei gezeigten Zeilen dem, was `readdirSync` zurückgibt — zwei
Builds, zwei Seiten, keine Änderung dazwischen.

**Eine unlesbare Datei wird übersprungen, gezählt und geloggt.** Kein Wurf, weil
ein kaputter Beitrag nicht die Startseite mitnehmen darf; kein Schweigen, weil er
sonst kaputt bliebe.

### 2 · Die Kopplung wird deklariert, obwohl sie heute auch ohne hält

`next.config.ts` bekommt
`"/\[lang\]": ["./content/posts/*.mdx"]` in `outputFileTracingIncludes`.

**Beide Wege gemessen, und die ehrliche Antwort ist, dass die Zeile heute nichts
ändert:** ohne sie gebaut, liegen alle vierzehn Dateien trotzdem unter
`.next/standalone/content/posts` — und nur dieses Verzeichnis;
`content/case-studies` und `content/generated` fehlen dort, weil sie importiert
und damit gebündelt statt kopiert werden. Der Tracer folgt also dem **Lesen**
selbst. Das ist etwas, das dieser Bundler tut, und nichts, das diesem Repository
zugesichert ist.

**Genau deshalb bleibt die Zeile.** Der Unterschied ist nicht, ob die Abhängigkeit
besteht, sondern ob sie aufgeschrieben ist oder von einem Werkzeug über einen
Versionssprung hinweg erschlossen wird, den niemand mit ihr in Verbindung bringen
wird. Dasselbe Argument steht seit G4 über dem Nachbareintrag.

**Der Schlüssel ist maskiert, weil er ein Glob ist.** Schlüssel werden mit
picomatch gegen die Route geprüft; `/[lang]` unmaskiert ist eine Zeichenklasse,
die `/a`, `/l`, `/n` und `/g` trifft — vier Routen, die es nicht gibt, und nicht
die eine, die es gibt.

### 3 · Die Zeile ist keine Zeile, die irgendwohin führt

**Kein `→`, kein Hover, kein Tab-Stop.** Invariante 5 sagt, dass ein Beleg nie ins
Leere zeigt, und dieses Repository hat dieselbe Frage zweimal so beantwortet:
`IncidentLog.tsx` druckt den Slug als Text, `lib/seo/feed.ts` liefert einen leeren
Feed statt Links auf Seiten, die es nicht gibt.

**Der Hover geht mit dem Pfeil.** Eine Zeile, die unter dem Zeiger aufleuchtet
und beim Klick nichts tut, ist schlimmer als eine, die es nicht tut: sie ist das
tote Bedienelement, das STATE.05 ablehnt, mit einer Einladung daran.

**Der Kopf behält seinen Link, und das ist nicht dieselbe Falle wie bei
`SystemRow`.** Dort waren es zwei Links in **einer Zeile** auf **eine** Seite —
die Tastaturfalle, die `OpsGrid` in H2b unter eigenem Namen abgelehnt hat. Hier
ist es das einzige Bedienelement des Abschnitts, ohne das SYS.04 ganz unbedienbar
wäre, und das Blatt zeichnet es an beiden Breiten.

**Die `02` daraus entfällt.** Sie kommt aus `/api/systems`, das dieser Abschnitt
nicht liest, und `systemsMeta` sagt eine Datei weiter, was sie hier wert wäre:
„the seed happens to hold two, which is exactly the coincidence that makes a
typed number survive being wrong."

### 4 · Zwei Leerzustände, weil es zwei Aussagen sind

| Fall | Kopfzeile | Panel |
|---|---|---|
| gelesen, keine Einträge | `LATEST 00 · SOURCE: content/posts` | `00 ENTRIES` |
| nicht lesbar | `— NO DATA · SOURCE: content/posts` | `— NO DATA` |

`LATEST 00` ist eine Messung — dieselbe Aussage, die `00 SYSTEMS` einen Abschnitt
höher macht. `— NO DATA` heißt, dass gar nicht gelesen werden konnte, und auf
dieser Site heißt das: ein Image ohne seinen eigenen Inhalt. `[SOON]` ist ab
dieser Phase falsch, denn das Bauteil existiert.

Die Kopfzeile nennt ihre Quelle wie die drei Abschnitte darüber. Dass diese Quelle
keinen Port hat, ändert an HOME.01s Regel nichts.

### 5 · Kein Porträt

Das Blatt zeichnet einen gestrichelten 92×92-Kasten neben der Bio. ADR 0055 §3 hat
die zwei Bildplatzhalter der Fallstudie mit dem Argument abgelehnt, das hier
unverändert gilt: **ein erfundenes Bild ist die Bildfassung einer erfundenen
Zahl.** Bilder sind K2. Der Block ist einspaltig; K2 entscheidet, ob er zweispaltig
wird.

## Folgen

**Gut.** SYS.04 ist der erste Abschnitt seit H3, den das e2e-Rig **auf der Seite**
messen kann: es baut produktiv ohne API, aber es hat das Repository. Dreizehn neue
Orakel-Einträge tragen deshalb kein `on: '/dev/components'` — nach dreiundzwanzig
in Folge, die es tragen mussten. Die vierte Sweep-Kante bei 560 wird damit zum
ersten Mal überhaupt sichtbar: `.log-row` ist die einzige Zeile dieser Seite, die
keine API braucht, und `layout.css` deklariert diesen Schalter seit G1, ohne dass
je etwas darüber gewandert wäre.

**Der Preis.** Ein Leser für fremden Text ist neue Angriffsfläche für Fehler, und
sein Testkörper ist größer als er selbst — das ist beabsichtigt und nicht
bedauerlich. Die drei Zeilen sind bis H9 unbedienbar; wer den Beitrag lesen will,
kann es von der Startseite aus nicht. Das ist der ehrliche Zustand und nicht der
angenehme.

**Was das nicht entscheidet.** Das Frontmatter-Schema (#192), den Renderer, den
Blog-Index, `PostCard` — alles H9. `LogRow` bekommt **keinen** Registry-Eintrag:
`lib/gallery/registry.ts` ist die Abschrift des Handoff-Inventars, und dessen
sechzehn Namen führen für den Blog `PostCard`. Die drei Zustände, die `/` nicht
zeigen kann, stehen trotzdem in der Galerie.
