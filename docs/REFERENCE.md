# Reference

[The tutorial](TUTORIAL.md) builds a two-case explainer of LRU and MRU cache replacement; the [authoring feature tour](FEATURE-TOUR.md) pairs code excerpts with the result of running them. [Publishing](PUBLISHING.md) covers hosting and embedding a page.

Words used throughout: a **setting** is a choice a scene declares (an id, a label and options); a **case** is one value for every setting. A **step** is a named section of the scene, and its **resting picture** is what the step leaves on screen: the picture a reader looks at while reading the caption. The **stage** is the 16 × 9 drawing area. Code and JSON spell case as `variant` (`variantsOf`, `variants` in reports) and resting picture as `restingFrame`.

## Scene

An explainer is a Rayner `Scene` exported from a TypeScript or ESM file, preferably as the default export. A module with exactly one exported `Scene` subclass also works.

```ts
static meta = { id: 'cache', title: 'Why a cache changes the request path', lang: 'en', sources: ['https://example.com/spec'] };

await this.step('stable-name', {
  title: 'A claim the picture can prove',
  line: 'The one thing to see, in a few words.',       // under the title, drawn on the picture
  caption: 'The value, part or mechanism on screen.',  // under the stage on the page
});
this.state.reads = reads;   // program state, recorded at each step boundary
```

