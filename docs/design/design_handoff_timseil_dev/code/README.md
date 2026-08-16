# Code-Fundament — timseil.dev

Dieselben Werte wie im Foundations-Blatt, hier ausführbar. **Nicht** eine zweite
Quelle der Wahrheit: wenn ein Wert sich ändert, ändert er sich in `tokens.css`,
und das Blatt wird nachgezogen.

## Dateien

| Datei | Inhalt |
|---|---|
| `tokens.css` | Alle Tokens als Custom Properties: Flächen, Text, Signale, Linien, Graph-Stufen, Familien, 13 Größen, 14 Abstände, Raster, Form, Dauern, Easings |
| `globals.css` | Reset, Typo-Defaults, Links, `:focus-visible`, Skip-Link, drei Keyframes, `@supports`-Kapselung für scroll-gekoppelte Moves, `prefers-reduced-motion` |
| `layout.css` | Inhaltsspalte `min(1160px, 100% − 80px)` und alle vier Breakpoints (1080 · 900 · 720 · 560) als Media Queries, plus der `pointer: coarse`-Block für Trefferflächen und das read-only-Terminal. Herleitung jeder Zahl im Blatt `Intermediate Widths` |
| `tokens.ts` | Was Code braucht statt CSS: Dauern, Easings, Scroll-Bereiche, und die beiden Ableitungen `skillState()` und `showsMetrics()` |
| `components/` | Button, Field, MetricTile, StatusDot, SectionHead, ThemeSwitch — die Bauteile, deren Regeln sonst verloren gehen |

## Einbau in Next.js

1. `tokens.css`, `globals.css` und `layout.css` nach `app/` legen, in dieser Reihenfolge in `app/layout.tsx` importieren — `layout.css` zuletzt, damit seine Media Queries gewinnen.
2. Fonts über `next/font/google` laden (Chakra Petch 400/500/600, Geist variabel,
   JetBrains Mono 400/500/600/700) und die CSS-Variablen `--display`, `--body`, `--mono`
   auf die generierten Familien legen. Dann geht kein Request an fonts.gstatic.com.
3. Komponenten nach `components/` kopieren. Sie tragen Inline-Styles, die auf Tokens
   verweisen — kein Tailwind, keine CSS-in-JS-Abhängigkeit. Wer Tailwind einsetzt,
   mappt die Tokens in `@theme` und ersetzt die Styles; die Werte bleiben dieselben.
4. Hover-Regeln aus dem Kommentar in `Button.tsx` in eine CSS-Datei übernehmen —
   Hover gehört nicht in JS.

## Themes

Sieben Paletten, alle in `tokens.css` als `[data-theme="…"]`-Blöcke. Verbindlich ist
**Terminal Noir** (die Werte in `:root`) — die übrigen sechs sind eine Vorliebe des
Besuchers, keine Marken-Variante.

Ohne gespeicherte Wahl folgt die Seite dem System: `prefers-color-scheme: light` liefert
Gruvbox Light, sonst Terminal Noir. Die Wahl liegt in `localStorage["ts.theme"]`.

Damit beim Laden nichts flackert, muss das Attribut **vor dem ersten Paint** stehen. Dieses
Snippet gehört in `app/layout.tsx` in den `<head>`, vor jedem CSS:

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var t=localStorage.getItem('ts.theme');
      if(t)document.documentElement.dataset.theme=t;}catch(e){}})();`,
  }}
/>
```

Das Umschalten selbst macht `components/ThemeSwitch.tsx`: Schwatch-Reihe als
`role="radiogroup"`, jeder Knopf mit `aria-label` und `aria-checked`, Platz ist die
**Fußzeile** — ein Farbschema ist eine Vorliebe, kein Navigationsziel.

Zwei Dinge, die dabei nicht vergessen werden dürfen: die Datenschutzseite muss den
`localStorage`-Eintrag nennen (sie tut es unter „What is stored on your device"), und in
hellen Themes fällt `--glow` auf `none` — Leuchten funktioniert nur auf dunklem Grund.

## Zwei Regeln, die im Code leicht verloren gehen

**Metriken nur bei `state: 'live'`.** `showsMetrics()` ist dafür da. Ein System ohne
Betrieb zeigt keine Uptime — auch nicht 0, auch nicht "—" mit Zahl daneben.

**Skill-Zustände werden gerechnet, nicht gesetzt.** `skillState()` leitet CORE/APPLIED/
LEARNING/QUEUED aus der Zahl der Projekte ab. Wer den Zustand hart schreibt, macht aus
Belegen eine Behauptung.
