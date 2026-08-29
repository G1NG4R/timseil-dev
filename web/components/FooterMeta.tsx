// A Server Component. It hosts two client leaves — the theme switch and a clock
// — and one streamed island, and is otherwise static text.

import { Suspense } from "react";

import { Clock } from "@/components/Clock";
import { NoData } from "@/components/state/NoData";
import { StatusDot } from "@/components/state/StatusDot";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { NO_HEALTH, buildText, uptimeText, type FooterHealth } from "@/lib/api/health";
import { footerHealthNow } from "@/lib/api/readers";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Messages } from "@/lib/i18n/messages";
import { LOCALES, LOCALE_NAMES, localeHref } from "@/lib/i18n/routes";
import { stateLabel } from "@/lib/state/words";

/**
 * The meta bar. Byte-identical on all ten pages, in both footer variants — the
 * sheet's short version is this and nothing else.
 *
 * G4 FILLED THE SEAM G3 LEFT. The sheet draws `BUILD v3.2.1`, a live `ONLINE`
 * and `UPTIME 99.98%`; none of the three was measured, so all three read
 * `— NO DATA` and the props defaulted to null. They are now read from
 * /api/health — and the defaults stay exactly where they were, because "no data"
 * must remain the state you get by not saying anything.
 *
 * `BASED IN LUXEMBOURG · PRIVACY · IMPRINT` is in every meta bar (K-07), which
 * is why the short footer still carries it — and why an unplanned route gets
 * the short footer rather than none.
 *
 * G5 TURNED THE `ALT` CELL FROM A CLAIM INTO A LINK. It printed `/de` and `/fr`
 * as text while neither existed. They are anchors now, and they are the reason
 * the two other languages are reachable WITHOUT JavaScript and by a crawler
 * that never opens a dropdown — the sheet asks for exactly that: "Die Fußzeile
 * nennt die Alternativen als Links, damit sie auch ohne Panel auffindbar sind."
 * The visible text and the href are the same string, so the cell cannot say one
 * address and lead to another.
 */
export async function FooterMeta() {
  const { locale, messages } = await getDictionary();

  return (
    <div className="foot-meta">
      <div className="foot-meta-main">
        {/*
          The three measured cells stream; everything around them is in the
          prerendered shell. <Suspense> adds no element, so the row keeps the
          children the sheet draws, in the order it draws them.

          The fallback is not a loading state. It is the resting state of this
          bar — the same `— NO DATA` a visitor sees when the api cannot answer —
          which is why streaming costs nothing in this design language and why
          there is no spinner to design.
        */}
        <Suspense fallback={<MetaCells {...NO_HEALTH} messages={messages} />}>
          <MetaCellsLive messages={messages} />
        </Suspense>

        <span className="foot-cell">{messages.cvHint}</span>
        <ThemeSwitch label={messages.themeLabel} aria={messages.themeAria} />
        <span className="foot-cell">
          {/* No separator between the label and the links: .foot-cell is a flex
              row with `gap: 7px`, so the spacing is the stylesheet's and a
              literal space would only add a stray text node. */}
          {messages.altLabel}
          {LOCALES.filter((code) => code !== locale).map((code) => (
            <a key={code} href={localeHref(code, "/")} hrefLang={code} title={LOCALE_NAMES[code]}>
              {localeHref(code, "/")}
            </a>
          ))}
        </span>
      </div>

      <div className="foot-meta-side">
        <span className="foot-cell nums">49.6117° N · 6.1300° E</span>
        <Clock />
      </div>

      <div className="foot-legal">
        <span>{messages.based}</span>
        <a href={localeHref(locale, "/privacy")}>{messages.privacy}</a>
        <a href={localeHref(locale, "/imprint")}>{messages.imprint}</a>
      </div>
    </div>
  );
}

/**
 * The three cells, given three values. Decides nothing, fetches nothing.
 *
 * This is the seam ADR 0044 described, unchanged: it renders `— NO DATA` for a
 * null and a number for a number, and it is the same component in the fallback
 * and in the filled state, so the two cannot drift apart.
 */
function MetaCells({ build, uptime, status, messages }: FooterHealth & { messages: Messages }) {
  return (
    <>
      {/* `BUILD` and `ONLINE` are not translated. The sheet names the set:
          "UNVERÄNDERT ENGLISCH: SYS.INIT · ONLINE · BUILD · Go · Docker —
          Identifier und Werkzeugnamen." `UPTIME` is a heading over a number and
          is prose, so it comes from the dictionary — and since G6 so does
          DEGRADED, which is not in that set and which STATE.05 says explicitly
          is translated ("die Anzeige heißt auf Deutsch GEPLANT"). Hence
          stateLabel() below rather than a literal: one of the two words the
          cell can show moves with the language and the other does not. */}
      <span className="foot-cell">BUILD {buildText(build)}</span>
      <span className="foot-cell">
        {/* THE DOT IS G6's, AND UNTIL G6 IT WAS GREY AND SAID NOTHING.
            chrome.css carried the reason since G3 — "that the web container is
            up says nothing about the api, and invariant 1 does not make an
            exception for a dot" — and G4 gave it an answer to report. Now the
            answer has three values instead of two: ONLINE, DEGRADED, or the
            resting `— NO DATA` when the api did not reply at all. */}
        {status === null ? (
          <NoData />
        ) : (
          <StatusDot state={status} label={stateLabel(status, messages)} />
        )}
      </span>
      <span className="foot-cell">
        {messages.uptime} {uptimeText(uptime)}
      </span>
    </>
  );
}

/** The same three cells, with the answer the api gave. */
async function MetaCellsLive({ messages }: { messages: Messages }) {
  return <MetaCells {...await footerHealthNow()} messages={messages} />;
}
