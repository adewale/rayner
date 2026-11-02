import { Scene } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import { readerFirst } from '../lib/reader-drawing.ts';
import { frames, ANSWER } from '../lib/readers/latest-search.ts';
import type { CompletionOrder } from '../lib/latest-search.ts';

// The story (script.md): the race without a guard first, then the ticket as its fix. Search A is
// the keystroke "ca", search B the latest keystroke "cat"; every result shown comes from resolving
// the model's real promises in the chosen order.
export default class LatestSearchExplainer extends Scene {
  static meta = {
    id: 'latest-search',
    title: 'Why can an older search replace the latest result?',
    sources: [
      'https://github.com/adewale/rayner/blob/main/scenes/explainers/lib/latest-search.ts',
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then',
    ],
    // check holds the overwrite step to stating the answer, in both completion orders.
    answer: ANSWER,
    checks: [
      {
        question: 'The user types “ca”, then “cat”, and “cat” answers first. Without a guard, which results does the page end on?',
        answer: '“ca”. It lands last, and an unguarded handler publishes whatever lands last.',
      },
      {
        question: 'With the ticket guard, “ca” answers first. What does the page show before “cat” answers?',
        answer: 'Nothing yet. “ca” carries ticket 1 while latest is 2, so its results are dropped; the page stays empty until “cat” lands.',
      },
      {
        question: 'Does the guard stop the “ca” search from running?',
        answer: 'No. The search still runs to the end; the guard only refuses to publish a result whose ticket is no longer the latest.',
      },
    ],
  };
  static settings = [
    {
      id: 'order',
      label: 'Which search answers first',
      default: 'new-first',
      options: [
        { value: 'new-first', label: '“cat” answers first' },
        { value: 'old-first', label: '“ca” answers first' },
      ],
    },
  ];
  override async construct() {
    const order = settingsOf(this).order as CompletionOrder;
    await readerFirst(this, stage(this, { style: 'github-dark', headingSize: 0.6 }), frames(order));
  }
}
