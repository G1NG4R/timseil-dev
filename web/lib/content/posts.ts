// The frontmatter of web/content/posts/*.mdx, read as text.
//
// IN lib/ AND NOT IN THE COMPONENT, for the reason lib/content/compose.ts gives
// one file over: `npm test` reads lib/** and styles/** only, and Node strips
// types but does not transform JSX, so nothing asserted about a .tsx can be
// asserted at all. This is a judgement about text — where a key ends, which
// lines belong to a block, what makes a file unusable — and a judgement with no
// test is the shape of every finding this repository has had.
//
// READ AS TEXT AND NOT AS YAML, which is lib/content/pipeline.test.ts's decision
// about ci.yml, made again for the same two reasons. A parser would be a
// dependency on the wrong side of the bundle budget (#237: 143 581 B of
// 150 000 B before a page existed), and the questions being asked are small and
// closed: four scalar keys on their own lines, one block scalar to step over.
// What this file may NOT do is pretend to be YAML — it reads the shapes that are
// in the fourteen files and refuses everything else, rather than guessing.
//
// H9a DECIDED THE SCHEMA, WHICH IS WHAT #192 ASKED FOR: "the frontmatter of
// every post in web/content/posts/ is validated by the thing that renders it."
// All six keys are read now, plus one optional seventh, and the rule that
// decides which are required did not change — it only got a second page to
// answer to.
//
// THE RULE IS STILL "EVERY FIELD THAT IS DRAWN IS REQUIRED". Until H9a the only
// surface was a three-cell row, so three keys were required. The post page draws
// two more: `TAGS` in the meta row and the `SUMMARY` panel under the title, both
// of which the Blog Post sheet lists as PFLICHT. So both are required, and a
// file missing one is skipped rather than rendered with a hole where a mandatory
// block should be.
//
// `updated` IS THE SEVENTH AND IT IS OPTIONAL, against a sheet that calls it
// mandatory. Nothing in this repository has ever changed a published post, so a
// date here would have to come from somewhere — the build clock, or a hand — and
// both are invariant 1. #284 is the same shape one directory over: "updatedAt is
// the last hand-typed fact on a case study, and nothing checks it." The key is
// read when it is written and the line is absent when it is not.
//
// THE FOURTH KEY IS H6's, AND IT SETTLED #314 ON THE WAY IN. ADR 0002 names
// `systemId` and `docs/design/README.md` writes `post.systemId`; all fifteen
// files wrote `system`. Nothing read the key, so the disagreement survived from
// the first post — and H5c found it here, writing this reader, without having
// to pick a side.
//
// THE CORPUS MOVED, NOT THE DECISION, and `docs/design/` is why. That folder is
// read-only, so of the three names the issue asks to agree, exactly one could
// change: not the design README, and not the ADR that the README already
// agrees with. Fifteen frontmatter keys were renamed instead — mechanical,
// because nothing read them, and now something does.

// NOTE ON #192's EDGE, since this is the second reader and no longer the first:
// H9 inherits two callers of this schema rather than one. That is the price of
// the Work Index counting entries per system, and it is written down here so
// the phase that changes the schema knows where to look.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { plainText } from "./body.ts";
import { log } from "../log.ts";

/** One entry: every key its frontmatter carries, plus the slug the filename is.
 *
 *  IT WAS FOUR OF SIX UNTIL H9a, and the two that were missing are the two the
 *  post page draws. The head of this file has the rule that decided it. */
