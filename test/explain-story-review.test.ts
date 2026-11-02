import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fc, params } from './lib/pbt.ts';
import { covered, storyFrames, inspectStoryFrame, reviewStoryVariant, narrowOpeningPlan } from '../tools/lib/explain-story-review.ts';
import { collectProject, ROOT } from '../tools/lib/explain-project.ts';
import { buildExplainer } from '../tools/lib/explain-build.ts';
import { serve } from '../tools/lib/explain-serve.ts';
import { launch } from '../tools/lib/browser.ts';
import { Scene, Text, Line, Group, Rectangle, VMobject, renderElements, toSvgString, traceScene } from '../src/index.ts';
import { stage } from '../explain/index.ts';
import { emphasises } from '../explain/look.ts';

test('local review server rejects an occupied port so startup failure can be reported', async () => {
  const first = await serve(tmpdir(), 0, 'index.html');
  try {
    await assert.rejects(serve(tmpdir(), Number(new URL(first.url).port), 'index.html'), { code: 'EADDRINUSE' });
    assert.equal((await fetch(first.url + '/missing-story-file')).status, 404, 'the existing host remains usable');
  } finally {
    first.close();
  }
});

test('tour coverage requires every target cell, including holes between views', () => {
  const rect = fc
    .tuple(
      fc.integer({ min: -8, max: 8 }),
      fc.integer({ min: -8, max: 8 }),
      fc.integer({ min: 1, max: 8 }),
      fc.integer({ min: 1, max: 8 }),
    )
    .map(([x, y, w, h]): [number, number, number, number] => [x, y, x + w, y + h]);
  fc.assert(
    fc.property(rect, fc.array(rect), (target, views) => {
      // Integer rectangle boundaries make unit-cell centres an exact, independent
      // oracle; a bounding union alone would incorrectly cover holes.
      let expected = true;
      for (let x = target[0]; x < target[2]; x++)
        for (let y = target[1]; y < target[3]; y++)
          expected &&= views.some((v) => x + 0.5 > v[0] && x + 0.5 < v[2] && y + 0.5 > v[1] && y + 0.5 < v[3]);
      assert.equal(covered(target, views), expected);
    }),
    params(1000, {
      examples: [
        [
          [0, 0, 3, 1],
          [
            [0, 0, 1, 1],
            [2, 0, 3, 1],
          ],
        ],
        [
          [0, 0, 2, 1],
          [
            [0, 0, 1, 1],
            [1, 0, 2, 1],
          ],
        ],
      ],
    }),
  );
});

test('logical story labels reject partially missing glyphs before accepting surviving records', async () => {
  for (const defect of ['opacity', 'clip', 'partial'] as const) {
    class Broken extends Scene {
      override async construct() {
        await this.step('claim');
        const t = new Text('word');
        t.key = 'word';
        this.add(t);
        const glyph = t.children[0]!;
        if (defect === 'opacity') glyph.setOpacity(0);
        else if (defect === 'clip') glyph.clipBox = [999, 999, 1000, 1000];
        else glyph.setStyle({ drawFraction: 0.5 });
      }
    }
    await assert.rejects(
      storyFrames(Broken, [{ step: 'claim', targets: [{ key: 'word' }] }]),
      /missing glyph ink|clipped glyph ink/,
      defect,
    );
  }
  class Windowed extends Scene {
    override async construct() {
      await this.step('window');
      const t = new Text('word');
      t.key = 'word';
      t.clipBox = [0, -1, 2, 1];
      this.add(t);
    }
  }
  assert.equal((await storyFrames(Windowed)).size, 1, 'new context may pass through an authored viewport');
  class HighlightedWindow extends Scene {
    override async construct() {
      await this.step('window');
      const word = new Text('word');
      word.clipBox = [0, -1, 2, 1];
      this.add(word);
      emphasises(this, () => [[word, 'highlighted word']]);
    }
  }
  await assert.rejects(
    storyFrames(HighlightedWindow),
    /clipped glyph ink/,
    'highlighted text stays complete even when route shapes may enter a viewport',
  );

  await assert.rejects(
    storyFrames(Windowed, [{ step: 'window', targets: [{ key: 'word' }] }]),
    /clipped glyph ink/,
    'the complete named subject may not be excused as cropped context',
  );
});

test('declared story subjects do not turn incidental context into extra obligations',async()=>{
  for(const helper of [false,true]){
    class Selection extends Scene {override async construct(){await this.step('picture');const subject=new Text('Subject');subject.key='subject';const context=new Text('Context').moveTo([6,3]);context.key='context';this.add(subject,context);if(helper)emphasises(this,()=>[[subject,'the subject']]);}}
    const frame=(await storyFrames(Selection,helper?[]:[{step:'picture',targets:[{key:'subject'}]}])).get('picture')!;
    assert.deepEqual(frame.targets.map(t=>t.name),[helper?'emphasis: subject':'subject']);
    assert.ok(frame.records.length>frame.targets[0]!.indices.length,'incidental context is still rendered');
  }
});

test('a caption explaining unchanged artwork must declare its subject', async () => {
  class BackdropOnly extends Scene {
    override async construct() {
      await this.step('background');
      const frame = new Group(new Rectangle({ width: 16, height: 9, fill: '#ffffff' }));
      frame.key = '__frame';
      this.add(frame);
    }
  }
  await assert.rejects(
    storyFrames(BackdropOnly),
    /unchanged artwork needs a declared story subject/,
    'reserved diagram paper is not narrative evidence',
  );
  class Unchanged extends Scene {
    override async construct() {
      await this.step('draw');
      const t = new Text('word');
      t.key = 'word';
      this.add(t);
      await this.step('explain');
    }
  }
  await assert.rejects(storyFrames(Unchanged), /unchanged artwork needs a declared story subject/);
  // A view redraws its picture as new objects each sync: the same paint under new ids is still
  // unchanged artwork, not a change the reader is meant to look for.
  class Redrawn extends Scene {
    override async construct() {
      await this.step('draw');
      const first = new Text('word');
      this.add(first);
      await this.step('explain');
      this.remove(first);
      this.add(new Text('word'));
    }
  }
  await assert.rejects(storyFrames(Redrawn), /explain: unchanged artwork needs a declared story subject/);
  const frames = await storyFrames(Unchanged, [{ step: 'explain', targets: [{ key: 'word' }] }]);
  assert.equal(frames.size, 2);
  assert.ok(frames.get('explain')!.targets.some((t) => t.name === 'word'));
});

test('redrawn paint preserves layer order and multiplicity without shifting unchanged context', async () => {
  const cases = [
    { before: ['red', 'blue'], after: ['blue', 'red'], changed: ['layer-blue-0', 'layer-red-0'] },
    { before: ['red'], after: ['red', 'red'], changed: ['layer-red-0', 'layer-red-1'] },
    { before: ['red', 'red'], after: ['red'], changed: ['layer-red-0'] },
    { before: ['red', 'blue'], after: ['red', 'green', 'blue'], changed: ['layer-green-0'] },
    { before: ['red', 'blue'], after: ['red', 'blue'], changed: [] },
  ];
  const check = async (sample: { before: string[]; after: string[]; changed: string[]; positions?: Record<string, [number, number]>; fillOpacity?: number }) => {
    class Layers extends Scene {
      override async construct() {
        const draw = (colors: string[], counter: number) => {
          const occurrences = new Map<string, number>();
          return new Group(...colors.map(color => {
            const occurrence = occurrences.get(color) ?? 0;
            occurrences.set(color, occurrence + 1);
            // Retain visible contributions through the longest generated stack;
            // nearly opaque lower copies can disappear below 8-bit resolution.
            const layer = new Rectangle({ width: 2, height: 2, fill: color, fillOpacity: sample.fillOpacity ?? 1, stroke: 'none' })
              .moveTo(sample.positions?.[color] ?? [0, 0]).setOpacity(0.95);
            layer.key = `layer-${color}-${occurrence}`;
            return layer;
          }), new Text(`Step ${counter}`).moveTo([0, -3]));
        };
        await this.step('before');
        const first = draw(sample.before, 1);
        this.add(first);
        await this.step('after');
        this.remove(first);
        this.add(draw(sample.after, 2));
      }
    }
    const frames = await storyFrames(Layers);
    assert.equal(frames.size, 2);
    const targets = frames.get('after')!.targets.map(t => t.name);
    assert.deepEqual(targets.filter(name => name.startsWith('changed: layer-')).sort(),
      sample.changed.map(name => `changed: ${name}`).sort(), JSON.stringify(sample));
    assert.ok(targets.includes('changed: Step 2'), 'the incidental counter remains checked separately');
  };
  for (const sample of cases) await check(sample);
  await check({ before: ['red', 'blue'], after: ['blue', 'red'], changed: [],
    positions: { red: [-3, 0], blue: [3, 0] } });
  const stack = fc.array(fc.constantFrom('red', 'blue', 'green'), { maxLength: 8 });
  const point = fc.tuple(fc.integer({ min: -3, max: 3 }), fc.integer({ min: -1, max: 1 }));
  const locations = fc.record({ red: point, blue: point, green: point });
  await fc.assert(fc.asyncProperty(stack, stack, locations, async (before, after, positions) => {
    // The oracle gives each repeated color an occurrence name, then compares
    // every pair's order and known two-unit rectangle intersection. It does
    // not use the review's matching, parsed path bounds or spatial scan.
    const keys = (colors: string[]) => colors.map((color, index) =>
      `layer-${color}-${colors.slice(0, index).filter(c => c === color).length}`);
    const oldKeys = keys(before), newKeys = keys(after), changed = new Set<string>();
    for (const [index, key] of newKeys.entries()) {
      const color = after[index]!;
      if (before.filter(c => c === color).length !== after.filter(c => c === color).length) changed.add(key);
      for (let j = index + 1; j < newKeys.length; j++) {
        const other = newKeys[j]!, a = positions[color as keyof typeof positions], b = positions[after[j] as keyof typeof positions];
        if (oldKeys.includes(key) && oldKeys.includes(other) && oldKeys.indexOf(key) > oldKeys.indexOf(other) &&
            Math.abs(a[0] - b[0]) < 2 && Math.abs(a[1] - b[1]) < 2) {
          changed.add(key); changed.add(other);
        }
      }
      for (const [oldIndex, removed] of oldKeys.entries()) {
        const removedColor = before[oldIndex]!;
        const a = positions[color as keyof typeof positions], b = positions[removedColor as keyof typeof positions];
        if (!newKeys.includes(removed) && oldKeys.includes(key) &&
            oldKeys.indexOf(key) < oldIndex && Math.abs(a[0] - b[0]) < 2 && Math.abs(a[1] - b[1]) < 2)
          changed.add(key);
      }
    }
    await check({ before, after, changed: [...changed], positions, fillOpacity: 0.5 });
  }), params(100));
});

