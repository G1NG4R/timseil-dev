#!/bin/sh
# What GHCR may forget, and what it may never forget.
#
#   prune-registry.sh [--delete] [repo]     default: both, and it deletes nothing
#
# GHCR IS THE ROLLBACK STORE, and that is not a figure of speech. Dokploy's
# docker-cleanup runs on the VPS every night at 23:50 UTC with `prune --all`, so
# the local disk keeps a build for about a day. Runbook 3.3 and 3.5. Everything
# older than last night exists in exactly one place, and this file is the only
# thing that will ever remove anything from it.
#
# THE SHAPE OF THE STORE, MEASURED 2026-08-22, and it is the reason the obvious
# rule is the wrong one:
#
#   build manifests      tagged  sha-<7hex>
#   referrers indexes    tagged  sha256-<64hex of the build>
#   sigstore bundles     UNTAGGED, 3 per index — signature, SBOM, provenance
#
# Twenty-six package versions per package, of which eight carry a tag. So:
#
#   1. `delete-only-untagged-versions`, the recipe everyone reaches for, would
#      destroy every signature in this registry. The bundles are untagged by
#      construction. A rule that reasons about tags alone is not imprecise here,
#      it is inverted.
#   2. GHCR's /v2/.../referrers/ endpoint answers nothing for these packages, so
#      the fallback tag sha256-<hex> IS the discovery mechanism. Delete that one
#      version and `cosign verify` breaks for a build whose bundles all survive.
#
# THE PLAN NEEDS NO CREDENTIAL. It is computed from the public registry API, the
# way a stranger would compute it, which means it is reproducible by one and that
# a wrong plan is visible before anything is gone. Only --delete reads a token,
# and only to call the Packages API. That split is the safety property.
#
# ONE THING IT CANNOT UNDO. There is a thirty-day restore in GHCR; a restored
# version does not reliably come back with its tags. Do not lean on it.
set -eu

# How many builds survive, per package.
#
# A COUNT AND NOT AN AGE. A quiet month must not empty the store. The store's job
# is "N rollback targets", which is a count; age-based retention deletes fastest
# exactly when nothing is being deployed, which is when the last known-good build
# matters most.
#
# TEN, from the measured rate: five builds in two days at the E3/E4 peak, about
# one a day otherwise — so ten is between two days and two weeks of history.
# Every rollback this project has performed went back exactly one step. Runbook
# 3.3 sets Dokploy's own image retention to three to five, and GHCR has to be
# strictly deeper than the disk or it is not the store.
#
# And the deciding argument, which is about the FIRST armed run rather than about
# steady state: at ten, the first run deletes only the orphan measured on
# 2026-08-22 and its attachments. At five it would equal the current inventory
# and delete a real, signed, referenced build — the worst possible first run of
# an irreversible tool. Choose N so that the first armed run touches only rubbish.
KEEP_BUILDS=${KEEP_BUILDS:-10}

# Below this many surviving builds the plan is refused rather than applied. The
# argument check-pins.sh makes about finding fewer pins than it expects: a scan
# that found almost nothing prints a very clean run.
MIN_BUILDS=3

apply=''
only=''
for arg in "$@"; do
  case $arg in
    --delete) apply=1 ;;
    timseil-api | timseil-web) only=$arg ;;
    *) printf '  ✗ usage: prune-registry.sh [--delete] [timseil-api|timseil-web]\n'; exit 1 ;;
  esac
done

for tool in curl jq; do
  command -v "$tool" >/dev/null 2>&1 || { printf '  ✗ %s is not available\n' "$tool"; exit 1; }
