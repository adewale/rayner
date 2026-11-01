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

The motion-burst properties in `test/browser/explain-embed.test.ts` own early controls, direct-link resting SVG comparisons and reuse of a live scene. The scheduled audio property owns delayed resumes and sound cancellation on navigation, Stop and Pulse changes. Resting-picture assertions wait for a ready event matching the accepted step and settings before the history-idle guard; a counted 1000 ms render keeps completion separate from an idle-time guess. Native mutation-observer and audio-resume microtasks reject resuming canceled continuations. The scope driver checks and resumes in one turn; ReaderSink guards pending native paints. `test/browser/explain-loading.test.ts` owns latest host requests, native footer links, Tab, child navigation, zoom and pointer-release cleanup while a case loads.

`reader model fixed scenarios: teaching and source navigation, segments, case rebuilding and ending controls` owns fixed navigation, segment, case and ending sequences; model verification checks independent labels, Tab stops, progress, history and focus. `the shared tile preserves English/French chrome and headings, standalone, in a raw iframe and in the loader` retains the shared-shell crop, heading and overflow checks. Canonical catalog chrome and teaching-step checks remain in `explain-reader-shell.ts`. Shared page/context fixtures preserve each caller's setup and assertion domain.

Catalog generation has one CI owner. Three story jobs consume that output, assigning whole scenes before collecting their source. Each scene is collected by one shard; shard 1 alone checks the gallery, headers, host embeds and complete site export. The final required `story` check rejects missing, duplicate, stale or failed parts against the independent built inventory. Both widths open fresh. The narrow-opening inventory names required subjects and explicit exclusions; a receipt cannot invent a new exclusion. Reproduce shards with `npm run demos:review -- --shard N/3`, then `node tools/explain-review-merge.ts`.

Story checks bind caption subjects to actual SVG paths, computed paint, native bounds, clips and tour stops. Named labels and explicit whole-arrow claims must remain complete; highlighted routes must contribute visible ink. An unchanged picture needs an explicit subject. These checks cannot infer arbitrary caption meaning or prove domain truth: inspect the opening, a countercase and the ending against their sources.

`npm run check:budgets` uses the built catalog hashes and three Chromium startup samples at 390 px with 4× CPU slowdown. It checks an 8-second median ceiling for representative pages; builds separately enforce 1.5 MiB raw and 450 KiB gzip limits. This is a localhost CPU surrogate, not a physical-phone or network result.

Outside authors use `rayner review scene.ts --out public/example.html` and optional `scene.review.json` claims. Successful review retains the exact page and its headers, receipt and loader. Rendering fingerprints cover runtime assets and producer dependencies. Reviewer implementation edits require new review receipts but reuse unchanged source builds. Companion claims are scene-folder inputs, so changing them also requires a new build. Installed tools hash their bundled bytes. Collection operations snapshot shared producer inputs once and check them again before accepting output.

Keep one current validation record in CI and generated `out/` artifacts. Commit a representative screenshot or durable source oracle when it helps a reviewer; dated run transcripts and repeated receipts belong in CI or Git history. Older audit records remain historical context, not another release gate.

When consolidating tests, move every assertion to a named keeper and prove it rejects a deliberate defect. Preserve independent values and endpoints, native paint, raster references, package checks and the full case inventory. [test/AGENTS.md](../test/AGENTS.md) records these rules. Test names describe what they actually assert; run counts cannot compensate for a missing input class or oracle.

The compatibility matrix downloads the primary job's tested archive. Package smoke verifies its source commit and SHA-512 integrity before installation and checks integrity again afterwards. It does not repack on each platform.

`test/fixtures/latest-search-view.ts` retains the four guarded/unguarded chart cases for the state/view oracle. The public Latest Search lesson has two completion-order cases and compares both guards in each, including the ticket decision. `test/explain-latest-search.test.ts` owns both boundaries.

Browser tests live in `test/browser/`; `test:embeds` discovers every test there. `test/browser/explain-site.test.ts` builds two lessons in an isolated directory, exports them without a full catalog, checks the chosen entry and subset counts, and proves a damaged selected page leaves the last export intact. Pure snapshot-codec properties remain in `test/page-snapshots.test.ts`; the browser directory owns native gzip expansion.

CI runs the full campaign for code, fixtures, workflow changes, executable documentation, unknown paths and explicit dispatches. Prose-only PRs run the onboarding and tutorial assertions plus whitespace checks. The required `story` job rejects a failed scope decision. A main push may reuse a successful same-repository PR campaign from the last 24 hours only when all nine protected owners ran successfully, the archive records the same Node version and clean checkout, and the tested synthetic merge has exactly the same Git tree as main. Missing or expired proof runs full CI. Release dispatches always run fresh validation and produce their own artifacts.
