// The tests that make this page's one rule enforceable: every number on
// /privacy can be traced to a file that enforces it, and every sentence the
// code has outgrown is gone for good.
//
// A LEGAL PAGE IS THE ONE PLACE ON THIS SITE WHERE A STALE SENTENCE IS NOT A
// COSMETIC DEFECT. Everywhere else a wrong number is embarrassing; here it is a
// statement about what happens to somebody else's data. So the checks below are
// deliberately blunt: an exact set of permitted brackets, a list of banned
// phrases, and a sweep that refuses any duration it cannot trace to a config
// file or a constant.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CONTENT, HERO, PANEL, PLACEHOLDERS, SHORT_VERSION, type Block } from "./content.ts";
import { FIELD_COUNT } from "./readout.ts";
import { RATE_LIMIT_MINUTES, RETENTION_DAYS } from "./retention.ts";
import { SECTIONS } from "./sections.ts";

const REPO = new URL("../../../", import.meta.url);

function blockText(block: Block): string[] {
  switch (block.kind) {
    case "p":
    case "note":
      return [block.text];
    case "numbered":
      return [...block.items];
    case "table":
      return [...block.head, ...block.rows.flat()];
  }
}

/** Every string a reader can see on this page, in one array. */
function allText(): string[] {
  return [
    HERO.eyebrow,
    HERO.title,
    HERO.lede,
    HERO.sub,
    PANEL.title,
    PANEL.badge,
    PANEL.footer,
    PANEL.pending,
    ...SHORT_VERSION.map((line) => line.text),
    ...Object.values(CONTENT).flatMap((blocks) => blocks.flatMap(blockText)),
  ];
}

void test("every section has prose, and no prose belongs to a section that is gone", () => {
  const ordered = SECTIONS.map((section) => section.id);
  assert.deepEqual(Object.keys(CONTENT).sort(), [...ordered].sort());
  for (const id of ordered) {
    assert.ok(CONTENT[id].length > 0, `${id} has a heading and nothing under it`);
  }
});

void test("no string on the page is empty", () => {
  for (const text of allText()) assert.notEqual(text.trim().length, 0);
});

// ── The brackets ───────────────────────────────────────────────────────────
//
// lib/about/content.test.ts' device. The sheet leaves seven brackets in this
// page's prose; five of them were answerable from the repository and are
// answered. The two that remain are facts only the operator has.

void test("the only brackets left are the ones on the list", () => {
  const found = new Set<string>();
  for (const text of allText()) {
    for (const match of text.matchAll(/\[[^\]]*\]/g)) found.add(match[0]);
  }
  assert.deepEqual([...found].sort(), [...PLACEHOLDERS].sort());
});

void test("each listed placeholder is actually still in the text", () => {
  // A list that outlives its brackets is a list nobody trims. If one is filled
  // in, this fails until it is struck off — which is the only way the set ever
  // shrinks on purpose.
  const joined = allText().join("\n");
  for (const placeholder of PLACEHOLDERS) {
    assert.ok(joined.includes(placeholder), `${placeholder} is no longer used — remove it from PLACEHOLDERS`);
  }
});

// ── The sentences the code outgrew ─────────────────────────────────────────

void test("none of the six sentences the sheet drew survives", () => {
  const banned: [RegExp, string][] = [
    [/nothing is written to a database/i, "false since H8: contact_messages stores the row"],
    [/neither is stored/i, "dwell_ms is a column; only the honeypot is discarded"],
    [/\bumami\b/i, "there is no analytics on this machine"],
    [/\[ANALYTICS TOOL\]/i, "there is no such tool to name"],
    [/\bpage views\b/i, "nothing counts them"],
    [/\bts\.lang\b/i, "ADR 0046: there is no stored language preference"],
    [/\bts404\.best\b/i, "H11 is after launch; a key nothing writes is invariant 1 inverted"],
    [/\btwo entries\b/i, "one exists"],
    [/\bthree local entries\b/i, "one exists"],
    [/no third party in the request path/i, "scoped in 07.05 to what this application does"],
  ];
  const joined = allText().join("\n");
  for (const [pattern, why] of banned) {
    assert.doesNotMatch(joined, pattern, why);
  }
});

