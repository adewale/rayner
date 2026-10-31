import { Group } from '../../../../src/index.ts';
import { flow, label, tile } from '../reader-drawing.ts';
import type { ReaderFrame } from '../reader-drawing.ts';
export function frames(which: 'hit' | 'miss'): ReaderFrame[] {
  return [
    {
      id: 'reader-request',
      title: 'Does this request need the database?',
      line: `Selected request: cache ${which}.`,
      caption:
        'A direct request reads the database once. A cache adds a branch before that read: a hit returns the stored value, while a miss must fetch and store it.',
      values: { request: which, beforeReads: 1, afterReads: which === 'hit' ? 0 : 1 },
      draw: (s) =>
        new Group(
          flow(s, ['Request', 'Database', 'Response']),
          label('Before: one database read', 0, -1.4, s.palette.ink, 0.8),
        ),
    },
    {
      id: 'reader-outcome',
      title: which === 'hit' ? 'The hit skips the database' : 'The miss fills the cache',
      line: which === 'hit' ? 'The key already has a stored value.' : 'The key has no stored value yet.',
      caption:
        which === 'hit'
          ? 'KV already holds the value, so this request returns it with zero database reads. Freshness still depends on expiry and invalidation, which this example does not model.'
          : 'KV has no entry, so the request reads the database once, stores the result in KV and returns it. A later request can use the saved value; this miss still costs one database read.',
      values: { request: which, reads: which === 'hit' ? 0 : 1 },
      draw: (s) =>
        new Group(
          flow(
            s,
            which === 'hit' ? ['Request', 'KV hit', 'Response'] : ['KV miss', 'Database', 'KV write', 'Response'],
          ),
          label(`Database reads: ${which === 'hit' ? 0 : 1}`, 0, -1.4, s.palette.ink, 0.85),
          label(which === 'hit' ? 'Saved value returned' : 'Fetched value saved and returned', 0, -3, s.soft, 0.7),
        ),
    },
  ];
}
