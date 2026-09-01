import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { en } from "../i18n/messages/en.ts";
import { NO_DATA } from "../state/words.ts";

import type { SystemDetail, SystemList } from "./systems.ts";
import {
  coverage,
  coverageNote,
  deployMedianValue,
  errorRateValue,
  incidentCountValue,
  incidentDate,
  incidentList,
  downtimeLabel,
  metricTiles,
  opsGrid,
  p95Value,
  sourceView,
  stackLine,
  systemRows,
  systemsMeta,
  uptimeValue,
} from "./systems.ts";

// The answer a freshly seeded database produces, and therefore the case every
// assertion here starts from: `live`, with nothing measured. seed.sql writes no
// ops_checks, no deploys and no incidents on purpose, so this is not a fixture
// for an unlikely state — it is what production served on day one.
const EMPTY = {
  slug: "timseil-dev",
  systemNo: "02",
  name: "timseil.dev",
  state: "live",
  source: { access: "public", url: "https://github.com/G1NG4R/timseil-dev" },
  stack: ["Next.js 16.3", "Go 1.26", "PostgreSQL 18.6"],
  metrics: { uptime90d: null, p95Ms: null, errorRate: null, measuredAt: null },
  window: 91,
  generatedAt: "2026-08-30T18:00:00Z",
  days: Array.from({ length: 91 }, (_, i) => ({ d: `2026-06-${String(i)}`, state: "nodata", downSec: 0 })),
  incidents: [],
  deploys: [],
};

/** A body with some of `EMPTY` overwritten. Cast once, here, so no test does. */
function body(patch: Record<string, unknown> = {}): SystemDetail {
  return { ...EMPTY, ...patch } as unknown as SystemDetail;
}

describe("the five tiles when nothing has been measured", () => {
  it("says — NO DATA in all five rather than zero in any", () => {
    const tiles = metricTiles(body(), en);

    assert.deepEqual(
      tiles.map((tile) => tile.value),
      [null, null, null, null, "0"],
    );
  });

  // The one exception above, and the reason it is one: an empty `incidents`
  // array is the api saying it looked. A queued system sends no array at all.
  it("counts an empty incident list as zero and a missing one as nothing", () => {
    assert.equal(incidentCountValue([]), "0");
    assert.equal(incidentCountValue(undefined), null);
    assert.equal(incidentCountValue([{ id: "INC-001" }]), "1");
  });

  it("labels the window with the number the answer carries", () => {
    assert.equal(metricTiles(body(), en).at(0)?.label, "UPTIME · 91 D");
    assert.equal(metricTiles(body({ window: 30, days: [] }), en).at(0)?.label, "UPTIME · 30 D");
  });

  it("keeps the five in the order the sheet draws them", () => {
    assert.deepEqual(
      metricTiles(body(), en).map((tile) => tile.label),
      ["UPTIME · 91 D", "P95", "ERROR RATE", "PIPELINE · MEDIAN", "INCIDENTS"],
    );
  });
});

describe("the five tiles when the api did not answer at all", () => {
  // Not the same absence as an unmeasured system, and the page has to draw
  // both: five labels with nothing under them, and a window it was never told.
  it("still names all five", () => {
    assert.deepEqual(
      metricTiles(null, en).map((tile) => tile.label),
      ["UPTIME", "P95", "ERROR RATE", "PIPELINE · MEDIAN", "INCIDENTS"],
    );
  });

  it("puts no number and no window on any of them", () => {
    const tiles = metricTiles(null, en);
    assert.deepEqual(tiles.map((tile) => tile.value), [null, null, null, null, null]);
  });

  // Measured on the running page before it was fixed: the tile read
  // "UPTIME / — NO DATA / — NO DATA", two absences stacked, and the second one
  // was supposed to be a statement about coverage.
  it("drops the coverage line rather than saying — NO DATA twice", () => {
    assert.equal(metricTiles(null, en)[0].note, undefined);
  });

  // The one that would be easy to get wrong: 91 is the contract's default, so
  // it is tempting to print it. It would be a number nobody was told.
  it("does not fall back to ninety-one", () => {
    assert.doesNotMatch(metricTiles(null, en)[0].label, /91/);
  });

  it("reads nothing off a missing system elsewhere either", () => {
    assert.equal(stackLine(null), null);
    assert.equal(sourceView(null), null);
  });
});

