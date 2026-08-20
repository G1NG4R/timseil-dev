#!/bin/sh
# golangci-lint over api/, with the ruleset and every exclusion in .golangci.yml.
#
#   check-lint.sh [repo-root]     default: .
#
# The linter is NOT a Go tool directive in api/go.mod, and that is deliberate:
# it would attach roughly a hundred `// indirect` lines to a module whose own
# dependency list is eleven, drown issue #63's Dependabot rule in build-tool
# updates, and put lint dependencies into the SBOM E3 builds as if they were
# dependencies of the program. It is a binary, and binaries live outside go.mod.
#
# **The skip has a floor.** Without the linter installed this exits 0 and says
# so, exactly like tools/check-node.sh without node — that is what keeps
# `make check` runnable on a machine that has not installed it yet. But E1
# recorded what a silent skip costs: check-node.sh skipped itself on a runner
# with no node and the job went green having checked nothing at all. So when CI
# is set, a missing linter is a failure rather than a skip. A pipeline that
# reports success for a check it never ran is worse than no check.
#
# CHECK_LINT_BIN points at the binary to run. It exists so tools/selftest.sh can
# hand this script something known instead of depending on the machine.
set -eu

root=${1:-.}
bin=${CHECK_LINT_BIN:-golangci-lint}

[ -d "$root/api" ] || { printf '  – skip: %s/api does not exist yet\n' "$root"; exit 0; }
[ -f "$root/.golangci.yml" ] || {
  printf '  ✗ .golangci.yml is missing — the linter would run its own defaults,\n'
  printf '    which is a different ruleset than the one CI blocks on\n'
  exit 1
}

if ! command -v "$bin" >/dev/null 2>&1; then
  if [ -n "${CI:-}" ]; then
    printf '  ✗ golangci-lint is not installed and CI is set\n'
    printf '    → the job must install it; skipping here would report a check that never ran\n'
    exit 1
  fi
  printf '  – skip: golangci-lint is not installed\n'
  printf '    → https://golangci-lint.run/docs/welcome/install/ (version in .github/workflows/ci.yml)\n'
  exit 0
fi

# Absolute, because the next line leaves this directory — same reason
# check-stack.sh takes it.
config=$(cd "$root" && pwd)/.golangci.yml

cd "$root/api" && "$bin" run --config "$config" --timeout 5m ./...
printf '  ✓ golangci-lint\n'
