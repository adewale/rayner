import { test } from 'node:test';
import type { View } from '../../../explain/index.ts';
import assert from 'node:assert/strict';
import { Rectangle, Text } from '../../../src/index.ts';
import { loadFonts, loadProject, pictureWordsAt, withIntent, withSettings, assertViewFollowsState } from '../../../explain/testing.ts';
import type { Mobject } from '../../../src/index.ts';
import { lerpColor } from '../../../src/index.ts';
import { check } from './fidelity.ts';
import PeriodicGroupsScene from './scene.ts';
import { readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { toSvgString } from '../../../src/index.ts';

const PeriodicGroupsExplainer = withIntent(PeriodicGroupsScene, readFileSync('scenes/explainers/periodic-groups/script.md', 'utf8'), 'scenes/explainers/periodic-groups/script.md');
type PeriodicGroupsExplainer = PeriodicGroupsScene;
const project = loadProject(PeriodicGroupsExplainer, 'scenes/explainers/periodic-groups');

test('retiring symbols remain above crossing cell papers while the rows stack', async () => {
  await loadFonts();
  const greenInk = (scene: PeriodicGroupsExplainer) => {
    const { pixels } = new Resvg(toSvgString(scene, { width: 1200 }), { font: { loadSystemFonts: false } }).render();
    let n = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i + 1]! > pixels[i]! + 40 && pixels[i + 1]! > pixels[i + 2]! + 40) n++;
    return n;
  };
  const victims = [
    { z: 72, mask: 73, t: 0.867 }, { z: 73, mask: 74, t: 0.9 },
    { z: 74, mask: 75, t: 0.9 }, { z: 75, mask: 76, t: 0.967 },
    { z: 76, mask: 77, t: 1 }, { z: 77, mask: 78, t: 0.967 },
    { z: 85, mask: 117, t: 1.4 }, { z: 104, mask: 105, t: 0.867 },
  ];
  for (const poison of [false, true]) {
    let observed = 0, lost = 0, began = -1;
    const checked = new Set<number>();
    const Source = withSettings(PeriodicGroupsExplainer, { element: 'na' });
    await new Source({ async frame(scene) {
      assert.ok(scene instanceof PeriodicGroupsExplainer);
      if (scene.currentStep?.name === 'stack') {
        if (began < 0) began = scene.time;
        const table = scene.table!.current;
        if (poison) {
          // Restore the former chapter paint order, without changing any geometry,
          // alpha, keys or routes: each paper follows the previous symbol.
          const alternating: Mobject[] = [];
          for (let z = 1; z <= 118; z++) {
            const paper = table.find(`periodic-cell:${z}`), word = table.find(`periodic-symbol:${z}`);
            if (paper) alternating.push(paper);
            if (word) alternating.push(word);
          }
          table.add(...alternating);
        }
        const word = table.find('periodic-symbol:72'), paper = table.find('periodic-cell:73');
        if (word && paper && scene.time - began >= 0.6 && scene.time - began <= 1) {
          const paint = word.family().map(m => ({ ...m.style }));
          word.setFill('#00ff00');
          const visible = greenInk(scene), opacity = paper.style.opacity;
          paper.setOpacity(0);
          const exposed = greenInk(scene);
          paper.setOpacity(opacity);
          word.family().forEach((m, i) => m.setStyle(paint[i]!));
          if (exposed > 20) {
            observed++;
            if (!visible) lost++;
            // The retiring run is translucent, so changing the backing can change
            // antialias colours. It must still paint substantial distinct glyph ink.
            if (!poison) assert.ok(visible >= exposed * 0.3, 'Hf retains painted glyph ink over Ta’s cell');
          }
        }
        for (const victim of victims) if (Math.abs(scene.time - began - victim.t) < 1 / (3 * scene.fps)) {
          const word = table.find(`periodic-symbol:${victim.z}`), paper = table.find(`periodic-cell:${victim.mask}`);
          assert.ok(word && paper, `the actual crossing retains symbol ${victim.z} and paper ${victim.mask}`);
          const paint = word.family().map(m => ({ ...m.style }));
          word.setFill('#00ff00');
          const visible = greenInk(scene), opacity = paper.style.opacity;
          paper.setOpacity(0);
          const exposed = greenInk(scene);
          paper.setOpacity(opacity);
          word.family().forEach((m, i) => m.setStyle(paint[i]!));
          assert.ok(exposed > 5, `removing paper ${victim.mask} exposes real symbol ${victim.z} ink`);
          if (poison) assert.ok(visible < exposed * 0.3, `old painter hides symbol ${victim.z}: ${visible}/${exposed} pixels`);
          else assert.ok(visible >= exposed * 0.3, `symbol ${victim.z} retains painted ink: ${visible}/${exposed} pixels`);
          checked.add(victim.z);
        }
      }
    } }).run();
    assert.ok(observed >= 8, 'native observations establish positive Hf ink throughout the crossing');
    assert.deepEqual([...checked].sort((a, b) => a - b), victims.map(victim => victim.z).sort((a, b) => a - b), 'all eight victims have independent native paint observations');
    if (poison) {
      assert.ok(lost >= 4, 'former paint order erases Hf for at least four native frames; removing only Ta restores it');
    } else assert.equal(lost, 0);
  }
});

