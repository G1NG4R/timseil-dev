import { TrainingLog } from "@/components/home/TrainingLog";
import { trainingNow } from "@/lib/api/readers";
import type { Messages } from "@/lib/i18n/messages/en";

/**
 * The second region of the homepage that waits for the api.
 *
 * SEPARATE FROM THE COMPONENT IT RENDERS, for the reason components/home/Live.tsx
 * gives about the terminal row and ADR 0044 gives generally: the Suspense
 * fallback is the SAME component with the same props in its resting state, so
 * the waiting page and the answered page cannot drift into two layouts — and
 * the gallery can draw the log with no api at all.
 *
 * IT TAKES THE CACHED DOOR, not the correlated one. Nothing in the training log
 * depends on who is asking; `healthLive` one region up is what keeps the
 * web to api hop findable with a visitor's own ids on it. lib/api/readers.ts
 * carries the rule and the reason it cannot be both.
 */
export async function TrainingLive({ messages }: { messages: Messages }) {
  return <TrainingLog body={await trainingNow()} messages={messages} />;
}
