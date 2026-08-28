// The nav label's hover and focus animation, as a pure function of how far
// along it is.
//
// NOTHING FROM `next/*`, no DOM, and NO `Math.random()` — the first two are
// lib/theme.ts's rules, the third is this file's own. A frame that depends on
// the global RNG cannot be asserted about, and an animation that cannot be
// asserted about is one where "the end state never arrives" is found by a
// visitor rather than by `node --test`. The seed is an argument for exactly
// that reason.
//
// THE GLYPHS ARE THE HOMEPAGE'S, NOT THE STATE-LANGUAGE SHEET'S. The two
// disagree — State Language uses `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#/\_`,
// Homepage uses halfwidth katakana plus digits — and the Consistency Check's
// own method settles it: "die Startseite gilt für Inhalt, Copy und Bauteile".
// The Chrome sheet, which is binding for the rest of this phase, does not draw
// the scramble at all; it comes from the handoff's TopNav state inventory
// (rest · hover (scramble) · focus · aktiv).
//
// A useful side effect of that set: it shares no character with any of the four
// labels, so scramble.test.ts can tell a scrambled cell from a locked one
// without knowing which glyph was picked.

/** Halfwidth katakana and digits, from the Homepage sheet, unchanged. Halfwidth
 *  because the label must not change pixel width mid-animation — every one of
 *  these occupies a single monospace cell in JetBrains Mono. */
export const SCRAMBLE_GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇ0123456789";

/** Four steps across `--d-scramble` (220ms), as the handoff's implementation
 *  runs it. The last one is the label itself. */
export const SCRAMBLE_PASSES = 4;

/** A small integer hash. Deterministic in all three inputs, so the same frame is
 *  the same string every time — including across a re-render, which is what
 *  keeps the animation from flickering when React decides to call again. */
function mix(seed: number, index: number, step: number): number {
  const h = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(step + 1, 0x85ebca6b)) >>> 0;
  return Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
}

/**
 * `"220ms"` and `".22s"` → 220. Anything else → `null`.
 *
 * THE DURATION IS NOT WRITTEN IN TYPESCRIPT ANYWHERE. It is `--d-scramble` in
 * tokens.css, and the component reads it off the computed style rather than
 * carrying a copy — invariant 8 says durations live in one file, and a constant
 * here would be a second one that the token could drift away from without
 * anything going red.
 *
 * `null` rather than a fallback, and the component treats it as "do not
 * animate". A fallback would be exactly the invented number the whole rule is
 * about, and a nav label that simply changes colour is not a defect.
 */
export function parseMs(raw: string): number | null {
  const text = raw.trim();
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value)) return null;
  if (text.endsWith("ms")) return value;
  if (text.endsWith("s")) return value * 1000;
  return null;
}

/**
 * One frame of the animation.
 *
 * LOCKS FROM THE RIGHT. `progress` is 0 → nothing settled, 1 → the label. The
 * characters that have settled are the LAST `floor(length * progress)` of them;
 * everything before is a glyph. Locking from the left instead produces an
 * animation that satisfies "ends on the label" and "never changes width" and is
 * still the wrong one, which is why scramble.test.ts checks the direction
 * separately.
 *
 * The length never changes. A frame one character short reflows the header and
 * moves the language button and the clock — the animation would be visible in
 * two places it has no business being.
 */
export function scrambleFrame(label: string, progress: number, seed: number): string {
  const clamped = Math.min(1, Math.max(0, progress));
  const locked = Math.floor(label.length * clamped);
  const cut = label.length - locked;
  if (cut <= 0) return label;

  let out = "";
  for (let i = 0; i < cut; i++) {
    const original = label[i];
    // A space stays a space: turning it into a glyph reads as the word growing.
    if (original === " ") {
      out += original;
      continue;
    }
    out += SCRAMBLE_GLYPHS[mix(seed, i, locked) % SCRAMBLE_GLYPHS.length];
  }
  return out + label.slice(cut);
}