export interface PostMeta {
  /** The filename without `.mdx` — the same string incidents.post_slug holds. */
  readonly slug: string;
  readonly title: string;
  /** The one-line dek. NOT `summary`, which is a paragraph for a feed. */
  readonly deck: string;
  /** `YYYY-MM-DD`, kept as text: nothing here does arithmetic on a date. */
  readonly published: string;
  /**
   * The `systems.slug` this entry is about, or nothing.
   *
   * NULLABLE WHERE THE OTHER THREE ARE REQUIRED, and the asymmetry is the
   * point. The three above are what the homepage row DRAWS, so a file missing
   * one of them would render a hole and is left out instead. This one is not
   * drawn anywhere: the Work Index counts by it, and a post that names no
   * system simply counts towards no system. Requiring it would drop a readable
   * entry off the homepage over a key that page never shows.
   *
   * NOT VALIDATED AGAINST THE SYSTEM LIST HERE. This file reads text and knows
   * nothing about the api; whether the string is a slug anything answers to is
   * lib/work/log.ts's question, and it counts only what matches.
   */
  readonly systemId: string | null;
  /**
   * The subject words, in the order they were written.
   *
   * REQUIRED AND NON-EMPTY, because the post's meta row draws `TAGS …` and the
   * index draws them in every row. An empty array would be a `TAGS` label with
   * nothing after it on a page whose sheet calls the block mandatory.
   *
   * ORDER IS THE AUTHOR'S. The index sorts nothing here: `['api',
   * 'rate-limiting', 'design', 'honesty']` puts the subject first and the
   * afterthought last, and alphabetising would throw that away for tidiness.
   */
  readonly tags: readonly string[];
  /**
   * The paragraph under the title, and the one the feed hands to a stranger.
   *
   * NOT `deck`, AND THE DIFFERENCE IS WHO READS IT. The deck is one line above
   * the fold and is what the homepage row and the index draw. This is two to
   * three sentences, drawn in the SUMMARY panel of the post and used as the
   * `<description>` of a feed item — the only text about a post that leaves
   * this site.
   */
  readonly summary: string;
  /**
   * `YYYY-MM-DD` when the entry was revised, or nothing.
   *
   * THE ONE OPTIONAL KEY, against a sheet that lists it as mandatory. See the
   * head of this file: no post has ever been revised, and a date derived from
   * the build would be invariant 1 with an ISO format on it.
   */
  readonly updated: string | null;
}

/** A read of the directory, and what it could not use. */
export interface PostRead {
  readonly posts: readonly PostMeta[];
  /** Filenames that carried no usable frontmatter. Never silently dropped. */
  readonly skipped: readonly string[];
}

/**
 * THE SLUG SHAPE IS THE DATABASE'S, not a second opinion about it.
 *
 * `api/migrations/00004_operations.sql` constrains `incidents.post_slug` with
 * `^[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$` and its comment says the column points at
 * a file in this directory. A file this reader accepts but that constraint would
 * reject is a file no incident could ever cite, so the two agree by copy — and
 * the copy is here, in the half that can have a test.
 */
const SLUG = /^([0-9]{3}-[a-z0-9]+(?:-[a-z0-9]+)*)\.mdx$/;

/** A calendar date and nothing else. `published` is never a timestamp here. */
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `key: value`, at the start of a line, with the value possibly empty. */
const PAIR = /^([A-Za-z][\w-]*):(?:[ \t]+(.*))?$/;

/** The two block-scalar openers that mean "the value is the indented run below".
 *  `|` keeps the newlines, `|-` keeps them and drops the final one. Only `|`
 *  occurs in the corpus; `|-` costs nothing and would otherwise be read as a
 *  one-character value. `>` is NOT here: it folds lines, and folding is a
 *  transformation this reader would have to implement rather than recognise. */
const BLOCK = /^\|[-+]?$/;

/** One tag: lowercase, digits, hyphens. The shape `incidents.post_slug` uses for
 *  a slug, minus the leading number — because a tag ends up in a URL-shaped chip
 *  key and in a `data-` attribute, and both want the same alphabet. */
const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The scalar keys of a frontmatter block, or `null` when there is not one.
 *
 * `null` FOR THREE DIFFERENT FILES, and they are one answer on purpose: a file
 * with no leading `---`, a file whose block is never closed, and a file whose
 * block holds no key are all files this reader cannot draw a row from. The
 * caller reports the name; which of the three it was is not information the
 * homepage can act on.
 *
 * A BLOCK SCALAR IS NOW READ, AND THE OLD DEFENCE IS WHAT MAKES THAT SAFE.
 * `summary: |` opens a paragraph whose lines are indented, and one of those
 * lines beginning `title:` after six spaces is prose, not a key. Until H9a the
 * body was stepped over; now it is collected, and the reason a sentence inside
 * it still cannot become a key is unchanged: PAIR is anchored at column zero and
 * an indented line is never tested against it.
 *
 * THE BODY IS DEDENTED BY ITS OWN SMALLEST INDENT, not by a fixed two spaces.
 * YAML says the block's indentation is set by its first non-empty line, and a
 * fixed number here would silently eat a level from a file that used four.
 * Blank lines inside the block are kept as blank lines rather than measured —
 * they carry no indentation to measure.
 */
