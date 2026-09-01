import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ageLabel, contributionsMeta, graphLabel, graphView, type Contributions } from "./contributions.ts";

/** A week of seven days beginning on `sunday`, every one of them empty. */
function week(sunday: string, counts: readonly number[] = [0, 0, 0, 0, 0, 0, 0]) {
  const start = Date.parse(`${sunday}T00:00:00Z`);
  return {
    days: counts.map((count, index) => ({
      date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
      count,
      level: count === 0 ? "l0" : "l2",
    })),
  };
}

function answer(weeks: unknown[], rest: Record<string, unknown> = {}): Contributions {
  return { totalContributions: 0, fetchedAt: "2026-09-01T00:00:00Z", cacheAgeSec: 0, weeks, ...rest } as unknown as Contributions;
}

describe("graphView places the calendar on seven rows", () => {
  it("counts columns and cells rather than assuming either", () => {
    const view = graphView(answer([week("2026-08-02"), week("2026-08-09")]));

    assert.equal(view.columns, 2);
    assert.equal(view.days, 14);
    assert.equal(view.cells.length, 14);
  });

  it("puts a Sunday on row one and a Saturday on row seven", () => {
    const view = graphView(answer([week("2026-08-02")]));

    assert.equal(view.cells[0].row, 1);
    assert.equal(view.cells[6].row, 7);
  });

  it("marks the cell that opens each column, and only that one", () => {
    const view = graphView(answer([week("2026-08-02"), week("2026-08-09")]));

    assert.deepEqual(
      view.cells.map((cell) => cell.startsWeek),
      [true, false, false, false, false, false, false, true, false, false, false, false, false, false],
    );
  });

  // The case the live answer does not produce and will one day. Measured on
  // 2026-09-01 the calendar begins on a Sunday, so the first column is full and
  // nothing about it would catch a row derived from a position instead of a
  // date. A calendar that begins on a Wednesday hands back a first week of four.
  it("places a short FIRST week on the rows its dates name, not on the first four", () => {
    const wednesday = { days: week("2026-08-05", [0, 0, 0, 0]).days };
    const view = graphView(answer([wednesday, week("2026-08-09")]));

    assert.equal(view.cells[0].date, "2026-08-05");
    assert.equal(view.cells[0].row, 4, "Wednesday is the fourth row");
    assert.equal(view.cells[3].row, 7);
    // And the next column still opens at the top.
    assert.equal(view.cells[4].row, 1);
    assert.equal(view.cells[4].startsWeek, true);
  });

  it("places a short LAST week at the top, which is where its dates put it", () => {
    const view = graphView(answer([week("2026-08-02"), { days: week("2026-08-09", [1, 2, 3]).days }]));

    assert.equal(view.columns, 2);
    assert.equal(view.days, 10);
    assert.equal(view.cells[7].row, 1);
    assert.equal(view.cells[9].row, 3);
  });
});

describe("graphView reads an answer it cannot trust", () => {
  it("answers a missing read with the empty graph", () => {
    const view = graphView(null);

    assert.deepEqual(view, { columns: 0, cells: [], days: 0, total: null, ageSec: null, from: null, to: null });
  });

  it("survives weeks that are not there, not arrays, or empty", () => {
    assert.equal(graphView(answer([])).columns, 0);
    assert.equal(graphView({ } as unknown as Contributions).columns, 0);
    assert.equal(graphView(answer([null, 7, { days: null }, { days: [] }])).columns, 0);
  });

  // A day it cannot place is dropped rather than guessed onto row one: one cell
  // short of a picture is a smaller lie than one cell in the wrong week. And
  // `days` counts what was placed, so the caption stays true to what is drawn.
  it("drops a day with no readable date and says so in the count", () => {
    const view = graphView(
      answer([{ days: [{ date: "", count: 1, level: "l1" }, { date: "not-a-date", count: 1, level: "l1" }, { date: "2026-08-04", count: 1, level: "l1" }] }]),
    );

    assert.equal(view.days, 1);
    assert.equal(view.columns, 1);
    assert.equal(view.cells[0].date, "2026-08-04");
    assert.equal(view.cells[0].startsWeek, true, "the survivor opens the column");
  });

  // `null` is not `l0`. One says the day was measured and was empty, the other
  // says this arrived and cannot be read — and the graph draws them differently.
  it("refuses to read an unknown step as the empty one", () => {
    const view = graphView(answer([{ days: [{ date: "2026-08-02", count: 4, level: "l9" }, { date: "2026-08-03", count: 0, level: "l0" }] }]));

    assert.equal(view.cells[0].level, null);
    assert.equal(view.cells[0].count, 4, "the count is still a fact");
    assert.equal(view.cells[1].level, "l0");
  });

  it("reads a count that is not a number as no count", () => {
    const view = graphView(answer([{ days: [{ date: "2026-08-02", level: "l0" }] }]));

    assert.equal(view.cells[0].count, null);
  });
});

describe("the caption counts what is drawn", () => {
  it("prints the api's total and the counted span", () => {
    const view = graphView(answer([week("2026-08-02")], { totalContributions: 652, cacheAgeSec: 1357 }));

    assert.equal(contributionsMeta(view), "652 CONTRIBUTIONS · LAST 7 DAYS · SOURCE: /api/contributions · 22M OLD");
  });

  it("names the endpoint even when there is nothing to say about it", () => {
    const meta = contributionsMeta(graphView(null));

    assert.match(meta, /SOURCE: \/api\/contributions/);
    assert.match(meta, /— NO DATA/);
  });

  // The cold 502: GitHub has never answered, so there is no age to print — and
  // an age of nothing must not read as an age of zero.
  it("leaves the age off entirely when there is none", () => {
    assert.doesNotMatch(contributionsMeta(graphView(null)), /OLD/);
  });

  it("prints a fresh answer's age rather than hiding it", () => {
    const view = graphView(answer([week("2026-08-02")], { totalContributions: 1, cacheAgeSec: 0 }));

    assert.match(contributionsMeta(view), /· 0S OLD$/);
  });
});

describe("ageLabel says the coarsest thing that is still true", () => {
  it("rounds down, never up", () => {
    assert.equal(ageLabel(0), "0S");
    assert.equal(ageLabel(59), "59S");
    assert.equal(ageLabel(60), "1M");
    assert.equal(ageLabel(1357), "22M");
    assert.equal(ageLabel(3_599), "59M");
    assert.equal(ageLabel(3_600), "1H");
    assert.equal(ageLabel(86_399), "23H");
    assert.equal(ageLabel(86_400), "1D");
    assert.equal(ageLabel(1_000_000), "11D");
  });

  it("does not print a negative age, which a clock skew could hand it", () => {
    assert.equal(ageLabel(-5), "0S");
  });
});

describe("the graph carries one name and not three hundred", () => {
  it("says the claim the picture makes", () => {
    const view = graphView(answer([week("2026-08-02"), week("2026-08-09")], { totalContributions: 652 }));

    assert.equal(graphLabel(view), "652 contributions over 14 days, 2026-08-02 to 2026-08-15");
  });

  it("says nothing it cannot support", () => {
    assert.match(graphLabel(graphView(null)), /— NO DATA/);
  });
});
