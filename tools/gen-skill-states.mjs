// The truth table that binds the SQL derivation to the design reference.
//
// `v_track_states` (00007) and `skillState()` in docs/design/code/tokens.ts say
// the same thing in two languages, and ADR 0003 allows exactly one of them to be
// the truth: the view. The reference stays, because the design handoff is
// read-only and because the rendering side needs it — so it has to be PROVEN
// equal, not assumed.
//
// The proof runs in api/migrations/track_states_db_test.go, inside a container
// that has Go and nothing else. Node cannot run there, so the TypeScript answer
// travels as data: this script asks skillState() for every point of the grid the
// property test can reach and writes the answers next to the test.
//
// Node 24 strips the types from tokens.ts on its own — no toolchain, no
// dependency, nothing added to the read-only handoff.
//
// Run via `make gen`. The result is committed and checked for drift, so editing
// tokens.ts without regenerating breaks `make check` instead of quietly making
// the property test agree with the wrong side.

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = 'docs/design/code/tokens.ts';
const target = 'api/migrations/testdata/skill_states.json';

// The property test builds its evidence from a pool of three live, three
// in_build and three queued systems, so neither counter can leave 0..3. One step
// past the `>= 2` boundary is deliberate: a grid that stops at the boundary
// cannot tell `>= 2` from `= 2`.
const MAX = 3;

const { skillState } = await import(resolve(root, source));

if (typeof skillState !== 'function') {
  console.error(`  ✗ ${source} exports no skillState()`);
  process.exit(1);
}

const states = [];
for (let live = 0; live <= MAX; live++) {
  for (let building = 0; building <= MAX; building++) {
    const ui = skillState(live, building);

    if (typeof ui !== 'string' || ui !== ui.toUpperCase() || ui === '') {
      console.error(`  ✗ skillState(${live}, ${building}) returned ${JSON.stringify(ui)}`);
      process.exit(1);
    }

    // Both cases, on purpose. The contract and the database speak lowercase, the
    // design sheets speak uppercase, and "API delivers lowercase, UI shows
    // uppercase" (phase C3) is a rule that should live in a file rather than in
    // somebody's memory.
    states.push({ liveSystems: live, buildingSystems: building, ui, api: ui.toLowerCase() });
  }
}

const document = {
  comment: `Generated from ${source} by tools/gen-skill-states.mjs — do not edit by hand.`,
  source,
  states,
};

writeFileSync(resolve(root, target), `${JSON.stringify(document, null, 2)}\n`);
console.log(`  ✓ ${states.length} skill states from ${source}`);
