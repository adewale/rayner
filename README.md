# Rayner

Rayner makes step-through explainers of technical subjects, from Git merges to Earth’s seasons. Scenes are written in TypeScript with Manim’s vocabulary of scenes, mobjects and transforms, but a reader steps through one HTML page with no runtime dependencies instead of watching a video. It is for engineers and technical educators who write TypeScript.

A picture of a Python dict after `del d[0]` is easy to draw wrong. Draw slot 0 empty and a later lookup for key 8 stops there and misses it; CPython instead leaves a deleted marker that sends the search on. In Rayner the dict is a TypeScript model checked against CPython 3.12’s own storage, each step is drawn from the model’s state, and `rayner check` fails a picture that disagrees with that state. How closely a model matches its subject varies from explainer to explainer, and the table below says what each was checked against.

[![Step 3 of the Python dict explainer: slot 0 holds D, the deleted marker, so the lookup for key 8 moves on to slot 1 and finds pear. A setting switches the lookup to key 16, and the step list and caption sit beside and below the picture.](https://raw.githubusercontent.com/adewale/rayner/main/docs/images/python-dict-marker.png)](https://oshineye.dev/projects/rayner/python-dict)

| Explainer | Its model is checked against |
|---|---|
| [Why does a deleted dictionary slot need a marker?](https://oshineye.dev/projects/rayner/python-dict) | CPython 3.12’s dict storage, read from memory |
| [Why does a merge sometimes need a new commit?](https://oshineye.dev/projects/rayner/git-branches) | Git repositories the test builds and merges |
| [What is a statechart, and why use one instead of a state machine?](https://oshineye.dev/projects/rayner/statecharts) | The states and transitions XState 5.33.3 reaches |
| [Does isdigit guarantee int can parse it?](https://oshineye.dev/projects/rayner/isdigit) | CPython 3.15.1’s answers and Unicode 17.0.0’s data files |
| [How does a token bucket let a burst through but refuse a flood?](https://oshineye.dev/projects/rayner/token-bucket) | Go’s `golang.org/x/time/rate` limiter |
| [Why does sunset line up with Manhattan’s streets?](https://oshineye.dev/projects/rayner/henge) | ERFA’s horizon coordinates; the orbit is idealised, so it does not predict viewing dates |
| [Why does the periodic table have this shape?](https://oshineye.dev/projects/rayner/periodic-groups) | NIST’s ground-state configurations, which agree for 88 of the 108 elements compared |
| [Why does the host’s rule change the odds of switching?](https://oshineye.dev/projects/rayner/monty-hall) | Its own probability tests, with three, four and a hundred doors |
| [Why does a Bloom filter answer “maybe”?](https://oshineye.dev/projects/rayner/bloom-filter) | Invariant tests of a teaching model with its own hashes, not a production filter |
| [Why does the north have summer when Earth is farthest from the Sun?](https://oshineye.dev/projects/rayner/seasons) | Nothing external: a cited approximation of the Sun’s path, not validated against an almanac |

Each explainer’s `notes.md` says what its model leaves out; the [Bloom filter’s scene](https://github.com/adewale/rayner/blob/main/scenes/explainers/bloom-filter/scene.ts) shows a model supplying a picture and its caption. [All explainers](https://oshineye.dev/projects/rayner/)

## Quick start

> [!NOTE]
> These steps are for Rayner 0.2.0, which is not on npm yet; npm’s current release is 0.1.0, whose `init` writes a different starter. Until 0.2.0 is published, [work from this repository](#contributing).

Requires Node 24 or later and Chromium. Authoring targets Ubuntu and macOS; Windows is not yet supported.

```sh
mkdir my-rayner && cd my-rayner
npm init -y
npm pkg set type=module
npm install --save-dev rayner@0.2.0
npx playwright-core install chromium
npx rayner init my-explainer
npx rayner preview my-explainer/scene.ts --watch
```

If Chromium is already installed, set `CHROMIUM_EXECUTABLE_PATH` instead of downloading it.

`init` writes the tutorial’s explainer of LRU and MRU cache replacement: the script (`script.md`), the model (`model.ts`), the model’s test (`model.test.ts`) and the scene (`scene.ts`). Open the URL `preview` prints (port 5174 by default) and switch between **A B C D again** and **C D C D**. Edit `my-explainer/scene.ts` and reload to see the rebuilt page.

When the explanation is ready, review every scenario and save the page:

```sh
npx rayner review my-explainer/scene.ts --out public/my-explainer.html
```

`review --out` checks every scenario, audits the served page at phone and desktop widths, and saves that exact HTML with its receipt, a response-header recipe and its loader. [The tutorial](docs/TUTORIAL.md) builds a complete explainer; [publishing](docs/PUBLISHING.md) covers hosting and embedding it. `npx rayner init --machine` writes the other starter, a door that locks, for explainers a reader drives with events.

## What a scene looks like

The model is plain TypeScript, and its test holds it to a published source. From the starter `init` writes:

```ts
// model.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { run, type Policy } from './model.ts';

const evictions = (policy: Policy, requests: string) =>
  run(policy, 4, [...requests]).map((r) => r.evicted ?? '-').join(' ');

test("LRU matches Wikipedia's example: E replaces A, then F replaces B", () => {
  assert.equal(evictions('lru', 'ABCDEDF'), '- - - - A - B');
});
```

The scene states the answer the explanation must reach and draws each step’s words from the model’s trace (abridged):

```ts
// scene.ts
export default class LruMru extends Scene {
  static meta = {
    id: 'lru-mru',
    title: 'What is the difference between LRU and MRU?',
    answer: 'LRU evicts the item used longest ago',
    // sources, and the questions the player asks after the last step
  };

  override async construct() {
    // …
    const [lruOut, mruOut] = [trace.lru[3]!.evicted, trace.mru[3]!.evicted];
    await this.step('evict', {
      title: 'D evicts opposite ends',
      line: `LRU drops ${lruOut}, the oldest; MRU drops ${mruOut}, the newest.`,
      caption: `LRU evicts the item used longest ago, ${lruOut}. MRU evicts the item used most recently, ${mruOut}. …`,
    });
  }
}
```

## What `rayner check` and `rayner review` catch

- **The model against its source.** The model’s test compares it with whatever the author could check it against, from the program itself to published examples ([the table above](#rayner) shows the range), and a fidelity test asserts that every step of every scenario shows what the model computed.
- **Pictures against state.** `rayner check` runs every scenario, redraws each staged step’s picture from the state its step recorded, and draws every state an event-driven [machine](docs/MACHINES.md) can reach. Jumping straight to a step must draw what playing up to it draws.
- **Layout.** It fails undersized desktop labels, text that collides, connectors that cross labels, and a picture that moves after its caption starts.
- **Words.** It fails a drawing with no description in words, and an explanation that never states its declared answer (`meta.answer`), reporting the step where the answer first appears.
- **The served page.** `rayner review` opens the built page in Chromium at phone and desktop widths, visits every resting step of every scenario, and checks what is painted.

What the checks leave to you:

- A Mermaid diagram is checked against the renderer’s output pinned beside the scene, and a hand-placed callout only by the scene’s own tests.
- Phone label sizes are estimated from the minimum stage geometry; `rayner review` checks the served layout.
- `meta.claims` links prose to named tests, but does not run them or verify their assertions.
- No check can tell whether a caption is true or whether a reader learns. Write the script first (the [authoring skill](skills/rayner-explainers/SKILL.md) says how), look at the screenshots, and judge the result with [Judging an explainer](docs/EXPLAINER-RUBRIC.md).

## Reading and exploring an explainer

A reader reads an explainer as a sequence of steps. Each step is a resting picture with a title, a one-line point and a caption. The transcript under the stage repeats every caption with a description of every picture, so the explanation survives without the animation, and each step has its own link.

Where the author built the model as a [machine](docs/MACHINES.md), the reader can also explore it: one button per event the model accepts, then Undo and Reset. An event the model refuses stays visible and says why, and the events sent so far sit in the URL, so a link reopens the same picture. Settings switch between scenarios, each built and checked before the page was published.

## The authoring loop

1. **Script.** `script.md` states the reader’s question, the one-sentence answer the explanation must reach (`meta.answer`), and the questions a reader should be able to answer afterwards (`meta.checks`).
2. **Model.** `model.ts` computes what the pictures will show, and `model.test.ts` compares it with the source: a published test vector, a reference implementation or the program itself.
3. **Scene.** `scene.ts` names the steps and draws each one from the model’s state.
4. **Check and review.** `rayner check` and `rayner review`, [above](#what-rayner-check-and-rayner-review-catch).
5. **Publish.** `rayner review --out` saves the exact page it reviewed.

## How Rayner compares

| | Written in | What the reader gets | Built for |
|---|---|---|---|
| [Manim Community](https://github.com/ManimCommunity/manim) | Python | A rendered video | “Explanatory math videos” |
| [Motion Canvas](https://github.com/motion-canvas/motion-canvas) | TypeScript, with generators | Vector animations, previewed in its editor | Animations “synchronize[d] with voice-overs” |
| [Lantern](https://github.com/ivarvong/lantern) | TypeScript, a port of Manim’s core model | SVG in the browser, or SVG strings from Node or Cloudflare Workers, with every step addressable | “Explainers for code changes”; installed from Git, not npm |
| Rayner | TypeScript, forked from Lantern | One HTML page of steps, settings and a transcript, with no runtime dependencies | Explanations whose pictures must agree with a tested, cited model |

Rayner keeps Lantern’s engine ([upstream](docs/UPSTREAM.md) lists the changes) and adds the parts that hold each picture to a model: the recorded state at every step, the model test, and the `check` and `review` gates. Choose Manim when the output should be a video, and Motion Canvas when animation must be timed to narration.

## Guides

- **Writing explainers:** [the tutorial](docs/TUTORIAL.md), [Judging an explainer](docs/EXPLAINER-RUBRIC.md), [machines](docs/MACHINES.md), the [agent authoring skill](skills/rayner-explainers/SKILL.md) and the [FAQ](FAQ.md). The [feature tour](https://oshineye.dev/projects/rayner/feature-tour) answers “how do I write that?” for 29 features: each opens at **Recipe**, the lines an author writes, and **Result** shows the picture before and after they run. The [feature guide](docs/FEATURE-TOUR.md) links the full source and the setup some features need.
- **Using Rayner as a library:** [engine fundamentals](docs/ENGINE-FUNDAMENTALS.md), the [engine map](docs/ENGINE.md) of guides and the invariants they keep, and the [API and CLI reference](docs/REFERENCE.md). The [drawing kit](docs/REFERENCE.md#drawing-kit) (`rayner/drawing`) builds tables, bars, callouts, dimension lines, pins and legends from state.
- **Agents:** `rayner describe` and `rayner see` give every step as JSON or text, including the picture drawn as text, so an agent can inspect and revise a scene without a browser.

## Scope and limits

Scenes are ordinary TypeScript classes. Reader settings are finite choices, with every combination built ahead of time. Diagrams are captured from [Agentic Mermaid](https://github.com/adewale/agentic-mermaid) at build time; authors can also draw native shapes, charts, code diffs and camera moves. The browser loads no diagram renderer, and the page makes no runtime network requests.

- Default text uses embedded Inter and JetBrains Mono. Additional scripts, replacement faces, real bold and italic, and typeset maths need explicit [lettering requests](docs/LETTERING.md). New lettering capture needs Python and source fonts; committed snapshots replay without them.
- Paragraph direction follows the text. Authors can also choose [card field order and logical panel placement](docs/REFERENCE.md#stage) with `direction: 'rtl'`. Mermaid graph direction remains explicit in its source (`graph LR`, `graph RL`, and so on).
- Diagram labels fit captured widths by default. Opt into [`lettering: 'natural'`](docs/LETTERING.md#diagram-measurements) to measure the requested face before layout. A diagram style does not implicitly select its font.
- Player controls and generated picture descriptions are available in English and French. Other caption languages retain English controls and descriptions.
- Phones use close-ups and a **Next view** tour. Review the opening and the whole tour so the caption’s subject remains visible.
- Builds enforce 1.5 MiB raw HTML and 450 KiB gzip page budgets. Diagram snapshots expand through the browser’s native `DecompressionStream` API; the transcript remains readable without JavaScript. Split a scene or reduce its scenarios when it exceeds a budget.
- The example models are small and cited. They have not had subject-expert review.

## Contributing

Build the full local gallery when developing or reviewing Rayner itself:

```sh
git clone https://github.com/adewale/rayner && cd rayner
npm ci
npx playwright-core install chromium
npm run demos:build
npm run demos:serve
```

Open http://127.0.0.1:5175/explainers/. For a source change, run `npm run check` and `npm test`; [testing guidance](docs/TESTING.md) covers browser and capture checks. Report bugs in [GitHub issues](https://github.com/adewale/rayner/issues) with the scene, scenario, step and viewport needed to reproduce them. Before proposing a feature, read [what belongs in Rayner](docs/ENGINE.md#what-belongs-in-rayner). [The release guide](docs/RELEASING.md) records platform validation and the separate maintainer publishing workflow.

## License and attribution

Rayner is [MIT](LICENSE), maintained by [Ade Oshineye](https://github.com/adewale), and forked from Ivar Vong’s [Lantern](https://github.com/ivarvong/lantern) at `2c7bad5`. [Upstream](docs/UPSTREAM.md) records the engine changes. Embedded font and glyph notices ship in `vendor/licenses/`. Neither Lantern nor Agentic Mermaid endorses this fork.
