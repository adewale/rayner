import { Scene, keyed } from '../../../src/index.ts';
import { Machine, answerOf, settingsOf, stage, view } from '../../../explain/index.ts';
import type { ExplainerMeta } from '../../../explain/index.ts';
import { initial, request, run, REQUESTS } from './model.ts';
import type { Comparison, Key } from './model.ts';
import { drawCache, drawRequests } from './picture.ts';

export default class CachePolicies extends Scene<Comparison, {}> {
  static meta = { sources: ['https://en.wikipedia.org/wiki/Cache_replacement_policies', 'https://www.vldb.org/conf/1985/P127.PDF'] } satisfies ExplainerMeta;
  static settings = [{ id: 'pattern', label: 'After A B C D', default: 'loop', options: [{ value: 'loop', label: 'A B C D again' }, { value: 'reuse', label: 'C D C D' }] }] as const;
  override state = initial();

  override async construct() {
    const s = stage(this, { style: 'github-light', headingSize: 0.55 });
    const pattern = settingsOf(this, CachePolicies).pattern, keys = REQUESTS[pattern];
    const fourth = run(keys.slice(0, 4));
    const answer = fourth.lru.evicted === fourth.mru.evicted
      ? `Both drop ${fourth.lru.evicted}` : `LRU drops ${fourth.lru.evicted}; MRU drops ${fourth.mru.evicted}`;
    const left = keyed(view(this, st => drawCache(s, 'lru', st.lru), { place: false }), 'cache:lru');
    const right = keyed(view(this, st => drawCache(s, 'mru', st.mru), { place: false }), 'cache:mru');
    const stream = keyed(view(this, st => drawRequests(s, st), { place: false }), 'cache:stream');
    const match = { by: 'key', text: 'whole' } as const;
    const send = async (events: readonly Key[]) => {
      for (const key of events) {
        this.state = request(this.state, key);
        await this.play(left.sync({ runTime: 0.3, match }), right.sync({ runTime: 0.3, match }), stream.sync({ runTime: 0.3, match }));
      }
    };
    await this.step('full', { title: 'Same requests, two independent caches', line: 'Each holds three items, newest first.', caption: 'A, B and C miss in both caches and fill their three slots. D will miss too, but the replacement policies will choose different victims. Both receive the same request; neither reads or changes the other cache.', predict: { options: ['LRU drops A; MRU drops C', 'Both drop A', 'Both drop C'], answer } });
    await s.enter(left, right, stream, { describe: () => `LRU: ${this.state.lru.order.join(', ')}, ${this.state.lru.hits} hits. MRU: ${this.state.mru.order.join(', ')}, ${this.state.mru.hits} hits. Requests: ${this.state.history.join(', ')}.` });
    await send(keys.slice(0, 3));
    await this.step('evict', { title: 'D evicts opposite ends', line: `${answer}.`, caption: `${answerOf(this)}. After requesting D, LRU holds ${fourth.lru.order.join(' ')}, while MRU holds ${fourth.mru.order.join(' ')}. Each cache records D as newest. The difference is which earlier item survives for the next request.` });
    await send(keys.slice(3, 4));
    await this.step('pattern', { title: pattern === 'loop' ? 'Repeating the loop favours MRU' : 'Reusing C and D favours LRU', line: pattern === 'loop' ? 'Eight requests: LRU 0 hits, MRU 3.' : 'Eight requests: LRU 4 hits, MRU 0.', caption: pattern === 'loop' ? 'Repeat A B C D. LRU always evicts the item needed next, so all eight requests miss. MRU hits on A, B and D: three hits. The request stream, capacity and hit rule are identical; only replacement differs.' : 'Now request C D C D. LRU keeps both recently used items and hits four times. MRU keeps replacing the item needed next and misses every repeat. The same pair of independent models produces the opposite winner when only the requests change.' });
    await send(keys.slice(4));
    await this.step('try', { title: 'Send the same next request to both', line: 'Choose the next three requests below.', caption: 'Both caches have received eight requests. Choose A, B, C or D for the ninth. Which cache scores a hit? Send two more and compare their orders and hit counts. Undo a request or Reset to try another continuation.' });
    const start = this.state;
    const machine = new Machine<Comparison, Key>(this, { start, events: ['A', 'B', 'C', 'D'], next: request, views: [left, right, stream], bound: st => st.history.length >= 11 ? 'This comparison stops after eleven requests; Undo or Reset to try another continuation' : undefined, runTime: 0.3 });
    machine.offer();
  }
}
