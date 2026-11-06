import { Scene } from '../../../src/index.ts';
import { stage, settingsOf } from '../../../explain/index.ts';
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
