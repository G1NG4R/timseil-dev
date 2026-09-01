import { Systems } from "@/components/home/Systems";
import { systemsNow } from "@/lib/api/readers";
import type { Messages } from "@/lib/i18n/messages/en";

/**
 * The third region of the homepage that waits for the api.
 *
 * SEPARATE FROM THE COMPONENT IT RENDERS, for ADR 0044's reason and the one
 * components/home/Training.tsx states: the Suspense fallback is the same
 * component with the same props in its resting state, so the waiting page and
 * the answered page cannot drift into two layouts — and the gallery can draw the
 * list with no api at all, which is the only place the rig can see it.
 */
export async function SystemsLive({
  exit,
  messages,
}: {
  exit: { href: string; label: string } | null;
  messages: Messages;
}) {
  return <Systems body={await systemsNow()} exit={exit} messages={messages} />;
}
