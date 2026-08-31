// The one region of the homepage that waits for the api, and the only place
// this page calls it.
//
// THIS IS THE F1B ISLAND, MOVED RATHER THAN DELETED. Since F1b the homepage has
// carried the only call on this site that goes upstream with a visitor's own
// request id and a child span on it, and that phase's acceptance reads it: one
// request to `/` has to leave a line in this container and a line in the api's,
// joined by one trace id. The footer's numbers cannot stand in — they come from
// a shared `use cache` answer that by construction carries nobody's request id.
//
// It used to be a `<dl>` under a heading that said "Development shell". H3
// replaced the content of that page, and the island had to land somewhere a
// reader can see. The terminal frame is where it belongs rather than where it
// fits: "simulierte Oberfläche, echte Daten" is the build plan's own definition
// of what stage J builds here, and a placeholder that reports a real health
// check is that definition at one line instead of nine commands.
//
// SEPARATE FROM THE COMPONENT IT RENDERS, for ADR 0044's reason: the fallback
// is the SAME component with the same props in its resting state, so "no answer
// yet" and "no answer at all" cannot drift into two layouts — and the gallery
// can draw the frame with no api at all.

import { TerminalPanel } from "@/components/home/TerminalPanel";
import { healthLive } from "@/lib/api/readers";
import type { Messages } from "@/lib/i18n/messages/en";
import { systemWord } from "@/lib/state/derive";

export async function TerminalPanelLive({ messages }: { messages: Messages }) {
  const body = await healthLive();

  return (
    <TerminalPanel status={body === null ? null : systemWord(body.status)} messages={messages} />
  );
}
