#!/bin/sh
# Installs the weekly prune on the VPS. Run as root, from a checkout of this
# repository on the host:
#
#     sudo sh ops/host/install.sh
#
# Idempotent — running it again overwrites the same three files and re-enables
# an already-enabled timer, which is what you want after a change to prune.sh.
#
# Why a systemd timer from this repository rather than a scheduled job in the
# Dokploy panel: a job that exists only in a UI is not in the diff, cannot be
# reviewed, and cannot be quoted in the case study. ADR 0014 makes the same
# argument about configuration that lives only in the panel. ADR 0028.
set -eu

lib=/usr/local/lib/timseil
units=/etc/systemd/system
here=$(dirname "$0")

fail=0
note() { printf '  ✓ %s\n' "$1"; }
bad()  { printf '  ✗ %s\n' "$1"; fail=1; }

[ "$(id -u)" -eq 0 ] || { printf '  ✗ run as root — systemd units go to %s\n' "$units"; exit 1; }
command -v systemctl >/dev/null 2>&1 || { printf '  ✗ no systemctl on this host\n'; exit 1; }

install -d -m 0755 "$lib"
install -m 0755 "$here/prune.sh"              "$lib/prune.sh"
install -m 0644 "$here/timseil-prune.service" "$units/timseil-prune.service"
install -m 0644 "$here/timseil-prune.timer"   "$units/timseil-prune.timer"
note "installed prune.sh and both units"

systemctl daemon-reload
systemctl enable --now timseil-prune.timer >/dev/null
note "timer enabled"

# The proof, not the promise: an armed timer prints its next run.
if systemctl is-active --quiet timseil-prune.timer; then
  note "timseil-prune.timer is active"
else
  bad "timseil-prune.timer is not active"
fi

printf '\n'
systemctl list-timers timseil-prune.timer --no-pager | sed 's/^/  /'

printf '\nrun it once now to see what it reclaims:\n  systemctl start timseil-prune.service && journalctl -u timseil-prune -n 40 --no-pager\n'

[ "$fail" -eq 0 ] || exit 1
