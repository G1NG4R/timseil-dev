// The three things a streamed region can know about its answer.
//
// Until U7 there were two: a component took `body: T | null`, and `null` was
// passed by BOTH the Suspense fallback and a `*Now()` reader whose fetch had
// failed. So one value meant "nobody has asked yet" and "we asked and nothing
// answered", and the component printed the same panel for both — the sentence
// that names the endpoint and says it did not answer. Measured against
// production on 28.09.2026: the homepage said that about three endpoints in a
// document that carried their answers.
//
// STATE.05 keeps the two apart and the site already had both halves written.
// `loadingLines()` in ./lines.ts says what is being fetched and from where;
// `.st-wait` in styles/state.css reserves the height the answer will need. What
// was missing is the value that lets a component tell which state it is in.
//
// NOT AN `ErrorInput` AND NOT A STATUS. A failed read leaves `readers.ts`
// through a `catch` that has no answer to report, so `down` carries nothing: the
// region names its own endpoint, and a code nothing measured would be an
// invented number.
//
// ADR 0082 carries the decision, the measurements and the four alternatives that
// were turned down — including the one this file looks like it should have taken.

export type Read<T> =
  | { readonly kind: "waiting" }
  | { readonly kind: "down" }
  | { readonly kind: "ok"; readonly data: T };

/** What a `<Suspense>` fallback passes. One spelling, so a page cannot invent a
 *  second one. Assignable to `Read<T>` for every `T`. */
export const WAITING: Read<never> = { kind: "waiting" };

/** What a `*Live` component passes when its reader answered `null`. */
export const DOWN: Read<never> = { kind: "down" };

/** And the answer. A function rather than a third constant because it carries
 *  the only payload in this file. */
export function readOk<T>(data: T): Read<T> {
  return { kind: "ok", data };
}

/**
 * The answer, or `null` for either state that has none.
 *
 * WHAT IT IS FOR, AND WHAT IT IS NOT. Every derivation this site makes out of an
 * answer already takes `T | null` and draws `— NO DATA` for it — `metricTiles`,
 * `opsGrid`, `trainingMeta`, `systemRows`. Those functions are right and stay:
 * a cell cannot tell "not asked yet" from "no answer", so it must say neither.
 * This is the door to them.
 *
 * WHICH LEAVES `kind` FOR THE ONE PLACE THAT CAN TELL: the panel that says WHY a
 * region is empty. A component that reaches for `readData` where it should have
 * branched on `kind` is the U7 defect, rewritten.
 */
export function readData<T>(read: Read<T>): T | null {
  return read.kind === "ok" ? read.data : null;
}
