import assert from 'node:assert/strict';
import test from 'node:test';
import { withSettings } from '../../../explain/testing.ts';
import { renderFrame } from '../../../src/index.ts';
import PoppyBrowser from './scene.ts';
import { start } from './model.ts';

test('frame zero starts in the selected browser sign-in world before the guided join', async () => {
  for (const [setting, signIn] of [
    ['signed-in', 'signed in'], ['signed-out', 'signed out'], ['no-scope', 'signed in without the browser scope'],
  ] as const) {
    const Bound = withSettings(PoppyBrowser, { signin: setting });
    let frames = 0;
    const scene = await renderFrame(Bound, 0, { async frame(actual) {
      assert.equal(actual.frameCount, 0);
      assert.deepEqual(actual.stateJson(), start(signIn));
      frames++;
    } });
    assert.deepEqual(scene.state, start(signIn));
    assert.equal(frames, 1);
  }
});
