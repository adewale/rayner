import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SYMBOLS, POSITIONS, NIST_EXCEPTIONS, NIST_UP_TO, GROUP_NAMES,
  predicted, listed, counted, position, membersOf, gaps, periodLength, configText, shorthand, symbolOf,
} from '../scenes/explainers/lib/periodic-groups.ts';
import type { Subshell } from '../scenes/explainers/lib/periodic-groups.ts';
import { loadFonts, Rectangle, Text } from '../src/index.ts';
import type { View, Mobject } from '../src/index.ts';
import { withSettings } from '../explain/index.ts';
import { pictureHtml, pictureSummary } from '../explain/trace.ts';
import { collectProject } from '../tools/lib/explain-project.ts';
import { assertViewFollowsState } from './lib/view-fidelity.ts';
import { check } from './lib/fidelity/periodic-groups.ts';
import PeriodicGroupsExplainer from '../scenes/explainers/periodic-groups/scene.ts';

// The 18-column table with Sc, Y, Lu and Lr in group 3 (the arrangement Wikipedia's
// Group article reports IUPAC endorsed in 1988 and 2021), typed row by row and
// independent of the model's rules. IUPAC's own published table still draws the f
// rows as La-Lu and Ac-Lr; many textbooks put La and Ac in group 3. '.' is an empty
// column; the f rows here are La-Yb and Ac-No, which have no group number.
const TABLE_ROWS = [
  'H  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  He',
  'Li Be .  .  .  .  .  .  .  .  .  .  B  C  N  O  F  Ne',
  'Na Mg .  .  .  .  .  .  .  .  .  .  Al Si P  S  Cl Ar',
  'K  Ca Sc Ti V  Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr',
  'Rb Sr Y  Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I  Xe',
  'Cs Ba Lu Hf Ta W  Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn',
  'Fr Ra Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og',
].map((row) => row.split(/\s+/));
const F_ROWS = [
  'La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb',
  'Ac Th Pa U  Np Pu Am Cm Bk Cf Es Fm Md No',
].map((row) => row.split(/\s+/));

const NIST = JSON.parse(readFileSync(new URL('./fixtures/periodic-groups/nist-ground.json', import.meta.url), 'utf8')) as {
  elements: Record<string, { symbol: string; configuration: string }>;
};
const asText = (config: readonly Subshell[]) =>
  [...config].sort((a, b) => a.n - b.n || 'spdf'.indexOf(a.l) - 'spdf'.indexOf(b.l)).map((s) => `${s.n}${s.l}${s.electrons}`).join(' ');

test('the chosen table holds each of the 118 elements once', () => {
  const placed = [...TABLE_ROWS.flat(), ...F_ROWS.flat()].filter((s) => s !== '.');
  assert.equal(placed.length, 118);
  assert.deepEqual([...placed].sort(), [...SYMBOLS].sort());
});

test('every computed position matches the chosen table: period, group and f-block column', () => {
  let checked = 0;
  TABLE_ROWS.forEach((row, r) =>
    row.forEach((symbol, c) => {
      if (symbol === '.') return;
      const p = POSITIONS.find((x) => x.symbol === symbol)!;
      assert.deepEqual({ period: p.period, group: p.group, fColumn: p.fColumn }, { period: r + 1, group: c + 1, fColumn: null }, symbol);
      checked++;
    }),
  );
  F_ROWS.forEach((row, r) =>
    row.forEach((symbol, c) => {
      const p = POSITIONS.find((x) => x.symbol === symbol)!;
      assert.deepEqual({ period: p.period, group: p.group, fColumn: p.fColumn, block: p.block }, { period: r + 6, group: null, fColumn: c + 1, block: 'f' }, symbol);
      checked++;
    }),
  );
  assert.equal(checked, 118);
});

