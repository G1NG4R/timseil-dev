// What this file is for: the gallery claims to show every component in every
// documented state, and a claim like that decays silently. A part gets built
// and nobody flips its entry; a name is dropped in a refactor; a state is added
// to words.ts and the gallery keeps showing eight of nine. None of that turns
// anything red on its own — a page that renders fewer cells looks exactly like
// a page that renders the right number.
//
// So the inventory is held against the sheet, and "built" is held against the
// filesystem rather than against anyone's memory.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { STATE_KEYS } from "../state/words.ts";
import { PARTS, inventoryProgress, isBuilt, partsOf } from "./registry.ts";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * The sixteen names of SYS.00.04.04, transcribed a second time and on purpose.
 *
 * THE COUNT IS THE POINT. The build plan's criterion says fifteen; the sheet
 * has fourteen rows and sixteen names, because `SpecRail · PostCard` and
 * `TopNav · StatusDot` each share a row. Writing the names out here rather than
 * asserting a number means the next person to touch the registry has to
 * disagree with a list, not with an integer they could assume was rounded.
 */
const SHEET_INVENTORY = [
  "Terminal",
  "ContributionGraph",
  "SkillRow",
  "SystemRow",
  "OperationGrid",
  "MetricTile",
  "FilterChip",
  "TrajectoryRail",
  "SpecRail",
  "PostCard",
  "CTA E-Mail",
  "ContactForm",
  "ThemeSwitch",
  "ErrorBudgetGame",
  "TopNav",
  "StatusDot",
];

void test("the inventory is the sheet's, name for name and in its order", () => {
  assert.deepEqual(
    partsOf("inventory").map((part) => part.id),
    SHEET_INVENTORY,
  );
});

void test("no name appears twice across the three lists", () => {
  const ids = PARTS.map((part) => part.id);
  assert.equal(new Set(ids).size, ids.length);
});

// A part is built or it is owed. Both at once is a contradiction; neither is a
// name nobody is responsible for, which is how an inventory quietly becomes a
// wish list.
void test("every part is either built or owed by a phase, never both and never neither", () => {
  for (const part of PARTS) {
    const built = part.module !== null;
    const owed = part.owedBy !== null;
    assert.notEqual(built, owed, `${part.id} claims module=${String(part.module)} and owedBy=${String(part.owedBy)}`);
  }
});

// THE ASSERTION THIS FILE EXISTS FOR. "Built" is a claim about the repository,
// so it is checked against the repository. An entry that says it has a file and
// has not is the exact shape of the defect invariant 1 is about — a value that
// reads as measured and was typed.
void test("a part that claims to be built has a file", () => {
  for (const part of PARTS) {
    if (part.module === null) continue;
    assert.ok(
      existsSync(path.join(webRoot, part.module)),
      `${part.id} points at ${part.module}, which does not exist`,
    );
  }
});

// STATE.05: "DISABLED SAGT WARUM … Ein toter Zustand ohne Begründung ist ein
// Bug." The gallery owes its own cells the answer it demands of everything else.
void test("a part with no live example says why", () => {
  for (const part of PARTS) {
    if (part.preview) continue;
    const reason = isBuilt(part) ? part.note : part.owedBy;
    assert.ok(
      reason !== null && reason !== "",
      `${part.id} has no preview and no reason for it`,
    );
  }
});

void test("every part names at least one documented state", () => {
  for (const part of PARTS) {
    assert.ok(part.states.length > 0, `${part.id} documents no states`);
    for (const state of part.states) {
      assert.equal(state.trim(), state, `${part.id} has a padded state string`);
      assert.notEqual(state, "", `${part.id} has an empty state string`);
    }
  }
});

// The gallery renders StatusDot and StateWord across STATE_KEYS. If a ninth key
// is ever added, this is what says so — the alternative is a page that keeps
// rendering eight cells and looks entirely correct while doing it.
void test("the state language has exactly the eight keys the gallery renders", () => {
  assert.deepEqual(
    [...STATE_KEYS],
    ["live", "online", "degraded", "offline", "empty", "queued", "available", "nodata"],
  );
});

// The number is counted from the list, never typed. The build plan says
// fifteen; this is what the sheet actually holds, and the acceptance quotes
// this rather than the plan.
void test("the inventory progress is counted, not written down", () => {
  const { built, total } = inventoryProgress();
  assert.equal(total, SHEET_INVENTORY.length);
  assert.equal(total, 16);
  assert.equal(built, partsOf("inventory").filter(isBuilt).length);
});
