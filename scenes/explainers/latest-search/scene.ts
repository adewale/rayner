import { Scene } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
import { readerFirst } from '../lib/reader-drawing.ts';
import { frames } from '../lib/readers/latest-search.ts';
import type { CompletionOrder } from '../lib/latest-search.ts';

export default class LatestSearchExplainer extends Scene {
  static meta = {
    id: 'latest-search',
    title: 'Why can an older search replace the latest result?',
    sources: [
      'https://github.com/adewale/rayner/blob/main/scenes/explainers/lib/latest-search.ts',
      'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then',
    ],
  };
  static settings = [
    {
      id: 'order',
      label: 'Completion order',
      default: 'new-first',
      options: [
        { value: 'new-first', label: 'B then A' },
        { value: 'old-first', label: 'A then B' },
      ],
    },
  ];
  override async construct() {
    const order = settingsOf(this).order as CompletionOrder;
    await readerFirst(this, stage(this, { style: 'github-dark', headingSize: 0.6 }), frames(order));
  }
}
