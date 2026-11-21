import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Resvg } from '@resvg/resvg-js';
import { FadeIn, FadeOut, Group, Polygon, Rectangle, Scene, Succession, Text, Transform, VMobject, keyed, renderFrame, toSvgString } from '../src/index.ts';
import type { Mobject } from '../src/index.ts';
import { KeyedMotionSink } from '../src/internal.ts';
import { loadFonts } from '../explain/testing.ts';

await loadFonts();

const label = (words = 'ABCD') => keyed(new Text(words, { fontSize: 0.7, color: '#ff0000' }).moveTo([0, 0]), 'status');
const plate = () => new Rectangle({ width: 4, height: 1.2, fill: '#224466', stroke: 'none' });

/** Red glyph pixels in the SVG that a reader actually sees. No detector geometry is used. */
function ink(scene: Scene): number {
  const svg = toSvgString(scene, { width: 480 });
  const { pixels } = new Resvg(svg, { font: { loadSystemFonts: false } }).render();
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4)
    if (pixels[i]! > 160 && pixels[i + 1]! < 90 && pixels[i + 2]! < 90) count++;
  return count;
}

async function inspect(draw: (scene: Scene) => Promise<void>, fps = 30, observe?: (scene: Scene) => void) {
  class Example extends Scene {
    override async construct() {
      await this.step('edit');
      await draw(this);
    }
  }
  const sink = new KeyedMotionSink();
  await new Example({ frame: async (scene, dt) => {
    observe?.(scene);
    await sink.frame(scene, dt);
  } }, { fps }).run();
  return sink.finish().filter(f => f.kind === 'occluded words');
}

async function reveal(scene: Scene, mask: Mobject) {
  mask.setOpacity(0);
  await scene.wait(0.1);
  await scene.play(mask.animate.setOpacity(1), { runTime: 0.4 });
  await scene.wait(0.25);
}

test('a stationary panel hides letters for a measurable interval even with no travelling part', async () => {
  for (const fps of [15, 30, 60]) {
    for (const word of ['ABCD', 'A']) {
      const findings = await inspect(async s => {
        const readout = label(word), mask = plate().setOpacity(0);
        s.add(readout, mask);
        assert.ok(ink(s) > 10);
        await reveal(s, mask);
        assert.equal(ink(s), 0);
      }, fps);
      assert.equal(findings.length, 1, JSON.stringify({ fps, word, findings }));
      assert.equal(findings[0]!.key, 'status');
      assert.ok(findings[0]!.value >= 0.1);
    }
  }
});

test('one traveller covering two labels retains the second victim after reporting its longest crossing', async () => {
  const motion = new KeyedMotionSink(() => 'two labels');
  const witnessed = new Set<string>();
  class TwoLabels extends Scene {
    override async construct() {
      const a = label('ABCD').moveTo([-2, 0]);
      const b = keyed(new Text('EFGH', { fontSize: 0.7, color: '#ff0000' }).moveTo([2, 0]), 'second');
      const mask = keyed(new Rectangle({ width: 2.8, height: 1.2, fill: '#224466', stroke: 'none' }).moveTo([-2, 0]), 'traveller');
      mask.setOpacity(0);
      this.add(a, b, mask);
      await this.wait(0.1);
      await this.play(mask.animate.setOpacity(1), { runTime: 0.2 });
      await this.wait(0.6);
      await this.play(mask.animate.shift([4, 0]), { runTime: 0.4 });
      await this.wait(0.3);
      await this.play(new FadeOut(mask), { runTime: 0.2 });
      await this.wait(0.1);
    }
  }
  await new TwoLabels({ async frame(s, dt) {
    const mask = s.find('traveller');
    if (mask?.style.opacity === 1 && Math.abs(mask.center()[0]!) > 1.99) {
      const before = ink(s);
      mask.setOpacity(0);
      const exposed = ink(s);
      mask.setOpacity(1);
      if (exposed - before > 100) witnessed.add(mask.center()[0]! < 0 ? 'first' : 'second');
    }
    await motion.frame(s, dt);
  } }).run();
  assert.deepEqual([...witnessed].sort(), ['first', 'second'], 'native knockout restores ink at both crossings');
  const findings = motion.finish();
  const covers = findings.filter(f => f.kind === 'covers');
  assert.equal(covers.length, 1, JSON.stringify(covers));
  assert.match(covers[0]!.detail, /ABCD/);
  const second = findings.filter(f => f.kind === 'occluded words');
  assert.equal(second.length, 1, JSON.stringify(second));
  assert.equal(second[0]!.path, 'second');
  assert.match(second[0]!.detail, /EFGH/);
});