test('persistent layer ids preserve overlapping order changes but do not distinguish identical copies', async () => {
  for (const colors of [['red', 'blue'], ['red', 'red'], ['red', 'blue', 'red']]) {
    class Layers extends Scene {
      override async construct() {
        const layers = colors.map((color, index) => {
          const layer = new Rectangle({ width: 2, height: 2, fill: color, stroke: 'none' }).setOpacity(0.95);
          layer.key = `layer-${index}`;
          return layer;
        });
        await this.step('before');
        const first = new Text('Step 1').moveTo([0, -3]);
        this.add(...layers, first);
        await this.step('after');
        this.remove(...layers, first);
        this.add(...layers.slice().reverse(), new Text('Step 2').moveTo([0, -3]));
      }
    }
    const frames = await storyFrames(Layers);
    const samePaintOrder = colors.join() === colors.slice().reverse().join();
    assert.deepEqual(frames.get('after')!.targets.map(t => t.name).sort(), samePaintOrder ? ['changed: Step 2'] :
      ['changed: Step 2', 'changed: layer-0', 'changed: layer-1']);
  }
});

const unchangedLayerKinds = ['hollow', 'covered', 'added', 'removed'] as const;
function unchangedLayerScene(kind: typeof unchangedLayerKinds[number], size = 4, inset = 0.5) {
  return class UnchangedLayers extends Scene {
    override async construct() {
      const countChange = kind === 'added' || kind === 'removed';
      const outer = new Rectangle({ width: size, height: size, fill: kind === 'hollow' ? 'none' : 'red',
        stroke: kind === 'hollow' ? 'red' : 'none', strokeWidth: 0.1 }).setOpacity(countChange ? 0.95 : 1);
      outer.key = 'outer';
      const inner = new Rectangle({ width: countChange ? size : inset, height: countChange ? size : inset,
        fill: countChange ? 'red' : 'blue', stroke: 'none' }).setOpacity(countChange ? 0.95 : 1);
      inner.key = 'inner';
      const cover = new Rectangle({ width: size + 1, height: size + 1, fill: 'white', stroke: 'none' });
      await this.step('before');
      this.add(outer, ...(kind === 'added' ? [] : [inner]), ...(kind === 'hollow' ? [] : [cover]));
      await this.step('after');
      if (kind === 'removed') { this.remove(inner); return; }
      if (kind === 'added') { this.remove(cover); this.add(inner, cover); return; }
      this.remove(outer, inner, cover);
      this.add(inner, outer, ...(kind === 'covered' ? [cover] : []));
    }
  };
}

test('intersecting bounds and covered order/count changes cannot supply evidence for unchanged artwork', async () => {
  for (const kind of unchangedLayerKinds)
    await assert.rejects(storyFrames(unchangedLayerScene(kind)), /after: unchanged artwork needs a declared story subject/);
  await fc.assert(fc.asyncProperty(fc.integer({ min: 2, max: 6 }), fc.integer({ min: 1, max: 8 }),
    async (size, numerator) => {
      // The inset stays strictly inside the outline's unpainted interior.
      // Its order cannot affect the picture, regardless of intersecting boxes.
      const inset = (size - 0.2) * numerator / 10;
      await assert.rejects(storyFrames(unchangedLayerScene('hollow', size, inset)),
        /after: unchanged artwork needs a declared story subject/);
    }), params(30));
});

test('removing the final cover counts newly revealed artwork, but not a still-covered or disjoint subject', async () => {
  const scene = (mode: 'revealed' | 'covered' | 'disjoint') => class extends Scene {
    override async construct() {
      const blue = new Rectangle({ width: 2, height: 2, fill: 'blue', stroke: 'none' });
      blue.key = 'blue';
      const cover = new Rectangle({ width: 3, height: 3, fill: 'red', stroke: 'none' });
      if (mode === 'disjoint') cover.shift([5, 0]);
      await this.step('before');
      this.add(blue, cover);
      if (mode === 'covered') this.add(new Rectangle({ width: 4, height: 4, fill: 'white', stroke: 'none' }));
      await this.step('after');
      this.remove(cover);
    }
  };
  const targets = (await storyFrames(scene('revealed'))).get('after')!.targets.map(t => t.name);
  assert.deepEqual(targets, ['changed: blue']);
  for (const mode of ['covered', 'disjoint'] as const)
    await assert.rejects(storyFrames(scene(mode)), /after: unchanged artwork needs a declared story subject/);
});

test('removing a duplicate layer also checks the differently shaped artwork it reveals', async () => {
  await fc.assert(fc.asyncProperty(fc.integer({ min: -3, max: 3 }), fc.integer({ min: -2, max: 2 }),
    async (x, y) => {
      class Revealed extends Scene {
        override async construct() {
          const lower = new Rectangle({ width: 2, height: 2, fill: 'red', stroke: 'none' }).setOpacity(0.95);
          lower.key = 'lower';
          const blue = new Rectangle({ width: 1.5, height: 1.5, fill: 'blue', stroke: 'none' })
            .moveTo([x, y]).setOpacity(0.95);
          blue.key = 'blue';
          const upper = new Rectangle({ width: 2, height: 2, fill: 'red', stroke: 'none' }).setOpacity(0.95);
          await this.step('before'); this.add(lower, blue, upper);
          await this.step('after'); this.remove(upper);
        }
      }
      const targets = (await storyFrames(Revealed)).get('after')!.targets.map(t => t.name).sort();
      const overlaps = Math.abs(x) < 1.75 && Math.abs(y) < 1.75;
      assert.deepEqual(targets, overlaps ? ['changed: blue', 'changed: lower'] : ['changed: lower']);
    }), params(50, { examples: [[0, 0], [3, 2]] }));
});

test('native SVG pixels confirm hollow and covered order/count changes leave the picture unchanged',
  { skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for native unchanged-paint checks' }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    let checked = 0;
    for (const kind of unchangedLayerKinds) {
      const pictures: string[] = [];
      await new (unchangedLayerScene(kind))({ async frame() {}, async stepEnd(scene) {
        pictures.push(toSvgString(scene));
      } }, { skipUntil: Infinity }).run();
      assert.equal(pictures.length, 2);
      const changedPixels = await page.evaluate(async pictures => {
        const pixels: Uint8ClampedArray[] = [];
        for (const svg of pictures) {
          const image = new Image(); image.src = 'data:image/svg+xml,' + encodeURIComponent(svg); await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
          const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
          pixels.push(context.getImageData(0, 0, 1280, 720).data);
        }
        let changed = 0;
        for (let p = 0; p < pixels[0]!.length; p += 4)
          if ([0, 1, 2, 3].some(c => pixels[0]![p + c] !== pixels[1]![p + c])) changed++;
        return changed;
      }, pictures);
      assert.equal(changedPixels, 0, kind);
      checked++;
    }
    assert.equal(checked, 4);
  } finally { await browser.close(); }
});

