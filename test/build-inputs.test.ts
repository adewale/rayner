import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildInputs } from '../tools/lib/build-inputs.ts';
import { fc, params } from './lib/pbt.ts';

test('artifact identity changes for reader, builder, dependency and notice edits, but not docs or outputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rayner-inputs-'));
  const inputs = ['app/embed.css', 'app/embed.ts', 'tools/lib/explain-build.ts', 'src/fonts.ts', 'explain/stage.ts', 'integrations/capture.ts', 'vendor/licenses/font.txt', 'package.json', 'package-lock.json', 'LICENSE'];
  try {
    for (const directory of ['src', 'explain', 'integrations', 'app', 'tools/lib', 'vendor/licenses', 'docs', 'out', 'scenes/explainers']) await mkdir(join(root, directory), { recursive: true });
    for (const name of inputs) await writeFile(join(root, name), 'original');
    const original = await buildInputs(root);
    await writeFile(join(root, 'docs/README.md'), 'documentation only');
    await writeFile(join(root, 'out/page.html'), 'generated output');
    assert.equal((await buildInputs(root)).hash, original.hash);
    for (const name of inputs) {
      try {
        await writeFile(join(root, name), 'changed');
        assert.notEqual((await buildInputs(root)).hash, original.hash, `${name} must invalidate a built artifact`);
      } finally { await writeFile(join(root, name), 'original'); }
    }
    await fc.assert(fc.asyncProperty(fc.constantFrom(...inputs), fc.string({ minLength: 1, maxLength: 40 }), async (name, edit) => {
      try {
        await writeFile(join(root, name), 'original\n' + edit);
        assert.notEqual((await buildInputs(root)).hash, original.hash, `${name} must invalidate a built artifact`);
      } finally { await writeFile(join(root, name), 'original'); }
    }), params(40));
    for (const name of ['tools/lib/explain-story-review.ts', 'tools/bench.ts', 'tools/prepare-release.ts']) {
      await writeFile(join(root, name), 'review or maintenance only');
      assert.equal((await buildInputs(root)).hash, original.hash, name + ' must not rebuild pages');
    }
    await writeFile(join(root, 'tools/lib/new-builder.ts'), 'export const value = 1;');
    await writeFile(join(root, 'tools/lib/explain-build.ts'), "import './new-builder.ts';");
    const withHelper = (await buildInputs(root)).hash;
    await writeFile(join(root, 'tools/lib/new-builder.ts'), 'export const value = 2;');
    assert.notEqual((await buildInputs(root)).hash, withHelper, 'new transitive producer dependencies count automatically');
  } finally { await rm(root, { recursive: true, force: true }); }
});
