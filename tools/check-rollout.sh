#!/bin/sh
# Does the rollout start every service compose.yaml defines?
#
#   check-rollout.sh [root]     default root: .
#
# WHY THIS EXISTS, and the incident is one deploy old. On 2026-08-23 F2 was
# merged, released and did not run. Dokploy's Command field replaces the default
# `up -d` wholesale and names services one by one; prometheus, loki and alloy
# were not among them, so they never started. The deploy went green, the site
# served normally, and `docker exec ...-alloy-1` answered "No such container".
#
# What made them invisible is not an oversight but the design. ADR 0039 keeps
# every depends_on pointed away from those three so the site keeps serving when
# all of them are gone — and a service nothing depends on is a service nothing
# drags along. db, migrate and seed survive the same field because api2 pulls
# them in; the collector has no such sponsor.
#
# WHY NO EXISTING GATE CAUGHT IT, which is the part worth writing down. The
# pipeline asserts that a visitor can use the site (tools/verify-deploy.sh) and
# that production runs the published bytes (tools/check-deployed.sh). Both were
# true. Both are blind to a service no visitor ever asks for, and F2 introduced
# the first ones of that kind. F3 adds node-exporter and postgres-exporter, so
# the same hole would open again in the next phase.
#
# THE RULE. Every service in compose.yaml must be started by the rollout: named
# in an `up` step, or reachable through depends_on from a service named in an
# `up` step that does NOT carry --no-deps. No exemption by restart policy — the
# two one-shots are covered as dependencies anyway, and an exemption is a hole
# somebody grows into later. A service that genuinely should not run has to say
# so out loud rather than being missed quietly.
#
# The steps are not copied here. `tools/rollout.sh --steps` is asked, so the
# rollout keeps living in exactly one place (its header explains why that
# matters). This is that mode's first caller.
#
# The parsing is deliberately dumb, same as tools/check-compose.sh: services sit
# at two spaces, their keys at four, depends_on entries at six. Reading a nested
# block is new here — no other gate needed one — so it stays as small as the
# rule allows, and the broken case is held in tools/selftest.sh.
set -eu

root=${1:-.}
prod="$root/compose.yaml"
twins="$root/compose.rollout.yaml"
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

fail=0

[ -f "$prod" ] || { printf '  – %s does not exist yet\n' "$prod"; exit 0; }

# Every service in compose.yaml, and the depends_on of each, as "svc dep" pairs.
# One pass, because a second one would be a second place to decide what a
# service line looks like.
services=$(awk '
  /^[[:space:]]*#/ { next }
  /^[A-Za-z_][A-Za-z0-9_-]*:/ { in_services = ($0 ~ /^services:[[:space:]]*$/); svc = ""; next }
  !in_services { next }
  /^  [A-Za-z0-9_.-]+:[[:space:]]*$/ {
    svc = $0; sub(/^  /, "", svc); sub(/:.*$/, "", svc)
    print "svc " svc
    dep = 0
    next
  }
  svc == "" { next }
  /^    [A-Za-z0-9_.-]+:/ { dep = ($0 ~ /^    depends_on:[[:space:]]*$/); next }
  dep && /^      [A-Za-z0-9_.-]+:[[:space:]]*$/ {
    d = $0; sub(/^      /, "", d); sub(/:.*$/, "", d)
    print "dep " svc " " d
  }
' "$prod")

# The twins are not in compose.yaml, and step 1 reaches db, migrate and seed
# only through one of them. `extends` copies depends_on — measured, see the
# header of compose.rollout.yaml — so api2 stands in for api here. Without this
# the check would report db as never started, which is a false alarm loud
# enough to get the whole gate deleted.
# check-compose.sh's check_twins_only_extend already guarantees that a service
# in that file carries nothing but `extends`, so `service:` is the whole story.
aliases=''
if [ -f "$twins" ]; then
  aliases=$(awk '
    /^[[:space:]]*#/ { next }
    /^[A-Za-z_][A-Za-z0-9_-]*:/ { in_services = ($0 ~ /^services:[[:space:]]*$/); twin = ""; next }
    !in_services { next }
    /^  [A-Za-z0-9_.-]+:[[:space:]]*$/ { twin = $0; sub(/^  /, "", twin); sub(/:.*$/, "", twin); next }
    twin != "" && /^      service:[[:space:]]*[A-Za-z0-9_.-]+[[:space:]]*$/ {
      s = $0; sub(/^      service:[[:space:]]*/, "", s); sub(/[[:space:]]*$/, "", s)
      print twin " " s
    }
  ' "$twins")
fi

resolve() { # a twin stands for what it extends; anything else is itself
  echo "$aliases" | awk -v n="$1" '$1 == n { print $2; found = 1 } END { if (!found) print n }'
}

deps_of() {
  echo "$services" | awk -v n="$1" '$1 == "dep" && $2 == n { print $3 }'
}

# Services the rollout starts. Only `up` steps count -- step 4 is
# `rm -s -f api2 web2`, and a service being REMOVED is the opposite of started.
started=''
add() { case " $started " in *" $1 "*) ;; *) started="$started $1" ;; esac; }

# Dependencies come along only where --no-deps is absent, which today is step 1
# alone. Depth is bounded by the service count; compose forbids cycles.
pull() {
  add "$1"
  for d in $(deps_of "$1"); do
    case " $started " in *" $d "*) ;; *) pull "$d" ;; esac
  done
}

steps=$("$here/rollout.sh" --steps) || { printf '  ✗ rollout.sh --steps failed\n'; exit 1; }

OLDIFS=$IFS
IFS='
'
for step in $steps; do
  IFS=$OLDIFS
  set -- $step
  [ "$1" = "up" ] || continue
  nodeps=0
  case " $step " in *" --no-deps "*) nodeps=1 ;; esac
  shift
  for tok in "$@"; do
    case $tok in -*) continue ;; esac
    svc=$(resolve "$tok")
    if [ "$nodeps" -eq 1 ]; then add "$svc"; else pull "$svc"; fi
  done
  IFS='
'
done
IFS=$OLDIFS

missing=''
for svc in $(echo "$services" | awk '$1 == "svc" { print $2 }'); do
  case " $started " in
    *" $svc "*) ;;
    *) missing="$missing $svc" ;;
  esac
done

if [ -n "$missing" ]; then
  fail=1
  printf '  ✗ the rollout never starts:%s\n' "$missing"
  printf '    a service nothing names and nothing depends on does not run, and\n'
  printf '    the deploy still goes green — that is F2, 2026-08-23\n'
  printf '    name it in a step of tools/rollout.sh, or give it a sponsor\n'
else
  printf '  ✓ the rollout starts every service compose.yaml defines\n'
fi

[ "$fail" -eq 0 ] || exit 1
