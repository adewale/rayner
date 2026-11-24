#!/usr/bin/env bash
# Reassess exact preserved source/review/measurement bytes; this does not rerender scenes.
set -euo pipefail
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
assessment_directory="$(mktemp -d /tmp/rayner-motion-assessment.XXXXXX)"
# The inputs are archived on the evidence branch, at the commit docs/evidence/archive.json records.
evidence_commit="$(node -p "require('$repository_root/docs/evidence/archive.json').commit")"
if ! git -C "$repository_root" cat-file -e "$evidence_commit^{commit}" 2>/dev/null; then
  printf 'The evidence commit %s is not here; run: git fetch origin evidence\n' "$evidence_commit" >&2
  exit 1
fi
git -C "$repository_root" show "$evidence_commit:docs/evidence/motion-current-audit-2026-11-22/assessment-inputs.tar.gz" | tar -xz -C "$assessment_directory"
cd "$repository_root"
node tools/repo/motion-corpus-v2-current.ts --audit "$assessment_directory"
printf 'Reproduced frozen assessment: %s/prospective-v2/report.md\n' "$assessment_directory"
