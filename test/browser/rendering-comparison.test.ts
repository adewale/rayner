import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compare } from '../../bench/rendering/compare.ts';

test('controlled comparison admits both complete rendering arms with oracle, paint and phone checks', { skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for the actual paired browser campaign', timeout: 180_000 }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-rendering-comparison-'));
  try {
    const result = await compare(folder);
    assert.equal(result.artifacts.length, 4);
    assert.equal(new Set(result.rows.map((r) => `${r.topic}/${r.arm}/${r.case}/${r.step}/${r.width}`)).size, result.rows.length);
    assert.equal(result.timing.length, 48);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