export function frontmatter(raw: string): ReadonlyMap<string, string> | null {
  const lines = raw.split("\n");
  if (lines[0]?.trimEnd() !== "---") return null;

  const found = new Map<string, string>();
  let closed = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trimEnd() === "---") {
      closed = true;
      break;
    }
    // Indented lines belong to whatever opened above them. A block scalar
    // consumes its own body below, so anything still reaching here is either a
    // nested map or the body of a block this reader chose not to open — and
    // neither is a key of ours.
    if (/^[ \t]/.test(line)) continue;

    const match = PAIR.exec(line);
    if (match === null) continue;

    const [, key, value = ""] = match;

    if (BLOCK.test(value.trim())) {
      const body: string[] = [];
      let indent = Number.POSITIVE_INFINITY;
      let j = i + 1;
      for (; j < lines.length; j++) {
        const next = lines[j] ?? "";
        if (next.trimEnd() === "---") break;
        if (next.trim() === "") {
          body.push("");
          continue;
        }
        if (!/^[ \t]/.test(next)) break;
        indent = Math.min(indent, next.length - next.trimStart().length);
        body.push(next);
      }
      // FIRST WINS here too, and the body is consumed either way: a second
      // `summary:` must not leave its paragraph behind to be read as keys.
      if (!found.has(key)) {
        const cut = Number.isFinite(indent) ? indent : 0;
        found.set(
          key,
          body.map((l) => (l === "" ? "" : l.slice(cut))).join("\n").trim(),
        );
      }
      i = j - 1;
      continue;
    }

    // FIRST WINS. A second `title:` at the top level is a broken file, and
    // keeping the first is the reading that matches what an editor sees.
    if (!found.has(key)) found.set(key, value.trimEnd());
  }

  if (!closed || found.size === 0) return null;
  return found;
}

/**
 * A frontmatter value with its quotes taken off.
 *
 * SINGLE QUOTES WITH `''` AS THE ESCAPE is the one form that actually occurs —
 * `012-the-preview-had-a-shorter-cascade-than-the-page.mdx` writes
 * `the site''s nine stylesheets` — and it is the only escape YAML gives a
 * single-quoted scalar. Double quotes are accepted because they cost one branch;
 * their backslash escapes are NOT interpreted, because no file uses one and
 * inventing an unpacking nobody wrote is how a reader starts lying.
 */
export function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * `['ci-cd', 'deploys', 'traefik']` read as three strings, or `null`.
 *
 * A FLOW SEQUENCE ON ONE LINE IS THE ONLY FORM ACCEPTED, because it is the only
 * form the twenty-one files use. The block form — a `-` per line — would be a
 * second shape to read and a second shape to get wrong, and nothing has asked
 * for it. A file that writes one gets `null` here and is named in `skipped`,
 * which is louder than a tag list that silently came back empty.
 *
 * EVERY ITEM IS CHECKED AGAINST `TAG`, not merely unquoted. A tag becomes a chip
 * key, a `data-` attribute and part of a filter comparison; `Rate Limiting` with
 * a space would pass through a lenient reader and then fail to match itself.
 * One bad item invalidates the list rather than being dropped from it — a post
 * whose tags are half-read is a post filed under the wrong subjects.
 */
export function tagList(value: string): readonly string[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;

  const inner = trimmed.slice(1, -1).trim();
  if (inner === "") return null;

  const tags: string[] = [];
  for (const part of inner.split(",")) {
    const tag = unquote(part);
    if (!TAG.test(tag)) return null;
    // A repeated tag would count twice in the index's chip counter and once in
    // the row. Refusing is the reading that keeps those two numbers equal.
    if (tags.includes(tag)) return null;
    tags.push(tag);
  }
  return tags;
}

/** Whether `YYYY-MM-DD` names a day that exists. `2026-02-30` does not. */
function isDate(value: string): boolean {
  const match = DATE.exec(value);
  if (match === null) return false;
  const [, y, m, d] = match;
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  // Round-tripping is the check: Date rolls February 30th forward to March 2nd
  // rather than refusing it, so a parse that succeeds proves nothing on its own.
  return date.toISOString().slice(0, 10) === `${y}-${m}-${d}`;
}

/**
 * One post, or `null` if the file cannot produce an honest row.
 *
 * EVERY FIELD THE ROW DRAWS IS REQUIRED, and that is the whole rule. The row has
 * three cells; a file missing one of them would render a row with a hole in it,
 * and a hole in a list of prose is not `— NO DATA` — ADR 0060 settled that one
 * section up: nobody asked for a measurement here, so there is nothing to report
 * as missing. The file is left out instead, and named in `skipped`.
 */