describe("the five tiles when a system is queued", () => {
  // The contract omits `days`, `incidents` and `deploys` entirely unless the
  // system is live. Nothing here may fall back to a zero.
  const queued = body({
    state: "queued",
    metrics: { uptime90d: null, p95Ms: null, errorRate: null, measuredAt: null },
    days: undefined,
    incidents: undefined,
    deploys: undefined,
  });

  it("has no number anywhere", () => {
    assert.deepEqual(
      metricTiles(queued, en).map((tile) => tile.value),
      [null, null, null, null, null],
    );
  });

  it("still reports the window the answer declares", () => {
    assert.deepEqual(coverage(queued), { measured: 0, window: 91 });
  });
});

describe("a measured zero is a measurement", () => {
  it("prints 0.00 for an error rate of zero rather than — NO DATA", () => {
    assert.equal(errorRateValue(0), "0.00");
  });

  it("prints 0.00 for an uptime of zero, which is the reading that matters most", () => {
    assert.equal(uptimeValue(0), "0.00");
  });

  it("prints a zero p95 rather than hiding it", () => {
    assert.equal(p95Value(0), "0.0");
  });

  // The half a `!value` check would get wrong, and it is one character.
  it("carries all three through metricTiles", () => {
    const tiles = metricTiles(body({ metrics: { uptime90d: 0, p95Ms: 0, errorRate: 0, measuredAt: null } }), en);
    assert.deepEqual(tiles.slice(0, 3).map((tile) => tile.value), ["0.00", "0.0", "0.00"]);
  });
});

describe("a rate too small to print is not zero", () => {
  it("says < 0.01 rather than 0.00 for a rate that would round away", () => {
    assert.equal(errorRateValue(0.00004), "< 0.01");
    assert.equal(errorRateValue(0.0000001), "< 0.01");
  });

  it("prints the number as soon as two places can hold it", () => {
    assert.equal(errorRateValue(0.0007), "0.07");
    assert.equal(errorRateValue(0.0001), "0.01");
  });

  it("still says exactly 0.00 for an exact zero", () => {
    assert.equal(errorRateValue(0), "0.00");
  });
});

describe("values that are not numbers", () => {
  // The overlapping start of ADR 0035: for a few seconds the previous build
  // answers, and a field the contract gained this week is simply absent.
  it("treats a missing metrics object as five absences", () => {
    assert.deepEqual(
      metricTiles(body({ metrics: undefined }), en).map((tile) => tile.value),
      [null, null, null, null, "0"],
    );
  });

  it("treats a string and a NaN as nothing, not as text", () => {
    const tiles = metricTiles(body({ metrics: { uptime90d: "100", p95Ms: Number.NaN, errorRate: null } }), en);
    assert.equal(tiles[0].value, null);
    assert.equal(tiles[1].value, null);
  });

  it("survives a body with no window at all", () => {
    assert.deepEqual(coverage(body({ window: undefined, days: [] })), { measured: 0, window: 0 });
    assert.equal(coverageNote({ measured: 0, window: 0 }), "— NO DATA");
  });
});

describe("coverage — issue #208", () => {
  function days(measured: number): Record<string, unknown>[] {
    return Array.from({ length: 91 }, (_, i) => ({ state: i < measured ? "ok" : "nodata" }));
  }

  it("counts every day that carries a check, whatever it says", () => {
    assert.equal(coverage(body({ days: days(8) })).measured, 8);
    assert.equal(
      coverage(body({ days: [{ state: "ok" }, { state: "degraded" }, { state: "outage" }, { state: "nodata" }] }))
        .measured,
      3,
    );
  });

  // The sentence the issue was written for: the percentage looks the same
  // either way, so the count has to stand beside it.
  it("tells eight measured days from ninety-one", () => {
    assert.equal(coverageNote(coverage(body({ days: days(8) }))), "8 of 91 days measured");
    assert.equal(coverageNote(coverage(body({ days: days(91) }))), "91 of 91 days measured");
  });

  it("hangs the note on the uptime tile and on no other", () => {
    const tiles = metricTiles(body({ days: days(8) }), en);
    assert.equal(tiles[0].note, "8 of 91 days measured");
    assert.deepEqual(tiles.slice(1).map((tile) => tile.note), [undefined, undefined, undefined, undefined]);
  });

  it("says nothing measured rather than nothing at all when the grid is absent", () => {
    assert.equal(coverageNote(coverage(body({ days: undefined }))), "0 of 91 days measured");
  });
});

