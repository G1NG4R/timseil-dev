// Which post-mortem slugs on a case study can be linked, and which cannot.
//
// #298 ASKED FOR A LINK AND THE ANSWER IS "FOR THE ONES THAT RESOLVE". The
// issue is right that the old refusal has expired — `IncidentLog` printed
// `post_slug` as text because `/blog/<slug>` answered 404, and H9a ended that.
// It is wrong that the markup can simply change, and the reason is measurable:
// TODAY NOT ONE `post_slug` ANYWHERE IN THIS PROJECT NAMES A FILE THAT EXISTS.
// api/internal/fixtures/incident.sql writes `001-fixture-outage` and says in
// its own comment that the file is deliberately absent; the gallery's two
// incidents named entries the corpus does not have; production answers
// `incidents: []`. An unconditional `<a>` would have broken invariant 5 in the
// phase that set out to satisfy it, on the one surface that can show it.
//
// SO THE SLUG IS RESOLVED, NOT TRUSTED. It arrives as a string from the api,
// and the database can constrain its SHAPE but not its EXISTENCE — a foreign
// key cannot cross into a directory. `postFor` is the same gate `/blog/[slug]`
// puts in front of itself, used here for the same question.
//
// AND THE UNRESOLVED CASE IS NOT AN ERROR. It is the old behaviour, kept: the
// slug is shown as what it is, the name of an entry. An incident that names a
// post-mortem nobody has written yet is still an incident with a cause and a
// fix, and dropping it would be a worse answer than printing its name.
// #32 is the check that makes the unresolved branch impossible for real data;
// this is what the page does until — and if — one slips past it anyway.
//
// WHY IT IS HERE AND NOT IN THE COMPONENT. `npm test` reads lib/** and
// styles/** only, and Node strips types but does not transform JSX, so a
// decision taken inside a .tsx is a decision nothing can assert. Same reason
// lib/work/entries.ts exists.

import type { Incident } from "../api/systems.ts";
import { postFor, postPath, type PostMeta } from "../content/posts.ts";
import { localeHref, type Locale } from "../i18n/routes.ts";

/** Reads the corpus. Injected in tests so both branches run without a disk. */
export type PostLookup = (slug: string) => PostMeta | null;

/**
 * Slug → address, for the incidents whose post-mortem this repository holds.
 *
 * A MAP AND NOT A FIELD ON THE INCIDENT, because `Incident` is the contract's
 * type and this is not the contract's business. The component asks the map and
 * gets `undefined` for the slugs that resolved to nothing, which is the same
 * shape as "there is no link here" rather than a second state to interpret.
 *
 * KEYED BY SLUG AND NOT BY INCIDENT ID: two notches can cite one post-mortem,
 * and a key that allowed that to be two different answers would be a bug
 * waiting for the day it happens.
 */
export function postMortemHrefs(
  incidents: readonly Incident[] | null,
  locale: Locale,
  lookup: PostLookup = postFor,
): ReadonlyMap<string, string> {
  const hrefs = new Map<string, string>();
  for (const incident of incidents ?? []) {
    if (hrefs.has(incident.postSlug)) continue;
    const post = lookup(incident.postSlug);
    if (post === null) continue;
    hrefs.set(incident.postSlug, localeHref(locale, postPath(post)));
  }
  return hrefs;
}
