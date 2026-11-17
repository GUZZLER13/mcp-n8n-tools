#!/bin/sh
# VORTEX NAS Chrome read-only preflight: no installation, network, or state access.
set -eu
printf '%s\n' 'VORTEX_CHROME_NAS_PREFLIGHT=1' 'MODE=READ_ONLY'
printf 'HOSTNAME='; hostname
printf 'OS='; if [ -r /etc/os-release ]; then sed -n 's/^PRETTY_NAME=//p' /etc/os-release | tr -d '"'; else uname -s; fi
printf 'ARCH='; uname -m
printf 'SERVICE_USER='; id -un
printf 'NODE='; if command -v node >/dev/null 2>&1; then node --version; else printf 'NOT_FOUND\n'; fi
printf 'NPM='; if command -v npm >/dev/null 2>&1; then npm --version; else printf 'NOT_FOUND\n'; fi
printf 'CHROME='; if command -v google-chrome-stable >/dev/null 2>&1; then command -v google-chrome-stable; elif command -v google-chrome >/dev/null 2>&1; then command -v google-chrome; else printf 'NOT_FOUND\n'; fi
printf 'CHROMIUM='; if command -v chromium >/dev/null 2>&1; then command -v chromium; elif command -v chromium-browser >/dev/null 2>&1; then command -v chromium-browser; else printf 'NOT_FOUND\n'; fi
printf 'CHROMIUM_APT_CANDIDATE='
if command -v apt-cache >/dev/null 2>&1; then
  apt-cache policy chromium | awk '/Candidate:/ { print $2; found=1; exit } END { if (!found) print "UNKNOWN" }'
else printf 'UNKNOWN\n'; fi
printf 'GUI_SESSION='; if [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; then printf 'PRESENT\n'; else printf 'NONE\n'; fi
printf 'RAM_AVAILABLE_KIB='; awk '/MemAvailable:/ {print $2}' /proc/meminfo
printf 'SYSTEM_DISK_AVAILABLE_KIB='; df -Pk / | awk 'NR==2 {print $4}'
printf 'USER_NAMESPACES='; if [ -r /proc/sys/kernel/unprivileged_userns_clone ]; then cat /proc/sys/kernel/unprivileged_userns_clone; else printf 'UNKNOWN\n'; fi
printf 'HOME_PERMISSIONS='; stat -c '%a' "$HOME"
printf '%s\n' 'VORTEX_SQLITE_BACKUP_AND_ISOLATED_RESTORE=NOT_CHECKED' 'DEPLOYMENT_GATE=BLOCKED_UNTIL_OPERATOR_VERIFICATION'
