#!/bin/sh
# The signature and the bill of materials, attached to what was actually pushed.
#
#   sign.sh <registry-image:tag> <sbom-file> [<registry-image:tag> <sbom-file>...]
#
# Keyless over Sigstore: no key to store, rotate or leak. cosign asks the OIDC
# provider who is running, Fulcio issues a certificate for that identity valid
# for ten minutes, the signature goes into the registry next to the image and
# the certificate into Rekor's transparency log. Nothing in this repository ever
# holds a private key, which is the entire reason the build plan says keyless.
#
# **Everything attaches to the DIGEST, never to the tag.** A tag is a name
# somebody can move to other content tomorrow; the four documents that now hang
# off a published image — signature, SBOM attestation, SLSA provenance, OCI
# labels — all hang off the bytes. tools/image-digest.sh resolves it, and that
# script exists for exactly this.
#
# **cosign comes from a digest-pinned image, not from an installer action.**
# Same reasoning as gitleaks in tools/check-secrets.sh and syft in
# tools/sbom.sh: the tool that proves the supply chain should not widen it, and
# one fewer third-party action is one fewer repository whose maintainers can
# push into this pipeline. It also means `make verify-supply-chain` runs on a
# laptop with nothing installed.
#
# Three things have to reach the container and nothing else does:
#
#   ACTIONS_ID_TOKEN_REQUEST_URL     cosign's ambient detection fetches the
#   ACTIONS_ID_TOKEN_REQUEST_TOKEN   OIDC token from Actions through these; they
#   GITHUB_ACTIONS                   exist only inside a job with id-token: write
#
#   DOCKER_CONFIG (read-only mount)  the signature is WRITTEN to the registry,
#                                    so cosign needs the login docker already did
#
# No docker socket, no write access to the tree. The container can reach the
# registry and nothing on this machine.
#
# **The named exception to ADR 0030.** Every other step in ci.yml is a command
# that behaves identically on a laptop. This one does not: in Actions the
# identity is the workflow, on a laptop cosign opens a browser and the identity
# is YOURS. That is not a hole, because tools/verify-supply-chain.sh pins the
# expected identity to this workflow on refs/heads/main — a hand-signed image
# fails verification. Same command, and its result bound to where it ran. The
# exception is written down here rather than left to be discovered, the way ADR
# 0031 §1 names its own.
#
# COSIGN_IMAGE overrides the tool for a one-off; the pin itself is in
# .cosign-image, because tools/verify-supply-chain.sh needs the same one.
set -eu

[ "$#" -ge 2 ] || { printf '  ✗ usage: sign.sh <registry-image:tag> <sbom-file>...\n'; exit 1; }

root=$(cd "$(dirname "$0")/.." && pwd)

# The pin lives in .cosign-image, read here rather than typed. The version that
# signs and the version that verifies have to be the same one, and two spellings
# of a digest are two digests — the failure is quiet, because a signature made
# by one build of cosign and checked by another is not obviously either.
cosign_image=${COSIGN_IMAGE:-$(grep -v '^#' "$root/.cosign-image" | tr -d '[:space:]')}

# Asserted, because an empty or malformed pin makes docker answer "invalid
# reference format" — which this script would otherwise report as "no valid
# signature". A check that names the wrong cause is worse than one that fails.
case "$cosign_image" in
  *@sha256:*) ;;
  *)
    printf '  ✗ .cosign-image does not hold a digest-pinned reference\n'
    printf '    got: %s\n' "${cosign_image:-<empty>}"
    exit 1
    ;;
esac

command -v docker >/dev/null 2>&1 || {
  if [ -n "${CI:-}" ]; then
    printf '  ✗ docker is not available and CI is set\n'
    printf '    → skipping here would publish an image nobody signed\n'
    exit 1
  fi
  printf '  – skip: docker is not available\n'
  exit 0
}

# The container runs as uid 65532 with HOME=/home/nonroot, so the credentials
# have to land where THAT user looks for them.
docker_config=${DOCKER_CONFIG:-$HOME/.docker}
[ -d "$docker_config" ] || {
  printf '  ✗ no docker credentials in %s\n' "$docker_config"
  printf '    cosign writes the signature INTO the registry — run: docker login ghcr.io\n'
  exit 1
}

cosign() {
  docker run --rm \
    -e GITHUB_ACTIONS \
    -e ACTIONS_ID_TOKEN_REQUEST_URL \
    -e ACTIONS_ID_TOKEN_REQUEST_TOKEN \
    -e DOCKER_CONFIG=/home/nonroot/.docker \
    -v "$docker_config:/home/nonroot/.docker:ro" \
    -v "$root:/work:ro" \
    -w /work \
    "$cosign_image" "$@"
}

while [ "$#" -ge 2 ]; do
  image=$1
  sbom=$2
  shift 2

  [ -f "$root/$sbom" ] || { printf '  ✗ %s does not exist — run: make sbom\n' "$sbom"; exit 1; }

  digest=$("$root/tools/image-digest.sh" "$image")
  repo=${image%:*}
  subject="$repo@$digest"

  if ! out=$(cosign sign --yes "$subject" 2>&1); then
    printf '  ✗ signing failed: %s\n' "$subject"
    printf '%s\n' "$out" | sed 's/^/    /'
    exit 1
  fi
  printf '  ✓ signed    %s\n' "$subject"

  # --type cyclonedx, matching what tools/sbom.sh writes. The predicate type is
  # what a verifier asks for by name, so a mismatch here is a document nobody
  # can find rather than one that is missing.
  if ! out=$(cosign attest --yes --type cyclonedx --predicate "$sbom" "$subject" 2>&1); then
    printf '  ✗ attesting the SBOM failed: %s\n' "$subject"
    printf '%s\n' "$out" | sed 's/^/    /'
    exit 1
  fi
  printf '  ✓ attested  %s  (cyclonedx, %s)\n' "$subject" "$sbom"
done
