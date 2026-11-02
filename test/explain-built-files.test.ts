import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { builtOutputHashes, checkBuiltOutput } from '../tools/lib/explain-built-files.ts';

test('site export rejects tampered built HTML, pictures and a missing output pin', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-built-output-'));
  const paths = ['loader.js', 'index.html', 'embed-lab.html', 'catalog.json', 'evidence.json',
    'cache.html', 'cache.html.headers.json', 'cache.png', 'cache/describe.json', 'cache/embed.json', 'cache/inputs.json', 'cache/steps.json'];
  try {
    await mkdir(join(dir, 'cache'), { recursive: true });
    for (const path of paths) await writeFile(join(dir, path), path === 'cache/steps.json' ? JSON.stringify({ steps: [{ step: 'one' }] }) : path);
    await assert.rejects(checkBuiltOutput(dir, ['cache']), /output-hashes\.json.*missing/);
    const pinned = await builtOutputHashes(dir, ['cache']);
    await writeFile(join(dir, 'output-hashes.json'), JSON.stringify(pinned));
    await checkBuiltOutput(dir, ['cache']);
    for (const path of ['cache.html', 'cache.html.headers.json', 'cache.png', 'cache/describe.json', 'cache/embed.json']) {
      const before = await readFile(join(dir, path));
      await writeFile(join(dir, path), 'changed');
      await assert.rejects(checkBuiltOutput(dir, ['cache']), /Built output changed/);
      await writeFile(join(dir, path), before);
    }
    await writeFile(join(dir, 'output-hashes.json'), JSON.stringify({ ...pinned, 'old.html': '0'.repeat(64) }));
    await assert.rejects(checkBuiltOutput(dir, ['cache']), /[Bb]uilt output manifest differs/);
    await checkBuiltOutput(dir, ['cache'], {collection: false, subset: true});
    await writeFile(join(dir, 'loader.js'), 'damaged common loader');
    await assert.rejects(checkBuiltOutput(dir, ['cache'], {collection: false, subset: true}), /Built output changed: loader/);
    await writeFile(join(dir, 'loader.js'), 'loader.js');
    const {['cache.html']: omitted, ...missing} = pinned;
    await writeFile(join(dir, 'output-hashes.json'), JSON.stringify(missing));
    await assert.rejects(checkBuiltOutput(dir, ['cache'], {collection: false, subset: true}), /Built output changed: cache.html/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// specs/player-tile.md T6: demos:build refuses an embed.json without three heights above the floor.
test('an embed.json needs schema 1, aspect 16/9 and an integer height above the stage plus the stepper row at each of 390, 640 and 900 px', async () => {
  const { embedSizeProblems, embedFloor } = await import('../tools/lib/explain-embed-size.ts');
  const good = { schema: 1, aspect: '16/9', heights: { '390': 900, '640': 1000, '900': 1200 } };
  assert.deepEqual(embedSizeProblems(good), []);
  assert.equal(embedFloor(640), 421);
  assert.deepEqual(embedSizeProblems({ ...good, heights: { ...good.heights, '640': 421 } }), ['height at 640 is 421, not an integer over 421']);
  assert.deepEqual(embedSizeProblems({ ...good, heights: { ...good.heights, '900': 1200.5 } }), ['height at 900 is 1200.5, not an integer over 567.25']);
  assert.deepEqual(embedSizeProblems({ ...good, heights: { '390': 900, '640': 1000 } }), ['heights are for 390, 640, not 390, 640, 900', 'height at 900 is undefined, not an integer over 567.25']);
  assert.deepEqual(embedSizeProblems({ ...good, schema: 2, aspect: '4/3' }), ['schema 2 is not 1', 'aspect "4/3" is not 16/9']);
  assert.deepEqual(embedSizeProblems(null), ['not an object']);
});
