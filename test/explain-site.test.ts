import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT } from '../tools/lib/explain-project.ts';

test(
  'catalog export selects its own entry and renders only public cards for the selected lessons',
  {
    skip:
      !process.env.EXPLAIN_CATALOG && 'set EXPLAIN_CATALOG=1 after demos:build; reuses that canonical build',
  },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), 'rayner-site-export-'));
    try {
      await promisify(execFile)(
        process.execPath,
        [
          join(ROOT, 'tools/explain-site.ts'),
          folder,
          '--only',
          'mr-cache,python-dict',
          '--entry',
          'mr-cache',
          '--origin',
          'https://example.org',
        ],
        { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 },
      );
      const site = join(folder, 'projects/rayner');
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
      const headers = await readFile(join(folder, '_headers'), 'utf8');
      assert.ok(
        headers.includes('/projects/rayner/mr-cache') &&
          !headers.includes('/projects/rayner/periodic-groups'),
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
);
