#!/bin/sh
# The weekly disk reclaim on the VPS.
#
# On a 40 GB disk the fastest consumer is not the logs — it is old image layers.
# Every deploy writes a new image and Docker never removes one on its own, so at
# a deploy a day this grows by gigabytes a week. Build plan chapter 10 calls it
# the most common cause of a full disk on Dokploy machines, and a full disk is
# not a slow site: Postgres, Loki and Prometheus share this NVMe, and Postgres
# is the one that stops accepting writes.
#
# WHAT THIS DELIBERATELY DOES NOT DO
#
#   --volumes is not here and must never be added. db-data is the only
#   persistent thing on this host that is ours, and a prune that takes volumes
#   is a restore from S3 on a Tuesday morning. `-a` touches images, not volumes.
#
# THE PRICE, SAID OUT LOUD
#
#   `-a` with until=168h removes untagged AND tagged images older than seven
#   days — which includes the sha-<short> images that are the rollback targets.
#   After this runs, rolling back to a state older than a week is a `docker pull`
#   from GHCR rather than a local layer. That is acceptable because GHCR is the
#   registry and the layers are there; it is written down because finding it out
#   at three in the morning is not.
#
# It prints the disk before and after. A number this script did not measure is
# a number this script does not print.
set -eu

printf 'timseil prune — %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

printf '\nbefore\n'
docker system df | sed 's/^/  /'

printf '\nreclaiming images unused for more than 168h\n'
docker system prune --all --force --filter 'until=168h' | sed 's/^/  /'

printf '\nafter\n'
docker system df | sed 's/^/  /'

printf '\nfilesystem\n'
df -h / | sed 's/^/  /'
