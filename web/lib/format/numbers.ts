// How a number looks in each of the three languages.
//
// THE LOCALE IS THE FIRST ARGUMENT OF ALL THREE, and that is the whole point of
// the file. `Intl.NumberFormat()` and `value.toLocaleString()` without an
// argument read the locale off the environment the code runs in — the container
// — and a rendered number that changes because somebody set `LANG` on a host is
// the same class of fact as a guessed clock time. lib/content/words.ts refused
// `toLocaleString` for exactly this reason one phase before there was a second
// language to refuse it for. ADR 0083.
//
// THE SHEET FIXES THE FORMS, LANG.01 row "Zahlformat":
//
//	en   99.98%    142ms
//	de   99,98 %   142 ms
//	fr   99,98 %   142 ms      (U+202F, a narrow no-break space)
//
// THERE IS NO `millis` AND THE PLAN FOR THIS PHASE ASKED FOR ONE. Nothing on
// this site prints a complete millisecond measurement in running text: the p95
// stat tile carries its unit in a separate span — `MS`, uppercased by the
// stylesheet — so what it needs is the bare number, which is `decimal`. A
// `millis()` beside it would be an export with no caller, and CLAUDE.md's rule
// about tools nobody sees applies to functions too. The unit gap is still in
// this file, in UNIT_SPACE, so a sentence that one day does print `142 ms` has
// one line to write and no decision to make.
//
// and the row next to it fixes what does NOT move: "Datum — bleibt ISO,
// sortierbar, eindeutig". There is no date function here and there will not be
// one.
//
// `— NO DATA` IS NOT HERE EITHER. It is one token across all three languages
// since design-correction #6, it lives in lib/state/words.ts, and these
// functions never produce it: they take a number and return a string. A caller
// that might not have a number checks for `null` itself, the way every
// `*Value` function in lib/api/ already does.
//
// WHAT `Intl` DOES NOT GUARANTEE is that a container ships the data for a
// locale. A small Node image can be built with English only, and then `de` and
// `fr` quietly return the English form — a page labelled in German printing
// numbers in English, with nothing red anywhere. numbers.test.ts pins the
// separator CODEPOINTS rather than eyeballing the strings, so a trimmed ICU is
// a failed test rather than a subtle wrong page. Node 24 ships full-icu by
// default; the test is what makes that a fact about this build rather than an
// assumption about the runtime.

import type { Locale } from "../i18n/routes.ts";

/**
 * The separator between a number and its unit, per language.
 *
 * ENGLISH HAS NONE. `99.98%` and `142ms` sit tight against the unit, which is
 * how every artboard in this repository draws them and how the footer has
 * printed uptime since G4.
 *
 * GERMAN TAKES U+00A0 AND FRENCH U+202F, and the difference is the sheet's:
 * "FR mit schmalem geschütztem Leerzeichen U+202F". Both are no-break, because
 * a percentage split across a line break is a different number to a reader
 * scanning a meta row — lib/content/words.ts measured that at 390 and said so.
 * German gets the ordinary one for the reason that file gives: the narrow space
 * is missing from enough monospace faces to render as a box, and a box is a
 * worse failure than two pixels of gap. French gets it because the sheet names
 * the codepoint, and that is a typographic rule a French reader notices.
 */
const UNIT_SPACE: Record<Locale, string> = {
  en: "",
  de: " ",
  fr: " ",
};

/**
 * `99.98` · `99,98`, with no unit at all.
 *
 * THE PRIMITIVE, AND THE ONE THE STAT TILES ACTUALLY WANT. A `MetricValue` is a
 * label, a value and a unit in three fields, because `styles/state.css` sets the
 * unit in its own size and colour — so the value must not carry it. `percent`
 * below is for the places that print a whole measurement in one string, which
 * on this site is the footer's uptime cell and nothing else yet.
 *
 * The grouping and decimal marks come from `Intl`; only the unit gap is ours.
 */
export function decimal(locale: Locale, value: number, digits: number): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    // THE GROUPING IS OFF FOR EVERY NUMBER THIS FILE FORMATS. Uptime is a
    // percentage, p95 is milliseconds in the tens, and an error rate is two
    // decimals of a per-cent — none of them reaches four digits, so grouping
    // would only ever be the separator nobody sees. `count` turns it back on,
    // because a word count does.
    useGrouping: false,
  }).format(value);
}

/**
 * `99.98%` · `99,98 %` · `99,98 %`.
 *
 * TWO DECIMALS BY DEFAULT because that is what the footer has printed since G4.
 * `digits` is a parameter rather than a second function so that the one caller
 * who wants a coarser reading does not get a `percent1()` beside this one.
 *
 * ONE CALLER TODAY: `lib/api/health.ts#uptimeText`, the footer's uptime cell.
 * The stat tiles use `decimal` and keep the `%` in their own span.
 */
export function percent(locale: Locale, value: number, digits = 2): string {
  return `${decimal(locale, value, digits)}${UNIT_SPACE[locale]}%`;
}

/**
 * `2480` · `2.480` · `2 480`.
 *
 * A WHOLE NUMBER OF THINGS: days, incidents, entries, words. Grouping is on,
 * and the separator is the language's own — which is the one case in this file
 * where English and German disagree about a mark rather than about a space.
 *
 * NOT `wordsLabel`. lib/content/words.ts groups with U+00A0 in all three
 * languages and says why in its own head: the reading-size row is nomenclature
 * next to a measurement, drawn one way on the Blog Post artboard. That file
 * stays as it is; this one is for counts that stand in prose.
 */
export function count(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale, { useGrouping: true }).format(value);
}
