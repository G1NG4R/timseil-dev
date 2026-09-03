// The client's half of the contact validator, and it is a MIRROR rather than an
// authority.
//
// `api/internal/contact/validate.go` is the authority and stays it. This file
// exists for one reason the api cannot serve: a visitor who mistypes an address
// should learn it beside the field, not after a round trip that also spends one
// of their three sends in ten minutes. Everything here is therefore checked
// again on the other side, and the page renders the api's answer when the two
// disagree.
//
// SO IT LEANS LOOSE, ON PURPOSE, AND ONLY IN ONE DIRECTION. A client rule
// stricter than the server's refuses an address the api would have accepted, and
// the visitor has no way to argue with it. A client rule looser than the
// server's costs a round trip and shows the server's reason under the same
// field. `deliverable` below is the place this matters: Go runs net/mail's
// parser and this cannot, so it checks the shape that catches typos and lets the
// remainder travel.
//
// THE REASONS ARE COPIED WORD FOR WORD from validate.go, and the order of the
// returned entries follows FIELDS, which is the order of the form. That is the
// promise validate.go:53-55 makes to this page — "so the page can move focus to
// the first failing field without sorting anything" — and it is only a promise
// kept if both sides read the same way down.

import type { components } from "../api/schema";

import { FIELDS, lengthOf } from "./fields.ts";

/** One entry of the contract's `invalidParams`, so the page renders an api
 *  answer and a local one through the same branch. */
export type InvalidParam = components["schemas"]["InvalidParam"];

/** What the visitor has typed, before anything is built out of it. */
export interface Draft {
  readonly name: string;
  readonly email: string;
  readonly message: string;
}

/**
 * Refuses anything that is not printable text.
 *
 * `containsControl` in validate.go, rune for rune: U+2028 and U+2029, plus C0
 * and C1 including tab. A tab in a Subject folds the header, which is the whole
 * reason the name is checked at all.
 */
export function containsControl(value: string): boolean {
  for (const rune of value) {
    if (rune === "\u2028" || rune === "\u2029") return true;
    const code = rune.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/**
 * Whether a reply could reach this address.
 *
 * The second half of Go's `deliverable`, which is the half a typo trips over: a
 * domain with a dot, a last label of at least two letters, and nothing that is
 * obviously not an address. The first half is net/mail's parser, and the api
 * keeps it.
 *
 * PUNYCODE PASSES because an internationalised domain arrives as `xn--…`, which
 * is ASCII letters and digits — the same reason Go's loop gives.
 */
export function deliverable(address: string): boolean {
  if (containsControl(address)) return false;
  if (/[\s<>,;"]/.test(address)) return false;

  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return false;
  if (address.slice(0, at).includes("@")) return false;

  const domain = address.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  if (dot <= 0 || dot === domain.length - 1) return false;

  const tld = domain.slice(dot + 1);
  if (tld.length < 2) return false;
  return /^[A-Za-z]+$/.test(tld);
}

/**
 * Every rule the form can check, in the order of the form.
 *
 * Returns `[]` when there is nothing to say. It does not check `dwellMs`, `ts`
 * or `company`: those three are not typed by anybody, lib/contact/payload.ts
 * builds them, and a form that told a visitor their honeypot was wrong would be
 * describing a bug rather than a mistake.
 */
export function validateDraft(draft: Draft): readonly InvalidParam[] {
  const invalid: InvalidParam[] = [];

  for (const field of FIELDS) {
    // Trimmed first, exactly as validate.go does: a message of twenty spaces is
    // not twenty characters, and a visitor should learn that here rather than
    // from a 400.
    const value = draft[field.name].trim();
    const used = lengthOf(value, field.unit);

    if (field.name === "name") {
      if (containsControl(value)) {
        invalid.push({ name: "name", reason: "must not contain line breaks or control characters" });
        continue;
      }
    }

    if (field.name === "email") {
      if (value === "") {
        invalid.push({ name: "email", reason: "required" });
        continue;
      }
      if (used > field.max) {
        invalid.push({ name: "email", reason: "at most 254 characters" });
        continue;
      }
      if (!deliverable(value)) {
        invalid.push({ name: "email", reason: "not a plain mail address" });
      }
      continue;
    }

    if (field.min !== null && used < field.min) {
      invalid.push({ name: field.name, reason: `at least ${String(field.min)} characters` });
      continue;
    }
    if (used > field.max) {
      invalid.push({ name: field.name, reason: `at most ${String(field.max)} characters` });
    }
  }

  return invalid;
}

/**
 * The first field with something wrong with it, or `null`.
 *
 * A separate function because the api answers with the same list and the page
 * moves focus the same way for both. `invalidParams` may name a field this form
 * does not draw — `ts` and `dwellMs` are in the contract — and a focus call
 * against a field that is not on the screen would silently do nothing, so the
 * lookup goes through FIELDS rather than through the list.
 */
export function firstInvalidField(invalid: readonly InvalidParam[]): string | null {
  for (const field of FIELDS) {
    if (invalid.some((entry) => entry.name === field.name)) return field.name;
  }
  return null;
}

/** The reason for one field, or `undefined` — which is what `Field` wants. */
export function reasonFor(invalid: readonly InvalidParam[], name: string): string | undefined {
  return invalid.find((entry) => entry.name === name)?.reason;
}
