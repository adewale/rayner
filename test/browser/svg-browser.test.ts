// Live-DOM sibling of the pure SVG/XML boundary: immutable record patches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { launch } from '../../tools/lib/browser.ts';
import { ROOT } from '../../tools/lib/explain-project.ts';
import { join } from 'node:path';
import { fc, params } from '../lib/pbt.ts';

const options = { skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for actual DOM record patching' };
test('DomSink applies text changes with shared attributes and removes prototype-sensitive own attributes', options, async () => {
  const bundle = await build({ entryPoints: [join(ROOT, 'src/index.ts')], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'Rayner', target: 'es2022' });
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<main></main>');
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    const texts = fc.array(fc.string({ unit: 'binary', maxLength: 30 }), { minLength: 2, maxLength: 8 });
    await fc.assert(fc.asyncProperty(texts, async (values) => {
      const result = await page.evaluate((values) => {
        const { DomSink } = (globalThis as unknown as { Rayner: typeof import('../../src/index.ts') }).Rayner;
        const host = document.querySelector('main')!;
        host.replaceChildren();
        const sink = new DomSink(host, { realtime: false });
        const attrs = JSON.parse('{"__proto__":"kept","data-value":"literal"}') as Record<string, string>;
        const records = [];
        for (let i = 0; i < values.length; i++) {
          // A new immutable record may share attrs with its predecessor. The
          // last record removes both own keys, including __proto__.
          sink.apply([{ id: 1, tag: 'text', attrs: i === values.length - 1 ? {} : attrs, transform: null, text: values[i]! }]);
          const el = sink.svg.querySelector('text')!;
          records.push({ text: el.textContent, attrs: [...el.attributes].map((a) => [a.name, a.value]) });
        }
        return records;
      }, values);
      assert.equal(result.length, values.length);
      for (const [i, r] of result.entries()) {
        assert.equal(r.text, values[i], 'native textContent must equal the latest record');
        const expected = i === values.length - 1 ? {} : JSON.parse('{"__proto__":"kept","data-value":"literal"}');
        assert.deepEqual(r.attrs.sort((a, b) => a[0]!.localeCompare(b[0]!)), Object.entries(expected).sort(([a], [b]) => a.localeCompare(b)), 'own attribute membership must match the latest record');
      }
    }), params<[string[]]>(30, { examples: [[['before', 'middle', 'after']]] }));
  } finally { await browser.close(); }
});
