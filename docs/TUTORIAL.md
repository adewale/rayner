# Your first explainer

A Rayner explainer is a web page that answers one technical question in steps. The reader presses Next, something on the stage changes, and the picture then holds still while they read the caption. This tutorial builds one that answers this question: what is the difference between the LRU and MRU cache replacement policies?

You will plan the explainer, generate it with `rayner init`, test its model against a published source, read how the scene draws the model's answers, break it on purpose to see what the checks catch and what they miss, and build the page. Each step applies one of the principles below. The [authoring skill](../skills/rayner-explainers/SKILL.md) gives coding agents the same principles, and the [editorial rubric](EXPLAINER-RUBRIC.md) scores finished explainers against them.

## What makes an explainer work

1. Start from a reader's question. Write down who is asking, what result they saw and the answer you can support. If a screenshot or a short diff already answers the question, publish that instead.
2. Open on the result that needs explaining. Names for the parts can wait until the reader needs them.
3. Get every value from a model. The numbers, paths and outcomes on screen come from a small program, which you check against the real system by running the tool, using its test vectors or citing the exact source version you read. A caption never states an answer the model did not give.
4. Give each step one inference. A step answers a question the previous step raised. Its title says what the picture proves, its line says where to look, and its caption connects what is visible to what follows from it.
5. Leave the evidence on screen. Readers read the caption while the picture is still, so the item, mark or value the caption mentions must be there when the motion stops. Put a value beside the thing it measures.
6. Use a second case to test the tempting shortcut. Change one input that could prove the reader's guess wrong, keep everything else fixed, and write each case's caption for that case's own outcome. A change that only recolours the picture tests nothing.
7. Move things only to show order, identity or cause. If the final picture already tells the whole story, show it at once. When something changes form, keep it recognisable, because a morph on its own does not prove that the before and after are the same thing.
8. End on the specific result and its limit: what the explainer showed, and where the claim stops holding.

`rayner check` and `rayner review` find missing, overlapping and unreadable ink. Because they cannot tell whether a caption is true, principles 1, 3, 6 and 8 stay with you.

## Before you start

You need Node 24 or later. In your project, run `npm install --save-dev rayner`; the commands below then run as `npx rayner <command>`. In a checkout of this repository, run `npm ci` and use `npm run rayner -- <command>` instead.

This explainer draws no diagrams, so `check`, `preview` and `build` work without a browser. `review` opens the page in Chromium: install it with `npx playwright-core install chromium`, or set `CHROMIUM_EXECUTABLE_PATH` to a Chromium you already have.

## 1. Plan on paper

Write the plan before any code (principle 1):

```text
Reader:    a developer choosing a replacement policy who assumes recently used data is always worth keeping
Question:  what is the difference between LRU and MRU, and when does it matter?
Answer:    on a miss in a full cache, LRU evicts the item used longest ago and MRU evicts the item used most
           recently; which one gets more hits depends on the order of requests
Model:     run(policy, size, requests) returns each request's hit, eviction and cache contents
Sources:   the worked examples in Wikipedia's "Cache replacement policies"; Chou and DeWitt, VLDB 1985
Case:      baseline A B C D A B C D | changed: last four are C D C D | fixed: three slots, same first four
           requests, both policies | predicted hits: LRU 0, MRU 3 → LRU 4, MRU 0
Limit:     hit counts for eight requests through three slots; not the cost of tracking recency, and no claim
           about random access
```

The case line is written before any drawing, so the picture has to match a prediction (principle 6). The tempting shortcut is that keeping recent items is always right. A loop over more items than the cache holds is the request pattern that could prove it wrong. Chou and DeWitt wrote that a file being repeatedly scanned should be kept in memory if possible, and that if it is too large to fit, "an MRU replacement algorithm should be used to manage the buffer pool". The two cases share their first four requests, so the first eviction is identical in both and only what follows it differs.

The limit line keeps the explainer inside what it tests. It counts hits, so it cannot say anything about latency or the bookkeeping LRU needs to track recency. It does not test random access either, where Chou and DeWitt report that "the choice of a replacement algorithm is immaterial". The limit becomes the last caption (principle 8).

