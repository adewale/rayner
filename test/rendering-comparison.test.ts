// Keep the comparison's independently checked subject models in the standard suite.
import '../bench/rendering/model.test.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildComparison } from '../bench/rendering/build.ts';

test('the rendering comparison admits every staged model against its independent packet before browser measurement', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-rendering-admission-'));
  try {
    const result = await buildComparison(folder);
    assert.equal(result.arms.length, 4);
    assert.equal(new Set(result.arms.map((arm) => `${arm.topic}/${arm.arm}`)).size, 4);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
