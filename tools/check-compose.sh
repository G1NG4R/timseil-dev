#!/bin/sh
# Compose rules that a code review can miss and an incident cannot.
#
# Two of them predate D2 and apply to both files:
#
#   1. No `ports:` and no Traefik label for db, prometheus, loki or alloy.
#      From outside the host, 22, 80 and 443 answer — nothing else. Those four
#      talk inside the docker network or not at all. The rule holds in the dev
#      file too: a habit that only applies in production is not a habit.
#
#   2. No `build:` in the production compose. Building on the VPS means the
#      artefact you tested is not the artefact that runs — and then the contract
#      test, the SBOM and the signature all describe an image nobody ever
#      deployed. compose.dev.yaml is the one file allowed to build.
#
# Six arrived with D2 and apply to compose.yaml only, because each of them is an
# assertion ADR 0027 makes and this repository does not ship assertions it has
# not mechanised:
#
#   3. The only bind mount is the read-only initdb script under ./ops. Dokploy's
#      volume backups to S3 see named volumes and nothing else, so any other
#      host path is data you find out you cannot restore on the day you need it.
#   4. Every service carries a memory limit. "Ressourcen-Limits pro Service" is
#      the phase requirement; without this it is an intention.
#   5. No `env_file:`. Production values come from the Dokploy UI. A file on the
#      host is a second home for secrets and a file that must exist before `up`.
#   6. Every ghcr.io image is pinned to ${IMAGE_TAG}. A `:latest` in this file
#      deploys whatever was pushed last, which is the one thing the whole build
#      pipeline exists to prevent.
#   7. api and web declare no `healthcheck:`. Both images carry one; a second
#      copy here is a second version, and two versions are one that drifts.
#      `disable: true` is not a copy and stays allowed — that is how the two
#      init containers switch off a probe meant for a server.
#   8. services.db.image is byte-identical in both compose files. Otherwise the
#      page shows the development version of PostgreSQL, which is the exact
#      class of error stack.yaml exists to prevent (issue #28).
#
# The parsing is deliberately dumb: services sit at two spaces, their keys at
# four, list items at six. A YAML library would be a dependency for rules this
# narrow, so instead every rule here is held to its own broken case in
# tools/selftest.sh.
set -eu

fail=0

# Services that must never be reachable from outside the docker network.
closed='^(db|prometheus|loki|alloy)$'

# Services whose healthcheck belongs to their image and nowhere else.
image_probed='^(api|web)$'

scan() {
  file=$1
  prod=$2

  [ -f "$file" ] || { printf '  – %s does not exist yet\n' "$file"; return 0; }

  hits=$(awk -v closed_re="$closed" -v probed_re="$image_probed" -v prod="$prod" '
    /^[[:space:]]*#/ { next }
    /^[A-Za-z_][A-Za-z0-9_-]*:/ { in_services = ($0 ~ /^services:[[:space:]]*$/); svc = ""; key = ""; next }
    !in_services { next }

    # A service header. Before leaving the previous one, rule 4.
    /^  [A-Za-z0-9_.-]+:[[:space:]]*$/ {
      if (prod == "1" && svc != "" && !mem[svc])
        printf "line %d: %s has no memory limit — deploy.resources.limits.memory\n", svcline, svc
      svc = $0; sub(/^  /, "", svc); sub(/:.*$/, "", svc); svcline = NR; key = ""
      next
    }
    svc == "" { next }

    # Remember which four-space key we are inside, so that a tmpfs path starting
    # with / is not mistaken for a bind mount.
    /^    [A-Za-z0-9_-]+:/ { key = $0; sub(/^    /, "", key); sub(/:.*$/, "", key) }

    {
      if (svc ~ closed_re) {
        if ($0 ~ /^    ports:/)      printf "line %d: %s publishes a port — use expose:\n", NR, svc
        if (tolower($0) ~ /traefik/) printf "line %d: %s carries a traefik label\n", NR, svc
      }
      if (prod != "1" && $0 ~ /^    build:/) next

      if ($0 ~ /^    build:/)
        printf "line %d: %s has build: — production images are built in CI, never here\n", NR, svc

      if (prod != "1") next

      if ($0 ~ /^    env_file:/)
        printf "line %d: %s has env_file: — production values come from Dokploy\n", NR, svc

      if ($0 ~ /[[:space:]]memory:[[:space:]]/) mem[svc] = 1

      if ($0 ~ /^    image:[[:space:]]*ghcr\.io\// && $0 !~ /:\$\{IMAGE_TAG/)
        printf "line %d: %s pins no ${IMAGE_TAG} — a floating tag deploys whatever was pushed last\n", NR, svc

      if (svc ~ probed_re && $0 ~ /^    healthcheck:/)
        printf "line %d: %s restates a healthcheck its image already carries\n", NR, svc

      # Rule 3. List items under volumes: only, and only in the production file.
      if (key == "volumes" && $0 ~ /^      -[[:space:]]/) {
        src = $0
        sub(/^      -[[:space:]]*/, "", src)
        sub(/:.*$/, "", src)
        if (src ~ /^[.\/~]/ && $0 !~ /^      -[[:space:]]*\.\/ops\/[^:]+:[^:]+:ro[[:space:]]*$/)
          printf "line %d: %s bind-mounts %s — only ./ops/...:ro may be a host path\n", NR, svc, src
      }
    }

    END {
      if (prod == "1" && svc != "" && !mem[svc])
        printf "line %d: %s has no memory limit — deploy.resources.limits.memory\n", svcline, svc
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

# Rule 8. Two files, one Postgres version. stack.yaml reads the tag out of
# compose.yaml to put it on a page; if the dev file has moved on, the page is
# quietly showing a version nothing runs.
db_image() {
  [ -f "$1" ] || return 0
  awk '
    /^[A-Za-z_][A-Za-z0-9_-]*:/ { in_services = ($0 ~ /^services:[[:space:]]*$/); svc = ""; next }
    !in_services { next }
    /^  [A-Za-z0-9_.-]+:[[:space:]]*$/ { svc = $0; sub(/^  /, "", svc); sub(/:.*$/, "", svc); next }
    svc == "db" && /^    image:/ { sub(/^    image:[[:space:]]*/, ""); print; exit }
  ' "$1"
}

check_db_image_agrees() {
  [ -f compose.yaml ] && [ -f compose.dev.yaml ] || return 0
  prod=$(db_image compose.yaml)
  dev=$(db_image compose.dev.yaml)
  if [ "$prod" != "$dev" ]; then
    printf '  ✗ the two compose files disagree about postgres\n'
    printf '    compose.yaml     %s\n' "${prod:-<none>}"
    printf '    compose.dev.yaml %s\n' "${dev:-<none>}"
    printf '    stack.yaml reads the production tag and puts it on a page\n'
    fail=1
  else
    printf '  ✓ both files run %s\n' "$prod"
  fi
}

# compose.dev.yaml may build; it may still not open db to the host.
scan compose.dev.yaml 0
# compose.yaml may do neither, and carries the six D2 rules on top.
scan compose.yaml 1
check_db_image_agrees

[ "$fail" -eq 0 ] || exit 1
