// Reader evidence that label-size checks cannot establish: routes behind words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Resvg } from '@resvg/resvg-js';
import { toSvgString } from '../src/output.ts';
import { labelOf } from '../explain/diagrams.ts';
import { toView } from '../app/embed-closeup.ts';
import { collectProject } from '../tools/lib/explain-project.ts';

test('route and chart annotations leave the expected paper visible behind their lettering', async () => {
  const cases: [string, string, string[], Record<string, string>, number[]][] = [
    ['lantern', 'objects', ['owns', 'plays', 'emits'], {}, [247, 245, 239]],
    ['mr-cache', 'after', ['hit', 'miss'], {}, [247, 245, 239]],
    ['mr-cache', 'request', ['hit', 'miss'], {}, [247, 245, 239]],
    ['seasons', 'year', ['60 days', '61 days at 0 h'], {place: 'tromso'}, [26, 27, 38]],
    ['seasons', 'distance', ['0.0 h'], {place: 'tromso'}, [26, 27, 38]],
  ];
  for (const [id, stepName, words, settings, paper] of cases) {
    const project = await collectProject(`scenes/explainers/${id}`, { write: false });
    const scenarios = project.scenarios.filter((v) => Object.entries(settings).every(([k, value]) => v.values[k] === value));
    assert.ok(scenarios.length > 0, `${id}: the named scenario must exist`);
    for (const scenario of scenarios) {
      let checked = 0;
      await new scenario.Scene({
        async frame() {},
        async stepEnd(scene, step) {
          if (step.name !== stepName) return;
          const labels = scene.familyMembers().filter((m) => words.includes(labelOf(m)?.text ?? ''));
          assert.equal(labels.length, words.length, `${id}: all expected edge labels exist`);
          // Remove only glyphs: if the route draws through the label's interior,
          // its ink is now visible. This checks rendered pixels, not plate metadata.
          const boxes = labels.map((m) => toView(m.box()!, scene.frame.box()!));
          const opaque = labels.map((m) => m.family().every((f) => f.style.opacity >= 0.95));
          for (const [i, full] of opaque.entries()) if (!full)
            assert.ok(id === 'mr-cache' && stepName === 'request', 'only the deliberately dimmed cache diagram uses the light-context bound');
          const children = labels.map((m) => m.children);
          labels.forEach((m) => { m.children = []; });
          let svg: string;
          try { svg = toSvgString(scene, { width: 1280 }); }
          finally { labels.forEach((m, i) => { m.children = children[i]!; }); }
          const image = new Resvg(svg, { font: { loadSystemFonts: false } }).render();
          const pixels = image.pixels;
          if (id === 'lantern') {
            let trail = 0;
            for (let i = 0; i < pixels.length; i += 4)
              if (pixels[i]! > 180 && pixels[i + 1]! < 120 && pixels[i + 2]! < 80) trail++;
            assert.ok(trail > 500, 'the orange trail must remain visible outside the words');
          }
          for (const [i, b] of boxes.entries()) {
            let samples = 0;
            for (let y = Math.ceil((4.5 - b[3]) * 80 + 1); y < (4.5 - b[1]) * 80 - 1; y++)
              for (let x = Math.ceil((b[0] + 8) * 80 + 1); x < (b[2] + 8) * 80 - 1; x++) {
                const at = (y * image.width + x) * 4;
                const rgb = [...pixels.subarray(at, at + 3)];
                if (opaque[i]) assert.deepEqual(rgb, paper, `${id}/${stepName}/${words[i]}: route ink or wrong paper under label at ${x},${y}`);
                else assert.ok(Math.min(...rgb) > 200, 'dimmed context retains its light background rather than dark route ink');
                samples++;
              }
            assert.ok(samples > 10, 'a nonempty label interior was sampled');
            checked++;
          }
        },
      }, { skipUntil: Infinity }).run();
      assert.equal(checked, words.length);
    }
  }
});
