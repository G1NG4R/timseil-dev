// What a reader can see on each legal page, as one array of strings per page.
//
// WHY THIS IS A MODULE AND NOT A HELPER IN A TEST FILE. Three test files ask a
// question of "everything on the page" — content.test.ts sweeps `/privacy` for
// durations nobody enforces and sentences the code outgrew, imprint.test.ts
// does the same one route over, and brackets.test.ts holds one rule across both
// — and a helper copied into each of them is a helper that stops agreeing with
// itself. The failure would be silent in the worst way: a sweep that misses a
// field reports green, and green is what everybody reads.
//
// IT IS ALSO THE LIST SOMEBODY HAS TO EXTEND. A new string on either page — a
// second card, a caption, a label — is invisible to every check in this
// directory until it appears here, and that is the one thing about this file
// worth remembering. The blocks are flattened by `blockText`, which the
// compiler keeps exhaustive over `Block`; the loose strings around them are
// listed by hand because nothing else knows they exist.

import { blockText } from "./blocks.ts";
import { CONTENT, HERO, LABELS, PANEL, SEE_ALSO, SHORT_VERSION } from "./content.ts";
import {
  CONTENT as IMPRINT_CONTENT,
  HERO as IMPRINT_HERO,
  LABELS as IMPRINT_LABELS,
  NOT_APPLICABLE,
  OPERATOR,
  SEE_ALSO as IMPRINT_SEE_ALSO,
} from "./imprint.ts";

/** Every string on `/privacy`. */
export function privacyText(): string[] {
  return [
    HERO.eyebrow,
    HERO.title,
    HERO.lede,
    HERO.sub,
    PANEL.title,
    PANEL.badge,
    PANEL.footer,
    PANEL.pending,
    LABELS.rail,
    LABELS.shortVersion,
    LABELS.yes,
    LABELS.no,
    LABELS.readout,
    LABELS.revised,
    SEE_ALSO.label,
    SEE_ALSO.marker,
    SEE_ALSO.blurb,
    ...SHORT_VERSION.map((line) => line.text),
    ...Object.values(CONTENT).flatMap((blocks) => blocks.flatMap(blockText)),
  ];
}

/** Every string on `/imprint`.
 *
 *  THE FIELD LIST IS IN HERE KEY AND VALUE BOTH, and the keys matter as much as
 *  the values: `ADDRESS` is a label and `[ADDRESS]` is an unfilled fact, and a
 *  sweep that only read the values would pass the day somebody typed the second
 *  one into the first one's column. */
export function imprintText(): string[] {
  return [
    IMPRINT_HERO.eyebrow,
    IMPRINT_HERO.title,
    IMPRINT_HERO.lede,
    IMPRINT_LABELS.rail,
    IMPRINT_LABELS.notApplicable,
    IMPRINT_LABELS.operator,
    IMPRINT_LABELS.revised,
    IMPRINT_SEE_ALSO.label,
    IMPRINT_SEE_ALSO.marker,
    IMPRINT_SEE_ALSO.blurb,
    ...OPERATOR.flatMap((field) => [field.key, field.value]),
    ...NOT_APPLICABLE.items,
    NOT_APPLICABLE.note,
    ...Object.values(IMPRINT_CONTENT).flatMap((blocks) => blocks.flatMap(blockText)),
  ];
}
