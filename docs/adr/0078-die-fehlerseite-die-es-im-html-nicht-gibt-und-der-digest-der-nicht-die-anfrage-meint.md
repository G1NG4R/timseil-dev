# ADR 0078 — Die Fehlerseite, die es im HTML nicht gibt, und der Digest, der nicht die Anfrage meint

**Status:** Angenommen
**Datum:** 2026-09-20
**Betrifft:** H13, H10, M2, F6, #186, #231, #358, #359
**Invarianten:** 1 (keine erfundenen Zahlen), 8 (Werte in `tokens.css`), 9 (zwei localStorage-Keys)

## Kontext

Der Bauplan gibt H13 zwei Zeilen: „Error Boundaries, `error.tsx`,
`global-error.tsx`", fertig, wenn „ein absichtlicher Fehler die gestaltete
Seite zeigt und einen Trace erzeugt". Beide Hälften dieses Satzes haben sich
beim Messen als schwieriger erwiesen, als sie klingen.

Vor dieser Phase hatte `web/app/` **keine einzige Fehlergrenze**. Wer eine
Ausnahme auslöste, bekam Next' eigenes Dokument: `<html id="__next_error__">`,
ein Body ohne Stylesheet. H10a hat diese Hülle dreimal gemessen, bevor
`global-not-found.tsx` sie für die 404 umging; **#359** hält fest, dass
`/blog/kein-post` bis heute so ausgeliefert wird. Und **#186** stand seit F1b
offen: `onRequestError` war nie ausgelöst worden.

Gemessen wurde gegen den lokalen Produktionsbuild, nicht gegen `next dev` —
`next dev` legt sein eigenes Overlay über jede Fehlergrenze, und was man dort
sieht, ist nicht, was ein Besucher bekommt.

## Entscheidung

H13 baut `app/[lang]/error.tsx` als Fehlergrenze **im Segment**, liest die
Kennung der Seite aus `error.digest` und schreibt dieselbe Kennung in die
Logzeile, misst den Statuscode über `PerformanceNavigationTiming`, statt ihn zu
behaupten, und löst den Fehler über eine gegatterte Route mit **zwei Modi** aus,
weil es zwei Formen des Scheiterns gibt.

## Konsequenzen

### 1. React rendert Fehlergrenzen serverseitig nicht — und das ist nachzählbar

`getDerivedStateFromError` kommt in
`react-dom-server.node.production.js` **null** mal vor; der einzige Treffer im
Entwicklungs-Bundle ist eine Warnung, dass eine Instanzmethode ignoriert wird.
Next' eigene Grenze (`client/components/error-boundary.js:54`) ist genau so eine
Klassenkomponente.