test('every scenario records the model’s answers at each step', async () => {
  const { scenarios } = await project;
  assert.deepEqual(scenarios.map((v) => v.values.element), ['na', 'cl', 'fe', 'cu', 'he']);
  for (const { values, trace } of scenarios) check(trace, values);
});

test('the table and note text follow the recorded state at every resting step', async () => {
  await loadFonts();
  for (const element of ['na', 'cl', 'fe', 'cu', 'he']) {
    const Scene = withSettings(PeriodicGroupsExplainer, { element });
    assert.equal(await assertViewFollowsState(Scene, (scene) => (scene as PeriodicGroupsExplainer).table as View | null), 6, `${element}: table`);
    assert.equal(await assertViewFollowsState(Scene, (scene) => (scene as PeriodicGroupsExplainer).notes as View | null), 6, `${element}: notes`);
  }
});

test('reader descriptions match the run fills and complete block fills in every periodic-table phase', async () => {
  await loadFonts();
  // Independent table/configuration facts and authored colours, not model or renderer answers.
  // `trail`: the element's own cells, 1 to z, by block (H He Li Be ... read off the table).
  const scenarios: Array<{ element: string; symbol: string; z: number; core: number; group: number; family: Record<string, number>; trail: Record<string, number> }> = [
    { element: 'na', symbol: 'Na', z: 11, core: 10, group: 1, family: { '#133e7c': 7 }, trail: { s: 5, p: 6, d: 0 } },
    { element: 'cl', symbol: 'Cl', z: 17, core: 10, group: 17, family: { '#856912': 6 }, trail: { s: 6, p: 11, d: 0 } },
    { element: 'fe', symbol: 'Fe', z: 26, core: 18, group: 8, family: { '#9e1c2c': 4 }, trail: { s: 8, p: 12, d: 6 } },
    { element: 'cu', symbol: 'Cu', z: 29, core: 18, group: 11, family: { '#9e1c2c': 4 }, trail: { s: 8, p: 12, d: 9 } },
    { element: 'he', symbol: 'He', z: 2, core: 0, group: 18, family: { '#133e7c': 1, '#856912': 6 }, trail: { s: 2, p: 0, d: 0 } },
  ];
  // The fill step runs all 118 cells, so it paints the same block colours the stack step stacks.
  const BLOCK = { s: '#133e7c', p: '#856912', d: '#9e1c2c', f: '#0f0f0f' } as const;
  const SIZE = { s: 14, p: 36, d: 40, f: 28 } as const;
  const allBlocks = { '#133e7c': 14, '#856912': 36, '#9e1c2c': 40, '#0f0f0f': 28 };
  // The blocks step: the element's own cells solid, every other cell a pale tint of its block.
  const trailColours = (trail: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const b of ['s', 'p', 'd', 'f'] as const) {
      const own = trail[b] ?? 0;
      if (own) out[BLOCK[b]] = own;
      out[lerpColor('#f7f2e8', BLOCK[b], 0.22)] = SIZE[b] - own;
    }
    return out;
  };
  const phases = ['column', 'fill', 'stack', 'names', 'blocks', 'family'];
  let checked = 0;
  for (const expected of scenarios) {
    const Source = withSettings(PeriodicGroupsExplainer, { element: expected.element });
    const { trace } = (await project).scenario({ element: expected.element });
    const visited: string[] = [];
    await new Source({
      skipUntil: Infinity,
      async frame() {},
      async stepEnd(scene, step) {
        if (!phases.includes(step.name)) return;
        assert.ok(scene instanceof PeriodicGroupsExplainer);
        const label = `${expected.element}/${step.name}`;
        const blocks = ['stack', 'names', 'family'].includes(step.name);
        assert.equal(scene.state.note, step.name, label);
        assert.equal(scene.state.element, expected.symbol, label);
        assert.equal(scene.state.z, expected.z, label);
        assert.equal(scene.state.group, expected.group, label);
        assert.equal(scene.state.lit, step.name === 'column' ? undefined : step.name === 'family' ? expected.z : 118, label);
        assert.equal(scene.state.core, ['column', 'fill', 'stack', 'names'].includes(step.name) ? undefined : expected.core, label);
        assert.equal(Boolean(scene.state.blocks), blocks, label);
        const colours = step.name === 'column' ? { '#f7f2e8': 118 } : step.name === 'family' ? expected.family
          : step.name === 'blocks' ? trailColours(expected.trail) : allBlocks;
        const table = (scene as PeriodicGroupsExplainer).table!.current.family();
        const cells = table.filter((m): m is Rectangle => m instanceof Rectangle && m.style.fill !== 'none');
        assert.equal(cells.length, Object.values(colours).reduce((sum, n) => sum + n, 0), `${label}: complete cell inventory`);
        const fills: Record<string, number> = {};
        for (const cell of cells) {
          assert.equal(cell.style.fillOpacity, 1, `${label}: solid cell fill`);
          assert.ok(cell.style.opacity >= 0.95, `${label}: visible cell`);
          fills[cell.style.fill] = (fills[cell.style.fill] ?? 0) + 1;
        }
        assert.deepEqual(fills, colours, `${label}: actual table fill counts`);
        // The strip under the table gives the run widths unnamed in stack, and names them from blocks on.
        // The fill step has no table yet, so no strip: its rows end in their lengths instead.
        const words = table.filter((m): m is Text => m instanceof Text).map((t) => t.text);
        if (step.name === 'fill') {
          assert.ok(!words.some((w) => /columns/.test(w)), `${label}: no column strip before the table exists`);
          const said = (scene as PeriodicGroupsExplainer).notes!.current.family()
            .filter((m): m is Text => m instanceof Text).map((t) => t.text);
          assert.deepEqual(said.filter((w) => w.startsWith('= ')), ['= 2', '= 8', '= 8', '= 18', '= 18', '= 32', '= 32'], `${label}: row lengths`);
          for (const w of ['run of 2', 'run of 6', 'run of 10', 'run of 14']) assert.ok(said.includes(w), `${label}: legend ${w}`);
        }
        if (step.name === 'stack') {
          for (const w of ['2', '10', '6', '14', 'Columns in each run']) assert.ok(words.includes(w), `${label}: ${w}`);
          assert.ok(!words.some((w) => /^[spdf]: /.test(w)), `${label}: no block named before the blocks step`);
          assert.equal(table.filter(m => m instanceof Rectangle && m.style.dashArray).length, 0, `${label}: no dashed row guides in the schematic`);
        }
        if (step.name === 'names' || step.name === 'blocks')
          for (const w of ['s: 2 columns', 'd: 10 columns', 'p: 6 columns', 'f: 14 columns,']) assert.ok(words.includes(w), `${label}: ${w}`);
        const pictured = pictureWordsAt(trace, step.name);
        for (const description of [pictured.summary, pictured.full]) {
          assert.ok(description.length > 0, `${label}: reader description exists`);
          if (step.name === 'stack') {
            assert.match(description, /unlabelled 118-cell block schematic/i, label);
            assert.doesNotMatch(description, /dashed outline/i, label);
          }
          if (step.name === 'stack' || step.name === 'names') {
            assert.ok(description.includes('All 118 element cells are filled in by block colour.'), label);
            assert.ok(!description.includes('Cells 1 to'), `${label}: no partial-fill claim`);
          } else if (step.name === 'blocks') {
            assert.ok(description.includes(`’s ${expected.z} cell${expected.z > 1 ? 's are' : ' is'} solid in block colour; the other ${118 - expected.z} are pale.`), label);
            assert.ok(!description.includes('Cells 1 to') && !description.includes('All 118 element cells'), `${label}: no whole-table fill claim`);
          } else if (step.name === 'fill') {
            assert.ok(description.includes('Cells 1 to 118 are filled in order'), label);
            assert.ok(!description.includes('All 118 element cells'), `${label}: no complete-block claim`);
          } else {
            assert.ok(!description.includes('Cells 1 to') && !description.includes('All 118 element cells'), label);
          }
          // No phase paints a paler core any more, so none may describe one.
          assert.ok(!description.includes('paler as the core'), `${label}: core shading is never claimed`);
        }
        visited.push(step.name); checked++;
      },
    }).run();
    assert.deepEqual(visited, phases, `${expected.element}: complete phase inventory`);
  }
  assert.equal(checked, 30);
});

