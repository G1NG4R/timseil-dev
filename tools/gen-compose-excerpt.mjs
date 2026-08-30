// The compose excerpt the case study shows, cut out of the file the VPS runs.
//
// WHY THIS EXISTS. Build plan D2 asked `compose.yaml` to match the excerpt drawn
// on the Case Study Template *verbatim*, and issue #75 measured that requirement
// against reality: the sheet contradicts the shipped file in five places, and
// one of them is not a typo but an impossibility. The sheet probes the container
// with `wget -qO- http://localhost:8080/healthz`; the production image is
// distroless and has no shell and no wget (ADR 0026), so that probe would report
// every healthy container as unhealthy — and `depends_on: service_healthy` waits
// on exactly that answer. Following the sheet would break four decisions and
// build one thing that cannot work.
//
// So the direction inverts: `compose.yaml` is the source and the page quotes it.
// This is the same resolution the other nine sheet corrections got — not fixed
// by editing a read-only sheet, fixed by not copying a stale value.
//
// WHY GENERATED AND NOT TRANSCRIBED. A transcribed excerpt is correct on the day
// it is typed. This one is written by `make gen` and its checksum is compared
// either side of a run by `make check-contract`, so a compose change that the
// page has not followed is a red build rather than a page that quietly lies.
// Exactly the shape `stack.yaml` has had since B4, where the win is the same
// sentence: nobody types a value into a page again.
//
// WHY A SERVICE NAME AND NOT LINE ANCHORS. #75 records that D2 deliberately put
// no slice markers in `compose.yaml`: an operations file should not carry
// presentation anchors for six phases before anything reads them. The cut is
// therefore made the way a reader would make it — find the service, take these
// keys — and it survives every edit that does not move them.
//
// WHY THE COMMENTS ARE DROPPED. `compose.yaml` is 62 % comment by measurement,
// and the `depends_on` block alone carries seven lines of prose about issue #28.
// The excerpt is a picture of the startup order, not the file's reasoning; the
// page has its own words for that.
//
// H1 WRITES IT, H2 RENDERS IT. The block belongs to `.03 BUILD`, which is the
// next phase. What could not wait is the guarantee: the answer to #75 was never
// where the excerpt hangs, it was how it is kept from lying.

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = 'compose.yaml';
const target = 'web/content/generated/compose-api.gen.json';

// The service the case study talks about, and the two keys that carry the
// sentence the sheet captions it with: "the api never starts before the db is
// ready".
//
// `healthcheck` and `env_file` are NOT in this list and their absence is the
// correction, not an omission. There is no healthcheck block — it lives in the
// image, because distroless has no shell (ADR 0026) — and there is no
// `env_file`, because every value arrives from the Dokploy UI as runtime
// environment (ADR 0027 §6). An excerpt that showed them would be showing two
// things the file does not contain.
//
// Nothing about the container's hardening is quoted here, and that is a rule
// rather than a preference: CLAUDE.md forbids publishing the current state of a
// security question about this host, and a page that lists which capabilities
// are dropped invites the reader to work out which are not.
const SERVICE = 'api';
const KEYS = ['image', 'depends_on'];

const text = readFileSync(resolve(root, source), 'utf8');
const lines = text.split('\n');

/** Where a top-level service block begins and ends, by indentation. */
function serviceRange(name) {
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[a-z][a-z0-9_-]*:\s*$/.test(lines[i]) || /^[a-z]/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

const range = serviceRange(SERVICE);
if (range === null) {
  console.error(`  ✗ ${source} has no service ${SERVICE}`);
  process.exit(1);
}

const out = ['services:', `  ${SERVICE}:`];
const seen = new Set();

for (let i = range.start + 1; i < range.end; i++) {
  const key = /^ {4}([a-z][a-z0-9_-]*):/.exec(lines[i]);
  if (key === null) continue;
  if (!KEYS.includes(key[1])) continue;

  seen.add(key[1]);

  // The key line, then everything indented under it, up to the next key at the
  // service's own level. Comment lines and blank lines fall away.
  for (let j = i; j < range.end; j++) {
    if (j > i && /^ {4}[a-z]/.test(lines[j])) break;
    const line = lines[j];
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    out.push(line);
  }
}

// A key that stopped existing is a silent excerpt, not an error — the page would
// simply show less than it used to and nobody would know which phase dropped it.
const missing = KEYS.filter((key) => !seen.has(key));
if (missing.length > 0) {
  console.error(`  ✗ ${source}: service ${SERVICE} has no ${missing.join(', ')}`);
  process.exit(1);
}

const document = {
  comment: `Generated from ${source} by tools/gen-compose-excerpt.mjs — do not edit by hand.`,
  source,
  service: SERVICE,
  keys: KEYS,
  lines: out,
};

mkdirSync(resolve(root, dirname(target)), { recursive: true });
writeFileSync(resolve(root, target), `${JSON.stringify(document, null, 2)}\n`);
console.error(`  ✓ ${target} — ${String(out.length)} lines from ${source}`);
