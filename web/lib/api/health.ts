// What the meta bar reads off one health answer.
//
// Separate from lib/api/readers.ts, and for the reason lib/http/url.ts gives:
// the readers import `next/headers` and `next/cache`, so `node --test` cannot
// load them. Every judgement about what a number means is therefore here, where
// a test can reach it, and the readers are left with nothing to decide.
//
// WHY THE FIELDS ARE READ DEFENSIVELY THOUGH THE TYPE IS GENERATED
//
// The generated type is a statement about the contract, not about the bytes that
// arrived. ADR 0035 puts a real case behind that: during the overlapping start
// the new web container talks to whichever api container answers, and for a few
// seconds that can be the previous build. A field the contract gained this week
// is then simply absent, and `body.ops.uptime90d` would be `undefined` — which
// `Number.toFixed` renders as `NaN%` in a footer that exists to argue against
// invented numbers.

import { siteWord } from "../state/derive.ts";
import { NO_DATA, type StateKey } from "../state/words.ts";

import type { ApiResult, GetBody } from "./client.ts";

export type Health = GetBody<"/api/health">;

/** The three cells of the meta bar, in the shape FooterMeta already takes. */
export interface FooterHealth {
  build: string | null;
  uptime: number | null;
  /**
   * The state word for the delivery of this page, or `null` for not knowing.
   *
   * A BOOLEAN UNTIL G6, and the change is the phase. `online: boolean | null`
   * had three renderings and only two reachable values: `degraded` came back as
   * ONLINE because the bar had no third word, so a state the api announces out
   * loud was invisible; and OFFLINE stood in the code for an answer
   * /api/health cannot form. A word has as many values as the vocabulary does.
   */
  status: Extract<StateKey, "online" | "degraded"> | null;
}

/**
 * Unwraps an answer, or refuses to return one.
 *
 * The one place in this codebase that turns a result into a throw, and it exists
 * for the cached reader alone. `use cache` stores whatever its function returns,
 * including a value meaning "no data" — and the only lever it offers for not
 * storing something is not returning it. So the failure leaves by the other
 * door and the caller renders the resting state.
 *
 * It lives here rather than in lib/api/readers.ts because readers.ts imports
 * `next/headers` and `node --test` cannot load such a module. A decision that
 * cannot be tested where it is written gets moved to where it can be.
 */
export function healthOrThrow(result: ApiResult<Health>): Health {
  if (result.kind !== "ok") {
    throw new Error(`health unavailable: ${String(result.status)}`);
  }
  return result.data;
}

/** What the meta bar shows when there is no answer. The resting state, not an error. */
export const NO_HEALTH: FooterHealth = { build: null, uptime: null, status: null };

/**
 * Reads one health document into the three props.
 *
 * `build` is the commit and not the release tag. Both are in the answer, and the
 * sheet draws `BUILD v3.2.1`, so either would fit the form — but the sha is the
 * one a stranger can hold against `main` without knowing how this repository
 * tags, and it is the value chapter 8.5 of the build plan curls to decide a
 * phase is finished. The footer says what `check-deployed` argues about.
 *
 * `status` IS THE PART G6 CHANGED, and the entry it closes is in backlog.md
 * (28.08., G4): this function used to answer a boolean, `degraded` collapsed
 * into ONLINE because the meta bar had no third word, and OFFLINE sat in the
 * rendering for a case /api/health cannot produce. It now returns the state
 * word itself, and lib/state/derive.ts owns the mapping — so the bar, the menu
 * strip and the homepage row cannot start disagreeing about what `degraded`
 * looks like.
 *
 * OFFLINE IS STILL UNREACHABLE FROM HERE, and now it is unreachable by type as
 * well as in practice: both words the contract can send mean "it answered".
 * Failing to reach the api at all is `null` — during the rollout window of #157
 * we genuinely do not know whether anything is down, and `— NO DATA` is the
 * honest word for not knowing.
 */
export function footerHealth(body: Health): FooterHealth {
  // The parameter type is a promise about the contract. This is the value that
  // arrived. Reading it as a record is what keeps the guards below meaningful —
  // against `Health` the type checker proves `ops` is present and `status` is
  // one of two words, and it is right about the contract and wrong about the
  // bytes for as long as one rollout window lasts.
  const raw = body as Record<string, unknown>;
  const ops = raw.ops as Record<string, unknown> | undefined;

  return {
    build: nonEmpty(raw.sha),
    uptime: finiteNumber(ops?.uptime90d),
    status: siteWord(raw.status),
  };
}

/** A string, or nothing. An empty string is not a build identity. */
function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * A number, or nothing.
 *
 * Invariant 1 lives in the `finite` half. The contract already types this field
 * `number | null`, so `null` arrives honestly — but `undefined` from an older
 * build, or a `NaN` from a body that parsed further than it should have, must
 * end up in the same place as `null` and not in `toFixed`.
 */
function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The two cell texts that are still texts.
 *
 * They are here rather than in the components because two components render
 * them — the meta bar in the footer and the strip at the bottom of the mobile
 * menu — and because this is where invariant 1 is checkable. `0` must read
 * `0.00%` and `null` must read `— NO DATA`; a component that got that round the
 * wrong way would be a rendering detail nobody tests, and this way it is one
 * assertion.
 *
 * `onlineText` USED TO BE THE THIRD and is gone with G6. The state cell is no
 * longer a string: it is a word plus a mark, which is a component's job, and
 * `— NO DATA` now lives in lib/state/words.ts so that this file and
 * app/[lang]/page.tsx stop holding two copies of it.
 */
export function buildText(build: string | null): string {
  return build ?? NO_DATA;
}

export function uptimeText(uptime: number | null): string {
  // Not `uptime || NO_DATA`. A measured zero is a number this site has to be
  // able to print — an outage that lasted the whole window is the one reading
  // that matters most — and `||` would turn it into "no data".
  return uptime === null ? NO_DATA : `${uptime.toFixed(2)}%`;
}