Then ask whether a still would do. A trace table of eight requests and two policies answers the question for a reader who already reads trace tables. The stepped version earns its place by isolating the one decision where the policies differ before it shows what that decision costs over the whole sequence.

Then turn the plan into a script: the 150 to 250 words you would say to a newcomer, answer first, with a sentence to remember and the questions they should be able to answer afterwards. `rayner init` writes this one as `script.md`:

<!-- lru-mru/script.md -->
```md
# Script: what is the difference between LRU and MRU?

Write this before any code. Read it aloud to someone who doesn't know the topic, with no pictures: if they can't answer the check questions afterwards, fix the script, not the drawing. See "Script first" in the Rayner explainers skill.

**Questions the reader brings:** What is the difference between LRU and MRU? When does it matter?

**Script** (150 to 250 words, answer first):

On a miss in a full cache, a replacement policy chooses which item to evict. LRU evicts the item used longest ago. MRU evicts the item used most recently. Which one gets more hits depends on the order of requests.

Take a cache with three slots. Requests for A, B and C fill it in both policies, so both hold the same items. The next request, D, misses in both and forces an eviction. LRU drops A, the oldest. MRU drops C, the newest.

Now repeat A, B, C and D. LRU always evicted the item the loop needs next, so every request misses. MRU evicted C to make room for D, so A, B and D hit on the second pass. A loop over more items than the cache holds favours MRU.

Change only what follows: C and D alternate instead. LRU still holds both, so every repeat hits. MRU evicts the item requested just before, which is always the next one requested, so every repeat misses. Reuse of recent items favours LRU.

These counts cover eight requests through three slots. They leave out what tracking recency costs.

**Sentence to remember:** LRU evicts the oldest item and MRU the newest, so a loop larger than the cache favours MRU and reuse of recent items favours LRU.

**Check questions** (they go in the scene's `meta.checks`; `meta.answer` holds the script's first answer):

1. A full cache misses. Which item does each policy evict?
2. Why does LRU miss every request when a loop is one item larger than the cache?
3. Which policy should manage a buffer for a file scanned over and over that does not fit in memory?
```

The scene carries two parts of it, so the tools can hold the explainer to the script: `meta.answer`, which `rayner check` requires the title, line or caption of step 1 or 2 to contain, and `meta.checks`, the questions the player asks after the last step, with each answer behind a disclosure.

## 2. Generate the explainer

```sh
npx rayner init lru-mru
```

This writes four files into `lru-mru/`: the script, the model, the model's test and the scene. Together they are the finished explainer for the plan above, and the same files are in this repository at [`scenes/tutorial/lru-mru/`](../scenes/tutorial/lru-mru/). The rest of the tutorial reads them against the plan, then breaks the scene on purpose twice: once to see what `rayner check` catches, and once to see what it cannot.

## 3. Read the model

`lru-mru/model.ts` has no drawing code, so a test can import it:

<!-- lru-mru/model.ts -->
```ts
export type Policy = 'lru' | 'mru';

export interface Request {
  key: string;
  hit: boolean;
  /** The item this request pushed out, if the cache was full and the key missed. */
  evicted?: string;
  /** What the cache holds after this request, most recently used first. */
  cache: string[];
}

/** Send each request to a cache that holds `size` items and replaces them by `policy`. */
export function run(policy: Policy, size: number, requests: string[]): Request[] {
  let cache: string[] = [];
  return requests.map((key) => {
    const hit = cache.includes(key);
    let evicted: string | undefined;
    if (!hit && cache.length === size) evicted = policy === 'lru' ? cache.at(-1) : cache[0];
    cache = [key, ...cache.filter((k) => k !== key && k !== evicted)];
    return { key, hit, evicted, cache };
  });
}
```

The cache is a list ordered by recency, most recently used first, and every request moves its key to the front. A hit changes only the order. A miss in a full cache evicts one item first, and the two policies differ in exactly one expression: LRU removes the last item in the list and MRU removes the first. Because every request moves its key to the front, the first item is always the one requested just before, so an MRU miss evicts the previous request's item.

## 4. Check the model against the source

