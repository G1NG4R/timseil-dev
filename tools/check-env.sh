#!/bin/sh
# Every environment variable the api reads, in every place that has to name it.
#
#   check-env.sh [repo-root]     default: .
#
# The source is api/internal/config/config.go: one const block, one Env* per
# variable, and nothing reads the environment anywhere else (the package comment
# says why). Each name is then required in three places:
#
#   .env.example          — or a fresh clone comes up missing it
#   docs/runbooks/api.md  — or the person debugging at 2am has no table row
#   compose.dev.yaml      — or `make dev` starts an api that cannot see it
#
# **This bill has been paid three times.** ADR 0023: C5 added GITHUB_TOKEN, C6
# added five variables at once, C7 added two, and each time something was
# missed on the first pass, because adding one variable means editing six files
# and nothing holds them against each other.
#
# The test files are deliberately NOT checked. config_test.go's `base` map and
# server_test.go's testConfig() are the other two of the six, and a mechanical
# check on them would be satisfied by the name appearing in a comment — a green
# tick for a fixture that still does not set the value. Naming the gap is worth
# more than pretending to close it. ADR 0032 §4.
#
# The second half of the build plan's NEXT_PUBLIC_ rule lives here too (chapter
# 11.4). The first half — reading one in TypeScript — is a lint rule in
# web/eslint.config.mjs since E2. This half is the one that matters more: the
# prefix ships the VALUE to the browser, and the value is set in these files.
set -eu

root=${1:-.}
config=$root/api/internal/config/config.go
fail=0

[ -f "$config" ] || { printf '  – skip: %s does not exist yet\n' "$config"; exit 0; }

# One Env* constant per line, and the value is the variable name. Deliberately
# blunt: if the const block ever stops looking like this, this check goes quiet
# rather than wrong — which is why the count is asserted below.
names=$(sed -n 's/^[[:space:]]*Env[A-Za-z0-9_]*[[:space:]]*=[[:space:]]*"\([A-Z][A-Z0-9_]*\)".*/\1/p' "$config")
count=$(printf '%s\n' "$names" | grep -c . || true)

if [ "$count" -eq 0 ]; then
  printf '  ✗ no Env* constants found in %s — the parser has lost the const block\n' "$config"
  printf '    a check that reads nothing reports success on everything\n'
  exit 1
fi

need() { # need <name> <file> <pattern> <what is missing>
  [ -f "$root/$2" ] || return 0
  grep -qE "$3" "$root/$2" && return 0
  printf '  ✗ %s is not in %s — %s\n' "$1" "$2" "$4"
  fail=1
}

for n in $names; do
  need "$n" .env.example            "^#? *$n=" \
    "a fresh clone would come up without it"
  need "$n" docs/runbooks/api.md    "\`$n\`" \
    "whoever debugs this at 2am has no row to read"
  need "$n" compose.dev.yaml        "(^ +$n:|\\\$\{$n)" \
    "make dev would start an api that cannot see it"
done

# NEXT_PUBLIC_ ships the value to the browser at build time, and it cannot be
# taken back once a build has gone out. A name that ends like a credential must
# never carry that prefix.
secretish='TOKEN|SECRET|PASSWORD|PASSWD|PEPPER|CREDENTIAL|API_?KEY|PRIVATE_KEY|DSN'
for f in .env.example compose.yaml compose.dev.yaml; do
  [ -f "$root/$f" ] || continue
  hits=$(grep -nE "NEXT_PUBLIC_[A-Z0-9_]*($secretish)" "$root/$f" | grep -v '^[0-9]*: *#' || true)
  if [ -n "$hits" ]; then
    printf '  ✗ %s puts a secret behind NEXT_PUBLIC_ — that prefix sends it to the browser\n' "$f"
    printf '%s\n' "$hits" | sed 's/^/    /'
    fail=1
  fi
done

[ "$fail" -eq 0 ] || exit 1
printf '  ✓ %s variables, each in .env.example, the runbook and compose.dev.yaml\n' "$count"
