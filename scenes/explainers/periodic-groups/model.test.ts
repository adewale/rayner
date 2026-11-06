import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SYMBOLS, POSITIONS, NIST_EXCEPTIONS, NIST_UP_TO, GROUP_NAMES, predicted, listed, counted, position, membersOf, gaps, periodLength, configText, shorthand, symbolOf } from './model.ts';
import type { Subshell } from './model.ts';

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

const NIST = JSON.parse(readFileSync(new URL('./fixtures/nist-ground.json', import.meta.url), 'utf8')) as {
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

test('the filling rule fills runs of 2, 6, 10 and 14 that stack into the s, d, p and f columns, helium apart', () => {
  // The fill step's claim, against the independently typed table: each run of the filling
  // rule is one row's consecutive cells, and runs of one length share their columns.
  const columns: Record<string, readonly (number | string)[]> = {
    s: [1, 2], d: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12], p: [13, 14, 15, 16, 17, 18],
    f: Array.from({ length: 14 }, (_, i) => `f${i + 1}`),
  };
  const where = (symbol: string): { row: number; column: number | string } => {
    const r = TABLE_ROWS.findIndex((row) => row.includes(symbol));
    if (r >= 0) return { row: r + 1, column: TABLE_ROWS[r]!.indexOf(symbol) + 1 };
    const f = F_ROWS.findIndex((row) => row.includes(symbol));
    return { row: f + 6, column: `f${F_ROWS[f]!.indexOf(symbol) + 1}` };
  };
  let from = 1, runs = 0;
  for (const run of predicted(118)) {
    const cells = Array.from({ length: run.electrons }, (_, i) => where(SYMBOLS[from + i - 1]!));
    from += run.electrons;
    assert.ok([2, 6, 10, 14].includes(run.electrons), `${run.n}${run.l} is full`);
    assert.equal(new Set(cells.map((c) => c.row)).size, 1, `${run.n}${run.l} lies in one row`);
    if (run.n === 1) assert.deepEqual(cells.map((c) => c.column), [1, 18], 'helium is the one cell the table moves');
    else assert.deepEqual(cells.map((c) => c.column), columns[run.l], `${run.n}${run.l} fills the ${run.l} columns in order`);
    runs++;
  }
  assert.equal(from, 119);
  assert.equal(runs, 19);
});

test('every group 1 element ends in one s electron, and every halogen in two s and five p electrons', () => {
  // The family step's titles, for every member of the two groups: NIST's configuration up to
  // element 108, and the filling rule for tennessine (117), which the caption says NIST does not reach.
  const outermost = (z: number) => {
    const config = z <= NIST_UP_TO ? listed(z) : predicted(z),
      n = Math.max(...config.map((s) => s.n));
    return config.filter((s) => s.n === n).map((s) => `${s.l}${s.electrons}`).join(' ');
  };
  const group1 = membersOf(1), halogens = membersOf(17);
  assert.deepEqual(group1.map((p) => p.symbol), ['H', 'Li', 'Na', 'K', 'Rb', 'Cs', 'Fr']);
  assert.deepEqual(halogens.map((p) => p.symbol), ['F', 'Cl', 'Br', 'I', 'At', 'Ts']);
  for (const p of group1) assert.equal(outermost(p.z), 's1', p.symbol);
  for (const p of halogens) assert.equal(outermost(p.z), 's2 p5', p.symbol);
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
