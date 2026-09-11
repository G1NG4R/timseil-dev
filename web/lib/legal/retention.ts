// The two numbers the privacy page says about the contact form, and the one
// place on this side of the repository that holds them.
//
// WHY THEY ARE HERE TWICE AT ALL. ADR 0075 wrote the retention loop in H12a and
// named the cost in the same breath: "Die Zahl steht ab H12b an zwei Orten: als
// Konstante in Go und als Wort im englischen Text." The alternative was a field
// in the public contract that only a legal page would ever read, and that was
// refused on purpose. So the duplication is deliberate, and what this file adds
// is the thing the ADR said was missing — something holding the two together.
//
// THAT SOMETHING IS retention.test.ts, NOT A NEW make TARGET. It reads
// api/internal/contact/policy.go and fails if either number stops agreeing with
// it, which puts the check inside `npm test` -> `make check-web` -> `make
// check` without adding a rule to a list of twenty-two. CLAUDE.md asks for an
// incident before a new check script exists, and this one has not happened yet.
// The precedent for a test reading out of the tree is lib/seo/pages.test.ts.
//
// THE OTHER DIRECTION IS A COMMENT, and it is in policy.go beside each constant:
// whoever changes the Go value is told, in the file they are editing, which
// sentence on which page goes stale with it.

/**
 * How long a settled contact message stays in `contact_messages` before the
 * purge loop deletes it.
 *
 * MIRRORS `retentionWindow` IN api/internal/contact/policy.go. Not a policy
 * decision taken here — the derivation is ADR 0075's, and it is worth reading
 * before this number is changed: three purposes, none of which outlives a
 * month.
 */
export const RETENTION_DAYS = 30;

/**
 * How far back the contact form's rate limit looks, and therefore how long the
 * hashed address of a sender is of any use.
 *
 * MIRRORS `RateLimitWindow` IN api/internal/contact/policy.go, which is
 * exported because the handler and the limiter both need it. The page says ten
 * minutes about an IP hash, and this is the only reason that sentence is true.
 */
export const RATE_LIMIT_MINUTES = 10;

/**
 * The retention promise as the page says it, built from the number rather than
 * typed beside it.
 *
 * A SENTENCE AND NOT A TEMPLATE STRING AT THE CALL SITE, because content.ts is
 * checked by a test that reads every duration out of the prose and demands a
 * file that enforces it. A hand-typed "thirty days" would pass that test by
 * being invisible to it — spelled-out numbers are exactly what the regex cannot
 * see — and then drift the next time Go changes. So the digits are the only
 * form this promise takes anywhere on the page.
 */
export function retentionSentence(): string {
  return `It is deleted ${String(RETENTION_DAYS)} days after the exchange is settled, by a loop that runs every hour.`;
}