describe("the deploy median", () => {
  function deploys(...seconds: number[]): Record<string, unknown>[] {
    return seconds.map((durationSec) => ({ sha: "a41f9c2", durationSec, result: "ok", at: "2026-08-30T18:00:00Z" }));
  }

  it("takes the middle of an odd count", () => {
    assert.equal(deployMedianValue(deploys(238, 263, 270)), "263");
  });

  // A duration that happened, not the average of two that did. 42 and 43 have
  // no midpoint any deploy took.
  it("takes the lower of the two middles rather than their mean", () => {
    assert.equal(deployMedianValue(deploys(42, 43)), "42");
    assert.equal(deployMedianValue(deploys(238, 263, 270, 300)), "263");
  });

  it("does not care what order they arrived in", () => {
    assert.equal(deployMedianValue(deploys(270, 238, 263)), "263");
  });

  it("says nothing for an empty list and for no list", () => {
    assert.equal(deployMedianValue([]), null);
    assert.equal(deployMedianValue(undefined), null);
  });

  it("ignores an entry whose duration is not a number", () => {
    assert.equal(deployMedianValue([{ durationSec: "42" }, { durationSec: 60 }]), "60");
    assert.equal(deployMedianValue([{ durationSec: null }]), null);
  });
});

describe("the stack line", () => {
  it("joins the curated names the way the rail prints them", () => {
    assert.equal(stackLine(body()), "Next.js 16.3 · Go 1.26 · PostgreSQL 18.6");
  });

  // The versions come from stack.gen.json, which make gen reads out of go.mod,
  // package.json and compose.yaml. Nobody types one, so nobody can type an old
  // one — which is how design corrections #1 and #2 stop being possible.
  it("cannot carry a version this repository does not hold", () => {
    assert.doesNotMatch(stackLine(body()) ?? "", /React Router|PostgreSQL 16/);
  });

  it("says nothing for an empty stack and drops a blank name", () => {
    assert.equal(stackLine(body({ stack: [] })), null);
    assert.equal(stackLine(body({ stack: undefined })), null);
    assert.equal(stackLine(body({ stack: ["Go 1.26", ""] })), "Go 1.26");
  });
});

describe("the source axis", () => {
  it("reads a public system as its address", () => {
    assert.deepEqual(sourceView(body()), {
      access: "public",
      url: "https://github.com/G1NG4R/timseil-dev",
    });
  });

  it("reads a private system as its reason", () => {
    assert.deepEqual(sourceView(body({ source: { access: "private", reason: "nda" } })), {
      access: "private",
      reason: "nda",
    });
  });

  // Both halves of the schema's own refusal, read off the bytes rather than
  // trusted from `access`: a link to nowhere, and the excuse with no reason.
  it("refuses a public system with no address and a private one with no reason", () => {
    assert.equal(sourceView(body({ source: { access: "public" } })), null);
    assert.equal(sourceView(body({ source: { access: "public", url: "" } })), null);
    assert.equal(sourceView(body({ source: { access: "private" } })), null);
    assert.equal(sourceView(body({ source: { access: "private", reason: "because" } })), null);
    assert.equal(sourceView(body({ source: undefined })), null);
  });
});

// ── .04 OPERATIONS ──────────────────────────────────────────────────────────

/** One incident, complete. The four required fields are what invariant 4 is. */
const INC_001 = {
  id: "INC-001",
  startedAt: "2026-06-12T02:14:00Z",
  durationSec: 2520,
  cause: "postgres hit its memory limit while a migration held a lock",
  fix: "limit raised, migration split in two, lock timeout set",
  postSlug: "011-the-migration-that-locked-the-table",
};

