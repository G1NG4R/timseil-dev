#!/bin/sh
# Can our Prometheus reach Traefik? Run on the VPS:
#
#     sh ops/host/check-traefik-metrics.sh
#
# D3 switched Traefik's metrics endpoint on and this script proved two halves:
# the endpoint answers with traefik_* series, and its port is not published to
# the host. F3 needs a third thing, and it is the one that actually decides
# whether the phase works:
#
#     THE NAME `timseil-traefik` RESOLVES ON observability-network, AND
#     ANSWERS.
#
# WHY A NAME AND NOT AN ADDRESS. The version of this script that asked Traefik's
# IP directly tested a path nobody walks. ops/prometheus/prometheus.yml scrapes
# `timseil-traefik:8082`, so what has to hold is DNS plus routing plus the
# endpoint — and only a request made the way Prometheus makes it tests all
# three. An IP that answers while the alias does not is a green check in front
# of a dead job.
#
# WHY THE ALIAS AT ALL. `traefik` is not a name we own. observability-network is
# shared, and when a name exists on several of a reader's networks Docker
# answers from the network whose NAME sorts first (measured 2026-08-23, ADR 0039
# §2). A bare `traefik` would fail by answering — with somebody else's proxy —
# and that reads as healthy. ADR 0040 §1.
#
# WHY TRAEFIK IS ON OUR NETWORK AND NOT US ON ITS. Traefik lives in
# dokploy-network, shared with every app on this host; check-compose rule 1 and
# 11 keep our stores out of there on purpose. So the direction is reversed: the
# proxy joins observability-network. That is a change to a container Dokploy
# owns, and `docker network connect` does NOT survive its restart (measured
# 2026-08-24 on the neighbouring Grafana) — which is why the last line of this
# script says what it says.
#
# THE HOST CANNOT REACH THESE NETWORKS, and the first version of this script
# assumed it could. dokploy-network is an OVERLAY (measured 2026-08-25,
# driver=overlay) and overlay addresses do not exist in the host's network
# namespace. That defect hid behind a true result for two stages: the metrics
# were off, the line failed for the reason it named, and nobody looked past it.
# So every probe here runs in a throwaway container ON the network, borrowing
# the image our own Prometheus runs — already on this host, and carrying wget,
# which is why docs/runbooks/observability.md uses it as the client everywhere.
#
# TRAEFIK_METRICS_PORT overrides the port if Dokploy's static configuration uses
# a different one — read it there rather than trusting this default.
set -eu

port=${TRAEFIK_METRICS_PORT:-8082}
obs=${OBS_NETWORK:-observability-network}
alias_name=${TRAEFIK_ALIAS:-timseil-traefik}

fail=0
ok()  { printf '  ✓ %s\n' "$1"; }
no()  { printf '  ✗ %s\n' "$1"; fail=1; }

printf 'traefik metrics\n'

name=$(docker ps --format '{{.Names}}\t{{.Image}}' | awk -F'\t' '$2 ~ /traefik/ {print $1; exit}')
[ -n "$name" ] || { no "no running container whose image looks like traefik"; exit 1; }
ok "proxy container is $name"

# The client. Same image as our Prometheus so nothing is pulled for a check.
probe=$(docker ps --format '{{.Image}}' | grep -m1 'prom/prometheus' || true)
[ -n "$probe" ] || probe=alpine:3

# 1. Attached at all. Asked before the functional test only so that a failure
#    below has a cause printed above it rather than a timeout to interpret.
if docker inspect "$name" --format "{{json .NetworkSettings.Networks}}" 2>/dev/null | grep -q "\"$obs\""; then
  ok "$name is attached to $obs"
else
  no "$name is NOT attached to $obs — the scrape cannot work, see runbook dokploy.md 3.2"
fi

# 2. THE ACTUAL PATH. Exactly the request ops/prometheus/prometheus.yml makes:
#    this name, this port, from this network.
body=$(docker run --rm --network "$obs" --entrypoint wget "$probe" \
  -qO- --timeout=5 "http://$alias_name:$port/metrics" 2>/dev/null || true)

if [ -z "$body" ]; then
  no "no answer from http://$alias_name:$port/metrics on $obs"
  printf '      two causes, and they need different repairs:\n'
  printf '        · the alias is missing        → the attachment carries no --alias %s\n' "$alias_name"
  printf '        · metrics are off             → metrics.prometheus in the static config\n'
else
  series=$(printf '%s\n' "$body" | grep -c '^traefik_' || true)
  if [ "$series" -gt 0 ]; then
    ok "$alias_name answers on $obs with $series traefik_* series"
    printf '%s\n' "$body" | grep '^traefik_' | cut -d'{' -f1 | sort -u | head -6 | sed 's/^/      /'

    # 3. Do OUR services actually appear? A proxy that answers about somebody
    #    else's apps and none of ours is the failure ops/prometheus/rules/
    #    filters against, seen from the other end. Without this line the check
    #    is green while every recording rule computes over an empty set.
    mine=$(printf '%s\n' "$body" | grep -c 'service="timseil-' || true)
    if [ "$mine" -gt 0 ]; then
      ok "$mine series carry a timseil-* service — the recording rules have input"
    else
      no "the endpoint answers, but no series names a timseil-* service"
      printf '      the rules in ops/prometheus/rules/ filter on that prefix and would\n'
      printf '      evaluate over nothing. Has the site served a request since the\n'
      printf '      proxy last started?\n'
    fi

    # NO VERSION LINE HERE, AND THE ABSENCE IS THE POINT.
    #
    # This is where a `grep traefik_build_info` stood, because stack.yaml and
    # ADR 0028 §10 both name that series as "the honest source" for the proxy
    # version. IT DOES NOT EXIST. Measured 2026-08-26 against the running host
    # (v3.6.7) and reproduced locally against v3.7.11: Traefik exports no
    # build, version or info metric at all. The line greped for something that
    # was never there and would have printed nothing forever.
    #
    # So the version of the running proxy has no metric-based source, and
    # stack.yaml keeps its empty Traefik slot for a better reason than before.
    # ADR 0040 §5.
  else
    no "the endpoint answered but carries no traefik_* series"
  fi
fi

# 4. The port is not published to the host.
published=$(docker inspect "$name" --format '{{json .NetworkSettings.Ports}}' \
  | tr ',' '\n' | grep "\"$port/tcp\"" | grep -v 'null' || true)
if [ -n "$published" ]; then
  no "port $port is published to the host — it must stay inside the docker networks"
else
  ok "port $port is not published to the host"
fi

cat <<'NOTE'

  run this again after ANY of these, because each one silently undoes it:
    · a restart of the proxy container      (the attachment may not survive)
    · a Dokploy upgrade                     (it may rewrite the static config)

  from outside this host, only 22, 80 and 443 may answer. That check is L3/M3:
    nmap -Pn -p- <public ip>
NOTE

[ "$fail" -eq 0 ] || exit 1