export function postMeta(file: string, raw: string): PostMeta | null {
  const name = SLUG.exec(file);
  if (name === null) return null;

  const keys = frontmatter(raw);
  if (keys === null) return null;

  const title = unquote(keys.get("title") ?? "");
  const deck = plainText(unquote(keys.get("deck") ?? ""));
  const published = unquote(keys.get("published") ?? "");
  const systemId = unquote(keys.get("systemId") ?? "");
  const tags = tagList(keys.get("tags") ?? "");
  // NOT `unquote`d. A block scalar is already plain text — its content is
  // whatever was indented, quotes included — and stripping a leading `'` from a
  // paragraph that opens with a quotation would be this reader editing prose.
  const summary = plainText((keys.get("summary") ?? "").trim());

  if (title === "" || deck === "") return null;
  if (!isDate(published)) return null;
  if (tags === null || summary === "") return null;

  // Present-and-broken is not the same as absent, and only the first is a
  // reason to drop the file: a post that writes `updated: soon` has made a
  // claim this reader cannot check, while a post that writes nothing has made
  // none. The absent case is `null` two lines down.
  const updatedRaw = unquote(keys.get("updated") ?? "");
  if (updatedRaw !== "" && !isDate(updatedRaw)) return null;

  // An absent key and an empty one are one answer here — "this entry names no
  // system" — because neither can be counted towards anything. That is not the
  // rule above it, where an empty `title` makes the file unusable; a row with
  // no headline is broken, a post about no particular system is ordinary.
  return {
    slug: name[1],
    title,
    deck,
    published,
    systemId: systemId === "" ? null : systemId,
    tags,
    summary,
    updated: updatedRaw === "" ? null : updatedRaw,
  };
}

/**
 * Newest first.
 *
 * THE DATE IS NOT A TOTAL ORDER, and this is the line that says so. Four of the
 * fourteen posts carry `published: 2026-09-01`, because four findings were
 * written up on one day — so a sort on the date alone leaves their order to
 * whatever `readdirSync` happened to return, and the homepage would draw three
 * rows that could change places between two builds with no edit in between.
 *
 * The tiebreak is the slug, which begins with the three-digit number that says
 * what was written after what. It is descending for the same reason the date is.
 */
function byNewest(a: PostMeta, b: PostMeta): number {
  if (a.published !== b.published) return a.published < b.published ? 1 : -1;
  return a.slug < b.slug ? 1 : -1;
}

/**
 * The directory, resolved the way app/og.png/route.tsx resolves its stylesheet.
 *
 * `process.cwd()` AND NOT `import.meta.url`, and the route one directory over
 * states the reason in three lines: cwd is the project root under `next build`
 * and `/app` inside the standalone image, while `import.meta.url` points at
 * whatever `.next/server/` chunk the module was bundled into. The same idiom,
 * because the same trap.
 */
export const POSTS_DIR = join(process.cwd(), "content", "posts");

/**
 * Every readable post in a directory, newest first, and the files that were not.
 *
 * WHY A DIRECTORY AND NOT A LIST OF IMPORTS. There is no index file to forget to
 * update: a post is a file, and adding one is adding it. The cost is that this
 * touches the filesystem, and `output: "standalone"` copies what the MODULE
 * GRAPH reaches — a `readFileSync` is not an import. next.config.ts declares the
 * directory under `outputFileTracingIncludes` for exactly that reason, and the
 * comment there is the one that explains it.
 */
export function readPosts(dir: string, read: DirReader = nodeReader): PostRead {
  const files = read.list(dir).filter((file) => file.endsWith(".mdx")).sort();

  const posts: PostMeta[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const meta = postMeta(file, read.text(dir, file));
    if (meta === null) {
      skipped.push(file);
      // A skipped file is a file somebody wrote and nobody sees. It is a WARN
      // rather than a throw because one unusable post must not take the homepage
      // down with it, and it is not silence because that is how it would stay
      // unusable.
      log("WARN", "post skipped", { file });
      continue;
    }
    posts.push(meta);
  }

  return { posts: posts.sort(byNewest), skipped };
}

/**
 * The two filesystem calls, behind a seam.
 *
 * NOT FOR MOCKING THE HAPPY PATH — posts.test.ts reads the real fourteen files,
 * because a reader held only against fixtures is a reader that agrees with its
 * author. It is here for the cases the repository does not contain and must not
 * be made to contain: an empty directory, and a directory that cannot be read.
 */
export interface DirReader {
  list(dir: string): string[];
  text(dir: string, file: string): string;
}

const nodeReader: DirReader = {
  list: (dir) => readdirSync(dir),
  text: (dir, file) => readFileSync(join(dir, file), "utf8"),
};

