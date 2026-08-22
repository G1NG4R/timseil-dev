#!/bin/sh
# What GHCR answers a stranger, and nothing else.
#
#   registry.sh digest <repo> <tag>       → sha256:… on stdout
#   registry.sh tags   <repo>             → one tag per line
#   registry.sh config <repo> <digest>    → the image config blob, as JSON
#   registry.sh index  <repo> <digest>    → the child digests of an index
#
# <repo> is the short name: timseil-api or timseil-web.
#
# ANONYMOUSLY, AND THAT IS PART OF THE CLAIM. Every request here fetches a pull
# token from ghcr.io/token with no credential at all. The packages are public,
# and a proof that leans on the runner's login proves something about the runner
# — the argument tools/verify-supply-chain.sh already makes about not logging in.
# It doubles as a check that the packages are still public.
#
# WHY THIS IS A FILE AND NOT FOUR LINES OF CURL IN EACH CALLER
#
# Three details are wrong SILENTLY when they are spelled twice:
#
#   1. the Accept header set. Ask for a manifest without it and the registry
#      hands back a schema-1 document, which resolves to a different digest than
#      the one the tag actually names.
#   2. -L on a blob. The config blob is served as a redirect to storage; without
#      -L the answer is an empty body and a 307, and `jq` on that is `null`,
#      which reads as "the image has no created timestamp" rather than as a bug.
#   3. the token scope. It is per repository, so a token fetched for one package
#      answers 401 for the other — and a 401 body is JSON too.
#
# Each of those turns into a wrong answer rather than into an error, which is
# the shape of bug this repository spends its checks on.
#
# It also gives runbook 3.5 something to re-run. The measurement there was a
# Markdown one-liner; `tools/registry.sh tags timseil-api` is the same question
# as a command, and the number in the runbook stops being a claim about a day.
set -eu

usage() {
  printf '  ✗ usage: registry.sh <digest|tags|config|index> <repo> [tag-or-digest]\n' >&2
  exit 1
}

cmd=${1:-}
repo=${2:-}
ref=${3:-}

[ -n "$cmd" ] && [ -n "$repo" ] || usage

# The repository is not a parameter in the usual sense: it is one of two names,
# and it goes into a URL path. Anything else is either a typo or an attempt to
# point this at somebody else's package, and both deserve the same short answer.
case $repo in
  timseil-api | timseil-web) ;;
  *) printf '  ✗ %s is not timseil-api or timseil-web\n' "$repo" >&2; exit 1 ;;
esac

# Same reasoning one level down. A tag or a digest is appended to a URL path, so
# it may not carry a slash, a dot pair, or anything outside the character set
# the registry itself allows. Refused here rather than escaped, because a caller
# that produced such a reference has a bug worth one clear message.
if [ -n "$ref" ]; then
  case $ref in
    *[!A-Za-z0-9._:-]* | *..* | '')
      printf '  ✗ %s is not a valid tag or digest\n' "$ref" >&2; exit 1 ;;
  esac
fi

for tool in curl jq; do
  command -v "$tool" >/dev/null 2>&1 || {
    printf '  ✗ %s is not available\n' "$tool" >&2
    exit 1
  }
done

NS=${REGISTRY_NAMESPACE:-g1ng4r}
HOST=${REGISTRY_HOST:-ghcr.io}

# Every manifest media type the two packages can answer with. buildx publishes an
# OCI index; cosign's fallback tag is an OCI index too; a single-platform build is
# a plain manifest. Docker's two equivalents are listed because the registry may
# convert, and a missing one is the silent-wrong-digest case above.
ACCEPT='application/vnd.oci.image.index.v1+json,application/vnd.oci.image.manifest.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json'

token() {
  curl -sS --max-time 20 \
    "https://$HOST/token?scope=repository:$NS/$repo:pull&service=$HOST" \
    | jq -r '.token // empty'
}

tok=$(token) || tok=''
[ -n "$tok" ] || {
  printf '  ✗ %s would not issue a pull token for %s/%s\n' "$HOST" "$NS" "$repo" >&2
  printf '    the package is public, so this is the network or the registry, not a login\n' >&2
  exit 1
}

api() { # api <path> [extra-curl-args...]
  path=$1; shift
  curl -sS --max-time 30 -H "Authorization: Bearer $tok" "$@" \
    "https://$HOST/v2/$NS/$repo/$path"
}

case $cmd in
  # The digest a name resolves to RIGHT NOW. Read from the header the registry
  # computes, never from a hash of the body this side downloaded — those differ
  # the moment a byte of transport encoding differs.
  digest)
    [ -n "$ref" ] || usage
    d=$(api "manifests/$ref" -o /dev/null -D - -H "Accept: $ACCEPT" \
        | tr -d '\r' | awk 'tolower($1) == "docker-content-digest:" { print $2 }')
    [ -n "$d" ] || {
      printf '  ✗ %s/%s:%s is not in the registry\n' "$NS" "$repo" "$ref" >&2
      exit 1
    }
    printf '%s\n' "$d"
    ;;

  tags)
    api 'tags/list' | jq -r '.tags[]? // empty'
    ;;

  # The config blob, which is where `created` and the OCI labels live. An index
  # has no config of its own, so the first child is followed — every child of one
  # of our indexes is the same build for a different platform and carries the
  # same labels.
  config)
    [ -n "$ref" ] || usage
    m=$(api "manifests/$ref" -H "Accept: $ACCEPT")
    cfg=$(printf '%s' "$m" | jq -r '.config.digest // empty')
    if [ -z "$cfg" ]; then
      child=$(printf '%s' "$m" | jq -r '.manifests[0].digest // empty')
      [ -n "$child" ] || {
        printf '  ✗ %s has neither a config nor a child manifest\n' "$ref" >&2
        exit 1
      }
      cfg=$(api "manifests/$child" -H "Accept: $ACCEPT" | jq -r '.config.digest // empty')
    fi
    [ -n "$cfg" ] || { printf '  ✗ %s has no image config\n' "$ref" >&2; exit 1; }
    api "blobs/$cfg" -L
    ;;

  index)
    [ -n "$ref" ] || usage
    api "manifests/$ref" -H "Accept: $ACCEPT" | jq -r '.manifests[]?.digest // empty'
    ;;

  *) usage ;;
esac
