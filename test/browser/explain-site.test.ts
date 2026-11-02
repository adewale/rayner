import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT } from '../../tools/lib/explain-project.ts';

test(
  'catalog export selects its own entry and renders only public cards for the selected lessons',
  {
    skip:
      !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for isolated builds and exports',
  },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), 'rayner-site-export-'));
    try {
      const built = join(folder, 'built');
      await promisify(execFile)(process.execPath, [join(ROOT, 'tools/explain-demos.ts'), '--check', '--only', 'mr-cache,python-dict', '--out', built], {cwd: ROOT, maxBuffer: 4 * 1024 * 1024});
      assert.ok(!(await readdir(built)).includes('periodic-groups.html'), 'subset build needs no other scene pages');
      await promisify(execFile)(
        process.execPath,
        [
          join(ROOT, 'tools/explain-site.ts'),
          join(folder, 'export'),
          '--from', built,
          '--only',
          'mr-cache,python-dict',
          '--entry',
          'mr-cache',
          '--origin',
          'https://example.org',
        ],
        { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 },
      );
      const site = join(folder, 'export/projects/rayner');
      const catalog = JSON.parse(await readFile(join(site, 'catalog.json'), 'utf8'));
      assert.deepEqual(
        catalog.scenes.map((s: { id: string }) => s.id),
        ['python-dict', 'mr-cache'],
      );
      assert.equal(catalog.totals.explainers, 2);
      assert.equal(catalog.totals.cases, 4);
      assert.deepEqual(catalog.product.entry, {
        id: 'mr-cache',
        step: 'reader-request',
        settings: { request: 'hit' },
        label: 'What does a cache hit save?',
      });
      const files = await readdir(site, { recursive: true });
      assert.ok(files.includes('python-dict/marker.png'));
      assert.ok(files.includes('mr-cache/reader-outcome.png'));
      for (const missing of [
        'periodic-groups.html',
        'mr-cache/diff.png',
        'mr-cache/diff.html',
        'embed-lab.html',
      ])
        assert.ok(!files.includes(missing), missing);
      const index = await readFile(join(site, 'index.html'), 'utf8');
      assert.ok(index.includes('mr-cache.html?request=hit&amp;step=reader-request'));
      assert.ok(!index.includes('periodic-groups.png'));
      const page = await readFile(join(site, 'mr-cache.html'), 'utf8');
      assert.match(page, /<meta name="rayner:share-steps" content="reader-request reader-outcome">/);
      const headers = await readFile(join(folder, 'export/_headers'), 'utf8');
      assert.ok(
        headers.includes('/projects/rayner/mr-cache') &&
          !headers.includes('/projects/rayner/periodic-groups'),
      );
      await writeFile(join(built, 'mr-cache.html'), 'damaged selected page');
      await assert.rejects(promisify(execFile)(process.execPath, [join(ROOT, 'tools/explain-site.ts'), join(folder, 'export'), '--from', built, '--only', 'mr-cache,python-dict'], {cwd: ROOT}), /Built output changed/);
      assert.equal(await readFile(join(site, 'mr-cache.html'), 'utf8'), page, 'failed export preserves the previous site');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
);
