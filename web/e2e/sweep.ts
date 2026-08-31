/**
 * The machinery of the width sweep, so that a second page does not get a second
 * copy of it.
 *
 * IT IS HERE BECAUSE OF #279. `settled()` was a local helper in
 * `case-study.spec.ts` that watched one of four streamed regions, and the cost
 * of that shape was two finished, signed builds that never shipped. The lesson
 * is not about streaming: a helper that lives inside the only spec using it is
 * a helper that gets copied the moment a second spec needs it, and the copy is
 * where the two start disagreeing. H3 is that second spec, so the lift happens
 * before the copy rather than after it.
 *
 * WHAT MOVED AND WHAT DID NOT. Everything here is `layout.sweep.spec.ts`'s,
 * unchanged in behaviour — the fingerprint, the bisection, the coarse step. The
 * one generalisation is that the fingerprint no longer names the case study's
 * selectors: a page hands in its own PROBES, because what a switch moves is a
 * property of the page and not of the sweep.
 */
import type { Page } from "@playwright/test";

/** Tall enough that nothing is scrolled by accident at any width. */
export const HEIGHT = 1200;

/** The coarse step. 1440 → 390 in 20px increments is 53 samples. */
export const STEP = 20;

/**
 * One value in a page's fingerprint.
 *
 * ONLY DISCRETE VALUES BELONG IN ONE. The content column changes continuously —
 * it is `min(1160px, 100% - 80px)` — so putting its width in a fingerprint
 * would report a jump at every single sample. It is checked separately, against
 * the formula, at every sample; that is the half of the sweep that covers the
 * space between the sheet's seven rows rather than only on them.
 *
 * `absent` is a value, not a failure: the desktop nav disappearing IS the 900
 * switch, and a probe that threw there would hide the thing it is for.
 */
export type Probe =
  | { readonly key: string; readonly kind: "tracks"; readonly selector: string }
  | {
      readonly key: string;
      readonly kind: "computed";
      readonly selector: string;
      readonly prop: string;
    };

/** What the layout looks like right now, as values that can only jump. */
export async function fingerprint(page: Page, probes: readonly Probe[]): Promise<string> {
  return page.evaluate((list) => {
    const read = (selector: string, prop: string): string => {
      const el = document.querySelector(selector);
      if (el === null) return "absent";
      return getComputedStyle(el).getPropertyValue(prop);
    };

    const tracks = (selector: string): string => {
      const el = document.querySelector(selector);
      if (el === null) return "absent";

      const style = getComputedStyle(el);

      // THE DISPLAY HAS TO BE READ FIRST, and finding out why cost a red test.
      // `grid-template-columns` keeps its computed value on a box that is no
      // longer a grid: `.cs-constraints` declares `1fr 1fr` inside a
      // `max-width: 1079` query and returns to `display: flex` at 720, so the
      // track list still reads "1fr 1fr" below 720 and the switch looked as if
      // it moved nothing. A row is one column or two because of both.
      if (!style.display.includes("grid")) return style.display;

      // The COUNT, not the widths: the widths follow the window continuously
      // and the count is what a switch changes.
      const value = style.gridTemplateColumns;
      return value === "none" ? "none" : String(value.split(/\s+/).length);
    };

    return list
      .map((probe) =>
        probe.kind === "tracks"
          ? `${probe.key}=${tracks(probe.selector)}`
          : `${probe.key}=${read(probe.selector, probe.prop)}`,
      )
      .join(" · ");
  }, probes);
}

/** The fingerprint at one width. */
export async function at(page: Page, width: number, probes: readonly Probe[]): Promise<string> {
  await page.setViewportSize({ width, height: HEIGHT });
  return fingerprint(page, probes);
}

/** Which fingerprint keys changed between two prints. */
export function moved(wide: string, narrow: string): string[] {
  const a = new Map(wide.split(" · ").map((part) => part.split("=") as [string, string]));
  const b = new Map(narrow.split(" · ").map((part) => part.split("=") as [string, string]));
  return [...a.keys()].filter((key) => a.get(key) !== b.get(key)).sort();
}

/**
 * Every width between 1440 and 390 at which this page changes shape.
 *
 * Coarse pass to find the intervals in which the fingerprint moved, then a
 * bisection of each one to the exact pixel. The edge is reported as the
 * narrowest width that still LOOKS LIKE the wider layout — i.e. the first width
 * at which the wider layout no longer applies, which is how SWITCHES is defined
 * and how `max-width` queries actually fire.
 *
 * A switch that fires twice — two components crossing at the same width — is
 * one edge, not two.
 */
export async function edges(page: Page, probes: readonly Probe[]): Promise<number[]> {
  const samples: { width: number; print: string }[] = [];
  for (let width = 1440; width >= 390; width -= STEP) {
    samples.push({ width, print: await at(page, width, probes) });
  }

  const intervals: { wide: number; narrow: number }[] = [];
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].print !== samples[i - 1].print) {
      intervals.push({ wide: samples[i - 1].width, narrow: samples[i].width });
    }
  }

  const found: number[] = [];
  for (const interval of intervals) {
    let wide = interval.wide;
    let narrow = interval.narrow;
    const wideprint = await at(page, wide, probes);

    while (wide - narrow > 1) {
      const middle = Math.floor((wide + narrow) / 2);
      if ((await at(page, middle, probes)) === wideprint) wide = middle;
      else narrow = middle;
    }
    found.push(wide);
  }

  return [...new Set(found)].sort((a, b) => b - a);
}
