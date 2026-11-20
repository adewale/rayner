// Shared, hand-worked evidence for the authored story and the repository's live-player tests.
// Only public author API types/shapes are used; no model transition computes an expected result.
import assert from 'node:assert/strict';
import { Text } from '../../../../src/index.ts';
import type { Mobject, Scene } from '../../../../src/index.ts';
import type { View } from '../../../../explain/index.ts';
import type { Cache, Comparison, Key } from '../model.ts';

// Hand-worked vectors, independent of request(), run(), REQUESTS and the model's Map oracle.
// Every row names the full request prefix and each cache's newest-first order, counts and result.
type CacheVector = readonly [order: string, hits: number, misses: number, evicted: Key | null, hit: boolean];
export type Row = readonly [history: string, lru: CacheVector, mru: CacheVector];
const first: readonly Row[] = [
  ['A', ['A', 0, 1, null, false], ['A', 0, 1, null, false]],
  ['AB', ['BA', 0, 2, null, false], ['BA', 0, 2, null, false]],
  ['ABC', ['CBA', 0, 3, null, false], ['CBA', 0, 3, null, false]],
  ['ABCD', ['DCB', 0, 4, 'A', false], ['DBA', 0, 4, 'C', false]],
];
export const worked: Record<'loop' | 'reuse', readonly Row[]> = {
  loop: [...first,
    ['ABCDA', ['ADC', 0, 5, 'B', false], ['ADB', 1, 4, null, true]],
    ['ABCDAB', ['BAD', 0, 6, 'C', false], ['BAD', 2, 4, null, true]],
    ['ABCDABC', ['CBA', 0, 7, 'D', false], ['CAD', 2, 5, 'B', false]],
    ['ABCDABCD', ['DCB', 0, 8, 'A', false], ['DCA', 3, 5, null, true]],
  ],
  reuse: [...first,
    ['ABCDC', ['CDB', 1, 4, null, true], ['CBA', 0, 5, 'D', false]],
    ['ABCDCD', ['DCB', 2, 4, null, true], ['DBA', 0, 6, 'C', false]],
    ['ABCDCDC', ['CDB', 3, 4, null, true], ['CBA', 0, 7, 'D', false]],
    ['ABCDCDCD', ['DCB', 4, 4, null, true], ['DBA', 0, 8, 'C', false]],
  ],
};
// The guided ninth A is the reader's base, followed by the reader's B and C.
export const continued: Record<'loop' | 'reuse', readonly Row[]> = {
  loop: [
    ['ABCDABCDA', ['ADC', 0, 9, 'B', false], ['ADC', 4, 5, null, true]],
    ['ABCDABCDAB', ['BAD', 0, 10, 'C', false], ['BDC', 4, 6, 'A', false]],
    ['ABCDABCDABC', ['CBA', 0, 11, 'D', false], ['CBD', 5, 6, null, true]],
  ],
  reuse: [
    ['ABCDCDCDA', ['ADC', 4, 5, 'B', false], ['ADB', 1, 8, null, true]],
    ['ABCDCDCDAB', ['BAD', 4, 6, 'C', false], ['BAD', 2, 8, null, true]],
    ['ABCDCDCDABC', ['CBA', 4, 7, 'D', false], ['CAD', 2, 9, 'B', false]],
  ],
};
const cache = ([order, hits, misses, evicted, hit]: CacheVector): Cache => ({ order: [...order] as Key[], hits, misses, evicted, hit });
export const state = ([history, lru, mru]: Row): Comparison => ({ history: [...history] as Key[], lru: cache(lru), mru: cache(mru) });

export function namedViews(scene: Pick<Scene, 'familyMembers'>): Record<'lru' | 'mru' | 'stream', View> {
  const find = (name: string) => {
    const found = scene.familyMembers().filter(m => m.key === `cache:${name}`);
    assert.equal(found.length, 1, `one named ${name} view`);
    const candidate = found[0]!;
    assert.ok('draw' in candidate && typeof candidate.draw === 'function', `${name} has a view draw`);
    assert.ok('sync' in candidate && typeof candidate.sync === 'function', `${name} has a view sync`);
    assert.ok('current' in candidate && candidate.current !== undefined, `${name} has a current picture`);
    return candidate as View;
  };
  return { lru: find('lru'), mru: find('mru'), stream: find('stream') };
}
function wordsAt(picture: Mobject, key: string): string {
  const parts = picture.family().filter(m => m.key === key);
  assert.equal(parts.length, 1, `one picture part ${key}`);
  return parts[0]!.family().filter((m): m is Text => m instanceof Text).map(m => m.text).join(' ');
}
export function assertPictures(pictures: Record<'lru' | 'mru' | 'stream', Mobject>, expected: Comparison): void {
  for (const policy of ['lru', 'mru'] as const) {
    const actual = pictures[policy], want = expected[policy];
    assert.deepEqual([0, 1, 2].map(i => wordsAt(actual, `${policy}:slot:${i}`)), want.order);
    assert.equal(wordsAt(actual, `${policy}:counts`), `Hits ${want.hits} · misses ${want.misses}`);
    assert.equal(wordsAt(actual, `${policy}:evicted`), `Evicted: ${want.evicted ?? 'none'}`);
    assert.equal(wordsAt(actual, `${policy}:outcome`), `Last request: ${want.hit ? 'hit' : 'miss'}`);
  }
  assert.equal(wordsAt(pictures.stream, 'cache:requests'), `Requests: ${expected.history.join(' ')}`);
}
export function assertCurrent(scene: Pick<Scene<object, object>, 'state' | 'familyMembers'>, expected: Comparison): void {
  assert.deepEqual(scene.state, expected);
  const views = namedViews(scene);
  assertPictures({ lru: views.lru.current, mru: views.mru.current, stream: views.stream.current }, expected);
}
