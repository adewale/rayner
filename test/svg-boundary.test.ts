// The SVG language and public renderer options, independently parsed by resvg.
// Existing camera/clip/raster/browser owners retain their different boundaries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Resvg } from '@resvg/resvg-js';
import { Scene, Rectangle, Text } from '../src/index.ts';
import { NullSink, StringSink, toSvgString } from '../src/output.ts';
import { SnapshotSink } from '../src/svg.ts';
import { loadFonts } from '../explain/testing.ts';
import { fc, params } from './lib/pbt.ts';

const scene = () => new Scene(new NullSink()).add(new Rectangle({ width: 1, height: 1 }));

test('SVG widths reject every runtime value except positive safe integers', () => {
  fc.assert(fc.property(fc.oneof(fc.anything(), fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER })), (width) => {
    const options = { width: width as number };
    if (width === undefined) { assert.match(toSvgString(scene(), options), /width="1280"/); return; }
    if (typeof width === 'number' && Number.isSafeInteger(width) && width > 0) {
      // Do not rasterize arbitrary output dimensions; parsing the public header
      // is enough to check this contract without allocating width × height pixels.
      assert.ok(toSvgString(scene(), options).startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${Number((BigInt(width) * 9n + 8n) / 16n)}"`));
    } else assert.throws(() => toSvgString(scene(), options), /toSvgString\(\): width must be a positive safe integer/);
  }), params<[unknown]>(500, { examples: [[1], [4097], [8192], [Number.MAX_SAFE_INTEGER], [0], [-1], [1.5], [NaN], [Infinity], ['100'], [{ valueOf: (): number => 100 }]] }));
});

test('SVG backgrounds admit only hex colours and serialize their canonical colour', () => {
  fc.assert(fc.property(fc.oneof(fc.anything(), fc.integer({ min: 0, max: 0xffffff }).map((n) => '#' + n.toString(16).padStart(6, '0'))), (background) => {
    if (background === undefined) { assert.match(toSvgString(scene(), { background }), /fill="#ffffff"/, "the scene's paper"); return; }
    const legal = typeof background === 'string' && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(background);
    if (!legal) assert.throws(() => toSvgString(scene(), { background: background as string }), /toSvgString\(\): background must be a #rgb or #rrggbb colour/);
    else {
      const h = (background as string).slice(1).toLowerCase();
      const expected = '#' + (h.length === 3 ? [...h].map((ch) => ch + ch).join('') : h);
      assert.match(toSvgString(scene(), { background: background as string }), new RegExp(`fill="${expected}"`));
    }
  }), params<[unknown]>(500, { examples: [['#ABC'], ['#aBcDeF'], ['#000'], ['red'], ['#112233\u0000'], ['" data-audit="yes'], [{ toString: (): string => '#abc' }]] }));
});

test('paint strings serialize as XML 1.0 data, never as markup or illegal code points', () => {
  const text = fc.string({ unit: 'binary', maxLength: 50 });
  fc.assert(fc.property(text, (paint) => {
    const s = scene();
    s.mobjects[0]!.setStyle({ fill: paint });
    const svg = toSvgString(s, { width: 32 });
    // resvg's Rust XML parser supplies an independent grammar oracle, including
    // escaped entities and surrogate/character legality; no system fonts needed.
    assert.doesNotThrow(() => new Resvg(svg, { font: { loadSystemFonts: false } }));
    const normalized = paint.replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '');
    const fill = /<path[^>]* fill="([^"]*)"/.exec(svg)?.[1];
    assert.notEqual(fill, undefined, 'the shape must remain present');
    const decoded = fill!.replace(/&(amp|lt|gt|quot);/g, (_, entity: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[entity]!);
    assert.equal(decoded, normalized);
  }), params(300, { examples: [['a\u0000b"<&'], ['\ud800'], ['\udc00'], ['\ufffe'], ['\u{1f680}']] }));
});

test('SVG serialization ignores inherited keys without changing literal paint data', () => {
  for (const key of ['data-rayner-inherited-audit', 'x']) {
    const s = scene();
    s.mobjects[0]!.setStyle({ fill: 'x<&' });
    Object.defineProperty(Object.prototype, key, { value: 'not-an-attribute', enumerable: true, configurable: true });
    try {
      const svg = toSvgString(s);
      assert.ok(!svg.includes('not-an-attribute'), 'prototype entries must not become attributes or escaped characters');
      assert.match(svg, /fill="x&lt;&amp;"/, 'escaping preserves ordinary characters even with polluted prototype keys');
    } finally { delete (Object.prototype as Record<string, unknown>)[key]; }
  }
});

test('fill-only glyphs omit stroke paint while genuinely stroked shapes retain it', async () => {
  await loadFonts();
  const s = new Scene(new NullSink());
  s.add(new Text('Label'), new Rectangle({ width: 2, height: 1, stroke: '#123456', strokeWidth: 0.04 }));
  const svg = toSvgString(s);
  const paths = svg.match(/<path\b[^>]*>/g)!;
  assert.equal(paths.length, 6, 'five visible glyphs and a rectangle');
  for (const p of paths.slice(0, 5)) {
    assert.match(p, /stroke="none"/);
    assert.doesNotMatch(p, /stroke-(?:width|opacity|linejoin|linecap|dasharray|dashoffset|miterlimit)=/);
  }
  assert.match(paths[5]!, /stroke="#123456"/);
  assert.match(paths[5]!, /stroke-width="40"/);
});

test('SVG sinks enforce the same options as direct serialization', async () => {
  for (const Sink of [StringSink, SnapshotSink]) {
    for (const options of [{ width: 0 }, { background: '" data-audit="yes' }])
      await assert.rejects(new Sink(options).frame(scene()), /toSvgString\(\): (width|background) must/);
  }
});
