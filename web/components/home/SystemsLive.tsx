import { Systems } from "@/components/home/Systems";
import { systemsNow } from "@/lib/api/readers";
import type { Messages } from "@/lib/i18n/messages/en";
import { DOWN, readOk } from "@/lib/state/read";

/**
 * The third region of the homepage that waits for the api.
 *
 * SEPARATE FROM THE COMPONENT IT RENDERS, for ADR 0044's reason and the one
 * components/home/Training.tsx states: the Suspense fallback is the same
 * component, so the waiting page and the answered page cannot drift into two
 * layouts — and the gallery can draw the list with no api at all, which is the
 * only place the rig can see it.
 *
 * AND IT IS WHERE `null` BECOMES `DOWN` since U7, for the reason
 * components/home/Training.tsx gives at length: only this layer knows whether
 * nobody has asked yet or `/api/systems` did not answer.
 */
export async function SystemsLive({
  exit,
  messages,
}: {
  exit: { href: string; label: string } | null;
  messages: Messages;
}) {
  const body = await systemsNow();
  return <Systems read={body === null ? DOWN : readOk(body)} exit={exit} messages={messages} />;
}
