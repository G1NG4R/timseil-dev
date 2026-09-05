import type { Messages } from "@/lib/i18n/messages/en";

/**
 * The one thing this page asks of a reader.
 *
 * IT IS BUILT IN THIS PHASE BECAUSE THE FEED IS FILLED IN THIS PHASE. H9a left
 * `/feed.xml` a valid, discoverable, EMPTY channel, and lib/seo/feed.ts gave the
 * reason: `/blog/<slug>` did not exist, so every item would have been a link to
 * a 404. That reason expired with H9a's own merge. Drawing this block over an
 * empty channel would have been the same defect one layer out — a control that
 * promises something the machine behind it does not deliver, which is what
 * `LogRow`, `IncidentLog` and the feed itself have each refused in turn.
 *
 * THE SHEET'S SENTENCE IS CORRECTED, AND THE CORRECTION IS THE POINT OF THIS
 * NOTE. The artboard writes "served by the same API as everything else". It is
 * not: `app/feed.xml/route.ts` is a route handler in the web container, and the
 * api serves no part of this page. A sentence that names the wrong machine is a
 * claim without a system behind it, and this site's one rule is that a claim is
 * bound to a running system.
 *
 * NO FORM AND NO FIELD. "Kein Newsletter, nur RSS — passt zur Positionierung und
 * braucht kein Tracking" is the sheet's own design note, and it means this block
 * has exactly one control.
 */
export function BlogSubscribe({ feedHref, messages }: { feedHref: string; messages: Messages }) {
  return (
    <section className="blog-subscribe" aria-labelledby="blog-subscribe">
      <h2 className="blog-subscribe-head" id="blog-subscribe">
        {messages.blogSubscribeHead}
      </h2>
      <p className="blog-subscribe-body">{messages.blogSubscribeBody}</p>
      {/* A plain anchor, and `btn` rather than a `<button>`: it navigates, and
          the sheet draws it as the bordered control components/ui/Button.tsx
          already styles. A button element here would be a control that has to
          be given a destination by script. */}
      <a className="btn" data-variant="ghost" href={feedHref}>
        {feedHref.toUpperCase()} ↗
      </a>
    </section>
  );
}
