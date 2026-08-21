#!/bin/sh
# go.mod and go.sum describe exactly what the module uses — no more, no less.
#
#   check-tidy.sh [module-dir]     default: api
#
# `go mod tidy -diff` reports what tidy WOULD change and changes nothing. That
# is why this is short: check-contract has to hash thirteen files either side of
# a generator run because the generators offer nothing like it, and tidy does.
#
# What it catches, both of which already happened here:
#
#   go.mod was untidy from B2 until B3 — goose and oapi-codegen/runtime sat as
#   `// indirect` while both were imported directly. It was straightened out by
#   accident while adding rapid, not by anything noticing.
#
#   go.sum was missing 49 transitive checksums for as long as anybody can tell,
#   until the commit that introduced this check. A missing checksum is not a
#   broken build — the module cache has the bytes — but it is a build that
#   cannot prove it fetched the same bytes as the last one, and E3 constructs an
#   SBOM from this file.
#
# Deterministic, so it belongs in `make check` rather than beside the scanners:
# the same tree gives the same answer forever (ADR 0031 §1).
#
# CHECK_TIDY_DIR overrides the module directory — the seam tools/selftest.sh
# uses to point this at a throwaway module instead of the real one.
set -eu

dir=${CHECK_TIDY_DIR:-${1:-api}}

[ -f "$dir/go.mod" ] || { printf '  – skip: %s has no go.mod\n' "$dir"; exit 0; }

if ! command -v go >/dev/null 2>&1; then
  if [ -n "${CI:-}" ]; then
    printf '  ✗ go is not installed and CI is set — tidiness went unchecked\n'
    exit 1
  fi
  printf '  – skip: go is not installed\n'
  exit 0
fi

if (cd "$dir" && go mod tidy -diff >/dev/null 2>&1); then
  printf '  ✓ go.mod and go.sum are tidy\n'
  exit 0
fi

printf '  ✗ %s/go.mod or go.sum is not tidy — run: cd %s && go mod tidy\n' "$dir" "$dir"
(cd "$dir" && go mod tidy -diff 2>&1) | sed 's/^/    /' | head -20
exit 1