/** A window with one notch on the third day. Everything else is unmeasured. */
function withNotch(patch: Record<string, unknown> = {}) {
  const days = Array.from({ length: 91 }, (_, i) => ({
    d: `2026-06-${String(i)}`,
    state: i === 2 ? "outage" : "nodata",
    downSec: i === 2 ? 2520 : 0,
    ...(i === 2 ? { incidentId: "INC-001" } : {}),
  }));
  return body({ days, incidents: [INC_001], ...patch });
}

describe("the operation grid when nothing has been measured", () => {
  // The shipping case, not a fixture: this is what production served on
  // 31.08.2026 with 82 of 91 days unmeasured and an empty incident list.
  it("draws ninety-one cells and calls none of them clean", () => {
    const grid = opsGrid(body());

    assert.equal(grid.cells.length, 91);
    assert.equal(
      grid.cells.every((cell) => cell.state === "nodata"),
      true,
    );
    assert.equal(
      grid.cells.some((cell) => cell.incidentId !== null),
      false,
    );
  });

  // Invariant 7 in one assertion. The caption says "13 WEEKS" and must never be
  // able to say it about a grid of twelve columns.
  it("counts thirteen columns of seven rather than printing the number", () => {
    assert.equal(opsGrid(body()).weeks, 13);
  });

  it("has no grid at all when the system is not live", () => {
    const grid = opsGrid(body({ days: undefined, incidents: undefined }));

    assert.deepEqual(grid.cells, []);
    assert.equal(grid.weeks, 0);
  });

  // An api that did not answer is not a system with a clean window.
  it("draws nothing for a body that never arrived", () => {
    assert.deepEqual(opsGrid(null).cells, []);
    assert.equal(incidentList(null), null);
  });

  // A part-week is still a column, and the number still comes from the cells.
  it("rounds a window that is not a multiple of seven up", () => {
    const days = Array.from({ length: 30 }, () => ({ d: "2026-06-01", state: "nodata", downSec: 0 }));
    const grid = opsGrid(body({ days, window: 30 }));

    assert.equal(grid.cells.length, 30);
    assert.equal(grid.weeks, 5);
  });
});

describe("a day that is a notch", () => {
  it("keeps its incident when the incident is really there", () => {
    const cell = opsGrid(withNotch()).cells[2];

    assert.equal(cell.state, "outage");
    assert.equal(cell.incidentId, "INC-001");
    assert.equal(cell.downSec, 2520);
  });

  // INVARIANT 5. The day points at an incident the answer did not send, which
  // the database forbids and the wire can still deliver during an overlapping
  // start. The outage is real and stays drawn; the link is not, and goes.
  it("stops being a link when its incident is not in the list", () => {
    const cell = opsGrid(withNotch({ incidents: [] })).cells[2];

    assert.equal(cell.state, "outage");
    assert.equal(cell.incidentId, null);
  });

  // INVARIANT 4, enforced where the bytes arrive rather than only in the table.
  // "Ohne Post-Mortem keine Kerbe" — an entry with no fix is not an incident
  // this page can show, so it is dropped, and the notch above loses its target
  // with it.
  it("drops an incident with no post-mortem, and the notch loses its link", () => {
    const half = { ...INC_001, fix: "" };
    const grid = opsGrid(withNotch({ incidents: [half] }));

    assert.deepEqual(incidentList(withNotch({ incidents: [half] })), []);
    assert.equal(grid.cells[2].state, "outage");
    assert.equal(grid.cells[2].incidentId, null);
  });

  it("keeps a measured zero and refuses a state it does not know", () => {
    const days = [
      { d: "2026-06-01", state: "ok", downSec: 0 },
      { d: "2026-06-02", state: "OUTAGE", downSec: 60 },
    ];
    const cells = opsGrid(body({ days })).cells;

    assert.equal(cells[0].downSec, 0);
    assert.equal(cells[0].state, "ok");
    // Not `ok`, and not a guess at `outage` either — unmeasured.
    assert.equal(cells[1].state, "nodata");
  });
});

