# Testing Rayner

For a repair, run its owning test first. Once the changes settle, run the relevant integration checks; let CI cover the catalog and platform matrix. A small follow-up does not need another full local suite unless it changes those broader contracts.

```sh
npm run check             # types and consumer API
npm test                  # standard assertions and seeded properties
npm run test:full         # larger generated runs
npm run test:embeds       # Chromium reader, transport and interaction checks
npm run demos:check       # build and validate the catalog once
npm run demos:review      # review that exact catalog as served
npm run pack:smoke        # fresh installed-package checks
```

Use Node 24 or later. Set `CHROMIUM_EXECUTABLE_PATH` for a system browser. Optional lettering capture checks need the fonts and Python requirements in [LETTERING.md](LETTERING.md). A skipped check supplies no pass evidence.

| Contract | Owner |
| --- | --- |
| Domain values | Independent model tests, source vectors and real Git/CPython fixtures; `view-readouts.test.ts` pins reader values |
| Engine geometry and animation | Seeded properties, Manim/raster references, native SVG and seek/cache tests |
| Requested lettering | `lettering.test.ts` checks declarations, isolation and glyph contracts; the catalog builder checks actual receipt fields and page bytes |
| Shared player shell | `explain-reader-shell.ts` runs during every catalog case at both reading widths; embed tests retain English/French standalone, raw iframe and loader crop checks |
| Story evidence | `demos:review` visits every resting step in every settings case at 390 and 1180 px, using actual controls and matching ready events |
| Narrow openings | Independently claimed main-step subjects open fresh at 320×568; their labels must reach 12 CSS px and retain their painted glyph cores |
| Interaction | Dedicated Chromium owners cover keyboard, touch, history, resize, motion, audio, CSP and cross-origin messages |
| Packaging and platforms | Fresh installed-package checks on Linux and Intel/ARM Mac, on minimum and current Node 24 |
| Browser diversity | ARM Mac/current Node runs WebKit story review and the real Safari reader through `safaridriver` |

The primary Linux/current-Node lane owns the complete browser suite. Minimum Node retains the standard suite, CLI and author-review browser checks, plus installed-package capture and preview. It does not repeat every reader interaction. Set `EXPLAIN_WEBKIT=1` or `EXPLAIN_SAFARI=1` for those browser checks. WebKit emulation does not establish physical iPhone touch, rotation, zoom or VoiceOver behavior.

Catalog generation has one CI owner. Three story jobs consume that output; the final required `story` check rejects missing, duplicate, stale or failed parts against the independent built inventory. Both widths open fresh. The narrow-opening inventory names required subjects and explicit exclusions; a receipt cannot invent a new exclusion. Reproduce shards with `npm run demos:review -- --shard N/3`, then `node tools/explain-review-merge.ts`.

Story checks bind caption subjects to actual SVG paths, computed paint, native bounds, clips and tour stops. Named labels and explicit whole-arrow claims must remain complete; highlighted routes must contribute visible ink. An unchanged picture needs an explicit subject. These checks cannot infer arbitrary caption meaning or prove domain truth: inspect the opening, a countercase and the ending against their sources.

`npm run check:budgets` uses the built catalog hashes and three Chromium startup samples at 390 px with 4× CPU slowdown. It checks an 8-second median ceiling for representative pages; builds separately enforce 1.5 MiB raw and 450 KiB gzip limits. This is a localhost CPU surrogate, not a physical-phone or network result.

Outside authors use `rayner review scene.ts --out public/example.html` and optional `scene.review.json` claims. Successful review retains the exact page and its headers, receipt and loader. Rendering fingerprints cover runtime assets and producer dependencies. Reviewer-only edits require new review receipts but reuse unchanged source builds; installed tools hash their bundled bytes.

Keep one current validation record in CI and generated `out/` artifacts. Commit a representative screenshot or durable source oracle when it helps a reviewer; dated run transcripts and repeated receipts belong in CI or Git history. Older audit records remain historical context, not another release gate.

When consolidating tests, move every assertion to a named keeper and prove it rejects a deliberate defect. Preserve independent values and endpoints, native paint, raster references, package checks and the full case inventory. [test/AGENTS.md](../test/AGENTS.md) records these rules. Test names describe what they actually assert; run counts cannot compensate for a missing input class or oracle.
