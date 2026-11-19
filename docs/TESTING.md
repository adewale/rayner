# Testing Rayner

For a repair, run its owning test first, then the relevant integration checks once the change settles, and let CI cover the catalog and platform matrix. A small follow-up needs no second full local run unless it changes those broader contracts.

Comments in the player's tests cite the requirements of the designs it was built from: player-guidance G1 to G7, player-redesign R1 to R10 and player-tile T1 to T9. The requirements and their rationale are at [player-guidance](https://github.com/adewale/rayner/blob/ce11e0ac611cc7b4babc24a573039ef96f179c3f/specs/player-guidance.md), [player-redesign](https://github.com/adewale/rayner/blob/ce11e0ac611cc7b4babc24a573039ef96f179c3f/specs/player-redesign.md) and [player-tile](https://github.com/adewale/rayner/blob/ce11e0ac611cc7b4babc24a573039ef96f179c3f/specs/player-tile.md); the current contract is [the reference's page section](REFERENCE.md#page).

```sh
npm run check             # types and consumer API
npm test                  # standard assertions, seeded properties and each explainer folder's own tests
npm run test:full         # larger generated runs
npm run test:embeds       # Chromium reader, transport and interaction checks
npm run demos:check       # build and validate the catalog once
npm run demos:review      # review that exact catalog as served
npm run pack:smoke        # fresh installed-package checks
```

The domain API is accepted against four independent boundaries:

- Initialized model and shown fields must be valid before any frame callback, including seek
  and empty runs. Source and installed-package consumers must preserve exact named-interface
  and union inference and reject uninitialized fields, wrong reducer/tween values and erased
  key access. Real scenario tests compare selected domain starts at frame zero.
- A detached drawing context must reproduce palette, localized descriptions, RTL layout and
  shaping without a Stage. Historical redraws must retain the context used for their picture.
  Interleaved contexts and an explicitly unshaped draw under a foreign ambient service exercise
  the hidden-global failure case.
- Watch tests independently supply conflicting same-key values in all four channels, with
  absent specimens, literal/prototype-sensitive keys, locale and a single display cap. The
  same readings must reach describe, transcript, check report and the pruned player payload.
  Served-reader tests cover the actual ticket-link and request-state distinction.
- Observation tests count full model states and actual checked continuations independently of
  displayed values. The guarded search's ten-state/nine-edge inventory has three published
  values; equal blank-page observations still accept different future events. Duplicate words
  for different observations, bad transition endpoints and invalid/impure selector values must
  reject. Singleton observations and separately sampled model exploration must remain valid.

Every repaired boundary includes a deliberate defect control. Type checking, the standard
suite, installed-package checks, real browser interaction and the strict catalogue then cover
integration; none of those substitutes for the independent domain oracles.

Property tests (fast-check, with `fc` and `params` from `test/lib/pbt.ts`, or `scenes/explainers/lib/pbt.ts` in an explainer's folder) draw their cases from the seed committed in `scenes/explainers/lib/pbt.ts`, so a run and its re-run draw the same cases. CI's gate, the `check` job, runs them from that seed with `FULL=1`, ten times as many cases, so a pull request's gate draws the cases the gate before it drew, unless the pull request changes the tests themselves. The scheduled `properties` workflow (nightly, or run by hand with a seed) runs the same tests with `FULL=1` from a fresh random seed, which it prints first, to find the cases the committed seed misses; what it finds blocks no pull request. A failed property prints its seed and counterexample path, and `tools/repo/ci-tests.ts` prints the command that replays it, `FC_SEED=<seed> FC_PATH=<path> node --test --test-name-pattern='^<test name>$' <file>` (add the lane's other settings, such as `EXPLAIN_BROWSER=1`). `FC_SEED` alone draws from another seed, and `FC_RUNS=<n>` sets every property's count.

Use Node 24 or later. Every browser check launches Chromium through `tools/lib/browser.ts`, which uses Playwright's pinned build if it is installed and otherwise another installed Playwright build or a system Chrome or Chromium that launches and renders within four major versions of it ([Finding Chromium](REFERENCE.md#finding-chromium)); run `npx playwright-core install chromium` only if none is found, or set `CHROMIUM_EXECUTABLE_PATH` to choose one. A test or tool never calls Playwright's `chromium.launch()` itself. `test/chromium-discovery.test.ts` checks the search order and the fall-through with a fake filesystem and launcher. Optional lettering capture checks need the fonts and Python requirements in [LETTERING.md](LETTERING.md). A skipped check supplies no pass evidence.

Engine tests that request an explainer's default scene replay its pinned snapshots and outline lettering without collecting or tracing unused settings variants. Legacy subset-font scenes retain their existing collector path. `default-scenes.test.ts` compares this preparation with the full collector: traced state and every frame in both rendering modes, across plain, diagram and custom-font examples. The catalogue and each explainer's own evidence continue to validate all their declared scenarios. The cache oracle retains its warm history, fresh-copy cold render, both output modes and original frame sampling. Paint-cache keys compare primitive fields directly; `svg-paint-cache.test.ts` verifies that each paint change invalidates the cache without changing older records.

| Contract | Owner |
| --- | --- |
| Domain values | Each explainer folder's own evidence (below); `view-readouts.test.ts` pins reader values |
| Engine geometry and animation | Seeded properties, Manim/raster references, native SVG and seek/cache tests |
| Public extension recipes | `recipes.test.ts` checks model/picture/trace agreement, copy ownership, intermediate geometry, seeking and schedule conflicts; package smoke runs the shipped recipes from a fresh install |
| Staged steps | Each `s.steps` picture is a view of its local `StepRecord.state`, separate from the persistent model's `before` and `after`. `rayner check` redraws that input and draws other states; `staged-steps.test.ts` shows counter and captured-constant defects failing, and verifies the typed model during frames and callbacks |
| Shared sampled state | `tween-state.test.ts` rejects competing model writers before sampling, checks two dependent views against one model at every frame, and compares seeks with full frames after preceding syncs |
| Machines | `rayner check` inventories bounded durable states and distinct incoming presentations, reports truncation, and checks each picture, its labels at 1280 px included, and at a live step on a 390 px phone; `machine.test.ts` checks replay, seeking, shortest paths, a picture that cannot tell states apart, and a live step whose note reads under 12 px on the phone |
| Caption length | `rayner check` fails a caption over 80 words in any scenario; `explain-script.test.ts` checks how words are counted and the limit |
| Motion | `rayner check` follows every keyed part through every play of every scenario and every event from each explored machine state, within its declared limit, and fails a jump, flicker, words readable before the token that causes them lands, a token over a label, or words scaled down to travel; `keyed-motion.test.ts` brings back one defect of each of the first three kinds that filming the Poppy series found (a transition squeezed into a shorter run time, a name that blinks mid-flight, an answer written as its ticket sets off) in `test/fixtures/motion` and shows each failing and the fixed scene passing, and shows the last two on small scenes; `motion-corpus.test.ts` holds the check to its recall on 59 defects filmed in the Poppy series, each brought back as edits to the current scenes ([the motion corpus](MOTION-CORPUS.md): a sample by default, every entry with `FULL=1`) |
| Scene invariants | `rayner check` runs each `addInvariant` invariant on every frame of every scenario; `recipes.test.ts` proves an invariant fails on the counterexample, and each explainer's invariant was shown to fail on its old behaviour |
| Extracted choreography | `choreography.test.ts` checks geometric anchors, route/opacity samples, legacy frame equivalence, JSON state boundaries, nested schedules and writer conflicts |
| Requested lettering | `lettering.test.ts` checks declarations, isolation and glyph contracts; the catalog builder checks actual receipt fields and page bytes |
| Shared player shell | `explain-reader-shell.ts` runs during every catalog scenario at both reading widths; embed tests retain English/French standalone, raw iframe and loader crop checks |
| Story evidence | `demos:review` visits every resting step in every scenario at 390 and 1180 px, using actual controls and matching ready events |
| Narrow openings | Independently claimed main-step subjects open fresh at 320×568; their labels must reach 12 CSS px and retain their painted glyph cores |
| Interaction | Dedicated Chromium owners cover keyboard, touch, history, resize, motion, audio, CSP and cross-origin messages |
| Packaging and platforms | Fresh installed-package checks on Linux and Intel/ARM Mac, on minimum and current Node 24 |
| Motion corpus | `motion-corpus.test.ts` measures the keyed motion check by editing a frozen copy of the Poppy chapters (`test/fixtures/motion-corpus/poppy/`), never the current ones; its full run requires every frozen baseline to replay with no finding |
| Evidence and citations | `evidence-archive.test.ts` checks each archived audit on the `evidence` branch against its hash in `docs/evidence/archive.json`; `commit-citations.test.ts` requires every Rayner commit a living doc or corpus entry cites to resolve, and every permalink's path to exist at its commit. Both need full history (CI's `fetch-depth: 0`) |
| Browser diversity | ARM Mac/current Node runs WebKit story review and the real Safari reader through `safaridriver` |