/**
 * The read a page makes, with the one failure it can have folded into `null`.
 *
 * IT LIVES HERE BECAUSE TWO PAGES MAKE IT. `homePosts` was this function under
 * another name while SYS.04 was the only caller; H6 gave `/work` a per-system
 * entry count, and a second copy of a five-line `try` is how two copies of one
 * judgement start disagreeing — the `finiteNumber` mistake H4 made and wrote
 * down. `lib/home/posts.ts` now delegates and keeps only what is about a
 * SECTION: how many rows it draws and what its head says.
 *
 * THE `catch` IS NOT DECORATION. It is the difference between "the log is
 * empty" and "the log could not be read": a directory missing from the image
 * reports itself instead of claiming nobody has written anything. That is the
 * failure `outputFileTracingIncludes` exists to prevent, and this is what a
 * page looks like if it ever happens.
 */
export function postsOrNull(): PostRead | null {
  try {
    return readPosts(POSTS_DIR);
  } catch {
    return null;
  }
}

/**
 * `010` out of `010-a-slug` — the entry number the post's eyebrow prints.
 *
 * IT IS READ OFF THE SLUG AND NOT COUNTED, which is the sheet's own rule for
 * this block: "ENTRY 010 — fortlaufend, nie neu vergeben, auch wenn ein Eintrag
 * verschwindet." A position in the array would renumber every older entry the
 * day one is withdrawn, and the number is the one thing about an entry that is
 * supposed to survive that.
 *
 * IT IS ALREADY VALIDATED. `SLUG` refuses a filename without three leading
 * digits, so a `PostMeta` that exists has them; the fallback is unreachable and
 * is a substring rather than a guess.
 */
export function entryNumber(post: PostMeta): string {
  return post.slug.slice(0, 3);
}

/**
 * The route one entry answers to, language-free. `localeHref` adds the prefix.
 *
 * THE SLUG IS THE FILENAME AND THE FILENAME IS `incidents.post_slug`, which is
 * the whole reason this is one line and not a mapping. ADR 0002 put the blog in
 * the repository so that a notch in the operation grid could point at a file; H9c
 * is where that pointer becomes an `<a href>`, and it will build it out of this.
 */
export function postPath(post: PostMeta): string {
  return `/blog/${post.slug}`;
}

/**
 * Every entry route, newest first.
 *
 * IT RETURNS `[]` RATHER THAN THROWING when the directory cannot be read, and
 * that is the same decision `postsOrNull` makes one function up. lib/seo/pages.ts
 * builds its table out of this at module scope: a throw there would take down
 * every page on the site because the log could not be listed, which is a worse
 * answer than a sitemap that is briefly short of twenty-one URLs. The route
 * itself is prerendered, so in a built image this cannot be the first thing that
 * goes wrong — it can only be the second.
 */
export function postPaths(): readonly string[] {
  return (postsOrNull()?.posts ?? []).map(postPath);
}

/**
 * The raw text of one entry's file, or nothing.
 *
 * WHY THE PAGE NEEDS THE SOURCE AND NOT ONLY THE META. Two of the things the
 * post draws are properties of the BODY rather than of the frontmatter: the word
 * count and the contents rail. Neither is in `PostMeta`, and putting them there
 * would make the homepage and the Work Index — which draw neither — pay for
 * both on every read.
 *
 * IT IS THE SECOND TIME THIS FILE IS OPENED during one page build, and that is
 * accepted rather than optimised away. Twenty-one entries, prerendered once, two
 * small reads each; a cache here would be a lifetime to reason about in exchange
 * for microseconds in a build step.
 *
 * THE SLUG IS CHECKED AGAINST `SLUG` BEFORE IT BECOMES A PATH. It arrives from a
 * URL segment, and `join(dir, "../../etc/passwd")` is a path this function must
 * never construct — the pattern is anchored, forbids dots and slashes, and is
 * the same one the incidents constraint uses. CLAUDE.md: "Keine URL aus
 * Nutzereingabe in ausgehende Requests"; a filesystem read is the same rule with
 * a different destination.
 */
export function postSource(slug: string, read: DirReader = nodeReader): string | null {
  const file = `${slug}.mdx`;
  if (!SLUG.test(file)) return null;
  try {
    return read.text(POSTS_DIR, file);
  } catch {
    return null;
  }
}

/**
 * The entry for a slug, or nothing — the gate in front of `/blog/[slug]`.
 *
 * THE SAME SHAPE AS `caseStudyFor`, AND FOR THE SAME TWO REASONS. An unknown
 * segment is `notFound()` before anything else runs, and lib/http/url.ts proving
 * a segment is safe to put in a URL is a different question from this one:
 * whether the page was meant to exist. `SLUG` already refuses anything the
 * incidents constraint would refuse, so a segment that reaches here and matches
 * is a file somebody wrote.
 */
export function postFor(slug: string): PostMeta | null {
  return postsOrNull()?.posts.find((post) => post.slug === slug) ?? null;
}
