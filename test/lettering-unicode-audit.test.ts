import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readdir, stat, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { collectProject, ROOT } from '../tools/lib/explain-project.ts';
import { runKey } from '../src/lettering-outlines.ts';
import { SANS, MONO } from '../src/font-data.ts';

const enabled = process.env.EXPLAIN_LETTERING === '1';
test('Unicode audit: requested faces, combining clusters and modern bidi bracket ordering', {
  skip: !enabled && 'set EXPLAIN_LETTERING=1 for build-time Unicode regression tests',
}, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'rayner-unicode-audit-'));
  try {
    const source = join(folder, 'scene.ts');
    await writeFile(source, `import{Scene,Text}from'rayner';export default class L extends Scene{static meta={id:'style-latin',lettering:{faces:{sans:'eb-garamond'},scripts:['Latn']}};async construct(){await this.step('word');this.add(new Text('Garamond'));await this.wait(1);}}`);
    // Capture through the real provider too: the Python fix must be wired into
    // the request's chain/preference selection.
    const project = await collectProject(source, { captureLettering: true, write: false });
    const fonts = resolve(process.env.RAYNER_LETTERING_FONTS ?? join(ROOT, 'out/lettering-fonts'));
    const expected = JSON.parse(execFileSync(process.env.RAYNER_LETTERING_PYTHON ?? 'python3', [join(ROOT, 'tools/lettering.py')], {
      input: JSON.stringify({ command: 'shape', text: 'Garamond', fonts: [join(fonts, 'fontsource-eb-garamond-5.3.0/package/files/eb-garamond-latin-400-normal.woff2')] }), encoding: 'utf8',
    }));
    // The integrated assertion below uses the recorded style fixture's exact
    // same EB Garamond source font, with no script-default Inter preference.
    assert.deepEqual(project.outlineLettering!.runs[runKey('sans', 'Garamond')]!.glyphs, expected.glyphs);
    // The oracle owns its embedded-font inputs; private cache filenames and
    // files left by earlier captures must not determine whether it can run.
    await Promise.all([
      writeFile(join(folder, 'sans.woff2'), Buffer.from(SANS, 'base64')),
      writeFile(join(folder, 'mono.woff2'), Buffer.from(MONO, 'base64')),
    ]);
    const sources = join(folder, 'sources');
    await mkdir(sources);
    for (const name of await readdir(fonts)) {
      const from = join(fonts, name);
      if (!name.startsWith('.') && (await stat(from)).isDirectory()) await symlink(from, join(sources, name), 'dir');
    }
    // Exclude all generated cache files even in a warm checkout. Reintroducing
    // the oracle's old cache-filename dependency must fail here too.
    const oracle = await promisify(execFile)(process.env.RAYNER_LETTERING_PYTHON ?? 'python3', [join(ROOT, 'test/lettering/unicode_audit.py')], {
      cwd: ROOT, env: { ...process.env, RAYNER_LETTERING_FONTS: sources, RAYNER_TEST_EMBEDDED_FONTS: folder }, encoding: 'utf8',
    });
    assert.match(oracle.stderr, /OK/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
