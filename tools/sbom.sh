#!/bin/sh
# The bill of materials for one image, and the proof that it read the image.
#
#   sbom.sh <out-dir> <image:tag> <expected-purl-prefix>
#
# CycloneDX JSON, one document per image, written to
# <out-dir>/<image>.cdx.json. The build plan names the format and the tool for
# E3; nothing here is a choice about either.
#
# **The image is read from a tarball, never from the daemon.** `syft docker:…`
# would need /var/run/docker.sock mounted into the scanner, and a socket handed
# to a container is root on the host — an odd price for a tool whose whole job
# is to describe the supply chain rather than widen it. `docker save` into a
# read-only mount costs one tar and buys a scanner that cannot reach anything.
#
# **The assertion at the end is the point of the script.** An SBOM with no
# packages in it is a valid CycloneDX document, and it is indistinguishable from
# a good one unless somebody counts. So: the api image must yield `pkg:golang`
# components and the web image `pkg:npm` ones, and a run that produces neither
# fails instead of publishing an empty answer. The check is by ecosystem rather
# than by the name of any one dependency — naming `pgx` here would be a second
# place that has an opinion about api/go.mod, and it would go red for a reason
# that has nothing to do with the scanner.
#
# That is ADR 0031 §3's lesson turned into code: a report that stops early looks
# exactly like a report that found nothing left to say.
#
# --source-name and --source-version, because without them the document calls
# itself `/image.tar` and its version is the tar's digest. A bill of materials
# that cannot name its own subject is not evidence of anything.
#
# NOT part of `make check`: it needs Docker. Second half of the rule in ADR
# 0031 §1 — the check chain is the one a laptop runs with no daemon.
#
# SBOM_IMAGE overrides the scanner; the value below is pinned by digest,
# because a tag can be repointed at other code after it was reviewed. Same rule
# as tools/check-secrets.sh, both Dockerfiles and every action in ci.yml.
#
# **No ecosystem bumps this digest.** dependabot.yml reads Dockerfiles and
# compose files, not a hash in a shell script, so this line and the gitleaks
# line next door are two numbers a person has to lift. Named rather than hidden.
set -eu

out_dir=${1:?usage: sbom.sh <out-dir> <image:tag> <expected-purl-prefix>}
image=${2:?usage: sbom.sh <out-dir> <image:tag> <expected-purl-prefix>}
expect=${3:?usage: sbom.sh <out-dir> <image:tag> <expected-purl-prefix>}

# syft v1.51.0
scanner=${SBOM_IMAGE:-ghcr.io/anchore/syft@sha256:678bfa565b60f747aac0f8e964fe5588a24445b8d0a480e91f6efd70020dfbb0}

name=${image%%:*}
tag=${image#*:}
target=$out_dir/$name.cdx.json

# The same clause check-secrets.sh carries: skipping locally is a convenience,
# skipping in CI is a report about a scan that never ran.
for tool in docker jq; do
  command -v "$tool" >/dev/null 2>&1 && continue
  if [ -n "${CI:-}" ]; then
    printf '  ✗ %s is not available and CI is set\n' "$tool"
    printf '    → skipping here would publish an SBOM nobody produced\n'
    exit 1
  fi
  printf '  – skip: %s is not available\n' "$tool"
  exit 0
done

docker image inspect "$image" >/dev/null 2>&1 || {
  printf '  ✗ %s is not built — run: make images\n' "$image"
  exit 1
}

work=$(mktemp -d)
# shellcheck disable=SC2064  # the path is wanted now, not at trap time
trap "rm -rf '$work'" EXIT INT TERM

docker save "$image" -o "$work/image.tar"

mkdir -p "$out_dir"

# stdout is the document, stderr is syft narrating. -q keeps the narration to
# what actually went wrong; a scanner that prints a progress bar on every green
# run is a scanner whose output people stop reading.
docker run --rm -v "$work/image.tar:/image.tar:ro" "$scanner" \
  -q scan docker-archive:/image.tar \
  --source-name "$name" \
  --source-version "$tag" \
  -o cyclonedx-json > "$work/sbom.json" || {
  printf '  ✗ syft failed on %s\n' "$image"
  exit 1
}

jq -e . "$work/sbom.json" >/dev/null 2>&1 || {
  printf '  ✗ syft wrote something that is not JSON for %s\n' "$image"
  exit 1
}

found=$(jq --arg p "$expect" \
  '[.components[]? | select(.purl != null and (.purl | startswith($p)))] | length' \
  "$work/sbom.json")

if [ "$found" -eq 0 ]; then
  printf '  ✗ %s: no %s component in the SBOM\n' "$image" "$expect"
  printf '    the document is valid and says nothing — syft found the image but not\n'
  printf '    the program inside it. A build that moved the binary, or a base image\n'
  printf '    that no longer looks like what the cataloguer expects.\n'
  exit 1
fi

cp "$work/sbom.json" "$target"

total=$(jq '[.components[]? | select(.purl != null)] | length' "$target")
printf '  ✓ %s → %s (%s packages, %s of them %s)\n' \
  "$image" "$target" "$total" "$found" "$expect"
