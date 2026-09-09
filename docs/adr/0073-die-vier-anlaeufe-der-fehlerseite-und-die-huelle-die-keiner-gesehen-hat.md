# ADR 0073 — Die vier Anläufe der Fehlerseite und die Hülle, die keiner gesehen hat

**Status:** Angenommen
**Datum:** 2026-09-09
**Betrifft:** H10a, #247, ADR 0044, ADR 0046, ADR 0058
**Invarianten:** 1 (keine erfundenen Zahlen), 8 (keine Farbe, kein Radius, keine
Dauer außerhalb `tokens.css`)

## Kontext

H10 baut die 404: „Router-Trace, montierte Routen, Rückwege. Der eine
Alert-Rot-Moment." Bis zu dieser Phase gab es unter `web/app/` **keine einzige
Fehlerroute** — keine `not-found.tsx`, keine `error.tsx`. Sechs `notFound()`-Aufrufe
landeten auf Nexts eingebauter Seite.

Und es ist keine Randroute. Die F3-Messung sagt, dass die **Mehrheit** der
Anfragen an `timseil-web` mit 404 beantwortet wird — Scanner-Verkehr. Die 404 ist
die meistausgelieferte Seite dieser Anlage.

Der Entwurf schien geradeaus: eine `not-found.tsx` unter `app/[lang]/`, Kopf und
Fußzeile kommen laut ADR 0044 über `usePathname()` ohnehin mit. **Diese Annahme
hält nicht**, und das war erst nach vier gemessenen Anläufen zu sehen.

## Entscheidung

### 1. Die Seite ist `app/global-not-found.tsx`, hinter einem experimentellen Flag

Vier Formen wurden gegen einen Produktions-Build gemessen, nicht überlegt:

| Anlauf | Was gemessen wurde |
|---|---|
| `app/[lang]/not-found.tsx` | Fängt nur `notFound()` **innerhalb** des Segments. Und was sie fängt, liefert Next durch sein Fehlerdokument aus: `<html id="__next_error__">`, ein Körper aus lauter `<script>`, **kein Stylesheet im `<head>`**. Die Seite entsteht erst nach der Hydration — nicht ohne JavaScript, nicht für einen Crawler, nicht für `curl`. |
| `app/not-found.tsx` | Fängt die unbekannte Adresse, rendert mit demselben Nichts, und **nimmt zusätzlich die Segmentfälle mit**: `/blog/kein-post` verlor dadurch seine Seite. |
| `app/[lang]/[...rest]` | Überschattet die echten Seiten. `/`, `/work` und `/blog` antworteten mit dem 404-Körper unter **Status 200**. |
| `app/layout.tsx` | Würde das Segment-Layout verschachteln — und entfernt `lang` aus `next/root-params`, weil ein Root-Parameter ein Segment **über** dem Wurzel-Layout ist. Der Build sagt es wörtlich: `Export lang doesn't exist in target module`. Der gesamte i18n-Mechanismus aus ADR 0046 hängt an diesem Import. |

Nexts eigene Dokumentation benennt unsere Form als den Grund, aus dem
`global-not-found` existiert: für den Fall, dass „your root layout is defined
using top-level dynamic segments (e.g. `app/[country]/layout.tsx`)". Das ist
`app/[lang]/layout.tsx` genau.

**Der Preis ist ein experimentelles Flag** (`experimental.globalNotFound`) und
damit eine Abhängigkeit von einer instabilen Schnittstelle. Er wird bewusst
gezahlt: die Alternative war eine 404, die nur nach der Hydration existiert — auf
der Route, die diese Anlage häufiger ausliefert als jede andere. **Bei jedem
Next-Bump ist zu prüfen, ob das Flag noch existiert und ob die Seite noch
serverseitig rendert;** `e2e/notfound.spec.ts` liest dafür `response.text()` und
nicht das DOM, weil Playwright das Skript ausführt und den Unterschied sonst
nicht sehen kann.

### 2. Der Statuscode wird gemessen, nicht angenommen

Next kann einen 404-Körper unter einem `200` ausliefern: „when streaming, a 200
status code will be returned … the status code cannot be updated." Das ist ein
Soft-404, und `docs/systemhandbuch.md` argumentiert eine Ebene höher genau
dagegen, wenn die Abnahme Nicht-200 zählt statt 5xx.

Gemessen, mit der Suspense-Grenze aus §3 an Ort und Stelle: **404 auf jeder
unbekannten Adresse.** Der Status gehört hier dem Router und wird vor dem Rendern
entschieden, deshalb hält er. `e2e/notfound.spec.ts` behauptet ihn auf vier
Adressformen — es ist die **erste** Statuscode-Behauptung im ganzen e2e-Rig.

### 3. Pfad und Trace-ID kommen aus dem Proxy, hinter einer Suspense-Grenze

Das Blatt behauptet, beide kämen „aus der Antwort der Go-API". **Sie können es
nicht:** eine 404 erreicht die API nie. Beide kommen aus `proxy.ts`, das sie auf
dem Hinweg mintet — dieselben zwei Kennungen, die jede Logzeile dieses Containers
trägt (ADR 0037). Der Pfad reist über eine neue Kopfzeile `x-requested-path`,
**immer gesetzt, nie übernommen**, aus demselben Grund wie `X-Request-Id`: der
Wert wird gerendert, also wäre eine von außen mitgeschickte Kopie ein Pfad, den
ein Fremder für eine Seite von uns aussucht.

