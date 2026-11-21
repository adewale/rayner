/** Two independent replacement policies, with recency stored newest first. */
export type Key = 'A' | 'B' | 'C' | 'D';
export type Policy = 'lru' | 'mru';
export interface Cache { order: Key[]; hits: number; misses: number; evicted: Key | null; hit: boolean | null }
export interface Comparison { lru: Cache; mru: Cache; history: Key[] }
export const emptyCache = (): Cache => ({ order: [], hits: 0, misses: 0, evicted: null, hit: null });
export const initial = (): Comparison => ({ lru: emptyCache(), mru: emptyCache(), history: [] });

/** One cache's decision; this function neither reads nor writes the other cache. */
export function requestCache(policy: Policy, before: Cache, key: Key): Cache {
  const hit = before.order.includes(key);
  const evicted = !hit && before.order.length === 3 ? policy === 'lru' ? before.order.at(-1)! : before.order[0]! : null;
  return {
    order: [key, ...before.order.filter(item => item !== key && item !== evicted)],
    hits: before.hits + Number(hit), misses: before.misses + Number(!hit), evicted, hit,
  };
}

/** One explicit product-state transition sends the same request to both independent models. */
export function request(before: Comparison, key: Key): Comparison {
  return { lru: requestCache('lru', before.lru, key), mru: requestCache('mru', before.mru, key), history: [...before.history, key] };
}
export function run(keys: readonly Key[]): Comparison { return keys.reduce(request, initial()); }
export const REQUESTS = { loop: [...'ABCDABCD'] as Key[], reuse: [...'ABCDCDCD'] as Key[] };