test('the opening comparison and the answer note show the independently expected family, jumps and landing columns', async () => {
  await loadFonts();
  // Finite expectations from the table and caption subjects, not the scene's
  // model or its renderer. A correct trace must not excuse a wrong painted value.
  const families: Record<string, { members: readonly (readonly [string, number])[]; jumps: readonly number[] }> = {
    na: { members: [['H', 1], ['Li', 3], ['Na', 11], ['K', 19], ['Rb', 37], ['Cs', 55], ['Fr', 87]], jumps: [2, 8, 8, 18, 18, 32] },
    cl: { members: [['F', 9], ['Cl', 17], ['Br', 35], ['I', 53], ['At', 85], ['Ts', 117]], jumps: [8, 18, 18, 32, 32] },
    fe: { members: [['Fe', 26], ['Ru', 44], ['Os', 76], ['Hs', 108]], jumps: [18, 32, 32] },
    cu: { members: [['Cu', 29], ['Ag', 47], ['Au', 79], ['Rg', 111]], jumps: [18, 32, 32] },
    he: { members: [['He', 2], ['Ne', 10], ['Ar', 18], ['Kr', 36], ['Xe', 54], ['Rn', 86], ['Og', 118]], jumps: [8, 8, 18, 18, 32, 32] },
  };
  // The old count step's answers, now said beside the table in the blocks step: each scenario's
  // configuration and the column its last electron lands in, top to bottom.
  const landings: Record<string, readonly string[]> = {
    na: ['Sodium: 1s² 2s² 2p⁶ 3s¹', '3s¹ starts a run of 2: s column 1, group 1.'],
    cl: ['Chlorine: 1s² 2s² 2p⁶ 3s² 3p⁵', '5th p column, after 2 s and 10 d: 2 + 10 + 5 = 17.', 'Its 7 after neon alone would say 7: 10 short.'],
    fe: ['Iron: 1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d⁶', '6th d column, after 2 s: 2 + 6 = 8.'],
    cu: ['Filling rule: [Ar] 4s² 3d⁹, so 2 + 9 = 11.', 'NIST lists [Ar] 3d¹⁰ 4s¹: still 11 after [Ar].'],
    he: ['Helium: 1s², column 2 by its run (He?),', 'but 1s² fills shell 1, as 2s² 2p⁶ fills neon’s shell 2.'],
  };
  // The stack step's note: where the last electron lands, counted in unnamed run widths.
  const stacked: Record<string, string> = {
    na: 'Sodium: column 1',
    cl: 'Chlorine: column 17',
    fe: 'Iron: column 8',
    cu: 'Copper: column 11',
    he: 'Helium: column 2',
  };
  let steps = 0, members = 0, jumps = 0, lines = 0, ghosts = 0, stacks = 0;
  for (const [element, expected] of Object.entries(families)) {
    const Source = withSettings(PeriodicGroupsExplainer, { element });
    const visited: string[] = [];
    await new Source({
      skipUntil: Infinity,
      async frame() {},
      async stepEnd(scene, step) {
        if (!['column', 'stack', 'blocks'].includes(step.name)) return;
        const picture = (scene as PeriodicGroupsExplainer).notes!.current;
        const parts = picture.family();
        const one = (key: string): Mobject => {
          const found = parts.filter((m) => m.key === key);
          assert.equal(found.length, 1, `${element}/${step.name}: exactly one ${key}`);
          return found[0]!;
        };
        const text = (part: Mobject, value: string): Text => {
          assert.ok(part instanceof Text);
          assert.equal(part.text, value, `${element}/${step.name}: ${part.key ?? value}`);
          const box = part.box()!;
          assert.ok(box[2] > box[0] && box[3] > box[1] && part.style.opacity >= 0.95,
            `${element}/${step.name}: ${value} is visible text`);
          return part;
        };
        const words = (value: string, within: Mobject[] = parts): Text => {
          const found = within.filter((m) => m instanceof Text && m.text === value);
          assert.equal(found.length, 1, `${element}/${step.name}: exactly one ${value}`);
          return text(found[0]!, value);
        };
        if (step.name === 'stack') {
          words(stacked[element]!);
          // Stacking puts helium's run of 2 at the left, so helium sits over beryllium until blocks moves it.
          const table = (scene as PeriodicGroupsExplainer).table!.current.family();
          const cell = (z: number) => {
            const found = table.find(m => m.key === `periodic-cell:${z}`);
            assert.ok(found instanceof Rectangle, `schematic retains cell ${z}`);
            return found;
          };
          const he = cell(2), be = cell(4), ne = cell(10);
          assert.ok(Math.abs(he.center()[0] - be.center()[0]) < 0.05 && he.center()[1] > be.center()[1], `${element}: helium over beryllium`);
          assert.ok(Math.abs(he.center()[0] - ne.center()[0]) > 1, `${element}: helium not yet over neon`);
          stacks++;
        } else if (step.name === 'column') {
          assert.equal(picture.key, 'periodic-family-comparison');
          const keys = (prefix: string) => parts.filter((m) => m.key?.startsWith(prefix) && !m.key.slice(prefix.length).includes(':')).map((m) => m.key);
          assert.deepEqual(keys('periodic-member:'), expected.members.map(([symbol]) => `periodic-member:${symbol}`));
          const expectedJumps = expected.members.slice(1).map(([symbol], i) => `periodic-jump:${expected.members[i]![0]}:${symbol}`);
          assert.deepEqual(parts.filter((m) => m.key?.startsWith('periodic-jump:')).map((m) => m.key), expectedJumps);
          let previousX = -Infinity;
          expected.members.forEach(([symbol, z], i) => {
            const name = text(one(`periodic-member:${symbol}:symbol`), symbol);
            const number = text(one(`periodic-member:${symbol}:atomic-number`), String(z));
            assert.ok(Math.abs(name.center()[0] - number.center()[0]) < 1e-4 && name.center()[1] > number.center()[1],
              `${symbol}: atomic number stays with its element`);
            assert.ok(name.center()[0] > previousX, `${symbol}: family follows periodic order`);
            if (i) {
              const jump = text(one(expectedJumps[i - 1]!), `+${expected.jumps[i - 1]}`);
              assert.ok(jump.center()[0] > previousX && jump.center()[0] < name.center()[0], `${symbol}: jump lies between its endpoints`);
              jumps++;
            }
            previousX = name.center()[0]; members++;
          });
        } else {
          let previousY = words('2 + 10 + 6 = 18 numbered columns').center()[1];
          for (const line of landings[element]!) {
            const said = words(line);
            assert.ok(said.center()[1] < previousY, `${element}: ${line} reads below the line before it`);
            previousY = said.center()[1]; lines++;
          }
          // Helium's run alone would put it in column 2: the dashed He? cell sits over beryllium.
          const table = (scene as PeriodicGroupsExplainer).table!.current.family();
          const ghost = table.filter((m) => m instanceof Text && m.text === 'He?');
          assert.equal(ghost.length, element === 'he' ? 1 : 0, `${element}: He? only in helium's case`);
          if (ghost.length) {
            const be = words('Be', table);
            assert.ok(Math.abs(ghost[0]!.center()[0] - be.center()[0]) < 0.05 && ghost[0]!.center()[1] > be.center()[1],
              'He? sits directly over beryllium');
            ghosts++;
          }
          // From the blocks step on, the table puts helium over neon.
          const he = words('He', table), ne = words('Ne', table);
          assert.ok(Math.abs(he.center()[0] - ne.center()[0]) < 0.05 && he.center()[1] > ne.center()[1], `${element}: helium over neon`);
        }
        visited.push(step.name); steps++;
      },
    }).run();
    assert.deepEqual(visited, ['column', 'stack', 'blocks']);
  }
  assert.equal(steps, 15); assert.equal(members, 28); assert.equal(jumps, 23);
  assert.equal(lines, 11); assert.equal(ghosts, 1); assert.equal(stacks, 5);
});