// ── Every duration is one somebody enforces ────────────────────────────────
//
// INVARIANT 1, WRITTEN FOR A PAGE OF PROSE. "Keine erfundenen Zahlen" is easy
// to hold to in a component that renders an API field and easy to lose in a
// paragraph, because a paragraph can simply say fourteen days and nobody
// notices that nothing deletes anything after fourteen days. So: find every
// duration in the text, and refuse any that does not appear in this table —
// where each entry names the file that makes it true and is checked against it.

function lokiRetentionDays(): number {
  const source = readFileSync(new URL("ops/loki/loki.yaml", REPO), "utf8");
  const match = /^\s*retention_period:\s*(\d+)h\s*$/m.exec(source);
  assert.ok(match !== null, "ops/loki/loki.yaml no longer states retention_period in hours");
  const hours = Number.parseInt(match[1], 10);
  assert.equal(hours % 24, 0, "a retention that is not whole days cannot be said in days on a page");
  return hours / 24;
}

void test("every duration in the prose is one a file in this repository enforces", () => {
  const enforced = new Map<string, string>([
    [`${String(lokiRetentionDays())} days`, "ops/loki/loki.yaml — retention_period"],
    [`${String(RETENTION_DAYS)} days`, "api/internal/contact/policy.go — retentionWindow"],
    [`${String(RATE_LIMIT_MINUTES)} minutes`, "api/internal/contact/policy.go — RateLimitWindow"],
  ]);

  const seen = new Set<string>();
  for (const text of allText()) {
    for (const match of text.matchAll(/\b(\d+)\s+(minute|hour|day|week|month|year)s?\b/g)) {
      const phrase = `${match[1]} ${match[2]}s`;
      assert.ok(
        enforced.has(phrase),
        `"${phrase}" is on the page and nothing in this repository enforces it: ${text}`,
      );
      seen.add(phrase);
    }
  }

  // And the other way: a row here that the page never says is a claim nobody
  // makes, which means the table has started describing the repository instead
  // of the page.
  assert.deepEqual([...seen].sort(), [...enforced.keys()].sort());
});

void test("the retention promise is on the page in digits", () => {
  const joined = allText().join("\n");
  assert.match(joined, new RegExp(`\\b${String(RETENTION_DAYS)} days\\b`));
  // Spelled out, a number is invisible to the sweep above.
  assert.doesNotMatch(joined, /\b(fourteen|thirty|ten)\b/i);
});

// ── The table that is a count ──────────────────────────────────────────────

void test("the local storage table has exactly one row, and it is ts.theme", () => {
  const table = CONTENT["07.04"].find((block) => block.kind === "table");
  assert.equal(table?.kind, "table");
  assert.equal(table.rows.length, 1, "invariant 9 names two keys and one of them is H11's, after launch");
  assert.equal(table.rows[0][0], "ts.theme");
});

void test("the prose above that table says one entry, not two and not three", () => {
  const first = CONTENT["07.04"][0];
  assert.equal(first.kind, "p");
  assert.match(first.text, /^One entry\b/);
});

void test("the panel's own count is the number of lines it renders", () => {
  assert.ok(PANEL.footer.startsWith(`${String(FIELD_COUNT)} `), PANEL.footer);
});

void test("the form table names the database, because that is what happens", () => {
  const table = CONTENT["07.06"].find((block) => block.kind === "table");
  assert.equal(table?.kind, "table");
  const stored = table.rows.map((row) => row.at(-1) ?? "");
  assert.ok(
    stored.every((where) => where.includes("Database")),
    "every field the form sends is written to contact_messages before the relay sees it",
  );
  assert.ok(
    table.rows.some((row) => /how long the form was open/i.test(row[0])),
    "dwell_ms is stored and the page has to say so",
  );
});

// ── Tone ───────────────────────────────────────────────────────────────────

void test("no section shouts [SOON] at a reader of a legal document", () => {
  assert.doesNotMatch(allText().join("\n"), /\[SOON\]|— NO DATA/);
});

void test("the short version is eight lines and each one is answered below", () => {
  assert.equal(SHORT_VERSION.length, 8);
  for (const line of SHORT_VERSION) {
    assert.equal(typeof line.yes, "boolean");
    assert.notEqual(line.text.trim().length, 0);
  }
});

void test("every table row is as wide as its head", () => {
  for (const [id, blocks] of Object.entries(CONTENT)) {
    for (const block of blocks) {
      if (block.kind !== "table") continue;
      for (const row of block.rows) {
        assert.equal(row.length, block.head.length, `${id}: ${row.join(" | ")}`);
      }
    }
  }
});
