# Frequently asked questions

## When is Rayner worth using instead of a diagram or a screenshot?

When the explanation depends on an input. A cache hit and a cache miss take different paths through the same code, so the [cache explainer](https://oshineye.dev/projects/rayner/mr-cache?request=hit&step=request) lets the reader switch between them and see zero D1 reads become one. If one picture already tells the whole story, publish the picture: the [authoring skill](skills/rayner-explainers/SKILL.md) asks authors to check whether a still or a short code diff explains it before writing a scene.

## Does a passing `rayner check` or `rayner review` mean my explanation is correct?

No. `check` runs every scenario and fails on motion that pops or jumps, a seeked frame that differs from the played one, text that overlaps or is cut off, and labels too small to read. `review` opens every resting step at phone and desktop widths and checks that each caption's subject is painted. Neither knows whether a caption is true. Put the numbers in a model, test that model against its source, and read the pictures yourself; the [tutorial](docs/TUTORIAL.md) and [reference](docs/REFERENCE.md#checks) say the same.

## Do readers need a server, a network connection or JavaScript?

They need a static host and nothing else. `rayner build` writes one HTML file holding every scenario, the poster, a transcript, the sources and the licence notices, and the page makes no network requests while it runs; its header recipe sets `connect-src 'none'`. Without JavaScript the reader still gets the transcript: each step's title, caption and a description of its picture. [Publishing](docs/PUBLISHING.md) covers the response headers the host must send.

## Why are diagrams captured at build time instead of drawn in the browser?

So the page carries no diagram renderer. Rayner renders each Mermaid diagram with [Agentic Mermaid](https://github.com/adewale/agentic-mermaid) in Chromium while building, checks the capture against the renderer's own output, and commits the result to `scene.snapshots/`. The browser only replays that geometry, decompressing it with its native `DecompressionStream`. A later build reuses the snapshot until the diagram's source or the capture code changes.

## How many scenarios can one explainer have?

At most 64, and every combination of settings is built ahead of time, so each scenario adds to the page. A page must stay under 1.5 MiB of HTML and 450 KiB gzipped; when a scene goes over, split it or cut scenarios. Spend them on scenarios that change the conclusion: a scenario that only recolours the picture still costs page size.

## Can I embed an explainer in another page?

Yes, in an iframe. The optional `loader.js` that `build` writes sizes the frame to the page's content through a one-message resize protocol, accepted only from the frame's own origin. The host must send the page's `frame-ancestors` header and must not send `X-Frame-Options: DENY` or `SAMEORIGIN`. [Publishing](docs/PUBLISHING.md) has the details.

## Can tools and AI agents read an explainer?

Yes. `rayner describe scene.ts` prints every scenario and step as JSON: title, caption, timing, the state the scene recorded, what each step changed, and the resting picture in words and as a rough text drawing. `rayner see` prints one step of the same description at a terminal. `npm run site:export` publishes that JSON beside each page and lists every explainer in `llms.txt`. For writing explainers, the [agent authoring skill](skills/rayner-explainers/SKILL.md) is the instruction set an agent follows.

## Lantern had a JSON document format. What was it for, and why doesn't Rayner have one?

It let an author write an explanation as data rather than code. A Lantern doc listed the shapes on screen, the connections between them, a code panel, the values to track, and named steps made of operations such as `add`, `move`, `focus` and `set`; `sceneFromDoc` turned it into an ordinary scene, so a doc got deep links, seeking and traces. The step names and state in the trace matched what the doc declared. ([Lantern's format notes](https://github.com/ivarvong/lantern/blob/2c7bad533be25fbd56d26a9a2b6c5651743f011e/docs/DOC-FORMAT.md), at the commit Rayner forked from.)

The values in a doc were typed in by hand. Lantern's ring-buffer doc says `set { len: 1 }` after the first push because its author wrote that, so the trace could only repeat the author's claim. A doc also had no way to offer the reader a second scenario. Rayner deleted the format along with `DocScene` ([upstream](docs/UPSTREAM.md)) and writes scenes as TypeScript classes that ask a model for each value: the ring buffer's state now comes from running a ring buffer in `scenes/explainers/ring-buffer/model.ts`, a test compares the scene's recorded result with that model, and another checks that each step's picture follows the recorded state. The machine-readable view moved to the output: `rayner describe` reports what the scene recorded rather than what an author declared.

## How does Rayner relate to Lantern and Manim?

Rayner is a fork of Ivar Vong's [Lantern](https://github.com/ivarvong/lantern) at `2c7bad5`, and [upstream](docs/UPSTREAM.md) lists each engine change and removal. Both engines use [Manim](https://www.manim.community/)'s vocabulary of mobjects, transforms and scenes, and some of Rayner's fixes come from Manim's and manim-web's issue histories, with a test naming each source issue. Lantern does not endorse this fork.

## Does it work on a phone?

Yes. On a stage under 600 px wide, each step opens on a close-up of what it changed, zoomed so that nearby labels read at 12 px, and a **Next view** button tours the step's other close-ups without moving to the next step. `rayner review` opens every step at 390 px and checks that each caption's subject is visible in the opening view or the tour. A dense picture, such as a full periodic table, is reached view by view rather than all at once.

## Can I write an explainer in a language other than English?

Yes: set `meta.lang` and write the captions in that language. The player's controls and the generated picture descriptions exist in English and French; other languages keep English controls. Default text uses the embedded Inter and JetBrains Mono; Latin Extended, Greek, Cyrillic, Arabic, Devanagari, Hebrew and Chinese text, other faces, real bold and italic, and typeset maths each need a [lettering request](docs/LETTERING.md). A character the explainer has not asked for fails the build and names the code point.
