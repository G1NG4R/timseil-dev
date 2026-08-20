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
# One arrived with E2 and completes what api/Dockerfile already had:
#
#   8b. Every image that is not one of ours carries an @sha256: digest. The
#      Dockerfiles have been pinned since D1 — tools/check-dockerfiles.sh
#      refuses a bare FROM — while postgres sat here on a movable tag, alone,
#      because stack.yaml read this line for the page and the resolver took
#      everything after the last colon. That resolver now cuts the digest off
#      first (#93), so the exception has nothing left to stand on. Our own
#      ghcr.io images are excluded and stay excluded: rule 6 pins them to
#      ${IMAGE_TAG}, a digest nobody could write before the image is built.
#
# Five arrived with D3, and every one of them is a way for the proxy and the
# stack to lose each other WITHOUT anything going red. That is what makes them
# worth a gate: a stack that comes up green and is invisible to Traefik looks
# like a DNS problem for an hour before anybody suspects this file.
#
#   9. api and web carry the whole label set: traefik.enable, a router rule, a
#      loadbalancer.server.port, and traefik.docker.network. The last one is not
#      decoration — with a service in two networks Traefik must be told which IP
#      is the backend, and picking the other one gives it an address it cannot
#      reach. The symptom is a timeout, not an error.
#  10. That loadbalancer.server.port is one the service actually exposes. When a
#      container offers more than one port Traefik guesses, and guesses wrong.
#  11. api and web list BOTH dokploy-network and default; db, prometheus, loki
#      and alloy list neither. A service that names `networks:` joins ONLY those,
#      so dropping default here takes the database away from the api — and the
#      failure reads as a database outage. The other half of the rule keeps the
#      closed services off a network shared with every other app on that host.
#  12. A dokploy-network that is used is declared `external: true`. Without it
#      compose does not fail; it CREATES timseil_dokploy-network, a real and
#      healthy network that Traefik is not on.
#  13. Every router with a rule also carries an explicit priority. Traefik orders
#      by rule LENGTH when nobody says otherwise, so the api router wins today by
#      accident and stops winning the day somebody rewords the rule. Next.js
#      would then answer /api/* with its own 404 page while the site still looks
#      fine.
#  14. MAIL_TRANSPORT is passed through and never pinned. `log` builds the mail
#      and drops it, so a production file carrying it answers every submission
#      202 and delivers nothing — the one failure of that endpoint that looks
#      like success from both ends. Pinning `smtp` is refused too: the default
#      belongs to internal/config, and a second place to state it is a second
#      place to state it wrong. compose.dev.yaml pins `log` on purpose and is
#      not a production file. Arrived with L1, ADR 0029 §8.
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

# Services Traefik routes. The same two members as image_probed today and a
# different reason, so they stay two variables: the day a third service is
# routed they diverge, and one variable would have hidden that.
routed='^(api|web)$'

# The network Traefik lives in. Named once here and once in compose.yaml.
proxy_net='dokploy-network'

