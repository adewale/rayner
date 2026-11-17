import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLoader } from '../tools/lib/explain-build.ts';

// The host-side loader (app/loader.ts) adds an iframe and follows two messages; it draws nothing.
// It once weighed 445 KB because the engine alias resolved every library path itself, which hid the
// package's "sideEffects": false from esbuild, so the loader's import of the explain barrel kept the
// text shaper, the embedded faces and the animation engine. Rebuilt with that fixed it is about 16 KB.
const LOADER_BUDGET = 32 * 1024;

test('the loader stays small: it carries no shaper, faces or engine', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-loader-'));
  try {
    await buildLoader(join(dir, 'loader.js'));
    const js = await readFile(join(dir, 'loader.js'), 'utf8');
    assert.ok(js.length <= LOADER_BUDGET, `loader.js is ${js.length} bytes, over the ${LOADER_BUDGET}-byte budget`);
    assert.match(js, /mountExplainer/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
