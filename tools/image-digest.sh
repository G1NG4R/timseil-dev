#!/bin/sh
# The digest a pushed image answers to, and nothing else.
#
#   image-digest.sh <registry-image:tag>
#
# From here on the digest is the name. A tag is a label somebody can move; a
# signature, an attestation and a provenance statement all attach to the
# content, and cosign resolves a tag to a digest before it does anything. Doing
# that resolution once, here, means the pipeline signs the bytes it pushed
# rather than whatever the tag points at a minute later.
#
# **Why this is a script and not `{{index .RepoDigests 0}}` in a Makefile
# line.** `make images` gives each image two names — the short one for
# `docker images` and the ghcr.io one for compose — and a local build that was
# never pushed has no RepoDigest at all. Index 0 is therefore either the right
# answer, the wrong repository's answer, or an out-of-range error, and only one
# of those three is loud. This matches on the repository and fails with a
# sentence when there is no match.
set -eu

image=${1:?usage: image-digest.sh <registry-image:tag>}
repo=${image%:*}

command -v docker >/dev/null 2>&1 || {
  printf '  ✗ docker is not available\n' >&2
  exit 1
}

docker image inspect "$image" >/dev/null 2>&1 || {
  printf '  ✗ %s is not built — run: make images\n' "$image" >&2
  exit 1
}

digest=$(docker image inspect "$image" \
  --format '{{range .RepoDigests}}{{println .}}{{end}}' \
  | sed -n "s|^${repo}@||p" | head -n 1)

[ -n "$digest" ] || {
  printf '  ✗ %s has no digest in %s\n' "$image" "$repo" >&2
  printf '    a digest exists once the image has been pushed — run: make push\n' >&2
  exit 1
}

printf '%s\n' "$digest"
