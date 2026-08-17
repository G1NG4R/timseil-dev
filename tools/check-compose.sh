#!/bin/sh
# Two compose rules that a code review can miss and an incident cannot:
#
#   1. No `ports:` and no Traefik label for db, prometheus, loki or alloy.
#      From outside the host, 22, 80 and 443 answer — nothing else. Those four
#      talk inside the docker network or not at all. The rule holds in the dev
#      file too: a habit that only applies in production is not a habit.
#
#   2. No `build:` in the production compose. Building on the VPS means the
#      artefact you tested is not the artefact that runs — and then the
#      contract test, the SBOM and the signature all describe an image nobody
#      ever deployed. compose.dev.yaml is the one file allowed to build.
#
# The parsing is deliberately dumb: services sit at two spaces, their keys at
# four. A YAML library would be a dependency for a rule this narrow, so instead
# this check is held to its own broken case in tools/selftest.sh.
set -eu

fail=0

# Services that must never be reachable from outside the docker network.
closed='^(db|prometheus|loki|alloy)$'

scan() {
  file=$1
  build_forbidden=$2

  [ -f "$file" ] || { printf '  – %s does not exist yet\n' "$file"; return 0; }

  hits=$(awk -v closed_re="$closed" -v want_build="$build_forbidden" '
    /^[[:space:]]*#/ { next }
    /^[A-Za-z_][A-Za-z0-9_-]*:/ { in_services = ($0 ~ /^services:[[:space:]]*$/); svc = ""; next }
    !in_services { next }
    /^  [A-Za-z0-9_.-]+:[[:space:]]*$/ { svc = $0; sub(/^  /, "", svc); sub(/:.*$/, "", svc); next }
    svc == "" { next }
    {
      if (svc ~ closed_re) {
        if ($0 ~ /^    ports:/)   printf "line %d: %s publishes a port — use expose:\n", NR, svc
        if (tolower($0) ~ /traefik/) printf "line %d: %s carries a traefik label\n", NR, svc
      }
      if (want_build == "1" && $0 ~ /^    build:/)
        printf "line %d: %s has build: — production images are built in CI, never here\n", NR, svc
    }
  ' "$file")

  if [ -n "$hits" ]; then
    printf '  ✗ %s\n' "$file"
    printf '%s\n' "$hits" | sed 's/^/    /'
    fail=1
  else
    printf '  ✓ %s\n' "$file"
  fi
}

# compose.dev.yaml may build; it may still not open db to the host.
scan compose.dev.yaml 0
# compose.yaml arrives in D2 and may do neither.
scan compose.yaml 1

[ "$fail" -eq 0 ] || exit 1