test('paint order, translucency, a concave outline and a clipped foreground preserve the visible glyphs', async () => {
  for (const control of ['behind', 'translucent', 'hollow', 'mask clip', 'parent clip', 'transparent', '#2460', '#22446600']) {
    const findings = await inspect(async s => {
      const readout = label();
      const mask = control === 'hollow'
        ? new Polygon([[-3, -1.1], [3, -1.1], [3, -0.7], [-2.5, -0.7], [-2.5, 0.7], [3, 0.7], [3, 1.1], [-3, 1.1]], { fill: '#224466', stroke: 'none' })
        : plate();
      if (control === 'translucent') mask.setStyle({ fillOpacity: 0.25, stroke: '#224466', strokeOpacity: 1, strokeWidth: 0.05 });
      if (['transparent', '#2460', '#22446600'].includes(control)) mask.setStyle({ fill: control, stroke: '#224466', strokeWidth: 0.05 });
      const group = new Group(mask);
      if (control === 'mask clip') mask.clipBox = [2.5, -1, 3, 1];
      if (control === 'parent clip') group.clipBox = [2.5, -1, 3, 1];
      group.setOpacity(0);
      if (control === 'behind') s.add(group, readout);
      else s.add(readout, group);
      const before = ink(s);
      assert.ok(before > 10);
      await reveal(s, group);
      assert.ok(ink(s) >= before * 0.8, control);
    });
    assert.deepEqual(findings, [], control);
  }
});

test('hidden glyphs and off-camera labels supply no visible ink to hide', async () => {
  for (const control of ['label alpha', 'glyph alpha', 'transparent glyphs', 'glyph clip', 'camera']) {
    const findings = await inspect(async s => {
      const readout = label(), mask = plate().setOpacity(0);
      if (control === 'label alpha') readout.setOpacity(0);
      if (control === 'glyph alpha') for (const glyph of readout.children) glyph.setOpacity(0);
      if (control === 'transparent glyphs') for (const glyph of readout.children) glyph.setStyle({ fill: '#ff000000', stroke: 'none' });
      if (control === 'glyph clip') for (const glyph of readout.children) glyph.clipBox = [4, 2, 5, 3];
      if (control === 'camera') s.frame.moveTo([15, 0]);
      s.add(readout, mask);
      assert.equal(ink(s), 0);
      await reveal(s, mask);
      assert.equal(ink(s), 0);
    });
    assert.deepEqual(findings, [], control);
  }
});

test('a moving label carries its plate, a relabel crossfades, and an exact foreground copy keeps the word readable', async () => {
  for (const control of ['moving', 'crossfade', 'handoff']) {
    const findings = await inspect(async s => {
      const old = label();
      if (control === 'moving') {
        const card = new Group(plate(), old);
        s.add(card);
        await s.wait(0.1);
        await s.play(card.animate.shift([2, 0]), { runTime: 0.5 });
      } else {
        s.add(old);
        await s.wait(0.1);
        const next = new Group(plate(), label(control === 'handoff' ? 'ABCD' : 'DONE'));
        if (control === 'handoff') await s.play(new FadeIn(next), { runTime: 0.5 });
        else await s.play(new FadeOut(old), new FadeIn(next), { runTime: 0.5 });
      }
      await s.wait(0.25);
      assert.ok(ink(s) > 10);
    });
    assert.deepEqual(findings, [], control);
  }
});

