// The only client component the gallery has, and the reason is issue #230: the
// burst needs a state change that a person causes while looking at it. Nothing
// in production does that — producing ok→degraded takes a reconfigured api —
// so this button is the first trigger and this page the first viewer.

"use client";

import { useRef, useState } from "react";

import { StatusDot } from "@/components/state/StatusDot";
import { SCRAMBLE_PASSES, parseMs, scrambleFrame } from "@/lib/scramble";
import { shouldBurst } from "@/lib/state/burst";
import { STATE_KEYS, type StateKey } from "@/lib/state/words";

/**
 * A status dot that can be flipped by hand, so the burst can be watched.
 *
 * THE DECISIONS ARE NOT IN HERE. `shouldBurst()` says whether this transition
 * earns a burst and whether the 600ms lock has expired; `scrambleFrame()` says
 * what the word looks like mid-flight; `parseMs()` reads the duration off the
 * token. All three are pure, all three are under `node --test`, and what is
 * left here is the part a test could not hold anyway: the clock, the element
 * and the frame loop.
 *
 * `labels` comes in as a prop rather than being looked up: getDictionary() is
 * server-only, and the four client components G3 wrote take their strings the
 * same way.
 */
export function StateFlip({ labels }: { labels: Record<StateKey, string> }) {
  const [index, setIndex] = useState(0);
  const [burst, setBurst] = useState(false);
  // `null` means "show the real word". Anything else is a frame of the
  // scramble, and the word underneath has already changed.
  const [frame, setFrame] = useState<string | null>(null);
  const lastBurstAt = useRef<number | null>(null);

  const state = STATE_KEYS[index];
  const label = labels[state];

  function flip(): void {
    const next = STATE_KEYS[(index + 1) % STATE_KEYS.length];
    setIndex((current) => (current + 1) % STATE_KEYS.length);

    const now = performance.now();
    if (!shouldBurst(state, next, lastBurstAt.current, now)) return;
    lastBurstAt.current = now;

    // The CSS half. globals.css disables it under prefers-reduced-motion by
    // way of the universal selector, so setting the attribute is harmless
    // there — the element simply does not move.
    setBurst(true);

    // The JavaScript half has no stylesheet to stop it, so it asks. Without
    // this a visitor who turned motion off would still watch the word churn.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const duration = parseMs(
      getComputedStyle(document.documentElement).getPropertyValue("--d-glitch"),
    );
    // No fallback. An invented duration is the thing invariant 8 exists to
    // prevent, and a word that changes without churning is not a defect.
    if (duration === null || duration <= 0) return;

    const target = labels[next];
    const seed = Math.floor(now);
    const start = performance.now();
    let shown = -1;

    const step = (at: number): void => {
      const elapsed = Math.min(1, (at - start) / duration);
      const pass = Math.ceil(elapsed * SCRAMBLE_PASSES);
      if (pass !== shown) {
        shown = pass;
        setFrame(scrambleFrame(target, pass / SCRAMBLE_PASSES, seed));
      }
      if (elapsed < 1) {
        requestAnimationFrame(step);
        return;
      }
      setFrame(null);
    };

    requestAnimationFrame(step);
  }

  return (
    <div className="gal-flip">
      <span
        className="st-burst"
        // Presence, not a value: state.css matches [data-burst], and `false`
        // would render data-burst="false" and match it too.
        data-burst={burst ? "" : undefined}
        onAnimationEnd={(event) => {
          // THE DOT'S PULSE BUBBLES THROUGH HERE TOO. It never ends, being
          // infinite, but a future finite animation on a child would clear the
          // burst early. Comparing the elements rather than the animation NAME
          // is deliberate: the CSS minifier rewrites what it likes — G3 caught
          // it rewriting durations — and a name is not something to depend on.
          if (event.target !== event.currentTarget) return;
          setBurst(false);
        }}
      >
        <StatusDot state={state} label={frame ?? label} />
      </span>

      <button className="btn" data-variant="secondary" type="button" onClick={flip}>
        next state
      </button>

      {/* The word the dot is on, spelled out for someone reading the gallery
          rather than watching it — and the proof that the flip changed the KEY
          and not only the colour. */}
      <code className="gal-flip-key">{state}</code>
    </div>
  );
}
