import { test } from 'node:test';
import type { View as StateView } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { assertViewFollowsState as viewFollowsState } from '../../../test/lib/view-fidelity.ts';
import { loadFonts as loadViewFonts, withSettings as viewSettings } from '../../../explain/testing.ts';
import type { Scene as ViewScene } from '../../../src/index.ts';
import RingBufferExplainer from './scene.ts';

test('ring-buffer views show the traced state at every step, in both scenarios', async () => {
  await loadViewFonts();
  for (const operations of ['wrap', 'full']) {
    const Ring = viewSettings(RingBufferExplainer, { operations });
    for (const name of ['ring', 'readout', 'results'] as const) {
      const pick = (scene: ViewScene) => (scene as unknown as Record<typeof name, StateView | undefined>)[name];
      assert.equal(await viewFollowsState(Ring, pick), 4, `${operations}: ${name} checked at all four steps`);
    }
  }
});