Wikipedia's article walks through one example per policy on a cache of four blocks. For LRU and the requests A B C D E D F, "E will replace A" and "F is then accessed, replacing B". For MRU and A B C D E C D B, E replaces D, and C is later replaced because "it was the block accessed just before D". `lru-mru/model.test.ts` turns both examples into tests:

<!-- lru-mru/model.test.ts -->
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { run, type Policy } from './model.ts';

const evictions = (policy: Policy, requests: string) =>
  run(policy, 4, [...requests]).map((r) => r.evicted ?? '-').join(' ');

test("LRU matches Wikipedia's example: E replaces A, then F replaces B", () => {
  assert.equal(evictions('lru', 'ABCDEDF'), '- - - - A - B');
});

test("MRU matches Wikipedia's example: E replaces D, then D replaces C", () => {
  assert.equal(evictions('mru', 'ABCDECDB'), '- - - - D - C -');
});
```

```sh
node --test lru-mru/model.test.ts
```

Both pass. Now swap `cache.at(-1)` and `cache[0]` in `model.ts` and run the tests again: both fail, so they can tell the two policies apart. Swap them back.

Pin what you checked against in the scene's `meta.sources` (principle 3). The scene links the exact Wikipedia revision it was checked against, not the live page, and the 1985 paper.

## 5. Read the scene

`lru-mru/scene.ts`:

<!-- lru-mru/scene.ts -->
```ts
import { Scene } from 'rayner';
import { stage, settingsOf } from 'rayner/explain';
import { run, type Policy } from './model.ts';

const SIZE = 3;
const NEXT = { loop: 'ABCD', reuse: 'CDCD' };

export default class LruMru extends Scene {
  static meta = {
    id: 'lru-mru',
    title: 'What is the difference between LRU and MRU?',
    sources: [
      'https://en.wikipedia.org/w/index.php?title=Cache_replacement_policies&oldid=1376205644',
      'https://www.vldb.org/conf/1985/P127.PDF',
    ],
    // From script.md: check holds the first two steps to the answer; the player asks the questions at the end.
    answer: 'LRU evicts the item used longest ago',
    checks: [
      { question: 'A full cache misses. Which item does each policy evict?', answer: 'LRU evicts the item used longest ago; MRU evicts the item used most recently.' },
      { question: 'Why does LRU miss every request when a loop is one item larger than the cache?', answer: 'Each miss evicts the oldest item, which is exactly the item the loop asks for next.' },
      { question: 'Which policy should manage a buffer for a file scanned over and over that does not fit in memory?', answer: 'MRU: it keeps most of the loop in the cache, while LRU evicts each item just before it is needed again.' },
    ],
  };
  static settings = [{ id: 'next', label: 'After A B C D, request', default: 'loop', options: [{ value: 'loop', label: 'A B C D again' }, { value: 'reuse', label: 'C D C D' }] }];

