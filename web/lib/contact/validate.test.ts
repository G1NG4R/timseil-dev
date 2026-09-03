// What this file is for: this validator is a mirror, and a mirror is only worth
// having while it still reflects. Two ways it can stop:
//
//   1. It invents a reason the api never says. The page would show a sentence
//      that cannot come back from a 400, and the two halves of the same failure
//      would read differently depending on which one caught it.
//   2. It refuses something the api accepts. That one has no appeal — the
//      visitor is told they are wrong by a page, and the api never gets asked.
//
// So the first test reads the reasons out of `api/internal/contact/validate.go`
// itself and holds every client reason against them. The Go file is the
// authority; this is the copy, and the copy has to prove it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { containsControl, deliverable, firstInvalidField, reasonFor, validateDraft } from "./validate.ts";

const GO = readFileSync(
  new URL("../../../api/internal/contact/validate.go", import.meta.url),
  "utf8",
);

/** Every reason `validate.go` can attach to a field, off the source. */
function goReasons(): Set<string> {
  const found = new Set<string>();
  for (const match of GO.matchAll(/fail\("(\w+)", "([^"]+)"\)/g)) {
    found.add(`${match[1]}: ${match[2]}`);
  }
  assert.ok(found.size >= 8, `only ${String(found.size)} reasons found — did fail() change shape?`);
  return found;
}

/** Drafts that break every rule this form can check, one at a time. */
const BROKEN: readonly { readonly label: string; readonly draft: Record<string, string> }[] = [
  { label: "name too short", draft: { name: "T", email: "a@b.lu", message: "x".repeat(20) } },
  { label: "name too long", draft: { name: "T".repeat(81), email: "a@b.lu", message: "x".repeat(20) } },
  { label: "name with a tab", draft: { name: "Tim\tSeil", email: "a@b.lu", message: "x".repeat(20) } },
  { label: "address missing", draft: { name: "Tim", email: "", message: "x".repeat(20) } },
  { label: "address too long", draft: { name: "Tim", email: `${"a".repeat(250)}@b.lu`, message: "x".repeat(20) } },
  { label: "address without a dot", draft: { name: "Tim", email: "anna@firma", message: "x".repeat(20) } },
  { label: "message too short", draft: { name: "Tim", email: "a@b.lu", message: "too short" } },
  { label: "message too long", draft: { name: "Tim", email: "a@b.lu", message: "x".repeat(4001) } },
];

void test("every reason this page can show is one the api can send", () => {
  const allowed = goReasons();
  for (const { label, draft } of BROKEN) {
    const invalid = validateDraft(draft as never);
    assert.ok(invalid.length > 0, `${label}: caught nothing`);
    for (const entry of invalid) {
      assert.ok(
        allowed.has(`${entry.name}: ${entry.reason}`),
        `${label}: "${entry.name}: ${entry.reason}" is not a reason validate.go can send`,
      );
    }
  }
});

void test("a good draft says nothing", () => {
  assert.deepEqual(
    validateDraft({
      name: "Anna Keller",
      email: "anna.keller@firma.lu",
      message: "Hi Tim, do you have thirty minutes next week to talk about a pipeline?",
    }),
    [],
  );
});

void test("the entries come back in the order of the form", () => {
  // The whole reason focus can move without sorting. Two wrong fields, and the
  // address is the second of them however the object is written.
  const invalid = validateDraft({ name: "T", email: "nope", message: "x".repeat(20) });
  assert.deepEqual(
    invalid.map((entry) => entry.name),
    ["name", "email"],
  );
  assert.equal(firstInvalidField(invalid), "name");
});

void test("focus skips a field this form does not draw", () => {
  // `invalidParams` may name `ts` or `dwellMs` — both are in the contract and
  // neither is on the screen. Focusing one would silently do nothing, and the
  // visitor would be left with a form that refused and moved no cursor.
  assert.equal(firstInvalidField([{ name: "ts", reason: "not a plausible timestamp" }]), null);
  assert.equal(
    firstInvalidField([
      { name: "dwellMs", reason: "implausibly large" },
      { name: "message", reason: "at least 20 characters" },
    ]),
    "message",
  );
});

void test("trimming happens before counting, as it does on the other side", () => {
  // Twenty spaces are not twenty characters. validate.go trims first, and a
  // page that did not would let this through to be refused by a 400.
  const invalid = validateDraft({ name: "  Tim  ", email: " a@b.lu ", message: `  ${" ".repeat(30)}  ` });
  assert.equal(reasonFor(invalid, "message"), "at least 20 characters");
  assert.equal(reasonFor(invalid, "name"), undefined);
  assert.equal(reasonFor(invalid, "email"), undefined);
});

void test("the control check refuses what folds a header", () => {
  assert.equal(containsControl("Tim Seil"), false);
  assert.equal(containsControl("Tim\r\nBcc: someone@example.com"), true);
  assert.equal(containsControl("Tim\tSeil"), true);
  assert.equal(containsControl("Tim\u2028Seil"), true);
  assert.equal(containsControl("Müller-Lüdenscheidt"), false);
});

void test("the address check catches the typo and lets the rest travel", () => {
  assert.equal(deliverable("anna.keller@firma.lu"), true);
  assert.equal(deliverable("anna@xn--80ak6aa92e.com"), true);
  assert.equal(deliverable("anna@firma"), false);
  assert.equal(deliverable("anna@firma."), false);
  assert.equal(deliverable("anna@firma.l"), false);
  assert.equal(deliverable("anna@[192.0.2.1]"), false);
  assert.equal(deliverable('"Anna" <anna@firma.lu>'), false);
  assert.equal(deliverable("anna@firma.lu, bob@firma.lu"), false);
  assert.equal(deliverable("anna@firma.lu\r\nBcc: bob@firma.lu"), false);
  assert.equal(deliverable("@firma.lu"), false);
  assert.equal(deliverable("anna@"), false);
});
