# ADR 0074 — Die Bewegung, die dem Stylesheet gehört, und die Kante, die nicht da ist

**Status:** Angenommen
**Datum:** 2026-09-09
**Betrifft:** H10b, ADR 0044, ADR 0050, ADR 0058, ADR 0073, #230, #247
**Invarianten:** 8 (keine Farbe, kein Radius, keine Dauer außerhalb `tokens.css`)

## Kontext

H10a hat die 404 aus vier Server-Komponenten und einem Stylesheet gebaut, ohne
eine einzige Animation und ohne eine einzige Client-Komponente. H10b liefert die
vier Stücke nach, die der Backlog benannt hat — Glitch, `REPLAY GLITCH`,
Blatt-Parität, Durchzug.

Der Glitch ist nicht Dekoration, sondern der Titel des Blattes: „404 — SIGNAL
LOST · ein 300ms-Glitch beim Laden, danach still". Seine Regel steht in den
Entwurfsnotizen: „Glitch feuert einmal beim Laden, 300ms, dann nie wieder von
selbst — Interpunktion, keine Tapete."

Das Blatt liefert auch eine Implementierung mit, und die ist der Grund für dieses
ADR. `fire()` tut fünf Dinge in JavaScript:

```js
fire() {
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const el = this.glitch; if (!el) return;
  el.style.animation = "none"; void el.offsetWidth;
  el.style.animation = "tn-glitch .3s steps(2,end) 1";
  el.style.textShadow = "2px 0 rgba(255,45,85,.75), -2px 0 rgba(0,229,255,.55)";
  clearTimeout(this.gt);
  this.gt = setTimeout(() => { el.style.animation = "none"; el.style.textShadow = "none"; }, 320);
}
```

Und es ruft `fire()` in `componentDidMount()`. Übernimmt man das, hängt der
**erste** Lauf an der Hydration — auf genau der Route, von der ADR 0073 sagt,
dass sie die meistausgelieferte dieser Anlage ist und überwiegend von Scannern
abgerufen wird.

## Entscheidung

### 1. CSS besitzt die Bewegung, JavaScript besitzt nur die Wiederholung

Der Zug ist eine Regel in `styles/notfound.css`, und das Attribut, das sie
auslöst, steht im Server-Markup:

```css
.nf-display[data-glitch] { animation: nf-glitch var(--d-glitch) steps(2, end) }
```

Vier der fünf Teile des Blatt-`fire()` fallen damit weg, jeder aus einem eigenen
Grund:

| Teil des Blatts | Warum er hier nicht existiert |
|---|---|
| Animation beim Mount zuweisen | `data-glitch` liegt in den Bytes. Der Zug läuft beim **ersten Paint** — ohne Hydration, ohne JavaScript, für `curl` und für einen Crawler genauso wie für einen Browser. |
| `text-shadow` daneben setzen | Die zwei Farbebenen stehen **im Keyframe** und enden auf `none`. |
| `setTimeout(…, 320)` zum Aufräumen | Es gibt nichts aufzuräumen. Ein Timer, der einen Stil entfernt, ist eine zweite Stelle, an der der Zug falsch sein kann. |
| `matchMedia` selbst befragen | `globals.css` setzt `animation: none !important` auf den Universalselektor. Das ist stärker als jede Regel hier; das Attribut bleibt stehen und tut nichts. Kein Skript stellt die Frage, also muss kein Test beweisen, dass die Antwort gehört wurde. |

Übrig bleibt der fünfte: der **zweite** Lauf. `REPLAY GLITCH` ist das einzige, was
einen Browser braucht, und `components/notfound/NotFoundHero.tsx` wird dafür zur
einzigen Client-Insel dieser Seite — ein `useState`-Zähler als `key` auf der
`<h1>`. Ein neu gemounteter Knoten startet die Animation, die auf ihm steht; das
ist derselbe Neustart, den das Blatt mit `animation = "none"` und einem
erzwungenen Reflow kauft, ohne ins DOM zu greifen und ohne den Browser zweimal
layouten zu lassen.

**Der Preis wird gemessen, nicht geschätzt** — und die Messung korrigiert dabei
eine Formulierung, die nahelag. „Diese Seite lädt kein JavaScript" war nie wahr:
sie rendert ihr eigenes `<html>`, also lag die React-Laufzeit schon immer darin.
Was H10a wirklich behauptet hat, steht in `ErrorBudgetSurface.tsx` und gilt
unverändert — `SYS.404.01` als Fläche statt als Spiel kostet **zusätzlich** nichts.

Gemessen wurde deshalb der Unterschied, gegen `main` im selben Baum, gzip -9 über
alle `<script src>` des vorgerenderten Dokuments:

| | `main` | H10b | |
|---|---|---|---|
| `_not-found.html` | 176 697 B | 177 439 B | **+742 B**, 7 Dateien beide Male |
| `en.html` | 182 829 B | 182 829 B | unverändert |