test('two lost glyphs in a long label are reported even with a readable copy elsewhere', async () => {
  const findings = await inspect(async s => {
    const original = label('ABCDEFGHIJKLMN');
    const other = original.copy().shift([0, 2]);
    const left = original.children[5]!.box()![0], right = original.children[6]!.box()![2];
    const mask = new Rectangle({ width: right - left + 0.04, height: 1.2, fill: '#224466', stroke: 'none' })
      .moveTo([(left + right) / 2, 0]).setOpacity(0);
    s.add(original, other, mask);
    const before = ink(s);
    await reveal(s, mask);
    const after = ink(s);
    assert.ok(after < before && after > before * 0.8, 'only part of one copy lost ink');
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.key, 'status');
});

test('the SVG fill rule determines whether nested same-winding outlines leave the text visible', async () => {
  for (const fillRule of ['evenodd', 'nonzero'] as const) {
    const findings = await inspect(async s => {
      const mask = new VMobject({ fill: '#224466', stroke: 'none', fillRule });
      mask.setPolygon([[-3, -2], [3, -2], [3, 2], [-3, 2]]);
      mask.startNewPath([-2, -1]).addLineTo([2, -1]).addLineTo([2, 1]).addLineTo([-2, 1]).closePath();
      mask.setOpacity(0);
      s.add(label(), mask);
      const before = ink(s);
      assert.ok(before > 10);
      await reveal(s, mask);
      assert.equal(ink(s), fillRule === 'evenodd' ? before : 0);
    });
    assert.equal(findings.length, fillRule === 'evenodd' ? 0 : 1, fillRule);
  }
});

test('a curved mask follows the painted cubic edge on both sides of its chord', async () => {
  for (const covers of [false, true]) {
    const findings = await inspect(async s => {
      const edge = new VMobject({ fill: '#224466', stroke: 'none' });
      edge.startNewPath([-3, -2]).addLineTo([3, -2]);
      if (covers)
        edge.addCubic([3, 3], [-3, 3], [-3, -2]).closePath();
      else
        edge.addLineTo([3, 2]).addLineTo([-3, 2]).addLineTo([-3, -2])
          .addCubic([-3, 3], [3, 3], [3, -2]).addLineTo([-3, -2]).closePath();
      edge.setOpacity(0);
      s.add(label(), edge);
      const before = ink(s);
      assert.ok(before > 10);
      await reveal(s, edge);
      assert.equal(ink(s), covers ? 0 : before);
    });
    assert.equal(findings.length, covers ? 1 : 0, covers ? 'cubic bulge' : 'cubic cutout');
  }
});

test('a closing wipe takes the old word completely away at the new resting picture', async () => {
  const findings = await inspect(async s => {
    const old = label(), mask = plate();
    s.add(old);
    await s.wait(0.1);
    assert.ok(ink(s) > 10);
    await s.play(new Succession([
      new FadeIn(mask, { runTime: 0.3 }),
      new Transform(mask, mask.copy(), { runTime: 0.3 }),
      new FadeOut(old, { runTime: 0.3 }),
    ]));
    await s.wait(0.25);
    assert.equal(ink(s), 0);
    assert.ok(!s.familyMembers().includes(old));
  });
  assert.deepEqual(findings, []);
});

test('a later closing wipe preserves the earlier finding when the reader saw the word return', async () => {
  const visibility: boolean[] = [];
  const findings = await inspect(async s => {
    const old = label(), first = keyed(plate(), 'loose cover'), closing = keyed(plate(), 'closing page');
    s.add(old);
    await s.wait(0.1);
    await s.play(new Succession([
      new FadeIn(first, { runTime: 0.15 }),
      new Transform(first, first.copy(), { runTime: 0.25 }),
      new FadeOut(first, { runTime: 0.15 }),
      new Transform(old, old.copy(), { runTime: 0.2 }),
      new FadeIn(closing, { runTime: 0.2 }),
      new Transform(closing, closing.copy(), { runTime: 0.6 }),
      new FadeOut(old, { runTime: 0.2 }),
    ]));
    await s.wait(0.25);
  }, 30, s => {
    if (!s.currentStep) return;
    const visible = ink(s) > 10;
    if (visible !== visibility.at(-1)) visibility.push(visible);
  });
  assert.deepEqual(visibility.slice(-4), [true, false, true, false]);
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.detail, /loose cover/);
});

