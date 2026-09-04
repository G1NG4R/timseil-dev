// What an MDX element becomes on this site, and the two blocks that need a frame
// around them rather than a style.
//
// REQUIRED BY @next/mdx IN THE APP ROUTER — "will not work without it"
// (node_modules/next/dist/docs/01-app/02-guides/mdx.md). It is not optional
// configuration; it is the file the loader looks for.
//
// ALMOST EVERYTHING IS ABSENT FROM THIS FILE ON PURPOSE. Paragraphs, headings,
// lists, blockquotes, links and inline code are plain HTML elements, and
// styles/blog.css styles them from inside `.post-body`. An override that only
// added a class name would be a component with no behaviour, compiled into the
// graph, standing between the markdown and the stylesheet. `rehype-slug` already
// gives every heading its id, so even the CONTENTS rail needs nothing here.
//
// THE TWO THAT DO EARN A COMPONENT ARE THE TWO THAT SCROLL. A code block and a
// table are wider than the measure by nature, and WCAG 2.1 asks that a region
// which scrolls can be reached from the keyboard — axe reports it as
// `scrollable-region-focusable`, and e2e/a11y.spec.ts runs over this route at
// seven widths. `tabIndex={0}` is the whole fix, and it cannot be written in
// markdown.
//
// THE GUTTER IS RENDERED, NOT COUNTED IN CSS. A CSS counter cannot number the
// lines of a `<pre>`: the text is one node, and `::before` fires once. The sheet
// draws the numbers in their own 44px column, so the lines are split here, on the
// server, and the column is `aria-hidden` — a screen reader that read "zero one,
// zero two" before every line would be reading the frame instead of the code.
//
// NO TOKENIZER. The sheet asks for two tones; ADR 0070 records why this ships
// none. What is built is the frame the sheet draws around the tones: the head bar
// with the language, the numbered gutter, and the scroll.

import type { MDXComponents } from "mdx/types";
import { isValidElement, type ComponentPropsWithoutRef, type ReactNode } from "react";

/** The `language-xxx` class `remark`/`rehype` put on a fenced block's `<code>`.
 *  42 of the 79 blocks in content/posts carry no language at all — terminal
 *  output, mostly — and those get no head bar rather than a bar reading `TEXT`. */
function languageOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const found = /(?:^|\s)language-([A-Za-z0-9+#-]+)(?:\s|$)/.exec(value);
  return found?.[1] ?? null;
}

/** What a fenced block's `<code>` child carries, as far as this file is willing
 *  to assume. Both are `unknown` rather than `string`: the element comes from a
 *  compiler, not from a call site, and narrowing is cheaper than trusting. */
interface FenceProps {
  readonly className?: unknown;
  readonly children?: unknown;
}

/** A `<pre>`'s single `<code>` child, read without asserting a shape onto it.
 *  Anything else — and MDX does not currently produce anything else — falls back
 *  to `null`, which renders the block unframed instead of throwing. */
function fence(children: ReactNode): { language: string | null; source: string } | null {
  if (!isValidElement<FenceProps>(children)) return null;
  const { className, children: source } = children.props;
  if (typeof source !== "string") return null;
  return { language: languageOf(className), source };
}

/** `01`, `02`, … — the sheet's own form, and two digits are enough: the longest
 *  block in the corpus is 14 lines. */
function gutter(source: string): readonly string[] {
  // A fence's text ends with the newline before its closing ```. Splitting on it
  // would number an empty line that nobody wrote.
  const body = source.endsWith("\n") ? source.slice(0, -1) : source;
  return body.split("\n").map((_, i) => String(i + 1).padStart(2, "0"));
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,

    pre: ({ children, ...rest }: ComponentPropsWithoutRef<"pre">) => {
      const block = fence(children);
      if (block === null) {
        return (
          <pre className="post-pre" tabIndex={0} {...rest}>
            {children}
          </pre>
        );
      }
      return (
        <figure className="post-code">
          {block.language === null ? null : (
            <figcaption className="post-code-head">{block.language}</figcaption>
          )}
          <div className="post-code-body">
            <span className="post-code-gutter" aria-hidden="true">
              {gutter(block.source).map((n) => (
                <span key={n}>{n}</span>
              ))}
            </span>
            <pre className="post-pre" tabIndex={0} {...rest}>
              {children}
            </pre>
          </div>
        </figure>
      );
    },

    table: ({ children, ...rest }: ComponentPropsWithoutRef<"table">) => (
      <div className="post-table" tabIndex={0}>
        <table {...rest}>{children}</table>
      </div>
    ),
  };
}
