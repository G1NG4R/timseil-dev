#!/bin/sh
# The tool versions no ecosystem lifts.
#
#   check-pins.sh [repo-root]              shape only, no network — part of make check
#   check-pins.sh --online [repo-root]     also asks upstream whether they are current
#
# Dependabot reads Dockerfiles, compose files, go.mod, package.json and workflow
# files. It does not read a digest inside a shell script or a version inside a
# text file. Four pins in this repository live in exactly those two shapes:
#
#   .cosign-image                 cosign, the tool that signs and verifies
#   .golangci-lint-version        the linter make check refuses to skip
#   tools/check-secrets.sh        gitleaks
#   tools/sbom.sh                 syft
#
# Every one of them was noted in backlog.md as "a version a person has to lift",
# twice, in two different phases. Four places is the point at which a check is
# cheaper than the discipline — which is the same sentence the backlog used, and
# this file is it.
#
# NO HAND-MAINTAINED LIST. The pins are found by their shape, not enumerated:
# adding a fifth pinned tool tomorrow puts it under this check without anybody
# remembering to add it. That is the rule ADR 0032 draws from
# router_parity_test.go — a hand list is a second copy of the truth, and the
# copy goes stale.
#
# WHERE THE UPSTREAM NAME COMES FROM. From the image path, by rule: the first
# two segments after the registry. `ghcr.io/anchore/syft` is `anchore/syft`,
# `ghcr.io/sigstore/cosign/cosign` is `sigstore/cosign`. golangci-lint is the
# one exception and it is named below, because it is not an image and there is
# no path to read — an exception with a reason, rather than a list of four.
#
# TWO HALVES, TWO HOMES. The shape half runs in `make check`: it needs no
# network and it is what keeps the other half possible, because a pin with no
# readable version next to it cannot be compared to anything. The online half
# runs weekly in ci.yml next to govulncheck and verify-supply-chain — a question
# about the world outside cannot hang off a diff, and this one can go red on a
# tree nobody touched. ADR 0031 §1 draws that line.
set -eu

online=0
if [ "${1:-}" = "--online" ]; then online=1; shift; fi
root=${1:-.}
fail=0

# tools/selftest.sh is skipped, and it is the only exception. It plants pinned
# images as INPUT to the checks it exercises — postgres and node digests made of
# repeated ones — and those are fixtures, not tools this repository runs. A
# fixture that had to carry a version comment would be a fixture describing a
# release that does not exist.
pin_files() {
  printf '%s\n' "$root/.cosign-image"
  find "$root/tools" -name '*.sh' ! -name 'selftest.sh' | sort
}

# name owner/repo version file, one per line, for everything found by shape.
declared() {
  for f in $(pin_files); do
    [ -f "$f" ] || continue
    awk -v file="$f" '
      # The version comment as this repository already writes it above the pin:
      # "# syft v1.51.0", and in .cosign-image a whole paragraph higher up. The
      # last one seen in the file wins rather than the one within N lines,
      # because each of these files pins exactly one tool and a distance rule
      # would only be a second thing to get wrong.
      /^[[:space:]]*#/ {
        if (match($0, /v[0-9]+\.[0-9]+\.[0-9]+/)) seen = substr($0, RSTART, RLENGTH)
        next
      }
      # A PIN, not a mention of one. check-compose.sh, check-dockerfiles.sh and
      # this file all contain the literal `@sha256:` inside a pattern or a
      # sentence; requiring a run of hex digits long enough to be a real digest
      # is what tells the two apart. Thirty-two, not sixty-four, so that a
      # TRUNCATED digest is still recognised as a pin and then reported as
      # malformed instead of quietly not counting as one.
      match($0, /[a-z0-9._\/-]+@sha256:[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]+/) {
        ref = substr($0, RSTART, RLENGTH)
        split(ref, parts, "@sha256:")
        path = parts[1]; digest = parts[2]
        sub(/^[a-z0-9.-]+\.[a-z]+\//, "", path)          # drop the registry host
        n = split(path, seg, "/")
        upstream = (n >= 2) ? seg[1] "/" seg[2] : path
        print seg[n], upstream, (seen == "" ? "-" : seen), length(digest), file
      }
    ' "$f"
  done

  # golangci-lint: a bare version in a file, because that is the shape
  # golangci-lint-action's `version-file:` reads. No image, so no path to derive
  # an upstream from — the one place a name is written down instead of read.
  v=$(cat "$root/.golangci-lint-version" 2>/dev/null || printf '-')
  printf '%s %s %s %s %s\n' golangci-lint golangci/golangci-lint "$v" 64 "$root/.golangci-lint-version"
}

printf 'pins\n'

# Not a pipe into the loop: a `while read` behind a pipe runs in a subshell, and
# every failure it counts is discarded when that subshell exits. This is the
# same trap ADR 0031 §3 describes from the other side — a check that stops early
# and a check whose result is thrown away look identical in a green log.
list=$(mktemp)
trap 'rm -f "$list"' EXIT INT TERM
declared > "$list"

found=0
while read -r name upstream version digestlen file; do
  found=$(( found + 1 ))

  if [ "$digestlen" != "64" ]; then
    printf '  ✗ %s is pinned by a %s-character digest, not 64 — %s\n' "$name" "$digestlen" "$file"
    fail=1
    continue
  fi

  case $version in
    v[0-9]*.[0-9]*.[0-9]*) ;;
    *)
      printf '  ✗ %s has no readable version next to its pin — %s\n' "$name" "$file"
      printf '    a bare hash is unreadable six months later, and an unreadable pin never gets bumped\n'
      printf '    write it as a comment above the pin: # %s vX.Y.Z\n' "$name"
      fail=1
      continue
      ;;
  esac

  if [ "$online" = "0" ]; then
    printf '  ✓ %s %s\n' "$name" "$version"
    continue
  fi

  # GH_TOKEN when there is one, because unauthenticated api.github.com allows
  # sixty requests an hour per address and a shared runner address is not
  # something this check gets to itself.
  latest=$(curl -sS --max-time 15 \
    -H 'Accept: application/vnd.github+json' \
    ${GH_TOKEN:+-H "Authorization: Bearer $GH_TOKEN"} \
    "https://api.github.com/repos/$upstream/releases/latest" 2>/dev/null \
    | jq -r '.tag_name // empty' 2>/dev/null) || latest=''

  if [ -z "$latest" ]; then
    printf '  ✗ %s: could not read the latest release of %s\n' "$name" "$upstream"
    fail=1
  elif [ "$latest" = "$version" ]; then
    printf '  ✓ %s %s is current\n' "$name" "$version"
  else
    printf '  ✗ %s is pinned at %s, upstream is at %s — %s\n' "$name" "$version" "$latest" "$file"
    printf '    no ecosystem bumps this one; that is the whole reason this check exists\n'
    fail=1
  fi
done < "$list"

# A scan that found nothing is not a repository with no pins, it is a broken
# scan — and it would print a clean run. The four are named in the header; if
# one is deliberately removed, this number moves with it.
if [ "$found" -lt 4 ]; then
  printf '  ✗ only %s pins found, expected at least the four named in this file\n' "$found"
  fail=1
fi

[ "$fail" -eq 0 ] || exit 1