describe("the incident list", () => {
  it("tells an empty window from a system that was never asked", () => {
    assert.deepEqual(incidentList(body()), []);
    assert.equal(incidentList(body({ incidents: undefined })), null);
  });

  it("keeps an incident that carries all four required fields", () => {
    assert.deepEqual(incidentList(body({ incidents: [INC_001] })), [INC_001]);
  });

  it("drops one that is missing any of them", () => {
    for (const field of ["id", "cause", "fix", "postSlug"]) {
      const broken = { ...INC_001, [field]: undefined };
      assert.deepEqual(incidentList(body({ incidents: [broken] })), [], field);
    }
  });
});

describe("what a notch says when it is opened", () => {
  it("shows the day and not the minute", () => {
    assert.equal(incidentDate("2026-06-12T02:14:00Z"), "2026-06-12");
  });

  it("refuses anything that is not a timestamp rather than slicing it", () => {
    for (const value of ["2026-06-12", "yesterday", "", null, undefined, 20260612]) {
      assert.equal(incidentDate(value), null);
    }
  });

  it("reads a long outage in minutes and a short one in seconds", () => {
    assert.equal(downtimeLabel(2520), "42 min");
    assert.equal(downtimeLabel(60), "1 min");
    assert.equal(downtimeLabel(30), "30 s");
  });

  // A degraded day with no downtime is a measurement, not a missing one — the
  // same rule errorRateValue follows one screen up.
  it("keeps a measured zero and refuses a missing duration", () => {
    assert.equal(downtimeLabel(0), "0 s");
    assert.equal(downtimeLabel(null), null);
    assert.equal(downtimeLabel(undefined), null);
    assert.equal(downtimeLabel(-1), null);
  });
});

// ── SYS.02 · the list ───────────────────────────────────────────────────────
//
// H5a. The seed holds exactly these two rows, so `SEEDED` is not a fixture for a
// convenient case — it is what /api/systems answers against a fresh database.

const SEEDED = {
  systems: [
    {
      slug: "vat-check",
      systemNo: "01",
      name: "VAT Check API",
      state: "queued",
      source: { access: "private", reason: "internal" },
      stack: ["Python", "FastAPI", "Docker", "SQLite"],
      metrics: { uptime90d: null, p95Ms: null, errorRate: null, measuredAt: null },
    },
    {
      slug: "timseil-dev",
      systemNo: "02",
      name: "timseil.dev",
      state: "live",
      source: { access: "public", url: "https://github.com/G1NG4R/timseil-dev" },
      stack: ["Next.js 16.3", "Go 1.26", "PostgreSQL 18.6"],
      metrics: { uptime90d: null, p95Ms: null, errorRate: null, measuredAt: null },
    },
  ],
  generatedAt: "2026-09-01T12:00:00Z",
} as unknown as SystemList;

describe("what the system list says when it is broken", () => {
  // The list has three ways of arriving useless, and each one has to produce an
  // empty list rather than a row of `undefined`. The section above it draws
  // EmptyState from `length === 0`, so this is the branch that decides whether a
  // failed read looks like a failed read.
  it("has no rows for a body that is missing, empty or the wrong shape", () => {
    assert.deepEqual(systemRows(null), []);
    assert.deepEqual(systemRows({ systems: [] } as unknown as SystemList), []);
    assert.deepEqual(systemRows({} as unknown as SystemList), []);
    assert.deepEqual(systemRows({ systems: "two" } as unknown as SystemList), []);
  });

  // The one row the reader refuses. Everything else about a system may be
  // absent and the row still says something true; without a slug it cannot even
  // decide whether it leads anywhere.
  it("drops a row with no slug and keeps the rows around it", () => {
    const rows = systemRows({
      systems: [{ systemNo: "01", name: "Nameless" }, SEEDED.systems[1]],
    } as unknown as SystemList);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].slug, "timseil-dev");
  });

  // ADR 0035's overlapping start is the case behind this: for a few seconds
  // after a deploy the answer can come from the previous build, and a field the
  // contract gained this week is simply absent.
  it("keeps a row whose every other field is missing", () => {
    const rows = systemRows({ systems: [{ slug: "vat-check" }] } as unknown as SystemList);

    assert.deepEqual(rows, [
      { slug: "vat-check", no: "--", name: "vat-check", state: null, stack: null, source: null },
    ]);
  });

  // #289. `in_build` is a state the contract declares and this site has no word
  // for; the row must say so rather than guess. A row that rendered IN BUILD
  // here would be a word nobody has drawn a tone, a dot or a dictionary key for.
  it("has no state word for in_build, and does not invent one", () => {
    const rows = systemRows({
      systems: [{ slug: "vat-check", state: "in_build" }],
    } as unknown as SystemList);

    assert.equal(rows[0].state, null);
  });

  // A public source with no address is a link to nowhere, and a private one with
  // no reason is the excuse the schema refuses. sourceView already held both;
  // this is the assertion that the list answer reaches the same judgement.
  it("refuses a half-written source the way the detail does", () => {
    const rows = systemRows({
      systems: [
        { slug: "a", source: { access: "public" } },
        { slug: "b", source: { access: "private" } },
        { slug: "c", source: { access: "private", reason: "because" } },
      ],
    } as unknown as SystemList);

    for (const row of rows) assert.equal(row.source, null);
  });
});

