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
for capture_tool in motion-current-audit.ts motion-current-witness.ts motion-current-audit-package.ts; do
  cp "$repository_root/tools/repo/$capture_tool" "$capture_root/tools/repo/$capture_tool"
done
ln -s "$(readlink -f "$repository_root/node_modules")" "$capture_root/node_modules"
cd "$capture_root"
node --max-old-space-size=1024 tools/repo/motion-current-audit.ts
node --max-old-space-size=1024 tools/repo/motion-current-audit.ts --supplement browser-legend-moves '{"step":"phish","event":"load","log":["load","load"]}' second-load-published
node --max-old-space-size=1024 tools/repo/motion-current-audit.ts --supplement browser-legend-moves '{"step":"phish","event":"load","log":["load","authorize","submit","load"]}' next-load-after-submit
node --max-old-space-size=1024 tools/repo/motion-current-audit.ts --supplement browser-attacker-over-shelf '{"step":"phish","event":"phish"}' phish-story
node --max-old-space-size=1024 tools/repo/motion-current-audit.ts --supplement refusals-mcp-key-over-label '{"step":"pace","event":"answer","log":["mcp","answer"]}' held-key-published
node --max-old-space-size=1024 tools/repo/motion-current-audit.ts --supplement sign-in-password-before-card '{"step":"sign-out","event":"approve-all","log":["ask","approve-read","approve-all"]}' same-sign-reapproval-published
node --max-old-space-size=1024 tools/repo/motion-current-audit.ts --supplement poppy-key-over-station-name '{"step":"sign-out","event":"sign-out"}' sign-out-story
node tools/repo/motion-current-witness.ts out/current-audit-2026-11-22/conversations-words-dissolve owner-and-close-first-1200ms '[{"step":"owner","frame":0},{"step":"owner","frame":3},{"step":"owner","frame":6},{"step":"owner","frame":9},{"step":"owner","frame":12},{"step":"owner","frame":15},{"step":"owner","frame":18},{"step":"owner","frame":21},{"step":"owner","frame":24},{"step":"owner","frame":27},{"step":"owner","frame":30},{"step":"owner","frame":33},{"step":"owner","frame":36},{"step":"close","frame":0},{"step":"close","frame":3},{"step":"close","frame":6},{"step":"close","frame":9},{"step":"close","frame":12},{"step":"close","frame":15},{"step":"close","frame":18},{"step":"close","frame":21},{"step":"close","frame":24},{"step":"close","frame":27},{"step":"close","frame":30},{"step":"close","frame":33},{"step":"close","frame":36}]'
node tools/repo/motion-current-audit-package.ts
printf 'Native capture output: %s/out/current-audit-2026-11-22\n' "$capture_root"