Die zweite Zeile ist die, die das Gate betrifft: `tools/bundle-size.sh` misst `/`
(ADR 0050, und #320 hält offen, dass die Seite sieben Routen hat). Die erste ist
die, die diese Phase verantwortet. 742 Byte für einen Knopf, der eine 280-ms-
Bewegung wiederholt — teuer genug, um sie hinzuschreiben, und billig genug, um sie
auszugeben.

### 2. Ein zweites Keyframe neben `ts-glitch`, und keine Wiederverwendung

`state.css` trägt seit G7 `ts-glitch` — Zug M5, die Interpunktion eines
**Zustandswechsels**, und sie schreibt dort ausdrücklich fest, dass sie die Farbe
nicht anfassen darf: „Red belongs to the CHANGE and never to the state that
follows it."

`nf-glitch` markiert etwas anderes: eine **Ankunft**, auf der einen Seite, deren
Blatt sagt „Alert-Rot ist hier das Thema, nicht die Ausnahme". Es trägt deshalb
die zwei Farbebenen des Blatts — Alert-Rot 2px nach rechts, Cyan 2px nach links —
und dazu dessen `clip-path`-Bänder, die M5 nicht hat. Zwei Bedeutungen, zwei
Züge. Ein gemeinsames Keyframe hätte entweder M5 seine Regel genommen oder der
404 ihr Thema.

Die Farbliterale des Blatts werden dabei durch die Token ersetzt, die sie sind:
`#FF2D55` ist `--alert`, `#00E5FF` ist `--acc`, gemischt wie `--glow-alert` mischt.
Invariante 8.

### 3. `--d-glitch` (280 ms) und nicht die `.3s` des Blatts

Das 404-Blatt schreibt `.3s`. Das Foundations-Blatt schreibt die Dauern dieser
Seite selbst auf: **„280 Glitch · steps(2), max 300"** — und das ist die Zahl,
die seit G1 in `tokens.css` steht.

Die zwei Blätter widersprechen also **einander**, nicht dem Bau. Ein neues Token
bei 300 wäre ein zweiter Wert für dieselbe Bewegung; `state.css` hat denselben
Fall schon einmal entschieden („a repeated 280ms keyframe would be 560 and a
different move wearing the same token").

`notfound.spec.ts` hält die Dauer gegen das Token statt gegen eine Zahl — und
vergleicht sie **als Zahl, nicht als Text**. Der erste Entwurf verglich Text und
wurde auf einem korrekten Build rot: der Minifier schreibt `280ms` im
ausgelieferten Stylesheet zu `.28s` um. Das Token liest sich in Entwicklung und
Produktion verschieden und bedeutet dasselbe; die Schreibweise ist Sache des
Builds.

### 4. `REPLAY GLITCH` verschwindet zweimal, und beide Male aus einem Grund

**Unter 720**, weil Artboard `1b` es nicht zeichnet: dort stehen die zwei
Rückwege gestapelt und kein drittes Element daneben. Dass damit die 44px-Regel
nicht mehr zur Debatte steht — das Steuerelement ist 35px hoch und stünde sonst
dort, wo `pointer: coarse` gilt — ist eine Folge und nicht der Grund.
`touch-targets.coarse.spec.ts` misst die Seite jetzt bei 390, damit das eine
Messung bleibt und keine Behauptung.

**Unter `prefers-reduced-motion`**, weil ein Knopf, der nichts bewegt, schlechter
ist als kein Knopf. Die Bewegung ist dort von `globals.css` abgeschaltet; ein
Element mit der Aufschrift `REPLAY GLITCH` wäre ein Versprechen, das die Seite
schon entschieden hat nicht zu halten. Das Blatt verlangt dasselbe in seinen
eigenen Worten: „prefers-reduced-motion: Glitch, Puls und Cursor stehen still,
Layout unverändert."

### 5. Der Knopf ist die Ghost-Variante von `.btn`, und drei Schreibweisen sind eine zu viel

Das 404-Blatt verlangt für **ein** Bauteil drei Typangaben: `600 11px` für die
zwei Rückwege bei 1440, `600 10.5px` für dieselben bei 390, `500 10px` für den
Ghost daneben. `.btn` zeichnet jede Handlung dieser Seite seit H1 mit
`600 --t-mono-11`, und das Foundations-Blatt katalogisiert alle drei Varianten als
**ein** Specimen mit einer Höhe.

Hier widerspricht sich das Blatt also selbst, und der Bau folgt dem Specimen. Im
Orakel steht das als `one-button-type` — dieselbe Form wie `one-section-head` ein
Bauteil weiter. Was der Ghost vom Blatt **ganz** übernimmt, ist seine Polsterung
`12px 4px`, und die wird behauptet statt entschuldigt.

Die Gegenprobe steht daneben: `.nf-status`, `.nf-lede` und `.nf-log` nehmen die
Stufe des mobilen Artboards sehr wohl, denn das sind Klassen, die keine andere
Seite hat. Die Grenze verläuft zwischen geteiltem Bauteil und seitenlokaler
Klasse, nicht zwischen bequem und unbequem.

### 6. Die Kante, die nicht da ist

`notfound.sweep.spec.ts` erwartet **`[1080, 720]`**. Jede andere Seite dieser
Anlage hat dort eine dritte Zahl, und es ist immer dieselbe: 900, mit immer
denselben drei Schlüsseln — `["button", "chromeHead", "nav"]`. Das ist das
Chrome.

Diese Seite hat keines. `app/global-not-found.tsx` rendert außerhalb jedes
Layouts, `SiteHeader` und `SiteFooter` lesen `next/root-params`, und es gibt hier
keine Route, von der ein Parameter zu lesen wäre (ADR 0073 §6). ADR 0044s Einwand
gegen eine Fehlerseite ohne Fußzeile ist damit zweimal aufgeschrieben worden —
und **hier zum ersten Mal gemessen**. Kommt das Chrome eines Tages, wächst diese
Liste um eine 900, und der Durchzug sagt es, bevor jemand daran denkt
nachzusehen.

### 7. `auto-fit` war eine Entscheidung, die niemand getroffen hat

H10a hat die Routenliste als `repeat(auto-fit, minmax(180px, 1fr))` gebaut und
den Grund aufgeschrieben: sie erreiche die fünf Spalten des Blattes bei 1440 von
selbst und fließe darunter „auf vier, drei, zwei und eine", was das mobile
Artboard zeige. Jeder Satz davon stimmt, und der Schluss trägt trotzdem nicht.

`auto-fit` fließt nicht, es **springt** — an jeder Breite, an der eine weitere
180px-Spur nicht mehr passt. Gemessen, durch Bisektion der alten Regel zwischen
1440 und 390:

```
1060 · 860 · 660 · 424
```

Vier Kanten, keine davon eine der vier, die diese Seite haben darf. Die ersten
drei sind die Inhaltsspalte, die 200px Spur plus Abstand verliert; die vierte ist
**424 und nicht die 460**, die dieselbe Arithmetik ergibt, weil die Spalte unter
560 aufhört `min(1160, vw − 80)` zu sein und `vw − 44` wird.

Diese vierte Zahl ist der Grund, warum das eine Messung ist und keine Rechnung:
die Formel wechselt unter der Regel, und niemand, der `auto-fit` liest, käme auf
die Idee zu fragen. Die Spaltenzahl ist jetzt erklärt — fünf, drei, eine — auf
den zwei Kanten, die diese Seite ohnehin hat.

## Konsequenzen

**Die 404 hat jetzt eine Client-Insel**, wo H10a keine hatte — 742 gemessene Byte.
Der erste Lauf hängt nicht an ihr, aber die Aussage „diese Seite braucht keinen
Browser" gilt ab hier nur noch für alles außer der Wiederholung.

**Die Blatt-Parität ist 27 Messungen groß, acht davon abweichend** — und zwei
Dinge, die das Blatt zeichnet, fehlen im Orakel, statt entschuldigt zu werden: das
Chrome, das diese Route nicht rendern kann, und das Innere von `SYS.404.01`, das
H11 nach dem Launch baut (ADR 0058). Ein `diverges`-Block sagt „wir haben es
anders gezeichnet"; keines von beiden ist hier überhaupt gezeichnet.

**Vier Bauteile haben ihre Größe geändert**, alle vier gegen das Blatt: das Log
steht am Schreibtisch auf 12 statt 11, Status, Lede und Log nehmen bei 720 die
Stufe des mobilen Artboards, und die zwei Rückwege stapeln sich dort über die
volle Breite. Der 720er-Schalter trägt damit sieben Bauteile statt zwei — und
keines davon hat eine eigene Kante bekommen.

**`experimental.globalNotFound` bleibt zu prüfen.** ADR 0073s Auflage gilt
unverändert, und sie hat jetzt einen zweiten Wächter: liefe die Seite wieder nur
im Browser, wäre `data-glitch` nicht mehr in `response.text()`.

## Alternativen

**Das `fire()` des Blattes übernehmen.** Verworfen: der erste Lauf hinge an der
Hydration, auf der Route, die diese Anlage am häufigsten ausliefert. Dazu vier
Stellen, an denen ein Stil von Hand gesetzt und von einem Timer wieder entfernt
wird — und ein `matchMedia`-Zweig, dessen Richtigkeit ein Test beweisen müsste,
den es ohne ihn nicht braucht.

**`ts-glitch` wiederverwenden.** Verworfen: M5 darf die Farbe nicht anfassen, und
das ist auf dieser Seite die halbe Bewegung. Ein gemeinsames Keyframe hätte einem
der beiden Züge seine Regel genommen.

**Ein Token bei 300ms.** Verworfen: ein zweiter Wert für dieselbe Bewegung, und
das Foundations-Blatt trägt selbst die 280.

**`auto-fit` stehen lassen und die Sonde aus dem Fingerabdruck nehmen.** Das ist
der Ausweg, den die Inhaltsspalte nimmt, und er passt hier nicht: dort ist der
Wert **stetig** und ein Fingerabdruck über stetige Werte meldet an jedem Sample
einen Sprung. Hier ist der Wert diskret und springt nur an Stellen, die niemand
erklärt hat. Das ist kein Messfehler, sondern der Fund.
