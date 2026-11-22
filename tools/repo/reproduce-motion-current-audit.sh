#!/usr/bin/env bash
# Run from any directory. No network or production checkout changes.
set -euo pipefail
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
capture_root="${1:-/tmp/rayner-current-audit-2026-11-22}"
revision=5bff60e0aa5660c2b944fb59fbfe0b59e703db93
if [[ -e "$capture_root" ]]; then
  printf 'Capture destination already exists: %s\n' "$capture_root" >&2
  exit 1
fi
git -C "$repository_root" worktree add --detach "$capture_root" "$revision"
cp "$repository_root/tools/repo/motion-current-audit.ts" "$capture_root/tools/repo/motion-current-audit.ts"
ln -s "$(readlink -f "$repository_root/node_modules")" "$capture_root/node_modules"
cd "$capture_root"
node --max-old-space-size=1024 tools/repo/motion-current-audit.ts
printf 'Native capture output: %s/out/current-audit-2026-11-22\n' "$capture_root"
