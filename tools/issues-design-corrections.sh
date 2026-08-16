#!/bin/sh
# The nine design corrections from build plan chapter 7, as GitHub issues.
#
# The design sheets under docs/design/ are older than the decisions in the build
# plan and carry nine stale statements. They are READ-ONLY — none of these
# issues is fixed by editing a sheet. They are fixed in the implementation, by
# not copying the stale value, and they are closed in phase K1.
#
# Run it yourself:  sh tools/issues-design-corrections.sh
# It is idempotent; running it twice creates nothing.
set -eu

REPO=${REPO:-G1NG4R/timseil-dev}

command -v gh >/dev/null || { echo "✗ gh is not installed."; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "✗ gh is not authenticated — run: gh auth login"; exit 1; }

# ---------------------------------------------------------------- helpers

ensure_label() {
  gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null
  echo "  ✓ label: $1"
}

ensure_milestone() {
  if gh api "repos/$REPO/milestones?state=all" --jq '.[].title' | grep -Fxq "$1"; then
    echo "  · milestone exists: $1"
  else
    gh api -X POST "repos/$REPO/milestones" -f title="$1" -f description="$2" >/dev/null
    echo "  ✓ milestone: $1"
  fi
}

# ensure_issue TITLE LABEL MILESTONE  — body is read from stdin.
# Matching is on the exact title, because that is the only field a second run
# can compare without guessing. Retitling an issue by hand will therefore
# create a duplicate — that is the honest trade, not a hidden failure.
ensure_issue() {
  if printf '%s\n' "$existing" | grep -Fxq "$1"; then
    cat >/dev/null   # drain the here-document
    echo "  · exists: $1"
    return 0
  fi
  gh issue create --repo "$REPO" --title "$1" --label "$2" --milestone "$3" --body-file - >/dev/null
  echo "  ✓ created: $1"
}

# ---------------------------------------------------------------- setup

echo "→ $REPO: label and milestones"
ensure_label design-correction d4c5f9 "Stale statement in the imported design handoff — fix in K1"
ensure_milestone "K1" "Corrections and English wording — build plan stage K"
ensure_milestone "M6" "Launch — build plan stage M"

echo "→ $REPO: issues"
existing=$(gh issue list --repo "$REPO" --state all --limit 500 --json title --jq '.[].title')

# ---------------------------------------------------------------- the nine

ensure_issue "design: React Router 7 must read Next.js 16" design-correction K1 <<'EOF'
**Severity: critical.** On a site whose argument is that its claims can be
checked, a wrong stack statement damages the thesis itself.

| | |
|---|---|
| Reads | `React Router 7` |
| Must read | `Next.js 16` |
| Sheets | Case study spec rail, homepage system line, work index, terminal `stack` |

Four separate places, so it is worth grepping rather than fixing from memory.