test('served review rejects hiding the blue artwork revealed by removing a duplicate red layer at either width',
  { skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for served revelation checks' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-story-reveal-'));
  const browser = await launch();
  let server: Awaited<ReturnType<typeof serve>> | undefined;
  try {
    await writeFile(join(dir, 'scene.ts'), `import{Scene,Rectangle}from'rayner';export default class Reveal extends Scene{
      static meta={id:'reveal',title:'Removing the top red reveals blue'};
      async construct(){
        const lower=new Rectangle({width:2,height:2,fill:'red',stroke:'none'}).setOpacity(.95);lower.key='lower';
        const blue=new Rectangle({width:1.5,height:1.5,fill:'blue',stroke:'none'}).setOpacity(.95);blue.key='blue';
        const upper=new Rectangle({width:2,height:2,fill:'red',stroke:'none'}).setOpacity(.95);
        await this.step('before',{caption:'The top red covers blue.'});this.add(lower,blue,upper);
        await this.step('after',{caption:'Removing the top red reveals blue.'});this.remove(upper);
      }} `);
    const project = await collectProject(dir, { write: false });
    assert.equal(project.variants.length, 1);
    await buildExplainer(project, join(dir, 'scene.html'));
    server = await serve(dir, 0, 'scene.html');
    const baseline = await browser.newPage();
    try {
      const rows = await reviewStoryVariant(baseline, server.url + '/scene.html', project.variants[0]!);
      assert.equal(rows.length, 4, 'two steps at both widths');
      assert.deepEqual(rows.filter(r => r.step === 'after').map(r => r.targets.sort()),
        [['changed: blue', 'changed: lower'], ['changed: blue', 'changed: lower']]);
    } finally { await baseline.close(); }
    let rejected = 0;
    for (const width of [390, 1180]) {
      const page = await browser.newPage();
      try {
        await page.addInitScript(width => {
          document.addEventListener('rayner:step', event => {
            if (innerWidth !== width || (event as CustomEvent).detail.step !== 'after') return;
            const blue = [...document.querySelectorAll('.stage svg:not(.leaving) path')]
              .find(path => path.getAttribute('fill') === 'blue') as SVGGraphicsElement;
            const paint = getComputedStyle(blue), box = blue.getBBox();
            (window as unknown as { visibleBeforePoison: boolean }).visibleBeforePoison =
              Number(paint.opacity) >= 0.95 && paint.fill === 'rgb(0, 0, 255)' && box.width > 0 && box.height > 0;
            blue.style.opacity = '0';
          });
        }, width);
        await assert.rejects(reviewStoryVariant(page, server.url + '/scene.html', project.variants[0]!),
          /after: changed: blue has hidden or clipped ink/);
        assert.equal(await page.evaluate(() =>
          (window as unknown as { visibleBeforePoison: boolean }).visibleBeforePoison), true, `${width}: visible blue before poison`);
        assert.equal(await page.locator('.stage svg:not(.leaving) path[fill="blue"]').evaluate(e => getComputedStyle(e).opacity),
          '0', `${width}: CSSOM poison applies under the served CSP`);
        rejected++;
      } finally { await page.close(); }
    }
    assert.equal(rejected, 2, 'each width independently rejects the missing revelation');
  } finally { await browser.close(); server?.close(); await rm(dir, { recursive: true, force: true }); }
});

const strokeOrderCases = [
  { kind: 'miter', pixel: [688, 360], changed: true },
  { kind: 'default-miter', pixel: [656, 360], changed: true },
  { kind: 'square', pixel: [692, 360], changed: true },
  { kind: 'round', pixel: [692, 360], changed: false },
] as const;
function strokeOrderScene(kind: typeof strokeOrderCases[number]['kind']) {
  return class StrokeLayers extends Scene {
    override async construct() {
      const capped = kind === 'square' || kind === 'round';
      const stroke = capped
        ? new VMobject({ stroke: 'red', strokeWidth: 1, fill: 'none', lineCap: kind })
          .startNewPath([-1, -1]).addLineTo([0, 0])
        : new VMobject({ stroke: 'red', strokeWidth: 0.2, fill: 'none', lineJoin: 'miter',
          ...(kind === 'miter' ? { miterLimit: 20 } : {}) })
          .startNewPath([-1, kind === 'miter' ? 0.1 : 0.4]).addLineTo([0, 0])
          .addLineTo([-1, kind === 'miter' ? -0.1 : -0.4]);
      stroke.setOpacity(0.95); stroke.key = 'stroke';
      const size = capped ? 0.05 : kind === 'miter' ? 0.3 : 0.1;
      const patch = new Rectangle({ width: size, height: size, fill: 'blue', stroke: 'none' })
        .moveTo([capped ? 0.65 : kind === 'miter' ? 0.6 : 0.2, 0]).setOpacity(0.95);
      patch.key = 'patch';
      await this.step('before');
      const first = new Text('Step 1').moveTo([0, -3]);
      this.add(stroke, patch, first);
      await this.step('after');
      this.remove(stroke, patch, first);
      this.add(patch, stroke, new Text('Step 2').moveTo([0, -3]));
    }
  };
}

test('paint-order evidence includes acute miter joins and diagonal square caps', async () => {
  for (const sample of strokeOrderCases) {
    const frames = await storyFrames(strokeOrderScene(sample.kind));
    assert.deepEqual(frames.get('after')!.targets.map(t => t.name).sort(), sample.changed ?
      ['changed: Step 2', 'changed: patch', 'changed: stroke'] : ['changed: Step 2'], sample.kind);
  }
});

test('native SVG pixels confirm the stroke-order changes selected by the review',
  { skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for native stroke paint checks' }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    let checked = 0;
    for (const sample of strokeOrderCases) {
      const images = new Map<string, string>();
      const Source = strokeOrderScene(sample.kind);
      await new Source({ async frame() {}, async stepEnd(scene, step) {
        images.set(step.name, toSvgString(scene));
      } }, { skipUntil: Infinity }).run();
      assert.equal(images.size, 2);
      const pixels: number[][] = [];
      for (const step of ['before', 'after']) pixels.push(await page.evaluate(async ({ svg, x, y }) => {
        const image = new Image(); image.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
        await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
        return [...context.getImageData(x, y, 1, 1).data];
      }, { svg: images.get(step)!, x: sample.pixel[0], y: sample.pixel[1] }));
      assert.ok(pixels[0]![2]! > 200 && pixels[0]![0]! < 50, `${sample.kind}: blue initially covers the stroke`);
      assert.ok(sample.changed ? pixels[1]![0]! > 200 && pixels[1]![2]! < 50 :
        pixels[1]![2]! > 200 && pixels[1]![0]! < 50, `${sample.kind}: native paint establishes whether order matters`);
      const frame = (await storyFrames(Source)).get('after')!;
      assert.equal(frame.targets.some(target => target.name === 'changed: stroke'), sample.changed);
      checked++;
    }
    assert.equal(checked, 4);
  } finally { await browser.close(); }
});

test('token-bucket refill does not turn untouched waiting R10 into a story obligation', async () => {
  const project = await collectProject('scenes/explainers/token-bucket', { write: false });
  assert.equal(project.variants.length, 3);
  let checked = 0;
  for (const variant of project.variants) {
    const frame = (await storyFrames(variant.Scene)).get('refill')!;
    await new variant.Scene({
      async frame() {},
      async stepEnd(scene, step) {
        if (step.name !== 'refill') return;
        const labels = scene.familyMembers().filter(m => m instanceof Text && m.text === 'R10');
        assert.equal(labels.length, 1, 'the final waiting request has one label');
        const chip = labels[0]!.parent!.children[0]!;
        assert.ok(chip instanceof Rectangle);
        const records = renderElements(scene, { relative: false });
        const index = records.findIndex(r => r.id === chip.id);
        assert.ok(index >= 0);
        assert.equal(records[index]!.attrs['stroke-dasharray'], '80 60', 'R10 is still waiting');
        assert.deepEqual(frame.records[index]!.attrs, records[index]!.attrs, 'bind the same actual rectangle in the reviewed frame');
        assert.equal(frame.targets.some(target => target.indices.includes(index)), false,
          `rate ${variant.values.rate}: redrawing answered R7-R9 must not make unchanged R10 a subject`);
        checked++;
      },
    }, { skipUntil: Infinity }).run();
  }
  assert.equal(checked, 3);
});

test('fresh helper emphasis must be on stage and painted replacement routes count instead of invisible carriers', async () => {
  class Absent extends Scene {
    override async construct() {
      await this.step('claim');
      const missing = new Text('off stage');
      emphasises(this, () => [[missing, 'off stage']]);
      this.add(new Text('unrelated'));
    }
  }
  await assert.rejects(storyFrames(Absent), /newly emphasised off stage is absent/);
  class Marked extends Scene {
    override async construct() {
      await this.step('claim');
      const carrier = new Line([-1, 0], [1, 0], { fill: '#ff0000', strokeOpacity: 0 });
      const part = new Group(carrier, new Text('word'));
      part.key = 'route';
      const overlay = carrier.copy().setStroke('#ff0000', 0.1, 1);
      this.add(part, overlay);
    }
  }
  class LabelOnly extends Scene {
    override async construct() {
      await this.step('claim');
      const route = new Group(new Line([-1, 0], [1, 0], { strokeOpacity: 0 }), new Text('route label'));
      route.key = 'route';
      this.add(route);
    }
  }
  await assert.rejects(
    storyFrames(LabelOnly, [{ step: 'claim', targets: [{ key: 'route', paint: 'stroke' }] }]),
    /needs painted stroke ink/,
  );
  const frame = (await storyFrames(Marked, [{ step: 'claim', targets: [{ key: 'route', paint: 'stroke' }] }])).get(
    'claim',
  )!;
  const records = frame.targets.find((t) => t.name === 'route')!.indices.map((i) => frame.records[i]!);
  assert.ok(
    records.some((r) => r.attrs['stroke-width'] === '100' && r.attrs['stroke-opacity'] === '1'),
    'the actual replacement stroke belongs to the subject',
  );
  assert.ok(
    records.every((r) => r.attrs['stroke-opacity'] !== '0'),
    'zero-area invisible carriers are not painted subjects',
  );
});

