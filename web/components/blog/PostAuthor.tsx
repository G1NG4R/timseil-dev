import { AUTHOR } from "@/lib/site";
import type { Messages } from "@/lib/i18n/messages";

/**
 * The line at the foot of an entry: who wrote it and how to argue with them.
 *
 * "STEHT AM FUSS, NICHT AM KOPF", which is the sheet's rule and also the honest
 * order — the entry is the argument and the byline is the footnote to it.
 *
 * THE PORTRAIT IS A VISIBLY EMPTY SLOT, not a missing element and not a stock
 * silhouette. There is no photograph in this repository; the build plan's K2
 * asks for exactly this in the meantime — "Portrait oder sichtbar leerer Slot" —
 * and the sheet draws the slot dashed. An `<img>` with no src would be a broken
 * image, and leaving the box out would quietly change the layout the day one
 * arrives.
 *
 * `aria-hidden` ON THE SLOT, because an empty frame is not information. What a
 * screen reader gets is the name, the role and the way to reply.
 *
 * NO COMMENT SYSTEM. "Fußnote, Autorenzeile, Serien-Navigation, kein
 * Kommentarsystem — Antwort per Mail." The address is the same one the contact
 * page falls back to for a visitor with no JavaScript.
 */
export function PostAuthor({ messages }: { messages: Messages }) {
  return (
    <aside className="post-author">
      <span className="post-portrait" aria-hidden="true" />
      <div>
        <p className="post-author-name">
          {AUTHOR.name} — {AUTHOR.jobTitle}
        </p>
        <p className="post-author-bio">{messages.homeTagline}</p>
      </div>
      <a className="btn" data-variant="ghost" href={`mailto:${AUTHOR.email}`}>
        {messages.blogReply}
      </a>
    </aside>
  );
}
