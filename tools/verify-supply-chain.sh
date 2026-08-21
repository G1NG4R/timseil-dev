#!/bin/sh
# The acceptance criterion of E3, as a command a stranger can run.
#
#   verify-supply-chain.sh [tag-or-digest]     default: the tag make images uses
#
# Four checks per image. The first three ask whether the published artefact
# carries what this pipeline attaches to it; the fourth asks whether the first
# three mean anything.
#
#   1. cosign verify              the signature, and WHOSE it is
#   2. cosign verify-attestation  the CycloneDX SBOM, attached to the digest
#   3. gh attestation verify      the SLSA provenance
#   4. the broken case            a deliberately wrong identity MUST fail
#
# **Step 4 is why this file exists rather than three lines in a workflow.**
# `cosign verify` with an identity that matches nothing, and `cosign verify`
# with no identity pinned at all, print "Verified OK" in exactly the same words
# for entirely different reasons. Steps 1 to 3 could never tell those apart. So
# the check runs its own negative every time — the same argument
# tools/check-secrets.sh makes with its planted key, and the same reason
# tools/sbom.sh counts components instead of trusting a valid document.
#
# **The identity is the whole point.** A signature only says "somebody with a
# Sigstore identity signed this". It becomes evidence when the verifier demands
# a SPECIFIC identity, and here that is:
#
#   issuer    https://token.actions.githubusercontent.com
#   identity  https://github.com/G1NG4R/timseil-dev/.github/workflows/ci.yml@refs/heads/main
#
# Which reads: built by THIS workflow file, in THIS repository, on main. An
# image signed from a laptop, from a fork, from a branch or by another workflow
# in this repository fails — including one signed by the person who wrote this.
#
# **No login.** The check deliberately does not authenticate: the claim being
# tested is that anybody can verify this, and a proof that leans on the runner's
# credentials proves something else. `make push` and `make sign` log in; the
# publish job logs out again before calling this.
#
# NOT part of `make check`: it needs Docker and the network. Second half of the
# rule in ADR 0031 §1 — the check chain is the one a laptop runs with no daemon
# and no registry.
set -eu

REGISTRY=ghcr.io/g1ng4r
REPOSITORY=G1NG4R/timseil-dev
ISSUER=https://token.actions.githubusercontent.com
IDENTITY="https://github.com/$REPOSITORY/.github/workflows/ci.yml@refs/heads/main"

# Assembled rather than written out, so that the wrong identity can never be
# mistaken for a real one by somebody reading this file, and so that it stays
# wrong if the real one above is ever edited.
WRONG_IDENTITY="$IDENTITY.this-identity-signs-nothing"

root=$(cd "$(dirname "$0")/.." && pwd)
ref=${1:-$(make -s -C "$root" image-tag)}

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

fail=0
ok()  { printf '  ✓ %s\n' "$1"; }
no()  { printf '  ✗ %s\n' "$1"; fail=1; }

for tool in docker gh; do
  command -v "$tool" >/dev/null 2>&1 && continue
  if [ -n "${CI:-}" ]; then
    printf '  ✗ %s is not available and CI is set\n' "$tool"
    printf '    → skipping here would report a verification that never ran\n'
    exit 1
  fi
  printf '  – skip: %s is not available\n' "$tool"
  exit 0
done

cosign() { docker run --rm "$cosign_image" "$@"; }

for name in timseil-api timseil-web; do
  image="$REGISTRY/$name:$ref"
  printf '  %s\n' "$image"

  # ------------------------------------------------- 1. the signature
  if out=$(cosign verify --certificate-oidc-issuer "$ISSUER" \
             --certificate-identity "$IDENTITY" "$image" 2>&1); then
    ok "signed by $IDENTITY"
  else
    no "no valid signature"
    printf '%s\n' "$out" | sed 's/^/      /'
  fi

  # ------------------------------------------------- 2. the SBOM
  if out=$(cosign verify-attestation --type cyclonedx \
             --certificate-oidc-issuer "$ISSUER" \
             --certificate-identity "$IDENTITY" "$image" 2>&1); then
    ok "carries a CycloneDX SBOM attestation"
  else
    no "no valid SBOM attestation"
    printf '%s\n' "$out" | sed 's/^/      /'
  fi

  # ------------------------------------------------- 3. the provenance
  #
  # GitHub's own attestation rather than cosign's: the build plan asks for SLSA
  # provenance from actions/attest-build-provenance, and `gh attestation verify`
  # is how a reader checks it without knowing anything about Sigstore.
  if out=$(gh attestation verify "oci://$image" --repo "$REPOSITORY" 2>&1); then
    ok "carries SLSA provenance for $REPOSITORY"
  else
    no "no valid provenance"
    printf '%s\n' "$out" | sed 's/^/      /'
  fi

  # ------------------------------------------------- 4. the broken case
  #
  # Everything above is worthless if this passes.
  if cosign verify --certificate-oidc-issuer "$ISSUER" \
       --certificate-identity "$WRONG_IDENTITY" "$image" >/dev/null 2>&1; then
    no "A WRONG IDENTITY VERIFIED — this check proves nothing"
    printf '      the identity pin is not being applied. Every ✓ above is a\n'
    printf '      sentence about a signature that was never held against anybody.\n'
  else
    ok "a wrong identity is rejected"
  fi
done

[ "$fail" -eq 0 ] || exit 1
