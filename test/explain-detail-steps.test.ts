import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import { storyIndices, adjacentStep } from '../app/embed-steps.ts';

test('the reading path skips optional notes; direct note navigation retains them in source order', () => {
  fc.assert(
    fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 30 }), (flags) => {
      const steps = flags.map((detail) => ({ meta: { detail } }));
      const expected = flags.flatMap((d, i) => (d ? [] : [i]));
      assert.deepEqual(storyIndices(steps), expected.length ? expected : flags.map((_, i) => i));
      for (let i = 0; i < steps.length; i++)
        for (const d of [-1, 1] as const) {
          const candidates = flags.flatMap((detail, j) => (!detail && (d === 1 ? j > i : j < i) ? [j] : []));
          const want = flags[i]
            ? Math.max(0, Math.min(flags.length - 1, i + d))
            : ((d === 1 ? candidates[0] : candidates.at(-1)) ?? i);
          assert.equal(adjacentStep(steps, i, d), want);
        }
    }),
    params(),
  );
});
