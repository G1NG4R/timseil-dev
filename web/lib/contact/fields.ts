// The three fields the visitor fills, as data.
//
// THE SAME ARGUMENT lib/about/sections.ts MAKES: `npm test` reads `lib/**` and
// `styles/**` and nothing else, so a field list that lived beside the form it
// orders would be a checklist nothing checks. Here the stake is higher than an
// order — every bound below is also a bound in `contract/openapi.yaml` and a
// constant in `api/internal/contact/policy.go`, and a copy that drifts refuses
// something the api accepts or accepts something it refuses.
//
// THE ORDER IS LOAD-BEARING AND NOT A LAYOUT CHOICE. `validate.go:53-55`
// promises it: "The order of the returned params follows the order of the form,
// so the page can move focus to the first failing field without sorting
// anything." That promise is only kept if this list and that switch statement
// read the same way down, so the list is here, in one place, and the form is
// built from it.
//
// WHAT IS HERE AND WHAT IS IN en.ts: labels are nomenclature — LANG.01,
// "Übersetzt wird Prosa, nicht Nomenklatur" — and a German contact page would
// still read NAME and E-MAIL. The sentence under a field is prose, so only its
// key is here.

/** Which unit a bound counts in, because the two fields do not agree. */
export type Unit = "runes" | "bytes";

export interface FieldSpec {
  /** The name the value is posted under, and the id every label points at. */
  readonly name: "name" | "email" | "message";
  /** The label above the field. Nomenclature. */
  readonly label: string;
  /** A textarea rather than an input. */
  readonly multiline: boolean;
  /** The floor, or `null` where the contract states none. */
  readonly min: number | null;
  /** The ceiling. */
  readonly max: number;
  readonly unit: Unit;
  /**
   * Whether the counter names the floor as well as the ceiling.
   *
   * TRANSCRIBED FROM THE SHEET, not derived, and the sheet is right. It draws
   * `{{ msgCount }}/4000 · MIN 20` under the message and a bare
   * `{{ nameCount }}/80` under the name. Twenty characters is a floor a visitor
   * writes their way up to and can be surprised by; two is a formality nobody
   * is under except by accident, and announcing it spends a line on a rule that
   * never fires.
   *
   * A DERIVED RULE WAS TRIED AND DROPPED — "show the floor while the value is
   * under it" reads well and disagrees with the sheet at 148 characters, where
   * the desktop artboard still shows `MIN 20`. Form gilt.
   */
  readonly showFloor: boolean;
  /** What a browser may offer to fill in. */
  readonly autoComplete: string;
}

/**
 * The three fields, in the order the sheet draws them and the api reports them.
 *
 * `email` COUNTS BYTES AND THE OTHER TWO COUNT RUNES, and that is the contract's
 * asymmetry rather than an oversight here. 254 is the octet limit of an address
 * in RFC 5321 and the database column agrees with it in octets, so
 * `validate.go:88` uses `len(email)`; `name` and `message` use
 * `utf8.RuneCountInString`, because a bound on prose that counts bytes charges
 * an umlaut twice.
 */
export const FIELDS: readonly FieldSpec[] = [
  {
    name: "name",
    label: "NAME",
    multiline: false,
    min: 2,
    max: 80,
    unit: "runes",
    showFloor: false,
    autoComplete: "name",
  },
  {
    name: "email",
    label: "E-MAIL",
    multiline: false,
    min: null,
    max: 254,
    unit: "bytes",
    showFloor: false,
    autoComplete: "email",
  },
  {
    name: "message",
    label: "MESSAGE",
    multiline: true,
    min: 20,
    max: 4000,
    unit: "runes",
    showFloor: true,
    autoComplete: "off",
  },
];

/**
 * How long a value is, in the unit its own bound is written in.
 *
 * The spread iterates by code point, which is what `utf8.RuneCountInString`
 * counts. `String.length` would count UTF-16 units and charge an emoji twice —
 * a bound the api does not have, refused by a page that made it up.
 */
export function lengthOf(value: string, unit: Unit): number {
  if (unit === "bytes") return new TextEncoder().encode(value).length;
  // `Array.from` AND NOT `Intl.Segmenter`. Both walk a string; they disagree
  // about what one unit is. A segmenter counts what a PERSON would call a
  // character and holds an emoji with a skin tone together as one; `Array.from`
  // walks the string iterator, which yields code points — and a code point is
  // exactly what `utf8.RuneCountInString` counts on the other side of the wire.
  // This bound is not about people. It is about agreeing with Go, and a
  // segmenter here would refuse a message the api accepts.
  return Array.from(value).length;
}

/**
 * The line on the right of a field's label, or `null` where the sheet draws a
 * hint instead of a count.
 *
 * `148/4000 · MIN 20` is the sheet's own form, and the floor rides along because
 * a counter that only shows a ceiling answers the wrong question for the one
 * field with a floor a visitor can actually hit.
 */
export function counterFor(field: FieldSpec, value: string): string | null {
  if (field.name === "email") return null;

  const used = lengthOf(value, field.unit);
  const head = `${String(used)}/${String(field.max)}`;
  if (!field.showFloor || field.min === null) return head;
  return `${head} · MIN ${String(field.min)}`;
}
