// A catalogue sentence that holds a number, and the two forms a count needs.
//
// IT IMPORTS NOTHING, which is deliberate twice over. messages.ts and
// complete.ts both say the first reason in their own heads: everything that
// decides has to stay reachable from `node --test`. The second is bundle.ts's
// reason — `workCount`, `blogCount` and the active filter labels are imported by
// WorkFilters and BlogFilters, and both of those are islands, so this module
// crosses the client boundary. There is nothing here for a bundler to follow.
//
// WHY NOT TWO KEYS AND THE NUMBER BETWEEN THEM. That is what U8 did for the
// operation strip (`csLast` + the count + `csDays`), with the argument that the
// number sits between the same two words in English and in German. It holds
// until German declines the noun:
//
//     8 of 91 days measured      →  8 von 91 TagEN gemessen   (dative)
//     … over 367 days, … to …    →  … über 367 Tage, … bis …  (accusative)
//
// One noun, two forms, one key. Fragments cannot do that, and a `csDaysDative`
// beside `csDays` would be a grammar table in the catalogue. So the whole
// sentence is the key and the number is a hole in it.
//
// EVERY MISTAKE HERE THROWS. lib/seo/pages.ts set the precedent and the reason
// is the same: every caller renders at build time or inside a document that is
// already being streamed, so a build error is earlier and louder than `{window}`
// on the page. A missing value, a value nobody asked for, an empty `{}` and a
// brace that survived are all defects, and none of them is a sentence a reader
// should see. Measured before the rule was written: no value in messages/en.ts
// or de.ts contains a brace, so a surviving one cannot be prose.

/** The placeholder names this template asks for, in the order it asks. */
export function placeholdersIn(template: string): readonly string[] {
  return [...template.matchAll(/\{([^{}]*)\}/g)].map((match) => match[1]);
}

/**
 * Put the values into the sentence, and refuse anything short of exactly.
 *
 * @throws if a placeholder has no value, if a value has no placeholder, if a
 *   placeholder has no name, or if a brace is not part of one.
 */
export function fill(template: string, vars: Readonly<Record<string, string>>): string {
  const asked = placeholdersIn(template);

  if (asked.includes("")) throw new Error(`fill: a placeholder with no name in: ${template}`);

  // THE TEMPLATE IS CHECKED BEFORE THE VALUES, and the first run of the test is
  // why: `{window` matches nothing, so it is neither asked for nor missing, and
  // the value loop below reported it as a value nobody asked for. True, and the
  // wrong sentence to read at three in the morning. A brace that is not part of
  // a placeholder is the defect, so it is named as one.
  if (/[{}]/.test(template.replace(/\{[^{}]*\}/g, ""))) {
    throw new Error(`fill: a brace with no placeholder in: ${template}`);
  }

  // `Object.hasOwn` AND NOT `=== undefined`, because the type says `string` and
  // the runtime does not: a caller hands in an object literal, and the key the
  // template wants can simply not be in it. Comparing against undefined reads
  // like the honest check and lints as dead code — this is the same question
  // asked where the answer actually lives.
  for (const name of asked) {
    if (!Object.hasOwn(vars, name)) {
      throw new Error(`fill: no value for {${name}} in: ${template}`);
    }
  }

  for (const name of Object.keys(vars)) {
    if (!asked.includes(name)) throw new Error(`fill: {${name}} is not in: ${template}`);
  }

  // Every name is known to be present by now, which is why this reads like it
  // trusts the object: the three checks above are what earns that.
  return template.replace(/\{([^{}]*)\}/g, (_match, name: string) => vars[name]);
}

/**
 * Which of the two forms a count takes.
 *
 * TWO BRANCHES, BECAUSE ENGLISH AND GERMAN HAVE TWO FORMS. Both are CLDR
 * `one`/`other`, and `one` is exactly 1 in both. The line where this breaks is
 * French, which counts 0 as `one` — written down here so that the phase which
 * fills fr.ts finds it instead of finding it out.
 */
export function plural(count: number, one: string, other: string): string {
  return count === 1 ? one : other;
}
