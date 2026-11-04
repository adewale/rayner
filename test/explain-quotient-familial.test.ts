import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fc, params } from './lib/pbt.ts';
import {
  impot,
  bareme,
  parts,
  repartition,
  around,
  nombre,
  euros,
  pourcent,
  BAREME,
  PARAMS,
} from '../scenes/explainers/lib/quotient-familial.ts';
import type { Year } from '../scenes/explainers/lib/quotient-familial.ts';

const cents = (x: number) => Math.round(x * 100) / 100;

// openfisca-france 176.1.3 (commit 5cc6563), tests/leximpact/2024/irpp_economique_0{3,5,6}_*.yml.
// Each asserts, for period 2024, rni, nbptr, ir_plaf_qf (to the cent) and ip_net (to the euro).
const LEXIMPACT = [
  { file: '03_couple_pacse_salaries_effet_quotient_conjugal_d9', rni: 62689.63, enfants: 0, nbptr: 2, irPlafQf: 5137.85, ipNet: 5138 },
  { file: '05_couple_maries_salaries_1enfant_effet_quotient_familial', rni: 65673.88, enfants: 1, nbptr: 2.5, irPlafQf: 4242.12, ipNet: 4242 },
  { file: '06_couple_maries_salaries_2enfants_effet_quotient_familial_d7', rni: 65673.88, enfants: 2, nbptr: 3, irPlafQf: 3430.12, ipNet: 3430 },
];
test('the model reproduces the three LexImpact 2024 income-tax vectors exactly', () => {
  for (const v of LEXIMPACT) {
    const r = impot(v.rni, v.enfants);
    assert.equal(r.parts, v.nbptr, v.file);
    assert.equal(cents(r.plafQf), v.irPlafQf, v.file);
    assert.equal(r.impot, v.ipNet, v.file);
  }
  // Vector 05 is the capped one: 1 970,67 € of advantage against a 1 791 € cap.
  const capped = impot(65673.88, 1);
  assert.equal(capped.plafonne, true);
  assert.equal(cents(capped.brut), 4062.45);
  assert.equal(cents(capped.avantage), 1970.67);
  assert.equal(impot(65673.88, 2).plafonne, false);
});

/**
 * Answers of openfisca-france 176.1.3 (openfisca-core 44.7.1, numpy 2.3.5, Python 3.12), generated
 * once for each case: a married couple (statut_marital marie) declaring rni directly, with n
 * children born 2015 as personnes_a_charge. Columns: rni, enfants, nbptr, ir_brut, ir_ss_qf,
 * ir_plaf_qf, decote, decote_gain_fiscal, ip_net, ir_taux_marginal. OpenFisca computes in float32,
 * so euro amounts agree to the cent, not to the last digit.
 */
