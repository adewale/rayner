# Writing your own explainer

[The tutorial](TUTORIAL.md) gives you a finished explainer to read and break. This guide starts from nothing. It takes one question, "Why does `[10, 9, 1].sort()` give `[1, 10, 9]`?", from `rayner init --blank` to a page that passes `rayner review`. At each stage it says what to write and why, and shows what `rayner check` prints once you have written it.

You can follow it without having read the tutorial. Do each step in a terminal as you read: the guide is ordered so that every command's output matches what is printed here.

What the guide prints is checked. The finished explainer is in [`scenes/tutorial/sort-as-text/`](../scenes/tutorial/sort-as-text/), and every file this guide prints is that folder's file, with package imports. Every output is what the command printed. [`test/explain-writing.test.ts`](https://github.com/adewale/rayner/blob/main/test/explain-writing.test.ts), part of `npm test`, builds each stage in a fresh folder, runs the guide's `init` and `check` commands there and fails when what they print differs from this page. [`test/browser/explain-writing-review.test.ts`](https://github.com/adewale/rayner/blob/main/test/browser/explain-writing-review.test.ts) does the same for `review` in Chromium (with `EXPLAIN_BROWSER=1`).

You need what [the tutorial's "Before you start"](TUTORIAL.md#before-you-start) lists: Node 24 or later, and the `rayner` package installed, as [the quick start](../README.md#quick-start) shows. Only the last command, `rayner review`, also needs Chromium.

## What you will build

A Rayner explainer is a web page that answers one question in steps. The reader presses Next, the picture changes, and it then holds still while they read the caption. The page this guide builds has three steps:

1. **ask.** The picture shows the array `[10, 9, 1]`. The page asks where 10 ends up after `sort()` and offers three buttons: First, Between 1 and 9, Last. The reader picks one.
2. **answer.** A second row appears under the array, holding what `sort()` made of it, each element in quotes: `"1"`, `"10"`, `"9"`. The page tells the reader what they predicted and what the answer is, and the caption gives the reason: `sort()` compares the elements as strings.
3. **add.** The page puts 100 on the end of the array, and its box lands between 10 and 9. The reader can then press **add 2** and **add 25**, guess where each lands, and watch.

Above the picture is a setting, **Compare function**, with two options: `none` and `(a, b) => a - b`. With the second, the same three steps show the numeric sort: 10 goes last, the second row has no quotes, and 100 lands last. Under the page's Sources, one sentence says what the explanation was checked against and how.

To look at the finished page before you write anything, run `npm run rayner -- preview scenes/tutorial/sort-as-text/scene.ts` in a checkout of this repository and open http://127.0.0.1:5174/.

The rest of the guide uses five words for the parts of that page:

- A **step** is one picture with a title, a short line under the title, and a caption.
- A **scenario** is the explainer under one choice of its settings. This explainer has two, one for each compare function.
- The **model** is the system being explained, rewritten as a small program that draws nothing. Every value on the page comes from it.
- The **oracle** is the real thing the model is tested against. Here it is Node's own `sort()`.
- A **live step** is a step where the reader presses buttons and the model works out what happens. Here it is the last step.

An explainer is a folder of files with one job each:

| File | What it holds |
| --- | --- |
| `script.md` | The intent: who is asking, the answer, what the model is checked against. It is for you and your reviewer. The reader never sees the file, but Rayner reads its header. |
| `model.ts` | The model. |
| `model.test.ts` | The test that compares the model with the oracle. |
| `picture.ts` | A function that turns the model's state into shapes. |
| `scene.ts` | The steps: their words, the state each one shows, and the settings. |

You write them in that order, top to bottom. `init --blank` creates four of them as stubs, you add `picture.ts` in section 6, and `rayner check` tells you after each one what is left.

## 1. Choose a subject

Before any file, test the subject against four questions. If it fails one, pick a different subject or publish something simpler than an explainer.

**Is it one question, with an answer that fits in a sentence?** A subject is a question a particular reader asks after seeing a result they did not expect, so write it as they would ask it. "How does sorting work in JavaScript?" is a topic. "Why does `[10, 9, 1].sort()` give `[1, 10, 9]`?" is a question, and it has a one-sentence answer: `sort()` compares the elements as strings.

**Is there one input that changes the outcome?** This is the **changed condition**: an input that, when changed, changes the result in a way the reader can predict once they understand the answer. For `sort()` it is the compare function. With none, `[10, 9, 1]` sorts to `[1, 10, 9]`. With `(a, b) => a - b`, it sorts to `[1, 9, 10]`. A reader who has understood "as strings" can say in advance what the second one does. Each option of a changed condition becomes a scenario, so it has to earn its place: a setting whose other option only changes the numbers, or recolours the picture, doubles the scenarios and teaches nothing ([FAQ](../FAQ.md#how-many-scenarios-can-one-explainer-have)).

**Does the reader do something a still picture could not offer?** Rayner is worth it when the explanation depends on an input ([FAQ](../FAQ.md#when-is-rayner-worth-using-instead-of-a-diagram-or-a-screenshot)) or when the reader should act: commit to a prediction, switch the condition, press events and watch what the model does. In this repository's blind comparisons on 1 November 2026, before a Rayner page could take a prediction, a reviewer preferred plain pages that let the reader predict and drive a live machine over Rayner pages where the reader only pressed Next, in all three pairs of both rounds ([the benchmark](https://github.com/adewale/rayner/blob/main/bench/explainers/README.md)). The `sort()` answer is one comparison, so a picture of `[1, 10, 9]` with `"1" < "9"` under it would nearly do. Three things earn it a Rayner page: a prediction before the answer, the two compare functions side by side, and a last step where the reader adds numbers and tests the rule on cases they choose. If your subject has none of those, publish the picture.

**Is there something real to check the model against?** The model is your account of the system, and it can be wrong in the same way your understanding is. An oracle catches that. For `sort()` the oracle is Node itself, which is already installed because Rayner runs on it. If you cannot name anything real, you can still write the explainer, but its page will say that nothing outside its own tests checked it, and a reader should trust it less. Section 4 covers the choice.

`sort()` passes all four, and its answer is small enough that the whole explainer is 186 lines ([What it costs](#what-it-costs)).

## 2. Start from a blank explainer

```sh
npx rayner init --blank sort-as-text --question "Why does [10, 9, 1].sort() give [1, 10, 9]?"
npx rayner check sort-as-text/scene.ts --json
```

The first command makes a folder, `sort-as-text`, holding `script.md`, `model.ts`, `model.test.ts` and `scene.ts`. The question is the script's heading. Every other part is a placeholder that starts with `TODO:` and says what goes there.

The second command is the one you will run after every change. `check` runs the model's test, then plays every step of every scenario and tests the result. While placeholders remain it fails, and lists them in the order to write them:

<!-- check: blank -->
```text
rayner: This explainer still has placeholders, each marked TODO:. To do, in order:
1. script.md: fill in the intent header: write Reader, Answer, Changed condition, Reader's own work, Leaves out, Check yourself question 1 and Why this explainer in place of each TODO
2. script.md: write Checked against and Grounding: the real system model.test.ts compares the model with, and how (live, recorded, read or none, then the system and its version)
3. model.test.ts fails: the model agrees with the real system (TODO: replace this placeholder with a comparison of the model against something real: a reference implementation run live, published test vectors, or a recorded run of the real system)
4. scene.ts: step "start" still says TODO in its title, line and caption: draw the model's state and say what the picture shows
```

Each item names a file and what to write in it. The order is the method. First what the explainer must achieve (item 1), then what it is checked against (item 2), then a model that agrees with that (item 3), and only then the picture (item 4). The picture comes last because it is drawn from the model's state. Sections 3 to 7 take the items in turn, and the list shrinks as you go.

## 3. Write the script

Open `sort-as-text/script.md`. Its header is a list of labelled lines, and this section fills in all but two of them. Leave **Checked against** and **Grounding** as they are: they are item 2 of the list, and section 4 writes them.

Write the lines in this order. Section 1 has already answered most of them.

1. **Reader.** Say who asks the question and what they wrongly assume. The wrong assumption is what the explainer corrects. Here the reader expects `sort()` to order numbers by size, and that belief becomes the wrong option, "Last", in the prediction.
2. **Answer.** Write the one sentence that answers the question. Some step must say it: `check` fails until one does, and reports which step says it first. The scene will put this sentence inside its captions, so this one is written to read in the middle of a sentence, with no capital letter and no full stop.
3. **Changed condition.** Name the input, both of its values and the outcome under each, and say what stays the same. You write the outcomes now, before any drawing, so that the picture has to match a prediction you made in advance.
4. **Reader's own work.** List what the page lets the reader do, and promise only what it will do. This line is also your plan for the steps: here a prediction (the first step), a setting to switch, and buttons that add numbers (the last step).
5. **Leaves out.** Say where the claim stops. This one has two parts: what `sort()` does that the explainer does not cover, and the limit of its last step, which adds 2, 25 and 100, each once. The model will enforce that limit.
6. **Check yourself.** Under the header, write a question the reader can answer after the last step, about a case the steps did not show, and its answer. `[2, 10, 1]` is not on the page, where every array starts with 10, 9, 1. The page asks the question after the last step and keeps the answer hidden until the reader opens it.
7. **Why this explainer.** Write your reasons, including why a still would not do. This is section 1's third question, answered for your subject. Rayner does not read this part; it is for your reviewer.

The finished script, with the two lines that section 4 adds:

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

[The reference](REFERENCE.md#scene) gives the header's rules. Run `check` again. With every line but Checked against and Grounding written, item 1 has gone:

<!-- check: intent -->
```text
rayner: This explainer still has placeholders, each marked TODO:. To do, in order:
1. script.md: write Checked against and Grounding: the real system model.test.ts compares the model with, and how (live, recorded, read or none, then the system and its version)
2. model.test.ts fails: the model agrees with the real system (TODO: replace this placeholder with a comparison of the model against something real: a reference implementation run live, published test vectors, or a recorded run of the real system)
3. scene.ts: step "start" still says TODO in its title, line and caption: draw the model's state and say what the picture shows
```

## 4. Choose the oracle

The oracle is what `model.test.ts` compares the model with. Without one, the values on the page are only what you believe. Choose it now, before writing the model, because it decides what the model's test can do.

The script names the oracle in two lines:

- **Checked against** says what the model is compared with and where, in full. It names the evidence files in backticks, and each must exist in the folder.
- **Grounding** grades that evidence with one of four words, then a colon, then the system and its version. The page turns this line into a one-sentence receipt under Sources, so it is the part a reader sees.

The four grades ([`explain/grounding.ts`](https://github.com/adewale/rayner/blob/main/explain/grounding.ts)), each with an explainer from this repository's catalogue:

| Grade | What it means | Catalogued example |
| --- | --- | --- |
| `live` | The model's tests run the real system each time they run | **python-dict**: `oracle/cpython_dict.py` builds a dict in CPython 3.12, reads its index and entries from memory before and after `del d[0]`, and the model's test runs it and compares |
| `recorded` | The real system was run once and its answers are frozen; the tests compare with them | **pg-page**: a Postgres 18.6 server in Docker, measured on 2026-10-25; the page sizes are constants in `model.test.ts`, under a comment saying how they were measured |
| `read` | A specification or source was read and transcribed; nothing was run | **poppy** and its seven sibling chapters: the Personal Agent Protocol draft, with tests naming the section each rule comes from, and the project's published JSON Schemas copied into `fixtures/` |
| `none` | Nothing outside the model's own tests | **seasons**: the model computes cited formulas, and its tests check them by property and by hand-worked values |

These labels describe how the evidence was obtained. Its strength also depends on independence, coverage, relevance and version: a live check of one easy case can establish less than a careful recording or specification comparison. Choose the approach that fits your subject:

1. **Can the real thing run where the tests run?** Then run it: the grade is `live`. A language's built-in (`sort()`, `len()`, `Intl.Segmenter`), a CLI (`git`, `rustc`) or a library can all be called from a test.
2. **Can you run it once by hand?** Then record it: the grade is `recorded`. A database server, a Docker image or a paid API fits here. Keep the program that ran it in `oracle/`, have it write its answers to `fixtures/`, and make `model.test.ts` compare the model with the fixture. Write down in the fixture, or beside the constants, exactly what was run: the version, the date and the commands, as pg-page's comment does. You can keep both kinds. python-dict has the fixture its oracle wrote, `fixtures/cpython-dict.json`, and a test that runs the oracle again when CPython 3.12 is there.
3. **Is there only a document?** Then read it: the grade is `read`. A draft protocol, or an RFC with no reference implementation, fits here. Look for anything the project publishes that a test can hold the model to. Poppy's chapters were held to the project's JSON Schemas and example documents, and those tests found real disagreements ([#101](https://github.com/adewale/rayner/issues/101), item 13). A test of a rule you read in prose encodes the same reading that wrote the model, so it cannot catch a misreading. Say so in Checked against.
4. **Is there nothing?** Then the grade is `none`, and the page says so.

Two rules keep the grade honest:

- **Grade the evidence you have.** A fixture captured once is `recorded`, however thorough the tests that read it. A test that runs the tool when it is installed and otherwise skips is `live` only where it runs. In your own project, skip with `t.skip(reason)`, and make the run that matters fail when the tool is missing. This repository does that with `skipOracle` ([`scenes/explainers/lib/oracle.ts`](https://github.com/adewale/rayner/blob/main/scenes/explainers/lib/oracle.ts)): CI sets `RAYNER_REQUIRE_ORACLES=1`, so a live oracle that cannot run there fails instead of skipping. [Testing](TESTING.md#oracles-ci-runs-and-recordings) lists which oracles CI runs and which are recordings.
- **Name the version.** `live: Git` is weaker than `live: Git's own apply and diff (2.43.0 when written)`. A live oracle runs whatever version the machine has, so say which one you wrote against.

For `sort()`, question 1 settles it. `Array.prototype.sort` is built into the Node that runs the tests, so the test can call it directly, on every run, at no cost. The grade is `live`. The version needs care, because a live oracle is whichever Node the tests run on: the Grounding line says that, and adds the version it was written against. Checked against names `model.test.ts`, the one evidence file, and says what the test will do. That is a promise section 5 has to keep.

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

Write both lines into `script.md` and run `check`. The script is done, and the list is down to the model's test and the picture:

<!-- check: grounded -->
```text
rayner: This explainer still has placeholders, each marked TODO:. To do, in order:
1. model.test.ts fails: the model agrees with the real system (TODO: replace this placeholder with a comparison of the model against something real: a reference implementation run live, published test vectors, or a recorded run of the real system)
2. scene.ts: step "start" still says TODO in its title, line and caption: draw the model's state and say what the picture shows
```

## 5. Write the model, and test it against the oracle

The model is the system as plain TypeScript. It draws nothing, so a test can run it. It has one rule that is easy to break: it must not call the system it explains. A model of `sort()` that called `sort()` would agree with the oracle whatever you believed, and the comparison would prove nothing. This one orders the numbers by insertion.

### What the model has to provide

The script already says what the page will show, so read the model's parts off it:

- The **Changed condition** has two values. They are the type `Compare`: `'none'` or `'numbers'`.
- The **Answer** is a rule about order. It is the function `sorted(values, compare)`, which returns the values in the order `sort()` gives them. The rule itself is one line, `before`: as strings with no compare function, as numbers with `a - b`.
- The first step asks for a prediction before it shows the result, so the picture needs to know whether to show the sorted row yet. That is the `sorted` flag in `State`, beside the array and the compare function.
- **Reader's own work** promises buttons that add 2, 25 or 100. Each button press is an **event**. `EVENTS` lists them, and `next(state, event)` gives the state after one: the same array with the number on its end.
- **Leaves out** says each number is added once. `bound(state, event)` enforces it. It returns `undefined` when the event may go ahead, and otherwise the reason it may not, in words the page can show.

Replace the stub in `sort-as-text/model.ts` with this:

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

### The test

Now keep the promise the Checked against line made. Replace the placeholder in `sort-as-text/model.test.ts`:

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

`real` is the oracle: it calls Node's `sort()` on a copy of the array. The three tests do different jobs:

1. The first compares `sorted` with `real` on six fixed arrays, under both compare functions. The arrays are the reader's own array, the Check yourself array, numbers of different lengths, negatives and zero, a fraction with a repeated number, and `1e21`, whose string is `"1e+21"`.
2. The second walks every array the reader can reach with the buttons, using `next` and `bound` as the page will, and compares each with `real`. Its count, `1 + 3 + 6 + 6`, is the start, then each number alone, then each ordered pair, then each order of all three: 16 states. This is the "every array the live step reaches" of the Checked against line.
3. The third pins what `next` and `bound` do, including the exact words of the refusal.

`check` runs this file first. You can also run it alone, with `node --test sort-as-text/model.test.ts`, which prints Node's full report.

### Check that the test can fail

A test that has only ever passed has not shown that it can catch anything. Put the reader's wrong belief into the model and see what happens. In `model.ts`, make `before` compare as numbers whatever the compare function is.

Diffs in this guide all read the same way: the `-` line is the draft, and the `+` line is the finished file. To try a draft, replace the `+` line in your file with the `-` line.

<!-- draft: model sort-as-text/model.ts -->
```diff
-const before = (a: number, b: number, compare: Compare) => a - b < 0;
+const before = (a: number, b: number, compare: Compare) => (compare === 'none' ? String(a) < String(b) : a - b < 0);
```

Run `check`. The scene still has its placeholders, so the failing test joins the to-do list, ahead of the scene:

<!-- check: model -->
```text
rayner: This explainer still has placeholders, each marked TODO:. To do, in order:
1. model.test.ts fails: the model sorts as Node sorts, with no compare function and with (a, b) => a - b ([10,9,1] with none + actual - expected [); every array the live step reaches sorts as Node sorts it (Expected values to be strictly deep-equal: + actual - expected [)
2. scene.ts: step "start" still says TODO in its title, line and caption: draw the model's state and say what the picture shows
```

Both of the tests that call the oracle fail, and the first names its case: `[10,9,1] with none`. The oracle has caught the misconception the explainer is about. Once no placeholder is left, a failing model test stops `check` before it looks at anything else, with the same reasons after "The model test fails". Put the real rule back and run `check` again. The test passes, and one item is left:

<!-- check: tested -->
```text
rayner: This explainer still has placeholders, each marked TODO:. To do, in order:
1. scene.ts: step "start" still says TODO in its title, line and caption: draw the model's state and say what the picture shows
```

## 6. Draw the picture

A picture is a function from the model's state to shapes. `check` redraws it from the state at every step, so anything the picture shows has to be in the state.

### What the picture has to show

Decide that before drawing, from the script:

- **The array as written, and the result under it.** The question is about a before and an after, so both stay on screen, one row above the other. The reader compares them without remembering either.
- **The strings.** The answer is that `sort()` compares strings. With no compare function, the sorted row shows each element in quotes, `"10"`, which is the thing `sort()` compared. With `a - b` it shows plain numbers. The reason is then in the picture as well as the caption.
- **The comparison in force.** A line below the sorted row says "sort() compares them as text" or "sort((a, b) => a - b) compares them as numbers". Keeping it below the row leaves the incoming numbers a clear route. It is the one place where the two scenarios' pictures differ before the sort.
- **Nothing else.** The row has to hold six boxes on a phone after the reader has added three numbers, so each box is a number and no more.

### How it is drawn

The blank scene draws its state inline, as one line of text. This picture is longer, so it gets a file of its own. Create `sort-as-text/picture.ts`.

Four facts make the code below readable:

- Positions are in stage units. The stage is 16 wide and 9 high, the origin is its centre, and y goes up. `at: [0, 1.5]` is the middle of the stage, 1.5 units above centre.
- The shapes come from the [drawing kit](REFERENCE.md#drawing-kit), `rayner/drawing`. `label` draws a line of words and `tile` draws a labelled box (`raised` gives it a filled body). The picture receives a `DrawContext` as `s`. `tones(s)` reads its colours by role, such as `soft` for secondary words. `SPACE` holds the kit's spacings.
- The kit's smallest type size is `TYPE.small`, which a phone can read, and `label` refuses anything smaller. Draw words with `label`, or with `tile` and `plate`, which use it, and this is decided for you; a card or code panel takes the size you give it.
- Every part has a **key**, a name that says what the part is. `keyedParts()` collects parts under their keys, and `parts.group()` returns them as one group. Here each box is keyed by its number: `array:10`, `sorted:10`. When the state changes, Rayner matches parts by key, so a box whose number is still there slides to its new place. Without keys it would fade out and a copy would fade in somewhere else, and the reader could not follow which number went where.

<!-- sort-as-text/picture.ts -->
```ts
import { Group } from 'rayner';
import type { DrawContext } from 'rayner/explain';
import { SPACE, TYPE, keyedParts, tile, tones, label } from 'rayner/drawing';
import { sorted, type State } from './model.ts';

/** A box's width, and where row `y`'s boxes stand: centred on the stage, SPACE.s apart. */
const WIDTH = 1.9;
const row = (count: number) => (i: number) => (i - (count - 1) / 2) * (WIDTH + SPACE.s);

/** One number as a raised box: one group, its two parts keyed `<key>:box` and `<key>:label`. */
const numberBox = (s: DrawContext, text: string, at: [number, number], key: string) => tile(s, text, { at, key, width: WIDTH, raised: true, size: TYPE.small });

/**
 * The array as written, and under it what sort() makes of it once the state says it is sorted. With
 * no compare function the sorted row shows each number as the string sort() compares, in quotes.
 * Every box is keyed by its number, so when a number joins, the boxes it passes slide aside.
 */
export function drawSort(s: DrawContext, st: State): Group {
  const parts = keyedParts(), t = tones(s);
  const across = row(st.values.length);
  parts.add(label(s, 'The array', { at: [0, 1.5], color: t.soft }), 'array:name');
  st.values.forEach((n, i) => parts.add(numberBox(s, String(n), [across(i), 0.6], `array:${n}`), `array:${n}`));
  const how = st.compare === 'none' ? 'sort() compares them as text' : 'sort((a, b) => a - b) compares them as numbers';
  parts.add(label(s, how, { at: [0, -3], color: t.soft }), 'sorted:name');
  if (st.sorted)
    sorted(st.values, st.compare).forEach((n, i) =>
      parts.add(numberBox(s, st.compare === 'none' ? `"${n}"` : String(n), [across(i), -1.9], `sorted:${n}`), `sorted:${n}`));
  return parts.group();
}
```

Read `drawSort` from the top: the row's name, one box per value in the order written, the line naming the comparison, and, only when `st.sorted` is true, one box per value in the order the model's `sorted` gives. The picture calls the model for that order. It never works one out itself.

## 7. Write the steps

The scene is the explanation: the steps, their words, and which state each one shows.

### Plan the steps

The script's Reader's own work line already lists them. Give each step one thing for the reader to conclude:

| Step | State it shows | What the reader does or concludes |
| --- | --- | --- |
| `ask` | The array, not yet sorted | Predicts where 10 goes |
| `answer` | The array and the sorted row | Sees where 10 went, and reads why |
| `add` | The same, after 100 is added | Tests the rule on 2 and 25 |

Each step has three pieces of text. The **title** says what the picture proves. The **line** under it says where to look or what to do, in about ten words. The **caption** connects what is visible to what follows from it, and it must hold for the scenario it is shown in. This explainer has two scenarios, so most of its text is written twice, once for each.

### The scene

Replace `sort-as-text/scene.ts` with this:

<!-- sort-as-text/scene.ts -->
```ts
import { Scene } from 'rayner';
import { Machine, answerOf, settingsOf, stage, view } from 'rayner/explain';
import type { ExplainerMeta, Setting } from 'rayner/explain';
import { beats, flight } from 'rayner/drawing';
import { EVENTS, bound, next, sorted, start, type SortEvent, type State } from './model.ts';
import { drawSort } from './picture.ts';

const PLACES = ['First', 'Between 1 and 9', 'Last'];

export default class SortAsText extends Scene {
  static meta = {
    sources: ['https://tc39.es/ecma262/2025/#sec-sortcompare'],
  } satisfies ExplainerMeta;
  static settings = [
    { id: 'compare', label: 'Compare function', default: 'none', options: [{ value: 'none', label: 'none' }, { value: 'numbers', label: '(a, b) => a - b' }] },
  ] as const satisfies readonly Setting[];

  override state: State = start(settingsOf(this, SortAsText).compare);

  override async construct() {
    const s = stage(this);
    const compare = settingsOf(this, SortAsText).compare;
    const asText = compare === 'none';
    const picture = view(this, (st, _shown, drawing) => drawSort(drawing, st), { drawing: s.drawing });
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
    await this.play(machine.sendSequence(['add 100']));
  }
}
```

Read it from the top.

**Sources and the setting.** `static meta` names the sources, which the page lists. `static settings` declares the changed condition as a setting with two options. `as const` keeps their literal names, and `settingsOf(this, SortAsText).compare` is typed as `'none' | 'numbers'`, with no cast or repeated union. The `state` field calls `start` with that setting, so each scenario begins with its selected comparison even at frame zero. The reader can switch between them, and `check` and `review` visit both. Inside `construct`, `asText` selects the captions for that comparison.

**The stage and the view.** `stage(this)` draws the paper and a heading that follows each step's title and line. The view binds `{ drawing: s.drawing }` to capture the stage’s drawing context. Its draw passes that context and the current model to `drawSort(drawing, st)`. When a step changes the model, `picture.sync()` moves the picture to match. `check` redraws every view from every step's state and fails one that differs, so the picture cannot drift from the state.

**The machine.** A `Machine` is what makes the last step live. It takes the model's `EVENTS`, `next` and `bound`, the state it starts in (the model's start, with the sorted row showing), and the views to redraw. Its `transition` is the motion for one press: the new number's sorted box flies down from where the number joined the array, along the gap between the rows, after the boxes it passes have made room. `beats` and `flight` are the kit's functions for that. `runTime: 2.2` is the transition's length in seconds, and section 8 shows what happens without it.

**A step.** `await this.step(name, { title, line, caption })` starts a step, and the lines after it, up to the next `this.step`, are what happens in that step:

- **`ask`** brings the picture in with `s.enter(picture)`. Its `predict` gives the reader the three buttons. The `answer` is computed from the model, `PLACES[sorted(...).indexOf(10)]`, and never typed, so it changes with the setting: "Between 1 and 9" with no compare function, "Last" with `a - b`. The next step reveals it. `check` fails a prediction whose answer is not one of its options, or that no later step reveals.
- **`answer`** sets `sorted: true` in the state and calls `picture.sync()`, and the sorted row appears. Its caption takes the script's Answer through `answerOf(this)`, so the sentence is written in one place. Both scenarios' captions say it, which is what `check` looks for.
- **`add`** plays `machine.sendSequence(['add 100'])`: the scene presses the first button itself, so the reader sees one number land before they try. A machine is live at the step where it last plays, so this is the step where the page shows a button for each event. `check` explores every state those buttons can reach, 16 here, and draws and tests each one.

Save the file. To watch the page while you work on it, run `npx rayner preview sort-as-text/scene.ts --watch` in a second terminal and open http://127.0.0.1:5174/. It rebuilds when you save.

## 8. Fix what check reports

With these files as printed, `check` passes. A first draft rarely does. This section shows four failures and how to read them. The first is the one this explainer's first draft ran into. The other three are mistakes as easy to make, made here on purpose. Each is the finished explainer with one thing wrong: the diff shows the draft (`-`) and the fix (`+`), and the output is what `check` printed for that draft.

The outputs share a shape. The first line names the check that failed and the scenario it failed in. Where a list follows, between `+ [` and `- []`, it holds the problems found, and `- []` is the empty list `check` expected.

### Text running into the heading

The stage draws the step's title and line at the top. The first layout put the row's name too high:

<!-- draft: heading sort-as-text/picture.ts -->
```diff
-  parts.add(label(s, 'The array', { at: [0, 3], color: t.soft }), 'array:name');
+  parts.add(label(s, 'The array', { at: [0, 1.5], color: t.soft }), 'array:name');
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

Each entry names a state of the live step ("after add 2"), the text that is in the way ("The array") and the heading text it hits, which here is the step's line. A step with a line has less room under its heading than a step without. The fix is to move the label down and run `check` again: at `2.45` this label already passes, and the finished picture has it at `1.5`, close to the row it names.

### A label a phone cannot read

Suppose you copy the blank scene's `new Text(...)` and shrink it so that six numbers fit:

<!-- draft: phone sort-as-text/picture.ts -->
```diff
-import { Group, Text, keyed } from 'rayner';
+import { Group } from 'rayner';
@@
-const numberBox = (s: DrawContext, text: string, at: [number, number], key: string) => new Group(keyed(new Text(text, { fontSize: 0.3, color: s.look.ink, shaping: s.shaping }).moveTo(at), `${key}:label`));
+const numberBox = (s: DrawContext, text: string, at: [number, number], key: string) => tile(s, text, { at, key, width: WIDTH, raised: true, size: TYPE.small });
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

Each entry gives the state, the label, the size it would be on a phone 390 px wide (6.7 px), and the limit (12 px). The rule behind it: after each press, a phone shows the live step's whole picture, so every label there must read at 12 px or more, or sit whole inside one of the step's close-ups. The message also gives the fix, a size of at least 0.54.

The kit applies this rule earlier. Its `label` throws on such a size before anything is drawn (`label(): "10" at 0.3 units is under TYPE.small (0.56), which a phone cannot read; put the fact in the caption instead`), which is why the finished picture draws with `tile` at `TYPE.small`. Outside a live step, `check` reports phone sizes in `legibility` and does not fail on them, and `rayner review` measures them on the served page.

### A caption over 80 words

The first answer caption tried to say everything:

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

A caption has to fit beside the picture on a phone, so `check` fails one over 80 words. The message says what to do: keep the point in the first sentence and cut the rest, or give it a step of its own. Here the cut was easy, because the rest had a home already. The code units belong in the script's reasons, and the compare function has its own scenario.

### Motion a reader cannot follow

The authored transition takes about 2.2 seconds: the boxes make room, the number flies, the rest settles. Without `runTime`, the machine gives each event 0.6 seconds. A longer authored transition is refused before its fades can be compressed:

<!-- draft: motion sort-as-text/scene.ts -->
```diff
       }])),
+      runTime: 2.2,
```

<!-- check: motion -->
```text
rayner: machine.send("add 100"): authored transition lasts 2.200 s but the event allows 0.600 s; increase the machine runTime or shorten the transition instead of compressing its fades
```

The diagnostic names the event and both durations. Set `runTime` to the transition's own length, 2.2 seconds, or shorten the authored sequence. Compression is refused because it would turn intentional fades into pops.

`check` also follows every keyed part through every press. It fails a jump, a flicker, words readable before the token that causes them lands, a token that covers a label's words, and words carried too small to read ([keyed motion](REFERENCE.md#keyed-motion)). It also checks overlapping duplicate words and motion continuing past five seconds. It does not catch every crossing of a drawing or motion that carries layout and not meaning. Watch a few presses frame by frame yourself. On the Poppy series, filming every transition found 63 motion defects after every check that existed then had passed ([What it costs](#what-it-costs)).

## 9. Read the report, then read the captions

With every fix in, `check` passes. It prints its report as JSON and saves it in `out/checks/sort-as-text/report.json`. Part of it, for the first scenario:

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
      "states": 16,
      "observations": 16
    }
  ]
}
```

Compare each part with what you meant to write:

- `model` is the oracle test's run: three tests, three passed.
- `script.answer` is the first step that states the Answer, and its position. It should be the step you planned to say it in.
- `predictions` is the prediction, its answer in this scenario, and the step that reveals it.
- `machines` lists the live step’s events. They reach 16 states, the count from the model’s second test. This machine uses the full model as its observation, so the report counts 16 observations as well.

In the full report, `legibility.labelsUnder12PxAt390` is the number of labels a phone reader sees under 12 px. Keep it at 0.

A passing `check` does not say the captions are true. That part is yours. Print each step of each scenario as text:

```sh
npx rayner see sort-as-text/scene.ts answer --scenario compare=numbers
```

`see` prints one step's picture drawn in text, then its title, line and caption. Run it for `ask`, `answer` and `add`, with `compare=none` and `compare=numbers`, and ask of each sentence whether the other scenario would make it false. [The tutorial's step 8](TUTORIAL.md#8-break-a-caption) shows a false caption that passes every check.

## 10. Review it, and hand it over

```sh
npx rayner review sort-as-text/scene.ts --out public/sort-as-text.html --json
```

`review` is the last gate. It runs the checks again and builds the page. It then opens the page in Chromium at two widths, 390 px for a phone and 1180 px for a desktop, and visits every step of every scenario and the states the live step's buttons reach. On success it prints a receipt as JSON, and because of `--out` it keeps the exact page it reviewed at `public/sort-as-text.html`, with its receipt, the response headers a host must send, and a loader for embedding ([Publishing](PUBLISHING.md)). Its counts for this explainer:

<!-- review -->
```json
{
  "scenarios": 2,
  "stepWidths": 12,
  "liveStateWidths": 16
}
```

Work the counts out for your own explainer and compare. Here there are two scenarios. Their three steps at two widths make 12. The live step's buttons reach four states from where the reader starts (add 2, add 25, and both in either order), and four states at two widths in two scenarios make 16.

`review` saves screenshots in `out/review/sort-as-text/`. Look at them. A passing review shows that the pictures render and that the things the captions name are painted. It does not show that they explain.

What you hand to the person who commissioned the explainer is `script.md`, the page with its receipt, and a list of what you ran. The next section says what they do with each.

## Who writes it, and who reviews it

An explainer usually has two people behind it: one commissions and reviews it, and one writes it. In this repository the writers were agents. Every commit under `scenes/explainers/` up to #107 is Claude's: the five by the repository's owner are squash merges of pull requests Claude wrote (#102, #103, #104, #106 and #107). The owner commissioned the work and reviewed and merged it.

The review happens at five points, and the earlier ones are cheaper:

1. **The commission.** The person names the system, its version and the question.
2. **The script, before anything is drawn.** The writer fills in `script.md`'s header and the person reads it. Is the question one a reader would ask? Is the **Answer** what the system actually does? Does the **Changed condition** change the outcome? Is **Checked against** the real system, at the version they care about, and is the **Grounding** grade honest? Is **Leaves out** where they would draw the line? This is the cheapest place to stop a wrong explainer, which is why sections 3 and 4 come before any code.
3. **The receipt, on the page.** Under Sources there is the one-sentence receipt from the Grounding line, and behind "How it was checked", the full Checked against line. The person checks that it says what was actually done: "Checked by reading, not running" means nothing was run.
4. **The review's output.** `rayner review` passing, its screenshots in `out/review/<id>/` at phone and desktop widths, and every scenario read as text (`rayner see`, `rayner describe`). For a series, or anything with authored motion, frames of the transitions too, since the checks do not catch every motion defect ([keyed motion](REFERENCE.md#keyed-motion) lists what they miss).
5. **The pull request.** It says what was run and what was not. Reviews of the models find things the checks cannot: a code review of #102 reported ten findings, five of them defects in the Poppy models, each fixed with a test in #103.

## What it costs

These are this repository's own numbers, from its Git history and pull requests.

**One explainer.** Lines in each file of some catalogued explainers, at commit 3e71fe38, and of this guide's example:

| Explainer | Grounding | script.md | model.ts | model.test.ts | scene.ts | picture.ts | Whole folder |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sort-as-text (this guide) | live | 18 | 40 | 28 | 71 | 29 | 186 |
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
- After all eight chapters passed `check` and `review`, every transition and live press was filmed at 200 ms intervals and looked at. That found 63 motion defects that no check flagged (item 14): moving parts over labels, two copies of one thing visible at once, answers readable before their cause arrived, motion that carried layout rather than meaning, transitions too long to sit through. `check`'s keyed-motion check now catches jumps, flicker, words readable before their cause lands and a token over a label's words. Brought back into the current scenes, 26 of 59 of those defects are caught ([the motion corpus](MOTION-CORPUS.md)); a token over a drawing and two copies of one thing apart are still yours to see. The newer five-second ceiling and duration diagnostic add mechanical checks; their owning tests retain static-hold controls.
- A code review then found five model defects, fixed in [#103](https://github.com/adewale/rayner/pull/103).

**What to budget for.** The files are the small part. The time goes on the steps this guide spends its length on: the script review, the oracle (recording a run takes as long as the run's setup), a model test that you have seen fail, the first draft's check failures, which section 8 shows are routine, and looking at every phone view and a few transitions frame by frame. A `read` or `none` label says which outside evidence is absent; it does not determine the explainer's cost or value to a reader. The receipt should make that boundary clear, while review considers the evidence's coverage and the explanation's usefulness.