test('only helium and the period 2 and 3 p block need more than the electron count to find their column', () => {
  const adjusted = POSITIONS.filter((p) => p.adjustment !== 'none');
  assert.deepEqual(adjusted.filter((p) => p.adjustment === 'closed shell').map((p) => p.symbol), ['He']);
  assert.deepEqual(adjusted.filter((p) => p.adjustment === 'no d subshell yet').map((p) => p.symbol), ['B', 'C', 'N', 'O', 'F', 'Ne', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar']);
  const he = position(2);
  assert.equal(he.count, 2, 'helium has two s electrons, which would count to group 2');
  assert.equal(he.group, 18);
  assert.equal(position(17).count, 7);
  assert.equal(position(17).group, 17);
});

test('the model reproduces every NIST ground configuration, elements 1 to 108', () => {
  assert.equal(Object.keys(NIST.elements).length, NIST_UP_TO);
  for (let z = 1; z <= NIST_UP_TO; z++) {
    const nist = NIST.elements[String(z)]!;
    assert.equal(nist.symbol, symbolOf(z));
    assert.equal(asText(listed(z)), nist.configuration, `${symbolOf(z)} (${z})`);
  }
});

test('the stored exceptions are exactly the elements where NIST differs from the filling rule', () => {
  const differs = [];
  for (let z = 1; z <= NIST_UP_TO; z++)
    if (asText(predicted(z)) !== NIST.elements[String(z)]!.configuration) differs.push(z);
  assert.deepEqual(differs, Object.keys(NIST_EXCEPTIONS).map(Number));
  assert.equal(differs.length, 20);
});

test('NIST configurations keep the group count of every d-block exception', () => {
  // Chromium, copper, palladium, gold and the rest move an s electron into d or back:
  // the s + d total beyond the core, and so the column, is unchanged.
  for (const z of Object.keys(NIST_EXCEPTIONS).map(Number)) {
    const p = position(z);
    if (p.block === 'f') continue;
    assert.equal(counted(listed(z), z), p.group, symbolOf(z));
  }
  assert.equal(shorthand(predicted(29), 29), '[Ar] 4s² 3d⁹');
  assert.equal(shorthand(listed(29), 29), '[Ar] 3d¹⁰ 4s¹');
});

test('down a group, each jump in atomic number is one whole period', () => {
  for (let g = 1; g <= 18; g++) {
    const members = membersOf(g);
    gaps(g).forEach((gap, i) => {
      const upper = members[i]!, lower = members[i + 1]!;
      // From the s block the next member is the rest of this period away; from the
      // d and p blocks, it is as far as the next period is long.
      assert.equal(gap, periodLength(upper.block === 's' && upper.group! <= 2 ? upper.period : lower.period), `group ${g}`);
    });
  }
  assert.deepEqual(gaps(1), [2, 8, 8, 18, 18, 32]);
  assert.deepEqual(gaps(17), [8, 18, 18, 32, 32]);
});

test('group names follow the IUPAC 1 to 18 order with the CAS and old IUPAC letters', () => {
  assert.deepEqual(GROUP_NAMES.map((g) => g.group), Array.from({ length: 18 }, (_, i) => i + 1));
  const at = (g: number) => GROUP_NAMES[g - 1]!;
  assert.deepEqual([at(1).cas, at(1).oldIupac], ['IA', 'IA']);
  assert.deepEqual([at(3).cas, at(3).oldIupac], ['IIIB', 'IIIA']);
  assert.deepEqual([at(17).cas, at(17).oldIupac, at(17).trivial], ['VIIA', 'VIIB', 'halogens']);
  assert.deepEqual([at(18).cas, at(18).oldIupac, at(18).trivial], ['VIIIA', '0', 'noble gases']);
  assert.equal(configText(predicted(11)), '1s² 2s² 2p⁶ 3s¹');
});

test('every case records the model’s answers at each step', async () => {
  const project = await collectProject('scenes/explainers/periodic-groups', { write: false });
  assert.deepEqual(project.variants.map((v) => v.values.element), ['na', 'cl', 'fe', 'cu', 'he']);
  for (const { values, trace } of project.variants) check(trace, values);
});

test('the table and note text follow the recorded state at every resting step', async () => {
  await loadFonts();
  for (const element of ['na', 'cl', 'fe', 'cu', 'he']) {
    const Scene = withSettings(PeriodicGroupsExplainer, { element });
    assert.equal(await assertViewFollowsState(Scene, (scene) => (scene as PeriodicGroupsExplainer).table as View | null), 7, `${element}: table`);
    assert.equal(await assertViewFollowsState(Scene, (scene) => (scene as PeriodicGroupsExplainer).notes as View | null), 7, `${element}: notes`);
  }
});

test('reader descriptions match core shading and complete block fills in every periodic-table phase', async () => {
  await loadFonts();
  // Independent table/configuration facts and authored colours, not model or renderer answers.
  const cases: Array<{
    element: string; symbol: string; z: number; core: number; group: number;
    fill: Record<string, number>; count: Record<string, number>; family: Record<string, number>;
  }> = [
    { element: 'na', symbol: 'Na', z: 11, core: 10, group: 1,
      fill: { '#133e7c': 5, '#856912': 6, '#f7f2e8': 107 },
      count: { '#c5cad0': 4, '#ded4b9': 6, '#133e7c': 1, '#f7f2e8': 107 },
      family: { '#133e7c': 7 } },
    { element: 'cl', symbol: 'Cl', z: 17, core: 10, group: 17,
      fill: { '#133e7c': 6, '#856912': 11, '#f7f2e8': 101 },
      count: { '#c5cad0': 4, '#ded4b9': 6, '#133e7c': 2, '#856912': 5, '#f7f2e8': 101 },
      family: { '#856912': 6 } },
    { element: 'fe', symbol: 'Fe', z: 26, core: 18, group: 8,
      fill: { '#133e7c': 8, '#856912': 12, '#9e1c2c': 6, '#f7f2e8': 92 },
      count: { '#c5cad0': 6, '#ded4b9': 12, '#133e7c': 2, '#9e1c2c': 6, '#f7f2e8': 92 },
      family: { '#9e1c2c': 4 } },
    { element: 'cu', symbol: 'Cu', z: 29, core: 18, group: 11,
      fill: { '#133e7c': 8, '#856912': 12, '#9e1c2c': 9, '#f7f2e8': 89 },
      count: { '#c5cad0': 6, '#ded4b9': 12, '#133e7c': 2, '#9e1c2c': 9, '#f7f2e8': 89 },
      family: { '#9e1c2c': 4 } },
    { element: 'he', symbol: 'He', z: 2, core: 0, group: 18,
      fill: { '#133e7c': 2, '#f7f2e8': 116 },
      count: { '#133e7c': 2, '#f7f2e8': 116 },
      family: { '#133e7c': 1, '#856912': 6 } },
  ];
  const allBlocks = { '#133e7c': 14, '#856912': 36, '#9e1c2c': 40, '#0f0f0f': 28 };
  const phases = ['column', 'fill', 'count', 'blocks', 'family', 'names', 'limit'];
  let checked = 0;
  for (const expected of cases) {
    const Source = withSettings(PeriodicGroupsExplainer, { element: expected.element });
    const visited: string[] = [];
    await new Source({
      async frame() {},
      async stepEnd(scene, step) {
        if (!phases.includes(step.name)) return;
        const label = `${expected.element}/${step.name}`;
        const blocks = ['blocks', 'family', 'names', 'limit'].includes(step.name);
        assert.equal(scene.state.note, step.name, label);
        assert.equal(scene.state.element, expected.symbol, label);
        assert.equal(scene.state.z, expected.z, label);
        assert.equal(scene.state.group, expected.group, label);
        assert.equal(scene.state.lit, step.name === 'column' ? undefined : expected.z, label);
        assert.equal(scene.state.core, ['column', 'fill'].includes(step.name) ? undefined : expected.core, label);
        assert.equal(Boolean(scene.state.blocks), blocks, label);
        const colours = step.name === 'column' ? { '#f7f2e8': 118 }
          : step.name === 'fill' ? expected.fill : step.name === 'count' ? expected.count
            : step.name === 'family' ? expected.family : allBlocks;
        const cells = (scene as PeriodicGroupsExplainer).table!.current.family()
          .filter((m): m is Rectangle => m instanceof Rectangle && m.style.fill !== 'none');
        assert.equal(cells.length, Object.values(colours).reduce((sum, n) => sum + n, 0), `${label}: complete cell inventory`);
        const fills: Record<string, number> = {};
        for (const cell of cells) {
          assert.equal(cell.style.fillOpacity, 1, `${label}: solid cell fill`);
          assert.ok(cell.style.opacity >= 0.95, `${label}: visible cell`);
          fills[cell.style.fill] = (fills[cell.style.fill] ?? 0) + 1;
        }
        assert.deepEqual(fills, colours, `${label}: actual table fill counts`);
        const state = scene.describe();
        for (const description of [pictureSummary(state), pictureHtml(state)]) {
          assert.ok(description.length > 0, `${label}: reader description exists`);
          if (blocks && step.name !== 'family') {
            assert.ok(description.includes('All 118 element cells are filled in by block colour.'), label);
            assert.ok(!description.includes('Cells 1 to'), `${label}: no partial-fill claim`);
          } else if (['fill', 'count'].includes(step.name)) {
            assert.ok(description.includes(`Cells 1 to ${expected.z} are filled in by subshell colour`), label);
            assert.ok(!description.includes('All 118 element cells'), `${label}: no complete-block claim`);
          } else {
            assert.ok(!description.includes('Cells 1 to') && !description.includes('All 118 element cells'), label);
          }
          assert.equal(description.includes('paler as the core'), step.name === 'count' && expected.core > 0,
            `${label}: core shading is described only while it is painted`);
          if (step.name === 'count' && expected.core > 0)
            assert.ok(description.includes(`cells 1 to ${expected.core} paler as the core`), label);
        }
        visited.push(step.name); checked++;
      },
    }, { skipUntil: Infinity }).run();
    assert.deepEqual(visited, phases, `${expected.element}: complete phase inventory`);
  }
  assert.equal(checked, 35);
});

test('each boundary spotlight visibly encloses its named element cell', async () => {
  await loadFonts();
  // These subjects come from the five boundary captions, independently of the
  // model, scene state and View renderer. Text equality cannot prove an outline.
  const expected = {
    na: ['H'], cl: ['Ts'], fe: ['Fe', 'Co', 'Ni'], cu: ['Rg'], he: ['He', 'Be'],
  } as const;
  let steps = 0, checked = 0;
  for (const [element, symbols] of Object.entries(expected)) {
    const Source = withSettings(PeriodicGroupsExplainer, { element });
    await new Source({
      async frame() {},
      async stepEnd(scene, step) {
        if (step.name !== 'limit') return;
        const table = (scene as PeriodicGroupsExplainer).table!;
        const family = table.current.family();
        const outlines = family.filter((m) => m.key?.startsWith('periodic-limit:'));
        assert.deepEqual(outlines.map((m) => m.key).sort(),
          symbols.map((symbol) => `periodic-limit:${symbol}`).sort(), `${element}: complete boundary spotlight inventory`);
        const labels = family.filter((m): m is Text => m instanceof Text && (SYMBOLS as readonly string[]).includes(m.text));
        assert.equal(labels.length, 118, `${element}: complete element-label inventory`);
        for (const symbol of symbols) {
          const outline = outlines.find((m) => m.key === `periodic-limit:${symbol}`)!;
          assert.ok(outline instanceof Rectangle, `${element}/${symbol}: spotlight is a rectangle`);
          const named = labels.filter((m) => m.text === symbol);
          assert.equal(named.length, 1, `${element}/${symbol}: exactly one element label`);
          const label = named[0]!, labelBox = label.box()!, box = outline.box()!;
          const contains = (outer: readonly number[], inner: readonly number[]) =>
            outer[0]! <= inner[0]! && outer[1]! <= inner[1]! && outer[2]! >= inner[2]! && outer[3]! >= inner[3]!;
          const cells = family.filter((m): m is Rectangle => m instanceof Rectangle && !outlines.includes(m) &&
            m.width() < 1 && m.height() < 1 && contains(m.box()!, labelBox));
          assert.equal(cells.length, 1, `${element}/${symbol}: one cell contains the complete symbol`);
          const cell = cells[0]!, cellBox = cell.box()!;
          assert.ok(contains(box, cellBox), `${element}/${symbol}: outline encloses the element cell`);
          for (const axis of [0, 1] as const)
            assert.ok(Math.abs(outline.center()[axis] - cell.center()[axis]) < 1e-4,
              `${element}/${symbol}: outline is centered on the element cell`);
          assert.ok(outline.width() > cell.width() + 0.05 && outline.width() < cell.width() + 0.2 &&
            outline.height() > cell.height() + 0.05 && outline.height() < cell.height() + 0.2,
            `${element}/${symbol}: spotlight closely surrounds one cell`);
          for (const other of labels.filter((m) => m !== label))
            assert.ok(!contains(box, other.box()!), `${element}/${symbol}: spotlight must not enclose ${other.text}`);
          const style = outline.style;
          assert.equal(style.fill, 'none', `${element}/${symbol}: outline leaves the element visible`);
          assert.notEqual(style.stroke, 'none', `${element}/${symbol}: outline has a stroke colour`);
          assert.ok(style.strokeWidth > 0 && style.strokeOpacity >= 0.95 && style.opacity >= 0.95 &&
            (style.drawFraction ?? 1) >= 0.95, `${element}/${symbol}: outline has complete visible stroke`);
          const dashes = (style.dashArray ?? '').trim().split(/[\s,]+/).map(Number);
          assert.ok(dashes.length >= 2 && dashes.every((n) => Number.isFinite(n) && n > 0),
            `${element}/${symbol}: outline has visible dashes and gaps`);
          checked++;
        }
        steps++;
      },
    }, { skipUntil: Infinity }).run();
  }
  assert.equal(steps, 5);
  assert.equal(checked, 8);
});

test('compact comparisons show the independently expected family, jumps and electron counts', async () => {
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
  const rows: Record<string, readonly (readonly [string, number, number])[]> = {
    na: [['Na', 1, 1]],
    cl: [['Na', 1, 1], ['Mg', 2, 2], ['Al', 3, 13], ['Si', 4, 14], ['P', 5, 15], ['S', 6, 16], ['Cl', 7, 17]],
    fe: [['K', 1, 1], ['Ca', 2, 2], ['Sc', 3, 3], ['Ti', 4, 4], ['V', 5, 5], ['Cr', 6, 6], ['Mn', 7, 7], ['Fe', 8, 8]],
  };
  const verdicts: Record<string, string> = {
    na: '1 counted = group 1', cl: '7 counted ≠ group 17', fe: '8 counted = group 8',
    cu: '11 counted either way = group 11', he: '2 counted ≠ group 18',
  };
  const coreEquations: Record<string, string> = { na: '11 - 10 = 1', cl: '17 - 10 = 7', fe: '26 - 18 = 8' };
  let steps = 0, members = 0, jumps = 0, matrixRows = 0, equations = 0, configurations = 0, heliumPairs = 0;
  for (const [element, expected] of Object.entries(families)) {
    const Source = withSettings(PeriodicGroupsExplainer, { element });
    const visited: string[] = [];
    await new Source({
      async frame() {},
      async stepEnd(scene, step) {
        if (!['column', 'count'].includes(step.name)) return;
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
        const words = (value: string): Text => {
          const found = parts.filter((m) => m instanceof Text && m.text === value);
          assert.equal(found.length, 1, `${element}/${step.name}: exactly one ${value}`);
          return text(found[0]!, value);
        };
        const keys = (prefix: string) => parts.filter((m) => m.key?.startsWith(prefix) && !m.key.slice(prefix.length).includes(':')).map((m) => m.key);
        if (step.name === 'column') {
          assert.equal(picture.key, 'periodic-family-comparison');
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
          assert.equal(picture.key, 'periodic-count-comparison');
          words(verdicts[element]!);
          if (rows[element]) {
            text(one('periodic-core-equation'), coreEquations[element]!); equations++;
            const expectedRows = rows[element]!;
            assert.deepEqual(keys('periodic-count:'), expectedRows.map(([symbol]) => `periodic-count:${symbol}`));
            let previousX = -Infinity;
            for (const [symbol, count, group] of expectedRows) {
              const name = text(one(`periodic-count:${symbol}:symbol`), symbol);
              const counted = text(one(`periodic-count:${symbol}:count`), String(count));
              const column = text(one(`periodic-count:${symbol}:group`), String(group));
              assert.ok(name.center()[0] > previousX && Math.abs(name.center()[0] - counted.center()[0]) < 1e-4 &&
                Math.abs(name.center()[0] - column.center()[0]) < 1e-4 && name.center()[1] > counted.center()[1] && counted.center()[1] > column.center()[1],
                `${symbol}: element, count and column stay aligned in periodic order`);
              previousX = name.center()[0]; matrixRows++;
            }
          } else if (element === 'cu') {
            const predicted = words('[Ar] 4s² 3d⁹'), listed = words('[Ar] 3d¹⁰ 4s¹');
            assert.ok(predicted.center()[1] > listed.center()[1]);
            assert.ok(Math.abs(predicted.center()[1] - words('Filling rule:').center()[1]) < 1e-4);
            assert.ok(Math.abs(listed.center()[1] - words('NIST lists:').center()[1]) < 1e-4);
            configurations += 2;
          } else {
            assert.equal(element, 'he');
            assert.deepEqual(keys('periodic-helium:'), ['periodic-helium:2', 'periodic-helium:18']);
            let previousX = -Infinity;
            for (const [group, upper, lower] of [[2, 'He?', 'Be'], [18, 'He', 'Ne']] as const) {
              const prefix = `periodic-helium:${group}`;
              const top = text(one(`${prefix}:upper`), upper), bottom = text(one(`${prefix}:lower`), lower);
              const label = text(one(`${prefix}:group`), `Group ${group}`), outline = one(`${prefix}:outline`);
              assert.ok(outline instanceof Rectangle && outline.style.stroke !== 'none' && outline.style.strokeWidth > 0 &&
                outline.style.opacity >= 0.95 && outline.style.strokeOpacity >= 0.95);
              const box = outline.box()!, upperBox = top.box()!;
              assert.ok(box[0] <= upperBox[0] && box[1] <= upperBox[1] && box[2] >= upperBox[2] && box[3] >= upperBox[3],
                `helium ${group}: the outlined cell contains its named upper element`);
              assert.equal(Boolean(outline.style.dashArray), group === 2, 'only the hypothetical helium position is dashed');
              assert.ok(top.center()[0] > previousX && Math.abs(top.center()[0] - bottom.center()[0]) < 1e-4 &&
                Math.abs(top.center()[0] - label.center()[0]) < 1e-4 && top.center()[1] > bottom.center()[1] && bottom.center()[1] > label.center()[1]);
              previousX = top.center()[0]; heliumPairs++;
            }
          }
        }
        visited.push(step.name); steps++;
      },
    }, { skipUntil: Infinity }).run();
    assert.deepEqual(visited, ['column', 'count']);
  }
  assert.equal(steps, 10); assert.equal(members, 28); assert.equal(jumps, 23);
  assert.equal(matrixRows, 16); assert.equal(equations, 3); assert.equal(configurations, 2); assert.equal(heliumPairs, 2);
});
