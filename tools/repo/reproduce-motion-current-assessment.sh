#!/usr/bin/env bash
# Reassess exact preserved source/review/measurement bytes; this does not rerender scenes.
set -euo pipefail
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
assessment_directory="$(mktemp -d /tmp/rayner-motion-assessment.XXXXXX)"
tar -xzf "$repository_root/docs/evidence/motion-current-audit-2026-11-22/assessment-inputs.tar.gz" -C "$assessment_directory"
cd "$repository_root"
node tools/repo/motion-corpus-v2-current.ts --audit "$assessment_directory"
printf 'Reproduced frozen assessment: %s/prospective-v2/report.md\n' "$assessment_directory"