done

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/.." && pwd)
base=${VERIFY_BASE_URL:-https://timseil.dev}
OWNER=${GHCR_OWNER:-G1NG4R}

# THE TWO SEAMS, and why an irreversible tool earns them.
#
# Everything above the deletion is a pure function of two inputs: an inventory
# and the sha production is serving. With these, tools/selftest.sh hands it every
# inventory that matters — an orphan, a kept build whose index vanished, a
# listing that stops halfway, a README naming a build that is about to fall out
# of the window — and reads the plan back. Without them the set arithmetic of the
# one file in this repository that destroys things would be tested by running it
# against the real registry, which is not a test.
#
# Same shape as CHECK_VERSION_DIR, CHECK_TIDY_DIR, SBOM_IMAGE and
# DEPLOY_SKIP_REGISTRY_CHECK elsewhere in this directory: never set in ci.yml,
# never on the host.
REGISTRY_SH=${PRUNE_REGISTRY_SH:-$here/registry.sh}

[ -z "$apply" ] || : "${GHCR_TOKEN:?GHCR_TOKEN is not set — the plan needs no credential, the deletion does}"

umask 077
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

fail() { printf '  ✗ %s\n' "$1"; exit 1; }

# ------------------------------------------------------- what is running
#
# MANDATORY INPUT, not a nicety. Deleting the build production is serving would
# leave a running site with no way back to itself, and "which one is that" is a
# question only the site can answer. If it will not answer, nothing is deleted.
if [ -n "${PRUNE_HEALTH_FILE:-}" ]; then
  running=$(jq -r '.sha // empty' "$PRUNE_HEALTH_FILE" 2>/dev/null) || running=''
else
  running=$(curl -sS --max-time 15 "$base/api/health" 2>/dev/null | jq -r '.sha // empty') || running=''
fi
[ -n "$running" ] || fail 'could not read what production is running — this deletes nothing until it can'
printf 'registry retention\n'
printf '  production runs %s · keeping the newest %s builds per package\n' "$running" "$KEEP_BUILDS"

# Tags this repository points at in prose. The README names a build as the
# evidence that signing began at a point in time rather than being claimed; a
# rule that deletes the evidence turns the page into a liar. Read out of the file
# rather than maintained here, so the two cannot drift apart.
readme_tags=$(grep -oE 'sha-[0-9a-f]{7}' "$root/README.md" 2>/dev/null | sort -u || true)

plan_total=0

for repo in ${only:-timseil-api timseil-web}; do
  printf '\n─── %s ' "$repo"
  printf '─────────────────────────────────────\n' | cut -c1-40

  "$REGISTRY_SH" tags "$repo" > "$work/tags" || fail "could not list the tags of $repo"

  # Builds, with the timestamp out of their own config blob. Ordering by that
  # rather than by the tag: two builds of one commit exist in this registry
  # already, and a tag says nothing about which bytes are older.
  : > "$work/builds"
  while read -r tag; do
    case $tag in
      sha-???????) ;;
      *) continue ;;
    esac
    case ${tag#sha-} in *[!0-9a-f]*) continue ;; esac
    d=$("$REGISTRY_SH" digest "$repo" "$tag") || fail "$tag would not resolve"
    c=$("$REGISTRY_SH" config "$repo" "$tag" | jq -r '.created // empty')
    [ -n "$c" ] || fail "$tag has no created timestamp — the ordering would be a guess"
    printf '%s\t%s\t%s\n' "$c" "$tag" "$d" >> "$work/builds"
  done < "$work/tags"

  # Indexes. The hex after `sha256-` is the digest of the build the index belongs
  # to, which is the whole of the association — there is no other link.
  grep -E '^sha256-[0-9a-f]{64}$' "$work/tags" | sed 's/^sha256-/sha256:/' | sort -u > "$work/indexed"

  sort -r "$work/builds" > "$work/by-age"
  n_builds=$(wc -l < "$work/by-age" | tr -d ' ')
  cut -f3 "$work/by-age" | sort -u > "$work/tagged-digests"

  # A build nothing names any more: an index exists for bytes no tag resolves to.
  # One of these is in the registry today, left by a re-run that moved the tag.
  comm -23 "$work/indexed" "$work/tagged-digests" > "$work/orphans"
  n_orphans=$(wc -l < "$work/orphans" | tr -d ' ')

  printf '  %s tagged builds, %s indexes, %s orphaned build(s)\n' \
    "$n_builds" "$(wc -l < "$work/indexed" | tr -d ' ')" "$n_orphans"

  # ------------------------------------------------------------- the keep set
  head -n "$KEEP_BUILDS" "$work/by-age" | cut -f3 > "$work/keep"
  awk -F'\t' -v r="sha-$running" '$2 == r { print $3 }' "$work/by-age" >> "$work/keep"
  for t in $readme_tags; do
    awk -F'\t' -v r="$t" '$2 == r { print $3 }' "$work/by-age" >> "$work/keep"
  done
  sort -u "$work/keep" -o "$work/keep"

  awk -F'\t' -v r="sha-$running" '$2 == r { f = 1 } END { exit !f }' "$work/by-age" \
    || fail "production runs $running and no version of $repo carries sha-$running — the inventory is wrong"

  # Ein Name im README ist eine Anweisung, etwas zu behalten. Nennt er etwas,
  # das nicht mehr da ist, zeigt die Seite auf ein Artefakt, das ein Leser nicht
  # ziehen kann — und die Anweisung läuft ins Leere, ohne dass es jemand merkt.
  # Kein Abbruch: nichts ist in Gefahr. Aber gesagt wird es.
  for t in $readme_tags; do
    grep -q "	$t	" "$work/by-age" \
      || printf '  ! README.md nennt %s, und %s hat es nicht\n' "$t" "$repo"
  done

  n_keep=$(wc -l < "$work/keep" | tr -d ' ')
  [ "$n_keep" -ge "$MIN_BUILDS" ] \
    || fail "only $n_keep builds would remain, expected at least $MIN_BUILDS"

  # A kept build that has lost its index. Only meaningful from the first indexed
  # build onward: sha-3890180 and sha-a0872c1 predate signing and never had one.
  oldest_indexed=$(grep -Ff "$work/indexed" "$work/by-age" | tail -n 1 | cut -f1 || true)
  if [ -n "$oldest_indexed" ]; then
    while read -r d; do
      line=$(awk -F'\t' -v d="$d" '$3 == d { print $1 "\t" $2 }' "$work/by-age") || continue
      [ -n "$line" ] || continue
      when=${line%%	*}
      [ "$when" \> "$oldest_indexed" ] || continue
      grep -qx "$d" "$work/indexed" \
        || fail "${line#*	} has no signature artefacts — somebody has already pruned, or the fallback tag scheme changed"
    done < "$work/keep"
  fi

  # ----------------------------------------------------------- the delete set
  #
  # Order matters and is not a preference: index, then its children, then the
  # build. GHCR refuses to remove a manifest an index still references, and a
  # half-removed set is the state nobody can reason about afterwards.
  : > "$work/doomed"
  comm -23 "$work/tagged-digests" "$work/keep" >> "$work/doomed"
  cat "$work/orphans" >> "$work/doomed"
  sort -u "$work/doomed" -o "$work/doomed"

  : > "$work/plan"
  while read -r d; do
    [ -n "$d" ] || continue
    idx="sha256-${d#sha256:}"
    if grep -qx "$d" "$work/indexed"; then
      printf 'index\t%s\t%s\n' "$idx" "$idx" >> "$work/plan"
      "$REGISTRY_SH" index "$repo" "$idx" 2>/dev/null | while read -r child; do
        [ -z "$child" ] || printf 'bundle\t%s\t%s\n' "$child" "$idx" >> "$work/plan"
      done
    fi
    tag=$(awk -F'\t' -v d="$d" '$3 == d { print $2 }' "$work/by-age")
    printf 'build\t%s\t%s\n' "$d" "${tag:-<untagged>}" >> "$work/plan"
  done < "$work/doomed"

  n_plan=$(wc -l < "$work/plan" | tr -d ' ')
  # Known versions: every tagged build, every orphan, every index, every child.
  n_known=$(( n_builds + n_orphans + $(wc -l < "$work/indexed" | tr -d ' ') \
              + $(grep -c '^bundle' "$work/plan" || true) ))

  if [ "$n_plan" -eq 0 ]; then
    printf '  ✓ nothing to remove\n'
    continue
  fi

  # A truncated listing and a large genuine backlog look identical from here.
  [ $(( n_plan * 2 )) -le "$n_known" ] \
    || fail "the plan removes $n_plan of about $n_known versions — that is a listing this did not read to the end, until proven otherwise"

  printf '  would remove %s versions:\n' "$n_plan"
  while IFS='	' read -r kind what why; do
    printf '    %-7s %s  (%s)\n' "$kind" "$what" "$why"
  done < "$work/plan"
  plan_total=$(( plan_total + n_plan ))

  [ -n "$apply" ] || continue

  # -------------------------------------------------------------- and delete
  #
  # The Packages API is the only door that removes anything; the registry API
  # cannot. `.name` of a version is its digest, which is the bridge from the plan
  # above to an id. Paginated, and a listing that stops early would look exactly
  # like a package with less in it.
  page=1
  : > "$work/versions"
  while :; do
    got=$(curl -sS --max-time 30 -H 'Accept: application/vnd.github+json' \
            -H "Authorization: Bearer $GHCR_TOKEN" \
            "https://api.github.com/users/$OWNER/packages/container/$repo/versions?per_page=100&page=$page")
    case $got in
      '['*) ;;
      *) fail "the packages api answered $(printf '%s' "$got" | jq -r '.message // "something unreadable"') — a token with read:packages and delete:packages is needed (docs/runbooks/github.md)" ;;
    esac
    printf '%s' "$got" | jq -r '.[] | "\(.name)\t\(.id)"' >> "$work/versions"
    [ "$(printf '%s' "$got" | jq 'length')" -eq 100 ] || break
    page=$(( page + 1 ))
  done

  # index, then bundles, then builds.
  for kind in index bundle build; do
    awk -F'\t' -v k="$kind" '$1 == k { print $2 }' "$work/plan" | while read -r what; do
      d=$what
      case $d in sha256-*) d="sha256:${d#sha256-}" ;; esac
      id=$(awk -F'\t' -v d="$d" '$1 == d { print $2 }' "$work/versions")
      [ -n "$id" ] || { printf '  ! %s is already gone\n' "$what"; continue; }
      code=$(curl -sS --max-time 30 -o /dev/null -w '%{http_code}' -X DELETE \
        -H 'Accept: application/vnd.github+json' -H "Authorization: Bearer $GHCR_TOKEN" \
        "https://api.github.com/users/$OWNER/packages/container/$repo/versions/$id")
      case $code in
        204) printf '  ✓ removed %-7s %s\n' "$kind" "$what" ;;
        *)   printf '  ✗ removing %s answered %s\n' "$what" "$code"
             printf '    a manifest an index still references cannot be removed. stop here:\n'
             printf '    a half-removed set is the state nobody can reason about.\n'
             exit 1 ;;
      esac
    done
  done
done

printf '\n'
if [ "$plan_total" -eq 0 ]; then
  printf '  ✓ the registry already matches the rule\n'
elif [ -n "$apply" ]; then
  printf '  ✓ %s versions removed\n' "$plan_total"
else
  printf '  – %s versions would be removed. nothing was touched.\n' "$plan_total"
  printf '    to apply: make prune-registry-apply    (irreversible)\n'
fi
