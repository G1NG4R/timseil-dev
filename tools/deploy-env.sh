#!/bin/sh
# One line of Dokploy's environment, rewritten — and nothing else touched.
#
#   deploy-env.sh <sha-tag> <env-in> <env-out>
#
# Prints the PREVIOUS tag on stdout.
#
# WHY THIS IS ITS OWN FILE
#
# It is the one destructive thing this phase does. Everything else either reads
# something or starts something that can be started again; this takes the whole
# production environment — every secret the application has — and writes a
# changed copy back over it. A `sed` that matched nothing is a successful sed,
# and the result would be a deploy of the wrong build. A `sed` that matched too
# much would send a mangled environment to a running system.
#
# As part of tools/deploy.sh it could only be tested against a live Dokploy. On
# its own it is text in, text out, and tools/selftest.sh can hand it every
# broken input there is: no IMAGE_TAG line, two of them, an empty value, a value
# containing characters that would break the substitution.
#
# IT NEVER PRINTS THE ENVIRONMENT. Not on success, not in an error message. The
# only thing it says about the input is how many IMAGE_TAG lines it had.
set -eu

tag=${1:?usage: deploy-env.sh <sha-tag> <env-in> <env-out>}
src=${2:?usage: deploy-env.sh <sha-tag> <env-in> <env-out>}
dst=${3:?usage: deploy-env.sh <sha-tag> <env-in> <env-out>}

[ -f "$src" ] || { printf '  ✗ %s does not exist\n' "$src" >&2; exit 1; }

# EXACTLY ONE. Zero means somebody removed the line and compose would refuse to
# interpolate on the next deploy anyway. Two means an edit went wrong and the
# later one wins silently. In neither case may this script guess which line it
# is allowed to rewrite.
count=$(grep -c '^IMAGE_TAG=' "$src" || true)
[ "$count" = "1" ] || {
  printf '  ✗ the environment has %s IMAGE_TAG lines, expected exactly one\n' "$count" >&2
  exit 1
}

previous=$(sed -n 's/^IMAGE_TAG=//p' "$src")
[ -n "$previous" ] || {
  printf '  ✗ IMAGE_TAG is empty — there would be no rollback target\n' >&2
  exit 1
}

# The replacement is built with printf and matched by anchor, so nothing in the
# tag can be read as part of the substitution. deploy.sh has already refused
# anything that is not `sha-` plus seven hex characters, and this is the second
# lock on the same door: this file is also called directly by the selftest, and
# a guard that only exists in the caller is a guard the test cannot see.
case $tag in
  sha-*) ;;
  *) printf '  ✗ %s is not a sha- tag\n' "$tag" >&2; exit 1 ;;
esac
short=${tag#sha-}
case $short in
  *[!0-9a-f]* | '') printf '  ✗ %s is not lowercase hexadecimal\n' "$tag" >&2; exit 1 ;;
esac
[ "${#short}" -eq 7 ] || {
  printf '  ✗ %s: expected seven hex characters, got %s\n' "$tag" "${#short}" >&2; exit 1; }

awk -v tag="$tag" '
  /^IMAGE_TAG=/ { print "IMAGE_TAG=" tag; next }
  { print }
' "$src" > "$dst"

# Counted again, on the result. The two assertions below are the whole point of
# the file: the line that had to change did, and no other line did.
[ "$(sed -n 's/^IMAGE_TAG=//p' "$dst")" = "$tag" ] || {
  printf '  ✗ the rewrite did not take\n' >&2; exit 1; }

before=$(grep -cv '^IMAGE_TAG=' "$src" || true)
after=$(grep -cv '^IMAGE_TAG=' "$dst" || true)
[ "$before" = "$after" ] || {
  printf '  ✗ the rewrite changed %s other lines\n' "$(( after - before ))" >&2; exit 1; }

printf '%s\n' "$previous"
