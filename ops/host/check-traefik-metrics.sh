#!/bin/sh
# D3's acceptance: `traefik_*` metrics are retrievable.
#
# Run on the VPS:  sh ops/host/check-traefik-metrics.sh
#
# There is no Prometheus yet — it arrives in F2 and scrapes this endpoint in F3.
# So "retrievable" can only mean the two halves this script proves:
#
#   1. From inside the docker network the endpoint answers with traefik_* series.
#   2. The port is NOT published to the host. Prometheus, Loki, Alloy and this
#      endpoint are all unauthenticated; from outside, 22, 80 and 443 answer and
#      nothing else (CLAUDE.md, handbook ch. 29). An open metrics port hands a
#      stranger the routing table and the request rates.
#
# The host reaches container IPs on a bridge network directly, so this needs no
# throwaway container and no image that is not already here.
#
# TRAEFIK_METRICS_PORT overrides the port if Dokploy's static configuration uses
# a different one — read it there rather than trusting this default.
set -eu

port=${TRAEFIK_METRICS_PORT:-8082}
net=${DOKPLOY_NETWORK:-dokploy-network}

fail=0
ok()  { printf '  ✓ %s\n' "$1"; }
no()  { printf '  ✗ %s\n' "$1"; fail=1; }

printf 'traefik metrics\n'

name=$(docker ps --format '{{.Names}}\t{{.Image}}' | awk -F'\t' '$2 ~ /traefik/ {print $1; exit}')
[ -n "$name" ] || { no "no running container whose image looks like traefik"; exit 1; }
ok "proxy container is $name"

ip=$(docker inspect "$name" \
  --format "{{with index .NetworkSettings.Networks \"$net\"}}{{.IPAddress}}{{end}}" 2>/dev/null || true)
[ -n "$ip" ] || { no "$name is not attached to $net"; exit 1; }
ok "reachable on $net at $ip"

# 1. The endpoint answers, and it answers with our proxy's series.
body=$(curl -fsS --max-time 5 "http://$ip:$port/metrics" 2>/dev/null || true)
if [ -z "$body" ]; then
  no "no answer from http://$ip:$port/metrics — is metrics.prometheus on in the static config?"
else
  series=$(printf '%s\n' "$body" | grep -c '^traefik_' || true)
  if [ "$series" -gt 0 ]; then
    ok "$series traefik_* series"
    printf '%s\n' "$body" | grep '^traefik_' | cut -d'{' -f1 | sort -u | head -6 | sed 's/^/      /'
    # The version of the RUNNING proxy. stack.yaml cannot carry Traefik because
    # no file in the repository declares its version (ADR 0028) — this line is
    # the honest source, and F3 is where it reaches the page.
    printf '%s\n' "$body" | grep '^traefik_build_info' | head -1 | sed 's/^/      /'
  else
    no "the endpoint answered but carries no traefik_* series"
  fi
fi

# 2. The port is not published to the host.
published=$(docker inspect "$name" --format '{{json .NetworkSettings.Ports}}' \
  | tr ',' '\n' | grep "\"$port/tcp\"" | grep -v 'null' || true)
if [ -n "$published" ]; then
  no "port $port is published to the host — it must stay inside $net"
else
  ok "port $port is not published to the host"
fi

printf '\nfrom outside this host, only 22, 80 and 443 may answer. That check is L3/M3:\n  nmap -Pn -p- <public ip>\n'

[ "$fail" -eq 0 ] || exit 1