const OPENFISCA: Record<Year, number[][]> = {
  2024: [
    [30000, 0, 2.0, 770.6599731445312, 770.6599731445312, 770.6599731445312, 1121.0, 771.0, 0, 0.11],
    [30000, 1, 2.5, 138.3249969482422, 770.6599731445312, 138.3249969482422, 1407.0, 138.0, 0, 0.11],
    [30000, 2, 3.0, 0, 770.6599731445312, 0, 1470.0, 0, 0, 0],
    [30000, 3, 4.0, 0, 770.6599731445312, 0, 1470.0, 0, 0, 0],
    [65673.88, 0, 2.0, 6033.125, 6033.125, 6033.125, 0, 0, 6033.0, 0.3],
    [65673.88, 1, 2.5, 4062.451904296875, 6033.125, 4242.125, 0, 0, 4242.0, 0.3],
    [65673.88, 2, 3.0, 3430.117431640625, 6033.125, 3430.117431640625, 0, 0, 3430.0, 0.11],
    [65673.88, 3, 4.0, 2165.447021484375, 6033.125, 2165.447021484375, 490.0, 490.0, 1675.0, 0.11],
    [150000, 0, 2.0, 31330.9609375, 31330.9609375, 31330.9609375, 0, 0, 31331.0, 0.3],
    [150000, 1, 2.5, 27913.69921875, 31330.9609375, 29539.9609375, 0, 0, 29540.0, 0.3],
    [150000, 2, 3.0, 24496.439453125, 31330.9609375, 27748.9609375, 0, 0, 27749.0, 0.3],
    [150000, 3, 4.0, 17661.919921875, 31330.9609375, 24166.9609375, 0, 0, 24167.0, 0.3],
    [62689.63, 0, 2.0, 5137.8486328125, 5137.8486328125, 5137.8486328125, 0, 0, 5138.0, 0.3],
  ],
  2025: [
    [30000, 0, 2.0, 748.0, 748.0, 748.0, 1145.0, 748.0, 0, 0.11],
    [30000, 1, 2.5, 110.0, 748.0, 110.0, 1433.0, 110.0, 0, 0.11],
    [30000, 2, 3.0, 0, 748.0, 0, 1483.0, 0, 0, 0],
    [30000, 3, 4.0, 0, 748.0, 0, 1483.0, 0, 0, 0],
    [65673.88, 0, 2.0, 5910.14501953125, 5910.14501953125, 5910.14501953125, 0, 0, 5910.0, 0.3],
    [65673.88, 1, 2.5, 4034.126953125, 5910.14501953125, 4103.14501953125, 0, 0, 4103.0, 0.3],
    [65673.88, 2, 3.0, 3396.12744140625, 5910.14501953125, 3396.12744140625, 0, 0, 3396.0, 0.11],
    [65673.88, 3, 4.0, 2120.127197265625, 5910.14501953125, 2120.127197265625, 524.0, 524.0, 1596.0, 0.11],
    [150000, 0, 2.0, 31207.98046875, 31207.98046875, 31207.98046875, 0, 0, 31208.0, 0.3],
    [150000, 1, 2.5, 27759.974609375, 31207.98046875, 29400.98046875, 0, 0, 29401.0, 0.3],
    [150000, 2, 3.0, 24311.970703125, 31207.98046875, 27593.98046875, 0, 0, 27594.0, 0.3],
    [150000, 3, 4.0, 17415.9609375, 31207.98046875, 23979.98046875, 0, 0, 23980.0, 0.3],
    [62689.63, 0, 2.0, 5014.86865234375, 5014.86865234375, 5014.86865234375, 0, 0, 5015.0, 0.3],
  ],
};
for (const year of [2024, 2025] as const)
  test(`every case agrees with openfisca-france 176.1.3 for revenus ${year}`, () => {
    for (const [rni, enfants, nbptr, brut, ssQf, plafQf, decote, gain, ipNet, marginal] of OPENFISCA[year]) {
      const r = impot(rni!, enfants!, year),
        at = `${rni} € with ${enfants} children`;
      assert.equal(r.parts, nbptr, at);
      for (const [mine, theirs] of [
        [r.brut, brut],
        [r.sansEnfants, ssQf],
        [r.plafQf, plafQf],
      ])
        assert.ok(Math.abs(mine! - theirs!) < 0.01, `${at}: ${mine} vs OpenFisca ${theirs}`);
      assert.equal(r.decote, decote, at);
      assert.equal(r.decoteGain, gain, at);
      assert.equal(r.impot, ipNet, at);
      assert.equal(r.tauxMarginal, marginal, at);
    }
  });

test('the stories the captions tell hold for the three incomes', () => {
  const at = (rni: number) => [0, 1, 2, 3].map((n) => impot(rni, n));
  // 30 000 €: the décote leaves nothing to pay whatever the number of children.
  assert.deepEqual(at(30000).map((r) => r.impot), [0, 0, 0, 0]);
  // 65 673,88 €: the cap binds with one child only, and three children bring a décote.
  assert.deepEqual(at(65673.88).map((r) => r.plafonne), [false, true, false, false]);
  assert.deepEqual(at(65673.88).map((r) => r.decoteGain > 0), [false, false, false, true]);
  // 150 000 €: the cap binds for every number of children.
  assert.deepEqual(at(150000).map((r) => r.plafonne), [false, true, true, true]);
});

test('parts: two for the couple, a half for each of the first two children, one from the third', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(parts), [2, 2.5, 3, 4, 5, 6]);
});

test('barème: tax on a quotient is the sum over tranches of rate × the slice inside', () => {
  // Thresholds and rates from bareme.yaml; the 2025 thresholds are commit a59104153d's.
  assert.deepEqual(BAREME[2024].map((b) => b.from), [0, 11497, 29315, 83823, 180294]);
  assert.deepEqual(BAREME[2025].map((b) => b.from), [0, 11600, 29579, 84577, 181917]);
  assert.deepEqual(BAREME[2024].map((b) => b.rate), [0, 0.11, 0.3, 0.41, 0.45]);
  assert.deepEqual(PARAMS[2024], { plafond: 1791, decoteSeuil: 1470, decoteTaux: 0.4525 });
  assert.equal(cents(bareme(32836.94).total), 3016.56);
  assert.equal(bareme(11497).total, 0);
  assert.equal(cents(bareme(200000).total), cents((29315 - 11497) * 0.11 + (83823 - 29315) * 0.3 + (180294 - 83823) * 0.41 + (200000 - 180294) * 0.45));
});