describe("what the system list says when it answers", () => {
  it("reads both seeded systems in the order the api sent them", () => {
    const rows = systemRows(SEEDED);

    assert.deepEqual(
      rows.map((row) => [row.no, row.name, row.state]),
      [
        ["01", "VAT Check API", "queued"],
        ["02", "timseil.dev", "live"],
      ],
    );
  });

  // The name carries the dot the slug cannot. H4 found the pair the other way
  // round — the evidence line prints `02 TIMSEIL-DEV` where the sheet draws
  // `02 TIMSEIL.DEV` — and the difference is that there the answer had no name
  // to give and here it does.
  it("prints the name and not the slug", () => {
    assert.equal(systemRows(SEEDED)[1].name, "timseil.dev");
    assert.equal(systemRows(SEEDED)[1].slug, "timseil-dev");
  });

  it("joins the stack the way the spec rail does", () => {
    assert.equal(systemRows(SEEDED)[0].stack, "Python · FastAPI · Docker · SQLite");
  });

  it("carries the source axis, which is not the state", () => {
    assert.deepEqual(systemRows(SEEDED)[0].source, { access: "private", reason: "internal" });
    assert.deepEqual(systemRows(SEEDED)[1].source, {
      access: "public",
      url: "https://github.com/G1NG4R/timseil-dev",
    });
  });
});

describe("the count in the section head", () => {
  // The number is `rows.length`, and the seed holding two is exactly the
  // coincidence that lets a typed `02` survive being wrong.
  it("counts the rows it drew and names the endpoint", () => {
    assert.equal(systemsMeta(SEEDED), "02 SYSTEMS · SOURCE: /api/systems");
  });

  it("says — NO DATA rather than zero when there was no answer", () => {
    assert.equal(systemsMeta(null), `${NO_DATA} SYSTEMS · SOURCE: /api/systems`);
  });

  // An answer that arrived and held nothing is a different statement from no
  // answer at all: the api said there are none. `00` is a measurement.
  it("distinguishes an empty answer from a missing one", () => {
    assert.equal(
      systemsMeta({ systems: [] } as unknown as SystemList),
      "00 SYSTEMS · SOURCE: /api/systems",
    );
  });

  // The distinction the three-way branch exists for. A body that arrived and
  // carries no readable list is not a body that said "none".
  it("does not print a zero for an answer that said nothing", () => {
    assert.equal(systemsMeta({} as unknown as SystemList), `${NO_DATA} SYSTEMS · SOURCE: /api/systems`);
    assert.equal(
      systemsMeta({ systems: "two" } as unknown as SystemList),
      `${NO_DATA} SYSTEMS · SOURCE: /api/systems`,
    );
  });

  it("makes the noun agree with the count", () => {
    assert.equal(
      systemsMeta({ systems: [{ slug: "a" }] } as unknown as SystemList),
      "01 SYSTEM · SOURCE: /api/systems",
    );
  });
});