See [ADR 0001](https://github.com/G1NG4R/timseil-dev/blob/main/docs/adr/0001-nextjs-app-router.md) and build plan
chapter 7, correction #1. The sheets are read-only — the fix is that the
implementation never copies the stale value.
EOF

ensure_issue "design: PostgreSQL 16 must read PostgreSQL 18" design-correction K1 <<'EOF'
**Severity: critical.** Same reason as the framework version: a stack number that
does not match the running system is exactly the failure this project is built to
avoid.

| | |
|---|---|
| Reads | `PostgreSQL 16` |
| Must read | `PostgreSQL 18` — pinned at 18.6 |
| Sheets | Case study spec rail |

From phase B4 the stack line is rendered from `stack.yaml`, whose versions CI
checks against `go.mod`, `package.json` and `compose.yaml` — after that, this
class of error breaks the build instead of shipping.

Build plan chapters 2.2, 7 (correction #2) and 12.3.
EOF

ensure_issue "design: health container with SQLite must read API container with Postgres" design-correction K1 <<'EOF'
**Severity: high.** The handoff (sheet `Handoff`, section 4a) describes a Go
container that parses access logs into a SQLite aggregate, with Next.js route
handlers serving the data.

That container split was rejected: **Go owns Postgres, the contract and every
derivation; Next.js renders.** There is no SQLite anywhere, and there is no
health container.

| | |
|---|---|
| Reads | health container with SQLite |
| Must read | API container with Postgres |
| Sheets | `Handoff` 4a, `Case Study Map` MAP.03 / MAP.04 |

See [ADR 0005](https://github.com/G1NG4R/timseil-dev/blob/main/docs/adr/0005-container-split-api-owns-postgres.md)
and build plan chapters 4.4 and 7 (correction #3).
EOF

ensure_issue "design: German paragraphs in the English interface" design-correction K1 <<'EOF'
**Severity: high.** The interface language is English. Roughly six paragraphs in
the sheets are German and would ship as-is if copied.

| | |
|---|---|
| Sheets | Homepage, Case Study 02, About, 404 |

Phase K1 translates them and unifies the placeholders to `[SOON]`,
`[PLACEHOLDER]` and `[ASSET]`. Done when no German paragraph is left in the
English build.

Build plan chapter 7 (correction #4), phase K1.
EOF

ensure_issue "design: '.04 OPERATIONS' claims the stack has no Prometheus" design-correction K1 <<'EOF'
**Severity: high.** The case study section `.04 OPERATIONS` states the site runs
"without Prometheus" and derives its numbers from Traefik access logs.

Prometheus is part of the stack. Log parsing was rejected for three operational
reasons: Dokploy truncates container logs nightly, Traefik exports metrics
natively, and a parser produces silent zeros where invariant 1 demands
`— NO DATA`.

| | |
|---|---|
| Reads | "without Prometheus" |
| Must read | Prometheus measures, Postgres serves |
| Sheets | Case Study 02 `.04 OPERATIONS`, `Case Study Map` |

See [ADR 0007](https://github.com/G1NG4R/timseil-dev/blob/main/docs/adr/0007-prometheus-instead-of-log-parsing.md)
and build plan chapters 4.3 and 7 (correction #5).
EOF

ensure_issue "design: [FOLGT] must read [SOON]" design-correction K1 <<'EOF'
**Severity: medium.** A German placeholder in an English interface.

| | |
|---|---|
| Reads | `[FOLGT]` |
| Must read | `[SOON]` |
| Sheets | `Homepage Themes` |

Part of the placeholder unification in K1: `[SOON]`, `[PLACEHOLDER]`, `[ASSET]`.

Build plan chapter 7 (correction #6).
EOF

ensure_issue "design: scroll pin claims it switches 5 systems, there will be 2" design-correction K1 <<'EOF'
**Severity: medium.** The scroll choreography pins a section and switches through
five system rows. At launch there are **two** systems — `vat-check` (queued) and
`timseil-dev` (live).

A pin that switches two rows looks like unused machinery. **Decision: disable the
pin until system 03 exists.** The big moment on launch day is the boot sequence,
not this.

| | |
|---|---|
| Sheets | `Scroll Choreography` |

Build plan chapter 7 (correction #7 and the note below the table), phase I2.
EOF

ensure_issue "design: [PLACEHOLDER DATA] on the contribution graph" design-correction K1 <<'EOF'
**Severity: medium.** The contribution graph carries a `[PLACEHOLDER DATA]`
marker. It disappears when the graph is wired to the API in phase C5 — real
GitHub data, fetched over GraphQL, cached for an hour.

One detail that is easy to get wrong: **do not use GitHub's own `color` values.**
The design defines its own levels `--l0` … `--l4`.

| | |
|---|---|
| Sheets | Homepage (contribution graph) |

Build plan chapter 7 (correction #8), phase C5.
EOF

ensure_issue "design: terminal inventory is missing the cv command" design-correction K1 <<'EOF'
**Severity: low.** The terminal command inventory lists every command except
`cv` — which matters, because `cv` is the **only** way to reach the CV page.

| | |
|---|---|
| Reads | inventory without `cv` |
| Must read | inventory with `cv` |
| Sheets | `Handoff` (inventory), `Homepage` (command register) |

Build plan chapter 7 (correction #9), phases J1 and J2.
EOF

# ---------------------------------------------------------------- and one more

ensure_issue "docs: enable the live badges in the README" documentation M6 <<'EOF'
The three Shields.io endpoint badges from build plan chapter 12.4 sit commented
out at the top of `README.md`. They read `https://timseil.dev/api/badge/*` —
endpoints that do not exist yet, on a domain that is not live yet.

**Switch them on in M6**, once the site is live and the badge handlers answer.
Uncomment the block and delete the note above it.

Two things to check when doing so:

- `— NO DATA` applies here as well. With no measurement series, the badge must
  say so rather than show a zero.
- The badge handlers themselves are **not assigned to a phase in the build
  plan** — chapter 12.4 describes them, stage C never lists them. They need a
  home in C2 or C7, otherwise this issue cannot be closed. Tracked in
  `backlog.md`.
EOF

echo ""
echo "Verify:"
echo "  gh issue list --repo $REPO --label design-correction"
echo "  gh issue list --repo $REPO --milestone K1"
