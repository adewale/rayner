import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { loadFonts, shaperFor } from '../src/fonts.ts';
import { browserFonts } from '../tools/lib/explain-browser-fonts.ts';
import { ROOT } from '../tools/lib/explain-project.ts';
import { fc, params } from './lib/pbt.ts';

test('portable SFNT faces retain WOFF2 glyphs, advances and fallback shaping', async () => {
  const result = await build({
    stdin: {
      contents: `export{loadFonts,shaperFor}from ${JSON.stringify(ROOT + '/src/fonts.ts')}`,
      resolveDir: ROOT,
    },
    bundle: true,
    format: 'esm',
    write: false,
    plugins: [browserFonts(ROOT)],
    metafile: true,
  });
  assert.ok(Object.keys(result.metafile!.inputs).some((path) => path.startsWith('embedded-sfnt:')));
  assert.ok(
    !result.outputFiles[0]!.text.includes('large-window brotli'),
    'the ordinary page must omit the Brotli decoder',
  );
  const portable = await import(
    'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0]!.text).toString('base64')
  );
  await loadFonts();
  await portable.loadFonts();
  const scalar = fc.oneof(
    fc.integer({ min: 0, max: 0x10ffff }),
    fc.integer({ min: 32, max: 255 }),
    fc.constantFrom(0x301, 0x660, 0x6f0, 0x966, 0x4e00, 0xff11, 0x2460, 0x2192),
  );
  const text = fc.array(scalar, { maxLength: 50 }).map((cp) => String.fromCodePoint(...cp));
  for (const face of ['sans', 'mono'] as const) {
    const expected = shaperFor(face),
      actual = portable.shaperFor(face);
    for (const input of [
      'AV fi ffi ->',
      '² ½ ① → ✓',
      '٠١٢٣٤٥٦٧٨٩',
      '०१२३४५६७८९',
      '〇一二三四五六七八九十',
      '\t\n\u0000',
    ])
      assert.deepEqual(actual(input, 1), expected(input, 1));
    fc.assert(
      fc.property(text, fc.double({ min: 0.01, max: 10, noNaN: true }), (value, size) => {
        assert.deepEqual(actual(value, size), expected(value, size));
      }),
      params(400),
    );
  }
});

test('the font equivalence oracle rejects a substituted default face', async () => {
  const { readFile } = await import('node:fs/promises');
  const { default: { MONO } } = await import('../vendor/font-data-sfnt.json', {with: {type: 'json'}});
  const result = await build({
    stdin: {
      contents: `export{loadFonts,shaperFor}from ${JSON.stringify(ROOT + '/src/fonts.ts')}`,
      resolveDir: ROOT,
    },
    bundle: true,
    format: 'esm',
    write: false,
    plugins: [
      browserFonts(ROOT),
      {
        name: 'substitute-mono-for-sans',
        setup(b) {
          b.onLoad({ filter: /font-data-sfnt\.json$/ }, async (args) => ({
            contents: JSON.stringify({...JSON.parse(await readFile(args.path, 'utf8')), SANS: MONO}),
          loader: 'json',
          }));
        },
      },
    ],
  });
  const poisoned = await import(
    'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0]!.text).toString('base64')
  );
  await loadFonts();
  await poisoned.loadFonts();
  assert.throws(
    () => assert.deepEqual(poisoned.shaperFor('sans')('AV fi', 1), shaperFor('sans')('AV fi', 1)),
    assert.AssertionError,
  );
});