  override async construct() {
    const s = stage(this, { style: 'nord', headingSize: 0.54 });
    const next = settingsOf(this).next as keyof typeof NEXT;
    const requests = [...('ABCD' + NEXT[next])];
    const trace = { lru: run('lru', SIZE, requests), mru: run('mru', SIZE, requests) };

    // What the card shows after the first n requests, read from the model's trace.
    const shown = (n: number) => {
      const column = (policy: Policy) => {
        const done = trace[policy].slice(0, n), hits = done.filter((r) => r.hit).map((r) => r.key);
        return [done.at(-1)!.cache.join(' '), done.flatMap((r) => r.evicted ?? []).join(' ') || 'none', hits.length ? `${hits.length}: ${hits.join(' ')}` : '0'];
      };
      const [lru, mru] = [column('lru'), column('mru')];
      const pair = (i: number): [string, string] => [lru[i]!, mru[i]!];
      return { Requests: requests.slice(0, n).join(' '), 'Newest first': pair(0), Evicted: pair(1), Hits: pair(2) };
    };
    const show = async (n: number) => {
      await card.set(shown(n));
      Object.assign(this.state, shown(n));
    };

    await this.step('full', { title: 'Same items, same order', line: 'A, B and C missed and filled all three slots.', caption: 'Both caches have seen the same three requests, so both hold C, B, A from newest to oldest. The next request, D, misses in both and forces each policy to evict one item.' });
    const first = shown(3);
    const card = await s.card([
      ['Requests', first.Requests],
      ['Slots', SIZE],
      ['Newest first', ...first['Newest first']],
      ['Evicted', ...first.Evicted],
      ['Hits', ...first.Hits],
    ], { columns: ['LRU', 'MRU'], width: 6.8, fontSize: 0.3 });
    Object.assign(this.state, first);

    const [lruOut, mruOut] = [trace.lru[3]!.evicted, trace.mru[3]!.evicted];
    await this.step('evict', { title: 'D evicts opposite ends', line: `LRU drops ${lruOut}, the oldest; MRU drops ${mruOut}, the newest.`, caption: `LRU evicts the item used longest ago, ${lruOut}. MRU evicts the item used most recently, ${mruOut}. Each then records D as its newest item.` });
    await show(4);
    await card.mark('Evicted');

    const lruHits = trace.lru.filter((r) => r.hit).length, mruHits = trace.mru.filter((r) => r.hit).length;
    await this.step('rest', {
      title: `LRU ${lruHits} hits, MRU ${mruHits}`,
      caption: next === 'loop'
        ? 'The loop asks for A, B, C and D again. LRU always evicts the item the loop needs next, so all eight requests miss. MRU evicted C to make room for D, so on the second pass A, B and D hit and only C misses.'
        : 'C and D now alternate. LRU still holds both after evicting A, so all four repeats hit. MRU evicts the item requested just before, which is always the next one requested, so all four repeats miss.',
    });
    await show(8);

    await this.step('verdict', {
      title: next === 'loop' ? 'A loop favours MRU' : 'Reuse favours LRU',
      caption: next === 'loop'
        ? `On this loop MRU hits ${mruHits} times and LRU ${lruHits}. Four items do not fit in three slots, which is when Chou and DeWitt recommend MRU for a repeated scan; a file that fits should stay in memory. The counts leave out what tracking recency costs.`
        : `On this pattern LRU hits ${lruHits} times and MRU ${mruHits}, because the items just used are the next ones requested. The counts cover eight requests through three slots and leave out what tracking recency costs.`,
    });
    await card.mark('Hits');
  }
}
```

Read it from the top:

- `static meta` holds the id, which names the output files, the page title and the sources the model was checked against.
- `static settings` declares one setting with two options. Each option is a case: the reader can switch between them, and `check` and `review` visit both. Both cases send A B C D first, then either repeat the loop or alternate C and D.
- `trace` asks the model once per case. Every value on the card comes from it: `shown(n)` turns the trace into what the card shows after the first `n` requests, and `show(n)` updates the card and records the same values on `this.state`, where tests and `rayner describe` can read them.
- `stage(this, { style: 'nord', headingSize: 0.54 })` draws the paper and a heading that follows the steps. The larger heading keeps the step number readable on a phone.
- `s.card` draws one card with an LRU column and an MRU column. A row with one value per column compares the policies; a row with a single value, such as Requests, spans both columns because both caches receive the same requests.
- There are four steps. Each has a stable name used in links, a title and a caption, and the first two have a line under the title. The page prints the caption beside the picture.

The first step opens on the moment the policies are about to diverge (principle 2): both caches hold the same items in the same order and D is about to miss. The second step is the whole difference between the policies, so it gets a step of its own (principle 4), and its mark on the Evicted row stays on screen while the reader reads why (principle 5). Its captions take the evicted items from the model. Because the two policies share one card, a reader sees both columns of every row at once, including on a phone, where the player zooms onto the card.

The third step's captions are written by hand for each case; they are claims about the model too, so the repository's copy of this scene has [a test](../test/explain-tutorial.test.ts) that checks each one. The last step marks the Hits row, gives each case a title and caption written for its own outcome (principle 6), and ends on the plan's limit (principle 8). In the loop case that limit is Chou and DeWitt's condition: MRU suits a repeated scan only when the file is too large to fit.

## 6. Preview it

```sh
npx rayner preview lru-mru/scene.ts --watch
```

Open http://127.0.0.1:5174/ and press Next. Each step plays and then stops on its resting picture, which is what the reader looks at while reading the caption. After step 3 the Evicted row lists every eviction in order. On the loop, LRU's evictions read A B C D A: each item LRU evicts is the next one the loop asks for.

Choose C D C D above the stage. The URL names the case and step (`lru-mru.html?next=reuse&step=rest`), so a link opens that exact picture. Now MRU's evictions read C D C D C, and each item MRU evicts is the next one requested. In both cases the losing policy evicts the item needed soonest, the opposite of Bélády's optimal algorithm, which discards the information that "would not be needed for the longest time". Leave the preview running; it rebuilds when you save.

## 7. Break a check

Delete the last line of `construct()`, `await card.mark('Hits');`, and run the checks:

```sh
npx rayner check lru-mru/scene.ts
```

```text
rayner: Each step must change the picture; these end exactly as the step before in After A B C D, request: A B C D again
+ actual - expected

