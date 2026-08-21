#!/bin/sh
# The declared runtime versions and the images that actually provide them.
#
#   check-versions.sh [repo-root]     default: .
#
# Two comparisons, and both of them are a bill this repository has already paid:
#
#   .nvmrc          vs the node major in web/Dockerfile and web/Dockerfile.dev
#   api/go.mod      vs the go major.minor in api/Dockerfile and Dockerfile.dev
#
# The go one cost 21 reachable standard-library vulnerabilities. go.mod said
# `go 1.26.0`, actions/setup-go reads that file and pins the toolchain, and the
# image had been building on golang:1.26-alpine — six patch releases ahead — for
# a phase. govulncheck found it on the first pipeline run; nothing in `make
# check` could have, because nothing held the two files against each other.
#
# The node one was found the same day, from the other direction: Dependabot
# offered node 26 for the dev image while .nvmrc, stack.yaml and the page all
# say 24. CLAUDE.md refuses Node 26 until it is LTS (issue #46), and that
# refusal lived in prose only.
#
# What is compared is the DECLARED width, not the patch. A Dockerfile pins
# `golang:1.26-alpine` on purpose — it wants the newest patch of that line — so
# comparing 1.26.6 against 1.26 has to succeed. What must not differ is the
# line itself: 1.26 against 1.27, or node 24 against node 26.
#
# The digest is irrelevant here and is cut off before anything is read. Whether
# it IS a digest is tools/check-dockerfiles.sh's rule 1.
set -eu

root=${1:-.}
fail=0

# tag_of <file> <image-name> — the tag of the first FROM or ARG naming that
# image, digest removed. Empty when the file does not mention it.
tag_of() {
  [ -f "$1" ] || return 0
  sed -n "s/.*[ =]$2:\([A-Za-z0-9._-]*\).*/\1/p" "$1" | head -1
}

compare() { # compare <what> <declared> <file> <image> <tag-to-version>
  what=$1; want=$2; file=$3; image=$4
  tag=$(tag_of "$root/$file" "$image")
  [ -n "$tag" ] || return 0
  have=${tag%%-*}
  if [ "$have" != "$want" ]; then
    printf '  ✗ %s says %s, %s builds on %s:%s\n' "$what" "$want" "$file" "$image" "$tag"
    fail=1
  else
    printf '  ✓ %s %s ← %s\n' "$image" "$have" "$file"
  fi
}

# ------------------------------------------------------------------ node
#
# .nvmrc carries the major alone, which is also what the tag carries.
if [ -f "$root/.nvmrc" ]; then
  node_want=$(tr -d ' \t\n\r' < "$root/.nvmrc" | sed 's/^v//' | cut -d. -f1)
  if [ -z "$node_want" ]; then
    printf '  ✗ .nvmrc is empty — nothing declares the Node version\n'
    fail=1
  else
    compare .nvmrc "$node_want" web/Dockerfile node
    compare .nvmrc "$node_want" web/Dockerfile.dev node
  fi
fi

# -------------------------------------------------------------------- go
#
# go.mod carries major.minor.patch since the toolchain bump; the tag carries
# major.minor. The patch is deliberately dropped: the image wants the newest
# one of its line, and demanding they match exactly would make every upstream
# release a red build.
if [ -f "$root/api/go.mod" ]; then
  go_want=$(sed -n 's/^go \([0-9]*\.[0-9]*\).*/\1/p' "$root/api/go.mod" | head -1)
  if [ -z "$go_want" ]; then
    printf '  ✗ api/go.mod has no `go` directive\n'
    fail=1
  else
    compare api/go.mod "$go_want" api/Dockerfile golang
    compare api/go.mod "$go_want" api/Dockerfile.dev golang
  fi
fi

[ "$fail" -eq 0 ] || exit 1
