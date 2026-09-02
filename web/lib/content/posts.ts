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
// IT DOES NOT DECIDE THE SCHEMA. #192 says the frontmatter of the first post was
// read off a design sheet and that H9 decides what it means when it builds the
// renderer. This reads three of the six keys and leaves that open: `tags`,
// `system` and `summary` are stepped over, not modelled.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { log } from "../log.ts";

/** What the homepage draws for one entry. Three keys of six, plus the slug. */
export interface PostMeta {
  /** The filename without `.mdx` — the same string incidents.post_slug holds. */
  readonly slug: string;
  readonly title: string;
  /** The one-line dek. NOT `summary`, which is a paragraph for a feed. */
  readonly deck: string;
  /** `YYYY-MM-DD`, kept as text: nothing here does arithmetic on a date. */
  readonly published: string;
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

/**
 * The scalar keys of a frontmatter block, or `null` when there is not one.
 *
 * `null` FOR THREE DIFFERENT FILES, and they are one answer on purpose: a file
 * with no leading `---`, a file whose block is never closed, and a file whose
 * block holds no key are all files this reader cannot draw a row from. The
 * caller reports the name; which of the three it was is not information the
 * homepage can act on.
 *
 * A BLOCK SCALAR IS STEPPED OVER, NOT READ. `summary: |` opens a paragraph whose
 * lines are indented, and one of those lines beginning `title:` after six spaces
 * is prose, not a key. Anchoring PAIR at the start of the line is most of that;
 * consuming the indented run is the rest. Without both, the last `key:`-looking
 * sentence inside a summary would win over the real key above it.
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
    // Indented lines belong to whatever opened above them. Nothing this reader
    // models is indented, so they are the block scalar's body or a nested map,
    // and either way they are not a key of ours.
    if (/^[ \t]/.test(line)) continue;

    const match = PAIR.exec(line);
    if (match === null) continue;

    const [, key, value = ""] = match;
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
  const deck = unquote(keys.get("deck") ?? "");
  const published = unquote(keys.get("published") ?? "");

  if (title === "" || deck === "") return null;
  if (!isDate(published)) return null;

  return { slug: name[1], title, deck, published };
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
