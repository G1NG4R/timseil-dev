#!/bin/sh
# Known vulnerabilities in what this repository actually ships.
#
#   check-vuln.sh [repo-root]     default: .
#
# Two halves, both blocking:
#
#   govulncheck over api/  — and it is not a dependency scanner. It walks the
#     call graph and reports a CVE only when some path in THIS program reaches
#     the affected symbol. A vulnerable function nobody calls is not a finding,
#     which is the difference between a gate people act on and a list people
#     stop reading.
#
#   npm audit over web/ with --omit=dev. What is not in the bundle cannot be
#     exploited through the site; a devDependency advisory is a thing to fix on
#     a Tuesday, not a thing that blocks a merge. --audit-level=high is the
#     line the build plan draws (chapter 5.2).
#
# **This target is deliberately NOT in `make check`.** It can turn red on a
# tree nobody touched, because the input is somebody else's disclosure
# schedule. A gate in the check chain that breaks without a code change is a
# gate people learn to work around, and then it protects nothing. It belongs in
# the pipeline plus a weekly run — ADR 0031 states the rule.
#
# govulncheck is fetched by version rather than installed: `go run pkg@version`
# resolves and caches without touching api/go.mod, so the vulnerability scanner
# never becomes a line in the dependency graph it is scanning. The version is
# pinned here for the same reason every action is pinned by SHA.
set -eu

root=${1:-.}
govulncheck=golang.org/x/vuln/cmd/govulncheck@v1.7.0

fail=0

# A missing toolchain is a skip on a laptop and a failure on a runner. E1 paid
# for that distinction once already: tools/check-node.sh skipped itself where
# no node existed and the job went green having checked nothing.
missing() { # missing <tool> <what it would have checked>
  if [ -n "${CI:-}" ]; then
    printf '  ✗ %s is not available and CI is set — %s went unchecked\n' "$1" "$2"
    fail=1
  else
    printf '  – skip: %s is not available (%s)\n' "$1" "$2"
  fi
}

# ------------------------------------------------------------------- go

if [ ! -d "$root/api" ]; then
  printf '  – skip: %s/api does not exist yet\n' "$root"
elif ! command -v go >/dev/null 2>&1; then
  missing go "the api module"
else
  # Output held back until it means something: govulncheck narrates its
  # download and then says "No vulnerabilities found", and two lines of nothing
  # on every green run is how a check stops being read.
  if out=$(cd "$root/api" && go run "$govulncheck" ./... 2>&1); then
    printf '  ✓ govulncheck: nothing reachable\n'
  else
    printf '  ✗ govulncheck reports a vulnerability this program can reach\n'
    printf '%s\n' "$out" | sed 's/^/    /'
    fail=1
  fi
fi

# ------------------------------------------------------------------ web

if [ ! -f "$root/web/package-lock.json" ]; then
  printf '  – skip: %s/web has no lockfile yet\n' "$root"
elif ! command -v npm >/dev/null 2>&1; then
  missing npm "the web dependencies"
else
  if out=$(cd "$root/web" && npm audit --audit-level=high --omit=dev 2>&1); then
    printf '  ✓ npm audit: nothing high or above in what ships\n'
  else
    printf '  ✗ npm audit reports a high or critical advisory in a shipped dependency\n'
    printf '%s\n' "$out" | sed 's/^/    /'
    fail=1
  fi

  # Informational only, and separated so that the exit code above is the one
  # that means something. A devDependency advisory is worth seeing and is not
  # worth blocking a merge over.
  if ! (cd "$root/web" && npm audit --audit-level=high >/dev/null 2>&1); then
    printf '  – note: there is a high advisory in a devDependency (not blocking)\n'
    printf '    → cd web && npm audit\n'
  fi
fi

[ "$fail" -eq 0 ] || exit 1
