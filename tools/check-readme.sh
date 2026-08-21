#!/bin/sh
# The quickstart is an instruction, and an instruction that stopped working is
# worse than none.
#
#   check-readme.sh [repo-root]           default: .
#   check-readme.sh --print [repo-root]   write the block to stdout and exit
#
# Two halves, and this is the fast one: every `make <target>` in the quickstart
# names a target the Makefile actually has. That catches the common case — a
# renamed target — in milliseconds and without Docker, so it belongs in
# `make check`.
#
# The slow half is the `quickstart` job in ci.yml, which RUNS the block. It
# needs npm ci, two image builds and a compose stack, so it runs on pushes to
# main and on the weekly schedule rather than on every pull request: E1's
# criterion is PR feedback under five minutes, and "does the guide still work"
# is a question about months rather than about this diff. `--print` is how that
# job gets the block, so the thing it executes is the thing the README shows and
# not a copy somebody kept in step by hand.
#
# The third of the build plan's four documentation-drift checks (chapter 12.2):
# "Die Anleitung, die seit vier Monaten nicht mehr funktioniert."
set -eu

print_only=0
if [ "${1:-}" = "--print" ]; then print_only=1; shift; fi
root=${1:-.}
readme=$root/README.md

[ -f "$readme" ] || { printf '  – skip: %s does not exist\n' "$readme"; exit 0; }

# The first fenced block after the Quickstart heading. Deliberately literal
# about the heading: if it is ever renamed, this goes red rather than quietly
# checking an empty string.
block=$(awk '
  /^## Quickstart[[:space:]]*$/ { seen = 1; next }
  seen && /^```/                { infence = !infence; if (!infence) exit; next }
  seen && infence               { print }
' "$readme")

if [ -z "$block" ]; then
  printf '  ✗ no fenced block under `## Quickstart` in README.md\n'
  printf '    the heading was renamed, or the block was removed — either way this\n'
  printf '    check was about to pass by reading nothing\n'
  exit 1
fi

if [ "$print_only" -eq 1 ]; then
  printf '%s\n' "$block"
  exit 0
fi

targets=$(printf '%s\n' "$block" \
  | sed 's/#.*//' \
  | grep -oE '\bmake [a-z][a-z0-9-]*' \
  | awk '{print $2}' | sort -u)

if [ -z "$targets" ]; then
  printf '  ✗ the quickstart block names no make target at all\n'
  exit 1
fi

fail=0
for t in $targets; do
  if grep -qE "^$t:" "$root/Makefile"; then
    continue
  fi
  printf '  ✗ the quickstart says `make %s` and the Makefile has no such target\n' "$t"
  fail=1
done

[ "$fail" -eq 0 ] || exit 1
printf '  ✓ %s quickstart targets, all of them real\n' "$(printf '%s\n' "$targets" | grep -c .)"
