# Rayner: interactive technical explanations from TypeScript

Rayner turns a TypeScript model into a step-through explanation. Readers can change a setting and see how the result changes; authors publish the cases as a portable HTML page with a transcript. It is for engineers and technical educators explaining protocols, algorithms and code changes.

## Start with a question

[Why does a Bloom filter answer “maybe”?](https://oshineye.dev/projects/rayner/bloom-filter) See whose names set the bits, predict whether wolf gets through, then double the memory and compare the outcome. [Read the scene](scenes/explainers/bloom-filter/scene.ts) to see how the model supplies the picture and caption.

[Browse the subject lessons](https://oshineye.dev/projects/rayner/) · [Write your first scene](docs/TUTORIAL.md) · [API and CLI reference](docs/REFERENCE.md)

[Why does the sunset line up with Manhattan’s streets?](https://oshineye.dev/projects/rayner/henge) Follow Earth’s tilt through the observer’s horizon, then rotate the street to see why the alignment seasons change. The fixed-tilt geometry explains the mechanism; it does not predict visiting times.

## What Rayner checks for you

An explainer written by hand, or by a language model, can look right and be wrong. Rayner's job is to check what an author, human or model, cannot easily check by eye:

- **Every value comes from a model, and the model is tested against the real thing.** A scene draws numbers, paths and outcomes from a separate TypeScript model; its test compares the model with the program, library or published vectors it describes (CPython, Git, XState and others in the gallery), and a fidelity test asserts that every step of every case shows what the model computed.
- **Pictures are measured as painted.** `rayner check` runs every case and fails on undersized desktop labels, text that collides, connectors that cross labels, a picture that moves after its caption starts, a jump to a step that draws differently from playing to it, and a drawing with no description in words. It also fails an explanation that never states its declared answer (`meta.answer`), and reports the step where the answer first appears.
- **The page is reviewed as served.** `rayner review` opens the built page at phone and desktop widths, visits every resting step of every case, and checks what is actually painted.
- **Agents can read it.** `rayner describe` and `rayner see` give every step as JSON or text, including the picture drawn as text, so an agent can inspect and revise a scene without a browser.

Phone label estimates use the minimum stage geometry; `rayner review` checks the actual served layout. Claims metadata links prose to named tests, but does not run them or verify their assertions. The checks cannot tell whether a caption is true or whether a reader learns. Write the script first (the [authoring skill](skills/rayner-explainers/SKILL.md) says how), and judge the result with [Judging an explainer](docs/EXPLAINER-RUBRIC.md).
To use Rayner as a library, start with [engine fundamentals](docs/ENGINE-FUNDAMENTALS.md),
[frames, text and traces](docs/SCENE-OUTPUTS.md), and [runnable extension recipes](docs/EXTENDING.md).
[Sampled parameters](docs/PARAMETERS.md) records what a general version of the
continuous recipe would change; the recipe itself uses the supported Animation extension point.

## Write your first scene

Requires Node 24 or later and Chromium. Authoring targets Ubuntu and macOS; Windows is not yet supported. In an empty directory, install the published package and start the tutorial's two-case explainer of LRU and MRU cache replacement:

```sh
mkdir my-rayner && cd my-rayner
npm init -y
npm pkg set type=module
npm install --save-dev rayner
npx playwright-core install chromium
npx rayner init my-explainer
npx rayner preview my-explainer/scene.ts --watch
```

Open the localhost URL printed by `preview`. Switch between **A B C D again** and **C D C D**, edit `my-explainer/scene.ts`, then reload to see the rebuilt page. `init` also writes the reader-facing script, `script.md`, the scene's model, `model.ts`, and a test of it against published examples, `model.test.ts`. If Chromium is already installed, set `CHROMIUM_EXECUTABLE_PATH` instead of downloading it.

When your explanation is ready, review every case and save the page to publish:

```sh
npx rayner review my-explainer/scene.ts --out public/my-explainer.html
```

`review --out` checks every case, audits the served page at phone and desktop widths, and saves that exact HTML with its receipt, header recipe and loader. Check the model against its sources and inspect the screenshots: automated checks cannot establish that an explanation is true. [The tutorial](docs/TUTORIAL.md) develops a complete explainer; [publishing](docs/PUBLISHING.md) covers hosting and embedding it.

## Look up an authoring feature

The [feature tour](https://oshineye.dev/projects/rayner/feature-tour) answers an author's question, how do I write that?, for 15 features. Choose a feature to start at **Recipe**, which shows the lines an author writes and asks what they will draw; then advance to **Result**, which shows the picture before and after those lines run. Its excerpts need the surrounding scene to run; the [feature guide](docs/FEATURE-TOUR.md) links the full source and specialized setup. Direct links to a Result step still work.

## Work from this repository

Build the full local gallery when developing or reviewing Rayner itself:

```sh
git clone https://github.com/adewale/rayner && cd rayner
npm ci
npx playwright-core install chromium
npm run demos:build
npm run demos:serve
```

Open http://127.0.0.1:5175/explainers/. For a source change, run `npm run check` and `npm test`; [testing guidance](docs/TESTING.md) covers browser and capture checks. Report bugs in [GitHub issues](https://github.com/adewale/rayner/issues), with the scene, case, step and viewport needed to reproduce them; before proposing a feature, read [what belongs in Rayner](docs/ENGINE.md#what-belongs-in-rayner). [The release guide](docs/RELEASING.md) records platform validation and the separate maintainer publishing workflow.

## Scope and limits

Scenes are ordinary TypeScript classes. Reader settings are finite choices, with every combination built ahead of time. Diagrams are captured from [Agentic Mermaid](https://github.com/adewale/agentic-mermaid) at build time; authors can also draw native shapes, charts, code diffs and camera moves. The browser loads no diagram renderer, and the page makes no runtime network requests.

- Default text uses embedded Inter and JetBrains Mono. Additional scripts, replacement faces, real bold and italic, and typeset maths need explicit [lettering requests](docs/LETTERING.md). New lettering capture needs Python and source fonts; committed snapshots replay without them.
- Paragraph direction follows the text. Authors can also choose [card field order and logical panel placement](docs/REFERENCE.md#stage) with `direction: 'rtl'`. Mermaid graph direction remains explicit in its source (`graph LR`, `graph RL`, and so on).
- Diagram labels fit captured widths by default. Opt into [`lettering: 'natural'`](docs/LETTERING.md#diagram-measurements) to measure the requested face before layout. A diagram style does not implicitly select its font.
- Player controls and generated picture descriptions are available in English and French. Other caption languages retain English controls and descriptions.
- Phones use close-ups and a **Next view** tour. Review the opening and the whole tour so the caption's subject remains visible.
- Builds enforce 1.5 MiB raw HTML and 450 KiB gzip page budgets. Diagram snapshots expand through the browser's native `DecompressionStream` API; the transcript remains readable without JavaScript. Split a scene or reduce its cases when it exceeds a budget.
- The example models are small and cited. They have not had subject-expert review.

[FAQ](FAQ.md) · [Engine guides](docs/ENGINE.md) · [Agent authoring skill](skills/rayner-explainers/SKILL.md) · [Changelog](CHANGELOG.md)

## License and attribution

Rayner is [MIT](LICENSE), maintained by [Ade Oshineye](https://github.com/adewale), and forked from Ivar Vong's [Lantern](https://github.com/ivarvong/lantern) at `2c7bad5`. [Upstream](docs/UPSTREAM.md) records the engine changes. Embedded font and glyph notices ship in `vendor/licenses/`. Neither Lantern nor Agentic Mermaid endorses this fork.
