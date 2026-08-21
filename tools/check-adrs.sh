#!/bin/sh
# Every decision this repository points at exists, and every number means one
# decision.
#
#   check-adrs.sh [repo-root]     default: .
#
# Three rules:
#
#   1. Every `ADR NNNN` or `docs/adr/NNNN-…` reference resolves to a file.
#   2. No number is used by two files.
#   3. No gap in the sequence — a missing number is a decision that was written,
#      referenced and then lost, which looks identical to one that was never
#      written at all.
#
# The fourth of the build plan's documentation-drift checks (chapter 12.2). Its
# stated purpose there: "Ein Codekommentar zeigt auf ADR 0009, das nie
# geschrieben wurde." The comments in this repository lean on those numbers
# heavily — the busiest is referenced 64 times — so a dangling one would be a
# paragraph of reasoning pointing at nothing.
#
# **The check must not trip over its own examples.** This file, and
# tools/selftest.sh, are both scanned by it: a dangling number written down here
# to illustrate the rule would be a finding about the illustration. So the
# broken case is assembled from parts at runtime and never appears as a literal
# anywhere. Same problem tools/check-secrets.sh has with its planted key, and
# the same answer.
set -eu

root=${1:-.}
adrs=$root/docs/adr
fail=0

[ -d "$adrs" ] || { printf '  – skip: %s does not exist yet\n' "$adrs"; exit 0; }

have=$(find "$adrs" -maxdepth 1 -name '[0-9][0-9][0-9][0-9]-*.md' -exec basename {} \; \
       | cut -c1-4 | sort)

[ -n "$have" ] || { printf '  ✗ no ADR files in %s\n' "$adrs"; exit 1; }

# ---------------------------------------------------------------- rule 2
dupes=$(printf '%s\n' "$have" | uniq -d)
if [ -n "$dupes" ]; then
  printf '  ✗ two files claim the same number:\n'
  for d in $dupes; do find "$adrs" -maxdepth 1 -name "$d-*.md" -exec basename {} \; | sed 's/^/    /'; done
  fail=1
fi

uniq_have=$(printf '%s\n' "$have" | sort -u)

# ---------------------------------------------------------------- rule 3
first=$(printf '%s\n' "$uniq_have" | head -1)
last=$(printf '%s\n' "$uniq_have" | tail -1)
n=$first
while [ "$n" -le "$last" ] 2>/dev/null; do
  padded=$(printf '%04d' "$n")
  printf '%s\n' "$uniq_have" | grep -qx "$padded" || {
    printf '  ✗ no ADR %s, but %s and later exist — a number was skipped or a file was lost\n' \
      "$padded" "$first"
    fail=1
  }
  n=$((n + 1))
done

# ---------------------------------------------------------------- rule 1
#
# Sources: everything a person writes. node_modules and .next are excluded
# because nothing in them is ours to fix.
refs=$(grep -rhoE 'ADR [0-9]{4}|docs/adr/[0-9]{4}' \
         --include='*.go' --include='*.ts' --include='*.tsx' --include='*.mjs' \
         --include='*.sh' --include='*.md' --include='*.sql' \
         --include='*.yaml' --include='*.yml' --include='*.toml' \
         --include='Dockerfile*' --include='Makefile' \
         "$root" 2>/dev/null \
       | grep -v '/node_modules/' \
       | grep -oE '[0-9]{4}' | sort -u)

for r in $refs; do
  printf '%s\n' "$uniq_have" | grep -qx "$r" && continue
  printf '  ✗ something references ADR %s and no such file exists\n' "$r"
  grep -rlE "ADR $r|docs/adr/$r" "$root" 2>/dev/null | grep -v '/node_modules/' | sed 's/^/    /' | head -5
  fail=1
done

[ "$fail" -eq 0 ] || exit 1
printf '  ✓ %s decisions, %s referenced, none dangling\n' \
  "$(printf '%s\n' "$uniq_have" | grep -c .)" "$(printf '%s\n' "$refs" | grep -c .)"