`headers()` im Rumpf der Seite ist unter `cacheComponents` ein Build-Fehler
(`Next.js encountered uncached or runtime data during prerendering`). Die
Suspense-Grenze ist der vorgesehene Weg zu beidem: eine statische Hülle, die
sofort ausgeliefert wird, und die gemessenen Werte, die nachströmen. Fehlt einer,
steht dort `— NO DATA` (Invariante 1) und nie eine erfundene Kennung.

### 4. Fünf montierte Routen, und die Zahl im Trace wird abgeleitet

Die Notiz des Blatts sagt „vier gemountete Routen", das Artboard daneben zeichnet
`grid-template-columns:repeat(5,1fr)`, und `Routes and Paths` entscheidet es in
Worten: „Routenliste der 404 um `/contact` ergänzen … sonst ist sie eine
Sackgasse mit Dekoration." Also fünf.

Die Zeile `matching N mounted routes` nimmt ihr `N` aus der Liste, statt es zu
tippen. Eine getippte Zahl wäre eine dritte Meinung neben den beiden, die sich
schon widersprechen.

### 5. `SYS.404.01` ist eine Fläche, kein abgeschaltetes Bedienelement

ADR 0058 hat die Regel vor dieser Phase aufgeschrieben, und H10 ist einer der
vier Fälle, die sie namentlich vorhersagt. Kein `<canvas>`, keine Spielschleife,
kein `ts404.best`, **null Byte zusätzliches JavaScript**. `[SOON]` und nicht
`— NO DATA`: es ist nichts gemessen worden und fehlgeschlagen, die Sache gibt es
noch nicht. H11 füllt den Rahmen nach dem Launch.

### 6. `--t-disp-58` — Issue #247, als Token

Die mobile Displaystufe der 404 stand nur im Blatt. Sie wird die vierzehnte Stufe
in `tokens.css`, und der Schalter liegt in `layout.css` auf der **vorhandenen**
720er-Kante — ADR 0042 sagt, es gibt vier Schalter, und ein fünfter für eine
einzelne Seite wäre der Breakpoint, der nie eine Messung war.

## Konsequenzen

**Was diese Seite nicht hat.** `SiteHeader` und `SiteFooter` rufen beide
`getDictionary()`, das `next/root-params` liest — und hier gibt es keine Route,
von der ein Parameter zu lesen wäre. Das Chrome fehlt also, und ADR 0044s
Einwand dagegen bleibt gültig: die Fußzeile ist „der einzige Weg zu PRIVACY und
IMPRINT von einer Fehlerseite aus". Die beiden Verweise werden deshalb von Hand
gerendert — eine zweite, kleinere Kopie einer Fußzeilenreihe. Das ist eine
Schwäche, kein Entwurf, und sie steht im Backlog.

**Die Hülle ist englisch.** Die Route wird einmal für die ganze Seite
vorgerendert, es gibt kein Sprachsegment zu lesen. `/de/nonsense` bekommt die
Seite mit englischen Rückwegen. Heute kostet das nur den `/de`-Präfix auf fünf
Links, weil die deutschen und französischen Überlagerungen leer sind und ohnehin
jede Seite Englisch ausliefert. **Sobald P6 eine Sprache füllt, kostet es mehr.**

**Was diese Phase nicht repariert.** `/blog/kein-post` und `/work/kein-system`
rendern weiterhin clientseitig — gemessen **auch auf `main`, vor dieser Phase**.
Es ist ein bestehender Mangel, keine Regression, und er bekommt ein Issue statt
einer stillen Mitnahme.

**Was axe gefunden hat, und ein Prüfer nicht hätte.** `role="status"` auf dem
`<ol>` des Logs **ersetzt** die implizite Listenrolle — jedes `<li>` verliert
damit seinen Container, und aus sieben Zeilen werden sieben Waisen. Die Rolle ist
gestrichen. Dazu fehlte der Seite ein `<title>`, weil sie jedes Layout umgeht und
folglich nichts erbt.

## Alternativen

**`app/layout.tsx` einziehen** — die strukturell sauberste Form, und der Build
widerlegt sie: `[lang]` hört auf, ein Root-Parameter zu sein. Eine Rückkehr dahin
hieße, `getDictionary()` durch Prop-Drilling zu ersetzen, was ADR 0046
ausdrücklich verworfen hat.

**Eine Catch-all-Route** — verworfen mit Messung: sie überschattet die echten
Seiten und liefert `/`, `/work` und `/blog` als 404 unter 200 aus. Das ist der
teuerste denkbare Fehlschlag, und er wäre ohne die Messung grün durchgegangen.

**Bei der ungestalteten Standardseite bleiben** — sie rendert immerhin
serverseitig. Verworfen: sie ist eine Sackgasse ohne Rückweg, auf der Route, die
diese Anlage am häufigsten ausliefert.
