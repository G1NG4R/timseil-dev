import { OpsStrip } from "@/components/home/OpsStrip";
import { systemNow } from "@/lib/api/readers";
import { OPS_WINDOW_HOME } from "@/lib/api/systems";
import type { Messages } from "@/lib/i18n/messages/en";
import { SITE_SYSTEM_SLUG } from "@/lib/site";

/**
 * The fifth region of the homepage that waits for the api, and the first to name
 * a window out loud.
 *
 * `OPS_WINDOW_HOME` IS HALF OF A CACHE KEY. components/case/Live.tsx asks the
 * same endpoint about the same system with `OPS_WINDOW_CASE`, and the two are
 * separate entries only because both say which window they mean —
 * lib/api/readers.ts carries the argument at the function that would otherwise
 * serve one page's answer to the other.
 */
export async function OpsStripLive({ messages }: { messages: Messages }) {
  return <OpsStrip body={await systemNow(SITE_SYSTEM_SLUG, OPS_WINDOW_HOME)} messages={messages} />;
}
