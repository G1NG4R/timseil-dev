import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { stackKey, stackTags, tagsOf } from "./stacks.ts";

// The broken case first, and here it is the shape of the data rather than a
// missing field: `stack` is a free-form `string[]` in the contract, with no
// pattern and no enum. Everything below is something that array is allowed to
// contain and that a chip row must survive.
describe("a stack entry that is not a name and a version", () => {
  it("refuses an entry that is not a string", () => {
    for (const value of [null, undefined, 7, {}, [], true]) {
      assert.equal(stackKey(value), null);
    }
  });

  it("refuses an empty entry rather than drawing a chip with no word", () => {
    assert.equal(stackKey(""), null);
    assert.equal(stackKey("   "), null);
  });

  it("refuses an entry that is all version", () => {
    // A chip labelled `1.26` says nothing about what it filters, and the state
    // language refuses a control that cannot explain itself. Dropped, not shown
    // under its own version number.
    assert.equal(stackKey("1.26"), null);
    assert.equal(stackKey("v3.7.11"), null);
  });

  it("survives a stack that is not an array at all", () => {
    for (const value of [null, undefined, "Go 1.26", 7, {}]) {
      assert.deepEqual(tagsOf(value), []);
    }
  });
});

describe("the version goes and the name stays", () => {
  it("strips what make gen wrote and keeps what stack.yaml curated", () => {
    // Transcribed from api/internal/seed/stack.gen.json. Every version here was
    // read out of go.mod, package.json, compose.yaml or .nvmrc — which is why
    // it may not end up in a filter key: the next release moves it, and it
    // would take the visitor's selection with it.
    assert.deepEqual(stackKey("Next.js 16.3"), { key: "next.js", label: "Next.js" });
    assert.deepEqual(stackKey("Go 1.26"), { key: "go", label: "Go" });
    assert.deepEqual(stackKey("PostgreSQL 18.6"), { key: "postgresql", label: "PostgreSQL" });
    assert.deepEqual(stackKey("Node 24"), { key: "node", label: "Node" });
    assert.deepEqual(stackKey("pgx 5.10"), { key: "pgx", label: "pgx" });
  });

  it("leaves a bare name alone", () => {
    // The whole `vat-check` stack. None of its sources live in this repository,
    // so none of them has a version to read and the sheet draws it that way
    // too.
    assert.deepEqual(stackKey("Python"), { key: "python", label: "Python" });
    assert.deepEqual(stackKey("FastAPI"), { key: "fastapi", label: "FastAPI" });
    assert.deepEqual(stackKey("SQLite"), { key: "sqlite", label: "SQLite" });
  });

  it("does not mistake a digit inside a name for a version", () => {
    // The rule is a trailing run, not any digit. Otherwise `S3` becomes `S` and
    // two unrelated services share a chip.
    assert.deepEqual(stackKey("S3"), { key: "s3", label: "S3" });
    assert.deepEqual(stackKey("OAuth2"), { key: "oauth2", label: "OAuth2" });
  });

  it("gives a key that can survive the filter's own separator", () => {
    // The sheet matches with a whole-token `includes` over a space-separated
    // list, so a key with a space in it would match half of itself. Asserted
    // whole rather than probed for a space: `amazon-s3` says both that the
    // separator is gone and what took its place.
    assert.deepEqual(stackKey("Amazon S3"), { key: "amazon-s3", label: "Amazon S3" });
  });
});

describe("tagsOf reads one system", () => {
  it("keeps the answer's order", () => {
    // Not sorted. A reader comparing this with the printed stack line beside it
    // should see the same sequence; `stackLine` joins the same array.
    assert.deepEqual(
      tagsOf(["Python", "FastAPI", "Docker", "SQLite"]).map((tag) => tag.key),
      ["python", "fastapi", "docker", "sqlite"],
    );
  });

  it("collapses two spellings of one technology into one tag", () => {
    // Two chips for one thing would each show half its systems, and neither
    // would be wrong on its own — the worst shape a filter can have.
    assert.deepEqual(
      tagsOf(["Docker", "docker 27.1", "DOCKER"]).map((tag) => tag.key),
      ["docker"],
    );
  });

  it("drops what it cannot name and keeps the rest", () => {
    assert.deepEqual(
      tagsOf(["Go 1.26", "", null, "2.0", "Loki 3.7"]).map((tag) => tag.key),
      ["go", "loki"],
    );
  });
});

describe("stackTags reads the whole list", () => {
  // The two stacks the seed actually produces, transcribed from
  // api/internal/seed/stack.gen.json.
  const TIMSEIL = [
    "Next.js 16.3",
    "React 19.2",
    "Go 1.26",
    "pgx 5.10",
    "sqlc 1.30",
    "goose 3.27",
    "PostgreSQL 18.6",
    "Node 24",
    "Prometheus 3.13",
    "Loki 3.7",
    "Alloy 1.18",
  ];
  const VAT = ["Python", "FastAPI", "Docker", "SQLite"];

  it("sorts by key so the row reads the same on every machine", () => {
    // A code-unit compare, not `localeCompare`. The key is what the filter
    // matches on, and an order that depends on the ICU data in the running Node
    // would make this a different list on a different machine.
    const keys = stackTags([VAT, TIMSEIL]).map((tag) => tag.key);

    assert.deepEqual(keys, [...keys].sort());
  });

  it("holds every name across both systems, once each", () => {
    const keys = stackTags([VAT, TIMSEIL]).map((tag) => tag.key);

    assert.equal(keys.length, VAT.length + TIMSEIL.length);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(keys.includes("go"));
    assert.ok(keys.includes("python"));
  });

  it("has no chip that matches nothing", () => {
    // THE WHOLE REASON THIS FILE EXISTS. The sheet's hand-drawn row carries
    // TYPESCRIPT, which is in neither stack, and POSTGRES, which is spelled
    // PostgreSQL — three of its five chips would empty the list every time they
    // were pressed. A derived vocabulary cannot do that, and this is the
    // assertion that says so rather than the comment.
    const stacks = [VAT, TIMSEIL];

    for (const tag of stackTags(stacks)) {
      const matched = stacks.filter((stack) =>
        tagsOf(stack).some((own) => own.key === tag.key),
      );
      assert.ok(matched.length > 0, `${tag.key} matches no system`);
    }
  });

  it("is empty when nothing has a readable stack", () => {
    // `00` chips is a measurement — the api answered and no system named a
    // technology. The control then has nothing but its own sentinel, and
    // WorkFilters draws no row at all rather than a lone ANY.
    assert.deepEqual(stackTags([null, undefined, [], ["", "  "]]), []);
  });
});