test(
  'served story review visits the final step at each width and rejects missing, hidden or clipped actual subjects',
  { skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for actual story paint checks' },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rayner-story-review-'));
    const browser = await launch();
    let server: ReturnType<typeof serve> extends Promise<infer T> ? T : never;
    try {
      await writeFile(
        join(dir, 'scene.ts'),
        `import{Scene,Text,Line}from'rayner';import{stage,settingsOf}from'rayner/explain';import{emphasises}from${JSON.stringify(join(ROOT, 'explain/look.ts'))};
      export default class Story extends Scene{static meta={id:'story',title:'Story subjects'};static settings=[{id:'route',label:'Route position',default:'visible',options:[{value:'visible',label:'Entering the viewport'},{value:'outside',label:'Outside the authored picture'}]}];async construct(){const s=stage(this);
      await this.step('opening',{caption:'The first subject is shown.'});const a=new Text('First subject',{fontSize:.7});a.key='first';await s.enter(a,{describe:'First subject'});
      await this.step('ending',{caption:'The final subject replaces the first.'});await s.clear();const b=new Text('Final subject',{fontSize:.7});b.key='last';b.clipBox=[-7,-2,7,2];await s.enter(b,{describe:'Final subject'});
      await this.step('split',{caption:'Read the left and right subjects.'});await s.clear();const l=new Text('Left',{fontSize:.2}).moveTo([-5,0]),r=new Text('Right',{fontSize:.2}).moveTo([5,0]);l.key='left';r.key='right';r.clipBox=[4,-1,6,1];await s.enter(l,r,{describe:'The left and right subjects'});await this.step('return',{caption:'Return to the right subject.'});await s.clear();const again=new Text('Again',{fontSize:.7}).moveTo([4,0]);again.key='again';await s.enter(again,{describe:'Again on the right'});await this.step('route',{caption:'The highlighted route enters the window.'});await s.clear();const outside=settingsOf(this).route==='outside';const route=new Line(outside?[20,0]:[-10,0],outside?[21,0]:[0,0],{stroke:'#ff0000',strokeWidth:.05});route.key='window-route';route.clipBox=outside?[19,-1,22,1]:[-1,-1,1,1];this.add(route,new Text('Unrelated context',{fontSize:.2}).moveTo([6,3]));const other=outside?new Text('Other subject',{fontSize:.7}):null;if(other)this.add(other);emphasises(this,()=>other?[[route,'visible route'],[other,'other subject']]:[[route,'visible route']]);}}`,
      );
      const project = await collectProject(dir, { write: false }),
        variant = project.variants[0]!;
      await buildExplainer(project, join(dir, 'story.html'));
      server = await serve(dir, 0, 'story.html');
      const page = await browser.newPage();
      const claims = [
        { step: 'opening', opening: true, targets: [{ key: 'first' }] },
        { step: 'ending', opening: true, targets: [{ key: 'last' }] },
        { step: 'split', targets: [{ key: 'left' }, { key: 'right' }] },
        { step: 'return', opening: true, targets: [{ key: 'again' }] },
      ];
      const results = await reviewStoryVariant(page, server.url + '/story.html', variant, claims);
      assert.deepEqual(
        results.map((r) => [r.step, r.width]),
        [
          ['opening', 390],
          ['ending', 390],
          ['split', 390],
          ['return', 390],
          ['route', 390],
          ['opening', 1180],
          ['ending', 1180],
          ['split', 1180],
          ['return', 1180],
          ['route', 1180],
        ],
      );
      await assert.rejects(
        reviewStoryVariant(page, server.url + '/story.html', variant, [
          ...claims,
          { step: 'route', targets: [{ key: 'window-route', paint: 'stroke' }] },
        ]),
        /route: window-route has hidden or clipped ink/,
        'an explicit arrow claim requires the whole route',
      );
      const outside = project.variants.find((v) => v.values.route === 'outside')!;
      await assert.rejects(
        reviewStoryVariant(page, server.url + '/story.html', outside, claims),
        /route: emphasis: window-route is outside the authored picture/,
        'helper membership cannot excuse an entirely absent subject',
      );
      await page.goto(server.url + '/story.html?step=ending');
      await page.waitForFunction(
        () => (window as unknown as { raynerReviewStep: string }).raynerReviewStep === 'ending',
      );
      await page.locator('.leaving').waitFor({ state: 'detached' });
      const frame = (await storyFrames(variant.Scene, claims)).get('ending')!;
      await assert.rejects(
        storyFrames(variant.Scene, [{ step: 'ending', targets: [{ key: 'absent' }] }]),
        /story target absent is missing/,
      );
      const index = frame.targets.find((t) => t.name === 'last')!.indices[0]!;
      await page.locator('.stage svg:not(.leaving)').evaluate((svg, index) => {
        const elements = [...svg.children].filter((e) => e.tagName.toLowerCase() !== 'defs');
        (elements[index] as SVGElement).style.visibility = 'hidden';
      }, index);
      assert.equal(
        (await inspectStoryFrame(page, frame)).ink.find((p) => p.index === index)!.visible,
        false,
        'actual hidden ink must be rejected despite intact source geometry',
      );
      for (const defect of ['visibility', 'fill', 'clip', 'opacity']) {
        await page.locator('.stage svg:not(.leaving)').evaluate((svg, index) => {
          const e = [...svg.children].filter((e) => e.tagName.toLowerCase() !== 'defs')[index] as SVGElement;
          e.style.visibility = '';
          e.style.fill = '';
          e.style.stroke = '';
          e.style.clipPath = '';
          e.style.opacity = '';
        }, index);
        assert.equal(
          (await inspectStoryFrame(page, frame)).ink.find((p) => p.index === index)!.visible,
          true,
          'each control starts with actually visible ink',
        );
        await page.locator('.stage svg:not(.leaving)').evaluate(
          (svg, { index, defect }) => {
            const e = [...svg.children].filter((e) => e.tagName.toLowerCase() !== 'defs')[index] as SVGElement;
            // CSSOM properties, as the player uses: setAttribute(style,...) is
            // blocked by the page CSP and would leave the previous hidden state.
            if (defect === 'visibility') e.style.visibility = 'hidden';
            if (defect === 'fill') {
              e.style.fill = 'transparent';
              e.style.stroke = 'none';
            }
            if (defect === 'clip') e.style.clipPath = 'inset(100%)';
            if (defect === 'opacity') e.style.opacity = '0';
          },
          { index, defect },
        );
        assert.equal((await inspectStoryFrame(page, frame)).ink.find((p) => p.index === index)!.visible, false, defect);
      }
      for (const defect of ['rect-transform', 'clip-transform', 'units'] as const) {
        await page.locator('.stage svg:not(.leaving)').evaluate(
          (svg, { index, defect }) => {
            const path = [...svg.children].filter((e) => e.tagName.toLowerCase() !== 'defs')[index] as SVGElement;
            path.removeAttribute('style');
            const id = /^url\(#([^)]*)\)$/.exec(path.getAttribute('clip-path')!)![1]!;
            const clip = svg.querySelector(`[id="${id}"]`)!,
              rect = clip.firstElementChild!;
            rect.removeAttribute('transform');
            clip.removeAttribute('transform');
            clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
          },
          { index, defect },
        );
        assert.equal(
          (await inspectStoryFrame(page, frame)).ink.find((p) => p.index === index)!.visible,
          true,
          'each clip control starts from a normal visible clip',
        );
        await page.locator('.stage svg:not(.leaving)').evaluate(
          (svg, { index, defect }) => {
            const path = [...svg.children].filter((e) => e.tagName.toLowerCase() !== 'defs')[index] as SVGElement;
            const id = /^url\(#([^)]*)\)$/.exec(path.getAttribute('clip-path')!)![1]!;
            const clip = svg.querySelector(`[id="${id}"]`)!,
              rect = clip.firstElementChild!;
            if (defect === 'rect-transform') rect.setAttribute('transform', 'translate(999999 0)');
            if (defect === 'clip-transform') clip.setAttribute('transform', 'translate(999999 0)');
            if (defect === 'units') clip.setAttribute('clipPathUnits', 'objectBoundingBox');
          },
          { index, defect },
        );
        assert.equal((await inspectStoryFrame(page, frame)).ink.find((p) => p.index === index)!.visible, false, defect);
      }
      await page.locator('.stage svg:not(.leaving)').evaluate((svg, index) => {
        const elements = [...svg.children].filter((e) => e.tagName.toLowerCase() !== 'defs');
        const path = elements[index] as SVGElement;
        path.style.visibility = '';
        path.removeAttribute('style');
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = '<clipPath id="review-hidden"><rect x="999999" y="999999" width="1" height="1"/></clipPath>';
        svg.prepend(defs);
        path.setAttribute('clip-path', 'url(#review-hidden)');
      }, index);
      await assert.rejects(
        inspectStoryFrame(page, frame),
        /painted record .* differs/,
        'a changed declared clip must not earn coverage for absent ink',
      );
      await page
        .locator('.stage svg:not(.leaving)')
        .evaluate(
          (svg, index) => [...svg.children].filter((e) => e.tagName.toLowerCase() !== 'defs')[index]!.remove(),
          index,
        );
      await assert.rejects(
        inspectStoryFrame(page, frame),
        /painted record count/,
        'other paths and the caption cannot stand in for a missing subject',
      );
      const split = (await storyFrames(variant.Scene, claims)).get('split')!;
      const right = split.targets.find((t) => t.name === 'right')!.indices[0]!;
      for (const mode of ['visibility', 'clip'] as const) {
        const poisoned = await browser.newPage();
        try {
          await poisoned.addInitScript(
            ({ index, mode }) =>
              document.addEventListener('rayner:step', (event) => {
                if ((event as CustomEvent).detail.step !== 'split') return;
                const svg = document.querySelector('.stage svg:not(.leaving)') as SVGSVGElement;
                const path = [...svg.children].filter((e) => e.tagName.toLowerCase() !== 'defs')[
                  index
                ] as SVGGraphicsElement;
                const id = /^url\(#([^)]*)\)$/.exec(path.getAttribute('clip-path')!)![1]!;
                const clip = svg.querySelector(`[id="${id}"] rect`)!;
                const originalX = clip.getAttribute('x')!;
                const hide = () => {
                  const b = path.getBBox(),
                    v = svg.viewBox.baseVal,
                    shown = b.x < v.x + v.width && b.x + b.width > v.x;
                  if (mode === 'visibility') path.style.visibility = shown ? 'hidden' : '';
                  else clip.setAttribute('x', shown ? '999999' : originalX);
                };
                new MutationObserver(hide).observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
                hide();
              }),
            { index: right, mode },
          );
          // Generic new artwork must also be protected when it has no named claim.
          await assert.rejects(
            reviewStoryVariant(
              poisoned,
              server.url + '/story.html',
              variant,
              claims.filter((c) => c.step !== 'split'),
            ),
            /split at 390px: changed: Right is missing/,
            mode,
          );
        } finally {
          await poisoned.close();
        }
      }
    } finally {
      await browser.close();
      server!?.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test('narrow-opening plans keep a nonopening text claim separate from a same-named opening key', async () => {
  class CollidingNames extends Scene {
    override async construct() {
      const s = stage(this); await this.step('comparison');
      const context = new Text('Same', {fontSize: .7}).moveTo([-2, 0]);
      const subject = new Text('Result', {fontSize: .7}).moveTo([2, 0]); subject.key = 'Same';
      await s.enter(context, subject, {describe: 'Context and result'});
    }
  }
  const variant = {Scene: CollidingNames, values: {}, trace: await traceScene(CollidingNames)};
  const claims = [
    {step: 'comparison', targets: [{text: 'Same'}]},
    {step: 'comparison', opening: true, targets: [{key: 'Same'}]},
  ];
  assert.deepEqual(await narrowOpeningPlan(variant, claims),
    [{step: 'comparison', reviewed: true, targets: ['Same'], labels: ['Result']}]);
});

test('story label metrics preserve the smallest native em dimension under rotations and nonuniform scaling', async () => {
  await fc.assert(fc.asyncProperty(fc.integer({min: 1, max: 32}), fc.integer({min: 1, max: 32}),
    fc.constantFrom(0, Math.PI / 2, -Math.PI / 4), async (x, y, angle) => {
      class Turned extends Scene {
        override async construct() {
          const s = stage(this); await this.step('turned');
          const text = new Text('1', {fontSize: .6}).stretch(x / 4, 0).stretch(y / 4, 1).rotate(angle);
          text.key = 'turned'; await s.enter(text, {describe: 'A transformed number'});
        }
      }
      const frame = (await storyFrames(Turned, [{step: 'turned', opening: true, targets: [{key: 'turned'}]}])).get('turned')!;
      assert.equal(frame.labels.length, 1);
      assert.ok(Math.abs(frame.labels[0]!.size - .6 * Math.min(x / 4, y / 4)) < 1e-6);
    }), params(50, {examples: [[16, 1, 0], [16, 1, Math.PI / 2], [1, 16, -Math.PI / 4]]}));
});

test(
  'main opening review catches 320px-only clipping and CSS-shrunk labels while preserving explicit dim subjects',
  { skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for minimum-width opening checks' },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rayner-narrow-story-'));
    const browser = await launch();
    let server: Awaited<ReturnType<typeof serve>> | undefined;
    try {
      await writeFile(join(dir, 'scene.ts'), `import{Scene,Text,Group}from'rayner';import{stage,settingsOf}from'rayner/explain';
export default class Narrow extends Scene{static meta={id:'narrow',title:'Width-sensitive comparison'};static settings=[{id:'spacing',label:'Spacing',default:'compact',options:[{value:'compact',label:'Compact'},{value:'wide',label:'Wide'},{value:'all-detail',label:'All detail fallback'}]}];async construct(){
const s=stage(this);await this.step('comparison',{detail:settingsOf(this).spacing==='all-detail',caption:'Keep both values together.'});const x=settingsOf(this).spacing==='wide'?6.5:3;
const left=new Text('Before 1',{fontSize:.6}).moveTo([-x,0]),right=new Text('After 2',{fontSize:.6}).moveTo([x,0]);left.key='left';right.key='right';const g=new Group(left,right);s.reading(g);await s.enter(g,{describe:'Before one, after two'});
await this.step('reference',{detail:true,caption:'Reference implementation value.'});await s.clear();const r=new Text('Reference',{fontSize:.2});r.key='reference';await s.enter(r,{describe:'Reference value'});
}}`);
      const project = await collectProject(dir, {write: false});
      await buildExplainer(project, join(dir, 'narrow.html'));
      server = await serve(dir, 0, 'narrow.html');
      const url = server.url + '/narrow.html', compact = project.variants[0]!, wide = project.variants[1]!;
      assert.deepEqual(project.variants.map(v => v.values.spacing), ['compact', 'wide', 'all-detail']);
      const claims = [
        {step: 'comparison', opening: true, targets: [{key: 'left'}, {key: 'right'}]},
        {step: 'reference', targets: [{key: 'reference'}]},
      ];
      const page = await browser.newPage();
      const mixedPlan = await narrowOpeningPlan(compact, claims);
      assert.deepEqual(mixedPlan.find(p => p.step === 'reference'), {step: 'reference', reviewed: false, reason: 'detail-step'});
      const allDetail = project.variants[2]!;
      assert.equal((await narrowOpeningPlan(allDetail, claims)).find(p => p.step === 'comparison')!.reviewed, true,
        'all-detail fallback has a main reading path and cannot silently skip its opening claims');
      const results = await reviewStoryVariant(page, url, compact, claims);
      assert.equal(results.length, 4, 'the existing two-width/all-step matrix remains intact');
      const fallback = await reviewStoryVariant(page, url, allDetail, claims);
      assert.ok(fallback.find(r => r.step === 'comparison' && r.width === 390)!.openingAt320!.reviewed, 'actual all-detail reader opening is reviewed at 320px');
      const opening = results.find(r => r.step === 'comparison' && r.width === 390)!.openingAt320!;
      assert.ok(opening.reviewed);
      assert.deepEqual(opening.targets, ['left', 'right']);
      assert.ok(opening.minimumLabelPx! >= 12 - 1e-6);
      assert.deepEqual(results.find(r => r.step === 'reference' && r.width === 390)!.openingAt320,
        {reviewed: false, reason: 'detail-step'});

      // Establish the wide fixture's positive control at the legacy phone width:
      // the independently named paths really are complete and readable there.
      await page.setViewportSize({width: 390, height: 844});
      await page.goto(url + '?spacing=wide&step=comparison');
      await page.waitForFunction(() => (window as unknown as {raynerReviewStep: string}).raynerReviewStep === 'comparison');
      await page.locator('.leaving').waitFor({state: 'detached'});
      const frame = (await storyFrames(wide.Scene, claims)).get('comparison')!, seen = await inspectStoryFrame(page, frame);
      assert.equal(frame.targets.length, 2);
      for (const target of frame.targets) for (const index of target.indices) {
        const ink = seen.ink.find(ink => ink.index === index)!;
        assert.ok(ink.visible && ink.complete && covered(ink.box, [seen.viewport]));
      }
      for (const label of frame.labels) assert.ok(label.size * Math.min(...label.indices.map(index => seen.ink.find(ink => ink.index === index)!.scale)) >= 12 - 1e-6);
      await assert.rejects(reviewStoryVariant(page, url, wide, claims), /comparison at 320px: .*missing from the opening/);

      const compactFrame = (await storyFrames(compact.Scene, claims)).get('comparison')!;
      assert.deepEqual(compactFrame.labels.map(label => label.text), ['Before 1', 'After 2'], 'only existing heading classification excludes the chrome');
      const index = compactFrame.targets.find(t => t.name === 'left')!.indices[0]!;
      const dimmed = await browser.newPage();
      await dimmed.addInitScript(index => document.addEventListener('rayner:step', () => {
        if (innerWidth !== 320) return;
        const svg = document.querySelector('.stage svg:not(.leaving)'); if (!svg) return;
        const paths = [...svg.children].filter(e => e.tagName.toLowerCase() !== 'defs');
        (paths[index] as SVGElement).style.opacity = '0.2';
      }), index);
      const dimmedResults = await reviewStoryVariant(dimmed, url, compact, claims);
      assert.equal(dimmedResults.length, 4, 'explicit dimmed subjects still count and must reach the reading size');
      await dimmed.close();
      for (const [property, value, error] of [
        ['transform', 'scale(0.5)', /Before 1 reads at .*below 12px/],
        ['transform', 'scaleY(0.3)', /Before 1 reads at .*below 12px/],
        ['transform', 'matrix(1,0,1,0.001,0,0)', /Before 1 reads at .*below 12px/],
      ] as const) {
        const poisoned = await browser.newPage();
        await poisoned.addInitScript(({index, property, value}) => document.addEventListener('rayner:step', () => {
          if (innerWidth !== 320) return;
          const svg = document.querySelector('.stage svg:not(.leaving)');
          if (!svg) return;
          const paths = [...svg.children].filter(e => e.tagName.toLowerCase() !== 'defs');
          (paths[index] as SVGElement).style.setProperty(property, value);
        }), {index, property, value});
        await assert.rejects(reviewStoryVariant(poisoned, url, compact, claims), error, `${property}: ${value}`);
        await poisoned.close();
      }
    } finally {
      await browser.close(); server?.close(); await rm(dir, {recursive: true, force: true});
    }
  },
);


test('served review rejects hidden reordered and duplicated layers despite a changed incidental label',
  { skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for served layer-order checks' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-story-layers-'));
  const browser = await launch();
  let server: Awaited<ReturnType<typeof serve>> | undefined;
  try {
    await writeFile(join(dir, 'scene.ts'), `import{Scene,Group,Rectangle,Text}from'rayner';import{settingsOf}from'rayner/explain';
      export default class Layers extends Scene{
        static meta={id:'layers',title:'Which layers are painted?'};
        static settings=[{id:'mode',label:'Layer change',default:'reordered',options:['reordered','added','removed'].map(value=>({value,label:value}))}];
        async construct(){
          const mode=settingsOf(this).mode;
          const draw=(colors,counter)=>new Group(...colors.map((fill,i)=>{const r=new Rectangle({width:6,height:4,fill,stroke:'none'}).setOpacity(.95);r.key='layer-'+i;return r;}),new Text('Step '+counter,{fontSize:.6}).moveTo([0,-3]));
          await this.step('before',{caption:'The initial layer stack is shown.'});
          const first=draw(mode==='removed'?['#ff0000','#ff0000']:mode==='added'?['#ff0000']:['#ff0000','#0000ff'],1);this.add(first);
          await this.step('after',{caption:mode==='reordered'?'Red now covers blue.':mode==='added'?'Two translucent red layers are painted.':'One red layer remains.'});
          this.remove(first);this.add(draw(mode==='reordered'?['#0000ff','#ff0000']:mode==='added'?['#ff0000','#ff0000']:['#ff0000'],2));
        }
      }`);
    const project = await collectProject(dir, { write: false });
    assert.equal(project.variants.length, 3);
    await buildExplainer(project, join(dir, 'layers.html'));
    server = await serve(dir, 0, 'layers.html');
    let baselineRows = 0, rejected = 0;
    for (const variant of project.variants) {
      const page = await browser.newPage();
      try {
        baselineRows += (await reviewStoryVariant(page, server.url + '/layers.html', variant)).length;
      } finally { await page.close(); }
      const poisoned = await browser.newPage();
      try {
        const index = variant.values.mode === 'removed' ? 0 : 1;
        await poisoned.addInitScript(index => {
          document.addEventListener('rayner:step', event => {
            if ((event as CustomEvent).detail.step !== 'after') return;
            const svg = document.querySelector('.stage svg:not(.leaving)')!;
            const path = [...svg.children].filter(e => e.tagName.toLowerCase() !== 'defs')[index] as SVGGraphicsElement;
            const paint = getComputedStyle(path);
            (window as unknown as { visibleBeforePoison: boolean }).visibleBeforePoison =
              Number(paint.opacity) >= 0.95 && paint.fill !== 'none' && path.getBBox().width > 0;
            // CSSOM applies under the artifact CSP; changing the style attribute
            // instead could be blocked and make a poison control meaningless.
            path.style.opacity = '0';
          });
        }, index);
        await assert.rejects(reviewStoryVariant(poisoned, server.url + '/layers.html', variant),
          /after: changed: layer-.* has hidden or clipped ink/, variant.values.mode);
        assert.equal(await poisoned.evaluate(() =>
          (window as unknown as { visibleBeforePoison: boolean }).visibleBeforePoison), true,
        'each defect starts from actually painted ink');
        assert.equal(await poisoned.locator('.stage svg:not(.leaving)').evaluate((svg, index) => {
          const path = [...svg.children].filter(e => e.tagName.toLowerCase() !== 'defs')[index]!;
          return getComputedStyle(path).opacity;
        }, index), '0', 'the intended CSS poison actually applies');
        rejected++;
      } finally { await poisoned.close(); }
    }
    assert.equal(baselineRows, 12, 'three cases, two steps, two widths');
    assert.equal(rejected, 3, 'every changed-layer defect is rejected');
  } finally {
    await browser.close(); server?.close(); await rm(dir, { recursive: true, force: true });
  }
});

