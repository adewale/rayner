# Rayner motion evidence archive

This branch holds dated motion-audit evidence moved out of the source tree. It has no history of
its own and is never merged: each bundle is the exact bytes that pull request
[adewale/rayner#115](https://github.com/adewale/rayner/pull/115) carried at commit
`6bc9bfc86be87f4a3da3c0e23a23b8c4a9c918ef` on `fix/motion-detection`, under the same paths
(`docs/evidence/<bundle>/`), so relative links between bundles resolve as they did there.

The source tree keeps one Git object hash per bundle in `docs/evidence/archive.json`, and
`test/evidence-archive.test.ts` checks every bundle against it. To read the archive locally:

    git fetch origin evidence
    git show origin/evidence:docs/evidence/motion-visual-guide-2026-11-23/README.md

These are records. They describe the revisions they name, not the current code, and are not
edited after the fact; corrections and notes about them belong in the source tree's
`docs/evidence/README.md`.
