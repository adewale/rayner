# Reference

[The tutorial](TUTORIAL.md) builds a two-scenario explainer of LRU and MRU cache replacement; the [authoring feature tour](FEATURE-TOUR.md) pairs code excerpts with the result of running them. [Publishing](PUBLISHING.md) covers hosting and embedding a page.

This page covers the explainer layer: the stage, diagrams, checks, the command line and the page. The engine underneath has its own guides, and [the engine map](ENGINE.md) lists them by module, states the five invariants the checks below enforce, and defines the three records (trace, evidence and receipt) these pages refer to.

Words used throughout: a **setting** is a choice a scene declares (an id, a label and options); a **scenario** is one value for every setting. A **step** is a named section of the scene, and its **resting picture** is what the step leaves on screen: the picture a reader looks at while reading the caption. The **stage** is the 16 × 9 drawing area. Code and JSON use the same word (`scenario`, `scenariosOf`, `scenarios` in reports). Code calls the frame that shows it a step's `restFrame`.

## Scene

An explainer is a Rayner `Scene` exported from a TypeScript or ESM file, preferably as the default export. A module with exactly one exported `Scene` subclass also works.

```ts
export default class Reads extends Scene<{ reads?: number }, {}> {   // the model's type, and what is shown's
  static meta = { lang: 'en', sources: ['https://example.com/spec'] } satisfies ExplainerMeta;   // from rayner/explain

  override async construct() {
    await this.step('stable-name', {
      title: 'A claim the picture can prove',
      line: 'The one thing to see, in a few words.',       // under the title, drawn on the picture
      caption: 'The value, part or mechanism on screen.',  // under the stage on the page
    });
    this.state.reads = reads;   // program state, recorded at each step boundary
  }
}
```