## Triage a failed random campaign

A scheduled failure is evidence to investigate even when the fixed-seed PR checks pass. The workflow retains the full failed test log for 30 days, including replay commands, and prints the campaign's seed in its summary. It does not automatically file issues or make all subsequent PRs fail.

1. Record the run URL, source commit, seed and counterexample path, failed test, runtime and reference-tool versions, and any required browser settings. Download the log before it expires; retain the small counterexample with the repair or an explicitly tracked unresolved failure.
2. Run the printed replay command against that commit. Preserve the input domain and oracle. If the failure is environmental, record the observed prerequisite failure rather than treating an unrelated exception as a model refusal.
3. For a behaviour defect, add a deterministic regression to its owning test, show it failing on the old code, then repair the implementation. Run the replay and the owning generated tests at expanded counts. Do not close the failure by changing the committed seed or filtering out its input class.
4. In the repair PR, link the campaign, record the before/after result and exact commands, and identify any remaining failure. If it cannot be fixed in that PR, link a tracking issue with its owner and release disposition. The release review checks unresolved campaigns explicitly; a later scoped or fixed-seed green run does not resolve one.

The unified-diff regression in `scenes/explainers/unified-diff/model.test.ts` preserves the repeated-context, overlapping-hunk case found by campaign [43872787322](https://github.com/adewale/rayner/actions/runs/43872787322), seed `698884227`.

## An explainer's own evidence

Each explainer folder (`scenes/explainers/<id>/`, `scenes/tutorial/<id>/`) holds the evidence for what it says, and its script's **Checked against** line names those files, which `rayner check` requires to be there:

| File | Owns | Run by |
| --- | --- | --- |
| `model.test.ts` | The model against its source: vectors, real-program answers, exhaustive searches and properties. It imports only the folder's files, `scenes/explainers/lib/` (including `pbt.ts`, the seeded fast-check settings) and the public entry points, `rayner/testing` among them | `rayner check`, first; `npm test` |
| `answers.ts` | The script's answer and its reader questions' answers, computed from the model; the facts their words take as given are in `model.test.ts` | `rayner check`; `test/explain-script-answers.test.ts` for the whole collection |
| `scene.test.ts` | Assertions on the scene and its pictures: views against state, captured diagrams, the story's steps. It loads the explainer with `loadProject` or its snapshots with `loadSnapshots`, and reads pictures in words with `pictureWordsAt`, builds a diagram from a snapshot with `diagramOf`, and asserts with `assertStepState`, `assertSteps` and `assertViewFollowsState`, all from `rayner/testing` ([an explainer's test](REFERENCE.md#an-explainers-test)). Like `model.test.ts` it imports only what an outside author can, and `npm run pack:smoke` type-checks it against the packed declarations | `npm test` |
| `fidelity.ts` | Every authored scenario's step state against the program the explainer explains, as `check(trace, values, run)`; a check whose steps hold the scene's model types its trace `TraceOf<typeof Explainer>` ([typed traces](REFERENCE.md#typed-traces)) | `test/explain-fidelity.test.ts`, which collects each explainer once |
| `oracle/` | The independent program that produced a fixture, run by hand; each writes beside itself | by hand, or its `--check` |
| `fixtures/` | What an oracle or a measurement recorded | the folder's tests |

Shared helpers stay in `test/lib/`. Engine tests that use an explainer as an example (the CLI, describe, watch, the reader values) and the Chromium reader tests in `test/browser/` stay where they are. `npm test` runs `scenes/*/*/*.test.ts` with the rest.

CLI behavior is tested through `run(args, { stdout, stderr })` in `tools/explain.ts`.
It returns an exit status and writes command output through those two callbacks; only the
executable adapter reads `process.argv`, writes process streams and sets `process.exitCode`.
`test/lib/cli-contract.ts` captures the explicit writers for help, option errors and real
temporary-project operations. Watch tests supply writers too. They do not replace global
console methods, filter runtime warnings, or launch Node once per argument combination.

The installed-package gate runs the same contract against the installed implementation.
A few executable smoke checks retain the separate proof that npm's bin link starts, prints
help/version and returns a failing OS exit status. External source/compiled-module loading,
capture tools and long-running preview retain their process integration boundaries; these
do not own the full argument/help matrix.

The primary Linux/current-Node lane owns the complete browser suite. Minimum Node retains the standard suite, CLI and author-review browser checks, plus installed-package capture and preview. It does not repeat every reader interaction. Set `EXPLAIN_WEBKIT=1` or `EXPLAIN_SAFARI=1` for those browser checks. WebKit emulation does not establish physical iPhone touch, rotation, zoom or VoiceOver behavior.

The motion-burst properties in `test/browser/explain-embed.test.ts` own early controls, direct-link resting SVG comparisons and reuse of a live scene. The scheduled audio property owns delayed resumes and sound cancellation on navigation, Stop and Pulse changes. Resting-picture assertions wait for a ready event matching the accepted step and settings before the history-idle guard; a counted 1000 ms render keeps completion separate from an idle-time guess. Native mutation-observer and audio-resume microtasks reject resuming canceled continuations. The scope driver checks and resumes in one turn; ReaderSink guards pending native paints. `test/browser/explain-loading.test.ts` owns latest host requests, native footer links, Tab, child navigation, zoom and pointer-release cleanup while a scenario loads.

Phone close-up checks observe the already-navigated phone and desktop quiet windows concurrently. Each still requires its original 300 ms window and settled conditions; the fresh-link picture comparison remains a separate observation afterward. This overlaps independent waits without substituting a shorter idle delay for rendering readiness.

`reader model fixed runs: teaching and source navigation, segments, scenario rebuilding and ending controls` owns fixed navigation, segment, scenario and ending sequences; model verification checks independent labels, Tab stops, progress, history and focus. `the shared tile preserves English/French chrome and headings, standalone, in a raw iframe and in the loader` retains the shared-shell crop, heading and overflow checks. Canonical catalog chrome and teaching-step checks remain in `explain-reader-shell.ts`. Shared page/context fixtures preserve each caller's setup and assertion domain.

Catalog generation has one CI owner. Six story jobs consume that output, assigning whole scenes before collecting their source. Each scene is collected by one shard; shard 1 alone checks the gallery, headers, host embeds and complete site export. The final required `story` check rejects missing, duplicate, stale or failed parts against the independent built inventory. Both widths open fresh. The narrow-opening inventory names required subjects and explicit exclusions; a receipt cannot invent a new exclusion. Reproduce shards with `npm run demos:review -- --shard N/6`, then `node tools/repo/explain-review-merge.ts --shards 6`. The merger's default remains three for older local campaigns; pass the actual count explicitly for any other campaign.

Story checks bind caption subjects to actual SVG paths, computed paint, native bounds, clips and tour stops. Named labels and explicit whole-arrow claims must remain complete; highlighted routes must contribute visible ink. An unchanged picture needs an explicit subject. These checks cannot infer arbitrary caption meaning or prove domain truth: inspect the opening, a countercase and the ending against their sources.

`npm run check:budgets` uses the built catalog hashes and three Chromium startup samples at 390 px with 4× CPU slowdown. It checks an 8-second median ceiling for representative pages; builds separately enforce 1.5 MiB raw and 450 KiB gzip limits ([the page](REFERENCE.md#page)). This is a localhost CPU surrogate, not a physical-phone or network result.

Outside authors use `rayner review scene.ts --out public/example.html`, with an optional `scene.review.json` naming the subjects a caption points at. A successful review keeps the exact page and its headers, receipt and loader. Rendering fingerprints cover runtime assets and producer dependencies. A change to the reviewer needs new review receipts but reuses unchanged source builds; `scene.review.json` is a scene-folder input, so changing it needs a new build too. Installed tools hash their bundled bytes. Collection operations snapshot shared producer inputs once and check them again before accepting output.

Keep the current validation record in CI and the generated `out/` artifacts. Commit a representative screenshot or a durable source oracle when it helps a reviewer; dated run transcripts and repeated receipts belong in CI or Git history, and older audit records are not a release gate.

A test reads an explainer's steps from the scene, not from a copy of its list: `assertSteps` in `rayner/testing` fails unless the steps a test reads by name are there in order, whatever else the story gains or loses, and `test/lib/steps.ts` gives the repository's tests a trace's step ids (`idsOf`, on one path or the whole story) and a scene's (`stepIdsOf`). Pin the whole list only when the list is the point.

When consolidating tests, move every assertion to a named keeper and show that it rejects a deliberate defect. Keep independent values and endpoints, native paint, raster references, package checks and the full scenario inventory. [test/AGENTS.md](https://github.com/adewale/rayner/blob/main/test/AGENTS.md) records these rules. A test's name says what it asserts, and more runs do not make up for a missing input class or oracle.

The compatibility matrix downloads the primary job's tested archive, `rayner`. Package smoke verifies its package name, source commit and SHA-512 integrity before installation and checks integrity again afterwards. It does not repack on each platform.

`scenes/explainers/latest-search/fixtures/latest-search-view.ts` retains the four guarded/unguarded chart scenarios for the state/view oracle. The public Latest Search lesson has two completion-order scenarios and compares both guards in each, including the ticket decision. That folder's `scene.test.ts` owns both boundaries.

Browser tests live in `test/browser/`; `test:embeds` discovers every test there. `test/browser/explain-site.test.ts` builds two lessons in an isolated directory, exports them without a full catalog, checks the chosen entry and subset counts, and proves a damaged selected page leaves the last export intact. Pure snapshot-codec properties remain in `test/page-snapshots.test.ts`; the browser directory owns native gzip expansion.

CI runs the full campaign for code, fixtures, workflow changes, executable documentation, unknown paths and explicit dispatches. Prose-only changes on PRs and main run the onboarding, tutorial and writing-guide assertions plus whitespace checks. The `compatibility-prose` job reports the five compatibility contexts for those runs, on one Ubuntu runner each, because GitHub counts only the pull request's own run towards a merge. The required `story` job rejects a failed scope decision. A main push may reuse a successful same-repository PR campaign from the last 24 hours only when all nine campaign owners ran successfully (including the package job and macOS ARM), the archive records the same Node version and clean checkout, and the tested synthetic merge has exactly the same Git tree as main. Missing or expired proof runs full CI. Release dispatches always run fresh validation and produce their own artifacts.

The `package` job validates and uploads one candidate early. The expanded `check` job and all five compatibility lanes then run alongside one another; each compatibility lane installs that candidate's verified archive instead of rebuilding it. Catalogue and story review remain separate required owners. Starting macOS runner acquisition early overlaps its queue with the expanded tests; it cannot guarantee that GitHub assigns a runner.

`tools/repo/ci-tests.ts` emits a heartbeat every 30 seconds with elapsed time and time since child output. For direct Node test commands it also reports file starts and completions, including duration and failure, from live `test:dequeue`/`test:complete` events. These can arrive before the ordinary ordered test results. The normal reporter, property replay commands and failing exit status are retained. Heartbeats establish wrapper liveness, not successful tests. `test:embeds` uses the same wrapper.

The final `ci-status` diagnostic summary lists queue and execution times. A cancelled job with no assigned runner and zero steps is reported separately with a targeted `gh run rerun ... --job ...` command. Inspect the cancellation reason before retrying: metadata alone cannot distinguish provisioning, manual and concurrency cancellations. A missing runner never counts as a platform pass, and the diagnostic job does not retry or weaken a gate. If GitHub's metadata API is unavailable, this optional report may be missing; the actual validation jobs retain their results.

`scenes/explainers/statecharts/model.test.ts` compares the statecharts model with XState; `oracle/statecharts.ts` beside it says how to regenerate its fixture.

## Oracles CI runs and recordings

Some model tests run the outside system the explainer describes. A test that needs a tool this machine lacks skips, so `npm test` passes for a contributor without it. CI's `check` job sets `RAYNER_REQUIRE_ORACLES=1`, and there the same test fails instead of skipping. Every skip in an explainer's tests goes through `scenes/explainers/lib/oracle.ts`: `skipOracle` for an oracle CI runs, `skipOptionalOracle` for a rerun CI does not run. `test/explain-oracles.test.ts` fails on any other skip, and on an explainer missing from the tables below.

### Run live in CI

| Explainer | What the test runs | What it needs |
| --- | --- | --- |
| bloom-filter | `oracle/fnv.py`, compared with `fixtures/fnv.json` | CPython 3.12 (the Ubuntu 24.04 runner's `python3`) |
| birthday-paradox | `oracle/birthdays.py`, compared with `fixtures/birthdays.json` | CPython 3.12 |
| python-dict | `oracle/cpython_dict.py`, which reads the dict's storage from memory | 64-bit CPython 3.12 |
| isdigit | `python3` on the check questions' cases and the `isdigit()` row; Node's own Unicode data | any `python3`; Node with Unicode 17.0 |
| galton-board | `oracle/galton.py`: `math.comb`, `fractions.Fraction` and `statistics.NormalDist` | any `python3` from 3.8 |
| float-sum | `oracle/doubles.py`: CPython's float, with `decimal`, `fractions` and `math.nextafter`; JavaScript's own `+` and `Number()` | any `python3` from 3.9 |
| unified-diff | `git diff --no-index` and `git apply -v`, on the page's files and on drifted copies of random files | the Git CLI |
| string-length | `Intl.Segmenter` and `TextEncoder`, compared with `fixtures/segments.json`; `oracle/lengths.py` for `len()` and `str.encode()` | Node with Unicode 17.0; any `python3` |
| send-sync | `rustc` compiles the model's claims and the opening program | `rustc` on PATH or in `RUSTC` (the runner image has one) |
| fork | `git show` of Lantern's code at the fork base | the full history (`fetch-depth: 0`) |

These run without a skip, so they fail wherever their tool is missing: git-branches and exgit (the Git CLI), mr-cache's `fidelity.ts` (`git diff`), latest-search (Node's promises), state-machine (Node's own WebSocket, against the local server in its `oracle/socket.ts`), lantern (Rayner's engine) and agentic-mermaid (its verifier, a dependency of this checkout).

### Recorded once, not run by CI

CI compares the model with what these systems answered when someone ran them; it does not run the system. The date or version is in each script's **Checked against** line.

| Explainer | Recording | Rerun by hand |
| --- | --- | --- |
| isdigit | CPython 3.15.1's answers for the shown characters | with a `python3` whose Unicode is 17.0.0 (CI's 3.12 has 15.0) |
| ical-recurrence | sabre/vobject 4.5.7 (`fixtures/sabre.json`) and a Baïkal 0.10.1 run | `SABRE_DOCKER=1` (Docker) |
| wcag-map | the w3c/wcag repository at WCAG22-20241212, transcribed | `WCAG_REPO=<checkout>` |
| pg-page | Postgres 18.6 in Docker, 2026-10-25 | by hand |
| ext4-space | mkfs.ext4 1.47.3 on Linux 6.8.0 | by hand |
| send-sync | rustc 1.99.1's table, from the `rust:1.99.1-slim` image | by hand |
| token-bucket | golang.org/x/time/rate v0.15.0 (`oracle/`, a Go program) | `go run` in `oracle/` |
| traffic-policy | kube-proxy v1.37.1's test strings and one Go run | by hand |
| trust-proxy | Express 5.3.0, one run over HTTP | by hand |
| statecharts | XState 5.33.3 (`oracle/statecharts.ts`) | `node oracle/statecharts.ts <dir>` with XState installed |
| tailwind-gamut | Color.js 0.7.1 | by hand |
| gtfs | gtfs-kit 13.0.1 | by hand |
| henge | Skyfield 1.55 with JPL DE440s and GeographicLib 2.1 over four OpenStreetMap nodes (`oracle/sun.py`); Natural Earth 1:110m land (`oracle/land.py`); pyerfa 2.0.1.5 (`oracle/henge.py`) | with skyfield, geographiclib and DE440s; with the Natural Earth file; with pyerfa installed |
| great-circle | GeographicLib 2.0 (`oracle/great-circle.py`) | with geographiclib installed |
| periodic-groups | NIST Atomic Spectra Database ground configurations | by hand |
| quotient-familial | openfisca-france 176.1.3 | by hand |
| cert-renewal | Let's Encrypt's ARI windows on 2026-10-25; Certbot 5.8.0 and Boulder test vectors | by hand |
| font-metrics | uharfbuzz over EB Garamond 5.3.0's original fonts | by hand |

Each script's **Grounding** line gives the same grade to readers: `live`, `recorded`, `read` (a specification or source read, not run) or `none` (nothing outside the model's own tests).

### Native route observation

The shared chapter route keeper snapshots SVG through public drawing operations and uses awaited native tasks. Temporary diagnostic paint is restored before yielding, and each physical trip needs its own visible movement witness. `test/route-ink-await.test.ts` follows resolved observation calls, including aliases and transitive clients, and rejects a lost await. Native black/white foreground controls keep moving apertures and hidden underlays from supplying a false witness. Chapter oracles still name their protected subjects, legal reader origin and semantic obligations independently of route construction.

The [motion corpus report](MOTION-CORPUS.md) separates raw rejection, exact-target credit, guard refusal and chapter prevention. An early refusal is not a filmed diagnosis. Keep old targets when an intended layout change moves the historical victim, and add a separately named current native control. Worker exit, schema, unique inventory and UTF-8 transport checks are evidence admission boundaries. Content hashes record capture provenance and verifier freshness; they are not behavior expectations.
