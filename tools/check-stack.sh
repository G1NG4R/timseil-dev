#!/bin/sh
# One rule, and it is the reason stack.yaml exists at all:
#
#   Every entry either resolves its version out of a file in this repository, or
#   it carries no version. A literal version in stack.yaml is refused.
#
# The failure this prevents is the one the drafts actually had: "React Router 7"
# and "PostgreSQL 16" printed on a page that ran neither. Not a typo — a claim
# nobody re-checked. Here a wrong stack line is a red check, and adding a
# dependency without adding its line leaves the page silent rather than wrong.
#
# The work is done by api/cmd/genstack -verify, because reading a caret range
# out of package.json, a require line out of go.mod and an image tag out of a
# compose file is three parsers, and awk would be the fourth. gopkg.in/yaml.v3
# is already a direct dependency of the api module, so this costs nothing new.
# The Go side is held to its broken cases in api/internal/stack/stack_test.go;
# this script is held to its own in tools/selftest.sh.
#
# usage: check-stack.sh [repo-root]
# CHECK_STACK_API_DIR overrides where the api module lives — the seam the
# selftest needs to point a throwaway tree at the real module.
set -eu

api=${CHECK_STACK_API_DIR:-api}
root=${1:-.}

[ -f "$root/stack.yaml" ] || { printf '  – stack.yaml does not exist yet\n'; exit 0; }
[ -d "$api" ] || { printf '  – %s does not exist yet\n' "$api"; exit 0; }

# Absolute, because the next line leaves this directory.
root=$(cd "$root" && pwd)

cd "$api" && go run ./cmd/genstack -verify -root "$root"