- `meta.id` names the output files, `meta.title` is the page title, and `meta.sources` are listed under the transcript.
- `meta.lang` (BCP 47, default `en`) is the language of the page and the transcripts. The main player's own words (`app/embed-strings.ts`) and the generated picture descriptions (`explain/words.ts`, whose `families` name each diagram family and its parts) exist in English and French. On a page in any other language both are English, and the descriptions are marked `lang="en"`; `Picture.lang` in the trace records a description's language when it is not English.
- Step names are URL identifiers. They must be unique and non-empty in every case.
- `this.state` is recorded before and after each step. Compute values with a model, show its result, and test that each step's state equals the model's (`assertStepState` in `test/lib/explainer-state.ts`).
- `meta.watch` names the state a reader should follow, from a `this.state` key to its label in the scene's language: `watch: { tokens: 'Tokens left', allowed: 'Accepted', rejected: 'Rejected' }`. Raw state is developer data and is never shown wholesale; only these keys are. For each step, a watched key whose JSON differs between the step's start and end is a change, shown in `watch` order, at most four: "Tokens left: 5 → 0" (changed), "Rejected: R6" (appeared) or "Tokens left: removed". Numbers are formatted in the scene's language with at most two decimals; strings are cut to 24 characters; booleans read yes or no in the scene's language; a list of numbers, strings or booleans shows four items and "+n". `null`, absent and an empty list have no value. A value that reads the same before and after is no change. An object or a list of objects cannot be said briefly: the key is skipped for that step and `check` reports it. Collection fails on more than eight entries, an empty key or label, or a key that is never in the state of any step of any case. One function, `watchedChanges` in `explain/trace.ts`, formats changes for the player, the transcript, `describeExplainer` and `check`.
- `meta.answer` is the script's one-sentence answer to the reader's question (see the authoring skill's "Script first"). `check` fails unless the title, line or caption of some teaching step contains it, compared ignoring case, quote style, spacing and final punctuation, and reports the first such step. Whether the answer comes before the explanation elaborates is for a reader to judge. `meta.checks` lists the questions a reader should be able to answer afterwards, each `{ question, answer }`, at most six. The player asks them after the last teaching step with each answer behind a disclosure; the transcript ends with them, and `describeExplainer` returns both fields. Collection refuses an empty answer, an empty list, a question without an answer and more than six questions. A scene without them still checks; `check` reports them as missing, and `rayner init` starts a scene with both.
- `line` is one short line under the heading: what to see, in about ten words or fewer. The stage draws it in the soft colour and fails every command on a line wider than the heading (14.6 units at 0.3). It is part of the picture and the page transcript.
- `detail: true` in a step’s metadata puts it under **Details and sources** in the reader. Main-story Next and Previous skip these steps. Direct links still open them, and **Back to the explanation** returns to the last main step. While a reference step is selected, Next and Previous follow source order; reaching a main step resumes its shorter path. Builds, transcripts, snapshots and verification retain every step. If every step is marked as detail, the reader treats the full sequence as the main story.
- A captioned step holds until its caption could be read at 160 words a minute (`Scene.captionWpm`), counting the step's motion as reading time. The page stops when the picture stops and waits for the reader. The picture must not change once the hold begins.
- Do not put awaited animations inside `try`/`catch` or `.catch()` in `construct()`. Seeking stops a scene by throwing `StopScene`, and a broad catch swallows it, so a jump to a step would show a different picture from playing to it. Handle a known model error in plain code before animating. The engine limits the damage: a `StopScene` from a sink sets `this.stopped`, and from then on `play()`, `wait()`, `step()` and every frame rethrow it before doing anything, so a swallowed stop emits no further frame. Plain code between the catch and the next scene call (a `shift()`, a write to `this.state`) still runs, which is why `check` keeps the lint.
- `this.frame` is the camera: the box of the stage on screen. `this.play(this.frame.animate.fit(target, { margin }))` zooms onto a mobject or a box, `this.frame.animate.reset()` returns to the whole stage, and `this.frame.zoom` is the magnification. Moving it moves no point; [the camera guide](CAMERA.md) has the rest, and [`d.focus`](#diagrams) moves the same camera with `camera: true`.
- `this.record(kind, data)` adds `{ kind, ...data }` (copied as JSON) to the step's evidence. Step evidence records what an animation did, where `state` is what the program is; it has nothing to do with the build's `evidence.json`. Steps in the trace carry it as `evidence`, only when they recorded something; seeks record the same evidence as full runs; `this.evidence` holds every record so far. Matching transforms and `TransformDiff` record themselves ([evidence](MATCHING.md#evidence)), so counts on screen can be read from what the transform did; a View's internal morph (`view.sync()`) does not record evidence.
- By default, lettering uses the embedded fonts, drawn as outlines. JetBrains Mono falls back to Inter, and both fall back to Noto Sans Arabic, Devanagari and SC subsets that hold numerals only (Arabic-Indic and Devanagari digits, Chinese numerals, fullwidth digits). Diagram labels fit the captured widths unless their spec opts into [natural measurements](LETTERING.md#diagram-measurements). A style does not request its font. Bold is the Regular outline stroked, and there is no italic. Every command rejects characters outside the default fonts and requested lettering, naming the case, step and code point. An explainer can request additional scripts, registered faces, real bold and italic, or maths with `meta.lettering`, below.

### Lettering on request

Requests for Arabic (`Arab`), Devanagari (`Deva`), Hebrew (`Hebr`), Chinese (`Hani`), replacement `faces`, `styles` (real bold and italic) or `math: true` use the [outline snapshot workflow](LETTERING.md). That guide covers setup, the font registry, bold and italic, shaping and bidi limits, maths, and refreshing snapshots.

Plain Latin Extended (`Latn`), Greek (`Grek`) and Cyrillic (`Cyrl`) requests use the subset workflow below; only the requesting page carries the additional lettering:

```ts
import type { LetteringRequest } from 'rayner/lettering';

static meta = { id: 'alphabet', title: 'Αλφάβητο', lettering: { scripts: ['Grek'] } satisfies LetteringRequest };
```

- `scripts` takes ISO 15924 codes: `Latn` (Latin Extended-A, -B and Additional, U+0100–024F and U+1E00–1EFF), `Grek` (U+0370–03FF and U+1F00–1FFF) and `Cyrl` (U+0400–052F). These scripts need no shaping beyond what the shaper already does for Latin. Adding a registered script outside this group, `faces`, `styles` or `math` selects the outline workflow instead. Unknown codes and keys fail validation.
- The build runs every case once with Inter's and JetBrains Mono's own letters in those scripts (`vendor/lettering/`, the same releases as the embedded faces, made by `npm run fonts:lettering`). It records which letters each face drew, on stage. It keeps only the letters of the requested scripts, and cuts each face to them with fonttools' subsetter. The page embeds the cuts as WOFF2 in its script, and puts them in place (`useLettering`) before the player draws.
- A requested face joins its family's chain after the embedded face and before the Noto fallbacks, so everything the embedded faces draw looks as it did. Code tries JetBrains Mono's cut, then Inter's: JetBrains Mono has no ῶ, so code draws it in Inter.
- The cuts are pinned beside the scene in `scene.lettering.json`, keyed by the source face's hash and the letters. A build reuses them. When the letters change it cuts again, which needs `pip install fonttools brotli` (or `PYFTSUBSET` set to the path of `pyftsubset`). Commit the file with the scene.
- A letter outside the request still fails every command, as before. So does a combining mark after a letter the embedded faces draw: write the precomposed letter.
- A lettered page's receipt and its `check` report have a `lettering` entry: the scripts and, for each cut, its source, letter count, WOFF2 bytes and SHA-256, plus `pageBytes`, the base64 the page carries. The Greek test fixture's two cuts hold 24 letters in 6,740 bytes of base64.
- An explainer that asks for nothing builds the same page, header recipe and receipt as before lettering on request existed, engine hash included: `src/lettering.ts` counts toward the engine hash only of an explainer that asks. `test/lettering.test.ts` checks opt-out fingerprints, lettering isolation and glyph coverage.
- The subset workflow does not replace faces, shape complex scripts or draw real bold and italic. For those requests and typeset maths, use the [outline workflow](LETTERING.md#supported-requests): `faces` (such as `eb-garamond` for the pen-and-ink style), `styles: ['bold', 'italic']` with `ItalicText` ([bold and italic](LETTERING.md#bold-and-italic)), and `math`. Neither workflow implicitly selects a diagram style's font. Only OFL and Apache-2.0 faces may be embedded, and their notices join the page's licence block automatically.

### Maths

An explainer that sets formulas asks for `math: true`, and draws each one with `MathTex`:

```ts
import { Scene, MathTex } from 'rayner';
import { stage } from 'rayner/explain';

export default class Roots extends Scene {
  static meta = { id: 'roots', title: 'The quadratic formula', lettering: { math: true } };
  override async construct() {
    const s = stage(this);
    await this.step('formula', { title: 'Two roots', caption: 'Both roots of a quadratic, from its three coefficients.' });
    const roots = new MathTex('x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', { display: true, fontSize: 0.6, color: s.palette.ink });
    await s.enter(roots, { describe: 'x equals minus b, plus or minus the square root of b squared minus 4 a c, all over 2 a.' });
  }
}
```

```sh
export RAYNER_MATH_FONT=/path/to/latinmodern-math.otf   # Latin Modern Math 1.959, from CTAN
npm run rayner -- snapshots roots.ts                    # typesets each formula once
npm run rayner -- check roots.ts
```

- `MathTex` is also exported as `Math`. Importing it as `Math` hides JavaScript's `Math` in that file, so prefer `MathTex` or `Math as Formula`. It is a `Text`: it takes `fontSize` (0.4 by default), `color` and the other text options. `display: true` sets display style: limits above and below large operators, full-size fractions.
- `snapshots` typesets each distinct formula once, with `glyph`'s TeX typesetter (`vendor/glyph-math.js`, glyph at `6398654`) on Latin Modern Math. It stores the outlines in `scene.lettering.json`, with a cut of the font to the glyphs drawn, and adds the font's GUST licence to the page's licence block. Capture needs `RAYNER_MATH_FONT` (the file's SHA-256 is checked) and Python with fonttools and brotli ([LETTERING.md](LETTERING.md#capture-check-build)). Commit the file with the scene.
- `check`, `build`, `shots` draw the stored outlines and run no typesetter, and neither does the page. A formula changed without running `snapshots` fails every command with "stale lettering snapshot". `MathTex` without `math: true` fails too.
- The TeX is `glyph`'s subset: scripts and primes; `\frac \dfrac \tfrac \cfrac \binom`; `\sqrt` and `\sqrt[n]`; `\left \middle \right` and `\big` to `\Bigg`; large operators with `\limits` and `\nolimits`; `\sin`, `\lim` and `\operatorname`; accents, `\widehat \widetilde \overline \underline \overbrace \underbrace`; `\overset \underset \stackrel`; `\text`; Greek; about 125 relations, arrows and binary operators, and `\not`; `\mathbb \mathcal \mathfrak \mathbf \mathit \mathrm \mathsf \mathtt \boldsymbol`; spacing and style commands; `matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix cases`.
- Anything else fails `snapshots` with `glyph`'s error and its offset in the source, for example `Math: {"tag":"Tex","error":{"tag":"UnknownCommand","name":"\\color","at":0}}`. Not supported: `\color`, `\phantom`, `\substack`, `\pmod`, `align` and the other multi-line environments, line breaking, and right-to-left maths. Latin Modern Math has no lowercase script letters, so `\mathcal{a}` fails as a missing glyph.
- Morphs: a formula's glyphs are not characters of its source, so `TransformMatchingText` and `TransformMatchingShapes` both pair them by shape. `TransformMatchingText` pairs the longest runs of same-shaped glyphs first, in the order the typesetter lists them (reading order, then fraction bars and radical rules). When a formula grows at the end, every old glyph keeps its place. Glyphs of one shape are interchangeable, whatever their size: swapping `\frac{1}{2}+x^2` to `x^2+\frac{1}{2}` turns the denominator 2 into x's exponent. Inserting `y^2+` into `x^2+\frac{1}{2}` moves x's exponent and its `+` to the new term and grows new ones beside x; the formula still ends right. Use `TransformMatchingText` when terms are added or removed: new glyphs grow inside the formula, so it stays one piece for the motion check. `TransformMatchingShapes` passes when every glyph is matched, as when terms swap places. When glyphs are added, it grows them from outside the formula's box, and `check` reports the formula jumping, as it does for plain `Text`. `Transform` morphs a whole formula into another.
- A kept formula with no `describe` is described as "1 label.", so say it in words.
- An explainer without maths builds the same page and receipt as before. Each formula costs its outlines. The four-step fixture in `test/lettering/math` stores 7 formulas in a 46 KB snapshot (each outline stored once; 90 KB of runs unpacked), with a 4.5 KB font cut, and its page carries 37 KB of that. Its page is 34 KB larger than the same scene drawn as plain `Text` (9.6 KB gzipped). `test/lettering-math.test.ts` compares the stored outlines with upstream `glyph`'s own results (`test/lettering/glyph-math.json`, made by `tools/oracle/glyph-math.ts`), and in Chromium compares the page's paths with Node's at every step.

## Engine output and admission

A new `Text` starts with its advance box centred on the origin, before `moveTo` or another positioning call. Its ink can be asymmetric within that box.

`Scene.add` and `bringToFront` keep a child inside an already visible parent rather than painting it twice. Adding a parent replaces its descendant roots; re-adding a root moves it to the front. `bringToBack` follows the same ownership rule and preserves argument order at the back. `replace` likewise keeps one painted occurrence per descendant and rejects inserting an ancestor into its own descendant.

`toSvgString`, `StringSink` and `SnapshotSink` accept a positive safe-integer pixel `width` (default 1280). There is no 4096px limit on local SVG export. Their `background` accepts `#rgb` or `#rrggbb` and writes lowercase `#rrggbb`; named CSS colours and coercible objects are rejected. Arbitrary paint strings on shapes are escaped as XML data, with characters illegal in XML 1.0 removed. `DomSink` sets its background through the browser's CSS property rather than serializing it into markup.

`shaperFor` accepts exactly the strings `sans` and `mono`. TypeScript's font type does not replace runtime validation for JavaScript callers.

## Stage

```ts
import { stage } from 'rayner/explain';
const s = stage(this, { style: 'nord' });
```

Call `s.reading(before, after)` after drawing a comparison to name the objects that belong together in its phone opening. Pass mobjects (`diagram.root` for a whole diagram), not a box or a description. The helper does not hide other objects or change the authored camera. The planner uses the subjects’ actual painted bounds and label sizes; it keeps them together only when they fit at a readable scale. Smaller implementation labels retain their own close-ups. Intent resets at the next step, so an unchanged picture with a new caption needs a fresh call. An absent or unpainted subject is an error. Served opening claims remain the independent check that the caption’s evidence is complete.

`stage(scene, options)` adds the paper and a heading that follows each step's `title`: a circled step number, the title, and the step's `line` under it. The heading draws over everything, and while the camera is away from home it stays put on screen at its size, over a paper band that zoomed content passes under.

| Option | Effect |
| --- | --- |
| `style` | An Agentic Mermaid style: the stage's palette, and the style of every diagram that names none |
| `direction` | `'ltr'` (default) or `'rtl'`: card field order and the physical halves named by `start`/`end` |
| `palette` | Colours for the stage, for example `palette('dusk')` in a scene with no diagrams |
| `heading` | `'step'` (default), a fixed string, or `false` for no heading |
| `headingSize` | The heading's font size, 0.36 by default; at 0.54 it reads at 12 px on a 390 px page without a close-up |
| `numbered` | A circled step number before the title; on by default when the heading follows the steps |

With neither `style` nor `palette`, the stage adopts the first diagram's palette.

| Member | What it does |
| --- | --- |
| `s.show(spec, { box, build, runTime })` | Draw a diagram and build it in; returns a `Diagram` |
| `s.card(rows, { at, align, width, title, columns, fontSize, direction, enter })` | Labelled values; returns a `Card`. `columns` puts values side by side under headings; `direction` overrides the stage's field order |
| `s.code(lines, { at, align, fontSize, title, diff, enter })` | Code on a panel; returns a `CodeBlock`. With `diff`, lines starting `+ ` or `- ` are marked added or removed |
| `s.note(text, { at, size })` | One line of secondary text, default at `[0, -3.9]` |
| `s.enter(...mobs, { describe, ...fadeOptions })` | Keep native objects and fade them in together, in one play |
| `s.keep(...mobs, { describe })` | Keep native objects without animating them; returns the first |
| `s.clearOverlays()` | Fade out cards, code, notes (the stage's and the diagrams') and kept objects |
| `s.clear({ runTime })` | Fade out everything except paper and heading, and bring the camera home, in one play |
| `s.focus(target \| 'all', { margin, runTime, exact, with })` | Move the camera so a mobject, mobjects or a box fill the stage below the heading, with `margin`; `'all'` goes home. Never zooms out past the stage or shows beyond its edges. `exact: true` takes a 16:9 box as the view as it is; `with` plays other animations in the same play |
| `s.carry(m, to, { runTime })` | Glide a kept object to a point, or into a box or region it is shrunk to fit (never enlarged): carry an idea on instead of clearing it |
| `s.draw(m, { tool, color, runTime, describe })` | Draw `m` stroke by stroke at an even speed with a `'pen'` or `'pencil'` riding the tip (`false` for none), and keep it. Between strokes the tool travels at drawing speed, so it never jumps. `m` must not be on stage yet |
| `s.dimension(a, b, label, { offset, color, size })` | A dimension line from `a` to `b` with ticks, arrowheads and `label`, set off by `offset`; drawn in and kept |
| `s.pin(at, { label, color, size })` | A pin stuck in at `at`, with an optional label |
| `s.callout(target, text, { side, gap, color, size })` | Words beside a point, box or mobject, with a leader line ending in a dot on its nearest edge |
| `s.emphasis`, `s.soft`, `s.good`, `s.bad` | Colours that read on this paper: emphasis, secondary text, accepted, rejected |
| `s.palette`, `s.paper`, `s.heading` | The current palette, paper rectangle and heading text |

Annotations say a value where it is. Prefer a dimension, pin or callout on the drawing to a card beside it, and `carry` to `clear` when the next step builds on this one.

`{ enter: false }` creates a card or code panel without playing it, so `s.enter(card, code)` can bring several in together.

`describe` says in words what kept objects show together: a sentence, or a function for a drawing that changes. Without it, the description lists their visible text, and `check` fails a kept drawing that has no text.

Emphasis is the style's accent, or orange for styles whose accent is grey or near-black (hand-drawn, pen-and-ink, blueprint). `s.soft` keeps at least 4.5:1 contrast with the paper.

### Card and CodeBlock

| Method | What it does |
| --- | --- |
| `card.set({ Label: value })` | Crossfade changed values; unchanged values stay still. A row with a value per column takes an array, `{ Hits: [0, 3] }`. A card sizes to its first values, so pass `width` if later ones are longer; a wider card gives its columns the spare room |
| `card.mark(label \| null, { as })` | A bar on one row that stays until moved |
| `code.focus(i \| [a, b] \| null, { as })` | A bar on zero-based line `i`, or lines `a` to `b` inclusive |
| `code.morph(next, { markAdded })` | Pair lines by text: survivors move, removed lines fade, added lines arrive, marked if `markAdded` |
| `code.clearMarks()` | Fade out the added and removed bars |

`as` is the word the description gives the mark, such as `'rejected'`. Both are native `Group`s.

`columns` lays values side by side under headings, so a phone close-up of one card shows a comparison whole:

```ts
const card = await s.card([['Requests', 'A B C D'], ['Evicted', 'A', 'C'], ['Hits', 0, 0]], { columns: ['LRU', 'MRU'], width: 6.8 });
await card.set({ Hits: [0, 3] });
```

A row gives one value per column, or one value that spans them all (Requests above). The headings sit above the first row with a value per column. `mark` lights the whole row. The description names each value by its row and column, "Hits (MRU): 3". `card.cells` holds each row's values; `card.values` keeps each row's last one. The [LRU/MRU tutorial scene](../scenes/tutorial/lru-mru/scene.ts) uses one.

### Spatial direction

```ts
const s = stage(this, { direction: 'rtl' });
await s.card([['Count', 123]], { at: 'start' });
await s.card([['Count', 123]], { at: 'end', direction: 'ltr' });
```

In an RTL stage, the first card goes on the right, with its label on the right and its value on the left. The second goes on the left, where its override puts the label on the left and the value on the right. Values such as `123` retain their digit order. Titles follow the label's edge; rows retain their authored top-to-bottom order. Updates and marks keep those positions.

Stage direction controls spatial placement separately from paragraph shaping. A Hebrew or Arabic paragraph can read right to left in an LTR card. A code panel placed at `start` moves with the region, while its code keeps its source order. Set Mermaid graph flow in its source (`graph RL`, for example); stage direction never rewrites or mirrors a diagram. The [layout-direction example](../scenes/explainers/layout-direction/scene.ts) shows both card orders together.

### Regions

Stage coordinates are 16 × 9 with the origin at the centre and y up. The heading sits at y = 3.8 (3.98 with a line, which sits under it); content belongs below y = 3.25, and `check` fails text that runs into the heading's number or line. Panel `at` accepts a region, point `[x, y]` or box `[minX, minY, maxX, maxY]`; diagram `box` accepts a region or box.

| Region | Box |
| --- | --- |
| `full` | `[-7.55, -4.25, 7.55, 3.25]` |
| `left`, `right` | the halves of `full` |
| `start`, `end` | Stage helper aliases for `left`/`right` in LTR; `right`/`left` in RTL |
| `main`, `side` | about two thirds left and one third right: a diagram beside a card or code |
| `top` | `[-7.55, -0.35, 7.55, 3.25]` |
| `bottom` | `[-7.55, -4.25, 7.55, -0.65]` |

`regionBox(region, { left, right, top, bottom })` returns a copy with those edges moved: `regionBox('top', { bottom: 1 })` is a shorter top, `regionBox('full', { left: -2.75 })` a column on the right. `REGIONS` holds the boxes.

Logical aliases work in `s.card` and `s.code` placement, `s.show`'s box and `s.carry`'s destination. The exported `StageRegion` type includes them. `regionBox`, direct panel constructors and physical names such as `left`, `right`, `main` and `side` keep fixed coordinates. Numeric points and boxes also stay fixed. A card's own direction override changes its fields; the stage's direction still resolves its region. `Text.anchor: 'start'` remains the physical left edge of its advance box.

## Diagrams

```ts
const d = await s.show({ source: 'graph LR\nA --> B', style: 'nord' }, { box: 'main', build: 'frame' });
```

The diagram spec accepts `lettering: 'natural'` to measure the active requested faces before layout and preserve label proportions. Without it, labels fit the captured widths. Natural capture uses Agentic Mermaid's public host-measurement hook; the snapshot records the font and measurement identity. Refresh with `rayner snapshots scene.ts` after changing the face, requested cuts or measurement inputs. [Diagram measurements](LETTERING.md#diagram-measurements) covers setup and compatibility.

`build: 'frame'` draws only the scaffolding (axes, lanes, lifelines) so the story can arrive with `reveal`.

| Method | What it does |
| --- | --- |
| `d.reveal(n \| ids \| 'rest')` | Bring in the next `n` parts in reading order, named parts, or the rest |
| `d.walk(hops, { trail, parallel, color })` | A token travels real links; `trail` leaves them marked; `parallel` runs several journeys in one play |
| `d.mark(ids, { color, as })`, `d.unmark(ids?)` | Colour parts and thicken their outlines until unmarked; labels keep their ink; `as` names the mark in the description |
| `d.dim(keep \| null)` | Fade everything but `keep`, links between kept parts and scaffolding; `null` restores. Dimmed parts keep 3:1 contrast with the paper |
| `d.note(id, text, { side })` | A short label beside a part at a fixed readable size; `side` is `above`, `below`, `left` or `right` |
| `d.clearNotes()` | Remove notes |
| `d.focus(ids \| 'all', { zoom, camera, margin, also })` | Enlarge parts and their notes inside the diagram's own box (`zoom` above 1 goes closer). With `camera: true`, move the camera (`this.frame`) onto them and the native objects in `also` instead, with `margin` units around them (default 0.5); `also` needs `camera`. `'all'` puts the artwork back and brings the camera home. Parts in focus are described as focused |
| `d.morph(next, { ops })` | Same-id parts move, arrivals fade in, departures fade out; marks, dimming and notes reset |
| `d.hide()` | Fade the diagram out; `reveal` can bring parts back |
| `d.get(id)` | A part as a native `Group` |
| `d.findings()` | The verifier's warnings, each with the `part` it names |

- Parts have semantic ids. Graph nodes use their Mermaid id. A bare name also finds a sequence participant (`actor:A`), a class (`class:Name`), an ER entity (`entity:Name`), or an architecture service, junction or group. Other ids look like `edge:A->B#0`, `bar:0:Jan` or `message:A->B#0`; read `d.parts` or the snapshot to find them.
- Reading order: graphs read nodes with their outgoing links, sequence messages keep source order and carry a token, git commits read left to right, bars grow from the baseline. Scaffolding builds first. Labels travel with their owners.
- `walk` throws on a hop the diagram does not have, requires the link to be revealed, follows its captured route, and records `{ step, from, to, edge }` in `state.walks`.
- With `ops`, `morph` replays the edits through Agentic Mermaid's `mutate` at build time and fails unless the result serializes to `next`. Without `ops` it is a visual transition only.
- A camera focus moves no point, so marks, dimming, notes and walks work the same while zoomed, and a label keeps its world size while the camera enlarges it on screen. The view stays 16:9 and inside the stage. The camera shows less of the stage, not only less of the diagram: the heading, cards and code are world objects too, so a focus that leaves them out of its box takes them out of view. Put what the resting picture needs inside the box (`also`), or end the step with `focus('all')`. The default, artwork focus, is for a diagram that shares the stage with text beside it (send-sync, gtfs, fork).
- One scene owns one clock: never call `Scene.play()` concurrently. Use `{ parallel: true }` or one native `play` for simultaneous tokens.
- Descriptions name a link by the labels at its ends ("Attacker → Load balancer"), and a class or ER entity by its name.
- The collection uses all 15 families. Captured diagrams use the 8 styles listed in `out/explainers/evidence.json` (the build's per-explainer list of families and styles, not step evidence); ring-buffer (dusk), seasons (tokyo-night) and token-bucket (github-dark) use a style only as the stage palette. Other styles are untested.

### State machines and graphs

Write a state machine, statechart or graph as Mermaid source and draw it with `s.show`, rather than placing boxes and arrows by hand. Agentic Mermaid lays it out and routes connectors clear of labels, and the checks verify the result like any other diagram.

```ts
const d = await s.show({ source: `stateDiagram-v2
  direction TB
  off --> on: POWER_ON
  state on {
    direction LR
    [*] --> idle
    idle --> brewing: START
    brewing --> ready: BREWED
    ready --> idle: TAKE
  }
  on --> off: POWER_OFF` }, { box: 'full' });
await d.walk([['off', 'on'], ['on_start', 'idle'], ['idle', 'brewing']], { trail: true });
```

- A composite `state on { … }` is a box with its name in a header. Its part id is `group:on`, and `'on'` finds it. A transition to or from the composite (`on --> off`) attaches to its border.
- `--` inside a composite splits it into concurrent regions, with a dashed line between them.
- `[*]` draws a start dot or an end state. Its id is `_start` (or `_end`) at the top level, `on_start` inside `on`, and `on__r2_start` in the second region of `on`. Descriptions call it "start of on, region 2". Read `d.parts` or the snapshot for other ids.
- `mark`, `walk`, `note` and `dim` work on composites and their contents. Marking `on` fills its whole box. `dim(['on'])` keeps everything drawn inside `on` and fades the rest. `walk` follows real links only. An event that a child leaves to its parent is the parent's link (`on → off`), not a link from the child.
- A morph keeps every part whose id survives, so a composite and its states keep their identity. With `ops`, use Agentic Mermaid's state edits (`add_state`, `add_transition`, `remove_transition`, `make_composite`, `move_state` and others). The build replays them and requires the result to serialize to the next source. That source must include any state the edits declare explicitly, such as `off` once its last transition is removed. Agentic Mermaid 0.5.1 has no edit that adds a concurrency region, and it refuses `make_composite` after a `remove_transition` in the same list. Put `make_composite` first, or morph without `ops`, which is a visual transition only.
- Size the chart for the stage. Mermaid sets state names at 12 px and transition labels a little smaller, and `check` needs imported labels to reach 14 px at 1280 px. In the `full` region, that means the chart must lay out within about 930 × 460 of its own pixels. Set `direction` for the chart and again inside each composite to fit it: an outer `TB` with an inner `LR` cycle, or an outer `LR` with regions stacked by an inner `TB`. A four-state cycle in a row beside a second region does not fit. Split it across steps, or focus the camera on part of it.

Hand drawing is still justified when position itself carries meaning that a layout engine cannot keep. Examples are states that hold their grid cell while a flat machine becomes regions (the statecharts explainer), panels that must align so they can be compared, or a keyed `view` whose positions come from a model.

## Engine features

These are the engine's own features, imported from `rayner` and used beside the helpers. Each guide explains one feature and ends with "In the explainers", what the scenes named here do with it; [the engine map](ENGINE.md) lists the guides by module. What you draw with them is a native drawing: keep it with `s.keep` or `s.enter`, with `describe` when it has no text of its own ([stage](#stage)).

| Feature | What a scene uses | Guide | Used by |
| --- | --- | --- | --- |
| Matching transforms | `TransformMatchingText`, `TransformMatchingShapes` (`shapeKey()`), `TransformMatching` with your own key; `summary()`, `pairs`, `removed`, `added` | [Matching](MATCHING.md) | `feature-tour` (basic text), `glyph`, `exgit`; no explainer yet: `TransformMatching` with your own key |
| Diff-driven code morph | `new TransformDiff(before, after, { hunks })` and its `plan`; `diffLines`, `parseUnifiedDiff` for hunks | [Diff-driven](MATCHING.md#diff-driven) | `mr-cache`; no explainer yet: the `hunks` option, `diffLines`, `diffTokens`, `parseUnifiedDiff`, `hunkHeader` |
| Camera | `this.frame.animate.fit(...)`, `.reset()`; `d.focus(…, { camera: true })` | [Camera](CAMERA.md) | `feature-tour` (`s.focus`), `seasons`; `lantern`'s diagram focus with `also` |
| Emphasis that stays | `SurroundingRectangle`, `Underline`, `Cross`, `Brace`, `BraceLabel`, `Circumscribe({ keep: true })` | [Emphasis](EMPHASIS.md) | `feature-tour` (`Circumscribe`), `glyph`, `mr-cache`, `state-machine`, `ring-buffer`, `exgit` (`Underline`: `glyph` only); no explainer yet: a bare `Brace`, `tip()`, `putAtTip()` |
| Charts of the model's numbers | `NumberLine`, `Axes` with `plot`, `lineGraph`, `bar`, `dot`, guide lines, `areaUnder` | [Graphing](GRAPHING.md) | `feature-tour`, `seasons` (`plot`), `token-bucket` (`lineGraph`); no explainer yet: `bar`, `areaUnder`, a standalone `NumberLine` |
| Pictures rebuilt from state | `view`, `stateView`, `view.sync()`; `viewMismatch`, and `assertViewFollowsState` in `test/lib/view-fidelity.ts` | [Views](VIEWS.md) | `feature-tour`, `state-machine`, `ring-buffer` (`view`), `token-bucket` (`stateView`); no explainer yet: `viewMismatch`, which the tests call through `assertViewFollowsState` |
| Parts of a line of code | `code.span`, `code.token`, `code.lineSpan`; `new Code(lines, { spans })` with spans from `tools/tokens.ts` | [Code](CODE.md) | `mr-cache` (`spans`), `state-machine` (`code.span`, `code.token`); no explainer yet: `code.lineSpan` |
| Restore, copies, sequencing | `saveState()` and `Restore`, `TransformFromCopy`, `Succession` | [Animations](ANIMATIONS.md) | `feature-tour` (`saveState`, `Restore`), `state-machine` (`saveState`, `Restore`, `Succession`), `ring-buffer` and `exgit` (`TransformFromCopy`), `ring-buffer` and `token-bucket` (`Succession`); no explainer yet: `restore()` |

Patterns these scenes write by hand, candidates for `explain/` once two explainers use one and its shape settles: a `Succession` member that writes `scene.state` when its turn comes, so the syncs after it show that operation; card and code-focus changes returned as animations rather than played, so they can join a `Succession`; a `Card` whose values are a view; a `stateView` in the stage's palette; a camera box that keeps the heading out; reading recorded evidence for counts on screen; lines between a matching transform's pairs; a code panel that leaves its `Code` loose for `TransformDiff`, which replaces it.

### Optional score audio

A step may supply `audio: {clips}`. Each clip has an `id`, an accessible `label`, `bpm`, `beats` and `notes`. A note has a MIDI `midi` number, an onset `at` and a `duration`, both in beats. Exported types are `ScoreNote`, `AudioClip` and `StepAudio` from `rayner/explain`.

```ts
await this.step('listen', {
  title: 'The same pitch on two beats',
  caption: 'Both notes play middle C. The second starts one beat later.',
  audio: {clips: [{
    id: 'a', label: 'Two middle Cs', bpm: 96, beats: 2,
    notes: [{midi: 60, at: 0, duration: 0.8}, {midi: 60, at: 1, duration: 0.8}],
    plot: [-6, -2, 6, 2],
  }]},
});
```

`plot` is optional: `[left, bottom, right, top]` in scene coordinates. When present, a playhead travels from left to right over the clip’s full beat count. Draw notes from the same score data: horizontal position follows onset and width follows duration. The [melody and rhythm scene](../scenes/explainers/melody-rhythm/scene.ts) does this for two piano rolls.

The audio controls sit immediately below the picture, are in English and are marked `lang="en"`. Play brings the score and controls into view together when the screen can hold them. Each button’s accessible name includes its visible Play label and the clip’s description.

The reader synthesizes triangle-wave notes locally with Web Audio. Simultaneous notes share the monophonic gain to leave headroom for Pulse. Sound starts only after Play. Stop, a step or case change, Replay, and hiding or leaving the page cancel playback. Pulse adds a beat reference; changing it stops the current clip. Pages without audio omit this module and its styles. Captions and scores remain available without audio support; sound never advances the explanation.

Builds reject malformed clips: use one to four distinct lowercase ids, nonempty labels, 40–240 BPM, at most 64 beats and at most 256 notes per clip. MIDI pitches are integers from 0 to 127; every note must start at or after zero, have positive duration and end within the clip. Plot coordinates must be finite with positive width and height.

## Settings

```ts
static settings = [{
  id: 'request', label: 'Follow a request', default: 'hit',
  options: [{ value: 'hit', label: 'Cache hit' }, { value: 'miss', label: 'Cache miss' }],
}];
const which = settingsOf(this).request;
```

Every case is built ahead of time; run `check` or `review` to validate every case before publishing. A scene may have at most 64. Ids are URL-safe (`[A-Za-z][A-Za-z0-9_-]*`) and distinct; `step`, `theme` and `parentOrigin` are reserved. Option values are unique and include the default. A setting may change diagrams, captions, numbers and which steps exist; keep the palette fixed. By default a case switch stays on the same named step (or falls back to the first when the new case lacks it). For a recipe-first catalog, set `static meta = { ..., caseNavigation: 'first' }`: switching cases opens the first step and the transcript links to each case's first step. Direct `?step=` links, including later steps, still work.

Other exports: `withSettings(Scene, values)` binds a case without mutating the class; `resolveSettings` validates; `variantsOf(Scene)` lists every case; `caseName(Scene, values)` gives "Label: option · Label: option"; `bindSnapshots(Scene, store)` binds a snapshot store.

## Describe

`describeExplainer(Scene, { snapshots?, drawings? })`, from `rayner/explain`, returns the explainer as one JSON-safe object for agents and tools: `schema` (1), `id`, `title`, `lang`, `sources`, `settings`, `answer` and `checks` when the scene declares them, and `cases`. Each case has its setting `values`, its `name` ("Label: option"), its `duration`, its `paper` (the stage's paper colour when the case ends, absent for a scene without a stage) and its `steps`. Each step has its `step` name, `title`, `caption`, `start`, `end` and `hold` in seconds, the `state` the scene recorded (`scene.state` when the step ends), `changed` (each value the step changed, as `{ before, after }`, with a side left out when the value was not set), `watched` when the scene declares [`meta.watch`](#scene) (the step's watched changes as the player shows them, `{ label, before?, after? }` formatted strings, at most four), the resting `picture` in words, and its `drawing` as text unless `drawings: false`. `drawings: 'name'` draws only the step of that name, which is how `rayner see` draws the one step it prints.

It runs the scene once per case, in Node or a browser, with no Chromium. A scene with diagrams needs its pinned snapshots (`snapshots`, as `rayner` reads them from `scene.snapshots/`) or it throws. `rayner describe <scene>` prints the same object; `--out file.json` writes it. Diagram labels are outlines, so the text drawing shows them as strokes; their words are in `picture`.

In a script, load the snapshots from `scene.snapshots/` (`index.json` names each diagram's file) and walk the cases and steps. This prints each step's caption and the state keys it changed:

```ts
import { readFile } from 'node:fs/promises';
import { describeExplainer } from 'rayner/explain';
import type { SnapshotStore } from 'rayner/explain';
import Scene from './my-explainer/scene.ts';

const folder = new URL('./my-explainer/scene.snapshots/', import.meta.url);
const index = JSON.parse(await readFile(new URL('index.json', folder), 'utf8'));
const snapshots: SnapshotStore = {};
for (const [key, file] of Object.entries<string>(index.diagrams))
  snapshots[key] = JSON.parse(await readFile(new URL(file, folder), 'utf8'));

const d = await describeExplainer(Scene, { snapshots });
for (const c of d.cases)
  for (const s of c.steps)
    console.log(`${c.name || d.title} · ${s.step}: ${s.caption}\n  changed: ${Object.keys(s.changed).join(', ') || 'nothing'}`);
```

`npm run pack:smoke` runs this block against the packed package. `rayner see <scene> [step]` prints one step of the same description for a person at a terminal. `npm run site:export` publishes the description beside each page as `<id>.json`, and lists every explainer in `llms.txt` at the site root.

## Snapshots

Every command except `init` runs every case, captures any diagram missing from `scene.snapshots/` beside the scene, and deletes unused ones; `rayner snapshots` stops there. Commit the folder; `index.json` maps each diagram's key to its own file. A change to the capture code invalidates the whole cache; `--refresh` recaptures everything. Capture needs Chromium and the authoring packages listed in [the README](../README.md#requirements).

Capture asserts that its output equals Agentic Mermaid's `renderMermaidSVG` byte for byte, and fails on SVG it cannot convert (unsupported paint, masks, filters). Chromium resolves CSS, transforms and markers at build time with network requests blocked. The page receives resolved geometry and text runs; it never runs Agentic Mermaid.

## Checks

`rayner check` runs every case and fails on:

| Check | Rule |
| --- | --- |
| Catch lint | A `try`/`catch` or `.catch()` around awaited code in `construct()` |
| Motion | Any pop (opacity changes by 0.5 or more in a frame), cut-in or cut-out, teleport or resize spike, flicker, or misplaced handoff |
| Hold | The picture changes after a step's caption hold begins, where the player stops |
| Seek | A seeked frame differs from the played frame, at two frames per step |
| Trace | The trace with frames skipped differs from the played trace |
| Step change | A step's resting picture, ignoring the heading, equals the previous step's. The camera's view is part of the picture, so a camera move alone is a change |
| Text | Native text in a resting picture overlaps other text, runs into the heading's number or line, or is cut by the stage edge or the edge of the camera's view; text wholly outside the view is off screen and not judged |
| Routes over labels | A visible native or imported connector crosses label ink, accounting for stroke width, paint order, genuine endpoint attachments, camera and descendant clips; an opaque label plate counts only where it actually covers the crossing |
| Legibility | A native label never reaches 14 px at a 1280 px stage in a frame where it is drawn (opacity and draw fraction at least 0.95) and inside the camera's view; an imported label never reaches 14 px in a resting picture inside its diagram's viewport. Sizes are on screen: world size × the camera's zoom, min(16 ÷ view width, 9 ÷ view height). A native label counts at that zoomed size only in a step's completed frame; in other frames it counts at no more than its size with the camera home, so a camera gliding past does not make it read |
| Words | A kept drawing with no text and no `describe` |
| Bare runtime | The scene, bundled, gives different steps or state in a context with no DOM, Node, timers or console |
| Glyphs | Any text the embedded fonts, and the lettering the explainer asked for, cannot draw (every command checks this) |

The report goes to `out/checks/<id>/report.json`. For each case it holds the full step trace, each step's resting picture as a rough text drawing (`restingFrames`: boxes and lines, with diagram labels as bars), and label sizes (`legibility`):

| Field | Measure |
| --- | --- |
| `minLabelPx1280` | Smallest label on a 1280 px stage |
| `minLabelPx390`, `labelsUnder12PxAt390` | Smallest label, and labels under 12 px, in each step's phone close-up (see [controls](#controls-and-accessibility)) on a 390 px page, whose stage is 358 px wide |
| `labelsOutsideCloseUpsAt390` | Labels no close-up shows whole, which a reader reaches by panning |
| `minLabelPx390WholeStage` | Smallest label on that phone without close-ups |

A picture label that no close-up shows whole is measured at the step's opening zoom, where a reader panning to it finds it. The stage's heading (number, title and line) is measured only in the close-ups that show it. Close-ups keep below it, and on a narrow stage the player sets the step's number, title and line as page text above the stage. A drawing can therefore fill the stage: its labels may be larger than the heading's line without the line counting against them. A step that opens on the whole picture shows the heading at the stage's own scale, and there it is measured.

`watch`, for a scene that declares [`meta.watch`](#scene), gives each step's formatted changes (`{ step, changes, unformatted }`), where `unformatted` names the watched keys skipped because their value cannot be said briefly. It is reported, not gated.

`script` is the script gate: `answer` (the teaching step that first states [`meta.answer`](#scene), as `{ step, at }`, or null), `checks` (how many questions the page asks after its last step), `missing` (`answer`, `checks` or both when undeclared) and `problems`. A declared answer that no step states fails `check`; where a stated one first appears is reported, not gated; an undeclared one is reported as missing.

The phone sizes are reported, not gated; every demo case reports no label under 12 px. A close-up zooms on top of the author's camera, so its sizes multiply the camera zoom by the close-up's.

Motion is measured on screen, after the camera: a smooth camera move reports nothing, and moving `this.frame` without `.animate` (a cut) reports a teleport for everything in view. A shape that appears over a shape that stays and is no less opaque is not a cut-in when it is a `TransformFromCopy` copy of that shape, or when every shown part of it has the same outline (`shapeKey()`) and the same fill and stroke presence as a part of the staying one. A brighter shape over a faint one, a filled shape popping inside an outline, a hand-made `Transform(t.copy(), other)` that changes glyph shapes on its first frame, and a shape appearing elsewhere are cut-ins.

These checks establish deterministic behaviour and readable pictures. They do not establish that a caption is true: test each model against its source.

## Command line

### Reader review

`rayner review scene.ts` runs `check`, builds a temporary page and visits every resting step of every settings case at 390 and 1180 px in Chromium. It checks actual painted subjects, caption text, complete close-up tours, page overflow, console errors and outside connections. It retains the reviewed `scene.html`, its receipt, header recipe and `loader.js` alongside screenshots and `review.json` under `out/review/<id>/`. `--out <directory>` changes that directory; `--out public/example.html` saves the exact reviewed page there while keeping review reports in the default directory. A failed run removes the success receipt and preserves the previously reviewed page.

Main steps with independent opening claims additionally open fresh at 320×568. Their claimed subjects must be complete in that first view, with labels at least 12 CSS pixels high. The receipt records those checks and names excluded steps; detailed source tours still use the full two-width review.

Helpers supply subjects automatically. For an important caption claim or a step with unchanged artwork, add `scene.review.json` beside `scene.ts`:

```json
{
  "version": 1,
  "claims": [
    {
      "step": "request",
      "settings": { "request": "hit" },
      "opening": true,
      "targets": [{ "key": "Cache" }, { "text": "Database reads" }]
    }
  ]
}
```

`settings` selects cases and may be omitted. `opening: true` requires the subjects in the initial view; otherwise the close-up tour must cover them. Each target names a semantic `key` or exact label `text`; `paint: "stroke"` requires route ink, so an arrow's label alone cannot satisfy the claim. Unknown cases, missing steps and missing subjects fail. `--claims <file>` selects another claim file. Write expectations from the explanation's meaning, independently of the close-up planner. These checks cannot establish that arbitrary prose or a model is true.

Removing a callout can reveal background ink and make it part of the automatic changed-artwork inference. Name the caption's actual comparison with `s.reading(...)` and independent companion claims. Include earlier evidence that the comparison still needs, such as June's daylight span beside December's. Give repeated labels scoped keys so a field inside a result card can be distinguished from the same words in its context diagram.

The collection reviewer combines each scene's companion claims with the built-in catalog claims. Parallel receipts include the companion files in their review fingerprint, so an older review cannot satisfy changed expectations. For a highlighted cell or boundary, name the outline's key with `paint: "stroke"`; checking its label does not prove that the outline exists.

`rayner <command> <scene.ts | directory> [options]`. In a checkout, run `npm run rayner -- <command> ...`. `rayner --help` prints the commands and Chromium setup instructions.

| Command | What it does |
| --- | --- |
| `init <directory>` | Write the tutorial's explainer: `scene.ts` with one setting, its model `model.ts`, and `model.test.ts`, which tests the model against published examples |
| `preview <scene>` | Build and serve the page; use `shots` for a contact sheet |
| `snapshots <scene>` | Capture and verify diagrams; replay morph edits |
| `check <scene>` | The checks above |
| `review <scene>` | The checks, then [served-reader review](#reader-review) of every case and step at both widths |
| `build <scene>` | The page, its receipt, its header recipe and `loader.js` |
| `shots <scene>` | A contact sheet of every step, as SVG and PNG |
| `describe <scene>` | [`describeExplainer`](#describe) as JSON: every case and step, with words, state, what changed and the picture in words and as text |
| `see <scene> [step]` | One step of [`describeExplainer`](#describe)'s description: its resting picture drawn as text, then its title, caption, the picture in words and what it changed in `scene.state` (`key: before → after`). The last step by default; needs no browser, so an agent can read a scene from a terminal |

| Option | Applies to | Effect |
| --- | --- | --- |
| `--out <path>` | all but `init` and `snapshots` | The output file; for `check`, the report's directory; for `review`, a report directory or an `.html` destination; for `see`, the resting picture as SVG (nothing is written without it). Defaults under `out/` in the current directory |
| `--refresh` | all but `init` | Recapture every diagram |
| `--case id=value` | `shots`, `see` | One case; repeat for several settings |
| `--port <n>` | `preview` | Default 5174 |
| `--watch` | `preview` | Rebuild the page when a source file changes; reload the browser to see it |

`CHROMIUM_EXECUTABLE_PATH` selects a Chromium for capture; otherwise it is looked up in `PLAYWRIGHT_BROWSERS_PATH` and Playwright's cache. If an authoring package is missing, the command prints the line that installs it.

`node tools/tokens.ts <file | -> [--lang ts|js|python|bash|elixir] [--theme dark|light] [--engine auto|shiki|fallback]` prints syntax colours as `ColorSpan`s for `new Code(lines, { spans })`, to check in beside the scene. It runs from a checkout and is not part of the package; [the code guide](CODE.md#the-tool) describes its engines.

## Page

`build` writes one self-contained HTML file: one explainer, all its cases, a poster, a transcript, sources and licence notices. It makes no network requests and uses no storage.

Diagram payloads are compressed losslessly inside the page and decoded with the browser’s native `DecompressionStream` API before the player starts. The transcript remains readable without JavaScript. Builds enforce limits of 1.5 MiB for raw HTML and 450 KiB for its gzip representation, including the poster and transcript. Receipts report `bytes` and `gzipBytes`. Reduce cases or split an explanation that exceeds either budget.

The transcript lists, for every case, each step as a link to it, its caption, a "What changed: Label: before → after; …" line when the scene declares [`meta.watch`](#scene) and the step changes a watched value, and what its resting picture shows. Without JavaScript every case shows. The player shows the current case's section, and its links move the player.

### URL parameters

| Parameter | Effect |
| --- | --- |
| `step=<name>` | Open at that step's resting picture |
| `<setting id>=<value>` | Choose a case; missing settings use defaults |
| `theme=light\|dark\|auto` | Player chrome only; default `auto`, the device's scheme. The loader passes the host page's scheme |
| `parentOrigin=<origin>` | Set by the loader; the exact HTTP(S) origin that receives resize and step messages and may send goto messages |

An unknown setting or value resets every setting to its default, and a notice names what was wrong. A step the case lacks opens the first step, with a notice. Switching cases keeps the step by name. Back and forward restore case and step. Copy link keeps case and step and drops `parentOrigin`. On a page `site:export --origin` published, which carries `<meta name="rayner:share">`, Copy link on a step of the default case gives that step's share page, `<origin><path>/<id>/<step>`, whose link preview is the step; another case, or a step whose name is not letters, digits, `-` and `_`, keeps `?step=`. A share link drops `theme`.

### The tile

The explainer is one tile. Everything the page shows is inside one bounded object with one edge and one surface: the card's header (the title, the page's one `h1`, and the case picker) over a rule, the stage mounted under it, the stepper row, the step's words, then closed rows for the steps (on a narrow page) and the transcript, and a footer. By default, on a page at least 1100 px wide the steps rail is the tile's second pane, behind a rule that runs the tile's height; its list stays in view as the page scrolls. The footer holds the Rayner mark, linking to the project, and, inside any frame, **Open the explainer**, which opens the page at the reader's step and case in a new tab. Nothing is drawn over the stage. Outside the tile a standalone page has only its background. The player defaults to neutral greys with an ink primary action. Opt in on one explainer with `static meta = { …, player: { accent: true, paper: true, corners: 'square', minStageWidth: 880 } }`. All fields are optional: `accent` takes the current case's stage palette accent; `paper` uses its paper for the page and tile surface (replacing the former automatic 10% tint); `corners` is `'rounded'` (default) or `'square'`. Without a stage, colour cues stay neutral.

`minStageWidth` sets a standalone page's preferred minimum stage width in CSS pixels, including in **Enlarge**. Only positive, finite numbers take effect; values above 4096 are capped. The floor stays within the available page width without horizontal scrolling, and stages below 600 px retain their close-ups. Above the default 1100 px breakpoint, the steps list stays below the card until the content area can hold the floor plus its 300 px rail. An 880 px floor needs 1180 px of content width, with additional room for page padding and scrollbar space. Wide standalone pages that opt in reserve native scrollbar space so opening content cannot make the rail repeatedly switch positions. The setting is written into that page's hashed stylesheet; pages without it retain their existing sizing, and raw iframes and loader embeds retain host-driven sizing. A short standalone window may need scrolling to reach **Next**. For example, periodic-groups opts into 880 px to keep its smallest full-table labels at least 12 px at 1280×720 and 1366×768; this does not guarantee legibility at every viewport width.

Colour cues accept opaque hex colours only. Each theme checks them independently: paper must retain text 7:1, secondary text 4.5:1 and the neutral accent 3:1; accent must reach 4.5:1 against the page, tile and its button text (it also colours small links). A rejected cue uses that theme's neutral default. A light palette will usually fall back in dark mode; an explicit `?theme=light` or `?theme=dark`, including in a frame, selects the matching checked cues. The build writes the default case's cues into the CSP-hashed stylesheet; case changes update the same custom properties. These cues affect only that explainer page. Each case's paper is in its [description](#describe) as `paper`.

### Controls and accessibility

The player keeps the title, picture, navigation and explanation in one card. **Next** plays a step and stops on its resting picture. Previous returns to the preceding step; a step-bar segment opens its named step. The bar counts teaching steps, not elapsed time. Implementation notes remain under **Details and sources** and retain direct links.

Next stays above the prose so caption length does not move it. The current step's number, title and line lead into its caption in normal flow. On phones, zoom, copy-link and fullscreen tools follow the explanation; on wider pages they sit beside Next. Score audio controls remain immediately below their picture. The stage is keyboard-focusable, names its current subject and exposes a picture description. During playback it is marked `aria-busy`.

Cases appear beside the title. By default, the step list is a side rail at widths of at least 1100 px and a closed **All n steps** disclosure below the words otherwise. A standalone width floor can defer the rail until it fits beside the picture. The transcript retains every case, including when JavaScript is unavailable.

A scene with [`meta.watch`](#scene) shows its named state changes below the caption as “Label: before → after.” Empty change rows are hidden. Headings and captions use their natural height; they do not reserve space for another step's longer prose. On a standalone page the stage's height cap leaves room for the header, the stepper row, the step heading and the first two lines of the caption, so a reader at 1280 × 800 or 1366 × 768 sees the picture and the start of what it means without scrolling.

The steps rail and the step bar name a teaching step only once the reader has reached it, or a later step: until then the rail shows its number ("Step 4") without its line, and its bar segment is named "Step 4 of 10". A later title such as "Answer: …" therefore cannot answer an earlier question. Reached steps stay named across cases, by step name. A scene whose rail is a reference outline rather than a sequence of questions can show every title from the start with `static meta = { …, player: { outline: true } }`.

A scene with [`meta.checks`](#scene) asks them after its last teaching step, under the caption: “Check yourself”, each question, and its answer behind **Show the answer**.

At the last resting step, Next becomes **Start again**. A scene with settings also offers **Try ‘Option’**, which opens the next option of its first setting from step one. On phones this secondary action sits with the tools after the explanation. The right-arrow key does nothing at the end.


Previous, Next, Zoom in, Zoom out and Whole picture name their key in their tooltip ("Next step (→)") and in `aria-keyshortcuts`. The footer carries one quiet, permanent line between the mark and the way out: "← → to step · click a segment to jump" on a fine pointer, "Tap a segment to jump; tap the current one to finish it" on a coarse one, chosen by `matchMedia('(pointer: coarse)')` and followed as it changes. The page stores nothing, so the hint is never dismissed; it wraps on a narrow card and is hidden at 360 px and under.

The steps rail shows words only. Pictures of each step, drawn in the reader's browser in idle time, were built and measured against a budget and left out: at 4× CPU throttling some of their tasks took 92 to 246 ms of main-thread time, over the 50 ms allowed ([the evidence](https://github.com/adewale/rayner/blob/ce11e0ac611cc7b4babc24a573039ef96f179c3f/docs/evidence/player-guidance/README.md)).

The stage's accessible description is a one-sentence summary of the picture. "What the picture shows", under the caption, opens the full description: each diagram, card, code panel and described drawing, with what is marked, dimmed or changed in this step.

The stage takes focus from Tab or a click. With the stage focused, `+`, `-` and `0` zoom and reset, and arrow keys pan when zoomed. Otherwise left and right arrows change step, except on a button, link or field; on a page that has just loaded, before the reader clicks anything, they change step too. In a frame the arrows work once the frame has focus, so the page never takes a key from its host. In the step bar only the current segment is a Tab stop; there left and right arrows change step, Home and End go to the first and last step, and focus follows the current segment. Pinch, Ctrl-scroll and double-click zoom; when zoomed, drag pans and a click recentres on the point clicked. Zoom goes up to 6×, keeps its place across steps, and resets when the case changes. It narrows the stage's SVG `viewBox` inside the author's camera (`ReaderSink` in `app/embed-zoom.ts`) rather than scaling the element, so the drawing stays sharp, the page does not move, an author's camera move keeps playing under it, and **Whole picture** shows the author's frame. On a stage under 600 px wide, each step opens on a close-up of what it changed (what it brought new before what it only moved or scaled, such as a panel carried aside), zoomed whenever a label near the change is under 12 px so that it reads at 12 px, and kept below the heading the stage draws, zooming a little further when that is what it takes; there the heading the stage draws is too small to read, and the step's heading under the stepper row gives its number, title and line. A view count and **Next view** button, in one row under the stepper row, let readers inspect the step's other close-ups without advancing the step. The row keeps its height on every step of a case that has close-ups, so nothing moves, and is blank on a step with one view. On a step with more than one view the footer's hint says how Next view differs from Next, and Next view names that hint as its description. The close-ups that show what the step newly emphasised with the stage's helpers (a lit card row, a code focus or diff line, a marked, travelled or focused diagram part, a note) come right after the first, then the rest of the change, each group in reading order from the first. The small corner map moves through the same views. **Whole picture** shows the author's frame and keeps it for later steps, and the crosshair button brings close-ups back. A vertical swipe scrolls the page; a sideways drag or a pinch moves the view. With reduced motion, the previous picture crossfades into the step's resting picture instead of playing.

Tab order inside the tile is the case picker, the stage, the stepper row, the words' disclosure, the steps row (narrow), the transcript, then the footer's links. On a wide page the rail pane follows the card, so its list comes after the footer.

### Embedding

- **Framed mode.** Inside any frame the page marks its root `data-framed` before its body is laid out (a one-line inline script, pinned by its own hash in the CSP). Its body is then transparent and `#content` unpadded, so the host's background shows around the tile and at its rounded corners; the tile keeps 1 px inside the frame so its edge is drawn.
- **Colour scheme.** A browser may paint an opaque canvas under a cross-origin frame whose colour scheme differs from its host's. The loader therefore resolves `theme` `auto` (or none) to the host page's computed `color-scheme` (dark when it allows only dark, or allows dark and the device prefers it; otherwise light) and passes it as `?theme=`. A raw iframe should pass `?theme=light` or `?theme=dark` to match its host; without it the device's scheme is used.
- **The way out.** The loader appends nothing but the iframe. The page's footer carries **Open the explainer** in any frame, with or without `parentOrigin`.
- **Known heights.** `demos:build` measures each page as the loader frames it, at 390, 640 and 900 px wide, default case, first step, and writes `out/explainers/<id>/embed.json`: `{ "schema": 1, "aspect": "16/9", "heights": { "390": n, "640": n, "900": n } }`. `site:export` copies it beside the page as `<id>.embed.json`.
- **oEmbed.** With `--origin`, `site:export` writes `<id>.oembed.json`, a `rich` oEmbed 1.0 response fixed at 640 px wide (a static host cannot honour `maxwidth`; the iframe shrinks with `max-width:100%`) whose height is `heights["640"]` and whose thumbnail is the poster, and puts `<link rel="alternate" type="application/json+oembed" …>` in each page's head.

### Resize protocol v1

```ts
{ type: 'rayner:resize', version: 1, height: 742 }
```

- The page measures its content root, rounds up, and posts only changed heights, only while framed, and only to the exact `parentOrigin`. It measures on load, on each `ResizeObserver` callback, and whenever the player settles on a step, because browsers can stop rendering an offscreen cross-origin iframe.
- The parent accepts a message only when `event.origin` equals the artifact's origin and `event.source` is that iframe's window. Origin alone cannot tell two embeds from the same host apart.
- Only that type and version, with an integer height from 1 to 100,000, is accepted. The message carries nothing else.

### Host-page API v1

Under the same rule as the resize message (framed, with a valid `parentOrigin`; accepted only from the expected origin and window), the page and its host exchange two more messages:

```ts
// Page → host, on every settled step. Nothing else: no captions or other content.
{ type: 'rayner:step', version: 1, step: 'request', index: 3, total: 4, settings: { request: 'miss' } }
// Host → page.
{ type: 'rayner:goto', version: 1, step?: 'request', settings?: { request: 'miss' } }
```

- The page posts `rayner:step` to `parentOrigin` wherever it dispatches its own `rayner:step` document event: once per settled step. `index` counts from 0. The index and total refer to the complete source sequence, including optional detail steps. The player’s main step bar counts only the teaching path; use the stable `step` name to address either kind of step.
- The page accepts `rayner:goto` only when `event.origin` is `parentOrigin` and `event.source` is `window.parent`, and ignores every other message. It validates the step and settings as it validates URL parameters: an undeclared setting id is ignored, an unknown value resets the settings to their defaults with the same notice, and a step the case lacks opens the first step with a notice. Given settings replace those of the case on show; a request without a step keeps the step by name. The navigation replaces the frame's history entry rather than adding one.
- A raw iframe without `parentOrigin` neither posts nor accepts these messages.
- The loader dispatches `new CustomEvent('rayner:step', { bubbles: true, detail })` on the iframe for each accepted step message (`detail` is `{ step, index, total, settings }`) and calls `options.onStep(detail)`. `mountExplainer` returns its dispose function with a `goTo(step?, settings?)` method that posts `rayner:goto` to the artifact's origin; after dispose it does nothing. The script-tag form dispatches the same event. Parsing and validation are pure functions in `app/embed-protocol.ts`.

### Headers

`<page>.html.headers.json` is the response-header recipe: a CSP that pins the inline script and style by SHA-256, `connect-src 'none'`, no fonts, base or objects, and `frame-ancestors *`, plus `Cache-Control: public, max-age=0, must-revalidate`. `<page>.html.receipt.json` records source, engine and snapshot hashes, the artifact hash and each case's steps, and, for a page that asked for lettering, what its lettering weighs ([lettering on request](#lettering-on-request)).

## Repository scripts

| Script | What it does |
| --- | --- |
| `npm run check` | TypeScript over every project, then a consumer compile against `dist/` |
| `npm test` | The test suite; browser and live tests skip unless enabled |
| `npm run test:full` | `FULL=1`: every frame and ten times as many property cases |
| `npm run test:embeds` | Real Chromium: capture fidelity, cross-origin embeds, history, phone layout, offline, no JavaScript, a lettered page drawing its requested letters |
| `npm run demos:build` | Build every explainer, the gallery, `evidence.json` and a two-embed page into `out/explainers/`, with each explainer's `describeExplainer` JSON in `<id>/describe.json` for `site:export` |
| `npm run demos:check` | `demos:build` plus `check` on every case |
| `npm run demos:serve` | Serve `out/` on port 5175 with each page's headers and byte ranges; `-- --port n` |
| `npm run demos:review` | Open every served case at 390 px and 1180 px in Chromium and check captions, artwork, errors, outside requests and headers, screenshots in `out/review/` |
| `npm run bench` | Manual interleaved BASE/HEAD browser measurements; skips identical built pages and reports insufficient samples as inconclusive |
| `npm run site:export -- <site-root>` | Copy the built pages, posters and loader under `<site-root>/projects/rayner` (`--path` changes it), with every step's preview picture of the default case as `<id>/<step>.png` (the 960 × 540 still centred on a 1080 × 540 canvas of the stage's paper, since X shows these cards at 2:1; a palette PNG of at most 256 colours taken from the picture, each channel within a few levels of the render), and write their `_headers` block to `out/site-headers.txt`. `--origin https://example.org` also writes a share page per step, `<id>/<step>.html`, which sends a reader to the player at `<id>?step=<step>`, and adds the same link-preview tags to each explainer page, for its gallery tile's step: `description`, Open Graph (`og:type`, `og:title`, `og:description`, `og:url`, `og:image`, `og:image:width`, `og:image:height`, `og:image:alt`) and Twitter card (`twitter:card` = `summary_large_image`, `twitter:title`, cut at a word to the 70 characters X shows, `twitter:description`, `twitter:image`, `twitter:image:alt`), with absolute URLs, and `<meta name="rayner:share" content="<origin><path>/<id>/">`, which the player's Copy link reads; then it checks every page has each tag once and each picture exists at the declared size. Link previews come from the HTML a crawler fetches, and a static host sends the same HTML for every `?step=`, so a step needs its own URL to preview. Each explainer's `<id>.json` is copied from `demos:build`'s `describe.json`. The export fails before writing anything if a scene's code, its folder or the engine changed since `demos:build` ran |
| `npm run pack:smoke` | Pack, install into a fresh project with diagram capture and with PNG output, build an outside scene; `EXPLAIN_BROWSER=1` adds installed diagram capture and starter authoring |
| `npm run build:lib` | Compile `dist/` (runs on `npm pack`) |
| `npm run fonts` | Regenerate `src/font-data.ts` from Inter, JetBrains Mono and the Noto numeral subsets, reproducibly (needs `fonttools` and `brotli`) |
| `npm run fonts:lettering` | Regenerate `vendor/lettering/`, the Latin Extended, Greek and Cyrillic of the same Inter and JetBrains Mono that [lettering on request](#lettering-on-request) cuts from; leaves `src/font-data.ts` alone (needs `fonttools` and `brotli`) |

Test environment: `FC_RUNS=n` sets the property cases, and `FC_SEED` with `FC_PATH` replays a fast-check failure. `UPDATE_GOLDEN=1` rewrites `test/golden-traces.json` after a deliberate change. `EXPLAIN_BROWSER=1` enables the browser tests. `test/explain-gates.test.ts` gives each check one seeded defect.

Tests that hold a model to an outside tool compare against frozen answers, and also run the tool when it is present:

| Tool | Runs when | Test |
| --- | --- | --- |
| rustc | `rustc` is on `PATH`, or `RUSTC` names one | `test/explain-send-sync.test.ts` |
| Python's `unicodedata` at Unicode 17.0.0 | `python3` on `PATH`, or `PYTHON`, has it | `test/explain-isdigit.test.ts` |
| sabre/vobject 4.5.7 in Docker | `SABRE_DOCKER=1` | `test/explain-ical-recurrence.test.ts` |
| A checkout of w3c/wcag | `WCAG_REPO=<checkout>` | `test/explain-wcag-map.test.ts` |
| Manim | `MANIM_DIR=<checkout of 3b1b/manim>` at the commit `test/manim-oracle.json` names, with `python3` and numpy 1.26.4 (so Python 3.12 or earlier); `UPDATE_ORACLE=1` rewrites `test/manim-oracle.json` | `test/manim.test.ts` |

The Manim answers for `distribute` depend on numpy's version. In cases 1 and 3 several pieces have the same length at the cut, and manim chooses among them with `np.argpartition`, whose order for ties is not fixed: numpy 1.26.4 reproduces the frozen answers, and numpy 2.0.2, 2.3.5 and 2.5.3 give other counts for those two cases. Refresh the oracle only with numpy 1.26.4.

## Reader timing measurements

`npm run bench -- --base <revision>` compares built pages in Chromium at 390 × 844 and CPU ×4. BASE is checked out temporarily and installs its own locked dependencies with `npm ci`. Every measured explainer receives a warmup on both sides. Recorded pairs alternate BASE/HEAD order. The default is seven pairs; fewer than five return exit 2 (inconclusive) unless a layout failure makes the result exit 1.

Pages and response headers with identical SHA-256 hashes skip browser timing. This establishes artifact equivalence, not a measured latency result. Use `--force` for calibration, `--cpu 1` for no throttling, and `--explainers mr-cache` for a smaller run. `--read-ms 1000` sets the dwell before each action; `--read-ms 0` measures the immediate-action scenario. Values above Node's 2,147,483,647 ms timer limit are rejected. Chosen pages need at least three distinct steps and a stage mutation during Next.

The recorder measures navigation to the ready attribute, Next to the first **DOM stage write**, Next to the resting step event, frame gaps including both window tails, and a jump to the last step. DOM writes and step events do not establish completed paint. Blocking sums the part of each task after its first 50ms that overlaps either interaction window, including tasks started before the click. This clipped-window metric differs from navigation TBT. All layout-shift entries after ready count, including recent-input entries, across both rounds. Pending observer records are drained after two rendering opportunities.

Timing rules retain the original relative/absolute thresholds and 70% slower-pair requirement. A flag must repeat in a second round. These thresholds are a manual diagnostic heuristic calibrated on one shared VM, not a confidence bound or an automatic CI guarantee. The changed window definitions need calibration on the machine where measurements will be used. A run can take several minutes; normal CI checks pure arithmetic, CLI validation and a small browser instrumentation control instead of repeating long A/B timings. CI can choose a parent commit or event-before SHA as BASE if a calibrated performance job is added later.

`out/bench/samples.json` records raw rounds, selected rules and scenario, Node/npm/browser versions, package and lockfile hashes, built artifact hashes, commit IDs and working-tree/untracked fingerprints. Exit1 means a reproduced timing flag, any measured HEAD layout shift, or an error; exit 2 means insufficient timing pairs; exit 0 means artifact equivalence or no reproduced flag in the measured scenarios. A small browser control lives in `test/bench-measure.test.ts`; enable it with `EXPLAIN_BROWSER=1`. Pure properties cover numerical boundaries, invalid data, clipping, frame tails and decision rules without opening browsers.
