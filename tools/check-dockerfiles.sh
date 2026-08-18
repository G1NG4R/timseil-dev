#!/bin/sh
# Four Dockerfile rules that a code review can miss and a rotated secret cannot:
#
#   1. Every FROM resolves to a digest. A tag is a name its owner may point
#      somewhere else tomorrow, which is how the tj-actions attack worked one
#      supply chain over. Raising a digest should be a commit somebody reads.
#      Dockerfile.dev is exempt: nothing it builds is ever deployed.
#
#   2. No ARG and no ENV whose name reads like a secret. A build arg lands in
#      the image layers and stays there after the value is rotated, and `docker
#      history` on a public image reads them back. Secrets are runtime
#      environment, from Dokploy — never baked. This one holds for the dev files
#      too: a habit that only applies in production is not a habit.
#
#   3. The last stage sets USER. Left unsaid, a container runs as root, and the
#      one thing standing between a bug in a handler and the host is then the
#      kernel.
#
#   4. No `go mod download` in the API image. The reflex caches the module graph
#      in its own layer; here it would pull the tool dependencies — sqlc,
#      oapi-codegen and the indirect lines behind them — into a layer nothing in
#      the binary ever reads. Issue #58 says it at length.
#
# The parsing is deliberately dumb, same as tools/check-compose.sh: instructions
# at the start of a line, one ARG form (`ARG NAME=value`) substituted into FROM.
# A Dockerfile parser would be a dependency for a rule this narrow, so instead
# this check is held to its own broken case in tools/selftest.sh.
set -eu

fail=0

# Names that must never appear on an ARG or an ENV in any of these files.
secretish='TOKEN|SECRET|PASSWORD|PASSWD|PEPPER|CREDENTIAL|API_?KEY|PRIVATE_KEY'

scan() {
  file=$1
  production=$2

  [ -f "$file" ] || { printf '  – %s does not exist yet\n' "$file"; return 0; }

  hits=$(awk -v prod="$production" -v secretish="$secretish" '
    # Comments first, and this line is load-bearing: these files explain their
    # own rules in prose, so a rule that matched anywhere would flag the
    # sentence describing it. The check reported its own documentation once.
    /^[[:space:]]*#/ { next }

    # ARG defaults are collected whatever the file, because FROM may name one.
    /^[[:space:]]*ARG[[:space:]]/ {
      line = $0
      sub(/^[[:space:]]*ARG[[:space:]]+/, "", line)
      name = line
      sub(/=.*$/, "", name)
      if (line ~ /=/) { value = line; sub(/^[^=]*=/, "", value); defaults[name] = value }
    }

    # Rule 2, everywhere.
    /^[[:space:]]*(ARG|ENV)[[:space:]]/ {
      key = $2
      sub(/=.*$/, "", key)
      if (toupper(key) ~ secretish)
        printf "line %d: %s %s — a secret in a layer outlives its rotation; pass it at runtime\n", NR, $1, key
    }

    prod != "1" { next }

    /^[[:space:]]*FROM[[:space:]]/ {
      image = $2
      # One level of ${NAME} / $NAME substitution against the ARG defaults.
      if (image ~ /^\$/) {
        name = image
        gsub(/[${}]/, "", name)
        if (name in defaults) image = defaults[name]
      }
      last_from = NR
      have_user = 0
      # Rule 1.
      if (image !~ /@sha256:[0-9a-f]{64}$/)
        printf "line %d: FROM %s is not pinned by digest — a tag can be moved\n", NR, $2
    }

    # Rule 3: remembered per stage, reported at the end for the last one.
    /^[[:space:]]*USER[[:space:]]/ { have_user = 1 }

    # Rule 4.
    /go[[:space:]]+mod[[:space:]]+download/ {
      printf "line %d: go mod download — it caches the tool graph into a layer the binary never reads (#58)\n", NR
    }

    END {
      if (prod == "1" && last_from > 0 && have_user == 0)
        printf "line %d: the last stage sets no USER — it would run as root\n", last_from
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

# The two images that ship. Every rule applies.
scan api/Dockerfile 1
scan web/Dockerfile 1

# The two that do not. Only the secret rule, because the habit is the point.
scan api/Dockerfile.dev 0
scan web/Dockerfile.dev 0

[ "$fail" -eq 0 ] || exit 1
