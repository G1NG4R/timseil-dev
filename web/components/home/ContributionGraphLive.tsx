import { ContributionGraph } from "@/components/home/ContributionGraph";
import { contributionsNow } from "@/lib/api/readers";
import type { Messages } from "@/lib/i18n/messages/en";

/**
 * The fourth region of the homepage that waits for the api.
 *
 * SEPARATE FROM THE COMPONENT IT RENDERS, for ADR 0044's reason and the one
 * components/home/SystemsLive.tsx states: the Suspense fallback is the same
 * component with the same props in its resting state, so the waiting page and
 * the answered page cannot drift into two layouts — and the gallery can draw the
 * calendar with no api at all, which is the only place the rig can see it.
 *
 * ITS OWN BOUNDARY, NOT SYS.03's. The strip beside it reads a different endpoint
 * with a different freshness, and `homeSys03Why` has said since G6 that NEITHER
 * block is drawn before ITS source has answered. One boundary around both would
 * make the operation strip wait for GitHub.
 */
export async function ContributionGraphLive({ messages }: { messages: Messages }) {
  return <ContributionGraph body={await contributionsNow()} messages={messages} />;
}
