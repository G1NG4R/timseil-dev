#!/bin/sh
# The images into GHCR, from the pipeline and from nowhere else.
#
#   push.sh <registry-image:tag> [<registry-image:tag>...]
#
# Until E3 this was a bridge: `make images` tagged locally, the Makefile said
# pushing was E4's job, and the one push that ever happened came off a laptop
# with a personal access token (issue #90, and the runbook heading that called
# itself one-off). E3 needs a digest in a registry before it can sign anything,
# so the push moves here and the bridge comes down.
#
# **Still not on the VPS, and still not on a laptop as a matter of course.**
# Build plan chapter 10: what runs has to be the artefact that was tested, and
# that only holds if exactly one machine builds it. The `publish` job in ci.yml
# is that machine. This target exists on a laptop for the same reason every
# other one does — so that what blocks a merge is a command a person can run —
# and not as an invitation.
#
# What it does NOT do is build. The caller passes images that already exist,
# and `make push` depends on require-images to say so in a sentence rather than
# letting docker answer with an authentication error against ghcr.io.
set -eu

[ "$#" -gt 0 ] || { printf '  ✗ usage: push.sh <registry-image:tag>...\n'; exit 1; }

command -v docker >/dev/null 2>&1 || {
  printf '  ✗ docker is not available\n'
  exit 1
}

root=$(cd "$(dirname "$0")/.." && pwd)

for image in "$@"; do
  docker image inspect "$image" >/dev/null 2>&1 || {
    printf '  ✗ %s is not built — run: make images\n' "$image"
    exit 1
  }
done

for image in "$@"; do
  # Quiet on the way out, loud on the way down. A push narrates one line per
  # layer, and thirty lines of "Layer already exists" is noise around the one
  # thing worth reading, which is the digest underneath.
  if ! out=$(docker push "$image" 2>&1); then
    printf '  ✗ push failed: %s\n' "$image"
    printf '%s\n' "$out" | sed 's/^/    /'
    printf '    a 403 here is usually the package, not the workflow: a container\n'
    printf '    package created by a personal token is not linked to this repository\n'
    printf '    until somebody adds it under Package settings → Manage Actions access.\n'
    exit 1
  fi

  digest=$("$root/tools/image-digest.sh" "$image")
  printf '  ✓ %s\n' "$image"
  printf '    %s\n' "$digest"
done