// The caption compares policy outcomes, not the architecture revealed when
// old percentage notes disappear. These expectations are independent of shares().
test('traffic policy reviews every case and step while binding its comparison to readable policy facts',
  {skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for served traffic-policy checks'}, async () => {
  const {reviewClaims} = await import('../tools/lib/explain-review-scene.ts');
  const {STORY_CLAIMS} = await import('../tools/lib/explain-story-review.ts');
  const {Card} = await import('../explain/panels.ts');
  const project = await collectProject('scenes/explainers/traffic-policy', {write: false});
  const claims = await reviewClaims(project, undefined, STORY_CLAIMS['traffic-policy']);
  const facts: Record<string, {cluster: Record<string, string>; local: Record<string, string>}> = {
    '3-1-0': {
      cluster: {'Pods a, b, c and d': '1/4 each (25%)', 'Second hop': '2 in 3', 'Pod sees': 'node address'},
      local: {'Pod d': '1/2 (50%)', 'Pods a, b and c': '1/6 each (16.7%)', 'Second hop': 'none', 'Pod sees': 'client address'},
    },
    '2-2-0': {
      cluster: {'Pods a, b, c and d': '1/4 each (25%)', 'Second hop': '2 in 3', 'Pod sees': 'node address'},
      local: {'Pods a, b, c and d': '1/4 each (25%)', 'Second hop': 'none', 'Pod sees': 'client address'},
    },
    '1-1-1': {
      cluster: {'Pods a, b and c': '1/3 each (33.3%)', 'Second hop': '2 in 3', 'Pod sees': 'node address'},
      local: {'Pods a, b and c': '1/3 each (33.3%)', 'Second hop': 'none', 'Pod sees': 'client address'},
    },
  };
  assert.deepEqual(project.variants.map(v => [v.values.policy, v.values.pods]).sort(),
    ['cluster', 'local'].flatMap(policy => Object.keys(facts).map(pods => [policy, pods])).sort());
  const dir = await mkdtemp(join(tmpdir(), 'rayner-traffic-subjects-'));
  const browser = await launch();
  let server: Awaited<ReturnType<typeof serve>> | undefined;
  try {
    await buildExplainer(project, join(dir, 'traffic.html'));
    server = await serve(dir, 0, 'traffic.html');
    const url = server.url + '/traffic.html';
    const page = await browser.newPage();
    let reviewed = 0, compared = 0, readableLabels = 0;
    for (const variant of project.variants) {
      const expected = facts[variant.values.pods!]!;
      let inspected = 0;
      await new variant.Scene({async frame() {}, async stepEnd(scene, step) {
        if (step.name !== 'compare') return;
        const cards = scene.familyMembers().filter((m): m is InstanceType<typeof Card> =>
          m instanceof Card && !!m.key?.startsWith('traffic-compare:'));
        assert.equal(cards.length, 2);
        for (const policy of ['cluster', 'local'] as const) {
          const card = cards.find(card => card.key === 'traffic-compare:' + policy)!;
          assert.ok(card, policy + ' has its own semantic card');
          assert.deepEqual(Object.fromEntries([...card.values].map(([label, value]) => [label, value.text])), expected[policy]);
          assert.ok(card.family().some(m => m instanceof Text && m.text === (policy === 'cluster' ? 'Cluster' : 'Local')));
        }
        inspected++;
      }}, {skipUntil: Infinity}).run();
      assert.equal(inspected, 1, 'every case has one factual policy comparison');
      const applicable = claims.filter(c => Object.entries(c.settings ?? {}).every(([k, v]) => variant.values[k] === v));
      const frame = (await storyFrames(variant.Scene, applicable)).get('compare')!;
      assert.deepEqual(frame.targets.filter(t => ['traffic-compare:cluster', 'traffic-compare:local'].includes(t.name)).map(t => t.name).sort(),
        ['traffic-compare:cluster', 'traffic-compare:local']);
      assert.ok(!frame.targets.some(t => t.name.startsWith('changed:')), 'independent facts take priority over incidentally revealed context');
      const rows = await reviewStoryVariant(page, url, variant, claims);
      assert.deepEqual(rows.map(r => [r.width, r.step]),
        [390, 1180].flatMap(width => variant.trace.steps.map(s => [width, s.step])));
      reviewed += rows.length;
      const cardIndices = new Set(frame.targets.filter(t => t.name.startsWith('traffic-compare:')).flatMap(t => t.indices));
      const labels = frame.labels.filter(label => label.indices.some(index => cardIndices.has(index)));
      assert.ok(labels.length >= 8, 'both cards contain their policy heading and factual rows');
      for (const width of [390, 1180]) {
        await page.setViewportSize({width, height: width === 390 ? 844 : 980});
        await page.goto(url + '?' + new URLSearchParams({...variant.values, step: 'compare'}));
        await page.waitForSelector('[data-ready=true]');
        await page.waitForFunction(() => !document.querySelector('#content.loading'));
        const views = [await inspectStoryFrame(page, frame)];
        const next = page.locator('.view-controls > button').first();
        const seen = new Set([views[0]!.viewBox]);
        if (await next.isVisible() && await next.isEnabled()) for (let n = 0; n <= frame.records.length; n++) {
          await next.click();
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          const view = await inspectStoryFrame(page, frame);
          if (seen.has(view.viewBox)) break;
          assert.ok(n < frame.records.length, 'the policy-card tour terminates');
          seen.add(view.viewBox); views.push(view);
        }
        for (const label of labels) {
          const readable = views.some(view => label.indices.every(index => {
            const ink = view.ink.find(ink => ink.index === index)!;
            return ink.visible && ink.complete && covered(ink.box, [view.viewport]) && label.size * ink.scale >= 12 - 1e-6;
          }));
          assert.ok(readable, `${JSON.stringify(variant.values)} at ${width}: ${label.text} is complete and at least 12px in one reachable view`);
          readableLabels++;
        }
        compared++;
      }
    }
    assert.equal(reviewed, 108, 'six cases, nine steps each, at both production review widths');
    assert.equal(compared, 12, 'all six comparisons at both widths');
    assert.ok(readableLabels >= 96, 'both policy cards checked at every width');
    await page.close();
    // Omitting the authored caption contract reproduces the original false
    // obligation: an old diagram becomes visible when its notes are removed.
    const oldInference = await browser.newPage();
    try {
      await assert.rejects(reviewStoryVariant(oldInference, url, project.variants[0]!, STORY_CLAIMS['traffic-policy']),
        /compare.*changed: drawing is missing from the close-up tour/);
    } finally {await oldInference.close();}
    const variant = project.variants[0]!;
    const applicable = claims.filter(c => Object.entries(c.settings ?? {}).every(([k, v]) => variant.values[k] === v));
    const frame = (await storyFrames(variant.Scene, applicable)).get('compare')!;
    let rejected = 0;
    for (const [width, word] of [[390, 'node address'], [1180, 'client address']] as const) {
      const label = frame.labels.find(label => label.text === word)!;
      assert.ok(label);
      const index = label.indices[0]!;
      const poisoned = await browser.newPage();
      try {
        await poisoned.addInitScript(({width, index}) => {
          document.addEventListener('rayner:step', event => {
            if (innerWidth !== width || (event as CustomEvent).detail.step !== 'compare') return;
            const svg = document.querySelector('.stage svg:not(.leaving)')!;
            const path = [...svg.children].filter(e => e.tagName.toLowerCase() !== 'defs')[index] as SVGElement;
            path.style.opacity = '0';
          });
        }, {width, index});
        await assert.rejects(reviewStoryVariant(poisoned, url, variant, claims), /compare.*traffic-compare:.*hidden or clipped ink/);
        assert.equal(await poisoned.locator('.stage svg:not(.leaving)').evaluate((svg, index) =>
          getComputedStyle([...svg.children].filter(e => e.tagName.toLowerCase() !== 'defs')[index]!).opacity, index), '0',
          'the caption evidence is actually hidden under the served CSP');
        rejected++;
      } finally {await poisoned.close();}
    }
    assert.equal(rejected, 2, 'each source-address role is required at its actual review width');
  } finally {await browser.close(); server?.close(); await rm(dir, {recursive: true, force: true});}
});

