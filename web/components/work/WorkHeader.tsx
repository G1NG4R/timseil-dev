import { NoData } from "@/components/state/NoData";
import { padTwo } from "@/lib/api/values";
import type { Messages } from "@/lib/i18n/messages/en";
import { stateLabel } from "@/lib/state/words";
import type { StatusCounts } from "@/lib/work/counts";

/**
 * The head of `/work`: what the page is, and four numbers about it.
 *
 * `<h1>` AT BOTH WIDTHS. The 1440 artboard writes `<h1>` and the 390 artboard
 * writes `<h2>` for the same words on the same page — a canvas artefact, not a
 * decision, and shipping it would give the phone a document with no level-one
 * heading. K-08 settles the SIZE the other way round and is followed: "Zwei
 * Stufen: 62 für Startseite und About, 52 sonst, mobil 34", which is what the
 * sheet draws and what layout.css already switches at 720.
 *
 * `null` COUNTS ARE NOT ZERO COUNTS, and this page shipped the difference wrong
 * once before anybody opened it: with no api the tiles read `00 SYSTEMS` while
 * the counter under them read `— NO DATA`, which is two claims about one answer
 * with the tiles doing the lying. `00` is a measurement — the api answered and
 * there are none. `listed()` is the one guard both read.
 *
 * AND THE ABSENCE IS ONE TILE, NOT FOUR. Repeating `— NO DATA` in each of the
 * four is four statements where there is one fact, and it does not fit either:
 * the placeholder is 130px of non-wrapping mono, and a quarter of a 346px
 * column is 76. Measured at 390 on the built page, where it pushed the document
 * 49px wider than the viewport — the one thing e2e/work.spec.ts checks on every
 * page at every width. So the rail collapses to a single tile rather than
 * shrinking a string that has no smaller size.
 *
 * THE FOUR TILES ARE COUNTED, NOT TYPED. The sheet writes `02 / 01 / 00 / 01`,
 * which is what a drawing does; `statusCounts` reads them off the answer. The
 * seed holds exactly those numbers today, so a typed `02` would be right
 * through exactly one deploy — H5a wrote that trap down for SYS.02's head and
 * this is the same trap with four numbers instead of one.
 *
 * `IN BUILD 00` IS A TILE AND STAYS A TILE. `SystemState` declares three values
 * for ever, so all three are stated whether or not a row occupies one today.
 * lib/work/stacks.ts makes the opposite call for the stack row and says why the
 * two differ: there the vocabulary is whatever the data happens to hold.
 *
 * THE THREE STATE WORDS COME FROM `MARKS`. The sheet spells the third tile
 * `IN BUILD` and its chip and legend spell it `BUILD`; one state may not have
 * two spellings on one page, and the table that owns the vocabulary decides
 * which. #289.
 */
export function WorkHeader({
  counts,
  messages,
}: {
  /** `null` when nothing countable arrived — never zeroes standing in for it. */
  counts: StatusCounts | null;
  messages: Messages;
}) {
  // `SYSTEMS` is nomenclature and stays where it is rendered — `systemsMeta`
  // writes the same word inline one page over, for the same reason.
  const tiles =
    counts === null
      ? [{ key: "all", label: "SYSTEMS", value: null }]
      : [
          { key: "all", label: "SYSTEMS", value: counts.all },
          { key: "live", label: stateLabel("live", messages), value: counts.live },
          { key: "in_build", label: stateLabel("in_build", messages), value: counts.in_build },
          { key: "queued", label: stateLabel("queued", messages), value: counts.queued },
        ];

  return (
    <div className="work-head">
      <div className="work-intro">
        <p className="work-eyebrow">
          <span className="work-marker">SYS.02</span> — SYSTEMS
        </p>
        <h1>{messages.workTitle}</h1>
        <p className="work-deck">{messages.workDeck}</p>
      </div>

      {/* A rail in the head and nowhere else. The Intermediate Widths register
          lists every two-column row this site has and the work page contributes
          only the ROW; this strip sits inside the header grid and stops with
          it, so `.rail` and its sticky rule are not involved. */}
      <dl className="work-stats" data-counted={counts === null ? undefined : ""}>
        {tiles.map((tile) => (
          <div key={tile.key} className="work-stat" data-stat={tile.key}>
            <dt>{tile.label}</dt>
            <dd>{tile.value === null ? <NoData /> : padTwo(tile.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
