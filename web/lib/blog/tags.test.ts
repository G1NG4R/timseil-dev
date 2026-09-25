import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PostMeta } from "../content/posts.ts";
import { tagChips, tagLabel } from "./tags.ts";

/** Only the fields this file reads. The rest of `PostMeta` is another file's. */
function post(tags: readonly string[]): PostMeta {
  return {
    slug: "001-a-slug",
    title: "A title",
    deck: "A deck",
    published: "2026-01-01",
    systemId: null,
    tags,
    summary: "A summary",
    updated: null,
  };
}

// The broken case first, and for a chip row it is the row that cannot be drawn:
// no entries at all, and entries that carry nothing to file them under.
describe("a corpus that yields no chips", () => {
  it("answers an empty row rather than a row holding only the sentinel", () => {
    // A row holding nothing but the control that turns itself off is a dead
    // control. lib/work/stacks.ts states this as the expected behaviour for the
    // same shape, and components/blog/BlogFilters.tsx draws no row for it.
    assert.deepEqual(tagChips([]), []);
  });

  it("draws no chip for a tag no entry carries", () => {
    // There is no list of allowed tags anywhere for this to disagree with: the
    // vocabulary IS the corpus. This is the assertion that says so.
    const chips = tagChips([post(["go"])]);
    assert.deepEqual(
      chips.map((chip) => chip.key),
      ["go"],
    );
  });
});

describe("the count on a chip", () => {
  it("counts entries and not tag sightings", () => {
    const chips = tagChips([post(["go", "docker"]), post(["go"]), post(["linux"])]);
    assert.deepEqual(
      chips.map((chip) => `${chip.key} ${chip.count}`),
      ["docker 01", "go 02", "linux 01"],
    );
  });

  it("pads to two digits, because the row is drawn in tabular figures", () => {
    assert.equal(tagChips([post(["go"])])[0]?.count, "01");
  });

  it("carries a count for every chip, so no chip is drawn without its number", () => {
    for (const chip of tagChips([post(["go"]), post(["go", "linux"])])) {
      assert.match(chip.count, /^\d{2,}$/);
    }
  });
});

describe("the order is the alphabet and not the corpus", () => {
  it("sorts by key ascending, whatever order the entries arrived in", () => {
    const chips = tagChips([post(["zig"]), post(["api"]), post(["mdx"])]);
    assert.deepEqual(
      chips.map((chip) => chip.key),
      ["api", "mdx", "zig"],
    );
  });

  it("sorts on the key rather than the label", () => {
    // Both are upper-cased for display, so a comparison on the label would
    // agree here by accident. The assertion is that the KEY is what is read.
    const chips = tagChips([post(["design-handoff"]), post(["design"])]);
    assert.deepEqual(
      chips.map((chip) => chip.key),
      ["design", "design-handoff"],
    );
  });
});

describe("the word on a chip", () => {
  it("is the tag in the voice of the page", () => {
    assert.equal(tagLabel("observability"), "OBSERVABILITY");
  });

  it("keeps the hyphen the key carries, though the sheet draws a slash", () => {
    // `CI/CD` is what the artboard prints. The key is `ci-cd`, and
    // lib/content/posts.ts's TAG pattern allows no slash — printing a character
    // the value does not contain would be this file editing the corpus.
    assert.equal(tagLabel("ci-cd"), "CI-CD");
  });

  it("is the same word the chip carries, so the two cannot disagree", () => {
    const [chip] = tagChips([post(["ci-cd"])]);
    assert.equal(chip.label, tagLabel("ci-cd"));
  });
});

// TAGS, BUILT RATHER THAN READ. This block swept web/content/posts/ until U2
// emptied it (ADR 0079). Two of its three assertions were about `tagChips` —
// every written tag gets exactly one chip, and the counters add up to the
// sightings — and they hold against a list made here, where the overlaps are
// chosen instead of inherited.
//
// THE THIRD ONE IS GONE AND WAS THE ONLY REAL LOSS. "holds more chips than the
// sheet draws" measured this repository against the Blog Index artboard, which
// draws `ALL` plus seven over ten invented entries; with no entries there is no
// measurement to make and no disagreement to record. ADR 0071 §3 keeps the
// decision — the chips are derived from the corpus and are not capped — and the
// number comes back on its own when there is a corpus to count.
describe("tags this file writes", () => {
  const posts = [
    post(["ci-cd", "deploys"]),
    post(["ci-cd", "traefik"]),
    post(["design"]),
  ];
  const chips = tagChips(posts);

  it("has a chip, and every chip holds at least one entry", () => {
    // The whole decision of that phase, as an assertion: no threshold, no cap.
    // A chip that matched nothing would be the dead control lib/work/stacks.ts
    // refuses, and a tag without a chip would be a subject nobody can filter by.
    const written = new Set(posts.flatMap((one) => one.tags));
    assert.equal(chips.length, written.size);
    for (const chip of chips) {
      assert.ok(Number(chip.count) >= 1, `${chip.key} holds no entry`);
    }
  });

  it("adds up to every tag sighting in the corpus", () => {
    const sightings = posts.reduce((total, one) => total + one.tags.length, 0);
    const counted = chips.reduce((total, chip) => total + Number(chip.count), 0);
    assert.equal(counted, sightings);
    assert.equal(sightings, 5);
  });
});