+ [
+   'verdict'
+ ]
- []
```

Without the mark, the last step plays nothing, so it rests on exactly the picture step 3 left. A reader pressing Next would get a new caption and nothing new on the stage to read it against. The check reports the first case where this happens. Put the line back and run `check` again: it passes. The report it saves to `out/checks/lru-mru/report.json` includes `legibility.labelsUnder12PxAt390`, the number of labels a phone reader sees smaller than 12 px. Keep it at 0 in every case.

## 8. Break a caption

The next mistake passes every check. Replace the last step's title and caption with the shortcut the plan set out to test:

```ts
    await this.step('verdict', {
      title: 'MRU keeps more',
      caption: 'MRU holds on to older items, so it gets more hits than LRU.',
    });
```

`rayner check` still passes. Print the step as text in the other case:

```sh
npx rayner see lru-mru/scene.ts verdict --case next=reuse
```

After a rough text drawing of the resting picture, it prints:

```text
lru-mru · step 4 of 4: verdict · After A B C D, request: C D C D
Title: MRU keeps more
Caption: MRU holds on to older items, so it gets more hits than LRU.
Picture: 8 labelled values. Marked: Hits (LRU): 4: C D C D; Hits (MRU): 0.
Changed: nothing in scene.state
```

The marked row says LRU hit four times and MRU never did, so in this case the caption is false. It was written from the loop case alone. Undo the change: the scene's own ending takes its title and counts from each case's outcome.

Read every step of every case this way. `npx rayner describe lru-mru/scene.ts --out out/lru-mru.json` writes the whole explainer as JSON, and `npx rayner shots lru-mru/scene.ts --case next=reuse` makes a contact sheet of one case. At each step, ask:

- Does the caption name a value, item or comparison that the picture does not show?
- Could a reader work out the cause from the resting pictures alone, without watching the motion?
- Would any sentence be false in another case?
- Does the first step deliver what the title promises, and does the last step earn its conclusion in every case?
- Does any sentence claim more than the sources say? Chou and DeWitt recommend MRU for a looping file only when it is too large to fit, which is why the loop's ending says so.

## 9. Review and build

```sh
npx rayner review lru-mru/scene.ts
```

`review` runs the checks, then opens every step of every case at phone and desktop widths in Chromium and saves screenshots in `out/review/lru-mru/`. Look at them yourself; a passing review shows that the pictures render, not that they explain.

```sh
npx rayner build lru-mru/scene.ts --out public/lru-mru.html
```

`build` does not repeat the checks. It writes the page, which needs no network, plus `lru-mru.html.headers.json` with the response headers your host must send, a receipt of input hashes and an optional `loader.js` that sizes an embedding iframe. [Publishing](PUBLISHING.md) covers hosting and embedding.

## Next

- To explain another kind of subject, start from the nearest example. The [skill's table](../skills/rayner-explainers/SKILL.md#start-from-an-example) matches subjects such as a protocol, a race, a state machine or a code change to explainers in `scenes/explainers/`.
- The [reference](REFERENCE.md) covers the stage, card, diagram and check APIs. The [engine map](ENGINE.md) covers camera moves, code diffs, charts and pictures rebuilt from state.
- The [editorial rubric](EXPLAINER-RUBRIC.md) scores a finished explainer against the principles at the top of this page.