scan() {
  file=$1
  prod=$2

  [ -f "$file" ] || { printf '  – %s does not exist yet\n' "$file"; return 0; }

  hits=$(awk -v closed_re="$closed" -v probed_re="$image_probed" \
             -v routed_re="$routed" -v pnet="$proxy_net" -v prod="$prod" '
    # Rules 4 and 9-11 are answers about a WHOLE service, so they are collected
    # while it is read and emitted when it ends. That happens in two places — at
    # the next service header and at the end of the block — so it is a function
    # rather than the same lines written twice.
    function finish() {
      if (prod != "1" || svc == "") return

      if (!mem[svc])
        printf "line %d: %s has no memory limit — deploy.resources.limits.memory\n", svcline, svc

      if (svc ~ routed_re) {
        if (!tenable[svc])
          printf "line %d: %s carries no traefik.enable=true — traefik would not route it\n", svcline, svc
        if (!tnet[svc])
          printf "line %d: %s names no traefik.docker.network=%s — traefik would pick the unreachable ip\n", svcline, svc, pnet
        if (!hasrule[svc])
          printf "line %d: %s has traefik labels but no router rule\n", svcline, svc
        if (lbport[svc] == "")
          printf "line %d: %s names no loadbalancer.server.port — traefik guesses, and guesses wrong\n", svcline, svc
        else if (!((svc SUBSEP lbport[svc]) in exposed))
          printf "line %d: %s routes to port %s, which it does not expose\n", svcline, svc, lbport[svc]

        if (!(svc in netlist))
          printf "line %d: %s declares no networks: — it needs %s and default\n", svcline, svc, pnet
        else {
          if (netlist[svc] !~ pnet)
            printf "line %d: %s is not in %s — traefik cannot reach it\n", svcline, svc, pnet
          if (netlist[svc] !~ /(^|[^a-zA-Z0-9_-])default([^a-zA-Z0-9_-]|$)/)
            printf "line %d: %s names %s without default — it would lose db\n", svcline, svc, pnet
        }
      }

      if (svc ~ closed_re && (svc in netlist) && netlist[svc] ~ pnet)
        printf "line %d: %s sits in %s — that network is shared with every other app on the host\n", svcline, svc, pnet
    }

    /^[[:space:]]*#/ { next }
    /^[A-Za-z_][A-Za-z0-9_-]*:/ {
      finish()
      in_services = ($0 ~ /^services:[[:space:]]*$/)
      in_networks = ($0 ~ /^networks:[[:space:]]*$/)
      svc = ""; key = ""; topnet = ""
      next
    }

    # Rule 12 lives outside services:, which is why the parser needed a second
    # top-level context at all.
    in_networks {
      if ($0 ~ /^  [A-Za-z0-9_.-]+:[[:space:]]*$/) {
        topnet = $0; sub(/^  /, "", topnet); sub(/:.*$/, "", topnet)
        if (topnet == pnet) { pnet_declared = 1; pnet_line = NR }
        next
      }
      if (topnet == pnet && $0 ~ /^    external:[[:space:]]*true[[:space:]]*$/) pnet_external = 1
      next
    }

    !in_services { next }

    # A service header. Before leaving the previous one, everything about it.
    /^  [A-Za-z0-9_.-]+:[[:space:]]*$/ {
      finish()
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

      # Rule 14. The value has to be the passthrough and nothing else, so this
      # compares rather than searches: a rule that only refused the word "log"
      # would pass a pinned "smtp" and would miss the day somebody writes it
      # ${MAIL_TRANSPORT:-log} instead.
      if (key == "environment" && $0 ~ /MAIL_TRANSPORT/) {
        val = $0
        sub(/^[[:space:]]*-?[[:space:]]*MAIL_TRANSPORT[:=][[:space:]]*/, "", val)
        sub(/[[:space:]]+$/, "", val)
        gsub(/"/, "", val)
        if (val != "${MAIL_TRANSPORT:-}")
          printf "line %d: %s pins MAIL_TRANSPORT to %s — pass it through as ${MAIL_TRANSPORT:-}; the default lives in internal/config\n", NR, svc, val
      }

      if ($0 ~ /[[:space:]]memory:[[:space:]]/) mem[svc] = 1

      if ($0 ~ /^    image:[[:space:]]*ghcr\.io\// && $0 !~ /:\$\{IMAGE_TAG/)
        printf "line %d: %s pins no ${IMAGE_TAG} — a floating tag deploys whatever was pushed last\n", NR, svc

      if (svc ~ probed_re && $0 ~ /^    healthcheck:/)
        printf "line %d: %s restates a healthcheck its image already carries\n", NR, svc

      # Rules 9, 10 and 13 read the label list; rule 10 also reads expose:, and
      # rule 11 the networks list in either spelling.
      if (key == "labels" && $0 ~ /^      -[[:space:]]/) {
        lab = $0; sub(/^      -[[:space:]]*/, "", lab); gsub(/"/, "", lab)
        if (lab ~ /^traefik\.enable[[:space:]]*=[[:space:]]*true/) tenable[svc] = 1
        if (lab ~ /^traefik\.docker\.network[[:space:]]*=/) {
          v = lab; sub(/^[^=]*=[[:space:]]*/, "", v)
          if (v == pnet) tnet[svc] = 1
        }
        if (lab ~ /^traefik\.http\.routers\.[A-Za-z0-9_.-]+\.rule[[:space:]]*=/) {
          hasrule[svc] = 1
          r = lab; sub(/^traefik\.http\.routers\./, "", r); sub(/\.rule.*$/, "", r)
          rrule[r] = NR
        }
        if (lab ~ /^traefik\.http\.routers\.[A-Za-z0-9_.-]+\.priority[[:space:]]*=/) {
          r = lab; sub(/^traefik\.http\.routers\./, "", r); sub(/\.priority.*$/, "", r)
          rprio[r] = 1
        }
        if (lab ~ /^traefik\.http\.services\.[A-Za-z0-9_.-]+\.loadbalancer\.server\.port[[:space:]]*=/) {
          v = lab; sub(/^[^=]*=[[:space:]]*/, "", v); sub(/[[:space:]].*$/, "", v)
          lbport[svc] = v
        }
      }

      if (key == "expose" && $0 ~ /^      -[[:space:]]/) {
        p = $0; sub(/^      -[[:space:]]*/, "", p); gsub(/"/, "", p); sub(/[[:space:]].*$/, "", p)
        exposed[svc, p] = 1
      }

      if ($0 ~ /^    networks:/) {
        n = $0; sub(/^    networks:[[:space:]]*/, "", n)
        netlist[svc] = netlist[svc] " " n
      }
      if (key == "networks" && $0 ~ /^      -[[:space:]]/) {
        n = $0; sub(/^      -[[:space:]]*/, "", n)
        netlist[svc] = netlist[svc] " " n
      }

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
      finish()
      if (prod != "1") exit

      # Rule 12. Asked only if something uses it: a file with no proxy at all is
      # not a file with a broken proxy.
      used = 0
      for (s in netlist) if (netlist[s] ~ pnet) used = 1
      if (used && !pnet_declared)
        printf "%s is used by a service but never declared — compose would create its own, and traefik is not on that one\n", pnet
      else if (used && !pnet_external)
        printf "line %d: %s is declared without external: true — compose would create its own, and traefik is not on that one\n", pnet_line, pnet

      # Rule 13.
      for (r in rrule)
        if (!(r in rprio))
          printf "line %d: router %s has a rule but no explicit priority — traefik would order it by rule length\n", rrule[r], r
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

# Rule 8b. A tag can be repointed by whoever owns the registry entry; a digest
# cannot. Ours are exempt because ${IMAGE_TAG} is resolved at deploy time and is
# already a commit sha — rule 6 holds that end.
check_foreign_images_are_pinned() {
  [ -f "$1" ] || return 0
  bad=$(awk '
    /^[A-Za-z_][A-Za-z0-9_-]*:/ { in_services = ($0 ~ /^services:[[:space:]]*$/); next }
    !in_services { next }
    /^    image:/ {
      ref = $0
      sub(/^    image:[[:space:]]*/, "", ref)
      sub(/[[:space:]]*#.*$/, "", ref)
      if (ref ~ /^ghcr\.io\//) next
      if (ref ~ /@sha256:[0-9a-f]{64}$/) next
      printf "line %d: %s\n", NR, ref
    }
  ' "$1")
  if [ -n "$bad" ]; then
    printf '  ✗ %s has an image that is not pinned by digest\n' "$1"
    printf '%s\n' "$bad" | sed 's/^/    /'
    printf '    a tag can be moved to other bytes after review; a digest cannot\n'
    fail=1
  else
    printf '  ✓ %s pins every foreign image by digest\n' "$1"
  fi
}

# compose.dev.yaml may build; it may still not open db to the host.
scan compose.dev.yaml 0
# compose.yaml may do neither, and carries the six D2 rules on top.
scan compose.yaml 1
check_db_image_agrees
check_foreign_images_are_pinned compose.yaml
check_foreign_images_are_pinned compose.dev.yaml

[ "$fail" -eq 0 ] || exit 1
