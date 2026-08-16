#!/bin/sh
# The running Node major must match .nvmrc — the same file actions/setup-node
# reads in CI. If they drift, the machine builds something else than the
# pipeline will, and nobody finds out until the pipeline disagrees.
#
#   check-node.sh [path-to-nvmrc]     default: .nvmrc
#
# Only even Node majors ever become LTS. Odd lines (23, 25, 27) are never
# promoted and go out of support after about eight months.
#
# CHECK_NODE_BIN points at the interpreter to ask. It exists so the selftest can
# hand this script a known version instead of depending on the machine it runs on.
set -eu

nvmrc=${1:-.nvmrc}
node_bin=${CHECK_NODE_BIN:-node}

[ -f "$nvmrc" ] || { printf '  ✗ %s is missing — nothing declares the Node version\n' "$nvmrc"; exit 1; }

want=$(tr -d ' \t\n\r' < "$nvmrc" | sed 's/^v//' | cut -d. -f1)

if [ -z "$want" ]; then
  printf '  ✗ %s is empty\n' "$nvmrc"
  exit 1
fi

if [ $((want % 2)) -ne 0 ]; then
  printf '  ✗ %s pins Node %s — odd majors never become LTS\n' "$nvmrc" "$want"
  exit 1
fi

if ! command -v "$node_bin" >/dev/null 2>&1; then
  printf '  – skip: node is not installed (needed from phase G1, and by make design)\n'
  exit 0
fi

running=$("$node_bin" -v | sed 's/^v//')
have=$(printf '%s' "$running" | cut -d. -f1)

if [ "$have" != "$want" ]; then
  printf '  ✗ running node v%s, %s says %s\n' "$running" "$nvmrc" "$want"
  printf '    → mise install     (or: mise use -g node@%s)\n' "$want"
  exit 1
fi

printf '  ✓ node v%s matches %s\n' "$running" "$nvmrc"
