# Statecharts benchmark, round 3

The fresh blind reviewer preferred **Y, Rayner, slightly** over **X, plain**. Read the [frozen primary report](reviewer/primary-report.md) and [unseen transfer supplement](reviewer/transfer-supplement.md) for the evidence and limitations. The primary report's SHA-256 is `93a9810b79e2a4d0ec7d74852331545c003dc68b4094f31a5a0ab01ae2b52b18`.

Both builders received the same [approved script](approved-script.md) and unchanged templates filled with that script. They ran the same inherited Codex model in separate fresh contexts. The plain builder used an independent repository and did not inspect Rayner. The Rayner builder used an isolated worktree at engine base `f982dee4c2c37e7f1d7b71dbb6d661770078f7a7`. Neither builder saw the other attempt. These are newly authored benchmark pages, not the existing catalog scene.

| Artifact | Rayner | Plain |
| --- | --- | --- |
| Actual page | [index.html](rayner/index.html) | [index.html](plain/index.html) |
| Contact sheet | [contact.png](rayner/contact.png) | [contact.png](plain/out/contact.png) |
| Prose transcript | [transcript.json](rayner/transcript.json) | [transcript.json](plain/out/transcript.json) |
| Author report | [author-report.md](rayner/author-report.md) | [author-report.txt](plain/out/author-report.txt) |
| Checks | [served review](rayner/review.json) | [verification](plain/out/verification.json) |
| Sources | [scene.ts](rayner/source/scene.ts) | The self-contained HTML and validation scripts in `plain/` |

The Rayner author commit is `59c3c44c74d998ebfa149e551cf40feab4cf0d69`. The independent plain author commit is `4e575d5ec5987571d727f45165a8cfa8ab962486`.

The [manifest](manifest.json) and [assignment key](pairs.key.json) retain seed `20261119`. Run `node tools/repo/bench-explainers.ts pair bench/explainers/round-3-2026-11-19/manifest.json <scratch-directory>` to reproduce the pair. `pairs/` contains only the pages, contact sheets and transcripts supplied to the reviewer. The filled [review brief](briefs/review.md) preserves the standard review text. The fresh reviewer did not inspect the key, author reports or builder sources. Pages retain their native branding, which limits method blinding.

The reviewer traversed every step at 1280×800 and 390×844, exercised predictions and live events, checked keyboard and reduced-motion behavior, and inspected screenshots. Chromium policy rejected `file://` URLs. The reviewer used a local server restricted to `pairs/`, with identical page bytes. Scripts, interaction logs and screenshots are retained under `reviewer/`. The plain builder's own desktop captures were 1280×720; the fresh comparison used the required 1280×800 on both pages.

The Rayner author retained checks against recorded XState 5.33.3 graphs, five model tests and all 17 described states. Served review covered 34 step/width rows, 32 live-state/width rows, 17 framed phone steps and 16 framed live states, with a 12.5 px whole-phone minimum and no partial labels. The plain author retained 264 independent semantic assertions and browser checks, but did not execute XState. These are author verification records, separate from the blind teaching judgment.

The primary report was frozen before the unseen camera exercise and unblinding. Its slight preference rests on directed, connected diagrams. It also credits the plain page's stronger equivalence comparison, written exercise, feedback and economy. Both have gaps. This is a single model author and model reviewer, with no newcomer study or independent prior-knowledge control. The transfer supplement tests expert reasoning plausibility after both lessons; it cannot attribute learning to either page.

Later fixes to the player do not rebuild these frozen pages. In particular, PR #112 moves phone live controls above the prose in response to the observed off-screen picture. That change is validated separately. [Artifact hashes](artifact-hashes.json) cover all retained files except the hash manifest itself.
