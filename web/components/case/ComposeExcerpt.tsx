import excerpt from "@/content/generated/compose-api.gen.json";
import { composeLines } from "@/lib/content/compose";

/**
 * The startup order, quoted out of the file the host runs.
 *
 * NOBODY TYPED THIS BLOCK, and that is the only reason it is allowed on the
 * page. Build plan D2 asked `compose.yaml` to match the excerpt drawn on the
 * Case Study Template verbatim; issue #75 measured that requirement and found
 * the sheet contradicts the shipped file in five places, one of which — a
 * `wget` health probe against a distroless image with no shell — cannot work at
 * all. So the direction inverted: the file is the source and the page quotes it.
 * `make gen` writes the JSON and `make check-contract` compares its checksum
 * either side of a run, which makes a compose change the page has not followed a
 * red build rather than a page that quietly lies.
 *
 * TWO TONES, AND THE THIRD IS DEAD. The sheet says "keys in Signal, values in
 * Amber, comments in Steel"; the generator drops comments before writing, so
 * lib/content/compose.ts carries no comment branch and neither does this. The
 * split itself lives there rather than here because a judgement about text needs
 * a test, and `node --test` cannot load a .tsx.
 *
 * A `<pre>` AND NOT A GRID OF SPANS: it is preformatted text, it must be
 * selectable and copyable as the file it came from, and `white-space` is what
 * keeps the indentation meaning what it means.
 *
 * IT WRAPS RATHER THAN SCROLLS, and that was decided by looking at it. The
 * image line carries the `${IMAGE_TAG:?…}` failure message the compose file
 * really contains — about a hundred and ten characters — and in a 680px column
 * a horizontal scrollbar hid the end of the single most important line in the
 * block. `pre-wrap` keeps every space of the indentation and shows all of it;
 * `.spec-val` already breaks a long source URL the same way and for the same
 * reason. A block that cannot scroll then needs no tab stop, so it has none.
 */
export function ComposeExcerpt({ caption }: { caption: string }) {
  return (
    <div>
      <pre className="compose">
        <code>
          {composeLines(excerpt.lines).map((line, index) => (
            // The array is generated, fixed-length and never reordered; its
            // index is the line number, which is the only stable identity a
            // line of YAML has — two `depends_on` entries can be the same text.
            <span className="compose-line" key={index}>
              {line.indent}
              {line.key === null ? null : <span className="compose-key">{line.key}</span>}
              {line.value === "" ? null : <span className="compose-val">{line.value}</span>}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
      <p className="compose-caption">{caption}</p>
    </div>
  );
}