**Die gestaltete 500 kann also prinzipiell nicht in `response.text()` stehen.**
Sie existiert nach der Hydration oder gar nicht. Ein Besucher ohne JavaScript
sieht die Hülle mit einem leeren Loch; ein Crawler bekommt sie nie, weil die
Grenze bei Bot-User-Agents übersprungen wird („Preserve existing DOM/HTML for
bots").

Damit ist H10s Prüfform — Bytes statt DOM, weil eine DOM-Zusicherung eine nur
hydrierte Seite nicht von einer echten unterscheiden kann — hier **nicht
anwendbar**. `e2e/error.spec.ts` liest die Bytes trotzdem, aber um diese
Tatsache festzuschreiben, nicht um auf ihr Gegenteil zu hoffen.

**Das ist zugleich die Ursachenanalyse für #359**, die dem Issue seit H10a
fehlt.

### 2. Der Status und die Seite schließen sich aus

Drei Messungen derselben Route, gegen den Produktionsbuild:

| Wo der Wurf landet | Status | Bytes | gestaltete Seite |
|---|---|---|---|
| vor dem ersten Byte | **500** | 21 B Klartext `Internal Server Error` | erscheint **nie** |
| im Suspense-Loch | **200** | echtes Dokument, ~22 700 B, mit Chrome | clientseitig, **in der Chrome** |
| oben im Baum nach leerer Hülle | **200** | `__next_error__`, leerer Body | clientseitig, **ohne** Chrome |

Unter `cacheComponents` liest jede echte Seite dieser Site ihre Daten in einem
Suspense-Loch. **Zeile zwei ist der Normalfall — jeder echte Renderfehler dieser
Site antwortet 200.** Zeile eins ist überhaupt nur erreichbar, weil die
Drill-Route ein dynamischer Parameter ohne gebackenen Wert ist und deshalb
vollständig zur Anfragezeit rendert; denselben Weg nimmt `/blog/kein-post`, und
er ist der Grund, warum dessen 404 einen Status trägt.

Das ist kein Mangel, den H13 behebt. Es ist eine Eigenschaft, und sie steht
hier, weil `docs/systemhandbuch.md` die Deploy-Abnahme Nicht-200 zählen lässt
statt 5xx — diese Zeile erklärt, warum das die richtige Wahl war.

### 3. `error.tsx` im Segment, nicht nur `global-error.tsx`

`error.js` umschließt `loading`, `not-found`, `page` und *geschachtelte*
Layouts — **nicht das Layout im selben Segment**. `app/[lang]/error.tsx` ist
Geschwister von `app/[lang]/layout.tsx` und rendert deshalb als dessen Kind:
echter `SiteHeader`, echter `SiteFooter`.

Gemessen: `<header>` und `<footer>` stehen, `documentElement.id` ist **nicht**
`__next_error__`, `lang="en"` kommt aus dem echten Root-Layout, und die
Verweise auf PRIVACY und IMPRINT sind die echten.

**ADR 0044 hat das 2026 vorweggenommen** und befürchtet, eine Fehlerseite
verlöre „den einzigen Weg zu PRIVACY und IMPRINT". Für die 500 ist die Sorge
erledigt, ohne eine handgebaute Kopie. Für die 404 bleibt **#358** offen: sie
rendert außerhalb jedes Layouts und kann es nicht erben.

### 4. Die Kennung ist der Digest, und sie meint die Fehlerform

Eine Fehlergrenze ist eine Client-Komponente: kein `headers()`, also weder
`request_id` noch `trace_id`. Was sie bekommt, ist `error.digest` — und Next
setzt den in `create-error-handler.js`, **bevor** der Instrumentation-Handler
läuft. Beide Enden lesen dieselbe Eigenschaft desselben Objekts.

`instrumentation.ts` schreibt ihn ab jetzt mit, zusammen mit `render_source`.
Ohne das wäre die Zahl auf der Seite eine Kennung, die nirgendwohin führt.

**Was der Digest nicht ist**, und das steht auf der Seite und nicht nur hier: er
ist ein Hash aus Meldung und Stack, benennt also die **Fehlerform**, nicht den
**Besuch**. Zwei Menschen mit demselben Defekt lesen dieselbe Kennung.

Gelesen wird er geprüft, nicht vertraut: nur Ziffern, optional `@E<code>`. Das
weist nebenbei Next' Kontrollsignale ab — `notFound()` und `redirect()` reisen
ebenfalls als Digest, und keines ist ein Fehler. Eine funktionierende Seite als
Defekt abzulegen wäre schlimmer als gar keine Kennung.

### 5. Der Status wird gemessen, nicht erklärt

Die erste Panel-Zeile liest `web: 200 render failed`. „500" wäre die Zahl
gewesen, die eine Fehlerseite sagen *will* — und auf dieser Site meistens falsch.
Die Seite liest stattdessen
`PerformanceNavigationTiming.responseStatus`, und wo der Browser keinen liefert,
steht `— NO DATA`. `ErrorInput.status` und `ErrorInput.digest` haben dafür
beide denselben Drei-Zustands-Unterschied bekommen: `undefined` heißt „niemand
hat gemessen", `null` heißt „nichts hat geantwortet". Das ist Invariante 1,
angewandt auf einen Statuscode.

### 6. `retryLine()` bekommt auch hier keinen Aufrufer — #231 bleibt offen

`retry` ist ein echter zweiter Versuch, der erste im Repository. Gebaut war
deshalb ein `attemptLine(n)`: nicht die Wartezeit, nicht das Maximum, nur wie
oft dieser Besucher gedrückt hat. Dann hat der Browser die Frage beantwortet,
die der Unit-Test nicht stellen konnte: **React montiert die Grenze beim Retry
neu**, `useState` fängt wieder bei 1 an, und ein `useRef` überlebt eine
Neumontage genauso wenig.

Was überlebte, wäre eine modulweite Variable — und genau dafür hat dieses
Repository gerade bezahlt: **#376**, wo `lib/legal/readout.ts` seine Lesung in
einem modulweiten `live ??=` hält, das eine Client-Navigation überdauert und den
falschen Pfad anzeigt. Eine fehlende Zahl gegen eine falsche zu tauschen ist
kein Geschäft.

`attemptLine` wurde deshalb **wieder entfernt**. Ein Formatierer ohne Aufrufer
ist exakt das, worüber #231 klagt; einen zweiten zu liefern hätte das Issue
vertieft statt es zu lösen. ADR 0068 hatte die Bedingung konditional
formuliert — „ist die Fehlerseite die, die wirklich pollt" — und sie ist es
nicht.

### 7. `catchError` wird nicht benutzt

Die Doku sagt selbst, wofür es da ist („component-level error recovery … Unlike
the `error.js` file convention which is scoped to route segments") und
ausdrücklich: „You don't need to wrap `error.js` default exports with
`catchError`." H13 hat kein Teilstück, das unabhängig vom Segment scheitern
soll. Nach CLAUDE.md „Maß halten" fehlt der Auslöser: kein Werkzeug ohne einen
Fehler, den man benennen kann.

### Was das kostet

- **Die 500 existiert ohne JavaScript nicht.** Status und Hülle ja, die
  gestaltete Fläche nein. Das ist nicht reparierbar, solange Fizz keine
  Fehlergrenzen kennt, und es ist der Preis dafür, überhaupt eine gestaltete
  Fehlerseite zu haben.
- **Die Seite ist englisch.** `lib/errors/words.ts` hält ihre fünf Sätze, weil
  eine Client-Komponente sonst die ganze Dictionary ins Bundle zöge — die Regel,
  die `ContactForm.tsx` seit H8a befolgt. Heute kostet das nichts, weil die
  DE/FR-Overlays leer sind. Ab P6 kostet es etwas, und der Backlog sagt das.
- **Zwei Client-Komponenten mehr im initialen Graphen** (#237: 143 KB von
  150 KB). Keine neue Abhängigkeit, nur bereits geladene Module.
- **Eine werfende Route im Baum.** Gegattert nach dem Muster von
  `lib/gallery/visibility.ts`, fail-closed, in `compose.yaml` nie gesetzt — und
  wie dort ausdrücklich **keine Sicherheitsgrenze**: wer auf dem Host eine
  Umgebungsvariable setzen kann, besitzt den Container.
- **Ein gebackener Ersatzmodus.** Cache Components verbietet ein leeres
  `generateStaticParams`, also trägt die Route einen Modus, den sie nie benutzt.

## Verworfene Alternativen

**Nur `global-error.tsx`, ohne Segment-Grenze.** Hätte jede 500 außerhalb der
Chrome gerendert und ADR 0044s Einwand bestätigt, statt ihn zu entkräften. Die
Segment-Grenze ist der einzige Ort, an dem eine Fehlerseite dieser Site Header
und Footer erben kann.

**`export const dynamic = "force-dynamic"` für die Drill-Route.** Gibt es nicht
mehr. Die Optionsliste unter `03-file-conventions/02-route-segment-config/`
kennt `dynamicParams`, `instant`, `maxDuration`, `preferredRegion`, `prefetch`
und `runtime` — sonst nichts.

**`instant = false` plus `connection()`.** Der erste Entwurf, und er baut
durch — aber `instant = false` erlaubt genau die *leere* Hülle, die dann mit 200
losfließt, bevor der Wurf passiert. Er liefert die Form ohne Chrome aus Zeile
drei der Tabelle oben, also das schlechteste beider Enden.

**Den Statuscode als `500` schreiben.** Die naheliegende Zeile, und auf dieser
Site meistens gelogen.

**Den Versuchszähler über eine modulweite Variable halten.** Siehe #376.

**Ein `.sheet.spec.ts` für die 500.** `docs/design/` enthält **kein hi-fi-Blatt
für eine 500-Seite**; `INDEX.md` weist H13 die `State Language` zu, und die
zeichnet ein Fehler-*Panel*, keine Seite — die Zuordnung ist dort ohnehin als
„meine Zuordnung, nicht die des Plans" gekennzeichnet. Ein Blatt-Test ohne
Zeichnung misst gegen nichts. Stattdessen prüft `error.spec.ts`, dass die Seite
die Bauteile der Zustandssprache benutzt statt eigener.
