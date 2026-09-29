import { TrainingLog } from "@/components/home/TrainingLog";
import { trainingNow } from "@/lib/api/readers";
import type { Messages } from "@/lib/i18n/messages/en";
import { DOWN, readOk } from "@/lib/state/read";

/**
 * The second region of the homepage that waits for the api.
 *
 * SEPARATE FROM THE COMPONENT IT RENDERS, for the reason components/home/Live.tsx
 * gives about the terminal row and ADR 0044 gives generally: the Suspense
 * fallback is the SAME component, so the waiting page and the answered page
 * cannot drift into two layouts — and the gallery can draw the log with no api
 * at all.
 *
 * WHAT THIS LAYER DECIDES SINCE U7 IS ONE WORD. `trainingNow` answers `null` for
 * a read that failed, and `null` is also what the fallback had to pass, so the
 * section said "/api/training did not answer" while the answer was in flight.
 * This is the layer that knows which of the two happened, so this is where the
 * `null` becomes `DOWN`.
 *
 * IT TAKES THE CACHED DOOR, not the correlated one. Nothing in the training log
 * depends on who is asking; `healthLive` one region up is what keeps the
 * web to api hop findable with a visitor's own ids on it. lib/api/readers.ts
 * carries the rule and the reason it cannot be both.
 */
export async function TrainingLive({ messages }: { messages: Messages }) {
  const body = await trainingNow();
  return <TrainingLog read={body === null ? DOWN : readOk(body)} messages={messages} />;
}
