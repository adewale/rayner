import { Group } from '../../../../src/index.ts';
import { flow, label } from '../reader-drawing.ts';
import type { StagedStep } from '../../../../explain/index.ts';

/** The scene's one-sentence answer, which the outcome step states in both cases. */
export const ANSWER = 'A hit saves the database read; a miss still makes it, and adds a cache read and write';

export function frames(which: 'hit' | 'miss'): StagedStep[] {
  return [
    {
      id: 'reader-request',
      title: 'Does this request need the database?',
      line: `Predict: a saved copy sits in front of the database. What does a cache ${which} cost?`,
      caption:
        'The handler’s lookup function, getUser, answers each request with one database query, even when the same user was fetched a second ago. The change in this merge request puts a store of saved values, a cache, in front of that query. If the user’s value is already saved, the request is a hit; if not, a miss. Count the database reads for the selected request before and after the change.',
      state: { request: which, beforeReads: 1, afterReads: which === 'hit' ? 0 : 1 },
      draw: (_, s) =>
        new Group(
          flow(s, ['Request', 'Database', 'Response']),
          label('Before: one database read', 0, -1.4, s.palette.ink, 0.8),
        ),
    },
    {
      id: 'reader-outcome',
      title: which === 'hit' ? 'Answer: the hit skips the database' : 'Answer: the miss still reads the database',
      line: which === 'hit' ? 'The key already has a stored value.' : 'The key has no stored value yet.',
      caption:
        which === 'hit'
          ? `${ANSWER}. KV, the cache, already holds this user, so the request returns the saved value with zero database reads. Switch to the miss to see what the saving costs when the value is not there.`
          : `${ANSWER}. KV, the cache, has no entry for this user, so the request reads the database once, as before, stores the result in KV and returns it. A later request can use the saved value; this one did more work than it would have without the cache.`,
      state: { request: which, reads: which === 'hit' ? 0 : 1 },
      draw: (_, s) =>
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
