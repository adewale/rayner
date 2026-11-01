import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import type { SnapshotStore } from '../../integrations/agentic-mermaid/snapshot.ts';
import { packPageSnapshots } from '../../tools/lib/page-snapshots.ts';
import { fixture } from '../lib/page-snapshot-fixture.ts';

test('Chromium expands both legacy gzip and packed gzip with exact values and independent paths', {skip: process.env.EXPLAIN_BROWSER ? false : 'set EXPLAIN_BROWSER=1 for the native browser gzip boundary'}, async () => {
  const {build} = await import('esbuild');
  const {launch} = await import('../../tools/lib/browser.ts');
  const bundle = await build({entryPoints: ['app/embed-snapshots.ts'], bundle: true, write: false, format: 'iife', globalName: 'SnapshotCodec', platform: 'browser'});
  const long = Array.from({length: 20}, (_, i) => i / 13), store = fixture(long);
  store.diagram!.parts[0]!.shapes[0]!.subpaths.push([...long]);
  const expected = JSON.stringify(store);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.addScriptTag({content: bundle.outputFiles[0]!.text});
    for (const payload of [store, packPageSnapshots(store)]) {
      const actual = await page.evaluate(async encoded => {
        const codec = (globalThis as unknown as {SnapshotCodec: {inflateSnapshots(input: string): Promise<SnapshotStore>}}).SnapshotCodec;
        const restored = await codec.inflateSnapshots(encoded);
        const paths = restored.diagram!.parts[0]!.shapes[0]!.subpaths;
        return {json: JSON.stringify(restored), separate: paths[0] !== paths[1]};
      }, gzipSync(JSON.stringify(payload)).toString('base64'));
      assert.equal(actual.json, expected);
      assert.equal(actual.separate, true);
    }
  } finally {
    await browser.close();
  }
});