test('around rounds halves to the even neighbour, like numpy.around', () => {
  assert.deepEqual([0.5, 1.5, 2.5, -0.5, -1.5, 2.4, 2.6].map(around), [0, 2, 2, -0, -2, 2, 3]);
});

const income = fc.double({ min: 0, max: 400000, noNaN: true });
const children = fc.integer({ min: 0, max: 6 });
test('each year’s cap bounds the children’s tax advantage per half-part', () => {
  fc.assert(
    fc.property(income, children, fc.constantFrom<Year>(2024, 2025), (rni, n, year) => {
      const r = impot(rni, n, year);
      // ir_plaf_qf = max(ir_brut, ir_ss_qf − plafond): never under either.
      assert.ok(r.plafQf >= r.brut - 1e-9 && r.plafQf >= r.sansEnfants - r.plafond - 1e-9);
      assert.ok(r.sansEnfants - r.plafQf <= (year === 2024 ? 1791 : 1807) * (r.parts - 2) * 2 + 1e-6);
      // The quotient can only help: dividing before a progressive barème never raises the tax.
      assert.ok(r.brut <= r.sansEnfants + 1e-6 && r.sansEnfants <= bareme(rni, year).total + 1e-6);
    }),
    params(500),
  );
});
test('split into parts, fewer euros reach each tranche and above than on the whole income', () => {
  fc.assert(
    fc.property(income, children, fc.constantFrom<Year>(2024, 2025), (rni, n, year) => {
      const p = parts(n),
        split = bareme(rni / p, year).slices,
        whole = bareme(rni, year).slices;
      // From each tranche up: p × the quotient's euros there never exceed the whole income's.
      for (let k = 0; k < whole.length; k++) {
        const above = (xs: typeof whole) => xs.slice(k).reduce((s, x) => s + x.base, 0);
        assert.ok(p * above(split) <= above(whole) + 1e-6, `${rni} € with ${n} children, tranche ${k}`);
      }
    }),
    params(500),
  );
});
test('quotient-familial euros view: the same euros, cut into tranches whole and by parts', () => {
  fc.assert(
    fc.property(income, children, fc.constantFrom<Year>(2024, 2025), (rni, n, year) => {
      const rows = repartition(rni, n, year),
        p = parts(n);
      // Both rulers hold every euro of the income, and each parts entry is p × the quotient's euros in that tranche.
      assert.ok(Math.abs(rows.reduce((s, x) => s + x.entier, 0) - rni) < 1e-6);
      assert.ok(Math.abs(rows.reduce((s, x) => s + x.parts, 0) - rni) < 1e-6);
      rows.forEach((x, k) => {
        assert.equal(x.rate, BAREME[year][k]!.rate);
        assert.ok(Math.abs(x.entier - bareme(rni, year).slices[k]!.base) < 1e-9);
        assert.ok(Math.abs(x.parts - p * bareme(rni / p, year).slices[k]!.base) < 1e-6);
      });
    }),
    params(300),
  );
  // 65 673,88 € with one child: 36 358,88 € of the whole income reach 30 %, none of the parts' euros do.
  const rows = repartition(65673.88, 1);
  assert.deepEqual(rows.map((x) => [x.rate, cents(x.entier), cents(x.parts)]), [
    [0, 11497, 28742.5],
    [0.11, 17818, 36931.38],
    [0.3, 36358.88, 0],
    [0.41, 0, 0],
    [0.45, 0, 0],
  ]);
});
test('more income never lowers the tax, and another child never raises it', () => {
  fc.assert(
    fc.property(income, income, children, fc.constantFrom<Year>(2024, 2025), (a, b, n, year) => {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      assert.ok(impot(lo, n, year).impot <= impot(hi, n, year).impot);
      assert.ok(impot(a, n + 1, year).impot <= impot(a, n, year).impot);
    }),
    params(500),
  );
});

test('French numbers: narrow no-break thousands, decimal comma, no-break space before € and %', () => {
  assert.equal(nombre(65673.88, 2), '65 673,88');
  assert.equal(euros(150000), '150 000 €');
  assert.equal(euros(1234567.5, 2), '1 234 567,50 €');
  assert.equal(pourcent(0.11), '11 %');
  assert.equal(pourcent(0.4525), '45,25 %');
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 1e9 }), (n) => {
      assert.equal(Number(nombre(n).replace(/ /g, '')), n);
    }),
    params(300),
  );
});
