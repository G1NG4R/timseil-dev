import { ContributionGraph } from "@/components/home/ContributionGraph";
import { contributionsNow } from "@/lib/api/readers";
import type { Messages } from "@/lib/i18n/messages/en";
import { DOWN, readOk } from "@/lib/state/read";

/**
 * The fourth region of the homepage that waits for the api.
 *
 * SEPARATE FROM THE COMPONENT IT RENDERS, for ADR 0044's reason and the one
 * components/home/SystemsLive.tsx states: the Suspense fallback is the same
 * component, so the waiting page and the answered page cannot drift into two
 * layouts — and the gallery can draw the calendar with no api at all, which is
 * the only place the rig can see it.
 *
 * AND IT IS WHERE `null` BECOMES `DOWN` since U7. The sentence this saves the
 * reader is the sharpest of the four: `homeUplinkGraphDown` says there has never
 * been an answer to keep, which is a claim about the endpoint's whole history.
 *
 * ITS OWN BOUNDARY, NOT SYS.03's. The strip beside it reads a different endpoint
 * with a different freshness, and `homeSys03Why` has said since G6 that NEITHER
 * block is drawn before ITS source has answered. One boundary around both would
 * make the operation strip wait for GitHub.
 */
export async function ContributionGraphLive({ messages }: { messages: Messages }) {
  const body = await contributionsNow();
  return <ContributionGraph read={body === null ? DOWN : readOk(body)} messages={messages} />;
}
