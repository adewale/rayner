import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT } from '../../tools/lib/explain-project.ts';
import { sha256 as digest } from '../../tools/lib/hash.ts';
import { catalogFacts } from '../../tools/lib/explain-artifacts.ts';
import { PRODUCT } from '../../scenes/explainers/catalog.ts';
import { headerMarkers, ownedSection, verifySections } from '../../tools/repo/lib/site-headers.ts';

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
      await promisify(execFile)(process.execPath, [join(ROOT, 'tools/repo/explain-demos.ts'), '--check', '--only', 'mr-cache,python-dict', '--out', built], {cwd: ROOT, maxBuffer: 4 * 1024 * 1024});
      assert.ok(!(await readdir(built)).includes('periodic-groups.html'), 'subset build needs no other scene pages');
      await promisify(execFile)(
        process.execPath,
        [
          join(ROOT, 'tools/repo/explain-site.ts'),
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
      assert.equal(catalog.totals.scenarios, 4);
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
      await assert.rejects(promisify(execFile)(process.execPath, [join(ROOT, 'tools/repo/explain-site.ts'), join(folder, 'export'), '--from', built, '--only', 'mr-cache,python-dict'], {cwd: ROOT}), /Built output changed/);
      assert.equal(await readFile(join(site, 'mr-cache.html'), 'utf8'), page, 'failed export preserves the previous site');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
);

test(
  'two collections exported to one site keep their own llms.txt sections, _headers blocks and valid manifests, and --index none writes no gallery',
  {
    skip:
      !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for isolated builds and exports',
  },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), 'rayner-site-collections-'));
    const run = (script: string, args: string[]) => promisify(execFile)(process.execPath, [join(ROOT, 'tools/repo', script), ...args], { cwd: ROOT, maxBuffer: 4 * 1024 * 1024 });
    try {
      const builtA = join(folder, 'a'), builtB = join(folder, 'b'), siteRoot = join(folder, 'site');
      await run('explain-demos.ts', ['--check', '--only', 'python-dict', '--out', builtA]);
      await run('explain-demos.ts', ['--check', '--only', 'ring-buffer', '--out', builtB]);
      // The host's own files: a preamble in llms.txt and a rule in _headers.
      await mkdir(siteRoot, { recursive: true });
      await writeFile(join(siteRoot, 'llms.txt'), '# Example host\n\n> Projects.\n');
      await writeFile(join(siteRoot, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n');
      const exportA = () => run('explain-site.ts', [siteRoot, '--from', builtA, '--only', 'python-dict', '--path', '/projects/a']);
      await exportA();
      await run('explain-site.ts', [siteRoot, '--from', builtB, '--only', 'ring-buffer', '--path', '/projects/b', '--index', 'none', '--llms-heading', 'Collection B']);
      const llms = await readFile(join(siteRoot, 'llms.txt'), 'utf8');
      assert.match(llms, /^# Example host\n\n> Projects\.\n\n<!-- rayner:begin \/projects\/a -->\n## Explainers\n\n- \[[^\]]+\]\(\/projects\/a\/python-dict\): .+ JSON: \[python-dict\.json\]\(\/projects\/a\/python-dict\.json\)\n/);
      assert.match(llms, /<!-- rayner:end \/projects\/a -->\n\n<!-- rayner:begin \/projects\/b -->\n## Collection B\n\n- \[How does a ring buffer reuse storage\?\]\(\/projects\/b\/ring-buffer\)/);
      const headers = await readFile(join(siteRoot, '_headers'), 'utf8');
      assert.ok(headers.startsWith('/*\n  X-Content-Type-Options: nosniff\n'));
      for (const path of ['/projects/a', '/projects/b']) {
        assert.equal(headers.split('\n').filter((line) => line === headerMarkers(path).begin).length, 1, path);
        assert.ok(ownedSection(headers, headerMarkers(path))!.includes(`\n${path}/`), path);
      }
      // --index none: B has no generic gallery, and its manifest lists none; A keeps the default.
      assert.ok(!(await readdir(join(siteRoot, 'projects/b'))).includes('index.html'));
      assert.ok((await readdir(join(siteRoot, 'projects/a'))).includes('index.html'));
      const verify = async (path: string) => {
        const manifest = JSON.parse(await readFile(join(siteRoot, '.' + path, 'deployment.json'), 'utf8'));
        assert.equal(manifest.version, 2); assert.equal(manifest.path, path);
        for (const { path: file, sha256 } of manifest.files) assert.equal(digest(await readFile(join(siteRoot, '.' + file))), sha256, file);
        await verifySections(manifest.sections, path, (file) => readFile(join(siteRoot, '.' + file), 'utf8'), digest);
        return manifest;
      };
      const b = await verify('/projects/b');
      assert.ok(!b.files.some((f: { path: string }) => f.path.endsWith('/index.html')));
      // Exporting A again leaves B's manifest valid: both pin only their own sections.
      await exportA();
      await verify('/projects/a');
      assert.deepEqual(await verify('/projects/b'), b);
      // Facts for a host's project panel, from package.json and PRODUCT.
      const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
      const { facts } = JSON.parse(await readFile(join(siteRoot, 'projects/b/catalog.json'), 'utf8'));
      assert.deepEqual(facts, catalogFacts(PRODUCT, pkg));
      assert.equal(facts.version, pkg.version);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
);
