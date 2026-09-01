import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CASE_STUDIES } from "../../content/case-studies/index.ts";
import type { SystemList } from "../api/systems.ts";

import { systemEntries } from "./systems.ts";

// The seeded pair again, and deliberately a second transcription rather than an
// import from lib/api/systems.test.ts: that file tests what the ANSWER says and
// this one tests what happens when the answer meets the repository. A shared
// fixture would mean one edit could quietly satisfy both.
const SEEDED = {
  systems: [
    { slug: "vat-check", systemNo: "01", name: "VAT Check API", state: "queued" },
    { slug: "timseil-dev", systemNo: "02", name: "timseil.dev", state: "live" },
  ],
} as unknown as SystemList;

describe("a system is not a case study", () => {
  // The whole reason this module exists. content/case-studies/index.ts states
  // it — "the seed holds two systems and this file holds one study" — and here
  // is where a reader can see the consequence.
  it("links the system that has a page and not the one that does not", () => {
    const entries = systemEntries(SEEDED);

    assert.equal(entries[0].href, null, "vat-check has no case study and must not link");
    assert.equal(entries[1].href, "/work/timseil-dev");
  });

  // A missing sentence is not a missing measurement. `— NO DATA` there would
  // claim something was asked for and did not arrive; nobody asks for prose.
  it("gives a system with no study no blurb, and not — NO DATA", () => {
    assert.equal(systemEntries(SEEDED)[0].blurb, null);
  });

  it("takes the blurb from the study rather than from the answer", () => {
    const [study] = CASE_STUDIES;
    assert.equal(systemEntries(SEEDED)[1].blurb, study.blurb);
  });

  // The blurb is one line by intent — `lead` is four sentences written for a
  // hero, and the reason the field was added rather than the paragraph reused.
  // A row that wrapped to four lines is the defect this holds against.
  it("keeps every blurb to one sentence", () => {
    for (const study of CASE_STUDIES) {
      assert.ok(study.blurb.length > 0, `${study.slug} has an empty blurb`);
      assert.ok(
        study.blurb.length < 120,
        `${study.slug}'s blurb is ${String(study.blurb.length)} characters and belongs in lead`,
      );
    }
  });
});

describe("the join changes nothing else", () => {
  it("keeps the answer's order", () => {
    assert.deepEqual(
      systemEntries(SEEDED).map((entry) => entry.no),
      ["01", "02"],
    );
  });

  it("has no entries when the read failed", () => {
    assert.deepEqual(systemEntries(null), []);
  });

  // A system the api sends that this repository has never heard of still gets a
  // row. The list is the api's; the repository only adds to it.
  it("keeps a system the repository knows nothing about", () => {
    const entries = systemEntries({
      systems: [{ slug: "some-future-thing", systemNo: "03", name: "Later", state: "queued" }],
    } as unknown as SystemList);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].blurb, null);
    assert.equal(entries[0].href, null);
  });
});
