import type { Messages } from "@/lib/i18n/messages";

/**
 * The panel under the title. The sheet calls it mandatory and says what it is
 * for: "Zwei bis drei Sätze unter dem Titel: was passiert ist und was der Leser
 * mitnimmt. Wer sie nicht schreiben kann, hat den Eintrag nicht verstanden."
 *
 * IT IS ALSO THE ONE PARAGRAPH THAT LEAVES THIS SITE. lib/seo/feed.ts hands the
 * `<description>` of a feed item to a reader who may never load the page, so
 * this text is read in two places and written once.
 *
 * ONE ALERT-COLOURED ELEMENT ON THIS PAGE AND IT IS NOT THIS ONE. The sheet
 * gives the summary a cyan left border and reserves red for the POSTMORTEM box —
 * "Rot erscheint auf der ganzen Seite nur dort". No entry carries a postmortem
 * box today, so today the page has no red at all, which is the correct number.
 */
export function PostSummary({ summary, messages }: { summary: string; messages: Messages }) {
  return (
    <section className="post-summary" aria-labelledby="post-summary-label">
      <p className="post-rail-label" id="post-summary-label">
        {messages.blogSummary}
      </p>
      {/* The block scalar keeps its line breaks, and they are the author's
          wrapping rather than paragraphs. Rendering them as written would put
          hard breaks mid-sentence at 390; the text is one paragraph and is
          re-wrapped by the browser. */}
      <p>{summary.replaceAll("\n", " ")}</p>
    </section>
  );
}