test('320px opening paint requires each named shape and label to contribute through actual opaque layers',
  {skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for native opening occlusion checks'}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-opening-occlusion-'));
  const browser = await launch();
  let server: Awaited<ReturnType<typeof serve>> | undefined;
  try {
    await writeFile(join(dir, 'scene.ts'), `import{Scene,Rectangle,Text,Group}from'rayner';import{stage,settingsOf}from'rayner/explain';
export default class Occlusion extends Scene{static meta={id:'occlusion',title:'Named opening paint'};
static settings=[{id:'channels',label:'Disabled paint',default:'opacity',options:[{value:'opacity',label:'Zero opacity'},{value:'color',label:'Transparent colour'}]}];async construct(){
const transparent=settingsOf(this).channels==='color';
const s=stage(this);await this.step('comparison',{caption:'The blue shape and the named value are visible.'});
const shape=new Rectangle({width:1,height:1,fill:'blue',stroke:'none'}).moveTo([-3,0]);shape.key='blue-shape';shape.clipBox=[-3.6,-.6,-2.4,.6];
const label=new Text('Named value',{fontSize:.8}).moveTo([2,0]);label.clipBox=[-1,-.6,5,.6];
const accent=new Rectangle({width:.5,height:.5,fill:'blue',stroke:'none'}).moveTo([2,-1.5]);
const outlined=new Text('Outline',{fontSize:2}).setStyle({fill:transparent?'transparent':'white',fillOpacity:transparent?1:0,stroke:'white',strokeWidth:.03,strokeOpacity:1}).moveTo([-3,-2.5]);
const filled=new Text('Fill',{fontSize:.8}).setStyle({fill:'white',fillOpacity:1,stroke:transparent?'rgba(255,255,255,0)':'white',strokeWidth:.2,strokeOpacity:transparent?1:0}).moveTo([3,-2.5]);
const haloPlate=new Rectangle({width:4,height:1.4,fill:'red',stroke:'none'}).moveTo([0,2]);
const halo=new Text('Halo',{fontSize:.8}).setStyle({fill:'white',stroke:'red',strokeWidth:.08,paintOrder:'stroke'}).moveTo([0,2]);
const labelled=new Group(label,accent,outlined,filled,haloPlate,halo);labelled.key='label-subject';s.reading(shape,labelled);
const shapeCover=new Rectangle({width:2,height:2,fill:'red',stroke:'none'}).moveTo([-3,0]).setOpacity(.2);
const labelCover=new Rectangle({width:6,height:2,fill:'red',stroke:'none'}).moveTo([2,0]).setOpacity(.2);
const halfCover=new Rectangle({width:3,height:2,fill:'green',stroke:'none'}).moveTo([3.5,0]).setOpacity(.2);
const thinCover=new Rectangle({width:.1,height:2,fill:'yellow',stroke:'none'}).moveTo([2.5,0]).setOpacity(.2);
const haloCover=new Rectangle({width:4,height:1.4,fill:'orange',stroke:'none'}).moveTo([0,2]).setOpacity(.2);
this.add(shape,labelled,shapeCover,labelCover,halfCover,thinCover,haloCover);}}`);
    const project = await collectProject(dir, {write: false}), variant = project.variants[0]!;
    const claims = [{step: 'comparison', opening: true, targets: [{key: 'blue-shape'}, {key: 'label-subject'}]}];
    await buildExplainer(project, join(dir, 'scene.html'));
    server = await serve(dir, 0, 'scene.html');
    const url = server.url + '/scene.html';
    assert.deepEqual(project.variants.map(v => v.values.channels), ['opacity', 'color']);
    const page = await browser.newPage();
    for (const sample of project.variants) {
      const rows = await reviewStoryVariant(page, url, sample, claims);
      const receipt = rows.find(row => row.width === 390)!.openingAt320!;
      assert.ok(receipt.reviewed && receipt.minimumLabelPx! >= 12, 'translucent layers preserve painted facts and the label floor');
      assert.deepEqual(receipt.labels, ['Named value', 'Outline', 'Fill', 'Halo'],
        'outline-only, disabled-stroke and halo-backed labels retain their actual glyph cores');
    }
    await page.close();
    for (const [which, missing] of [['shape', /missing or obscured paint: blue-shape/],
      ['label', /missing or obscured paint: label Named value/],
      ['partial', /missing or obscured paint: label Named value/],
      ['thin', /missing or obscured paint: label Named value/],
      ['halo', /missing or obscured paint: label Halo/]] as const) {
      const poisoned = await browser.newPage();
      try {
        await poisoned.addInitScript(which => document.addEventListener('rayner:step', () => {
          if (innerWidth !== 320) return;
          const covers = ([...document.querySelectorAll('.stage svg:not(.leaving) path[fill="red"]')] as SVGElement[]).filter(path => Number(getComputedStyle(path).opacity) === .2);
          const cover = which === 'halo' ? document.querySelector('.stage svg:not(.leaving) path[fill="orange"]') as SVGElement : which === 'partial' || which === 'thin'
            ? document.querySelector(`.stage svg:not(.leaving) path[fill="${which === 'partial' ? 'green' : 'yellow'}"]`) as SVGElement
            : covers[which === 'shape' ? 0 : 1]!;
          const before = getComputedStyle(cover).opacity;
          cover.style.opacity = '1';
          (window as unknown as {occlusionControl: string[]}).occlusionControl = [before, getComputedStyle(cover).opacity];
        }), which);
        await assert.rejects(reviewStoryVariant(poisoned, url, variant, claims), missing, which);
        assert.deepEqual(await poisoned.evaluate(() =>
          (window as unknown as {occlusionControl: string[]}).occlusionControl), ['0.2', '1'],
        'the cover begins translucent, and CSSOM poison applies under the served CSP');
      } finally { await poisoned.close(); }
    }
    const frame = (await storyFrames(variant.Scene, claims)).get('comparison')!;
    const labelIndices = frame.labels.find(label => label.text === 'Named value')!.indices;
    const shapeIndices = frame.targets.find(target => target.name === 'blue-shape')!.indices;
    for (const effect of ['mask', 'filter', 'ancestor-filter', 'path', 'shape-mask', 'shape-path', 'gradient', 'round-clip'] as const) {
      const poisoned = await browser.newPage();
      try {
        await poisoned.addInitScript(({effect, indices}) => document.addEventListener('rayner:step', () => {
          if (innerWidth !== 320) return;
          const svg = document.querySelector('.stage svg:not(.leaving)') as SVGSVGElement;
          let defs = svg.querySelector('defs');
          if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); svg.prepend(defs); }
          const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
          mask.id = 'erased-word-middle'; mask.setAttribute('maskContentUnits', 'objectBoundingBox');
          mask.innerHTML = '<rect x="0" y="0" width="1" height="1" fill="white"/><rect x=".35" y="0" width=".3" height="1" fill="black"/>';
          defs.append(mask);
          const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
          gradient.id = 'erased-word-gradient';
          gradient.innerHTML = '<stop offset="0" stop-color="white"/><stop offset=".35" stop-color="white"/><stop offset=".35" stop-color="white" stop-opacity="0"/><stop offset=".65" stop-color="white" stop-opacity="0"/><stop offset=".65" stop-color="white"/><stop offset="1" stop-color="white"/>';
          defs.append(gradient);
          const paths = [...svg.children].filter(element => element.tagName.toLowerCase() !== 'defs') as SVGElement[];
          const label = paths[indices[0]!]!, before = getComputedStyle(label).maskImage;
          for (const index of indices) {
            if (effect === 'mask' || effect === 'shape-mask') paths[index]!.style.mask = 'url(#erased-word-middle)';
            else if (effect === 'filter') paths[index]!.style.filter = 'opacity(1)';
            else if (effect === 'gradient') paths[index]!.style.fill = 'url(#erased-word-gradient)';
            else if (effect === 'path') paths[index]!.style.setProperty('d', 'path("M -500 -500 L500 -500 L500 500 L-500 500 Z")');
            else if (effect === 'shape-path') {
              const box = (paths[index] as SVGGraphicsElement).getBBox();
              paths[index]!.style.setProperty('d', `path("M ${box.x} ${box.y} L ${box.x + box.width} ${box.y} L ${box.x + box.width} ${box.y + box.height} Z")`);
            }
          }
          let roundClip: SVGElement | undefined;
          if (effect === 'round-clip') {
            const id = /^url\(#([^)]*)\)$/.exec(label.getAttribute('clip-path')!)![1]!;
            roundClip = svg.querySelector(`[id="${id}"] rect`)! as SVGElement;
            roundClip.style.setProperty('rx', '50%'); roundClip.style.setProperty('ry', '50%');
          }
          if (effect === 'ancestor-filter') svg.parentElement!.style.filter = 'opacity(1)';
          const target = effect === 'ancestor-filter' ? svg.parentElement! : label;
          (window as unknown as {effectControl: string[]}).effectControl = [before,
            roundClip ? getComputedStyle(roundClip).getPropertyValue('rx') : getComputedStyle(target).getPropertyValue(
              effect.endsWith('mask') ? 'mask-image' : effect.endsWith('path') ? 'd' : effect === 'gradient' ? 'fill' : 'filter')];
        }), {effect, indices: effect.startsWith('shape-') ? shapeIndices : labelIndices});
        await assert.rejects(reviewStoryVariant(poisoned, url, variant, claims), effect.endsWith('path')
          ? /(?:label Named value|blue-shape): CSS overrides declared subject path/
          : effect === 'gradient' ? /label Named value: unsupported paint server/
          : effect === 'round-clip' ? /label-subject has hidden or clipped ink/
          : /(?:label Named value|blue-shape): unsupported mask\/filter/);
        const control = await poisoned.evaluate(() => (window as unknown as {effectControl: string[]}).effectControl);
        assert.equal(control[0], 'none', 'the label starts without a mask');
        assert.notEqual(control[1], 'none', 'the intended CSSOM effect applies under the served CSP');
      } finally { await poisoned.close(); }
    }
  } finally { await browser.close(); server?.close(); await rm(dir, {recursive: true, force: true}); }
});