test('a stroke-only word remains readable around a plate that covers just its centerlines', async () => {
  for (const extendPastStroke of [false, true]) {
    const findings = await inspect(async s => {
      const word = label('II').setFill('none', 0).setStroke('#ff0000', 0.35, 1);
      const bounds = word.children.map(g => g.box()!);
      const left = Math.min(...bounds.map(b => b[0])), bottom = Math.min(...bounds.map(b => b[1]));
      const right = Math.max(...bounds.map(b => b[2])), top = Math.max(...bounds.map(b => b[3]));
      const extra = extendPastStroke ? 2.5 : 0.02;
      const mask = new Rectangle({ width: right - left + extra, height: top - bottom + extra, fill: '#224466', stroke: 'none' })
        .moveTo([(left + right) / 2, (bottom + top) / 2]).setOpacity(0);
      s.add(word, mask);
      const before = ink(s);
      assert.ok(before > 10);
      await reveal(s, mask);
      const after = ink(s);
      if (extendPastStroke) assert.equal(after, 0);
      else assert.ok(after > before * 0.5, 'most of the painted strokes remain visible outside the bare glyph boxes');
    });
    assert.equal(findings.length, extendPastStroke ? 1 : 0);
  }
});

test('nested owners report each independently hidden word, including repeated text and seeked frames', async () => {
  const redOnEachSide = (svg: string) => {
    const { pixels, width } = new Resvg(svg, { font: { loadSystemFonts: false } }).render();
    const counts = [0, 0];
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i]! > 160 && pixels[i + 1]! < 90 && pixels[i + 2]! < 90) {
        const side = (i / 4) % width < width / 2 ? 0 : 1;
        counts[side] = counts[side]! + 1;
      }
    }
    return counts;
  };
  for (const second of ['BETA', 'ALPHA']) for (const clipped of [false, true]) {
    class NestedOwners extends Scene {
      override async construct() {
        await this.step('two readouts');
        const word = (text: string, x: number) => new Text(text, { fontSize: 0.7, color: '#ff0000' }).moveTo([x, 0]);
        const detail = keyed(new Group(word(second, 2.7)), 'detail');
        const readouts = keyed(new Group(word('ALPHA', -2.7), detail), 'overview');
        const left = keyed(plate().moveTo([-2.7, 0]), 'left cover');
        const right = keyed(plate().moveTo([2.7, 0]), 'right cover');
        if (clipped) right.clipBox = [4.2, -0.5, 4.5, 0.5];
        const covers = new Group(left, right).setOpacity(0);
        this.add(readouts, covers);
        await this.wait(0.2);
        await this.play(covers.animate.setOpacity(1), { runTime: 0.2 });
        await this.wait(0.6);
        await this.play(new FadeOut(covers), { runTime: 0.2 });
        await this.wait(0.2);
      }
    }
    const detector = () => new KeyedMotionSink(() => 'two readouts');
    const replay = detector(), pictures = new Map<number, string>();
    await new NestedOwners({ async frame(scene, dt) {
      if ([2, 18, 40].includes(scene.frameCount)) pictures.set(scene.frameCount, toSvgString(scene, { width: 480 }));
      await replay.frame(scene, dt);
    } }).run();
    assert.equal(pictures.size, 3);
    const initial = redOnEachSide(pictures.get(2)!);
    assert.ok(initial[0]! > 100 && initial[1]! > 100, 'each word paints its own visible strokes');
    assert.deepEqual(redOnEachSide(pictures.get(18)!), [0, clipped ? initial[1] : 0]);
    assert.deepEqual(redOnEachSide(pictures.get(40)!), initial);
    const paths = (sink: KeyedMotionSink) => sink.finish().filter(finding => finding.kind === 'occluded words').map(finding => finding.path).sort();
    const wanted = clipped ? ['overview'] : ['overview', 'overview/detail'];
    assert.deepEqual(paths(replay), wanted);
    const sought = detector();
    for (let frame = 0; frame <= 40; frame++) {
      await renderFrame(NestedOwners, frame, { async frame(scene, dt) {
        if (pictures.has(frame)) assert.equal(toSvgString(scene, { width: 480 }), pictures.get(frame));
        await sought.frame(scene, dt);
      } });
    }
    assert.deepEqual(paths(sought), wanted);
  }
});