- `script.md`, beside the scene, holds the explainer's intent. Its header is the `#` question, labelled lines (`- **Answer:** …`, `- **Checked against:** …` and any others the author wants) and a `## Check yourself` list of numbered questions, each with its answer on the indented lines under it: the reader questions. Rayner reads the question as `meta.title`, Answer as `meta.answer` (without a final full stop), the `## Check yourself` list as `meta.questions` and Checked against as `meta.checkedAgainst`, which the page shows under the sources; each file it names in backticks must be in the explainer's folder ([Checked against](#checks)), so the line says where the evidence is: `` model's answers in `model.test.ts`; XState's explored graph in `fixtures/statecharts-xstate.json` ``. A header needs both Answer and Checked against; the rest of the script is the author's prose and is not read. A scene that declares any of these four as well is refused. A script with no Answer line has no header, and the scene declares its own title, answer and questions. The answer, and the reader questions' answers, that come from the model can be computed beside the script in `answers.ts`, so `check` fails when the two drift apart ([Script answers](#checks)):

  ```ts
  // answers.ts, beside the script whose question 1 is "How few moves carry five disks?"
  import { solve } from './model.ts';
  export const questions = {
    1: () => `${solve(5).length}: the four-disk tower moves twice, and disk 5 once.`,
    // or keyed by the question: 'How few moves carry five disks?': () => …,
    // or return { question, answer } to hold a question computed from the model too.
  };
  // export const answer = () => …, when the answer itself comes from the model.
  ```

- `static meta` is an `ExplainerMeta` (from `rayner/explain`), and `satisfies ExplainerMeta` types it where it is declared, so a misspelt key does not compile. Its keys are `id`, `title`, `lang`, `sources`, `lettering`, `textContext`, `scenarioNavigation`, `player` (a `PlayerMeta`), `watch`, `answer`, `questions`, `checkedAgainst` and `claims`, each below. Collection, and `loadProject` in `rayner/testing`, refuse any other key, and any `player` key but `accent`, `paper`, `corners`, `minStageWidth` and `outline`, naming the key and the keys it takes; that holds however the object was built, so a meta returned from a function or kept in a constant is held to it too. `static settings` is a list of `Setting`s and takes `satisfies readonly Setting[]` the same way ([settings](#settings)).
- `meta.id` names the output files. It is the scene's folder name, or its file's name when the file is not `scene.ts`, unless the scene declares its own. `meta.title` is the page title, and `meta.sources` are listed under the transcript.
- `meta.player` styles this explainer's player; every field is optional. `meta.player.accent: true` colours the primary action and links with the current scenario's stage accent; `meta.player.paper: true` uses its paper for the page and the tile's surface; `meta.player.corners` is `'rounded'` (the default) or `'square'`; `meta.player.minStageWidth` is a standalone page's preferred minimum stage width in CSS pixels, at most 4096; and `meta.player.outline: true` names every step in the steps rail from the start. Without them the player is neutral greys with an ink primary action. [The tile](#the-tile) says how each applies and when a colour is refused.
- `meta.textContext: 'explicit'` gives text the shaping of the scene that creates it, not of whichever scene is running. Create text with `this.text(...)`, and pass `shaping: this.textShaping` (the scene's `TextShaping`) to `Code`, `ItalicText`, `MathTex`, `Axes` and the other primitives that draw text; stage headings, cards, code blocks, annotations and diagram labels take the scene's shaping themselves. It matters for a scene with [requested lettering](#lettering-on-request) that may run beside a scene with other faces: without it, `new Text(...)` takes the running scene's shaping, so such scenes run one at a time across their awaits ([explicit lettering contexts](LETTERING.md)).
- `meta.lang` (BCP 47, default `en`) is the language of the page and the transcripts. The main player's own words (`app/embed-strings.ts`) and the generated picture descriptions (`explain/words.ts`, whose `families` name each diagram family and its parts) exist in English and French. On a page in any other language both are English, and the descriptions are marked `lang="en"`; `Picture.lang` in the trace records a description's language when it is not English.
- A step's metadata (`StepMeta`) holds its `title`, `line` and `caption`, strings, and its `kind`, a `StepKind` from `rayner/explain`: `'short' | 'main' | 'detail'` (default `'main'`). The engine types and reads only `caption`, for the hold below, and refuses a caption that is not a string before a new step begins; `rayner/explain` declares the other three on `StepMeta`, and collection refuses a title or line that is not a string, or a kind that is not one of the three, naming the step. Additional metadata fields remain available. `this.step` copies the metadata as JSON when the step begins, so a later change to the object changes nothing recorded, and a value that is not JSON (a function, a class instance) throws, naming its path.
- Step names are URL identifiers. They must be unique and non-empty in every scenario.
- `this.state` is the model and `this.shown` what is shown apart from it; [engine fundamentals](ENGINE-FUNDAMENTALS.md#steps-state-and-evidence) says what belongs in each and how the trace records them (the stage's description of its picture is under `shown.picture`). The scene declares both types, `Scene<Model, Shown>` ([typed state](#typed-state-and-shown)). State and recorded evidence hold plain JSON objects, arrays, strings, booleans, null and finite numbers. Object fields whose value is `undefined` are omitted; array holes, undefined array items, functions, symbols, bigint, class instances and cycles fail with a field path. `jsonObject(value)` validates and clones an object under the same rules. `JsonObject` and `JsonValue` (from `rayner`) type such data: an object of JSON values, and one value. Compute values with a model, show its result, and test that each step's state equals the model's (`assertStepState` in `test/lib/explainer-state.ts`).
- `meta.watch` names the state a reader should follow, from a `this.state` key to its label in the scene's language: `watch: { tokens: 'Tokens left', allowed: 'Accepted', rejected: 'Rejected' }`. Raw state is developer data and is never shown wholesale; only these keys are. For each step, a watched key whose JSON differs between the step's start and end is a change, shown in `watch` order, at most four: "Tokens left: 5 → 0" (changed), "Rejected: R6" (appeared) or "Tokens left: removed". Numbers are formatted in the scene's language with at most two decimals; strings are cut to 24 characters; booleans read yes or no in the scene's language; a list of numbers, strings or booleans shows four items and "+n". `null`, absent and an empty list have no value. A value that reads the same before and after is no change. An object or a list of objects cannot be said briefly: the key is skipped for that step and `check` reports it. Collection fails on more than eight entries, an empty key or label, or a key that is never in the state of any step of any scenario. One function, `watchedChanges` in `explain/trace.ts`, formats changes for the player, the transcript, `describeExplainer` and `check`.
- `meta.answer` is the script's one-sentence answer to the reader's question (see the authoring skill's "Script first"). A caption that states it reads it with `answerOf(this)` from `rayner/explain`, so the answer has one home; a test that runs a scene class directly adopts the script first, with `withIntent(Scene, scriptText)` from `rayner/testing`, or `answerOf` throws. `check` fails unless the title, line or caption of some teaching step contains it, compared ignoring case, quote style, spacing and final punctuation, and reports the first such step. Whether the answer comes before the explanation elaborates is for a reader to judge. `meta.questions` lists the reader questions, those a reader should be able to answer afterwards, each `{ question, answer }`, at most six. The player asks them after the last teaching step with each answer behind a disclosure; the transcript ends with them, and `describeExplainer` returns both fields. Collection refuses an empty answer, an empty list, a question without an answer and more than six questions. A scene without them still checks; `check` reports them as missing, and `rayner init` starts a script with both.
- `meta.claims` supplies optional editorial evidence links. Each entry is `{ says, test }`, where `says` is a phrase in a step title, line or caption (compared as for `answer`) and `test` is `"tests/model.test.ts: <part of a static test name>"`, or `{ says, shown: true }` for a description of its own picture. A test path is looked for in the scene's folder first (`model.test.ts: …`), then from the directory where `rayner check` is invoked, so an npm author can reference their own project tests. The checker validates that a declared phrase appears and that its evidence reference names a static, non-skipped `node:test` declaration. It does not run that test, establish what it asserts, or prove the claim. Each scenario’s `claims.scope` lists sentences containing selected English scope words and their first matching evidence link; `claims.unbacked` counts unlinked sentences and `claims.code` lists code names. This is editorial lint over step prose, not a complete inventory of reader-visible assertions: stage labels and `meta.questions` are not scanned. Inspect those separately. Multiple declared phrases in one sentence are all recorded as stated. The supported declarations use literal names and inline function callbacks; dynamic names and callback references are not analyzed.
- `line` is one short line under the heading: what to see, in about ten words or fewer. The stage draws it in the soft colour and fails every command on a line wider than the heading (14.6 units at 0.3). It is part of the picture and the page transcript.
- `kind: 'detail'` in a step’s metadata puts it under **Details and sources** in the reader. `kind: 'short'` marks the reader's short path before the main story; it reads as a main step. Main-story Next and Previous skip these steps. Direct links still open them, and **Back to the explanation** returns to the last main step. While a reference step is selected, Next and Previous follow source order; reaching a main step resumes its shorter path. Builds, transcripts, snapshots and verification retain every step. If every step is marked as detail, the reader treats the full sequence as the main story.
- A captioned step holds until its caption could be read at 160 words a minute (`Scene.captionWpm`, read from the scene's own class, so `static captionWpm = 120` on a subclass sets its own rate), counting the step's motion as reading time. Words are what whitespace separates; in scripts written without spaces (Chinese, Japanese, Thai, Lao, Khmer, Myanmar, Tibetan) every one and a half letters, counted as grapheme clusters, make a word, and a token is always at least one. Grapheme clusters follow fixed Unicode rules, so Node and every browser count alike, where a dictionary's word breaks differ between them. The page stops when the picture stops and waits for the reader. The picture must not change once the hold begins.
- Each step draws at least one frame of its own: a step that ends on the frame it began, with no play, wait or caption, would show the step before's picture, so it throws. As a step ends it records `holdFrame`, the frame its picture stops changing on (where its hold begins, else its last), and `restFrame`, its last frame, the resting picture a link shows; the trace carries both.
- `this.step(name, (before) => meta)` takes its metadata from a function of the step it closes, called once that step has ended with its caption hold (null before the first step): for words that report the step before's timing, its `t0`, `hold`, `holdFrame` and `t1` (`fork`). `this.currentStep` is the step running now, or null.
- One `play`, `wait` or `step` runs at a time: each refuses to start while another has not finished (`this.play(): a play() is still running; await each play(), wait() and step() before the next`), so a forgotten `await` cannot interleave two plays' frames or record steps out of order. `this.phase` says what the scene is doing, a `ScenePhase`: `'idle'`, `'playing'`, `'waiting'`, `'ending-step'`, `'beginning-step'`, or `'stopped'` once a sink has stopped the run. A listener added with `this.onStep(listener)` or `this.onStepEnd(listener)` may play and wait inside the step it hears: the first runs as each step begins, the second as each is about to end, before its caption hold, while it is still `currentStep`. Each returns its own remover.
- Keep awaited animations out of `try`/`catch` and `.catch()` in `construct()`. A seek stops the scene by throwing `StopScene`, and a broad catch swallows it, so a direct link could draw a different picture from playing to the step. Handle a known model error in plain code before animating. [Engine fundamentals](ENGINE-FUNDAMENTALS.md#updaters-derived-pictures-and-seeking) says how far the engine limits the damage; `check` fails the pattern (the catch lint, [below](#checks)).
- `this.frame` is the camera; [the camera guide](CAMERA.md) covers it. [`s.focus`](#stage) moves it while keeping the heading on screen.
- `this.record(kind, data)` adds `{ kind, ...data }`, copied as JSON, to the step's evidence ([fundamentals](ENGINE-FUNDAMENTALS.md#steps-state-and-evidence) lists what animations record themselves). `kind` must be a nonempty string, and `data` cannot override it. Steps in the trace carry `evidence` only when they recorded something, seeks record the same evidence as full runs, and `this.evidence` holds every record so far. Step evidence is unrelated to the build's `evidence.json`.
- `this.text(value, options)` creates text with the scene’s own shaping service. See [explicit lettering contexts](LETTERING.md) for concurrent requested-face scenes.
- `text.setText(value)` replaces a `Text`'s string in place, keeping its style, size and any turn or stretch, and holding its anchor point fixed. `text.anchorPoint()` is that point: the left, centre or right of its advance box (by its `anchor`), at the box's vertical middle. It does not move with the ink, so a scene places rows or a bar level with a line of text by it (`ring-buffer`, `state-machine`).
- By default, lettering uses the embedded fonts, drawn as outlines. JetBrains Mono falls back to Inter, and both fall back to Noto Sans Arabic, Devanagari and SC subsets that hold numerals only (Arabic-Indic and Devanagari digits, Chinese numerals, fullwidth digits). Diagram labels fit the captured widths unless their spec opts into [natural measurements](LETTERING.md#diagram-measurements). A style does not request its font. Bold is the Regular outline stroked, and there is no italic. Every command rejects characters outside the default fonts and requested lettering, naming the scenario, step and code point. An explainer can request additional scripts, registered faces, real bold and italic, or maths with `meta.lettering`, below.

### Typed state and shown

A scene declares the type of its model and of what is shown: `class Bucket extends Scene<BucketState, BucketShown>`. `this.state` and `this.shown` are typed from them, and so is everything drawn from them: a view's draw (`view(this, (st, sh) => …)` and `new View(this, draw)` infer both arguments from the scene), `s.diagramView`'s draw (`stage(this)` carries the types), a `Machine` (its state is the scene's model type), and `view.tween`. A scene with nothing shown declares `{}`; a scene whose pictures are all staged steps has no model of its own and declares `Scene<{}, {}>`. Untyped, both are JSON records (`SceneState`), which suits a test or a tool.

```ts
type Tokens = { tokens: number; rejected: string[] };
export default class Bucket extends Scene<Tokens, { lit?: string | null }> {
  override async construct() {
    const s = stage(this);
    this.state = { tokens: 5, rejected: [] };
    this.shown.lit = null;
    const tokens = view(this, (st, sh) => card(s, [['Tokens', st.tokens]], { lit: sh.lit ? { row: sh.lit } : null, key: 'card' }), { place: false });
    await s.enter(tokens);
  }
}
```

- The state starts empty (`{}`) until the scene sets it, so set it before a view reads it (or initialise it, `override state = …`).
- A scene whose state changes shape by phase types it honestly: a union of the shapes (a discriminant such as `phase`, or keys only one shape has), or one record whose per-phase parts are optional. A draw of one phase narrows with a check of its own, or with `having(state, ...keys)` from `rayner/explain`, which returns the state typed as the shapes that hold those keys (optional parts made present) and throws a `TypeError` for a state that lacks one. The same works for an optional part of what is shown: `having(sh, 'flow').flow`. `rayner check` draws every view from other steps' states and counts a draw that throws on a state of another shape as one that reads its state ([checks](#checks)), so a narrowing that throws is what it expects.
- A machine's state type is the scene's model type. A machine that drives one phase of a union narrows in `next` and in its transitions: `next: (st, e) => roundNext(having(st, 'pick'), e)`.
- `s.steps([...])` types each step from its own `state`, so one list holds steps whose states differ. A step's state is the scene's state while the step shows, not the scene's declared model type: a scene that reads `this.state` after its steps sets it first. A trace types every step's state as the model type ([typed traces](#typed-traces)), so a scene whose tests read a staged step's state includes that state's shape in its model. Write the list in the call, where each draw is typed; a list built elsewhere gives each step its type, `StagedStep<Shift>`, or (with named draw functions) is a tuple, `[...] as const`.
- Type a helper a draw calls with the model type, not `SceneState`: an interface is not assignable to a JSON record.
- `settingsOf(this)` returns a `Settings`, `Readonly<Record<string, string>>`; TypeScript gives an instance no link to its class's `static settings`, so a setting's options are not in its type.
- Which way to change the state (assign it and sync, a machine, `s.steps`, a tween or an authored transition) depends on when the change happens and what decides it: [changing what is shown](VIEWS.md#changing-what-is-shown) has the table.

### Lettering on request

Requests for Arabic (`Arab`), Devanagari (`Deva`), Hebrew (`Hebr`), Chinese (`Hani`), replacement `faces`, `styles` (real bold and italic) or `math: true` use the [outline snapshot workflow](LETTERING.md). That guide covers setup, the font registry, bold and italic, shaping and bidi limits, maths, and refreshing snapshots.

Plain Latin Extended (`Latn`), Greek (`Grek`) and Cyrillic (`Cyrl`) requests use the subset workflow below; only the requesting page carries the additional lettering:

```ts
import type { ExplainerMeta } from 'rayner/explain';

static meta = { id: 'alphabet', title: 'Αλφάβητο', lettering: { scripts: ['Grek'] } } satisfies ExplainerMeta;
```

- `scripts` takes ISO 15924 codes: `Latn` (Latin Extended-A, -B and Additional, U+0100–024F and U+1E00–1EFF), `Grek` (U+0370–03FF and U+1F00–1FFF) and `Cyrl` (U+0400–052F). These scripts need no shaping beyond what the shaper already does for Latin. Adding a registered script outside this group, `faces`, `styles` or `math` selects the outline workflow instead. Unknown codes and keys fail validation.
- The build runs every scenario once with Inter's and JetBrains Mono's own letters in those scripts (`vendor/lettering/`, the same releases as the embedded faces, made by `npm run fonts:lettering`). It records which letters each face drew, on stage. It keeps only the letters of the requested scripts, and cuts each face to them with fonttools' subsetter. The page embeds the cuts as WOFF2 in its script, and puts them in place before the player draws.
- A requested face joins its family's chain after the embedded face and before the Noto fallbacks, so everything the embedded faces draw looks as it did. Code tries JetBrains Mono's cut, then Inter's: JetBrains Mono has no ῶ, so code draws it in Inter.
- The cuts are pinned beside the scene in `scene.lettering.json`, keyed by the source face's hash and the letters. A build reuses them. When the letters change it cuts again, which needs `pip install fonttools brotli` (or `PYFTSUBSET` set to the path of `pyftsubset`). Commit the file with the scene.
- A letter outside the request still fails every command, as before. So does a combining mark after a letter the embedded faces draw: write the precomposed letter.
- A lettered page's receipt and its `check` report have a `lettering` entry: the scripts and, for each cut, its source, letter count, WOFF2 bytes and SHA-256, plus `pageBytes`, the base64 the page carries. The Greek test fixture's two cuts hold 24 letters in 6,740 bytes of base64.
- A scene names only the `LetteringRequest` type, what `meta.lettering` takes, from `rayner`. Putting a page's cuts in place, and recording which letters each face drew, are internal to the build and the page.
- An explainer that asks for nothing carries no lettering code: the build leaves the optional lettering exports out of its bundle. `test/lettering.test.ts` checks that, lettering isolation and glyph coverage.
- The subset workflow does not replace faces, shape complex scripts or draw real bold and italic. For those requests and typeset maths, use the [outline workflow](LETTERING.md#supported-requests): `faces` (such as `eb-garamond` for the pen-and-ink style), `styles: ['bold', 'italic']` with `ItalicText` ([bold and italic](LETTERING.md#bold-and-italic)), and `math`. Neither workflow implicitly selects a diagram style's font. [Supported requests](LETTERING.md#supported-requests) says which licences an embedded face may have; its notice joins the page's licence block automatically.

### Maths

An explainer that sets formulas asks for `math: true`, and draws each one with `MathTex`:

```ts
import { Scene, MathTex } from 'rayner';
import { stage } from 'rayner/explain';

export default class Roots extends Scene<{}, {}> {
  static meta = { id: 'roots', title: 'The quadratic formula', lettering: { math: true } };
  override async construct() {
    const s = stage(this);
    await this.step('formula', { title: 'Two roots', caption: 'Both roots of a quadratic, from its three coefficients.' });
    const roots = new MathTex('x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', { display: true, fontSize: 0.6, color: s.look.ink });
    await s.enter(roots, { describe: 'x equals minus b, plus or minus the square root of b squared minus 4 a c, all over 2 a.' });
  }
}
```

```sh
export RAYNER_MATH_FONT=/path/to/latinmodern-math.otf   # Latin Modern Math 1.959, from CTAN
npm run rayner -- snapshots roots.ts                    # typesets each formula once
npm run rayner -- check roots.ts
```

- `MathTex` is a `Text`: it takes `fontSize` (0.4 by default), `color` and the other text options. `display: true` sets display style: limits above and below large operators, full-size fractions.
- `snapshots` typesets each distinct formula once, with `glyph`'s TeX typesetter (`vendor/glyph-math.js`, glyph at `6398654`) on Latin Modern Math. It stores the outlines in `scene.lettering.json`, with a cut of the font to the glyphs drawn, and adds the font's GUST licence to the page's licence block. Capture needs `RAYNER_MATH_FONT` (the file's SHA-256 is checked) and Python with fonttools and brotli ([LETTERING.md](LETTERING.md#capture-check-build)). Commit the file with the scene.
- `check`, `build`, `shots` draw the stored outlines and run no typesetter, and neither does the page. A formula changed without running `snapshots` fails every command, before anything is drawn, with "new Text(): the lettering snapshot has no run for …; run rayner snapshots". `MathTex` without `math: true` fails too.
- The TeX is `glyph`'s subset: scripts and primes; `\frac \dfrac \tfrac \cfrac \binom`; `\sqrt` and `\sqrt[n]`; `\left \middle \right` and `\big` to `\Bigg`; large operators with `\limits` and `\nolimits`; `\sin`, `\lim` and `\operatorname`; accents, `\widehat \widetilde \overline \underline \overbrace \underbrace`; `\overset \underset \stackrel`; `\text`; Greek; about 125 relations, arrows and binary operators, and `\not`; `\mathbb \mathcal \mathfrak \mathbf \mathit \mathrm \mathsf \mathtt \boldsymbol`; spacing and style commands; `matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix cases`.
- Anything else fails `snapshots` with `glyph`'s error and its offset in the source, for example `new MathTex(): glyph cannot typeset "\\color{red}x": {"tag":"Tex","error":{"tag":"UnknownCommand","name":"\\color","at":0}}`. Not supported: `\color`, `\phantom`, `\substack`, `\pmod`, `align` and the other multi-line environments, line breaking, and right-to-left maths. Latin Modern Math has no lowercase script letters, so `\mathcal{a}` fails as a missing glyph.
- Morphs: a formula's glyphs are not characters of its source, so `TransformMatchingText` and `TransformMatchingShapes` both pair them by shape. `TransformMatchingText` pairs the longest runs of same-shaped glyphs first, in the order the typesetter lists them (reading order, then fraction bars and radical rules). When a formula grows at the end, every old glyph keeps its place. Glyphs of one shape are interchangeable, whatever their size: swapping `\frac{1}{2}+x^2` to `x^2+\frac{1}{2}` turns the denominator 2 into x's exponent. Inserting `y^2+` into `x^2+\frac{1}{2}` moves x's exponent and its `+` to the new term and grows new ones beside x; the formula still ends right. Use `TransformMatchingText` when terms are added or removed: new glyphs grow inside the formula, so it stays one piece for the motion check. `TransformMatchingShapes` passes when every glyph is matched, as when terms swap places. When glyphs are added, it grows them from outside the formula's box, and `check` reports the formula jumping, as it does for plain `Text`. `Transform` morphs a whole formula into another.
- A kept formula with no `describe` is described as "1 label.", so say it in words.
- An explainer without maths builds the same page and receipt as before. Each formula costs its outlines. The four-step fixture in `test/lettering/math` stores 7 formulas in a 46 KB snapshot (each outline stored once; 90 KB of runs unpacked), with a 4.5 KB font cut, and its page carries 37 KB of that. Its page is 34 KB larger than the same scene drawn as plain `Text` (9.6 KB gzipped). `test/browser/lettering-math.test.ts` compares the stored outlines with upstream `glyph`'s own results (`test/lettering/glyph-math.json`, made by `tools/oracle/glyph-math.ts`), and in Chromium compares the page's paths with Node's at every step.

## Engine output and admission

A new `Text` starts with its advance box centred on the origin, before `moveTo` or another positioning call. Its ink can be asymmetric within that box.

`Scene.add` and `bringToFront` keep a child inside an already visible parent rather than painting it twice. Adding a parent replaces its descendant roots; re-adding a root moves it to the front. `bringToBack` follows the same ownership rule and preserves argument order at the back. `replace` likewise keeps one painted occurrence per descendant and rejects inserting an ancestor into its own descendant.

`toSvgString`, `StringSink` and `SnapshotSink` accept a positive safe-integer pixel `width` (default 1280). There is no 4096px limit on local SVG export. Their `background`, the scene's paper (`scene.colors.paper`) unless given, accepts `#rgb` or `#rrggbb` and writes lowercase `#rrggbb`; named CSS colours and coercible objects are rejected. Arbitrary paint strings on shapes are escaped as XML data, with characters illegal in XML 1.0 removed. `DomSink` sets its background, the scene's paper unless given, through the browser's CSS property rather than serializing it into markup.

`shaperFor` accepts exactly the strings `sans` and `mono`. TypeScript's font type does not replace runtime validation for JavaScript callers.

## Stage

```ts
import { stage } from 'rayner/explain';
const s = stage(this, { style: 'nord' });
```

`stage(scene, options)` adds the backdrop (the rectangle the stage is drawn on, in its look's `paper`) and a heading that follows each step's `title`: a circled step number, the title, and the step's `line` under it. The heading draws over everything, and while the camera is away from home it stays put on screen at its size, over a paper band that zoomed content passes under. A scene has one stage: call `stage(this)` once and keep what it returns, since a second call throws.

| Option | Effect |
| --- | --- |
| `style` | An Agentic Mermaid style: the stage's palette, and the style of every diagram that names none |
| `direction` | `'ltr'` (default) or `'rtl'`: card field order and the physical halves named by `start`/`end` |
| `palette` | A `Palette` for the stage, for example `palette('dusk')` in a scene with no diagrams |
| `heading` | `'step'` (default), a fixed string, or `false` for no heading |
| `headingSize` | The heading's font size, 0.36 by default; at 0.5 it reads at about 12 px on a 390 px page without a close-up |
| `numbered` | A circled step number before the title; on by default when the heading follows the steps |

With neither `style` nor `palette`, the stage adopts the first diagram's palette. Later diagrams keep their own colours and leave the backdrop, heading and engine defaults as the first one set them.

| Member | What it does |
| --- | --- |
| `s.show(spec, { box, build, runTime })` | Draw a diagram (`spec` is a `DiagramSpec`, `{ source, style?, lettering? }`) and build it in; gives a `Diagram`, once it begins ([actions](#actions)) |
| `s.diagramView(d, (state, shown) => ({ marks, notes, dim, prefix }))` | Show diagram `d` by a view that draws its marks, notes and dimming from state, usually from `shown` ([below](#diagrams)), both typed from the scene, and returns a `DiagramPicture`; `s.diagramView` returns the `View`, which takes the live diagram's place. Change `this.shown` and play `view.sync()`. Called again while that view shows `d`, or after `s.liveDiagram(d)`, it gives the same view, redrawn with the new draw; after `d.hide()` or `s.clear()`, a new one |
| `s.liveDiagram(d)` | Hand the stage back to the live diagram, for a `reveal`, `morph` or `enlarge`, which a viewed diagram refuses (a `walk` runs over the view); call `s.diagramView(d, draw)` again afterwards to show it by that view once more |
| `s.card(rows, { at, align, width, title, columns, size, direction, lit, key, panel, enter })` | Labelled values: the drawing kit's `card(s, rows, options)`, faded in and kept; gives the `Card`. `columns` puts values side by side under headings; `direction` overrides the stage's field order; `lit: { row, as }` puts a bar on a row ([below](#card-and-codeblock)) |
| `s.code(lines, { at, align, size, title, diff, added, lit, width, fitHeight, key, enter })` | Code on a panel: the kit's `code(s, lines, options)`, faded in and kept; gives the `CodeBlock`. With `diff`, lines starting `+ ` or `- ` are marked added or removed; `lit: { lines, as }` puts a bar on lines |
| `s.direction` | `'ltr'` or `'rtl'` (a `LayoutDirection`), from the `direction` option: where `start` and `end` fall, and the field order of the stage's cards |
| `s.note(text, { at, size })` | One line of secondary text, default at `[0, -3.9]` |
| `s.enter(...mobs, { describe, ...fadeOptions })` | Keep native objects and fade them in together, in one play |
| `s.keep(...mobs, { describe })` | Register objects for description and for `s.clear`, without adding or animating them (add them with `this.add` or a play); returns the first |
| `s.clearOverlays()` | Fade out cards, code, the stage's notes and kept objects; a diagram, and a view that shows one, stay |
| `s.clear({ runTime })` | Fade out everything except the backdrop and heading, and bring the camera home, in one play |
| `s.focus(target \| 'all', { margin, runTime, exact })` | Move the camera so a mobject, mobjects or a box fill the stage below the heading, with `margin`; `'all'` goes home. Never zooms out past the stage or shows beyond its edges. `exact: true` takes a 16:9 box as the view as it is. To move other things in the same play, play them together: `this.play(s.focus(box), new FadeOut(m, { runTime: 0.9 }))` |
| `s.carry(m, to, { runTime })` | Glide a kept object to a point, or into a box or region it is shrunk to fit (never enlarged): carry an idea on instead of clearing it |
| `s.sketch(m, { tool, color, runTime, describe })` | Draw `m` stroke by stroke at an even speed with a `'pen'` or `'pencil'` riding the tip (`false` for none), and keep it. Between strokes the tool travels at drawing speed, so it never jumps. `m` must not be on stage yet |
| `s.steps(steps, { kind }?)` | Present steps in turn. Each step is `{ id, title, line, caption, state, draw, describe?, audio?, kind?, opening? }`: it clears the stage, makes `state` the scene's model, and fades in `draw(state, s)` as a view of that state, described by its words, or by `describe(state)` for a picture whose meaning is its geometry; a part that describes itself (a card, code, a note, a dimension line) is described by itself either way. A `draw` must read its state and nothing a different step changes, and `rayner check` holds it to both ([staged steps](#checks)). `opening` lists keys of the parts a phone opens on ([below](#the-phones-opening-emphasis-and-review-subjects)); without it the whole drawing is the opening's subject. Each step is typed by its own `state`, so one list holds steps whose states differ ([typed state](#typed-state-and-shown)) |
| `s.opening(...subjects, { keep }?)` | Name the mobjects a phone's opening close-up should hold together this step ([below](#the-phones-opening-emphasis-and-review-subjects)); with `{ keep: true }` last, for this step and every later one until another kept opening replaces them (none clears them), though a step's own `s.opening` still wins for that step |
| `s.dimension(a, b, label, { offset, color, size, key })` | The kit's [`dimension`](#drawing-kit), sized for the screen, drawn in and kept: a dimension line from `a` to `b` with ticks, arrowheads and `label`, set off by `offset` |
| `s.legend(items, { at, size, stack, gap, key })` | The kit's `legend`, sized for the screen, faded in and kept: a key of swatches and their meanings |
| `s.pin(point, { label, color, size, side, key })` | The kit's `pin`, sized for the screen, faded in and kept: a pin stuck in at `point`, with an optional label to the head's `side` (`'right'` by default, or `'left'`) |
| `s.callout(target, text, { side, gap, color, size, key })` | The kit's `callout`, sized for the screen, drawn in and kept: words beside a point, box or mobject, with a leader line ending in a dot on its nearest edge |
| `s.look` | The colours to draw with, each reading on this paper ([colours](#colours)) |
| `s.backdrop`, `s.heading` | The backdrop rectangle and the heading text |
| `s.scene` | The scene the stage draws on. A drawing helper of your own that takes `s` first, as the kit's functions do, makes its text with `s.scene.text(...)`, so the text takes the scene's shaping |

Annotations say a value where it is. Prefer a dimension, pin or callout on the drawing to a card beside it, and `carry` to `clear` when the next step builds on this one. One function makes each annotation: the kit's builds the picture in world coordinates, for a view's or a staged step's draw; the stage verb builds it with that function from the points the camera shows and maps it to the screen, so it keeps its size on screen while the camera is away. With the camera at home both give the same picture. The camera is read from `this.frame` when the verb is called, so a camera the scene moved itself, with a Transform of `this.frame`, counts as one `s.focus` moved; a verb composed in one play after a `s.focus` is sized for the camera as it was when the verb was called.

`{ enter: false }` keeps a card or code panel without playing it in, so `s.enter(card, code)` can bring several in together, in one fade.

`describe` (the `Describe` option of `s.keep` and `s.enter`) says in words what kept objects show together: a sentence, or a function for a drawing that changes. Without it, the description lists their visible text, and `check` fails a kept drawing that has no text. Either way, a part that describes itself is described by its own words wherever it sits, a view's current picture included: a card or code panel as the stage describes one it entered, its lit row or lines with their word; a diagram note; a dimension line or pin. So a view of a card needs no `describe`, and one given says what else the view shows.

### Actions

The stage's verbs that animate (`s.show`, `s.card`, `s.code`, `s.note`, `s.enter`, `s.clearOverlays`, `s.clear`, `s.focus`, `s.carry`, `s.sketch`, `s.dimension`, `s.legend`, `s.pin` and `s.callout`) and a diagram's `reveal`, `walk`, `enlarge`, `morph` and `hide` each return an action (type `Action<T>` from `rayner/explain`): an `Animation` that is also a promise of what the verb gives, `T`, such as the card, the diagram, or nothing (it has the promise's `then`, which is what `await` calls).

- `await` it and it plays itself: one play for each of its beats, each rounded to whole frames. A walk is several beats: its token fades in, moves hop by hop, and fades out.
- Hand it to `play()`, a `Succession`, an `AnimationGroup` or a `LaggedStart` and it plays there instead, its beats one after another inside that play.

```ts
await this.play(s.focus(d.get('B')), d.walk([['A', 'B']]));        // together, in one play
await this.play(new Succession([s.enter(box), d.reveal(['B'])]));  // in turn, in one play
const panel = s.card(rows, { at: 'end' });
panel.value.moveTo([4, 1]);                                        // the card exists before it plays
await this.play(panel, view.sync());
```

An action is decided when it is called: what it builds, fades, reveals or moves to, as a `Transform`'s target is. Its side effects, such as keeping a card for the description or recording a walk, happen when it plays, at the same moments between its animations whichever way it plays. Each of its animations takes its starting look when it begins. A walk checks that its links are revealed when it plays, so a reveal before it in the same `Succession` counts. Composed, an action's beats are rounded to whole frames together, as a `Succession`'s members are, so a step's length can differ by a frame or two from the same actions awaited one by one.

An action's `name` is the call that made it, as its errors name it: `s.card()`, `d.walk()`. `value` is what awaiting the action gives. It is there as soon as the action is made, so a card or panel can be read or placed before it plays. `s.show` reads the diagram's layout first, so its diagram, and how long it takes, are known once the play that holds it begins: `play()` waits for the layout of every action it is given, a `Succession`'s or group's members included, then each group lays out its members' times. So `s.show` plays awaited, in `play()`, or inside a `Succession` or group.

An action plays once. Playing it again, or awaiting one that played in a play, throws. An action does nothing until it is awaited or played, so a step fails when it ends with an action made in it and never played (`s.enter(): it was made in step "notes" but never played; …`), and so does the scene at its end.

### Colours

A palette is the input: a named style's four colours (`paper`, `ink`, `accent`, `muted`), which `palette(name)` returns, the stage's `style` or `palette` option chooses, and a diagram's snapshot carries. The look is what a scene draws with: `s.look` derives from the palette the colours that read on its paper, and the stage's own helpers colour from the same look.

| `s.look.` | Colour |
| --- | --- |
| `paper` | The paper, the backdrop's fill |
| `ink` | Text and lines |
| `soft` | Secondary text: ink pulled toward the paper, never below 4.5:1 against it |
| `emphasis` | Emphasis: trails, marks, lit rows and lines, plotted data. The style's accent, or orange for styles whose accent is grey or near-black (hand-drawn, pen-and-ink, blueprint) |
| `good`, `bad` | Outcomes: accepted or passed, rejected or failed |
| `raised`, `rule` | A panel surface one shade off the paper, and a hairline that separates; the colours of the stage's own card and code panels |
| `muted` | The style's faint colour, for guides, axes and tracks that are not read as text |

A colour name means one colour everywhere: a diagram's `d.emphasis` and the engine's `scene.colors.emphasis` (what an outline or plotted data drawn without a colour takes) are the look's `emphasis`. The look is frozen; a stage that adopts its first diagram's palette has a new look from then on, so read `s.look` where a picture is drawn rather than keeping an earlier one.

### The phone's opening, emphasis and review subjects

On a stage under 600 px wide, each step opens on a close-up and offers the rest of its picture as a tour of further close-ups ([controls](#controls-and-accessibility)). Three inputs decide what that tour shows and what `rayner review` insists is on screen. None of them hides anything, moves the camera or changes the picture, and the third is deliberately kept apart from the other two.

`s.opening(...subjects)` picks the opening: the mobjects a caption compares, which the first close-up should hold together. Pass mobjects (`d.root` for a whole diagram `d`), not a box or words. A step has one opening, so a second call in the same step replaces the first, and the stage forgets the subjects at every step boundary: an unchanged picture under a new caption needs a fresh call. The planner measures the subjects' painted bounds and label sizes and opens on them only when they fit at a readable scale; otherwise the step opens on what it changed, and labels too small for the opening keep their own close-ups. An absent or unpainted subject is an error. For a picture that stays on stage while the steps change it, such as a machine's view, `s.opening(...subjects, { keep: true })` names the opening once for this step and every later one. `s.steps` calls it for every step, with the parts its `opening` keys name or else the whole drawing.

Emphasis is what a picture marks: a lit card row or code line, a diff line, a marked, travelled or focused diagram part, a note. A card or code panel built with `lit`, code built with `added`, a diagram picture's marks and a diagram's `notePicture` each say what they emphasise wherever they are drawn. The word for what a mark says is `as` everywhere: `lit: { row, as }`, `lit: { lines, as }`, a diagram mark's `{ color, as }`. A scene that draws its own marks says so where it draws them, with `emphasised(mobject, as)` from `rayner/drawing`, so the mark and its words come from the same state:

```ts
const outline = new SurroundingRectangle(slot); // drawn by the scene's own draw
if (st.full) emphasised(outline, 'outlined: the full slot');
```

 Emphasis counts per step: what a step newly emphasises, compared with the step before it, gives the tour its first stops after the opening, and becomes the review's primary subjects, which the tour must show whole. A step with neither new emphasis nor a declared subject is reviewed on the artwork it changed.

`scene.review.json` declares subjects from the caption's meaning, written without looking at the planner ([reader review](#reader-review)). The review fails when the served page does not show them in the tour, or in the opening when a subject says `opening: true`, so an `opening` call that names the wrong objects is caught by an expectation it did not produce.

### Card and CodeBlock

A card or code panel is a picture of values: it is built once, with what it marks, and never changed in place. One whose values or marks change is drawn by a [view](VIEWS.md) from state, so a redraw from the same state draws the same card, and `rayner check` holds it to that at every step.

| Option | What it does |
| --- | --- |
| `lit` | A card's bar on one row, `{ row, as }`, or a code panel's on zero-based line `i` or lines `[a, b]` inclusive, `{ lines, as }`. `as` is the word the description gives what is lit, such as `'rejected'`; without it a row is "marked" and lines are "focused", in the scene's language. `null` lights nothing |
| `diff`, `added` | Added and removed bars: from lines that start `+ ` or `- `, or `added` for the indices an edit introduced |
| `key` | Key the card or panel and its parts under this name, so `view.sync()` changes it in place: an unchanged value or line stays, a changed one fades out as its replacement fades in, and the bar moves. A card's value is keyed with its text; a line is keyed by its text and which occurrence of that text it is, so a line that moves pairs with itself |
| `width`, `fitHeight` | A fixed width, so a panel drawn from state keeps its size as its values or lines change; in a box, shrink code to fit the box's height too |
| `panel: false` | A card with no panel or padding, for values written inside a drawing (`ring-buffer`'s head, tail and length inside its ring; `token-bucket`'s balance) |

Both are native `Group`s and describe themselves wherever they are drawn, a view's current picture included ([views](VIEWS.md#cards-code-annotations-and-notes-from-state)). `describe()` returns those words, a `Description` (`{ what, parts, blank? }`, each part a `DescriptionPart`: `{ name, mark?, dimmed? }`, both types from `rayner/explain`), for a test: a card's rows by label and value, its lit row with the mark's word; a code panel's lines, the lit, added and removed ones named. The drawing kit builds them: `card(s, rows, options)` and `code(s, lines, options)` from `rayner/drawing` return one in the stage's colours, placed as the stage places it (`at: 'start' | 'end'` and a card's field order follow `s.direction`), for a view's draw. `s.card` and `s.code` build with them and enter the panel, faded in and kept; a test holds the two to the same picture and words. `rayner/explain` exports `Card` and `CodeBlock` as types only, for a view's type (`View<Card>`) or a panel's parts (`card.values`, `block.code`): a scene builds one with the kit, never with `new`. Each has its `panel`, the rectangle behind it, and its `bar`, the lit bar; a code panel's `marks` are its added and removed bars, each `{ line, kind, mob }`. A card's rows are `CardRow`s: a label and its value, or with `columns` a value per column or one that spans them.

`CodeBlock` is a panel around the engine's `Code` (from `rayner`), which is plain highlighted code text with keyed lines and spans, and no panel or stage colours. Use `Code` itself for `TransformDiff`, a token's span, or a layout of your own; use `code(s, …)` or `s.code` for code on the stage, with a title, a lit bar or diff marks, that describes itself.

```ts
// The lit line is how the code is shown (this.shown, typed { lit?: { lines: number; as: string } | null }), not the model.
this.shown.lit = null;
const block = view(this, (_st, sh) => code(s, SOURCE, { at: 'main', lit: sh.lit ?? null, key: 'block' }), { place: false });
await s.enter(block);
this.shown.lit = { lines: 1, as: 'update' };
await this.play(block.sync());
```

An edit to code is the same: put the lines in the state, with `added` for what the edit introduced, and sync (`feature-tour`'s code edit).

`columns` lays values side by side under headings, so a phone close-up of one card shows a comparison whole:

```ts
const cache = view(this, (st) => card(s, [['Requests', 'A B C D'], ['Evicted', 'A', 'C'], ['Hits', st.lru, st.mru]], { columns: ['LRU', 'MRU'], width: 6.8, key: 'card' }), { place: false });
```

A row gives one value per column, or one value that spans them all (Requests above). The headings sit above the first row with a value per column. `lit` lights the whole row. The description names each value by its row and column, "Hits (MRU): 3". A card's `cells` holds each row's values; its `values` keeps each row's last one. The [LRU/MRU tutorial scene](../scenes/tutorial/lru-mru/scene.ts) uses one.

### Drawing kit

`rayner/drawing` draws the parts explanations keep needing, as ordinary mobjects coloured from a stage's look; nothing here animates or reads scene state. Every function has the same shape:

- the stage `s` first, for its look and its text shaping (all kit text is made with the scene's shaping, as `this.text` makes it);
- then what the picture shows, positionally: its text, rows or items, and what it measures or points at (a callout's target, a dimension's ends, a pin's point);
- then one options object: `at` is where the picture stands, `size` its text size, `key` its address.

A function whose parts are keyed (`table`, `stat`, `flow`, `bars`, `legend`) requires `key`, so two of one kind on a stage never collide. The others take `key` optionally, and key their parts only when given it. A keyed picture keys its parts under its own key, so a scene addresses a part by key (`find`, matching, a choreography's `c.from`), never by a child index.

| Function | Draws | Keyed parts |
| --- | --- | --- |
| `keyed(m, key)` | Sets `m.key` and returns `m`, for any mobject a scene draws itself | |
| `keyedParts()` | A picture built from keyed parts: `add(m, key)` keys `m`, keeps it in order and returns it, `group()` returns the parts as one Group. A key added twice is refused at the `add` that repeats it | |
| `emphasised(m, as)` | Marks `m` as emphasis, `as` the words for what it shows (`'outlined: the full slot'`), so the phone's tour and the descriptions find the mark where it is drawn; `null` takes the mark off. Returns `m` ([emphasis](#the-phones-opening-emphasis-and-review-subjects)) | |
| `label(s, text, { at, color, size, key })` | A centred line of text at `at`, in the look's ink unless given a `color` | |
| `tile(s, text, { at, width, height, active, bad, size, key })` | A labelled box centred at `at`: soft, emphasised when `active`, red when `bad` | `key:box`, `key:label` |
| `segment(s, a, b, { color, strokeWidth, key })` | A stroke from `a` to `b` | |
| `dot(s, text, { at, active, key })` | A labelled circle | `key:circle`, `key:label` |
| `table(s, headers, rows, { key, columns, at, gap, size })` | Bold headers over rows; text columns start-aligned, numeric ones end-aligned, a rule spanning exactly the columns. `columns`, a `TableColumns`, is column centres, `{ left, right }` to spread the measured columns between two edges, or `{ left, gap }` to set them a gap apart; `at`'s x shifts them and its y is the header row's; the group's box is the table's measured extent. A row is an array of cells, each a `TableCell` (a string or a number), or a `TableRow`, `{ key, cells }` | below |
| `stat(s, title, value, { at, key })` | A title over a large value | `key:title`, `key:value` |
| `flow(s, names, { at, key })` | Named steps in boxes of one size, on a row centred at `at`, joined by arrows; long names wrap | each box `key:i` (`key:i:box`, `key:i:label`, a wrapped name's lines `key:i:label:j`), the arrow into it `key:i:arrow` |
| `bars(s, rows, maximum, { at, key })` | Bars on one scale with aligned starts; `at` is the first row's centre line, its x shifting the layout (at 0 the bars start at x = −4) | `key:i:label`, `key:i:track`, `key:i:bar`, `key:i:value` |
| `callout(s, target, text, { side, gap, color, size, key })` | `s.callout`'s picture: words beside a point, box or mobject with a leader line, on the stage's paper. Described by its words | `key:line`, `key:dot`, `key:backing`, `key:text` |
| `dimension(s, a, b, label, { offset, color, size, key })` | `s.dimension`'s picture: a dimension line in the look's emphasis. Describes itself, “A dimension line marked …” | `key:extension:start`, `key:extension:end`, `key:line`, `key:arrow:start`, `key:arrow:end`, `key:backing`, `key:text` |
| `pin(s, point, { label, color, size, side, key })` | `s.pin`'s picture. Describes itself, “A pin marked …”. `great-circle` pins its two cities on the globe | `key:needle`, `key:head`, `key:label` |
| `legend(s, items, { at, size, stack, gap, key })` | Swatches with words: each item, a `LegendItem` `{ label, fill?, stroke?, dashed?, name? }`, is a filled square, a short line or an outlined square (`fill: 'none'`), then its label in the look's ink. Entries stack in a column (`stack: 'column'`, the default) or sit in a row (`'row'`), the first starting at `at`. A repeated label or an entry with no swatch is refused. Describes itself as its pairs, “Key: purple fill, cat’s bits; dashed blue line, the browser”, naming each colour by its nearest plain name or the item's `name`, so a caption's colour word is said on the stage (`bloom-filter`, `wcag-map`, `trust-proxy`) | each entry `key:<label>`, its swatch `key:<label>:swatch` and words `key:<label>:text` |
| `card(s, rows, { at, align, width, title, columns, size, direction, lit, key, panel })` | `s.card`'s picture: labelled values on a panel, for a view's draw ([card and code](#card-and-codeblock)). `at: 'start' \| 'end'` and the field order follow the stage's direction. Describes itself, its lit row with its word | | |
| `code(s, lines, { at, align, size, title, diff, added, lit, width, fitHeight, key })` | `s.code`'s picture: code on a panel, one string per line. `at: 'start' \| 'end'` follows the stage's direction. Describes itself, its lit, added and removed lines with their words | | |

**Keyed cells.** A table keys every part, so the same row in two pictures is the same part and a keyed morph (a view's `sync()`, which matches by key) or a transition's `t.choreograph(view)` keeps it wherever it moves:

| Part | Key |
| --- | --- |
| The table | `key` |
| The header row; one header | `key:head`; `key:head:<header>` |
| A row; one cell | `key:<row>`; `key:<row>:<header>` |
| The rule under the headers | `key:rule` |

A column is named by its header. A row is named by its own `key` when given as `{ key, cells }`, or by its index when given as a bare array, so give rows keys whenever they can move, appear or disappear: a row keyed by index pairs with whichever row ends up in its place. Two rows with one key, a row keyed `head` or `rule`, and two columns with one header are refused with an error naming the table and the key. A row is one keyed part with its cells inside it, so `t.choreograph(view)` (which addresses a picture's outermost keyed parts) moves whole rows, while a keyed morph pairs each cell by its own key.

```ts
const rows = dict.entries.map((e, i) => ({ key: `e${i}`, cells: [i, e.key ?? '–', e.value ?? '–'] }));
table(s, ['Entry', 'Key', 'Value'], rows, { key: 'dict-entries' }); // dict-entries:e0:Key is entry 0's key, in every picture
```

The collection's scenes import the same functions through `explain/drawing.ts`.

### 3D: `seenFrom(model, viewpoint)`

`rayner/geo`, an opt-in entry point beside the drawing kit, draws 3D. `seenFrom` draws a 3D model through a viewpoint as ordinary keyed 2D mobjects. There is no second renderer: the result is a Group of paths and dots like any other picture, and the same model and viewpoint always draw the same picture.

```ts
import { seenFrom, latLon, circleOn } from 'rayner/geo';
import type { Model3D } from 'rayner/geo';

const model: Model3D = {
  body: { radius: 1, fill: '#eef5fb', stroke: '#59636e' },        // the sphere every part is seen against
  parts: [
    { kind: 'path', key: 'equator', lines: [circleOn([0, 0, 1], 90)], closed: true, color: '#59636e', hidden: 'dashed' },
    { kind: 'point', key: 'city:LHR', at: latLon(51.47, -0.45), color: '#1f2328' },
  ],
};
const globe = seenFrom(model, { kind: 'orthographic', yaw: -30, pitch: 40 }, { at: [0, 0], scale: 3 });
```

- **The model** is plain JSON: a `body` (the sphere, centred at the origin) and `parts`, each a `point`, a `path` (polylines drawn as one stroke) or a `face` (rings filled even-odd). A model point is a `Vec3`, `[x, y, z]`: x points to latitude 0, longitude 0, y to 90° E and z to the north pole. `latLon(lat, lon, r?)`, `greatArc(a, b, step?)` and `circleOn(pole, angle, r?)` (90° is a great circle) make points on the sphere, and `toLatLon(p)` gives a point's latitude and longitude back in degrees. Type a model `Model3D`, so each part's `kind` stays a literal: its `body` is a `Body` (`radius`, `fill`, `stroke`) and each part a `Part`, a `PointPart`, `PathPart` or `FacePart`, which a helper that builds parts returns.
- **The viewpoint** (type `Viewpoint`) is plain JSON state, `{ kind, yaw, pitch }`: the longitude and latitude that face the viewer, north up. `orthographic` looks from far away; `perspective` from `distance` radii (default 3); `gnomonic` from the sphere's centre onto the plane touching it at (pitch, yaw), out to `limit` degrees; `mercator` unrolls the sphere with `yaw` as the central meridian and clips to `window` (scene units) and `limit` degrees of latitude. The maps draw only parts that lie on the sphere, and no body, so a globe and its flat maps are drawn from one model.
- **Depth is an explicit order**, not a sort: far pieces (what the body hides), then the body, then the near surface (faces, paths, points), then what stands off the sphere on the near side. On a convex body nothing on the near surface can hide anything else there, so the order never depends on the viewpoint. A part's far piece is culled (`hidden: 'cull'`, the default; the option's type is `Hidden`), dashed and dimmed (`'dashed'`, for a translucent body) or drawn in its own style before the body (`'behind'`, for a part that sticks out past the limb). A point is always a Dot, transparent where it is out of sight.
- **Pieces are stable**: each part gives the same pieces at every viewpoint (its near piece keyed `key`, its far piece `key:hidden`), so a view's tween can redraw the picture frame by frame with `become`. A camera move is a tween of the viewpoint in the state, drawing `seenFrom(model, viewpoint(t))`; `between(a, b, t)` interpolates two viewpoints of one kind, turning yaw the short way. Frames stay a pure function of time, so a seek lands on the frame a full play shows.
- **`project(p, viewpoint, radius?, options?)`** returns where a point lands and whether it is seen, for a label beside a part.
- **`seenPictures(m)`** returns the seenFrom drawings in `m`'s family, outermost first. Each carries `seenPicture`, a `SeenPicture` (`{ viewpoint, radius, at, scale, window? }`, what it was drawn from), and each piece in it `seen`, a `SeenPiece` (`{ part, layer, surface, lines, shown }`, its part's key, its `Layer` of `'far'`, `'body'`, `'surface'` or `'above'`, and the model lines it draws), which `depthOrder` checks and a test reads (`henge` finds the part of a day's path behind the dome).
- **`depthOrder(picture)`** returns `true` when every seenFrom drawing in `picture` keeps the order (layers far, body, near; every far point hidden and every near point seen, from the viewpoint the drawing records; each piece drawn where that viewpoint puts it), a message naming the first part out of order, or `undefined` when there is no such drawing. Register it with `scene.addInvariant` and `rayner check` holds it on every frame. It rejects a picture whose viewpoint changed without a redraw, and a turn drawn by morphing between two endpoint pictures, which draws parts on their way behind the globe across its face (`test/seen-from.test.ts`). Turn the viewpoint with a view's tween, and change kind (map to globe) by clearing and entering.

The great-circle explainer draws Mercator's map, the globe and the gnomonic map from one model, and turns the globe with a view's tween over its pitch until the route is seen edge-on. The henge explainer draws New York's sky as a sphere: from outside (orthographic) with each day's path a small circle about the celestial pole, turned through the year by a view's tween over the orbital longitude; and from its centre (gnomonic), where the horizon and the street's vertical circle stay straight, lowering the gaze from the sky to the street with a view's tween over the pitch. A view from the centre draws the sphere as a map does, so a scene that wants a camera's left and right mirrors its model for that view. A face as large as a hemisphere is cut by the limb at two nearly opposite points, where the arc seenFrom draws between them strays off the limb; henge draws its ground and Earth's night side as eight sectors, rim to centre.

### Spatial direction

```ts
const s = stage(this, { direction: 'rtl' });
await s.card([['Count', 123]], { at: 'start' });
await s.card([['Count', 123]], { at: 'end', direction: 'ltr' });
```

In an RTL stage, the first card goes on the right, with its label on the right and its value on the left. The second goes on the left, where its override puts the label on the left and the value on the right. Values such as `123` retain their digit order. Titles follow the label's edge; rows retain their authored top-to-bottom order. Updates and marks keep those positions. A card or code panel a view draws with the kit's `card(s, …)` or `code(s, …)` is placed and laid out the same way, so it follows the stage's direction too.

Stage direction controls spatial placement separately from paragraph shaping. A Hebrew or Arabic paragraph can read right to left in an LTR card. A code panel placed at `start` moves with the region, while its code keeps its source order. Set Mermaid graph flow in its source (`graph RL`, for example); stage direction never rewrites or mirrors a diagram. The [layout-direction example](https://github.com/adewale/rayner/blob/main/scenes/explainers/layout-direction/scene.ts) shows both card orders together.

### Regions

Stage coordinates are 16 × 9 with the origin at the centre and y up. The heading sits at y = 3.8 (3.98 with a line, which sits under it); content belongs below y = 3.25, and `check` fails text that runs into the heading's number or line. Panel `at` accepts a region, point `[x, y]` or box `[minX, minY, maxX, maxY]`; diagram `box` accepts a region or box. A `Region` is one of the names below; a `StageRegion` adds `start` and `end`.

| Region | Box |
| --- | --- |
| `full` | `[-7.55, -4.25, 7.55, 3.25]` |
| `left`, `right` | the halves of `full` |
| `start`, `end` | Stage helper aliases for `left`/`right` in LTR; `right`/`left` in RTL |
| `main`, `side` | about two thirds left and one third right: a diagram beside a card or code |
| `top` | `[-7.55, -0.35, 7.55, 3.25]` |
| `bottom` | `[-7.55, -4.25, 7.55, -0.65]` |

`regionBox(region)` returns a fresh copy of a region's box, and `regionBox(region, { left, right, top, bottom })` one with those edges moved: `regionBox('top', { bottom: 1 })` is a shorter top, `regionBox('full', { left: -2.75 })` a column on the right.

Logical aliases work in `s.card` and `s.code` placement, `s.show`'s box and `s.carry`'s destination. The exported `StageRegion` type includes them. `regionBox`, direct panel constructors and physical names such as `left`, `right`, `main` and `side` keep fixed coordinates. Numeric points and boxes also stay fixed. A card's own direction override changes its fields; the stage's direction still resolves its region. `Text.anchor: 'start'` remains the physical left edge of its advance box.

## Diagrams

```ts
const d = await s.show({ source: 'graph LR\nA --> B', style: 'nord' }, { box: 'main', build: 'frame' });
```

The diagram spec accepts `lettering: 'natural'` to measure the active requested faces before layout and preserve label proportions. Without it, labels fit the captured widths. Natural capture uses Agentic Mermaid's public host-measurement hook; the snapshot records the font and measurement identity. Refresh with `rayner snapshots scene.ts` after changing the face, requested cuts or measurement inputs. [Diagram measurements](LETTERING.md#diagram-measurements) covers setup and compatibility.

**Building a source.** `mermaid` from `rayner/explain` builds the parts of a source the collection kept writing by hand, and refuses at the line that builds it what capture would refuse later:

```ts
import { mermaid } from 'rayner/explain';
const source = mermaid.pie(slices.filter((s) => s.value > 0), {
  title: 'One page of int rows', showData: true,
  config: { pie: { textPosition: 0.72 }, themeVariables: { pie1: '#d9480f' } },
});
```

`mermaid.frontMatter(config)` writes the `---` block with its `config:` (strings YAML would misread, such as a colour's `#`, are single-quoted), for any family, each value a `FrontMatterValue` (a string, a finite number, a boolean, or a map of them); `mermaid.pie(slices, { title, showData, config })` writes a pie, each slice a `PieSlice`, `{ label, value }`, and its options a `PieOptions`. A slice that is zero, negative or not finite, a repeated or quoted label, an empty title and an empty config map are refused with the value named. Mermaid draws no zero slice, so a model that can produce one filters it out first, as `pg-page` does; `ext4-space`, `gtfs`, `quotient-familial`, `tailwind-gamut` and `traffic-policy` build their front matter this way.

`s.show` builds the diagram in: its scaffolding, then with `build: 'all'` (the default) the rest in reading order, `runTime` per reveal (0.65 s by default). `build: 'frame'` draws only the scaffolding (axes, lanes, lifelines) so the story can arrive with `reveal`.

`reveal`, `walk`, `enlarge`, `morph` and `hide` are [actions](#actions): await one, or play it with others. `morph` reads the next diagram's layout when it is called, and a `play()` waits for that.

To measure a diagram before anything is drawn, lay it out without `s.show`: `new Diagram(scene, spec, await diagramResolverOf(scene).diagram(spec), { box })`, both from `rayner/explain` (the scene's `DiagramResolver` lays out a spec as its snapshot), is the diagram `s.show` would build, not yet on stage (`pen-and-pencil` reads its marks this way).

| Method | What it does |
| --- | --- |
| `d.reveal(n \| ids \| 'rest')` | Bring in the next `n` parts in reading order, named parts, or the rest |
| `d.order`, `d.visible` | The top-level parts' ids in reading order, and the set of those revealed so far, to read and not change: `d.reveal(d.order.filter((id) => id !== 'legend' && !d.visible.has(id)))` brings in all but the legend (`quotient-familial`) |
| `d.walk(hops, { parallel, color })` | A token travels real links; `parallel` runs several journeys in one play. To leave the path marked, draw `d.trail(hops)` in the diagram's picture |
| `d.picture(marks, { notes, dim, prefix })` | The diagram copied as it would be drawn with these marks, notes and dimming, for a view to draw from state (`s.diagramView` draws one). `marks` maps a part's id to a colour, or to `{ color, as }` to name the mark in the description; marked parts take the colour and thicker outlines, and labels keep their ink. `notes` are `PictureNote`s, `{ id, text, side?, color?, size? }`, short labels beside parts at a fixed readable size (`side`, a `NoteSide`, is `above`, `below`, `left` or `right`). `dim` lists the parts to keep: everything else fades, but links between kept parts, what a kept group draws inside it, and scaffolding stay, and dimmed parts keep 3:1 contrast with the paper. `prefix` goes before every key, so two pictures of one diagram can share the stage (`agentic-mermaid`, `feature-tour`). While the picture shows the diagram it is described as the diagram, marks, notes and dimming included, and it says what it marks is emphasis |
| `d.trail(hops, color?)` | The marks a walk's path leaves, said as travelled, for a picture's `marks` |
| `d.notePicture(id, text, { side, color, size, key })` | One note placed as a picture places it, for a view's draw (`exgit`, `fork`); keyed `note:<id>`. While the diagram is on stage the note is described among its parts, and otherwise by itself |
| `d.link(from, to)`, `d.showBy(view)` | A link's id, part and route; and show the diagram by `view`, a view of the scene's own already on stage: the live diagram leaves the stage, and the stage describes the diagram as the view shows it (`s.diagramView` calls it; `state-machine` draws its own) |
| `d.presentation` | How the diagram is on the stage now, a `DiagramPresentation`: `{ kind: 'detached' }` before it is built and after `d.hide()` or `s.clear()`, `{ kind: 'live' }` while its live parts are on stage, or `{ kind: 'viewed', view }` while a view shows it (`s.diagramView` or `d.showBy`; `s.liveDiagram` hands back). `reveal`, `enlarge` and `morph` move the live parts, so a viewed diagram refuses them: call `s.liveDiagram(d)` first |
| `d.enlarge(ids \| 'all', { zoom })` | Enlarge parts and their notes inside the diagram's own box (`zoom` above 1 goes closer), leaving what stands beside the box where it is; `'all'` puts the artwork back. The camera does not move: `s.focus` moves it. Enlarged parts are described as focused |
| `d.morph(next, { ops })` | Same-id parts move, arrivals fade in, departures fade out; the walk and enlargement reset. `ops` are Agentic Mermaid's edits, each a `MutationOp` |
| `d.hide()` | Fade the diagram out, or the view that shows it; the diagram is detached, unrevealed and at its home size, and `reveal` can bring parts back |
| `d.get(id)` | A part as a native `Group` |
| `d.shapes(id)`, `d.labels(id)` | A part's own drawn shapes in drawing order (a node's outline, a link's line and arrowhead, a task's bar), without its labels, the plates behind them or the parts it owns; and its own labels, each with the `text` it reads. Address a part's pieces through these, not through `d.get(id).children` (`cert-renewal` places a callout by a task's bar, `pen-and-pencil` reads a period's marks) |
| `d.emphasis` | The diagram's emphasis colour, as the stage's `s.look.emphasis` for its style: what `trail`, notes and walks colour with by default |
| `d.root`, `d.spec` | The group that holds the diagram's artwork, which `s.show` puts on the stage; and the `DiagramSpec` it was drawn from |
| `d.snapshot` | The captured snapshot the diagram is drawn from, a `DiagramSnapshot`, to read and not change: its `parts`, each with its shapes and text runs, and Agentic Mermaid's `findings`, a `Findings` (`ok` and its `warnings`, each a `Finding`; `agentic-mermaid` reads the verifier's report, `font-metrics` a label's captured run) |
| `d.findings()` | The verifier's warnings, each with the `part` it names |
| `d.describe()` | What a reader is told of the diagram as it is shown now: what it is and how big, then each shown part by its words in reading order, with its emphasis and notes (a `Description`, `{ what, parts, blank? }`, where `blank` lists drawn parts with no words). The stage's description and `describeExplainer`'s `picture` use it |

- Parts have semantic ids. Graph nodes use their Mermaid id. A bare name also finds a sequence participant (`actor:A`), a class (`class:Name`), an ER entity (`entity:Name`), or an architecture service, junction or group. Other ids look like `edge:A->B#0`, `bar:0:Jan` or `message:A->B#0`; read `d.parts` or the snapshot to find them.
- Reading order: graphs read nodes with their outgoing links, sequence messages keep source order and carry a token, git commits read left to right, bars grow from the baseline. Scaffolding builds first. Labels travel with their owners.
- `walk` throws on a hop the diagram does not have, requires the link to be revealed, follows its captured route, and records `{ step, from, to, edge }` in `state.walks`.
- With `ops`, `morph` replays the edits through Agentic Mermaid's `mutate` at build time and fails unless the result serializes to `next`. The failure names the difference: facts (states, transitions, nodes, edges) the edits leave that `next` lacks, or that `next` has and the edits do not make, with `remove_state` suggested for a state whose last transition was removed; or, when the facts agree, the first line where only the order differs, since order changes the layout. Without `ops` it is a visual transition only.
- `enlarge` is for a diagram that shares the stage with text beside it (send-sync, gtfs, fork). To look closer at the whole stage, move the camera with `s.focus`: it moves no point, so pictures and walks work the same while zoomed, and a label keeps its world size while the camera enlarges it on screen.
- One scene owns one clock: never start two plays at once, as `Promise.all` over actions would. Play what moves together in one play: `{ parallel: true }` for simultaneous tokens, or one `play()` of several actions and animations.
- Descriptions name a link by the labels at its ends ("Attacker → Load balancer"), and a class or ER entity by its name.
- The collection uses all 15 families. Captured diagrams use the 9 styles listed in `out/explainers/evidence.json` (the build's per-explainer list of families and styles, not step evidence); ring-buffer (dusk) and seasons (tokyo-night) use a style only as the stage palette, and token-bucket uses github-dark that way, a style feature-tour captures. Other styles are untested.

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
const hops: [string, string][] = [['off', 'on'], ['on_start', 'idle'], ['idle', 'brewing']];
await d.walk(hops);
// The path stays marked: the diagram is shown by a view that draws the trail (shown typed { walked?: [string, string][] }).
this.shown.walked = hops;
const v = s.diagramView(d, (_st, sh) => ({ marks: d.trail(having(sh, 'walked').walked) }));
```

- A composite `state on { … }` is a box with its name in a header. Its part id is `group:on`, and `'on'` finds it. A transition to or from the composite (`on --> off`) attaches to its border.
- `--` inside a composite splits it into concurrent regions, with a dashed line between them.
- `[*]` draws a start dot or an end state. Its id is `_start` (or `_end`) at the top level, `on_start` inside `on`, and `on__r2_start` in the second region of `on`. Descriptions call it "start of on, region 2". Read `d.parts` or the snapshot for other ids.
- A picture's marks, notes and dimming, and `walk`, work on composites and their contents. Marking `on` fills its whole box. Dimming with `dim: ['on']` keeps everything drawn inside `on` and fades the rest. `walk` follows real links only. An event that a child leaves to its parent is the parent's link (`on → off`), not a link from the child.
- A morph keeps every part whose id survives, so a composite and its states keep their identity. With `ops`, use Agentic Mermaid's state edits (`add_state`, `add_transition`, `remove_transition`, `make_composite`, `move_state` and others). The build replays them and requires the result to serialize to the next source. That source must include any state the edits declare explicitly, such as `off` once its last transition is removed. Agentic Mermaid 0.5.1 has no edit that adds a concurrency region, and it refuses `make_composite` after a `remove_transition` in the same list. Put `make_composite` first, or morph without `ops`, which is a visual transition only.
- Size the chart for the stage. Mermaid sets state names at 12 px and transition labels a little smaller, and `check` needs imported labels to reach 14 px at 1280 px. In the `full` region, that means the chart must lay out within about 930 × 460 of its own pixels. Set `direction` for the chart and again inside each composite to fit it: an outer `TB` with an inner `LR` cycle, or an outer `LR` with regions stacked by an inner `TB`. A four-state cycle in a row beside a second region does not fit. Split it across steps, or focus the camera on part of it.

Hand drawing is still justified when position itself carries meaning that a layout engine cannot keep. Examples are states that hold their grid cell while a flat machine becomes regions (the statecharts explainer), panels that must align so they can be compared, or a keyed `view` whose positions come from a model.

## Engine features

These are the engine's own features, imported from `rayner` (views and machines from `rayner/explain`; `Underline`, `Restore` and `TransformFromCopy` from `rayner/extras`) and used beside the helpers. Each guide explains one feature and ends with "In the explainers", what the scenes named here do with it; [the engine map](ENGINE.md) lists the guides by module. What you draw with them is a native drawing: keep it with `s.keep` or `s.enter`, with `describe` when it has no text of its own ([stage](#stage)).

<!-- generated from test/public-names.json by `node tools/repo/public-names.ts --write`: engine features -->
| Feature | What a scene uses | Guide | Used by |
| --- | --- | --- | --- |
| Matching transforms | `TransformMatchingText`, `TransformMatchingShapes` (`shapeKey()`), `TransformMatching` with your own key or `matchByKey()` (keyed components); `summary()`, `pairs`, `removed`, `added` | [Matching](MATCHING.md) | `TransformMatchingText`: `feature-tour`; `TransformMatchingShapes`: `glyph`; `TransformMatching`: `feature-tour`; `matchByKey`: `feature-tour`, `monty-hall`, `periodic-groups`, `python-dict`, `statecharts` |
| Diff-driven code morph | `new TransformDiff(before, after, { hunks })` and its `plan`; `diffLines`, `parseUnifiedDiff` for hunks | [Diff-driven](MATCHING.md#diff-driven) | `TransformDiff`: `feature-tour`, `mr-cache`; `diffLines`: `feature-tour`, `ical-recurrence`; `parseUnifiedDiff`: `feature-tour`; no explainer yet: `hunks` |
| Camera | `this.frame.animate.fit(...)`, `.reset()`; `s.focus` | [Camera](CAMERA.md) | `s.focus`: `feature-tour`, `lantern`, `pen-and-pencil`, `seasons`; no explainer yet: `this.frame.animate` |
| Emphasis that stays | `SurroundingRectangle`, `Underline`, `Cross`, `Brace`, `BraceLabel`, `Circumscribe({ keep: true })` | [Emphasis](EMPHASIS.md) | `SurroundingRectangle`: `glyph`, `mr-cache`, `ring-buffer`, `state-machine`; `Underline`: `feature-tour`; `Cross`: `fork`, `latest-search`, `ring-buffer`, `token-bucket`; `Brace`: `feature-tour`; `BraceLabel`: `exgit`, `glyph`; `Circumscribe`: `feature-tour`, `mr-cache`; `putAtTip()`: `feature-tour`; no explainer yet: `tip()` |
| Charts of the model's numbers | `NumberLine`, `Axes` with `plot`, `lineGraph`, `bar`, `dot`, guide lines, `areaUnder` | [Graphing](GRAPHING.md) | `NumberLine`: `feature-tour`; `Axes`: `feature-tour`, `seasons`, `token-bucket`; `plot`: `seasons`; `lineGraph`: `feature-tour`, `token-bucket`; no explainer yet: `bar`, `areaUnder` |
| Pictures rebuilt from state | `view(scene, draw)`, `view.sync()`; `viewMismatch`, and `assertViewFollowsState` in `test/lib/view-fidelity.ts` | [Views](VIEWS.md) | `view`: `2password`, `agentic-mermaid`, `cert-renewal`, `exgit`, `ext4-space`, `feature-tour`, `font-metrics`, `fork`, `glyph`, `great-circle`, `gtfs`, `henge`, `ical-recurrence`, `isdigit`, `just-bash`, `lantern`, `latest-search`, `layout-direction`, `monty-hall`, `oauth-pkce`, `periodic-groups`, `pg-page`, `python-dict`, `quotient-familial`, `ring-buffer`, `seasons`, `send-sync`, `state-machine`, `statecharts`, `token-bucket`, `traffic-policy`, `trust-proxy`, `tutorial/door`, `tutorial/hanoi`, `tutorial/lru-mru`; `view.sync()`: `2password`, `agentic-mermaid`, `cert-renewal`, `exgit`, `ext4-space`, `feature-tour`, `font-metrics`, `fork`, `gnome-files`, `gtfs`, `ical-recurrence`, `just-bash`, `lantern`, `layout-direction`, `monty-hall`, `mr-cache`, `oauth-pkce`, `pen-and-pencil`, `periodic-groups`, `pg-page`, `quotient-familial`, `ring-buffer`, `send-sync`, `statecharts`, `tailwind-gamut`, `token-bucket`, `traffic-policy`, `trust-proxy`, `tutorial/lru-mru`, `wcag-map` |
| Parts of a line of code | `code.span`, `code.token`, `code.lineSpan`; `new Code(lines, { spans })` with spans from `tools/repo/tokens.ts` | [Code](CODE.md) | `code.span`: `state-machine`; `code.token`: `exgit`, `state-machine`; `spans`: `mr-cache`, `state-machine`; no explainer yet: `code.lineSpan` |
| Restore, copies, sequencing | `saveState()` and `Restore`, `TransformFromCopy`, `Succession` | [Animations](ANIMATIONS.md) | `saveState()`: `feature-tour`; `Restore`: `feature-tour`; `TransformFromCopy`: `feature-tour`; `Succession`: `great-circle`, `just-bash`, `latest-search`, `monty-hall`, `oauth-pkce`, `ring-buffer`, `state-machine`, `statecharts`, `token-bucket`; no explainer yet: `restore()` |
<!-- end of generated engine features -->

Patterns these scenes write by hand, candidates for `explain/` once two explainers use one and its shape settles: a camera box that keeps the heading out; reading recorded evidence for counts on screen; lines between a matching transform's pairs; a code panel that leaves its `Code` loose for `TransformDiff`, which replaces it.

### Optional score audio

A step may supply `audio: {clips}`. Each clip has an `id`, an accessible `label`, `bpm`, `beats` and `notes`. A note has a MIDI `midi` number, an onset `at` and a `duration`, both in beats. Exported types are `ScoreNote`, `AudioClip` and `StepAudio` from `rayner/audio`.

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

`plot` is optional: `[left, bottom, right, top]` in scene coordinates. When present, a playhead travels from left to right over the clip’s full beat count. Draw notes from the same score data: horizontal position follows onset and width follows duration. The [melody and rhythm scene](https://github.com/adewale/rayner/blob/main/scenes/explainers/melody-rhythm/scene.ts) does this for two piano rolls.

The audio controls sit immediately below the picture, are in English and are marked `lang="en"`. Play brings the score and controls into view together when the screen can hold them. Each button’s accessible name includes its visible Play label and the clip’s description.

The reader synthesizes triangle-wave notes locally with Web Audio. Simultaneous notes share the monophonic gain to leave headroom for Pulse. Sound starts only after Play. Stop, a step or scenario change, Replay, and hiding or leaving the page cancel playback. Pulse adds a beat reference; changing it stops the current clip. Pages without audio omit this module and its styles. Captions and scores remain available without audio support; sound never advances the explanation.

Builds reject malformed clips: use one to four distinct lowercase ids, nonempty labels, 40–240 BPM, at most 64 beats and at most 256 notes per clip. MIDI pitches are integers from 0 to 127; every note must start at or after zero, have positive duration and end within the clip. Plot coordinates must be finite with positive width and height.

## Settings

```ts
static settings = [{
  id: 'request', label: 'Follow a request', default: 'hit',
  options: [{ value: 'hit', label: 'Cache hit' }, { value: 'miss', label: 'Cache miss' }],
}];
const which = settingsOf(this).request;
```

Every scenario is built ahead of time; run `check` or `review` to validate every scenario before publishing. A scene may have at most 64. Ids are URL-safe (`[A-Za-z][A-Za-z0-9_-]*`) and distinct; `step`, `sent`, `theme` and `parentOrigin` are reserved. Option values are unique and include the default. A setting may change diagrams, captions, numbers and which steps exist; keep the palette fixed. By default a scenario switch stays on the same named step (or falls back to the first when the new scenario lacks it). For a recipe-first catalog, set `static meta = { ..., scenarioNavigation: 'first' }`: switching scenarios opens the first step and the transcript links to each scenario's first step. Direct `?step=` links, including later steps, still work.

`resolveSettings(Scene, values)` validates a scenario's values, a `Settings`, against the scene's class, an `ExplainerClass` (a `Scene` class with its optional `meta` and `settings`), and returns them with each setting left out at its default. For tests and tools, `rayner/testing` has `withSettings(Scene, values)`, which binds a scenario without mutating the class; `scenariosOf(Scene)`, which lists every scenario; `scenarioName(Scene, values)`, which gives "Label: option · Label: option"; and `bindSnapshots(Scene, store)`, which binds a snapshot store.

## Describe

`describeExplainer(Scene, { snapshots?, drawings? })`, from `rayner/testing`, returns the explainer as one JSON-safe object for agents and tools: `schema` (1), `id`, `title`, `lang`, `sources`, `settings`, `answer` and `questions` when the scene declares them, and `scenarios`. Each scenario has its setting `values`, its `name` ("Label: option"), its `duration`, its `paper` (the stage's paper colour when the scenario ends, absent for a scene without a stage), its `invariants` (the names of the invariants the scene registered with `addInvariant`, which `rayner check` checks on every frame; absent when none), its `machines` (each [machine](MACHINES.md)'s `events`, `start`, the number of `states` its events reach from `start`, `sampled` when that count reached the machine's limit, and `step`, the step it last played in, where a reader can drive it; absent when none) and its `steps`. Each step has its `step` name, `title`, `line`, `caption`, `start`, `end` and `hold` in seconds, the `state` the scene recorded (`scene.state` when the step ends), `shown` (what the scene showed apart from the model, without the picture's description, which is `picture`; absent when nothing was), `changed` (each value the step changed, as `{ before, after }`, with a side left out when the value was not set), `watched` when the scene declares [`meta.watch`](#scene) (the step's watched changes as the player shows them, `{ label, before?, after? }` formatted strings, at most four), the resting `picture` in words, its `events` when a machine replayed some in the step, and its `drawing` as text unless `drawings: false`. `drawings: 'name'` draws only the step of that name, which is how `rayner see` draws the one step it prints.

The object is typed `ExplainerDescription`, each scenario a `ScenarioDescription` and each step a `StepDescription`, all from `rayner/testing`. It runs the scene once per scenario, in Node or a browser, with no Chromium. A scene with diagrams needs its pinned snapshots (`snapshots`, as `rayner` reads them from `scene.snapshots/`) or it throws. `rayner describe <scene>` prints the same object; `--out file.json` writes it. Diagram labels are outlines, so the text drawing shows them as strokes; their words are in `picture`.

In a script, load the snapshots from `scene.snapshots/` (`index.json` names each diagram's file) and walk the scenarios and steps. This prints each step's caption and the state keys it changed:

```ts
import { readFile } from 'node:fs/promises';
import { describeExplainer } from 'rayner/testing';
import type { SnapshotStore } from 'rayner/explain';
import Scene from './my-explainer/scene.ts';

const folder = new URL('./my-explainer/scene.snapshots/', import.meta.url);
// A scene that draws no diagrams keeps no scene.snapshots/.
const index = JSON.parse(await readFile(new URL('index.json', folder), 'utf8').catch(() => '{"diagrams":{}}'));
const snapshots: SnapshotStore = {};
for (const [key, file] of Object.entries<string>(index.diagrams))
  snapshots[key] = JSON.parse(await readFile(new URL(file, folder), 'utf8'));

const d = await describeExplainer(Scene, { snapshots });
for (const c of d.scenarios)
  for (const s of c.steps)
    console.log(`${c.name || d.title} · ${s.step}: ${s.caption}\n  changed: ${Object.keys(s.changed).join(', ') || 'nothing'}`);
```

`npm run pack:smoke` runs this block against the packed package. `rayner see <scene> [step]` prints one step of the same description for a person at a terminal. `npm run site:export` publishes the description beside each page as `<id>.json`, and lists every explainer in `llms.txt` at the site root.

## Testing and tooling API

The package has an entry point per audience. A scene is written with `rayner` (the engine), `rayner/explain` (the stage, diagrams, cards, settings, and pictures of state: views and machines), and `rayner/drawing` (the kit). Three entry points are opt in: `rayner/geo` (`seenFrom` and the globe), `rayner/audio` (the score types for a step's `audio`) and `rayner/extras` (`Write`, `TransformFromCopy`, `Restore`, `MoveAlongPath`, `ArcBetweenPoints`, `Square` and `Underline`: Manim's conveniences, each a shorthand for something in `rayner`, kept for ported scenes and the feature tour). `rayner/output` draws a scene's frames outside the built page, for a host page or a tool. `rayner/testing` is for an author's tests, scripts and tools, and the `rayner` command is built on it; no scene may import it (`test/scene-imports.test.ts`). Both are public, and kept stable like the drawing API.

| Export | From | What it is for | Guide |
| --- | --- | --- | --- |
| `renderAt`, `indexScene`, `stepTime`, `SeekSink`, `NullSink` | `rayner/output` | The scene at one time or step, without drawing the frames before it | [Scene outputs](SCENE-OUTPUTS.md#time-and-step-semantics) |
| `SnapshotSink`, `StringSink`, `toSvgString`, `renderElements`, `renderText`, `DomSink` | `rayner/output` | One SVG frame, every frame, element records, a text drawing, the live DOM | [Scene outputs](SCENE-OUTPUTS.md#public-output-apis) |
| `StopScene` | `rayner/output` | What a sink throws to stop a run (a seek does); a `catch` must rethrow it | [Fundamentals](ENGINE-FUNDAMENTALS.md#updaters-derived-pictures-and-seeking) |
| `traceScene`, `TraceSink` | `rayner/testing` | Every step's timing, state before and after, `shown` and evidence, in one run, typed from the scene class (`TraceOf`, `Jsonified`) | [Scene outputs](SCENE-OUTPUTS.md), [fundamentals](ENGINE-FUNDAMENTALS.md#steps-state-and-evidence), [typed traces](#typed-traces) |
| `InvariantSink`, `MotionSink`, `analyzeMotion` | `rayner/testing` | Check every frame against the scene's invariants, and motion for pops, cuts and teleports, in a test | [Testing](TESTING.md), [invariants](EXTENDING.md#hold-an-invariant-on-every-frame) |
| `viewMismatch`, `machinesOf` | `rayner/testing` | Whether a view shows the state it claims; a scene's machines, to drive or explore from a test | [Views](VIEWS.md), [machines](MACHINES.md) |
| `loadFonts`, `takeMissingGlyphs` | `rayner/testing` | Load the embedded fonts before drawing text outside a scene's run; the characters drawn with no glyph | [Scene](#scene) |
| `perf` | `rayner/testing` | Counters, spans and a trace-event export for profiling | [Profiling](ENGINE-FUNDAMENTALS.md#outputs-checks-and-performance) |
| `jsonObject` | `rayner/testing` | Validate and clone state under the trace's JSON rules | [Scene](#scene) |
| `describeExplainer` | `rayner/testing` | The explainer as one JSON object: scenarios, steps, state, pictures in words and as text | [Describe](#describe) |
| `scenariosOf`, `withSettings`, `scenarioName` | `rayner/testing` | Every scenario, a class bound to one, and its name | [Settings](#settings) |
| `withIntent` | `rayner/testing` | A scene class with its script's intent adopted, for a test that runs it directly | [Scene](#scene) |
| `bindSnapshots` | `rayner/testing` | Run a scene with diagrams outside the CLI, from its pinned snapshots | [Describe](#describe) |
| `loadProject`, `loadSnapshots` | `rayner/testing` | An explainer loaded from its folder, as the command runs it: its script's intent, its pinned snapshots and lettering, and every scenario's typed trace; or its pinned snapshots alone | [An explainer's test](#an-explainers-test) |
| `pictureWordsAt` | `rayner/testing` | A step's picture in words, as the stage's description, the player's list and the page's transcript say it | [An explainer's test](#an-explainers-test) |
| `diagramFindings` | `rayner/testing` | A pinned snapshot's verifier warnings, each with the part it names, as `d.findings()` gives them | [Diagrams](#diagrams) |

`shaperFor` stays in `rayner`, and `refuse` and `isRefusal` (a model's refusal of an event, [machines](MACHINES.md#refused-events-bounds-and-authored-transitions)), `settingsOf` and `resolveSettings` in `rayner/explain`, since models and scenes call them.

The collection's own tests show each in use: `test/lib/explainer-state.ts` compares a trace with a model, and `test/lib/view-fidelity.ts` compares a view with the traced state at every step.

### An explainer's test

An explainer's `scene.test.ts` loads it from its folder and reads each scenario's trace:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadProject, pictureWordsAt } from 'rayner/testing';
import Explainer from './scene.ts';

test('every scenario says what the model computed', async () => {
  const project = await loadProject(Explainer, import.meta.dirname);
  for (const { values, trace } of project.scenarios) assert.ok(trace.steps.length > 0, JSON.stringify(values));
  const { trace } = project.scenario();
  assert.match(pictureWordsAt(trace, trace.steps[0]!.step).full, /\S/);
});
```

`loadProject(Scene, where)` takes the scene class and its file, or the folder holding `scene.ts`. It adopts the intent of the `script.md` beside the scene, gives the scene its folder's name as `meta.id` when it declares none, reads `scene.snapshots/`, and traces every scenario in `scenariosOf` order against those snapshots. It returns a `LoadedProject`, `{ Scene, snapshots, scenarios, scenario(values?) }`: each scenario is a `LoadedScenario`, `{ values, Scene, trace }`, its `Scene` bound to its values and the snapshots, and `scenario(values)` is the scenario those values choose with every other setting at its default, as a page link chooses one. A scene with `meta.lettering` draws from the `scene.lettering.json` beside it, as its page does: outline lettering (faces, styles, maths, or a script the subset faces lack) is bound to the class from the snapshot, and subset lettering puts its cut faces in place for the scenarios' runs and takes them away after, so run one `loadProject` of a subset-lettered scene at a time. It captures nothing: a diagram with no pinned snapshot fails, and so does lettering with no `scene.lettering.json`, or one pinned for another request, so run `rayner snapshots` first. It runs none of the checks, which are `rayner check`'s. `loadSnapshots(where)` reads the pinned snapshots alone, for a test that builds or inspects one diagram. Both read files, so they run under Node.

#### Typed traces

A trace is typed from the scene class: `traceScene(Explainer)` returns a `TraceOf<typeof Explainer>`, and `loadProject(Explainer, where)` a project whose every trace is one. For `class Explainer extends Scene<S, Sh>` that is a `Trace<Jsonified<S>, Jsonified<Sh> & SceneState>`, so `trace.steps[i].after` reads as the model type and `shown` as the shown type, with what helpers add to it (the stage's `picture`) as `unknown`. `Jsonified<T>` is `T` as the trace's JSON copy holds it: strings, numbers, booleans and null stay, arrays and objects map their items and fields, an object field that may be undefined stays optional, and functions, symbols and bigints are `never`. A JSON-safe model type maps to itself, so a trace's state goes wherever the model's type does. An untyped scene, or a class typed `any` (a dynamic import), gives a plain `Trace`, whose states are JSON records. `withSettings` and `bindSnapshots` return the class typed as the one they bind, so `traceScene(withSettings(Explainer, values))` is typed as well.

```ts
import { having } from 'rayner/explain';
import { loadProject } from 'rayner/testing';
import type { TraceOf } from 'rayner/testing';
import Explainer from './scene.ts';

/** A check handed a trace declares its type from the scene. */
export function check(trace: TraceOf<typeof Explainer>) {
  const { log } = having(trace.steps.at(-1)!.after!, 'log');   // the race's shape of a union model
  return log;
}
const { trace } = (await loadProject(Explainer, import.meta.dirname)).scenario();
check(trace);
```

A trace types every step's state as the scene's model. A step `s.steps` shows records its own state, which the model type covers only when the scene declares it: a union of its shapes, or one record whose per-step parts are optional ([typed state](#typed-state-and-shown)). A test reads a union's shape, or an optional part, with `having(state, ...keys)`, which throws for a state that lacks one. A test that reads a staged step's state outside the declared model reads a plain `Trace` instead.

`pictureWordsAt(trace, step)` gives the picture at the end of the named step in words, as a `PictureWords`, `{ summary, full, transcript }`: `summary` is the stage's accessible description (what is shown, what is emphasised, what is new), `full` is everything shown as the player lists it, each thing's emphasised parts first, and `transcript` is `full` as the page's transcript reads it, where a thing whose parts are as in the previous step lists only its emphasis. Each is plain text. A step name the trace does not have throws.

## Snapshots

Every command except `init` runs every scenario, captures any diagram missing from `scene.snapshots/` beside the scene (a scene with no diagrams keeps no such folder), and deletes unused ones; `rayner snapshots` stops there. Commit the folder; `index.json` maps each diagram's key to its own file. A diagram is captured again when its spec changes, which changes its key, or when a different Agentic Mermaid release captured it; a change to Rayner's own capture code does not invalidate the cache. `--refresh` recaptures everything, and CI captures every committed snapshot afresh and fails on any difference (`test/snapshot-capture.test.ts`). Capture needs Chromium and the `rayner-cli` package ([the README's quick start](../README.md#quick-start)).

Capture asserts that its output equals Agentic Mermaid's `renderMermaidSVG` byte for byte, and fails on SVG it cannot convert (unsupported paint, masks, filters). Chromium resolves CSS, transforms and markers at build time with network requests blocked. The page receives resolved geometry and text runs; it never runs Agentic Mermaid.

## Checks

`rayner check` runs every scenario and fails on:

| Check | Rule |
| --- | --- |
| Model test | The `model.test.ts` beside the scene fails. `check` runs it first, with `node --test` in a child process (only that file: other tests in the folder, such as `scene.test.ts`, run the scene, which check runs anyway, and belong to the project's test suite), and names each failing test with the first lines of its error. A `rayner` import Node cannot resolve from the folder is the Rayner running the check. The report records it as `model: { file, tests, passed }`, with `skipped` when some tests were skipped (they are not counted in `tests`); a folder without a model test has no `model` |
| Catch lint | A `try`/`catch` or `.catch()` around awaited code in `construct()` |
| Motion | Any pop (opacity changes by 0.5 or more in a frame), cut-in or cut-out, teleport or resize spike, flicker, or misplaced handoff |
| Hold | The picture changes after a step's caption hold begins, where the player stops |
| Views | At the end of every step, a [view](VIEWS.md) on the stage whose words, or whose parts' kinds, text, boxes and opacity, differ from a fresh draw of the step's state placed where a sync would put it (a card's lit row and a code panel's lit bar included); or a view whose draw ignores its state, drawing the same picture from that state with every value changed, from the empty state and from every step's recorded state (a view first seen with an empty state is exempt). Each `s.steps` picture is a view of its step's state, so this covers staged steps |
| Keys | Two parts on the stage with the same `key` at the end of a step, so `find` would answer with whichever comes first |
| Machines | A state some [machine](MACHINES.md)'s events reach, from its start or from its state at its live step, collides, has a label under 14 px, has no description, does not show its state, or is described exactly as another reachable state; an authored transition breaks an invariant on the way or does not end on the pictures of the state it reaches; a `bound` stops an event the model refuses anyway; the machine's views are not on the stage of the step it last played in. Each is reported by its shortest events |
| Invariants | An invariant the scene registered with `this.addInvariant(name, check)` fails on any frame of the full run, mid-animation included, or never holds on any frame (it found nothing to check: a key it reads may be misspelt); the report lists the frames each invariant held on (`invariants`) |
| Seek | A seeked frame differs from the played frame, at three frames per step: its middle, its second-last and its resting frame, the one a link shows |
| Landing | A step's picture as it ends, after its last play has finished and left the stage, differs from its resting frame: an animation's `finish()` must land where its last frame drew, since describe and the shots draw each step as it ends |
| Trace | The trace with frames skipped differs from the played trace |
| Step change | A step's resting picture, ignoring the heading, equals the previous step's. The camera's view is part of the picture, so a camera move alone is a change |
| Text | Native text in a resting picture overlaps other text, runs into the heading's number or line, or is cut by the stage edge or the edge of the camera's view; text wholly outside the view is off screen and not judged |
| Routes over labels | A visible native or imported connector crosses label ink, accounting for stroke width, paint order, genuine endpoint attachments, camera and descendant clips; an opaque label plate counts only where it actually covers the crossing |
| Legibility | A native label never reaches 14 px at a 1280 px stage in a frame where it is drawn (opacity and draw fraction at least 0.95) and inside the camera's view; an imported label never reaches 14 px in a resting picture inside its diagram's viewport. Sizes are on screen: world size × the camera's zoom, min(16 ÷ view width, 9 ÷ view height). A native label counts at that zoomed size only in a step's completed frame; in other frames it counts at no more than its size with the camera home, so a camera gliding past does not make it read |
| Words | A kept drawing with no text and no `describe` |
| Looks | A step's caption names a colour (red, purple, grey and the rest) or a pattern (dashed, dotted, striped, hatched) that no word on its stage says: visible text, a diagram label, or a part that describes itself, such as a `legend`. The caption may lean on the drawn title and line; the line is held to the rest of the stage, unless it keys the look itself (`Red: the plane’s route.`). Emphasis and dimming words (outlined, bold, faded) are not checked, since the picture carries their meaning, and `NOT_A_LOOK` in `explain/caption-looks.ts` lists the phrases whose colour word is not a look, each with its reason (`red-black tree`, `whitespace`). A `describe` does not count: only a screen reader hears it |
| Bare runtime | The scene, bundled, gives different steps or state in a context with no DOM, Node, timers or console |
| Glyphs | Any text the embedded fonts, and the lettering the explainer asked for, cannot draw (every command checks this) |
| Answer | A declared [`meta.answer`](#scene) that no teaching step's title, line or caption states (see `script` below) |
| Checked against | A path in backticks in the script's Checked against line (a word with a `/` or a file extension, such as `` `model.test.ts` `` or `` `fixtures/xstate.json` ``; a URL or a package such as `` `x@1.0` `` is not one) is not a file or folder in the explainer's folder, or points outside it. Name the folder's own evidence this way; refer to anything else in plain words. The report lists the paths as `checkedAgainst` |
| Script answers | The script's answer or a reader question's answer differs from what the folder's `answers.ts` computes from the model, compared as for Answer (ignoring case, quote style, spacing and final punctuation). `answers.ts` exports `answer`, a function returning the answer, and `questions`, an object whose keys are the reader questions' numbers from 1 or the questions themselves and whose values are functions returning the answer, or `{ question, answer }` to hold the question too. A number or question the script does not have fails. The report records `answers: { file, compared }`, where `compared` counts the parts compared (the answer counts as one) |

The report goes to `out/checks/<id>/report.json`. For each scenario it holds the full step trace, each step's resting picture as a rough text drawing (`restingFrames`: boxes and lines, with diagram labels as bars), and label sizes (`legibility`):

| Field | Measure |
| --- | --- |
| `minLabelPx1280` | Smallest label on a 1280 px stage |
| `minLabelPx390`, `labelsUnder12PxAt390` | Estimated smallest label, and labels under 12 px, using close-ups at the minimum 358 × 201.375 px stage geometry. `phoneEstimate` records this assumption; actual stage height depends on the served viewport and headings and is measured by `rayner review` |
| `labelsOutsideCloseUpsAt390` | Labels no estimated close-up shows whole; inspect actual coverage with browser review |
| `minLabelPx390WholeStage` | Smallest label on that phone without close-ups |

A picture label that no close-up shows whole is measured at the step's opening zoom, where a reader panning to it finds it. The stage's heading (number, title and line) is not measured on the phone: a narrow stage draws its pictures without it, and the player sets the step's number, title and line as page text under the stepper row. It is measured at 1280 px. A drawing can therefore fill the stage, and a step can open on the whole picture, without the heading's small line counting against it. `smallLabelsAt390` lists the labels under 12 px, smallest first, each with its words, phone size and step.

`watch`, for a scene that declares [`meta.watch`](#scene), gives each step's formatted changes (`{ step, changes, unformatted }`), where `unformatted` names the watched keys skipped because their value cannot be said briefly. It is reported, not gated.

`script` is the script gate: `answer` (the teaching step that first states [`meta.answer`](#scene), as `{ step, at }`, or null), `questions` (how many reader questions the page asks after its last step), `missing` (`answer`, `questions` or both when undeclared) and `problems`. A declared answer that no step states fails `check`; where a stated one first appears is reported, not gated; an undeclared one is reported as missing.

The phone sizes are reported, not gated; every demo scenario reports no label under 12 px. A close-up zooms on top of the author's camera, so its sizes multiply the camera zoom by the close-up's.

Motion is measured on screen, after the camera: a smooth camera move reports nothing, and moving `this.frame` without `.animate` (a cut) reports a teleport for everything in view. A shape that appears over a shape that stays and is no less opaque is not a cut-in when it is a `TransformFromCopy` copy of that shape, or when every shown part of it has the same outline (`shapeKey()`) and the same fill and stroke presence as a part of the staying one. A brighter shape over a faint one, a filled shape popping inside an outline, a hand-made `Transform(t.copy(), other)` that changes glyph shapes on its first frame, and a shape appearing elsewhere are cut-ins.

These checks establish deterministic behaviour and readable pictures. They do not establish that a caption is true: test each model against its source.

## Command line

### Reader review

`rayner review scene.ts` runs `check`, builds a temporary page and visits every resting step of every scenario at 390 and 1180 px in Chromium. It checks actual painted subjects, caption text, complete close-up tours, page overflow, console errors and outside connections. It retains the reviewed `scene.html`, its receipt, header recipe and `loader.js` alongside screenshots and `review.json` under `out/review/<id>/`. `--out <directory>` changes that directory; `--out public/example.html` saves the exact reviewed page there while keeping review reports in the default directory. A failed run removes the success receipt and preserves the previously reviewed page.

At each [live step](MACHINES.md#the-player) the review also opens the pictures a reader reaches by pressing its events, by their links (`?step=…&sent=…`), at 390 and 1180 px: every state one press from where the reader's events start (however many), then breadth first the states further on until six, the farthest state the machine reaches being the sixth, each by its shortest events. There it checks what applies of a resting step: the step's caption, no notice, the events kept in the URL, no page overflow, the stage painting exactly the records the state draws in Node, and the reader's views (the whole picture, then on a phone the step's close-ups) showing what the events newly emphasised, else the artwork they changed, whole and unclipped. It also checks that the buttons are what `outcome` gives from the state, and that every label the whole picture paints reads at least 14 px as at a 1280 px stage, measured from the served page's transform. The receipt lists each visited state under its scenario's `live`, with its events, the views and subjects it verified, its smallest label and, at 390 px, the smallest label of what changed at its best view, and counts them as `liveStateWidths`. At 390 px every label of what the events changed must read at least 12 px in the whole picture or one of the step's close-ups, since a reader who presses must be able to read what the press did; the review fails a state where one does not, naming each label, and the catalog review fails a receipt that records one. The catalog review takes each scenario's live steps from the built description and fails a receipt that skips one.

Main steps with independently declared opening subjects additionally open fresh at 320×568. Those subjects must be complete in that first view, with labels at least 12 CSS pixels high. The receipt records those checks and names excluded steps; detailed source tours still use the full two-width review.

Helpers supply subjects automatically. For a subject the caption names, or a step with unchanged artwork, declare it in `scene.review.json` beside `scene.ts`:

```json
{
  "version": 2,
  "subjects": [
    {
      "step": "request",
      "settings": { "request": "hit" },
      "opening": true,
      "targets": [{ "key": "Cache" }, { "text": "Database reads" }]
    }
  ]
}
```

`settings` selects scenarios and may be omitted. `opening: true` requires the subjects in the initial view; otherwise the close-up tour must cover them. Each target names a semantic `key` or exact label `text`; `paint: "stroke"` requires route ink, so an arrow's label alone cannot satisfy it. Unknown scenarios, missing steps and missing subjects fail. `--subjects <file>` selects another subjects file. (Claims are a different thing: sentences in `meta.claims`, each tied to a test.) Write expectations from the explanation's meaning, independently of the close-up planner. These checks cannot establish that arbitrary prose or a model is true.

Removing a callout can reveal background ink and make it part of the automatic changed-artwork inference. Name the caption's actual comparison with `s.opening(...)` and independently declared subjects ([the phone's opening](#the-phones-opening-emphasis-and-review-subjects)). Include earlier evidence that the comparison still needs, such as June's daylight span beside December's. Give repeated labels scoped keys so a field inside a result card can be distinguished from the same words in its context diagram.

The collection's reviewer (`npm run demos:review`) reads each scene's `scene.review.json` as `rayner review` does. Its parallel receipts include the `.review.json` files in their review fingerprint, so an older review cannot satisfy changed expectations. For a highlighted cell or boundary, name the outline's key with `paint: "stroke"`; checking its label does not prove that the outline exists.

`rayner <command> <scene.ts | directory> [options]`. The command is the `rayner-cli` package, installed beside `rayner` at the same version (`npm install --save-dev rayner rayner-cli`); in a checkout, run `npm run rayner -- <command> ...`. `rayner --help` prints the commands and Chromium setup instructions.

| Command | What it does |
| --- | --- |
| `init <directory>` | Write the tutorial's explainer: `script.md`, its intent; `scene.ts` with one setting; its model `model.ts`; and `model.test.ts`, which tests the model against published examples. With `--machine`, write a [machine](MACHINES.md) explainer instead (a door that opens, closes, locks and unlocks): `script.md`; `model.ts`, whose `next` refuses events with `refuse(reason)`; `model.test.ts`, which pins every event from every state and every reason; `picture.ts`, which draws the state; `scene.ts`, a view of the state and a machine whose last step is live; and `scene.review.json`. It passes `check` and `review` as written |
| `preview <scene>` | Build and serve the page; use `shots` for a contact sheet |
| `snapshots <scene>` | Capture and verify diagrams; replay morph edits |
| `check <scene>` | The checks above, starting with the folder's `model.test.ts` when there is one |
| `review <scene>` | The checks, then [served-reader review](#reader-review) of every scenario and step at both widths, and of the live states a reader reaches by pressing events |
| `build <scene>` | The page, its receipt, its header recipe and `loader.js` |
| `shots <scene>` | A contact sheet of every step, as SVG and PNG |
| `describe <scene>` | [`describeExplainer`](#describe) as JSON: every scenario and step, with words, state, what changed and the picture in words and as text |
| `version` | Print the command's version (`rayner-cli`'s, which is also the version of `rayner` it requires); `--version` does the same |
| `help` | Print the commands and options; `--help`, or no command, does the same |
| `see <scene> [step]` | One step of [`describeExplainer`](#describe)'s description: its resting picture drawn as text, then its title, caption, the picture in words and what it changed in `scene.state` (`key: before → after`). The last step by default; needs no browser, so an agent can read a scene from a terminal |

| Option | Applies to | Effect |
| --- | --- | --- |
| `--out <path>` | all but `init` and `snapshots` | The output file; for `check`, the report's directory; for `review`, a report directory or an `.html` destination; for `see`, the resting picture as SVG (nothing is written without it). Defaults under `out/` in the current directory |
| `--refresh` | all but `init` | Recapture every diagram |
| `--scenario id=value` | `shots`, `see` | One scenario; repeat for several settings |
| `--port <n>` | `preview` | Default 5174 |
| `--watch` | `preview` | Rebuild the page when a `.ts`, `.mts`, `.js` or `.mjs` file beside the scene changes; reload the browser to see it. It does not react to `script.md`: rerun `preview` after editing the script |
| `--subjects <file>` | `review` | Read the [review subjects](#reader-review) from this file instead of `scene.review.json` |
| `--machine` | `init` | Write the machine starter instead of the tutorial's explainer |

`CHROMIUM_EXECUTABLE_PATH` selects a Chromium for capture; otherwise it is looked up in `PLAYWRIGHT_BROWSERS_PATH` and Playwright's cache. If an authoring package is missing, the command prints the line that installs it.

`node tools/repo/tokens.ts <file | -> [--lang ts|js|python|bash|elixir] [--theme dark|light] [--engine auto|shiki|fallback]` prints syntax colours as `ColorSpan`s for `new Code(lines, { spans })`, to check in beside the scene. It runs from a checkout and is not part of the package; [the code guide](CODE.md#the-tool) describes its engines.

## Page

`build` writes one self-contained HTML file: one explainer, all its scenarios, a poster, a transcript, sources and licence notices. It makes no network requests and uses no storage.

Diagram payloads are compressed losslessly inside the page and decoded with the browser’s native `DecompressionStream` API before the player starts. The transcript remains readable without JavaScript. Builds enforce limits of 1.5 MiB for raw HTML and 450 KiB for its gzip representation, including the poster and transcript, and a scene may have at most 64 scenarios ([settings](#settings)), each of which adds to the page. Receipts report `bytes` and `gzipBytes`. Reduce scenarios or split an explanation that exceeds either budget.

The transcript lists, for every scenario, each step as a link to it, its caption, a "What changed: Label: before → after; …" line when the scene declares [`meta.watch`](#scene) and the step changes a watched value, a live step's events ("Try it yourself: press push, pop."; "from the beginning, press …" when the step played every event its story has), and what its resting picture shows. Without JavaScript every scenario shows. The player shows the current scenario's section, and its links move the player.

### URL parameters

| Parameter | Effect |
| --- | --- |
| `step=<name>` | Open at that step's resting picture |
| `sent=<event>,<event>,…` | At a [live step](MACHINES.md#the-player), the events the reader sent, replayed onto its resting picture in order. Events are separated by commas, a space is `+` and a colon stays a colon: `sent=open+B:+goat,stay` |
| `<setting id>=<value>` | Choose a scenario; missing settings use defaults |
| `theme=light\|dark\|auto` | Player chrome only; default `auto`, the device's scheme. The loader passes the host page's scheme |
| `parentOrigin=<origin>` | Set by the loader; the exact HTTP(S) origin that receives resize and step messages and may send goto messages |

An unknown setting or value resets every setting to its default, and a notice names what was wrong. A step the scenario lacks opens the first step, with a notice. Events in `sent` are checked against the step's machine before anything is drawn: the longest prefix it takes is replayed, and a notice names the first event it refused or that is past where the story stops; events for a step with no machine are left out, with a notice. Showing another step, switching scenarios or opening a link without `sent` clears the events. Switching scenarios keeps the step by name. Back and forward restore scenario, step and events. Copy link keeps scenario, step and events and drops `parentOrigin`. On a page `site:export --origin` published, `<meta name="rayner:share">` names the share base and `<meta name="rayner:share-steps">` lists the published teaching steps. Copy link uses `<origin><path>/<id>/<step>` only for a listed step in the default scenario with no events sent. Other scenarios and detail steps retain query links. A share link drops `theme`.

### The tile

The explainer is one tile. Everything the page shows is inside one bounded object with one edge and one surface: the card's header (the title, the page's one `h1`, and the scenario picker) over a rule, the stage mounted under it, the stepper row, the step's words, then closed rows for the steps (on a narrow page) and the transcript, and a footer. By default, on a page at least 1100 px wide the steps rail is the tile's second pane, behind a rule that runs the tile's height; its list stays in view as the page scrolls. The footer holds the Rayner mark, linking to the project, and, inside any frame, **Open the explainer**, which opens the page at the reader's step and scenario in a new tab. Nothing is drawn over the stage. Outside the tile a standalone page has only its background. The player defaults to neutral greys with an ink primary action. Opt in on one explainer with `static meta = { …, player: { accent: true, paper: true, corners: 'square', minStageWidth: 880 } }`. All fields are optional: `accent` takes the current scenario's stage palette accent; `paper` uses its paper for the page and tile surface (replacing the former automatic 10% tint); `corners` is `'rounded'` (default) or `'square'`. Without a stage, colour cues stay neutral.

`meta.player.minStageWidth` sets a standalone page's preferred minimum stage width in CSS pixels, including in **Enlarge**. Only positive, finite numbers take effect; values above 4096 are capped. The floor stays within the available page width without horizontal scrolling, and stages below 600 px retain their close-ups. Above the default 1100 px breakpoint, the steps list stays below the card until the content area can hold the floor plus its 300 px rail. An 880 px floor needs 1180 px of content width, with additional room for page padding and scrollbar space. Wide standalone pages that opt in reserve native scrollbar space so opening content cannot make the rail repeatedly switch positions. The setting is written into that page's hashed stylesheet; pages without it retain their existing sizing, and raw iframes and loader embeds retain host-driven sizing. A short standalone window may need scrolling to reach **Next**. For example, periodic-groups opts into 880 px to keep its smallest full-table labels at least 12 px at 1280×720 and 1366×768; this does not guarantee legibility at every viewport width.

Colour cues accept opaque hex colours only. Each theme checks them independently: paper must retain text 7:1, secondary text 4.5:1 and the neutral accent 3:1; accent must reach 4.5:1 against the page, tile and its button text (it also colours small links). A rejected cue uses that theme's neutral default. A light palette will usually fall back in dark mode; an explicit `?theme=light` or `?theme=dark`, including in a frame, selects the matching checked cues. The build writes the default scenario's cues into the CSP-hashed stylesheet; scenario changes update the same custom properties. These cues affect only that explainer page. Each scenario's paper is in its [description](#describe) as `paper`.

### Controls and accessibility

The player keeps the title, picture, navigation and explanation in one card. **Next** plays a step and stops on its resting picture. Previous returns to the preceding step; a step-bar segment opens its named step. The bar counts teaching steps, not elapsed time. Implementation notes remain under **Details and sources** and retain direct links.

Next stays above the prose so caption length does not move it. The current step's number, title and line lead into its caption in normal flow. On phones, zoom, copy-link and fullscreen tools follow the explanation; on wider pages they sit beside Next. Score audio controls remain immediately below their picture. The stage is keyboard-focusable, names its current subject and exposes a picture description. During playback it is marked `aria-busy`.

Scenarios appear beside the title. By default, the step list is a side rail at widths of at least 1100 px and a closed **All n steps** disclosure below the words otherwise. A standalone width floor can defer the rail until it fits beside the picture. The transcript retains every scenario, including when JavaScript is unavailable.

A scene with [`meta.watch`](#scene) shows its named state changes below the caption as “Label: before → after.” Empty change rows are hidden. Headings and captions use their natural height; they do not reserve space for another step's longer prose. On a standalone page the stage's height cap leaves room for the header, the stepper row, the step heading and the first two lines of the caption, so a reader at 1280 × 800 or 1366 × 768 sees the picture and the start of what it means without scrolling.

The steps rail and the step bar name a teaching step only once the reader has reached it, or a later step: until then the rail shows its number ("Step 4") without its line, and its bar segment is named "Step 4 of 10". A later title such as "Answer: …" therefore cannot answer an earlier question. Reached steps stay named across scenarios, by step name. A scene whose rail is a reference outline rather than a sequence of questions can show every title from the start with `static meta = { …, player: { outline: true } }`.

A scene with reader questions ([`meta.questions`](#scene), the script's `## Check yourself` list) asks them after its last teaching step, under the caption: “Check yourself”, each question, and its answer behind **Show the answer**.

At the last resting step, Next becomes **Start again**. A scene with settings also offers **Try ‘Option’**, which opens the next option of its first setting from step one. On phones this secondary action sits with the tools after the explanation. The right-arrow key does nothing at the end.

At a live step, the step where a [machine](MACHINES.md) last played, a row under the caption lets the reader drive it, so neither Next nor the caption moves as the reader steps onto it: one button per event (named by the machine's `labels`, else the event), then **Undo** and **Reset**. An event the model takes from the state reached is a plain button. One it refuses, and one past where the story stops, stays focusable with `aria-disabled`; it is dimmed (the latter dashed) and says why on hover and on focus (the reason the model's `next` gave with `refuse(reason)`, else "Not possible here"; "The story stops here: …" with the bound's reason), and the reason is its accessible description. Pressing it only says why. A press plays the event's transition from the picture before it, or lands at once under reduced motion; a press during a play lands that one and plays the next. **Undo** takes the last event back and **Reset** returns to the step's own picture, both at once. Each adds a history entry, so Back takes it back too. A polite status line under the buttons says what each event did: the event, then what it changed of the picture's description (the whole summary when no description changed); the stage's description follows the new picture. On a phone the picture is shown whole while the reader explores. Event buttons have no key of their own: Tab reaches them, and Enter or Space presses one. When the picture of the events lands, the page dispatches a `rayner:sent` document event, `{ step, sent, settings }`; it is not posted to a host.


Previous, Next, Zoom in, Zoom out and Whole picture name their key in their tooltip ("Next step (→)") and in `aria-keyshortcuts`. The footer carries one quiet, permanent line between the mark and the way out: "← → to step · click a segment to jump" on a fine pointer, "Tap a segment to jump; tap the current one to finish it" on a coarse one, chosen by `matchMedia('(pointer: coarse)')` and followed as it changes. The page stores nothing, so the hint is never dismissed; it wraps on a narrow card and is hidden at 360 px and under.

The steps rail shows words only. Pictures of each step, drawn in the reader's browser in idle time, were built and measured against a budget and left out: at 4× CPU throttling some of their tasks took 92 to 246 ms of main-thread time, over the 50 ms allowed ([the evidence](https://github.com/adewale/rayner/blob/ce11e0ac611cc7b4babc24a573039ef96f179c3f/docs/evidence/player-guidance/README.md)).

The stage's accessible description is a one-sentence summary of the picture. "What the picture shows", under the caption, opens the full description: each diagram, card, code panel and described drawing, with what is marked, dimmed or changed in this step.

The stage takes focus from Tab or a click. With the stage focused, `+`, `-` and `0` zoom and reset, and arrow keys pan when zoomed. Otherwise left and right arrows change step, except on a button, link or field; on a page that has just loaded, before the reader clicks anything, they change step too. In a frame the arrows work once the frame has focus, so the page never takes a key from its host. In the step bar only the current segment is a Tab stop; there left and right arrows change step, Home and End go to the first and last step, and focus follows the current segment. Pinch, Ctrl-scroll and double-click zoom; when zoomed, drag pans and a click recentres on the point clicked. Zoom goes up to 6×, keeps its place across steps, and resets when the scenario changes. It narrows the stage's SVG `viewBox` inside the author's camera (`ReaderSink` in `app/embed-zoom.ts`) rather than scaling the element, so the drawing stays sharp, the page does not move, an author's camera move keeps playing under it, and **Whole picture** shows the author's frame. A stage under 600 px wide is taller than the picture's 16:9, up to 4:5, so a close-up shows the picture's full height below the heading where it fits, and a step needs fewer views; the stage is never shorter than 16:9, and on a standalone page never so tall that the stepper row and the caption's first lines leave the screen. The margin around the picture is the scenario's paper. On such a stage, each step opens on a close-up of what it changed (what it brought new before what it only moved or scaled, such as a panel carried aside), zoomed whenever a label near the change is under 12 px so that it reads at 12 px, and kept below the heading the stage draws, zooming a little further when that is what it takes; there the stage leaves out the heading it draws on a wide page, which would be too small to read, and the step's heading under the stepper row gives its number, title and line. A view count and **Next view** button, in one row under the stepper row, let readers inspect the step's other close-ups without advancing the step. The row is hidden when the step has one view. On a step with more than one view the footer's hint says how Next view differs from Next, and Next view names that hint as its description. The close-ups that show what the step newly [emphasised](#the-phones-opening-emphasis-and-review-subjects) come right after the first, then the rest of the change, each group in reading order from the first. The small corner map moves through the same views. **Whole picture** shows the author's frame and keeps it for later steps, and the crosshair button brings close-ups back. A vertical swipe scrolls the page; a sideways drag or a pinch moves the view. With reduced motion, the previous picture crossfades into the step's resting picture instead of playing.

Tab order follows the card: scenario picker, stage and optional audio controls, step navigation, explanation disclosure, secondary tools on phones, steps row (narrow), transcript, then footer links. On wider pages the secondary tools sit with step navigation. On a wide page the rail pane follows the card, so its list comes after the footer.

### Embedding

- **Framed mode.** Inside any frame the page marks its root `data-framed` before its body is laid out (a one-line inline script, pinned by its own hash in the CSP). Its body is then transparent and `#content` unpadded, so the host's background shows around the tile and at its rounded corners; the tile keeps 1 px inside the frame so its edge is drawn.
- **Colour scheme.** A browser may paint an opaque canvas under a cross-origin frame whose colour scheme differs from its host's. The loader therefore resolves `theme` `auto` (or none) to the host page's computed `color-scheme` (dark when it allows only dark, or allows dark and the device prefers it; otherwise light) and passes it as `?theme=`. A raw iframe should pass `?theme=light` or `?theme=dark` to match its host; without it the device's scheme is used.
- **The way out.** The loader appends nothing but the iframe. The page's footer carries **Open the explainer** in any frame, with or without `parentOrigin`.
- **Known heights.** `demos:build` measures each page as the loader frames it, at 390, 640 and 900 px wide, default scenario, first step, and writes `out/explainers/<id>/embed.json`: `{ "schema": 1, "aspect": "16/9", "heights": { "390": n, "640": n, "900": n } }`. `site:export` copies it beside the page as `<id>.embed.json`.
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
- The page accepts `rayner:goto` only when `event.origin` is `parentOrigin` and `event.source` is `window.parent`, and ignores every other message. It validates the step and settings as it validates URL parameters: an undeclared setting id is ignored, an unknown value resets the settings to their defaults with the same notice, and a step the scenario lacks opens the first step with a notice. Given settings replace those of the scenario on show; a request without a step keeps the step by name. The navigation replaces the frame's history entry rather than adding one.
- A raw iframe without `parentOrigin` neither posts nor accepts these messages.
- The loader dispatches `new CustomEvent('rayner:step', { bubbles: true, detail })` on the iframe for each accepted step message (`detail` is `{ step, index, total, settings }`) and calls `options.onStep(detail)`. `mountExplainer` returns its dispose function with a `goTo(step?, settings?)` method that posts `rayner:goto` to the artifact's origin; after dispose it does nothing. The script-tag form dispatches the same event. Parsing and validation are pure functions in `app/embed-protocol.ts`.

### Headers

`<page>.html.headers.json` is the response-header recipe: a CSP that pins the inline script and style by SHA-256, `connect-src 'none'`, no fonts, base or objects, and `frame-ancestors *`, plus `Cache-Control: public, max-age=0, must-revalidate`. `<page>.html.receipt.json` is the receipt: what the build produced, from which inputs. Its fields:

| Field | What it records |
| --- | --- |
| `version` | The receipt's format, 1 |
| `scene`, `title` | The explainer's id and page title |
| `sourceHash` | The scene's code bundled with what it imports from its own folder, the engine left out, with the checkout's and the author's folders replaced so the hash is the same wherever it is built |
| `engine` | A fixed label for the engine's lineage (`lantern@2c7bad5+explainer`), not a hash |
| `agenticMermaid` | The Agentic Mermaid release whose capture the snapshots replay |
| `snapshotHashes` | One hash per diagram snapshot the page carries |
| `letteringHash` | The outline lettering snapshot's hash, for a page that uses the [outline workflow](LETTERING.md) |
| `artifactHash` | The page's own hash |
| `scenarios` | Each scenario's `settings`, number of `steps` and `duration` |
| `bytes`, `gzipBytes` | The page's size, raw and gzipped, held to [the page budget](#page) |
| `headers` | The response headers above, as the header recipe holds them |
| `lettering` | For a page that asked for subset lettering, what it weighs ([lettering on request](#lettering-on-request)) |

## Repository scripts

The scripts below, and the tools under `tools/repo/` they run, belong to this repository: neither `rayner` nor `rayner-cli` ships them, and `test/package-boundary.test.ts` checks both archives for them. `tools/` outside `tools/repo/` (and the oracles in `tools/oracle/`) is the `rayner` command.

| Script | What it does |
| --- | --- |
| `npm run check` | TypeScript over every project, then a consumer compile against `dist/` |
| `npm test` | The test suite; browser and live tests skip unless enabled |
| `npm run test:full` | `FULL=1`: every frame and ten times as many property cases |
| `npm run test:embeds` | Real Chromium: capture fidelity, cross-origin embeds, history, phone layout, offline, no JavaScript, a lettered page drawing its requested letters |
| `npm run demos:build` | Build every explainer, the gallery, `evidence.json` and a two-embed page into `out/explainers/`, with each explainer's `describeExplainer` JSON in `<id>/describe.json` for `site:export` |
| `npm run demos:check` | `demos:build` plus `check` on every scenario |
| `npm run demos:serve` | Serve `out/` on port 5175 with each page's headers and byte ranges; `-- --port n` |
| `npm run demos:review` | Open every served scenario at 390 px and 1180 px in Chromium and check captions, artwork, errors, outside requests and headers, and the [live states](#reader-review) a reader reaches by pressing events; screenshots in `out/review/` |
| `node tools/repo/live-cost.ts` | What a press of a live machine's button costs, in Chromium on built pages and in Node; `--cpu 4` throttles, `--presses n`, `--explainers a,b` ([the player](MACHINES.md#the-player)) |
| `npm run bench` | Manual interleaved BASE/HEAD browser measurements; skips identical built pages and reports insufficient samples as inconclusive |
| `npm run site:export -- <site-root>` | Copy the built pages, posters and loader under `<site-root>/projects/rayner` (`--path` changes it), with every step's preview picture of the default scenario as `<id>/<step>.png` (the 960 × 540 still centred on a 1080 × 540 canvas of the stage's paper, since X shows these cards at 2:1; a palette PNG of at most 256 colours taken from the picture, each channel within a few levels of the render), and write their `_headers` block to `out/site-headers.txt`. `--origin https://example.org` also writes a share page per step, `<id>/<step>.html`, which sends a reader to the player at `<id>?step=<step>`, and adds the same link-preview tags to each explainer page, for its gallery tile's step: `description`, Open Graph (`og:type`, `og:title`, `og:description`, `og:url`, `og:image`, `og:image:width`, `og:image:height`, `og:image:alt`) and Twitter card (`twitter:card` = `summary_large_image`, `twitter:title`, cut at a word to the 70 characters X shows, `twitter:description`, `twitter:image`, `twitter:image:alt`), with absolute URLs, and `<meta name="rayner:share" content="<origin><path>/<id>/">`, which the player's Copy link reads; then it checks every page has each tag once and each picture exists at the declared size. Link previews come from the HTML a crawler fetches, and a static host sends the same HTML for every `?step=`, so a step needs its own URL to preview. Each explainer's `<id>.json` is copied from `demos:build`'s `describe.json`. The export fails before writing anything if a scene's code, its folder or the engine changed since `demos:build` ran |
| `npm run pack:smoke` | Pack `rayner` and `rayner-cli`, install `rayner` alone (no dependencies) and then both into a fresh project with diagram capture and with PNG output, check that nothing but the entry points can be imported, type-check `test/consumer/consumer.ts` and every explainer and recipe (engine imports rewritten to the entry points) against the packed declarations, build an outside scene; `EXPLAIN_BROWSER=1` adds installed diagram capture and starter authoring |
| `npm run build:lib` | Compile the library's `dist/` (runs on `npm pack`) |
| `npm run build:cli` | Build `rayner-cli` into `cli/`: the command bundled into `cli/dist/tools/`, with the player and capture tools beside it (runs on `npm pack` in `cli/`) |
| `npm run fonts` | Regenerate `src/font-data.ts` from Inter, JetBrains Mono and the Noto numeral subsets, reproducibly (needs `fonttools` and `brotli`) |
| `npm run fonts:lettering` | Regenerate `vendor/lettering/`, the Latin Extended, Greek and Cyrillic of the same Inter and JetBrains Mono that [lettering on request](#lettering-on-request) cuts from; leaves `src/font-data.ts` alone (needs `fonttools` and `brotli`) |

Test environment: `FC_RUNS=n` sets the property cases, and `FC_SEED` with `FC_PATH` replays a fast-check failure. `UPDATE_GOLDEN=1` rewrites `test/golden-traces.json` after a deliberate change. `EXPLAIN_BROWSER=1` enables the browser tests. `test/explain-gates.test.ts` gives each check one seeded defect.

Tests that hold a model to an outside tool compare against frozen answers, and also run the tool when it is present:

| Tool | Runs when | Test |
| --- | --- | --- |
| rustc | `rustc` is on `PATH`, or `RUSTC` names one | `scenes/explainers/send-sync/model.test.ts` |
| Python's `unicodedata` at Unicode 17.0.0 | `python3` on `PATH`, or `PYTHON`, has it | `scenes/explainers/isdigit/model.test.ts` |
| sabre/vobject 4.5.7 in Docker | `SABRE_DOCKER=1` | `scenes/explainers/ical-recurrence/model.test.ts` |
| A checkout of w3c/wcag | `WCAG_REPO=<checkout>` | `scenes/explainers/wcag-map/model.test.ts` |
| Manim | `MANIM_DIR=<checkout of 3b1b/manim>` at the commit `test/manim-oracle.json` names, with `python3` and numpy 1.26.4 (so Python 3.12 or earlier); `UPDATE_ORACLE=1` rewrites `test/manim-oracle.json` | `test/manim.test.ts` |

The Manim answers for `distribute` depend on numpy's version. In cases 1 and 3 several pieces have the same length at the cut, and manim chooses among them with `np.argpartition`, whose order for ties is not fixed: numpy 1.26.4 reproduces the frozen answers, and numpy 2.0.2, 2.3.5 and 2.5.3 give other counts for those two cases. Refresh the oracle only with numpy 1.26.4.

## Reader timing measurements

`npm run bench -- --base <revision>` compares built pages in Chromium at 390 × 844 and CPU ×4. BASE is checked out temporarily and installs its own locked dependencies with `npm ci`. Every measured explainer receives a warmup on both sides. Recorded pairs alternate BASE/HEAD order. The default is seven pairs; fewer than five return exit 2 (inconclusive) unless a layout failure makes the result exit 1.

Pages and response headers with identical SHA-256 hashes skip browser timing. This establishes artifact equivalence, not a measured latency result. Use `--force` for calibration, `--cpu 1` for no throttling, and `--explainers mr-cache` for a smaller run. `--read-ms 1000` sets the dwell before each action; `--read-ms 0` measures the immediate-action scenario. Values above Node's 2,147,483,647 ms timer limit are rejected. Chosen pages need at least three distinct steps and a stage mutation during Next.

The recorder measures navigation to the ready attribute, Next to the first **DOM stage write**, Next to the resting step event, frame gaps including both window tails, and a jump to the last step. DOM writes and step events do not establish completed paint. Blocking sums the part of each task after its first 50ms that overlaps either interaction window, including tasks started before the click. This clipped-window metric differs from navigation TBT. All layout-shift entries after ready count, including recent-input entries, across both rounds. Pending observer records are drained after two rendering opportunities.

Timing rules retain the original relative/absolute thresholds and 70% slower-pair requirement. A flag must repeat in a second round. These thresholds are a manual diagnostic heuristic calibrated on one shared VM, not a confidence bound or an automatic CI guarantee. The changed window definitions need calibration on the machine where measurements will be used. A run can take several minutes; normal CI checks pure arithmetic, CLI validation and a small browser instrumentation control instead of repeating long A/B timings. CI can choose a parent commit or event-before SHA as BASE if a calibrated performance job is added later.

`out/bench/samples.json` records raw rounds, selected rules and scenario, Node/npm/browser versions, package and lockfile hashes, built artifact hashes, commit IDs and working-tree/untracked fingerprints. Exit1 means a reproduced timing flag, any measured HEAD layout shift (a shift that begins after the reader opens a disclosure on the way to the last step and before the jump's own click is left out: it is content the reader asked for), or an error; exit 2 means insufficient timing pairs; exit 0 means artifact equivalence or no reproduced flag in the measured scenarios. A small browser control lives in `test/browser/bench-measure.test.ts`; enable it with `EXPLAIN_BROWSER=1`. Pure properties cover numerical boundaries, invalid data, clipping, frame tails and decision rules without opening browsers.