test('a thick highlighted outline remains reachable above the heading boundary throughout its phone tour',
  {skip: !process.env.EXPLAIN_BROWSER && 'set EXPLAIN_BROWSER=1 for native painted-stroke coverage'}, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rayner-stroke-tour-'));
  const browser = await launch();
  let server: Awaited<ReturnType<typeof serve>> | undefined;
  try {
    await writeFile(join(dir, 'scene.ts'), `import{Scene,Rectangle,Text}from'rayner';import{emphasises}from${JSON.stringify(join(ROOT, 'explain/look.ts'))};
export default class StrokeTour extends Scene{static meta={id:'stroke-tour',title:'The entire outlined region'};async construct(){
await this.step('outlined',{caption:'The red outline surrounds the region.'});
const heading=new Rectangle({width:12,height:.6,fill:'gray',stroke:'none'}).moveTo([0,3.5]);heading.key='__heading';
const outline=new Rectangle({width:7.6,height:7.6,fill:'none',stroke:'red',strokeWidth:.126}).moveTo([-3.95,-.6]);outline.key='outlined-region';
const label=new Text('Region',{fontSize:.2}).moveTo([-4,0]);this.add(heading,outline,label);
await this.step('refocus',{caption:'The outline stays while Region becomes Area.'});label.setText('Area');
emphasises(this,()=>[[outline,'same region, newly focused']]);}}`);
    const project = await collectProject(dir, {write: false});
    await buildExplainer(project, join(dir, 'scene.html'));
    server = await serve(dir, 0, 'scene.html');
    const page = await browser.newPage();
    const rows = await reviewStoryVariant(page, server.url + '/scene.html', project.variants[0]!,
      [{step: 'outlined', targets: [{key: 'outlined-region', paint: 'stroke'}, {text: 'Region'}]},
        {step: 'refocus', targets: [{key: 'outlined-region', paint: 'stroke'}, {text: 'Area'}]}]);
    assert.deepEqual(rows.map(row => [row.step, row.width]), [['outlined', 390], ['refocus', 390], ['outlined', 1180], ['refocus', 1180]]);
    // A label small enough that even the phone's taller stage needs a tour of several close-ups.
    assert.ok(rows[0]!.views > 1, 'the phone assertion covers the whole tour, not an unzoomed overview');
  } finally { await browser.close(); server?.close(); await rm(dir, {recursive: true, force: true}); }
});
