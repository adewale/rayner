# Writing your own explainer

[The tutorial](TUTORIAL.md) reads a finished explainer and breaks it. This guide goes the other way: it starts from `rayner init --blank` and ends at a page someone else can review, on one real subject, JavaScript's `sort()` with no compare function. On the way it says how to choose a subject and an oracle, shows what `rayner check` says at each stage, including the failures a first draft runs into, and ends with what explainers have cost in this repository.

The finished explainer is in [`scenes/tutorial/sort-as-text/`](../scenes/tutorial/sort-as-text/). Every file this guide prints is that folder's file with package imports, and every output it prints is what the command printed: [`test/explain-writing.test.ts`](https://github.com/adewale/rayner/blob/main/test/explain-writing.test.ts), part of `npm test`, builds each stage in a fresh folder, runs the guide's `init` and `check` commands and fails when what they print differs from this page, and [`test/browser/explain-writing-review.test.ts`](https://github.com/adewale/rayner/blob/main/test/browser/explain-writing-review.test.ts) does the same for `review` in Chromium (with `EXPLAIN_BROWSER=1`).

You need what [the tutorial's "Before you start"](TUTORIAL.md#before-you-start) lists: Node 24 or later, and `rayner` and `rayner-cli` installed at the same version, as [the quick start](../README.md#quick-start) shows. `rayner review` also needs Chromium.

## 1. Choose a subject

A subject is one question that a particular reader would ask after seeing a result they did not expect. Write it as they would ask it. "How does sorting work in JavaScript?" is a topic; "Why does `[10, 9, 1].sort()` give `[1, 10, 9]`?" is a question, and its answer fits in a sentence: `sort()` compares the elements as strings.

Then look for a **changed condition**: one input that, changed, changes the outcome in a way the reader can predict once they understand the answer. Here it is the compare function. With none, `[10, 9, 1]` sorts to `[1, 10, 9]`; with `(a, b) => a - b`, to `[1, 9, 10]`. A setting whose other option only changes the numbers, or recolours the picture, doubles the scenarios and teaches nothing ([FAQ](../FAQ.md#how-many-scenarios-can-one-explainer-have)).

Last, ask whether a still would do. Rayner is worth it when the explanation depends on an input ([FAQ](../FAQ.md#when-is-rayner-worth-using-instead-of-a-diagram-or-a-screenshot)) or when the reader should do something: commit to a prediction, switch the condition, press events and watch what the model does. In this repository's blind comparisons on 1 November 2026, before a Rayner page could take a prediction, a reviewer preferred plain pages that let the reader predict and drive a live machine over Rayner pages where the reader only pressed Next, in all three pairs of both rounds ([the benchmark](https://github.com/adewale/rayner/blob/main/bench/explainers/README.md)). The `sort()` answer is one comparison, so a picture of `[1, 10, 9]` with `"1" < "9"` under it would nearly do. What earns it a Rayner page is a prediction before the answer, the two compare functions side by side, and a last step where the reader adds numbers and tests the rule on cases they choose. If your subject has none of those, publish the picture.

A subject also needs something real to check the model against. That is section 4; if you cannot name anything, say so on the page (grade `none`), and expect a reader to trust it less.

## 2. Start blank

```sh
npx rayner init --blank sort-as-text --question "Why does [10, 9, 1].sort() give [1, 10, 9]?"
npx rayner check sort-as-text/scene.ts
```

`init --blank` writes `script.md`, `model.ts` (a stub), `model.test.ts` and `scene.ts`, every part still to write marked `TODO:`, with the question as the script's heading. `check` fails and lists what is left, in the order to write it:

<!-- check: blank -->
```text
rayner: This explainer still has placeholders, each marked TODO:. To do, in order:
1. script.md: fill in the intent header: write Reader, Answer, Changed condition, Reader's own work, Leaves out, Check yourself question 1 and Why this explainer in place of each TODO
2. script.md: write Checked against and Grounding: the real system model.test.ts compares the model with, and how (live, recorded, read or none, then the system and its version)
3. model.test.ts fails: the model agrees with the real system (TODO: replace this placeholder with a comparison of the model against something real: a reference implementation run live, published test vectors, or a recorded run of the real system)
4. scene.ts: step "start" still says TODO in its title, line and caption: draw the model's state and say what the picture shows
```

The order is the method: what the explainer must achieve, then what it is checked against, then a model that agrees with that, and only then the picture. Rerun `check` after each part; the list shrinks.

## 3. Write the intent

`script.md` is for you and for whoever reviews the explainer; the reader never sees it, but Rayner reads its header. The finished one:

<!-- sort-as-text/script.md -->
```md
# Why does [10, 9, 1].sort() give [1, 10, 9]?

- **Reader:** a JavaScript developer who expects sort() with no arguments to order numbers by size.
- **Answer:** sort() compares the elements as strings
- **Changed condition:** the compare function: none, or (a, b) => a - b. With none, [10, 9, 1] sorts to [1, 10, 9]; with a - b, to [1, 9, 10]. The array and the numbers the reader can add are the same in both.
- **Reader's own work:** predict where 10 goes before the answer; switch the compare function; at the last step, add 2, 25 or 100 and predict where each lands; answer the reader question.
- **Checked against:** Node's own Array.prototype.sort, with no compare function and with (a, b) => a - b, run in `model.test.ts` on six arrays and on every array the live step reaches, each time it runs.
- **Grounding:** live: Array.prototype.sort in the Node that runs the model's tests (Node 24 when written)
- **Leaves out:** other compare functions, strings, undefined and holes in arrays, how fast the sort runs and whether it is stable; the live step adds 2, 25 and 100, each once.

## Check yourself

1. What does [2, 10, 1].sort() give?
   [1, 10, 2]: as strings, "10" comes before "2".

## Why this explainer

The answer is one comparison, so a still of [1, 10, 9] with "1" < "9" under it would nearly do. What a still cannot do is let the reader commit: the first step asks where 10 goes before showing it, the setting puts the numeric compare function beside the default so the reader sees the same array come out two ways, and the last step lets them add numbers and test the rule on cases they choose. docs/WRITING.md builds it from `rayner init --blank`, and the test that keeps that guide true checks it at every stage.
```

- **Answer** is the sentence some step must say. `check` fails until one does, and reports which step says it first.
- **Changed condition** is written before any drawing, so the picture has to match a prediction you made in advance.
- **Reader's own work** promises what the page lets the reader do. Promise only what it does: here a prediction, a setting and buttons.
- **Leaves out** is where the explainer's claim stops, and its last step should stay inside it.
- **Check yourself** asks about a case the steps did not show: `[2, 10, 1]` is not on the page.
- Below the header, **Why this explainer** is your reasons, including why a still would not do. Rayner does not read it.

[The reference](REFERENCE.md#scene) gives the header's rules. With every line but Checked against and Grounding written, `check` moves on:

<!-- check: intent -->
```text
rayner: This explainer still has placeholders, each marked TODO:. To do, in order:
1. script.md: write Checked against and Grounding: the real system model.test.ts compares the model with, and how (live, recorded, read or none, then the system and its version)
2. model.test.ts fails: the model agrees with the real system (TODO: replace this placeholder with a comparison of the model against something real: a reference implementation run live, published test vectors, or a recorded run of the real system)
3. scene.ts: step "start" still says TODO in its title, line and caption: draw the model's state and say what the picture shows
```

## 4. Choose the oracle

The oracle is what `model.test.ts` compares the model with. It is the only thing that makes the page's values more than your belief, so choose it before writing the model. The script names it twice: **Checked against** says what and where, naming the evidence files in backticks (each must exist in the folder), and **Grounding** grades it in one of four words, which the page turns into a one-sentence receipt under Sources. The grades ([`explain/grounding.ts`](https://github.com/adewale/rayner/blob/main/explain/grounding.ts)):

| Grade | What it means | Catalogued example |
| --- | --- | --- |
| `live` | The model's tests run the real system each time they run | **python-dict**: `oracle/cpython_dict.py` builds a dict in CPython 3.12, reads its index and entries from memory before and after `del d[0]`, and the model's test runs it and compares |
| `recorded` | The real system was run once and its answers are frozen; the tests compare with them | **pg-page**: a Postgres 18.6 server in Docker, measured on 2026-10-25; the page sizes are constants in `model.test.ts`, under a comment saying how they were measured |
| `read` | A specification or source was read and transcribed; nothing was run | **poppy** and its seven sibling chapters: the Personal Agent Protocol draft, with tests naming the section each rule comes from, and the project's published JSON Schemas copied into `fixtures/` |
| `none` | Nothing outside the model's own tests | **seasons**: the model computes cited formulas, and its tests check them by property and by hand-worked values |

How to choose:

- **Run the real thing if it can run where the tests run.** A language's built-in (`sort()`, `len()`, `Intl.Segmenter`), a CLI (`git`, `rustc`) or a library is a live oracle. This explainer's is Node's own `Array.prototype.sort`.
- **Record it if it cannot.** A database server, a Docker image or a paid API can be run once by hand. Keep the program that ran it in `oracle/`, have it write its answers to `fixtures/`, and make `model.test.ts` compare the model with the fixture. Write down in the fixture or beside the constants exactly what was run: the version, the date and the commands, as pg-page's comment does. python-dict keeps both: the fixture `fixtures/cpython-dict.json` that its oracle wrote, and a test that runs the oracle again when CPython 3.12 is there.
- **Read it if nothing runs.** A draft protocol or an RFC with no reference implementation is `read`. Look for anything the project publishes that a test can hold the model to: Poppy's chapters were held to the project's JSON Schemas and example documents, and those tests found real disagreements ([#101](https://github.com/adewale/rayner/issues/101), item 13). Tests of prose rules encode the same reading that wrote the model, so they cannot catch a misreading; say so.
- **Grade what the evidence is, not what you hope.** A fixture captured once is `recorded`, even if the tests are thorough. A test that runs the tool when it is installed and otherwise skips is `live` only where it runs: in this repository a skip goes through `skipOracle` ([`scenes/explainers/lib/oracle.ts`](https://github.com/adewale/rayner/blob/main/scenes/explainers/lib/oracle.ts)), and CI sets `RAYNER_REQUIRE_ORACLES=1` so a live oracle that cannot run there fails instead of skipping. [Testing](TESTING.md#oracles-ci-runs-and-recordings) lists which oracles CI runs and which are recordings. In your own project, skip with `t.skip(reason)` and make the run that matters fail instead.
- **Name the version.** `live: Git` is weaker than `live: Git's own apply and diff (2.43.0 when written)`; a live oracle runs whatever version the machine has, so say which one you wrote against.

This explainer's lines:

```md
- **Checked against:** Node's own Array.prototype.sort, with no compare function and with (a, b) => a - b, run in `model.test.ts` on six arrays and on every array the live step reaches, each time it runs.
- **Grounding:** live: Array.prototype.sort in the Node that runs the model's tests (Node 24 when written)
```

On the page, under Sources, that Grounding line reads:

<!-- receipt -->
```text
Checked live, each time the model’s tests run, against Array.prototype.sort in the Node that runs the model's tests (Node 24 when written).
```

With them written, the to-do list is down to the model's test and the picture:

<!-- check: grounded -->
```text
rayner: This explainer still has placeholders, each marked TODO:. To do, in order:
1. model.test.ts fails: the model agrees with the real system (TODO: replace this placeholder with a comparison of the model against something real: a reference implementation run live, published test vectors, or a recorded run of the real system)
2. scene.ts: step "start" still says TODO in its title, line and caption: draw the model's state and say what the picture shows
```

## 5. Write the model, and test it against the oracle

The model is the system as plain TypeScript, with no drawing in it, so a test can run it. It must not call the system it explains, or comparing them would prove nothing: this one orders the numbers by insertion and never calls `sort()`.

<!-- sort-as-text/model.ts -->
```ts
// Array.prototype.sort, with no compare function and with (a, b) => a - b. With none, sort turns each
// element into a string and orders the strings by their UTF-16 code units (ECMA-262, SortCompare);
// with a - b it orders them as numbers. This model orders them by insertion, without calling sort,
// so model.test.ts can compare it with the real one.

/** How sort() compares: as strings (no compare function) or as numbers ((a, b) => a - b). */
export type Compare = 'none' | 'numbers';
/** The numbers the reader can add at the live step, each once. */
export const ADDS = [2, 25, 100] as const;
export type SortEvent = `add ${(typeof ADDS)[number]}`;
export const EVENTS: readonly SortEvent[] = ADDS.map((n) => `add ${n}` as const);

/** The array as written, and whether the picture shows what sort() makes of it yet. */
export type State = { values: number[]; compare: Compare; sorted: boolean };

/** Whether `a` goes before `b` when sort() compares as `compare` says. */
const before = (a: number, b: number, compare: Compare) => (compare === 'none' ? String(a) < String(b) : a - b < 0);

/** `values` in the order sort() gives them: as strings by code units with no compare function, or as numbers. */
export function sorted(values: readonly number[], compare: Compare): number[] {
  const out: number[] = [];
  for (const value of values) {
    let at = out.length;
    while (at > 0 && before(value, out[at - 1]!, compare)) at--;
    out.splice(at, 0, value);
  }
  return out;
}

/** The reader's array before the sort. */
export const start = (compare: Compare): State => ({ values: [10, 9, 1], compare, sorted: false });

/** The array with `event`'s number put on its end: what the live step's buttons do. */
export const next = (state: State, event: SortEvent): State => ({ ...state, values: [...state.values, Number(event.slice(4))] });

/** Where the story stops: the picture shows each number once. */
export const bound = (state: State, event: SortEvent): string | undefined => {
  const n = Number(event.slice(4));
  return state.values.includes(n) ? `the array holds ${n} already, and this picture shows each number once` : undefined;
};
```

`next` and `bound` are for the live step (section 6): `next` is what a button does, and `bound` is where the story stops though the model would go on.

The test compares the model with the oracle, here run live on fixed arrays and on every array the live step can reach:

<!-- sort-as-text/model.test.ts -->
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { ADDS, EVENTS, bound, next, sorted, start, type Compare, type State } from './model.ts';

// The oracle: Node's own Array.prototype.sort, run live each time this test runs.
const real = (values: readonly number[], compare: Compare) => (compare === 'none' ? [...values].sort() : [...values].sort((a, b) => a - b));

test('the model sorts as Node sorts, with no compare function and with (a, b) => a - b', () => {
  for (const values of [[10, 9, 1], [2, 10, 1], [100, 25, 3, 1000], [-1, -2, 0], [5, 50, 0.5, 5], [1e21, 2, 30]])
    for (const compare of ['none', 'numbers'] as const) assert.deepEqual(sorted(values, compare), real(values, compare), `[${values}] with ${compare}`);
});

test('every array the live step reaches sorts as Node sorts it', () => {
  const seen: State[] = [];
  for (const queue = [start('none')]; queue.length; ) {
    const state = queue.shift()!;
    seen.push(state);
    for (const event of EVENTS) if (!bound(state, event)) queue.push(next(state, event));
  }
  assert.equal(seen.length, 1 + 3 + 6 + 6, 'each order of adding 2, 25 and 100, or some of them');
  for (const { values } of seen) for (const compare of ['none', 'numbers'] as const) assert.deepEqual(sorted(values, compare), real(values, compare));
});

test('the live step adds each number once, at the end of the array', () => {
  assert.deepEqual(next(start('none'), 'add 100').values, [10, 9, 1, 100]);
  assert.equal(bound(next(start('none'), 'add 2'), 'add 2'), 'the array holds 2 already, and this picture shows each number once');
  assert.deepEqual(ADDS.map((n) => bound(start('none'), `add ${n}`)), [undefined, undefined, undefined]);
});
```

Make it fail first. Write the model as the reader believes sort works, comparing as numbers:

<!-- draft: model sort-as-text/model.ts -->
```diff
-const before = (a: number, b: number, compare: Compare) => a - b < 0;
+const before = (a: number, b: number, compare: Compare) => (compare === 'none' ? String(a) < String(b) : a - b < 0);
```

`check` runs the model test first and stops on it, naming each failing test:

<!-- check: model -->
```text
rayner: The model test fails (sort-as-text/model.test.ts): the model sorts as Node sorts, with no compare function and with (a, b) => a - b ([10,9,1] with none + actual - expected [); every array the live step reaches sorts as Node sorts it (Expected values to be strictly deep-equal: + actual - expected [)
```

That is the oracle catching the misconception the explainer is about. With the real rule back and the test passing, the list is down to the picture:

<!-- check: tested -->
```text
rayner: This explainer still has placeholders, each marked TODO:. To do, in order:
1. scene.ts: step "start" still says TODO in its title, line and caption: draw the model's state and say what the picture shows
```

## 6. Draw the picture and write the steps

A picture is a function from the model's state to shapes, in its own module. Draw it with [`rayner/kit`](REFERENCE.md#kit): its type sizes never go below `TYPE.small`, which a phone can read; `tones(s)` gives the stage's colours by role; `box` and `words` make the parts. Key each part by what it is, here each box by its number, so when the state changes a view slides a part to its new place instead of fading one out and another in.

<!-- sort-as-text/picture.ts -->
```ts
import { Group } from 'rayner';
import type { Stage } from 'rayner/explain';
import { keyedParts } from 'rayner/drawing';
import { SPACE, box, tones, words } from 'rayner/kit';
import { sorted, type State } from './model.ts';

/** A box's width, and where row `y`'s boxes stand: centred on the stage, SPACE.s apart. */
const WIDTH = 1.9;
const row = (count: number) => (i: number) => (i - (count - 1) / 2) * (WIDTH + SPACE.s);

/** One number as a box: its two parts, keyed `<key>:box` and `<key>:label`, in one group. */
const numberBox = (s: Stage, text: string, at: [number, number], key: string) => new Group(...box(s, text, { at, key, width: WIDTH }));

/**
 * The array as written, and under it what sort() makes of it once the state says it is sorted. With
 * no compare function the sorted row shows each number as the string sort() compares, in quotes.
 * Every box is keyed by its number, so when a number joins, the boxes it passes slide aside.
 */
export function drawSort(s: Stage, st: State): Group {
  const parts = keyedParts(), t = tones(s);
  const across = row(st.values.length);
  parts.add(words(s, 'The array', { at: [0, 1.5], color: t.soft, align: 'middle' }), 'array:name');
  st.values.forEach((n, i) => parts.add(numberBox(s, String(n), [across(i), 0.6], `array:${n}`), `array:${n}`));
  const how = st.compare === 'none' ? 'sort() compares them as text' : 'sort((a, b) => a - b) compares them as numbers';
  parts.add(words(s, how, { at: [0, -1], color: t.soft, align: 'middle' }), 'sorted:name');
  if (st.sorted)
    sorted(st.values, st.compare).forEach((n, i) =>
      parts.add(numberBox(s, st.compare === 'none' ? `"${n}"` : String(n), [across(i), -1.9], `sorted:${n}`), `sorted:${n}`));
  return parts.group();
}
```

The scene is the explanation: its steps, their words, which state each shows.

<!-- sort-as-text/scene.ts -->
```ts
import { Scene } from 'rayner';
import { Machine, answerOf, settingsOf, stage, view } from 'rayner/explain';
import type { ExplainerMeta, Setting } from 'rayner/explain';
import { beats, flight } from 'rayner/kit';
import { EVENTS, bound, next, sorted, start, type Compare, type SortEvent, type State } from './model.ts';
import { drawSort } from './picture.ts';

const PLACES = ['First', 'Between 1 and 9', 'Last'];

export default class SortAsText extends Scene<State, {}> {
  static meta = {
    sources: ['https://tc39.es/ecma262/2025/#sec-sortcompare'],
  } satisfies ExplainerMeta;
  static settings = [
    { id: 'compare', label: 'Compare function', default: 'none', options: [{ value: 'none', label: 'none' }, { value: 'numbers', label: '(a, b) => a - b' }] },
  ] satisfies readonly Setting[];

  override state = start('none');

  override async construct() {
    const s = stage(this);
    const compare = settingsOf(this).compare as Compare;
    const asText = compare === 'none';
    this.state = start(compare);
    const picture = view(this, (st) => drawSort(s, st));
    // The reader's buttons: each puts a number on the end of the array. Its sorted box flies down
    // from just under where the number joins the array, along the gap between the rows and down into
    // its place, over no other number, after the boxes it passes have made room.
    const machine = new Machine<State, SortEvent>(this, {
      start: { ...start(compare), sorted: true },
      events: EVENTS,
      next,
      bound,
      views: [picture],
      transition: Object.fromEntries(EVENTS.map((event) => [event, (t) => {
        const n = event.slice(4), c = t.choreograph(picture), [x] = c.to(`array:${n}`).center(), [to] = c.to(`sorted:${n}`).center();
        return beats(c, flight(c, `sorted:${n}`, [[x!, -0.2], [to!, -0.2]]), { fresh: [`sorted:${n}`], lead: ['array:', 'sorted:'] });
      }])),
      runTime: 2.2,
    });

    const tenGoes = PLACES[sorted(this.state.values, compare).indexOf(10)]!;
    await this.step('ask', {
      title: 'Where does 10 go?',
      line: 'Predict, then press Next.',
      caption: asText
        ? 'You call sort() on [10, 9, 1] and pass no compare function. Where in the sorted array does 10 end up?'
        : 'You call sort() on [10, 9, 1] and pass the compare function (a, b) => a - b. Where in the sorted array does 10 end up?',
      predict: { options: PLACES, answer: tenGoes },
    });
    await s.enter(picture);

    await this.step('answer', {
      title: asText ? 'Answer: 10 sorts before 9' : 'Answer: 10 sorts last',
      line: asText ? 'As text, "10" begins with "1".' : 'a - b is negative when a is smaller.',
      caption: asText
        ? `With no compare function, ${answerOf(this)}. "10" begins with "1", which comes before "9", so 10 goes between 1 and 9, whatever the numbers are worth.`
        : `With no compare function, ${answerOf(this)}, and 10 would go before 9. (a, b) => a - b compares them as numbers: a negative result puts a first, so 10, the largest, goes last.`,
    });
    this.state = { ...this.state, sorted: true };
    await picture.sync();

    await this.step('add', {
      title: asText ? '100 lands before 9' : '100 lands last',
      line: 'Press add: where will each number land?',
      caption: asText
        ? 'Add 100 to the end of the array and sort() puts it after 10 and before 9: as text, "100" begins with "10". Press add 2 or add 25, predict where it lands, then watch.'
        : 'Add 100 to the end of the array and sort() puts it last, the largest number. Press add 2 or add 25, predict where it lands, then watch.',
    });
    await this.play(machine.replay(['add 100']));
  }
}
```

- **The setting** is the changed condition. Each option is a scenario: the reader switches between them, and `check` and `review` visit both. Every caption is written for its own scenario's outcome.
- **The prediction.** The first step's `predict` gives the reader three buttons before the answer, and the player reveals their choice and the answer on the next step. Its `answer` is computed from the model (`PLACES[sorted(...).indexOf(10)]`), never typed, so it moves with the setting: "Between 1 and 9" with no compare function, "Last" with `a - b`. `check` fails a prediction whose answer is not one of its options or that no later step reveals.
- **The answer** comes from the script through `answerOf(this)`, so it has one home. Both scenarios' second step says it.
- **The view.** `view(this, draw)` draws the picture from `this.state`; the second step changes the state and `picture.sync()` moves the picture to it. `check` redraws every view from every step's state and fails one that differs.
- **The live step.** A `Machine` takes the model's `next`, its events and its `bound`; the step where it last plays (`machine.replay(['add 100'])`) is live, so the reader gets one button per event there. `check` explores every state the buttons reach (16 here) and draws and checks each one. The authored `transition` flies the new number's sorted box down from where it joined the array, after the boxes it passes have made room, with the kit's `beats` and `flight`.

## 7. What check catches on the way

A first draft rarely passes. Writing this explainer, the first draft ran into the heading; the other three are mistakes as easy to make, made here on purpose. Each diff shows the draft (`-`) and the fix (`+`), and each output is what `check` printed for that draft.

**Text running into the heading.** The stage draws the step's title and line at the top. The first layout put the row's name too high:

<!-- draft: heading sort-as-text/picture.ts -->
```diff
-  parts.add(words(s, 'The array', { at: [0, 2.55], color: t.soft, align: 'middle' }), 'array:name');
+  parts.add(words(s, 'The array', { at: [0, 1.5], color: t.soft, align: 'middle' }), 'array:name');
```

<!-- check: heading -->
```text
rayner: Machines in Compare function: none: a state the events reach fails (each named by its shortest events; the first five)
+ actual - expected

+ [
+   `at the start: "The array" runs into the heading's "Press add: where will each number land?"`,
+   `after add 2: "The array" runs into the heading's "Press add: where will each number land?"`,
+   `after add 25: "The array" runs into the heading's "Press add: where will each number land?"`,
+   `after add 100: "The array" runs into the heading's "Press add: where will each number land?"`,
+   `after add 2, add 25: "The array" runs into the heading's "Press add: where will each number land?"`
+ ]
- []
```

It names each state the live step reaches where it happens (the first five). Lay text into the region under the heading: `regionBox('full')` from `rayner/explain` is its box.

**A label a phone cannot read.** A newcomer who copies the blank scene's `new Text(...)` and shrinks it so six numbers fit draws labels the kit would have refused:

<!-- draft: phone sort-as-text/picture.ts -->
```diff
-import { Group, Text, keyed } from 'rayner';
+import { Group } from 'rayner';
@@
-const numberBox = (s: Stage, text: string, at: [number, number], key: string) => new Group(keyed(new Text(text, { fontSize: 0.3, color: s.look.ink }).moveTo(at), `${key}:label`));
+const numberBox = (s: Stage, text: string, at: [number, number], key: string) => new Group(...box(s, text, { at, key, width: WIDTH }));
```

<!-- check: phone -->
```text
rayner: Machines in Compare function: none: a state the events reach fails (each named by its shortest events; the first five)
+ actual - expected

+ [
+   `after add 2, add 25: “10” reads 6.7 px on the whole picture at a 390 px phone, and no close-up of "add" shows it larger, under 12; the player shows a live step's whole picture after each press, so draw it at a size of at least 0.54 with the camera at home, or bring it into one of the step's close-ups`,
+   `after add 2, add 25: “25” reads 6.7 px on the whole picture at a 390 px phone, and no close-up of "add" shows it larger, under 12; the player shows a live step's whole picture after each press, so draw it at a size of at least 0.54 with the camera at home, or bring it into one of the step's close-ups`,
+   `after add 2, add 25: “"1"” reads 6.7 px on the whole picture at a 390 px phone, and no close-up of "add" shows it larger, under 12; the player shows a live step's whole picture after each press, so draw it at a size of at least 0.54 with the camera at home, or bring it into one of the step's close-ups`,
+   `after add 2, add 25: “"9"” reads 6.7 px on the whole picture at a 390 px phone, and no close-up of "add" shows it larger, under 12; the player shows a live step's whole picture after each press, so draw it at a size of at least 0.54 with the camera at home, or bring it into one of the step's close-ups`,
+   `after add 2, add 100: “10” reads 6.7 px on the whole picture at a 390 px phone, and no close-up of "add" shows it larger, under 12; the player shows a live step's whole picture after each press, so draw it at a size of at least 0.54 with the camera at home, or bring it into one of the step's close-ups`
+ ]
- []
```

After each press a phone shows the live step's whole picture, so every label must read 12 px there or whole inside one of the step's close-ups. The kit's `words` throws on such a size before anything is drawn (`words(): "10" at 0.3 units is under TYPE.small (0.56), which a phone cannot read; put the fact in the caption instead`), which is why the fix draws with `box`. Outside a live step the phone sizes are reported in `legibility` rather than gated, and `rayner review` measures them as served.

**A caption over 80 words.** The first answer caption tried to say everything:

<!-- draft: caption sort-as-text/scene.ts -->
```diff
-        ? `With no compare function, ${answerOf(this)}: it turns each element into a string, then orders the strings by their UTF-16 code units, comparing them one character at a time from the left. "10" begins with "1", which comes before "9", so 10 goes between 1 and 9, whatever the numbers are worth. That is why [10, 9, 1].sort() gives [1, 10, 9], and why sorting numbers by size needs a compare function such as (a, b) => a - b.`
+        ? `With no compare function, ${answerOf(this)}. "10" begins with "1", which comes before "9", so 10 goes between 1 and 9, whatever the numbers are worth.`
```

<!-- check: caption -->
```text
rayner: Script in Compare function: none: Step "answer" has a caption of 82 words, over 80; keep its point in the first sentence and cut the rest, or give it a step of its own
+ actual - expected

+ [
+   'Step "answer" has a caption of 82 words, over 80; keep its point in the first sentence and cut the rest, or give it a step of its own'
+ ]
- []
```

A caption has to fit beside the picture on a phone. Keep the point in the first sentence; the code units belong in the script's reasons, and the compare function has its own scenario.

**Motion a reader cannot follow.** The authored transition is about 2.2 seconds: the boxes make room, the number flies, the rest settles. Without `runTime`, the machine gives each event 0.6 seconds and squeezes the transition into it:

<!-- draft: motion sort-as-text/scene.ts -->
```diff
       }])),
+      runTime: 2.2,
```

<!-- check: motion -->
```text
rayner: Motion failures in Compare function: none: [{"kind":"pop","frame":588,"t":19.6,"step":"add","what":"the Rectangle keyed \"sorted:100:box\"","magnitude":0.78,"detail":"alpha 0.12 → 0.90"},{"kind":"pop","frame":588,"t":19.6,"step":"add","what":"the Text keyed \"sorted:100:label\"","magnitude":0.78,"detail":"alpha 0.12 → 0.90"},{"kind":"pop","frame":598,"t":19.933,"step":"add","what":"the Rectangle keyed \"sorted:100:box\"","magnitude":0.893,"detail":"alpha 0.95 → 0.05"},{"kind":"pop","frame":598,"t":19.933,"step":"add","what":"the Text keyed \"sorted:100:label\"","magnitude":0.893,"detail":"alpha 0.95 → 0.05"},{"kind":"pop","frame":598,"t":19.933,"step":"add","what":"the Rectangle keyed \"sorted:100:box\"","magnitude":0.893,"detail":"alpha 0.05 → 0.95"},{"kind":"pop","frame":598,"t":19.933,"step":"add","what":"the Text keyed \"sorted:100:label\"","magnitude":0.893,"detail":"alpha 0.05 → 0.95"}]

6 !== 0
```

Squeezed, the flight's fades become one-frame pops. Give `runTime` the transition's own length. `check` also follows every keyed part through every press for jumps, flicker and an answer readable before its token lands ([keyed motion](REFERENCE.md#keyed-motion)). It does not see a token crossing a label or two copies of one thing overlapping, so watch a few presses frame by frame yourself: on the Poppy series, filming every transition found 63 such defects after every check had passed (see [What it costs](#what-it-costs)).

With every fix in, `check` passes and prints its report as JSON, which it also saves in `out/checks/sort-as-text/report.json`. Part of it, for the first scenario:

<!-- check: done -->
```json
{
  "model": {
    "file": "sort-as-text/model.test.ts",
    "tests": 3,
    "passed": 3
  },
  "settings": {
    "compare": "none"
  },
  "script": {
    "answer": {
      "step": "answer",
      "at": 2
    },
    "questions": 1,
    "missing": [],
    "problems": []
  },
  "predictions": [
    {
      "step": "ask",
      "options": [
        "First",
        "Between 1 and 9",
        "Last"
      ],
      "answer": "Between 1 and 9",
      "reveal": "answer"
    }
  ],
  "machines": [
    {
      "events": [
        "add 2",
        "add 25",
        "add 100"
      ],
      "states": 16
    }
  ]
}
```

`model` is the oracle test's run; `script.answer` is the first step that states the answer; `predictions` is the prediction and the step that reveals it; `machines` is the live step's events and the states they reach. `legibility.labelsUnder12PxAt390` in the full report is the number of labels a phone reader sees under 12 px; keep it at 0.

None of this says the captions are true. Read every step of every scenario as text with `npx rayner see sort-as-text/scene.ts answer --scenario compare=numbers`, and ask of each sentence whether the other scenario makes it false ([the tutorial's step 8](TUTORIAL.md#8-break-a-caption) shows a false caption that passes every check).

## 8. Review it, and hand it over

```sh
npx rayner review sort-as-text/scene.ts --out public/sort-as-text.html
```

`review` runs the checks, builds the page, opens every resting step of every scenario in Chromium at 390 and 1180 px, and the states the live step's buttons reach; on success it prints a receipt as JSON and keeps the exact page it reviewed, with its receipt, header recipe and loader. Its counts for this explainer:

<!-- review -->
```json
{
  "scenarios": 2,
  "stepWidths": 12,
  "liveStateWidths": 16
}
```

Two scenarios; their three steps at 390 and 1180 px (12); and the four states the live step's buttons reach from where the reader starts (add 2, add 25, and both in either order), at both widths in each scenario (16). It saves screenshots in `out/review/sort-as-text/`. Look at them: a passing review shows that the pictures render and the captions' subjects are painted, not that they explain.

What you hand to the person who commissioned the explainer is `script.md`, the page and its receipt, and what you ran. The next section says what they review.

## Who writes it, and who reviews it

The explainers in this repository were written by agents, with a person reviewing them. Every commit under `scenes/explainers/` is Claude's: the four by the repository's owner are squash merges of pull requests Claude wrote (#102, #103, #104 and #106). The owner commissioned the work and reviewed and merged it.

The workflow, and what the person reviews where:

1. **The commission.** The person names the system, its version and the question.
2. **The script, before anything is drawn.** The agent writes `script.md`'s header; the person reads it. Is the question one a reader would ask? Is the **Answer** what the system actually does? Does the **Changed condition** change the outcome? Is **Checked against** the real system, at the version they care about, and is the **Grounding** grade honest? Is **Leaves out** where they would draw the line? This is the cheapest place to stop a wrong explainer.
3. **The receipt, on the page.** Under Sources, the one-sentence receipt from the Grounding line, and behind "How it was checked", the full Checked against line. The person checks it says what was actually done: "Checked by reading, not running" means nothing was run.
4. **The review's output.** `rayner review` passing, its screenshots in `out/review/<id>/` at phone and desktop widths, and every scenario read as text (`rayner see`, `rayner describe`). For a series or anything with authored motion, frames of the transitions too, since the checks do not see a token crossing a label.
5. **The pull request.** What was run and what was not. Reviews of the models find things the checks cannot: a code review of #102 reported ten findings, five of them defects in the Poppy models, each fixed with a test in #103.

## What it costs

These are this repository's own numbers, from its Git history and pull requests.

**One explainer.** Lines in each file of some catalogued explainers, at commit 3e71fe38, and of this guide's example:

| Explainer | Grounding | script.md | model.ts | model.test.ts | scene.ts | picture.ts | Whole folder |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sort-as-text (this guide) | live | 18 | 40 | 28 | 72 | 30 | 188 |
| galton-board | live | 30 | 115 | 140 | 175 | 140 | 765 |
| float-sum | live | 30 | 177 | 175 | 181 | 58 | 794 |
| unified-diff | live | 28 | 152 | 196 | 191 | 46 | 745 |
| string-length | live | 30 | 133 | 172 | 182 | 80 | 921 |
| python-dict | live | 26 | 117 | 111 | 192 | 151 | 770 |
| pg-page | recorded | 28 | 206 | 161 | 408 | 201 | 1,141 |
| trust-proxy | recorded | 28 | 226 | 268 | 834 | 189 | 1,663 |
| seasons | none | 26 | 49 | 100 | 517 | 802 | 1,646 |

The whole folder adds the oracle, fixtures, `answers.ts`, `fidelity.ts`, `scene.test.ts` and review subjects, and leaves out captured snapshots and lettering. sort-as-text has none of those: the tests that run its stages are in `test/explain-writing.test.ts`. The catalogued explainers above run from 745 to 1,663 lines, and in each the model's test is about as long as the model, or longer.

**Four explainers in an afternoon.** galton-board, float-sum, unified-diff and string-length were added in [#106](https://github.com/adewale/rayner/pull/106), each with a live oracle (Python's `math` and `statistics`, CPython's floats and JavaScript's `+`, `git diff` and `git apply`, Node's `Intl.Segmenter` and CPython's `len()`). They were written by agents, on one branch whose history runs from its base at 13:00 UTC on 14 November 2026 to its last fix at 15:04: about two hours, with the four explainers committed together at 14:38, so Git does not time the writing of each one. Each folder is 745 to 921 lines.

**A series.** The eight Poppy chapters, explaining a draft protocol, came in [#102](https://github.com/adewale/rayner/pull/102): 16,777 lines added across 80 files, of which 3,792 are JSON fixtures copied from the Poppy project, in 48 commits (35 of them work-in-progress snapshots) between 23:07 UTC on 9 November and 22:57 on 10 November 2026. What it took beyond writing, from [#101](https://github.com/adewale/rayner/issues/101):

- The first version put the protocol in one explainer with three columns of small text. `rayner check` and `rayner review` passed it, and on a phone its live step's smallest label was 5.6 px (item 1). Splitting it into eight questions, each with few enough parts to read whole at 390 px, is why there are eight chapters. Since #106, `check` fails a live step's label under 12 px on a phone.
- After all eight chapters passed `check` and `review`, every transition and live press was filmed at 200 ms intervals and looked at. That found 63 motion defects that no check flagged (item 14): moving parts over labels, two copies of one thing visible at once, answers readable before their cause arrived, motion that carried layout rather than meaning, transitions too long to sit through. `check`'s keyed-motion check now catches jumps, flicker and words readable before their cause lands; parts crossing labels and two copies of one thing are still yours to see.
- A code review then found five model defects, fixed in [#103](https://github.com/adewale/rayner/pull/103).

What this means for you: the files are the small part. Budget for the script review, the oracle (recording a run takes as long as the run's setup), a model test that fails first, the first draft's check failures, which section 7 shows are routine, and looking at every phone view and a few transitions frame by frame. A `read` or `none` explainer is cheaper to make and is worth less to a reader, and its receipt says so.
