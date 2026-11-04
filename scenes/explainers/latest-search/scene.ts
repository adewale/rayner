import { Scene } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
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
    // Three requests, finishing newest first: only the newest ticket publishes, and the two older ones stay stale.
    claims: [
      { says: 'publish only the latest', test: 'test/explain-latest-search.test.ts: tickets distinguish repeated query text' },
      { says: 'publish it only if its ticket is still the latest', test: 'test/explain-latest-search.test.ts: tickets distinguish repeated query text' },
      { says: 'makes every older ticket stale', test: 'test/explain-latest-search.test.ts: tickets distinguish repeated query text' },
    ],
    checks: [
      {
        question: 'The user types “ca”, then “cat”, then “ca” again, starting requests with tickets 1, 2 and 3. Request 3 finishes first; request 1 finishes last. Should request 1 be published because its query text matches the current input?',
        answer: 'No. The current request is ticket 3. Ticket 1 is an older request even though its text is also “ca”; it may contain older data. Compare request tickets, not query strings, and leave request 3’s result on the page.',
      },
      {
        question: 'Suppose the newest request fails, then an older successful request arrives. Does the ticket guard publish the older result as a fallback?',
        answer: 'No. Its ticket is still stale. The guard enforces which request may publish; it does not choose a fallback or handle the newest request’s error. An application needs an explicit error or fallback policy.',
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
    await stage(this, { style: 'github-dark', headingSize: 0.6 }).steps(await frames(order), { kind: 'short' });
  }
}
