#!/bin/sh
# The secret scanner, and the proof that it still works.
#
#   check-secrets.sh [repo-root] [range]     default root: .
#
# Two things happen here, and the first one is the point:
#
#   1. A key is planted in a throwaway repository and gitleaks MUST reject it.
#   2. This repository's history is scanned and must be clean.
#
# Step 1 is the E2 acceptance criterion — "ein absichtlich eingecheckter
# Testschlüssel wird geblockt" — turned into something that runs every time
# rather than something demonstrated once in a pull request. A scanner whose
# config drifts into excusing everything reports "no leaks found" in exactly
# the same words as a scanner that works, and step 2 alone could never tell the
# difference.
#
# The planted key is GENERATED, not written down. Two reasons: a literal in
# this file would be found by step 2 and need an allowlist entry of its own —
# the scanner tripping over its own test — and a fresh key each run proves the
# rules match a shape rather than a string somebody memorised.
#
# **Git mode, never `gitleaks dir`.** .env and .env.l1-backup sit untracked in
# a developer's tree with real values in them (.gitignore). A directory scan
# would read them and print matches into a terminal or a CI log. The git mode
# sees only what was committed, which is also the only thing that could leak.
#
# This is NOT part of `make check`, for the same reason `check-db` is not: it
# needs a container. That is the second half of the rule in ADR 0031 — the
# check chain is the one a laptop can run with no daemon.
#
# CHECK_SECRETS_IMAGE overrides the scanner image; the value below is pinned by
# digest because a tag can be repointed, which is the rule tools/check-compose.sh
# and both Dockerfiles already enforce.
set -eu

root=${1:-.}
range=${2:-}

# gitleaks v8.30.1
image=${CHECK_SECRETS_IMAGE:-ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f}

[ -d "$root/.git" ] || { printf '  – skip: %s is not a git repository\n' "$root"; exit 0; }
[ -f "$root/.gitleaks.toml" ] || {
  printf '  ✗ .gitleaks.toml is missing — gitleaks would run its own defaults\n'
  printf '    without this repository'\''s allowlist, and the two are not the same rules\n'
  exit 1
}

if ! command -v docker >/dev/null 2>&1; then
  if [ -n "${CI:-}" ]; then
    printf '  ✗ docker is not available and CI is set\n'
    printf '    → skipping here would report a scan that never ran\n'
    exit 1
  fi
  printf '  – skip: docker is not available\n'
  exit 0
fi

root=$(cd "$root" && pwd)

# Output is captured and shown only when something was found. gitleaks narrates
# its progress on stderr even when it is clean, and a check that prints three
# lines of nothing on every green run is a check people stop reading.
out=$(mktemp)
planted=$(mktemp -d)

# ONE trap. A second `trap ... EXIT` replaces the first rather than adding to
# it, so the two temporaries have to be cleaned up by the same handler.
# shellcheck disable=SC2064  # the paths are wanted now, not at trap time
trap "rm -f '$out'; rm -rf '$planted'" EXIT INT TERM

scan() { # scan <dir> [extra args...]
  dir=$1
  shift
  docker run --rm -v "$dir:/repo:ro" -w /repo "$image" \
    git --no-banner -v --config /repo/.gitleaks.toml "$@" . >"$out" 2>&1
}

report() { sed 's/^/    /' "$out"; }

# ------------------------------------------------- 1. the planted key

(
  cd "$planted"
  git init -q -b main .
  git config user.email selftest@localhost
  git config user.name selftest
  git config commit.gpgsign false
  cp "$root/.gitleaks.toml" .
  # Assembled from parts so that no line of this repository ever contains a
  # token-shaped string. 36 hex characters is what the personal-access-token
  # rule expects after the prefix.
  marker=ghp
  body=$(od -An -tx1 -N18 /dev/urandom | tr -d ' \n')
  printf 'token = "%s_%s"\n' "$marker" "$body" > planted.txt
  git add -A
  git commit -qm "the key this check exists to catch"
) >/dev/null 2>&1

if scan "$planted"; then
  printf '  ✗ a planted key was NOT reported — the scanner is not scanning\n'
  printf '    the allowlist in .gitleaks.toml has grown until it excuses everything,\n'
  printf '    or the image no longer carries the default rules\n'
  exit 1
fi
printf '  ✓ a planted key is rejected\n'

# ------------------------------------------------- 2. this repository

if ! scan "$root"; then
  printf '  ✗ this history contains a secret\n'
  report
  printf '    a finding here is a ROTATION, not an allowlist entry: assume the value\n'
  printf '    is public from the moment it was pushed, and rewriting history does\n'
  printf '    not un-publish it\n'
  exit 1
fi
printf '  ✓ no secret in the history\n'

# ------------------------------------------------- 3. this branch, if asked
#
# A superset of step 2 by definition, and worth running anyway: it names the
# commit inside the range instead of leaving "somewhere in forty commits" as
# the answer a reviewer gets.
if [ -n "$range" ]; then
  if ! scan "$root" --log-opts="$range"; then
    printf '  ✗ a secret arrives in %s\n' "$range"
    report
    exit 1
  fi
  printf '  ✓ no secret in %s\n' "$range"
fi
