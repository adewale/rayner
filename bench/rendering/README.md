# Controlled rendering comparison

Run `npm ci`, then `npm run bench:rendering` from the repository root. Node 24 and a compatible Chromium are required. Output goes to `out/rendering-comparison/`; an alternative directory can be passed as the first argument. `npm run check` includes this benchmark's TypeScript project. The subject oracle tests run in the standard suite; `EXPLAIN_BROWSER=1 node --test test/browser/rendering-comparison.test.ts` owns the real paired browser campaign.

## What is controlled

Two new subjects, lower-bound search and circular FIFO storage, each have two changed-condition cases. Both arms receive the same frozen models, step states, words, questions and settings. Search is compared independently with `Array.findIndex`; circular storage is compared with a separate `push`/`shift` array FIFO across generated wraps and refusals. The builder runs those tests before admitting either arm.

`rayner.ts` uses the standard stage/steps player. `plain.ts` uses native SVG text and rectangles with Next/Previous, case selection and deep links. Both use the same numeric geometry, minimum type scale and exact pinned font face. Both supply an initial poster, default transcript without JavaScript and the same reader questions. The native bundle is checked to contain no engine, explainer or player modules.

This isolates two fixed rendering implementations. It does not measure independent author productivity, custom machine-event interfaces, editorial motion design or learner understanding. One author wrote both adapters. An alternative native implementation may perform differently. The implementation and study protocol are separate evidence.

## Admission and measurements

- Model tests must pass. Rayner's checked traces must match every frozen model state, title and caption before measurement.
- A single browser visits both arms at 390 and 1180 px. Every step/case/arm/width is counted: 96 states in total. Native SVG words are checked against the packet and must be visibly painted within their viewport. Rayner's actual browser paths/attributes must equal the corresponding Node drawing, with renderer IDs excluded.
- Actual screen transforms and label sizes must reach 12 px, with no horizontal page overflow, page exceptions or external requests. This is a desktop browser at phone width, not a physical phone.
- Three fresh-context first-load samples per case/arm/width give 48 timing samples. AB/BA ordering alternates across repeats and cases. Ready time means the matching settled-step event, fonts ready and two animation frames; it is not LCP, network latency, reading time or a learning score.
- Raw/gzip page bytes and artifact hashes are retained. Build milliseconds time artifact assembly once, after shared preparation and Rayner's admission checks; they are not total author effort or an end-to-end build contest.

`inputs.json` freezes the material. `manifest.json` records subject/adapter/font/engine hashes, actual oracle seed, Node version, source commit and dirty status. `oracle.txt` retains executed test results. `expected-paint.json`, screenshots and `results.json` retain conformance and measured samples. The measured HTML bytes are verified against the manifest before every context.

The recorded run is in [results-2026-11-17.json](results-2026-11-17.json). Re-run on your own machine; these local measurements are not a performance guarantee. The earlier [review protocol](../../docs/evidence/review-2026-11-17.md#assessment-and-next-experiment) explains the separate participant-based author/learning comparison.

## Recorded run, 17 November 2026

All 96 conformance states and 48 first-load samples passed. The smallest measured visible label was 13.42 px. The table reports bytes for the complete standalone page, including its font and notices, and the median of six phone-width first-load samples per topic/arm (two cases, three repeats).

| Subject | Arm | Page bytes | Gzip bytes | Phone ready median |
| --- | --- | ---: | ---: | ---: |
| Lower bound | Rayner | 515,705 | 205,809 | 549.4 ms |
| Lower bound | Native SVG | 90,143 | 38,628 | 163.6 ms |
| Circular FIFO | Rayner | 517,921 | 204,291 | 321.0 ms |
| Circular FIFO | Native SVG | 90,669 | 38,675 | 133.8 ms |

Catalogue validation was running concurrently. The retained environment and individual samples expose that load; six observations per phone cell do not establish a stable speed ratio. The native pages are about 81% smaller when gzipped for these fixtures. That supports keeping a simple rendering option in the comparison, while Rayner's broader player features and authored motion need their own evaluation. These results supply no author-effort or learning advantage for either arm.
